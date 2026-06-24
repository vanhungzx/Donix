import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import cheerio from "cheerio";
import fs from "fs";
import path from "path";
import qs from "qs";
import { CookieJar } from "tough-cookie";
import search from "./lib/youtube/search";
import searchv2 from "./lib/youtube/searchv2";
import ytdl from "./lib/youtube/lib/index";
import type { YoutubeFormat, YoutubeInfo } from "./lib/youtube/lib/types";

const YOUTUBE_COOKIES =
  "VISITOR_INFO1_LIVE=hTwDl_5D2sE; VISITOR_PRIVACY_METADATA=CgJWThIEGgAgWg%3D%3D; LOGIN_INFO=AFmmF2swRQIgF-xzU0uLaSsOK_ZY30EKwKG9lVnmwHVkya9b-59Mn_YCIQC9knMm9pEdOBNQrgM8Yikk_yaq6oUi7zCf0cS42_xYmw:QUQ3MjNmenQ1ZEg0R0huVlZ0djhYZzRXNU9FQnQ2U3EtR1N5cUxMeU5ucHNCYTNtU1VRbF9zeTVfZmJZd3VRYmYtem95R0V1UFdOOVFoZ0ZYbVVDamxLY0dwWjhjeXgzMFd6XzhtSVBRQmZYajZPc094RU5DWC1hdDhHb0VLUkxGRzVPZWJ2UEtnd1YybzlBbG9YUVRYYXBjdHJuMXFyR3dn; HSID=A-_whUBaMZmfstwFA; SSID=Ad18eoSDHfyiuMRU0; APISID=BEtSwEprxT-jBoK_/AoO1QIsvcruRFBlKF; SAPISID=KvON-L4r0G96S5Sa/A8_pKPxf-NNtDYsTM; __Secure-1PAPISID=KvON-L4r0G96S5Sa/A8_pKPxf-NNtDYsTM; __Secure-3PAPISID=KvON-L4r0G96S5Sa/A8_pKPxf-NNtDYsTM; PREF=f6=40000080&f7=100&tz=Asia.Saigon&f5=20000; SID=g.a0001AgwWXTiIuOsJqbkqXHB-lCshth-hoCJksbQ18gtLjmuQ39xk8kS7htlfT2kDFGmmkpKxAACgYKAXwSARUSFQHGX2Mi8R5D99UImM3GkVbY-mN8lRoVAUF8yKo2FJ9rxG4mfTfxUYt3VRki0076; __Secure-1PSID=g.a0001AgwWXTiIuOsJqbkqXHB-lCshth-hoCJksbQ18gtLjmuQ39x2haDpeE9ZpfN7rSuDimm4QACgYKAYoSARUSFQHGX2MiTar6nznorG-JvgiF6jaJTRoVAUF8yKrxBBsgpmuNApDTa9pSVRcw0076; __Secure-3PSID=g.a0001AgwWXTiIuOsJqbkqXHB-lCshth-hoCJksbQ18gtLjmuQ39xpzFh0mjBhTLwraz3B2acwQACgYKAfASARUSFQHGX2Mi3g3qjraH_sRQEtTIhqhGRRoVAUF8yKrLghFyUuRw5TmLpJPjqc_a0076; __Secure-ROLLOUT_TOKEN=CNjW3ojT4MSrUhCVn-abioqMAxju8YDJx92PAw%3D%3D; YSC=8hjZE2YgE78; __Secure-1PSIDTS=sidts-CjUBmkD5S2Y2MjId3J0cgoL-40IocyUaQNQL_qGAmg0yHEKq5Xu06tKn2bZoqsZPyiBIcFh-rRAA; __Secure-3PSIDTS=sidts-CjUBmkD5S2Y2MjId3J0cgoL-40IocyUaQNQL_qGAmg0yHEKq5Xu06tKn2bZoqsZPyiBIcFh-rRAA; SIDCC=AKEyXzUwU2Dedk9pleh-FY7wgMJEvpQzirp3jrCQbho0213Go7degHaFvxmTYzSszZk7o-xzPe99; __Secure-1PSIDCC=AKEyXzXIQi5ReyYFpjbaO_Dl4UfqMA7iNA1KM-RNGfU3cOiZFMd-JkwADDH_w5HvwoD6vlTjmQM; __Secure-3PSIDCC=AKEyXzUWF4w7tJJrDanSrFJaCtV-qnY7b_96Pf1E7aArIOD4p4S9UfiJON1G4Ia5wC0J-xO0q6d0";

export async function down3(url: string): Promise<any> {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar, withCredentials: true }));
  const body = new URLSearchParams({ url }).toString();
  const headers = {
    Accept: "*/*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    Origin: "https://iloveyt.net",
    Referer: "https://iloveyt.net/vi2",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest"
  };
  const res = await client.post("https://iloveyt.net/proxy.php", body, { headers });
  const ct = String(res.headers["content-type"] || "");
  if (ct.includes("application/json")) {
    return res.data;
  } else {
    return typeof res.data === "string" ? res.data : JSON.stringify(res.data);
  }
}

function extractVideoId(url: string): string {
  const ps = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^[a-zA-Z0-9_-]{11}$/
  ];
  for (const p of ps) {
    const m = String(url).match(p);
    if (m) return (m[1] as string) || (m[0] as string);
  }
  throw new Error("URL/ID không hợp lệ");
}

function nonce(n: number): string {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return Array.from({ length: n }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

function sanitize(s: string): string {
  return String(s).replace(/[<>:"/\\|?*]/g, "_").substring(0, 100);
}

interface ResolvedYoutubeInfo {
  author: string;
  id: string;
  lengthSeconds: number;
  title: string;
  views: number;
}

interface ResolvedYoutubeStream {
  bitrate: number;
  container: string | null;
  mimeType: string | null;
  quality: string;
  url: string;
}

interface DownloadYouTubeResult {
  error: string | null;
  file: {
    path: string;
    size: number;
    sizeFormatted: string;
  } | null;
  format: {
    container: string | null;
    mimeType: string | null;
    quality: string;
    type: "mp3" | "video";
  } | null;
  success: boolean;
  videoInfo: ResolvedYoutubeInfo | null;
}

const toNumber = (value: number | string | null | undefined): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const hasDirectUrl = (format: YoutubeFormat): format is YoutubeFormat & { url: string } =>
  typeof format.url === "string" && format.url.length > 0;

function selectBestAudioSource(
  formats: readonly YoutubeFormat[]
): (YoutubeFormat & { url: string }) | null {
  const directAudioOnly = formats
    .filter(format => hasDirectUrl(format) && format.hasAudio === true && format.hasVideo !== true)
    .sort(
      (left, right) =>
        toNumber(right.audioBitrate ?? right.bitrate ?? right.averageBitrate) -
        toNumber(left.audioBitrate ?? left.bitrate ?? left.averageBitrate)
    );

  if (directAudioOnly[0]) return directAudioOnly[0];

  const fallback = formats
    .filter(format => hasDirectUrl(format) && format.hasAudio === true)
    .sort(
      (left, right) =>
        toNumber(right.audioBitrate ?? right.bitrate ?? right.averageBitrate) -
        toNumber(left.audioBitrate ?? left.bitrate ?? left.averageBitrate)
    );

  return fallback[0] || null;
}

function selectBestProgressiveSource(
  formats: readonly YoutubeFormat[]
): (YoutubeFormat & { url: string }) | null {
  const progressive = formats
    .filter(format => hasDirectUrl(format) && format.hasAudio === true && format.hasVideo === true)
    .sort((left, right) => {
      const leftDistance = Math.abs((toNumber(left.height) || 360) - 360);
      const rightDistance = Math.abs((toNumber(right.height) || 360) - 360);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return (
        toNumber(right.audioBitrate ?? right.bitrate ?? right.averageBitrate) -
        toNumber(left.audioBitrate ?? left.bitrate ?? left.averageBitrate)
      );
    });

  return progressive[0] || null;
}

function normalizeYoutubeInfo(info: YoutubeInfo, fallbackId: string): ResolvedYoutubeInfo {
  const details = info.videoDetails;
  return {
    id: details?.videoId || fallbackId,
    title: details?.title || "Video",
    author: details?.author || "Unknown",
    lengthSeconds: toNumber(details?.lengthSeconds),
    views: toNumber(details?.viewCount),
  };
}

function toResolvedStream(format: YoutubeFormat, fallbackQuality: string): ResolvedYoutubeStream | null {
  if (!hasDirectUrl(format)) return null;
  return {
    url: format.url,
    mimeType: format.mimeType || null,
    container: format.container || null,
    bitrate: toNumber(format.audioBitrate ?? format.bitrate ?? format.averageBitrate),
    quality:
      fallbackQuality ||
      format.qualityLabel ||
      format.audioQuality ||
      (format.container ? `${format.container}` : "unknown"),
  };
}

function selectBestAudioFormat(formats: readonly YoutubeFormat[]): ResolvedYoutubeStream | null {
  const candidates = formats
    .filter(format => hasDirectUrl(format) && format.hasAudio === true)
    .filter(format => format.hasVideo !== true)
    .map(format => toResolvedStream(format, format.audioQuality || "audio"))
    .filter((format): format is ResolvedYoutubeStream => format !== null)
    .sort((left, right) => right.bitrate - left.bitrate);

  if (candidates[0]) return candidates[0];

  const fallback = formats
    .filter(format => hasDirectUrl(format) && format.hasAudio === true)
    .map(format => toResolvedStream(format, format.qualityLabel || format.audioQuality || "audio"))
    .filter((format): format is ResolvedYoutubeStream => format !== null)
    .sort((left, right) => right.bitrate - left.bitrate);

  return fallback[0] || null;
}

function selectBestProgressiveFormat(formats: readonly YoutubeFormat[]): ResolvedYoutubeStream | null {
  const progressive = formats
    .filter(format => hasDirectUrl(format) && format.hasAudio === true && format.hasVideo === true)
    .map(format => ({
      stream: toResolvedStream(format, format.qualityLabel || "video"),
      height: toNumber(format.height),
    }))
    .filter(
      (entry): entry is { stream: ResolvedYoutubeStream; height: number } => entry.stream !== null
    )
    .sort((left, right) => {
      const leftDistance = Math.abs((left.height || 360) - 360);
      const rightDistance = Math.abs((right.height || 360) - 360);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return right.stream.bitrate - left.stream.bitrate;
    });

  return progressive[0]?.stream || null;
}

async function downloadYouTubeViaYtdl(
  urlOrId: string,
  format: "mp3" | "video",
  outputDir: string
): Promise<DownloadYouTubeResult> {
  const id = extractVideoId(urlOrId);
  const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`);
  const videoInfo = normalizeYoutubeInfo(info, id);
  const selectedFormat =
    format === "mp3"
      ? selectBestAudioSource(info.formats)
      : selectBestProgressiveSource(info.formats);
  const selectedStream = selectedFormat
    ? toResolvedStream(
        selectedFormat,
        format === "mp3"
          ? selectedFormat.audioQuality || "audio"
          : selectedFormat.qualityLabel || "video"
      )
    : null;

  if (!selectedFormat || !selectedStream) {
    throw new Error(`KhÃ´ng tÃ¬m tháº¥y Ä‘á»‹nh dáº¡ng ${format}`);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const ext =
    format === "mp3"
      ? selectedStream.container === "mp4"
        ? "m4a"
        : selectedStream.container || "mp3"
      : selectedStream.container || "mp4";
  const file = path.join(outputDir, `${sanitize(videoInfo.title)}_${videoInfo.id}.${ext}`);

  await new Promise<void>((resolve, reject) => {
    const source = ytdl.downloadFromInfo(info, { format: selectedFormat });
    const writer = fs.createWriteStream(file);
    source.on("error", reject);
    writer.on("error", reject);
    writer.on("finish", () => resolve());
    source.pipe(writer);
  });
  const stat = fs.statSync(file);

  return {
    success: true,
    error: null,
    videoInfo,
    format: {
      type: format,
      quality: selectedStream.quality,
      mimeType: selectedStream.mimeType,
      container: selectedStream.container,
    },
    file: {
      path: file,
      size: stat.size,
      sizeFormatted: `${(stat.size / 1024 / 1024).toFixed(2)} MB`,
    },
  };
}

async function getMp4ViaYtdl(videoId: string): Promise<{
  author: string;
  id: string;
  lengthSeconds: number;
  mp3: string | null;
  title: string;
  url: string | null;
  views: number;
} | null> {
  try {
    const id = extractVideoId(videoId);
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`);
    const videoInfo = normalizeYoutubeInfo(info, id);
    const bestVideo = selectBestProgressiveFormat(info.formats);
    const bestAudio = selectBestAudioFormat(info.formats);

    return {
      id: videoInfo.id,
      title: videoInfo.title,
      author: videoInfo.author,
      lengthSeconds: videoInfo.lengthSeconds,
      views: videoInfo.views,
      url: bestVideo?.url || null,
      mp3: bestAudio?.url || null,
    };
  } catch (error) {
    console.error("Lá»—i khi láº¥y dá»¯ liá»‡u:", error);
    return null;
  }
}

async function getMp3ViaYtdl(videoId: string): Promise<{
  author: string;
  id: string;
  lengthSeconds: number;
  title: string;
  url: string | null;
  views: number;
} | null> {
  try {
    const id = extractVideoId(videoId);
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`);
    const videoInfo = normalizeYoutubeInfo(info, id);
    const bestAudio = selectBestAudioFormat(info.formats);

    return {
      id: videoInfo.id,
      title: videoInfo.title,
      author: videoInfo.author,
      lengthSeconds: videoInfo.lengthSeconds,
      views: videoInfo.views,
      url: bestAudio?.url || null,
    };
  } catch (error) {
    console.error("Lá»—i khi láº¥y dá»¯ liá»‡u:", error);
    return null;
  }
}

export async function downloadYouTube(
  urlOrId: string,
  format: "mp3" | "video" = "mp3",
  outputDir = "./temp"
): Promise<DownloadYouTubeResult> {
  try {
    return await downloadYouTubeViaYtdl(urlOrId, format, outputDir);
    const id = extractVideoId(urlOrId);
    const client = {
      name: "ANDROID",
      clientName: "ANDROID",
      clientVersion: "19.30.36",
      userAgent:
        "com.google.android.youtube/19.30.36 (Linux; U; Android 14; en_US) gzip",
      clientId: "3"
    };
    const query = new URLSearchParams({
      prettyPrint: "false",
      t: nonce(12),
      id
    }).toString();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": client.userAgent,
      Cookie: YOUTUBE_COOKIES,
      "X-Goog-Api-Format-Version": "2",
      "X-Goog-Visitor-Id": nonce(11),
      "X-YouTube-Client-Name": client.clientId,
      "X-YouTube-Client-Version": client.clientVersion,
      Origin: "https://www.youtube.com/",
      Referer: "https://www.youtube.com/",
    };
    const payload = {
      videoId: id,
      cpn: nonce(16),
      contentCheckOk: true,
      racyCheckOk: true,
      context: {
        client: {
          clientName: client.clientName,
          clientVersion: client.clientVersion,
          platform: "MOBILE",
          osName: "Android",
          osVersion: "14",
          hl: "vi",
          gl: "VN",
          utcOffsetMinutes: 420,
          timeZone: "Asia/Ho_Chi_Minh"
        },
        request: {
          internalExperimentFlags: [],
          useSsl: true
        },
        user: {
          lockedSafetyMode: false
        }
      }
    };
    const res = await fetch(
      `https://youtubei.googleapis.com/youtubei/v1/player?${query}`,
      { method: "POST", headers, body: JSON.stringify(payload) }
    );
    const data: any = await res.json();
    if (data.error) throw new Error(data.error.message || "YouTube API error");
    if (data.playabilityStatus?.status !== "OK")
      throw new Error(data.playabilityStatus?.reason || "Video không phát được");
    if (!data.streamingData) throw new Error("Không có streamingData");
    const info = {
      id,
      title: data.videoDetails?.title || "Video",
      duration: +(data.videoDetails?.lengthSeconds || 0),
      author: data.videoDetails?.author || "Unknown",
      viewCount: +(data.videoDetails?.viewCount || 0)
    };
    const formats: any[] = [
      ...(data.streamingData.formats || []),
      ...(data.streamingData.adaptiveFormats || [])
    ];
    function pickFormat(list: any[], kind: string): any | null {
      if (kind === "mp3") {
        const a = list.filter(f => f.mimeType?.includes("audio") && f.url);
        if (!a.length) return null;
        const near = a.sort(
          (x, y) =>
            Math.abs((x.audioBitrate || 128) - 128) -
            Math.abs((y.audioBitrate || 128) - 128)
        )[0];
        return near;
      }
      if (kind === "video") {
        const v = list.filter(f => f.mimeType?.includes("video") && f.url);
        if (!v.length) return null;
        const near = v.sort(
          (x, y) =>
            Math.abs((x.height || 360) - 360) -
            Math.abs((y.height || 360) - 360)
        )[0];
        return near;
      }
      return null;
    }
    const fmt = pickFormat(formats, format);
    if (!fmt) throw new Error(`Không tìm thấy định dạng ${format}`);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const ext = format === "mp3" ? "mp3" : "mp4";
    const file = path.join(outputDir, `${sanitize(info.title)}_${info.id}.${ext}`);
    const dlHeaders: Record<string, string> = {
      "User-Agent": client.userAgent,
      Cookie: YOUTUBE_COOKIES,
      Accept: "*/*",
      "Accept-Encoding": "identity",
      Connection: "keep-alive",
      Referer: "https://www.youtube.com/",
    };
    const response = await fetch(fmt.url, { headers: dlHeaders });
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(file, buffer);
    const st = fs.statSync(file);
    return {
      success: true,
      videoInfo: info,
      format: {
        type: format,
        quality:
          format === "mp3"
            ? `${fmt.audioBitrate || fmt.bitrate || ""}kbps`
            : `${fmt.height || ""}p`,
        mimeType: fmt.mimeType
      },
      file: {
        path: file,
        size: st.size,
        sizeFormatted: `${(st.size / 1024 / 1024).toFixed(2)} MB`
      }
    };
  } catch (e: any) {
    return { success: false, error: e.message, videoInfo: null, file: null };
  }
}

export async function getMp4(
  videoId: string,
  payloadData: Record<string, any> = {}
): Promise<{
  author: string;
  id: string;
  lengthSeconds: number;
  mp3: string | null;
  title: string;
  url: string | null;
  views: number;
} | null> {
  void payloadData;
  return await getMp4ViaYtdl(videoId);
  function generateClientPlaybackNonce(length: number): string {
    const CPN_CHARS =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    return Array.from({ length }, () =>
      CPN_CHARS[Math.floor(Math.random() * CPN_CHARS.length)]
    ).join("");
  }
  function parseFormats(response: any): any[] {
    return response?.streamingData
      ? [
        ...(response.streamingData.formats || []),
        ...(response.streamingData.adaptiveFormats || [])
      ]
      : [];
  }
  function buildPayload(
    videoIdPayload: string,
    extraData: Record<string, any> = {}
  ): any {
    return {
      videoId: videoIdPayload,
      cpn: generateClientPlaybackNonce(16),
      contentCheckOk: true,
      racyCheckOk: true,
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: "19.30.36",
          platform: "MOBILE",
          osName: "Android",
          osVersion: "14",
          androidSdkVersion: "34",
          hl: "en",
          gl: "US",
          utcOffsetMinutes: -240
        },
        request: {
          internalExperimentFlags: [],
          useSsl: true
        },
        user: {
          lockedSafetyMode: false
        }
      },
      ...extraData
    };
  }
  const query = new URLSearchParams({
    prettyPrint: "false",
    t: generateClientPlaybackNonce(12),
    id: videoId
  }).toString();
  const opts: any = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "com.google.android.youtube/19.30.36 (Linux; U; Android 14; en_US) gzip",
      "X-Goog-Api-Format-Version": "2"
    },
    body: JSON.stringify(buildPayload(videoId, payloadData))
  };
  try {
    const response = await fetch(
      `https://youtubei.googleapis.com/youtubei/v1/player?${query}`,
      opts
    );
    const data: any = await response.json();
    if (!data.videoDetails) throw new Error("Không lấy được thông tin video.");
    const formats: any[] = data.streamingData
      ? [
        ...(data.streamingData.formats || []),
        ...(data.streamingData.adaptiveFormats || [])
      ]
      : [];
    const mp4Links = formats
      .filter(
        item => item.mimeType.startsWith("video/mp4") && item.audioQuality
      )
      .map((item: any) => item.url);
    function filterFormats(formatsList: any[]): any | null {
      if (!Array.isArray(formatsList)) throw new Error("Formats must be an array");
      return (
        formatsList
          .filter(
            format =>
              format.url && String(format.mimeType).includes("audio")
          )
          .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0] || null
      );
    }
    const format = parseFormats(data);
    return {
      id: data.videoDetails.videoId,
      title: data.videoDetails.title,
      author: data.videoDetails.author,
      lengthSeconds: data.videoDetails.lengthSeconds,
      views: data.videoDetails.viewCount,
      url: mp4Links[0] || null,
      mp3: filterFormats(format)?.url || null
    };
  } catch (error) {
    console.error("Lỗi khi lấy dữ liệu:", error);
    return null;
  }
}

export async function getMp3(videoId: string): Promise<{
  author: string;
  id: string;
  lengthSeconds: number;
  title: string;
  url: string | null;
  views: number;
} | null> {
  return await getMp3ViaYtdl(videoId);
  function generateClientPlaybackNonce(length: number): string {
    const CPN_CHARS =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    return Array.from({ length }, () =>
      CPN_CHARS[Math.floor(Math.random() * CPN_CHARS.length)]
    ).join("");
  }
  function buildPayload(videoIdPayload: string): any {
    return {
      videoId: videoIdPayload,
      cpn: generateClientPlaybackNonce(16),
      contentCheckOk: true,
      racyCheckOk: true,
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: "19.30.36",
          platform: "MOBILE",
          osName: "Android",
          osVersion: "14",
          androidSdkVersion: "34",
          hl: "en",
          gl: "US",
          utcOffsetMinutes: -240
        },
        request: {
          internalExperimentFlags: [],
          useSsl: true
        },
        user: {
          lockedSafetyMode: false
        }
      }
    };
  }
  function parseFormats(response: any): any[] {
    return response?.streamingData
      ? [
        ...(response.streamingData.formats || []),
        ...(response.streamingData.adaptiveFormats || [])
      ]
      : [];
  }
  function filterFormats(formatsList: any[]): any | null {
    if (!Array.isArray(formatsList)) throw new Error("Formats must be an array");
    return (
      formatsList
        .filter(
          format => format.url && String(format.mimeType).includes("audio")
        )
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0] || null
    );
  }
  const query = new URLSearchParams({
    prettyPrint: "false",
    t: generateClientPlaybackNonce(12),
    id: videoId
  }).toString();
  const opts: any = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "com.google.android.youtube/19.30.36 (Linux; U; Android 14; en_US) gzip",
      "X-Goog-Api-Format-Version": "2"
    },
    body: JSON.stringify(buildPayload(videoId))
  };
  try {
    const response = await fetch(
      `https://youtubei.googleapis.com/youtubei/v1/player?${query}`,
      opts
    );
    const data: any = await response.json();
    if (!data.videoDetails) throw new Error("Không lấy được thông tin video.");
    const formats = parseFormats(data);
    return {
      id: data.videoDetails.videoId,
      title: data.videoDetails.title,
      author: data.videoDetails.author,
      lengthSeconds: data.videoDetails.lengthSeconds,
      views: data.videoDetails.viewCount,
      url: filterFormats(formats)?.url || null
    };
  } catch (error) {
    console.error("Lỗi khi lấy dữ liệu:", error);
    return null;
  }
}

export async function downloadv1(url: string): Promise<any> {
  function formatSeconds(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const pad = (num: number) => String(num).padStart(2, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  }
  function formatNumber(number: any): string | null {
    if (isNaN(number)) {
      return null;
    }
    return Number(number).toLocaleString("de-DE");
  }
  async function getInfo(id: string): Promise<any> {
    try {
      const apiKey = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        console.error("YOUTUBE_API_KEY hoặc GOOGLE_API_KEY chưa cấu hình (env).");
        return null;
      }
      const { data } = await axios.get(
        "https://www.googleapis.com/youtube/v3/videos",
        {
          params: {
            id,
            key: apiKey,
            part: "snippet,contentDetails,statistics"
          }
        }
      );
      if (!data.items || data.items.length === 0) {
        throw new Error("Video data not found");
      }
      const res = data.items[0];
      return {
        id: res.id,
        title: res.snippet.title,
        author: res.snippet.channelTitle,
        views: formatNumber(res.statistics.viewCount) || 0,
        likes: formatNumber(res.statistics.likeCount) || 0,
        favorites: formatNumber(res.statistics.favoriteCount) || 0,
        comments: formatNumber(res.statistics.commentCount) || 0
      };
    } catch (error: any) {
      console.error("Error fetching video youtube info:", error.message);
      return null;
    }
  }
  function getRandomUserAgent(): string {
    const browsers = ["Chrome", "Firefox", "Safari", "Edge", "Opera"];
    const osList = [
      "Windows NT 10.0; Win64; x64",
      "Macintosh; Intel Mac OS X 10_15_7",
      "X11; Linux x86_64"
    ];
    const webKitVersion = `537.${Math.floor(Math.random() * 100)}`;
    const browserVersion = `${Math.floor(Math.random() * 100)}.0.${Math.floor(
      Math.random() * 10000
    )}.${Math.floor(Math.random() * 100)}`;
    const browser = browsers[Math.floor(Math.random() * browsers.length)];
    const os = osList[Math.floor(Math.random() * osList.length)];
    return `Mozilla/5.0 (${os}) AppleWebKit/${webKitVersion} (KHTML, like Gecko) ${browser}/${browserVersion} Safari/${webKitVersion}`;
  }
  function getRandomValue(): number {
    return Math.floor(Math.random() * 10000000000);
  }
  function getRandomCookie(): string {
    const ga = `_ga=GA1.1.${getRandomValue()}.${getRandomValue()}`;
    const gaPSRPB96YVC = `_ga_PSRPB96YVC=GS1.1.${getRandomValue()}.2.1.${getRandomValue()}.0.0.0`;
    return `${ga}; ${gaPSRPB96YVC}`;
  }
  const userAgent = getRandomUserAgent();
  const cookies = getRandomCookie();
  async function getData(urlData: string): Promise<any> {
    try {
      const { data } = await axios.post(
        "https://www.y2mate.com/mates/vi854/analyzeV2/ajax",
        qs.stringify({
          k_query: urlData,
          k_page: "Youtube Downloader",
          hl: "vi",
          q_auto: 0
        }),
        {
          headers: {
            Accept: "*/*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "vi,en;q=0.9",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Cookie: cookies,
            Origin: "https://www.y2mate.com",
            Priority: "u=1, i",
            Referer: "https://www.y2mate.com/vi/",
            "Sec-Ch-Ua":
              '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "User-Agent": userAgent,
            "X-Requested-With": "XMLHttpRequest"
          }
        }
      );
      const videoInfo = await getInfo(extractVideoId(urlData));
      if (!videoInfo) {
        throw new Error("Failed to get video info");
      }
      return {
        id: data.id || videoInfo.id,
        title: data.title || videoInfo.title,
        duration: formatSeconds(Number(data.duration || 0)),
        author: videoInfo.author,
        views: videoInfo.views,
        likes: videoInfo.likes,
        comments: videoInfo.comments,
        favorites: videoInfo.favorites,
        url: data.dlink || null
      };
    } catch (error) {
      console.error("Error:", error);
      return null;
    }
  }
  return await getData(url);
}

export async function downloadPost(url: string): Promise<any> {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    let parsedData: any = null;
    $("script").each((_, script) => {
      const scriptContent = $(script).html();
      if (scriptContent && scriptContent.includes("var ytInitialData =")) {
        const splitResult = scriptContent.split("var ytInitialData = ");
        if (splitResult[1]) {
          const jsonString = splitResult[1].split(";")[0];
          if (jsonString) {
            parsedData = JSON.parse(jsonString);
          }
        }
      }
    });
    if (!parsedData) {
      throw new Error("Không tìm thấy dữ liệu bài post YouTube");
    }
    const data =
      parsedData.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer
        .content.sectionListRenderer.contents[0].itemSectionRenderer.contents[0]
        .backstagePostThreadRenderer.post.backstagePostRenderer;
    const attachments: { type: string; url: string }[] = [];
    const dataAtm =
      data?.backstageAttachment?.postMultiImageRenderer?.images ||
      data?.backstageAttachment?.videoRenderer ||
      data?.backstageAttachment;
    if (Array.isArray(dataAtm)) {
      dataAtm.forEach((item: any) => {
        const thumbnails =
          item.backstageImageRenderer?.image?.thumbnails || [];
        if (thumbnails.length > 0) {
          const highResImage = thumbnails.reduce(
            (max: any, img: any) => (img.width > max.width ? img : max),
            thumbnails[0]
          );
          attachments.push({
            type: "Photo",
            url: highResImage.url
          });
        }
      });
    } else if (dataAtm?.backstageImageRenderer) {
      const thumbnails =
        dataAtm.backstageImageRenderer.image?.thumbnails || [];
      if (thumbnails.length > 0) {
        const highResImage = thumbnails.reduce(
          (max: any, img: any) => (img.width > max.width ? img : max),
          thumbnails[0]
        );
        attachments.push({
          type: "Photo",
          url: highResImage.url
        });
      }
    } else if (
      dataAtm?.navigationEndpoint?.watchEndpoint
        ?.watchEndpointSupportedOnesieConfig?.html5PlaybackOnesieConfig
        ?.commonConfig?.url
    ) {
      const videoUrl =
        dataAtm.navigationEndpoint.watchEndpoint
          .watchEndpointSupportedOnesieConfig.html5PlaybackOnesieConfig
          .commonConfig.url;
      attachments.push({
        type: "Video",
        url: videoUrl
      });
    }
    return {
      id: data.postId,
      message: data.contentText.runs[0].text,
      author: data.authorText.runs[0].text,
      like: data.voteCount.simpleText,
      create_at: data.publishedTimeText.runs[0].text,
      attachments
    };
  } catch (error: any) {
    console.error("Có lỗi xảy ra:", error.message);
    return null;
  }
}

export const downloadv2 = async (videoUrl: string): Promise<any> => {
  try {
    const response = await axios.get(
      `https://p.oceansaver.in/ajax/download.php?format=360&url=${encodeURIComponent(
        videoUrl
      )}`
    );
    const id = response.data.id;
    const result: { title: string; url: string } = { title: "", url: "" };
    const checkProgress = async (): Promise<{ title: string; url: string }> => {
      try {
        const progressData = await axios.get(
          `https://p.oceansaver.in/ajax/progress.php?id=${id}`,
          {
            headers: {
              Accept: "*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
              "accept-language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
              "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
              "priority": "u=1, i",
              "sec-ch-ua": '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
              "sec-ch-ua-mobile": "?0",
              "sec-ch-ua-platform": '"Windows"',
              "sec-fetch-dest": "empty",
              "sec-fetch-mode": "cors",
              "sec-fetch-site": "same-origin",
              referer: "https://ssyoutube.com/en811KJ/",
            },
          }
        );
        if (progressData.data.status === "success") {
          return {
            title: progressData.data.title || "",
            url: progressData.data.url || "",
          };
        }
        return result;
      } catch (error) {
        console.error("Error checking progress:", error);
        return result;
      }
    };
    return await checkProgress();
  } catch (error: any) {
    console.error("Error in downloadv2:", error.message);
    return null;
  }
};

const defaultExport = {
  downloadv1,
  downloadv2,
  down3,
  downloadPost,
  getMp3,
  getMp4,
  search,
  searchv2,
  downloadYouTube
};

export default defaultExport;
