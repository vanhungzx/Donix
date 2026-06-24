import type { Command, CommandOnCallContext } from '@types';

const uidCommand: Command = {
  name: "uid",
  alias: ["uid"],
  version: "1.0.0",
  role: 0,
  desc: "Get user ID",
  guide:
    "   {pn} <trống>: Lấy ID của bản thân\n   {pn} @tag: Lấy ID người được tag\n   {pn} reply: Lấy ID người được reply\n   {pn} group: Lấy ID nhóm hiện tại\n   {pn} all: Lấy ID tất cả thành viên trong nhóm\n   {pn} <link FB>: Lấy ID từ link Facebook",
  cd: 5,
  prefix: false,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { client, event, args, reply } = ctx;

    try {
      let id: string | undefined;

      // ✅ FIX: Ưu tiên reply trước tất cả
      if (event.type === "message_reply" && event.messageReply) {
        id =
          event.messageReply.senderID ||
          event.messageReply.author ||
          event.messageReply.userID;

        if (client.shareContact && id) {
          await client.shareContact(id, id, event.threadID);
        } else {
          await reply(`🆔 ID người được reply: ${id || "Không xác định"}`);
        }
        return;
      }

      // ✅ Sau đó mới tới bản thân
      if (!args[0]) {
        id = event.senderID;
        if (client.shareContact && id) {
          await client.shareContact(id, id, event.threadID);
        } else {
          await reply(`🆔 ID của bạn: ${id}`);
        }
        return;
      }

      // ✅ Link FB
      if (args[0].startsWith("https://")) {
        try {
          if (!client.getUID) {
            await reply("❌ Tính năng lấy ID từ link không khả dụng!");
            return;
          }
          const uid = (await client.getUID(args[0])) as string;
          if (client.shareContact && uid) {
            await client.shareContact(uid, uid, event.threadID);
          } else {
            await reply(`🆔 ID từ link: ${uid}`);
          }
          return;
        } catch (error: any) {
          await reply(`❌ Không thể lấy ID từ link: ${error.message || "Lỗi không xác định"}`);
          return;
        }
      }

      const t = args.join(" ");

      // ✅ Tag
      if (t.indexOf("@") !== -1 && event.mentions && Object.keys(event.mentions).length > 0) {
        id = Object.keys(event.mentions)[0];
        if (client.shareContact && id) {
          await client.shareContact(id, id, event.threadID);
        } else {
          await reply(`🆔 ID người được tag: ${id}`);
        }
        return;
      }

      // ✅ All
      if (t === "all") {
        if (!event.isGroup) {
          await reply("❌ Lệnh này chỉ dùng trong nhóm!");
          return;
        }

        const participantIDs = event.participantIDs || [];
        if (participantIDs.length === 0) {
          await reply({ body: "❌ Không có danh sách thành viên!" });
          return;
        }

        let m = "";
        let c = 0;
        for (const i of participantIDs) {
          c++;
          m += `${c}. ${i}\n`;
        }

        await reply(`📋 Danh sách ID thành viên (${c} người):\n\n${m}`);
        return;
      }

      // ✅ Group
      if (t === "-g" || t === "group" || t === "box" || t === "gr") {
        id = event.threadID;
        await reply(`🆔 ID nhóm: ${id}`);
        return;
      }

      // fallback
      await reply("❌ Không tìm thấy ID. Vui lòng thử:\n• Reply tin nhắn\n• Tag người dùng\n• Nhập link Facebook\n• Dùng lệnh trong nhóm");

    } catch (e: any) {
      console.error("UID command error:", e);
      await reply(`❌ Đã xảy ra lỗi: ${e.message || "Lỗi không xác định"}`);
    }
  }
};

export default uidCommand;