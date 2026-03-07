"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnLoadContext,
  CommandOnReplyContext,
} from '@types';

interface Pet {
  name: string;
  price: number;
  workEfficiency: number;
  specialAbility: string;
  maxLevel: number;
}

interface PetSkill {
  name: string;
  description: string;
}

interface DailyQuest {
  name: string;
  exp: number;
  coins: number;
}

interface PetData {
  exists: boolean;
  name?: string;
  type?: number;
  level?: number;
  exp?: number;
  hunger?: number;
  happiness?: number;
  cleanliness?: number;
  lastFed?: number;
  lastPlayed?: number;
  lastCleaned?: number;
  lastWorked?: number;
  lastTrained?: number;
  evolved?: number;
  skillPoints?: number;
  inventory?: any[];
  dailyQuests?: {
    current: DailyQuest;
    completed: boolean;
    lastReset: number;
  };
}

interface PetReplyData {
  commandName: string;
  messageID: string;
  author: string;
  type?: string;
  messID?: string;
  threadID?: string;
  correctAnswer?: string;
  [key: string]: any;
}

const PETS: Record<number, Pet> = {
  1: {
    name: "Mèo",
    price: 1000,
    workEfficiency: 1.0,
    specialAbility: "stealth",
    maxLevel: 20,
  },
  2: {
    name: "Chó",
    price: 1500,
    workEfficiency: 1.2,
    specialAbility: "guard",
    maxLevel: 25,
  },
  3: {
    name: "Hamster",
    price: 800,
    workEfficiency: 0.8,
    specialAbility: "gather",
    maxLevel: 15,
  },
  4: {
    name: "Thỏ",
    price: 1200,
    workEfficiency: 1.1,
    specialAbility: "lucky",
    maxLevel: 18,
  },
  5: {
    name: "Rồng",
    price: 5000,
    workEfficiency: 2.0,
    specialAbility: "legendary",
    maxLevel: 30,
  },
};

const DAILY_QUESTS: DailyQuest[] = [
  { name: "Tập thể dục", exp: 20, coins: 100 },
  { name: "Đi dạo công viên", exp: 15, coins: 80 },
  { name: "Học trick mới", exp: 25, coins: 120 },
];

const PET_SKILLS: Record<string, PetSkill> = {
  stealth: {
    name: "Ẩn thân",
    description: "Tăng 20% coins khi làm việc ban đêm",
  },
  guard: { name: "Bảo vệ", description: "Giảm 10% chi phí chăm sóc" },
  gather: {
    name: "Thu thập",
    description: "Cơ hội nhận được items đặc biệt",
  },
  lucky: {
    name: "May mắn",
    description: "Tăng 15% EXP từ mọi hoạt động",
  },
  legendary: {
    name: "Huyền thoại",
    description: "Tất cả chỉ số được tăng 25%",
  },
};


const petCommand: Command = {
  name: "pet",
  alias: ["pet", "thucung"],
  version: "1.1.0",
  role: 0,
  desc: "Trò chơi nuôi thú cưng ảo - Phiên bản nâng cao",
  guide:
    "{pn} shop - Xem cửa hàng thú cưng\n{pn} buy <ID> - Mua thú cưng\n{pn} info - Xem thông tin thú cưng\n{pn} feed - Cho thú cưng ăn\n{pn} play - Chơi với thú cưng\n{pn} clean - Tắm cho thú cưng\n{pn} rename <tên mới> - Đổi tên thú cưng\n{pn} train - Huấn luyện thú cưng\n{pn} work - Cho thú cưng đi làm việc\n{pn} quest - Xem nhiệm vụ hàng ngày\n{pn} skill - Xem kỹ năng đặc biệt\n{pn} evolve - Tiến hóa thú cưng (Cần level tối đa)",
  cd: 5,
  prefix: true,

  onLoad: async function ({ userData }: CommandOnLoadContext) {
    const resetDailyQuests = async () => {
      try {
        const allUserData = await userData.getAll();
        const updates = allUserData
          .filter((user: any) => user.data?.pet?.exists)
          .map((user: any) => {
            user.data.pet.dailyQuests = {
              current:
                DAILY_QUESTS[
                Math.floor(Math.random() * DAILY_QUESTS.length)
                ],
              completed: false,
              lastReset: Date.now(),
            };
            return userData.update(user.userID, user);
          });

        await Promise.all(updates);
        console.log(
          "[Pet System] Daily quests have been reset for all users"
        );
      } catch (error) {
        console.error(
          "[Pet System] Error while resetting daily quests:",
          error
        );
      }
    };

    const getMsUntilMidnight = (): number => {
      const now = new Date();
      const vietnamTime = new Date(
        now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
      );
      const tomorrow = new Date(vietnamTime);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow.getTime() - vietnamTime.getTime();
    };

    const scheduleNextReset = () => {
      const delay = getMsUntilMidnight();
      setTimeout(() => {
        resetDailyQuests();
        scheduleNextReset();
      }, delay);
    };

    scheduleNextReset();
  },

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { reply, client, event, args, main, userData, commandName } = ctx;
    const command = args[0]?.toLowerCase();
    const { threadID, messageID, senderID } = event;

    let data = await userData.get(event.senderID);
    if (!data) return;
    if (!data.data) data.data = {};
    if (!data.data.pet) data.data.pet = { exists: false };
    if (!data.money) data.money = 0;

    if (data.data.pet.exists && !data.data.pet.dailyQuests) {
      data.data.pet.dailyQuests = {
        current:
          DAILY_QUESTS[Math.floor(Math.random() * DAILY_QUESTS.length)],
        completed: false,
        lastReset: Date.now(),
      };
      data.data.pet.inventory = [];
      data.data.pet.skillPoints = 0;
    }

    if (
      data.data.pet.exists &&
      Date.now() - (data.data.pet.dailyQuests?.lastReset || 0) > 86400000
    ) {
      data.data.pet.dailyQuests = {
        current:
          DAILY_QUESTS[Math.floor(Math.random() * DAILY_QUESTS.length)],
        completed: false,
        lastReset: Date.now(),
      };
    }

    if (data.data.pet.exists) {
      const now = Date.now();
      const hoursPassed = {
        hunger:
          (now - (data.data.pet.lastFed || 0)) / (1000 * 60 * 60),
        happiness:
          (now - (data.data.pet.lastPlayed || 0)) / (1000 * 60 * 60),
        cleanliness:
          (now - (data.data.pet.lastCleaned || 0)) / (1000 * 60 * 60),
      };

      const decayRate = data.data.pet.type === 5 ? 3 : 5;
      data.data.pet.hunger = Math.max(
        0,
        (data.data.pet.hunger || 100) - hoursPassed.hunger * decayRate
      );
      data.data.pet.happiness = Math.max(
        0,
        (data.data.pet.happiness || 100) - hoursPassed.happiness * decayRate
      );
      data.data.pet.cleanliness = Math.max(
        0,
        (data.data.pet.cleanliness || 100) -
        hoursPassed.cleanliness * decayRate
      );

      if (
        (data.data.pet.hunger || 0) <= 0 &&
        (data.data.pet.happiness || 0) <= 0 &&
        (data.data.pet.cleanliness || 0) <= 0
      ) {
        data.data.pet = { exists: false };
        if (data) {
          if (data) {
            await userData.update(senderID, data);
          }
        }
        await reply(
          "💔 Thú cưng của bạn đã qua đời vì thiếu chăm sóc! Bạn có thể mua thú cưng mới từ shop."
        );
        return;
      }
    }

    switch (command) {
      case "shop": {
        let shopMessage = "🏪 Cửa hàng thú cưng:\n\n";

        for (const [id, pet] of Object.entries(PETS)) {
          shopMessage += `${id}. ${pet.name} - ${pet.price} coins\n`;
          shopMessage += `   Hiệu suất làm việc: ${pet.workEfficiency}x\n`;
          const skill = PET_SKILLS[pet.specialAbility];
          shopMessage += `   Kỹ năng: ${skill?.name || "Không có"}\n\n`;
        }

        await client.sendMessage(
          shopMessage,
          threadID,
          (_err?: Error, info?: unknown) => {
            const msgInfo = info as { messageID?: string } | undefined;
            if (msgInfo?.messageID) {
              if (!main.onReply) main.onReply = new Map();
              main.onReply.set(msgInfo.messageID, {
                commandName,
                author: senderID,
                type: "buypet",
                messageID: msgInfo.messageID,
                messID: messageID,
                threadID,
              });
            }
          },
          messageID
        );
        return;
      }

      case "buy": {
        const petId = parseInt(args[1] || "0");
        const pet = PETS[petId];
        if (!petId || !pet) {
          await reply("ID thú cưng không hợp lệ!");
          return;
        }
        if (data.data.pet.exists) {
          await reply("Bạn đã có thú cưng rồi!");
          return;
        }
        if ((data.money || 0) < pet.price) {
          await reply("Bạn không đủ tiền!");
          return;
        }

        const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (delMoney) {
          await delMoney(event.senderID, BigInt(pet.price));
        }

        data.data.pet = {
          exists: true,
          name: pet.name,
          type: petId,
          level: 1,
          exp: 0,
          hunger: 100,
          happiness: 100,
          cleanliness: 100,
          lastFed: Date.now(),
          lastPlayed: Date.now(),
          lastCleaned: Date.now(),
          lastWorked: Date.now(),
          dailyQuests: {
            current:
              DAILY_QUESTS[
              Math.floor(Math.random() * DAILY_QUESTS.length)
              ],
            completed: false,
            lastReset: Date.now(),
          },
        };

        if (data) {
          await userData.update(senderID, data);
        }
        await reply(`🎉 Chúc mừng! Bạn đã mua ${pet.name}!`);
        break;
      }

      case "info": {
        if (!data.data.pet.exists) {
          await reply("Bạn chưa có thú cưng!");
          return;
        }

        const pet = data.data.pet as PetData;
        const petType = PETS[pet.type || 1];
        if (!petType) {
          await reply("Lỗi: Không tìm thấy loại thú cưng!");
          return;
        }
        await reply(
          `🐾 Thông tin thú cưng:\n` +
          `Tên: ${pet.name || "Chưa đặt tên"}\n` +
          `Loại: ${petType.name}\n` +
          `Level: ${pet.level || 1}\n` +
          `EXP: ${pet.exp || 0}/100\n` +
          `Đói: ${Math.floor(pet.hunger || 0)}%\n` +
          `Hạnh phúc: ${Math.floor(pet.happiness || 0)}%\n` +
          `Sạch sẽ: ${Math.floor(pet.cleanliness || 0)}%\n` +
          `Tiến hóa: ${pet.evolved || 0} lần`
        );
        break;
      }

      case "feed": {
        if (!data.data.pet.exists) {
          await reply("Bạn chưa có thú cưng!");
          return;
        }
        if ((data.money || 0) < 50) {
          await reply("Cần 50 coins để cho thú cưng ăn!");
          return;
        }
        if ((data.data.pet.hunger || 0) >= 100) {
          await reply("Thú cưng của bạn không đói!");
          return;
        }

        const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (delMoney) {
          await delMoney(event.senderID, 50n);
        }
        data.data.pet.hunger = Math.min(
          100,
          (data.data.pet.hunger || 0) + 30
        );
        data.data.pet.lastFed = Date.now();
        data.data.pet.exp = (data.data.pet.exp || 0) + 5;
        if (data) {
          await userData.update(senderID, data);
        }
        await reply("🍖 Đã cho thú cưng ăn! (+30% độ đói, +5 EXP)");
        break;
      }

      case "play": {
        if (!data.data.pet.exists) {
          await reply("Bạn chưa có thú cưng!");
          return;
        }
        if (
          Date.now() - (data.data.pet.lastPlayed || 0) < 1800000
        ) {
          await reply("Thú cưng vẫn đang mệt, hãy đợi 30 phút nữa!");
          return;
        }

        data.data.pet.happiness = Math.min(
          100,
          (data.data.pet.happiness || 0) + 25
        );
        data.data.pet.lastPlayed = Date.now();
        data.data.pet.exp = (data.data.pet.exp || 0) + 10;
        if (data) {
          await userData.update(senderID, data);
        }
        await reply("🎮 Bạn đã chơi với thú cưng! (+25% hạnh phúc, +10 EXP)");
        break;
      }

      case "clean": {
        if (!data.data.pet.exists) {
          await reply("Bạn chưa có thú cưng!");
          return;
        }
        if ((data.money || 0) < 30) {
          await reply("Cần 30 coins để tắm cho thú cưng!");
          return;
        }
        if ((data.data.pet.cleanliness || 0) >= 100) {
          await reply("Thú cưng của bạn đã sạch sẽ!");
          return;
        }

        const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (delMoney) {
          await delMoney(event.senderID, 30n);
        }
        data.data.pet.cleanliness = Math.min(
          100,
          (data.data.pet.cleanliness || 0) + 35
        );
        data.data.pet.lastCleaned = Date.now();
        data.data.pet.exp = (data.data.pet.exp || 0) + 8;
        if (data) {
          await userData.update(senderID, data);
        }
        await reply("🚿 Đã tắm cho thú cưng! (+35% độ sạch, +8 EXP)");
        break;
      }

      case "rename": {
        if (!data.data.pet.exists) {
          await reply("Bạn chưa có thú cưng!");
          return;
        }
        const newName = args.slice(1).join(" ");
        if (!newName) {
          await reply("Vui lòng nhập tên mới!");
          return;
        }
        if (newName.length > 20) {
          await reply("Tên không được quá 20 ký tự!");
          return;
        }

        data.data.pet.name = newName;
        if (data) {
          await userData.update(senderID, data);
        }
        await reply(`✏️ Đã đổi tên thú cưng thành: ${newName}`);
        break;
      }

      case "train": {
        if (!data.data.pet.exists) {
          await reply("Bạn chưa có thú cưng!");
          return;
        }
        if (
          Date.now() - (data.data.pet.lastTrained || 0) < 3600000
        ) {
          await reply("Thú cưng vẫn đang mệt, hãy đợi 1 giờ nữa!");
          return;
        }
        if ((data.money || 0) < 100) {
          await reply("Cần 100 coins để huấn luyện!");
          return;
        }

        const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (delMoney) {
          await delMoney(event.senderID, 100n);
        }
        data.data.pet.exp = (data.data.pet.exp || 0) + 15;
        data.data.pet.lastTrained = Date.now();
        if (data) {
          await userData.update(senderID, data);
        }
        await reply("📚 Đã huấn luyện thú cưng! (+15 EXP)");
        break;
      }

      case "work": {
        if (!data.data.pet.exists) {
          await reply("Bạn chưa có thú cưng!");
          return;
        }
        if (
          Date.now() - (data.data.pet.lastWorked || 0) < 3600000
        ) {
          await reply("Thú cưng vẫn đang mệt, hãy đợi 1 giờ nữa!");
          return;
        }

        const baseEarnings = 100;
        const petType = PETS[data.data.pet.type || 1];
        if (!petType) {
          await reply("Lỗi: Không tìm thấy loại thú cưng!");
          return;
        }
        const efficiency = petType.workEfficiency;
        const earnings = Math.floor(
          baseEarnings *
          efficiency *
          (1 + ((data.data.pet.evolved || 0) * 0.1))
        );

        const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (addMoney) {
          await addMoney(event.senderID, BigInt(earnings));
        }

        
        const addExp = userData.addExp as ((id: string, amount: number) => Promise<number>) | undefined;
        if (addExp) {
          const gained = Math.max(5, Math.floor(earnings / 50)); 
          await addExp(senderID, gained);
        }
        data.data.pet.lastWorked = Date.now();
        data.data.pet.exp = (data.data.pet.exp || 0) + 12;
        if (data) {
          await userData.update(senderID, data);
        }
        await reply(
          `💼 Thú cưng đã đi làm và kiếm được ${earnings} coins! (+12 EXP)`
        );
        break;
      }

      case "quest": {
        if (!data.data.pet.exists) {
          await reply("Bạn chưa có thú cưng!");
          return;
        }
        const quest = data.data.pet.dailyQuests?.current;
        if (!quest) {
          await reply("Không tìm thấy nhiệm vụ!");
          return;
        }

        await reply(
          `📜 Nhiệm vụ hàng ngày: ${quest.name}\n\n` +
          `Phần thưởng:\n` +
          `- ${quest.exp} EXP\n` +
          `- ${quest.coins} coins\n\n` +
          `Trạng thái: ${data.data.pet.dailyQuests?.completed
            ? "Đã hoàn thành ✅"
            : "Chưa hoàn thành ❌"
          }\n\n` +
          `Để thực hiện nhiệm vụ, hãy gõ: pet doquest`
        );
        break;
      }

      case "doquest": {
        if (!data.data.pet.exists) {
          await reply("Bạn chưa có thú cưng!");
          return;
        }
        if (data.data.pet.dailyQuests?.completed) {
          await reply("Bạn đã hoàn thành nhiệm vụ hôm nay rồi!");
          return;
        }
        if ((data.data.pet.hunger || 0) < 30) {
          await reply(
            "Thú cưng đang đói! Hãy cho ăn trước khi làm nhiệm vụ (pet feed)"
          );
          return;
        }
        if ((data.data.pet.happiness || 0) < 30) {
          await reply(
            "Thú cưng đang buồn! Hãy chơi với nó trước (pet play)"
          );
          return;
        }

        const currentQuest = data.data.pet.dailyQuests?.current;
        if (!currentQuest) {
          await reply("Không tìm thấy nhiệm vụ!");
          return;
        }

        let questSuccess = Math.random() > 0.3;

        if (questSuccess) {
          let expReward = currentQuest.exp;
          let coinReward = currentQuest.coins;

          const petType = PETS[data.data.pet.type || 1];
          if (petType && petType.specialAbility === "lucky") {
            expReward = Math.floor(expReward * 1.15);
            coinReward = Math.floor(coinReward * 1.15);
          }

          data.data.pet.exp = (data.data.pet.exp || 0) + expReward;
          const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
          if (addMoney) {
            await addMoney(senderID, BigInt(coinReward));
          }

          
          const addExp = userData.addExp as ((id: string, amount: number) => Promise<number>) | undefined;
          if (addExp) {
            const gained = Math.max(8, Math.floor(expReward / 2)); 
            await addExp(senderID, gained);
          }
          if (data.data.pet.dailyQuests) {
            data.data.pet.dailyQuests.completed = true;
          }
          data.data.pet.hunger = Math.max(
            0,
            (data.data.pet.hunger || 0) - 15
          );
          data.data.pet.happiness = Math.max(
            0,
            (data.data.pet.happiness || 0) - 10
          );
          if (data) {
            await userData.update(senderID, data);
          }

          await reply(
            `🌟 ${data.data.pet.name || "Thú cưng"} đã hoàn thành xuất sắc nhiệm vụ "${currentQuest.name}"!\n\n` +
            `Phần thưởng:\n` +
            `- ${expReward} EXP\n` +
            `- ${coinReward} coins\n` +
            (petType && petType.specialAbility === "lucky"
              ? "\n💫 Kích hoạt kỹ năng May mắn: +15% phần thưởng!"
              : "")
          );
        } else {
          data.data.pet.hunger = Math.max(
            0,
            (data.data.pet.hunger || 0) - 5
          );
          data.data.pet.happiness = Math.max(
            0,
            (data.data.pet.happiness || 0) - 5
          );
          if (data) {
            await userData.update(senderID, data);
          }
          await reply(
            `😅 Rất tiếc! ${data.data.pet.name || "Thú cưng"} chưa hoàn thành được nhiệm vụ.\n` +
            `Hãy thử lại sau khi chăm sóc thú cưng!`
          );
        }
        break;
      }

      case "skill": {
        if (!data.data.pet.exists) {
          await reply("Bạn chưa có thú cưng!");
          return;
        }
        const petType = PETS[data.data.pet.type || 1];
        if (!petType) {
          await reply("Lỗi: Không tìm thấy loại thú cưng!");
          return;
        }
        const petSkill = PET_SKILLS[petType.specialAbility];
        if (!petSkill) {
          await reply("Lỗi: Không tìm thấy kỹ năng!");
          return;
        }

        await reply(
          `✨ Kỹ năng đặc biệt của ${data.data.pet.name || "Thú cưng"}:\n` +
          `${petSkill.name}\n` +
          `Hiệu ứng: ${petSkill.description}\n` +
          `Điểm kỹ năng: ${data.data.pet.skillPoints || 0}`
        );
        break;
      }

      case "evolve": {
        if (!data.data.pet.exists) {
          await reply("Bạn chưa có thú cưng!");
          return;
        }
        const petType = PETS[data.data.pet.type || 1];
        if (!petType) {
          await reply("Lỗi: Không tìm thấy loại thú cưng!");
          return;
        }
        const maxLevel = petType.maxLevel;
        if ((data.data.pet.level || 0) < maxLevel) {
          await reply(
            `Thú cưng cần đạt level ${maxLevel} để tiến hóa!`
          );
          return;
        }
        if ((data.money || 0) < 5000) {
          await reply("Cần 5000 coins để tiến hóa!");
          return;
        }

        const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (delMoney) {
          await delMoney(event.senderID, 5000n);
        }
        data.data.pet.level = 1;
        data.data.pet.exp = 0;
        data.data.pet.evolved = (data.data.pet.evolved || 0) + 1;
        data.data.pet.skillPoints = (data.data.pet.skillPoints || 0) + 1;
        if (data) {
          await userData.update(senderID, data);
        }
        await reply(
          `🌟 Chúc mừng! ${data.data.pet.name || "Thú cưng"} đã tiến hóa lần thứ ${data.data.pet.evolved}!`
        );
        break;
      }

      default:
        await reply(
          "🎮 Hướng dẫn sử dụng Pet System:\n\n" +
          "- pet shop: Xem cửa hàng thú cưng\n" +
          "- pet buy <ID>: Mua thú cưng\n" +
          "- pet info: Xem thông tin thú cưng\n" +
          "- pet feed: Cho thú cưng ăn (50 coins)\n" +
          "- pet play: Chơi với thú cưng (30p/lần)\n" +
          "- pet clean: Tắm cho thú cưng (30 coins)\n" +
          "- pet rename <tên>: Đổi tên thú cưng\n" +
          "- pet train: Huấn luyện thú cưng (100 coins)\n" +
          "- pet work: Cho thú cưng đi làm (1h/lần)\n" +
          "- pet quest: Xem nhiệm vụ hàng ngày\n" +
          "- pet skill: Xem kỹ năng đặc biệt\n" +
          "- pet evolve: Tiến hóa thú cưng (5000 coins)"
        );
    }
  },

  onReply: async (ctx: CommandOnReplyContext): Promise<void> => {
    const { event, reply, userData } = ctx;
    const { senderID, body } = event;
    const Reply = ctx.Reply as PetReplyData | undefined;

    if (!Reply) return;

    let data = await userData.get(senderID);
    if (!data) return;
    if (!data.data) data.data = {};
    if (!data.data.pet) data.data.pet = { exists: false };

    if (Reply.type === "buypet") {
      const petId = parseInt(body || "0");
      const pet = PETS[petId];
      if (!petId || !pet) {
        await reply("ID thú cưng không hợp lệ!");
        return;
      }
      if (data.data.pet.exists) {
        await reply("Bạn đã có thú cưng rồi!");
        return;
      }
      if ((data.money || 0) < pet.price) {
        await reply("Bạn không đủ tiền!");
        return;
      }

      const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
      if (delMoney) {
        await delMoney(senderID, BigInt(pet.price));
      }

      data.data.pet = {
        exists: true,
        name: pet.name,
        type: petId,
        level: 1,
        exp: 0,
        hunger: 100,
        happiness: 100,
        cleanliness: 100,
        lastFed: Date.now(),
        lastPlayed: Date.now(),
        lastCleaned: Date.now(),
        lastWorked: Date.now(),
        dailyQuests: {
          current:
            DAILY_QUESTS[Math.floor(Math.random() * DAILY_QUESTS.length)],
          completed: false,
          lastReset: Date.now(),
        },
        inventory: [],
        skillPoints: 0,
        evolved: 0,
        lastTrained: Date.now(),
      };

      await userData.update(senderID, data);
      await reply(`🎉 Chúc mừng! Bạn đã mua ${pet.name}!`);
    }

    if (Reply.type === "training") {
      const answer = (body || "").toLowerCase();
      if (answer === Reply.correctAnswer) {
        data.data.pet.exp = (data.data.pet.exp || 0) + 20;
        const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (addMoney) {
          await addMoney(senderID, 100n);
        }
        if (data) {
          await userData.update(senderID, data);
        }
        await reply(
          "🎯 Chính xác! Thú cưng đã học được kỹ năng mới! (+20 EXP, +100 coins)"
        );
      } else {
        await reply("❌ Sai rồi! Hãy thử lại nhé!");
      }
    }

    if (Reply.type === "quest") {
      if (!data.data.pet.dailyQuests?.completed) {
        const quest = data.data.pet.dailyQuests?.current;
        if (quest) {
          data.data.pet.exp = (data.data.pet.exp || 0) + quest.exp;
          const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
          if (addMoney) {
            await addMoney(senderID, BigInt(quest.coins));
          }
          if (data.data.pet.dailyQuests) {
            data.data.pet.dailyQuests.completed = true;
          }
          if (data) {
            await userData.update(senderID, data);
          }
          await reply(
            `✨ Hoàn thành nhiệm vụ! Nhận được ${quest.exp} EXP và ${quest.coins} coins!`
          );
        }
      }
    }
  },
};

export default petCommand;
