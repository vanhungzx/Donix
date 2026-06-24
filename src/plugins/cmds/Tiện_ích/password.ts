"use strict";

import type { Command, CommandOnCallContext } from '@types';

function generatePassword(
  length: number = 12,
  includeUppercase: boolean = true,
  includeLowercase: boolean = true,
  includeNumbers: boolean = true,
  includeSymbols: boolean = true
): string {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";

  let charset = "";
  if (includeUppercase) charset += uppercase;
  if (includeLowercase) charset += lowercase;
  if (includeNumbers) charset += numbers;
  if (includeSymbols) charset += symbols;

  if (charset.length === 0) {
    charset = lowercase + numbers; 
  }

  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }

  return password;
}

function parseLength(input: string): number | null {
  const num = parseInt(input, 10);
  if (isNaN(num) || num < 1 || num > 128) {
    return null;
  }
  return num;
}

const passwordCommand: Command = {
  name: "password",
  alias: ["pass", "mk", "matkhau", "pwd"],
  version: "1.0.0",
  role: 0,
  desc: "Tạo mật khẩu ngẫu nhiên an toàn",
  guide:
    "   {pn} [độ dài] [tùy chọn]\n\n" +
    "   • {pn}: Tạo mật khẩu 12 ký tự mặc định\n" +
    "   • {pn} <số>: Tạo mật khẩu với độ dài chỉ định (1-128)\n" +
    "   • {pn} <số> -no-symbols: Tạo mật khẩu không có ký tự đặc biệt\n" +
    "   • {pn} <số> -simple: Chỉ chữ thường và số\n\n" +
    "   Ví dụ:\n" +
    "   • {pn}\n" +
    "   • {pn} 16\n" +
    "   • {pn} 20 -no-symbols\n" +
    "   • {pn} 8 -simple",
  cd: 3,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { args, reply } = ctx;

    try {
      let length = 12;
      let includeUppercase = true;
      let includeLowercase = true;
      let includeNumbers = true;
      let includeSymbols = true;

      
      if (args.length > 0) {
        
        const parsedLength = parseLength(args[0]!);
        if (parsedLength !== null) {
          length = parsedLength;
        }

        
        const allArgs = args.join(" ").toLowerCase();

        if (allArgs.includes("-no-symbols") || allArgs.includes("--no-symbols")) {
          includeSymbols = false;
        }

        if (allArgs.includes("-simple") || allArgs.includes("--simple")) {
          includeUppercase = false;
          includeSymbols = false;
        }
      }

      
      const password = generatePassword(
        length,
        includeUppercase,
        includeLowercase,
        includeNumbers,
        includeSymbols
      );

      
      let strength = "Yếu";
      let strengthEmoji = "🔴";

      if (length >= 16 && includeUppercase && includeLowercase && includeNumbers && includeSymbols) {
        strength = "Rất mạnh";
        strengthEmoji = "🟢";
      } else if (length >= 12 && includeUppercase && includeLowercase && includeNumbers) {
        strength = "Mạnh";
        strengthEmoji = "🟡";
      } else if (length >= 8 && (includeUppercase || includeLowercase) && includeNumbers) {
        strength = "Trung bình";
        strengthEmoji = "🟠";
      }

      const options: string[] = [];
      if (includeUppercase) options.push("Chữ hoa");
      if (includeLowercase) options.push("Chữ thường");
      if (includeNumbers) options.push("Số");
      if (includeSymbols) options.push("Ký tự đặc biệt");

      await reply({
        body: `🔐 MẬT KHẨU ĐÃ TẠO\n\n` +
          `📝 Mật khẩu:\n\`\`\`${password}\`\`\`\n\n` +
          `📊 Thông tin:\n` +
          `• Độ dài: ${length} ký tự\n` +
          `• Độ mạnh: ${strengthEmoji} ${strength}\n` +
          `• Bao gồm: ${options.join(", ") || "Không có"}\n\n` +
          `⚠️ Lưu ý: Hãy lưu mật khẩu ở nơi an toàn!`
      });

    } catch (e: any) {
      console.error("Password command error:", e);
      await reply({
        body: `❌ Đã xảy ra lỗi: ${e.message || "Lỗi không xác định"}`
      });
    }
  },
};

export default passwordCommand;
