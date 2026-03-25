import type {
  Command,
  CommandOnCallContext,
  CommandOnReplyContext,
  FacebookClient,
  MusicStickerItem,
  ReplyData,
} from "@types";

type ClientWithMusicSticker = FacebookClient & {
  getMusicStickers?: (
    searchText: string | null | undefined,
    pageSize?: number,
    endCursor?: string | null
  ) => Promise<MusicStickerItem[]>;
  sendMusicSticker?: (
    payload: {
      song_id: string;
      start_time?: string;
      song_title?: string;
      song_subtitle?: string;
      is_explicit?: boolean;
      messageReply?: string; // 👈 thêm vào payload
    },
    threadID: string | number
  ) => Promise<unknown>;
};

const REPLY_TYPE = "Sing2Search";

const sing2Command: Command = {
  name: "music",
  alias: ["music2", "musicsticker", "ms"],
  version: "1.0.0",
  role: 0,
  desc: "Gửi nhạc qua Music Sticker",
  guide: "{pn} [từ khóa]",
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, reply, client, main, commandName } = ctx;
    const { threadID, senderID } = event;
    const api = client as ClientWithMusicSticker;

    try {
      if (!args?.length) {
        await reply({ body: "❎ Vui lòng nhập từ khóa!" });
        return;
      }

      const key = args.join(" ").trim();

      if (typeof api.getMusicStickers !== "function") {
        await reply({ body: "❌ Chưa load Music Sticker!" });
        return;
      }

      const stickers = await api.getMusicStickers(key, 10);

      if (!stickers?.length) {
        await reply({ body: `❎ Không tìm thấy: "${key}"` });
        return;
      }

      const list = stickers.slice(0, 8);

      const msg = list
        .map((i, k) => {
          const durationMs =
            typeof i.duration_ms === "number"
              ? i.duration_ms
              : Number(i.duration_ms) || 0;

          const duration = durationMs
            ? `${Math.floor(durationMs / 1000)}s`
            : "N/A";

          return `${k + 1}. ${i.song_title}${
            i.song_subtitle ? ` - ${i.song_subtitle}` : ""
          }\n⏳ ${duration}`;
        })
        .join("\n\n");

      await reply(
        {
          body: `🎵 Kết quả:\n\n${msg}\n\n↩️ Reply số để chọn`,
        },
        (err: Error | null, info?: { messageID?: string }) => {
          if (err || !info?.messageID || !main?.onReply?.set) return;

          main.onReply.set(info.messageID, {
            type: REPLY_TYPE,
            commandName: commandName || "music",
            messageID: info.messageID,
            author: String(senderID),
            result: list,
          } as unknown as ReplyData);
        }
      );
    } catch (e: unknown) {
      console.error("[music]", e);
      const err = e instanceof Error ? e : new Error(String(e));
      await reply({ body: `❎ Lỗi: ${err.message}` });
    }
  },

  async onReply(ctx: CommandOnReplyContext): Promise<void> {
    const { client, event, reply, main, Reply } = ctx;
    const { threadID, senderID, body, messageID } = event;
    const api = client as ClientWithMusicSticker;

    try {
      if (!Reply || String(senderID) !== String(Reply.author)) return;
      if ((Reply as any).type !== REPLY_TYPE) return;

      const data = Reply as ReplyData & {
        result?: MusicStickerItem[];
        messageID?: string;
      };

      // xoá list kết quả
      if (data.messageID) {
        client.unsendMessage(String(data.messageID), threadID);
      }

      const idx = parseInt(String(body || "").trim(), 10) - 1;

      if (
        isNaN(idx) ||
        !data.result ||
        idx < 0 ||
        idx >= data.result.length
      ) {
        await reply({ body: "❎ Chọn số không hợp lệ!" });
        return;
      }

      const sticker = data.result[idx];

      if (!sticker?.song_id) {
        await reply({ body: "❎ Lỗi song_id!" });
        return;
      }

      if (typeof api.sendMusicSticker !== "function") {
        await reply({ body: "❌ Chưa load sendMusicSticker!" });
        return;
      }

      // ✅ gửi sticker và reply trực tiếp vào tin nhắn user
      await api.sendMusicSticker(
        {
          song_id: String(sticker.song_id),
          start_time: sticker.start_time || "1500",
          song_title: sticker.song_title,
          song_subtitle: sticker.song_subtitle,
          is_explicit: Boolean(sticker.is_explicit),
          messageReply: messageID, // 👈 chuẩn, không lỗi callback
        },
        threadID
      );

      if (data.messageID && main?.onReply?.delete) {
        main.onReply.delete(data.messageID);
      }
    } catch (e: unknown) {
      console.error("[music] onReply", e);
      const err = e instanceof Error ? e : new Error(String(e));
      await reply({ body: `❎ Lỗi: ${err.message}` });
    }
  },
};

export default sing2Command;