"use strict";

import type {
  ReplyData as BaseReplyData,
  Command,
  CommandOnCallContext,
  CommandOnReplyContext,
  FacebookClient,
} from '@types';
import { CanvasRenderingContext2D, createCanvas, loadImage } from "canvas";
import fs from "fs-extra";
import path from "path";
import { TEMP_DIR } from "../../../core/storagePath";
import { storagePath } from "../../../core/storagePath";

const moneydown = 5000000;

function tempRoot(): string {
  const p = TEMP_DIR();
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

function tmp(name: string): string {
  return path.join(
    tempRoot(),
    `altp_${name}_${Date.now()}_${Math.random().toString(36).slice(2)}.png`
  );
}

const logoPath = storagePath("game", "altp", "logo.png");

function equi(level: number): number {
  const money = [
    0, 200000, 400000, 600000, 1000000, 2000000, 3000000, 6000000, 10000000,
    14000000, 22000000, 30000000, 40000000, 60000000, 85000000, 150000000,
  ];
  return money[level] || 0;
}

function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    const swap = array[j];
    if (temp !== undefined && swap !== undefined) {
      array[i] = swap;
      array[j] = temp;
    }
  }
  return array;
}

interface Question {
  question: string;
  a: string;
  b: string;
  c: string;
  d: string;
  dapan: string;
  giaithich?: string;
  helpone?: string[];
  helptwo?: number[];
  helpthree?: string[];
}

interface QuestionFile {
  allquestion: Question[];
}

async function getQuestion(level: number): Promise<Question> {
  const filePath = storagePath("game", "altp", `cauhoi${level}.json`);
  const data: QuestionFile = JSON.parse(
    await fs.readFile(filePath, "utf8")
  );

  if (!data.allquestion || !Array.isArray(data.allquestion)) {
    throw new Error("Định dạng file câu hỏi không hợp lệ");
  }

  const originalQuestion =
    data.allquestion[Math.floor(Math.random() * data.allquestion.length)];

  if (!originalQuestion) {
    throw new Error("Không tìm thấy câu hỏi");
  }

  const correctAnswer =
    originalQuestion[
    originalQuestion.dapan.toLowerCase() as keyof Question
    ] as string;

  const answers = [
    originalQuestion.a,
    originalQuestion.b,
    originalQuestion.c,
    originalQuestion.d,
  ];

  const shuffledAnswers = shuffleArray([...answers]);
  const newCorrectIndex = shuffledAnswers.indexOf(correctAnswer);
  const newCorrectLetter = String.fromCharCode(65 + newCorrectIndex);

  const shuffledQuestion: Question = {
    question: originalQuestion.question,
    a: shuffledAnswers[0] || "",
    b: shuffledAnswers[1] || "",
    c: shuffledAnswers[2] || "",
    d: shuffledAnswers[3] || "",
    dapan: newCorrectLetter,
    giaithich: originalQuestion.giaithich,
  };

  let cwrongIndex: number;
  do {
    cwrongIndex = Math.floor(Math.random() * 4);
  } while (cwrongIndex === newCorrectIndex);

  shuffledQuestion.helpone = [
    newCorrectLetter,
    String.fromCharCode(65 + cwrongIndex),
  ].sort();

  const originalPercentages = originalQuestion.helptwo || [40, 20, 20, 20];
  const maxPercentage = Math.max(...originalPercentages);
  const newPercentages = new Array(4).fill(0);
  newPercentages[newCorrectIndex] = maxPercentage;

  const wrongPercentages = originalPercentages
    .filter((p) => p !== maxPercentage)
    .sort(() => Math.random() - 0.5);

  let wrongIndex = 0;
  for (let i = 0; i < 4; i++) {
    if (i !== newCorrectIndex) {
      newPercentages[i] = wrongPercentages[wrongIndex++] || 0;
    }
  }

  shuffledQuestion.helptwo = newPercentages;
  shuffledQuestion.helpthree = [shuffledQuestion.dapan];

  return shuffledQuestion;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const paras = String(text || "").replace(/\r\n?/g, "\n").split("\n");

  for (const para of paras) {
    if (para === "") {
      lines.push("");
      continue;
    }

    const words = para.trim().split(/\s+/);
    let line = "";

    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);

        if (ctx.measureText(w).width <= maxWidth) {
          line = w;
        } else {
          let part = "";
          for (const ch of w) {
            const t = part + ch;
            if (ctx.measureText(t).width <= maxWidth) {
              part = t;
            } else {
              if (part) lines.push(part);
              part = ch;
            }
          }
          line = part;
        }
      }
    }
    lines.push(line);
  }

  return lines;
}

interface SenderInfo {
  helpaltp?: {
    helpm?: number;
    helph?: number;
    helpb?: number;
  };
  altp?: {
    level: number;
  };
}

async function veCauHoi(
  question: string,
  answers: string[],
  level: number,
  senderInfo: SenderInfo | undefined,
  userName: string
): Promise<ReturnType<typeof createCanvas>> {
  const canvas = createCanvas(1200, 800);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#000033";
  ctx.fillRect(0, 0, 1200, 800);

  try {
    const logoImage = await loadImage(logoPath);
    ctx.globalAlpha = 0.15;
    ctx.drawImage(logoImage, 150, -20, 500, 500);
    ctx.globalAlpha = 1;
  } catch {

  }

  ctx.font = "24px Arial";
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.fillText(`Người chơi: ${userName}`, 20, 120);

  const helpX = 900;
  const hv = senderInfo?.helpaltp || {};

  [
    { label: "50:50", used: hv.helpm !== 1 },
    { label: "TƯ VẤN", used: hv.helpb !== 1 },
    { label: "KHÁN GIẢ", used: hv.helph !== 1 },
  ].forEach((help, i) => {
    ctx.fillStyle = help.used ? "#333366" : "#0000CC";
    ctx.beginPath();
    ctx.arc(helpX + i * 100, 50, 35, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = "16px Arial";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.fillText(help.label, helpX + i * 100, 55);
  });

  const moneyList: [number, string][] = [
    [15, "150,000,000"],
    [14, "85,000,000"],
    [13, "60,000,000"],
    [12, "40,000,000"],
    [11, "30,000,000"],
    [10, "22,000,000"],
    [9, "14,000,000"],
    [8, "10,000,000"],
    [7, "6,000,000"],
    [6, "3,000,000"],
    [5, "2,000,000"],
    [4, "1,000,000"],
    [3, "600,000"],
    [2, "400,000"],
    [1, "200,000"],
  ];

  moneyList.forEach(([num, money], i) => {
    const y = 150 + i * 40;
    const isCurrent = num === level + 1;
    const isMilestone = num === 15 || num === 10 || num === 5;

    ctx.fillStyle = isCurrent
      ? "#FFA500"
      : isMilestone
        ? "#000099"
        : "#000066";
    ctx.fillRect(900, y, 280, 35);

    ctx.strokeStyle = "#FFFFFF";
    ctx.strokeRect(900, y, 280, 35);

    ctx.font = "20px Arial";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText(`${num}`, 920, y + 25);
    ctx.fillText(`${money}đ`, 980, y + 25);
  });

  const questionLines = wrapText(ctx, question, 600);
  const lineHeight = 35;
  const totalHeight = questionLines.length * lineHeight;
  const questionY = 500;

  ctx.fillStyle = "#000099";
  ctx.beginPath();
  ctx.moveTo(0, questionY);
  ctx.lineTo(850, questionY);
  ctx.lineTo(800, questionY + totalHeight + 40);
  ctx.lineTo(50, questionY + totalHeight + 40);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#FF00FF";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = "22px Arial";
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  questionLines.forEach((line, i) =>
    ctx.fillText(line, 450, questionY + 35 + i * lineHeight)
  );

  const answerStartY = questionY + totalHeight + 60;
  const answers_width = 350;
  const answers_height = 60;
  const answers_pos: [number, number][] = [
    [50, 0],
    [450, 0],
    [50, 80],
    [450, 80],
  ];

  ctx.font = "22px Arial";
  ctx.textAlign = "left";
  const lh = 24;

  answers.forEach((answer, i) => {
    const pos = answers_pos[i];
    if (!pos) return;
    const [x, y] = pos;

    ctx.fillStyle = "#000099";
    ctx.beginPath();
    ctx.moveTo(x, answerStartY + y);
    ctx.lineTo(x + answers_width, answerStartY + y);
    ctx.lineTo(x + answers_width + 20, answerStartY + y + answers_height / 2);
    ctx.lineTo(x + answers_width, answerStartY + y + answers_height);
    ctx.lineTo(x, answerStartY + y + answers_height);
    ctx.lineTo(x - 20, answerStartY + y + answers_height / 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#FF00FF";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#FFFFFF";
    const label = `${String.fromCharCode(65 + i)}: ${String(answer ?? "")}`;
    const lines = wrapText(ctx, label, answers_width - 60);
    const max = 2;

    for (let j = 0; j < Math.min(lines.length, max); j++) {
      const line = lines[j];
      if (line !== undefined) {
        ctx.fillText(
          line,
          x + 30,
          answerStartY + y + 28 + j * lh
        );
      }
    }
  });

  return canvas;
}

async function ve5050(
  question: string,
  answers: string[],
  keptLetters: string[],
  senderInfo: SenderInfo | undefined,
  userName: string
): Promise<ReturnType<typeof createCanvas>> {
  const newAnswers = answers.map((ans, i) =>
    keptLetters.includes(String.fromCharCode(65 + i)) ? ans : ""
  );
  return veCauHoi(question, newAnswers, 0, senderInfo, userName);
}

async function veKhanGia(
  question: string,
  answers: string[],
  percentages: number[],
  senderInfo: SenderInfo | undefined,
  userName: string
): Promise<ReturnType<typeof createCanvas>> {
  const canvas = await veCauHoi(question, answers, 0, senderInfo, userName);
  const ctx = canvas.getContext("2d");

  const chartX = 220;
  const chartY = 150;
  const chartWidth = 500;
  const chartHeight = 250;

  ctx.fillStyle = "#000066";
  ctx.strokeStyle = "#FFFFFF";
  ctx.strokeRect(chartX, chartY, chartWidth, chartHeight);

  const barWidth = 80;
  (percentages || [25, 25, 25, 25]).forEach((percent, i) => {
    const barX = chartX + 40 + i * 120;
    const barHeight = Math.floor(percent * 2);
    const barY = chartY + chartHeight - barHeight - 40;

    ctx.fillStyle = "#FFA500";
    ctx.fillRect(barX, barY, barWidth, barHeight);

    ctx.font = "24px Arial";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.fillText(`${percent}%`, barX + barWidth / 2, barY - 10);
    ctx.fillText(
      String.fromCharCode(65 + i),
      barX + barWidth / 2,
      chartY + chartHeight - 10
    );
  });

  return canvas;
}

async function veTotuvan(
  question: string,
  answers: string[],
  expertAnswers: string[],
  senderInfo: SenderInfo | undefined,
  userName: string
): Promise<ReturnType<typeof createCanvas>> {
  const canvas = await veCauHoi(question, answers, 0, senderInfo, userName);
  const ctx = canvas.getContext("2d");

  const boxX = 220;
  const boxY = 150;
  const boxWidth = 350;
  const boxHeight = 259;

  ctx.fillStyle = "#000066";
  ctx.strokeStyle = "#FFFFFF";
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

  ctx.font = "24px Arial";
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  (expertAnswers || []).forEach((answer, i) =>
    ctx.fillText(
      `Chuyên gia ${i + 1}: Chọn ${answer}`,
      boxX + 20,
      boxY + 50 + i * 50
    )
  );

  return canvas;
}

async function sendCanvas(
  client: FacebookClient,
  threadID: string,
  body: string,
  canvas: ReturnType<typeof createCanvas>,
  afterSend?: (messageID: string) => void
): Promise<void> {
  const filePath = tmp("img");
  await fs.writeFile(filePath, canvas.toBuffer());
  const stream = fs.createReadStream(filePath);

  client.sendMessage({ body, attachment: stream }, threadID, (_err: Error | undefined, info?: { messageID?: string }) => {
    if (afterSend && info?.messageID) {
      afterSend(info.messageID);
    }
    stream.on("close", async () => {
      try {
        await fs.unlink(filePath);
      } catch {
        // Ignore error
      }
    });
  });
}

interface AltpReplyData {
  type: string;
  commandName: string;
  author: string;
  question: string;
  answers: string[];
  dapandung: string;
  giaithich?: string;
  one?: string[];
  two?: number[];
  three?: string[];
  level: number;
  messageID: string;
}

function setAltpReply(main: { onReply: Map<string, BaseReplyData> }, messageID: string, data: AltpReplyData): void {
  // Type conversion: AltpReplyData contains arrays which BaseReplyData index signature doesn't allow,
  // but runtime supports it. Using intermediate unknown type for safe conversion.
  const converted = data as unknown as BaseReplyData & Record<string, string | number | boolean | null | undefined | (() => void) | string[] | number[]>;
  main.onReply.set(messageID, converted);
}


const altpCommand: Command = {
  name: "altp",
  alias: ["ailatrieuphu"],
  version: "2.1.1",
  role: 0,
  desc: "Chương trình Ai Là Triệu Phú",
  guide: `    {pn} Hướng dẫn sử dụng:
      • {pn} register: Đăng ký tham gia chương trình với phí 5,000,000đ
      • {pn} play: Bắt đầu chơi sau khi đã đăng ký
      • {pn} stop: Dừng cuộc chơi và nhận phần thưởng tương ứng

 Lưu ý:
      - Mỗi người chơi cần đăng ký trước khi chơi
      - Có 3 quyền trợ giúp: 50:50, hỏi ý kiến khán giả, tư vấn
      - Có 15 câu hỏi với mức tiền thưởng tăng dần
      - 2 mốc quan trọng: câu 5 (2 triệu) và câu 10 (22 triệu)`,
  cd: 0,
  prefix: true,

  onReply: async function (ctx: CommandOnReplyContext): Promise<void> {
    const { client, event, unsend, Reply, userData, main, commandName } = ctx;
    const { threadID, messageID, senderID } = event;

    // Type assertion: Reply is BaseReplyData but we need AltpReplyData fields
    const replyData = Reply as AltpReplyData & BaseReplyData;
    if (replyData.type !== "answer") return;

    if (senderID !== replyData.author) {
      await client.sendMessage(
        "Người ta đang chơi, bạn đừng phá đám!",
        threadID,
        messageID
      );
      return;
    }

    const getName = userData.getName as ((sid: string) => Promise<string | null | undefined>) | undefined;
    const name = getName ? await getName(senderID) : null;
    const senderInfo = await userData.get(senderID);
    if (!senderInfo) return;
    const choose = String(event.body || "").trim().toUpperCase();

    if (choose === "HELP 1" || choose === "HELP1") {
      if (senderInfo.data?.helpaltp?.helpm !== 1) {
        await client.sendMessage(
          "Bạn đã dùng quyền trợ giúp này rồi!",
          threadID,
          messageID
        );
        return;
      }

      if (unsend) unsend(replyData.messageID);

      const canvas = await ve5050(
        replyData.question || "",
        [
          replyData.answers?.[0] || "",
          replyData.answers?.[1] || "",
          replyData.answers?.[2] || "",
          replyData.answers?.[3] || "",
        ],
        replyData.one || [],
        senderInfo.data,
        name || 'Người chơi'
      );

      if (!senderInfo.data) senderInfo.data = {};
      if (!senderInfo.data.helpaltp) senderInfo.data.helpaltp = {};
      senderInfo.data.helpaltp.helpm = 2;
      await userData.update(senderID, senderInfo);

      await sendCanvas(
        client,
        threadID,
        `Đã loại bỏ 2 đáp án sai: ${replyData.one?.[0]} và ${replyData.one?.[1]}\n\nTrả lời "A", "B", "C" hoặc "D" để chọn đáp án`,
        canvas,
        (mid) => {
          setAltpReply(main, mid, {
            type: "answer",
            commandName,
            author: senderID,
            question: replyData.question,
            answers: replyData.answers,
            dapandung: replyData.dapandung,
            giaithich: replyData.giaithich,
            one: replyData.one,
            two: replyData.two,
            three: replyData.three,
            level: replyData.level,
            messageID: mid,
          });
        }
      );
    }

    if (choose === "HELP 2" || choose === "HELP2") {
      if (senderInfo.data?.helpaltp?.helph !== 1) {
        await client.sendMessage(
          "Bạn đã dùng quyền trợ giúp này rồi!",
          threadID,
          messageID
        );
        return;
      }

      const canvas = await veKhanGia(
        replyData.question || "",
        [
          replyData.answers?.[0] || "",
          replyData.answers?.[1] || "",
          replyData.answers?.[2] || "",
          replyData.answers?.[3] || "",
        ],
        replyData.two || [],
        senderInfo.data,
        name || 'Người chơi'
      );

      if (!senderInfo.data) senderInfo.data = {};
      if (!senderInfo.data.helpaltp) senderInfo.data.helpaltp = {};
      senderInfo.data.helpaltp.helph = 2;
      await userData.update(senderID, senderInfo);

      await sendCanvas(
        client,
        threadID,
        "Kết quả khảo sát ý kiến khán giả:\nTrả lời A/B/C/D để chọn đáp án",
        canvas,
        (mid) => {
          setAltpReply(main, mid, {
            type: "answer",
            commandName,
            author: senderID,
            question: replyData.question,
            answers: replyData.answers,
            dapandung: replyData.dapandung,
            giaithich: replyData.giaithich,
            one: replyData.one,
            two: replyData.two,
            three: replyData.three,
            level: replyData.level,
            messageID: mid,
          });
        }
      );
    }

    if (choose === "HELP 3" || choose === "HELP3") {
      if (senderInfo.data?.helpaltp?.helpb !== 1) {
        await client.sendMessage(
          "Bạn đã dùng quyền trợ giúp này rồi!",
          threadID,
          messageID
        );
        return;
      }

      const canvas = await veTotuvan(
        replyData.question || "",
        [
          replyData.answers?.[0] || "",
          replyData.answers?.[1] || "",
          replyData.answers?.[2] || "",
          replyData.answers?.[3] || "",
        ],
        replyData.three || [],
        senderInfo.data,
        name || 'Người chơi'
      );

      if (!senderInfo.data) senderInfo.data = {};
      if (!senderInfo.data.helpaltp) senderInfo.data.helpaltp = {};
      senderInfo.data.helpaltp.helpb = 2;
      await userData.update(senderID, senderInfo);

      await sendCanvas(
        client,
        threadID,
        "Ý kiến của các chuyên gia:\nTrả lời A/B/C/D để chọn đáp án",
        canvas,
        (mid) => {
          setAltpReply(main, mid, {
            type: "answer",
            commandName,
            author: senderID,
            question: replyData.question,
            answers: replyData.answers,
            dapandung: replyData.dapandung,
            giaithich: replyData.giaithich,
            one: replyData.one,
            two: replyData.two,
            three: replyData.three,
            level: replyData.level,
            messageID: mid,
          });
        }
      );
    }

    if (!["A", "B", "C", "D"].includes(choose)) {
      await client.sendMessage(
        "Lựa chọn không hợp lệ! Vui lòng trả lời A/B/C/D",
        threadID,
        messageID
      );
      return;
    }

    if (choose === replyData.dapandung) {
      const level = replyData.level + 1;

      if (level < 15) {
        if (unsend) unsend(replyData.messageID);

        const msg1 = `✓ ${choose} là đáp án chính xác!\n${replyData.giaithich}\n\nChúc mừng ${name} đã trả lời đúng ${level > 1 ? `câu số ${level}` : "câu đầu tiên"}, nâng mức phần thưởng lên ${equi(level).toLocaleString()}đ`;

        client.sendMessage(msg1, threadID);

        try {
          const question = await getQuestion(level + 1);

          if (!senderInfo.data) senderInfo.data = {};
          senderInfo.data.altp = { level };

          if (!senderInfo.data.helpaltp) senderInfo.data.helpaltp = {};
          if (senderInfo.data.helpaltp.helpm === 2)
            senderInfo.data.helpaltp.helpm = 0;
          if (senderInfo.data.helpaltp.helph === 2)
            senderInfo.data.helpaltp.helph = 0;
          if (senderInfo.data.helpaltp.helpb === 2)
            senderInfo.data.helpaltp.helpb = 0;

          await userData.update(senderID, senderInfo);

          const canvas = await veCauHoi(
            question.question,
            [question.a, question.b, question.c, question.d],
            level,
            senderInfo.data,
            name || 'Người chơi'
          );

          let msg = "Trả lời bằng cách nhắn A/B/C/D\n";

          if (
            senderInfo.data.helpaltp?.helpm === 1 ||
            senderInfo.data.helpaltp?.helph === 1 ||
            senderInfo.data.helpaltp?.helpb === 1
          ) {
            msg += "\nCác quyền trợ giúp:\n";
            if (senderInfo.data.helpaltp.helpm === 1)
              msg += '- "help1": 50:50\n';
            if (senderInfo.data.helpaltp.helph === 1)
              msg += '- "help2": Khán giả\n';
            if (senderInfo.data.helpaltp.helpb === 1)
              msg += '- "help3": Tư vấn\n';
          }

          await sendCanvas(client, threadID, msg, canvas, (mid) => {
            setAltpReply(main, mid, {
              type: "answer",
              commandName,
              author: senderID,
              question: question.question,
              answers: [question.a, question.b, question.c, question.d],
              dapandung: question.dapan,
              giaithich: question.giaithich,
              one: question.helpone,
              two: question.helptwo,
              three: question.helpthree,
              level,
              messageID: mid,
            });
          });
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          await client.sendMessage(
            `Đã xảy ra lỗi: ${err.message}`,
            threadID
          );
          return;
        }
      } else if (level === 15) {
        if (unsend) unsend(replyData.messageID);

        const addMoney = userData.addMoney as ((sid: string, amount: bigint) => Promise<void>) | undefined;
        if (addMoney) await addMoney(senderID, BigInt(150000000));

        if (!senderInfo.data) senderInfo.data = {};
        senderInfo.data.altp = { level: -1 };
        await userData.update(senderID, senderInfo);

        const canvas = await veCauHoi(
          "CHIẾN THẮNG",
          [
            `${name} đã xuất sắc vượt qua 15 câu hỏi`,
            "Và mang về giải thưởng",
            "150,000,000đ",
            "Xin chúc mừng!",
          ],
          15,
          senderInfo.data,
          name || 'Người chơi'
        );

        await sendCanvas(
          client,
          threadID,
          `✓ ${choose} là đáp án chính xác!\n${replyData.giaithich}\n\nXin chúc mừng ${name} đã xuất sắc vượt qua 15 câu hỏi, mang về giải thưởng 150,000,000đ!\nHẹn gặp lại bạn trong chương trình lần sau!`,
          canvas
        );
      }
    } else {
      if (unsend) unsend(replyData.messageID);

      const level = replyData.level;
      const reward = level >= 10 ? 22000000 : level >= 5 ? 2000000 : 0;

      if (!senderInfo.data) senderInfo.data = {};
      senderInfo.data.altp = { level: -1 };
      await userData.update(senderID, senderInfo);

      if (reward > 0) {
        const addMoney = userData.addMoney as ((sid: string, amount: bigint) => Promise<void>) | undefined;
        if (addMoney) await addMoney(senderID, BigInt(reward));

        const milestone = level >= 10 ? "thứ hai" : "đầu tiên";

        const canvas = await veCauHoi(
          "THUA CUỘC",
          [
            `${choose} là đáp án sai!`,
            `Đáp án đúng là ${replyData.dapandung}`,
            `Bạn dừng chân ở câu ${level}`,
            `Mang về ${reward.toLocaleString()}đ`,
          ],
          level,
          senderInfo.data,
          name || 'Người chơi'
        );

        await sendCanvas(
          client,
          threadID,
          `✕ ${choose} là đáp án sai!\nĐáp án đúng là ${replyData.dapandung}\n${replyData.giaithich}\n\nNgười chơi ${name} dừng chân tại câu ${level} và ra về với phần thưởng ở mốc ${milestone} là ${reward.toLocaleString()}đ.\nCảm ơn bạn đã tham gia chương trình!`,
          canvas
        );
      } else {
        const canvas = await veCauHoi(
          "THUA CUỘC",
          [
            `${choose} là đáp án sai!`,
            `Đáp án đúng là ${replyData.dapandung}`,
            "Bạn ra về tay trắng",
            "Hẹn gặp lại!",
          ],
          0,
          senderInfo.data,
          name || 'Người chơi'
        );

        await sendCanvas(
          client,
          threadID,
          `✕ ${choose} là đáp án sai!\nĐáp án đúng là ${replyData.dapandung}\n${replyData.giaithich}\n\nRất tiếc, bạn ra về tay trắng. Cảm ơn đã tham gia chương trình!`,
          canvas
        );
      }
    }
  },

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { client, event, args, userData, main, commandName } = ctx;
    const { threadID, messageID, senderID } = event;

    const senderInfo = await userData.get(senderID);
    if (!senderInfo) return;
    const money = senderInfo.money || 0;
    const moneyNum = typeof money === "bigint" ? Number(money) : money;
    const getName = userData.getName as ((sid: string) => Promise<string | null | undefined>) | undefined;
    const name = getName ? await getName(senderID) : null;

    if (!args[0]) {
      await client.sendMessage(
        "=== AI LÀ TRIỆU PHÚ ===\n- REGISTER: Đăng ký tham gia\n- PLAY: Bắt đầu chơi\n- STOP: Dừng cuộc chơi",
        threadID,
        messageID
      );
      return;
    }

    const type = String(args[0]).toLowerCase();

    if (type === "register" || type === "-r") {
      if (
        senderInfo.data?.altp &&
        senderInfo.data.altp.level !== -1
      ) {
        await client.sendMessage("Bạn đã đăng ký rồi!", threadID, messageID);
        return;
      }

      if (moneyNum < moneydown) {
        await client.sendMessage(
          `Bạn cần ${moneydown.toLocaleString()}đ để đăng ký!`,
          threadID,
          messageID
        );
        return;
      }

      const delMoney = userData.delMoney as ((sid: string, amount: bigint) => Promise<void>) | undefined;
      if (delMoney) await delMoney(senderID, BigInt(moneydown));

      if (!senderInfo.data) senderInfo.data = {};
      senderInfo.data.altp = { level: 0 };
      senderInfo.data.helpaltp = { helpm: 1, helph: 1, helpb: 1 };

      await userData.update(senderID, senderInfo);

      await client.sendMessage(
        `Đăng ký thành công với phí ${moneydown.toLocaleString()}đ! Dùng /altp play để bắt đầu.`,
        threadID,
        messageID
      );
      return;
    }

    if (type === "play") {
      if (
        !senderInfo.data?.altp ||
        senderInfo.data.altp.level === -1
      ) {
        await client.sendMessage(
          "Bạn chưa đăng ký! Dùng /altp register để đăng ký.",
          threadID,
          messageID
        );
        return;
      }

      const level = senderInfo.data.altp.level;

      try {
        const question = await getQuestion(level + 1);

        const canvas = await veCauHoi(
          question.question,
          [question.a, question.b, question.c, question.d],
          level,
          senderInfo.data,
          name || 'Người chơi'
        );

        let msg = "Trả lời bằng cách nhắn A/B/C/D\n";

        if (
          senderInfo.data.helpaltp?.helpm === 1 ||
          senderInfo.data.helpaltp?.helph === 1 ||
          senderInfo.data.helpaltp?.helpb === 1
        ) {
          msg += "\nCác quyền trợ giúp:\n";
          if (senderInfo.data.helpaltp.helpm === 1)
            msg += '- "help1": 50:50\n';
          if (senderInfo.data.helpaltp.helph === 1)
            msg += '- "help2": Khán giả\n';
          if (senderInfo.data.helpaltp.helpb === 1)
            msg += '- "help3": Tư vấn\n';
        }

        await sendCanvas(client, threadID, msg, canvas, (mid) => {
          setAltpReply(main, mid, {
            type: "answer",
            commandName,
            author: senderID,
            question: question.question,
            answers: [question.a, question.b, question.c, question.d],
            dapandung: question.dapan,
            giaithich: question.giaithich,
            one: question.helpone,
            two: question.helptwo,
            three: question.helpthree,
            level,
            messageID: mid,
          });
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        await client.sendMessage(
          `Đã xảy ra lỗi: ${err.message}`,
          threadID,
          messageID
        );
        return;
      }
    }

    if (type === "stop") {
      if (
        !senderInfo.data?.altp ||
        senderInfo.data.altp.level === -1
      ) {
        await client.sendMessage("Bạn chưa đăng ký!", threadID, messageID);
        return;
      }

      const level = senderInfo.data.altp.level;
      const reward = equi(level);

      if (reward > 0) {
        const addMoney = userData.addMoney as ((sid: string, amount: bigint) => Promise<void>) | undefined;
        if (addMoney) await addMoney(senderID, BigInt(reward));
      }

      if (!senderInfo.data) senderInfo.data = {};
      senderInfo.data.altp = { level: -1 };
      await userData.update(senderID, senderInfo);

      const canvas = await veCauHoi(
        "DỪNG CUỘC CHƠI",
        [
          `${name} đã\ndừng cuộc chơi`,
          `Tại câu hỏi số ${level}`,
          `Mang về ${reward.toLocaleString()}đ`,
          "Cảm ơn đã tham gia!",
        ],
        level,
        senderInfo.data,
        name || 'Người chơi'
      );

      await sendCanvas(
        client,
        threadID,
        `Bạn đã dừng cuộc chơi tại câu ${level} với phần thưởng ${reward.toLocaleString()}đ`,
        canvas
      );
    }
  },
};

export default altpCommand;
