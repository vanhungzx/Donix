import type { Command, CommandOnCallContext, CommandOnReplyContext, MessageForm, ReplyData } from '@types';
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { pipeline } from "stream";
import { promisify } from "util";
import { TEMP_DIR } from "../../../core/storagePath";

const streamPipeline = promisify(pipeline);

const TempRoot = TEMP_DIR();

if (!fs.existsSync(TempRoot)) {
  fs.mkdirSync(TempRoot, { recursive: true });
}



interface StreamsMap {
  [key: string]: {
    stream: string | null;
    download: string | null;
    onlyVIP: boolean;
    status: number;
  };
}

interface SongItem {
  key?: string | null;
  title?: string | null;
  artists?: string[] | string;
  duration?: number;
  streams?: StreamsMap;
  best?: {
    type?: string;
    url?: string;
  };
}

interface SearchState {
  list: SongItem[];
  time: number;
}

const lastSearch: Map<string, SearchState> = new Map();

function mmss(s: number | string | undefined): string {
  const seconds = Math.max(0, Number(s) || 0);
  const m = Math.floor(seconds / 60);
  const ss = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${m}:${ss}`;
}

function qualitiesOf(x: SongItem): string[] {
  const q: string[] = [];
  if (x?.streams?.["128"]) q.push("128");
  if (x?.streams?.["320"]) q.push("320");
  if (x?.streams?.lossless) q.push("lossless");
  return q;
}

function pickFromStreams(streams: StreamsMap | undefined, prefer?: string): { type: string; url: string | null } | null {
  const order: string[] = [];
  if (prefer) order.push(prefer);
  order.push("320", "128", "lossless");

  for (const t of order) {
    const v = streams?.[t];
    if (v && v.status === 1 && !v.onlyVIP) {
      return { type: t, url: v.download || v.stream || null };
    }
  }
  return null;
}

function pickFromItem(item: SongItem, prefer?: string): { type: string; url: string | null } | null {
  if (!item) return null;

  if (item.streams) {
    const p = pickFromStreams(item.streams, prefer || "320");
    if (p) return p;
  }

  if (item.best?.url) {
    return { type: item.best.type || "320", url: item.best.url };
  }

  return null;
}

function pickFromDetail(detail: SongItem, prefer?: string): { type: string; url: string | null } | null {
  if (!detail) return null;
  return pickFromStreams(detail.streams, prefer || "320");
}

async function downloadToTemp(url: string, filename: string): Promise<string> {
  const file = path.join(TempRoot, filename);
  const res = await axios.get(url, {
    responseType: "stream",
    timeout: 60000,
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 400,
  });
  await streamPipeline(res.data, fs.createWriteStream(file));
  return file;
}

function safeName(title: string | null | undefined, artists: string[] | string | null | undefined): string {
  const titleStr = title || "nct";
  const artistsStr = Array.isArray(artists) ? artists.join(", ") : artists || "";
  return `${titleStr}-${artistsStr}`.replace(/[^\w\s\-().,]+/g, "_");
}

const nctCommand: Command = {
  name: "nct",
  alias: ["nhaccuatui"],
  version: "1.2.0",
  role: 0,
  desc: "Tìm và tải nhạc từ NhacCuaTui",
  guide: "{pn} <từ khóa>\nTrả lời số để tải",
  cd: 10,
  prefix: true,
  async onLoad() { },

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { api, args, event, reply, main } = ctx;
    const threadID = event.threadID;
    const author = event.senderID;

    if (!args.length) {
      await reply({ body: "Nhập từ khóa để tìm bài hát." });
      return;
    }

    const q = args.join(" ");

    if (!api?.nct?.search) {
      await reply({ body: "Service NCT chưa được load. Vui lòng kiểm tra lại!" });
      return;
    }

    try {
      const res = await (api.nct?.search as ((q: string, correct: boolean) => Promise<SongItem[]>) | undefined)?.(q, false);
      if (!res) {
        await reply({ body: "Service NCT chưa được load. Vui lòng kiểm tra lại!" });
        return;
      }

      if (!res || !res.length) {
        await reply({ body: "Không tìm thấy bài hát phù hợp." });
        return;
      }

      const top = res.slice(0, 7);
      const lines = top.map((s, i) => {
        const qs = qualitiesOf(s);
        const artist = Array.isArray(s.artists) ? s.artists.join(", ") : s.artists || "";
        return `${i + 1}. ${s.title} — ${artist} • ${mmss(s.duration)} • [${qs.join("/") || "N/A"}]`;
      });

      const info = await reply({
        body: `Kết quả cho: ${q}\n${lines.join("\n")}\n\nTrả lời số để tải`,
      });

      lastSearch.set(threadID, { list: top, time: Date.now() });

      if (info && typeof info === 'object' && 'messageID' in info) {
        main.onReply.set((info as { messageID: string }).messageID, {
          commandName: nctCommand.name,
          author,
          messageID: (info as { messageID: string }).messageID,
          data: { type: "pick", threadID },
        });
      }
    } catch (error: any) {
      await reply({
        body: `❌ Lỗi khi tìm kiếm: ${error?.message || "Đã xảy ra lỗi không xác định"}`,
      });
    }
  },

  async onReply(ctx: CommandOnReplyContext) {
    const { api, event, Reply, main, client, reply } = ctx;
    const threadID = event.threadID;
    const replyData = Reply as ReplyData;

    if (replyData.author !== event.senderID) return;

    const body = (event.body || "").trim();
    const state = lastSearch.get(threadID);

    if (!state || !state.list) {
      await client.unsendMessage(replyData.messageID, threadID);
      main.onReply.delete(replyData.messageID);
      await reply({ body: "Hết phiên chọn. Vui lòng tìm lại." });
      return;
    }

    if (!/^\d+$/.test(body)) {
      await client.unsendMessage(replyData.messageID, threadID);
      main.onReply.delete(replyData.messageID);
      await reply({ body: "Vui lòng nhập chỉ số hợp lệ." });
      return;
    }

    const i = Number(body) - 1;
    const item = state.list[i];

    if (!item) {
      await client.unsendMessage(replyData.messageID, threadID);
      main.onReply.delete(replyData.messageID);
      await reply({ body: "Không có mục theo chỉ số này." });
      return;
    }

    try {
      let pick = pickFromItem(item, "320");
      let meta: SongItem = item;

      if (!pick) {
        const downFn = api?.nct?.down as ((key: string) => Promise<SongItem>) | undefined;
        if (!downFn) {
          await client.unsendMessage(replyData.messageID, threadID);
          main.onReply.delete(replyData.messageID);
          await reply({ body: "Service NCT chưa được load. Vui lòng kiểm tra lại!" });
          return;
        }

        const detail = await downFn(item.key || "");
        pick = pickFromDetail(detail, "320");
        meta = detail;
      }

      if (!pick || !pick.url) {
        await client.unsendMessage(replyData.messageID, threadID);
        main.onReply.delete(replyData.messageID);
        await reply({ body: "Không lấy được link tải hợp lệ." });
        return;
      }

      const ext = pick.type === "lossless" ? "flac" : "mp3";
      const artists = Array.isArray(meta.artists) ? meta.artists : meta.artists ? [meta.artists] : [];
      const temp = await downloadToTemp(pick.url, `${safeName(meta.title, artists)}.${ext}`);

      const messageBody = {
        body: `🎵 ${meta.title || "N/A"}\n👤 ${Array.isArray(meta.artists) ? meta.artists.join(", ") : meta.artists || "N/A"}\n⏱️ ${mmss(meta.duration)}\n📦 ${pick.type}`,
        attachment: fs.createReadStream(temp),
      };

      if (event.messageID) {
        await (client.sendMessage as (form: MessageForm, threadID: string, messageID: string) => Promise<unknown>)(messageBody, threadID, event.messageID);
      } else {
        await client.sendMessage(messageBody, threadID);
      }

      fs.unlink(temp, () => { });
      await client.unsendMessage(replyData.messageID, threadID);
      main.onReply.delete(replyData.messageID);
    } catch (error: any) {
      await client.unsendMessage(replyData.messageID, threadID);
      main.onReply.delete(replyData.messageID);
      await reply(`❌ Lỗi khi tải nhạc: ${error?.message || "Đã xảy ra lỗi không xác định"}`);
    }
  },
};

export default nctCommand;
