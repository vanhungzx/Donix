"use strict";

import type { Command, CommandOnCallContext } from '@types';
import { createReadStream } from "fs";
import fs from "fs-extra";
import Jimp from "jimp";
import path from "path";
import { storagePath, TEMP_DIR } from "../../../core/storagePath";
import { clearBaucuaRoom } from "./bcua";

const CONFIG = {
  MIN_BET: 1000,
  COOLDOWN: 5,
  MULTIPLIERS: {
    1: 2,
    2: 4,
    3: 6,
  },
  TEMP_DIR: TEMP_DIR(),
  get ASSETS_DIR() { return storagePath("game", "baucua", "img"); },
} as const;

interface Animal {
  name: string;
  emoji: string;
  file: string;
}

const ANIMALS: Record<string, Animal> = {
  gà: { name: "Gà", emoji: "🐔", file: "gà.jpg" },
  tôm: { name: "Tôm", emoji: "🦐", file: "tôm.jpg" },
  bầu: { name: "Bầu", emoji: "🥒", file: "bầu.jpg" },
  cua: { name: "Cua", emoji: "🦀", file: "cua.jpg" },
  cá: { name: "Cá", emoji: "🐟", file: "cá.jpg" },
  nai: { name: "Nai", emoji: "🦌", file: "nai.jpg" },
};

async function ensureAnimalAssets(): Promise<void> {
  const assetsDir = CONFIG.ASSETS_DIR;
  await fs.ensureDir(assetsDir);

  // Tạo ảnh mặc định nếu thiếu để tránh lỗi ENOENT
  await Promise.all(
    Object.values(ANIMALS).map(async (animal) => {
      const filePath = path.join(assetsDir, animal.file);
      if (await fs.pathExists(filePath)) return;

      const img = new Jimp(300, 300, 0x222222ff);
      const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);

      img.print(
        font,
        0,
        0,
        {
          text: `${animal.emoji}\n${animal.name}`,
          alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
          alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
        },
        img.getWidth(),
        img.getHeight()
      );

      await img.writeAsync(filePath);
    })
  );
}

function parseAmount(value: string | undefined): bigint | null {
  if (!value) return null;

  if (!isNaN(Number(value))) {
    return BigInt(Math.floor(Number(value)));
  }

  const intMatch = value.match(/^\d+$/);
  if (intMatch) return BigInt(value);

  const complexMatch = value.match(/^(\d*\.?\d*)([bkmtr]*)?(\d*)$/i);
  if (!complexMatch) return null;

  let [, mainNumber, unit, decimalPart] = complexMatch;
  let numericValue = parseFloat(
    mainNumber + (decimalPart ? "." + decimalPart : "")
  );

  if (isNaN(numericValue)) return null;

  numericValue = Math.floor(numericValue * 100);
  let baseNumber = BigInt(numericValue);

  const unitMultipliers: Record<string, number> = {
    b: 1_000_000_000,
    tỷ: 1_000_000_000,
    m: 1_000_000,
    tr: 1_000_000,
    triệu: 1_000_000,
    k: 1_000,
    ngàn: 1_000,
  };

  const multiplier = unitMultipliers[unit?.toLowerCase() || ""] || 1;
  return (baseNumber * BigInt(multiplier)) / BigInt(100);
}

function formatCurrency(amount: bigint | number | null | undefined): string {
  if (amount === null || amount === undefined) return "0 VNĐ";

  const bigIntAmount = typeof amount === "bigint" ? amount : BigInt(amount);
  const strAmount = bigIntAmount.toString();

  return strAmount.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " VNĐ";
}

function calculateBetAmount(
  betInput: string,
  currentMoney: bigint
): bigint | null {
  if (!betInput) return null;

  if (/^(allin|all)$/i.test(betInput)) {
    return currentMoney;
  }

  const percentMatch = betInput.match(/^(\d+)%$/);
  if (percentMatch && percentMatch[1]) {
    const percentage = BigInt(percentMatch[1]);
    if (percentage <= 0 || percentage > 100) return null;
    return (currentMoney * percentage) / BigInt(100);
  }

  return parseAmount(betInput);
}

async function createResultImage(results: string[]): Promise<string> {
  try {
    await ensureAnimalAssets();

    const images = await Promise.all(
      results.map((animal) => {
        const animalData = ANIMALS[animal];
        if (!animalData) {
          throw new Error(`Animal ${animal} not found`);
        }
        const imagePath = path.join(CONFIG.ASSETS_DIR, animalData.file);
        return Jimp.read(imagePath);
      })
    );

    if (images.length === 0 || !images[0]) {
      throw new Error("No images loaded");
    }
    const standardWidth = images[0].getWidth();
    const standardHeight = images[0].getHeight();

    images.forEach((img) => img.resize(standardWidth, standardHeight));

    const compositeWidth = standardWidth * 3;
    const compositeImage = new Jimp(compositeWidth, standardHeight);

    images.forEach((img, index) => {
      compositeImage.composite(img, index * standardWidth, 0);
    });

    if (!fs.existsSync(CONFIG.TEMP_DIR)) {
      await fs.ensureDir(CONFIG.TEMP_DIR);
    }

    const filePath = path.join(
      CONFIG.TEMP_DIR,
      `baucua_${Date.now()}.jpg`
    );
    await compositeImage.writeAsync(filePath);

    return filePath;
  } catch (error) {
    console.error("Error creating result image:", error);
    throw new Error("Không thể tạo hình ảnh kết quả");
  }
}

interface ResultMessageParams {
  results: string[];
  chosenAnimal: string;
  betAmount: bigint;
  winnings: bigint;
  winCount: number;
  currentMoney: bigint;
}

function generateResultMessage({
  results,
  chosenAnimal,
  betAmount,
  winnings,
  winCount,
}: ResultMessageParams): string {
  const lines: string[] = [];
  const resultDisplay = results
    .map((animal) => {
      const animalData = ANIMALS[animal];
      return animalData ? `${animalData.emoji} ${animalData.name}` : "❓";
    })
    .join(" │ ");
  lines.push(`🎯 Kết quả: ${resultDisplay}`);

  const chosenAnimalData = ANIMALS[chosenAnimal];
  if (chosenAnimalData) {
    lines.push(
      `🎰 Bạn chọn: ${chosenAnimalData.emoji} ${chosenAnimalData.name}`
    );
  }
  lines.push(`💰 Tiền cược: ${formatCurrency(betAmount)}`);
  lines.push("");

  if (winnings > BigInt(0)) {
    lines.push(`🎉 CHÚC MỪNG! BẠN THẮNG! 🎉`);
    if (chosenAnimalData) {
      lines.push(`✨ Trúng ${winCount} con ${chosenAnimalData.name}`);
    }
    lines.push(`💎 Thưởng: +${formatCurrency(winnings)}`);
  } else {
    lines.push(`😢 RẤT TIẾC! BẠN THUA! 😢`);
    lines.push(`💸 Mất: -${formatCurrency(betAmount)}`);
  }

  return lines.join("\n");
}

function generateHelpMessage(): string {
  const lines: string[] = [];
  lines.push("📖 Cú pháp: baucua [con vật] [tiền cược]");
  lines.push("");

  lines.push("🐾 Các con vật:");
  Object.entries(ANIMALS).forEach(([key, animal]) => {
    lines.push(`   • ${animal.emoji} ${key} - ${animal.name}`);
  });

  lines.push("");
  lines.push("💰 Cách đặt cược:");
  lines.push("   • Số tiền: 1000, 50000, 100000...");
  lines.push("   • Đơn vị: 1k, 50k, 1tr, 2tỷ...");
  lines.push("   • Phần trăm: 50%, 25%, 10%...");
  lines.push("   • Tất cả: all, allin");

  lines.push("");
  lines.push("🎰 Tỷ lệ thưởng:");
  lines.push("   • 1 con trúng: x2 tiền cược");
  lines.push("   • 2 con trúng: x4 tiền cược");
  lines.push("   • 3 con trúng: x6 tiền cược");

  lines.push("");
  lines.push("💡 Ví dụ:");
  lines.push("   • baucua cua 1000");
  lines.push("   • baucua gà 50%");
  lines.push("   • baucua tôm all");
  lines.push("   • baucua nai 1k");

  lines.push("");
  lines.push("🎯 ═══════════════════════════════");

  return lines.join("\n");
}

const baucuaCommand: Command = {
  name: "baucua",
  alias: ["baucua", "bc"],
  version: "2.0.0",
  role: 0,
  desc: "🎲 Chơi trò chơi Bầu Cua truyền thống với giao diện hiện đại",
  guide: generateHelpMessage(),
  cd: CONFIG.COOLDOWN,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    try {
      const { client, event, args, userData } = ctx;
      const sid = event.senderID;
      const [chosenAnimal, ...betArgs] = args;
      const betInput = betArgs.join(" ");

      if (/^(clear|reset)$/i.test(chosenAnimal || "")) {
        const cleared = await clearBaucuaRoom(event.threadID);
        await client.sendMessage(
          cleared
            ? "✅ Đã xóa dữ liệu Bầu Cua của nhóm này."
            : "ℹ️ Nhóm này không có dữ liệu Bầu Cua để xóa.",
          event.threadID,
          event.messageID
        );
        return;
      }

      if (!chosenAnimal || !ANIMALS[chosenAnimal.toLowerCase()]) {
        const availableAnimals = Object.entries(ANIMALS)
          .map(([key, animal]) => `${animal.emoji} ${key}`)
          .join(", ");

        await client.sendMessage(
          `❌ Vui lòng chọn con vật hợp lệ!\n\n🐾 Các con vật có sẵn: ${availableAnimals}`,
          event.threadID,
          event.messageID
        );
        return;
      }

      if (!betInput) {
        await client.sendMessage(
          `❌ Vui lòng nhập số tiền cược!\n\n💡 Ví dụ: baucua ${chosenAnimal} 1000`,
          event.threadID,
          event.messageID
        );
        return;
      }

      const checkMoney = userData.checkMoney as ((sid: string) => Promise<bigint | number>) | undefined;
      const currentMoney = BigInt(checkMoney ? await checkMoney(sid) : 0);
      const betAmount = calculateBetAmount(betInput, currentMoney);

      if (!betAmount || betAmount <= BigInt(0)) {
        await client.sendMessage(
          "❌ Tiền cược không hợp lệ!\n\n💰 Hỗ trợ: 1000, 1k, 50%, all",
          event.threadID,
          event.messageID
        );
        return;
      }

      if (betAmount < BigInt(CONFIG.MIN_BET)) {
        await client.sendMessage(
          `❌ Tiền cược tối thiểu là ${formatCurrency(BigInt(CONFIG.MIN_BET))}`,
          event.threadID,
          event.messageID
        );
        return;
      }

      if (betAmount > currentMoney) {
        await client.sendMessage(
          `❌ Bạn không đủ tiền!\n\n💳 Số dư hiện tại: ${formatCurrency(currentMoney)}\n💸 Cần: ${formatCurrency(betAmount)}`,
          event.threadID,
          event.messageID
        );
        return;
      }

      const delMoney = userData.delMoney as ((sid: string, amount: bigint) => Promise<void>) | undefined;
      if (delMoney) await delMoney(sid, betAmount);

      const animalKeys = Object.keys(ANIMALS);
      if (animalKeys.length === 0) {
        throw new Error("No animals available");
      }
      const results: string[] = Array.from({ length: 3 }, () => {
        const index = Math.floor(Math.random() * animalKeys.length);
        const animal = animalKeys[index];
        return animal ?? animalKeys[0] ?? "";
      }).filter((animal): animal is string => animal !== "");

      const winCount = results.filter(
        (animal) => animal === chosenAnimal.toLowerCase()
      ).length;

      const winnings =
        winCount > 0
          ? betAmount * BigInt(CONFIG.MULTIPLIERS[winCount as keyof typeof CONFIG.MULTIPLIERS])
          : BigInt(0);

      if (winnings > BigInt(0)) {
        const addMoney = userData.addMoney as ((sid: string, amount: bigint) => Promise<void>) | undefined;
        if (addMoney) await addMoney(sid, winnings);

        
        const addExp = userData.addExp as ((sid: string, amount: number) => Promise<number>) | undefined;
        if (addExp) {
          const cappedBet = betAmount < 100000n ? betAmount : 100000n;
          const base = Number(cappedBet);
          const gained = Math.max(10, Math.floor(base / 20000)); 
          await addExp(sid, gained);
        }
      }

      const imagePath = await createResultImage(results);

      const resultMessage = generateResultMessage({
        results,
        chosenAnimal: chosenAnimal.toLowerCase(),
        betAmount,
        winnings,
        winCount,
        currentMoney: currentMoney,
      });

      await client.sendMessage(
        {
          body: resultMessage,
          attachment: createReadStream(imagePath),
        },
        event.threadID,
        event.messageID
      );
    } catch (error: any) {
      console.error("Bầu Cua Error:", error);
      const { client, event } = ctx;
      client.sendMessage(
        "❌ Đã xảy ra lỗi khi chơi game. Vui lòng thử lại sau!",
        event.threadID,
        event.messageID
      );
    }
  },
};

export default baucuaCommand;
