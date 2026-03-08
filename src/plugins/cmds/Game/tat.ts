"use strict";

import type { Command, CommandOnCallContext } from '@types';
import fs from "fs-extra";
import path from "path";
import { storagePath } from "../../../core/storagePath";

const tatCommand: Command = {
  name: "tát",
  alias: ["tát"],
  version: "1.0.0",
  role: 0,
  desc: "Tát người bạn tag",
  guide: "{pn} @tag: Tát người bạn tag\nVí dụ: {pn} @name",
  cd: 5,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { event, client } = ctx;
    const { mentions } = event;

    const mention = Object.keys(mentions || {});

    if (!mention.length) {
      await client.sendMessage("Vui lòng tag 1 người", event.threadID, event.messageID);
      return;
    }

    const mentionId = mention[0];
    if (!mentionId) {
      await client.sendMessage("Vui lòng tag 1 người", event.threadID, event.messageID);
      return;
    }

    const tag = (mentions?.[mentionId] || "").replace("@", "");

    const gifPath = storagePath("image", "tat.gif");

    try {
      if (!fs.existsSync(gifPath)) {
        await client.sendMessage("Không tìm thấy file gif", event.threadID, event.messageID);
        return;
      }

      await client.sendMessage({
        body: `${tag} không thoát được ta đâu kkk 🎀`,
        mentions: [mentionId],
        attachment: fs.createReadStream(gifPath),
      }, event.threadID, event.messageID);
    } catch (error) {
      console.error("Error:", error);
      await client.sendMessage("Có lỗi xảy ra khi xử lý yêu cầu", event.threadID, event.messageID);
      return;
    }
  },
};

export default tatCommand;
