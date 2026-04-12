"use strict";

import type { Command, CommandOnCallContext } from '@types';
import axios from "axios";

function isValidURL(u: string): boolean {
  try {
    new URL(u);
    return true;
  } catch {
    return false;
  }
}

async function shortenURL(url: string): Promise<{ shortUrl: string; originalUrl: string }> {
  try {

    const response = await axios.get("https://is.gd/create.php", {
      params: {
        format: "json",
        url: url
      },
      timeout: 10000
    });

    if (response.data && response.data.shorturl) {
      return {
        shortUrl: response.data.shorturl,
        originalUrl: url
      };
    }

    throw new Error("Không thể rút gọn URL");
  } catch (error: any) {

    try {
      const response = await axios.get("https://tinyurl.com/api-create.php", {
        params: {
          url: url
        },
        timeout: 10000
      });

      if (response.data && typeof response.data === "string" && response.data.startsWith("http")) {
        return {
          shortUrl: response.data.trim(),
          originalUrl: url
        };
      }
    } catch {

    }

    throw new Error(`Không thể rút gọn URL: ${error.message || "Lỗi không xác định"}`);
  }
}

const shortenCommand: Command = {
  name: "shorten",
  alias: ["rutgon", "link"],
  version: "1.0.0",
  role: 0,
  desc: "Rút gọn link URL",
  guide:
    "   {pn} <URL>\n\n" +
    "   • {pn} <URL>: Rút gọn link dài thành link ngắn\n\n" +
    "   Ví dụ:\n" +
    "   • {pn} https://www.facebook.com/very/long/url/here\n" +
    "   • {pn} https://example.com/page?param=value",
  cd: 3,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { args, reply } = ctx;

    try {
      if (!args[0]) {
        await reply({
          body: "❌ Vui lòng nhập URL cần rút gọn!\n\n" +
            "📖 Cách sử dụng:\n" +
            "• {pn} <URL>\n\n" +
            "Ví dụ:\n" +
            "• {pn} https://www.facebook.com/very/long/url"
        });
        return;
      }

      let url = args.join(" ").trim();


      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
      }

      if (!isValidURL(url)) {
        await reply({
          body: "❌ URL không hợp lệ! Vui lòng nhập URL đúng định dạng.\n\n" +
            "Ví dụ: https://www.example.com"
        });
        return;
      }

      await reply({
        body: "⏳ Đang rút gọn link..."
      });

      const result = await shortenURL(url);

      await reply({
        body: `✅ ĐÃ RÚT GỌN LINK THÀNH CÔNG\n\n` +
          `🔗 Link gốc:\n${result.originalUrl}\n\n` +
          `✨ Link rút gọn:\n${result.shortUrl}\n\n` +
          `📏 Độ dài: ${result.originalUrl.length} → ${result.shortUrl.length} ký tự`
      });

    } catch (e: any) {
      console.error("Shorten command error:", e);
      await reply({
        body: `❌ Đã xảy ra lỗi: ${e.message || "Lỗi không xác định"}`
      });
    }
  },
};

export default shortenCommand;
