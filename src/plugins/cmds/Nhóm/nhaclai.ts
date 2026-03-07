import type { Command, CommandOnCallContext } from "@types";

const remindReplyCommand: Command = {
  name: "nhaclai",
  alias: ["nhắclại", "remindmsg"],
  version: "1.0.0",
  role: 0,
  desc: "Tạo nhắc lại cho một tin nhắn bằng tính năng remind của Messenger",
  guide: `Dùng để tạo nhắc lại (remind) cho một tin nhắn có sẵn:

• Cách dùng cơ bản:
  - Reply vào tin nhắn cần nhắc lại rồi gửi: {pn}nhaclai
  - Hoặc: {pn}nhaclai <ghi_chú>

• Ví dụ:
  - {pn}nhaclai
  - {pn}nhaclai Nhắc mình xem lại tin này sau`,
  cd: 3,
  prefix: true,
  onCall: async function ({ event, args, reply, client }: CommandOnCallContext): Promise<void> {
    const { threadID, type, messageReply } = event;

    if (type !== "message_reply" || !messageReply || !messageReply.messageID) {
      await reply("Vui lòng reply vào tin nhắn bạn muốn đặt nhắc lại rồi dùng lệnh.");
      return;
    }

    const body = messageReply.body || "";
    try {
      // Sử dụng cờ remind của sendMessage.ts
      // sendMessage(msg, threadID, replyToMessage)
      await client.sendMessage(
        {
          body,
          // Cờ này được xử lý trong sendMessage.ts (isReminder = msg.remind === true)
          remind: true,
        } as any,
        threadID,
        messageReply.messageID
      );
    } catch (e) {
      const err = e as Error;
      await reply(`❎ Không thể tạo nhắc lại: ${err.message || String(e)}`);
    }
  },
};

export default remindReplyCommand;
