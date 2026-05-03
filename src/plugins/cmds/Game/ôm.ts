"use strict";

import type { Command, CommandOnCallContext } from '@types';
import fs from "fs-extra";
import path from "path";

const omCommand: Command = {
  name: "ôm",
  alias: ["ôm"],
  version: "1.0.0",
  role: 0,
  desc: "Ôm người bạn tag hoặc reply",
  guide: "{pn} @tag hoặc reply: Ôm người\nVí dụ: {pn} @name hoặc reply tin nhắn",
  cd: 5,
  prefix: false,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { reply, event, userData } = ctx;
    const { mentions, messageReply } = event;

    let mentionId = "";
    let tag = "";

    const mention = Object.keys(mentions || {});

    // ===== LẤY ID =====
    if (mention.length) {
      mentionId = mention[0];
    } else if (messageReply) {
      mentionId = messageReply.senderID;
    } else {
      await reply("Vui lòng tag hoặc reply 1 người");
      return;
    }

    // ===== LẤY TÊN (CHUẨN 100%) =====
    try {
      const getName = userData.getName as ((id: string) => Promise<string | null>) | undefined;

      tag =
        (getName ? await getName(String(mentionId)).catch(() => null) : null) ||
        `User_${String(mentionId).slice(-5)}`;
    } catch {
      tag = `User_${String(mentionId).slice(-5)}`;
    }

    const gifPath = path.join(process.cwd(), "src/storage/image/om.gif");

    try {
      if (!fs.existsSync(gifPath)) {
        await reply("Không tìm thấy file gif");
        return;
      }

      await reply({
        body: `${tag} lại đây ôm mụt cái nè 💓`,
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