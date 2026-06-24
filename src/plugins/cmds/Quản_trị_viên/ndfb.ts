"use strict";

import type { Command, CommandOnCallContext } from "@types";
import { sleep } from "@utils/sleep";

interface ThreadInfoWithUserInfo {
  userInfo?: Array<{
    id: string | number;
    gender?: string | null;
    [key: string]: any;
  }>;
  adminIDs?: Array<{ id: string | number } | string | number>;
}

const ndfbCommand: Command = {
  name: "ndfb",
  alias: ["locmemdie"],
  version: "1.0.0",
  role: 1,
  desc: "Lọc người dùng Facebook",
  guide:
    "{pn} -> Lọc những tài khoản Facebook đã bị khóa ra khỏi nhóm chat\n" +
    "    Lưu ý: Bot cần là quản trị viên để thực hiện lệnh này",
  cd: 0,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { threadData, event, reply, client } = ctx;
    const bot = client;

    if (!bot) {
      if (reply) {
        await reply("❌ Không tìm thấy client Facebook, vui lòng thử lại sau");
      } else {
        console.error("❌ Facebook client is not available in CommandOnCallContext");
      }
      return;
    }

    const thread = await threadData.get(event.threadID);
    const threadInfo = (thread?.threadInfo || {}) as ThreadInfoWithUserInfo;

    const userInfo = threadInfo.userInfo || [];
    const adminIDs = (threadInfo.adminIDs || []).map((admin: any) =>
      String((admin as any)?.id || admin)
    );

    const botID = String(bot.getCurrentUserID?.() || (bot as any)?.id || "");
    const isBotAdmin = adminIDs.includes(botID);

    const lockedUserIds: (string | number)[] = [];

    for (const u of userInfo) {
      if (u.gender === undefined || u.gender === null) {
        lockedUserIds.push(u.id);
      }
    }

    if (lockedUserIds.length === 0) {
      await bot.sendMessage(
        "❎ Trong nhóm không tồn tại tài khoản bị khóa (không thấy user nào có gender null/undefined trong threadInfo)",
        event.threadID,
        event.messageID
      );
      return;
    }

    await bot.sendMessage(
      `🔎 Nhóm bạn hiện có ${lockedUserIds.length} tài khoản bị khoá`,
      event.threadID,
      async () => {
        if (!isBotAdmin) {
          await bot.sendMessage(
            "❎ Nhóm hiện có tài khoản bị khoá nhưng bot không phải là quản trị viên nên không thể lọc.\n👉 Hãy cấp quyền quản trị viên cho bot rồi thử lại.",
            event.threadID
          );
          return;
        }

        await bot.sendMessage("🔄 Bắt đầu lọc...", event.threadID, async () => {
          let success = 0;
          let fail = 0;

          for (let i = 0; i < lockedUserIds.length; i++) {
            const userId = String(lockedUserIds[i]);

            
            await sleep(1000 * i);

            try {
              await bot.removeUserFromGroup(userId, event.threadID);
              success++;
            } catch (error) {
              fail++;
              console.error(`Error removing user ${userId}:`, error);
            }
          }

          let message = `✅ Đã lọc thành công ${success} tài khoản`;
          if (fail > 0) {
            message += `\n❌ Lọc thất bại ${fail} tài khoản`;
          }

          await bot.sendMessage(message, event.threadID);
        });
      },
      event.messageID
    );
  },
};

export default ndfbCommand;
