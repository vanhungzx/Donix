"use strict";

import type { Command, CommandOnCallContext } from "@types";
import crypto from "crypto";
import {
  taixiuAddToJackpot,
  taixiuClearGroup,
  taixiuGetHistory,
  taixiuGetJackpot,
  taixiuGetWinStreak,
  taixiuResetJackpot,
  taixiuSaveHistory,
  taixiuUpdateWinStreak,
} from "../../../services/taixiu-db";

interface HistoryEntry {
  bet: string;
  diceResult: string;
  gameResult: string;
  win: boolean;
  winAmount: string;
  jackpotWin: boolean;
  timestamp: number;
}

interface GameResult {
  dice1: number;
  dice2: number;
  dice3: number;
  total: number;
  result: "tài" | "xỉu";
  jackpot: boolean;
  specialCombos: {
    triple: boolean;
    sequence: boolean;
  };
}

const MIN_BET = 1000n;
const JACKPOT_CONTRIBUTION_PERMIL = 100n;
const BASE_JACKPOT_CHANCE = 0.0001;
const LOSE_STREAK_BONUS_CHANCE = 0.0001;
const MAX_JACKPOT_CHANCE = 0.01;

const BASE_NUM = 2n;
const BASE_DEN = 1n;
const TRIPLE_NUM = 3n;
const TRIPLE_DEN = 1n;
const SEQ_NUM = 3n;
const SEQ_DEN = 2n;

const STREAK_START_AT = 5n;
const STREAK_STEP = 3n;
const STREAK_CAP = 12n;

function rollDie(): number {
  if (typeof crypto.randomInt === "function") return crypto.randomInt(1, 7);
  while (true) {
    const value = crypto.randomBytes(4).readUInt32BE(0);
    const limit = Math.floor(0x100000000 / 6) * 6;
    if (value < limit) return (value % 6) + 1;
  }
}

function randFloat(): number {
  if (typeof crypto.randomInt === "function") {
    return crypto.randomInt(0, 1 << 30) / (1 << 30);
  }
  const value = crypto.randomBytes(6).readUIntBE(0, 6);
  return value / 0x1000000000000;
}

function checkJackpotWin(loses: number): boolean {
  let chance = BASE_JACKPOT_CHANCE + loses * LOSE_STREAK_BONUS_CHANCE;
  if (chance > MAX_JACKPOT_CHANCE) chance = MAX_JACKPOT_CHANCE;
  return randFloat() < chance;
}

function playGame(loses: number): GameResult {
  const dice1 = rollDie();
  const dice2 = rollDie();
  const dice3 = rollDie();
  const total = dice1 + dice2 + dice3;
  const result: "tài" | "xỉu" = total <= 10 ? "xỉu" : "tài";
  const triple = dice1 === dice2 && dice2 === dice3;
  const sorted = [dice1, dice2, dice3].sort((a, b) => a - b);
  const sequence = sorted[0] + 1 === sorted[1] && sorted[1] + 1 === sorted[2];
  const jackpot = triple && checkJackpotWin(loses);

  return {
    dice1,
    dice2,
    dice3,
    total,
    result,
    jackpot,
    specialCombos: { triple, sequence },
  };
}

function applyFrac(value: bigint, num: bigint, den: bigint): bigint {
  return (value * num) / den;
}

function calculateWinAmount(betAmount: bigint, gameResult: GameResult, winStreakCount: number): bigint {
  let win = applyFrac(betAmount, BASE_NUM, BASE_DEN);
  if (gameResult.specialCombos.triple) win = applyFrac(win, TRIPLE_NUM, TRIPLE_DEN);
  else if (gameResult.specialCombos.sequence) win = applyFrac(win, SEQ_NUM, SEQ_DEN);

  if (BigInt(winStreakCount) >= STREAK_START_AT) {
    const bonusPercent = BigInt(
      Math.min(
        Number((BigInt(winStreakCount) - STREAK_START_AT + 1n) * STREAK_STEP),
        Number(STREAK_CAP)
      )
    );
    win += (win * bonusPercent) / 100n;
  }

  return win;
}

function formatCurrency(amount: bigint | number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "0 VNĐ";
  const value = typeof amount === "bigint" ? amount : BigInt(amount);
  return `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} VNĐ`;
}

function parseAmount(value: string | undefined, userMoney: bigint): bigint | null {
  if (!value || typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();

  if (/^(allin|all)$/i.test(normalized)) return userMoney;

  const percentMatch = normalized.match(/^([0-9]+)%$/);
  if (percentMatch?.[1]) {
    const percent = BigInt(parseInt(percentMatch[1], 10));
    if (percent > 100n) return null;
    return (percent * userMoney) / 100n;
  }

  const match = normalized.match(/^(\d*\.?\d+)(b|k|m|tr|tỷ|triệu|ngàn)?$/i);
  if (!match?.[1]) return null;

  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const scaled = BigInt(Math.floor(numeric * 100));
  const unit = (match[2] || "").toLowerCase();

  switch (unit) {
    case "b":
    case "tỷ":
      return (scaled * 1000000000n) / 100n;
    case "m":
    case "tr":
    case "triệu":
      return (scaled * 1000000n) / 100n;
    case "k":
    case "ngàn":
      return (scaled * 1000n) / 100n;
    default:
      return scaled / 100n;
  }
}

function normalizeBetChoice(value: string | undefined): "tài" | "xỉu" | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "tài" || normalized === "tai" || normalized === "t") return "tài";
  if (normalized === "xỉu" || normalized === "xiu" || normalized === "x") return "xỉu";
  return null;
}

const taixiuCommand: Command = {
  name: "taixiu",
  alias: ["taixiu", "tx"],
  version: "3.3.5",
  role: 0,
  desc: "Tài xỉu",
  guide: `• {pn} tài <số tiền>
• {pn} xỉu <số tiền>
• {pn} clear
• Thắng x2 tiền, không trừ vốn; chỉ thua mới trừ vốn
• Bộ ba: x3; Dãy: x1.5; Chuỗi thắng 5+: +3%/mốc, tối đa +12%`,
  cd: 3,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { reply, event, client, userData, args } = ctx;

    try {
      const { threadID, messageID, senderID } = event;
      const addMoney = userData.addMoney as ((uid: string, amount: bigint) => Promise<void>) | undefined;
      const delMoney = userData.delMoney as ((uid: string, amount: bigint) => Promise<void>) | undefined;
      const addExp = userData.addExp as ((uid: string, amount: number) => Promise<number>) | undefined;
      const getUserData = userData.get as ((uid: string) => Promise<{ name?: string } | null>) | undefined;
      const checkMoney = userData.checkMoney as ((uid: string) => Promise<bigint | number | string>) | undefined;

      if (!getUserData) {
        await reply("❎ Lỗi: Không thể truy cập dữ liệu người dùng!");
        return;
      }
      if (!checkMoney) {
        await reply("❎ Lỗi: Không thể kiểm tra số dư!");
        return;
      }

      const profile = await getUserData(senderID);
      const name = profile?.name || "Bạn";

      if (String(args[0] || "").toLowerCase() === "clear") {
        await taixiuResetJackpot(threadID);
        await taixiuClearGroup(threadID);
        await reply("✅ Dữ liệu Tài Xỉu của nhóm đã được xóa và hũ đã reset!");
        return;
      }

      const userMoney = BigInt(await checkMoney(senderID));

      if (!args[0] || !args[1]) {
        await reply("Nhập: taixiu tài|xỉu <tiền>. Ví dụ: taixiu tài 10000");
        return;
      }

      const betChoice = normalizeBetChoice(args[0]);
      if (!betChoice) {
        await reply("Chọn 'tài' hoặc 'xỉu'. Ví dụ: taixiu xỉu 50000");
        return;
      }

      const betAmount = parseAmount(args[1], userMoney);
      if (!betAmount || betAmount < MIN_BET) {
        await reply(`Tối thiểu ${formatCurrency(MIN_BET)}`);
        return;
      }
      if (betAmount > userMoney) {
        await reply(`Không đủ tiền. Số dư: ${formatCurrency(userMoney)}`);
        return;
      }

      const streakBefore = await taixiuGetWinStreak(senderID);
      const gameResult = playGame(streakBefore.loses || 0);
      const isWin = gameResult.result === betChoice;
      const currentStreak = streakBefore.current || 0;

      let profit = 0n;
      let jackpotWin = 0n;
      let jackpotContribution = 0n;

      if (isWin) {
        profit = calculateWinAmount(betAmount, gameResult, currentStreak);
        if (gameResult.jackpot) {
          jackpotWin = await taixiuResetJackpot(threadID);
        }
        if (addMoney) {
          await addMoney(senderID, profit + jackpotWin);
        }
        if (addExp) {
          const base = Number(betAmount > 100000n ? 100000n : betAmount);
          const gained = Math.max(10, Math.floor(base / 10000));
          await addExp(senderID, gained);
        }
      } else {
        if (delMoney) {
          await delMoney(senderID, betAmount);
        }
        jackpotContribution = (betAmount * JACKPOT_CONTRIBUTION_PERMIL) / 1000n;
        await taixiuAddToJackpot(threadID, jackpotContribution);
      }

      const streak = await taixiuUpdateWinStreak(senderID, isWin);
      await taixiuSaveHistory({
        userID: senderID,
        bet: betChoice,
        diceResult: gameResult.result,
        gameResult: isWin ? "win" : "lose",
        winAmount: isWin ? profit : betAmount,
        jackpotWin: jackpotWin > 0n,
        threadID,
      });

      const history = (await taixiuGetHistory(senderID, 10, threadID)) as HistoryEntry[];
      const recentHistory = history
        .slice(-8)
        .map((entry) => (entry.diceResult === "xỉu" ? "⚪" : "⚫"))
        .join(" ");

      let specialBonusText = "";
      if (isWin) {
        if (gameResult.specialCombos.triple) {
          specialBonusText += "🎯 Bộ ba! Thưởng x3\n";
        } else if (gameResult.specialCombos.sequence) {
          specialBonusText += "📈 Dãy liên tiếp! Thưởng x1.5\n";
        }
        if (BigInt(streak.current) >= STREAK_START_AT) {
          const bonusPercent = Math.min(
            Number((BigInt(streak.current) - STREAK_START_AT + 1n) * STREAK_STEP),
            Number(STREAK_CAP)
          );
          specialBonusText += `🔥 Chuỗi thắng ${streak.current}! Thưởng +${bonusPercent}%\n`;
        }
      }

      const diceNumbers = [gameResult.dice1, gameResult.dice2, gameResult.dice3];
      const newUserBalance = BigInt(await checkMoney(senderID));

      const resultMessage =
        `${jackpotWin > 0n ? `🎉🎊 ${name} ĐÃ NỔ HŨ! 🎊🎉\n💎 Nhận: ${formatCurrency(jackpotWin)}\n🔄 Hũ đã reset về 0!\n\n` : ""}` +
        `👤 ${name} đã chọn ${betChoice} với ${formatCurrency(betAmount)}\n` +
        `🎲 Xúc xắc: ${diceNumbers.join(" | ")} → ${gameResult.total} (${gameResult.result})\n` +
        `${specialBonusText}` +
        `${isWin ? "✅" : "❌"} Kết quả: ${isWin ? "THẮNG" : "THUA"} ${isWin ? "+" : "-"}${formatCurrency(isWin ? profit : betAmount)}\n` +
        `${!isWin ? `💰 Hũ +${formatCurrency(jackpotContribution)}\n` : ""}` +
        `💎 Hũ hiện tại: ${formatCurrency(await taixiuGetJackpot(threadID))}\n` +
        `💰 Số dư hiện tại: ${formatCurrency(newUserBalance)}\n` +
        `🏆 Chuỗi thắng: ${streak.current} | Kỷ lục: ${streak.highest}\n` +
        `📊 Lịch sử: ${recentHistory || "Chưa có"}`;

      await client.sendMessage(resultMessage, threadID, messageID);
    } catch (error) {
      console.error(error);
      await reply("❎ Có lỗi xảy ra, vui lòng thử lại sau!");
    }
  },
};

export default taixiuCommand;
