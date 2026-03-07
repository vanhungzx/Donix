"use strict";

import type { Command, CommandOnCallContext } from '@types';

interface MiningEquipment {
  pickaxe: number;
  processor: number;
  cooling: number;
}

interface MiningData {
  level: number;
  totalMined: number;
  lastMining: number;
  lastDailyBonus: number;
  miningCount: number;
  luckyCount: number;
  equipment: MiningEquipment;
}

interface MiningConfig {
  baseReward: number;
  cooldown: number;
  levelMultiplier: number;
  maxLevel: number;
  upgradeBaseCost: number;
  upgradeCostMultiplier: number;
  dailyBonusMultiplier: number;
  luckyChance: number;
  ultraLuckyChance: number;
}

interface RewardResult {
  amount: number;
  multiplier: number;
  luckyType: string;
}

interface UserDataWithMining {
  data: {
    mining?: MiningData;
  };
  [key: string]: any;
}

const MINING_CONFIG: MiningConfig = {
  baseReward: 0.001,
  cooldown: 3600000,
  levelMultiplier: 0.1,
  maxLevel: 50,
  upgradeBaseCost: 0.01,
  upgradeCostMultiplier: 1.5,
  dailyBonusMultiplier: 2,
  luckyChance: 0.05,
  ultraLuckyChance: 0.01,
};

async function initMiningUser(
  userID: string,
  userData: any
): Promise<MiningData> {
  const user = (await userData.get(userID)) as UserDataWithMining;
  if (!user.data) {
    user.data = {};
  }
  if (!user.data.mining) {
    user.data.mining = {
      level: 1,
      totalMined: 0,
      lastMining: 0,
      lastDailyBonus: 0,
      miningCount: 0,
      luckyCount: 0,
      equipment: {
        pickaxe: 1,
        processor: 1,
        cooling: 1,
      },
    };
    await userData.set(userID, user);
  }
  return user.data.mining;
}

function calculateReward(miningData: MiningData): RewardResult {
  let baseReward = MINING_CONFIG.baseReward;

  baseReward *=
    1 + (miningData.level - 1) * MINING_CONFIG.levelMultiplier;
  baseReward *= 1 + (miningData.equipment.pickaxe - 1) * 0.2;
  baseReward *= 1 + (miningData.equipment.processor - 1) * 0.15;
  baseReward *= 1 + (miningData.equipment.cooling - 1) * 0.1;

  const randomFactor = 0.7 + Math.random() * 0.6;
  baseReward *= randomFactor;

  const rand = Math.random();

  let multiplier = 1;
  let luckyType = "";

  if (rand < MINING_CONFIG.ultraLuckyChance) {
    multiplier = 5;
    luckyType = "ULTRA LUCKY! 🌟";
  } else if (rand < MINING_CONFIG.luckyChance) {
    multiplier = 2;
    luckyType = "LUCKY! ⭐";
  }

  return {
    amount: baseReward * multiplier,
    multiplier,
    luckyType,
  };
}

function getUpgradeCost(currentLevel: number): number {
  return (
    MINING_CONFIG.upgradeBaseCost *
    Math.pow(MINING_CONFIG.upgradeCostMultiplier, currentLevel - 1)
  );
}

function formatNumber(num: number): string {
  if (num >= 1) {
    return num.toFixed(6);
  }
  return num.toFixed(8);
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

async function updateMiningData(
  userID: string,
  miningData: MiningData,
  userData: any
): Promise<void> {
  const user = (await userData.get(userID)) as UserDataWithMining;
  user.data.mining = miningData;
  await userData.set(userID, user);
}

const miningCommand: Command = {
  name: "mining",
  alias: ["mining"],
  version: "2.0.0",
  role: 0,
  desc: "Đào coin kiếm tiền",
  guide:
    "{pn} mining → Bắt đầu đào coin\n{pn} mining info → Xem thông tin\n{pn} mining upgrade <equipment> → Nâng cấp thiết bị\n{pn} mining daily → Nhận thưởng hàng ngày\n{pn} mining top → Xem bảng xếp hạng\n\nKhi đào coin / nhận thưởng, bạn sẽ được cộng EXP để lên rank (lệnh rank).",
  cd: 3,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    try {
      const { client, event, args, userData } = ctx;
      const userID = event.senderID;
      const command = args[0]?.toLowerCase();
      const now = Date.now();

      const miningData = await initMiningUser(userID, userData);
      const checkMoneyFn = userData.checkMoney as ((id: string) => Promise<bigint | number>) | undefined;
      const currentBalance = BigInt(checkMoneyFn ? await checkMoneyFn(userID) : 0);

      if (command === "info" || command === "profile") {
        const nextMining = miningData.lastMining + MINING_CONFIG.cooldown - now;
        const nextDaily = miningData.lastDailyBonus + 86400000 - now; 

        let infoMsg = `⛏️ THÔNG TIN MINING\n\n`;
        infoMsg += `💰 Số dư: ${formatNumber(Number(currentBalance))} coins\n`;
        infoMsg += `📊 Level: ${miningData.level}/${MINING_CONFIG.maxLevel}\n`;
        infoMsg += `⚡ Tổng đã đào: ${formatNumber(miningData.totalMined)} coins\n`;
        infoMsg += `🔄 Số lần đào: ${miningData.miningCount}\n`;
        infoMsg += `⭐ Lần may mắn: ${miningData.luckyCount}\n\n`;
        infoMsg += `🛠️ THIẾT BỊ:\n`;
        infoMsg += `⛏️ Cúp đào: Level ${miningData.equipment.pickaxe}\n`;
        infoMsg += `💻 Bộ xử lý: Level ${miningData.equipment.processor}\n`;
        infoMsg += `❄️ Làm mát: Level ${miningData.equipment.cooling}\n\n`;

        if (nextMining > 0) {
          infoMsg += `⏰ Đào tiếp theo: ${formatTime(Math.ceil(nextMining / 1000))}\n`;
        } else {
          infoMsg += `✅ Có thể đào ngay!\n`;
        }

        if (nextDaily > 0) {
          infoMsg += `🎁 Thưởng hàng ngày: ${formatTime(Math.ceil(nextDaily / 1000))}`;
        } else {
          infoMsg += `🎁 Có thể nhận thưởng hàng ngày!`;
        }

        await client.sendMessage(infoMsg, event.threadID, event.messageID);
        return;
      }

      if (command === "daily" || command === "bonus") {
        const lastDaily = miningData.lastDailyBonus;
        const daysPassed = Math.floor((now - lastDaily) / 86400000);

        if (daysPassed < 1) {
          const nextDaily = lastDaily + 86400000 - now;
          await client.sendMessage(
            `⏰ Bạn đã nhận thưởng hôm nay!\nThưởng tiếp theo: ${formatTime(Math.ceil(nextDaily / 1000))}`,
            event.threadID,
            event.messageID
          );
          return;
        }

        const dailyReward = BigInt(
          Math.floor(
            MINING_CONFIG.baseReward *
            MINING_CONFIG.dailyBonusMultiplier *
            miningData.level *
            1000000
          )
        );

        const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (addMoney) {
          await addMoney(userID, dailyReward);
        }

        
        const addExpFn = userData.addExp as ((id: string, amount: number) => Promise<number>) | undefined;
        if (addExpFn) {
          
          await addExpFn(userID, 50);
        }

        miningData.lastDailyBonus = now;
        await updateMiningData(userID, miningData, userData);

        const checkMoneyFn2 = userData.checkMoney as ((id: string) => Promise<bigint | number>) | undefined;
        const balance = checkMoneyFn2 ? await checkMoneyFn2(userID) : 0;
        await client.sendMessage(
          `🎁 Nhận thưởng hàng ngày thành công!\n` +
          `💰 +${dailyReward} coins\n` +
          (addExpFn ? "⭐ +50 EXP\n" : "") +
          `💳 Số dư: ${balance} coins`,
          event.threadID,
          event.messageID
        );
        return;
      }

      if (command === "upgrade" || command === "up") {
        const equipment = args[1]?.toLowerCase();
        const validEquipment: Array<keyof MiningEquipment> = [
          "pickaxe",
          "processor",
          "cooling",
        ];

        if (!equipment || !validEquipment.includes(equipment as keyof MiningEquipment)) {
          await client.sendMessage(
            `🛠️ NÂNG CẤP THIẾT BỊ\n\n⛏️ pickaxe - Cúp đào (+20% thu nhập)\n💻 processor - Bộ xử lý (+15% thu nhập)\n❄️ cooling - Làm mát (+10% thu nhập)\n\nSử dụng: ${event.body?.split(" ")[0] || "mining"} upgrade <thiết bị>`,
            event.threadID,
            event.messageID
          );
          return;
        }

        const currentLevel = miningData.equipment[equipment as keyof MiningEquipment];
        if (currentLevel >= 20) {
          await client.sendMessage(
            "⚠️ Thiết bị đã đạt level tối đa (20)!",
            event.threadID,
            event.messageID
          );
          return;
        }

        const cost = BigInt(
          Math.floor(getUpgradeCost(currentLevel) * 1000000)
        );

        if (currentBalance < cost) {
          await client.sendMessage(
            `❌ Không đủ tiền!\nCần: ${cost} coins\nHiện có: ${currentBalance} coins`,
            event.threadID,
            event.messageID
          );
          return;
        }

        const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (delMoney) {
          await delMoney(userID, cost);
        }

        miningData.equipment[equipment as keyof MiningEquipment]++;

        await updateMiningData(userID, miningData, userData);

        const equipmentNames: Record<string, string> = {
          pickaxe: "Cúp đào ⛏️",
          processor: "Bộ xử lý 💻",
          cooling: "Làm mát ❄️",
        };

        const checkMoneyFn3 = userData.checkMoney as ((id: string) => Promise<bigint | number>) | undefined;
        const balance = checkMoneyFn3 ? await checkMoneyFn3(userID) : 0;
        await client.sendMessage(
          `✅ Nâng cấp thành công!\n🛠️ ${equipmentNames[equipment]} → Level ${miningData.equipment[equipment as keyof MiningEquipment]}\n💰 -${cost} coins\n💳 Số dư: ${balance} coins`,
          event.threadID,
          event.messageID
        );
        return;
      }

      if (command === "top" || command === "rank") {
        const allUsersData = await userData.getAll("data");
        const allUsers = (allUsersData as unknown) as Record<
          string,
          UserDataWithMining
        >;

        const topUsers = Object.entries(allUsers)
          .filter(
            ([, data]) => data.data?.mining && data.data.mining.totalMined > 0
          )
          .sort(
            (a, b) =>
              (b[1].data?.mining?.totalMined || 0) -
              (a[1].data?.mining?.totalMined || 0)
          )
          .slice(0, 10);

        let topMsg = `🏆 TOP THỢ MỎ\n\n`;

        for (let i = 0; i < topUsers.length; i++) {
          const userEntry = topUsers[i];
          if (!userEntry) continue;
          const [, data] = userEntry;
          const rank = i + 1;
          const emoji =
            rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`;

          const mining = data.data?.mining;
          if (mining) {
            topMsg += `${emoji} Level ${mining.level} - ${formatNumber(mining.totalMined)} coins\n`;
          }
        }

        const userRank =
          Object.entries(allUsers)
            .filter(
              ([, data]) =>
                data.data?.mining && data.data.mining.totalMined > 0
            )
            .sort(
              (a, b) =>
                (b[1].data?.mining?.totalMined || 0) -
                (a[1].data?.mining?.totalMined || 0)
            )
            .findIndex(([uid]) => uid === userID) + 1;

        if (userRank > 10 && userRank > 0) {
          topMsg += `\n📍 Bạn đang ở vị trí #${userRank}`;
        }

        await client.sendMessage(topMsg, event.threadID, event.messageID);
        return;
      }

      const timeSinceLastMining = now - miningData.lastMining;

      if (timeSinceLastMining < MINING_CONFIG.cooldown) {
        const remainingTime = MINING_CONFIG.cooldown - timeSinceLastMining;
        await client.sendMessage(
          `⏰ Còn phải chờ ${formatTime(Math.ceil(remainingTime / 1000))} nữa mới có thể đào tiếp!`,
          event.threadID,
          event.messageID
        );
        return;
      }

      const reward = calculateReward(miningData);
      const coinReward = BigInt(Math.floor(reward.amount * 1000000));

      const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
      if (addMoney) {
        await addMoney(userID, coinReward);
      }

      miningData.totalMined += reward.amount;
      miningData.lastMining = now;
      miningData.miningCount++;

      if (reward.luckyType) {
        miningData.luckyCount++;
      }

      const expRequired = miningData.level * 10;

      if (
        miningData.miningCount >= expRequired &&
        miningData.level < MINING_CONFIG.maxLevel
      ) {
        miningData.level++;
        miningData.miningCount = 0;
      }

      await updateMiningData(userID, miningData, userData);

      let miningMsg = `⛏️ ĐÀO THÀNH CÔNG!\n\n`;
      miningMsg += `💰 +${coinReward} coins`;

      if (reward.luckyType) {
        miningMsg += `\n🎉 ${reward.luckyType} (x${reward.multiplier})`;
      }

      const checkMoneyFn4 = userData.checkMoney as ((id: string) => Promise<bigint | number>) | undefined;
      const balance = checkMoneyFn4 ? await checkMoneyFn4(userID) : 0;
      miningMsg += `\n💳 Số dư: ${balance} coins`;
      miningMsg += `\n📊 Level: ${miningData.level}`;
      miningMsg += `\n⏰ Đào tiếp theo: 1 giờ`;

      await client.sendMessage(miningMsg, event.threadID, event.messageID);
    } catch (e: any) {
      console.log("Lỗi mining command:", e);
      const { client, event } = ctx;
      await client.sendMessage(
        "❌ Đã xảy ra lỗi khi đào coin!",
        event.threadID,
        event.messageID
      );
    }
  },
};

export default miningCommand;
