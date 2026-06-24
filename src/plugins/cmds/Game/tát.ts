"use strict";

import type { Command, CommandOnCallContext } from '@types';
import fs from "fs-extra";
import path from "path";

const tatCommand: Command = {
  name: "tát",
  alias: ["tát"],
  version: "1.0.0",
  role: 0,
  desc: "Tát người bạn tag hoặc reply",
  guide: "{pn} @tag hoặc reply: Tát người\nVí dụ: {pn} @name hoặc reply tin nhắn",
  cd: 5,
  prefix: false,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { event, client, userData } = ctx;
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
      await client.sendMessage("Vui lòng tag hoặc reply 1 người", event.threadID, event.messageID);
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

    const gifPath = path.join(process.cwd(), "src/storage", "image", "tat.gif");

    try {
      if (!fs.existsSync(gifPath)) {
        await client.sendMessage("Không tìm thấy file gif", event.threadID, event.messageID);
        return;
      }

      await client.sendMessage({
        body: `${tag} không thoát được ta đâu kkk 🎀`,
        mentions: [{ tag: tag, id: mentionId }],
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