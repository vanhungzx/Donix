"use strict";

import type { Command, CommandOnCallContext, CommandOnReplyContext, FacebookClient, ReplyData } from "@types";
import axios from "axios";
import fs from "fs";
import path from "path";

interface MusicTrack {
  id: string;
  display_id: string;
  title: string;
  artist: string;
  album_title?: string;
  cover_artwork?: string;
  duration_in_ms?: number;
  audio_url?: string;
  is_saved_by_viewer?: boolean;
}

interface GetStoryMusicListResult {
  tracks: MusicTrack[];
  has_next_page: boolean;
  cursor: string | null;
}

interface AttachmentLike {
  type?: string;
  url?: string;
  previewUrl?: string;
  hiresUrl?: string;
  largePreviewUrl?: string;
  thumbnail_url?: string;
  playableUrl?: string;
}

type ClientWithStoryMethods = FacebookClient & {
  getStoryMusicList?: (options: { searchText?: string; limit?: number }) => Promise<GetStoryMusicListResult>;
  uploadStoryWithImageAndMusic?: (options: { imagePath: string; musicAssetId: string }) => Promise<{
    story_id?: string;
    logging_token?: string;
    photo_id?: string;
  }>;
};

function tempRoot(): string {
  const p = path.join(process.cwd(), "temp");
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return "N/A";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function pickAttachmentUrl(att: AttachmentLike | undefined | null): string | null {
  if (!att) return null;
  return (
    att.url ||
    att.previewUrl ||
    att.hiresUrl ||
    att.largePreviewUrl ||
    att.thumbnail_url ||
    att.playableUrl ||
    null
  );
}

async function downloadImage(url: string): Promise<string> {
  const dir = tempRoot();
  const filePath = path.join(dir, `storyimg_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60_000,
  });

  fs.writeFileSync(filePath, Buffer.from(response.data));
  return filePath;
}

const storyImgMusicCommand: Command = {
  name: "storyimgmusic",
  alias: ["storyimg", "storyanhnhac"],
  version: "1.0.0",
  role: 0,
  category: "Media",
  desc: "Tìm nhạc Facebook và đăng Story ảnh với nhạc (dùng web client)",
  guide:
    "{pn} [từ khóa nhạc] (reply/đính kèm 1 ảnh)\n" +
    "Ví dụ:\n" +
    "• Reply 1 ảnh rồi dùng: {pn} Nắng Ấm Trong Tim\n" +
    "• Gửi ảnh kèm lệnh: {pn} WONI\n\n" +
    "Bot sẽ gửi danh sách nhạc, reply số để đăng Story với ảnh đó.",
  cd: 10,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { client, event, args, reply, main, commandName } = ctx;
    const fbClient = client as ClientWithStoryMethods;
    const attachments = (event.attachments || []) as AttachmentLike[];
    const messageReply = event.messageReply as { attachments?: AttachmentLike[] } | undefined;

    try {
      if (!args || args.length === 0) {
        await reply(
          "❎ Vui lòng nhập từ khóa nhạc!\n\n" +
          "📖 Cách dùng:\n" +
          "• Reply 1 ảnh rồi dùng: " + commandName + " [từ khóa nhạc]\n" +
          "• Hoặc gửi ảnh kèm lệnh: " + commandName + " [từ khóa nhạc]"
        );
        return;
      }

      const searchText = args.join(" ").trim();

      // Lấy ảnh từ reply hoặc từ attachments hiện tại
      let imageUrl: string | null = null;

      if (messageReply?.attachments && Array.isArray(messageReply.attachments) && messageReply.attachments.length > 0) {
        const photoAtt =
          messageReply.attachments.find((att: AttachmentLike) => att.type === "photo") ||
          messageReply.attachments[0];
        imageUrl = pickAttachmentUrl(photoAtt);
      }

      if (!imageUrl && attachments && Array.isArray(attachments) && attachments.length > 0) {
        const photoAtt = attachments.find((att: AttachmentLike) => att.type === "photo") || attachments[0];
        imageUrl = pickAttachmentUrl(photoAtt);
      }

      if (!imageUrl) {
        await reply(
          "❎ Không tìm thấy ảnh!\n\n" +
          "📸 Vui lòng reply 1 ảnh hoặc gửi ảnh kèm lệnh rồi thử lại.\n\n" +
          "Ví dụ:\n" +
          "• Reply ảnh: " + commandName + " Nắng Ấm Trong Tim\n" +
          "• Gửi ảnh kèm: " + commandName + " WONI"
        );
        return;
      }

      const notice = await reply(`⏳ Đang tải ảnh và tìm nhạc: "${searchText}"...`);

      // Tải ảnh về file tạm
      const imagePath = await downloadImage(imageUrl);

      // Tìm nhạc qua getStoryMusicList (web API)
      if (typeof fbClient.getStoryMusicList !== "function") {
        await reply("❌ API getStoryMusicList chưa được nạp vào client.");
        if (fs.existsSync(imagePath)) {
          try {
            fs.unlinkSync(imagePath);
          } catch {
            // ignore
          }
        }
        return;
      }

      let result: GetStoryMusicListResult;
      try {
        result = await fbClient.getStoryMusicList({
          searchText,
          limit: 20,
        });
      } catch (error: unknown) {
        if (notice?.messageID) {
          try {
            await fbClient.unsendMessage(notice.messageID, event.threadID, () => undefined);
          } catch {
            // ignore
          }
        }

        const msg = error instanceof Error ? error.message : String(error);
        await reply(`❌ Lỗi khi tìm nhạc: ${msg}`);

        if (fs.existsSync(imagePath)) {
          try {
            fs.unlinkSync(imagePath);
          } catch {
            // ignore
          }
        }
        return;
      }

      const tracks = result.tracks || [];
      if (!tracks.length) {
        if (notice?.messageID) {
          void fbClient.unsendMessage(notice.messageID, event.threadID, () => undefined);
        }

        await reply(`❎ Không tìm thấy nhạc cho: "${searchText}"`);

        if (fs.existsSync(imagePath)) {
          try {
            fs.unlinkSync(imagePath);
          } catch {
            // ignore
          }
        }
        return;
      }

      const displayTracks = tracks.slice(0, 10);

      const body =
        `🎵 Kết quả nhạc cho: "${searchText}"\n\n` +
        displayTracks
          .map(
            (t, i) =>
              `${i + 1}. ${t.title || "Không tên"}\n` +
              `   👤 ${t.artist || "Không rõ"}\n` +
              `   ⏱️ ${formatDuration(t.duration_in_ms)}\n` +
              `   🆔 ${t.id || t.display_id}`
          )
          .join("\n\n") +
        `\n\n⩺ Reply số (1-${displayTracks.length}) để đăng Story ảnh với nhạc đã chọn.`;

      if (notice?.messageID) {
        void fbClient.unsendMessage(notice.messageID, event.threadID, () => {
          // ignore
        });
      }

      void fbClient.sendMessage(
        body,
        event.threadID,
        (err?: Error, info?: { messageID?: string }) => {
          if (err) {
            if (fs.existsSync(imagePath)) {
              try {
                fs.unlinkSync(imagePath);
              } catch {
                // ignore
              }
            }
            return;
          }

          const messageID = info?.messageID;
          if (messageID && main?.onReply) {
            const meta: ReplyData = {
              commandName,
              author: event.senderID,
              messageID,
              type: "storyimgmusic-select",
              data: {
                imagePath,
                tracks: displayTracks,
              } as unknown as Record<string, string | number | boolean | null | undefined>,
            };
            main.onReply.set(messageID, meta);
          } else {
            if (fs.existsSync(imagePath)) {
              try {
                fs.unlinkSync(imagePath);
              } catch {
                // ignore
              }
            }
          }
        },
        event.messageID
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await reply(`❌ Lỗi: ${msg}`);
    }
  },

  async onReply(ctx: CommandOnReplyContext): Promise<void> {
    const { client, event, Reply, reply, main } = ctx;
    const fbClient = client as ClientWithStoryMethods;

    try {
      const meta = Reply as ReplyData | undefined;
      if (!meta || meta.type !== "storyimgmusic-select") return;

      if (String(meta.author) !== String(event.senderID)) {
        await reply("❌ Bạn không phải người dùng lệnh này.");
        return;
      }

      const data = meta.data as unknown as {
        imagePath: string;
        tracks: MusicTrack[];
      };

      if (!data || !data.imagePath || !Array.isArray(data.tracks) || !data.tracks.length) {
        await reply("❌ Dữ liệu không hợp lệ. Vui lòng dùng lệnh lại từ đầu.");
        return;
      }

      const idxRaw = (event.body || "").trim();
      const idx = parseInt(idxRaw, 10) - 1;

      if (!Number.isFinite(idx) || idx < 0 || idx >= data.tracks.length) {
        await reply(`❎ Vui lòng chọn số từ 1 đến ${data.tracks.length}.`);
        return;
      }

      const track = data.tracks[idx];
      if (!track || (!track.id && !track.display_id)) {
        await reply("❌ Không tìm thấy bài nhạc được chọn.");
        return;
      }

      await reply(
        `⏳ Đang đăng Story với nhạc:\n` +
        `🎵 ${track.title || "Không tên"}\n` +
        `👤 ${track.artist || "Không rõ"}`
      );

      if (typeof fbClient.uploadStoryWithImageAndMusic !== "function") {
        await reply("❌ API uploadStoryWithImageAndMusic chưa được nạp vào client.");
        return;
      }

      let result: {
        story_id?: string;
        logging_token?: string;
        photo_id?: string;
      } | undefined;
      try {
        result = await fbClient.uploadStoryWithImageAndMusic({
          imagePath: data.imagePath,
          musicAssetId: track.id || track.display_id,
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        await reply(`❌ Lỗi khi đăng Story: ${msg}`);
        return;
      } finally {
        // Xóa file ảnh tạm
        if (data.imagePath && fs.existsSync(data.imagePath)) {
          try {
            fs.unlinkSync(data.imagePath);
          } catch {
            // ignore
          }
        }
      }

      if (meta.messageID) {
        try {
          await fbClient.unsendMessage(meta.messageID, event.threadID, () => undefined);
        } catch {
          // ignore
        }
      }

      if (main?.onReply && meta.messageID) {
        main.onReply.delete(meta.messageID);
      }

      const storyId = result?.story_id || "N/A";
      const photoId = result?.photo_id || "N/A";

      await reply(
        "✅ Đăng Story ảnh với nhạc thành công!\n\n" +
        `🎵 ${track.title || "Không tên"}\n` +
        `👤 ${track.artist || "Không rõ"}\n` +
        `🆔 Story ID: ${storyId}\n` +
        `🖼️ Photo ID: ${photoId}`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await reply(`❌ Lỗi khi xử lý: ${msg}`);
    }
  },
};

export default storyImgMusicCommand;
