"use strict";

import type { Command, CommandOnCallContext } from "@types";
import axios from "axios";
import fs from "fs-extra";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const chamdiemCommand: Command = {
  name: "chamdiem",
  alias: ["chamdiem"],
  version: "2.0.0",
  role: 0,
  desc: "Chấm điểm ngoại hình từ avatar bằng Gemini (có dự phòng offline)",
  guide: "{pn} [reply/@tag]",
  cd: 5,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { bot, event, userData } = ctx as any;
    const mentions = event.mentions || {};
    let target = Object.keys(mentions)[0];
    if (!target)
      target =
        event.type === "message_reply"
          ? event.messageReply?.senderID
          : event.senderID;

    try {
      const info = (await userData.get(target))?.userInfo;
      const name = info?.name || "Người dùng";
      const genderMap: Record<string, string> = {
        "1": "Nữ",
        "2": "Nam",
        female: "Nữ",
        male: "Nam",
      };
      const gender = genderMap[info?.gender] || "không xác định";

      bot.sendMessage(
        "⏳ Đang chấm điểm ngoại hình, vui lòng đợi...",
        event.threadID,
        event.messageID
      );

      const imgPath = path.join(
        __dirname,
        `../../../temp/avatar_${target}.jpg`
      );
      const url = `https://graph.facebook.com/${target}/picture?height=1500&width=1500&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;

      await new Promise<void>((res, rej) => {
        axios({ url, method: "GET", responseType: "stream" })
          .then((r) => {
            const w = fs.createWriteStream(imgPath);
            r.data.pipe(w);
            w.on("finish", res);
            w.on("error", rej);
          })
          .catch(rej);
      });

      const beautyPrompt = `Bạn là một chuyên gia thẩm mỹ hài hước chuyên đánh giá ngoại hình theo phong cách Gen Z Việt Nam. Hãy đo độ đẹp của avatar này theo phong cách:

- Dùng từ ngữ Gen Z, slang Việt Nam (vcd, vcl, đm, etc.)

- Hài hước cay độc nhưng không quá thô tục

- Có thể "cà khịa" nhẹ nhàng nhưng vẫn tích cực

- Đánh giá dựa trên avatar thật

Format chuẩn:

【CHẤM ĐIỂM NGOẠI HÌNH】

──────────────────

👤 Tên: [Tên người]

🎯 Điểm tổng: [X]/100 điểm

📊 Xếp hạng: [S/A/B/C/D tier]

📏 CHI TIẾT ĐÁNH GIÁ:

──────────────────

👀 Mắt: [X]/10 - [Nhận xét hài]

👃 Mũi: [X]/10 - [Nhận xét hài]

👄 Miệng: [X]/10 - [Nhận xét hài]

🦷 Răng: [X]/10 - [Nhận xét hài]

👂 Tai: [X]/10 - [Nhận xét hài]

💇 Tóc: [X]/10 - [Nhận xét hài]

🫥 Khuôn mặt: [X]/10 - [Nhận xét hài]

🎨 Style: [X]/10 - [Nhận xét hài]

✨ Thần thái: [X]/10 - [Nhận xét hài]

📸 Góc chụp: [X]/10 - [Nhận xét hài]

🏆 THÀNH TÍCH:

──────────────────

🥇 Điểm mạnh: [Như "Mắt đẹp vcl", "Góc nghiêng chuẩn oppa"]

🥈 Điểm yếu: [Như "Selfie còn gà", "Cần skincare gấp"]

💡 Lời khuyên: [Như "Đổi kiểu tóc đi bro", "Tập gym thêm nữa"]

🔥 Độ hot: [X]% (so với crush của bạn)

😍 Khả năng làm người yêu: [X]%

💸 Giá trị thị trường: [X].000 VND/tháng

🎭 BONUS:

──────────────────

🌟 Phong cách: [Như "Badboy giả tạo", "Cute baby face"]

🎪 Kiểu người: [Như "Thích làm màu", "Ngây thơ vcd"]

💘 Crush sẽ: [Như "Friendzone ngay", "Thả tim liền tay"]

🎯 Suitable cho: [Như "Đi show hẹn hò", "Làm streamer"]

⚖ KẾT LUẬN: [Nhận xét tổng quan hài hước]

Nhớ đánh giá dựa trên avatar thật, đừng random!`;

      let analysis: string | null = null;
      const GEMINI_API_KEY = "AIzaSyD-qDcHahDjIP86Uxitzqti9paKikXXDyo";

      if (GEMINI_API_KEY) {
        try {
          const { GoogleGenerativeAI } = require("@google/generative-ai");
          const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
          const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
          const bytes = await fs.readFile(imgPath);
          const imagePart = {
            inlineData: {
              data: bytes.toString("base64"),
              mimeType: "image/jpeg",
            },
          };
          const prompt = `Tên người này là ${name}, giới tính: ${gender}. ${beautyPrompt}`;
          const result = await model.generateContent([prompt, imagePart]);
          analysis = result?.response?.text?.() || null;
        } catch {
          
        }
      }

      if (!analysis) {
        const tiers = [
          "S+ (Thần thánh)",
          "S (Cực phẩm)",
          "A+ (Đẹp vcl)",
          "A (Đẹp trai/gái)",
          "B+ (Ổn phết)",
          "B (Bình thường)",
          "C+ (Tạm được)",
          "C (Cần cố gắng)",
          "D (Cần phẫu thuật)",
        ];
        const strengths = [
          "Mắt đẹp vcl",
          "Góc nghiêng chuẩn",
          "Nụ cười tỏa nắng",
          "Thần thái cuốn hút",
          "Style xịn sò",
        ];
        const weaknesses = [
          "Selfie còn gà",
          "Cần skincare gấp",
          "Kiểu tóc lỗi thời",
          "Góc chụp lag",
          "Cần tập gym",
        ];
        const advice = [
          "Đổi kiểu tóc đi bro",
          "Tập gym thêm nữa",
          "Học cách selfie",
          "Skincare đều đặn",
          "Mặc đồ đẹp hơn",
        ];
        const maleStyles = [
          "Badboy giả tạo",
          "Oppa Hàn Quốc",
          "Dân công sở",
          "Hot boy Instagram",
          "Sporty cool",
        ];
        const femaleStyles = [
          "Hot girl Instagram",
          "Cute baby face",
          "Ulzzang Hàn Quốc",
          "Girl next door",
          "Princess vibes",
        ];
        const styles =
          gender === "Nam"
            ? maleStyles
            : gender === "Nữ"
              ? femaleStyles
              : maleStyles.concat(femaleStyles);
        const personalities = [
          "Thích làm màu",
          "Ngây thơ vcd",
          "Tự tin thái quá",
          "Nhút nhát dễ thương",
          "Bí ẩn khó hiểu",
        ];
        const crushReactions = [
          "Friendzone ngay",
          "Thả tim liền tay",
          "Screenshot gửi bạn",
          "Cân nhắc kỹ",
          "Block luôn",
        ];
        const suitable = [
          "Đi show hẹn hò",
          "Làm streamer",
          "Model part-time",
          "Influencer tương lai",
          "Bán hàng online",
        ];
        const cats = [
          "Mắt",
          "Mũi",
          "Miệng",
          "Răng",
          "Tai",
          "Tóc",
          "Khuôn mặt",
          "Style",
          "Thần thái",
          "Góc chụp",
        ];
        const score = Array.from({ length: 10 }, () =>
          Math.floor(Math.random() * 11)
        );
        const total = score.reduce((a, b) => a + b, 0);
        const comments = [
          "nhìn cũng được",
          "tạm ổn",
          "không tệ",
          "khá đẹp",
          "cần cải thiện",
          "xuất sắc",
          "bình thường",
          "nổi bật",
          "cần skincare",
          "perfect",
        ];
        const details = cats
          .map(
            (c, i) =>
              `${c}: ${score[i]}/10 - ${comments[Math.floor(Math.random() * comments.length)]
              }`
          )
          .join("\n");
        const hot = Math.floor(Math.random() * 101);
        const love = Math.floor(Math.random() * 101);
        const value = Math.floor(Math.random() * 50) + 10;
        const tier = tiers[Math.floor(Math.random() * tiers.length)];
        const gdisp = gender !== "không xác định" ? ` (${gender})` : "";

        analysis = `⚠️ Gemini đang ngủ, dùng AI dự phòng!\n\n【CHẤM ĐIỂM NGOẠI HÌNH】\n──────────────────\n👤 Tên: ${name}${gdisp}\n🎯 Điểm tổng: ${total}/100 điểm\n📊 Xếp hạng: ${tier}\n\n📏 CHI TIẾT ĐÁNH GIÁ:\n──────────────────\n${details}\n\n🏆 THÀNH TÍCH:\n──────────────────\n🥇 Điểm mạnh: ${strengths[Math.floor(Math.random() * strengths.length)]
          }\n🥈 Điểm yếu: ${weaknesses[Math.floor(Math.random() * weaknesses.length)]
          }\n💡 Lời khuyên: ${advice[Math.floor(Math.random() * advice.length)]
          }\n🔥 Độ hot: ${hot}% (so với crush của bạn)\n😍 Khả năng làm người yêu: ${love}%\n💸 Giá trị thị trường: ${value}.000 VND/tháng\n\n🎭 BONUS:\n──────────────────\n🌟 Phong cách: ${styles[Math.floor(Math.random() * styles.length)]
          }\n🎪 Kiểu người: ${personalities[Math.floor(Math.random() * personalities.length)]
          }\n💘 Crush sẽ: ${crushReactions[Math.floor(Math.random() * crushReactions.length)]
          }\n🎯 Suitable cho: ${suitable[Math.floor(Math.random() * suitable.length)]
          }\n\n⚖ KẾT LUẬN: ${total >= 80
            ? "Đẹp vcl, làm crush tôi đi!"
            : total >= 60
              ? "Tạm ổn, cần cải thiện thêm!"
              : "Cần phấn đấu hơn nữa bro!"
          }`;
      }

      await bot.sendMessage(
        {
          body: analysis,
          attachment: fs.createReadStream(imgPath),
        },
        event.threadID,
        () => {
          try {
            fs.unlinkSync(imgPath);
          } catch {
            
          }
        },
        event.messageID
      );
    } catch (e) {
      console.log(e);
      await bot.sendMessage(
        "❌ Có lỗi xảy ra khi chấm điểm!",
        event.threadID,
        event.messageID
      );
    }
  },
};

export default chamdiemCommand;
