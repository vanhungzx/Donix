const toBI = (value: unknown): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return 0n;
    try {
      return BigInt(raw);
    } catch {
      return 0n;
    }
  }
  if (value == null) return 0n;
  try {
    return BigInt(value as bigint | number | string);
  } catch {
    return 0n;
  }
};

const formatNumber = (num: number | bigint): string =>
  num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export default {
  name: "daily",
  alias: ["checkin"],
  version: "2.1.0",
  role: 0,
  desc: "Diem danh hang ngay va nhan phan thuong",
  guide:
    "{pn} -> Diem danh hang ngay\n" +
    "Sang: x1.2 | Chieu: x1.0 | Toi: x0.8 | Dem: x0.6\n" +
    "Chuoi ngay lien tiep | Milestone: 7,30,100,365,1000 ngay",
  cd: 5,
  prefix: true,
  onCall: async ({ event, userData: uD, reply }: any) => {
    try {
      const id = event.senderID;
      const u = await uD.get(id);
      const now = new Date();
      const today = getDateOnly(now);

      const dailyData = u?.data?.daily || {};
      const lastCheckin = dailyData.lastCheckin ? new Date(dailyData.lastCheckin) : null;
      const lastDate = lastCheckin ? getDateOnly(lastCheckin) : null;

      if (lastDate && lastDate.getTime() === today.getTime()) {
        const nextReset = new Date((lastCheckin?.getTime() || 0) + 24 * 60 * 60 * 1000);
        const timeLeft = nextReset.getTime() - now.getTime();
        const hours = Math.floor(timeLeft / 3600000);
        const minutes = Math.floor((timeLeft % 3600000) / 60000);
        return reply(`Ban da diem danh hom nay, vui long cho ${hours} gio ${minutes} phut.`);
      }

      const streak = calculateStreak(lastDate, today, dailyData);
      const reward = calculateReward(now, streak, u?.vip || 0);
      const milestone = checkMilestone(streak.current);

      await updateDailyData(uD, id, now, streak, reward.total + milestone.reward);

      const newBalance = typeof uD.checkMoney === "function"
        ? toBI(await uD.checkMoney(id))
        : toBI(u?.money) + toBI(reward.total + milestone.reward);

      const response = formatResponse(reward, streak, milestone, newBalance);
      return reply(response);
    } catch (error) {
      console.error("Daily reward error:", error);
      return reply("Co loi xay ra khi diem danh.");
    }
  }
};

function getDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

interface DailyRawData {
  currentStreak?: number;
  maxStreak?: number;
  totalCheckins?: number;
  totalRewards?: number;
  lastCheckin?: string;
}

interface Streak {
  current: number;
  max: number;
  broken: boolean;
}

function calculateStreak(lastDate: Date | null, today: Date, dailyData: DailyRawData): Streak {
  const currentStreak = dailyData.currentStreak || 0;
  const maxStreak = dailyData.maxStreak || 0;

  let newStreak = 1;
  let streakBroken = false;

  if (lastDate) {
    const daysDiff = Math.floor((today.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000));

    if (daysDiff === 1) {
      newStreak = currentStreak + 1;
    } else if (daysDiff > 1) {
      streakBroken = currentStreak > 0;
      newStreak = 1;
    }
  }

  return {
    current: newStreak,
    max: Math.max(maxStreak, newStreak),
    broken: streakBroken
  };
}

interface Reward {
  base: number;
  time: number;
  streak: number;
  vip: number;
  random: number;
  total: number;
  timeEmoji: string;
}

function calculateReward(now: Date, streak: Streak, vipLevel: number): Reward {
  const hour = now.getHours();
  const baseReward = 15000;
  let timeMultiplier = 1;
  let timeEmoji = "🌆";

  if (hour >= 6 && hour < 12) {
    timeMultiplier = 1.2;
    timeEmoji = "🌅";
  } else if (hour >= 12 && hour < 18) {
    timeMultiplier = 1.0;
    timeEmoji = "🌆";
  } else if (hour >= 18 && hour < 24) {
    timeMultiplier = 0.8;
    timeEmoji = "🌃";
  } else {
    timeMultiplier = 0.6;
    timeEmoji = "🌙";
  }

  const randomBonus = 1 + (Math.random() * 0.4 + 0.1);
  const streakBonus = Math.min(streak.current * 0.05, 1.0);
  const vipBonus = vipLevel * 0.1;

  const finalMultiplier = timeMultiplier * randomBonus * (1 + streakBonus + vipBonus);
  const totalReward = Math.floor(baseReward * finalMultiplier);

  return {
    base: baseReward,
    time: Math.floor(baseReward * (timeMultiplier - 1)),
    streak: Math.floor(baseReward * streakBonus),
    vip: Math.floor(baseReward * vipBonus),
    random: Math.floor(baseReward * (randomBonus - 1)),
    total: totalReward,
    timeEmoji
  };
}

interface Milestone {
  achieved: boolean;
  reward: number;
  title?: string;
  emoji?: string;
}

function checkMilestone(streak: number): Milestone {
  const milestones: Record<number, { reward: number; title: string; emoji: string }> = {
    7: { reward: 50000, title: "Tuan dau", emoji: "🎯" },
    30: { reward: 200000, title: "Thang dau", emoji: "🏆" },
    100: { reward: 1000000, title: "Bach nhat", emoji: "💎" },
    365: { reward: 5000000, title: "Nhat nien", emoji: "👑" },
    1000: { reward: 20000000, title: "Thien nhat", emoji: "🌟" }
  };

  if (milestones[streak]) {
    return { achieved: true, ...milestones[streak] };
  }

  return { achieved: false, reward: 0 };
}

async function updateDailyData(
  uD: any,
  id: string,
  now: Date,
  streak: Streak,
  totalReward: number
): Promise<void> {
  const userData = await uD.get(id);
  const dailyDataPrev: DailyRawData = userData?.data?.daily || {};
  const dailyData = {
    lastCheckin: now.toISOString(),
    currentStreak: streak.current,
    maxStreak: streak.max,
    totalCheckins: (Number(dailyDataPrev.totalCheckins || 0) || 0) + 1,
    totalRewards: (Number(dailyDataPrev.totalRewards || 0) || 0) + totalReward
  };

  await uD.update(id, { data: { daily: dailyData } });
  await uD.addMoney(id, totalReward);
}

function formatResponse(reward: Reward, streak: Streak, milestone: Milestone, newBalance: bigint): string {
  let response = `${reward.timeEmoji} DIEM DANH THANH CONG!\n\n`;
  response += `Thưởng co ban: ${formatNumber(reward.base)} VND\n`;

  if (reward.time !== 0) {
    const sign = reward.time > 0 ? "+" : "";
    response += `Thuong gio vang: ${sign}${formatNumber(reward.time)} VND\n`;
  }

  if (reward.streak > 0) {
    response += `Thuong chuoi (${streak.current} ngay): +${formatNumber(reward.streak)} VND\n`;
  }

  if (reward.vip > 0) {
    response += `Thuong VIP: +${formatNumber(reward.vip)} VND\n`;
  }

  if (reward.random > 0) {
    response += `Thuong may man: +${formatNumber(reward.random)} VND\n`;
  }

  if (milestone.achieved) {
    response += `\n${milestone.emoji} MILESTONE: ${milestone.title}!\n`;
    response += `Thuong dac biet: +${formatNumber(milestone.reward)} VND\n`;
  }

  response += `\nTong nhan: ${formatNumber(reward.total + milestone.reward)} VND\n`;
  response += `So du moi: ${formatNumber(newBalance)} VND\n`;
  response += `\nChuoi hien tai: ${streak.current} ngay`;

  if (streak.max > streak.current) {
    response += ` (Ky luc: ${streak.max} ngay)`;
  }

  if (streak.broken) {
    response += `\nChuoi da bi dut. Hay duy tri diem danh moi ngay.`;
  }

  const nextMilestones = [7, 30, 100, 365, 1000];
  const nextMilestone = nextMilestones.find((m) => m > streak.current);
  if (nextMilestone) {
    response += `\nMilestone tiep theo: ${nextMilestone} ngay (con ${nextMilestone - streak.current} ngay)`;
  }

  return response;
}
