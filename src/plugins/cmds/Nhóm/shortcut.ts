
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import http from 'http';
import https from 'https';
import moment from 'moment-timezone';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { pipeline, Readable } from 'stream';
import { promisify } from 'util';
import type {
  Command,
  CommandOnCallContext,
  CommandOnEventContext,
  CommandOnLoadContext,
  CommandOnReplyContext
} from "../../../types";
const streamPipeline = promisify(pipeline);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
sharp.concurrency(Math.max(1, (os.cpus()?.length || 2) - 1));
sharp.cache(false);

// --- Paths
const ShortFile = path.resolve(process.cwd(), 'src/storage/other', 'shortCutData.json');
const MediaRoot = path.resolve(process.cwd(), 'src/storage/other/shortcutMedia');
const TempRoot = path.join(process.cwd(), 'src/temp');

// Ensure dirs
if (!fs.existsSync(path.dirname(ShortFile))) fs.mkdirSync(path.dirname(ShortFile), { recursive: true });
if (!fs.existsSync(MediaRoot)) fs.mkdirSync(MediaRoot, { recursive: true });
if (!fs.existsSync(TempRoot)) fs.mkdirSync(TempRoot, { recursive: true });
if (!fs.existsSync(ShortFile)) fs.writeFileSync(ShortFile, '{}', 'utf-8');

// --- Types
export type ShortType =
  | { type: 'autosend'; loai: 1 | 2 }
  | { type: 'join'; senderID: string }
  | { type: 'leave'; senderID: string }
  | { type: 'tag'; senderID: string };

export interface ShortcutEntry {
  input?: string; // keyword trigger
  output?: string; // message content
  short_type?: ShortType;
  file?: string | null; // extension (e.g. 'mp4','jpg')
  localFilePath?: string | null; // relative path
  url?: string | null; // remote url or special key 's'|'rd_girl'|'anime'
  sendTime?: string; // HH:mm:ss (for autosend)
  _last?: string; // last sent ts
}

// Runtime data
let data_Short: Record<string, ShortcutEntry[]> = {};
let lastWriteTs = 0;
let saveQueue: Promise<void> = Promise.resolve();

function loadDataSync(): void {
  try {
    const raw = fs.readFileSync(ShortFile, 'utf-8');
    const obj = raw ? JSON.parse(raw) : {};
    if (obj && typeof obj === 'object') data_Short = obj;
  } catch {
    data_Short = {};
  }
}

function atomicWriteJson(file: string, json: string): Promise<void> {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  return fs.promises.writeFile(tmp, json).then(() => fs.promises.rename(tmp, file));
}

function saveData(): Promise<void> {
  const payload = JSON.stringify(data_Short, null, 2);
  lastWriteTs = Date.now();
  saveQueue = saveQueue
    .then(() => atomicWriteJson(ShortFile, payload))
    .catch(() => { /* swallow */ });
  return saveQueue;
}

loadDataSync();
try {
  const shortcutWatcher = fs.watch(ShortFile, { persistent: false }, () => {
    if (Date.now() - lastWriteTs < 200) return;
    try {
      const raw = fs.readFileSync(ShortFile, 'utf-8');
      const obj = raw ? JSON.parse(raw) : {};
      if (obj && typeof obj === 'object') data_Short = obj;
    } catch { /* noop */ }
  });

  shortcutWatcher.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPERM' || err.code === 'ENOENT') {
      // Silently handle permission errors - file watching is optional
      shortcutWatcher.close();
    }
  });
} catch (err: any) {
  // Silently handle initialization errors - file watching is optional
  if (err.code !== 'EPERM' && err.code !== 'ENOENT') {
    // Only log non-permission errors if needed
  }
}

function ensureMediaDir(threadID: string | number): string {
  const dir = path.join(MediaRoot, String(threadID));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getExtByType(ft?: string | null): string {
  const t = (ft || '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp'].includes(t)) return t;
  if (['mp4', 'mov', 'mkv'].includes(t)) return 'mp4';
  if (['mp3', 'm4a', 'aac', 'wav', 'ogg'].includes(t)) return 'mp3';
  if (t === 'gif') return 'gif';
  return t || 'bin';
}

function formatMB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

function sizeOfRelativeFile(rel: string): string | null {
  try {
    const abs = path.isAbsolute(rel) ? rel : path.resolve(process.cwd(), rel);
    const s = fs.statSync(abs).size;
    return formatMB(s);
  } catch {
    return null;
  }
}
const agentHttp = new http.Agent({ keepAlive: true, maxSockets: 64 });
const agentHttps = new https.Agent({ keepAlive: true, maxSockets: 64 });

const client: AxiosInstance = axios.create({
  httpAgent: agentHttp,
  httpsAgent: agentHttps,
  maxRedirects: 5,
  decompress: true,
  timeout: 60000,
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
  validateStatus: s => !!s && s >= 200 && s < 400,
  headers: {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    accept: '*/*',
    referer: 'https://www.facebook.com/',
    origin: 'https://www.facebook.com',
  },
});

async function httpGetStream(url: string): Promise<Readable> {
  const res = await client.get(url, { responseType: 'stream' });
  return res.data as Readable;
}

async function httpGetBuffer(url: string): Promise<Buffer> {
  const res = await client.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(res.data as ArrayBuffer);
}

async function downloadToFile(url: string, outPath: string, client?: any): Promise<string | null> {
  try {
    const ws = fs.createWriteStream(outPath, { flags: 'w', highWaterMark: 8 << 20 });
    try {
      const rs = await httpGetStream(url);
      const downloadPromise = streamPipeline(rs, ws);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Download timeout')), 180000)
      );
      await Promise.race([downloadPromise, timeoutPromise]);
      return outPath;
    } catch {
      // Fallback: buffer
      try {
        const buf = await Promise.race([
          httpGetBuffer(url),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Download timeout')), 180000)),
        ]);
        await fs.promises.writeFile(outPath, buf);
        return outPath;
      } catch {
        if (client?.httpGet) {
          try {
            const buf = await Promise.race<Buffer>([
              client.httpGet(url, { responseType: 'arraybuffer' }),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Download timeout')), 180000)),
            ]);
            const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf as any);
            await fs.promises.writeFile(outPath, data);
            return outPath;
          } catch {
            return null;
          }
        }
        return null;
      }
    }
  } catch {
    return null;
  }
}

function statSize(p: string): number {
  try { return fs.statSync(p).size; } catch { return 0; }
}

function ffprobeDuration(p: string): Promise<number> {
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve(1), 10000);
    ffmpeg.ffprobe(p, (_e, d) => {
      clearTimeout(timeout);
      resolve(Number(d?.format?.duration || 1));
    });
  });
}

async function ffprobeVideoInfo(p: string): Promise<{ width: number; height: number; duration: number }> {
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve({ width: 1280, height: 720, duration: 1 }), 10000);
    ffmpeg.ffprobe(p, (_e, d: any) => {
      clearTimeout(timeout);
      const videoStream = d?.streams?.find((s: any) => s.codec_type === 'video');
      resolve({
        width: videoStream?.width || 1280,
        height: videoStream?.height || 720,
        duration: Number(d?.format?.duration || 1),
      });
    });
  });
}

const MAX_BYTES = 2.5 * 1024 * 1024; // 2.5MB max limit
const MIN_BYTES = 2 * 1024 * 1024;   // 2MB min target

// === OPTIMIZED COMPRESSION WITH BETTER QUALITY ===
async function compressVideo(tempPath: string, filePath: string, targetBitrate: number, width: number, height: number | null = null): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(tempPath);
    if (height) {
      command.size(`${width}x${height}`);
    } else {
      command.size(`${width}x?`);
    }

    const timeout = setTimeout(() => {
      (command as any).kill('SIGKILL');
      reject(new Error('Compression timeout'));
    }, 300000);

    command
      .videoBitrate(`${targetBitrate}k`)
      .audioBitrate('64k')
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        '-profile:v', 'high',
        '-level', '4.0',
        '-preset', 'fast',
        '-maxrate', `${targetBitrate * 1.2}k`,
        '-bufsize', `${targetBitrate * 2.4}k`,
        '-g', '50',
        '-keyint_min', '25',
        '-sc_threshold', '0',
        '-threads', '0',
        '-tune', 'film',
        '-bf', '2',
        '-refs', '3',
        '-subq', '6',
      ])
      .save(filePath)
      .on('end', () => { clearTimeout(timeout); resolve(); })
      .on('error', (err: Error) => { clearTimeout(timeout); reject(err); });
  });
}

async function compressAudio(tempPath: string, filePath: string, bitrate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(tempPath)
      .audioBitrate(`${bitrate}k`)
      .audioCodec('libmp3lame')
      .outputOptions(['-ac', '2'])
      .save(filePath)
      .on('end', () => { resolve(void 0); })
      .on('error', reject);
  });
}

async function compressImage(tempPath: string, filePath: string, width: number, quality: number): Promise<void> {
  await sharp(tempPath)
    .resize(width, null, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality, effort: 2 })
    .toFile(filePath);
}

async function compressVideoUnder2MB(tempPath: string, filePath: string): Promise<boolean> {
  const size = statSize(tempPath);

  if (size && size >= MIN_BYTES && size <= MAX_BYTES) {
    fs.copyFileSync(tempPath, filePath);
    return true;
  }

  let videoInfo: { width: number; height: number; duration: number };
  try {
    videoInfo = await ffprobeVideoInfo(tempPath);
  } catch {
    videoInfo = { width: 1280, height: 720, duration: 1 };
  }

  const dur = Math.max(1, videoInfo.duration);
  const originalWidth = videoInfo.width;
  const originalHeight = videoInfo.height;
  const aspectRatio = originalHeight / originalWidth;

  const targetSize = 2.25 * 1024 * 1024;
  const targetBps = Math.max(80000, Math.floor((targetSize * 8 * 0.94) / dur));
  const aBitrate = 64000;
  let vBps = Math.max(50000, targetBps - aBitrate);
  void vBps; // vBps kept for reference (we use calculatedBitrate below)

  const resolutions = [
    { width: 720, height: Math.round(720 * aspectRatio) },
    { width: 640, height: Math.round(640 * aspectRatio) },
    { width: 560, height: Math.round(560 * aspectRatio) },
  ].filter(r => r.width <= originalWidth && r.height <= originalHeight);

  for (const res of resolutions) {
    const resolutionFactor = res.width / 720;
    const adjustedTargetBps = Math.floor((targetSize * 8 * 0.94) / dur);
    const calculatedBitrate = Math.max(400, Math.min(1800, Math.floor((adjustedTargetBps - aBitrate) * resolutionFactor / 1000)));

    try {
      await compressVideo(tempPath, filePath, calculatedBitrate, res.width, res.height);
      const resultSize = statSize(filePath);

      if (resultSize >= MIN_BYTES && resultSize <= MAX_BYTES) return true;

      if (resultSize > 0) {
        const ratio = targetSize / resultSize;
        const adjustedBitrate = Math.max(300, Math.min(2000, Math.floor(calculatedBitrate * ratio)));
        if (Math.abs(adjustedBitrate - calculatedBitrate) > 50) {
          try {
            await compressVideo(tempPath, filePath, adjustedBitrate, res.width, res.height);
            const adjustedSize = statSize(filePath);
            if (adjustedSize >= MIN_BYTES && adjustedSize <= MAX_BYTES) return true;
          } catch { /* continue */ }
        }
      }
    } catch {
      try {
        const fallbackBitrate = Math.max(300, Math.floor(calculatedBitrate * 0.8));
        await compressVideo(tempPath, filePath, fallbackBitrate, res.width, res.height);
        const fallbackSize = statSize(filePath);
        if (fallbackSize >= MIN_BYTES && fallbackSize <= MAX_BYTES) return true;
      } catch { /* continue */ }
    }
  }

  const finalSize = statSize(filePath);
  return finalSize >= MIN_BYTES && finalSize <= MAX_BYTES;
}

async function compressAudioUnder2MB(tempPath: string, filePath: string): Promise<boolean> {
  const size = statSize(tempPath);
  if (size && size >= MIN_BYTES && size <= MAX_BYTES) {
    fs.copyFileSync(tempPath, filePath);
    return true;
  }

  const dur = (await ffprobeDuration(tempPath)) || 1;
  const targetSize = 2 * 1024 * 1024;
  const aBps = Math.max(24000, Math.min(128000, Math.floor((targetSize * 8 * 0.95) / dur)));

  try {
    await compressAudio(tempPath, filePath, Math.floor(aBps / 1000));
    const resultSize = statSize(filePath);
    if (resultSize >= MIN_BYTES && resultSize <= MAX_BYTES) return true;

    if (resultSize < MIN_BYTES) {
      await compressAudio(tempPath, filePath, Math.floor((aBps * 1.3) / 1000));
    }
  } catch { /* noop */ }

  const finalSize = statSize(filePath);
  return finalSize >= MIN_BYTES && finalSize <= MAX_BYTES;
}

async function compressImageUnder2MB(tempPath: string, filePath: string): Promise<boolean> {
  const size = statSize(tempPath);
  if (size && size >= MIN_BYTES && size <= MAX_BYTES) {
    fs.copyFileSync(tempPath, filePath);
    return true;
  }

  try {
    const meta = await sharp(tempPath).metadata();
    const width = Math.min(meta.width || 1280, 1280);
    await compressImage(tempPath, filePath, width, 70);
    const resultSize = statSize(filePath);
    if (resultSize >= MIN_BYTES && resultSize <= MAX_BYTES) return true;
  } catch { /* continue */ }

  try {
    await compressImage(tempPath, filePath, 1024, 60);
    const resultSize = statSize(filePath);
    if (resultSize >= MIN_BYTES && resultSize <= MAX_BYTES) return true;
  } catch { /* continue */ }

  try {
    await compressImage(tempPath, filePath, 800, 50);
  } catch { /* noop */ }

  const finalSize = statSize(filePath);
  return finalSize >= MIN_BYTES && finalSize <= MAX_BYTES;
}

async function processMediaFile(tempPath: string, outputPath: string, contentType: string): Promise<{ success: boolean; originalSize: number; compressedSize: number; saved: number; }> {
  const originalSize = statSize(tempPath);
  let success = false;

  try {
    if (contentType.startsWith('video/')) {
      success = await compressVideoUnder2MB(tempPath, outputPath);
    } else if (contentType.startsWith('audio/')) {
      success = await compressAudioUnder2MB(tempPath, outputPath);
    } else if (contentType.startsWith('image/')) {
      success = await compressImageUnder2MB(tempPath, outputPath);
    } else {
      fs.copyFileSync(tempPath, outputPath);
      const finalSize = statSize(outputPath);
      success = finalSize >= MIN_BYTES && finalSize <= MAX_BYTES;
    }

    const compressedSize = statSize(outputPath);
    return {
      success: success && compressedSize >= MIN_BYTES && compressedSize <= MAX_BYTES,
      originalSize,
      compressedSize,
      saved: originalSize - compressedSize,
    };
  } catch {
    return { success: false, originalSize, compressedSize: 0, saved: 0 };
  }
}

async function compressMediaFromUrl(url: string, outputPath: string, ext: string, client?: any): Promise<string | null> {
  const inExt = getExtByType(ext);
  const tempIn = path.join(TempRoot, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${inExt}`);

  try {
    let downloaded = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await Promise.race<string | null>([
          downloadToFile(url, tempIn, client),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Download timeout')), 120000)),
        ] as any);
        if (result) { downloaded = true; break; }
      } catch {
        if (attempt === 2) throw new Error('download-failed');
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    if (!downloaded) throw new Error('download-failed');

    // If the original file is already within Messenger size constraints,
    // keep it as-is (do NOT force it to be >= 2MB, otherwise small images/audio fail).
    const originalSize = statSize(tempIn);
    if (originalSize > 0 && originalSize <= MAX_BYTES) {
      await fs.promises.copyFile(tempIn, outputPath);
      return outputPath;
    }

    const ct = ['jpg', 'jpeg', 'png', 'webp'].includes(inExt)
      ? 'image/jpeg'
      : inExt === 'gif'
        ? 'image/gif'
        : inExt === 'mp3'
          ? 'audio/mpeg'
          : 'video/mp4';

    const result = await processMediaFile(tempIn, outputPath, ct);

    const finalSize = statSize(outputPath);
    // Accept anything <= MAX_BYTES. (Small files are fine; only upper bound matters.)
    if ((!result.success && finalSize <= 0) || finalSize > MAX_BYTES) {
      throw new Error('File size not within allowed limit after processing');
    }

    return outputPath;
  } catch {
    return null;
  } finally {
    if (fs.existsSync(tempIn)) {
      try { fs.unlinkSync(tempIn); } catch { /* noop */ }
    }
  }
}

async function saveMediaLocal(url: string, threadID: string | number, fileType: string, client?: any): Promise<string | null> {
  try {
    const mediaDir = ensureMediaDir(threadID);
    const ext = getExtByType(fileType);
    const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
    const outPath = path.join(mediaDir, name);
    const ok = await compressMediaFromUrl(url, outPath, ext, client);
    if (!ok) return null;
    return path.relative(process.cwd(), outPath).replace(/\\/g, '/');
  } catch {
    return null;
  }
}

async function downloadAndCompressToTemp(url: string, ext: string, client?: any): Promise<string | null> {
  const name = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${getExtByType(ext)}`;
  const tempOut = path.join(TempRoot, name);
  try {
    const ok = await compressMediaFromUrl(url, tempOut, getExtByType(ext), client);
    return ok ? tempOut : null;
  } catch {
    if (fs.existsSync(tempOut)) {
      try { fs.unlinkSync(tempOut); } catch { /* noop */ }
    }
    return null;
  }
}

async function sendWithSize(client: any, threadID: string | number, body: string, fileLocalPath: string, replyTo?: any): Promise<void> {
  const absolutePath = path.resolve(process.cwd(), fileLocalPath);
  if (!fs.existsSync(absolutePath)) {
    if (body) await client.sendMessage(body, threadID, replyTo || (() => { }));
    return;
  }

  const fileSize = statSize(absolutePath);
  const highWaterMark = fileSize > 10 * 1024 * 1024 ? 8 << 20 : 4 << 20;

  try {
    await client.sendMessage({ body, attachment: fs.createReadStream(absolutePath, { highWaterMark }) }, threadID, replyTo);
  } catch {
    try {
      await client.sendMessage({ body, attachment: fs.createReadStream(absolutePath, { highWaterMark: 2 << 20 }) }, threadID, replyTo);
    } catch {
      if (body) {
        await client.sendMessage(body, threadID, replyTo || (() => { }));
      }
    }
  }
}

async function _send(client: any, threadID: string | number, message: string, fileType?: string | null, fileLocalPath?: string | null): Promise<void> {
  if (fileType && fileLocalPath) {
    const absolutePath = path.resolve(process.cwd(), fileLocalPath);
    if (fs.existsSync(absolutePath)) {
      try { await sendWithSize(client, threadID, message, fileLocalPath); return; } catch { /* noop */ }
    }
  }
  await client.sendMessage(message, threadID, () => { });
}

async function getName(userID: string, client: any): Promise<string> {
  try {
    const infoResponse = await client.httpPost('https://www.facebook.com/api/graphql/', {
      av: client.getCurrentUserID(),
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'CometHovercardQueryRendererQuery',
      variables: JSON.stringify({ actionBarRenderLocation: 'WWW_COMET_HOVERCARD', context: 'DEFAULT', entityID: userID, scale: 1, __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false }),
      server_timestamps: true,
      doc_id: '8740681902701877',
    });
    const infoData = JSON.parse(infoResponse);
    const profileInfo = infoData?.data?.node?.comet_hovercard_renderer?.user;
    return profileInfo?.name || 'Unknown User';
  } catch {
    return 'Unknown User';
  }
}

function pickAttachmentUrl(att: any): string | null {
  return (
    att?.url ||
    att?.playableUrl ||
    att?.playable_url ||
    att?.hd_playable_url ||
    att?.sd_playable_url ||
    att?.previewUrl ||
    att?.hiresUrl ||
    att?.largePreviewUrl ||
    att?.thumbnail_url ||
    att?.thumbnailUrl ||
    null
  );
}

const shortcutModule: Command = {
  name: 'shortcut',
  alias: ['short'],
  version: '3.4.0',
  role: 0,
  desc: 'Shortcut all chuc nang với nén file tối ưu 560p-720p (2-2.5MB, chất lượng cao)',
  guide: `• {pn} all [trang]
• {pn} delete <từ khóa>
• {pn} tag | join | leave
• {pn} autosend
📹 Video: 720p → 640p → 560p | Kích thước: 2-2.5MB | Chất lượng tối ưu`,
  cd: 5,
  prefix: true,
  onLoad: function (ctx: CommandOnLoadContext) {
    const { client, threadData } = ctx;

    loadDataSync();
    setInterval(async () => {
      const _c = moment().tz('Asia/Ho_Chi_Minh').format('HH:mm:ss');
      for (const threadID in data_Short) {
        const autosendEntries = (data_Short[threadID] || []).filter(e => e && (e as any).short_type && (e as any).short_type.type === 'autosend');
        for (const entry of autosendEntries as any as ShortcutEntry[]) {
          if (entry.sendTime === _c && entry._last !== moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss')) {
            const message = entry.output || '';
            const fileType = (entry as any).file as string | undefined;
            const fileLocalPath = entry.localFilePath as string | undefined;
            if ((entry.short_type as any)?.loai === 1) {
              await _send(client as any, threadID, message, fileType, fileLocalPath);
            } else if ((entry.short_type as any)?.loai === 2) {
              const allIds = await threadData.idAll();
              for (const id of allIds) {
                await _send(client as any, id, message, fileType, fileLocalPath);
              }
            }
            entry._last = moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss');
          }
        }
      }
    }, 1000);
  },
  onEvent: async function (ctx: CommandOnEventContext) {
    const { client, event, threadData, userData } = ctx;
    if (event.senderID === client.getCurrentUserID()) return;
    const { logMessageType, logMessageData, participantIDs, author } = event;
    const threadID = String(event.threadID);
    if (logMessageType !== 'log:subscribe' && logMessageType !== 'log:unsubscribe') return;
    const thread_info = (await threadData.get(threadID))?.threadInfo;
    if (!thread_info) return;
    const shortcuts = data_Short[threadID] || [];
    const shortcut = shortcuts.find(item => (item as any).short_type?.type === (logMessageType === 'log:subscribe' ? 'join' : 'leave')) as ShortcutEntry | undefined;
    if (!shortcut) return;
    const adminNames = thread_info.adminIDs ? await Promise.all(thread_info.adminIDs.map((e: any) => userData.getName(e.id))) : [];
    const replacements: Record<string, string> = {
      '{nameThread}': thread_info.threadName || '',
      '{soThanhVien}': logMessageType === 'log:subscribe' ? String(participantIDs.length) : String(Math.max(0, participantIDs.length - 1)),
      '{time}': moment().tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY - HH:mm:ss'),
      '{authorName}': await userData.getName(author),
      '{authorId}': `https://www.facebook.com/profile.php?id=${author}`,
      '{qtv}': adminNames.length ? `@${adminNames.join('\n@')}` : '',
    };
    if (logMessageType === 'log:subscribe') {
      const addedUsers = logMessageData.addedParticipants || [];
      replacements['{link}'] = addedUsers.map((e: any) => `https://www.facebook.com/profile.php?id=${e.userFbId}`).join('\n');
      const names: string[] = [];
      for (const user of addedUsers) {
        const name = (await userData.getName(user.userFbId)) || user.fullName;
        names.push(name);
      }
      replacements['{name}'] = names.join(', ');
    } else {
      const leftId = logMessageData.leftParticipantFbId;
      replacements['{link}'] = `https://www.facebook.com/profile.php?id=${leftId}`;
      replacements['{name}'] = await Promise.race([
        userData.getName(leftId),
        getName(leftId, client as any),
        Promise.resolve('Người dùng Facebook'),
      ]);
      replacements['{trangThai}'] = leftId === author ? 'đã tự rời khỏi nhóm' : 'đã bị quản trị viên kick khỏi nhóm';
    }
    let msgBody = (shortcut.output || '');
    for (const [k, v] of Object.entries(replacements)) {
      msgBody = msgBody.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), v || '');
    }
    if ((shortcut as any).url === 'rd_girl') {
      const attachment = (global.Donix?.vdgai?.splice?.(0, 1) as unknown) || [];
      return client.sendMessage({ body: msgBody, attachment }, threadID, event.messageID);
    }
    if ((shortcut as any).url === 'anime') {
      const attachment = (global.Donix?.vdanime?.splice?.(0, 1) as unknown) || [];
      return client.sendMessage({ body: msgBody, attachment }, threadID, event.messageID);
    }
    const localFilePath = shortcut.localFilePath ? path.resolve(process.cwd(), shortcut.localFilePath) : null;
    if (localFilePath && fs.existsSync(localFilePath)) return await sendWithSize(client as any, threadID, msgBody, shortcut.localFilePath!, event.messageID);
    return client.sendMessage(msgBody, threadID, event.messageID);
  },
  onCall: async function (ctx: CommandOnCallContext) {
    const { client, event, args, threadData, userData, commandName, main, config } = ctx;

    const ownerIds = (config.OWNER as string[] | undefined) || [];
    const adminIds = (config.ADMIN as string[] | undefined) || [];

    const threadInfo = (await threadData.get(event.threadID))?.threadInfo as any;
    const isThreadAdmin = (() => {
      const adminIDs = threadInfo?.adminIDs;
      if (!Array.isArray(adminIDs)) return false;
      return adminIDs.some((it: any) => String(it?.id ?? it) === String(event.senderID));
    })();
    const isGlobalAdmin = adminIds.includes(String(event.senderID)) || ownerIds.includes(String(event.senderID));

    if (args[0] == 'stats' && (ownerIds.includes(event.senderID) || adminIds.includes(event.senderID))) {
      const allThreads = Object.keys(data_Short);
      let totalShortcuts = 0;
      let totalAutosend = 0;
      let totalJoin = 0;
      let totalLeave = 0;
      let totalTag = 0;
      let totalMedia = 0;
      allThreads.forEach(tid => {
        const arr = (data_Short[tid] || []);
        totalShortcuts += arr.length;
        arr.forEach(sc => {
          if ((sc as any).short_type?.type === 'autosend') totalAutosend++;
          else if ((sc as any).short_type?.type === 'join') totalJoin++;
          else if ((sc as any).short_type?.type === 'leave') totalLeave++;
          else if ((sc as any).short_type?.type === 'tag') totalTag++;
          if (sc.localFilePath) totalMedia++;
        });
      });
      const stats = `📊 Thống kê shortcut toàn bộ hệ thống:
- Tổng nhóm có shortcut: ${allThreads.length}
- Tổng shortcut: ${totalShortcuts}
  + Autosend: ${totalAutosend}
  + Join: ${totalJoin}
  + Leave: ${totalLeave}
  + Tag: ${totalTag}
- Tổng file media: ${totalMedia}`;
      return client.sendMessage(stats, event.threadID);
    }

    const ownerIdsDelAll = (config.OWNER as string[] | undefined) || [];
    if (args[0] == 'delall' && ownerIdsDelAll.includes(event.senderID)) {
      const allThreads = Object.keys(data_Short);
      let delCount = 0;
      for (const tid of allThreads) {
        const shortcuts = data_Short[tid] || [];
        for (const sc of shortcuts) {
          if (sc.localFilePath) {
            const abs = path.resolve(process.cwd(), sc.localFilePath);
            if (fs.existsSync(abs)) { try { fs.unlinkSync(abs); } catch { /* noop */ } }
          }
          delCount++;
        }
      }
      data_Short = {};
      await saveData();
      return client.sendMessage(`✅ Đã xóa toàn bộ ${delCount} shortcut trên hệ thống.`, event.threadID);
    }

    if (args[0] == 'backup' && ownerIdsDelAll.includes(event.senderID)) {
      const backupFile = path.join(process.cwd(), 'bot/data/other', `shortcut_backup_${Date.now()}.json`);
      await fs.promises.writeFile(backupFile, JSON.stringify(data_Short, null, 2));
      return client.sendMessage(`📥 Backup shortcut đã lưu tại: ${path.relative(process.cwd(), backupFile).replace(/\\/g, '/')}`, event.threadID);
    }

    if (args[0] == 'restore' && ownerIdsDelAll.includes(event.senderID)) {
      if (!args[1]) return client.sendMessage('📌 Vui lòng cung cấp tên file backup (trong thư mục bot/data/other).', event.threadID);
      const backupPath = path.resolve(process.cwd(), 'bot/data/other', args[1]);
      if (!fs.existsSync(backupPath)) return client.sendMessage('❎ File backup không tồn tại.', event.threadID);
      try {
        const raw = await fs.promises.readFile(backupPath, 'utf-8');
        const restored = JSON.parse(raw);
        if (typeof restored !== 'object') throw new Error('invalid');
        data_Short = restored;
        await saveData();
        return client.sendMessage('✅ Khôi phục shortcut thành công.', event.threadID);
      } catch {
        return client.sendMessage('❎ File backup bị lỗi.', event.threadID);
      }
    }

    // TAG CHÍNH MÌNH (không cần mention) + hỗ trợ media / random
    if (args[0] === 'tag' && Object.keys(event.mentions || {}).length === 0) {
      if (!isThreadAdmin && !isGlobalAdmin) {
        return client.sendMessage('Quyền hạn????', event.threadID, event.messageID);
      }

      if (!data_Short[event.threadID]) data_Short[event.threadID] = [];
      const shortcuts = data_Short[event.threadID];

      const existed = shortcuts.find(
        s => (s as any).short_type?.type === 'tag' && String(((s as any).short_type as any).senderID) === String(event.senderID)
      );
      if (existed) {
        return client.sendMessage('❎ Bạn đã có shortcut tag cho chính mình rồi!', event.threadID, event.messageID);
      }

      const rawArgs = args.slice(1);
      let baseText = rawArgs.join(' ').trim();
      if (!baseText) return client.sendMessage('❎ Vui lòng nhập output cho shortcut tag.', event.threadID, event.messageID);

      let media = 'text';
      let urlType: string | null = 's';
      let fileExt: string | null = null;
      let localFilePath: string | null = null;
      let sizeStr: string | null = null;

      // detect random gái/anime trong text
      // support: "random gái", "random gai", "random girl", "random anime"
      // plus convenience: "gái ...", "girl ...", "anime ..." (without the word "random") at the beginning
      const randomGirlRe = /random\s*(g(á|a)i|girl)/i;
      const randomAnimeRe = /random\s*anime/i;
      const leadingGirlRe = /^\s*(?:random\s*)?(g(á|a)i|girl)\b/i;
      const leadingAnimeRe = /^\s*(?:random\s*)?anime\b/i;

      if (randomGirlRe.test(baseText) || leadingGirlRe.test(baseText)) {
        media = 'random girl';
        urlType = 'rd_girl';
        baseText = baseText.replace(/random\s*(g(á|a)i|girl)/gi, '').trim();
        // if user typed "gái ..." / "girl ..." (without random), strip the leading keyword too
        baseText = baseText.replace(/^\s*(g(á|a)i|girl)\b/gi, '').trim();
      } else if (randomAnimeRe.test(baseText) || leadingAnimeRe.test(baseText)) {
        media = 'random anime';
        urlType = 'anime';
        baseText = baseText.replace(/random\s*anime/gi, '').trim();
        // if user typed "anime ..." (without random), strip the leading keyword too
        baseText = baseText.replace(/^\s*anime\b/gi, '').trim();
      }

      const output = baseText || ' ';

      // nếu không phải random thì ưu tiên lấy media từ reply / tin hiện tại
      const att = (event as any).messageReply?.attachments?.[0] || (event as any).attachments?.[0] || null;
      if (urlType === 's' && att && ['photo', 'audio', 'video', 'animated_image'].includes(att.type)) {
        media = att.type === 'photo' ? 'ảnh' : att.type === 'audio' ? 'âm thanh' : att.type === 'video' ? 'video' : 'gif';
        const ft = att.type === 'photo' ? 'jpg' : att.type === 'audio' ? 'mp3' : att.type === 'video' ? 'mp4' : 'gif';
        fileExt = getExtByType(ft);
        const url = pickAttachmentUrl(att);
        client.sendMessage('⏳ Đang tải và nén file...', event.threadID);
        const localPath = url ? await saveMediaLocal(url, event.threadID, fileExt, client as any) : null;
        if (!localPath) return client.sendMessage('❎ Lỗi lưu file media.', event.threadID, event.messageID);
        localFilePath = localPath;
        urlType = null;
        sizeStr = sizeOfRelativeFile(localPath);
      }

      const name = (await userData.getName(event.senderID)) || (await getName(event.senderID, client as any)) || 'Unknown';
      const inputPattern = `@${String(name).replace(/^@+/, '').trim()}`;

      const data: any = {
        input: inputPattern,
        output,
        url: urlType || 's',
        short_type: { type: 'tag', senderID: event.senderID },
      };
      if (localFilePath) {
        data.file = fileExt;
        data.localFilePath = localFilePath;
      }

      data_Short[event.threadID].push(data);
      await saveData();

      const sizeLine = sizeStr ? `\n - Kích thước: ${sizeStr}` : '';
      return client.sendMessage(
        `📝 Đã thêm shortcut tag cho chính bạn:\n\n - Input: ${data.input}\n - Type: ${media}\n - Output: ${data.output}${sizeLine}`,
        event.threadID
      );
    }

    // QUICK TAG MODE: short @mention [output] (+ reply media / random gái / random anime)
    const currentMentions = (event as any).mentions || {};
    const replyMentions = (event as any).messageReply?.mentions || {};
    const hasMentions = Object.keys(currentMentions).length > 0 || Object.keys(replyMentions).length > 0;

    if (hasMentions) {
      const mentionSource = Object.keys(currentMentions).length > 0 ? currentMentions : replyMentions;
      const mentionIDs = Object.keys(mentionSource);
      if (mentionIDs.length !== 1) {
        return client.sendMessage('❎ Chỉ được mention 1 người', event.threadID, event.messageID);
      }

      const mentionedUserID = mentionIDs[0];
      const mentionedLabel = mentionSource[mentionedUserID];
      const cleanMention = String(mentionedLabel || '').replace(/^@+/, '').trim();
      const inputPattern = `@${cleanMention}`;

      const rawArgs = Array.isArray((event as any).args) && (event as any).args.length ? [...(event as any).args] : [...args];

      function findMentionPos(tokens: string[], label: string): { start: number; end: number } | null {
        const parts = String(label || '').trim().split(/\s+/).filter(Boolean);
        const len = parts.length;
        if (!len) return null;
        for (let i = 0; i <= tokens.length - len; i++) {
          let ok = true;
          for (let j = 0; j < len; j++) {
            const pa = parts[j];
            const ra = tokens[i + j];
            if (!ra) { ok = false; break; }
            if (j === 0) {
              const cleanRa = ra.replace(/^@+/, '');
              const cleanPa = pa.replace(/^@+/, '');
              if (cleanRa !== cleanPa) { ok = false; break; }
            } else {
              if (ra !== pa) { ok = false; break; }
            }
          }
          if (ok) return { start: i, end: i + len };
        }
        return null;
      }

      let mentionPos = findMentionPos(rawArgs, mentionedLabel);
      if (!mentionPos) {
        const idx = rawArgs.findIndex(t => String(t).startsWith('@'));
        if (idx !== -1) mentionPos = { start: idx, end: idx + 1 };
      }
      if (!mentionPos) {
        return client.sendMessage('❎ Không xác định được vị trí @mention trong lệnh.', event.threadID, event.messageID);
      }

      const beforeMention = rawArgs.slice(0, mentionPos.start);
      const afterMention = rawArgs.slice(mentionPos.end);

      let media = 'text';
      let urlType: string | null = 's';
      let fileExt: string | null = null;
      let localFilePath: string | null = null;
      let sizeStr: string | null = null;

      const beforeStr = beforeMention.join(' ').toLowerCase();
      if ((beforeStr.includes('random') && (beforeStr.includes('gái') || beforeStr.includes('gai') || beforeStr.includes('girl'))) || (beforeStr.trim() === 'gái' || beforeStr.trim() === 'gai' || beforeStr.trim() === 'girl')) {
        media = 'random girl';
        urlType = 'rd_girl';
      } else if ((beforeStr.includes('random') && beforeStr.includes('anime')) || beforeStr.trim() === 'anime') {
        media = 'random anime';
        urlType = 'anime';
      }

      const output = afterMention.join(' ').trim();
      if (!output) {
        return client.sendMessage(
          `📌 Reply tin nhắn này để nhập nội dung output cho shortcut tag ${inputPattern}`,
          event.threadID,
          (err: any, info: any) => {
            if (err) return;
            main.onReply.set(info.messageID, {
              commandName,
              author: event.senderID,
              messageID: info.messageID,
              threadID: event.threadID,
              step: 2,
              short_type: 'tag',
              mentionedUserID,
              inputPattern,
              type: 'shortAddMention',
              data: {},
            } as any);
          }
        );
      }

      if (!data_Short[event.threadID]) data_Short[event.threadID] = [];
      const existed = data_Short[event.threadID].find(
        s => (s as any).short_type?.type === 'tag' && String(((s as any).short_type as any).senderID) === String(mentionedUserID)
      );
      if (existed) {
        return client.sendMessage('❎ Đã có shortcut tag cho người này rồi!', event.threadID, event.messageID);
      }

      const att = (event as any).messageReply?.attachments?.[0] || (event as any).attachments?.[0] || null;
      if (urlType === 's' && att && ['photo', 'audio', 'video', 'animated_image'].includes(att.type)) {
        media = att.type === 'photo' ? 'ảnh' : att.type === 'audio' ? 'âm thanh' : att.type === 'video' ? 'video' : 'gif';
        const ft = att.type === 'photo' ? 'jpg' : att.type === 'audio' ? 'mp3' : att.type === 'video' ? 'mp4' : 'gif';
        fileExt = getExtByType(ft);
        const url = pickAttachmentUrl(att);
        client.sendMessage('⏳ Đang tải và nén file...', event.threadID);
        const localPath = url ? await saveMediaLocal(url, event.threadID, fileExt, client as any) : null;
        if (!localPath) return client.sendMessage('❎ Lỗi lưu file media.', event.threadID, event.messageID);
        localFilePath = localPath;
        urlType = null;
        sizeStr = sizeOfRelativeFile(localPath);
      }

      const data: any = {
        input: inputPattern,
        output,
        url: urlType || 's',
        short_type: { type: 'tag', senderID: mentionedUserID },
      };
      if (localFilePath) {
        data.file = fileExt;
        data.localFilePath = localFilePath;
      }

      data_Short[event.threadID].push(data);
      await saveData();

      const sizeLine = sizeStr ? `\n - Kích thước: ${sizeStr}` : '';
      return client.sendMessage(
        `📝 Đã thêm thành công shortcut tag:\n\n - Input: ${data.input}\n - Type: ${media}\n - Output: ${data.output}${sizeLine}`,
        event.threadID
      );
    }

    if (args[0] == 'all' || args[0] == 'allin' || args[0] == 'list') {
      const shortcuts = data_Short[event.threadID] || [];
      if (shortcuts.length === 0) return client.sendMessage('💡 Không có shortcut nào được lưu', event.threadID);
      const pageSize = 10;
      const reqPage = parseInt(args[1], 10);
      const totalPages = Math.max(1, Math.ceil(shortcuts.length / pageSize));
      const page = Number.isInteger(reqPage) && reqPage > 0 ? Math.min(reqPage, totalPages) : 1;
      const start = (page - 1) * pageSize;
      const end = Math.min(start + pageSize, shortcuts.length);
      let msg = `📌 Danh sách các shortcut đã lưu (Trang ${page}/${totalPages}, Tổng ${shortcuts.length}):\n\n`;
      for (let i = start; i < end; i++) {
        const sc = shortcuts[i];
        const inputDisplay = (sc as any).input
          ? `🔹 Input: ${(sc as any).input}`
          : ((sc as any).short_type && (sc as any).short_type.type
            ? `🔸 Loại: ${(sc as any).short_type.type}` + (((sc as any).short_type.type === 'autosend') ? '' : `\n👤 Người tạo: ${await userData.getName(((sc as any).short_type as any).senderID) || 'không có'}`)
            : '🔸 Loại: không có');
        const outputDisplay = (sc as any).output ? `💬 Output: ${(sc as any).output}` : '💬 Output: không có';
        msg += `🐥 ${i + 1}:\n${inputDisplay}\n${outputDisplay}\n\n`;
      }
      msg += `🔄 Reply tin nhắn này để xóa shortcut theo thứ tự (ví dụ: 1 2 3).\n🗑️ Reply "all" để xóa TẤT CẢ.\n📄 Dùng {pn} all <trang> để xem trang khác.`;
      return client.sendMessage(msg, event.threadID, (err: any, info: any) => {
        if (err) return;
        main.onReply.set(info.messageID, { commandName, author: event.senderID, createdAt: Date.now(), messageID: info.messageID, threadID: event.threadID, type: 'shortAll' } as any);
      });
    } else if (args[0] == 'delete' || args[0] == 'del') {
      const dataThread = (await threadData.get(event.threadID))?.threadInfo;
      const ownerIdsDel = (config.OWNER as string[] | undefined) || [];
      const adminIdsDel = (config.ADMIN as string[] | undefined) || [];
      if (!dataThread?.adminIDs?.some((item: any) => item.id === event.senderID) && !adminIdsDel.includes(event.senderID) && !ownerIdsDel.includes(event.senderID)) return client.sendMessage('Quyền hạn????', event.threadID, event.messageID);
      if (!args[1]) return client.sendMessage('Vui lòng cung cấp từ khóa để xóa.', event.threadID);
      const keyword = args[1];
      const shortcuts = data_Short[event.threadID] || [];
      const index = shortcuts.findIndex(shortcut => (shortcut as any).input === keyword);
      if (index === -1) return client.sendMessage(`Không tìm thấy shortcut với từ khóa: ${keyword}`, event.threadID);
      const shortcutToDelete = shortcuts[index];
      if (shortcutToDelete.localFilePath) {
        const absolutePath = path.resolve(process.cwd(), shortcutToDelete.localFilePath);
        if (fs.existsSync(absolutePath)) { try { fs.unlinkSync(absolutePath); } catch { /* noop */ } }
      }
      shortcuts.splice(index, 1);
      data_Short[event.threadID] = shortcuts;
      await saveData();
      client.sendMessage(`Đã xóa shortcut với từ khóa: ${keyword}`, event.threadID);
    } else if (['join', 'leave', 'tag'].includes(args[0])) {
      const isAdmin = isThreadAdmin || isGlobalAdmin;
      const es = (data_Short[event.threadID] || []).find(shortcut => (shortcut as any).short_type?.type === args[0] && (args[0] === 'tag' ? ((shortcut as any).short_type as any).senderID === event.senderID : true));
      if (!isAdmin) return client.sendMessage('Quyền hạn????', event.threadID, event.messageID);
      if (es) return client.sendMessage(`Đã có ${args[0] === 'tag' ? 'shortcut tag' : args[0]} rồi!`, event.threadID);
      client.sendMessage(`📌 Reply tin nhắn này để nhập câu trả lời ${args[0] == 'join' ? 'khi có người vào nhóm' : args[0] == 'leave' ? 'khi có người rời nhóm' : args[0] == 'tag' ? 'khi có người tag' : ''}`, event.threadID, (err: any, info: any) => {
        if (err) return;
        main.onReply.set(info.messageID, { commandName, author: event.senderID, messageID: info.messageID, threadID: event.threadID, step: 2, short_type: args[0], type: 'shortAdd', data: {} } as any);
      });
    } else if (args[0] == 'autosend') {
      const ownerIdsAuto = (config.OWNER as string[] | undefined) || [];
      if (!isThreadAdmin && !ownerIdsAuto.includes(event.senderID)) return client.sendMessage('Quyền hạn????', event.threadID, event.messageID);
      client.sendMessage(`📌 Reply tin nhắn này để thêm tin nhắn tự động`, event.threadID, (err: any, info: any) => {
        if (err) return;
        main.onReply.set(info.messageID, { commandName, author: event.senderID, messageID: info.messageID, threadID: event.threadID, short_type: args[0], type: 'autosend', data: {}, step: 1 } as any);
      });
    } else {
      client.sendMessage(`📌 Reply tin nhắn này để nhập từ khóa cho shortcut`, event.threadID, (err: any, info: any) => {
        if (err) return;
        main.onReply.set(info.messageID, { commandName, author: event.senderID, messageID: info.messageID, threadID: event.threadID, step: 1, type: 'shortAdd', data: {} } as any);
      });
    }
  },
  onReply: async function (ctx: CommandOnReplyContext) {
    const { client, event, unsend, Reply, threadData, commandName, main, config } = ctx;
    if (event.senderID !== Reply.author) return;
    if (Reply.type == 'shortAddMention') {
      if ((Reply as any).step === 2) {
        const output = (event.body || '').trim();
        if (!output) return client.sendMessage('❎ Câu trả lời không được để trống', event.threadID, event.messageID);

        const data: any = {
          input: (Reply as any).inputPattern,
          output,
          url: 's',
          short_type: { type: 'tag', senderID: (Reply as any).mentionedUserID },
        };

        if (!data_Short[event.threadID]) data_Short[event.threadID] = [];
        data_Short[event.threadID].push(data);
        await saveData();

        unsend?.((Reply as any).messageID);
        return client.sendMessage(
          `📝 Đã thêm thành công shortcut tag:\n\n - Input: ${data.input}\n - Type: text\n - Output: ${data.output}`,
          event.threadID
        );
      }
    }
    if (Reply.type == 'shortAdd') {
      let data = Reply.data as ShortcutEntry & { short_type?: any };
      switch (Reply.step) {
        case 1: {
          if ((event.body || '').trim().length == 0) return client.sendMessage('❎ Câu trả lời không được để trống', event.threadID, event.messageID);
          const shortcuts = data_Short[event.threadID] || [];
          const index = shortcuts.findIndex(shortcut => (shortcut as any).input === (event.body || '').trim());
          if (index !== -1) return client.sendMessage(`❎ Trùng từ khóa`, event.threadID, event.messageID);
          unsend?.(Reply.messageID);
          data.input = (event.body || '').trim();
          client.sendMessage(`📌 Reply tin nhắn này để nhập câu trả lời khi sử dụng từ khóa`, event.threadID, (err: any, info: any) => {
            if (err) return;
            main.onReply.set(info.messageID, { commandName, author: event.senderID, messageID: info.messageID, data: data as any, type: 'shortAdd', step: 2 } as any);
          });
          break;
        }
        case 2: {
          if ((event.body || '').trim().length == 0) return client.sendMessage('❎ Câu trả lời không được để trống', event.threadID, event.messageID);
          if (Reply.short_type) data.short_type = { type: Reply.short_type, senderID: Reply.author };
          data.output = (event.body || '').trim();
          client.sendMessage(`📌 Reply tin nhắn này bằng tệp video/ảnh/mp3/gif hoặc nếu không cần bạn có thể reply tin nhắn này và nhập 's' hoặc muốn random video theo data api có sẵn thì nhập 'random gái' hoặc 'random anime'`, event.threadID, (err: any, info: any) => {
            if (err) return;
            main.onReply.set(info.messageID, { commandName, author: event.senderID, messageID: info.messageID, data: data as any, type: 'shortAdd', step: 3 } as any);
          });
          break;
        }
        case 3: {
          let media: string;
          let sizeStr: string | null = null;
          const att = event.attachments?.[0];
          if (att && ['photo', 'audio', 'video', 'animated_image'].includes(att.type)) {
            media = att.type === 'photo' ? 'ảnh' : att.type === 'audio' ? 'âm thanh' : att.type === 'video' ? 'video' : 'gif';
            const ft = att.type === 'photo' ? 'jpg' : att.type === 'audio' ? 'mp3' : att.type === 'video' ? 'mp4' : 'gif';
            (data as any).file = getExtByType(ft);
            const url = pickAttachmentUrl(att);

            client.sendMessage('⏳ Đang tải và nén file...', event.threadID);

            const localPath = url ? await saveMediaLocal(url, event.threadID, (data as any).file, client as any) : null;
            if (!localPath) return client.sendMessage('❎ Lỗi lưu file media.', event.threadID, event.messageID);
            data.localFilePath = localPath;
            data.url = null;
            sizeStr = sizeOfRelativeFile(localPath);
          } else if (['random girl', 'random gái'].includes((event.body || '').toLowerCase())) {
            media = 'random girl';
            data.url = 'rd_girl';
          } else if ((event.body || '').toLowerCase() === 'random anime') {
            media = 'random anime';
            data.url = 'anime';
          } else {
            media = 'text';
            data.url = 's';
          }
          client.unsendMessage(Reply.messageID, event.threadID);
          if (!data_Short[event.threadID]) data_Short[event.threadID] = [];
          data_Short[event.threadID].push(data as any);
          await saveData();
          const sizeLine = sizeStr ? `\n - Kích thước: ${sizeStr}` : '';
          client.sendMessage(`📝 Đã thêm thành công shortcut mới, dưới đây là phần tổng quát: \n\n - Input: ${(data as any)?.input || 'tag'}\n - Type: ${media || 'text'}\n - Output: ${data.output}${sizeLine}`, event.threadID);
          break;
        }
        default:
          break;
      }
    } else if (Reply.type == 'shortAll') {
      const dataThread = (await threadData.get(event.threadID))?.threadInfo;
      const ownerIdsShortAll = (config.OWNER as string[] | undefined) || [];
      if (!dataThread?.adminIDs?.some((item: any) => item.id === event.senderID) && !ownerIdsShortAll.includes(event.senderID)) return client.sendMessage('Quyền hạn????', event.threadID, event.messageID);
      const shortcuts = data_Short[event.threadID] || [];
      if (!shortcuts.length) return client.sendMessage('Không có gì để xóa.', event.threadID, event.messageID);
      const raw = (event.body || '').trim().toLowerCase();
      if (raw === 'all') {
        for (const s of shortcuts) {
          if (s.localFilePath) {
            const absolutePath = path.resolve(process.cwd(), s.localFilePath);
            if (fs.existsSync(absolutePath)) { try { fs.unlinkSync(absolutePath); } catch { /* noop */ } }
          }
        }
        data_Short[event.threadID] = [];
        await saveData();
        return client.sendMessage('✅ Đã xóa TẤT CẢ shortcut của nhóm này.', event.threadID, event.messageID);
      }
      const indices = raw.split(/\s+/).map((num: string) => parseInt(num) - 1).filter((n: number) => Number.isInteger(n));
      const invalidIndices = indices.filter(index => index < 0 || index >= shortcuts.length);
      if (!indices.length || invalidIndices.length > 0) return client.sendMessage('Một hoặc nhiều số thứ tự không hợp lệ.', event.threadID, event.messageID);
      indices.sort((a, b) => b - a);
      for (let i = 0; i < indices.length; i++) {
        const shortcutToDelete = shortcuts[indices[i]];
        if (shortcutToDelete.localFilePath) {
          const absolutePath = path.resolve(process.cwd(), shortcutToDelete.localFilePath);
          if (fs.existsSync(absolutePath)) { try { fs.unlinkSync(absolutePath); } catch { /* noop */ } }
        }
        shortcuts.splice(indices[i], 1);
      }
      data_Short[event.threadID] = shortcuts;
      await saveData();
      client.sendMessage(`Đã xóa các shortcut với số thứ tự: ${indices.map(index => index + 1).join(', ')}`, event.threadID, event.messageID);
    } else if (Reply.type == 'autosend') {
      const dataThread = (await threadData.get(event.threadID))?.threadInfo;
      let data = Reply.data as ShortcutEntry & { short_type?: any };
      switch (Reply.step) {
        case 1: {
          data.output = (event.body || '').trim();
          client.sendMessage(`📌 Bạn muốn áp dụng autosend cho:\n1. Nhóm này\n2. Tất cả các nhóm\nReply tin nhắn này với lựa chọn 1 hoặc 2.`, event.threadID, (err: any, info: any) => {
            if (err) return;
            main.onReply.set(info.messageID, { commandName, author: event.senderID, messageID: info.messageID, data: data as any, type: 'autosend', step: 2 } as any);
          });
          break;
        }
        case 2: {
          const ownerIdsAutoReply = (config.OWNER as string[] | undefined) || [];
          const isAdmin = dataThread?.adminIDs?.some((item: any) => item.id === event.senderID) || ownerIdsAutoReply.includes(event.senderID);
          if (!isAdmin && event.body === '2') return client.sendMessage('❎ Bạn không có quyền áp dụng autosend cho tất cả các nhóm.', event.threadID, event.messageID);
          if (!['1', '2'].includes((event.body || '').trim())) return client.sendMessage('❎ Lựa chọn không hợp lệ, vui lòng chọn 1 hoặc 2.', event.threadID, event.messageID);
          (data as any).short_type = { type: 'autosend', loai: ((event.body || '').trim() == '1') ? 1 : 2 };
          client.sendMessage(`📌 Reply tin nhắn này để nhập giờ gửi autosend với định dạng 'aa:bb:cc' (giờ phút giây)`, event.threadID, (err: any, info: any) => {
            if (err) return;
            main.onReply.set(info.messageID, { commandName, author: event.senderID, messageID: info.messageID, data: data as any, type: 'autosend', step: 3 } as any);
          });
          break;
        }
        case 3: {
          const timePattern = /^(\d{2}):(\d{2}):(\d{2})$/;
          if (!timePattern.test((event.body || '').trim())) return client.sendMessage("❎ Định dạng giờ không hợp lệ, vui lòng nhập theo định dạng 'aa:bb:cc' (giờ phút giây)", event.threadID, event.messageID);
          (data as any).sendTime = (event.body || '').trim();
          let isDuplicate = false;
          for (const threadID in data_Short) {
            const autosendEntries = (data_Short[threadID] || []).filter(e => (e as any).short_type?.type === 'autosend');
            autosendEntries.forEach(e => { if ((e as any).sendTime === (data as any).sendTime && ((e as any).short_type as any).loai === (data as any).short_type.loai) isDuplicate = true; });
          }
          if (isDuplicate) return client.sendMessage(`⚠️ Cảnh báo: Thời gian gửi ${(data as any).sendTime} đã tồn tại cho loại ${(data as any).short_type.loai}.`, event.threadID, event.messageID);
          client.sendMessage(`📌 Reply tin nhắn này để gửi nội dung autosend hoặc tệp đính kèm (ảnh/video/mp3/gif)`, event.threadID, (err: any, info: any) => {
            if (err) return;
            main.onReply.set(info.messageID, { commandName, author: event.senderID, messageID: info.messageID, data: data as any, type: 'autosend', step: 4 } as any);
          });
          break;
        }
        case 4: {
          let media: string;
          let sizeStr: string | null = null;
          const att = event.attachments?.[0];
          if (att && ['photo', 'audio', 'video', 'animated_image'].includes(att.type)) {
            media = att.type === 'photo' ? 'ảnh' : att.type === 'audio' ? 'âm thanh' : att.type === 'video' ? 'video' : 'gif';
            const ft = att.type === 'photo' ? 'jpg' : att.type === 'audio' ? 'mp3' : att.type === 'video' ? 'mp4' : 'gif';
            (data as any).file = getExtByType(ft);
            const url = pickAttachmentUrl(att);

            client.sendMessage('⏳ Đang tải và nén file...', event.threadID);

            const localPath = url ? await saveMediaLocal(url, event.threadID, (data as any).file, client as any) : null;
            if (!localPath) return client.sendMessage('❎ Lỗi lưu file media.', event.threadID, event.messageID);
            data.localFilePath = localPath;
            (data as any).url = null;
            sizeStr = sizeOfRelativeFile(localPath);
          } else {
            media = 'text';
            (data as any).url = (event.body || '').trim();
          }
          client.unsendMessage(Reply.messageID, event.threadID);
          if (!data_Short[event.threadID]) data_Short[event.threadID] = [];
          data_Short[event.threadID].push(data as any);
          await saveData();
          const sizeLine = sizeStr ? `\n- Kích thước: ${sizeStr}` : '';
          client.sendMessage(`📝 Đã thêm thành công autosend mới, chi tiết:\n- Loại: ${((data as any).short_type.loai == 1) ? 'Nhóm này' : 'Tất cả các nhóm'}\n- Thời gian: ${(data as any).sendTime}\n- Type: ${media}\n- Output: ${data.output || 'Không có'}${sizeLine}`, event.threadID);
          break;
        }
        default:
          break;
      }
    }
  },
  event: async function (ctx: CommandOnEventContext) {
    if (!ctx || !ctx.event) return;
    const { client, event, userData } = ctx;
    try {
      if (event.senderID === client.getCurrentUserID()) return;
      const threadShortcuts = data_Short[event.threadID];
      if (!threadShortcuts || !event.body) return;
      let targetShortcut: ShortcutEntry | null = null;
      const mentionIDs = Object.keys(event.mentions || {});
      targetShortcut = (threadShortcuts.find(item => (item as any).short_type?.type === 'tag' && mentionIDs.includes(String(((item as any).short_type as any).senderID))) as ShortcutEntry) || null;
      if (!targetShortcut) {
        targetShortcut = threadShortcuts.find(item => (item as any).input === (event.body || '').trim()) as ShortcutEntry;
      }
      if (!targetShortcut?.output) return;
      try {
        const name = (await userData.getName(event.senderID)) || 'người dùng facebook';
        const time = moment().tz('Asia/Ho_Chi_Minh').format('HH:mm:ss');
        const processedMsg = targetShortcut.output.replace(/\{name\}/g, name).replace(/\{time\}/g, time);

        // Kiểm tra localFilePath trước
        if (targetShortcut.localFilePath) {
          const absolutePath = path.resolve(process.cwd(), targetShortcut.localFilePath);
          console.log('[SHORTCUT] Checking localFilePath:', {
            localFilePath: targetShortcut.localFilePath,
            absolutePath,
            exists: fs.existsSync(absolutePath)
          });
          if (fs.existsSync(absolutePath)) {
            console.log('[SHORTCUT] Sending with localFilePath');
            await sendWithSize(client as any, event.threadID, processedMsg, targetShortcut.localFilePath, event.messageID);
            return;
          }
        }

        // Kiểm tra url
        const shortcutUrl = (targetShortcut as any).url;
        const shortcutFile = (targetShortcut as any).file;
        console.log('[SHORTCUT] Checking url:', {
          url: shortcutUrl,
          file: shortcutFile,
          hasUrl: !!shortcutUrl
        });
        if (shortcutUrl) {
          if ((targetShortcut as any).url === 's') {
            await client.sendMessage(processedMsg, event.threadID, event.messageID);
            return;
          }
          if ((targetShortcut as any).url === 'rd_girl') {
            const attachment = (global.Donix?.vdgai?.splice?.(0, 1) as unknown) || [];
            await client.sendMessage({ body: processedMsg, attachment }, event.threadID, event.messageID);
            return;
          }
          if ((targetShortcut as any).url === 'anime') {
            const attachment = (global.Donix?.vdanime?.splice?.(0, 1) as unknown) || [];
            await client.sendMessage({ body: processedMsg, attachment }, event.threadID, event.messageID);
            return;
          }
          console.log('[SHORTCUT] Downloading and compressing from URL');
          const tempOut = await downloadAndCompressToTemp((targetShortcut as any).url, (targetShortcut as any).file || 'mp4', client as any);
          console.log('[SHORTCUT] Download result:', { tempOut, success: !!tempOut });
          if (!tempOut) {
            console.log('[SHORTCUT] Download failed, sending text only');
            await client.sendMessage(processedMsg, event.threadID, event.messageID);
            return;
          }
          try {
            console.log('[SHORTCUT] Sending with downloaded file');
            await sendWithSize(client as any, event.threadID, processedMsg, tempOut, event.messageID);
          } finally {
            fs.existsSync(tempOut) && fs.unlink(tempOut, () => { });
          }
          return;
        }
        console.log('[SHORTCUT] No localFilePath or url, sending text only');
        await client.sendMessage(processedMsg, event.threadID, event.messageID);
      } catch (e: any) {
        console.log('[SHORTCUT] Error in event handler:', e);
      }
    } catch { /* noop */ }
  },
};

export default shortcutModule;
