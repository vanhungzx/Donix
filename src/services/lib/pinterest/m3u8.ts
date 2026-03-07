import axiosBase, { AxiosInstance } from "axios";
import crypto from "crypto";
import { URL } from "url";
import fs from "fs-extra";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegBin from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath((ffmpegBin as any).path);

function resolveUrl(base: string, rel: string): string {
  return new URL(rel, base).toString();
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    while (i < s.length && (s[i] === " " || s[i] === ",")) i++;
    let k = "";
    while (i < s.length && s[i] !== "=" && s[i] !== ",") k += s[i++];
    k = k.trim();
    if (!k) break;
    if (i < s.length && s[i] === "=") i++;
    let v = "";
    if (i < s.length && s[i] === "\"") {
      i++;
      while (i < s.length) {
        if (s[i] === "\"") {
          i++;
          break;
        }
        v += s[i++];
      }
    } else {
      while (i < s.length && s[i] !== ",") v += s[i++];
      v = v.trim();
    }
    out[k] = v;
    while (i < s.length && s[i] !== ",") i++;
    if (i < s.length && s[i] === ",") i++;
  }
  return out;
}

async function getText(u: string, ax: AxiosInstance): Promise<string> {
  const r = await ax.get<string>(u, { responseType: "text" as any });
  return r.data;
}

async function getBuf(u: string, ax: AxiosInstance, extra: Record<string, string> = {}): Promise<Buffer> {
  const r = await ax.get<ArrayBuffer>(u, { responseType: "arraybuffer", headers: extra });
  return Buffer.from(r.data);
}

function parseByteRangeSpec(spec: string, lastEnd: number): { rangeHeader: string; newLastEnd: number } {
  const parts = String(spec).split("@");
  const len = parseInt(parts[0], 10);
  const off = parts.length > 1 ? parseInt(parts[1], 10) : (isFinite(lastEnd) && lastEnd >= 0 ? lastEnd + 1 : 0);
  const start = off;
  const end = off + len - 1;
  return { rangeHeader: `${start}-${end}`, newLastEnd: end };
}

function hasAudioCodec(codecs: string | undefined): boolean {
  if (!codecs) return false;
  const c = codecs.toLowerCase();
  return c.includes("mp4a") || c.includes("opus") || c.includes("ac-3") || c.includes("ec-3");
}

interface AudioEntry {
  uri: string | null;
  isDefault: boolean;
}

interface Variant {
  uri: string;
  bw: number;
  audioGroup: string | null;
  videoHasAudio: boolean;
}

async function pickMaster(startUrl: string, ax: AxiosInstance): Promise<{ videoPlaylist: string; audioPlaylist: string | null }> {
  const txt = await getText(startUrl, ax);
  const lines = txt.split(/\r?\n/);
  const audioMap: Record<string, AudioEntry[]> = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#EXT-X-MEDIA:")) {
      const a = parseAttrs(line.slice(13));
      const ty = a.TYPE || a.Type || a.type;
      if (ty === "AUDIO") {
        const gid = a["GROUP-ID"] || a["Group-Id"] || a["group-id"];
        if (!gid) continue;
        const uri = a.URI ? resolveUrl(startUrl, a.URI) : null;
        const isDefault = String(a.DEFAULT || "NO").toUpperCase() === "YES";
        if (!audioMap[gid]) audioMap[gid] = [];
        audioMap[gid].push({ uri, isDefault });
      }
    }
  }
  const variants: Variant[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const attrs = parseAttrs(line.slice(18));
      let j = i + 1;
      while (j < lines.length && (!lines[j] || lines[j].startsWith("#"))) j++;
      if (j < lines.length) {
        const uri = resolveUrl(startUrl, lines[j]);
        const bw = parseInt(attrs.BANDWIDTH || "0", 10);
        const codecs = attrs.CODECS || "";
        const audioGroup = (attrs as any).AUDIO || null;
        const videoHasAudio = hasAudioCodec(codecs) && !audioGroup;
        variants.push({ uri, bw, audioGroup, videoHasAudio });
      }
    }
  }
  if (!variants.length) throw new Error("No variants");
  variants.sort((a, b) => {
    const aa = a.videoHasAudio ? 1 : 0;
    const bb = b.videoHasAudio ? 1 : 0;
    if (aa !== bb) return bb - aa;
    return b.bw - a.bw;
  });
  const chosen = variants[0];
  let audioUri: string | null = null;
  if (!chosen.videoHasAudio && chosen.audioGroup && audioMap[chosen.audioGroup] && audioMap[chosen.audioGroup].length) {
    const list = audioMap[chosen.audioGroup];
    const def = list.find(x => x.isDefault && x.uri) || list.find(x => x.uri) || null;
    audioUri = def ? def.uri : null;
  }
  return { videoPlaylist: chosen.uri, audioPlaylist: audioUri };
}

interface KeyConf {
  method: string;
  uri: string | null;
  iv: string | null;
  _key: Buffer | null;
}

interface Segment {
  uri: string;
  key: KeyConf | null;
  byterangeHeader: string | null;
}

function parseMedia(text: string, baseUrl: string): { segs: Segment[]; mapUri: string | null; mapRangeHeader: string | null; mediaSeq: number } {
  const lines = text.split(/\r?\n/);
  const segs: Segment[] = [];
  let key: KeyConf | null = null;
  let mapUri: string | null = null;
  let mapRangeHeader: string | null = null;
  let mediaSeq = 0;
  let nextRangeSpec: string | null = null;
  let lastEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) mediaSeq = parseInt(line.split(":")[1] || "0", 10);
    if (line.startsWith("#EXT-X-MAP:")) {
      const attrs = parseAttrs(line.slice(11));
      mapUri = attrs.URI ? resolveUrl(baseUrl, attrs.URI) : null;
      if (attrs.BYTERANGE) {
        const r = parseByteRangeSpec(attrs.BYTERANGE, -1);
        mapRangeHeader = r.rangeHeader;
      } else {
        mapRangeHeader = null;
      }
    }
    if (line.startsWith("#EXT-X-KEY:")) {
      const attrs = parseAttrs(line.slice(11));
      key = {
        method: attrs.METHOD || "NONE",
        uri: attrs.URI ? resolveUrl(baseUrl, attrs.URI) : null,
        iv: attrs.IV || null,
        _key: null
      };
    }
    if (line.startsWith("#EXT-X-BYTERANGE:")) nextRangeSpec = line.split(":")[1].trim();
    if (line.startsWith("#EXTINF:")) {
      let j = i + 1;
      while (j < lines.length && (!lines[j] || lines[j].startsWith("#"))) j++;
      if (j < lines.length) {
        const uri = resolveUrl(baseUrl, lines[j]);
        let byterangeHeader: string | null = null;
        if (nextRangeSpec) {
          const r = parseByteRangeSpec(nextRangeSpec, lastEnd);
          byterangeHeader = r.rangeHeader;
          lastEnd = r.newLastEnd;
          nextRangeSpec = null;
        } else {
          lastEnd = -1;
        }
        segs.push({ uri, key: key ? { ...key } : null, byterangeHeader });
      }
    }
  }
  return { segs, mapUri, mapRangeHeader, mediaSeq };
}

function ivFromSeq(seq: number): Buffer {
  const buf = Buffer.alloc(16);
  buf.writeUInt32BE(seq >>> 0, 12);
  return buf;
}

function parseIV(ivStr: string | null): Buffer | null {
  if (!ivStr) return null;
  const hex = ivStr.startsWith("0x") ? ivStr.slice(2) : ivStr;
  return Buffer.from(hex.padStart(32, "0"), "hex");
}

async function decryptIfNeeded(buf: Buffer, keyConf: KeyConf | null, seq: number): Promise<Buffer> {
  if (!keyConf || keyConf.method === "NONE") return buf;
  if (keyConf.method !== "AES-128") throw new Error(`Unsupported KEY ${keyConf.method}`);
  if (!keyConf._key) throw new Error("Missing decryption key");
  const iv = parseIV(keyConf.iv) || ivFromSeq(seq);
  const decipher = crypto.createDecipheriv("aes-128-cbc", keyConf._key, iv);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(buf), decipher.final()]);
}

async function poolDownload(segs: Segment[], ax: AxiosInstance, mediaSeq: number, concurrency: number): Promise<Buffer[]> {
  const out: (Buffer | Error)[] = new Array(segs.length);
  let cursor = 0;
  let running = 0;
  let done: () => void;
  const finished = new Promise<void>(r => {
    done = r;
  });
  const pump = () => {
    if (cursor >= segs.length) {
      if (running === 0) (done as () => void)();
      return;
    }
    const idx = cursor++;
    running++;
    (async () => {
      try {
        const s = segs[idx];
        const extra = s.byterangeHeader ? { Range: `bytes=${s.byterangeHeader}` } : {} as Record<string, string>;
        const raw = await getBuf(s.uri, ax, extra);
        if (s.key && !s.key._key && s.key.uri) s.key._key = await getBuf(s.key.uri, ax);
        const seq = mediaSeq + idx;
        const dec = await decryptIfNeeded(raw, s.key, seq);
        out[idx] = dec;
      } catch (e: any) {
        out[idx] = e;
      } finally {
        running--;
        pump();
      }
    })();
    if (running < concurrency && cursor < segs.length) pump();
  };
  for (let k = 0; k < Math.min(concurrency, segs.length); k++) pump();
  await finished;
  for (let i = 0; i < out.length; i++) if (out[i] instanceof Error) throw out[i];
  return out as Buffer[];
}

async function downloadStreamToBuffer(playlistUrl: string, ax: AxiosInstance, concurrency: number): Promise<Buffer> {
  const text = await getText(playlistUrl, ax);
  const { segs, mapUri, mapRangeHeader, mediaSeq } = parseMedia(text, playlistUrl);
  if (!segs.length) throw new Error("No segments");
  const initBuf = mapUri ? await getBuf(mapUri, ax, mapRangeHeader ? { Range: `bytes=${mapRangeHeader}` } : {}) : null;
  const parts = await poolDownload(segs, ax, mediaSeq, concurrency);
  return Buffer.concat(initBuf ? [initBuf, ...parts] : parts);
}

function uid(): string {
  return String(Date.now()) + "-" + Math.floor(Math.random() * 1e6);
}

function tempDir(): string {
  const d = path.join(process.cwd(), "temp");
  fs.ensureDirSync(d);
  return d;
}

function ffmpegMergeCopy(vp: string, ap: string, outPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(vp)
      .input(ap)
      .outputOptions(["-c", "copy", "-map", "0:v:0", "-map", "1:a:0", "-movflags", "faststart"])
      .save(outPath)
      .on("end", () => resolve(outPath))
      .on("error", reject);
  });
}

function ffmpegMergeTranscode(vp: string, ap: string, outPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(vp)
      .input(ap)
      .videoCodec("copy")
      .audioCodec("aac")
      .audioBitrate("128k")
      .outputOptions(["-movflags", "faststart"])
      .save(outPath)
      .on("end", () => resolve(outPath))
      .on("error", reject);
  });
}

export interface M3U8Options {
  ua?: string;
  referer?: string;
  origin?: string;
}

export default async function downloadM3U8(m3u8Url: string, opts: M3U8Options = {}): Promise<Buffer> {
  const ua = opts.ua || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
  const referer = opts.referer || "https://www.pinterest.com";
  const origin = opts.origin || "https://www.pinterest.com";
  const ax = axiosBase.create({
    headers: { "User-Agent": ua, Referer: referer, Origin: origin },
    timeout: 20000,
    maxRedirects: 5,
    validateStatus: (s: number) => s >= 200 && s < 400
  });
  const { videoPlaylist, audioPlaylist } = await pickMaster(m3u8Url, ax);
  const concurrency = 12;
  if (!audioPlaylist) {
    const buf = await downloadStreamToBuffer(videoPlaylist, ax, concurrency);
    return buf;
  }
  const [videoFmp4, audioFmp4] = await Promise.all([
    downloadStreamToBuffer(videoPlaylist, ax, concurrency),
    downloadStreamToBuffer(audioPlaylist, ax, concurrency)
  ]);
  const dir = tempDir();
  const id = uid();
  const vPath = path.join(dir, `v_${id}.mp4`);
  const aPath = path.join(dir, `a_${id}.m4a`);
  const oPath = path.join(dir, `o_${id}.mp4`);
  await fs.writeFile(vPath, videoFmp4);
  await fs.writeFile(aPath, audioFmp4);
  try {
    await ffmpegMergeCopy(vPath, aPath, oPath);
  } catch {
    await ffmpegMergeTranscode(vPath, aPath, oPath);
  }
  const out = await fs.readFile(oPath);
  try {
    await fs.unlink(vPath);
  } catch { }
  try {
    await fs.unlink(aPath);
  } catch { }
  try {
    await fs.unlink(oPath);
  } catch { }
  return out;
}
