import type { Command, CommandOnCallContext, CommandOnReplyContext, ReplyData } from "@types";
import axios from "axios";
import type { Readable } from "node:stream";
import { PassThrough } from "node:stream";

const MAX_DURATION = 15 * 60;
const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // ~25MB

interface YtdownMediaItem {
  type: string;
  mediaExtension: string;
  mediaQuality: string;
  mediaFileSize: string;
  mediaPreviewUrl?: string;
  mediaUrl?: string;
  mediaDuration?: string;
}

interface YtdownUserInfo {
  name?: string;
  followersCount?: number;
}

interface YtdownMediaStats {
  viewsCount?: number;
}

interface YtdownApiData {
  status: string;
  message?: string;
  title?: string;
  mediaItems: YtdownMediaItem[];
  userInfo?: YtdownUserInfo;
  mediaStats?: YtdownMediaStats;
}

interface YtdownResponse {
  api?: YtdownApiData;
}

interface DownloadResult {
  title: string;
  duration: string;
  author: string;
  sub: number;
  viewCount: number;
  audioUrl: string;
  audioExtension: string;
}

interface VideoResult {
  type?: "video" | "live";
  videoId?: string;
  id?: string;
  url?: string;
  title: string;
  author?: string;
  channel?: { name?: string };
  timestamp?: string;
  time?: string;
  seconds?: number;
  views?: number;
}

interface SearchResult {
  videos: VideoResult[];
  channels: Array<Record<string, unknown>>;
  playlists: Array<Record<string, unknown>>;
  live: VideoResult[];
  all: Array<VideoResult | Record<string, unknown>>;
}

function safeExt(ext: string): "mp3" | "m4a" {
  const e = String(ext || "").toLowerCase().trim();
  return e === "m4a" ? "m4a" : "mp3";
}

async function getStreamAndSize(url: string, path = ""): Promise<{ stream: Readable; size: number }> {
  const response = await axios({
    method: "GET",
    url,
    responseType: "stream",
    headers: {
      Range: "bytes=0-",
    },
  });

  // Keep compatibility with older code: attach path onto the stream object.
  if (path) (response.data as any).path = path;

  const totalLength = Number(response.headers["content-length"] || 0);
  return {
    stream: response.data as unknown as Readable,
    size: totalLength || 0,
  };
}

async function streamWithProgress(
  url: string,
  maxBytes: number,
  onProgress?: (info: {
    downloaded: number;
    total: number;
    speedBps: number;
    percent: number;
    timeLeftSec: number;
  }) => void
): Promise<{ stream: Readable; size: number }> {
  const { stream: sourceStream, size: declaredSize } = await getStreamAndSize(url);
  if (declaredSize && declaredSize > maxBytes) {
    try {
      sourceStream.destroy();
    } catch { /* ignore */ }
    throw new Error(`File quá lớn (${(declaredSize / 1024 / 1024).toFixed(2)}MB > 25MB)`);
  }

  const pass = new PassThrough();
  const startedAt = Date.now();
  let downloaded = 0;
  let chunkCount = 0;

  const total = declaredSize || 0;

  sourceStream.on("data", (chunk: Buffer) => {
    downloaded += chunk.length;
    chunkCount += 1;

    if (maxBytes > 0 && downloaded > maxBytes) {
      const err = new Error(`File quá lớn (${(maxBytes / 1024 / 1024).toFixed(2)}MB > 25MB)`);
      try {
        pass.destroy(err);
      } catch { /* ignore */ }
      try {
        sourceStream.destroy();
      } catch { /* ignore */ }
      return;
    }

    if (chunkCount % 5 !== 0) return;
    if (typeof onProgress !== "function") return;

    const elapsedSec = Math.max(0.001, (Date.now() - startedAt) / 1000);
    const speedBps = downloaded / elapsedSec;
    const percent = total ? (downloaded / total) * 100 : 0;

    let timeLeftSec = 0;
    if (total > 0 && downloaded > 0 && speedBps > 0) {
      timeLeftSec = Math.max(0, (total - downloaded) / speedBps);
    } else if (total > 0 && downloaded > 0) {
      timeLeftSec = Math.max(0, (total / downloaded - 1) * elapsedSec);
    }

    onProgress({
      downloaded,
      total,
      speedBps,
      percent,
      timeLeftSec,
    });
  });

  sourceStream.on("error", (err: unknown) => {
    try {
      pass.destroy(err instanceof Error ? err : new Error(String(err)));
    } catch { /* ignore */ }
  });
  pass.on("error", () => {
    try {
      sourceStream.destroy();
    } catch { /* ignore */ }
  });

  sourceStream.pipe(pass);

  return { stream: pass, size: total };
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/.*[?&]v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

function isYoutubeUrl(s: string): boolean {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(s);
}

function parseTimeToSeconds(t: unknown): number {
  const parts = String(t ?? "")
    .trim()
    .split(":")
    .map((n) => parseInt(n, 10))
    .filter((n) => !isNaN(n));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

async function fetchFromYtdown(link: string): Promise<DownloadResult> {
  const res = await axios.post<YtdownResponse>(
    "https://app.ytdown.to/proxy.php",
    `url=${encodeURIComponent(link)}`,
    {
      headers: {
        Accept: "*/*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Origin: "https://app.ytdown.to",
        Referer: "https://app.ytdown.to/vi21/",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
      },
    }
  );

  const apiData = res.data?.api;
  if (!apiData || apiData.status !== "ok") {
    throw new Error(apiData?.message || "Không tìm thấy thông tin video");
  }

  const audioItems = (apiData.mediaItems || []).filter((i) => i.type === "Audio");
  if (!audioItems.length) throw new Error("Không tìm thấy audio để tải");

  const selected =
    audioItems.find((i) => i.mediaExtension === "MP3" && i.mediaQuality === "128K") ||
    audioItems.find((i) => i.mediaExtension === "M4A" && i.mediaQuality === "128K") ||
    audioItems.find((i) => i.mediaQuality === "128K") ||
    audioItems.find((i) => i.mediaQuality === "48K") ||
    audioItems[0];

  const audioUrl = selected.mediaPreviewUrl || selected.mediaUrl;
  if (!audioUrl) throw new Error("Không có URL tải audio");

  return {
    title: apiData.title || "Không rõ",
    duration: apiData.mediaItems[0]?.mediaDuration || "0:00",
    author: apiData.userInfo?.name || "Không rõ",
    sub: apiData.userInfo?.followersCount || 0,
    viewCount: apiData.mediaStats?.viewsCount || 0,
    audioUrl,
    audioExtension: selected.mediaExtension.toLowerCase(),
  };
}

const REPLY_TYPE = "sing3-select";

const sing3Command: Command = {
  name: "sing1",
  alias: ["yt3", "ytmusic"],
  version: "1.0.0",
  role: 0,
  desc: "Nghe nhạc YouTube qua ytdown API",
  guide: "{pn} [từ khóa | link YouTube]",
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { args, reply, event, api, main, commandName } = ctx;
    const startedAt = Date.now();

    try {
      if (!args?.length) {
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

        const note = await reply({ body: "⬇️ Đang tải audio..." });

        try {
          const r = await fetchFromYtdown(key);
          const ext = safeExt(r.audioExtension);

          let lastProgressAt = 0;
          const { stream: audioStream } = await streamWithProgress(
            r.audioUrl,
            MAX_AUDIO_SIZE,
            ({ downloaded, total, speedBps, percent, timeLeftSec }) => {
              if (timeLeftSec <= 30) return;
              const now = Date.now();
              if (now - lastProgressAt < 10_000) return;
              lastProgressAt = now;

              const speedMBps = speedBps / 1024 / 1024;
              const downloadedMB = downloaded / 1024 / 1024;
              const totalMB = total ? total / 1024 / 1024 : 0;
              const percentText = total ? Math.round(percent) : 0;
              const timeLeftText = Math.max(0, Math.floor(timeLeftSec));

              void reply({
                body:
                  `⬇️ Đang tải audio \"${r.title}\"\\n` +
                  `🔃 Tốc độ: ${speedMBps.toFixed(2)}MB/s\\n` +
                  `⏸️ Đã tải: ${downloadedMB.toFixed(2)}/${totalMB ? totalMB.toFixed(2) : "?"}MB (${percentText}%)\\n` +
                  `⏳ Ước tính còn lại: ${timeLeftText} giây`,
              });
            }
          );

          const body =
            `🎵 ${r.title}\n` +
            `👤 ${r.author}\n` +
            `⏱️ ${r.duration}\n` +
            `👀 ${r.viewCount ? Number(r.viewCount).toLocaleString() : "0"}\n` +
            `⌛ ${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

          await reply({
            body,
            attachment: {
              stream: audioStream,
              filename: `audio.${ext}`,
              contentType: ext === "m4a" ? "audio/mp4" : "audio/mpeg",
            },
          });

          if (note?.messageID) {
            try {
              const { client } = ctx;
              await client.unsendMessage(note.messageID, event.threadID);
            } catch { /* ignore */ }
          }
        } catch (e: unknown) {
          const err = e instanceof Error ? e : new Error(String(e));
          await reply({ body: `❎ Lỗi: ${err.message}` });
          if (note?.messageID) {
            try {
              const { client } = ctx;
              await client.unsendMessage(note.messageID, event.threadID);
            } catch { /* ignore */ }
          }
        }
        return;
      }

      if (!api?.youtube?.search) {
        await reply({ body: "❌ Service YouTube chưa được load. Vui lòng kiểm tra lại!" });
        return;
      }

      const res: SearchResult = await api.youtube.search(key, { hl: "vi", gl: "VN" });
      let list: VideoResult[] = [...res.live, ...res.videos].slice(0, 10);
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
        .map(
          (v, i) =>
            `${i + 1}. ${v.title}\n⏳ ${v.timestamp || v.time || "N/A"} - 📺 ${v.author || v.channel?.name || "Không rõ"}`
        )
        .join("\n\n");

      await reply(
        `🔍 Kết quả (≤15p):\n\n${msg}\n\n⩺ Reply số để tải audio`,
        (err: Error | null, info?: { messageID?: string }) => {
          if (err || !info?.messageID || !main?.onReply?.set) return;
          main.onReply.set(info.messageID, {
            commandName: commandName || "sing3",
            messageID: info.messageID,
            author: String(event.senderID),
            type: REPLY_TYPE,
            result: list,
          } as unknown as ReplyData);
        }
      );
    } catch (e: unknown) {
      console.error("[sing3] onCall error:", e);
      const err = e instanceof Error ? e : new Error(String(e));
      await reply({ body: `❎ Lỗi: ${err.message}` });
    }
  },

  async onReply(ctx: CommandOnReplyContext): Promise<void> {
    const { client, event, reply, main, Reply, unsend } = ctx;
    const startedAt = Date.now();

    try {
      if (!Reply || String(event.senderID) !== String(Reply.author)) return;
      if (Reply.type !== REPLY_TYPE) return;
      unsend(Reply.messageID);

      const idx = parseInt(String(event.body || "").trim(), 10) - 1;
      const list = Reply.result as unknown as VideoResult[] | undefined;

      if (isNaN(idx) || idx < 0 || !Array.isArray(list) || idx >= list.length) {
        await reply("❎ Vui lòng chọn số hợp lệ!");
        return;
      }

      const v = list[idx];
      const videoId = v.videoId || v.id;
      if (!videoId) {
        await reply("❎ Không tìm thấy Video ID!");
        return;
      }

      const notice = await reply(`⬇️ Đang tải: "${v.title}"...`);
      try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const r = await fetchFromYtdown(url);
        const ext = safeExt(r.audioExtension);
        let lastProgressAt = 0;
        const { stream: audioStream } = await streamWithProgress(
          r.audioUrl,
          MAX_AUDIO_SIZE,
          ({ downloaded, total, speedBps, percent, timeLeftSec }) => {
            if (timeLeftSec <= 30) return;
            const now = Date.now();
            if (now - lastProgressAt < 10_000) return;
            lastProgressAt = now;

            const speedMBps = speedBps / 1024 / 1024;
            const downloadedMB = downloaded / 1024 / 1024;
            const totalMB = total ? total / 1024 / 1024 : 0;
            const percentText = total ? Math.round(percent) : 0;
            const timeLeftText = Math.max(0, Math.floor(timeLeftSec));

            void reply({
              body:
                `⬇️ Đang tải audio \"${r.title}\"\\n` +
                `🔃 Tốc độ: ${speedMBps.toFixed(2)}MB/s\\n` +
                `⏸️ Đã tải: ${downloadedMB.toFixed(2)}/${totalMB ? totalMB.toFixed(2) : "?"}MB (${percentText}%)\\n` +
                `⏳ Ước tính còn lại: ${timeLeftText} giây`,
            });
          }
        );

        const body =
          `🎵 ${r.title}\n` +
          `👤 ${r.author}\n` +
          `⏱️ ${r.duration}\n` +
          `⌛ ${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

        await reply({
          body,
          attachment: {
            stream: audioStream,
            filename: `audio.${ext}`,
            contentType: ext === "m4a" ? "audio/mp4" : "audio/mpeg",
          },
        });
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        await reply(`❎ Lỗi: ${err.message}`);
      }

      if (notice?.messageID) {
        try {
          await client.unsendMessage(notice.messageID, event.threadID);
        } catch { /* ignore */ }
      }

      if (Reply.messageID && main?.onReply?.delete) {
        try {
          main.onReply.delete(Reply.messageID);
        } catch { /* ignore */ }
      }
    } catch (e: unknown) {
      console.error("[sing3] onReply error:", e);
      const err = e instanceof Error ? e : new Error(String(e));
      await reply(`❎ Lỗi: ${err.message}`);
    }
  },
};

export default sing3Command;