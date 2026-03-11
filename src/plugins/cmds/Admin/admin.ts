"use strict";

import type { Command, CommandOnCallContext, CommandOnReplyContext } from "@types";
import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { loadConfig, writeConfig } from "../../../core/configManager";
import { STORAGE_BACKUPS } from "../../../core/storagePath";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadFreshConfig(): Promise<any> {
  try {
    return await loadConfig();
  } catch (error: any) {
    throw new Error(`Failed to load config: ${error.message}`);
  }
}

async function saveConfig(config: any): Promise<void> {
  try {
    const result = await writeConfig(config, false);
    if (!result.success) {
      throw new Error(result.error || "Failed to save config");
    }
  } catch (error: any) {
    throw new Error(`Failed to save config: ${error.message}`);
  }
}

async function updateList(action: "add" | "remove", uidList: string[], config: any): Promise<number> {
  let changesCount = 0;

  uidList = [
    ...new Set(
      uidList
        .map((id) => id.trim())
        .filter((id) => !isNaN(Number(id)) && id !== "")
        .map((id) => id.toString())
    ),
  ];

  const ownerList = Array.isArray(config.OWNER) ? config.OWNER : [config.OWNER].filter(Boolean);

  const actionConfigs = {
    add: {
      list: config.ADMIN || [],
      check: (uid: string) => !config.ADMIN?.includes(uid) && !ownerList.includes(uid),
    },
    remove: {
      list: config.ADMIN || [],
      check: (uid: string) => config.ADMIN?.includes(uid) && !ownerList.includes(uid),
    },
  };

  uidList.forEach((uid) => {
    const actionConfig = actionConfigs[action];
    if (actionConfig && actionConfig.check(uid)) {
      if (action === "remove") {
        const index = actionConfig.list.indexOf(uid);
        if (index > -1) {
          actionConfig.list.splice(index, 1);
        }
      } else {
        actionConfig.list.push(uid);
      }
      changesCount++;
    }
  });

  await saveConfig(config);
  return changesCount;
}

async function getLists(userData: any, config: any): Promise<{ admin: string[]; owner: string }> {
  const getNames = async (uids: string[]): Promise<string[]> => {
    return Promise.all(
      uids.map(async (uid) => {
        try {
          const name = await (userData.getName as any)?.(uid);
          return name || "Unknown";
        } catch (error) {
          return "Unknown";
        }
      })
    );
  };

  const { ADMIN = [], OWNER } = config;
  const ownerId = Array.isArray(OWNER) ? OWNER[0] : OWNER;

  const [admin, ownerName] = await Promise.all([
    getNames(ADMIN),
    ownerId ? (userData.getName as any)?.(ownerId).catch(() => "Unknown") : Promise.resolve("Unknown"),
  ]);

  return { admin, owner: ownerName || "Unknown" };
}

const adminCommand: Command = {
  name: "admin",
  alias: ["ad", "adm"],
  version: "1.0.0",
  role: 0,
  desc: "Admin Config",
  guide: "Config",
  cd: 2,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, userData, threadData, main, commandName, config, reply } = ctx;
    const { threadID, senderID, mentions, messageReply } = event;

    let uidList: string[] = [];

    if (mentions && Object.keys(mentions).length > 0) {
      uidList = Object.keys(mentions);
    }

    if (messageReply) {
      uidList.push(String((messageReply as any).senderID));
    }

    if (args.length > 1) {
      uidList = uidList.concat(args.slice(1));
    }

    const action = args[0]?.toLowerCase();
    const isOwner = Array.isArray(config.OWNER)
      ? config.OWNER.includes(senderID)
      : String(config.OWNER) === String(senderID);
    const isAdmin = Array.isArray(config.ADMIN)
      ? config.ADMIN.includes(senderID)
      : false;

    switch (action) {
      case "add":
      case "remove": {
        if (!isOwner) {
          void reply({ body: "Bạn không đủ quyền hạn để sử dụng lệnh này!" });
          return;
        }

        try {
          const currentConfig = await loadFreshConfig();
          const changesCount = await updateList(action, uidList, currentConfig);
          const actionText =
            {
              add: "thêm vào admin",
              remove: "xóa khỏi admin",
            }[action] || "";

          void reply({
            body:
              changesCount === 0
                ? `Không có người dùng nào được ${actionText}!`
                : `✅ Đã ${actionText} thành công ${changesCount} người dùng.`,
          });
        } catch (error: any) {
          void reply({ body: `❌ Lỗi: ${error.message}` });
        }
        return;
      }

      case "list": {
        const currentConfig = await loadFreshConfig();
        const lists = await getLists(userData, currentConfig);

        let adminListText = "";
        for (let i = 0; i < lists.admin.length; i++) {
          adminListText += `${i + 1}. ${lists.admin[i]}\n`;
        }

        void reply(
          {
            body:
              `[ CHỦ BOT ]\n\nTên: Phạm Minh Đồng (Donix)\nFacebook: fb.com/minhdong.dev\n\n[ DANH SÁCH ADMIN ]\n\n${adminListText}\nReply tin nhắn này với stt để xoá admin`,
          },
          (error: any, info: any) => {
            if (!error) {
              main.onReply.set(info.messageID, {
                commandName,
                messageID: info.messageID,
                author: senderID,
                type: "deleteAdmin",
                adminList: currentConfig.ADMIN || [],
              });
            }
          }
        );
        return;
      }

      case "delete": {
        if (!isOwner) {
          void reply({ body: "Bạn không đủ quyền hạn để sử dụng lệnh này!" });
          return;
        }

        const currentConfig = await loadFreshConfig();
        const lists = await getLists(userData, currentConfig);

        if (lists.admin.length === 0) {
          void reply({ body: "❎ Không có admin nào để xóa!" });
          return;
        }

        let adminListText = "";
        for (let i = 0; i < lists.admin.length; i++) {
          adminListText += `${i + 1}. ${lists.admin[i]}\n`;
        }

        void reply(
          {
            body:
              `[ CHỦ BOT ]\n\nTên: Phạm Minh Đồng (Donix)\nFacebook: fb.com/minhdong.dev\n\n[ DANH SÁCH ADMIN ]\n\n${adminListText}\n👆 Reply tin nhắn này với số thứ tự để xóa admin (VD: 1, 2, 3 hoặc 1 2 3)`,
          },
          (error: any, info: any) => {
            if (!error) {
              main.onReply.set(info.messageID, {
                commandName,
                messageID: info.messageID,
                author: senderID,
                type: "deleteAdmin",
                adminList: currentConfig.ADMIN || [],
              });
            }
          }
        );
        return;
      }

      case "shell": {
        if (!isOwner) {
          void reply({ body: "Bạn không đủ quyền hạn để sử dụng lệnh này!" });
          return;
        }

        const command = args.slice(1).join(" ");
        if (!command) {
          void reply({ body: "Vui lòng nhập lệnh shell cần thực thi!" });
          return;
        }

        try {
          const { stdout, stderr } = await execAsync(command);
          const response = stderr || stdout || "Command executed successfully with no output";
          await reply({ body: response });
        } catch (error: any) {
          await reply({ body: `Error: ${error.message}` });
        }
        return;
      }

      case "only":
      case "refresh": {
        if (!isOwner) {
          void reply({ body: "Bạn không đủ quyền hạn để sử dụng lệnh này!" });
          return;
        }

        if (action === "only") {
          try {
            const currentConfig = await loadFreshConfig();
            currentConfig.adminOnly = !currentConfig.adminOnly;
            await saveConfig(currentConfig);
            void reply({
              body: `✅ Đã ${currentConfig.adminOnly ? "bật" : "tắt"} chế độ admin only`,
            });
          } catch (error: any) {
            void reply({ body: `❌ Lỗi: ${error.message}` });
          }
          return;
        } else {
          const { reloadConfig } = await import("../../../core/configManager");
          const result = await reloadConfig();

          void reply({
            body: result.success
              ? "✅ Đã làm mới cấu hình từ file config.json"
              : `❌ Không thể làm mới cấu hình: ${result.error || "Lỗi không xác định"}`,
          });
          return;
        }
      }

      case "box":
      case "qtvonly": {
        const dataThread = (await threadData.get(event.threadID))?.threadInfo;
        const isThreadAdmin = dataThread?.adminIDs?.some((item: any) => item.id == senderID);
        const isBotAdmin = isAdmin || isOwner;

        if (!isThreadAdmin && !isBotAdmin) {
          void reply({ body: "❎ Bạn không đủ quyền hạn để sử dụng tính năng này!" });
          return;
        }

        try {
          const currentConfig = await loadFreshConfig();

          if (!currentConfig.adminbox) {
            currentConfig.adminbox = {};
          }

          if (currentConfig.adminbox[threadID] == true) {
            currentConfig.adminbox[threadID] = false;
            await saveConfig(currentConfig);
            await reply({
              body: "☑️ Tắt chế độ quản trị viên, tất cả thành viên có thể sử dụng bot",
            });
          } else {
            currentConfig.adminbox[threadID] = true;
            await saveConfig(currentConfig);
            await reply({
              body: "☑️ Kích hoạt chế độ quản trị viên, chỉ quản trị viên mới có thể sử dụng bot",
            });
          }
        } catch (error: any) {
          await reply({ body: `❌ Lỗi: ${error.message}` });
        }
        return;
      }

      case "backup": {
        if (!isOwner) {
          void reply({ body: "Bạn không đủ quyền hạn để sử dụng lệnh này!" });
          return;
        }

        try {
          const currentConfig = await loadFreshConfig();
          const backupDir = STORAGE_BACKUPS();


          if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
          }

          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const backupPath = path.join(backupDir, `config-backup-${timestamp}.json`);

          fs.writeFileSync(backupPath, JSON.stringify(currentConfig, null, 2), "utf8");

          void reply({
            body: `✅ Đã tạo backup cấu hình thành công!\n📁 Đường dẫn: ${backupPath}`,
          });
          return;
        } catch (error: any) {
          void reply({
            body: `❌ Lỗi khi tạo backup: ${error.message}`,
          });
          return;
        }
      }

      default: {
        if (isAdmin || isOwner) {
          void reply({
            body:
              `⚠️ Lệnh không hợp lệ! Hãy sử dụng một trong các lệnh sau:\n\n` +
              `🔹 "add" - Thêm admin\n` +
              `🔹 "remove" - Xóa admin\n` +
              `🔹 "delete" - Xóa admin tương tác\n` +
              `🔹 "list" - Xem danh sách\n` +
              `🔹 "only" - Bật/Tắt chế độ Admin only\n` +
              `🔹 "refresh" - Tải lại cấu hình\n` +
              `🔹 "box" - Bật/tắt chế độ QTV only\n` +
              `🔹 "backup" - Tạo backup cấu hình`,
          });
          return;
        } else {
          try {
            const currentConfig = await loadFreshConfig();
            const lists = await getLists(userData, currentConfig);
            void reply({
              body:
                `[ CHỦ BOT ]\n\nTên: ${lists.owner} (Donix)\nFacebook: fb.com/minhdong.dev\n\n[ DANH SÁCH ADMIN ]\n\n${lists.admin.join(
                  "\n"
                )}`,
            });
          } catch (error: any) {
            void reply({ body: `❌ Lỗi: ${error.message}` });
          }
          return;
        }
      }
    }
  },

  async onReply(ctx: CommandOnReplyContext): Promise<void> {
    const { event, Reply, userData, config, reply } = ctx;
    const { senderID, body } = event;

    const replyData = Reply as any;

    if (replyData.author !== senderID) {
      void reply({ body: "❎ Bạn không phải người sử dụng lệnh này!" });
      return;
    }

    const isOwner = Array.isArray(config.OWNER)
      ? config.OWNER.includes(senderID)
      : String(config.OWNER) === String(senderID);

    if (!isOwner) {
      void reply({ body: "❎ Chỉ owner mới có thể sử dụng chức năng này!" });
      return;
    }

    if (replyData.type === "deleteAdmin") {
      const input = body?.trim() || "";
      const numbers = input
        .split(/\s+/)
        .map((num) => parseInt(num.trim()))
        .filter((num) => !isNaN(num));

      if (numbers.length === 0) {
        void reply({ body: "❎ Vui lòng nhập số thứ tự hợp lệ!" });
        return;
      }

      const currentConfig = await loadFreshConfig();
      const adminList = replyData.adminList || currentConfig.ADMIN || [];
      const toRemove: string[] = [];

      for (const num of numbers) {
        if (num >= 1 && num <= adminList.length) {
          const adminId = adminList[num - 1];
          if (!toRemove.includes(adminId)) {
            toRemove.push(adminId);
          }
        }
      }

      if (toRemove.length === 0) {
        void reply({ body: "❎ Không có số thứ tự hợp lệ nào được chọn!" });
        return;
      }

      try {
        const currentConfig = await loadFreshConfig();
        let removedCount = 0;
        for (const adminId of toRemove) {
          const index = currentConfig.ADMIN.indexOf(adminId);
          if (index > -1) {
            currentConfig.ADMIN.splice(index, 1);
            removedCount++;
          }
        }

        await saveConfig(currentConfig);

        const removedNames = await Promise.all(
          toRemove.map(async (uid) => {
            try {
              const name = await (userData.getName as any)?.(uid);
              return name || "Unknown";
            } catch (error) {
              return "Unknown";
            }
          })
        );

        await reply({
          body: `✅ Đã xóa thành công ${removedCount} admin:\n${removedNames.join("\n")}`,
        });
      } catch (error: any) {
        await reply({ body: `❌ Lỗi: ${error.message}` });
      }
    }
  },
};

export default adminCommand;
