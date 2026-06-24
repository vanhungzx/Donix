import moment from "moment-timezone";

export const TZ = "Asia/Ho_Chi_Minh";
export const now = () => moment.tz(TZ);

export const slp = (ms: number) => new Promise(r => setTimeout(r, ms));

export const ok = (v: unknown): v is string =>
  typeof v === "string" && v.trim() !== "" && !/^(undefined|null)$/i.test(v.trim());

export function remDays(dmy?: string | number | null): number {
  if (!dmy) return 0;
  const m = String(dmy).match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/);
  if (!m || !m[1] || !m[2] || !m[3]) return 0;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  const end = moment.tz({ year: y, month: mo - 1, date: d }, TZ).startOf("day");
  if (!end.isValid()) return 0;
  if (end.year() !== y || end.month() !== mo - 1 || end.date() !== d) return 0;
  const today = moment.tz(TZ).startOf("day");
  return end.diff(today, "days");
}

export function nicknameFor(pre: string, botname: string, d: number): string {
  if (Number.isNaN(d)) return `[ ${pre} ] • ${botname} || ❎ Chưa thuê`;
  if (d < 0) return `[ ${pre} ] • ${botname} || ❎ Hết hạn ${Math.abs(d)} ngày`;
  if (d === 0) return `[ ${pre} ] • ${botname} || ⏳ Hết hạn hôm nay`;
  if (d === 1) return `[ ${pre} ] • ${botname} || ⚠️ Còn 1 ngày`;
  if (d <= 3) return `[ ${pre} ] • ${botname} || ⚠️ Còn ${d} ngày`;
  return `[ ${pre} ] • ${botname} || ✅ Còn ${d} ngày`;
}
