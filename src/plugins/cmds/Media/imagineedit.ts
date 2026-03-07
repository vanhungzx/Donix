"use strict";

import type { Command, CommandOnCallContext } from "@types";
import axios from "axios";
import fs from "fs";
import path from "path";
import { imagineEditOnce } from "../../../API/detail/AI/imagineEdit";

const imagineEditCommand: Command = {
  name: "imagineedit",
  alias: ["imedit", "aiimgedit"],
  version: "1.0.0",
  role: 0,
  desc: "Chỉnh sửa ảnh AI Imagine từ ảnh đã upload (uploadAttachment)",
  guide: "{pn} [id_ảnh] [prompt]\nHoặc reply ảnh đã gửi từ bot cùng với: {pn} [prompt]",
  cd: 10,
  prefix: true,
  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { client, event, args, reply } = ctx;
    const threadID = event.threadID;

    if (!args[0] && !event.messageReply) {
      await reply(
        "Cách dùng:\n- {pn} [id_ảnh] [prompt]\n- Hoặc reply một ảnh đã upload kèm: {pn} [prompt]"
      );
      return;
    }

    let previousImageId: string | undefined;
    let prompt: string | undefined;

    // Trường hợp có reply ảnh: ưu tiên lấy id từ attachment
    const replied = event.messageReply as { attachments?: Array<Record<string, unknown>> } | undefined;
    if (replied && Array.isArray(replied.attachments) && replied.attachments.length > 0) {
      const att = replied.attachments[0] as Record<string, unknown>;
      previousImageId = att.url as string | undefined;
      prompt = args.join(" ").trim();
    } else {
      previousImageId = args[0];
      prompt = args.slice(1).join(" ").trim();
    }

    if (!previousImageId) {
      await reply(
        "Không tìm được ID ảnh. Hãy reply đúng ảnh bot đã gửi (ảnh từ uploadAttachment) hoặc nhập id_ảnh thủ công."
      );
      return;
    }

    if (!prompt) {
      await reply("Thiếu prompt. Ví dụ: imagineedit 1388761132658909 Thay đổi phong cách thành 3D");
      return;
    }

    const tempDir = path.join(process.cwd(), "src/temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    try {
      await reply("⏳ Đang chỉnh sửa ảnh, vui lòng đợi chút...");
      const id = await client.uploadAttachment([previousImageId]);
      const result = await imagineEditOnce({
        previousImageId: String(id[0].image_id),
        prompt
      });

      const imgUrl = result.uri;
      if (!imgUrl) {
        await reply("Không lấy được URL ảnh sau khi chỉnh sửa.");
        return;
      }

      const res = await axios.get(imgUrl, {
        responseType: "arraybuffer",
        timeout: 60000
      });

      const filePath = path.join(tempDir, `imagine_edit_${Date.now()}.jpg`);
      fs.writeFileSync(filePath, Buffer.from(res.data));

      await client.sendMessage(
        {
          body: "",
          attachment: fs.createReadStream(filePath)
        },
        threadID,
        event.messageID
      );

      setTimeout(() => {
        try {
          fs.unlinkSync(filePath);
        } catch { }
      }, 30000);
    } catch (err: unknown) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : String(err);
      await reply("Không chỉnh sửa được ảnh Imagine: " + message);
    }
  }
};

export default imagineEditCommand;
