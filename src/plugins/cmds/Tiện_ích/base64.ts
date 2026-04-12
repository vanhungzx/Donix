"use strict";

import type { Command, CommandOnCallContext } from '@types';

function isValidBase64(str: string): boolean {
  try {
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(str)) {
      return false;
    }
    
    Buffer.from(str, 'base64');
    return true;
  } catch {
    return false;
  }
}

const base64Command: Command = {
  name: "base64",
  alias: ["b64", "encode64"],
  version: "1.0.0",
  role: 0,
  desc: "Mã hóa/giải mã Base64",
  guide:
    "   {pn} encode <văn bản>\n" +
    "   {pn} decode <base64>\n" +
    "   {pn} <văn bản>\n\n" +
    "   • {pn} encode <văn bản>: Mã hóa sang Base64\n" +
    "   • {pn} decode <base64>: Giải mã từ Base64\n" +
    "   • {pn} <văn bản>: Tự động mã hóa (mặc định)\n\n" +
    "   Ví dụ:\n" +
    "   • {pn} encode Hello World\n" +
    "   • {pn} decode SGVsbG8gV29ybGQ=\n" +
    "   • {pn} Hello World",
  cd: 3,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { args, reply } = ctx;

    try {
      if (!args[0]) {
        await reply({
          body: "❌ Vui lòng nhập văn bản hoặc Base64!\n\n" +
            "📖 Cách sử dụng:\n" +
            "• {pn} encode <văn bản> - Mã hóa\n" +
            "• {pn} decode <base64> - Giải mã\n" +
            "• {pn} <văn bản> - Tự động mã hóa\n\n" +
            "Ví dụ:\n" +
            "• {pn} encode Hello\n" +
            "• {pn} decode SGVsbG8="
        });
        return;
      }

      const action = args[0].toLowerCase();
      let input: string;

      if (action === "encode" || action === "e") {
        
        if (args.length < 2) {
          await reply({
            body: "❌ Vui lòng nhập văn bản cần mã hóa!"
          });
          return;
        }
        input = args.slice(1).join(" ");

        if (input.length > 5000) {
          await reply({
            body: "❌ Văn bản quá dài! Vui lòng nhập tối đa 5000 ký tự."
          });
          return;
        }

        const encoded = Buffer.from(input, 'utf-8').toString('base64');

        await reply({
          body: `✅ MÃ HÓA BASE64 THÀNH CÔNG\n\n` +
            `📝 Văn bản gốc:\n${input}\n\n` +
            `🔐 Base64:\n\`\`\`${encoded}\`\`\``
        });

      } else if (action === "decode" || action === "d") {
        
        if (args.length < 2) {
          await reply({
            body: "❌ Vui lòng nhập Base64 cần giải mã!"
          });
          return;
        }
        input = args.slice(1).join(" ").trim();

        if (!isValidBase64(input)) {
          await reply({
            body: "❌ Chuỗi Base64 không hợp lệ!"
          });
          return;
        }

        try {
          const decoded = Buffer.from(input, 'base64').toString('utf-8');

          await reply({
            body: `✅ GIẢI MÃ BASE64 THÀNH CÔNG\n\n` +
              `🔐 Base64:\n${input}\n\n` +
              `📝 Văn bản:\n\`\`\`${decoded}\`\`\``
          });
        } catch (error: any) {
          await reply({
            body: `❌ Lỗi giải mã: ${error.message || "Không thể giải mã Base64"}`
          });
        }

      } else {
        
        input = args.join(" ").trim();

        if (isValidBase64(input)) {
          
          try {
            const decoded = Buffer.from(input, 'base64').toString('utf-8');
            await reply({
              body: `✅ GIẢI MÃ BASE64\n\n` +
                `🔐 Base64:\n${input}\n\n` +
                `📝 Văn bản:\n\`\`\`${decoded}\`\`\``
            });
            return;
          } catch {
            
          }
        }

        
        if (input.length > 5000) {
          await reply({
            body: "❌ Văn bản quá dài! Vui lòng nhập tối đa 5000 ký tự."
          });
          return;
        }

        const encoded = Buffer.from(input, 'utf-8').toString('base64');

        await reply({
          body: `✅ MÃ HÓA BASE64\n\n` +
            `📝 Văn bản:\n${input}\n\n` +
            `🔐 Base64:\n\`\`\`${encoded}\`\`\``
        });
      }

    } catch (e: any) {
      console.error("Base64 command error:", e);
      await reply({
        body: `❌ Đã xảy ra lỗi: ${e.message || "Lỗi không xác định"}`
      });
    }
  },
};

export default base64Command;
