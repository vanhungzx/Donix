"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnReplyContext,
} from "@types";
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import { storagePath } from "../../../core/storagePath";

interface Question {
  path: string;
  Answer: string;
  sokytu: string;
  help: string;
}

interface QuestionsData {
  allquestions: Question[];
  tempAnswer: string | null;
}

interface GameSession {
  answer: string;
  sokytu: string;
  help: string;
  wrongAnswers?: Set<string>;
  questionMessageID?: string;
}

const gameSession: Record<string, GameSession> = {};

function loadQuestions(): { questions: Question[]; tempAnswer: string | null } {
  try {
    const jsonPath = storagePath("game", "dhbc", "DHBC.json");

    if (!fs.existsSync(jsonPath)) {
      fs.writeFileSync(
        jsonPath,
        JSON.stringify({ allquestions: [], tempAnswer: null }, null, 2)
      );
      return { questions: [], tempAnswer: null };
    }

    const data = fs.readFileSync(jsonPath, "utf8");
    const jsonData: QuestionsData = JSON.parse(data);

    return {
      questions: jsonData.allquestions || [],
      tempAnswer: jsonData.tempAnswer || null,
    };
  } catch (error) {
    console.error("Lỗi khi đọc file JSON:", error);
    return { questions: [], tempAnswer: null };
  }
}

function saveQuestions(
  questions: Question[],
  tempAnswer: string | null = null
): boolean {
  try {
    const jsonPath = path.join(
      process.cwd(),
      "storage/game/dhbc",
      "DHBC.json"
    );
    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          allquestions: questions,
          tempAnswer: tempAnswer,
        },
        null,
        2
      )
    );
    return true;
  } catch (error) {
    console.error("Lỗi khi lưu file JSON:", error);
    return false;
  }
}

function createHintAndCount(answer: string): { sokytu: string; help: string } {
  const words = answer.split(" ");
  let sokytu = "";
  let help = "";

  words.forEach((word, index) => {
    for (let i = 0; i < word.length; i++) {
      sokytu += "☐";
    }
    if (index < words.length - 1) sokytu += " ";

    help += word[0] + "☐".repeat(word.length - 1);
    if (index < words.length - 1) help += " ";
  });

  return { sokytu, help };
}

async function downloadImage(
  url: string,
  index: number
): Promise<boolean> {
  try {
    const imgDir = path.join(
      process.cwd(),
      "storage/game/dhbc",
      "DHBC-Image"
    );

    if (!fs.existsSync(imgDir)) {
      fs.mkdirSync(imgDir, { recursive: true });
    }

    const response = await axios.get(url, { responseType: "arraybuffer" });
    const imgPath = path.join(imgDir, `${index + 1}.jpg`);
    fs.writeFileSync(imgPath, Buffer.from(response.data));
    return true;
  } catch (error) {
    console.error("Lỗi khi tải ảnh:", error);
    return false;
  }
}

const dhbcCommand: Command = {
  name: "dhbc",
  alias: ["duoihinhbatchu", "duoihinhbatchu", "dhbc"],
  version: "1.0.0",
  role: 0,
  desc: "Đuổi hình bắt chữ",
  guide: `1. Chơi game: {pn}
   • Hiển thị một hình ảnh và số ô chữ cần đoán
   • Người chơi reply tin nhắn để đoán đáp án
   • Thưởng 50000 VND cho người đoán đúng

2. Thêm câu hỏi (Admin): {pn} add
   • Reply tin nhắn với đáp án
   • Sau đó reply với hình ảnh câu hỏi

3. Xóa câu hỏi (Admin): {pn} del
   • Hiển thị danh sách câu hỏi
   • Reply số thứ tự để xóa câu hỏi`,
  cd: 5,
  prefix: true,

  onReply: async function (ctx: CommandOnReplyContext): Promise<void> {
    const { client, event, Reply, userData, config, main, commandName } = ctx;
    const { threadID, messageID, senderID, body, attachments } = event;

    if (!Reply) return;

    const replyData = Reply as any;

    if (replyData.type === "dhbc_add_answer") {
      const isOwner = Array.isArray(config.OWNER) ? config.OWNER.includes(senderID) : String(config.OWNER) === String(senderID);
      if (!isOwner) {
        await client.sendMessage(
          "⚠️ Chỉ admin mới có thể thêm câu hỏi!",
          threadID,
          messageID
        );
        return;
      }

      const answer = (body || "").trim();

      if (!answer) {
        await client.sendMessage(
          "❌ Vui lòng nhập đáp án hợp lệ!",
          threadID,
          messageID
        );
        return;
      }

      const { questions } = loadQuestions();
      saveQuestions(questions, answer);

      await client.sendMessage(
        "✅ Đã lưu đáp án! Vui lòng reply tin nhắn này với hình ảnh cho câu hỏi.",
        threadID,
        (error: any, info: any) => {
          if (error) return;
          main.onReply.set(info.messageID, {
            commandName,
            author: senderID,
            messageID: info.messageID,
            type: "dhbc_add_image",
          });
        }
      );
    } else if (replyData.type === "dhbc_add_image") {
      const isOwner = Array.isArray(config.OWNER) ? config.OWNER.includes(senderID) : String(config.OWNER) === String(senderID);
      if (!isOwner) {
        await client.sendMessage(
          "⚠️ Chỉ admin mới có thể thêm câu hỏi!",
          threadID,
          messageID
        );
      }

      if (
        !attachments ||
        !attachments[0] ||
        attachments[0].type !== "photo"
      ) {
        await client.sendMessage(
          "❌ Vui lòng reply kèm hình ảnh!",
          threadID,
          messageID
        );
        return;
      }

      const { questions, tempAnswer } = loadQuestions();

      if (!tempAnswer) {
        await client.sendMessage(
          "❌ Không tìm thấy đáp án! Vui lòng thêm câu hỏi lại từ đầu.",
          threadID,
          messageID
        );
        return;
      }

      const hints = createHintAndCount(tempAnswer);
      const success = await downloadImage(
        attachments[0]?.url as string,
        questions.length
      );

      if (!success) {
        await client.sendMessage("❌ Lỗi khi tải ảnh!", threadID, messageID);
        return;
      }

      const newQuestion: Question = {
        path: `DHBC-Image/${questions.length + 1}.jpg`,
        Answer: tempAnswer,
        sokytu: hints.sokytu,
        help: hints.help,
      };

      questions.push(newQuestion);

      if (saveQuestions(questions)) {
        await client.sendMessage(
          "✅ Đã thêm câu hỏi mới thành công!",
          threadID,
          messageID
        );
        return;
      } else {
        await client.sendMessage(
          "❌ Lỗi khi lưu câu hỏi!",
          threadID,
          messageID
        );
        return;
      }
    } else if (replyData.type === "dhbc_delete") {
      const adminBot = config.ADMINBOT as string[] | undefined;
      if (!adminBot?.includes(senderID)) {
        await client.sendMessage(
          "⚠️ Chỉ admin mới có thể xóa câu hỏi!",
          threadID,
          messageID
        );
        return;
      }

      const index = parseInt(body || "0") - 1;
      const { questions } = loadQuestions();

      if (isNaN(index) || index < 0 || index >= questions.length) {
        await client.sendMessage(
          "❌ Số thứ tự không hợp lệ!",
          threadID,
          messageID
        );
        return;
      }

      const questionToDelete = questions[index];
      if (!questionToDelete) {
        await client.sendMessage(
          "❌ Số thứ tự không hợp lệ!",
          threadID,
          messageID
        );
        return;
      }

      const imgPath = path.join(
        process.cwd(),
        "storage/game/dhbc",
        questionToDelete.path
      );

      if (fs.existsSync(imgPath)) {
        fs.unlinkSync(imgPath);
      }

      questions.splice(index, 1);

      for (let i = index; i < questions.length; i++) {
        const question = questions[i];
        if (!question) continue;
        const oldPath = path.join(
          process.cwd(),
          "storage/game/dhbc",
          question.path
        );
        const newPath = path.join(
          process.cwd(),
          "storage/game/dhbc",
          `DHBC-Image/${i + 1}.jpg`
        );
        question.path = `DHBC-Image/${i + 1}.jpg`;

        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
        }
      }

      if (saveQuestions(questions)) {
        await client.sendMessage(
          "✅ Đã xóa câu hỏi thành công!",
          threadID,
          messageID
        );
        return;
      } else {
        await client.sendMessage(
          "❌ Lỗi khi lưu thay đổi!",
          threadID,
          messageID
        );
        return;
      }
    } else if (replyData.type === "dhbc_answer") {
      if (!gameSession[threadID]) return;

      const userAnswer = (body || "").toLowerCase().trim();
      const correctAnswer = gameSession[threadID].answer.toLowerCase();
      const getName = userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
      const userName = getName ? await getName(senderID) : null;

      if (userAnswer === correctAnswer) {
        const reward = 50000;

        const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (addMoney) await addMoney(senderID, BigInt(reward));

        if (gameSession[threadID].questionMessageID) {
          client.unsendMessage(
            gameSession[threadID].questionMessageID!,
            threadID
          );
        }

        await client.sendMessage(
          {
            body: `🎉 Chúc mừng ${userName || 'Người chơi'} đã trả lời đúng!\n✨ Đáp án: ${gameSession[threadID].answer}\n💰 Bạn nhận được ${reward} VND!`,
            mentions: [
              {
                tag: userName || 'Người chơi',
                id: senderID,
              },
            ] as any,
          },
          threadID,
          messageID
        );

        delete gameSession[threadID];
      } else {
        if (!gameSession[threadID].wrongAnswers) {
          gameSession[threadID].wrongAnswers = new Set<string>();
        }
        gameSession[threadID].wrongAnswers!.add(userAnswer);

        if (gameSession[threadID].wrongAnswers!.size >= 3) {
          await client.sendMessage(
            {
              body: `⚠️ Đã có 3 câu trả lời sai!\n💡 Gợi ý nâng cao:\n1️⃣ Đáp án có ${correctAnswer.length} ký tự\n2️⃣ Ký tự đầu tiên là: "${correctAnswer[0]}"\n3️⃣ Ký tự cuối cùng là: "${correctAnswer[correctAnswer.length - 1]}"`,
              mentions: [
                {
                  tag: userName || 'Người chơi',
                  id: senderID,
                },
              ] as any,
            },
            threadID,
            messageID
          );
        } else {
          let message = `❌ ${userName} trả lời sai rồi!\n`;

          if (gameSession[threadID].wrongAnswers!.size === 1) {
            message += `📝 Số ký tự: ${gameSession[threadID].sokytu}`;
          } else if (gameSession[threadID].wrongAnswers!.size === 2) {
            message += `💡 Gợi ý: ${gameSession[threadID].help}`;
          }

          await client.sendMessage(
            {
              body: message,
              mentions: [
                {
                  tag: userName || 'Người chơi',
                  id: senderID,
                },
              ] as any,
            },
            threadID,
            messageID
          );
        }
      }
    }
  },

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { client, event, args, config, main, commandName } = ctx;
    const { threadID, messageID, senderID } = event;

    if (args[0] === "add") {
      const isOwner = Array.isArray(config.OWNER) ? config.OWNER.includes(senderID) : String(config.OWNER) === String(senderID);
      if (!isOwner) {
        await client.sendMessage(
          "⚠️ Chỉ admin mới có thể thêm câu hỏi!",
          threadID,
          messageID
        );
      }

      await client.sendMessage(
        "📝 Vui lòng reply tin nhắn này với đáp án của câu hỏi.",
        threadID,
        (error: any, info: any) => {
          if (error) return;
          main.onReply.set(info.messageID, {
            commandName,
            author: senderID,
            messageID: info.messageID,
            type: "dhbc_add_answer",
          });
        }
      );
    } else if (args[0] === "del") {
      const isOwner = Array.isArray(config.OWNER) ? config.OWNER.includes(senderID) : String(config.OWNER) === String(senderID);
      if (!isOwner) {
        await client.sendMessage(
          "⚠️ Chỉ admin mới có thể xóa câu hỏi!",
          threadID,
          messageID
        );
      }

      const { questions } = loadQuestions();

      if (questions.length === 0) {
        await client.sendMessage(
          "❌ Chưa có câu hỏi nào trong game!",
          threadID,
          messageID
        );
        return;
      }

      let msg = "📑 Danh sách câu hỏi:\n\n";
      questions.forEach((question, index) => {
        msg += `${index + 1}. ${question.Answer}\n`;
      });
      msg += "\n↪️ Reply số thứ tự để xóa câu hỏi tương ứng.";

      await client.sendMessage(msg, threadID, (error: any, info: any) => {
        if (error) return;
        main.onReply.set(info.messageID, {
          commandName,
          author: senderID,
          messageID: info.messageID,
          type: "dhbc_delete",
        });
      });
    } else {
      const { questions } = loadQuestions();

      if (questions.length === 0) {
        await client.sendMessage(
          "❌ Chưa có câu hỏi nào trong game!",
          threadID,
          messageID
        );
        return;
      }

      const randomIndex = Math.floor(Math.random() * questions.length);
      const randomQuestion = questions[randomIndex];

      if (!randomQuestion) {
        await client.sendMessage(
          "❌ Không tìm thấy câu hỏi!",
          threadID,
          messageID
        );
        return;
      }

      gameSession[threadID] = {
        answer: randomQuestion.Answer,
        sokytu: randomQuestion.sokytu,
        help: randomQuestion.help,
        wrongAnswers: new Set<string>(),
        questionMessageID: undefined,
      };

      const imgPath = path.join(
        process.cwd(),
        "storage/game/dhbc",
        randomQuestion.path
      );

      if (!fs.existsSync(imgPath)) {
        await client.sendMessage(
          `❌ Không tìm thấy file ảnh: ${randomQuestion.path}`,
          threadID,
          messageID
        );
        return;
      }

      await client.sendMessage(
        {
          body: `🎮 ĐUỔI HÌNH BẮT CHỮ\n\n📝 Số ký tự: ${randomQuestion.sokytu}\n💰 Thưởng: 50000 VND khi trả lời đúng\n👥 Tất cả mọi người đều có thể tham gia`,
          attachment: fs.createReadStream(imgPath),
        },
        threadID,
        (error: any, info: any) => {
          if (error) {
            console.error("Lỗi khi gửi ảnh:", error);
            return;
          }

          if (info?.messageID) {
            main.onReply.set(info.messageID, {
              commandName,
              author: senderID,
              messageID: info.messageID,
              type: "dhbc_answer",
            });

            const session = gameSession[threadID];
            if (session) {
              session.questionMessageID = info.messageID;
            }
          }
        }
      );
    }
  },
};

export default dhbcCommand;
