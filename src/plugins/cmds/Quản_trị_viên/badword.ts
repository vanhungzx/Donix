"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnChatContext,
  CommandOnReplyContext,
} from "@types";

interface BadwordsData {
  words: string[];
  violationUsers: Record<string, number>;
}

interface ThreadDataWithBadwords {
  data?: {
    badwords?: BadwordsData;
  };
  settings?: {
    badwords?: boolean;
  };
}


interface SelectionResult {
  all: boolean;
  indexes: Set<number>;
}

function hideWord(s: string): string {
  if (!s) return s;
  return s.length === 2
    ? s[0] + "*"
    : s[0] + "*".repeat(Math.max(0, s.length - 2)) + s.slice(-1);
}

async function tryKick(client: any, threadID: string, userID: string): Promise<boolean> {
  try {
    const removeUser = client.removeUserFromGroup as ((userID: string, threadID: string) => Promise<void>) | undefined;
    if (removeUser) {
      await removeUser(userID, threadID);
      return true;
    }
  } catch {
    
  }
  return false;
}

async function isProtected({
  client,
  event,
  threadData,
  config,
}: {
  client: any;
  event: any;
  threadData: any;
  config: any;
}): Promise<boolean> {
  const id = String(event.senderID);

  const botID = String(client.getCurrentUserID());

  const info = (await threadData.get(event.threadID))?.threadInfo || {};
  const adminIDs = Array.isArray(info.adminIDs)
    ? info.adminIDs.map((u: any) => String(u.id || u))
    : [];

  const owners = Array.isArray(config?.OWNER)
    ? config.OWNER.map(String)
    : config?.OWNER
      ? [String(config.OWNER)]
      : [];

  const admins = Array.isArray(config?.ADMIN)
    ? config.ADMIN.map(String)
    : config?.ADMIN
      ? [String(config.ADMIN)]
      : [];

  return (
    id === botID ||
    owners.includes(id) ||
    admins.includes(id) ||
    adminIDs.includes(id) ||
    false
  );
}

function parseSelection(text: string, max: number): SelectionResult {
  const s = text.trim().toLowerCase();

  if (!s) {
    return { all: false, indexes: new Set() };
  }

  if (s === "all") {
    return { all: true, indexes: new Set() };
  }

  const tokens = s.split(/[\s,]+/).filter(Boolean);
  const idx = new Set<number>();

  for (const t of tokens) {
    if (/^\d+$/.test(t)) {
      const n = parseInt(t, 10);
      if (n >= 1 && n <= max) {
        idx.add(n - 1);
      }
      continue;
    }

    if (/^\d+-\d+$/.test(t)) {
      const parts = t.split("-");
      const a = parseInt(parts[0] ?? "", 10);
      const b = parseInt(parts[1] ?? "", 10);
      if (!Number.isNaN(a) && !Number.isNaN(b) && a >= 1 && b >= 1 && a <= max && b <= max) {
        const from = Math.min(a, b);
        const to = Math.max(a, b);
        for (let i = from; i <= to; i++) {
          idx.add(i - 1);
        }
      }
    }
  }

  return { all: false, indexes: idx };
}

const badwordsCommand: Command = {
  name: "badwords",
  alias: ["badword"],
  version: "1.4.6",
  role: 1,
  desc: "Bật/tắt/thêm/xóa cảnh báo từ cấm, vi phạm 3 lần sẽ bị kick",
  guide: `1. Thêm từ cấm:

   {pn} add <từ1,từ2|...>

   VD: {pn} add cc,dm,đcm



2. Xóa từ cấm:

   {pn} delete <từ1,từ2|...>

   VD: {pn} delete cc,dm



3. Xem danh sách từ cấm:

   {pn} list [hide]

   - Thêm hide để ẩn các từ cấm

   - Reply số thứ tự hoặc khoảng (vd: 1 3 5-7) để xóa

   - Reply "all" để xóa tất cả



4. Bật/tắt tính năng:

   {pn} on - Bật chế độ kiểm duyệt

   {pn} off - Tắt chế độ kiểm duyệt



5. Gỡ cảnh báo:

   {pn} unwarn [@tag/reply/userID]

   - Tag người dùng hoặc

   - Reply tin nhắn hoặc

   - Nhập ID người dùng



Lưu ý: Vi phạm 3 lần sẽ bị kick khỏi nhóm`,
  cd: 5,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { event, args, reply, threadData, main, commandName } = ctx;

    const t = (await threadData.get(event.threadID)) as ThreadDataWithBadwords | null;
    const thread = t || {};

    if (!thread.data) {
      thread.data = {};
    }
    if (!thread.settings) {
      thread.settings = {};
    }
    if (!thread.data.badwords) {
      thread.data.badwords = { words: [], violationUsers: {} };
    }
    if (typeof thread.settings.badwords !== "boolean") {
      thread.settings.badwords = false;
    }

    const sub = String(args[0] || "").toLowerCase();

    if (sub === "add") {
      const list = String(args.slice(1).join(" "))
        .split(/[,|]/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (!list.length) {
        await reply("⚠️ | Bạn chưa nhập từ cần cấm");
        return;
      }

      const existed: string[] = [];
      const failed: string[] = [];
      const added: string[] = [];

      for (const w of list) {
        if (w.length < 2) {
          failed.push(w);
          continue;
        }
        if (!thread.data.badwords!.words.includes(w)) {
          thread.data.badwords!.words.push(w);
          added.push(w);
        } else {
          existed.push(w);
        }
      }

      await threadData.update(event.threadID, thread);

      const a = added.length
        ? `✅ | Đã thêm ${added.length} từ cấm vào danh sách`
        : "";
      const b = existed.length
        ? `\n❌ | ${existed.length} từ đã tồn tại: ${existed.map(hideWord).join(", ")}`
        : "";
      const c = failed.length
        ? `\n⚠️ | ${failed.length} từ quá ngắn: ${failed.join(", ")}`
        : "";
      const note = thread.settings.badwords
        ? ""
        : `\nℹ️ | Tính năng hiện đang tắt. Vui lòng dùng: badwords on để bật.`;

      await reply(a + b + c + note);
      return;
    }

    if (sub === "delete" || sub === "del" || sub === "-d") {
      const list = String(args.slice(1).join(" "))
        .split(/[,|]/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (!list.length) {
        await reply("⚠️ | Bạn chưa nhập từ cần xóa");
        return;
      }

      const ok: string[] = [];
      const miss: string[] = [];

      for (const w of list) {
        const i = thread.data.badwords!.words.indexOf(w);
        if (i > -1) {
          thread.data.badwords!.words.splice(i, 1);
          ok.push(w);
        } else {
          miss.push(w);
        }
      }

      await threadData.update(event.threadID, thread);

      const a = ok.length
        ? `✅ | Đã xóa ${ok.length} từ cấm khỏi danh sách`
        : "";
      const b = miss.length
        ? `\n❌ | ${miss.length} từ không tồn tại: ${miss.join(", ")}`
        : "";

      await reply(a + b);
      return;
    }

    if (sub === "list" || sub === "all" || sub === "-a") {
      const words = thread.data.badwords!.words || [];

      if (!words.length) {
        await reply("⚠️ | Danh sách từ cấm trống");
        return;
      }

      const hide = String(args[1] || "").toLowerCase() === "hide";

      const lines = words
        .map((w, i) => `${i + 1}. ${hide ? hideWord(w) : w}`)
        .join("\n");

      const msg = `📑 | Danh sách từ cấm (${words.length})\n${lines}\n\n↩️ Trả lời số thứ tự hoặc khoảng (vd: 1 3 5-7) để xóa\n↩️ Trả lời "all" để xóa tất cả`;

      await reply(msg, (err: any, info: any) => {
        if (!err && info?.messageID) {
          main.onReply.set(info.messageID, {
            commandName,
            author: event.senderID,
            messageID: info.messageID,
            data: { type: "delete_list", hide },
          } as any);
        }
      });
      return;
    }

    if (sub === "on") {
      thread.settings.badwords = true;
      await threadData.update(event.threadID, thread);
      await reply("✅ | Đã bật cảnh báo từ cấm");
      return;
    }

    if (sub === "off") {
      thread.settings.badwords = false;
      await threadData.update(event.threadID, thread);
      await reply("✅ | Đã tắt cảnh báo từ cấm");
      return;
    }

    if (sub === "unwarn") {
      let uid: string | null = null;

      if (event.messageReply) {
        uid = String(event.messageReply.senderID);
      } else if (event.mentions && Object.keys(event.mentions).length) {
        uid = Object.keys(event.mentions)[0] ?? null;
      } else if (args[1]) {
        uid = String(args[1]);
      }

      if (!uid) {
        await reply("⚠️ | Bạn chưa nhập ID hoặc tag người dùng");
        return;
      }

      const v = thread.data.badwords!.violationUsers || {};

      if (!v[uid]) {
        await reply(`⚠️ | Người dùng ${uid} chưa bị cảnh báo`);
        return;
      }

      v[uid] = Math.max(0, (v[uid] || 0) - 1);

      if (v[uid] === 0) {
        delete v[uid];
      }

      thread.data.badwords!.violationUsers = v;

      await threadData.update(event.threadID, thread);

      await reply(`✅ | Đã xóa 1 lần cảnh báo của người dùng ${uid}`);
      return;
    }

    await reply("Dùng: add|delete|list|on|off|unwarn");
    return;
  },

  onReply: async (ctx: CommandOnReplyContext): Promise<void> => {
    const { event, Reply, main, threadData, reply, unsend } = ctx;

    const replyData = Reply as any;
    if (replyData.author !== event.senderID) {
      return;
    }
    if (replyData.data?.type !== "delete_list") {
      return;
    }

    const t = (await threadData.get(event.threadID)) as ThreadDataWithBadwords | null;
    const words = t?.data?.badwords?.words || [];

    if (!words.length) {
      if (unsend) {
        await unsend(replyData.messageID);
      }
      main.onReply.delete(replyData.messageID);
      await reply("⚠️ | Danh sách từ cấm trống");
      return;
    }

    const sel = parseSelection(String(event.body || ""), words.length);

    if (!sel.all && sel.indexes.size === 0) {
      if (unsend) {
        await unsend(replyData.messageID);
      }
      main.onReply.delete(replyData.messageID);
      await reply("⚠️ | Không có mục hợp lệ");
      return;
    }

    let removed: string[] = [];

    if (sel.all) {
      removed = [...words];
      if (t) {
        if (!t.data) t.data = {};
        if (!t.data.badwords) t.data.badwords = { words: [], violationUsers: {} };
        t.data.badwords.words = [];
      }
    } else {
      const idxs = [...sel.indexes].sort((a, b) => b - a);
      for (const i of idxs) {
        const w = words[i];
        if (typeof w === "string") {
          removed.push(w);
        }
      }
      const keep = words.filter((_, i) => !sel.indexes.has(i));
      if (t) {
        if (!t.data) t.data = {};
        if (!t.data.badwords) t.data.badwords = { words: [], violationUsers: {} };
        t.data.badwords.words = keep;
      }
    }

    await threadData.update(event.threadID, t || {});

    if (unsend) {
      await unsend(replyData.messageID);
    }
    main.onReply.delete(replyData.messageID);

    const show = replyData.data.hide
      ? removed.map(hideWord).join(", ")
      : removed.join(", ");

    await reply(`✅ | Đã xóa ${removed.length} từ\n${show || ""}`);
    return;
  },

  onChat: async (ctx: CommandOnChatContext): Promise<void> => {
    const { client, event, threadData, config } = ctx;

    if (!event.body) {
      return;
    }

    const t = (await threadData.get(event.threadID)) as ThreadDataWithBadwords | null;
    const enabled = t?.settings?.badwords === true;
    const words = t?.data?.badwords?.words || [];

    if (!enabled || !words.length) {
      return;
    }

    if (await isProtected({ client, event, threadData, config })) {
      return;
    }

    const firstToken = String(event.body).trim().split(/\s+/)[0] ?? "";
    const first = firstToken.toLowerCase();

    if (["badwords", "badword"].some((n) => first.endsWith(n))) {
      return;
    }

    const thread = t || {};
    if (!thread.data) {
      thread.data = {};
    }
    if (!thread.data.badwords) {
      thread.data.badwords = { words: [], violationUsers: {} };
    }

    const v = thread.data.badwords.violationUsers || {};

    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const boundary = (s: string) =>
      new RegExp(`(^|[^\\p{L}\\p{N}_])${esc(s)}([^\\p{L}\\p{N}_]|$)`, "iu");

    for (const w of words) {
      if (boundary(w).test(event.body)) {
        const prev = Number(v[event.senderID] || 0);
        const next = prev + 1;

        v[event.senderID] = next;
        thread.data.badwords.violationUsers = v;

        await threadData.update(event.threadID, thread);

        if (next >= 3) {
          const kicked = await tryKick(client, event.threadID, event.senderID);

          if (!kicked) {
            await client.sendMessage(
              "⚠️ | Bot cần quyền quản trị viên để kick thành viên vi phạm.",
              event.threadID,
              event.messageID
            );
          } else {
            await client.sendMessage(
              `⚠️ | Từ cấm "${w}" đã được phát hiện lần thứ 3. Thành viên đã bị kick.`,
              event.threadID
            );
          }
        } else {
          await client.sendMessage(
            `⚠️ | Từ cấm "${w}" đã được phát hiện trong tin nhắn của bạn (${next}/3). Tiếp tục vi phạm sẽ bị kick khỏi nhóm.`,
            event.threadID,
            event.messageID
          );
        }

        return;
      }
    }
  },
};

export default badwordsCommand;
