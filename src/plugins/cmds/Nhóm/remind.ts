"use strict";

import type { Command, CommandOnCallContext, CommandOnLoadContext, CommandOnReplyContext } from "@types";

interface Reminder {
  id: string;
  threadID: string;
  userID: string;
  text: string;
  timeMs: number;
  repeat: "none" | "daily" | "weekly";
  mentionTag?: string;
  paused?: boolean;
}

interface ThreadDataWithReminders {
  reminders?: Reminder[];
  [key: string]: any;
}

const timers = new Map<string, NodeJS.Timeout>();

let clientRef: any = null;

const tz = 7 * 60; 

const nowInTz = (): Date => {
  const n = new Date();
  const utc = n.getTime() + n.getTimezoneOffset() * 60000;
  return new Date(utc + tz * 60000);
};

const buildEpochTz = (y: number, m: number, d: number, hh: number, mm: number): number => {
  return Date.UTC(y, m - 1, d, hh - tz / 60, mm);
};

function clearTimer(threadID: string, id: string): void {
  const key = `${threadID}:${id}`;
  const t = timers.get(key);
  if (t) {
    try {
      clearTimeout(t);
    } catch {
      
    }
  }
  timers.delete(key);
}

async function schedule(rem: Reminder, threadData: any): Promise<void> {
  const key = `${rem.threadID}:${rem.id}`;

  const persist = async (updated: Partial<Reminder>): Promise<void> => {
    const td = ((await threadData.get(rem.threadID))?.data || {}) as ThreadDataWithReminders;
    td.reminders = Array.isArray(td.reminders)
      ? td.reminders.map((r) => (r.id === rem.id ? { ...r, ...updated } : r))
      : [{ ...rem, ...updated }];
    await threadData.update(rem.threadID, { data: td });
  };

  const remove = async (): Promise<void> => {
    const td = ((await threadData.get(rem.threadID))?.data || {}) as ThreadDataWithReminders;
    td.reminders = Array.isArray(td.reminders) ? td.reminders.filter((x) => x.id !== rem.id) : [];
    await threadData.update(rem.threadID, { data: td });
    clearTimer(rem.threadID, rem.id);
  };

  const run = async (): Promise<void> => {
    try {
      const body = `🔔 Nhắc nhở: ${rem.text}\n⏰ ${new Date(rem.timeMs).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}${rem.repeat !== "none" ? ` • ${rem.repeat}` : ""}`;
      await clientRef.sendMessage(
        {
          body,
          mentions: [{ id: rem.userID, tag: rem.mentionTag || "bạn" }] as any,
        },
        rem.threadID
      );
    } catch {
      
    }

    if (rem.repeat === "daily") {
      rem.timeMs = rem.timeMs + 24 * 3600000;
      await persist({ timeMs: rem.timeMs });
      const t = setTimeout(run, Math.max(1000, rem.timeMs - Date.now()));
      timers.set(key, t);
    } else if (rem.repeat === "weekly") {
      rem.timeMs = rem.timeMs + 7 * 24 * 3600000;
      await persist({ timeMs: rem.timeMs });
      const t = setTimeout(run, Math.max(1000, rem.timeMs - Date.now()));
      timers.set(key, t);
    } else {
      await remove();
    }
  };

  
  if (rem.paused) {
    return;
  }

  const delta = rem.timeMs - Date.now();

  if (delta <= 0) {
    if (rem.repeat === "daily") {
      const steps = Math.ceil((Date.now() - rem.timeMs) / (24 * 3600000));
      rem.timeMs = rem.timeMs + steps * 24 * 3600000;
      await persist({ timeMs: rem.timeMs });
    } else if (rem.repeat === "weekly") {
      const steps = Math.ceil((Date.now() - rem.timeMs) / (7 * 24 * 3600000));
      rem.timeMs = rem.timeMs + steps * 7 * 24 * 3600000;
      await persist({ timeMs: rem.timeMs });
    } else {
      return remove();
    }
  }

  clearTimer(rem.threadID, rem.id);
  const t = setTimeout(run, Math.max(1000, rem.timeMs - Date.now()));
  timers.set(key, t);
}

function parseWhenOnly(raw: string): number | null {
  const text = raw.trim();
  const lc = text.toLowerCase();

  const mIn = lc.match(/^in\s+(\d+)\s*(m|ph|phút|h|giờ|d|ngày)$/i);
  if (mIn && mIn[1] && mIn[2]) {
    const num = parseInt(mIn[1], 10);
    const unit = mIn[2];
    let ms = 0;
    if (unit.startsWith("m") || unit.startsWith("ph")) {
      ms = num * 60000;
    } else if (unit.startsWith("h") || unit.startsWith("gi")) {
      ms = num * 3600000;
    } else {
      ms = num * 24 * 3600000;
    }
    return Date.now() + ms;
  }

  const md1 = lc.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s+(\d{1,2}):(\d{2})$/i);
  if (md1 && md1[1] && md1[2] && md1[4] && md1[5]) {
    const d = parseInt(md1[1], 10);
    const mo = parseInt(md1[2], 10);
    const y = md1[3] ? parseInt(md1[3], 10) : nowInTz().getUTCFullYear();
    const hh = parseInt(md1[4], 10);
    const mm = parseInt(md1[5], 10);

    
    if (d < 1 || d > 31 || mo < 1 || mo > 12 || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      return null;
    }

    let t = buildEpochTz(y, mo, d, hh, mm);
    if (!md1[3] && t <= Date.now()) {
      t = buildEpochTz(y + 1, mo, d, hh, mm);
    }
    return t;
  }

  const mt = lc.match(/^(\d{1,2}):(\d{2})$/i);
  if (mt && mt[1] && mt[2]) {
    const hh = parseInt(mt[1], 10);
    const mm = parseInt(mt[2], 10);

    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      return null;
    }

    const nowT = nowInTz();
    const y = nowT.getUTCFullYear();
    const m = nowT.getUTCMonth() + 1;
    const d = nowT.getUTCDate();

    let t = buildEpochTz(y, m, d, hh, mm);
    if (t <= Date.now()) {
      t = buildEpochTz(y, m, d + 1, hh, mm);
    }
    return t;
  }

  return null;
}

interface ParsedReminder {
  timeMs: number;
  repeat: "none" | "daily" | "weekly";
  text: string;
}

function parseFull(raw: string): ParsedReminder | null {
  const text = raw.trim();
  const lc = text.toLowerCase();

  const mDaily = lc.match(/^(mỗi ngày|every day)\s+(\d{1,2}):(\d{2})\s+(.+)$/i);
  if (mDaily && mDaily[2] && mDaily[3] && mDaily[3]) {
    const hh = parseInt(mDaily[2], 10);
    const mm = parseInt(mDaily[3], 10);
    const msg = text.slice(text.indexOf(mDaily[3]) + mDaily[3].length).trim();

    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      return null;
    }

    const nowT = nowInTz();
    const y = nowT.getUTCFullYear();
    const m = nowT.getUTCMonth() + 1;
    const d = nowT.getUTCDate();

    let t = buildEpochTz(y, m, d, hh, mm);
    if (t <= Date.now()) {
      t = buildEpochTz(y, m, d + 1, hh, mm);
    }
    return { timeMs: t, repeat: "daily", text: msg };
  }

  const mWeekly = lc.match(/^(mỗi tuần|every week|hàng tuần)\s+(\d{1,2}):(\d{2})\s+(.+)$/i);
  if (mWeekly && mWeekly[2] && mWeekly[3] && mWeekly[3]) {
    const hh = parseInt(mWeekly[2], 10);
    const mm = parseInt(mWeekly[3], 10);
    const msg = text.slice(text.indexOf(mWeekly[3]) + mWeekly[3].length).trim();

    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      return null;
    }

    const nowT = nowInTz();
    const y = nowT.getUTCFullYear();
    const m = nowT.getUTCMonth() + 1;
    const d = nowT.getUTCDate();

    let t = buildEpochTz(y, m, d, hh, mm);
    if (t <= Date.now()) {
      t = buildEpochTz(y, m, d + 7, hh, mm);
    }
    return { timeMs: t, repeat: "weekly", text: msg };
  }

  const mIn = lc.match(/^(?:in|sau)\s+(\d+)\s*(m|ph|phút|h|giờ|d|ngày)\s+(.+)$/i);
  if (mIn && mIn[1] && mIn[2] && mIn[3]) {
    const num = parseInt(mIn[1], 10);
    const unit = mIn[2];
    const msg = text.slice(text.toLowerCase().indexOf(mIn[3])).trim();

    let ms = 0;
    if (unit.startsWith("m") || unit.startsWith("ph")) {
      ms = num * 60000;
    } else if (unit.startsWith("h") || unit.startsWith("gi")) {
      ms = num * 3600000;
    } else {
      ms = num * 24 * 3600000;
    }
    return { timeMs: Date.now() + ms, repeat: "none", text: msg };
  }

  const mDate = lc.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s+(\d{1,2}):(\d{2})\s+(.+)$/i);
  if (mDate && mDate[1] && mDate[2] && mDate[4] && mDate[5] && mDate[5]) {
    const d = parseInt(mDate[1], 10);
    const mo = parseInt(mDate[2], 10);
    const y = mDate[3] ? parseInt(mDate[3], 10) : nowInTz().getUTCFullYear();
    const hh = parseInt(mDate[4], 10);
    const mm = parseInt(mDate[5], 10);
    const msg = text.slice(text.indexOf(mDate[5]) + mDate[5].length).trim();

    if (d < 1 || d > 31 || mo < 1 || mo > 12 || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      return null;
    }

    let t = buildEpochTz(y, mo, d, hh, mm);
    if (!mDate[3] && t <= Date.now()) {
      t = buildEpochTz(y + 1, mo, d, hh, mm);
    }
    return { timeMs: t, repeat: "none", text: msg };
  }

  const mTime = lc.match(/^(\d{1,2}):(\d{2})\s+(.+)$/i);
  if (mTime && mTime[1] && mTime[2] && mTime[2]) {
    const hh = parseInt(mTime[1], 10);
    const mm = parseInt(mTime[2], 10);
    const msg = text.slice(text.indexOf(mTime[2]) + mTime[2].length).trim();

    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      return null;
    }

    const nowT = nowInTz();
    const y = nowT.getUTCFullYear();
    const m = nowT.getUTCMonth() + 1;
    const d = nowT.getUTCDate();

    let t = buildEpochTz(y, m, d, hh, mm);
    if (t <= Date.now()) {
      t = buildEpochTz(y, m, d + 1, hh, mm);
    }
    return { timeMs: t, repeat: "none", text: msg };
  }

  const pipeIdx = text.indexOf("|");
  if (pipeIdx > 0) {
    const when = text.slice(0, pipeIdx).trim();
    const msg = text.slice(pipeIdx + 1).trim();
    const t = parseWhenOnly(when);
    if (t) {
      return { timeMs: t, repeat: "none", text: msg };
    }
  }

  return null;
}

const remindCommand: Command = {
  name: "remind",
  alias: ["reminder"],
  version: "1.4.0",
  role: 0,
  desc: "Nhắc nhở, đặt lịch theo giờ/ngày hoặc lặp lại",
  guide: `1. Đặt nhắc nhở một lần:

• {pn} HH:MM <nội dung>
  VD: {pn} 15:30 đi học

• {pn} DD/MM HH:MM <nội dung>
  VD: {pn} 25/12 20:00 mở quà

• {pn} DD/MM/YYYY HH:MM <nội dung>
  VD: {pn} 01/01/2025 00:00 năm mới

2. Đặt nhắc nhở sau một khoảng thời gian:

• {pn} in <số><đơn vị> <nội dung>
  Đơn vị: m (phút), h (giờ), d (ngày)
  VD: {pn} in 15m học bài
      {pn} in 2h đi họp
      {pn} in 1d sinh nhật

3. Đặt nhắc nhở lặp lại hàng ngày:

• {pn} mỗi ngày HH:MM <nội dung>
• {pn} every day HH:MM <nội dung>
  VD: {pn} mỗi ngày 07:00 thức dậy

4. Đặt nhắc nhở lặp lại hàng tuần:

• {pn} mỗi tuần HH:MM <nội dung>
• {pn} every week HH:MM <nội dung>
• {pn} hàng tuần HH:MM <nội dung>
  VD: {pn} mỗi tuần 20:00 họp nhóm

5. Quản lý nhắc nhở:

• {pn} list: Xem danh sách nhắc nhở
• {pn} del <id>: Xóa một nhắc nhở
• {pn} pause <id>: Tạm dừng một nhắc nhở
• {pn} resume <id>: Tiếp tục một nhắc nhở
• {pn} clear: Xóa tất cả nhắc nhở`,
  cd: 3,
  prefix: true,
  onLoad: async function ({ client, threadData }: CommandOnLoadContext) {
    clientRef = client;
    const idAll = threadData.idAll as (() => Promise<string[]>) | undefined;
    const all = idAll ? await idAll() : [];
    if (Array.isArray(all)) {
      for (const tid of all) {
        const data = ((await threadData.get(tid))?.data || {}) as ThreadDataWithReminders;
        const arr = Array.isArray(data.reminders) ? data.reminders : [];
        for (const r of arr) {
          await schedule(r, threadData);
        }
      }
    }
  },
  onCall: async function ({ event, args, reply, threadData, userData, main, client }: CommandOnCallContext): Promise<void> {
    clientRef = client;
    const threadID = event.threadID;
    const senderID = event.senderID;
    const data = ((await threadData.get(threadID))?.data || {}) as ThreadDataWithReminders;

    if (!Array.isArray(data.reminders)) {
      data.reminders = [];
    }

    const say = async (t: string): Promise<void> => {
      await reply(t);
    };

    const pickId = (): string => {
      return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    };

    const getName = async (uid: string): Promise<string> => {
      try {
        const getNameFunc = userData.getName as ((uid: string) => Promise<string | null | undefined>) | undefined;
        return getNameFunc ? (await getNameFunc(uid)) || "Bạn" : "Bạn";
      } catch {
        return "Bạn";
      }
    };

    const sub = (args[0] || "").toLowerCase();

    if (sub === "list") {
      const items = data.reminders
        .filter((r) => r.threadID === threadID && r.userID === senderID)
        .sort((a, b) => a.timeMs - b.timeMs);

      if (!items.length) {
        return say("Chưa có nhắc nhở nào của bạn trong nhóm này.");
      }

      const mapIDs = items.map((r) => r.id);

      const lines = items.map((r, i) => {
        const status = r.paused ? "⏸️ tạm dừng" : r.repeat !== "none" ? r.repeat : "một lần";
        return `${i + 1}. #${r.id.slice(-6)} • ${new Date(r.timeMs).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} • ${status} • ${r.text}`;
      });

      const msg =
        "Danh sách nhắc nhở:\n" +
        lines.join("\n") +
        "\n\nTrả lời tin này:\n• d <stt> để xoá\n• e <stt> <nội_dung_mới> để sửa nội dung\n• t <stt> <when> để đổi thời gian (HH:MM | DD/MM HH:MM | in 15m)\n• r <stt> daily|weekly|none để đổi lặp\n• p <stt> để tạm dừng/tiếp tục\n• q để đóng";

      await reply(msg, (info: any) => {
        if (info && info.messageID) {
          main.onReply.set(info.messageID, {
            commandName: this.name,
            author: senderID,
            messageID: info.messageID,
            data: { threadID, mapIDs },
          });
        }
      });
      return;
    }

    if (sub === "del" && args[1]) {
      const id = args[1].trim();
      const before = data.reminders.length;
      data.reminders = data.reminders.filter(
        (r) => !(r.threadID === threadID && r.userID === senderID && (r.id === id || r.id.endsWith(id)))
      );
      await threadData.update(threadID, { data });
      clearTimer(threadID, id);
      return say(before === data.reminders.length ? "Không tìm thấy ID." : "Đã xoá nhắc nhở.");
    }

    if (sub === "pause" && args[1]) {
      const id = args[1].trim();
      const rem = data.reminders.find((r) => r.threadID === threadID && r.userID === senderID && (r.id === id || r.id.endsWith(id)));

      if (!rem) {
        return say("Không tìm thấy nhắc nhở.");
      }

      if (rem.paused) {
        return say("Nhắc nhở đã được tạm dừng rồi.");
      }

      rem.paused = true;
      await threadData.update(threadID, { data });
      clearTimer(threadID, rem.id);
      return say("Đã tạm dừng nhắc nhở.");
    }

    if (sub === "resume" && args[1]) {
      const id = args[1].trim();
      const rem = data.reminders.find((r) => r.threadID === threadID && r.userID === senderID && (r.id === id || r.id.endsWith(id)));

      if (!rem) {
        return say("Không tìm thấy nhắc nhở.");
      }

      if (!rem.paused) {
        return say("Nhắc nhở đang hoạt động bình thường.");
      }

      rem.paused = false;
      await threadData.update(threadID, { data });
      await schedule(rem, threadData);
      return say("Đã tiếp tục nhắc nhở.");
    }

    if (sub === "clear") {
      const before = data.reminders.length;
      const ids = data.reminders.filter((r) => r.threadID === threadID && r.userID === senderID).map((r) => r.id);
      data.reminders = data.reminders.filter((r) => !(r.threadID === threadID && r.userID === senderID));
      await threadData.update(threadID, { data });
      for (const id of ids) {
        clearTimer(threadID, id);
      }
      return say(before === data.reminders.length ? "Không có gì để xoá." : "Đã xoá tất cả nhắc nhở của bạn trong nhóm này.");
    }

    const raw = args.join(" ").trim();
    const parsed = parseFull(raw);

    if (!parsed) {
      return say("Cú pháp không hợp lệ. Dùng: remind list | remind del <id> | remind pause <id> | remind resume <id> | remind clear | hoặc các mẫu thời gian trong hướng dẫn.");
    }

    const id = pickId();
    const mentionTag = await getName(senderID);
    const rem: Reminder = {
      id,
      threadID,
      userID: senderID,
      text: parsed.text,
      timeMs: parsed.timeMs,
      repeat: parsed.repeat,
      mentionTag,
      paused: false,
    };

    data.reminders.push(rem);
    await threadData.update(threadID, { data });
    await schedule(rem, threadData);

    return say(
      `Đã đặt nhắc nhở #${id.slice(-6)} vào ${new Date(rem.timeMs).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}${rem.repeat !== "none" ? ` (${rem.repeat})` : ""}`
    );
  },
  onReply: async function ({ event, Reply, main, reply, unsend, threadData }: CommandOnReplyContext) {
    const replyData = Reply as any;
    if (event.senderID !== replyData.author) {
      return;
    }

    const { threadID, mapIDs } = replyData.data || {};
    const text = String(event.body || "").trim();

    if (!text) {
      if (unsend && replyData.messageID) {
        await unsend(replyData.messageID);
      }
      if (replyData.messageID) {
        main.onReply.delete(replyData.messageID);
      }
      return;
    }

    const tokens = text.split(/\s+/);
    const action = tokens[0]?.toLowerCase() || "";

    if (action === "q") {
      if (unsend && replyData.messageID) {
        await unsend(replyData.messageID);
      }
      if (replyData.messageID) {
        main.onReply.delete(replyData.messageID);
      }
      return;
    }

    if (!tokens[1] || !Array.isArray(mapIDs)) {
      await reply("STT không hợp lệ.");
      return;
    }

    const idx = parseInt(tokens[1], 10);
    if (!idx || idx < 1 || idx > mapIDs.length) {
      await reply("STT không hợp lệ.");
      return;
    }

    const id = mapIDs[idx - 1];
    if (!id) {
      await reply("STT không hợp lệ.");
      return;
    }

    const store = ((await threadData.get(threadID))?.data || {}) as ThreadDataWithReminders;
    if (!Array.isArray(store.reminders)) {
      store.reminders = [];
    }

    const findIdx = store.reminders.findIndex((r) => r.id === id);
    if (findIdx < 0) {
      await reply("Không tìm thấy nhắc nhở");
      return;
    }

    const rem = store.reminders[findIdx];
    if (!rem) {
      await reply("Không tìm thấy nhắc nhở");
      return;
    }

    if (action === "d" || action === "del" || action === "x") {
      store.reminders.splice(findIdx, 1);
      await threadData.update(threadID, { data: store });
      clearTimer(threadID, id);
      await reply("Đã xoá.");
      if (unsend && replyData.messageID) {
        await unsend(replyData.messageID);
      }
      if (replyData.messageID) {
        main.onReply.delete(replyData.messageID);
      }
      return;
    }

    if (action === "e" || action === "edit" || action === "m") {
      const newText = tokens.slice(2).join(" ").trim();
      if (!newText) {
        await reply("Vui lòng nhập nội dung mới.");
        return;
      }
      rem.text = newText;
      store.reminders[findIdx] = rem;
      await threadData.update(threadID, { data: store });
      await reply("Đã cập nhật nội dung.");
      return;
    }

    if (action === "t" || action === "time") {
      const when = tokens.slice(2).join(" ").trim();
      const t = parseWhenOnly(when);
      if (!t) {
        await reply("Thời gian không hợp lệ. Dùng HH:MM | DD/MM HH:MM | in 15m.");
        return;
      }
      rem.timeMs = t;
      store.reminders[findIdx] = rem;
      await threadData.update(threadID, { data: store });
      clearTimer(threadID, id);
      await schedule(rem, threadData);
      await reply("Đã đổi thời gian.");
      return;
    }

    if (action === "r" || action === "repeat") {
      const mode = (tokens[2] || "").toLowerCase();
      if (!["daily", "weekly", "none"].includes(mode)) {
        await reply("Chế độ lặp không hợp lệ. Chọn daily|weekly|none.");
        return;
      }
      rem.repeat = mode as "daily" | "weekly" | "none";
      store.reminders[findIdx] = rem;
      await threadData.update(threadID, { data: store });
      clearTimer(threadID, id);
      await schedule(rem, threadData);
      await reply("Đã đổi chế độ lặp.");
      return;
    }

    if (action === "p" || action === "pause") {
      if (rem.paused) {
        rem.paused = false;
        await threadData.update(threadID, { data: store });
        await schedule(rem, threadData);
        await reply("Đã tiếp tục nhắc nhở.");
      } else {
        rem.paused = true;
        await threadData.update(threadID, { data: store });
        clearTimer(threadID, id);
        await reply("Đã tạm dừng nhắc nhở.");
      }
      return;
    }

    await reply("Cú pháp không hợp lệ. Dùng: d|e|t|r|p <stt> ... hoặc q.");
  },
};

export default remindCommand;
