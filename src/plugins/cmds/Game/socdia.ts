"use strict";



import type { Command, CommandOnCallContext } from '@types';
import crypto from "crypto";
import { promises as fsPromises } from "fs";
import fs from "fs-extra";
import path from "path";


interface HistoryEntry {
  pick: string;
  parity: string;
  tutu: boolean;
  win: boolean;
  bet: string;
  payout: string;
  jackpot: string;
  ts: number;
}

interface StreakData {
  current: number;
  highest: number;
  loses: number;
}

interface CoinState {
  reds: number;
  whites: number;
  parity: "chẵn" | "lẻ";
  tutu: boolean;
  icons: string;
}


const dataDir = path.join(process.cwd(), "src/storage/game/socdia");
const historyFilePath = path.join(dataDir, "history.json");
const jackpotFilePath = path.join(dataDir, "group_jackpots.json");
const streakFilePath = path.join(dataDir, "win_streaks.json");


const MIN_BET = 1000n;
const JACKPOT_CONTRIBUTION_PERMIL = 100n;
const BASE_JACKPOT_CHANCE = 0.0001;
const LOSE_STREAK_BONUS_CHANCE = 0.0001;
const MAX_JACKPOT_CHANCE = 0.01;


const BASE_NUM = 2n;
const BASE_DEN = 1n;
const TUTU_NUM = 4n;
const TUTU_DEN = 1n;


const STREAK_START_AT = 5n;
const STREAK_STEP = 3n;
const STREAK_CAP = 12n;


const HOUSE_TILT_BASE = 0.2;
const HOUSE_TILT_WINSTEP = 0.02;
const HOUSE_TILT_CAP = 0.5;


const BET_TILT_STEP = 0.03;
const BET_TILT_THRESHOLDS: bigint[] = [
  10000n,
  50000n,
  100000n,
  500000n,
  1000000n,
  5000000n,
  10000000n,
];
const BET_TILT_CAP = 0.25;


fs.ensureDirSync(dataDir);
for (const p of [historyFilePath, jackpotFilePath, streakFilePath]) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify({}));
}


let CACHE_HISTORY: Record<string, HistoryEntry[]> | null = null;
let CACHE_JACKPOT: Record<string, bigint> | null = null;
let CACHE_STREAKS: Record<string, StreakData> | null = null;
let CACHE_LOAD_TIME: Record<string, number> = {};
const CACHE_TTL = 15 * 1000; // Giảm từ 30s xuống 15s để realtime hơn
const MAX_CACHE_SIZE = 500; // Giới hạn số lượng threads trong cache


const writeTimers: Record<string, NodeJS.Timeout> = {};
const DEBOUNCE_DELAY = 2000;

async function loadJson(p: string): Promise<any> {
  try {
    const content = await fsPromises.readFile(p, "utf8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}


async function saveJson(p: string, v: any): Promise<void> {

  if (writeTimers[p]) {
    clearTimeout(writeTimers[p]);
  }


  writeTimers[p] = setTimeout(async () => {
    try {

      await fsPromises.writeFile(p, JSON.stringify(v), "utf-8");
      delete writeTimers[p];
    } catch (error) {
      console.error(`Error writing ${p}:`, error);
    }
  }, DEBOUNCE_DELAY);
}



async function getHistoryCache(): Promise<Record<string, HistoryEntry[]>> {
  const now = Date.now();
  if (!CACHE_HISTORY || !CACHE_LOAD_TIME[historyFilePath] || now - CACHE_LOAD_TIME[historyFilePath] > CACHE_TTL) {
    const data = await loadJson(historyFilePath);
    // Giới hạn cache size - chỉ giữ các thread gần đây nhất
    const keys = Object.keys(data);
    if (keys.length > MAX_CACHE_SIZE) {
      const sorted = keys.sort((a, b) => {
        const aLast = data[a]?.[data[a].length - 1]?.timestamp || 0;
        const bLast = data[b]?.[data[b].length - 1]?.timestamp || 0;
        return bLast - aLast;
      });
      const limited: Record<string, HistoryEntry[]> = {};
      for (let i = 0; i < MAX_CACHE_SIZE; i++) {
        limited[sorted[i]] = data[sorted[i]];
      }
      CACHE_HISTORY = limited;
    } else {
      CACHE_HISTORY = data;
    }
    CACHE_LOAD_TIME[historyFilePath] = now;
  }
  return CACHE_HISTORY || {};
}

async function getJackpotCache(): Promise<Record<string, bigint>> {
  const now = Date.now();
  if (!CACHE_JACKPOT || !CACHE_LOAD_TIME[jackpotFilePath] || now - CACHE_LOAD_TIME[jackpotFilePath] > CACHE_TTL) {
    const data = await loadJson(jackpotFilePath);
    CACHE_JACKPOT = asBigintMap(data);
    CACHE_LOAD_TIME[jackpotFilePath] = now;
  }
  return CACHE_JACKPOT;
}

async function getStreakCache(): Promise<Record<string, StreakData>> {
  const now = Date.now();
  if (!CACHE_STREAKS || !CACHE_LOAD_TIME[streakFilePath] || now - CACHE_LOAD_TIME[streakFilePath] > CACHE_TTL) {
    CACHE_STREAKS = await loadJson(streakFilePath);
    CACHE_LOAD_TIME[streakFilePath] = now;
  }
  return CACHE_STREAKS || {};
}

function asBigintMap(obj: Record<string, any>): Record<string, bigint> {
  const out: Record<string, bigint> = {};
  for (const k in obj) {
    out[k] = BigInt(String(obj[k] || 0));
  }
  return out;
}


(async () => {
  CACHE_HISTORY = await loadJson(historyFilePath);
  const jackpotData = await loadJson(jackpotFilePath);
  CACHE_JACKPOT = asBigintMap(jackpotData);
  CACHE_STREAKS = await loadJson(streakFilePath);
  CACHE_LOAD_TIME[historyFilePath] = Date.now();
  CACHE_LOAD_TIME[jackpotFilePath] = Date.now();
  CACHE_LOAD_TIME[streakFilePath] = Date.now();
})();


function getJackpot(threadID: string): bigint {
  if (!CACHE_JACKPOT) return 0n;
  return CACHE_JACKPOT[threadID] || 0n;
}

async function addToJackpot(threadID: string, amount: bigint): Promise<bigint> {
  const cache = await getJackpotCache();
  const add = (amount * JACKPOT_CONTRIBUTION_PERMIL) / 1000n;
  const cur = cache[threadID] || 0n;
  cache[threadID] = cur + add;
  CACHE_JACKPOT = cache;
  persistJackpot();
  return add;
}

async function resetJackpot(threadID: string): Promise<bigint> {
  const cache = await getJackpotCache();
  const cur = cache[threadID] || 0n;
  cache[threadID] = 0n;
  CACHE_JACKPOT = cache;
  persistJackpot();
  return cur;
}

function persistJackpot(): void {
  if (!CACHE_JACKPOT) return;
  const obj: Record<string, string> = {};
  for (const k in CACHE_JACKPOT) {
    const value = CACHE_JACKPOT[k];
    if (value !== undefined) {
      obj[k] = value.toString();
    }
  }
  saveJson(jackpotFilePath, obj);
}


function getStreak(uid: string): StreakData {
  if (!CACHE_STREAKS) return { current: 0, highest: 0, loses: 0 };
  return CACHE_STREAKS[uid] || { current: 0, highest: 0, loses: 0 };
}

async function setStreak(uid: string, data: StreakData): Promise<StreakData> {
  const cache = await getStreakCache();
  cache[uid] = data;
  CACHE_STREAKS = cache;
  saveJson(streakFilePath, cache);
  return data;
}

async function updateWinStreak(uid: string, win: boolean): Promise<StreakData> {
  const st = getStreak(uid);
  if (win) {
    st.current++;
    st.loses = 0;
    if (st.current > st.highest) st.highest = st.current;
  } else {
    st.current = 0;
    st.loses++;
  }
  return await setStreak(uid, st);
}


async function saveHistory(uid: string, entry: HistoryEntry): Promise<void> {
  const cache = await getHistoryCache();
  if (!cache[uid]) cache[uid] = [];
  cache[uid].push(entry);
  if (cache[uid].length > 20) {
    cache[uid] = cache[uid].slice(-20);
  }
  CACHE_HISTORY = cache;
  saveJson(historyFilePath, cache);
}

function getHistory(uid: string): HistoryEntry[] {
  if (!CACHE_HISTORY) return [];
  return CACHE_HISTORY[uid] || [];
}


function randomInt(a: number, b: number): number {
  if (typeof crypto.randomInt === "function") return crypto.randomInt(a, b);
  const range = b - a;
  const limit = Math.floor(0x100000000 / range) * range;
  while (true) {
    const v = crypto.randomBytes(4).readUInt32BE(0);
    if (v < limit) return a + (v % range);
  }
}

function randFloat(): number {
  const v = crypto.randomBytes(6).readUIntBE(0, 6);
  return v / 0x1000000000000;
}


function formatCurrency(amount: bigint | number | string): string {
  const a = typeof amount === "bigint" ? amount : BigInt(amount || 0);
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

  const m = value.match(/^(\d*\.?\d+)\s*([bkmtr]|tỷ|tr|triệu|ngàn|k)?$/i);
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

function toChoice(s: string | undefined): "chẵn" | "lẻ" | "" {
  const t = String(s || "").trim().toLowerCase();
  if (["chan", "chẵn", "c"].includes(t)) return "chẵn";
  if (["le", "lẻ", "l"].includes(t)) return "lẻ";
  return "";
}

function applyFrac(x: bigint, num: bigint, den: bigint): bigint {
  return (x * num) / den;
}


function checkJackpotWin(uid: string): boolean {
  const st = getStreak(uid);
  let chance = BASE_JACKPOT_CHANCE + (st.loses || 0) * LOSE_STREAK_BONUS_CHANCE;
  if (chance > MAX_JACKPOT_CHANCE) chance = MAX_JACKPOT_CHANCE;
  return randFloat() < chance;
}

function coinsToState(coins: number[]): CoinState {
  const reds = coins.reduce((a, b) => a + b, 0);
  const whites = 4 - reds;
  const parity: "chẵn" | "lẻ" = reds % 2 === 0 ? "chẵn" : "lẻ";
  const tutu = reds === 0 || reds === 4;
  const icons = coins.map((x) => (x ? "🔴" : "⚪")).join(" ");
  return { reds, whites, parity, tutu, icons };
}


function tiltByStreak(streakBefore: number): number {
  const add = Math.floor(Number(streakBefore || 0) / 3) * HOUSE_TILT_WINSTEP;
  const t = HOUSE_TILT_BASE + add;
  return t > HOUSE_TILT_CAP ? HOUSE_TILT_CAP : t;
}


function tiltByBet(bet: bigint): number {
  let bonus = 0;
  for (const th of BET_TILT_THRESHOLDS) {
    if (bet >= th) bonus += BET_TILT_STEP;
  }
  if (bonus > BET_TILT_CAP) bonus = BET_TILT_CAP;
  return bonus;
}


function playBiasedRound(
  pick: "chẵn" | "lẻ",
  streakBefore: number,
  bet: bigint
): CoinState {
  let coins = [0, 0, 0, 0].map(() => randomInt(0, 2));
  let r = coinsToState(coins);


  if (r.tutu && pick === r.parity) {
    coins[0] = coins[0] ? 0 : 1;
    r = coinsToState(coins);
  }


  const rate = Math.min(tiltByStreak(streakBefore) + tiltByBet(bet), 0.85);
  if (pick === r.parity && !r.tutu && randFloat() < rate) {
    coins[0] = coins[0] ? 0 : 1;
    r = coinsToState(coins);
  }

  return r;
}

function calcPayout(bet: bigint, tutu: boolean, streakCount: number): bigint {
  let win = applyFrac(bet, tutu ? TUTU_NUM : BASE_NUM, tutu ? TUTU_DEN : BASE_DEN);
  if (BigInt(streakCount) >= STREAK_START_AT) {
    const bonusPercent = BigInt(
      Math.min(
        Number((BigInt(streakCount) - STREAK_START_AT + 1n) * STREAK_STEP),
        Number(STREAK_CAP)
      )
    );
    win += (win * bonusPercent) / 100n;
  }
  return win;
}


const socdiaCommand: Command = {
  name: "socdia",
  alias: ["socdia"],
  version: "1.4.0",
  role: 0,
  desc: "Sóc đĩa chẵn/lẻ có Hũ (tilt dí người cược to)",
  guide: `• {pn} chẵn <tiền>
• {pn} lẻ <tiền>
• Thắng x2; tứ tử trúng parity x4; chuỗi thắng 5+ +3%/mốc (tối đa +12%)
• Hũ: +10% tiền thua; có thể nổ khi trúng tứ tử (theo xác suất)`,
  cd: 3,
  prefix: true,


  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { reply, event, client, userData, args } = ctx;
    try {
      const { threadID, messageID, senderID } = event;
      const name = ((await userData.get(senderID)) as any)?.name || "Bạn";

      if (!args[1]) {
        await reply("Nhập: socdia chẵn|lẻ <tiền>. Ví dụ: socdia chẵn 50k");
        return;
      }

      const pick = toChoice(args[0]);
      if (!pick) {
        await reply("Chọn 'chẵn' hoặc 'lẻ'. Ví dụ: socdia lẻ 100k");
        return;
      }

      const rawBalance = await (userData.checkMoney as any)(senderID);
      const balance = BigInt(rawBalance || 0);

      let bet = parseAmount(args[1], balance);
      if (!bet || bet < MIN_BET) {
        await reply(`Tối thiểu ${formatCurrency(MIN_BET)}`);
        return;
      }
      if (bet > balance) bet = balance;
      if (bet < MIN_BET) {
        await reply(`Không đủ tiền. Số dư: ${formatCurrency(balance)}`);
        return;
      }


      const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
      const addExp = userData.addExp as ((id: string, amount: number) => Promise<number>) | undefined;
      if (delMoney) {
        await delMoney(senderID, bet);
      }

      const streakBefore = getStreak(senderID)?.current || 0;
      const round = playBiasedRound(pick, streakBefore, bet);
      const isWin = pick === round.parity;

      let payout = 0n;
      let jackpotWin = 0n;
      let jackpotContribution = 0n;

      if (isWin) {
        payout = calcPayout(bet, round.tutu, streakBefore);

        if (round.tutu && checkJackpotWin(senderID)) {
          jackpotWin = await resetJackpot(threadID);
        }
        const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (addMoney) {
          await addMoney(senderID, payout + jackpotWin);
        }


        if (addExp) {
          const cappedBet = bet < 100000n ? bet : 100000n;
          const base = Number(cappedBet);
          const gained = Math.max(10, Math.floor(base / 20000));
          await addExp(senderID, gained);
        }
      } else {
        jackpotContribution = await addToJackpot(threadID, bet);
      }

      const st = await updateWinStreak(senderID, isWin);

      await saveHistory(senderID, {
        pick,
        parity: round.parity,
        tutu: round.tutu,
        win: isWin,
        bet: bet.toString(),
        payout: payout.toString(),
        jackpot: jackpotWin.toString(),
        ts: Date.now(),
      });

      const history = getHistory(senderID)
        .slice(-12)
        .map((h) => (h.parity === "chẵn" ? "C" : "L"))
        .join(" ");

      let bonusText = "";
      if (isWin) {
        if (round.tutu) bonusText += `🎯 Tứ tử! x${round.tutu ? Number(TUTU_NUM) : Number(BASE_NUM)}\n`;
        if (BigInt(st.current) >= STREAK_START_AT) {
          const bonusPercent = Math.min(
            Number((BigInt(st.current) - STREAK_START_AT + 1n) * STREAK_STEP),
            Number(STREAK_CAP)
          );
          bonusText += `🔥 Chuỗi thắng ${st.current}! +${bonusPercent}%\n`;
        }
      }

      const body =
        `${jackpotWin > 0n ? `🎉🎊 ${name} ĐÃ NỔ HŨ! 🎊🎉\n💎 Nhận: ${formatCurrency(jackpotWin)}\n🔄 Hũ đã reset về 0!\n\n` : ""}` +
        `👤 ${name} đã chọn ${pick} với ${formatCurrency(bet)}\n` +
        `🟡 Kết quả: ${round.icons}\n` +
        `📊 ${round.reds} đỏ, ${round.whites} trắng → ${round.parity}\n` +
        `${bonusText}` +
        `${isWin ? `✅ THẮNG +${formatCurrency(payout)}` : `❌ THUA -${formatCurrency(bet)}`}\n` +
        `${!isWin ? `💰 Hũ +${formatCurrency(jackpotContribution)}\n` : ""}` +
        `💎 Hũ hiện tại: ${formatCurrency(getJackpot(threadID))}\n` +
        `🏆 Chuỗi thắng: ${st.current} | Kỷ lục: ${st.highest}\n` +
        `📈 Lịch sử: ${history || "Chưa có"}`;

      await client.sendMessage(body, threadID, messageID);
    } catch (e) {

      await reply("❎ Lỗi, thử lại sau.");
    }
  },
};

export default socdiaCommand;
