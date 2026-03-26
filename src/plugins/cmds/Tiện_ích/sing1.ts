import type { Command, CommandOnCallContext, CommandOnReplyContext, ReplyData } from "@types";
import axios from "axios";
import fs from "fs";
import path from "path";
import type { Readable } from "node:stream";

type YoutubeItem = {
  id?: string | { videoId?: string };
  title?: string;
  channelTitle?: string;
  length?: { simpleText?: string };
};

type YtdownMediaItem = {
  type?: string;
  mediaExtension?: string;
  mediaQuality?: string;
  mediaFileSize?: string;
  mediaPreviewUrl?: string;
  mediaUrl?: string;
  mediaDuration?: string;
};

type YtdownResponse = {
  api?: {
    status?: string;
    message?: string;
    title?: string;
    mediaItems?: YtdownMediaItem[];
    userInfo?: {
      name?: string;
      followersCount?: number;
    };
    mediaStats?: {
      viewsCount?: number;
    };
  };
};

type SearchVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  length: string;
  originalId: string;
};

const REPLY_TYPE = "sing1-select";

function tempRoot(): string {
  const p = path.join(process.cwd(), "temp");
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

function isYoutubeUrl(input: string): boolean {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(String(input || "").trim());
}

function getVideoIdFromUrl(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/.*[?&]v=([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = String(url || "").match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

async function streamURL(url: string, type: string): Promise<Readable> {
  const tempDir = tempRoot();
  const res = await axios.get<Readable>(url, {
    responseType: "stream",
    timeout: 15000,
  });

  const ext = String(type || "mp3").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp3";
  const tempFile = path.resolve(tempDir, `${Date.now()}.${ext}`);
  const writeStream = fs.createWriteStream(tempFile);
  (res.data as unknown as Readable).pipe(writeStream);

  return new Promise((resolve, reject) => {
    writeStream.on("finish", () => {
      const readStream = fs.createReadStream(tempFile);
      readStream.on("close", () => {
        try {
          fs.unlinkSync(tempFile);
        } catch {
          // ignore
        }
      });
      resolve(readStream);
    });
    writeStream.on("error", reject);
  });
}

async function downloadMusicFromYoutube(link: string) {
  const timestart = Date.now();
  if (!link) throw new Error("Thiếu link");

  const form = new URLSearchParams();
  form.set("url", link);

  const apiResponse = await axios.post<YtdownResponse>(
    "https://app.ytdown.to/proxy.php",
    form.toString(),
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
      timeout: 30000,
    }
  );

  const apiData = apiResponse.data?.api;
  if (!apiData || apiData.status !== "ok") {
    throw new Error(apiData?.message || "Không tìm thấy thông tin video");
  }

  const mediaItems = Array.isArray(apiData.mediaItems) ? apiData.mediaItems : [];
  const audioItems = mediaItems.filter((item) => item?.type === "Audio");
  if (!audioItems.length) {
    throw new Error("Không tìm thấy audio để tải");
  }

  let selectedAudio =
    audioItems.find((item) => item.mediaExtension === "MP3" && item.mediaQuality === "128K") ||
    audioItems.find((item) => item.mediaExtension === "M4A" && item.mediaQuality === "128K");

  if (!selectedAudio) {
    const qualityOrder = ["128K", "48K"];
    for (const quality of qualityOrder) {
      selectedAudio = audioItems.find((item) => item.mediaQuality === quality);
      if (selectedAudio) break;
    }
  }
  if (!selectedAudio) selectedAudio = audioItems[0];

  const audioUrl = selectedAudio.mediaPreviewUrl || selectedAudio.mediaUrl;
  const audioExtension = String(selectedAudio.mediaExtension || "mp3").toLowerCase();

  if (!audioUrl) throw new Error("Không có URL tải audio");

  console.log(
    `Đang tải audio: ${selectedAudio.mediaExtension || "?"} - ${selectedAudio.mediaQuality || "?"} (${selectedAudio.mediaFileSize || "?"})`
  );

  const audioStream = await streamURL(audioUrl, audioExtension);

  return {
    title: apiData.title || "Không rõ",
    duration: mediaItems[0]?.mediaDuration || "0:00",
    sub: Number(apiData.userInfo?.followersCount || 0),
    viewCount: Number(apiData.mediaStats?.viewsCount || 0),
    author: apiData.userInfo?.name || "Không rõ",
    timestart,
    audioStream,
    audioExtension,
  };
}

const sing1Command: Command = {
  name: "sing1",
  alias: ["music1", "musicapi1", "musicyoutube1"],
  version: "1.0.0",
  role: 0,
  desc: "Phát nhạc từ link YouTube hoặc từ khoá tìm kiếm (dùng ytdown.to proxy)",
  guide: "{pn} [tên nhạc | link]",
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { args, client, reply, event, main, commandName } = ctx;

    try {
      if (!args || !args.length) {
        await reply({ body: "❎ Vui lòng nhập từ khóa hoặc link YouTube!" });
        return;
      }

      const key = args.join(" ").replace("?feature=share", "").trim();

      if (isYoutubeUrl(key)) {
        const note = await reply({ body: "⬇️ Đang tải audio qua ytdown.to..." });
        try {
          const result = await downloadMusicFromYoutube(key);
          const body =
            `🎵 ${result.title}\n` +
            `👤 ${result.author}\n` +
            `⏱️ ${result.duration}\n` +
            `👀 ${Number(result.viewCount || 0).toLocaleString()}\n` +
            `👥 Followers: ${Number(result.sub || 0).toLocaleString()}`;

          const attachment = {
            stream: result.audioStream,
            filename: `audio.${result.audioExtension === "m4a" ? "m4a" : "mp3"}`,
            contentType: result.audioExtension === "m4a" ? "audio/mp4" : "audio/mpeg",
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

          if (note?.messageID) {
            try {
              await client.unsendMessage(note.messageID, event.threadID);
            } catch {
              // ignore
            }
          }
        } catch (e: unknown) {
          const error = e instanceof Error ? e : new Error(String(e));
          await reply({ body: `❎ Lỗi: ${error.message}` });
          if (note?.messageID) {
            try {
              await client.unsendMessage(note.messageID, event.threadID);
            } catch {
              // ignore
            }
          }
        }
        return;
      }

      const YoutubeMod = (await import("youtube-search-api")) as {
        GetListByKeyword: (keyword: string, withPlaylist?: boolean, limit?: number) => Promise<{ items: YoutubeItem[] }>;
      };

      const search = await YoutubeMod.GetListByKeyword(key, false, 10);
      const data = Array.isArray(search?.items) ? search.items : [];

      if (!data.length) {
        await reply({ body: "❌ Không tìm thấy kết quả nào cho từ khóa này!" });
        return;
      }

      const videos: SearchVideo[] = [];
      let msg = "";
      let num = 0;

      for (const value of data) {
        if (!value?.id) continue;

        let videoId = "";
        if (typeof value.id === "object" && value.id?.videoId) {
          videoId = String(value.id.videoId);
        } else if (typeof value.id === "string") {
          if (value.id.includes("youtube.com") || value.id.includes("youtu.be")) {
            videoId = getVideoIdFromUrl(value.id) || value.id;
          } else {
            videoId = value.id;
          }
        }

        if (!videoId) continue;

        num += 1;
        const title = value.title || "Không rõ";
        const channelTitle = value.channelTitle || "Không rõ";
        const length = value.length?.simpleText || "N/A";
        videos.push({
          videoId,
          title,
          channelTitle,
          length,
          originalId: typeof value.id === "string" ? value.id : value.id?.videoId || videoId,
        });

        msg +=
          `${num} - ${title}\n` +
          `⩺ 📺 Tên kênh: ${channelTitle}\n` +
          `⩺ ⏱️ Thời lượng: ${length}\n` +
          `──────────────────\n`;
      }

      if (!videos.length) {
        await reply({ body: "❌ Không tìm thấy video hợp lệ!" });
        return;
      }

      const body =
        `[ Kết Quả Tìm Kiếm ]\n──────────────────\n${msg}` +
        `📌 Trả lời tin nhắn này kèm số thứ tự tương ứng với bài hát mà bạn chọn`;

      await reply(body, (error: Error | null, info?: { messageID?: string }) => {
        if (error || !info?.messageID) return;
        if (!main?.onReply?.set) return;

        main.onReply.set(
          info.messageID,
          {
            commandName: commandName || "sing1",
            messageID: info.messageID,
            author: String(event.senderID),
            type: REPLY_TYPE,
            result: videos,
          } as unknown as ReplyData
        );
      });
    } catch (e: unknown) {
      console.error("[sing1] onCall error:", e);
      const error = e instanceof Error ? e : new Error(String(e));
      await reply({ body: `❎ Lỗi: ${error.message}` });
    }
  },

  async onReply(ctx: CommandOnReplyContext): Promise<void> {
    const { client, event, reply, main, Reply, unsend } = ctx;

    try {
      if (!Reply || String(event.senderID) !== String(Reply.author)) return;
      if (Reply.type !== REPLY_TYPE) return;

      unsend(Reply.messageID);

      const idx = parseInt(String(event.body || "").trim(), 10) - 1;
      const videos = Reply.result as SearchVideo[] | undefined;

      if (isNaN(idx) || idx < 0 || !videos || !Array.isArray(videos) || idx >= videos.length) {
        await reply("❎ Vui lòng chọn số hợp lệ!");
        return;
      }

      const selectedVideo = videos[idx];
      const url = `https://www.youtube.com/watch?v=${selectedVideo.videoId}`;
      const notice = await reply(`⬇️ Đang tải audio: "${selectedVideo.title}"...`);

      try {
        const r = await downloadMusicFromYoutube(url);
        const body =
          `🎵 ${r.title}\n` +
          `👤 ${r.author}\n` +
          `⏱️ ${r.duration}\n` +
          `👀 ${Number(r.viewCount || 0).toLocaleString()}`;

        const attachment = {
          stream: r.audioStream,
          filename: `audio.${r.audioExtension === "m4a" ? "m4a" : "mp3"}`,
          contentType: r.audioExtension === "m4a" ? "audio/mp4" : "audio/mpeg",
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
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        await reply(`❎ Lỗi: ${err.message}`);
      }

      if (notice?.messageID) {
        try {
          await client.unsendMessage(notice.messageID, event.threadID);
        } catch {
          // ignore
        }
      }

      if (Reply.messageID && main?.onReply?.delete) {
        try {
          main.onReply.delete(Reply.messageID);
        } catch {
          // ignore
        }
      }
    } catch (e: unknown) {
      console.error("[sing1] onReply error:", e);
      const err = e instanceof Error ? e : new Error(String(e));
      await reply(`❎ Lỗi: ${err.message}`);
    }
  },
};

export default sing1Command;

