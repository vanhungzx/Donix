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
    },
    threadID: string | number
  ) => Promise<unknown>;
};

const REPLY_TYPE = "Sing2Search";

const sing2Command: Command = {
  name: "sing2",
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
        await reply({ body: "❎ Vui lòng nhập từ khóa tìm kiếm!" });
        return;
      }

      const key = args.join(" ").trim();

      if (typeof api.getMusicStickers !== "function") {
        await reply({
          body: "❌ Service Music Sticker chưa được load. Vui lòng kiểm tra lại!",
        });
        return;
      }

      let noteMessageID: string | undefined;
      try {
        const noteResult = (await reply({
          body: "🔍 Đang tìm kiếm music sticker...",
        })) as { messageID?: string } | undefined;
        if (noteResult?.messageID) {
          noteMessageID = String(noteResult.messageID);
        }
      } catch {
        /* ignore */
      }

      try {
        const stickers = await api.getMusicStickers(key, 10);

        if (!stickers?.length) {
          await reply({ body: `❎ Không tìm thấy bài hát nào cho "${key}"` });
          if (noteMessageID) {
            try {
              await client.unsendMessage(noteMessageID, threadID);
            } catch {
              /* ignore */
            }
          }
          return;
        }

        const list = stickers.slice(0, 8);
        const msg = list
          .map((i, k) => {
            const durationMs =
              typeof i.duration_ms === "number" ? i.duration_ms : Number(i.duration_ms) || 0;
            const duration = durationMs ? `${Math.floor(durationMs / 1000)}s` : "N/A";
            return `${k + 1}. ${i.song_title}${i.song_subtitle ? ` - ${i.song_subtitle}` : ""}\n⏳ ${duration}`;
          })
          .join("\n\n");

        await reply(
          {
            body: `🎵 Kết quả tìm kiếm:\n\n${msg}\n\n⩺ Reply số để gửi music sticker`,
          },
          (err: Error | null, info?: { messageID?: string }) => {
            if (err || !info?.messageID || !main?.onReply?.set) return;
            main.onReply.set(info.messageID, {
              type: REPLY_TYPE,
              commandName: commandName || "sing2",
              messageID: info.messageID,
              author: String(senderID),
              result: list,
            } as unknown as ReplyData);
          }
        );
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        await reply({ body: `❎ Lỗi: ${err.message || String(e)}` });
        if (noteMessageID) {
          try {
            await client.unsendMessage(noteMessageID, threadID);
          } catch {
            /* ignore */
          }
        }
      }

      if (noteMessageID) {
        try {
          await client.unsendMessage(noteMessageID, threadID);
        } catch {
          /* ignore */
        }
      }
    } catch (e: unknown) {
      console.error("[sing2]", e);
      const err = e instanceof Error ? e : new Error(String(e));
      await reply({ body: `❎ Lỗi: ${err.message || String(e)}` });
    }
  },

  async onReply(ctx: CommandOnReplyContext): Promise<void> {
    const { client, event, reply, main, Reply } = ctx;
    const { threadID, senderID, body } = event;
    const api = client as ClientWithMusicSticker;

    try {
      if (!Reply || String(senderID) !== String(Reply.author)) return;
      if ((Reply as ReplyData & { type?: string }).type !== REPLY_TYPE) return;

      const replyData = Reply as ReplyData & {
        type?: string;
        messageID?: string;
        author?: string;
        result?: MusicStickerItem[];
      };

      if (replyData.messageID) {
        client.unsendMessage(String(replyData.messageID), threadID);
      }

      const idx = parseInt(String(body || "").trim(), 10) - 1;
      const result = replyData.result;
      if (
        isNaN(idx) ||
        idx < 0 ||
        !result ||
        !Array.isArray(result) ||
        idx >= result.length
      ) {
        await reply({ body: "❎ Vui lòng chọn số hợp lệ!" });
        return;
      }

      const sticker = result[idx];
      if (!sticker?.song_id) {
        await reply({ body: "❎ Không tìm thấy song_id!" });
        return;
      }

      if (typeof api.sendMusicSticker !== "function") {
        await reply({
          body: "❌ Service sendMusicSticker chưa được load. Vui lòng kiểm tra lại!",
        });
        return;
      }

      let noticeMessageID: string | undefined;
      try {
        const noticeResult = (await reply({
          body: `🎵 Đang gửi music sticker: "${sticker.song_title}"...`,
        })) as { messageID?: string } | undefined;
        if (noticeResult?.messageID) {
          noticeMessageID = String(noticeResult.messageID);
        }
      } catch {
        /* ignore */
      }

      try {
        if (!threadID) {
          await reply({ body: "❎ Không tìm thấy threadID!" });
          return;
        }

        await api.sendMusicSticker(
          {
            song_id: String(sticker.song_id),
            start_time: sticker.start_time || "1500",
            song_title: sticker.song_title,
            song_subtitle: sticker.song_subtitle,
            is_explicit: Boolean(sticker.is_explicit),
          },
          threadID
        );

        if (noticeMessageID) {
          try {
            await client.unsendMessage(noticeMessageID, threadID);
          } catch {
            /* ignore */
          }
        }
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        await reply({ body: `❎ Lỗi: ${err.message || String(e)}` });
        if (noticeMessageID) {
          try {
            await client.unsendMessage(noticeMessageID, threadID);
          } catch {
            /* ignore */
          }
        }
      }

      if (replyData.messageID && main?.onReply?.delete) {
        try {
          main.onReply.delete(replyData.messageID);
        } catch {
          /* ignore */
        }
      }
    } catch (e: unknown) {
      console.error("[sing2] onReply", e);
      const err = e instanceof Error ? e : new Error(String(e));
      await reply({ body: `❎ Lỗi: ${err.message || String(e)}` });
    }
  },
};

export default sing2Command;
