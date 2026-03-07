import { isPlainObject, isUndefined, omitBy } from "../../utils/lodash-helpers";
import log from "../../utils/log";
import { getDbPromisified } from "./schema";

export interface ThreadData {
  threadID: string;
  threadName?: string;
  // JSON-ish columns: allow `null` as an explicit "clear/reset" sentinel for updates.
  threadInfo?: Record<string, unknown> | null;
  banned?: Record<string, { reason?: string; time?: number;[key: string]: unknown }> | null;
  settings?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
  messageCount?: Record<string, unknown> | number | null;
  lastActive?: number | null;
  createdAt?: number;
  updatedAt?: number;
}

const validateThreadID = (threadID: any): string => {
  if (typeof threadID !== "string" && typeof threadID !== "number") {
    throw new Error("Invalid threadID: must be a string or number.");
  }
  return String(threadID);
};

const validateData = (data: any): void => {
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).length === 0) {
    throw new Error("Invalid data: must be a non-empty object.");
  }
};

const parseMaybeJSON = (v: any): any => {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
};

const normalizeBanField = (raw: any): Record<string, any> | null => {
  const parsed = parseMaybeJSON(raw);
  if (!parsed) return null;
  if (typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return Object.keys(parsed).length > 0 ? (parsed as Record<string, any>) : null;
};

const toNumber = (v: any, d: number = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const rowToThreadData = (row: any): ThreadData => {
  return {
    threadID: row.threadID,
    threadName: row.threadName || undefined,
    threadInfo: parseMaybeJSON(row.threadInfo) || {},
    // IMPORTANT: return `null` when not banned. `{}` is truthy and causes false positives.
    banned: normalizeBanField(row.banned),
    settings: parseMaybeJSON(row.settings) || {},
    data: parseMaybeJSON(row.data) || {},
    messageCount: row.messageCount ? parseMaybeJSON(row.messageCount) : null,
    lastActive: row.lastActive || null,
    createdAt: row.createdAt ? Math.floor(new Date(row.createdAt).getTime() / 1000) : undefined,
    updatedAt: row.updatedAt ? Math.floor(new Date(row.updatedAt).getTime() / 1000) : undefined,
  };
};

class ThreadDataModel {
  private bot: any = null;
  setBot(bot: any): void {
    this.bot = bot;
  }

  async get(threadID: string | number): Promise<ThreadData | null> {
    try {
      // Some callers (especially during build/startup) may accidentally pass
      // undefined/null here. That isn't a hard error – just treat as "no data"
      // and avoid spamming the logs.
      if (threadID === undefined || threadID === null) {
        return null;
      }

      if (typeof threadID !== "string" && typeof threadID !== "number") {
        // Keep a warning for truly invalid types (objects, booleans, etc.)
        // but this should no longer trigger for the common "undefined" case.
        log.warn(`Skipped get thread: Invalid threadID value "${String(threadID)}"`);
        return null;
      }

      const tid = validateThreadID(threadID);
      const db = getDbPromisified();
      const row = await db.get("SELECT * FROM Thread WHERE threadID = ?", [tid]) as any;
      if (!row) return null;
      return rowToThreadData(row);
    } catch (error: any) {
      log.error(`Failed to get thread: ${error.message}`);
      return null;
    }
  }

  async create(threadID: string | number, data: Partial<ThreadData>): Promise<{ thread: ThreadData; created: boolean }> {
    try {
      const tid = validateThreadID(threadID);
      validateData(data);

      const defaults = { threadID: tid, ...omitBy(data, isUndefined) };
      const db = getDbPromisified();

      const existing = await db.get("SELECT threadID FROM Thread WHERE threadID = ?", [tid]);

      if (existing) {

        const updateFields: string[] = [];
        const updateValues: any[] = [];

        for (const [key, value] of Object.entries(defaults)) {
          if (key === "threadID") continue;
          updateFields.push(`${key} = ?`);
          if (key === "threadInfo" || key === "banned" || key === "settings" || key === "data" || key === "messageCount") {
            updateValues.push(value ? JSON.stringify(value) : null);
          } else {
            updateValues.push(value);
          }
        }

        if (updateFields.length > 0) {
          updateValues.push(tid);
          await db.run(
            `UPDATE Thread SET ${updateFields.join(", ")} WHERE threadID = ?`,
            updateValues
          );
        }

        const thread = await this.get(tid) as ThreadData;
        return { thread, created: false };
      } else {

        const fields: string[] = [];
        const placeholders: string[] = [];
        const values: any[] = [];

        const now = new Date().toISOString();
        if (!defaults.createdAt) defaults.createdAt = now as any;
        if (!defaults.updatedAt) defaults.updatedAt = now as any;

        for (const [key, value] of Object.entries(defaults)) {
          fields.push(key);
          placeholders.push("?");
          if (key === "threadInfo" || key === "banned" || key === "settings" || key === "data" || key === "messageCount") {
            values.push(value ? JSON.stringify(value) : null);
          } else if (key === "createdAt" || key === "updatedAt") {
            values.push(value);
          } else {
            values.push(value);
          }
        }

        await db.run(
          `INSERT INTO Thread (${fields.join(", ")}) VALUES (${placeholders.join(", ")})`,
          values
        );

        const thread = await this.get(tid) as ThreadData;
        return { thread, created: true };
      }
    } catch (error: any) {
      throw new Error(`Failed to create thread: ${error.message}`);
    }
  }

  async update(threadID: string | number, data: Partial<ThreadData>): Promise<{ thread: ThreadData; created: boolean }> {
    try {
      const tid = validateThreadID(threadID);
      validateData(data);

      const cleanedData = omitBy(data, isUndefined);
      const db = getDbPromisified();
      const existing = await db.get("SELECT * FROM Thread WHERE threadID = ?", [tid]) as any;

      if (existing) {
        // If caller passed only `undefined` fields, `cleanedData` becomes empty.
        // Treat this as a no-op instead of throwing.
        if (Object.keys(cleanedData).length === 0) {
          return { thread: rowToThreadData(existing), created: false };
        }

        const currentData = rowToThreadData(existing);
        const updatedData: any = {};

        for (const key of Object.keys(cleanedData)) {
          const nv = (cleanedData as any)[key];
          const ov = (currentData as any)[key];
          updatedData[key] = isPlainObject(nv) && isPlainObject(ov) ? { ...ov, ...nv } : nv;
        }

        const updateFields: string[] = [];
        const updateValues: any[] = [];

        for (const [key, value] of Object.entries(updatedData)) {
          updateFields.push(`${key} = ?`);
          if (key === "threadInfo" || key === "banned" || key === "settings" || key === "data" || key === "messageCount") {
            updateValues.push(value ? JSON.stringify(value) : null);
          } else {
            updateValues.push(value);
          }
        }

        // Defensive: avoid invalid SQL if something filtered all fields out.
        if (updateFields.length === 0) {
          const thread = await this.get(tid) as ThreadData;
          return { thread, created: false };
        }

        updateValues.push(tid);
        await db.run(
          `UPDATE Thread SET ${updateFields.join(", ")} WHERE threadID = ?`,
          updateValues
        );

        const thread = await this.get(tid) as ThreadData;
        return { thread, created: false };
      }

      if (Object.keys(cleanedData).length === 0) {
        throw new Error("No valid fields to update");
      }

      const fields: string[] = ["threadID"];
      const placeholders: string[] = ["?"];
      const values: any[] = [tid];

      const now = new Date().toISOString();
      if (!cleanedData.createdAt) cleanedData.createdAt = now as any;
      if (!cleanedData.updatedAt) cleanedData.updatedAt = now as any;

      for (const [key, value] of Object.entries(cleanedData)) {
        fields.push(key);
        placeholders.push("?");
        if (key === "threadInfo" || key === "banned" || key === "settings" || key === "data" || key === "messageCount") {
          values.push(value ? JSON.stringify(value) : null);
        } else if (key === "createdAt" || key === "updatedAt") {
          values.push(value);
        } else {
          values.push(value);
        }
      }

      await db.run(
        `INSERT INTO Thread (${fields.join(", ")}) VALUES (${placeholders.join(", ")})`,
        values
      );

      const thread = await this.get(tid) as ThreadData;
      return { thread, created: true };
    } catch (error: any) {
      throw new Error(`Failed to update thread: ${error.message}`);
    }
  }

  async del(threadID: string | number): Promise<number> {
    try {
      const tid = validateThreadID(threadID);
      const db = getDbPromisified();
      const result = await db.run("DELETE FROM Thread WHERE threadID = ?", [tid]);
      const changes = (result as any).changes || 0;
      if (changes === 0) throw new Error("Thread not found");
      return changes;
    } catch (error: any) {
      throw new Error(`Failed to delete thread: ${error.message}`);
    }
  }

  async delAll(): Promise<number> {
    try {
      const db = getDbPromisified();
      const result = await db.run("DELETE FROM Thread");
      return (result as any).changes || 0;
    } catch (error: any) {
      throw new Error(`Failed to delete all threads: ${error.message}`);
    }
  }

  async getAll(keys: string | string[] | null = null, options: { limit?: number; offset?: number; order?: any } = {}): Promise<any[]> {
    try {
      // SQLite supports `LIMIT -1` to mean "no limit".
      // Default should return ALL rows (some features rely on this).
      const limit = options.limit ?? -1;
      const offset = options.offset ?? 0;
      const order = options.order || [["createdAt", "DESC"]];

      let selectFields = "*";
      if (keys) {
        const fields = typeof keys === "string" ? [keys] : (Array.isArray(keys) && keys.length ? keys : []);
        if (fields.length > 0) {
          selectFields = fields.join(", ");
        }
      }

      const orderClause = Array.isArray(order[0])
        ? `${order[0][0]} ${order[0][1] || "DESC"}`
        : "createdAt DESC";

      const db = getDbPromisified();
      const results = await db.all(
        `SELECT ${selectFields} FROM Thread ORDER BY ${orderClause} LIMIT ? OFFSET ?`,
        [limit, offset]
      ) as any[];

      return results.map((t: any) => {
        const result: any = {};
        if (keys) {
          const fields = typeof keys === "string" ? [keys] : (Array.isArray(keys) && keys.length ? keys : []);
          if (fields.length > 0) {
            for (const field of fields) {
              result[field] = t[field];
            }
          } else {
            Object.assign(result, t);
          }
        } else {
          Object.assign(result, t);
        }

        if (result.threadInfo && typeof result.threadInfo === "string") {
          result.threadInfo = parseMaybeJSON(result.threadInfo);
        }
        if (result.banned !== undefined) result.banned = normalizeBanField(result.banned);
        if (result.settings && typeof result.settings === "string") {
          result.settings = parseMaybeJSON(result.settings);
        }
        if (result.data && typeof result.data === "string") {
          result.data = parseMaybeJSON(result.data);
        }
        if (result.messageCount && typeof result.messageCount === "string") {
          result.messageCount = parseMaybeJSON(result.messageCount);
        }
        return result;
      });
    } catch (error: any) {
      throw new Error(`Failed to get all threads: ${error.message}`);
    }
  }

  async idAll(): Promise<string[]> {
    try {
      const db = getDbPromisified();
      const rows = await db.all("SELECT threadID FROM Thread") as any[];
      return rows.map((r: any) => r.threadID);
    } catch (error: any) {
      throw new Error(`Failed to get all thread IDs: ${error.message}`);
    }
  }

  async info(threadID: string | number): Promise<any> {
    try {
      if (!this.bot) {
        log.warn("ThreadData.info: Bot instance not set");
        return null;
      }

      if (typeof this.bot.getThreadInfo !== "function") {
        log.warn("ThreadData.info: getThreadInfo method not available");
        return null;
      }

      return await this.bot.getThreadInfo(validateThreadID(threadID));
    } catch (error: any) {
      log.error(`ThreadData.info failed for ${threadID}: ${error.message}`);
      return null;
    }
  }

  async getName(threadID: string | number): Promise<string> {
    try {
      const thread = await this.get(validateThreadID(threadID));
      if (!thread || !thread.threadName) throw new Error("Thread name not found");
      return thread.threadName;
    } catch (error: any) {
      throw new Error(`Failed to get thread name: ${error.message}`);
    }
  }

  async getBanned(): Promise<Array<{ threadID: string; banned: Record<string, any> }>> {
    try {
      const db = getDbPromisified();
      const rows = await db.all("SELECT threadID, banned FROM Thread WHERE banned IS NOT NULL") as any[];

      return rows
        .filter((r: any) => r.banned && typeof r.banned === "string")
        .map((r: any) => ({ threadID: r.threadID, banned: parseMaybeJSON(r.banned) }))
        .filter((r: any) => r.threadID && typeof r.threadID === "string" && r.threadID.match(/^\d+$/))
        .filter((r: any) => r.banned && typeof r.banned === "object" && !Array.isArray(r.banned))
        .filter((r: any) => Object.keys(r.banned).length > 0);
    } catch (error: any) {
      throw new Error(`Failed to get banned data: ${error.message}`);
    }
  }

  async setBan(threadID: string | number, reason: any = null): Promise<ThreadData> {
    try {
      const tid = validateThreadID(threadID);
      const db = getDbPromisified();
      const row = await db.get("SELECT threadID FROM Thread WHERE threadID = ?", [tid]) as any;
      if (!row) throw new Error("Thread not found");

      const banData = reason == null ? null : { reason, time: Date.now() };
      await db.run("UPDATE Thread SET banned = ? WHERE threadID = ?", [
        banData ? JSON.stringify(banData) : null,
        tid
      ]);

      const thread = await this.get(tid) as ThreadData;
      return thread;
    } catch (error: any) {
      throw new Error(`Failed to set thread ban: ${error.message}`);
    }
  }

  async unban(threadID: string | number): Promise<ThreadData> {
    try {
      return await this.setBan(threadID, null);
    } catch (error: any) {
      throw new Error(`Failed to unban thread: ${error.message}`);
    }
  }

  async checkBan(threadID: string | number): Promise<Record<string, any> | null> {
    try {
      const tid = validateThreadID(threadID);
      const db = getDbPromisified();
      const row = await db.get("SELECT banned FROM Thread WHERE threadID = ?", [tid]) as any;
      if (!row) return null;
      return normalizeBanField(row.banned);
    } catch (error: any) {
      throw new Error(`Failed to check ban status: ${error.message}`);
    }
  }

  async getTopInteractions(threadID: string | number, limit: number = 15): Promise<{
    total: Array<{ id: string; count: number }>;
    week: Array<{ id: string; count: number }>;
    day: Array<{ id: string; count: number }>;
    month: Array<{ id: string; count: number }>;
    count: number;
  }> {
    try {
      const tid = validateThreadID(threadID);
      const db = getDbPromisified();
      const row = await db.get("SELECT messageCount FROM Thread WHERE threadID = ?", [tid]) as any;

      const mc = parseMaybeJSON(row?.messageCount) || {};
      const total = Array.isArray(mc.total) ? mc.total : [];
      const week = Array.isArray(mc.week) ? mc.week : [];
      const day = Array.isArray(mc.day) ? mc.day : [];
      const month = Array.isArray(mc.month) ? mc.month : [];
      const count = toNumber(mc.count, 0);

      const norm = (arr: any[]) =>
        arr
          .filter((i: any) => i && (typeof i.id === "string" || typeof i.id === "number"))
          .map((i: any) => ({ id: String(i.id), count: toNumber(i.count, 0) }))
          .sort((a, b) => b.count - a.count)
          .slice(0, limit);

      return { total: norm(total), week: norm(week), day: norm(day), month: norm(month), count };
    } catch (error: any) {
      throw new Error(`Failed to get interaction rankings: ${error.message}`);
    }
  }

  async getAllMessageCount(): Promise<Array<{ threadID: string; messageCount: any }>> {
    try {
      const db = getDbPromisified();
      // Chỉ select threads có messageCount và giới hạn số lượng
      const rows = await db.all(
        "SELECT threadID, messageCount FROM Thread WHERE messageCount IS NOT NULL LIMIT 1000"
      ) as any[];
      return rows.map((r: any) => ({
        threadID: String(r.threadID),
        messageCount: r.messageCount ? parseMaybeJSON(r.messageCount) : {
          total: [],
          week: [],
          day: [],
          month: [],
          previousTotal_day: 0,
          previousTotal_week: 0,
          previousTotal_month: 0,
        },
      }));
    } catch (e: any) {
      throw new Error(`Failed to get all message counts: ${e.message}`);
    }
  }

  async checkInactiveThreads(): Promise<string[]> {
    try {
      const db = getDbPromisified();
      const rows = await db.all("SELECT threadID, messageCount FROM Thread") as any[];
      const inactive: string[] = [];

      for (const r of rows) {
        const dayStats = Array.isArray(parseMaybeJSON(r.messageCount)?.day)
          ? parseMaybeJSON(r.messageCount).day
          : [];
        const hasActivity = dayStats.some((u: any) => String(u.id) !== String(this.bot?.id) && (u.count || 0) > 0);
        if (!hasActivity) inactive.push(String(r.threadID));
      }

      return inactive;
    } catch (error: any) {
      throw new Error(`Failed to check inactive threads: ${error.message}`);
    }
  }

  async set(threadID: string | number, data: Partial<ThreadData>): Promise<{ thread: ThreadData; created: boolean }> {
    try {
      const existing = await this.get(threadID);
      return existing ? await this.update(threadID, data) : await this.create(threadID, data);
    } catch (error: any) {
      throw new Error(`Failed to set thread: ${error.message}`);
    }
  }

  async getTopThreads(limit: number = 15): Promise<Array<{ threadID: string; name: string | null; messageCount: number }>> {
    try {
      const db = getDbPromisified();
      // Chỉ select threads có messageCount và giới hạn số lượng để tính toán
      const rows = await db.all(
        "SELECT threadID, threadName, messageCount FROM Thread WHERE messageCount IS NOT NULL ORDER BY updatedAt DESC LIMIT 500"
      ) as any[];

      return rows
        .map((r: any) => {
          const mc = parseMaybeJSON(r.messageCount) || {};
          const count = toNumber(mc.count, 0);
          return { threadID: String(r.threadID), name: r.threadName || null, messageCount: count };
        })
        .sort((a, b) => b.messageCount - a.messageCount)
        .slice(0, limit);
    } catch (error: any) {
      throw new Error(`Failed to get top threads: ${error.message}`);
    }
  }

  async getTopServerUsers(limit: number = 15): Promise<Array<{ userID: string; messageCount: number; threadCount: number }>> {
    try {
      const db = getDbPromisified();
      // Chỉ select threads có messageCount (không null) và giới hạn số lượng
      // Ưu tiên threads có hoạt động gần đây
      const rows = await db.all(
        "SELECT threadID, messageCount FROM Thread WHERE messageCount IS NOT NULL ORDER BY updatedAt DESC LIMIT 500"
      ) as any[];
      const userStats = new Map<string, { count: number; threads: Set<string> }>();

      for (const r of rows) {
        const mc = parseMaybeJSON(r.messageCount) || {};
        const total = Array.isArray(mc.total) ? mc.total : [];
        for (const u of total) {
          if (!u || (typeof u.id !== "string" && typeof u.id !== "number")) continue;
          const id = String(u.id);
          const stats = userStats.get(id) || { count: 0, threads: new Set<string>() };
          stats.count += toNumber(u.count, 0);
          stats.threads.add(String(r.threadID));
          userStats.set(id, stats);
        }
      }

      return Array.from(userStats.entries())
        .map(([userID, { count, threads }]) => ({ userID, messageCount: count, threadCount: threads.size }))
        .sort((a, b) => b.messageCount - a.messageCount)
        .slice(0, limit);
    } catch (error: any) {
      throw new Error(`Failed to get top server users: ${error.message}`);
    }
  }

  async getActiveThreads(): Promise<Array<{ threadID: string; name: string | null }>> {
    try {
      const db = getDbPromisified();
      const rows = await db.all("SELECT threadID, threadName, messageCount FROM Thread") as any[];

      return rows
        .filter((r: any) => {
          if (!r.threadID || typeof r.threadID !== "string" || !r.threadID.match(/^\d+$/)) return false;
          const mc = parseMaybeJSON(r.messageCount) || {};
          const day = Array.isArray(mc.day) ? mc.day : [];
          const week = Array.isArray(mc.week) ? mc.week : [];
          const hasHumanDay = day.some((u: any) => u && String(u.id) !== String(this.bot?.id) && (u.count || 0) > 0);
          const hasHumanWeek = week.some((u: any) => u && String(u.id) !== String(this.bot?.id) && (u.count || 0) > 0);
          return hasHumanDay || hasHumanWeek;
        })
        .map((r: any) => ({ threadID: r.threadID, name: r.threadName || null }));
    } catch (error: any) {
      throw new Error(`Failed to get active threads: ${error.message}`);
    }
  }

  async getThreadList(limit: number = 100, offset: number = 0): Promise<Array<{
    threadname: string | null;
    threadID: string;
    name: string | null;
    messageCount: any;
    banned: any;
    createdAt: Date;
    updatedAt: Date;
    threadInfo: any;
    isActive: boolean;
  }>> {
    try {
      const db = getDbPromisified();
      const rows = await db.all(
        `SELECT threadName, threadID, messageCount, banned, createdAt, updatedAt, threadInfo
         FROM Thread LIMIT ? OFFSET ?`,
        [limit, offset]
      ) as any[];

      return rows.map((r: any) => {
        const mc = parseMaybeJSON(r.messageCount) || {};
        const hasDaily = Array.isArray(mc.day) && mc.day.length > 0;
        const hasWeekly = Array.isArray(mc.week) && mc.week.length > 0;
        return {
          threadname: r.threadName || null,
          threadID: String(r.threadID),
          name: r.threadName || null,
          messageCount: mc,
          banned: parseMaybeJSON(r.banned) || null,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
          threadInfo: parseMaybeJSON(r.threadInfo) || {},
          isActive: hasDaily || hasWeekly,
        };
      });
    } catch (error: any) {
      throw new Error(`Failed to get thread list: ${error.message}`);
    }
  }

  async getOrCreate(threadID: string | number, defaultData?: Partial<ThreadData>): Promise<ThreadData> {
    try {
      const tid = validateThreadID(threadID);
      let thread = await this.get(tid);
      if (!thread) {
        const result = await this.create(tid, defaultData || {
          threadName: undefined,
          threadInfo: {},
          banned: {},
          settings: {},
          data: {},
          messageCount: undefined,
        });
        thread = result.thread;
      }
      return thread!;
    } catch (error: any) {
      log.error(`Error in getOrCreate thread ${threadID}: ${error.message}`);
      return {
        threadID: validateThreadID(threadID),
        threadName: defaultData?.threadName || undefined,
        threadInfo: defaultData?.threadInfo || {},
        banned: defaultData?.banned || {},
        settings: defaultData?.settings || {},
        data: defaultData?.data || {},
        messageCount: defaultData?.messageCount || undefined,
      };
    }
  }
}

let threadDataInstance: ThreadDataModel | null = null;

export function getThreadData(bot?: any): ThreadDataModel {
  if (!threadDataInstance) {
    threadDataInstance = new ThreadDataModel();
  }
  if (bot) {
    threadDataInstance.setBot(bot);
  }
  return threadDataInstance;
}
