"use strict";

import type { Command, CommandOnCallContext } from '@types';
import fs from "fs-extra";
import path from "path";

const damCommand: Command = {
  name: "đấm",
  alias: ["đấm"],
  version: "1.0.0",
  role: 0,
  desc: "Đấm người bạn tag",
  guide: "{pn} @tag: Đấm người bạn tag\nVí dụ: {pn} @name",
  cd: 5,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { reply, event } = ctx;
    const { mentions } = event;

    const mention = Object.keys(mentions || {});

    if (!mention.length) {
      await reply("Vui lòng tag 1 người");
      return;
    }

    const mentionId = mention[0];
    if (!mentionId) {
      await reply("Vui lòng tag 1 người");
      return;
    }
    const tag = (mentions?.[mentionId] || "").replace("@", "");

    const gifPath = path.join(
      process.cwd(),
      "src/storage/image/dam.gif"
    );

    try {
      if (!fs.existsSync(gifPath)) {
        await reply("Không tìm thấy file gif");
        return;
      }

      await reply({
        body: `${tag} bạn thật là xàm lồn mình xin phép đấm chết con mẹ bạn nhé 🎀`,
        mentions: [{ tag: tag, id: mentionId }],
        attachment: fs.createReadStream(gifPath),
      });
    } catch (error) {
      console.error("Error:", error);
      await reply("Có lỗi xảy ra khi xử lý yêu cầu");
    }
  },
};

export default damCommand;
