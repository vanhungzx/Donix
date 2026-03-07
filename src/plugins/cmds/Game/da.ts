"use strict";

import type { Command, CommandOnCallContext } from '@types';
import axios from "axios";
import fs from "fs-extra";
import path from "path";

const links = [
  "https://i.postimg.cc/65TSxJYD/2ce5a017f6556ff103bce87b273b89b7.gif",
  "https://i.postimg.cc/65SP9jPT/Anime-083428-6224795.gif",
  "https://i.postimg.cc/RFXP2XfS/jXOwoHx.gif",
  "https://i.postimg.cc/jSPMRsNk/tumblr-nyc5ygy2a-Z1uz35lto1-540.gif",
];

const daCommand: Command = {
  name: "đá",
  alias: ["đá"],
  version: "1.0.0",
  role: 0,
  desc: "Đá người bạn tag",
  guide: "{pn} @tag: Đá người bạn tag\nVí dụ: {pn} @name",
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

    const randomLink = links[Math.floor(Math.random() * links.length)];

    const tempDir = path.join(process.cwd(), "src/temp");

    await fs.ensureDir(tempDir);

    const gifPath = path.join(tempDir, "spair.gif");

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
        body: `${tag} bạn thật là xàm lồn mình xin phép sút chết con mẹ bạn nhé 🎀`,
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

export default daCommand;
