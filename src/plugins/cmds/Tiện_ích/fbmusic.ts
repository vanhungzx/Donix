"use strict";

import type { Command, CommandOnCallContext, CommandOnReplyContext } from "@types";
import axios from "axios";
import fs from "fs";
import path from "path";
import { TEMP_DIR } from "../../../core/storagePath";

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

function tempRoot(): string {
  const p = TEMP_DIR();
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

async function downloadAudio(audioUrl: string, outputPath: string): Promise<void> {
  const response = await axios({
    method: "get",
    url: audioUrl,
    responseType: "stream",
    timeout: 60000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://www.facebook.com/",
    },
  });

  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

const fbmusicCommand: Command = {
  name: "fbmusic",
  alias: ["fbnhac", "fbmusic", "nhacfb"],
  version: "1.0.0",
  role: 0,
  desc: "Tìm kiếm và nghe nhạc Facebook",
  guide: "{pn} [từ khóa tìm kiếm]\n\nVí dụ:\n• {pn} Sẵn Sàng Yêu Em Đi Thôi\n• {pn} WONI",
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext) {
    const { client, event, args, reply, send, main, commandName } = ctx;

    try {
      if (!args || !args.length) {
        await reply({
          body: "❎ Vui lòng nhập từ khóa tìm kiếm!\n\nVí dụ: fbmusic Sẵn Sàng Yêu Em Đi Thôi",
        });
        return;
      }

      const searchText = args.join(" ").trim();


      const notice = await reply({ body: `🔍 Đang tìm kiếm: "${searchText}"...` });

      try {
        const result: GetStoryMusicListResult = await client.getStoryMusicList({
          searchText: searchText,
          limit: 20,
        });

        if (!result.tracks || result.tracks.length === 0) {
          if (notice?.messageID) {
            ctx.client.unsendMessage(notice.messageID, event.threadID);
          }
          await reply({
            body: `❎ Không tìm thấy kết quả cho "${searchText}"`,
          });
          return;
        }

        // Filter tracks that have audio_url
        const tracksWithAudio = result.tracks.filter((track) => track.audio_url);

        if (tracksWithAudio.length === 0) {
          if (notice?.messageID) {
            ctx.client.unsendMessage(notice.messageID, event.threadID);
          }
          await reply({
            body: `❎ Không tìm thấy nhạc có thể tải cho "${searchText}"`,
          });
          return;
        }

        // Limit to 10 tracks for display
        const displayTracks = tracksWithAudio.slice(0, 10);

        const msg = displayTracks
          .map(
            (track, index) =>
              `${index + 1}. 🎵 ${track.title}\n   👤 ${track.artist || "Unknown"}\n   ⏱️ ${formatDuration(track.duration_in_ms)}`
          )
          .join("\n\n");

        const sent = await send({
          body: `🎵 Kết quả tìm kiếm "${searchText}":\n\n${msg}\n\n⩺ Reply số (1-${displayTracks.length}) để tải nhạc`,
        });

        if (sent?.messageID && main?.onReply) {
          main.onReply.set(sent.messageID, {
            commandName,
            author: event.senderID,
            messageID: sent.messageID,
            tracks: displayTracks as unknown as Record<string, string | number | boolean | null | undefined>,
          });
        }

        if (notice?.messageID) {
          ctx.client.unsendMessage(notice.messageID, event.threadID);
        }
      } catch (error: unknown) {
        if (notice?.messageID) {
          ctx.client.unsendMessage(notice.messageID, event.threadID);
        }
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await reply({
          body: `❌ Lỗi khi tìm kiếm: ${errorMessage}`,
        });
      }
    } catch (e: unknown) {
      const error = e as { message?: string };
      await reply({
        body: `❌ Lỗi: ${error.message || "Đã xảy ra lỗi"}`,
      });
    }
  },

  async onReply(ctx: CommandOnReplyContext) {
    const { client, event, reply, main, Reply } = ctx;

    try {
      if (!Reply || event.senderID !== Reply.author) return;

      client.unsendMessage(Reply.messageID, event.threadID);

      const idx = parseInt(String(event.body || "").trim(), 10) - 1;
      const tracks = (Reply.tracks as MusicTrack[] | undefined);

      if (isNaN(idx) || idx < 0 || !tracks || idx >= tracks.length) {
        await reply({ body: "❎ Vui lòng chọn số hợp lệ!" });
        return;
      }

      const track: MusicTrack = tracks[idx];

      if (!track.audio_url) {
        await reply({ body: "❌ Nhạc này không có URL để tải!" });
        return;
      }

      const notice = await reply({
        body: `⬇️ Đang tải: ${track.title}...`,
      });

      try {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const outputPath = path.join(tempRoot(), `fbmusic_${timestamp}_${randomId}.mp3`);

        await downloadAudio(track.audio_url, outputPath);

        const fileSize = fs.statSync(outputPath).size;
        const sizeFormatted =
          fileSize > 1024 * 1024
            ? `${(fileSize / 1024 / 1024).toFixed(2)}MB`
            : `${(fileSize / 1024).toFixed(2)}KB`;

        const caption = `🎵 ${track.title}\n👤 ${track.artist || "Unknown"}\n⏱️ ${formatDuration(track.duration_in_ms)}\n📊 ${sizeFormatted}`;

        await new Promise<void>((resolve, reject) => {
          client.sendMessage(
            {
              body: caption,
              attachment: fs.createReadStream(outputPath),
            },
            event.threadID,
            (err: Error | null | undefined) => {
              if (err) reject(err);
              else resolve();
            },
            event.messageID
          );
        });

        // Clean up file after 60 seconds
        setTimeout(() => {
          try {
            if (fs.existsSync(outputPath)) {
              fs.unlinkSync(outputPath);
            }
          } catch {
            // Ignore errors
          }
        }, 60000);

        if (notice?.messageID) {
          client.unsendMessage(notice.messageID, event.threadID);
        }

        if (main?.onReply?.delete) {
          main.onReply.delete(Reply.messageID);
        }
      } catch (error: unknown) {
        if (notice?.messageID) {
          client.unsendMessage(notice.messageID, event.threadID);
        }
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await reply({
          body: `❌ Lỗi khi tải nhạc: ${errorMessage}`,
        });
      }
    } catch (e: unknown) {
      const error = e as { message?: string };
      await reply({
        body: `❌ Lỗi: ${error.message || "Đã xảy ra lỗi"}`,
      });
    }
  },
};

export default fbmusicCommand;
