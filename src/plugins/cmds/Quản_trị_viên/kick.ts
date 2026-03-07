"use strict";

import type { Command, CommandOnCallContext } from "@types";

const kickCommand: Command = {
  name: "kick",
  alias: ["kick"],
  version: "1.0.0",
  role: 1,
  desc: "Xoá người bạn cần xoá khỏi nhóm bằng cách tag hoặc reply",
  guide:
    "{pn} [@tag] - Kick người dùng được tag\n" +
    "    {pn} [reply] - Kick người dùng được reply\n" +
    "    {pn} [all] - Kick tất cả thành viên (trừ bạn và bot)",
  cd: 5,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { args, client, event, threadData, reply } = ctx;

    const thread = await threadData.get(event.threadID);
    const threadInfo = thread?.threadInfo || {};
    const participantIDs = Array.isArray(threadInfo.participantIDs)
      ? threadInfo.participantIDs.map((id: any) => String(id?.id || id))
      : [];
    const adminIDs = Array.isArray(threadInfo.adminIDs)
      ? threadInfo.adminIDs.map((admin: any) => String(admin?.id || admin))
      : [];

    const botID = String(client.getCurrentUserID());

    if (!adminIDs.includes(botID)) {
      await reply("❎ Bot cần quyền quản trị viên!");
      return;
    }

    try {
      
      if (args.join(" ").indexOf("@") !== -1) {
        const mentions = event.mentions;
        if (mentions && Object.keys(mentions).length > 0) {
          const mentionKeys = Object.keys(mentions);

          for (let i = 0; i < mentionKeys.length; i++) {
            const userId = mentionKeys[i];
            await new Promise((resolve) => setTimeout(resolve, 1000 * i));
            try {
              await client.removeUserFromGroup(userId as string, event.threadID);
            } catch (error) {
              console.error(`Error kicking user ${userId}:`, error);
            }
          }

          await reply(
            `✅ Đã kick ${mentionKeys.length} thành viên khỏi nhóm`
          );
          return;
        }

        await reply("❎ Vui lòng tag người cần kick");
        return;
      }

      
      if (event.type === "message_reply" && event.messageReply?.senderID) {
        const uid = String(event.messageReply.senderID);

        try {
          await client.removeUserFromGroup(uid, event.threadID);
          await reply("✅ Đã kick thành viên khỏi nhóm");
          return;
        } catch (error) {
          await reply("❎ Lỗi khi kick người dùng");
          return;
        }
      }

      
      if (args[0]?.toLowerCase() === "all") {
        const listUserID = participantIDs.filter(
          (id: string) => id !== botID && id !== String(event.senderID)
        );

        if (listUserID.length === 0) {
          await reply("❎ Không có thành viên nào để kick");
          return;
        }

        for (let i = 0; i < listUserID.length; i++) {
          const idUser = listUserID[i];
          await new Promise((resolve) => setTimeout(resolve, 1000 * i));
          try {
            await client.removeUserFromGroup(idUser, event.threadID);
          } catch (error) {
            console.error(`Error kicking user ${idUser}:`, error);
          }
        }

        await reply(`✅ Đã kick ${listUserID.length} thành viên khỏi nhóm`);
        return;
      }

      await reply("❎ Vui lòng tag hoặc reply người cần kick");
      return;
    } catch (error: any) {
      console.error("Error in kick command:", error);
      await reply("❎ Lỗi khi kick người dùng");
      return;
    }
  },
};

export default kickCommand;
