import type { EventContext } from "@types";
import fs from "fs-extra";
import { RENT_JSON_PATH, RENT_KEYS_PATH } from "../../core/storagePath";

const RENT_PATH = RENT_JSON_PATH();
const KEYS_PATH = RENT_KEYS_PATH();

const clearRentEvent = {
  name: "cleanRent",
  type: "log:unsubscribe",
  version: "1.0.1",
  desc: "Xóa dữ liệu rent và key khi bot rời nhóm",

  onCall: async (rawCtx: EventContext): Promise<void> => {
    const ctx = rawCtx as unknown as EventContext & {
      client?: {
        getCurrentUserID?: () => string | number;
        ctx?: { userID?: string | number };
        id?: string | number;
      };
      threadData?: {
        get: (threadID: string) => Promise<{ threadInfo?: { threadName?: string } } | null>;
      };
      logger: {
        success: (msg: string) => void;
        info: (msg: string) => void;
        error: (msg: string) => void;
      };
    };

    const { event, logger, threadData } = ctx;
    const client = (ctx as any).client as {
      getCurrentUserID?: () => string | number;
      ctx?: { userID?: string | number };
      id?: string | number;
    } | null;

    try {
      const { threadID } = event;
      const logData = (event.logMessageData || {}) as {
        leftParticipantFbId?: string;
        leftThreadFbId?: string;
        [key: string]: unknown;
      };

      const leftId = String(logData.leftParticipantFbId ?? logData.leftThreadFbId ?? "");
      const clientID = String(
        client?.getCurrentUserID?.() ?? client?.ctx?.userID ?? client?.id ?? ""
      );

      if (!clientID || leftId !== clientID) return;

      const info = threadData ? (await threadData.get(threadID))?.threadInfo : null;
      const groupName = info?.threadName || String(threadID);

      let removedRent = 0;
      let removedKey = 0;

      if (await fs.pathExists(RENT_PATH)) {
        const rentData = (await fs.readJson(RENT_PATH).catch(() => [])) as Array<{ threadID?: string }>;
        const updatedRentData = rentData.filter((item) => item.threadID !== threadID);
        removedRent = rentData.length - updatedRentData.length;

        if (removedRent > 0) {
          await fs.writeJson(RENT_PATH, updatedRentData, { spaces: 2 });
        }
      }

      if (await fs.pathExists(KEYS_PATH)) {
        const keyData = (await fs.readJson(KEYS_PATH).catch(() => [])) as Array<{ groupId?: string }>;
        const updatedKeyData = keyData.filter((item) => item.groupId !== threadID);
        removedKey = keyData.length - updatedKeyData.length;

        if (removedKey > 0) {
          await fs.writeJson(KEYS_PATH, updatedKeyData, { spaces: 2 });
        }
      }

      if (removedRent > 0) {
        logger.success(
          `[CLEANUP] Đã xóa THÔNG TIN THUÊ BOT (rent) cho nhóm "${groupName}" (${threadID}) | ${removedRent} bản ghi`
        );
      }

      if (removedKey > 0) {
        logger.success(
          `[CLEANUP] Đã xóa KEY THUÊ BOT cho nhóm "${groupName}" (${threadID}) | ${removedKey} bản ghi`
        );
      }

      if (removedRent === 0 && removedKey === 0) {
        logger.info(
          `[CLEANUP] Không có dữ liệu thuê/key để xóa cho nhóm "${groupName}" (${threadID})`
        );
      }
    } catch (error) {
      const err = error as Error;
      console.error("Cleanup rent/key error:", err);
      ctx.logger.error(`Cleanup error: ${err.message}`);
    }
  }
};

export default clearRentEvent;
