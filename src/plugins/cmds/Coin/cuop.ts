import type { Command, CommandOnCallContext } from "@types";

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

const formatCurrency = (amount: bigint | number | string | null | undefined): string => {
  if (amount === null || amount === undefined) return "0 VND";
  return `${toBI(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} VND`;
};

const calcPercent = (amount: bigint, percent: number): bigint => {
  if (!Number.isFinite(percent) || percent <= 0) return 0n;
  return (amount * BigInt(percent)) / 100n;
};

const command: Command = {
  name: "cuop",
  version: "1.3.0",
  alias: ["robbery"],
  role: 0,
  desc: "Cuop tien tu nguoi dung khac",
  guide: "{pn} @tag/[reply]: Cuop tien tu nguoi dung\n- Can 1,000 VND de thuc hien",
  cd: 10,
  prefix: true,
  onCall: async ({ config, event, userData, reply, threadData }: CommandOnCallContext) => {
    const { senderID, mentions, messageReply } = event;
    const nowMs = Date.now();

    const user = await userData.get(senderID);
    const userDataObj =
      user?.data && typeof user.data === "object"
        ? (user.data as { cuop?: { jail?: { time?: number } } })
        : undefined;
    const jailStatus = userDataObj?.cuop?.jail;
    if (jailStatus && typeof jailStatus.time === "number" && jailStatus.time > nowMs) {
      const timeLeft = Math.ceil((jailStatus.time - nowMs) / 60000);
      await reply(`Ban dang o tu, con ${timeLeft} phut nua moi duoc ra.`);
      return;
    }

    let targetID: string;
    let targetName = "Nguoi dung";
    if (messageReply?.senderID) {
      targetID = String(messageReply.senderID);
      const getName = userData.getName as ((sid: string) => Promise<string | undefined>) | undefined;
      targetName = (getName ? await getName(targetID) : "") || targetName;
    } else if (Object.keys(mentions || {}).length === 1) {
      const firstKey = Object.keys(mentions || {})[0];
      if (!firstKey) {
        await reply("Khong tim thay nguoi dung duoc de cap.");
        return;
      }
      targetID = firstKey;
      const mentionValue =
        mentions && typeof mentions === "object" && targetID in mentions
          ? mentions[targetID]
          : undefined;
      if (typeof mentionValue === "string" && mentionValue.trim()) {
        targetName = mentionValue.replace(/@/g, "");
      }
    } else {
      const thread = await threadData.get(event.threadID);
      const threadInfo = thread?.threadInfo;
      const participants =
        threadInfo &&
        typeof threadInfo === "object" &&
        "participantIDs" in threadInfo &&
        Array.isArray(threadInfo.participantIDs)
          ? threadInfo.participantIDs.filter(
              (id: unknown): id is string =>
                typeof id === "string" && id !== senderID
            )
          : [];
      if (participants.length === 0) {
        await reply("Khong co ai khac trong nhom de cuop.");
        return;
      }
      const randomTarget = participants[Math.floor(Math.random() * participants.length)];
      if (!randomTarget) {
        await reply("Khong the chon muc tieu ngau nhien.");
        return;
      }
      targetID = randomTarget;
      const getName = userData.getName as ((sid: string) => Promise<string | null | undefined>) | undefined;
      targetName = (getName ? await getName(targetID) : "") || targetName;
    }

    const ownerList = Array.isArray(config.OWNER)
      ? config.OWNER
      : typeof config.OWNER === "string"
        ? [config.OWNER]
        : [];
    if (ownerList.includes(targetID)) {
      await reply("Khong the cuop Owner.");
      return;
    }

    if (targetID === senderID) {
      await reply("Khong the cuop chinh minh.");
      return;
    }

    const robberMoney = toBI(await userData.checkMoney(senderID));
    const targetMoney = toBI(await userData.checkMoney(targetID));

    if (robberMoney < 1000n) {
      await reply("Ban can it nhat 1,000 VND de thuc hien.");
      return;
    }
    if (targetMoney < 1000n) {
      await reply(`${targetName} qua ngheo de cuop, hay tim muc tieu khac.`);
      return;
    }

    let successRate = 0.4;
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 4) {
      successRate += 0.1;
      await reply("Troi toi, co hoi thanh cong cao hon.");
    }

    interface EventEffect {
      chance: number;
      bonus?: number;
      penalty?: number;
      message: string;
    }

    const events: EventEffect[] = [
      { chance: 0.1, bonus: 0.1, message: "Troi mua to, it nguoi qua lai." },
      { chance: 0.1, penalty: 0.1, message: "Canh sat dang tuan tra nhieu." },
      { chance: 0.05, bonus: 0.15, message: "Ban tim duoc mat na, kho bi nhan dang hon." },
    ];

    for (const e of events) {
      if (Math.random() < e.chance) {
        if (typeof e.bonus === "number") successRate += e.bonus;
        else if (typeof e.penalty === "number") successRate -= e.penalty;
        await reply(e.message);
      }
    }

    if (Math.random() < 0.2) {
      const currentBalance = toBI(await userData.checkMoney(senderID));
      const fine = calcPercent(currentBalance, 30);
      const jailTime = 10 * 60 * 1000;

      try {
        if (fine > 0n) {
          await userData.delMoney(senderID, fine);
        }
        await userData.update(senderID, { data: { cuop: { jail: { time: Date.now() + jailTime } } } });
        await reply(`Cong an bat! Phat ${formatCurrency(fine)} va ngoi tu 10 phut.`);
      } catch {
        await userData.update(senderID, { data: { cuop: { jail: { time: Date.now() + jailTime } } } });
        await reply("Cong an bat! Ban van phai ngoi tu 10 phut.");
      }
      return;
    }

    const success = Math.random() < successRate;
    const currentExp =
      user && typeof (user as { exp?: unknown }).exp !== "undefined"
        ? Number((user as { exp?: unknown }).exp || 0)
        : 0;

    if (success) {
      const stolenAmount = calcPercent(targetMoney, 30);
      try {
        if (stolenAmount > 0n) {
          await userData.delMoney(targetID, stolenAmount);
          await userData.addMoney(senderID, stolenAmount);
        }
        await userData.update(senderID, { exp: currentExp + 30 });
        await reply(`Thanh cong! Da cuop ${formatCurrency(stolenAmount)} tu ${targetName}. +30XP`);
      } catch {
        await userData.update(senderID, { exp: currentExp + 30 });
        await reply("Phi vu thanh cong nhung muc tieu khong con tien. +30XP");
      }
      return;
    }

    const currentBalance = toBI(await userData.checkMoney(senderID));
    const penalty = calcPercent(currentBalance, 20);

    try {
      if (penalty > 0n) {
        await userData.delMoney(senderID, penalty);
      }
      await userData.update(senderID, { exp: currentExp + 10 });
      await reply(`That bai! Mat ${formatCurrency(penalty)} tien phat. +10XP`);
    } catch {
      await userData.update(senderID, { exp: currentExp + 10 });
      await reply("That bai! Ban khong du tien nop phat, van +10XP.");
    }
  }
};

export default command;
