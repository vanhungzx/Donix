"use strict";

import type { Command, CommandOnCallContext } from '@types';
import fs from "fs-extra";
import path from "path";
import { storagePath } from "../../../core/storagePath";

const omCommand: Command = {
  name: "ôm",
  alias: ["ôm"],
  version: "1.0.0",
  role: 0,
  desc: "Ôm người bạn tag",
  guide: "{pn} @tag: Ôm người bạn tag\nVí dụ: {pn} @name",
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

    const gifPath = storagePath("image", "om.gif");

    try {
      if (!fs.existsSync(gifPath)) {
        await reply("Không tìm thấy file gif");
        return;
      }

      await reply({
        body: `${tag} ôm mụt cái nè 💓`,
        mentions: [{ tag: tag, id: mentionId }],
        attachment: fs.createReadStream(gifPath),
      });
    } catch (error) {
      console.error("Error:", error);
      await reply("Có lỗi xảy ra khi xử lý yêu cầu");
    }
  },
};

export default omCommand;
