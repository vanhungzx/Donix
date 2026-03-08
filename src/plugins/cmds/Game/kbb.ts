"use strict";

import type { Command, CommandOnCallContext } from '@types';
import crypto from "crypto";
import fs from "fs-extra";
import Jimp from "jimp";
import path from "path";
import { fileURLToPath } from "url";
import { storagePath } from "../../../core/storagePath";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const gameAssetsDir = storagePath("game", "kbb");

const getImagePath = (filename: string): string => path.join(gameAssetsDir, filename);

const toBI = (v: any): bigint => typeof v === "bigint" ? v : BigInt(String(v || 0));

const formatCurrency = (amount: bigint | number | string): string => {
  const v = toBI(amount);
  const s = v < 0n ? "-" + (-v).toString() : v.toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " VNĐ";
};

const generateSecureRandom = (seed: string | null = null): number => {
  const timestamp = Date.now().toString();
  const randomBytes = crypto.randomBytes(16).toString("hex");
  const input = seed ? `${seed}-${timestamp}-${randomBytes}` : `${timestamp}-${randomBytes}`;
  const hash = crypto.createHash("sha256").update(input).digest("hex");
  return parseInt(hash.substring(0, 8), 16) % 3;
};

async function combineImages(images: (string | null)[]): Promise<string | null> {
  try {
    const valid = images.filter((p): p is string => p !== null && p !== undefined && fs.existsSync(p));
    if (!valid.length) return null;

    const ims = await Promise.all(valid.map((p) => Jimp.read(p)));
    const totalW = ims.reduce((a, i) => a + i.getWidth(), 0);
    const maxH = Math.max(...ims.map((i) => i.getHeight()));
    const out = new Jimp(totalW, maxH, 0x00000000);

    let x = 0;
    for (const img of ims) {
      const y = Math.floor((maxH - img.getHeight()) / 2);
      out.composite(img, x, y);
      x += img.getWidth();
    }

    const tempDir = path.join(process.cwd(), "src/temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const tempPath = path.join(
      tempDir,
      `kbb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.png`
    );
    await out.writeAsync(tempPath);
    return tempPath;
  } catch {
    return null;
  }
}

interface KBBStats {
  totalGames: number;
  totalWins: number;
  totalLoses: number;
  totalDraws: number;
  winStreak: number;
  maxWinStreak: number;
  totalEarned: number;
  totalLost: number;
  lastPlayTime: number;
}

const checkAchievements = (s: KBBStats): string[] => {
  const a: string[] = [];
  if (s.totalGames >= 10) a.push("🎮 Người chơi tích cực");
  if (s.totalWins >= 50) a.push("🏆 Cao thủ KBB");
  if (s.winStreak >= 5) a.push("🔥 Chuỗi thắng ấn tượng");
  if (s.maxWinStreak >= 10) a.push("⚡ Bất khả chiến bại");
  if (s.totalEarned >= 100000) a.push("💰 Triệu phú nhỏ");
  return a;
};

interface MultiplierParts {
  num: number;
  den: number;
  asNumber: number;
}

const calcMultiplierParts = (winStreak: number, isDouble: boolean): MultiplierParts => {
  const base = isDouble ? 4 : 2;
  const bonusPct = Math.min(winStreak * 5, 50);
  return {
    num: base * (100 + bonusPct),
    den: 100,
    asNumber: base * (1 + bonusPct / 100),
  };
};

const getMaxBet = (moneyBI: bigint | number | string): bigint => (toBI(moneyBI) * 80n) / 100n;

interface ValidateBetResult {
  ok: boolean;
  msg?: string;
}

const validateBet = (betBI: bigint | number | string, moneyBI: bigint | number | string): ValidateBetResult => {
  const bet = toBI(betBI);
  const bal = toBI(moneyBI);
  if (bet < 1000n) return { ok: false, msg: "Số tiền cược tối thiểu là 1,000 VNĐ!" };
  if (bet > bal) return { ok: false, msg: "Bạn không đủ tiền để cược!" };
  const maxBet = getMaxBet(bal);
  if (bet > maxBet) return { ok: false, msg: `Số tiền cược quá lớn. Tối đa: ${formatCurrency(maxBet)}.` };
  return { ok: true };
};

function parseAmount(input: string | undefined, userMoneyBI: bigint | number | string): bigint | null {
  if (!input) return null;
  const s = String(input).trim().toLowerCase().normalize("NFC");
  if (["all", "allin", "max"].includes(s)) return getMaxBet(userMoneyBI);

  const percentMatch = s.match(/^([0-9]+)%$/);
  if (percentMatch && percentMatch[1]) {
    const p = BigInt(parseInt(percentMatch[1]));
    if (p > 100n) return null;
    return (toBI(userMoneyBI) * p) / 100n;
  }

  const m = s.match(/^(\d*\.?\d+)\s*(k|m|tr|b|ngàn|ngan|nghìn|nghin|triệu|trieu|tỷ|ty|tỉ)?$/iu);
  if (!m || !m[1]) return null;

  const num = Math.floor(parseFloat(m[1]));
  if (!isFinite(num) || num <= 0) return null;

  const base = BigInt(num);
  const u = (m[2] || "").toLowerCase();

  switch (u) {
    case "b":
    case "tỷ":
    case "ty":
    case "tỉ":
      return base * 1000000000n;
    case "m":
    case "tr":
    case "triệu":
    case "trieu":
      return base * 1000000n;
    case "k":
    case "ngàn":
    case "ngan":
    case "nghìn":
    case "nghin":
      return base * 1000n;
    default:
      return base;
  }
}

const kbbCommand: Command = {
  name: "kbb",
  alias: ["kbb", "rockpaperscissors"],
  version: "2.0.2",
  role: 0,
  desc: "Game kéo búa bao công bằng với hệ thống chống gian lận và achievement",
  guide: `🎮 HƯỚNG DẪN
{pn} [kéo/búa/bao] [số tiền] [--double]
Ví dụ: {pn} kéo 5000 | {pn} búa 10000 --double | {pn} bao all
Kéo > Bao, Búa > Kéo, Bao > Búa
Thưởng: thường x2, gấp đôi x4, bonus +5% mỗi trận thắng (tối đa +50%)`,
  cd: 2,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { reply, event, args, userData } = ctx;
    const { senderID } = event;
    const addMoney = userData.addMoney as ((uid: string, amount: bigint) => Promise<void>) | undefined;
    const delMoney = userData.delMoney as ((uid: string, amount: bigint) => Promise<void>) | undefined;
    const get = userData.get as ((uid: string) => Promise<any>) | undefined;
    const getName = userData.getName as ((uid: string) => Promise<string | null | undefined>) | undefined;
    const update = userData.update as ((uid: string, data: any) => Promise<any>) | undefined;
    const addExp = userData.addExp as ((uid: string, amount: number) => Promise<number>) | undefined;

    const choices = ["kéo", "búa", "bao"];
    const imageMapping = {
      user: [
        getImagePath("keo_user.png"),
        getImagePath("bua_user.png"),
        getImagePath("bao_user.png"),
      ],
      bot: [
        getImagePath("keo_bot.png"),
        getImagePath("bua_bot.png"),
        getImagePath("bao_bot.png"),
      ],
      result: {
        win: getImagePath("win.png"),
        lose: getImagePath("lose.png"),
        draw: getImagePath("draw.png"),
      },
    };

    const userChoice = args[0]?.toLowerCase();
    if (!userChoice || !choices.includes(userChoice)) {
      await reply("❌ Vui lòng chọn: kéo, búa hoặc bao!\n💡 Ví dụ: kbb kéo 5000");
      return;
    }

    if (!get) {
      await reply("❌ Lỗi: Không thể truy cập dữ liệu người dùng!");
      return;
    }

    const userDat = await get(senderID);
    const bal = toBI(userDat?.money || 0);
    if (bal <= 0n) {
      await reply("❌ Bạn không có tiền để chơi!");
      return;
    }

    const betRaw = String(args[1] || "").trim().toLowerCase();
    const betAmount = parseAmount(betRaw, bal);
    if (!betAmount || betAmount <= 0n) {
      await reply("❌ Số tiền cược không hợp lệ!");
      return;
    }

    const v = validateBet(betAmount, bal);
    if (!v.ok) {
      await reply(`❌ ${v.msg}`);
      return;
    }

    const isDouble = args.includes("--double");

    const s0 = (userDat?.data?.kbb as KBBStats | undefined) || {
      totalGames: 0,
      totalWins: 0,
      totalLoses: 0,
      totalDraws: 0,
      winStreak: 0,
      maxWinStreak: 0,
      totalEarned: 0,
      totalLost: 0,
      lastPlayTime: 0,
    };

    const stats: KBBStats = {
      totalGames: Number(s0.totalGames || 0),
      totalWins: Number(s0.totalWins || 0),
      totalLoses: Number(s0.totalLoses || 0),
      totalDraws: Number(s0.totalDraws || 0),
      winStreak: Number(s0.winStreak || 0),
      maxWinStreak: Number(s0.maxWinStreak || 0),
      totalEarned: Number(s0.totalEarned || 0),
      totalLost: Number(s0.totalLost || 0),
      lastPlayTime: Number(s0.lastPlayTime || 0),
    };

    const botChoiceIndex = generateSecureRandom(String(senderID) + Date.now());
    const botChoice = choices[botChoiceIndex];
    if (!botChoice) {
      await reply("❌ Lỗi hệ thống: Không thể xác định lựa chọn của bot!");
      return;
    }
    const userChoiceIndex = choices.indexOf(userChoice);

    let result: "win" | "lose" | "draw";
    if (userChoice === botChoice) {
      result = "draw";
    } else if (
      (userChoice === "kéo" && botChoice === "bao") ||
      (userChoice === "búa" && botChoice === "kéo") ||
      (userChoice === "bao" && botChoice === "búa")
    ) {
      result = "win";
    } else {
      result = "lose";
    }

    let delta = 0n;
    const ns: KBBStats = { ...stats };
    ns.totalGames += 1;
    ns.lastPlayTime = Date.now();

    if (result === "win") {
      const { num, den } = calcMultiplierParts(stats.winStreak, isDouble);
      const gross = (betAmount * BigInt(num)) / BigInt(den);
      delta = gross - betAmount;
      if (addMoney) await addMoney(senderID, delta);
      ns.totalWins += 1;
      ns.winStreak += 1;
      ns.maxWinStreak = Math.max(ns.maxWinStreak, ns.winStreak);
      ns.totalEarned += Number(delta);

      
      if (addExp) {
        const cappedBet = betAmount < 50000n ? betAmount : 50000n;
        const base = Number(cappedBet);
        const gained = Math.max(8, Math.floor(base / 10000)); 
        await addExp(senderID, gained);
      }
    } else if (result === "lose") {
      delta = -betAmount;
      if (delMoney) await delMoney(senderID, betAmount);
      ns.totalLoses += 1;
      ns.winStreak = 0;
      ns.totalLost += Number(betAmount);
    } else {
      ns.totalDraws += 1;
    }

    if (update) await update(senderID, { data: { kbb: ns } });

    const updated = await get(senderID);
    const newBalance = toBI(updated?.money || 0);

    const userName = getName ? await getName(senderID) : null;
    const achievements = checkAchievements(ns);
    const achievementText = achievements.length ? `\n🏆 ${achievements.join(", ")}` : "";

    const multDisp =
      result === "win" ? `(x${calcMultiplierParts(stats.winStreak, isDouble).asNumber.toFixed(2)})` : "";

    const resultEmojis: Record<"win" | "lose" | "draw", string> = {
      win: "🎉 THẮNG",
      lose: "😢 THUA",
      draw: "🤝 HÒA",
    };

    const msg = `👤 Người chơi: ${userName}
⚔️ Chế độ: ${isDouble ? "Gấp đôi 💥" : "Thường ⭐"}
🔥 Chuỗi thắng: ${ns.winStreak} trận
🎯 KẾT QUẢ: ${resultEmojis[result]} ${multDisp}
✂️ Bạn chọn: ${userChoice.toUpperCase()}
🤖 Bot chọn: ${botChoice.toUpperCase()}
💰 Tiền cược: ${formatCurrency(betAmount)}
${result === "win"
        ? `💸 Thắng được: +${formatCurrency(delta)}`
        : result === "lose"
          ? `💔 Mất tiền: ${formatCurrency(betAmount)}`
          : `🤝 Hoà: Không mất tiền`
      }
💵 Số dư hiện tại: ${formatCurrency(newBalance)}${achievementText}`;

    const imgs = [
      imageMapping.user[userChoiceIndex] || null,
      imageMapping.result[result] || null,
      imageMapping.bot[botChoiceIndex] || null,
    ];
    const imgPath = await combineImages(imgs);

    const ro: { body: string; attachment?: any } = { body: msg };
    if (imgPath && fs.existsSync(imgPath)) {
      ro.attachment = fs.createReadStream(imgPath);
    }

    await reply(ro);

    if (imgPath) {
      setTimeout(() => {
        fs.unlink(imgPath, () => { });
      }, 10000);
    }
  },
};

export default kbbCommand;
