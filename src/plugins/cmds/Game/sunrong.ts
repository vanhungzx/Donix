"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnLoadContext,
} from '@types';
import { createCanvas } from "canvas";
import crypto from "crypto";
import fs from "fs-extra";
import moment from "moment-timezone";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "src/storage/game/sunrong");

interface Color {
  key: string;
  vi: string[];
  mult: number;
  weight: number;
  hex: string;
  darkHex: string;
}

interface HistoryEntry {
  tid: string;
  uid: string;
  user: string;
  bet: number;
  pick: string;
  result: string;
  mult: number;
  delta: number;
  seed: string;
  time: string;
}

interface Jackpots {
  [threadID: string]: number;
}

const COLORS: Color[] = [
  {
    key: "green",
    vi: ["xanh", "luc", "green"],
    mult: 2,
    weight: 6,
    hex: "#00ff88",
    darkHex: "#00cc66",
  },
  {
    key: "blue",
    vi: ["lam", "xanhduong", "blue"],
    mult: 3,
    weight: 5,
    hex: "#00d4ff",
    darkHex: "#0099cc",
  },
  {
    key: "purple",
    vi: ["tim", "purple"],
    mult: 4,
    weight: 4,
    hex: "#cc66ff",
    darkHex: "#9933cc",
  },
  {
    key: "red",
    vi: ["do", "đỏ", "red"],
    mult: 5,
    weight: 3,
    hex: "#ff3366",
    darkHex: "#cc0033",
  },
  {
    key: "yellow",
    vi: ["vang", "vàng", "gold", "yellow"],
    mult: 8,
    weight: 2,
    hex: "#ffdd00",
    darkHex: "#ccaa00",
  },
  {
    key: "white",
    vi: ["trang", "trắng", "white"],
    mult: 24,
    weight: 1,
    hex: "#ffffff",
    darkHex: "#cccccc",
  },
];

function fmtBig(n: bigint | number): string {
  const num = BigInt(n);
  let s = num.toString();
  let out = "";
  while (s.length > 3) {
    out = "." + s.slice(-3) + out;
    s = s.slice(0, -3);
  }
  return s + out;
}

function now(): string {
  return moment().tz("Asia/Ho_Chi_Minh").format("HH:mm:ss DD/MM/YYYY");
}

function parseMoney(s: any): bigint {
  if (!s) return 0n;

  const x = String(s).toLowerCase().replace(/[^0-9kmbtr.]/g, "");
  if (!x) return 0n;

  const num = BigInt(Math.floor(parseFloat(x.replace(/[^0-9.]/g, "")) * 1000));
  let base = num / 1000n;

  if (x.endsWith("k")) base *= 1000n;
  else if (x.endsWith("m")) base *= 1000000n;
  else if (x.endsWith("b")) base *= 1000000000n;
  else if (x.endsWith("t")) base *= 1000000000000n;
  else if (x.endsWith("r")) base *= 100000n;

  return base;
}

function findColor(s: any): string | null {
  if (!s) return null;

  const t = String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");

  if (t === "random" || t === "rd") return "random";

  for (const c of COLORS) {
    if (c.key === t || c.vi.includes(t)) return c.key;
  }

  return null;
}

function labelOf(c: Color): string {
  if (c.key === "green") return "Xanh";
  if (c.key === "blue") return "Lam";
  if (c.key === "purple") return "Tím";
  if (c.key === "red") return "Đỏ";
  if (c.key === "yellow") return "Vàng";
  return "Trắng";
}

async function drawWheel(
  resultKey: string,
  wheel: string[],
  colors: Color[],
  bet: bigint
): Promise<Buffer> {
  const size = 1000;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);

  
  ctx.shadowColor = "#ff8800";
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.12, 0, Math.PI * 2);
  ctx.strokeStyle = "#ff8800";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
  ctx.lineWidth = 16;
  const outerStroke = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  outerStroke.addColorStop(0, "#cc8800");
  outerStroke.addColorStop(0.5, "#ffdd00");
  outerStroke.addColorStop(1, "#cc8800");
  ctx.strokeStyle = outerStroke;
  ctx.stroke();

  
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.03, 0, Math.PI * 2);
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#000000";
  ctx.stroke();

  
  const seg = (2 * Math.PI) / wheel.length;

  for (let i = 0; i < wheel.length; i++) {
    const c = colors.find((x) => x.key === wheel[i]);
    if (!c) continue;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, i * seg - 0.01, (i + 1) * seg + 0.01);
    ctx.closePath();

    
    ctx.fillStyle = c.hex;
    ctx.fill();

    
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(i * seg);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r, 0);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  
  for (let i = 0; i < wheel.length; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(i * seg + seg / 2);

    
    ctx.beginPath();
    ctx.arc(r * 0.75, 0, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fill();

    ctx.restore();
  }

  
  const gemRadius = r * 0.28;
  const gemGrad = ctx.createRadialGradient(
    cx - gemRadius * 0.2,
    cy - gemRadius * 0.2,
    0,
    cx,
    cy,
    gemRadius
  );
  gemGrad.addColorStop(0, "#99ff99");
  gemGrad.addColorStop(0.3, "#00ff55");
  gemGrad.addColorStop(0.7, "#00cc33");
  gemGrad.addColorStop(1, "#005511");

  ctx.beginPath();
  ctx.arc(cx, cy, gemRadius, 0, Math.PI * 2);
  ctx.fillStyle = gemGrad;
  ctx.fill();

  
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#ffdd00";
  ctx.stroke();

  
  ctx.beginPath();
  ctx.arc(
    cx - gemRadius * 0.3,
    cy - gemRadius * 0.3,
    gemRadius * 0.35,
    0,
    Math.PI * 2
  );
  const highlightGrad = ctx.createRadialGradient(
    cx - gemRadius * 0.3,
    cy - gemRadius * 0.3,
    0,
    cx - gemRadius * 0.3,
    cy - gemRadius * 0.3,
    gemRadius * 0.35
  );
  highlightGrad.addColorStop(0, "rgba(255,255,255,0.9)");
  highlightGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = highlightGrad;
  ctx.fill();

  
  ctx.save();
  ctx.translate(cx, cy - r - 20);
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(22, 28);
  ctx.lineTo(0, 16);
  ctx.lineTo(-22, 28);
  ctx.closePath();

  const arrowGrad = ctx.createLinearGradient(0, -18, 0, 28);
  arrowGrad.addColorStop(0, "#ffee66");
  arrowGrad.addColorStop(0.5, "#ffaa00");
  arrowGrad.addColorStop(1, "#cc7700");
  ctx.fillStyle = arrowGrad;
  ctx.fill();

  ctx.strokeStyle = "#884400";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  
  const idx = wheel.findIndex((k) => k === resultKey);
  const ang = idx * seg + seg / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(gemRadius + 10, 0);
  ctx.lineTo(r - 10, 0);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();

  
  ctx.shadowColor = "#000000";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#ffee66";
  ctx.font = "bold 52px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SUN RỒNG", cx, cy + r + 70);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  
  const boxY = size - 90;
  const boxWidth = 280;
  const boxHeight = 50;

  
  ctx.fillStyle = "#000000";
  ctx.fillRect(cx - boxWidth / 2 - 4, boxY - 4, boxWidth + 8, boxHeight + 8);

  
  const betBoxGrad = ctx.createLinearGradient(
    cx - boxWidth / 2,
    boxY,
    cx + boxWidth / 2,
    boxY
  );
  betBoxGrad.addColorStop(0, "#cc8800");
  betBoxGrad.addColorStop(0.5, "#ffdd00");
  betBoxGrad.addColorStop(1, "#cc8800");
  ctx.fillStyle = betBoxGrad;
  ctx.fillRect(cx - boxWidth / 2, boxY, boxWidth, boxHeight);

  
  ctx.fillStyle = "#000000";
  ctx.font = "bold 32px Arial";
  ctx.fillText(
    `$ ${bet.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
    cx,
    boxY + boxHeight / 2
  );

  return canvas.toBuffer("image/png");
}

const sunrongCommand: Command = {
  name: "sunrong",
  alias: ["sunrong"],
  version: "1.0.2",
  role: 0,
  desc: "Vòng quay Sun Rồng",
  guide:
    "{p}sun <mức_cược> <màu|random>\nMàu: xanh, lam, tím, đỏ, vàng, trắng\nPhụ: {p}sun bal | {p}sun add <tiền> | {p}sun pot | {p}sun his",
  cd: 2,
  prefix: true,

  onLoad: async function (_ctx: CommandOnLoadContext) {
    const dataDir = DATA_DIR;
    const tempDir = path.join(process.cwd(), "src/temp");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const files = ["history.json", "jackpot.json"];
    for (const f of files) {
      const p = path.join(dataDir, f);
      if (!fs.existsSync(p)) {
        await fs.writeFile(p, f === "history.json" ? "[]" : "{}");
      }
    }
  },

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { args, event, reply, userData } = ctx;

    
    const checkMoney = userData.checkMoney as ((userID: string | number) => Promise<number | bigint>) | undefined;
    const addMoney = userData.addMoney as ((userID: string | number, amount: number | bigint) => Promise<number | bigint>) | undefined;
    const delMoney = userData.delMoney as ((userID: string | number, amount: number | bigint) => Promise<number | bigint>) | undefined;

    if (!checkMoney || !addMoney || !delMoney) {
      await reply({ body: "❌ Lỗi hệ thống: Không thể truy cập dữ liệu người dùng." });
      return;
    }

    const historyPath = path.join(process.cwd(), "src/storage/game/sunrong/history.json");
    const jackpotPath = path.join(process.cwd(), "src/storage/game/sunrong/jackpot.json");
    const tempDir = path.join(process.cwd(), "src/temp");

    let his: HistoryEntry[] = [];
    let pots: Jackpots = {};

    try {
      his = JSON.parse(fs.readFileSync(historyPath, "utf8") || "[]");
    } catch {
      his = [];
    }

    try {
      pots = JSON.parse(fs.readFileSync(jackpotPath, "utf8") || "{}");
    } catch {
      pots = {};
    }

    const uid = String(event.senderID);
    const tid = String(event.threadID);

    if (!pots[tid]) {
      pots[tid] = 0;
    }

    const sub = (args[0] || "").toLowerCase();

    if (sub === "bal") {
      const balance = BigInt(await checkMoney(uid));
      await reply({ body: `💰 Số dư: ${fmtBig(balance)} đ` });
      return;
    }

    if (sub === "add") {
      const v = parseMoney(args[1]);
      if (v <= 0n) {
        await reply({ body: "❌ Số tiền không hợp lệ." });
        return;
      }
      await addMoney(uid, v);
      const balance = BigInt(await checkMoney(uid));
      await reply({ body: `✅ Đã nạp ${fmtBig(v)} đ. Số dư: ${fmtBig(balance)} đ` });
      return;
    }

    if (sub === "pot") {
      await reply({
        body: `🏆 Hũ nhóm: ${fmtBig(BigInt(Math.floor(pots[tid])))} đ`
      });
      return;
    }

    if (sub === "his") {
      const list = his
        .filter((h) => h.tid === tid)
        .slice(-10)
        .reverse();

      if (!list.length) {
        await reply({ body: "📊 Chưa có lịch sử." });
        return;
      }

      const msg =
        "📜 LỊCH SỬ 10 VÁN GẦN NHẤT\n" +
        "━".repeat(35) +
        "\n" +
        list
          .map(
            (i, idx) =>
              `${idx + 1}. ${i.user.slice(0, 10)} • ${fmtBig(BigInt(i.bet))}đ\n   ${i.pick} → ${i.result} x${i.mult} • ${i.delta > 0 ? "✅+" : "❌"}${fmtBig(BigInt(Math.abs(i.delta)))}đ\n   ⏰ ${i.time}`
          )
          .join("\n" + "─".repeat(35) + "\n");

      await reply({ body: msg });
      return;
    }

    const bet = parseMoney(args[0]);
    const colorPick = findColor(args[1]);

    if (bet < 1000n) {
      await reply({ body: "❌ Cú pháp: sun <mức_cược> <màu|random>" });
      return;
    }

    if (!colorPick) {
      await reply({
        body: "❌ Màu: xanh, lam, tím, đỏ, vàng, trắng hoặc random."
      });
      return;
    }

    const balance = BigInt(await checkMoney(uid));

    if (balance < bet) {
      await reply({ body: `❌ Thiếu tiền. Số dư: ${fmtBig(balance)} đ` });
      return;
    }

    await delMoney(uid, bet);

    const wheel: string[] = [];
    COLORS.forEach((c) => {
      for (let i = 0; i < c.weight * 4; i++) {
        wheel.push(c.key);
      }
    });

    const seed = crypto.randomBytes(8).toString("hex");
    const rng = crypto
      .createHash("sha256")
      .update(seed + Date.now().toString())
      .digest();
    const rngByte = rng[0];
    if (rngByte === undefined) {
      await reply({ body: "❌ Lỗi hệ thống." });
      return;
    }
    const idx = rngByte % wheel.length;
    const resultKey = wheel[idx];
    if (!resultKey) {
      await reply({ body: "❌ Lỗi hệ thống." });
      return;
    }
    const resultColor = COLORS.find((c) => c.key === resultKey);
    if (!resultColor) {
      await reply({ body: "❌ Lỗi hệ thống." });
      return;
    }

    let pickKey: string;
    if (colorPick === "random") {
      const randomByte = crypto.randomBytes(1)[0];
      if (randomByte === undefined) {
        await reply({ body: "❌ Lỗi hệ thống." });
        return;
      }
      const randomPick = wheel[randomByte % wheel.length];
      if (!randomPick) {
        await reply({ body: "❌ Lỗi hệ thống." });
        return;
      }
      pickKey = randomPick;
    } else {
      pickKey = colorPick;
    }
    const pickColor = COLORS.find((c) => c.key === pickKey);
    if (!pickColor) {
      await reply({ body: "❌ Lỗi hệ thống." });
      return;
    }

    let delta = 0n;
    let jackpotWin = 0n;
    const contrib = Number(bet / 100n);
    pots[tid] += contrib;

    if (resultKey === pickKey) {
      delta = bet * BigInt(resultColor.mult);
      await addMoney(uid, delta);

      const hitJP = crypto.randomBytes(2).readUInt16BE(0) % 1000 === 0;
      if (hitJP && pots[tid] > 0) {
        jackpotWin = BigInt(Math.floor(pots[tid]));
        await addMoney(uid, jackpotWin);
        pots[tid] = 0;
      }

      
      const addExp = userData.addExp as ((id: string, amount: number) => Promise<number>) | undefined;
      if (addExp) {
        const cappedBet = bet < 150000n ? bet : 150000n;
        const base = Number(cappedBet);
        const gained = Math.max(15, Math.floor(base / 30000)); 
        await addExp(uid, gained);
      }
    }

    fs.writeFileSync(jackpotPath, JSON.stringify(pots, null, 0));

    his.push({
      tid,
      uid,
      user: uid,
      bet: Number(bet),
      pick: pickKey,
      result: resultKey,
      mult: resultColor.mult,
      delta: Number(delta + jackpotWin - bet),
      seed,
      time: now(),
    });

    if (his.length > 2000) {
      his.splice(0, his.length - 2000);
    }

    fs.writeFileSync(historyPath, JSON.stringify(his, null, 0));

    const img = await drawWheel(resultKey, wheel, COLORS, bet);
    const file = path.join(tempDir, `sun_${Date.now()}.png`);
    fs.writeFileSync(file, img);

    const lines: string[] = [];

    lines.push("🐉 SUN RỒNG 🐉");
    lines.push("");
    lines.push(`⏰ ${now()}`);
    lines.push("");
    lines.push(
      `🎯 Bạn đặt: ${fmtBig(bet)} đ → ${labelOf(pickColor)}${colorPick === "random" ? " 🎲" : ""}`
    );
    lines.push(`🎰 Kết quả: ${labelOf(resultColor)} ×${resultColor.mult}`);
    lines.push("");

    if (delta > 0n) {
      lines.push(`✨ THẮNG: +${fmtBig(delta)} đ 🎉`);
    } else {
      lines.push(`💸 Thua: -${fmtBig(bet - BigInt(contrib))} đ`);
    }

    if (jackpotWin > 0n) {
      lines.push("");
      lines.push(`💥💥💥 NỔ HŨ 💥💥💥`);
      lines.push(`🏆 JACKPOT: +${fmtBig(jackpotWin)} đ 🏆`);
    }

    lines.push("");
    lines.push(`🎁 Hũ nhóm: ${fmtBig(BigInt(Math.floor(pots[tid])))} đ`);

    await reply({
      body: lines.join("\n"),
      attachment: fs.createReadStream(file),
    });
  },
};

export default sunrongCommand;
