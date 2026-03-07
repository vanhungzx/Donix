"use strict";

import type { Command, CommandOnCallContext, CommandOnReplyContext } from "@types";
import { getSongList, postSongStory, searchSong } from "../../../API/detail/action/postSongStory";

interface Song {
  audio_cluster_id: string | number;
  title?: {
    text?: string;
  };
  subtitle?: {
    text?: string;
  };
  duration_ms?: number;
  cover_artwork?: {
    uri?: string;
  };
}

function formatDuration(ms: number | undefined): string {
  if (!ms || ms <= 0) return "N/A";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const postNoteCommand: Command = {
  name: "postnote",
  alias: ["dangnote", "note", "postmusicnote"],
  version: "1.0.0",
  role: 0,
  category: "Media",
  desc: "Tìm nhạc và đăng note (Messenger Notes) với nhạc",
  guide:
    "{pn} [từ khóa tìm kiếm]\n" +
    "{pn} list - Lấy danh sách nhạc phổ biến\n" +
    "Ví dụ:\n" +
    "• {pn} list\n" +
    "• {pn} Nắng Ấm Trong Tim\n\n" +
    "Sau khi bot gửi danh sách, reply số thứ tự + ' | ' + nội dung để đăng note\n" +
    "Ví dụ: 1 | ....",
  cd: 5,
  prefix: true,
  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { client, event, args, reply, main, commandName } = ctx;

    try {
      // Get context from client
      const clientCtx = client.ctx;
      if (!clientCtx) {
        await reply("❌ Không thể truy cập context. Vui lòng thử lại sau.");
        return;
      }

      // Check if MQTT is connected
      if (!clientCtx.mqttClient || !clientCtx.mqttClient.connected) {
        await reply("❌ MQTT client chưa kết nối. Vui lòng đợi bot kết nối lại.");
        return;
      }

      const mode = args[0]?.toLowerCase() || "";
      const isList = mode === "list" || mode === "danhsach" || mode === "ds";

      let result: { success: boolean; songs: Song[]; browseSessionId: string; searchText?: string };

      if (isList) {
        // Get popular songs list
        await reply("⏳ Đang lấy danh sách nhạc phổ biến...");
        result = await getSongList(clientCtx, { pageSize: 20 });
      } else {
        // Search songs
        const searchText = args.join(" ").trim();
        if (!searchText) {
          await reply(
            "📖 Cách dùng:\n" +
            "• {pn} list - Lấy danh sách nhạc phổ biến\n" +
            "• {pn} [từ khóa] - Tìm kiếm nhạc\n\n" +
            "Ví dụ: {pn} Nắng Ấm Trong Tim"
          );
          return;
        }

        await reply(`⏳ Đang tìm kiếm nhạc: "${searchText}"...`);
        result = await searchSong(clientCtx, searchText, { pageSize: 20 });
      }

      if (!result.songs || result.songs.length === 0) {
        await reply("❌ Không tìm thấy bài nhạc nào.");
        return;
      }

      // Format songs list
      const songs = result.songs.slice(0, 10); // Limit to 10 songs
      const lines = songs.map((song, index) => {
        const idx = index + 1;
        const title = song.title?.text || "Không có tên";
        const subtitle = song.subtitle?.text || "Không rõ";
        const duration = formatDuration(song.duration_ms);
        const audioId = String(song.audio_cluster_id || "");

        return `${idx}. ${title}\n   👤 ${subtitle} • ⏱️ ${duration}\n   🆔 ${audioId}`;
      });

      const header =
        "🎵 DANH SÁCH NHẠC\n" +
        (result.searchText ? `🔎 Từ khóa: ${result.searchText}\n` : "📌 Nhạc phổ biến\n") +
        `💭 Reply số (1-${songs.length}) + ' | ' + nội dung để đăng note\n` +
        "Ví dụ: 1 | ....\n\n";

      const messageBody = header + lines.join("\n\n");

      const sent = await reply(messageBody);
      const messageID = (sent as any)?.messageID;

      if (messageID && main.onReply) {
        main.onReply.set(messageID, {
          commandName,
          messageID: messageID,
          author: event.senderID,
          createdAt: Date.now(), // Thêm timestamp để cleanup
          type: "postnote-select",
          data: {
            songs: songs as unknown as Record<string, string | number | boolean | null | undefined>,
            browseSessionId: result.browseSessionId,
            searchText: result.searchText || null
          } as unknown as Record<string, string | number | boolean | null | undefined>
        });
      }
    } catch (err: any) {
      console.error("PostNote error:", err);
      await reply("❌ Lỗi: " + (err?.message || String(err)));
    }
  },

  onReply: async function (ctx: CommandOnReplyContext): Promise<void> {
    const { client, event, Reply, reply } = ctx;

    if (!Reply || Reply.type !== "postnote-select") {
      return;
    }

    if (String(Reply.author) !== String(event.senderID)) {
      await reply("❌ Bạn không phải người dùng lệnh này");
      return;
    }

    const replyData = Reply.data as {
      songs?: Song[];
      browseSessionId?: string;
      searchText?: string | null;
    };

    if (!replyData || !replyData.songs || !Array.isArray(replyData.songs)) {
      await reply("❌ Dữ liệu không hợp lệ. Vui lòng thử lại từ đầu.");
      return;
    }

    const body = (event.body || "").trim();
    if (!body) {
      await reply("⚠️ Vui lòng nhập số bài hát (vd: 1 hoặc 1 | nội dung).");
      return;
    }

    const parts = body.split("|", 2);
    const idxPart = parts[0]?.trim() || "";
    const noteText = (parts[1]?.trim() || "....").trim() || "....";

    const index = parseInt(idxPart, 10);
    if (!Number.isFinite(index) || index < 1 || index > replyData.songs.length) {
      await reply(`❌ Số không hợp lệ. Vui lòng chọn từ 1 đến ${replyData.songs.length}`);
      return;
    }

    const selectedSong = replyData.songs[index - 1];
    if (!selectedSong || !selectedSong.audio_cluster_id) {
      await reply("❌ Không tìm thấy bài nhạc được chọn.");
      return;
    }

    try {
      // Get context from client
      const clientCtx = client.ctx;
      if (!clientCtx) {
        await reply("❌ Không thể truy cập context. Vui lòng thử lại sau.");
        return;
      }

      // Check if MQTT is connected
      if (!clientCtx.mqttClient || !clientCtx.mqttClient.connected) {
        await reply("❌ MQTT client chưa kết nối. Vui lòng đợi bot kết nối lại.");
        return;
      }

      const audioClusterId = String(selectedSong.audio_cluster_id);
      const songTitle = selectedSong.title?.text || "Không có tên";
      const songArtist = selectedSong.subtitle?.text || "Không rõ";

      await reply(`⏳ Đang đăng note với nhạc: ${songTitle} - ${songArtist}...`);

      await postSongStory(
        clientCtx,
        audioClusterId,
        noteText,
        {
          browseSessionId: replyData.browseSessionId,
          isAudioFromSearch: !!replyData.searchText
        }
      );

      // Unsend the list message if possible
      if (Reply.messageID) {
        try {
          await client.unsendMessage(Reply.messageID);
        } catch {
          // Ignore if unsend fails
        }
      }

      // Remove from onReply
      if ((ctx as any).main?.onReply && Reply.messageID) {
        (ctx as any).main.onReply.delete(Reply.messageID);
      }

      await reply(
        `✅ Đã đăng note thành công!\n\n` +
        `🎵 ${songTitle}\n` +
        `👤 ${songArtist}\n` +
        `📝 Nội dung: ${noteText}\n` +
        `🆔 Audio ID: ${audioClusterId}`
      );
    } catch (err: any) {
      console.error("PostNote onReply error:", err);
      await reply("❌ Lỗi khi đăng note: " + (err?.message || String(err)));
    }
  }
};

export default postNoteCommand;
