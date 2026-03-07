"use strict";

import type { Command, CommandOnCallContext } from '@types';
import axios from "axios";
import fs from "fs-extra";
import path from "path";

const honCommand: Command = {
  name: "hôn",
  alias: ["hon"],
  version: "1.0.0",
  role: 0,
  desc: "Hôn người bạn tag",
  guide: "{pn} @tag: Hôn người bạn tag\nVí dụ: {pn} @name",
  cd: 5,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { reply, event } = ctx;

    const links = [
      "https://i.pinimg.com/originals/78/09/5c/78095c007974aceb72b91aeb7ee54a71.gif",
    ];

    const mention = Object.keys(event.mentions || {});
    if (!mention.length) {
      await reply("Vui lòng tag 1 người");
      return;
    }

    const mentionId = mention[0];
    if (!mentionId) {
      await reply("Vui lòng tag 1 người");
      return;
    }

    const tag = (event.mentions?.[mentionId]?.replace("@", "")) || mentionId;
    const randomLink = links[Math.floor(Math.random() * links.length)];
    const tempDir = path.join(process.cwd(), "src/temp");

    if (!fs.existsSync(tempDir)) {
      await fs.ensureDir(tempDir);
    }

    const gifPath = path.join(tempDir, "hon.gif");

    try {
      const response = await axios({
        method: "get",
        url: randomLink,
        responseType: "stream",
      });

      const writer = fs.createWriteStream(gifPath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      await reply({
        body: `${tag} 💋, hun cái nè 😘`,
        mentions: [{ tag: tag, id: mentionId }],
        attachment: fs.createReadStream(gifPath),
      });

      if (fs.existsSync(gifPath)) {
        fs.unlinkSync(gifPath);
      }
    } catch (error) {
      console.error("Error:", error);
      await reply("Có lỗi xảy ra khi xử lý yêu cầu");
    }
  },
};

export default honCommand;
