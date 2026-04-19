import type { FacebookClient } from "../../../../types/client";
import type { DonixGlobalState } from "../../../../types/global";
import { getConfig, updateConfigKey } from "../../../configManager";
import type { Logger, ThreadDataStore, UserDataStore } from "../types";
import { now, slp } from "../utils";

const getDonixState = (): DonixGlobalState => {
  if (!global.Donix) {
    global.Donix = {} as DonixGlobalState;
  }
  return global.Donix;
};

interface SendResult {
  ok: boolean;
  fatal: boolean;
  skip?: boolean;
  err?: Error;
}

type PeriodKey = "day" | "week" | "month" | "total";
export type TopPeriod = "day" | "week" | "month";
const TOP_PERIODS: readonly TopPeriod[] = ["day", "week", "month"] as const;

interface UserInteractionCount {
  id: string;
  count: number;
  lastInteraction?: unknown;
}

interface NormalizedMessageCount {
  day: UserInteractionCount[];
  week: UserInteractionCount[];
  month: UserInteractionCount[];
  total: UserInteractionCount[];
  previousTotal_day: number;
  previousTotal_week: number;
  previousTotal_month: number;
}

export async function sendTop(
  client: FacebookClient,
  logger: Logger | undefined,
  threadData: ThreadDataStore,
  userData: UserDataStore
): Promise<void> {
  const donix = getDonixState();
  if (donix.send_toptt) return;
  donix.send_toptt = true;

  const CONC = 6;
  const sentThreads = new Set<string>();
  const NAME_CACHE = new Map<string, string>();
  const MAX_NAMES = 5000;

  try {
    const cur = now();
    let typ: Exclude<PeriodKey, "total"> = "day";
    if (cur.date() === 1) {
      typ = "month";
    } else if (cur.day() === 1) {
      typ = "week";
    }

    const sendMessagesEnabled = getSendTopMessagesEnabled(typ);
    const hdr: Record<typeof typ, string> = {
      day: "📊 Top Tương Tác Ngày",
      week: "📈 Top Tương Tác Tuần",
      month: "📋 Top Tương Tác Tháng"
    };
    logger?.info?.(`[TopTT] Mốc: ${typ.toUpperCase()}`);

    const allRaw =
      ((await threadData.getAllMessageCount().catch(() => [])) as Array<{
        threadID: string;
        messageCount: unknown;
      }>) || [];
    const totalInDB = allRaw.length;
    const data: Array<{ threadID: string; messageCount: unknown }> = allRaw.map(t => ({
      threadID: String(t.threadID),
      messageCount: t.messageCount,
    }));

    logger?.info?.(`[TopTT] Tổng nhóm trong DB: ${totalInDB}`);
    logger?.info?.(`[TopTT] Sẽ xử lý: ${data.length}`);
    logger?.info?.(`[TopTT] Gửi tin nhắn: ${sendMessagesEnabled ? "BẬT" : "TẮT"}`);

    const toRecord = (value: unknown): Record<string, unknown> => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
      return {};
    };

    const norm = (mcRaw: unknown): NormalizedMessageCount => {
      let value: unknown = mcRaw;
      if (typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch {
          value = {};
        }
      }
      const rec = toRecord(value);

      const fx = (a: unknown): UserInteractionCount[] =>
        Array.isArray(a)
          ? a.map((item): UserInteractionCount => {
            const obj = toRecord(item);
            return {
              id: String(obj.id ?? ""),
              count: Number(obj.count ?? 0) || 0,
              lastInteraction: obj.lastInteraction,
            };
          })
          : [];

      return {
        day: fx(rec.day),
        week: fx(rec.week),
        month: fx(rec.month),
        total: fx(rec.total),
        previousTotal_day: Number(rec.previousTotal_day ?? 0) || 0,
        previousTotal_week: Number(rec.previousTotal_week ?? 0) || 0,
        previousTotal_month: Number(rec.previousTotal_month ?? 0) || 0,
      };
    };

    const sum = (a: Array<{ count: number }>) => (Array.isArray(a) ? a.reduce((s, c) => s + (Number(c.count) || 0), 0) : 0);
    const medals = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "•");
    const status = (m: number) =>
      m > 2000 ? "Siêu Năng Động 🌟" : m > 1000 ? "Rất Sôi Nổi ⭐" : m > 500 ? "Hoạt Động Tốt 🌙" : m > 200 ? "Bình Thường 💫" : "Hơi Trầm Lắng 🌤️";

    const getNameCached = async (uid: string): Promise<string> => {
      if (NAME_CACHE.has(uid)) {
        const v = NAME_CACHE.get(uid)!;
        NAME_CACHE.delete(uid);
        NAME_CACHE.set(uid, v);
        return v;
      }
      let name: string | null | undefined = null;
      try {
        name = await userData.getName?.(uid);
      } catch { }
      const val = name || `User ${uid}`;
      NAME_CACHE.set(uid, val);
      if (NAME_CACHE.size > MAX_NAMES) {
        const firstKey = NAME_CACHE.keys().next().value;
        if (firstKey) NAME_CACHE.delete(firstKey);
      }
      return val;
    };

    const sendWithCallback = async (
      threadID: string,
      text: string,
      timeoutMs: number = 55000
    ): Promise<SendResult> => {
      let timeoutHandle: NodeJS.Timeout | null = null;

      const timeoutPromise = new Promise<SendResult>(resolve => {
        timeoutHandle = setTimeout(() => {
          resolve({ ok: false, fatal: false, err: new Error("timeout") });
        }, timeoutMs);
      });

      const sendPromise = client
        .sendMessage({ body: text }, threadID)
        .then((): SendResult => ({ ok: true, fatal: false }))
        .catch((err: unknown): SendResult => {
          const e = err as { message?: string; error?: number };
          const msg = String(e?.message ?? err);
          if (msg.includes("Không gửi được")) {
            return { ok: false, fatal: false, skip: true, err: new Error(msg) };
          }
          if (e?.error === 1545012) {
            return { ok: false, fatal: true, err: new Error(msg) };
          }
          return { ok: false, fatal: false, err: new Error(msg) };
        });

      const result = await Promise.race([timeoutPromise, sendPromise]);

      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      return result;
    };

    let idx = 0;
    let ok = 0;
    let fail = 0;
    let iPtr = 0;

    const worker = async (): Promise<void> => {
      while (iPtr < data.length) {
        const i = iPtr++;
        const th = data[i];
        const threadID = th.threadID;
        idx += 1;

        if (sentThreads.has(threadID)) {
          logger?.warn?.(`[TopTT] Bỏ qua ${threadID} (đã gửi) ${idx}/${data.length}`);
          continue;
        }

        logger?.info?.(`[TopTT] Xử lý ${idx}/${data.length} -> ${threadID}`);

        try {
          const mc = norm(th.messageCount);
          const list = Array.isArray(mc[typ]) ? mc[typ] : [];
          list.sort((a, b) => (b.count || 0) - (a.count || 0));
          const total = sum(list);
          const prev = { day: mc.previousTotal_day, week: mc.previousTotal_week, month: mc.previousTotal_month };
          const diff = { day: total - prev.day, week: total - prev.week, month: total - prev.month };
          const pct = {
            day: prev.day > 0 ? (diff.day / prev.day) * 100 : null,
            week: prev.week > 0 ? (diff.week / prev.week) * 100 : null,
            month: prev.month > 0 ? (diff.month / prev.month) * 100 : null
          };
          const avg = list.length ? Math.floor(total / list.length) : 0;
          const topLen = Math.min(10, list.length);

          let mvp: { name: string; count: number; percentage: string } | null = null;
          if (topLen > 0) {
            const top0 = list[0];
            if (top0) {
              mvp = {
                name: await getNameCached(top0.id),
                count: top0.count,
                percentage: total > 0 ? ((top0.count / total) * 100).toFixed(1) : "0.0"
              };
            }
          }

          let hist = "";
          if (typ === "day") {
            hist = prev.day
              ? `→ ${diff.day >= 0 ? "Tăng" : "Giảm"} ${Math.abs(pct.day ?? 0).toFixed(1)}%\n→ Trạng thái: ${status(
                total
              )}\n→ TB tin nhắn/thành viên: ${avg}\n→ MVP: ${mvp ? `${mvp.name} (${mvp.count} tin nhắn - ${mvp.percentage}% tổng nhóm)` : "Chưa có"
              }`
              : "→ Chưa có dữ liệu so sánh";
          } else if (typ === "week") {
            hist = prev.week
              ? `→ ${diff.week >= 0 ? "Tăng" : "Giảm"} ${Math.abs(pct.week ?? 0).toFixed(1)}%\n→ Mức độ: ${status(
                total
              )}\n→ Thành viên > TB: ${list.filter(u => u.count > avg).length}\n→ MVP Tuần: ${mvp ? `${mvp.name} (${mvp.count} tin nhắn)` : "Chưa có"
              }`
              : "→ Chưa có dữ liệu so sánh";
          } else {
            hist = prev.month
              ? `→ ${diff.month >= 0 ? "Tăng" : "Giảm"} ${Math.abs(pct.month ?? 0).toFixed(1)}%\n→ Đánh giá: ${status(
                total
              )}\n→ Tổng: ${total.toLocaleString()}\n→ MVP Tháng: ${mvp ? `${mvp.name} (${mvp.count} tin nhắn)` : "Chưa có"}`
              : "→ Chưa có dữ liệu so sánh";
          }

          const bodyArr: string[] = [];
          for (let k = 0; k < topLen; k++) {
            const u = list[k];
            if (!u) continue;
            const nm = await getNameCached(u.id);
            const p = total > 0 ? ((u.count / total) * 100).toFixed(1) : "0.0";
            bodyArr.push(`${medals(k)} ${k + 1}. ${nm} — ${Number(u.count || 0).toLocaleString()} tin nhắn (${p}%)`);
          }

          const head = `[ ${hdr[typ]} ]`;
          const body = bodyArr.length ? bodyArr.join("\n") : "Chưa có dữ liệu";
          const foot = `\n\n💬 Tổng tin nhắn: ${total.toLocaleString()}\n${hist}`;
          const text = `${head}\n\n${body}${foot}`;

          let sent = false;
          let lastErr: Error | null = null;
          let shouldReset = false;

          if (!sendMessagesEnabled) {

            logger?.info?.(`[TopTT] Bỏ qua gửi tin nhắn ${threadID} (toggle tắt), vẫn reset dữ liệu`);
            shouldReset = true;
            ok += 1;
          } else {

            for (let a = 1; a <= 3; a++) {
              const res = await sendWithCallback(threadID, text);
              if (res.ok) {
                sentThreads.add(threadID);
                sent = true;
                shouldReset = true;
                ok += 1;
                logger?.success?.(`[TopTT] OK ${threadID} (attempt ${a})`);
                break;
              }
              if (res.skip) {
                fail += 1;
                logger?.warn?.(`[TopTT] Skip ${threadID} "Không gửi được"`);
                break;
              }
              if (res.fatal) {
                fail += 1;
                lastErr = res.err || null;
                logger?.warn?.(`[TopTT] Lỗi tạm thời ${threadID} (1545012)`);
                break;
              }
              lastErr = res.err || null;
              logger?.warn?.(`[TopTT] Retry ${threadID} lần ${a} lỗi: ${lastErr?.message || lastErr}`);
              await slp(200);
            }

            if (!sent && lastErr) {
              logger?.error?.(`[TopTT] Fail ${threadID}: ${lastErr?.message || lastErr}`);
            }
          }

          if (shouldReset || sent) {
            mc.previousTotal_day = sum(mc.day);
            mc.previousTotal_week = sum(mc.week);
            mc.previousTotal_month = sum(mc.month);
            if (cur.date() === 1) {
              for (const i of mc.month) {
                i.count = 0;
              }
            }
            if (cur.day() === 1) {
              for (const i of mc.week) {
                i.count = 0;
              }
            }
            for (const i of mc.day) {
              i.count = 0;
            }
            await threadData.update(threadID, { messageCount: mc });
            logger?.info?.(`[TopTT] Đã reset dữ liệu cho ${threadID}`);
          }

          await slp(900 + Math.floor(Math.random() * 400));
        } catch (e: unknown) {
          fail += 1;
          const err = e instanceof Error ? e : new Error(String(e));
          logger?.error?.(`[TopTT] Lỗi thread ${threadID}: ${err.message}`);
        }
      }
    };

    const workers: Promise<void>[] = [];
    const wc = Math.max(1, Math.min(CONC, data.length));
    for (let w = 0; w < wc; w++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    logger?.info?.(`[TopTT] Done ${ok + fail}/${data.length} nhóm | OK=${ok} | Fail=${fail}`);
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger?.error?.(`[TopTT] sendTop err: ${err.message}`);
  } finally {
    NAME_CACHE.clear();
    sentThreads.clear();
    donix.send_toptt = false;
  }
}

function getSendConfigBlock(): Record<string, unknown> {
  try {
    const config = getConfig() as Record<string, unknown> | null;
    const sched = config?.scheduler as Record<string, unknown> | undefined;
    const tasks = sched?.tasks as Record<string, unknown> | undefined;
    const sendTopTask = tasks?.sendTop as Record<string, unknown> | undefined;
    const sendBlock = sendTopTask?.send as Record<string, unknown> | undefined;
    return sendBlock || {};
  } catch {
    return {};
  }
}

function readBoolFlag(value: unknown, defaultValue = true): boolean {
  if (value === undefined || value === null) return defaultValue;
  return value !== false;
}

export async function setSendTopMessagesEnabled(
  enabled: boolean,
  period?: TopPeriod
): Promise<boolean> {
  const donix = getDonixState();
  if (!period) {
    donix.send_toptt_enabled = enabled;
  }

  try {
    const key = period
      ? `scheduler.tasks.sendTop.send.${period}`
      : "scheduler.tasks.sendTop.send.enabled";
    await updateConfigKey(key, enabled);
  } catch (error) {
    console.warn("Không thể lưu trạng thái vào config:", error);
  }

  return enabled;
}

export function getSendTopMessagesEnabled(period?: TopPeriod): boolean {
  const send = getSendConfigBlock();
  const globalEnabled = readBoolFlag(send.enabled, true);
  if (!globalEnabled) return false;

  if (period) {
    return readBoolFlag(send[period], true);
  }

  return TOP_PERIODS.some(p => readBoolFlag(send[p], true));
}

export function getSendTopMessagesStatus(): Record<TopPeriod | "global", boolean> {
  return {
    global: readBoolFlag(getSendConfigBlock().enabled, true),
    day: getSendTopMessagesEnabled("day"),
    week: getSendTopMessagesEnabled("week"),
    month: getSendTopMessagesEnabled("month"),
  };
}
