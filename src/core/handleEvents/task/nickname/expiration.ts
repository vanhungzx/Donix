import fs from "fs-extra";
import path from "path";
import type { Bot, Logger, BotThreadInfo, ThreadDataStore, UserDataStore } from "../types";
import { remDays } from "../utils";
import type { FacebookClient } from "../../../../types/client";
export async function notifyExp(
  client: FacebookClient,
  logger: Logger | undefined,
  threadData: ThreadDataStore,
  userData: UserDataStore
): Promise<void> {
  try {
    const rent: Array<{ threadID?: string; endDate?: string }> =
      (await fs.readJson(path.join(process.cwd(), "src/storage/rent/rent.json")).catch(() => [])) as any;

    const list = Array.isArray(rent)
      ? rent
          .map(r => ({ ...r, d: remDays(r.endDate || "") }))
          .filter((r: any) => r.d === 1)
      : [];
    if (!list.length) return;

    await Promise.allSettled(
      list.map(async r => {
        try {
          const info = await threadData.get(String(r.threadID));
          const threadInfo: BotThreadInfo = info?.data?.threadInfo || {};
          const rawAdmins = Array.isArray(threadInfo.adminIDs) ? threadInfo.adminIDs : [];
          const ads = rawAdmins
            .map(a => (typeof a === "string" ? { id: a } : a))
            .filter(a => a && typeof a.id === "string");
          if (!ads.length) return;

          const men = await Promise.all(
            ads.map(async a => {
              const name = await userData.getName?.(a.id);
              return { tag: name || a.id, id: a.id };
            })
          );

          const msg = {
            body: `⚠️ Nhóm sẽ hết hạn thuê bot sau 1 ngày\n${men.map(m => m.tag).join(", ")}\n📅 Hạn cuối: ${r.endDate
              }\nVui lòng gia hạn sớm để tránh gián đoạn.`,
            mentions: men
          };
          await client.sendMessage(msg, String(r.threadID));
        } catch (e: any) {
          logger?.error?.(`Notify fail ${r.threadID}:`, e?.message ?? e);
        }
      })
    );
  } catch (e: any) {
    logger?.error?.("Notify exp err:", e?.message ?? e);
  }
}
