"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnReplyContext,
} from "@types";

interface MathReplyData {
  commandName: string;
  author: string;
  threadID: string;
  messageID: string;
  correctAnswer: number;
  reward: number;
  penalty: number;
  difficulty: string;
  startAt: number;
  timeLimit: number;
  timeout?: ReturnType<typeof setTimeout>;
}

const formatCurrency = (value: number): string =>
  value.toLocaleString("vi-VN") + " VNĐ";

const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const pick = <T>(arr: T[]): T => {
  const index = randInt(0, arr.length - 1);
  return arr[index] as T;
};

type DifficultyKey = "dễ" | "easy" | "thuong" | "thường" | "khó" | "kho";

const difficulties: Record<
  DifficultyKey,
  {
    label: string;
    ops: ("+" | "-" | "*")[];
    range: [number, number];
    steps: number;
    reward: number;
    penalty: number;
    timeLimit: number;
  }
> = {
  "dễ": {
    label: "Dễ",
    ops: ["+", "-"],
    range: [2, 18],
    steps: 2,
    reward: 20000,
    penalty: 5000,
    timeLimit: 30000,
  },
  easy: {
    label: "Dễ",
    ops: ["+", "-"],
    range: [2, 18],
    steps: 2,
    reward: 20000,
    penalty: 5000,
    timeLimit: 30000,
  },
  "thường": {
    label: "Thường",
    ops: ["+", "-", "*"],
    range: [5, 35],
    steps: 3,
    reward: 45000,
    penalty: 8000,
    timeLimit: 40000,
  },
  thuong: {
    label: "Thường",
    ops: ["+", "-", "*"],
    range: [5, 35],
    steps: 3,
    reward: 45000,
    penalty: 8000,
    timeLimit: 40000,
  },
  "khó": {
    label: "Khó",
    ops: ["+", "-", "*"],
    range: [10, 60],
    steps: 4,
    reward: 90000,
    penalty: 15000,
    timeLimit: 45000,
  },
  kho: {
    label: "Khó",
    ops: ["+", "-", "*"],
    range: [10, 60],
    steps: 4,
    reward: 90000,
    penalty: 15000,
    timeLimit: 45000,
  },
};

function buildEquation(config: {
  ops: ("+" | "-" | "*")[];
  range: [number, number];
  steps: number;
}): { expression: string; answer: number } {
  const parts: (string | number)[] = [randInt(config.range[0], config.range[1])];

  for (let i = 0; i < config.steps; i++) {
    const op = pick(config.ops);
    const next = randInt(config.range[0], config.range[1]);
    parts.push(op, next);
  }

  const expr = parts.join(" ");
  const answer = Function(`"use strict"; return (${expr});`)() as number;

  return {
    expression: expr.replace(/\*/g, "×"),
    answer: Math.round(answer * 100) / 100,
  };
}

const quickMathCommand: Command = {
  name: "quickmath",
  alias: ["toan", "math", "qm"],
  version: "1.0.0",
  role: 0,
  desc: "Đố tính nhanh, trả lời đúng nhận thưởng",
  guide:
    "{pn} [dễ|thường|khó]\n" +
    "Trả lời phép tính trong thời gian cho phép để nhận thưởng. Sai hoặc hết giờ sẽ bị trừ nhẹ.",
  cd: 5,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { args, event, client, main, commandName, userData } = ctx;


    const mainAny = main as any;

    const diffKey = (args[0]?.toLowerCase() || "thường") as DifficultyKey;
    const diff = difficulties[diffKey] || difficulties["thường"];

    const { expression, answer } = buildEquation(diff);
    const timeSec = Math.floor(diff.timeLimit / 1000);

    await client.sendMessage(
      `🧮 Thử thách Tính Nhanh (${diff.label})\n` +
      `✏️ Đề: ${expression} = ?\n` +
      `⏳ Thời gian: ${timeSec}s\n` +
      `🏅 Thưởng: ${formatCurrency(diff.reward)}\n` +
      `⚠️ Sai/Hết giờ: -${formatCurrency(diff.penalty)}\n` +
      `➡️ Reply tin nhắn này với đáp án của bạn`,
      event.threadID,
      (err: any, info: any) => {
        if (err) return console.error(err);
        const msgInfo = info as { messageID?: string } | undefined;
        if (!msgInfo?.messageID) return;

        if (!mainAny.onReply) {
          mainAny.onReply = new Map<string, MathReplyData>();
        }

        const data: MathReplyData = {
          commandName,
          author: event.senderID,
          threadID: event.threadID,
          messageID: msgInfo.messageID,
          correctAnswer: answer,
          reward: diff.reward,
          penalty: diff.penalty,
          difficulty: diff.label,
          startAt: Date.now(),
          timeLimit: diff.timeLimit,
        };

        const timeout: ReturnType<typeof setTimeout> = setTimeout(async () => {
          const map = mainAny.onReply as
            | Map<string, MathReplyData>
            | undefined;
          const current = map?.get(msgInfo.messageID as string);
          if (!current) return;
          map?.delete(msgInfo.messageID as string);

          const delMoney =
            userData.delMoney as
            | ((id: string, amount: bigint) => Promise<void>)
            | undefined;
          if (delMoney) {
            await delMoney(event.senderID, BigInt(current.penalty));
          }

          await client.sendMessage(
            `⏰ Hết giờ! Đáp án đúng: ${current.correctAnswer}. Trừ ${formatCurrency(
              current.penalty
            )}.`,
            event.threadID
          );
        }, diff.timeLimit);

        data.timeout = timeout;
        (mainAny.onReply as Map<string, MathReplyData>).set(
          msgInfo.messageID,
          data
        );
      }
    );
  },

  onReply: async (ctx: CommandOnReplyContext): Promise<void> => {
    const { event, Reply, main, client, userData } = ctx;
    if (!Reply) return;

    const mainAny = main as any;
    const replyData = Reply as unknown as MathReplyData;

    if (event.senderID !== replyData.author) return;

    if (replyData.timeout) clearTimeout(replyData.timeout);
    (mainAny.onReply as Map<string, MathReplyData> | undefined)?.delete(
      replyData.messageID
    );

    const answerText = (event.body || "").trim().replace(/,/g, "");
    const userAnswer = Number(answerText);

    if (!Number.isFinite(userAnswer)) {
      await client.sendMessage(
        `❌ Vui lòng trả lời bằng một con số!`,
        event.threadID,
        (err: any, info: any) => {
          if (err) return console.error(err);
          const msgInfo = info as { messageID?: string } | undefined;
          if (!msgInfo?.messageID) return;

          if (!mainAny.onReply) {
            mainAny.onReply = new Map<string, MathReplyData>();
          }

          const timeout: ReturnType<typeof setTimeout> = setTimeout(() => {
            (mainAny.onReply as Map<string, MathReplyData> | undefined)?.delete(
              msgInfo.messageID as string
            );
          }, 20000);

          const newData: MathReplyData = {
            ...replyData,
            messageID: msgInfo.messageID,
            timeout,
            startAt: Date.now(),
          };

          (mainAny.onReply as Map<string, MathReplyData>).set(
            msgInfo.messageID,
            newData
          );
        }
      );
      return;
    }

    const timeTaken = Math.floor((Date.now() - replyData.startAt) / 1000);
    const isCorrect = Math.abs(userAnswer - replyData.correctAnswer) < 0.001;

    if (isCorrect) {
      const addMoney =
        userData.addMoney as
        | ((id: string, amount: bigint) => Promise<void>)
        | undefined;
      if (addMoney) {
        await addMoney(event.senderID, BigInt(replyData.reward));
      }

      await client.sendMessage(
        `🎉 Chính xác! Bạn nhận ${formatCurrency(
          replyData.reward
        )}\n⏱️ Thời gian: ${timeTaken}s | Độ khó: ${replyData.difficulty}`,
        event.threadID,
        event.messageID
      );
    } else {
      const delMoney =
        userData.delMoney as
        | ((id: string, amount: bigint) => Promise<void>)
        | undefined;
      if (delMoney) {
        await delMoney(event.senderID, BigInt(replyData.penalty));
      }

      await client.sendMessage(
        `😢 Sai rồi! Đáp án đúng: ${replyData.correctAnswer
        }\n💸 Bị trừ: ${formatCurrency(replyData.penalty)}`,
        event.threadID,
        event.messageID
      );
    }
  },
};

export default quickMathCommand;
