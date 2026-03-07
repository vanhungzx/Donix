"use strict";

import type { Command, CommandOnCallContext } from "@types";

const pollCommand: Command = {
  name: "poll",
  alias: ["taobinhchon"],
  version: "1.0.0",
  role: 1,
  desc: "Tạo cuộc thăm dò ý kiến trong nhóm",
  guide:
    "{pn} [Câu hỏi] | [Lựa chọn 1] | [Lựa chọn 2] | [Lựa chọn 3]...\n\n" +
    "Ví dụ:\n" +
    "- {pn} Bạn thích màu gì? | Đỏ | Xanh | Vàng\n" +
    "- {pn} Hôm nay đi đâu? | Công viên | Rạp chiếu phim | Ở nhà",
  cd: 5,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { event, args, client, reply } = ctx;
    const { threadID } = event;

    try {
      if (!args.length) {
        await reply(
          "❌ Vui lòng nhập câu hỏi và các lựa chọn!\n\n" +
          "📖 Cú pháp: {pn} [Câu hỏi] | [Lựa chọn 1] | [Lựa chọn 2] | ...\n\n" +
          "📝 Ví dụ:\n" +
          "• {pn} Bạn thích màu gì? | Đỏ | Xanh | Vàng\n" +
          "• {pn} Hôm nay đi đâu? | Công viên | Rạp chiếu phim | Ở nhà"
        );
        return;
      }

      const input = args.join(" ");
      const parts = input.split("|").map((p) => p.trim()).filter((p) => p.length > 0);

      if (parts.length < 3) {
        await reply(
          "❌ Cần ít nhất 1 câu hỏi và 2 lựa chọn!\n\n" +
          "📖 Cú pháp: {pn} [Câu hỏi] | [Lựa chọn 1] | [Lựa chọn 2] | ...\n\n" +
          "📝 Ví dụ:\n" +
          "• {pn} Bạn thích màu gì? | Đỏ | Xanh | Vàng"
        );
        return;
      }

      const questionText = parts[0] || "";
      const options = parts.slice(1);

      if (questionText.length === 0) {
        await reply("❌ Câu hỏi không được để trống!");
        return;
      }

      if (options.length < 2) {
        await reply("❌ Cần ít nhất 2 lựa chọn!");
        return;
      }

      if (options.length > 10) {
        await reply("❌ Tối đa 10 lựa chọn!");
        return;
      }

      
      for (const option of options) {
        if (option.length > 100) {
          await reply("❌ Mỗi lựa chọn không được quá 100 ký tự!");
          return;
        }
      }

      if (questionText.length > 200) {
        await reply("❌ Câu hỏi không được quá 200 ký tự!");
        return;
      }

      
      const createPollFn = client?.createPoll as ((threadID: string, questionText: string, options: string[], callback?: any) => Promise<{ success: boolean; response: any }>) | undefined;
      if (!createPollFn || typeof createPollFn !== "function") {
        await reply("❌ Lỗi: API tạo poll không khả dụng!");
        return;
      }

      try {
        const result = await createPollFn(threadID, questionText, options);
        if (result.success) {
          await reply("✅ Đã tạo cuộc thăm dò thành công!");
        } else {
          await reply("❌ Đã xảy ra lỗi khi tạo cuộc thăm dò!");
        }
      } catch (error: any) {
        console.error("Error creating poll:", error);
        await reply(
          "❌ Đã xảy ra lỗi khi tạo cuộc thăm dò!\n" +
          `Chi tiết: ${error?.message || String(error)}`
        );
      }
    } catch (error: any) {
      console.error("Error in poll command:", error);
      await reply("❌ Đã xảy ra lỗi không mong muốn!");
    }
  },
};

export default pollCommand;
