"use strict";

import type { Command, CommandOnCallContext } from '@types';
import * as crypto from "crypto";

function generateHash(text: string, algorithm: string): string {
  return crypto.createHash(algorithm).update(text, 'utf-8').digest('hex');
}

const hashCommand: Command = {
  name: "hash",
  alias: ["md5", "sha256", "sha512"],
  version: "1.0.0",
  role: 0,
  desc: "Tạo hash MD5, SHA256, SHA512",
  guide:
    "   {pn} <thuật toán> <văn bản>\n" +
    "   {pn} <văn bản>\n\n" +
    "   • {pn} <thuật toán> <văn bản>: Tạo hash với thuật toán chỉ định\n" +
    "   • {pn} <văn bản>: Tạo hash SHA256 (mặc định)\n\n" +
    "   Thuật toán hỗ trợ: md5, sha256, sha512\n\n" +
    "   Ví dụ:\n" +
    "   • {pn} md5 Hello World\n" +
    "   • {pn} sha256 Hello World\n" +
    "   • {pn} Hello World",
  cd: 3,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { args, reply } = ctx;

    try {
      if (!args[0]) {
        await reply({
          body: "❌ Vui lòng nhập văn bản cần hash!\n\n" +
            "📖 Cách sử dụng:\n" +
            "• {pn} <thuật toán> <văn bản>\n" +
            "• {pn} <văn bản> (mặc định SHA256)\n\n" +
            "Thuật toán: md5, sha256, sha512\n\n" +
            "Ví dụ:\n" +
            "• {pn} md5 Hello\n" +
            "• {pn} Hello"
        });
        return;
      }

      const algorithms: Record<string, string> = {
        "md5": "md5",
        "sha256": "sha256",
        "sha512": "sha512",
        "sha1": "sha1"
      };

      let algorithm = "sha256"; 
      let text: string;

      const firstArg = args[0].toLowerCase();

      if (algorithms[firstArg] && args.length > 1) {
        
        algorithm = algorithms[firstArg];
        text = args.slice(1).join(" ");
      } else {
        
        text = args.join(" ");
      }

      if (!text || text.trim().length === 0) {
        await reply({
          body: "❌ Vui lòng nhập văn bản cần hash!"
        });
        return;
      }

      if (text.length > 10000) {
        await reply({
          body: "❌ Văn bản quá dài! Vui lòng nhập tối đa 10000 ký tự."
        });
        return;
      }

      const hash = generateHash(text, algorithm);
      const algorithmName = algorithm.toUpperCase();

      await reply({
        body: `✅ ${algorithmName} HASH\n\n` +
          `📝 Văn bản:\n${text}\n\n` +
          `🔐 ${algorithmName}:\n\`\`\`${hash}\`\`\`\n\n` +
          `📏 Độ dài: ${hash.length} ký tự`
      });

    } catch (e: any) {
      console.error("Hash command error:", e);
      await reply({
        body: `❌ Đã xảy ra lỗi: ${e.message || "Lỗi không xác định"}`
      });
    }
  },
};

export default hashCommand;
