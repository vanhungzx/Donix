"use strict";

import type { Command, CommandOnCallContext } from "@types";

interface BannedInfo {
  reason: string;
  time: number;
  bannedBy?: string;
}

interface BannedCommandInfo {
  bannedBy: string;
  time: number;
}

interface ThreadDataWithBan {
  data?: {
    bannedUsers?: string[];
    bannedCommandsInfo?: Record<string, BannedCommandInfo>;
  };
  banned?: BannedInfo;
  threadInfo?: {
    adminIDs?: Array<{ id: string } | string>;
  };
}

interface UserDataWithBan {
  banned?: BannedInfo;
  name?: string;
}

const unbanCommand: Command = {
  name: "unban",
  alias: ["unban"],
  version: "1.0.1",
  role: 1,
  desc: "Unban a user, command, or thread that was previously banned",
  guide: "{prefix}unban [userID/command/threadID]",
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { reply, args, main, event, threadData, userData, config, client } = ctx;
    try {
      const { threadID, senderID } = event;

      const owners = Array.isArray(config.OWNER)
        ? config.OWNER.map(String)
        : config.OWNER
          ? [String(config.OWNER)]
          : [];
      const isOwner = owners.includes(String(senderID));

      const admins = Array.isArray(config.ADMIN)
        ? config.ADMIN.map(String)
        : config.ADMIN
          ? [String(config.ADMIN)]
          : [];
      const isBotAdmin = admins.includes(String(senderID));

      let target = args[0];
      const thread = (await threadData.get(threadID)) as ThreadDataWithBan | null;
      let data = thread?.data || {};

      if (!data.bannedUsers) {
        data.bannedUsers = [];
      }
      if (!data.bannedCommandsInfo) {
        data.bannedCommandsInfo = {};
      }

      const isCommand = target ? main.cmds.has(target) : false;
      let userId: string | null = null;
      const unbannedBy = String(senderID);
      const unbannedByName =
        (await userData.get(unbannedBy))?.name || unbannedBy;


      if (target?.toLowerCase() === "thread") {
        if (!isOwner) {
          await reply("Chỉ chủ bot mới có quyền bỏ cấm nhóm.");
          return;
        }

        const threadBan = (await threadData.get(threadID))?.banned;

        if (threadBan && Object.keys(threadBan).length > 0) {
          // Use `null` as an explicit "clear/reset" sentinel. `update()` ignores `undefined`.
          await threadData.update(threadID, { banned: null });

          await reply(
            `Đã bỏ cấm nhóm có ID: ${threadID}\nNgười thực hiện: ${unbannedByName}`
          );
          return;
        }

        await reply("Nhóm này không bị cấm.");
        return;
      }


      if (isCommand && target) {
        if (data.bannedCommandsInfo[target]) {
          const bannedBy = data.bannedCommandsInfo[target].bannedBy;
          const cmd = main.cmds.get(target);

          if (
            !isOwner &&
            (cmd?.category?.toLowerCase() === "admin" ||
              (owners.includes(bannedBy) && !isOwner) ||
              (admins.includes(bannedBy) && !isOwner && !isBotAdmin))
          ) {
            await reply("Bạn không có quyền bỏ cấm lệnh này.");
            return;
          }

          delete data.bannedCommandsInfo[target];

          await threadData.update(threadID, { data });

          await reply(
            `Đã bỏ cấm lệnh: ${target}\nNgười thực hiện: ${unbannedByName}`
          );
          return;
        }

        await reply("Lệnh này không bị cấm.");
        return;
      }


      if (
        event.type === "message_reply" &&
        event.messageReply?.senderID
      ) {
        userId = String(event.messageReply.senderID);
      } else if (event.mentions && Object.keys(event.mentions).length > 0) {
        const mentionKeys = Object.keys(event.mentions);
        const mention = mentionKeys[0];
        if (mention && args.join(" ").includes("@")) {
          userId = mention;
        }
      } else {
        if (target && !isNaN(Number(target))) {
          userId = target;
        } else if (target && client?.getUID) {
          try {
            userId = String(await client.getUID(target));
          } catch {
            userId = null;
          }
        } else if (target && client?.getUID) {
          try {
            userId = String(await client.getUID(target));
          } catch {
            userId = null;
          }
        }
      }

      if (userId) {
        const user = (await userData.get(userId)) as UserDataWithBan | null;
        const userBan = user?.banned;
        const isUserBanned = userBan && Object.keys(userBan).length > 0;
        const targetName = user?.name || userId;

        if (isUserBanned) {
          const bannedBy = userBan.bannedBy || "";

          if (
            !isOwner &&
            ((owners.includes(bannedBy) && !isOwner) ||
              (admins.includes(bannedBy) && !isOwner && !isBotAdmin))
          ) {
            await reply("Bạn không có quyền bỏ cấm người dùng này.");
            return;
          }

          // Use `null` as an explicit "clear/reset" sentinel. `update()` ignores `undefined`.
          await userData.update(userId, { banned: null });

          await reply(
            `Đã bỏ cấm người dùng: ${targetName}\n` +
            `Người thực hiện: ${unbannedByName}`
          );
          return;
        }

        await reply("Người dùng này không bị cấm.");
        return;
      }

      await reply(
        "Không tìm thấy người dùng hoặc lệnh cần bỏ cấm. Vui lòng kiểm tra lại."
      );
      return;
    } catch (error: any) {
      console.error("Lỗi khi thực hiện lệnh bỏ cấm:", error);
      await reply("Đã xảy ra lỗi. Vui lòng thử lại sau.");
      return;
    }
  },
};

export default unbanCommand;
