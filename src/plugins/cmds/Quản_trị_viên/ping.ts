"use strict";
import type { Command, CommandOnCallContext } from '@types';

const pingCommand: Command = {
  name: "ping",
  alias: ["all"],
  version: "1.0.5",
  role: 1,
  desc: "Tag toàn bộ thành viên",
  guide:
    "{pn} [Nội dung]\n\n" +
    "- [Nội dung]: Nội dung tin nhắn muốn gửi kèm tag (không bắt buộc)\n\n" +
    "Ví dụ:\n" +
    "- {pn} Họp nhóm lúc 8h tối nay\n" +
    "- {pn}",
  cd: 0,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { client, event, args } = ctx;

    try {
      const body = args.length !== 0 ? args.join(" ") : "@mọi người";

      await client.sendMessage(
        { body, mentions: "tag_thread" },
        event.threadID
      );
    } catch (e: any) {
      console.error("Error in ping command:", e);
      await client.sendMessage(
        "❌ Đã xảy ra lỗi khi tag toàn bộ thành viên",
        event.threadID
      );
    }
  },
};

export default pingCommand;
