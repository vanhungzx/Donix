import type { Command, CommandOnCallContext, CommandOnReplyContext, ReplyData } from "@types";
import axios from "axios";
import fs from "fs";
import type { Readable } from "node:stream";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const MAX_DURATION = 15 * 60;
const MAX_SIZE = 25 * 1024 * 1024; // 25MB
const TARGET_BITRATE = 128000; // 128kbps

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

interface SearchResult {
  videos: VideoResult[];
  channels: Array<Record<string, string | number | boolean | null | undefined>>;
  playlists: Array<Record<string, string | number | boolean | null | undefined>>;
  live: VideoResult[];
  all: Array<VideoResult | Record<string, string | number | boolean | null | undefined>>;
}

interface AudioStream {
  url: string;
  mimeType: string;
  bitrate?: number;
  averageBitrate?: number;
  contentLength?: string;
  bitrateDiff?: number;
}

interface ProgressiveStream {
  url: string;
  mimeType: string;
  qualityLabel?: string;
  audioQuality?: string;
  height?: string;
  contentLength?: string;
}

interface VideoInfo {
  title?: string | null;
  duration?: string | null;
  expiresInSeconds?: number | null;
  thumbnail?: string | null;
  viewCount?: string | null;
  keywords?: string[] | null;
  channel?: string | null;
  likes?: string | null;
}

interface Manifest {
  info: VideoInfo;
  bestAudio?: AudioStream;
  bestProgressive?: ProgressiveStream;
  smallestProgressive?: ProgressiveStream;
}

interface DownloadResult {
  path: string;
  title: string;
  manifest: Manifest;
  size: number;
}

interface StreamResult {
  stream: Readable;
  size: number;
}

function tempRoot(): string {
  const p = path.join(process.cwd(), "temp");
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

function sanitize(s: string | undefined): string {
  const v = typeof s === "string" ? s : "";
  const t = v.replace(/[\\/:*?"<>|\x00-\x1F]+/g, " ").trim();
  return t.length ? t.slice(0, 120) : `music_${Date.now()}`;
}

function parseTimeToSeconds(t: string | undefined = ""): number {
  const p = String(t)
    .trim()
    .split(":")
    .map((n) => parseInt(n, 10))
    .filter((n) => !isNaN(n));
  if (!p.length) return 0;
  if (p.length === 1) return p[0] ?? 0;
  if (p.length === 2) return (p[0] ?? 0) * 60 + (p[1] ?? 0);
  return (p[0] ?? 0) * 3600 + (p[1] ?? 0) * 60 + (p[2] ?? 0);
}

function isYoutubeUrl(s: string | undefined = ""): boolean {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(String(s));
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

function toTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h ? h + ":" : ""}${m < 10 ? "0" + m : m}:${s < 10 ? "0" + s : s}`;
}

async function fetchYoutubePlayer(videoId: string): Promise<Manifest> {
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
    const res = await axios.post("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", data, { headers });
    const streamingData = res.data.streamingData || {};
    const audioStreams = (streamingData.adaptiveFormats || [])
      .filter((f: Record<string, unknown>) => f.mimeType && typeof f.mimeType === "string" && f.mimeType.startsWith("audio/"))
      .map((f: Record<string, unknown>) => ({
        ...f,
        bitrateDiff: Math.abs(parseInt(String(f.averageBitrate || f.bitrate || 0)) - TARGET_BITRATE),
      }))
      .sort((a: AudioStream, b: AudioStream) => {
        return (a.bitrateDiff || 0) - (b.bitrateDiff || 0);
      });
    const bestAudio: AudioStream | undefined = audioStreams[0] as AudioStream | undefined;
    const allProgressive = (streamingData.formats || []).filter(
      (f: Record<string, unknown>) => f.url && f.qualityLabel && f.audioQuality
    );
    const bestProgressive: ProgressiveStream | undefined = [...allProgressive].sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) =>
        parseInt(String(b.height || 0)) - parseInt(String(a.height || 0))
    )[0] as ProgressiveStream | undefined;
    const smallestProgressive: ProgressiveStream | undefined = [...allProgressive].sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) =>
        parseInt(String(a.height || 0)) - parseInt(String(b.height || 0))
    )[0] as ProgressiveStream | undefined;
    const manifest: Manifest = {
      info: {
        title: res.data?.videoDetails?.title || null,
        duration: res.data?.videoDetails?.lengthSeconds || null,
        expiresInSeconds: res.data?.streamingData?.expiresInSeconds || null,
        thumbnail: res.data?.videoDetails?.thumbnail?.thumbnails?.[0]?.url || null,
        viewCount: res.data?.videoDetails?.viewCount || null,
        keywords: res.data?.videoDetails?.keywords || null,
        channel: res.data?.videoDetails?.author || null,
        likes: res.data?.videoDetails?.likeCount || null,
      },
      bestAudio,
      bestProgressive,
      smallestProgressive,
    };
    return manifest;
  } catch (err: unknown) {
    const error = err as { response?: { status?: number; data?: unknown }; message?: string };
    if (error.response) {
      throw new Error(`YouTube API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw new Error(`Request error: ${error.message || String(err)}`);
  }
}

async function getStreamAndSize(url: string, headers: Record<string, string> = {}): Promise<StreamResult> {
  const requestHeaders = {
    Range: "bytes=0-",
    ...headers,
  };

  const res = await axios.get(url, {
    responseType: "stream",
    headers: requestHeaders,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  const len = Number(res.headers["content-length"] || 0);
  const cr = res.headers["content-range"];
  const total = cr ? Number(String(cr).split("/").pop()) : len;

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
    const total = cr ? Number(String(cr).split("/").pop()) : Number(res.headers["content-length"] || 0);
    res.data.destroy();
    return total || 0;
  } catch {
    return 0;
  }
}

async function downloadAudio(audioUrl: string, outputPath: string): Promise<{ path: string; size: number }> {
  const headers = {
    "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
    Accept: "*/*",
    Referer: "https://www.youtube.com/",
  };

  const { stream, size } = await getStreamAndSize(audioUrl, headers);
  const writeStream = fs.createWriteStream(outputPath);

  await new Promise<void>((resolve, reject) => {
    stream.pipe(writeStream);
    writeStream.on("finish", () => {
      // Cleanup streams ngay sau khi xong
      stream.destroy();
      writeStream.destroy();
      resolve();
    });
    writeStream.on("error", (err: Error) => {
      stream.destroy();
      writeStream.destroy();
      reject(err);
    });
    stream.on("error", (err: Error) => {
      stream.destroy();
      writeStream.destroy();
      reject(err);
    });
  });

  return { path: outputPath, size };
}

const YT_HEADERS = {
  "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
  Accept: "*/*",
  Referer: "https://www.youtube.com/",
};

async function downloadToFile(url: string, outputPath: string): Promise<{ path: string; size: number }> {
  const { stream, size } = await getStreamAndSize(url, YT_HEADERS);
  const writeStream = fs.createWriteStream(outputPath);

  await new Promise<void>((resolve, reject) => {
    stream.pipe(writeStream);
    writeStream.on("finish", () => {
      stream.destroy();
      writeStream.destroy();
      resolve();
    });
    writeStream.on("error", (err: Error) => {
      stream.destroy();
      writeStream.destroy();
      reject(err);
    });
    stream.on("error", (err: Error) => {
      stream.destroy();
      writeStream.destroy();
      reject(err);
    });
  });

  return { path: outputPath, size };
}

function convertVideoToMp3(videoPath: string, mp3Path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate("128k")
      .format("mp3")
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .save(mp3Path);
  });
}

async function dlAudio(videoId: string, givenTitle: string = ""): Promise<DownloadResult> {
  const manifest = await fetchYoutubePlayer(videoId);
  if (!manifest.info.title && !givenTitle) {
    throw new Error("Không thể lấy thông tin video");
  }

  const title = sanitize(givenTitle || manifest.info.title || `music_${Date.now()}`);
  const duration = Number(manifest.info.duration || 0);
  if (duration > MAX_DURATION) {
    throw new Error("Video dài quá 15 phút");
  }

  const base = path.join(tempRoot(), title);
  const outputPath = `${base}.mp3`;

  // Thử tải progressive (video) rồi convert sang MP3 trước
  const progressiveStream = manifest.smallestProgressive || manifest.bestProgressive;
  if (progressiveStream?.url) {
    const videoPath = `${base}_video.mp4`;
    try {
      await downloadToFile(progressiveStream.url, videoPath);
      await convertVideoToMp3(videoPath, outputPath);
      try {
        fs.unlinkSync(videoPath);
      } catch {
        // ignore
      }
      const stat = fs.statSync(outputPath);
      if (stat.size > MAX_SIZE) {
        try {
          fs.unlinkSync(outputPath);
        } catch {
          // ignore
        }
        throw new Error(`File MP3 quá lớn (${(stat.size / 1024 / 1024).toFixed(2)}MB > 25MB)`);
      }
      return { path: outputPath, title, manifest, size: stat.size };
    } catch (err) {
      try {
        fs.existsSync(videoPath) && fs.unlinkSync(videoPath);
        fs.existsSync(outputPath) && fs.unlinkSync(outputPath);
      } catch {
        // ignore
      }
      // Fall through to bestAudio path
    }
  }

  // Dùng stream audio trực tiếp (adaptive hoặc progressive)
  const audioStream = manifest.bestAudio || manifest.bestProgressive;
  if (!audioStream || !audioStream.url) {
    throw new Error("Không tìm thấy stream (video/audio)");
  }

  const estimatedSize = Number(audioStream.contentLength || 0);
  if (estimatedSize > MAX_SIZE) {
    throw new Error(`File quá lớn (${(estimatedSize / 1024 / 1024).toFixed(2)}MB > 25MB)`);
  }

  const actualSize = await headTotal(audioStream.url);
  if (actualSize > 0 && actualSize > MAX_SIZE) {
    throw new Error(`File quá lớn (${(actualSize / 1024 / 1024).toFixed(2)}MB > 25MB)`);
  }

  const downloadResult = await downloadAudio(audioStream.url, outputPath);

  if (downloadResult.size > MAX_SIZE) {
    try {
      fs.unlinkSync(outputPath);
    } catch {
      // ignore
    }
    throw new Error(`File quá lớn (${(downloadResult.size / 1024 / 1024).toFixed(2)}MB > 25MB)`);
  }

  return { path: outputPath, title, manifest, size: downloadResult.size };
}

/** Tải audio YouTube (videoId hoặc URL). Dùng chung cho bot AI và lệnh sing. */
export async function downloadYoutubeAudio(
  videoIdOrUrl: string,
  givenTitle?: string
): Promise<DownloadResult> {
  const videoId = isYoutubeUrl(videoIdOrUrl) ? extractVideoId(videoIdOrUrl) : videoIdOrUrl;
  if (!videoId) throw new Error("Không thể lấy Video ID");
  return dlAudio(videoId, givenTitle || "");
}

/** Tải video YouTube MP4 dùng YouTube Player API (giới hạn 15 phút, 25MB). */
export async function downloadYoutubeVideo(
  videoIdOrUrl: string,
  givenTitle?: string
): Promise<DownloadResult> {
  const videoId = isYoutubeUrl(videoIdOrUrl) ? extractVideoId(videoIdOrUrl) : videoIdOrUrl;
  if (!videoId) throw new Error("Không thể lấy Video ID");

  const manifest = await fetchYoutubePlayer(videoId);
  if (!manifest.info.title && !givenTitle) {
    throw new Error("Không thể lấy thông tin video");
  }

  const title = sanitize(givenTitle || manifest.info.title || `video_${Date.now()}`);
  const duration = Number(manifest.info.duration || 0);
  if (duration > MAX_DURATION) {
    throw new Error("Video dài quá 15 phút");
  }

  const base = path.join(tempRoot(), title);
  const outputPath = `${base}.mp4`;

  const progressiveStream = manifest.smallestProgressive || manifest.bestProgressive;
  if (!progressiveStream || !progressiveStream.url) {
    throw new Error("Không tìm thấy stream video phù hợp");
  }

  const estimatedSize = Number(progressiveStream.contentLength || 0);
  if (estimatedSize > MAX_SIZE) {
    throw new Error(`File video quá lớn (${(estimatedSize / 1024 / 1024).toFixed(2)}MB > 25MB)`);
  }

  const actualSize = await headTotal(progressiveStream.url);
  if (actualSize > 0 && actualSize > MAX_SIZE) {
    throw new Error(`File video quá lớn (${(actualSize / 1024 / 1024).toFixed(2)}MB > 25MB)`);
  }

  const { size } = await downloadToFile(progressiveStream.url, outputPath);
  if (size > MAX_SIZE) {
    try {
      fs.unlinkSync(outputPath);
    } catch {
      // ignore
    }
    throw new Error(`File video quá lớn (${(size / 1024 / 1024).toFixed(2)}MB > 25MB)`);
  }

  return { path: outputPath, title, manifest, size };
}

const singCommand: Command = {
  name: "sing",
  alias: ["music", "musicapi", "musicyoutube"],
  version: "1.0.0",
  role: 0,
  desc: "Nghe nhạc YouTube MP3 qua YouTube Player API",
  guide: "{pn} [từ khóa | link]",
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext) {
    const { args, client, reply, event, api, main, commandName } = ctx;

    try {
      if (!args || !args.length) {
        await reply({ body: "❎ Vui lòng nhập từ khóa hoặc link YouTube!" });
        return;
      }

      const key = args.join(" ").replace("?feature=share", "").trim();

      if (isYoutubeUrl(key)) {
        const videoId = extractVideoId(key);
        if (!videoId) {
          await reply({ body: "❎ Không thể lấy Video ID từ link!" });
          return;
        }

        const note = await reply({ body: "⬇️ Đang tải audio qua YouTube API..." });

        try {
          const r = await dlAudio(videoId);
          const info = r.manifest.info;
          const body = `🎵 ${info.title || r.title}\n👤 ${info.channel || "Unknown"}\n⏱️ ${toTime(Number(info.duration || 0))}\n👀 ${info.viewCount ? Number(info.viewCount).toLocaleString() : "0"}`;
          const readStream = fs.createReadStream(r.path);
          const attachment = {
            stream: readStream,
            filename: "audio.mp3",
            contentType: "audio/mpeg",
          };

          await new Promise<void>((resolve, reject) => {
            client.sendMessage(
              { body, attachment },
              event.threadID,
              (err?: Error) => {
                if (err) reject(err);
                else resolve();
              },
              event.messageID
            );
          });

          readStream.on("close", () => {
            setTimeout(() => {
              try {
                fs.unlinkSync(r.path);
              } catch {
                // ignore
              }
            }, 30000);
          });

          if (note?.messageID) {
            try {
              await client.unsendMessage(note.messageID, event.threadID);
            } catch {}
          }
        } catch (e: unknown) {
          const error = e as { message?: string };
          await reply({ body: `❎ Lỗi: ${error.message || String(e)}` });
          if (note?.messageID) {
            try {
              await client.unsendMessage(note.messageID, event.threadID);
            } catch {}
          }
        }
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
          const s = v.seconds ?? parseTimeToSeconds(v.time);
          return s > 0 && s <= MAX_DURATION;
        })
        .slice(0, 8);

      if (!list.length) {
        await reply({ body: `❎ Không có bài hát ≤ 15 phút cho "${key}"` });
        return;
      }

      const msg = list
        .map((i, k) => `${k + 1}. ${i.title}\n⏳ ${i.timestamp || i.time} - 📺 ${i.author || i.channel?.name || ""}`)
        .join("\n\n");

      await reply(`🔍 Kết quả (≤15p):\n\n${msg}\n\n⩺ Reply số để tải audio qua YouTube API`, (err: Error | null, info?: { messageID?: string }) => {
        if (err || !info?.messageID) return;
        if (!main?.onReply?.set) return;
        main.onReply.set(info.messageID, {
          commandName: commandName || "sing",
          messageID: info.messageID,
          author: String(event.senderID),
          type: "sing-select",
          result: list,
        } as unknown as ReplyData);
      });
    } catch (e: unknown) {
      console.error(e);
      const error = e as { message?: string };
      await reply({ body: `❎ Lỗi: ${error.message || String(e)}` });
    }
  },

  async onReply(ctx: CommandOnReplyContext) {
    const { client, event, reply, main, Reply, unsend } = ctx;
    try {
      if (!Reply || String(event.senderID) !== String(Reply.author)) return;
      if (Reply.type !== "sing-select") return;
      unsend(Reply.messageID);
      const idx = parseInt(String(event.body || "").trim(), 10) - 1;
      const result = Reply.result as unknown as VideoResult[] | undefined;
      if (isNaN(idx) || idx < 0 || !result || !Array.isArray(result) || idx >= result.length) {
        await reply("❎ Vui lòng chọn số hợp lệ!");
        return;
      }
      const v: VideoResult = result[idx];
      const videoId = v.videoId || v.id;
      if (!videoId) {
        await reply("❎ Không tìm thấy Video ID!");
        return;
      }
      const notice = await reply(`⬇️ Đang tải audio qua YouTube API: "${v.title}"...`);

      try {
        const dur = v.seconds ?? parseTimeToSeconds(v.time);
        if (!dur || dur > MAX_DURATION) {
          throw new Error("Video dài quá 15 phút");
        }

        const r = await dlAudio(videoId, v.title);
        const info = r.manifest.info;
        const body = `🎵 ${v.title}\n👤 ${v.author || v.channel?.name || info.channel || "Unknown"}\n⏱️ ${v.timestamp || v.time || toTime(Number(info.duration || 0))}`;
        const readStream = fs.createReadStream(r.path);
        const attachment = {
          stream: readStream,
          filename: "audio.mp3",
          contentType: "audio/mpeg",
        };

        await new Promise<void>((resolve, reject) => {
          client.sendMessage(
            { body, attachment },
            event.threadID,
            (err?: Error) => {
              if (err) reject(err);
              else resolve();
            },
            event.messageID
          );
        });

        readStream.on("close", () => {
          setTimeout(() => {
            try {
              fs.unlinkSync(r.path);
            } catch {}
          }, 30000);
        });
      } catch (e: unknown) {
        const err = e as { message?: string };
        await reply(`❎ Lỗi: ${err.message || String(e)}`);
      }

      if (notice?.messageID) {
        try {
          await client.unsendMessage(notice.messageID, event.threadID);
        } catch {}
      }

      if (Reply.messageID && main?.onReply?.delete) {
        try {
          main.onReply.delete(Reply.messageID);
        } catch {}
      }
    } catch (e: unknown) {
      console.error("[sing] onReply error:", e);
      const err = e as { message?: string };
      await reply(`❎ Lỗi: ${err.message || String(e)}`);
    }
  },
};

export default singCommand;
