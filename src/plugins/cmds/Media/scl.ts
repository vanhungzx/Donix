import type { Command, CommandOnCallContext, CommandOnReplyContext, ReplyData } from "@types";
import type { SearchResultItem, DownloadResult } from "../../../services/soundcloud";

interface SoundCloudService {
  search?: (keywords: string, limit?: number) => Promise<SearchResultItem[]>;
  down?: (link: string) => Promise<DownloadResult>;
}

const MAX_RESULTS = 7;
const MAX_SECONDS = 15 * 60;

function toSec(s: unknown): number {
  if (!s) return 0;
  const parts = String(s)
    .split(":")
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => !Number.isNaN(n));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

const command: Command = {
  name: "scl",
  alias: ["soundcloud", "scl"],
  version: "2.0.3",
  role: 0,
  desc: "Tìm kiếm nhạc trên SoundCloud",
  guide:
    "{pn} <từ khóa>\n\nVí dụ:\n{pn} sơn tùng mtp\n{pn} alan walker\n\n⩺ Reply số để tải (chỉ bài < 15 phút)",
  cd: 5,
  prefix: true,

  onCall: async ({ event, args, reply, api, main, commandName }: CommandOnCallContext): Promise<void> => {
    const { threadID, senderID, messageID } = event || {};
    if (!threadID || !senderID) return;

    const query = (args || []).join(" ").trim();
    if (!query) {
      await reply("⚠️ Vui lòng nhập từ khóa tìm kiếm");
      return;
    }

    const sc = (api as { soundcloud?: SoundCloudService })?.soundcloud;
    if (!sc?.search) {
      await reply("❌ Service SoundCloud chưa được load. Vui lòng kiểm tra lại!");
      return;
    }

    try {
      const data = await sc.search(query, 20);
      if (!Array.isArray(data) || data.length === 0) {
        await reply("Không tìm thấy kết quả liên quan");
        return;
      }

      const list = data
        .filter((it: SearchResultItem) => {
          const d = toSec(it?.duration);
          return d > 0 && d < MAX_SECONDS;
        })
        .slice(0, MAX_RESULTS);

      if (!list.length) {
        await reply("Không có bài nào dưới 15 phút");
        return;
      }

      const rows = list
        .map((it: SearchResultItem, i: number) => {
          const author = it?.author?.full_name || it?.author?.username || "Unknown";
          const dur = it?.duration || "N/A";
          return `${i + 1}. ${it?.title || "Untitled"}\n⏳ ${dur} - 👤 ${author}`;
        })
        .join("\n\n");

      await reply(`📝 Kết quả: ${query}\n\n${rows}\n\n⩺ Reply số để chọn bài hát`, (err: Error | null, info?: { messageID?: string }) => {
        if (err || !info?.messageID) return;
        if (!main?.onReply?.set) return;
        main.onReply.set(info.messageID, {
          commandName: commandName || "scl",
          messageID: info.messageID,
          author: String(senderID),
          type: "scl-select",
          result: list,
          originMessageID: messageID,
        } as unknown as ReplyData);
      });
    } catch (e: unknown) {
      console.error("[scl] search error:", e instanceof Error ? e.message : e);
      await reply("❎ Đã xảy ra lỗi trong quá trình tìm kiếm");
    }
  },

  onReply: async ({ event, reply, Reply, main, api, utils, unsend }: CommandOnReplyContext): Promise<void> => {
    const { threadID, senderID, body } = event || {};
    if (!threadID || !Reply) return;
    if (String(senderID) !== String(Reply.author)) return;
    if (Reply.type !== "scl-select") return;
      unsend(String(Reply.messageID));
    const choose = Number.parseInt(String(body || "").trim(), 10) - 1;
    const list = Reply.result;
    if (!Array.isArray(list) || Number.isNaN(choose) || choose < 0 || choose >= list.length) {
      await reply("❎ Vui lòng nhập số hợp lệ trong danh sách");
      return;
    }

    const chosenItem = list[choose];
    const sc = (api as { soundcloud?: SoundCloudService })?.soundcloud;
    if (!sc?.down) {
      try {
        if (Reply.messageID) main?.onReply?.delete?.(Reply.messageID);
      } catch { }
      await reply("❌ Service SoundCloud chưa được load. Vui lòng kiểm tra lại!");
      return;
    }

    if (!utils?.stream) {
      await reply("❌ Utils.stream không tồn tại");
      return;
    }

    try {
      const trackInfo = await sc.down(chosenItem?.url);
      const attachments = Array.isArray(trackInfo?.attachments) ? trackInfo.attachments : [];
      const audio = attachments.find((a) => String(a?.type || "").toLowerCase() === "audio");

      if (!audio?.url) {
        await reply("❎ Không tìm thấy tệp âm thanh để tải xuống");
        return;
      }

      const bodyFormat =
        `⩺ Tiêu đề: ${trackInfo?.title || chosenItem?.title || "Unknown"}\n` +
        `⩺ Tác giả: ${trackInfo?.author || chosenItem?.author?.full_name || chosenItem?.author?.username || "Unknown"}\n` +
        `⩺ Thời lượng: ${trackInfo?.duration || chosenItem?.duration || "N/A"}`;

      const stream = await (utils as { stream: (url: string, ext: string) => Promise<unknown> }).stream(audio.url, "mp3");
      await reply({
        body: bodyFormat,
        attachment: {
          stream,
          filename: "audio.mp3",
          contentType: "audio/mpeg",
        },
      });
    } catch (e: unknown) {
      console.error("[scl] down error:", e instanceof Error ? e.message : e);
      await reply("❎ Đã xảy ra lỗi trong quá trình tải nhạc");
    } finally {
      try {
        if (Reply.messageID) main?.onReply?.delete?.(Reply.messageID);
      } catch { }
    }
  },
};

export default command;

