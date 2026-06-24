import type { ExtendedMessageEvent, MainData, ThreadDataModel, UserDataModel } from "@types";
import type { ThreadData } from "../core/database/thread-data";
import logger from "./log";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function dataInit(
  main: MainData,
  ev: ExtendedMessageEvent,
  threadData: ThreadDataModel,
  userData: UserDataModel
): Promise<boolean> {
  if (!ev?.isGroup) return false;

  const tid = String(ev.threadID);
  const key = `t_${tid}`;

  if (!main.processData) main.processData = new Map();
  if (main.processData.has(key)) return false;

  main.processData.set(key, true);

  try {
    const ex = await threadData.get(tid).catch(() => null);
    const needCreate = !ex;

    let info: Record<string, unknown> | null = null;

    if (needCreate) {
      {
        const threadName = typeof ev.threadName === 'string' ? ev.threadName : "Unknown Group";
        const basicPayload = {
          threadName,
          threadInfo: {
            threadID: tid,
            threadName,
            participantIDs: Array.isArray(ev.participantIDs) ? ev.participantIDs.map(String) : [],
          },
          banned: {},
          settings: {},
          data: {},
        };

        try {
          await threadData.create(tid, basicPayload);
          logger.system(`DATABASE: New thread (basic): ${threadName} (${tid})`);
          return true;
        } catch (createError: unknown) {
          const error = createError instanceof Error ? createError : new Error(String(createError));
          logger.error(`THREAD: Failed to create thread ${tid}: ${error.message}`);
          return false;
        }
      }
    } else {
      const hasThreadInfo =
        !!ex.threadInfo && typeof ex.threadInfo === "object" && Object.keys(ex.threadInfo).length > 0;
      const nameFromEx = ex.threadName || ex.threadInfo?.threadName;
      const needFix = !hasThreadInfo || !nameFromEx;

      if (needFix) {
        const threadName = ex.threadName || (typeof ev.threadName === 'string' ? ev.threadName : "Unknown Group");
        info = {
          ...(typeof ex.threadInfo === "object" && ex.threadInfo ? ex.threadInfo : {}),
          threadID: tid,
          threadName,
          participantIDs: Array.isArray(ev.participantIDs) ? ev.participantIDs.map(String) : [],
        };
      }
    }

    if (needCreate || info) {
      const base: Partial<ThreadData> = ex || {};
      const infoName = info && typeof info === 'object' && 'threadName' in info && typeof info.threadName === 'string' ? info.threadName : undefined;
      const baseThreadInfo = base.threadInfo && typeof base.threadInfo === 'object' && 'threadName' in base.threadInfo && typeof base.threadInfo.threadName === 'string' ? base.threadInfo.threadName : undefined;
      const evThreadName = typeof ev.threadName === 'string' ? ev.threadName : undefined;
      const name: string = infoName || base.threadName || baseThreadInfo || evThreadName || "Unknown";

      const payload: Partial<ThreadData> = {
        threadName: name,
        threadInfo: info || base.threadInfo || {},
        banned: base.banned || {},
        settings: base.settings || {},
        data: base.data || {},
      };

      if (needCreate) {
        try {
          await threadData.create(tid, payload);
          logger.system(`DATABASE: New thread: ${payload.threadName} (${tid})`);
        } catch (createError: unknown) {
          const error = createError instanceof Error ? createError : new Error(String(createError));
          if (error.message?.includes("already exists") || error.message?.includes("unique")) {
            logger.warn(`THREAD: Thread ${tid} already exists, updating instead`);
            await threadData.update(tid, payload);
            logger.system(`DATABASE: Updated thread: ${payload.threadName} (${tid})`);
          } else {
            throw createError;
          }
        }
      } else {
        await threadData.update(tid, payload);
        logger.system(`DATABASE: Updated thread: ${payload.threadName} (${tid})`);
      }

      await delay(300);

      const userInfo = info && typeof info === 'object' && 'userInfo' in info && Array.isArray(info.userInfo) ? info.userInfo : [];
      for (let i = 0; i < userInfo.length; i += 5) {
        await Promise.all(
          userInfo.slice(i, i + 5).map(async (u: unknown) => {
            const user = typeof u === 'object' && u !== null ? u as { id?: unknown; name?: unknown; gender?: unknown } : {};
            const uid = String(user.id || '');
            if (!uid) return;
            const ok = await userData.get(uid);

            if (!ok) {
              await userData.create(uid, {
                name: (typeof user.name === 'string' ? user.name : undefined) || "Undefined User",
                userInfo: user as Record<string, unknown>,
                setting: {},
                gender: (typeof user.gender === 'string' ? user.gender : null) || null,
                data: {},
              });
              logger.system(`DATABASE: New user: ${(typeof user.name === 'string' ? user.name : undefined) || "Unknown"} (${uid})`);
            }
          })
        );

        if (i + 5 < userInfo.length) await delay(200);
      }
    } else if (ex && !ex.threadName) {
      const threadInfoName = ex.threadInfo && typeof ex.threadInfo === 'object' && 'threadName' in ex.threadInfo && typeof ex.threadInfo.threadName === 'string' ? ex.threadInfo.threadName : undefined;
      if (threadInfoName) {
        await threadData.update(tid, { threadName: threadInfoName });
      }
    }

    return true;
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    logger.error(`Error processing thread ${tid}: ${error.message}`);
    return false;
  } finally {

    main.processData.delete(key);

    const now = Date.now();
    const cleanupKey = `__lastCleanup_${tid}`;
    const mainWithCleanup = main as MainData & { [key: string]: unknown };
    const lastCleanup = (typeof mainWithCleanup[cleanupKey] === 'number' ? mainWithCleanup[cleanupKey] : 0) as number;
    const CLEANUP_INTERVAL = 2 * 60 * 1000;
    const MAX_AGE = 10 * 60 * 1000;

    if (main.processData.size > 300 || (now - lastCleanup > CLEANUP_INTERVAL)) {
      const entries = Array.from(main.processData.entries());
      let cleaned = 0;
      for (const [k, v] of entries as [string, boolean][]) {

        if (k.startsWith('t_')) {
          if (typeof v === 'number' && now - v > MAX_AGE) {
            main.processData.delete(k);
            cleaned++;
          } else if (v === true) {

            continue;
          }
        }
      }
      if (cleaned > 0) {
        logger.info(`Đã cleanup ${cleaned} old processData entries`);
      }
      mainWithCleanup[cleanupKey] = now;
    }
  }
}
