"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnReplyContext,
  ReplyData as BaseReplyData,
} from "@types";

interface NotiSettings {
  joinNoti?: boolean;
  leaveNoti?: boolean;
}

interface ThreadSettings {
  noti?: NotiSettings;
  [key: string]: any;
}

interface ThreadDataWithSettings {
  threadInfo?: {
    adminIDs?: Array<{ id: string | number } | string | number>;
  };
  settings?: ThreadSettings;
}

interface NotiReplyData extends BaseReplyData {
  commandName: string;
  messageID: string;
  threadID?: string;
  author: string;
}

const notiCommand: Command = {
  name: "noti",
  alias: ["noti"],
  role: 1,
  desc: "Bật/tắt thông báo join/leave trong nhóm",
  guide:
    `1. Xem trạng thái hiện tại:\n   {pn}\n\n` +
    `2. Bật/tắt thông báo thành viên mới:\n   {pn} join\n\n` +
    `3. Bật/tắt thông báo thành viên rời nhóm:\n   {pn} leave\n\n` +
    `Lưu ý: Chỉ quản trị viên mới có thể sử dụng lệnh này.`,
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { client, event, threadData, reply, args, main } = ctx;

    const { threadID, senderID } = event;

    const thread = (await threadData.get(threadID)) as ThreadDataWithSettings | null;
    const adminIDs = (thread?.threadInfo?.adminIDs || []).map((admin: any) =>
      String(admin?.id || admin)
    );

    if (!adminIDs.includes(String(senderID))) {
      await reply("❎ Chỉ quản trị viên mới có thể sử dụng lệnh này.");
      return;
    }

    const settings = thread?.settings || {};
    settings.noti = settings.noti || {};

    const { joinNoti = false, leaveNoti = false } = settings.noti;

    if (args[0] && ["join", "leave"].includes(args[0].toLowerCase())) {
      const key = args[0].toLowerCase() === "join" ? "joinNoti" : "leaveNoti";
      settings.noti[key] = !settings.noti[key];

      await threadData.update(threadID, { settings });

      await reply(
        `${settings.noti[key] ? "✅ Bật" : "❌ Tắt"} thông báo ${
          args[0].toLowerCase() === "join" ? "tham gia" : "rời nhóm"
        } thành công!`
      );
      return;
    }

    await client.sendMessage(
      `📢 Trạng thái thông báo hiện tại:\n\n` +
        `1. join: ${joinNoti ? "✅ Bật" : "❌ Tắt"}\n` +
        `2. leave: ${leaveNoti ? "✅ Bật" : "❌ Tắt"}\n\n` +
        `📌 Reply số thứ tự để bật/tắt trạng thái tương ứng. Bạn có thể chọn nhiều số, ví dụ: 1 2`,
      threadID,
      async (err: any, info: any) => {
        if (!err && info?.messageID) {
          main.onReply.set(info.messageID, {
            commandName: "noti",
            messageID: info.messageID,
            threadID,
            author: senderID,
          } as NotiReplyData);
        }
      }
    );
  },

  async onReply(ctx: CommandOnReplyContext): Promise<void> {
    const { event, threadData, reply, Reply } = ctx;

    const { body, senderID, threadID } = event;

    const replyData = Reply as NotiReplyData;

    if (replyData.author !== senderID) {
      return;
    }

    const choices = String(body || "")
      .trim()
      .split(/\s+/)
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !isNaN(n) && [1, 2].includes(n));

    if (choices.length === 0) {
      await reply(
        "❌ Lựa chọn không hợp lệ. Vui lòng reply '1' hoặc '2' để thay đổi trạng thái."
      );
      return;
    }

    const thread = (await threadData.get(threadID)) as ThreadDataWithSettings | null;
    const settings = thread?.settings || {};
    settings.noti = settings.noti || {};

    const statusChanges: string[] = [];

    for (const choice of choices) {
      const key: keyof NotiSettings = choice === 1 ? "joinNoti" : "leaveNoti";
      settings.noti[key] = !settings.noti[key];
      statusChanges.push(
        `${settings.noti[key] ? "bật" : "tắt"} thông báo ${
          choice === 1 ? "tham gia" : "rời nhóm"
        }`
      );
    }

    await threadData.update(threadID, { settings });

    await reply(`✅ Đã ${statusChanges.join(" và ")} thành công!`);
  },
};

export default notiCommand;
