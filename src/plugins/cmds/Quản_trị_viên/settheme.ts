
import type { Command } from '@types';

const command: Command = {
  name: "settheme",
  version: "1.0.0",
  role: 3,
  desc: "Đổi theme bằng ảnh",
  prefix: true,
  onCall: async ({ client, event, args, reply }) => {
    const { threadID } = event;

    const replyAttachments = (event.messageReply as any)?.attachments as Array<{ url?: string }> | undefined;
    let imageUrl = replyAttachments?.[0]?.url;

    if (!imageUrl && args.length > 0) {
      imageUrl = args[0];
    }

    if (!imageUrl) {
      await reply("⚠️ Vui lòng reply ảnh hoặc gửi URL ảnh!");
      return;
    }

    try {
      await client.setTheme(imageUrl as string, threadID, (err: any) => {
        if (err) {
          return reply(`❌ Lỗi: ${err.message}`);
        }
        return reply("✅ Đã đổi theme thành công!");
      });
      await reply("✅ Đã đổi theme thành công!");
    } catch (error: any) {
      await reply(`❌ Lỗi: ${error.message}`);
    }
  }
};

export default command;
