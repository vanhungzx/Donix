"use strict";

import type { Command, CommandOnCallContext } from "@types";
import axios from "axios";
import fs from "fs";
import path from "path";
import { TEMP_DIR } from "../../../core/storagePath";
import { imagineGenerate, imagineSuggestions } from "../../../API/detail/AI/imagine";

const imagineCommand: Command = {
  name: "imagine",
  alias: ["aiimg", "genai"],
  version: "1.0.0",
  role: 0,
  desc: "Tạo ảnh AI Imagine (Facebook)",
  guide: "{pn} [prompt]\n{pn} suggest - lấy gợi ý prompt có sẵn",
  cd: 10,
  prefix: true,
  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { client, event, args, reply } = ctx;
    const threadID = event.threadID;

    if (!args[0]) {
      await reply("Nhập prompt hoặc dùng: imagine suggest");
      return;
    }

    const sub = args[0].toLowerCase();

    // Lấy gợi ý prompt có sẵn
    if (sub === "suggest" || sub === "gợiý" || sub === "goiy") {
      try {
        const suggestions = await imagineSuggestions({});
        if (!suggestions.length) {
          await reply("Không lấy được gợi ý nào.");
          return;
        }

        const msg =
          "Một số gợi ý:\n\n" +
          suggestions
            .slice(0, 10)
            .map(
              (s, i) =>
                `${i + 1}. ${s.short_prompt || s.prompt}\n   → ${s.prompt}`
            )
            .join("\n\n");

        await reply(msg);
      } catch (err: any) {
        console.error(err);
        await reply(
          "Lỗi khi lấy gợi ý Imagine: " + (err?.message || String(err))
        );
      }
      return;
    }

    const prompt = args.join(" ");
    const tempDir = TEMP_DIR();
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    try {
      await reply("⏳ Đang tạo ảnh, vui lòng đợi chút...");

      const result = await imagineGenerate({ prompt });
      const imgUrl = result.uri;

      if (!imgUrl) {
        await reply("Không lấy được URL ảnh từ Imagine.");
        return;
      }

      const res = await axios.get(imgUrl, {
        responseType: "arraybuffer",
        timeout: 60000
      });

      const filePath = path.join(tempDir, `imagine_${Date.now()}.jpg`);
      fs.writeFileSync(filePath, Buffer.from(res.data));

      await client.sendMessage(
        { body: "", attachment: fs.createReadStream(filePath) },
        threadID,
        event.messageID
      );

      setTimeout(() => {
        try {
          fs.unlinkSync(filePath);
        } catch { }
      }, 30000);
    } catch (err: any) {
      console.error(err);
      await reply("Không tạo được ảnh Imagine: " + (err?.message || String(err)));
    }
  }
};

export default imagineCommand;
