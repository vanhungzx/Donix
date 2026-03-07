import type { Command, CommandOnCallContext, CommandOnReplyContext } from "@types";
import axios from "axios";
import fs from "fs";
import type { Readable } from "node:stream";
import path from "path";

interface VideoResult {
  type?: "video" | "live";
  videoId?: string;
  id?: string;
  url?: string;
  title: string;
  author?: string;
  channel?: {
    name?: string;
  };
  timestamp?: string;
  time?: string;
  seconds?: number;
  views?: number;
  ago?: string;
  thumbnail?: string;
}

interface ChannelResult {
  [key: string]: string | number | boolean | null | undefined;
}

interface PlaylistResult {
  [key: string]: string | number | boolean | null | undefined;
}

interface SearchResult {
  videos: VideoResult[];
  channels: ChannelResult[];
  playlists: PlaylistResult[];
  live: VideoResult[];
  all: Array<VideoResult | ChannelResult | PlaylistResult>;
}

const MAX_DURATION = 15 * 60;
const MAX_SIZE_AUDIO = 25 * 1024 * 1024; // 25MB for audio
const MAX_SIZE_VIDEO = 25 * 1024 * 1024; // 25MB for video
const TARGET_BITRATE = 128000; // 128kbps

interface DownloadResult {
  path: string;
  title: string;
}

interface YouTubeFormat {
  url?: string;
  mimeType?: string;
  bitrate?: number;
  averageBitrate?: number;
  contentLength?: string;
  qualityLabel?: string;
  audioQuality?: string;
  height?: string | number;
  [key: string]: string | number | boolean | null | undefined;
}

interface AudioStream extends YouTubeFormat {
  url: string;
  mimeType: string;
  bitrateDiff?: number;
}

interface ProgressiveStream extends YouTubeFormat {
  url: string;
  mimeType: string;
}

interface Manifest {
  info: {
    title?: string;
    duration?: string;
    channel?: string;
  };
  bestAudio?: AudioStream;
  bestProgressive?: ProgressiveStream;
}

interface StreamResult {
  stream: Readable;
  size: number;
}

function tempRoot(): string {
  const p = path.join(process.cwd(), "src/temp");
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

function sanitize(s: string | undefined): string {
  const v = typeof s === "string" ? s : "";
  const t = v.replace(/[\\/:*?"<>|\x00-\x1F]+/g, " ").trim();
  return t.length ? t.slice(0, 120) : `ytb_${Date.now()}`;
}


function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const m = String(url).match(pattern);
    if (m) return m[1] || m[0];
  }
  return null;
}

async function fetchYoutubePlayer(videoId: string): Promise<Manifest> {
  const url = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
  const headers = {
    "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Content-Type": "application/json",
    "Accept-Language": "en-us,en;q=0.5",
    "Sec-Fetch-Mode": "navigate",
    "X-Youtube-Client-Name": "3",
    "X-Youtube-Client-Version": "20.10.38",
    Origin: "https://www.youtube.com",
    "X-Goog-Visitor-Id": "Cgt1ejc3OFhMbjhyWSiwvIvJBjIKCgJWThIEGgAgRw%3D%3D",
    Cookie:
      "GPS=1; PREF=hl=en&tz=UTC; SOCS=CAI; VISITOR_INFO1_LIVE=uz778XLn8rY; VISITOR_PRIVACY_METADATA=CgJWThIEGgAgRw%3D%3D; YSC=nkN-eImA7n0; __Secure-ROLLOUT_TOKEN=CPOH1LzW0pewUBDG3cTWhIiRAxjG3cTWhIiRAw%3D%3D",
  };
  const data = {
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: "20.10.38",
        userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
        osName: "Android",
        osVersion: "11",
        hl: "en",
        timeZone: "UTC",
        utcOffsetMinutes: 0,
      },
    },
    videoId: videoId,
    playbackContext: {
      contentPlaybackContext: {
        html5Preference: "HTML5_PREF_WANTS",
        signatureTimestamp: 20410,
      },
    },
    contentCheckOk: true,
    racyCheckOk: true,
  };
  try {
    const res = await axios.post(url, data, { headers });
    const streamingData = (res.data as { streamingData?: { adaptiveFormats?: YouTubeFormat[]; formats?: YouTubeFormat[] } }).streamingData || {};
    // Pick medium quality audio stream (target ~128kbps)
    const audioStreams = (streamingData.adaptiveFormats || [])
      .filter((f: YouTubeFormat): f is AudioStream => !!f.mimeType && f.mimeType.startsWith("audio/") && !!f.url)
      .map((f: AudioStream) => ({
        ...f,
        bitrateDiff: Math.abs(parseInt(String(f.averageBitrate || f.bitrate || 0)) - TARGET_BITRATE),
      }))
      .sort((a: AudioStream, b: AudioStream) => (a.bitrateDiff || 0) - (b.bitrateDiff || 0));
    const bestAudio: AudioStream | undefined = audioStreams[0];
    const bestProgressive: ProgressiveStream | undefined = (streamingData.formats || [])
      .filter((f: YouTubeFormat): f is ProgressiveStream => !!f.qualityLabel && !!f.audioQuality && !!f.url)
      .sort((a: ProgressiveStream, b: ProgressiveStream) => {
        const aHeight = typeof a.height === "number" ? a.height : parseInt(String(a.height || 0));
        const bHeight = typeof b.height === "number" ? b.height : parseInt(String(b.height || 0));
        return bHeight - aHeight;
      })[0];
    return {
      info: {
        title: res.data?.videoDetails?.title || null,
        duration: res.data?.videoDetails?.lengthSeconds || null,
        channel: res.data?.videoDetails?.author || null,
      },
      bestAudio,
      bestProgressive,
    };
  } catch (err: unknown) {
    const error = err as { response?: { status?: number }; message?: string };
    if (error.response) {
      throw new Error(`YouTube API error: ${error.response.status}`);
    }
    throw new Error(`Request error: ${error.message || String(err)}`);
  }
}

async function getStreamAndSize(url: string, headers: Record<string, string> = {}): Promise<StreamResult> {
  const requestHeaders = {
    Range: "bytes=0-",
    ...headers,
  };
  const res = await axios.get(url, { responseType: "stream", headers: requestHeaders });
  const len = Number(res.headers["content-length"] || 0);
  const cr = res.headers["content-range"];
  const total = cr ? Number(cr.split("/").pop()) : len;
  return { stream: res.data, size: total || len };
}

async function headTotal(url: string): Promise<number> {
  try {
    const headers = {
      "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
      Accept: "*/*",
      Referer: "https://www.youtube.com/",
      Range: "bytes=0-0",
    };
    const res = await axios.get(url, { responseType: "stream", headers });
    const cr = res.headers["content-range"];
    const total = cr ? Number(cr.split("/").pop()) : Number(res.headers["content-length"] || 0);
    res.data.destroy();
    return total || 0;
  } catch {
    return 0;
  }
}

async function downloadAudioStream(audioUrl: string, outputPath: string): Promise<{ path: string; size: number }> {
  const headers = {
    "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
    Accept: "*/*",
    Referer: "https://www.youtube.com/",
  };
  const { stream, size } = await getStreamAndSize(audioUrl, headers);
  const writeStream = fs.createWriteStream(outputPath);
  await new Promise<void>((resolve, reject) => {
    stream.pipe(writeStream);
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    stream.on("error", reject);
  });
  return { path: outputPath, size };
}

async function downloadVideoStream(videoUrl: string, outputPath: string): Promise<{ path: string; size: number }> {
  const headers = {
    "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
    Accept: "*/*",
    Referer: "https://www.youtube.com/",
  };
  const { stream, size } = await getStreamAndSize(videoUrl, headers);
  const writeStream = fs.createWriteStream(outputPath);
  await new Promise<void>((resolve, reject) => {
    stream.pipe(writeStream);
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    stream.on("error", reject);
  });
  return { path: outputPath, size };
}

async function dlVideo(url: string, _q: number = 360, givenTitle: string = ""): Promise<DownloadResult> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("Không thể lấy Video ID");
  const manifest = await fetchYoutubePlayer(videoId);
  const title = sanitize(givenTitle || manifest.info.title || `video_${Date.now()}`);
  const duration = Number(manifest.info.duration || 0);
  if (duration > MAX_DURATION) {
    throw new Error("Video dài quá 15 phút");
  }
  const videoStream = manifest.bestProgressive;
  if (!videoStream || !videoStream.url) {
    throw new Error("Không tìm thấy video stream");
  }
  // Check size before downloading
  const estimatedSize = Number(videoStream.contentLength || 0);
  if (estimatedSize > MAX_SIZE_VIDEO) {
    throw new Error(`File quá lớn (${(estimatedSize / 1024 / 1024).toFixed(2)}MB > 25MB)`);
  }
  const actualSize = await headTotal(videoStream.url);
  if (actualSize > 0 && actualSize > MAX_SIZE_VIDEO) {
    throw new Error(`File quá lớn (${(actualSize / 1024 / 1024).toFixed(2)}MB > 25MB)`);
  }
  const base = path.join(tempRoot(), title);
  const ext = videoStream.mimeType.includes("webm")
    ? "webm"
    : videoStream.mimeType.includes("mp4")
      ? "mp4"
      : "mp4";
  const outputPath = `${base}.${ext}`;
  const downloadResult = await downloadVideoStream(videoStream.url, outputPath);
  // Final size check
  if (downloadResult.size > MAX_SIZE_VIDEO) {
    try {
      fs.unlinkSync(outputPath);
    } catch {
      // Ignore errors
    }
    throw new Error(`File quá lớn (${(downloadResult.size / 1024 / 1024).toFixed(2)}MB > 25MB)`);
  }
  return { path: outputPath, title };
}

async function dlAudio(url: string, givenTitle: string = ""): Promise<DownloadResult> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("Không thể lấy Video ID");
  const manifest = await fetchYoutubePlayer(videoId);
  const title = sanitize(givenTitle || manifest.info.title || `audio_${Date.now()}`);
  const duration = Number(manifest.info.duration || 0);
  if (duration > MAX_DURATION) {
    throw new Error("Video dài quá 15 phút");
  }
  const audioStream = manifest.bestAudio || manifest.bestProgressive;
  if (!audioStream || !audioStream.url) {
    throw new Error("Không tìm thấy audio stream");
  }
  // Check size before downloading
  const estimatedSize = Number(audioStream.contentLength || 0);
  if (estimatedSize > MAX_SIZE_AUDIO) {
    throw new Error(`File quá lớn (${(estimatedSize / 1024 / 1024).toFixed(2)}MB > 25MB)`);
  }
  const actualSize = await headTotal(audioStream.url);
  if (actualSize > 0 && actualSize > MAX_SIZE_AUDIO) {
    throw new Error(`File quá lớn (${(actualSize / 1024 / 1024).toFixed(2)}MB > 25MB)`);
  }
  const base = path.join(tempRoot(), title);
  const ext = audioStream.mimeType.includes("webm")
    ? "webm"
    : audioStream.mimeType.includes("mp4")
      ? "m4a"
      : "mp3";
  const outputPath = `${base}.${ext}`;
  const downloadResult = await downloadAudioStream(audioStream.url, outputPath);
  // Final size check
  if (downloadResult.size > MAX_SIZE_AUDIO) {
    try {
      fs.unlinkSync(outputPath);
    } catch {
      // Ignore errors
    }
    throw new Error(`File quá lớn (${(downloadResult.size / 1024 / 1024).toFixed(2)}MB > 25MB)`);
  }
  return { path: outputPath, title };
}

async function ensureSize(fp: string, _targetMB: number = 24): Promise<string> {
  // Video compression removed - no longer using fluent-ffmpeg
  // Return original file path
  return fp;
}

const ytbCommand: Command = {
  name: "ytb",
  alias: ["yt", "ytdlp"],
  version: "2.0.0",
  role: 0,
  desc: "Tải YouTube: Audio qua YouTube API (128kbps, max 25MB), Video qua yt-dlp",
  guide: "{pn} music <từ khóa>\n{pn} video <từ khóa>\nReply số để tải",
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext) {
    const { api, event, args, reply, send, main, commandName } = ctx;
    try {
      if (!args || !args.length) {
        await reply({ body: "Cú pháp: ytb music <từ khóa> hoặc ytb video <từ khóa>" });
        return;
      }
      const head = String(args[0] || "").toLowerCase();
      const mode = ["music", "audio", "song"].includes(head)
        ? "audio"
        : ["video", "vid"].includes(head)
          ? "video"
          : "video";
      const q = 360;
      const key = args.slice(1).join(" ").trim();
      if (!key) {
        await reply({ body: `Thiếu từ khóa sau "${head}"` });
        return;
      }
      if (!api?.youtube?.search) {
        await reply({ body: "❌ Service YouTube chưa được load. Vui lòng kiểm tra lại!" });
        return;
      }
      const res: SearchResult = await api.youtube.search(key, { hl: "vi", gl: "VN" });
      let list: VideoResult[] = [...res.live, ...res.videos].slice(0, 6);
      list = list
        .filter((v) => {
          const s = v.seconds ?? 0;
          return s > 0 && s <= MAX_DURATION;
        })
        .slice(0, 8);
      if (!list.length) {
        await reply({ body: `❎ Không có kết quả ≤ 15 phút cho "${key}"` });
        return;
      }
      const msg = list.map((i, k) => `${k + 1}. ${i.title}\n⏳ ${i.timestamp} - 📺 ${i.author}`).join("\n\n");
      const sent = await send({
        body: `🔍 Kết quả (≤15p):\n\n${msg}\n\n⩺ Reply số để tải ${mode === "audio" ? "mp3 128k" : "video 360p"}`,
      });
      if (sent?.messageID) {
        main.onReply.set(sent.messageID, {
          commandName,
          author: event.senderID,
          messageID: sent.messageID,
          result: list as unknown as Record<string, string | number | boolean | null | undefined>,
          mode,
          q,
        });
      }
    } catch (e: unknown) {
      const error = e as { message?: string };
      await reply({ body: `Lỗi: ${error.message || "Đã xảy ra lỗi"}` });
    }
  },
  async onReply(ctx: CommandOnReplyContext) {
    const { client, event, reply, main, Reply } = ctx;
    try {
      if (!Reply || event.senderID !== Reply.author) return;

      client.unsendMessage(Reply.messageID, event.threadID);
      const idx = parseInt(String(event.body || "").trim(), 10) - 1;
      const result = Reply.result as unknown as VideoResult[] | undefined;
      if (isNaN(idx) || idx < 0 || !result || idx >= result.length) {
        await reply({ body: "❎ Vui lòng chọn số hợp lệ!" });
        return;
      }
      const v: VideoResult = result[idx];
      const url = `https://www.youtube.com/watch?v=${v.videoId}`;
      const mode = (Reply.mode as string | undefined) || "audio";
      const q = (Reply.q as number | undefined) || 360;
      const notice = await reply({ body: `Đang tải • ${mode === "audio" ? "mp3 128k" : "360p"}` });
      let r: DownloadResult = mode === "audio" ? await dlAudio(url, v.title) : await dlVideo(url, q, v.title);
      let fp: string = mode === "video" ? await ensureSize(r.path, 24) : r.path;
      const caption = `📺 ${v.title}\n👤 ${v.author}\n⏱️ ${v.timestamp}`;
      await new Promise<void>((resolve, reject) => {
        client.sendMessage(
          { body: caption, attachment: fs.createReadStream(fp) },
          event.threadID,
          (err: Error | null | undefined) => {
            if (err) reject(err);
          },
          event.messageID
        );
      });
      setTimeout(() => {
        try {
          fs.unlinkSync(fp);
        } catch {
          // Ignore errors
        }
      }, 60000);
      if (notice?.messageID) {
        client.unsendMessage(notice.messageID, event.threadID);
      }
      if (main.onReply?.delete) {
        main.onReply.delete(Reply.messageID);
      }
    } catch (e: unknown) {
      const error = e as { message?: string };
      await reply({ body: `Lỗi: ${error.message || "Đã xảy ra lỗi"}` });
    }
  },
};

export default ytbCommand;
