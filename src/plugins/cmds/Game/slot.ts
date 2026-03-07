"use strict";

import type { Command, CommandOnCallContext } from '@types';

const locks = new Set<string>();

function fmt(n: bigint): string {
  try {
    return `${n < 0n ? "-" : ""}${(n < 0n ? -n : n).toLocaleString()}$`;
  } catch {
    return `${n} $`;
  }
}

function toBigIntSafe(v: any): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "string") {
    return BigInt(v.replace(/[^0-9-]/g, "") || "0");
  }
  return 0n;
}

function parseBet(
  input: any,
  balance: bigint
): bigint | null {
  if (!input) return null;

  const raw = String(input).trim().toLowerCase();

  if (raw === "all") return balance;

  if (raw.endsWith("%")) {
    const p = Math.min(100, Math.max(1, parseInt(raw.slice(0, -1), 10) || 0));
    return (balance * BigInt(p)) / 100n;
  }

  try {
    return toBigIntSafe(raw);
  } catch {
    return null;
  }
}

const slotCommand: Command = {
  name: "slot",
  alias: ["slothq"],
  version: "1.4.2",
  role: 0,
  desc: "Cờ bạc bằng hình thức hoa quả",
  guide: `• Cú pháp: slot [loại quả] [số tiền]
• Các loại quả: nho(🍇), dưa(🍉), táo(🍏), dâu(🍓), đào(🍑), 777(7️⃣)
• Số tiền cược:
  - Tối thiểu: 50$
  - "all" để cược toàn bộ
  - "x%" để cược theo %
• Tỉ lệ thắng:
  - Trùng 1: lợi nhuận +50% tiền cược
  - Trùng 2: lợi nhuận +2x tiền cược
  - Trùng 3: lợi nhuận +5x tiền cược`,
  cd: 0,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { client, event, userData, args } = ctx;
    const { threadID, messageID, senderID } = event;

    const send = async (m: string) => await client.sendMessage(m, threadID, messageID);

    const icons = new Map<string, string>([
      ["nho", "🍇"],
      ["dưa", "🍉"],
      ["táo", "🍏"],
      ["dâu", "🍓"],
      ["đào", "🍑"],
      ["777", "7️⃣"],
    ]);

    const fruits = [...icons.keys()];

    try {
      if (locks.has(senderID)) {
        await send("⏳ Đợi lượt quay trước hoàn tất.");
        return;
      }

      locks.add(senderID);

      const [fruit, betArg] = args || [];

      if (!fruit || !fruits.includes(fruit)) {
        locks.delete(senderID);
        await send(
          "❎ Loại quả không hợp lệ. Dùng: nho, dưa, táo, dâu, đào, 777"
        );
        return;
      }

      const user = await userData.get(senderID);
      const balance = toBigIntSafe(user?.money || 0);
      const addExp = userData.addExp as ((id: string, amount: number) => Promise<number>) | undefined;

      const bet = parseBet(betArg, balance);

      if (bet === null) {
        locks.delete(senderID);
        await send("❎ Vui lòng nhập số tiền cược hợp lệ.");
        return;
      }

      if (bet < 50n) {
        locks.delete(senderID);
        await send("❎ Cược tối thiểu 50$.");
        return;
      }

      if (bet > balance) {
        locks.delete(senderID);
        await send("❎ Bạn không đủ tiền.");
        return;
      }

      const spin: string[] = Array.from({ length: 3 }, () => {
        const fruit = fruits[Math.floor(Math.random() * fruits.length)];
        return fruit || "nho";
      });

      const matches = spin.reduce((c, x) => c + (x === fruit ? 1 : 0), 0);

      let delta = -bet;

      if (matches === 1) delta = bet / 2n;
      if (matches === 2) delta = bet * 2n;
      if (matches === 3) delta = bet * 5n;

      const newMoney = balance + delta;

      await userData.update(senderID, { money: newMoney }).catch(() => {
        
      });

      const won = matches >= 1;
      const label = delta > 0n ? "Nhận" : delta < 0n ? "Mất" : "Hoàn";
      const value =
        delta > 0n ? `+${fmt(delta)}` : delta < 0n ? fmt(delta) : fmt(0n);

      if (won && addExp) {
        
        const gained = matches === 3 ? 25 : matches === 2 ? 15 : 8;
        await addExp(senderID, gained);
      }

      const getIcon = (key: string): string => icons.get(key) || "❓";
      const spinResults: string[] = spin.map(getIcon);
      const fruitIcon: string = getIcon(fruit);
      await send(
        `${won ? "🎉" : "💸"} ${won ? "Bạn đã trúng!" : "Bạn không trúng!"}\n` +
        `🎭 Trùng ${matches} ${fruitIcon}\n` +
        `🎰 Kết quả: ${spinResults.join(" | ")}\n` +
        `💰 ${label}: ${value}\n`
      );
    } catch (e: any) {
      await send("❎ Có lỗi xảy ra, vui lòng thử lại sau!");
    } finally {
      locks.delete(senderID);
    }
  },
};

export default slotCommand;
