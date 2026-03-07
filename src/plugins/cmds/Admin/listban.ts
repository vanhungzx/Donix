"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnReplyContext,
} from "@types";

const listbanCommand: Command = {
  name: "listban",
  alias: ["dsban"],
  version: "1.0.1",
  role: 2,
  desc: "Unban người dùng/nhóm",
  guide:
    "- {pn} user: Xem danh sách người dùng bị cấm\n" +
    "- {pn} thread: Xem danh sách nhóm bị cấm\n" +
    "- {pn} cmd: Xem danh sách lệnh bị cấm\n\n" +
    "Sau khi xem danh sách:\n" +
    "- Reply số thứ tự để gỡ cấm đối tượng tương ứng\n" +
    "- Reply 'all' để gỡ cấm tất cả",
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, reply, threadData, userData, main, config, commandName } = ctx;

    try {
      const threadDataInfo = await threadData.get(event.threadID);
      const banCmd = threadDataInfo?.data?.bannedCommandsInfo;
      const type = args[0];

      if (!type || !["user", "thread", "cmd"].includes(type.toLowerCase())) {
        await reply("❌ Sử dụng lệnh sai! Hướng dẫn: listban [user/thread/cmd]");
        return;
      }

      if (type.toLowerCase() === "cmd") {
        if (!banCmd || Object.keys(banCmd).length === 0) {
          await reply("✅ Không có lệnh nào bị cấm trong nhóm này");
          return;
        }

        const bannedCmdList = await Promise.all(
          Object.entries(banCmd).map(async ([cmd, info]: [string, any], index) => {
            const bannedBy = String(info.bannedBy || "");
            const bannedByInfo = await userData.get(bannedBy).catch(() => null);
            const bannedByName = bannedByInfo?.name || "Unknown";

            let bannerRole = "Quản Trị Viên";
            if (Array.isArray(config.OWNER) && config.OWNER.includes(bannedBy)) bannerRole = "Chủ Bot";
            else if (Array.isArray(config.ADMIN) && config.ADMIN.includes(bannedBy)) bannerRole = "Admin Bot";

            return {
              index: index + 1,
              cmd,
              bannedBy,
              bannedByName,
              bannerRole,
              time: new Date(info.time).toLocaleString("vi-VN"),
            };
          })
        );

        const response =
          `📋 Danh sách Lệnh bị cấm\n\n` +
          bannedCmdList
            .map(
              (item) =>
                `${item.index}. ${item.cmd}\n👤 Bị cấm bởi: ${item.bannerRole} ${item.bannedByName}\n🕒 Thời gian: ${item.time}`
            )
            .join("\n\n") +
          `\n\n📌 Reply số thứ tự để bỏ cấm, hoặc reply "all" để bỏ cấm tất cả`;

        await reply(response, (err: any, info: any) => {
          if (err) return;
          main.onReply.set(info.messageID, {
            commandName: commandName || "listban",
            messageID: info.messageID,
            threadID: event.threadID,
            author: event.senderID,
            type: "cmd",
            bannedCmdList,
          });
        });
      }

      const isThread = type.toLowerCase() === "thread";
      const data = isThread ? await threadData.getBanned() : await userData.getBanned();

      const bannedList = await Promise.all(
        data.map(async (item: any, index: number) => {
          const id = isThread ? item.threadID : item.userID;
          const reason = item.banned?.reason || "Không rõ lý do";
          const time = item.banned?.time ? new Date(item.banned.time).toLocaleString("vi-VN") : "Không rõ thời gian";

          const name = isThread
            ? (await threadData.get(id).catch(() => null))?.threadName || "Không rõ tên nhóm"
            : (await userData.get(id).catch(() => null))?.name || "Không rõ tên người dùng";

          return { index: index + 1, id, name, reason, time };
        })
      );

      if (bannedList.length === 0) {
        await reply(`✅ Không có ${isThread ? "nhóm" : "người dùng"} nào bị ban`);
        return;
      }

      const response =
        `📋 Danh sách Ban (${isThread ? "Nhóm" : "Người dùng"})\n\n` +
        bannedList
          .map(
            (item: any) =>
              `${item.index}. ${item.name} (${item.id})\n📝 Lý do: ${item.reason}\n🕒 Thời gian: ${item.time}`
          )
          .join("\n\n") +
        `\n\n📌 Reply số thứ tự để unban, hoặc reply "all" để unban tất cả`;

      await reply(response, (err: any, info: any) => {
        if (err) return;
        main.onReply.set(info.messageID, {
          commandName: commandName || "listban",
          messageID: info.messageID,
          threadID: event.threadID,
          author: event.senderID,
          type: isThread ? "thread" : "user",
          bannedList,
        });
      });
    } catch (error) {
      await reply("💀 Có lỗi xảy ra khi xử lý danh sách ban. Xem lại code đi bro.");
    }
  },

  async onReply(ctx: CommandOnReplyContext): Promise<void> {
    const { event, threadData, userData, reply, Reply } = ctx;

    try {
      const { type, bannedList, bannedCmdList } = Reply as unknown as { type: string; bannedList: any[]; bannedCmdList: any[] };
      const replyContent = String(event.body || "").trim().toLowerCase();
      const isUnbanAll = /^(all|tất cả)$/.test(replyContent);

      if (type === "cmd") {
        const threadDataInfo = await threadData.get(event.threadID);

        if (isUnbanAll) {
          await threadData.update(event.threadID, {
            data: { ...(threadDataInfo?.data || {}), bannedCommandsInfo: {} },
          });
          await reply("✅ Đã bỏ cấm tất cả các lệnh");
        }

        const indices = replyContent.match(/\d+/g);
        const validIndices = indices ? indices.map(Number).filter((n) => n > 0 && n <= (bannedCmdList || []).length) : [];

        if (validIndices.length === 0) {
          await reply("❌ Vui lòng nhập số thứ tự hợp lệ hoặc 'all' để bỏ cấm tất cả");
          return;
        }

        const updatedBanCmd = { ...((threadDataInfo?.data || {}).bannedCommandsInfo || {}) };
        const removed: string[] = [];

        for (const index of validIndices) {
          const target = (bannedCmdList || [])[index - 1];
          if (target?.cmd && updatedBanCmd[target.cmd]) {
            delete updatedBanCmd[target.cmd];
            removed.push(target.cmd);
          }
        }

        await threadData.update(event.threadID, {
          data: { ...(threadDataInfo?.data || {}), bannedCommandsInfo: updatedBanCmd },
        });

        await reply(`✅ Đã bỏ cấm ${removed.length} lệnh: ${removed.join(", ")}`);
      }

      if (isUnbanAll) {
        for (const target of bannedList || []) {
          const id = target.id;
          if (type === "thread") await threadData.update(id, { banned: null });
          else await userData.update(id, { banned: null });
        }
        await reply(`✅ Đã unban tất cả ${type === "thread" ? "nhóm" : "người dùng"}`);
      }

      const indices = replyContent.match(/\d+/g);
      const validIndices = indices ? indices.map(Number).filter((n) => n > 0 && n <= (bannedList || []).length) : [];

      if (validIndices.length === 0) {
        await reply("❌ Vui lòng nhập số thứ tự hợp lệ hoặc 'all' để unban tất cả");
        return;
      }

      for (const index of validIndices) {
        const target = (bannedList || [])[index - 1];
        const id = target.id;
        if (type === "thread") await threadData.update(id, { banned: null });
        else await userData.update(id, { banned: null });
      }

      await reply(`✅ Đã unban ${validIndices.length} ${type === "thread" ? "nhóm" : "người dùng"}`);
    } catch (error) {
      await reply("💀 Có lỗi xảy ra khi xử lý yêu cầu unban");
    }
  },
};

export default listbanCommand;
