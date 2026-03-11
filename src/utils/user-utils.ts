import logger from "./log";
import type { UserDataModel, Logger } from "@types";

export async function ensureUserRecord(
  userID: string,
  userData: UserDataModel,
  customLogger?: Logger,
): Promise<void> {
  try {
    const uid = String(userID);
    const existing = await userData.get(uid).catch(() => null);
    if (existing) return;
    if (typeof userData.info === "function") {
      const info = await userData.info(uid).catch(() => null);
      if (info) {
        const userInfo =
          typeof info === "object" && info !== null
            ? (info as {
                name?: unknown;
                firstName?: unknown;
                gender?: unknown;
              })
            : {};
        const name =
          (typeof userInfo.name === "string" ? userInfo.name : undefined) ||
          (typeof userInfo.firstName === "string"
            ? userInfo.firstName
            : undefined) ||
          "Unknown User";
        await userData.create(uid, {
          name,
          userInfo: userInfo as Record<string, unknown>,
          setting: {},
          gender:
            (typeof userInfo.gender === "string" ? userInfo.gender : null) ||
            null,
          data: {},
        });
        if (customLogger?.success) {
          customLogger.success(`DATABASE: New user: ${name} (${uid})`);
        } else {
          logger.system(`DATABASE: New user: ${name} (${uid})`);
        }
      }
    } else {
      await userData.create(uid, {
        name: "Unknown User",
        userInfo: {},
        setting: {},
        gender: null,
        data: {},
      });
    }
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    logger.error(`ensureUserRecord failed for ${userID}: ${error.message}`);
  }
}

// Chuẩn hóa danh sách adminIDs về dạng string[]
export function normalizeAdminIDs(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const result: string[] = [];
  for (const item of input) {
    if (typeof item === "string" || typeof item === "number") {
      result.push(String(item));
    } else if (item && typeof item === "object" && "id" in item) {
      const id = (item as { id: string | number | null | undefined }).id;
      if (id !== null && id !== undefined) {
        result.push(String(id));
      }
    }
  }
  return result;
}
