import type { Command, CommandOnCallContext } from "@types";
import moment from "moment-timezone";

const aliasMap: Record<string, string[]> = {
  tet: ["tết", "tet", "m1", "mung1tet"],
  trungthu: ["trungthu", "rằmtháng8", "ramthang8", "tt"],
  hungvuong: ["giỗtổ", "gioto", "hùngvương", "hungvuong", "10/3al", "103al"],
  noel: ["noel", "giangsinh", "giángsinh", "christmas"],
  quockhanh: ["quockhanh", "quốckhánh", "2/9", "02/09"],
  gptet: ["giaothua", "giao thừa", "newyeareve_lunar"],
  upcoming: ["upcoming", "saptoi"],
};

const VI_DOW = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

interface Holiday {
  key: string;
  name: string;
  date: Date;
  aliases: string[];
}

interface HolidayTable {
  [year: number]: string;
}

function z(n: number): string {
  return String(n).padStart(2, "0");
}

function toVNDayNumber(ms: number | Date): number {
  return Math.floor(moment(ms).tz("Asia/Ho_Chi_Minh").startOf("day").valueOf() / 86400000);
}

function dmyToDate(s: string, preferYear?: number): Date | undefined {
  const match = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?$/);
  if (!match) return undefined;

  const dayStr = match[1];
  const monthStr = match[2];
  const yearStr = match[3];

  const d = Number(dayStr);
  const mo = Number(monthStr);
  const y = yearStr
    ? Number(yearStr) < 100
      ? 2000 + Number(yearStr)
      : Number(yearStr)
    : preferYear || moment().tz("Asia/Ho_Chi_Minh").year();

  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;

  return moment.tz([y, mo - 1, d], "Asia/Ho_Chi_Minh").toDate();
}

function fmtDate(dt: Date): string {
  const m = moment(dt).tz("Asia/Ho_Chi_Minh");
  const dow = VI_DOW[m.day()];
  return `${z(m.date())}/${z(m.month() + 1)}/${m.year()} (${dow})`;
}

function humanDiff(days: number): string {
  const sign = days >= 0 ? "còn" : "đã qua";
  const n = Math.abs(days);
  const w = Math.floor(n / 7),
    r = n % 7;
  return `${sign} ${n} ngày${n ? ` (~${w} tuần ${r} ngày)` : ``}`;
}

function nextOrThis(dt: Date): Date {
  const today = toVNDayNumber(moment().tz("Asia/Ho_Chi_Minh").toDate());
  const dd = toVNDayNumber(dt);
  return dd >= today ? dt : moment(dt).tz("Asia/Ho_Chi_Minh").add(1, "year").toDate();
}

function fixed(y: number, m: number, d: number, name: string, key: string, aliases: string[] = []): Holiday {
  return {
    key,
    name,
    date: moment.tz([y, m - 1, d], "Asia/Ho_Chi_Minh").toDate(),
    aliases,
  };
}

function tableVariable(year: number): Holiday[] {
  const TET: HolidayTable = {
    2025: "2025-01-29",
    2026: "2026-02-17",
    2027: "2027-02-06",
    2028: "2028-01-26",
    2029: "2029-02-13",
    2030: "2030-02-02",
  };

  const HUNG: HolidayTable = {
    2025: "2025-04-07",
    2026: "2026-04-26",
    2027: "2027-04-16",
    2028: "2028-04-04",
    2029: "2029-04-23",
    2030: "2030-04-12",
  };

  const TRUNG: HolidayTable = {
    2025: "2025-10-06",
    2026: "2026-09-25",
    2027: "2027-09-15",
    2028: "2028-10-03",
    2029: "2029-09-22",
    2030: "2030-09-12",
  };

  const out: Holiday[] = [];

  if (TET[year]) {
    const tet = moment.tz(TET[year], "Asia/Ho_Chi_Minh").toDate();
    out.push({
      key: "tet",
      name: "Tết Nguyên Đán (Mùng 1)",
      date: tet,
      aliases: aliasMap.tet || [],
    });
    out.push({
      key: "gptet",
      name: "Giao thừa (Âm lịch)",
      date: moment(tet).subtract(1, "day").toDate(),
      aliases: aliasMap.gptet || [],
    });
  }

  if (HUNG[year]) {
    out.push({
      key: "hungvuong",
      name: "Giỗ Tổ Hùng Vương (10/3 AL)",
      date: moment.tz(HUNG[year], "Asia/Ho_Chi_Minh").toDate(),
      aliases: aliasMap.hungvuong || [],
    });
  }

  if (TRUNG[year]) {
    out.push({
      key: "trungthu",
      name: "Tết Trung Thu (Rằm tháng 8 AL)",
      date: moment.tz(TRUNG[year], "Asia/Ho_Chi_Minh").toDate(),
      aliases: aliasMap.trungthu || [],
    });
  }

  return out;
}

function nextUpcoming(year: number, limit: number | null = null): Array<{ name: string; date: Date }> {
  const now = moment().tz("Asia/Ho_Chi_Minh");
  const todayNum = toVNDayNumber(now.toDate());
  const list: Array<{ name: string; date: Date }> = [];

  for (const h of holidaysVN(year)) {
    const dd = toVNDayNumber(h.date);
    if (dd >= todayNum) list.push({ name: h.name, date: h.date });
  }

  const sorted = list.sort((a, b) => a.date.getTime() - b.date.getTime());
  return limit ? sorted.slice(0, limit) : sorted;
}

function holidaysVN(year: number): Holiday[] {
  const arr: Holiday[] = [];

  arr.push(fixed(year, 1, 1, "Tết Dương Lịch", "newyear"));
  arr.push(...tableVariable(year));
  arr.push(fixed(year, 2, 14, "Valentine", "valentine"));
  arr.push(fixed(year, 3, 8, "Quốc tế Phụ nữ 8/3", "women_int"));
  arr.push(fixed(year, 4, 30, "Giải phóng miền Nam 30/4", "304"));
  arr.push(fixed(year, 5, 1, "Quốc tế Lao động 1/5", "laodong"));
  arr.push(fixed(year, 6, 1, "Quốc tế Thiếu nhi 1/6", "1601"));
  arr.push(fixed(year, 9, 2, "Quốc khánh 2/9", "quockhanh", aliasMap.quockhanh));
  arr.push(fixed(year, 10, 20, "Phụ nữ Việt Nam 20/10", "women_vn"));
  arr.push(fixed(year, 10, 31, "Halloween", "halloween"));
  arr.push(fixed(year, 11, 20, "Ngày Nhà giáo Việt Nam 20/11", "2011"));
  arr.push(fixed(year, 12, 24, "Giáng Sinh 24/12", "noel_eve", aliasMap.noel));
  arr.push(fixed(year, 12, 25, "Giáng Sinh 25/12", "noel", aliasMap.noel));

  return arr;
}

function parseRange(text: string): [string, string] | null {
  const match = text.match(/^(.+?)\s+(?:đến|to|-|–|—)\s+(.+)$/i);
  if (!match) return null;
  const from = match[1] || "";
  const to = match[2] || "";
  return [from.trim(), to.trim()];
}

function findHolidayByKeyword(year: number, keyword: string): Holiday | null {
  const holidays = holidaysVN(year);
  const kwLower = keyword.toLowerCase();

  for (const h of holidays) {
    if (h.key.toLowerCase() === kwLower) return h;
    if (h.name.toLowerCase().includes(kwLower)) return h;
    for (const alias of h.aliases) {
      if (alias.toLowerCase() === kwLower) return h;
    }
  }

  return null;
}

function findByShortcutNumber(year: number, keyword: string): Holiday | null {
  const holidays = holidaysVN(year);
  const kwLower = keyword.toLowerCase();

  
  const numMatch = kwLower.match(/^(\d+)$/);
  if (numMatch) {
    const num = parseInt(numMatch[1]!, 10);
    const sorted = holidays.sort((a, b) => a.date.getTime() - b.date.getTime());
    if (num > 0 && num <= sorted.length) {
      const h = sorted[num - 1];
      return h || null;
    }
  }

  return null;
}

const demngayCommand: Command = {
  name: "demngay",
  alias: ["demngay", "holiday", "le", "countday", "upcoming", "saptoi"],
  version: "1.2.1",
  role: 0,
  desc: "Đếm ngày và xem các ngày lễ Việt Nam (chỉ xem, 2025–2030)",
  guide:
    "• {pn} 20/11\n• {pn} 20/11/2026\n• {pn} 1/10 đến 31/12\n• {pn} tet | trungthu | hungvuong | 2/9 | noel\n• {pn} list [năm]\n• {pn} upcoming | saptoi",
  cd: 3,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { bot, event, args, config } = ctx as any;
    const { threadID, messageID } = event;

    const now = moment().tz("Asia/Ho_Chi_Minh");
    const year = now.year();
    const text = args.join(" ").trim();

    const reply = async (message: string): Promise<void> => {
      await bot.sendMessage(message, threadID, messageID);
    };

    if (!text) {
      const nexts = nextUpcoming(year);
      const lines = nexts.map((x) => {
        const d = toVNDayNumber(x.date) - toVNDayNumber(now.toDate());
        return `${x.name}: ${fmtDate(x.date)} • ${humanDiff(d)}`;
      });
      await reply(
        lines.length ? lines.join("\n") : "Không có dịp sắp tới trong danh sách."
      );
      return;
    }

    if (/^(upcoming|saptoi)$/i.test(text)) {
      const nexts = nextUpcoming(year, 1);
      const lines = nexts.map((x) => {
        const d = toVNDayNumber(x.date) - toVNDayNumber(now.toDate());
        return `${x.name}: ${fmtDate(x.date)} • ${humanDiff(d)}`;
      });
      await reply(
        lines.length ? lines.join("\n") : "Không có dịp sắp tới trong danh sách."
      );
      return;
    }

    const [cmd, ...rest] = text.split(/\s+/);

    if (/^list$/i.test(cmd)) {
      const y = +rest[0]?.trim() || year;
      const hs = holidaysVN(y)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((h, i) => `${i + 1}. ${h.name}: ${fmtDate(h.date)}`);
      await reply(`Ngày lễ ${y}:\n` + hs.join("\n"));
      return;
    }

    const range = parseRange(text);
    if (range) {
      const a = dmyToDate(range[0], year);
      const b = dmyToDate(range[1], a ? moment(a).year() : year);
      if (!a || !b) {
        await reply("Ngày không hợp lệ.");
        return;
      }
      const d = toVNDayNumber(b) - toVNDayNumber(a);
      await reply(`${fmtDate(a)} → ${fmtDate(b)}\n${humanDiff(d)}`);
      return;
    }

    const d1 = dmyToDate(text, year);
    if (d1) {
      const target = nextOrThis(d1);
      const diff = toVNDayNumber(target) - toVNDayNumber(now.toDate());
      await reply(`${fmtDate(target)} • ${humanDiff(diff)}`);
      return;
    }

    const kw = text.toLowerCase();
    const h = findHolidayByKeyword(year, kw) || findByShortcutNumber(year, kw);

    if (h) {
      const tgt = nextOrThis(h.date);
      const diff = toVNDayNumber(tgt) - toVNDayNumber(now.toDate());
      await reply(`${h.name}: ${fmtDate(tgt)} • ${humanDiff(diff)}`);
      return;
    }

    await reply(
      `Không hiểu yêu cầu. Dùng: ${config.PREFIX}${demngayCommand.name} guide`
    );
    return;
  },
};

export default demngayCommand;
