import fs from "fs-extra";
import path from "path";
import type { Logger, ThreadDataStore, Config } from "../types";
import { slp, remDays, nicknameFor } from "../utils";
import type { FacebookClient } from "../../../../types/client";
import { RENT_JSON_PATH } from "../../../storagePath";

export async function updNick(
  client: FacebookClient,
  logger: Logger | undefined,
  threadData: ThreadDataStore,
  config: Config
): Promise<void> {
  const skip = new Set(["8302766259746371", "9425058504221272", "6978344125578487"]);
  let rent: Array<{ threadID?: string; endDate?: string }> = [];
  try {
    const p = RENT_JSON_PATH();
    const dir = path.dirname(p);


    await fs.ensureDir(dir);


    try {
      const raw = await fs.readFile(p, "utf-8");
      if (raw && raw.trim()) {
        rent = JSON.parse(raw);
      }
    } catch (readError: any) {

      if (readError.code === "ENOENT" || readError instanceof SyntaxError) {
        await fs.writeJson(p, [], { spaces: 2 });
        rent = [];
      } else {
        throw readError;
      }
    }

    if (!Array.isArray(rent)) {
      logger?.warn?.("Rent data is not an array, resetting to empty array");
      rent = [];
      await fs.writeJson(p, [], { spaces: 2 });
    }
  } catch (e: any) {
    const errorMsg = e?.message || e?.toString() || String(e);
    logger?.error?.("Rent data err:", errorMsg);
    rent = [];
  }

  let uid = "";
  try {
    uid = String(client?.id ?? "") || String((await client.getCurrentUserID?.()) || "");
    if (!uid) return;
  } catch (e: any) {
    logger?.error?.("Get UID fail:", e?.message ?? e);
    return;
  }

  const pre0 = config?.PREFIX || "!";
  const botname = config?.BOTNAME || "DonixBot";
  const groups = [...new Set(rent.map(x => String(x?.threadID || "").trim()).filter(id => id && !skip.has(id)))];

  for (let i = 0; i < groups.length; i += 3) {
    const batch = groups.slice(i, i + 3);
    await Promise.allSettled(
      batch.map(async tid => {
        try {
          const inf = await threadData.get(String(tid));
          const pre = inf?.data?.PREFIX || pre0;
          const r = rent.find($ => String($.threadID) === String(tid));
          let nn = `[ ${pre} ] • ${botname} || ❎ Chưa thuê`;
          if (r && r.endDate) {
            const d = remDays(r.endDate);
            nn = nicknameFor(pre, botname, d);
          }
          await client.sendMessage("🔄 Bot sẽ cập nhật biệt danh sau vài giây...", String(tid));
          await slp(3000);
          await client.changeNickname(nn, String(tid), uid);
        } catch (e: any) {
          logger?.error?.(`Nickname ${tid}:`, e?.message ?? e);
        }
      })
    );
    if (i + 3 < groups.length) await slp(2000);
  }
}
