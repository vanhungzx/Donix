"use strict";

import type { Command, CommandOnCallContext } from '@types';
import fs, { createReadStream } from "fs";
import path from "path";
import { storagePath } from "../../../core/storagePath";

const girlCommand: Command = {
  name: "girl",
  alias: ["gái"],
  version: "1.0.0",
  role: 0,
  desc: "Xem ảnh gái xinh",
  guide: "{pn} girl → Xem ảnh gái xinh ngẫu nhiên\n   {pn} → Tên lệnh của bot",
  cd: 10,
  prefix: true,
  async onCall({ reply }: CommandOnCallContext): Promise<void> {
    try {
      const folderPath = storagePath("media", "girl");
      const files = fs.readdirSync(folderPath);
      if (files.length === 0) {
        await reply("Không có ảnh nào trong thư mục");
        return;
      }
      const randomFile = files[Math.floor(Math.random() * files.length)];
      if (!randomFile) {
        await reply("Không thể chọn ảnh ngẫu nhiên");
        return;
      }
      const filePath = path.join(folderPath, randomFile);
      await reply(
        {
          body: `Mê gái xinh à? Ảnh cho bạn nè <3`,
          attachment: createReadStream(filePath),
        });
    } catch (e) {
      console.error(e);
      await reply("Đã xảy ra lỗi");
    }
  },
};

export default girlCommand;
