"use strict";

import type { Command, CommandOnCallContext } from '@types';
import crypto from "crypto";
import fs from "fs-extra";
import path from "path";

const dataDir = path.resolve(process.cwd(), "src/storage/game/slots");
const historyFilePath = path.join(dataDir, "history.json");
const jackpotFilePath = path.join(dataDir, "group_jackpots.json");

const MIN_BET = 1000n;
const JACKPOT_CONTRIBUTION_PERMIL = 100n;

interface Symbol {
  e: string;
  k: string;
  w: number;
}

interface LineResult {
  win: boolean;
  k: string;
  multi: bigint;
}

interface HistoryEntry {
  bet: string;
  grid: string[];
  totalMulti: string;
  jackpot: string;
  ts: number;
}

interface Jackpots {
  [threadID: string]: string;
}

interface History {
  [uid: string]: HistoryEntry[];
}

const SYMBOLS: Symbol[] = [
  { e: "7️⃣", k: "7", w: 2 },
  { e: "💎", k: "D", w: 4 },
  { e: "🔔", k: "B", w: 6 },
  { e: "⭐", k: "S", w: 7 },
  { e: "🍒", k: "C", w: 9 },
  { e: "🍋", k: "L", w: 12 },
];

const PAY: Record<string, bigint> = {
  "7": 20n,
  D: 12n,
  B: 8n,
  S: 6n,
  C: 4n,
  L: 3n,
};

const LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 4, 8],
  [2, 4, 6],
];

fs.ensureDirSync(dataDir);
if (!fs.existsSync(jackpotFilePath)) {
  fs.writeFileSync(jackpotFilePath, JSON.stringify({}));
}
if (!fs.existsSync(historyFilePath)) {
  fs.writeFileSync(historyFilePath, JSON.stringify({}));
}

function getJackpots(): Jackpots {
  try {
    return JSON.parse(fs.readFileSync(jackpotFilePath, "utf8"));
  } catch {
    return {};
  }
}

function setJackpots(x: Jackpots): void {
  fs.writeFileSync(jackpotFilePath, JSON.stringify(x, null, 2));
}

function getJackpot(threadID: string): bigint {
  const m = getJackpots();
  return BigInt(m[threadID] || 0);
}

function addToJackpot(threadID: string, amount: bigint): bigint {
  const m = getJackpots();
  const cur = BigInt(m[threadID] || 0);
  const add = (amount * JACKPOT_CONTRIBUTION_PERMIL) / 1000n;
  m[threadID] = (cur + add).toString();
  setJackpots(m);
  return add;
}

function resetJackpot(threadID: string): bigint {
  const m = getJackpots();
  const cur = BigInt(m[threadID] || 0);
  m[threadID] = "0";
  setJackpots(m);
  return cur;
}

function randomInt(a: number, b: number): number {
  if (typeof crypto.randomInt === "function") {
    return crypto.randomInt(a, b);
  }
  const range = b - a;
  const limit = Math.floor(0x100000000 / range) * range;
  while (true) {
    const v = crypto.randomBytes(4).readUInt32BE(0);
    if (v < limit) return a + (v % range);
  }
}

function chooseSymbol(): Symbol {
  const total = SYMBOLS.reduce((s, x) => s + x.w, 0);
  let r = randomInt(0, total);
  for (const s of SYMBOLS) {
    if (r < s.w) return s;
    r -= s.w;
  }
  
  return SYMBOLS[SYMBOLS.length - 1] ?? SYMBOLS[0] ?? { e: "❓", k: "?", w: 1 };
}

function spinGrid(): Symbol[] {
  const grid: Symbol[] = [];
  for (let i = 0; i < 9; i++) {
    grid.push(chooseSymbol());
  }
  return grid;
}

function evalLine(grid: Symbol[], idxs: number[]): LineResult {
  const cells = idxs.map((i) => grid[i]).filter((c): c is Symbol => c !== undefined);
  if (cells.length !== 3) return { win: false, k: "", multi: 0n };

  const ks = cells.map((c) => c.k);
  const nonStar = ks.filter((k) => k !== "S");
  const star = ks.length - nonStar.length;

  const payS = PAY["S"];
  if (!payS) return { win: false, k: "", multi: 0n };

  if (star === 3) return { win: true, k: "S", multi: payS };
  if (nonStar.length === 0) return { win: true, k: "S", multi: payS };

  const table: Record<string, number> = {};
  for (const k of nonStar) {
    table[k] = (table[k] || 0) + 1;
  }

  let best: string | null = null;
  for (const k in table) {
    const count = (table[k] || 0) + star;
    if (count >= 3) {
      const payK = PAY[k];
      const payBest = best ? PAY[best] : undefined;
      if (payK && (!best || !payBest || payK > payBest)) {
        best = k;
      }
    }
  }

  if (!best) return { win: false, k: "", multi: 0n };
  const payBest = PAY[best];
  if (!payBest) return { win: false, k: "", multi: 0n };
  return { win: true, k: best, multi: payBest };
}

function formatGrid(grid: Symbol[]): string {
  const row0 = `${grid[0]?.e || "❓"} ${grid[1]?.e || "❓"} ${grid[2]?.e || "❓"}`;
  const row1 = `${grid[3]?.e || "❓"} ${grid[4]?.e || "❓"} ${grid[5]?.e || "❓"}`;
  const row2 = `${grid[6]?.e || "❓"} ${grid[7]?.e || "❓"} ${grid[8]?.e || "❓"}`;
  return `${row0}\n${row1}\n${row2}`;
}

function parseAmount(value: any, userMoney: bigint): bigint | null {
  if (!value || typeof value !== "string") return null;

  value = value.trim().toLowerCase();

  if (/^(allin|all)$/i.test(value)) return userMoney;

  if (/^[0-9]+%$/.test(value)) {
    const percent = BigInt(parseInt(value));
    if (percent > 100n) return null;
    return (percent * userMoney) / 100n;
  }

  const m = value.match(/^(\d*\.?\d+)([bkmtr]|tỷ|triệu|ngàn)?$/i);
  if (!m) return null;

  let [, numStr, unit] = m;
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

function formatCurrency(amount: bigint | number): string {
  const a = typeof amount === "bigint" ? amount : BigInt(amount || 0);
  return a.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " VNĐ";
}

function saveHistory(uid: string, entry: HistoryEntry): void {
  let all: History = {};
  try {
    all = JSON.parse(fs.readFileSync(historyFilePath, "utf8"));
  } catch {
    all = {};
  }
  if (!all[uid]) all[uid] = [];
  all[uid].push(entry);
  if (all[uid].length > 15) all[uid] = all[uid].slice(-15);
  fs.writeFileSync(historyFilePath, JSON.stringify(all, null, 2));
}

const slot2Command: Command = {
  name: "slot2",
  alias: ["slot2"],
  version: "1.0.0",
  role: 0,
  desc: "Slots 3x3 có Hũ",
  guide: `• {pn} <tiền> | {pn} help
• Trúng dòng trả thưởng: x3~x20 theo biểu tượng
• Nổ Hũ khi dòng giữa là 7️⃣ 7️⃣ 7️⃣`,
  cd: 3,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    try {
      const { reply, event, client, userData, args } = ctx;
      const { threadID, messageID, senderID } = event;

      const name = (await userData.get(senderID))?.name || "Bạn";
      const checkMoney = userData.checkMoney as ((id: string) => Promise<bigint | number>) | undefined;
      const userMoney = BigInt(checkMoney ? await checkMoney(senderID) : 0);

      if (
        !args[0] ||
        ["help", "h", "?"].includes(args[0].toLowerCase())
      ) {
        const jp = formatCurrency(getJackpot(threadID));
        const p = `7️⃣ x20 • 💎 x12 • 🔔 x8 • ⭐ x6 • 🍒 x4 • 🍋 x3`;
        await reply(
          `Hũ hiện tại: ${jp}\nBảng trả thưởng: ${p}\nDùng: slots 50k | slots 25% | slots allin`
        );
        return;
      }

      const bet = parseAmount(args[0], userMoney);

      if (!bet || bet < MIN_BET) {
        await reply(`Tối thiểu ${formatCurrency(MIN_BET)}`);
        return;
      }

      if (bet > userMoney) {
        await reply(
          `Không đủ tiền. Số dư: ${formatCurrency(userMoney)}`
        );
        return;
      }

      const grid = spinGrid();
      const lines = LINES.map((line) => evalLine(grid, line));
      const lineWins = lines.filter((l) => l.win);
      const jackpotHit =
        grid[3]?.k === "7" && grid[4]?.k === "7" && grid[5]?.k === "7";

      let totalMulti = 0n;
      for (const l of lineWins) {
        totalMulti += l.multi;
      }

      let profit = 0n;
      let jackpotGain = 0n;

      if (totalMulti > 0n) {
        profit = bet * totalMulti;
        if (jackpotHit) {
          jackpotGain = resetJackpot(threadID);
        }
        const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (addMoney) {
          await addMoney(senderID, profit + jackpotGain);
        }

        
        const addExp = userData.addExp as ((id: string, amount: number) => Promise<number>) | undefined;
        if (addExp) {
          const totalMultiNum = Number(totalMulti > 0n ? (totalMulti < 20n ? totalMulti : 20n) : 0n);
          const gained = Math.max(10, totalMultiNum * 2); 
          await addExp(senderID, gained);
        }
      } else {
        const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (delMoney) {
          await delMoney(senderID, bet);
        }
        addToJackpot(threadID, bet);
      }

      const gridText = formatGrid(grid);
      const payLines =
        totalMulti > 0n
          ? lineWins.map((l) => `+${l.multi}x`).join(" ")
          : "";

      const body =
        `${jackpotGain > 0n
          ? `🎉🎊 ${name} ĐÃ NỔ HŨ! 🎊🎉\n💎 Nhận: ${formatCurrency(jackpotGain)}\n🔄 Hũ đã reset về 0!\n\n`
          : ""
        }` +
        `👤 ${name} đã cược ${formatCurrency(bet)}\n` +
        `${gridText}\n` +
        `${totalMulti > 0n
          ? `✅ THẮNG +${formatCurrency(profit)} ${payLines ? `(${payLines})` : ""}\n`
          : `❌ THUA -${formatCurrency(bet)}\n`
        }` +
        `💎 Hũ: ${formatCurrency(getJackpot(threadID))}`;

      saveHistory(senderID, {
        bet: bet.toString(),
        grid: grid.map((s) => s?.e || "❓"),
        totalMulti: totalMulti.toString(),
        jackpot: jackpotGain.toString(),
        ts: Date.now(),
      });

      await client.sendMessage(body, threadID, messageID);
    } catch (e: any) {
      const { reply } = ctx;
      await reply("❎ Lỗi, thử lại sau.");
    }
  },
};

export default slot2Command;
