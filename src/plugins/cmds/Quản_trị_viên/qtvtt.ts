"use strict";

import type {
  BotConfig,
  Command,
  CommandOnCallContext,
  FacebookClient,
  ThreadDataModel,
  UserDataModel
} from "@types";
import type { ParsedGroupResult } from "../../../API/detail/threads/threadInfoHtml.js";
import fs from "fs-extra";
import path from "path";
import { STORAGE_ANTI } from "../../../core/storagePath";

type ThreadID = string;
type TrustedQtvMap = Record<ThreadID, string[]>;

type AdminIDEntry = string | { id: string } | { id: string;[key: string]: unknown };

// Helper function để extract ID từ admin entry
const extractAdminID = (admin: AdminIDEntry): string => {
  if (typeof admin === 'string') {
    return admin;
  }
  if (typeof admin === 'object' && admin !== null && 'id' in admin) {
    return String(admin.id);
  }
  return String(admin);
};

class TrustedQtvManager {
  private dataDir: string;
  private filePath: string;

  constructor() {
    this.dataDir = STORAGE_ANTI();
    this.filePath = path.join(this.dataDir, "trustedqtv.json");
    this.initializeFile();
  }

  private initializeFile(): void {
    fs.ensureDirSync(this.dataDir);
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({}, null, 2));
    }
  }

  readData(): TrustedQtvMap {
    try {
      if (!fs.existsSync(this.filePath)) {
        return {};
      }
      return JSON.parse(fs.readFileSync(this.filePath, "utf8")) as TrustedQtvMap;
    } catch (error) {
      console.error("Error reading trustedqtv data:", error);
      return {};
    }
  }

  writeData(data: TrustedQtvMap): boolean {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error("Error writing trustedqtv data:", error);
      return false;
    }
  }

  isTrustedQtv(threadID: string, userID: string): boolean {
    const data = this.readData();
    const trustedList = data[threadID] || [];
    return trustedList.includes(String(userID));
  }

  addTrustedQtv(threadID: string, userID: string): boolean {
    const data = this.readData();
    const threadIDStr = String(threadID);
    const userIDStr = String(userID);

    if (!data[threadIDStr]) {
      data[threadIDStr] = [];
    }

    if (!data[threadIDStr].includes(userIDStr)) {
      data[threadIDStr].push(userIDStr);
      return this.writeData(data);
    }

    return false;
  }

  removeTrustedQtv(threadID: string, userID: string): boolean {
    const data = this.readData();
    const threadIDStr = String(threadID);
    const userIDStr = String(userID);

    if (!data[threadIDStr]) {
      return false;
    }

    const index = data[threadIDStr].indexOf(userIDStr);
    if (index > -1) {
      data[threadIDStr].splice(index, 1);
      return this.writeData(data);
    }

    return false;
  }

  getTrustedQtvs(threadID: string): string[] {
    const data = this.readData();
    return data[String(threadID)] || [];
  }
}

// Export function để các lệnh khác sử dụng
export function isTrustedQtv(threadID: string, userID: string): boolean {
  const manager = new TrustedQtvManager();
  return manager.isTrustedQtv(threadID, userID);
}

const qtvttCommand: Command = {
  name: "qtvtt",
  alias: ["trustedqtv", "qtvtintuong"],
  version: "1.0.0",
  role: 1,
  desc: "Quản lý danh sách quản trị viên tin tưởng",
  guide:
    "{pn} - Xem danh sách QTV tin tưởng\n" +
    "{pn} add [@tag] - Thêm QTV tin tưởng\n" +
    "{pn} remove [@tag] - Xóa QTV tin tưởng\n" +
    "{pn} del [@tag] - Xóa QTV tin tưởng (alias)\n\n" +
    "QTV tin tưởng sẽ được bảo vệ:\n" +
    "- Không bị kick khi kick QTV khác (anti kick qtv)\n" +
    "- Không bị ảnh hưởng khi anti qtv bật (có thể thêm/xóa admin)\n" +
    "- Tự động mời lại nếu bị kick",
  cd: 5,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext & {
    threadData: ThreadDataModel;
    userData: UserDataModel;
    config: BotConfig;
    client: FacebookClient;
  }): Promise<void> => {
    const { event, args, threadData, userData, reply, config, client } = ctx;
    const { threadID, senderID } = event;

    if (!threadID) {
      await reply("❌ Lệnh này chỉ dùng trong nhóm");
      return;
    }

    const senderIDStr = String(senderID);
    const threadIDStr = String(threadID);

    // Kiểm tra quyền - chỉ QTV hoặc admin bot mới được dùng
    const thread = await threadData.get(threadID);
    const threadInfo = (thread?.threadInfo || {}) as {
      adminIDs?: string[] | AdminIDEntry[];
    };

    const adminIDs = Array.isArray(threadInfo.adminIDs)
      ? threadInfo.adminIDs.map((admin) => extractAdminID(admin))
      : [];

    const isThreadAdmin = adminIDs.includes(senderIDStr);
    const owners = Array.isArray(config.OWNER)
      ? config.OWNER.map(String)
      : config.OWNER
        ? [String(config.OWNER)]
        : [];
    const admins = Array.isArray(config.ADMIN)
      ? config.ADMIN.map(String)
      : config.ADMIN
        ? [String(config.ADMIN)]
        : [];
    const isBotAdmin = owners.includes(senderIDStr) || admins.includes(senderIDStr);

    if (!isThreadAdmin && !isBotAdmin) {
      await reply("❌ Chỉ quản trị viên nhóm hoặc admin bot mới có thể sử dụng lệnh này!");
      return;
    }

    const manager = new TrustedQtvManager();
    const action = args[0]?.toLowerCase();

    // Xem danh sách
    if (!action || action === "list") {
      const trustedList = manager.getTrustedQtvs(threadIDStr);

      if (trustedList.length === 0) {
        await reply("📋 Danh sách QTV tin tưởng trống.");
        return;
      }

      const names = await Promise.all(
        trustedList.map(async (uid: string) => {
          try {
            const userInfo = await userData.get(uid);
            return `${userInfo?.name || uid} (${uid})`;
          } catch {
            return uid;
          }
        })
      );

      await reply(
        `📋 Danh sách QTV tin tưởng (${trustedList.length} người):\n` +
        names.map((n, i) => `${i + 1}. ${n}`).join("\n")
      );
      return;
    }

    // Thêm QTV tin tưởng
    if (action === "add") {
      // Kiểm tra quyền: chỉ người tạo nhóm mới được thêm QTV tin tưởng (nếu có thể lấy được creator)
      let creatorID: string | null = null;
      try {
        const threadInfoHtml = (client as { threadInfoHtml?: (threadID: string) => Promise<ParsedGroupResult | null> })?.threadInfoHtml;
        if (threadInfoHtml && typeof threadInfoHtml === "function") {
          const threadInfo = await threadInfoHtml(threadIDStr);
          if (threadInfo?.creator?.id) {
            creatorID = String(threadInfo.creator.id);
          }
        }
      } catch (error) {
        // Nếu không lấy được thông tin creator, không chặn (cho phép)
        console.error("Error getting thread info:", error);
      }

      // Nếu có creator ID và người dùng không phải là creator, chặn
      if (creatorID && senderIDStr !== creatorID) {
        await reply("❌ Chỉ người tạo nhóm mới có thể thêm QTV tin tưởng!");
        return;
      }

      const mentions = "mentions" in event ? event.mentions : {};
      const mentionedIDs = Object.keys(mentions || {});

      if (mentionedIDs.length === 0) {
        await reply("⚠️ Vui lòng tag người cần thêm vào danh sách QTV tin tưởng!");
        return;
      }

      let addedCount = 0;
      const addedNames: string[] = [];
      const skippedNames: string[] = [];

      for (const uid of mentionedIDs) {
        const uidStr = String(uid);

        // Kiểm tra người được tag có phải là QTV không
        if (!adminIDs.includes(uidStr)) {
          try {
            const userInfo = await userData.get(uidStr);
            skippedNames.push(userInfo?.name || uidStr);
          } catch {
            skippedNames.push(uidStr);
          }
          continue; // Bỏ qua nếu không phải QTV
        }

        if (manager.addTrustedQtv(threadIDStr, uidStr)) {
          addedCount++;
          try {
            const userInfo = await userData.get(uidStr);
            addedNames.push(userInfo?.name || uidStr);
          } catch {
            addedNames.push(uidStr);
          }
        }
      }

      let message = "";
      if (addedCount > 0) {
        message += `✅ Đã thêm ${addedCount} QTV vào danh sách tin tưởng:\n` +
          addedNames.map((n, i) => `${i + 1}. ${n}`).join("\n");
      }
      if (skippedNames.length > 0) {
        message += (message ? "\n\n" : "") +
          `⚠️ Bỏ qua ${skippedNames.length} người không phải QTV:\n` +
          skippedNames.map((n, i) => `${i + 1}. ${n}`).join("\n");
      }

      if (message) {
        await reply(message);
      } else {
        await reply("⚠️ Không thể thêm QTV tin tưởng. Vui lòng kiểm tra lại (chỉ có thể thêm QTV của nhóm).");
      }
      return;
    }

    // Xóa QTV tin tưởng
    if (action === "remove" || action === "del") {
      const mentions = "mentions" in event ? event.mentions : {};
      const mentionedIDs = Object.keys(mentions || {});

      if (mentionedIDs.length === 0) {
        await reply("⚠️ Vui lòng tag người cần xóa khỏi danh sách QTV tin tưởng!");
        return;
      }

      let removedCount = 0;
      const removedNames: string[] = [];

      for (const uid of mentionedIDs) {
        const uidStr = String(uid);
        if (manager.removeTrustedQtv(threadIDStr, uidStr)) {
          removedCount++;
          try {
            const userInfo = await userData.get(uidStr);
            removedNames.push(userInfo?.name || uidStr);
          } catch {
            removedNames.push(uidStr);
          }
        }
      }

      if (removedCount > 0) {
        await reply(
          `✅ Đã xóa ${removedCount} QTV khỏi danh sách tin tưởng:\n` +
          removedNames.map((n, i) => `${i + 1}. ${n}`).join("\n")
        );
      } else {
        await reply("⚠️ Không tìm thấy người được tag trong danh sách QTV tin tưởng.");
      }
      return;
    }

    // Hướng dẫn
    await reply(
      "⚠️ Cách dùng:\n" +
      "- `qtvtt` hoặc `qtvtt list` - Xem danh sách QTV tin tưởng\n" +
      "- `qtvtt add @tag` - Thêm QTV tin tưởng\n" +
      "- `qtvtt remove @tag` hoặc `qtvtt del @tag` - Xóa QTV tin tưởng"
    );
  },
};

export default qtvttCommand;
