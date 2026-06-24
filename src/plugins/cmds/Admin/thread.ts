"use strict";

import type {
  Command,
  CommandOnCallContext,
} from "@types";

const DEFAULT_TZ = "Asia/Ho_Chi_Minh";

function parseDate(input: any): Date {
  if (input == null) return new Date();
  if (input instanceof Date) return input;

  if (typeof input === "number") {
    const ms = input < 1e12 ? input * 1000 : input;
    return new Date(ms);
  }

  if (typeof input === "string") {
    const n = Number(input);
    if (!Number.isNaN(n)) return parseDate(n);

    const d = new Date(input);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return new Date();
}

function formatWithTZ(date: Date, fmt: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  const YYYY = map.year || "0000";
  const YY = YYYY.slice(-2);
  const MM = map.month || "01";
  const DD = map.day || "01";
  const HH = map.hour || "00";
  const mm = map.minute || "00";
  const ss = map.second || "00";

  return fmt
    .replace(/YYYY/g, YYYY)
    .replace(/YY/g, YY)
    .replace(/MM/g, MM)
    .replace(/DD/g, DD)
    .replace(/HH/g, HH)
    .replace(/mm/g, mm)
    .replace(/ss/g, ss);
}

function getTime(a?: any, b?: any, c?: any): string {
  let dateInput: any;
  let fmt = "DD/MM/YYYY HH:mm:ss";
  let tz = DEFAULT_TZ;

  if (typeof a === "string" && /[YMDHms]/.test(a) && (b == null || typeof b !== "string")) {
    fmt = a;
    dateInput = undefined;
    tz = typeof b === "string" ? b : DEFAULT_TZ;
  } else {
    dateInput = a;
    fmt = typeof b === "string" ? b : fmt;
    tz = typeof c === "string" ? c : DEFAULT_TZ;
  }

  const d = parseDate(dateInput);
  return formatWithTZ(d, fmt, tz);
}

interface ThreadItem {
  tid: string;
  name: string;
  data: any;
}

interface Member {
  userID?: string | number;
  id?: string | number;
  inGroup?: boolean;
  gender?: string;
  count?: number | string;
  [key: string]: any;
}

const threadCommand: Command = {
  name: "thread",
  alias: ["threads"],
  version: "2.0.0",
  role: 3,
  desc: "Quản lý nhóm: find, info, ban/unban, list",
  guide:
    "{pn} find|-f|search|-s <từ khóa>\n{pn} find -j <từ khóa>\n{pn} info|-i [tid]\n{pn} ban|-b [tid] <lý do>\n{pn} unban|-u [tid]\n{pn} list",
  cd: 3,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, threadData } = ctx;
    const bot = (ctx as any).bot;
    const reply = (ctx as any).reply as (message: string) => Promise<void> | void;
    const userData = (ctx as any).userData;
    const sub = String(args[0] || "").toLowerCase();

    const toStr = (v: any): string => (typeof v === "string" ? v : "") || "";

    const pickTid = (): string => (!isNaN(Number(args[1])) ? String(args[1]) : String(event.threadID));

    async function getAll(): Promise<ThreadItem[]> {
      const rawIds = await (threadData.idAll as any)();
      const ids = (Array.isArray(rawIds) ? rawIds : []) as string[];
      const out: ThreadItem[] = [];

      for (const tid of ids) {
        const raw = await threadData.get(tid);
        const data: any = (raw as any)?.data || raw || {};
        const name =
          data?.threadInfo?.threadName ||
          data?.threadName ||
          (data as any)?.name ||
          "Không tên";
        out.push({ tid, name, data });
      }

      return out;
    }

    function membersArray(m: any): Member[] {
      if (Array.isArray(m)) return m;
      if (m && typeof m === "object") return Object.values(m);
      return [];
    }

    function fmt(ts: any): string {
      if (!ts) return "N/A";
      try {
        return getTime(ts, "DD/MM/YYYY HH:mm:ss");
      } catch {
        return new Date(ts).toISOString();
      }
    }

    if (["find", "search", "-f", "-s"].includes(sub)) {
      let joinedOnly = false;
      let kwArgs = args.slice(1);

      if (["-j", "joined"].includes(String(args[1]).toLowerCase())) {
        joinedOnly = true;
        kwArgs = args.slice(2);
      }

      const keyword = toStr(kwArgs.join(" ")).trim().toLowerCase();
      if (!keyword) return reply("Thiếu từ khóa cần tìm.");

      const botID = await bot.getCurrentUserID();
      const all = await getAll();

      const list = all
        .filter((x) => x.tid.length > 15 && toStr(x.name).toLowerCase().includes(keyword))
        .filter((x) => {
          if (!joinedOnly) return true;
          const mem = membersArray(x.data?.members);
          return mem.some((m) => String(m.userID || m.id || "") === String(botID) && !!m.inGroup);
        });

      if (!list.length) return reply(`❌ Không tìm thấy nhóm nào có tên khớp: "${keyword}".`);

      const body = list.map((x) => `╭Name: ${x.name}\n╰ID: ${x.tid}`).join("\n");
      return reply(`🔎 Tìm thấy ${list.length} nhóm trùng với từ khóa "${keyword}":\n${body}`);
    }

    if (["info", "-i"].includes(sub)) {
      const tid = pickTid();
      const raw = await threadData.get(tid);
      const data: any = (raw as any)?.info || raw || {};
      const createdAt = raw?.createdAt || data?.created || null;
      const created = fmt(createdAt);
      const mem = membersArray(data?.members).filter((m) => !!m.inGroup);
      const total = mem.length;
      const totalBoy = mem.filter((m) => String(m.gender || "").toUpperCase() === "MALE").length;
      const totalGirl = mem.filter((m) => String(m.gender || "").toUpperCase() === "FEMALE").length;
      const totalMsg = mem.reduce((s, m) => s + (Number(m.count) || 0), 0);
      const banned = data?.banned || null;
      const extra = banned
        ? `\n- Banned: true\n- Reason: ${toStr(banned.reason) || "N/A"}\n- Time: ${fmt(banned.time)}\n- By: ${toStr(banned.by?.name) || banned.by?.id || "N/A"}`
        : "";
      const name = data?.threadInfo?.threadName || data?.threadName || data?.name || "Không tên";

      return reply(
        `» Box ID: ${tid}\n» Tên: ${name}\n» Ngày tạo data: ${created}\n» Tổng thành viên: ${total}\n» Nam: ${totalBoy} thành viên\n» Nữ: ${totalGirl} thành viên\n» Tổng tin nhắn: ${totalMsg}${extra}`
      );
    }

    if (["ban", "-b"].includes(sub)) {
      const tid = pickTid();
      const reason =
        toStr((!isNaN(Number(args[1])) ? args.slice(2) : args.slice(1)).join(" ")).trim() || "Không có lý do";
      const bannerName = await (userData as any).getName(event.senderID);

      await threadData.update(tid, {
        banned: {
          reason,
          time: Date.now(),
          by: { id: String(event.senderID), name: bannerName || "Unknown" },
        },
      });

      const raw = await threadData.get(tid);
      const data: any = (raw as any)?.data || raw || {};
      const name =
        data?.threadInfo?.threadName ||
        data?.threadName ||
        (data as any)?.name ||
        "Không tên";

      return reply(
        `Đã ban nhóm [${tid} | ${name}]\nLý do: ${reason}\nBởi: ${bannerName || "Unknown"} (${event.senderID})\nThời gian: ${fmt(Date.now())}`
      );
    }

    if (["unban", "-u"].includes(sub)) {
      const tid = pickTid();
      await threadData.update(tid, { banned: null });

      const raw = await threadData.get(tid);
      const data: any = (raw as any)?.data || raw || {};
      const name =
        data?.threadInfo?.threadName ||
        data?.threadName ||
        (data as any)?.name ||
        "Không tên";

      return reply(`Đã gỡ ban nhóm [${tid} | ${name}]`);
    }

    if (["list"].includes(sub)) {
      const all = await getAll();
      const banned = all.filter((x) => !!x.data?.banned);

      if (!banned.length) return reply("Hiện không có nhóm nào đang bị ban.");

      const body = banned
        .map((x, i) => {
          const b = x.data.banned;
          const by = toStr(b?.by?.name) || b?.by?.id || "N/A";
          return `${i + 1}. ${x.name}\n   ID: ${x.tid}\n   Reason: ${toStr(b?.reason) || "N/A"}\n   Time: ${fmt(b?.time)}\n   By: ${by}`;
        })
        .join("\n");

      return reply(`Danh sách nhóm bị ban (${banned.length}):\n${body}`);
    }

    return reply(
      "Sai cú pháp.\nDùng:\n{pn} find|-f|search|-s <từ khóa>\n{pn} find -j <từ khóa>\n{pn} info|-i [tid]\n{pn} ban|-b [tid] <lý do>\n{pn} unban|-u [tid]\n{pn} list"
    );
  },
};

export default threadCommand;
