"use strict";

import type { Command, CommandOnCallContext } from '@types';
import crypto from "crypto";
import fs from "fs-extra";
import path from "path";
import { STORAGE_GAME } from "../../../core/storagePath";


interface StreakData {
  current: number;
  highest: number;
  loses: number;
}

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


const dataDir = path.join(STORAGE_GAME(), "taixiu");
const historyFilePath = path.join(dataDir, "taixiu_history.json");
const jackpotFilePath = path.join(dataDir, "group_jackpots.json");
const streakFilePath = path.join(dataDir, "win_streaks.json");


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


fs.ensureDirSync(dataDir);

let jackpots: Record<string, string> = {};
let winStreaks: Record<string, StreakData> = {};

function initializeDataFiles(): void {
  if (fs.existsSync(jackpotFilePath)) {
    try {
      jackpots = JSON.parse(fs.readFileSync(jackpotFilePath, "utf8"));
    } catch {
      jackpots = {};
      fs.writeFileSync(jackpotFilePath, JSON.stringify({}));
    }
  } else {
    fs.writeFileSync(jackpotFilePath, JSON.stringify({}));
  }

  if (fs.existsSync(streakFilePath)) {
    try {
      winStreaks = JSON.parse(fs.readFileSync(streakFilePath, "utf8"));
    } catch {
      winStreaks = {};
      fs.writeFileSync(streakFilePath, JSON.stringify({}));
    }
  } else {
    fs.writeFileSync(streakFilePath, JSON.stringify({}));
  }
}

initializeDataFiles();


function getJackpot(threadID: string): bigint {
  return BigInt(jackpots[threadID] || 0);
}

function addToJackpot(threadID: string, amount: bigint): bigint {
  if (!jackpots[threadID]) jackpots[threadID] = "0";
  const current = BigInt(jackpots[threadID]);
  const contribution = (amount * JACKPOT_CONTRIBUTION_PERMIL) / 1000n;
  jackpots[threadID] = (current + contribution).toString();
  fs.writeFileSync(jackpotFilePath, JSON.stringify(jackpots, null, 2));
  return contribution;
}

function resetJackpot(threadID: string): bigint {
  const cur = getJackpot(threadID);
  jackpots[threadID] = "0";
  fs.writeFileSync(jackpotFilePath, JSON.stringify(jackpots, null, 2));
  return cur;
}


function updateWinStreak(userId: string, win: boolean): StreakData {
  if (!winStreaks[userId]) {
    winStreaks[userId] = { current: 0, highest: 0, loses: 0 };
  }

  if (win) {
    winStreaks[userId].current++;
    winStreaks[userId].loses = 0;
    if (winStreaks[userId].current > winStreaks[userId].highest) {
      winStreaks[userId].highest = winStreaks[userId].current;
    }
  } else {
    winStreaks[userId].current = 0;
    winStreaks[userId].loses++;
  }

  fs.writeFileSync(streakFilePath, JSON.stringify(winStreaks, null, 2));
  return winStreaks[userId];
}


function saveHistory(
  userId: string,
  bet: string,
  diceResult: string,
  gameResult: string,
  winAmount: bigint | number,
  jackpotWin: boolean = false
): void {
  let history: Record<string, HistoryEntry[]> = {};
  if (fs.existsSync(historyFilePath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyFilePath, "utf8"));
    } catch {
      history = {};
    }
  }

  if (!history[userId]) history[userId] = [];
  if (history[userId].length >= 10) history[userId].shift();

  history[userId].push({
    bet,
    diceResult,
    gameResult,
    win: gameResult === "win",
    winAmount: typeof winAmount === "bigint" ? winAmount.toString() : String(winAmount),
    jackpotWin,
    timestamp: Date.now(),
  });

  fs.writeFileSync(historyFilePath, JSON.stringify(history, null, 2));
}

function getHistory(userId: string): HistoryEntry[] {
  if (fs.existsSync(historyFilePath)) {
    try {
      const h = JSON.parse(fs.readFileSync(historyFilePath, "utf8"));
      return h[userId] || [];
    } catch {
      return [];
    }
  }
  return [];
}


function rollDie(): number {
  if (typeof crypto.randomInt === "function") return crypto.randomInt(1, 7);
  while (true) {
    const v = crypto.randomBytes(4).readUInt32BE(0);
    const limit = Math.floor(0x100000000 / 6) * 6;
    if (v < limit) return (v % 6) + 1;
  }
}

function randFloat(): number {
  if (typeof crypto.randomInt === "function") {
    return crypto.randomInt(0, 1 << 30) / (1 << 30);
  }
  const v = crypto.randomBytes(6).readUIntBE(0, 6);
  return v / 0x1000000000000;
}


function checkJackpotWin(userId: string): boolean {
  const s = winStreaks[userId] || { loses: 0 };
  let chance = BASE_JACKPOT_CHANCE + s.loses * LOSE_STREAK_BONUS_CHANCE;
  if (chance > MAX_JACKPOT_CHANCE) chance = MAX_JACKPOT_CHANCE;
  return randFloat() < chance;
}

function playGame(userId: string): GameResult {
  const d1 = rollDie();
  const d2 = rollDie();
  const d3 = rollDie();
  const total = d1 + d2 + d3;
  const result: "tài" | "xỉu" = total >= 3 && total <= 10 ? "xỉu" : "tài";
  const triple = d1 === d2 && d2 === d3;
  const sorted = [d1, d2, d3].sort((a, b) => a - b);
  const sorted0 = sorted[0];
  const sorted1 = sorted[1];
  const sorted2 = sorted[2];
  const sequence = sorted0 !== undefined && sorted1 !== undefined && sorted2 !== undefined && sorted1 === sorted0 + 1 && sorted2 === sorted1 + 1;
  const jackpot = triple && checkJackpotWin(userId);

  return {
    dice1: d1,
    dice2: d2,
    dice3: d3,
    total,
    result,
    jackpot,
    specialCombos: { triple, sequence },
  };
}

function applyFrac(x: bigint, num: bigint, den: bigint): bigint {
  return (x * num) / den;
}

function calculateWinAmount(betAmount: bigint, gameResult: GameResult, winStreakCount: number): bigint {
  let win = applyFrac(betAmount, BASE_NUM, BASE_DEN);
  if (gameResult.specialCombos.triple) {
    win = applyFrac(win, TRIPLE_NUM, TRIPLE_DEN);
  } else if (gameResult.specialCombos.sequence) {
    win = applyFrac(win, SEQ_NUM, SEQ_DEN);
  }

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
  const a = typeof amount === "bigint" ? amount : BigInt(amount);
  return a.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " VNĐ";
}

function parseAmount(value: string | undefined, userMoney: bigint): bigint | null {
  if (!value || typeof value !== "string") return null;
  value = value.trim().toLowerCase();

  if (/^(allin|all)$/i.test(value)) return userMoney;

  const percentMatch = value.match(/^([0-9]+)%$/);
  if (percentMatch && percentMatch[1]) {
    const percent = BigInt(parseInt(percentMatch[1]));
    if (percent > 100n) return null;
    return (percent * userMoney) / 100n;
  }

  const m = value.match(/^(\d*\.?\d+)([bkmtr]|tỷ|triệu|ngàn)?$/i);
  if (!m || !m[1]) return null;

  const numStr = m[1];
  const unit = m[2];
  const num = Math.floor(parseFloat(numStr));
  if (num <= 0) return null;

  const base = BigInt(num);
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


const taixiuCommand: Command = {
  name: "taixiu",
  alias: ["taixiu", "tx"],
  version: "3.3.4",
  role: 0,
  desc: "Tài xỉu",
  guide: `• {pn} tài <số tiền>
• {pn} xỉu <số tiền>
• Thắng x2 tiền, không trừ vốn; chỉ thua mới trừ vốn
• Bộ ba: x3; Dãy: x1.5; Chuỗi thắng 5+: +3%/mốc, tối đa +12%`,
  cd: 3,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { reply, event, client, userData, args } = ctx;
    try {
      const addMoney = userData.addMoney as ((uid: string, amount: bigint) => Promise<void>) | undefined;
      const delMoney = userData.delMoney as ((uid: string, amount: bigint) => Promise<void>) | undefined;
      const addExp = userData.addExp as ((uid: string, amount: number) => Promise<number>) | undefined;
      const getUserData = userData.get as ((uid: string) => Promise<any>) | undefined;
      const checkMoney = userData.checkMoney as ((uid: string) => Promise<bigint | number | string>) | undefined;
      const { threadID, messageID, senderID } = event;

      if (!getUserData) {
        await reply("❎ Lỗi: Không thể truy cập dữ liệu người dùng!");
        return;
      }

      const name = ((await getUserData(senderID)) as any)?.name || "Bạn";

      if (!checkMoney) {
        await reply("❎ Lỗi: Không thể kiểm tra số dư!");
        return;
      }

      const userMoney = BigInt(await checkMoney(senderID));

      if (!args[1]) {
        await reply("Nhập: taixiu tài|xỉu <tiền>. Ví dụ: taixiu tài 10000");
        return;
      }

      const betChoice = args[0]?.toLowerCase();
      if (!betChoice || !["tài", "xỉu"].includes(betChoice)) {
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

      const gameResult = playGame(senderID);
      const isWin = gameResult.result === betChoice;
      const currentStreak = winStreaks[senderID]?.current || 0;

      let profit = 0n;
      let jackpotWin = 0n;
      let jackpotContribution = 0n;

      if (isWin) {
        profit = calculateWinAmount(betAmount, gameResult, currentStreak);
        if (gameResult.jackpot) {
          jackpotWin = resetJackpot(threadID);
        }
        if (addMoney) {
          await addMoney(senderID, profit + jackpotWin);
        }


        if (addExp) {
          const base = Number(betAmount > 0n ? (betAmount < 100000n ? betAmount : 100000n) : 0n);
          const gained = Math.max(10, Math.floor(base / 10000));
          await addExp(senderID, gained);
        }
      } else {
        if (delMoney) {
          await delMoney(senderID, betAmount);
        }
        jackpotContribution = addToJackpot(threadID, betAmount);
      }

      const streak = updateWinStreak(senderID, isWin);
      saveHistory(
        senderID,
        betChoice,
        gameResult.result,
        isWin ? "win" : "lose",
        isWin ? profit : betAmount,
        jackpotWin > 0n
      );

      const history = getHistory(senderID);
      const recentHistory = history
        .slice(-8)
        .map((h) => (h.diceResult === "xỉu" ? "⚪" : "⚫"))
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

      const resultMessage =
        `${jackpotWin > 0n ? `🎉🎊 ${name} ĐÃ NỔ HŨ! 🎊🎉\n💎 Nhận: ${formatCurrency(jackpotWin)}\n🔄 Hũ đã reset về 0!\n\n` : ""}` +
        `👤 ${name} đã chọn ${betChoice} với ${formatCurrency(betAmount)}\n` +
        `🎲 Xúc xắc: ${diceNumbers.join(" | ")} → ${gameResult.total} (${gameResult.result})\n` +
        `${specialBonusText}` +
        `${isWin ? "✅" : "❌"} Kết quả: ${isWin ? "THẮNG" : "THUA"} ${isWin ? "+" : "-"}${formatCurrency(isWin ? profit : betAmount)}\n` +
        `${!isWin ? `💰 Hũ +${formatCurrency(jackpotContribution)}\n` : ""}` +
        `💎 Hũ hiện tại: ${formatCurrency(getJackpot(threadID))}\n` +
        `🏆 Chuỗi thắng: ${streak.current} | Kỷ lục: ${streak.highest}\n` +
        `📊 Lịch sử: ${recentHistory || "Chưa có"}`;

      await client.sendMessage(resultMessage, threadID, messageID);
    } catch (e) {
      console.error(e);
      await reply("❎ Có lỗi xảy ra, vui lòng thử lại sau!");
    }
  },
};

export default taixiuCommand;
