import { isPlainObject, isUndefined, omitBy } from "../../utils/lodash-helpers";
import log from "../../utils/log";
import { getDbPromisified } from "./schema";

export interface UserData {
  userID: string;
  name: string;
  gender?: string | null;
  // JSON-ish columns: allow `null` as an explicit "clear/reset" sentinel for updates.
  userInfo?: Record<string, unknown> | null;
  setting?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
  banned?: Record<string, { reason?: string; time?: number;[key: string]: unknown }> | null;
  joinedThreads?: Record<string, unknown> | null;
  exp?: number;
  money?: bigint;
  messageCount?: Record<string, unknown> | number | null;
  createdAt?: number;
  updatedAt?: number;
}

const validateUserID = (userID: any): string => {
  if (typeof userID !== "string" && typeof userID !== "number") {
    throw new Error("Invalid userID: must be a string or number.");
  }
  return String(userID);
};

const validateData = (data: any): void => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid data: must be a non-empty object.");
  }
};

const isValidAmount = (amount: any): boolean =>
  (typeof amount === "number" && Number.isInteger(amount) && amount >= 0) ||
  (typeof amount === "bigint" && amount >= 0n);

const toBigIntMoney = (raw: any): bigint => {
  try {
    if (raw === undefined || raw === null) return 0n;
    if (typeof raw === "bigint") return raw;
    if (typeof raw === "number") {
      if (!Number.isFinite(raw)) return 0n;
      return BigInt(Math.trunc(raw));
    }
    const s = String(raw).trim();
    if (!s) return 0n;
    if (/^-?\d+$/.test(s)) return BigInt(s);
    if (/^-?\d+\.\d+$/.test(s)) {
      const intPart = s.split(".")[0];
      return BigInt(intPart);
    }
    // Fallback best-effort.
    return BigInt(s);
  } catch {
    return 0n;
  }
};

const parseJSONField = (field: any, defaultValue: any = {}): any => {
  if (typeof field === "string" && field.trim()) {
    try {
      return JSON.parse(field);
    } catch {
      return defaultValue;
    }
  }
  return field ?? defaultValue;
};

const normalizeBanField = (raw: any): Record<string, any> | null => {
  // DB may store NULL, empty string, "{}", or a real object.
  const parsed = parseJSONField(raw, null);
  if (!parsed) return null;
  if (typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return Object.keys(parsed).length > 0 ? (parsed as Record<string, any>) : null;
};

const stringifyBanField = (value: any): string | null => {
  // Treat null/undefined/{} as "not banned" -> store NULL
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const rowToUserData = (row: any): UserData => {
  return {
    userID: row.userID,
    name: row.name,
    gender: row.gender,
    userInfo: parseJSONField(row.userInfo),
    setting: parseJSONField(row.setting),
    data: parseJSONField(row.data),
    // IMPORTANT: return `null` when not banned. `{}` is truthy and causes false positives.
    banned: normalizeBanField(row.banned),
    joinedThreads: parseJSONField(row.joinedThreads),
    exp: row.exp || 0,
    money: toBigIntMoney(row.money),
    messageCount: parseJSONField(row.messageCount),
    createdAt: row.createdAt ? Math.floor(new Date(row.createdAt).getTime() / 1000) : undefined,
    updatedAt: row.updatedAt ? Math.floor(new Date(row.updatedAt).getTime() / 1000) : undefined,
  };
};

class UserDataModel {
  private bot: any = null;
  setBot(bot: any): void {
    this.bot = bot;
  }

  async get(userID: string | number): Promise<UserData | null> {
    try {
      const uid = validateUserID(userID);
      const db = getDbPromisified();
      const row = await db.get(
        `SELECT userID, name, gender, userInfo, setting, data, banned, joinedThreads, exp, money, messageCount,
         createdAt, updatedAt
         FROM User WHERE userID = ? LIMIT 1`,
        [uid]
      ) as any;

      if (!row) return null;
      return rowToUserData(row);
    } catch (error: any) {
      log.error(`Failed to get user: ${error.message}`);
      return null;
    }
  }

  async create(userID: string | number, data: Partial<UserData>): Promise<UserData> {
    try {
      const uid = validateUserID(userID);
      validateData(data);

      const cleanedData = omitBy({ ...data, userID: uid }, (val) => val === undefined);

      const db = getDbPromisified();

      const existing = await db.get("SELECT userID FROM User WHERE userID = ?", [uid]);

      if (existing) {

        const updateFields: string[] = [];
        const updateValues: any[] = [];

        for (const [key, value] of Object.entries(cleanedData)) {
          if (key === "userID") continue;
          updateFields.push(`${key} = ?`);
          if (key === "userInfo" || key === "setting" || key === "data" || key === "banned" || key === "joinedThreads" || key === "messageCount") {
            if (key === "banned") updateValues.push(stringifyBanField(value));
            else updateValues.push(JSON.stringify(value || {}));
          } else {
            updateValues.push(key === "money" && typeof value === "bigint" ? value.toString() : value);
          }
        }

        if (updateFields.length > 0) {
          updateValues.push(uid);
          await db.run(
            `UPDATE User SET ${updateFields.join(", ")} WHERE userID = ?`,
            updateValues
          );
        }

        return await this.get(uid) as UserData;
      } else {

        const fields: string[] = [];
        const placeholders: string[] = [];
        const values: any[] = [];

        const now = new Date().toISOString();
        if (!cleanedData.createdAt) cleanedData.createdAt = now as any;
        if (!cleanedData.updatedAt) cleanedData.updatedAt = now as any;

        for (const [key, value] of Object.entries(cleanedData)) {
          fields.push(key);
          placeholders.push("?");
          if (key === "userInfo" || key === "setting" || key === "data" || key === "banned" || key === "joinedThreads" || key === "messageCount") {
            if (key === "banned") values.push(stringifyBanField(value));
            else values.push(JSON.stringify(value || {}));
          } else if (key === "createdAt" || key === "updatedAt") {
            values.push(value);
          } else {
            values.push(key === "money" && typeof value === "bigint" ? value.toString() : value);
          }
        }

        await db.run(
          `INSERT INTO User (${fields.join(", ")}) VALUES (${placeholders.join(", ")})`,
          values
        );

        return await this.get(uid) as UserData;
      }
    } catch (error: any) {
      // If another process/thread created the user between the existence check and INSERT,
      // SQLite will throw a UNIQUE constraint error. Treat this as "user already exists"
      // and fall back to updating the existing record instead of failing hard.
      if (
        typeof error.message === "string" &&
        error.message.includes("SQLITE_CONSTRAINT: UNIQUE constraint failed: User.userID")
      ) {
        const uid = validateUserID(userID);
        const { user } = await this.update(uid, data);
        return user;
      }

      const errorMessage = error.message.includes("Validation error")
        ? error.message
        : `Failed to create or update user: ${error.message}`;
      throw new Error(errorMessage);
    }
  }

  async update(userID: string | number, data: Partial<UserData>): Promise<{ user: UserData; created: boolean }> {
    try {
      const uid = validateUserID(userID);
      validateData(data);

      const cleanedData = omitBy(data, isUndefined);
      const db = getDbPromisified();

      const existing = await db.get("SELECT * FROM User WHERE userID = ?", [uid]) as any;

      if (existing) {
        // If caller passed only `undefined` fields, `cleanedData` becomes empty and would
        // generate invalid SQL: `UPDATE User SET  WHERE ...`. Treat this as a no-op.
        if (Object.keys(cleanedData).length === 0) {
          return { user: rowToUserData(existing), created: false };
        }

        const currentData = rowToUserData(existing);
        const updatedData: any = {};

        for (const [key, newValue] of Object.entries(cleanedData)) {
          const oldValue = (currentData as any)[key];
          updatedData[key] = isPlainObject(newValue) && isPlainObject(oldValue)
            ? { ...(oldValue as Record<string, unknown>), ...(newValue as Record<string, unknown>) }
            : newValue;
        }

        const updateFields: string[] = [];
        const updateValues: any[] = [];

        for (const [key, value] of Object.entries(updatedData)) {
          updateFields.push(`${key} = ?`);
          if (key === "userInfo" || key === "setting" || key === "data" || key === "banned" || key === "joinedThreads" || key === "messageCount") {
            if (key === "banned") updateValues.push(stringifyBanField(value));
            else updateValues.push(JSON.stringify(value || {}));
          } else {
            updateValues.push(key === "money" && typeof value === "bigint" ? value.toString() : value);
          }
        }

        // Defensive: avoid invalid SQL if something filtered all fields out.
        if (updateFields.length === 0) {
          const user = await this.get(uid) as UserData;
          return { user, created: false };
        }

        updateValues.push(uid);
        await db.run(
          `UPDATE User SET ${updateFields.join(", ")} WHERE userID = ?`,
          updateValues
        );

        const user = await this.get(uid) as UserData;
        return { user, created: false };
      }

      const fields: string[] = ["userID"];
      const placeholders: string[] = ["?"];
      const values: any[] = [uid];

      const now = new Date().toISOString();
      if (!cleanedData.createdAt) cleanedData.createdAt = now as any;
      if (!cleanedData.updatedAt) cleanedData.updatedAt = now as any;
      // User.name is NOT NULL: ensure name is set when inserting new user
      if (cleanedData.name === undefined || cleanedData.name === null || String(cleanedData.name).trim() === "") {
        cleanedData.name = `User ${uid}`;
      }

      for (const [key, value] of Object.entries(cleanedData)) {
        fields.push(key);
        placeholders.push("?");
        if (key === "userInfo" || key === "setting" || key === "data" || key === "banned" || key === "joinedThreads" || key === "messageCount") {
          values.push(JSON.stringify(value || {}));
        } else if (key === "createdAt" || key === "updatedAt") {
          values.push(value);
        } else {
            values.push(key === "money" && typeof value === "bigint" ? value.toString() : value);
        }
      }

      await db.run(
        `INSERT INTO User (${fields.join(", ")}) VALUES (${placeholders.join(", ")})`,
        values
      );

      const user = await this.get(uid) as UserData;
      return { user, created: true };
    } catch (error: any) {
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }

  async del(userID: string | number): Promise<number> {
    try {
      const uid = validateUserID(userID);
      const db = getDbPromisified();
      const result = await db.run("DELETE FROM User WHERE userID = ?", [uid]);
      return (result as any).changes || 0;
    } catch (error: any) {
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }

  async delAll(): Promise<number> {
    try {
      const db = getDbPromisified();
      const result = await db.run("DELETE FROM User");
      return (result as any).changes || 0;
    } catch (error: any) {
      throw new Error(`Failed to delete all users: ${error.message}`);
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
        const fields = typeof keys === "string" ? [keys] : keys;
        selectFields = fields.join(", ");
      }

      const orderClause = Array.isArray(order[0])
        ? `${order[0][0]} ${order[0][1] || "DESC"}`
        : "createdAt DESC";

      const db = getDbPromisified();
      const results = await db.all(
        `SELECT ${selectFields} FROM User ORDER BY ${orderClause} LIMIT ? OFFSET ?`,
        [limit, offset]
      ) as any[];

      return results.map((u: any) => {
        const result: any = {};
        if (keys) {
          const fields = typeof keys === "string" ? [keys] : keys;
          for (const field of fields) {
            result[field] = u[field];
          }
        } else {
          Object.assign(result, u);
        }

        if (result.userInfo !== undefined) result.userInfo = parseJSONField(result.userInfo);
        if (result.setting !== undefined) result.setting = parseJSONField(result.setting);
        if (result.data !== undefined) result.data = parseJSONField(result.data);
        if (result.banned !== undefined) result.banned = normalizeBanField(result.banned);
        if (result.joinedThreads !== undefined) result.joinedThreads = parseJSONField(result.joinedThreads);
        if (result.money !== undefined) result.money = toBigIntMoney(result.money);
        if (result.messageCount !== undefined) result.messageCount = parseJSONField(result.messageCount);

        return result;
      });
    } catch (error: any) {
      throw new Error(`Failed to get all users: ${error.message}`);
    }
  }

  async idAll(): Promise<string[]> {
    try {
      const db = getDbPromisified();
      const results = await db.all("SELECT userID FROM User") as any[];
      return results.map((row: any) => row.userID);
    } catch (error: any) {
      throw new Error(`Failed to get all user IDs: ${error.message}`);
    }
  }

  async info(userID: string | number): Promise<any> {
    try {
      return (await this.bot.getUserInfo(validateUserID(userID)))[validateUserID(userID)];
    } catch {
      return false;
    }
  }

  async checkMoney(userID: string | number): Promise<bigint> {
    try {
      const uid = validateUserID(userID);
      const db = getDbPromisified();
      let row = await db.get("SELECT money FROM User WHERE userID = ? LIMIT 1", [uid]) as any;
      if (!row) {
        // Tự động tạo user với money = 0 nếu chưa tồn tại
        await this.set(uid, {
          name: `User ${uid}`,
          money: 0n,
          userInfo: {},
          setting: {},
          data: {},
        });
        row = await db.get("SELECT money FROM User WHERE userID = ? LIMIT 1", [uid]) as any;
        if (!row) {
          throw new Error(`Failed to create user with ID ${uid}.`);
        }
      }
      return toBigIntMoney(row.money);
    } catch (error: any) {
      throw new Error(`Failed to check money: ${error.message}`);
    }
  }

  async addMoney(userID: string | number, amount: number | bigint): Promise<bigint> {
    try {
      if (!isValidAmount(amount)) {
        throw new Error("Amount must be a non-negative integer or BigInt.");
      }
      const uid = validateUserID(userID);
      const db = getDbPromisified();

      // Đảm bảo user tồn tại, tự động tạo nếu chưa có
      let row = await db.get("SELECT money FROM User WHERE userID = ?", [uid]) as any;
      if (!row) {
        // Tự động tạo user với money = 0 nếu chưa tồn tại
        await this.set(uid, {
          name: `User ${uid}`,
          money: 0n,
          userInfo: {},
          setting: {},
          data: {},
        });
      }

      // BigInt addition in JS to avoid SQLite REAL precision loss on very large numbers.
      const currentRow = await db.get("SELECT money FROM User WHERE userID = ?", [uid]) as any;
      const currentMoney = toBigIntMoney(currentRow?.money);
      const addAmount = BigInt(String(amount));
      const finalMoney = currentMoney + addAmount;

      await db.run("UPDATE User SET money = ? WHERE userID = ?", [finalMoney.toString(), uid]);
      return finalMoney;
    } catch (error: any) {
      // Tránh bọc lại lỗi nếu đã có prefix "Failed to add money"
      if (error.message && error.message.startsWith("Failed to add money:")) {
        throw error;
      }
      throw new Error(`Failed to add money: ${error.message}`);
    }
  }

  async delMoney(userID: string | number, amount: number | bigint): Promise<bigint> {
    try {
      if (!isValidAmount(amount)) {
        throw new Error("Amount must be a non-negative integer or BigInt.");
      }
      const uid = validateUserID(userID);
      const db = getDbPromisified();

      // Đảm bảo user tồn tại, tự động tạo nếu chưa có
      let row = await db.get("SELECT money FROM User WHERE userID = ?", [uid]) as any;
      if (!row) {
        // Tự động tạo user với money = 0 nếu chưa tồn tại
        await this.set(uid, {
          name: `User ${uid}`,
          money: 0n,
          userInfo: {},
          setting: {},
          data: {},
        });
        row = await db.get("SELECT money FROM User WHERE userID = ?", [uid]) as any;
        if (!row) {
          throw new Error(`Failed to create user with ID ${uid}.`);
        }
      }

      const currentMoney = toBigIntMoney(row.money);
      const subtractAmount = BigInt(String(amount));

      // Kiểm tra số dư
      if (currentMoney < subtractAmount) {
        throw new Error(`Insufficient funds. Current balance: ${currentMoney}, required: ${subtractAmount}.`);
      }

      const newMoney = currentMoney - subtractAmount;

      // BigInt subtraction in JS to avoid SQLite REAL precision loss.
      await db.run("UPDATE User SET money = ? WHERE userID = ?", [newMoney.toString(), uid]);
      return newMoney;
    } catch (error: any) {
      // Tránh bọc lại lỗi nếu đã có prefix "Failed to deduct money" hoặc "Insufficient funds"
      if (error.message && (
        error.message.startsWith("Failed to deduct money:") ||
        error.message.startsWith("Insufficient funds.")
      )) {
        throw error;
      }
      throw new Error(`Failed to deduct money: ${error.message}`);
    }
  }

  async setMoney(userID: string | number, amount: number | bigint): Promise<bigint> {
    try {
      if (!isValidAmount(amount)) {
        throw new Error("Amount must be a non-negative integer or BigInt.");
      }
      const uid = validateUserID(userID);
      const db = getDbPromisified();
      let row = await db.get("SELECT userID FROM User WHERE userID = ?", [uid]) as any;
      if (!row) {
        // Tự động tạo user với money = amount nếu chưa tồn tại
        const moneyValue = typeof amount === "bigint" ? amount : BigInt(String(amount));
        await this.set(uid, {
          name: `User ${uid}`,
          money: moneyValue,
          userInfo: {},
          setting: {},
          data: {},
        });
        return moneyValue;
      }
      const moneyValue = typeof amount === "bigint" ? amount : BigInt(String(amount));
      await db.run("UPDATE User SET money = ? WHERE userID = ?", [moneyValue.toString(), uid]);
      return moneyValue;
    } catch (error: any) {
      // Tránh bọc lại lỗi nếu đã có prefix "Failed to set money"
      if (error.message && error.message.startsWith("Failed to set money:")) {
        throw error;
      }
      throw new Error(`Failed to set money: ${error.message}`);
    }
  }

  async getName(userID: string | number): Promise<string | undefined> {
    try {
      const uid = validateUserID(userID);
      const db = getDbPromisified();
      const row = await db.get("SELECT name FROM User WHERE userID = ? LIMIT 1", [uid]) as any;
      return row?.name;
    } catch (error: any) {
      throw new Error(`Failed to get name: ${error.message}`);
    }
  }

  async getBanned(): Promise<Array<{ userID: string; banned: Record<string, any> }>> {
    try {
      const db = getDbPromisified();
      const results = await db.all(
        `SELECT userID, banned FROM User WHERE banned IS NOT NULL AND banned != '{}' AND banned != ''`
      ) as any[];

      const filteredUsers: Array<{ userID: string; banned: Record<string, any> }> = [];
      for (const row of results) {
        if (!row.banned) continue;
        const banned = parseJSONField(row.banned);
        if (banned && typeof banned === 'object' && Object.keys(banned).length > 0) {
          filteredUsers.push({ userID: row.userID, banned });
        }
      }
      return filteredUsers;
    } catch (error: any) {
      throw new Error(`Failed to get banned data: ${error.message}`);
    }
  }

  async getTopMoneyThread(participantIDs: string[], limit: number = 10): Promise<Array<{ userID: string; money: bigint }>> {
    try {
      if (!Array.isArray(participantIDs) || !participantIDs.length) {
        throw new Error("Participant IDs must be a non-empty array.");
      }
      const db = getDbPromisified();
      const placeholders = participantIDs.map(() => '?').join(',');
      const results = await db.all(
        `SELECT userID, money FROM User WHERE userID IN (${placeholders})
         ORDER BY LENGTH(CAST(money AS TEXT)) DESC, CAST(money AS TEXT) DESC
         LIMIT ?`,
        [...participantIDs, limit]
      ) as any[];
      return results.map((row: any) => ({ userID: row.userID, money: toBigIntMoney(row.money) }));
    } catch (error: any) {
      throw new Error(`Failed to get top money: ${error.message}`);
    }
  }

  async getTopMoneyServer(limit: number = 10): Promise<Array<{ userID: string; money: bigint }>> {
    try {
      const db = getDbPromisified();
      const results = await db.all(
        `SELECT userID, money FROM User
         ORDER BY LENGTH(CAST(money AS TEXT)) DESC, CAST(money AS TEXT) DESC
         LIMIT ?`,
        [limit]
      ) as any[];
      return results.map((row: any) => ({ userID: row.userID, money: toBigIntMoney(row.money) }));
    } catch (error: any) {
      throw new Error(`Failed to get top money in server: ${error.message}`);
    }
  }

  async getTopExp(limit: number = 10): Promise<Array<{ userID: string; exp: number }>> {
    try {
      const db = getDbPromisified();
      // Cast to REAL so ordering works even if `exp` is stored as TEXT.
      const results = await db.all(
        `SELECT userID, exp
         FROM User
         WHERE exp IS NOT NULL AND CAST(COALESCE(exp, 0) AS REAL) > 0
         ORDER BY CAST(COALESCE(exp, 0) AS REAL) DESC
         LIMIT ?`,
        [limit]
      ) as any[];

      return results.map((row: any) => {
        const expNum = Number(row.exp);
        return {
          userID: String(row.userID),
          exp: Number.isFinite(expNum) && expNum >= 0 ? expNum : 0
        };
      });
    } catch (error: any) {
      throw new Error(`Failed to get top exp in server: ${error.message}`);
    }
  }

  async setBan(userID: string | number, reason: any = null): Promise<Record<string, any>> {
    try {
      const uid = validateUserID(userID);
      const db = getDbPromisified();
      const row = await db.get("SELECT userID FROM User WHERE userID = ?", [uid]) as any;
      if (!row) {
        throw new Error(`User with ID ${uid} not found.`);
      }
      const banData = { reason, time: Date.now() };
      await db.run("UPDATE User SET banned = ? WHERE userID = ?", [JSON.stringify(banData), uid]);
      return banData;
    } catch (error: any) {
      throw new Error(`Failed to ban user: ${error.message}`);
    }
  }

  async unBan(userID: string | number): Promise<boolean> {
    try {
      const uid = validateUserID(userID);
      const db = getDbPromisified();
      const row = await db.get("SELECT userID FROM User WHERE userID = ?", [uid]) as any;
      if (!row) {
        throw new Error(`User with ID ${uid} not found.`);
      }
      await db.run("UPDATE User SET banned = NULL WHERE userID = ?", [uid]);
      return true;
    } catch (error: any) {
      throw new Error(`Failed to unban user: ${error.message}`);
    }
  }

  async checkBan(userID: string | number): Promise<Record<string, any> | null> {
    try {
      const uid = validateUserID(userID);
      const db = getDbPromisified();
      const row = await db.get("SELECT banned FROM User WHERE userID = ? LIMIT 1", [uid]) as any;
      if (!row) return null;
      return normalizeBanField(row.banned);
    } catch (error: any) {
      throw new Error(`Failed to check ban status: ${error.message}`);
    }
  }

  async set(userID: string | number, data: Partial<UserData>): Promise<{ user: UserData; created: boolean }> {
    try {
      const existing = await this.get(userID);
      if (existing) {
        return await this.update(userID, data);
      } else {
        const created = await this.create(userID, data);
        return { user: created, created: true };
      }
    } catch (error: any) {
      throw new Error(`Failed to set user data: ${error.message}`);
    }
  }
}

let userDataInstance: UserDataModel | null = null;

export function getUserData(bot?: any): UserDataModel {
  if (!userDataInstance) {
    userDataInstance = new UserDataModel();
  }
  if (bot) {
    userDataInstance.setBot(bot);
  }
  return userDataInstance;
}
