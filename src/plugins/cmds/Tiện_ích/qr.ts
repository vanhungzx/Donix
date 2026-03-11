"use strict";

import type { Command, CommandOnCallContext } from '@types';
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { TEMP_DIR } from "../../../core/storagePath";

const TempRoot = TEMP_DIR();

if (!fs.existsSync(TempRoot)) {
  fs.mkdirSync(TempRoot, { recursive: true });
}

const qrCommand: Command = {
  name: "qr",
  alias: ["qrcode", "mãqr"],
  version: "1.0.0",
  role: 0,
  desc: "Tạo mã QR code từ văn bản hoặc URL",
  guide:
    "   {pn} <văn bản/URL>\n\n" +
    "   • {pn} <văn bản>: Tạo mã QR từ văn bản\n" +
    "   • {pn} <URL>: Tạo mã QR từ link\n" +
    "   • {pn} <số>: Tạo mã QR từ số điện thoại\n\n" +
    "   Ví dụ:\n" +
    "   • {pn} https://facebook.com\n" +
    "   • {pn} Hello World\n" +
    "   • {pn} 0123456789",
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { client, event, args, reply } = ctx;

    try {
      if (!args[0]) {
        await reply({
          body: "❌ Vui lòng nhập văn bản hoặc URL để tạo mã QR!\n\n" +
            "📖 Cách sử dụng:\n" +
            "• {pn} <văn bản>\n" +
            "• {pn} <URL>\n" +
            "• {pn} <số điện thoại>"
        });
        return;
      }

      const text = args.join(" ");

      if (text.length > 1000) {
        await reply({
          body: "❌ Văn bản quá dài! Vui lòng nhập tối đa 1000 ký tự."
        });
        return;
      }

      await reply({
        body: "⏳ Đang tạo mã QR..."
      });

      
      const encodedText = encodeURIComponent(text);

      
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodedText}&format=png`;

      
      const response = await axios.get(qrUrl, {
        responseType: "stream",
        timeout: 15000
      });

      
      const tempFilePath = path.join(TempRoot, `qr_${Date.now()}.png`);
      const writer = fs.createWriteStream(tempFilePath);

      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      
      const imageStream = fs.createReadStream(tempFilePath);

      await reply({
        body: `✅ Đã tạo mã QR thành công!\n\n📝 Nội dung: ${text.substring(0, 100)}${text.length > 100 ? "..." : ""}`,
        attachment: imageStream
      });

      
      setTimeout(() => {
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch (e) {
          
        }
      }, 5000);

    } catch (e: any) {
      console.error("QR command error:", e);
      await reply({
        body: `❌ Đã xảy ra lỗi khi tạo mã QR: ${e.message || "Lỗi không xác định"}`
      });
    }
  },
};

export default qrCommand;
