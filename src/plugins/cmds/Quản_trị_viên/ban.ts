"use strict";

import type { Command, CommandOnCallContext } from "@types";

interface BannedInfo {
  reason: string;
  time: number;
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

const banCommand: Command = {
  name: "ban",
  alias: ["ban"],
  version: "1.0.1",
  role: 1,
  desc: "Ban a user, command or thread from being used",
  guide: "{prefix}ban [userID/command/thread]",
  cd: 5,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { reply, args, main, event, threadData, userData, client, config } = ctx;

    try {
      const { threadID, senderID } = event;

      const owners = Array.isArray(config.OWNER)
        ? config.OWNER.map(String)
        : config.OWNER
          ? [String(config.OWNER)]
          : [];
      const isOwner = owners.includes(String(senderID));

      const target = args[0];
      const thread = (await threadData.get(threadID)) as ThreadDataWithBan | null;
      let data = thread?.data || {};

      if (!data.bannedUsers) {
        data.bannedUsers = [];
      }
      if (!data.bannedCommandsInfo) {
        data.bannedCommandsInfo = {};
      }

      const isCommand = !!target && main.cmds.has(target);
      let userId: string | null = null;
      let reason = "";
      const bannedBy = String(senderID);
      const bannedByName = (await userData.get(bannedBy))?.name || bannedBy;

      
      if (target && target.toLowerCase() === "thread" && isOwner) {
        await threadData.update(threadID, {
          banned: {
            reason: args.slice(1).join(" ") || "Không có lý do",
            time: Date.now(),
          },
        });

        await reply(
          `Đã cấm nhóm: ${threadID}\n` +
          `Lý do: ${args.slice(1).join(" ") || "Không có lý do"}\n` +
          `Người thực hiện: ${bannedByName}`
        );
        return;
      }

      
      if (isCommand && target) {
        const cmd = main.cmds.get(target);

        if (!isOwner && cmd?.category?.toLowerCase() === "admin") {
          await reply("Không thể cấm lệnh trong nhóm admin");
          return;
        }

        if (!data.bannedCommandsInfo[target]) {
          data.bannedCommandsInfo[target] = {
            bannedBy,
            time: Date.now(),
          };

          await threadData.update(event.threadID, { data });

          await reply(
            `Đã cấm sử dụng lệnh: ${target}\nNgười thực hiện: ${bannedByName}`
          );
          return;
        }

        await reply("Lệnh này đã bị cấm sử dụng trước đó.");
        return;
      }

      
      if (event.type === "message_reply" && event.messageReply?.senderID) {
        userId = String(event.messageReply.senderID);
      } else if (event.mentions && Object.keys(event.mentions).length > 0) {
        const mention = Object.keys(event.mentions)[0] as string;
        if (args.join(" ").includes("@")) {
          reason = args.join(" ").replace(String(event.mentions[mention]), "").trim();
          userId = mention ?? null;
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
        const admins = Array.isArray(config.ADMIN)
          ? config.ADMIN.map(String)
          : config.ADMIN
            ? [String(config.ADMIN)]
            : [];

        if (
          !isOwner &&
          (owners.includes(userId) || admins.includes(userId))
        ) {
          await reply("Không thể cấm owner hoặc admin");
          return;
        }

        const user = await userData.get(userId);
        const userBan = user?.banned;
        const isUserBanned = userBan && Object.keys(userBan).length > 0;
        const targetName = user?.name || userId;

        if (!isUserBanned) {
          await userData.update(userId, {
            banned: {
              reason: reason || "Không có lý do",
              time: Date.now(),
            },
          });

          await reply(
            `Đã cấm người dùng: ${targetName} (${userId})\n` +
            `Lý do: ${reason || "Không có lý do"}\n` +
            `Người thực hiện: ${bannedByName}`
          );
          return;
        }

        await reply(`Người dùng ${targetName} đã bị cấm từ trước đó.`);
        return;
      }

      await reply(
        "Không tìm thấy người dùng hoặc lệnh cần cấm. Vui lòng kiểm tra lại."
      );
      return;
    } catch (error: any) {
      console.error("Lỗi khi thực hiện lệnh cấm:", error);
      await reply("Đã xảy ra lỗi. Vui lòng thử lại sau.");
      return;
    }
  },
};

export default banCommand;
