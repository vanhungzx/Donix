"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnReactContext,
  CommandOnReplyContext,
} from '@types';
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import { storagePath } from "../../../core/storagePath";

interface Gun {
  name: string;
  price: number;
  duribility: number;
  time: number;
  size?: number;
}

interface Zombie {
  name: string;
  size: number | [number, number];
  rarity: string;
  price: number;
  catch: string;
  time: number[];
  months: number[];
}

interface Critter {
  name: string;
  size: number;
  price: number;
  rarity?: string;
  catch?: string;
}

interface ZwarData {
  weapon: Gun;
  critters: Critter[];
  size: number;
  new?: boolean;
  time?: Date | string;
}

interface GunData {
  gun: Gun[];
}

interface ZombieData {
  Zombie: Zombie[];
}

interface ZwarReplyData {
  commandName: string;
  messageID: string;
  author: string;
  type: string;
  choose?: number;
}


function formatCurrency(amount: bigint | number | null | undefined): string {
  if (amount === null || amount === undefined) return "";
  const bigIntAmount = typeof amount === "bigint" ? amount : BigInt(amount);
  const strAmount = bigIntAmount.toString();
  const addThou = (numStr: string): string =>
    numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return addThou(strAmount) + " VNĐ";
}

function getRarityRecursion(
  chance: number,
  index: number,
  number: number
): string {
  const catchChance: Record<string, number> = {
    "Siêu Bình Thường": 50,
    "Bình Thường": 50,
    "Trung Bình": 45,
    Hiếm: 50,
    "Siêu Hiếm": 50,
    "Cực Hiếm": 50,
    "Cực Phẩm": 50,
  };

  const rarityList = [
    "Siêu Bình Thường",
    "Bình Thường",
    "Trung Bình",
    "Hiếm",
    "Siêu Hiếm",
    "Cực Hiếm",
    "Cực Phẩm",
  ];

  if (index >= rarityList.length - 1) {
    return rarityList[rarityList.length - 1] || "Siêu Bình Thường";
  }

  const currentRarity = rarityList[index + 1];
  if (!currentRarity) {
    return rarityList[rarityList.length - 1] || "Siêu Bình Thường";
  }
  const currentCatchChance = catchChance[currentRarity] || 50;

  if (chance <= number + currentCatchChance) {
    return currentRarity;
  }

  return getRarityRecursion(
    chance,
    index + 1,
    number + currentCatchChance
  );
}

function getRarity(): string {
  return getRarityRecursion(Math.floor(Math.random() * 100), -1, 0);
}

async function getZombie(
  zombieRarity: string,
  currentHour: number,
  currentMonth: number
): Promise<Zombie[]> {
  const dataPath = storagePath("game", "zwar", "data.json");

  if (!fs.existsSync(dataPath)) {
    return [];
  }

  const data = JSON.parse(
    fs.readFileSync(dataPath, "utf-8")
  ) as ZombieData;

  return data.Zombie.filter(
    (z) =>
      z.time.indexOf(parseInt(String(currentHour))) !== -1 &&
      z.months.indexOf(parseInt(String(currentMonth))) !== -1 &&
      z.rarity === zombieRarity
  );
}

const zwarCommand: Command = {
  name: "zwar",
  alias: ["zwar"],
  version: "1.0.4",
  desc: "Chiến đấu với zombie",
  guide:
    "{pn} [register/shop/prison/help]\n\n" +
    "- register: Đăng ký tham gia trò chơi\n" +
    "- shop: Vào cửa hàng để mua súng và nâng cấp\n" +
    "- prison: Xem kho chứa zombie đã bắt được\n" +
    "- help: Xem hướng dẫn chi tiết về trò chơi\n\n" +
    "Lưu ý: Bạn cần đăng ký và mua súng trước khi có thể bắt zombie",
  cd: 5,
  prefix: true,

  onLoad: async () => {
    const dirMaterial = storagePath("game", "zwar");

    if (!fs.existsSync(dirMaterial)) {
      await fs.ensureDir(dirMaterial);
    }

    if (!fs.existsSync(path.join(dirMaterial, "data.json"))) {
      const response = await axios({
        url: "https://raw.githubusercontent.com/J-JRT/zwar/mainV2/data.json",
        method: "GET",
        responseType: "stream",
      });
      const writer = fs.createWriteStream(
        path.join(dirMaterial, "data.json")
      );
      response.data.pipe(writer);
      await new Promise<void>((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
    }

    if (!fs.existsSync(path.join(dirMaterial, "gun.json"))) {
      const response = await axios({
        url: "https://raw.githubusercontent.com/J-JRT/zwar/mainV2/gun.json",
        method: "GET",
        responseType: "stream",
      });
      const writer = fs.createWriteStream(path.join(dirMaterial, "gun.json"));
      response.data.pipe(writer);
      await new Promise<void>((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
    }
  },

  onReact: async (ctx: CommandOnReactContext): Promise<void> => {
    const { client, event, Reaction, userData } = ctx;

    const reactData = Reaction as { author?: string; type?: string; choose?: number } | undefined;
    if (!reactData || reactData.author != event.userID) return;

    try {
      switch (reactData.type) {
        case "upgradeSlotConfirm": {
          const userDat = await userData.get(event.userID);
          if (!userDat) return;
          const zwar = userDat.data?.zwar as ZwarData | undefined;

          if (!zwar || !reactData.choose) return;

          const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
          if (delMoney) {
            await delMoney(
              event.userID,
              BigInt(reactData.choose * 2000)
            );
          }

          zwar.size = reactData.choose;
          await userData.update(event.userID, { data: userDat.data });

          await client.sendMessage(
            `[ SHOP ] - Bạn đã mua thành công ${reactData.choose} vị trí!`,
            event.threadID,
            event.messageID
          );
          return;
        }
        default:
          break;
      }
    } catch (e) {
      console.log(e);
      await client.sendMessage(
        "[ ZWAR ] - zombie đã tiêu diệt hết người chơi",
        event.threadID,
        event.messageID
      );
    }
  },

  onReply: async function (ctx: CommandOnReplyContext): Promise<void> {
    const { client, event, Reply, userData, main, commandName } = ctx;

    const replyData = Reply as unknown as ZwarReplyData | undefined;
    if (!replyData || replyData.author !== event.senderID) return;

    const gunDataPath = storagePath("game", "zwar", "gun.json");
    if (!fs.existsSync(gunDataPath)) {
      await client.sendMessage(
        "[ ERROR ] - Không tìm thấy dữ liệu súng!",
        event.threadID,
        event.messageID
      );
      return;
    }

    const datagun = JSON.parse(
      fs.readFileSync(gunDataPath, "utf-8")
    ) as GunData;

    switch (replyData.type) {
      case "shop": {
        switch (event.body) {
          case "1": {
            const entryList = datagun.gun.map(
              (gun, i) =>
                `${i + 1}. ${gun.name}: ${formatCurrency(gun.price)}\nĐộ bền: ${gun.duribility}\nThời Gian Chờ : ${gun.time} giây\n`
            );

            await client.sendMessage(
              "[ SHOP WEAPON ]\n\n" +
              entryList.join("\n") +
              "\n\nReply tin nhắn này với vũ khí bạn muốn mua",
              event.threadID,
              (_error: any, info: any) => {
                if (!main.onReply) main.onReply = new Map();
                main.onReply.set(info.messageID, {
                  commandName,
                  messageID: info.messageID,
                  author: event.senderID,
                  type: "buyShop",
                });
              },
              event.messageID
            );
            break;
          }

          case "2": {
            const userDat = await userData.get(event.senderID);
            if (!userDat) return;
            const zwar = (userDat.data?.zwar || {}) as ZwarData;

            const zmoney = (zwar.critters || []).reduce(
              (acc, critter) => acc + parseInt(String(critter.price)),
              0
            );

            zwar.critters = [];
            const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
            if (addMoney) {
              await addMoney(event.senderID, BigInt(zmoney));
            }


            const addExp = userData.addExp as ((id: string, amount: number) => Promise<number>) | undefined;
            if (addExp && zmoney > 0) {
              const gained = Math.max(10, Math.floor(zmoney / 20000));
              await addExp(event.senderID, gained);
            }
            await userData.update(event.senderID, { data: userDat.data });

            await client.sendMessage(
              `[ ZWAR ] - Tổng số tiền bạn bán được là: ${formatCurrency(zmoney)}`,
              event.threadID,
              event.messageID
            );
            return;
          }

          case "3": {
            const userDat = await userData.get(event.senderID);
            if (!userDat || !userDat.data?.zwar) return;
            const zwar = userDat.data.zwar as ZwarData;

            await client.sendMessage(
              `[ UPGRADE BALO ]\nHiện tại bạn đang có ${zwar.size || 0} vị trí có thể chứa đồ trong kho đồ của bạn\n\nReply tin nhắn này cùng số slot bạn muốn nâng cấp`,
              event.threadID,
              (_error?: Error, info?: unknown) => {
                const msgInfo = info as { messageID?: string } | undefined;
                if (!main.onReply) main.onReply = new Map();
                if (msgInfo?.messageID) {
                  main.onReply.set(msgInfo.messageID, {
                    commandName,
                    messageID: msgInfo.messageID,
                    author: event.senderID,
                    type: "upgradeSlot",
                  });
                }
              },
              event.messageID
            );
            return;
          }

          default:
            break;
        }
        return;
      }

      case "buyShop": {
        try {
          const choose = parseInt(event.body || "0");
          const userDat = await userData.get(event.senderID);

          if (isNaN(choose)) {
            await client.sendMessage(
              "[ ERROR ] - Lựa chọn của bạn không phải là một con số!",
              event.threadID,
              event.messageID
            );
            return;
          }

          if (choose < 1 || choose > datagun.gun.length) {
            await client.sendMessage(
              "[ ERROR ] » Lựa chọn của bạn vượt quá danh sách",
              event.threadID,
              event.messageID
            );
            return;
          }

          const gunUserChoose = datagun.gun[choose - 1];
          if (!gunUserChoose) {
            await client.sendMessage(
              "[ ERROR ] - Không tìm thấy vũ khí!",
              event.threadID,
              event.messageID
            );
            return;
          }

          const formattedPrice = formatCurrency(gunUserChoose.price);

          if (!userDat) return;
          const userMoney = BigInt(userDat.money || 0);
          if (userMoney < BigInt(gunUserChoose.price)) {
            const missing = formatCurrency(
              gunUserChoose.price - Number(userMoney)
            );
            await client.sendMessage(
              `[ ERROR ] - Bạn không đủ tiền để mua súng mới. Bạn còn thiếu ${missing}`,
              event.threadID,
              event.messageID
            );
            return;
          }

          const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
          if (delMoney) {
            await delMoney(event.senderID, BigInt(gunUserChoose.price));
          }

          const zwar = (userDat.data?.zwar || {}) as ZwarData;
          zwar.weapon = gunUserChoose;
          await userData.update(event.senderID, { data: userDat.data });

          await client.sendMessage(
            `[ SHOP ] - Bạn đã mua thành công ${gunUserChoose.name} với giá ${formattedPrice}`,
            event.threadID,
            event.messageID
          );
        } catch (e) {
          console.log(e);
          await client.sendMessage(
            "Đã xảy ra lỗi!",
            event.threadID,
            event.messageID
          );
        }
        break;
      }

      case "upgradeSlot": {
        try {
          const choose = parseInt(event.body || "0");
          const userDat = await userData.get(event.senderID);
          if (!userDat) return;

          if (isNaN(choose)) {
            await client.sendMessage(
              "[ ERROR ] - Lựa chọn của bạn không phải là một con số!",
              event.threadID,
              event.messageID
            );
            return;
          }

          const moneyOfUpgrade = choose * 2000;
          const userMoney = BigInt(userDat.money || 0);

          if (userMoney < BigInt(moneyOfUpgrade)) {
            const missing = formatCurrency(moneyOfUpgrade - Number(userMoney));
            await client.sendMessage(
              `[ SHOP ] - Bạn không đủ tiền để có thể mua thêm chỗ cho túi đồ, bạn còn thiếu ${missing}`,
              event.threadID,
              event.messageID
            );
          }

          await client.sendMessage(
            `[ SHOP ] - Bạn muốn mua ${choose} slot với giá ${formatCurrency(moneyOfUpgrade)} không? \n\nReaction tin nhắn này để đồng ý!`,
            event.threadID,
            (_error: any, info: any) => {
              if (!main.onReact) main.onReact = new Map();
              const reactData: any = {
                commandName,
                messageID: info.messageID,
                author: event.senderID,
                choose,
                type: "upgradeSlotConfirm",
              };
              main.onReact.set(info.messageID, reactData as any);
            },
            event.messageID
          );
        } catch (e) {
          console.log(e);
          await client.sendMessage(
            "Đã xảy ra lỗi!",
            event.threadID,
            event.messageID
          );
        }
        break;
      }

      default:
        break;
    }
  },

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { client, event, config, args, main, commandName, userData } = ctx;
    const a = config.PREFIX;

    const emptygun: Gun = {
      name: "None",
      price: 0,
      time: 120,
      duribility: 0,
      size: 0,
    };

    const userDat = await userData.get(event.senderID);
    const dataUser = (userDat?.data?.zwar || {}) as ZwarData;

    switch (args[0]) {
      case "register":
      case "-r": {
        try {
          if (dataUser.new) {
            await client.sendMessage(
              "[ ZWAR ] - Bạn đã có mặt trên chiến trường!",
              event.threadID,
              event.messageID
            );
            return;
          }

          await userData.update(event.senderID, {
            data: {
              zwar: {
                weapon: emptygun,
                critters: [],
                size: 10,
                new: true,
              },
            },
          });

          await client.sendMessage(
            "[ ZWAR ] - Bạn đã đăng ký vào chiến trường thành công!",
            event.threadID,
            event.messageID
          );
        } catch (e) {
          console.error(e);
          await client.sendMessage(
            "Đã xảy ra lỗi!",
            event.threadID,
            event.messageID
          );
        }
        break;
      }

      case "shop":
      case "-s": {
        if (!dataUser.new) {
          await client.sendMessage(
            "[ ZWAR ] - Bạn chưa có mặt trên chiến trường",
            event.threadID,
            event.messageID
          );
          return;
        }

        await client.sendMessage(
          "[ Shop Weapon ]\n1. Mua Súng\n2. Bán Zombie\n3. Nâng Cấp Kho\n\nReply tin nhắn này và đưa ra lựa chọn của bạn",
          event.threadID,
          (_error: any, info: any) => {
            if (!main.onReply) main.onReply = new Map();
            main.onReply.set(info.messageID, {
              commandName,
              messageID: info.messageID,
              author: event.senderID,
              type: "shop",
            });
          },
          event.messageID
        );
        break;
      }

      case "prison":
      case "-p": {
        if (!dataUser.new) {
          await client.sendMessage(
            "[ ZWAR ] - Bạn chưa có mặt trên chiến trường",
            event.threadID,
            event.messageID
          );
          return;
        }

        const listCritters =
          (dataUser.critters || [])
            .map(
              (gun, index) =>
                `${index + 1}/ ${gun.name} : ${gun.size}cm - ${gun.price} coins`
            )
            .join("\n") ||
          "[ ERROR ] - Hiện tại prison của bạn chưa có gì";

        await client.sendMessage(
          `[ Kho Đồ ]\n${listCritters}\n\n[ Thông Tin Súng ]\n\n[ Tên Súng ] : ${dataUser.weapon?.name || "Chưa có"}\n[ Số đạn Còn Lại ] : ${dataUser.weapon?.duribility || 0} lần bắn\n[ Tình trạng ] : ${dataUser.weapon?.duribility == 0 ? "Đã hết đạn" : "Hoạt động tốt!"}\n\n[ prison Info ]\n\nSlots: ${(dataUser.critters || []).length} / ${dataUser.size}\nTình trạng: ${(dataUser.critters || []).length == dataUser.size ? "Túi đã đầy" : "Túi vẫn còn chỗ trống"}`,
          event.threadID,
          event.messageID
        );
        break;
      }

      case "help": {
        await client.sendMessage(
          `[ Zombie War ]\nMột trò chơi giải trí về zombie, cầm súng lên và vào chiến trường chiến đấu với zombie nào.\n\nHướng dẫn chơi Zombie War:\n${config.PREFIX}${commandName} register -> Để đăng kí vào chiến trường\n${config.PREFIX}${commandName} shop -> Để mua trang bị\n${config.PREFIX}${commandName} prison -> Xem những zombie bạn đã bắt được\n\nĐể chiến đầu với zombie hãy sử dụng ${a}${commandName}`,
          event.threadID,
          event.messageID
        );
        break;
      }

      default: {
        try {
          if (!dataUser.new) {
            await client.sendMessage(
              `[ ZWAR ] - Bạn chưa có mặt trên chiến trường\nDùng ${config.PREFIX}${commandName} register để đăng ký`,
              event.threadID,
              event.messageID
            );
          }

          if (dataUser.weapon?.price === 0) {
            await client.sendMessage(
              `[ ZWAR ] - Bạn chưa có súng\nDùng ${config.PREFIX}${commandName} shop để mua súng`,
              event.threadID,
              event.messageID
            );
          }

          if (dataUser.time) {
            const timeValue =
              typeof dataUser.time === "string"
                ? new Date(dataUser.time)
                : dataUser.time;
            const cooldown = Math.floor(
              Math.abs(Number(timeValue) - Number(new Date())) / 1000 / 60
            );

            if (cooldown < (dataUser.weapon?.time || 0)) {
              await client.sendMessage(
                "[ ZWAR ] - Bạn đang trong thời gian chờ, hãy thử lại sau!",
                event.threadID,
                event.messageID
              );
              return;
            }
          }

          if ((dataUser.weapon?.duribility || 0) < 1) {
            dataUser.weapon = emptygun;
            if (userDat) {
              await userData.update(event.senderID, {
                data: { ...userDat.data, zwar: dataUser },
              });
            }

            await client.sendMessage(
              "[ ZWAR ] - Súng của bạn đã hỏng, hãy mua súng mới",
              event.threadID,
              event.messageID
            );
          }

          const zombieRarity = getRarity();
          const zombieData = await getZombie(
            zombieRarity,
            new Date().getHours(),
            new Date().getMonth()
          );

          if (!zombieData.length) {
            await client.sendMessage(
              "[ ZWAR ] - Hiện tại không có zombie để bắn",
              event.threadID,
              event.messageID
            );
          }

          const caughtZombie = zombieData[Math.floor(Math.random() * zombieData.length)];
          if (!caughtZombie) {
            await client.sendMessage(
              "[ ZWAR ] - Không thể bắt zombie!",
              event.threadID,
              event.messageID
            );
            return;
          }
          const caught = { ...caughtZombie };

          let zombieSize: number;
          if (Array.isArray(caught.size)) {
            zombieSize = parseFloat(
              (
                Math.random() * (caught.size[1] - caught.size[0]) +
                caught.size[0]
              ).toFixed(1)
            );
          } else {
            zombieSize = typeof caught.size === "number" ? caught.size : 0;
          }

          if ((dataUser.size || 0) > (dataUser.critters || []).length) {
            const critter: Critter = {
              name: caught.name,
              size: zombieSize,
              price: caught.price || 0,
              rarity: caught.rarity || undefined,
              catch: caught.catch || undefined,
            };

            dataUser.critters = dataUser.critters || [];
            dataUser.critters.push(critter);

            if (dataUser.weapon) {
              dataUser.weapon.duribility -= 1;
            }

            dataUser.time = new Date();

            const updatedUserDat = await userData.get(event.senderID);
            if (updatedUserDat && updatedUserDat.data) {
              await userData.update(event.senderID, {
                data: { ...updatedUserDat.data, zwar: dataUser },
              });
            }

            const nameUserData = await userData.get(event.senderID);
            const nameUser = nameUserData?.name || "Người chơi";

            await client.sendMessage(
              `[ ZWAR ] - Bạn đã bắt được ${caught.name}\n\n[ Thông Tin Chung ]\nNgười bắt: ${nameUser}\nKích cỡ: ${critter.size}m\nĐộ Hiếm Zombie: ${caught.rarity}\nMô Tả: ${caught.catch}\nGiá trị: ${formatCurrency(caught.price)}`,
              event.threadID,
              event.messageID
            );
          } else {
            await client.sendMessage(
              "[ ZWAR ] - Túi của bạn không còn đủ không gian lưu trữ!",
              event.threadID,
              event.messageID
            );
          }
        } catch (e) {
          console.log(e);
          await client.sendMessage(
            "Đã xảy ra lỗi!",
            event.threadID,
            event.messageID
          );
        }
      }
    }
  },
};

export default zwarCommand;
