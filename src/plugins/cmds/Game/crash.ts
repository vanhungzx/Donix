"use strict";

import type { Command, CommandOnCallContext } from '@types';
import crypto from "crypto";

function randFloat(): number {
  const v = crypto.randomBytes(6).readUIntBE(0, 6);
  return v / 0x1000000000000;
}

function formatCurrency(amount: bigint | number | null | undefined): string {
  const a = typeof amount === "bigint" ? amount : BigInt(amount || 0);
  return a.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " VNĐ";
}

function parseAmount(
  value: string | undefined,
  userMoney: bigint
): bigint | null {
  if (!value || typeof value !== "string") return null;

  value = value.trim().toLowerCase();

  if (/^(allin|all)$/i.test(value)) return userMoney;

  if (/^[0-9]+%$/.test(value)) {
    const percent = BigInt(parseInt(value));
    if (percent > 100n) return null;
    return (percent * userMoney) / 100n;
  }

  const m = value.match(/^(\d*\.?\d+)([bkmtr]|tỷ|triệu|ngàn)?$/i);
  if (!m || !m[1]) return null;

  let [, numStr, unit] = m;
  if (!numStr) return null;
  let num = Math.floor(parseFloat(numStr));

  if (num <= 0) return null;

  let base = BigInt(num);

  switch ((unit || "").toLowerCase()) {
    case "b":
    case "tỷ":
      return base * 1000000000n;
    case "m":
    case "tr":
    case "triệu":
      return base * 1000000n;
    case "k":
    case "ngàn":
      return base * 1000n;
    default:
      return base;
  }
}

function parseX(s: string | undefined): bigint {
  if (!s) return 200n;

  const t = String(s)
    .trim()
    .toLowerCase()
    .replace(/x$/, "")
    .replace(/^x/, "");

  if (/^\d+%$/.test(t)) {
    const p = BigInt(parseInt(t));
    return p < 101n ? 101n : p;
  }

  const v = Number(t);

  if (!Number.isFinite(v)) return 200n;

  let bps = BigInt(Math.round(v * 100));

  if (bps < 101n) bps = 101n;
  if (bps > 1000n) bps = 1000n;

  return bps;
}

function crashPoint(): bigint {
  const u = randFloat();
  const house = 0.01;
  const x = Math.floor(100 * (1 / (1 - u)) * (1 - house));
  const cap = 10000;
  const clamped = Math.max(101, Math.min(x, cap));
  return BigInt(clamped);
}

const MIN_BET = 1000n;

const crashCommand: Command = {
  name: "crash",
  alias: ["crash"],
  version: "1.0.0",
  role: 0,
  desc: "Crash multiplier",
  guide: `• {pn} <tiền> [x]
• Ví dụ: crash 50k 1.8x | crash 25% x3 | crash allin
• Thắng nhận tiền lãi = cược*(x-1); chỉ thua mới trừ vốn`,
  cd: 3,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    try {
      const { reply, event, client, userData, args } = ctx;
      const { threadID, messageID, senderID } = event;

      const user = await userData.get(senderID);
      const name = user?.name || "Bạn";

      const checkMoney = userData.checkMoney as ((id: string) => Promise<bigint | number>) | undefined;
      const money = BigInt(checkMoney ? await checkMoney(senderID) : 0);

      if (!args[0]) {
        await reply("Nhập: crash <tiền> [x]. Ví dụ: crash 50k 2x");
        return;
      }

      const bet = parseAmount(args[0], money);

      if (!bet || bet < MIN_BET) {
        await reply(`Tối thiểu ${formatCurrency(MIN_BET)}`);
        return;
      }

      if (bet > money) {
        await reply(`Không đủ tiền. Số dư: ${formatCurrency(money)}`);
        return;
      }

      const x = parseX(args[1]);
      const crash = crashPoint();

      if (x <= crash) {
        const profit = (bet * (x - 100n)) / 100n;

        const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (addMoney) await addMoney(senderID, profit);

        const body = `👤 ${name} đã cược ${formatCurrency(bet)}\n📈 Mục tiêu: ${(Number(x) / 100).toFixed(2)}x | Nổ tại: ${(Number(crash) / 100).toFixed(2)}x\n✅ THẮNG +${formatCurrency(profit)}`;

        await client.sendMessage(body, threadID, messageID);
      } else {
        const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (delMoney) await delMoney(senderID, bet);

        const body = `👤 ${name} đã cược ${formatCurrency(bet)}\n📈 Mục tiêu: ${(Number(x) / 100).toFixed(2)}x | Nổ tại: ${(Number(crash) / 100).toFixed(2)}x\n❌ THUA -${formatCurrency(bet)}`;

        await client.sendMessage(body, threadID, messageID);
      }
    } catch (e: any) {
      const { reply } = ctx;
      reply("❎ Lỗi, thử lại sau.");
    }
  },
};

export default crashCommand;
