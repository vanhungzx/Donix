"use strict";

import type { Command, CommandOnCallContext } from '@types';
import axios from "axios";
import fs from "fs-extra";
import path from "path";

const tileCommand: Command = {
  name: "tile",
  alias: ["tyle", "matchrate"],
  version: "1.0.1",
  role: 0,
  desc: "Kiểm tra tỉ lệ hợp đôi giữa 2 người",
  guide: "{pn} [tag] → Kiểm tra tỉ lệ hợp đôi với người được tag",
  cd: 20,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    try {
      const { client, event, userData } = ctx;
      const { threadID, messageID, senderID, mentions } = event;

      const mention = Object.keys(mentions || {})[0];

      if (!mention) {
        await client.sendMessage(
          "Bạn cần tag một người để kiểm tra tỉ lệ hợp đôi",
          threadID,
          messageID
        );
        return;
      }

      const user1 = await userData.get(mention);
      const user2 = await userData.get(senderID);

      const name = user1?.name || "Người dùng";
      const namee = user2?.name || "Người dùng";

      const matchRate = Math.floor(Math.random() * 101);

      const arraytag = [
        { id: mention, tag: name },
        { id: senderID, tag: namee },
      ];

      const tempPath = path.join(process.cwd(), "src/temp");
      await fs.ensureDir(tempPath);

      const avatar1Path = path.join(tempPath, `avt_${Date.now()}_${mention}.png`);
      const avatar2Path = path.join(tempPath, `avt_${Date.now()}_${senderID}.png`);

      try {
        const avatar1 = (
          await axios.get(
            `https://graph.facebook.com/${mention}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
            { responseType: "arraybuffer" }
          )
        ).data;

        await fs.writeFile(avatar1Path, Buffer.from(avatar1));

        const avatar2 = (
          await axios.get(
            `https://graph.facebook.com/${senderID}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
            { responseType: "arraybuffer" }
          )
        ).data;

        await fs.writeFile(avatar2Path, Buffer.from(avatar2));

        const imglove = [
          fs.createReadStream(avatar2Path),
          fs.createReadStream(avatar1Path),
        ];

        await client.sendMessage(
          {
            body: `====「 Tỉ Lệ Hợp Đôi 」====\n- Ghép đôi thành công\n- ${namee} với ${name}\n- Tỉ lệ hợp đôi: ${matchRate}%`,
            mentions: arraytag as any,
            attachment: imglove,
          },
          threadID,
          messageID
        );
        return;
      } finally {
        
        try {
          if (fs.existsSync(avatar1Path)) {
            fs.unlinkSync(avatar1Path);
          }
          if (fs.existsSync(avatar2Path)) {
            fs.unlinkSync(avatar2Path);
          }
        } catch {
          
        }
      }
    } catch (e: any) {
      console.log(e);
      const { client, event } = ctx;
      await client.sendMessage(
        "Đã xảy ra lỗi",
        event.threadID,
        event.messageID
      );
    }
  },
};

export default tileCommand;
