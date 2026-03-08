"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnLoadContext,
  CommandOnReplyContext,
} from "@types";
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import { storagePath } from "../../../core/storagePath";

interface UserData {
  name: string;
  ID: string;
  mainROD: string | null;
  GPS: {
    locate: string | null;
    area: string | null;
  };
  fishBag: FishItem[];
  item: Item[];
  timeRegister: string;
}

interface FishItem {
  ID: number;
  name: string;
  size: number;
  sell: number;
  category?: string;
  image?: string;
}

interface Item {
  name: string;
  price: number;
  durability: number;
  countdown: number;
  countdownData: number | null;
  image?: string;
}

interface LocationData {
  location: string;
  area: Array<{
    name: string;
    creature: Creature[];
  }>;
}

interface Creature {
  name: string;
  category: string;
  size: number;
  sell: number;
  image: string;
}

function checkPath(
  type: number,
  senderID: string
): string | Item[] | UserData {
  const pathItem = storagePath("game", "mine", "item.json");
  const pathUser = storagePath("game", "mine", "datauser", `${senderID}.json`);

  if (type == 1) return pathItem;
  if (type == 2) {
    if (!fs.existsSync(pathItem)) return [];
    return JSON.parse(fs.readFileSync(pathItem, "utf-8")) as Item[];
  }
  if (type == 3) return pathUser;
  if (type == 4) {
    if (!fs.existsSync(pathUser)) {
      return {
        name: "",
        ID: senderID,
        mainROD: null,
        GPS: { locate: null, area: null },
        fishBag: [],
        item: [],
        timeRegister: "",
      };
    }
    return JSON.parse(fs.readFileSync(pathUser, "utf-8")) as UserData;
  }
  return "";
}

async function getLocationData(): Promise<LocationData[]> {
  const data = (
    await axios.get(
      `https://raw.githubusercontent.com/J-JRT/minecraft/mainV2/data.json`
    )
  ).data;
  return data;
}

async function dataFish(a: string, b: string): Promise<Creature[]> {
  const data = await getLocationData();

  if (!Array.isArray(data)) {
    throw new Error("Data is not an array");
  }

  const loc = data.find((i) => i.location === a);
  if (!loc || !Array.isArray(loc.area)) {
    throw new Error(`Location '${a}' or area list not found`);
  }

  const are = loc.area.find((i) => i.name === b);
  if (!are || !Array.isArray(are.creature)) {
    throw new Error(`Area '${b}' or creature list not found`);
  }

  return are.creature;
}

async function downloadImage(link: string): Promise<fs.ReadStream[]> {
  const images: fs.ReadStream[] = [];

  const download = (
    await axios.get(link, {
      responseType: "arraybuffer",
      headers: {
        authority: "i.imgur.com",
        method: "GET",
        scheme: "https",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-encoding": "gzip, deflate, br, zstd",
        "accept-language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
        "cache-control": "max-age=0",
        cookie:
          "postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1",
        "if-modified-since": "Tue, 19 Apr 2022 15:39:42 GMT",
        "if-none-match": '"55ecbc13e75e5768cdb74c907882baee"',
        priority: "u=0, i",
        referer: "https://imgur.com/",
        "sec-ch-ua":
          '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-site",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      },
    })
  ).data;

  const pathImage = path.join(
    process.cwd(),
    "storage/game/mine/cache",
    `${Date.now()}.jpg`
  );

  await fs.writeFile(pathImage, Buffer.from(download));

  images.push(fs.createReadStream(pathImage) as fs.ReadStream);

  return images;
}

async function getSubnauticaImage(): Promise<fs.ReadStream[]> {
  const images: fs.ReadStream[] = [];

  const download = (
    await axios.get("https://i.imgur.com/vnXze66.jpg", {
      responseType: "arraybuffer",
      headers: {
        authority: "i.imgur.com",
        method: "GET",
        scheme: "https",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-encoding": "gzip, deflate, br, zstd",
        "accept-language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
        "cache-control": "max-age=0",
        cookie:
          "postpagebeta=1; frontpagebetav2=1; pp=2055108449555975; ana_id=0; is_emerald=0; is_authed=0; user_id=0; WHITELISTED_CLOSED=1",
        "if-modified-since": "Tue, 19 Apr 2022 15:39:42 GMT",
        "if-none-match": '"55ecbc13e75e5768cdb74c907882baee"',
        priority: "u=0, i",
        referer: "https://imgur.com/",
        "sec-ch-ua":
          '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-site",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      },
    })
  ).data;

  fs.writeFileSync(
    path.join(storagePath("game", "mine", "cache"), "minecraft.png"),
    Buffer.from(download, "utf-8")
  );

  images.push(
    fs.createReadStream(
      path.join(storagePath("game", "mine", "cache"), "minecraft.png")
    )
  );

  return images;
}

function getFish(): string | false {
  const rate = Math.floor(Math.random() * 100) + 1;

  if (rate <= 4) return false;
  if (rate > 4 && rate <= 34) return "Common";
  if (rate > 34 && rate <= 59) return "Uncommon";
  if (rate > 59 && rate <= 79) return "Rare";
  if (rate > 79 && rate <= 94) return "Epic";
  if (rate > 94 && rate <= 99) return "Legendary";
  if (rate > 99 && rate <= 100) return "Mythical";
  return false;
}

const mineCommand: Command = {
  name: "mine",
  alias: ["minecraft"],
  version: "2.0.1",
  role: 0,
  desc: "Minecraft mini",
  guide:
    "   • {pn} register: Đăng ký tài khoản minecraft\n   • {pn} shop: Vào cửa hàng để mua cúp và bán quặng\n   • {pn} bag: Xem túi đồ của bạn\n   • {pn} custom: Tùy chỉnh khu vực đào và cúp\n   • {pn} help: Xem hướng dẫn chi tiết",
  cd: 0,
  prefix: true,

  onLoad: async (_ctx: CommandOnLoadContext) => {
    const dir = storagePath("game", "mine");
    const dirCache = storagePath("game", "mine", "cache");
    const dirData = storagePath("game", "mine", "datauser");

    if (!fs.existsSync(dir)) {
      await fs.ensureDir(dir);
    }
    if (!fs.existsSync(dirData)) {
      await fs.ensureDir(dirData);
    }
    if (!fs.existsSync(dirCache)) {
      await fs.ensureDir(dirCache);
    }

    if (!fs.existsSync(path.join(dir, "data.json"))) {
      const response = await axios({
        url: "https://raw.githubusercontent.com/KhangGia1810/mine123/main/data.json",
        method: "GET",
        responseType: "stream",
      });
      const writer = fs.createWriteStream(path.join(dir, "data.json"));
      response.data.pipe(writer);
      await new Promise<void>((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
    }

    if (!fs.existsSync(path.join(dir, "item.json"))) {
      const response = await axios({
        url: "https://raw.githubusercontent.com/KhangGia1810/mine123/main/item.json",
        method: "GET",
        responseType: "stream",
      });
      const writer = fs.createWriteStream(path.join(dir, "item.json"));
      response.data.pipe(writer);
      await new Promise<void>((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
    }
  },

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { client: api, event, args, userData, config, main, commandName } = ctx;
    const { threadID, messageID, senderID } = event;

    const pathData = path.join(
      process.cwd(),
      "storage/game",
      "mine",
      "datauser",
      `${senderID}.json`
    );

    switch (args[0]) {
      case "register":
      case "-r": {
        const nDate = new Date().toLocaleString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
        });

        if (!fs.existsSync(pathData)) {
          const userInfo = await userData.get(senderID);
          const obj: UserData = {
            name: userInfo?.name || "Người dùng",
            ID: senderID,
            mainROD: null,
            GPS: {
              locate: null,
              area: null,
            },
            fishBag: [],
            item: [],
            timeRegister: nDate,
          };

          obj.fishBag.push({
            ID: 0,
            name: "Bedrock",
            size: 999999,
            sell: 0,
          });

          fs.writeFileSync(pathData, JSON.stringify(obj, null, 4));
          const msg = {
            body: "[ Minecraft ] - Đăng ký Minecraft thành công",
            attachment: await getSubnauticaImage(),
          };
          await api.sendMessage(msg, threadID, messageID);
          return;
        } else {
          await api.sendMessage(
            {
              body: "[ Minecraft ] - Bạn đã có trong cơ sở dữ liệu",
              attachment: await getSubnauticaImage(),
            },
            threadID,
            messageID
          );
          return;
        }
      }

      case "shop":
      case "-s": {
        if (!fs.existsSync(pathData)) {
          await api.sendMessage(
            {
              body: `[ ERROR ] - Bạn chưa đăng kí tài khoản Minecraft\nDùng ${config.PREFIX}${commandName} register để đăng ký`,
              attachment: await getSubnauticaImage(),
            },
            threadID,
            messageID
          );
          return;
        }

        await api.sendMessage(
          {
            body:
              "[ Shop Villager🎫 ]\n1. ⚒️Mua cúp⛏️\n2. ⚖️Bán vật phẩm đào được\n3. Nâng cấp⚙️Sửa chửa vật phẩm🔩\n\nReply tin nhắn này với lựa chọn của bạn",
            attachment: await getSubnauticaImage(),
          },
          threadID,
          (_error: any, info: any) => {
            main.onReply.set(info.messageID, {
              commandName,
              messageID: info.messageID,
              author: event.senderID,
              type: "shop",
            });
          },
          messageID
        );
        return;
      }

      case "bag":
      case "-b": {
        if (!fs.existsSync(pathData)) {
          await api.sendMessage(
            {
              body: `[ ERROR ] - Bạn chưa đăng kí tài khoản Minecraft\nDùng ${config.PREFIX}${commandName} register để đăng ký`,
              attachment: await getSubnauticaImage(),
            },
            threadID,
            messageID
          );
          return;
        }

        const data = checkPath(4, senderID) as UserData;

        await api.sendMessage(
          {
            body: `[ Minecraft ]\n\n1. Vật Phẩm SL: ${data.fishBag.length}\n2. Cúp SL: ${data.item.length}\nVui lòng reply vật phẩm cần xem!`,
            attachment: await getSubnauticaImage(),
          },
          threadID,
          (_error: any, info: any) => {
            main.onReply.set(info.messageID, {
              commandName,
              messageID: info.messageID,
              author: event.senderID,
              type: "choosebag",
            });
          },
          messageID
        );
        return;
      }

      case "custom":
      case "-c": {
        if (!fs.existsSync(pathData)) {
          await api.sendMessage(
            {
              body: `[ ERROR ] - Bạn chưa đăng kí tài khoản Minecraft\nDùng ${config.PREFIX}${commandName} register để đăng ký`,
              attachment: await getSubnauticaImage(),
            },
            threadID,
            messageID
          );
          return;
        }

        if (args[1] == "pickaxel") {
          const data = checkPath(4, senderID) as UserData;
          let listItem = "[ Minecraft ]\n";
          let number = 1;

          for (const i of data.item) {
            listItem += `${number++}. ${i.name} - Thời gian chờ: ${i.countdown}s - Độ bền: ${i.durability}\n`;
          }

          listItem += "Vui lòng reply để chọn cúp chính của bạn!";

          await api.sendMessage(
            listItem,
            threadID,
            (_error: any, info: any) => {
              if (!main.onReply) main.onReply = new Map();
              main.onReply.set(info.messageID, {
                commandName,
                messageID: info.messageID,
                author: event.senderID,
                type: "rodMain",
                data: data,
                item: data.item,
              });
            },
            messageID
          );
          return;
        }

        if (args[1] == "locate") {
          await api.sendMessage(
            {
              body: "[ Minecraft ]\n1. The Earth\n2. Nether Worl And The End🎭",
              attachment: await getSubnauticaImage(),
            },
            threadID,
            (_error: any, info: any) => {
              if (!main.onReply) main.onReply = new Map();
              main.onReply.set(info.messageID, {
                commandName,
                messageID: info.messageID,
                author: event.senderID,
                type: "location",
              });
            },
            messageID
          );
          return;
        }
        break;
      }

      case "help": {
        await api.sendMessage(
          {
            body: `[ Minecraft ]\n${config.PREFIX}${commandName} register -> Đăng kí\n${config.PREFIX}${commandName} custom -> Lựa chọn khu vực đào\n${config.PREFIX}${commandName} bag -> Xem túi đồ\n${config.PREFIX}${commandName} shop -> Cửa hàng`,
            attachment: await getSubnauticaImage(),
          },
          threadID,
          messageID
        );
        return;
      }

      default: {
        try {
          async function checkTime(
            cooldown: number,
            dataTime: number
          ): Promise<void> {
            if (cooldown - (Date.now() - dataTime) > 0) {
              const time = cooldown - (Date.now() - dataTime);
              const minutes = Math.floor(time / 60000);
              const seconds = ((time % 60000) / 1000).toFixed(0);
              await api.sendMessage(
                `Vui lòng mua cúp cấp bậc cao hơn để đào liên tiếp trong thời gian ngắn!\n⌚Chờ gian chờ còn lại: ${minutes}:${seconds}!`,
                threadID,
                messageID
              );
            }
          }

          if (!fs.existsSync(pathData)) {
            await api.sendMessage(
              {
                body: `[ ERROR ] - Bạn chưa đăng kí tài khoản Minecraft\nDùng ${config.PREFIX}${commandName} register để đăng ký`,
                attachment: await getSubnauticaImage(),
              },
              threadID,
              messageID
            );
            return;
          }

          const data = checkPath(4, senderID) as UserData;

          if (data.item.length == 0) {
            await api.sendMessage(
              "Bạn chưa có cúp, vui lòng vào mine shop để mua!",
              threadID,
              messageID
            );
            return;
          }

          if (data.mainROD == null) {
            await api.sendMessage(
              `Bạn chưa chọn cúp để đào!\nVui lòng nhập ${config.PREFIX}${commandName} custom pickaxel để chọn cúp đào!`,
              threadID,
              messageID
            );
            return;
          }

          if (data.GPS.locate == null || data.GPS.area == null) {
            await api.sendMessage(
              `Bạn chưa chọn địa điểm để đào!\nVui lòng nhập ${config.PREFIX}${commandName} custom locate để chọn địa điểm đào!`,
              threadID,
              messageID
            );
            return;
          }

          const rod = data.mainROD;
          const location = data.GPS.locate;
          const area = data.GPS.area;
          const type = getFish();

          const findRod = data.item.find((i) => i.name == rod);
          if (!findRod) {
            await api.sendMessage(
              "Không tìm thấy cúp!",
              threadID,
              messageID
            );
            return;
          }

          if (findRod.durability <= 0) {
            await api.sendMessage(
              "Cúp đã hỏng, bạn cần sửa chữa hoặc chọn cúp mới!",
              threadID,
              messageID
            );
            return;
          }

          if (findRod.countdownData) {
            await checkTime(findRod.countdown * 1000, findRod.countdownData);
          }

          findRod.countdownData = Date.now();
          findRod.durability = findRod.durability - 10;

          fs.writeFileSync(
            checkPath(3, senderID) as string,
            JSON.stringify(checkPath(4, senderID), null, 2)
          );

          if (type == false) {
            await api.sendMessage("Oh, không dính gì cả", threadID, messageID);
            return;
          }

          const fil = (await dataFish(location, area)).filter(
            (i) => i.category == type
          );

          if (fil.length == 0) {
            await api.sendMessage("Oh, không dính gì cả", threadID, messageID);
            return;
          }

          const getData = fil[Math.floor(Math.random() * fil.length)];
          if (!getData) {
            await api.sendMessage("Oh, không dính gì cả", threadID, messageID);
            return;
          }

          const userDataObj = checkPath(4, senderID) as UserData;
          const lastItem = userDataObj.fishBag[userDataObj.fishBag.length - 1];
          const IDF = lastItem ? lastItem.ID + 1 : 1;

          userDataObj.fishBag.push({
            ID: IDF,
            name: getData.name,
            category: getData.category,
            size: getData.size,
            sell: getData.sell,
            image: getData.image,
          });

          fs.writeFileSync(
            checkPath(3, senderID) as string,
            JSON.stringify(userDataObj, null, 2)
          );

          const msg = {
            body: `[ Minecraft ]\nChúc mừng bạn đã đào được\nTên: ${getData.name} (${getData.sell}$)\nLoại: ${getData.category}\nSize: ${getData.size}cm`,
            attachment: await downloadImage(getData.image),
          };

          await api.sendMessage(msg, threadID, messageID);
        } catch (e) {
          console.log(e);
        }
        break;
      }
    }
  },

  onReply: async function (ctx: CommandOnReplyContext): Promise<void> {
    const { event, client: api, userData, Reply, main, commandName } = ctx;
    const { body, threadID, messageID, senderID } = event;
    const replyData = Reply as any;
    const addMoney = userData.addMoney as ((uid: string, amount: bigint) => Promise<void>) | undefined;
    const delMoney = userData.delMoney as ((uid: string, amount: bigint) => Promise<void>) | undefined;
    const getUserData = userData.get as ((uid: string) => Promise<any>) | undefined;

    async function checkDur(
      a: string,
      b: number,
      c: string
    ): Promise<string | number> {
      const pathItem = path.join(
        process.cwd(),
        "storage/game/mine/item.json"
      );
      if (!fs.existsSync(pathItem)) return "";
      const data = JSON.parse(fs.readFileSync(pathItem, "utf-8")) as Item[];
      const find = data.find((i) => i.name == a);
      if (!find) return "";

      if (c == "rate") return (b / find.durability) * 100;
      if (c == "reset") return find.durability;
      return `${b}/${find.durability} (${((b / find.durability) * 100).toFixed(0)}%)`;
    }

    async function checkMoney(
      senderID: string,
      maxMoney: number
    ): Promise<boolean> {
      if (!getUserData) return false;
      const i = (await getUserData(senderID)) || {};
      const w = (i as any).money || 0;
      if (BigInt(w) < BigInt(parseInt(String(maxMoney)))) {
        await api.sendMessage(
          "Bạn không đủ tiền để thực hiện giao dịch này!",
          threadID,
          messageID
        );
        return false;
      }
      return true;
    }

    switch (replyData.type) {
      case "shop": {
        if (body == "1") {
          api.unsendMessage(replyData.messageID, threadID);

          const pathItem = checkPath(2, senderID) as Item[];
          let listItem = "[ SHOP ]\n";
          let number = 1;

          for (const i of pathItem) {
            listItem += `${number++}. ${i.name} (${i.price}$) - Thời gian chờ ${i.countdown} (Độ bền: ${i.durability})\n\n`;
          }

          await api.sendMessage(
            listItem +
            "Reply tin nhắn này để chọn cúp cho bạn. Mỗi lần đào trừ 10 độ bền",
            threadID,
            (_error: any, info: any) => {
              if (!main.onReply) main.onReply = new Map();
              main.onReply.set(info.messageID, {
                commandName,
                messageID: info.messageID,
                author: event.senderID,
                type: "buyfishingrod",
              });
            },
            messageID
          );
          return;
        }

        if (body == "2") {
          api.unsendMessage(replyData.messageID, threadID);

          const data = (checkPath(4, senderID) as UserData).fishBag;

          if (data.length == 0) {
            await api.sendMessage(
              "Túi của bạn không có gì cả",
              threadID,
              messageID
            );
            return;
          }

          const Common = data.filter((i) => i.category == "Common");
          const Uncommon = data.filter((i) => i.category == "Uncommon");
          const Rare = data.filter((i) => i.category == "Rare");
          const Epic = data.filter((i) => i.category == "Epic");
          const Legendary = data.filter((i) => i.category == "Legendary");
          const Mythical = data.filter((i) => i.category == "Mythical");

          const listCategory = [
            Common,
            Uncommon,
            Rare,
            Epic,
            Legendary,
            Mythical,
          ];

          await api.sendMessage(
            `Chọn loại quặng muốn bán:\n1. Common - ${Common.length}\n2. Uncommon - ${Uncommon.length}\n3. Rare - ${Rare.length}\n4. Epic - ${Epic.length}\n5. Legendary - ${Legendary.length}\n6. Mythical - ${Mythical.length}`,
            threadID,
            (_error: any, info: any) => {
              if (!main.onReply) main.onReply = new Map();
              main.onReply.set(info.messageID, {
                commandName,
                messageID: info.messageID,
                author: event.senderID,
                type: "chooseFish",
                listCategory,
              });
            },
            messageID
          );
          return;
        }

        if (body == "3") {
          api.unsendMessage(replyData.messageID, threadID);

          const data = (checkPath(4, senderID) as UserData).item;
          let msg = "[ SHOP ]\n";
          let number = 1;

          for (const i of data) {
            msg += `${number++}. ${i.name} - Độ bền: ${await checkDur(i.name, i.durability, "0")}\n`;
          }

          await api.sendMessage(
            msg + "Vui lòng reply vật phẩm muốn sửa!, giá sửa bằng 1/3 giá vật phẩm",
            threadID,
            (_error: any, info: any) => {
              if (!main.onReply) main.onReply = new Map();
              main.onReply.set(info.messageID, {
                commandName,
                messageID: info.messageID,
                author: event.senderID,
                type: "fixfishingrod",
                list: data,
              });
            },
            messageID
          );
          return;
        } else {
          await api.sendMessage(
            "Lựa chọn không hợp lệ!",
            threadID,
            messageID
          );
          return;
        }
      }

      case "choosebag": {
        api.unsendMessage(replyData.messageID, threadID);

        const data = checkPath(4, senderID) as UserData;

        if (body == "1") {
          if (data.fishBag.length == 0) {
            await api.sendMessage(
              "Trong túi của bạn không có quặng nào!",
              threadID,
              messageID
            );
            return;
          }

          let listFish = "[ Minecraft ]\n";
          let number = 1;

          for (const i of data.fishBag) {
            listFish += `${number++}. ${i.name} (${i.size}cm) - ${i.category || "N/A"} (${i.sell}$)\n`;
          }

          await api.sendMessage(listFish, threadID, messageID);
          return;
        }

        if (body == "2") {
          api.unsendMessage(replyData.messageID, threadID);

          if (data.item.length == 0) {
            await api.sendMessage(
              "Trong túi của bạn không có vật phẩm nào!",
              threadID,
              messageID
            );
            return;
          }

          let listItemm = "[ Minecraft ]\n";
          let number = 1;

          for (const i of data.item) {
            listItemm += `${number++}. ${i.name} (${i.price}$) - Độ bền: ${i.durability} (${i.countdown}s)\n`;
          }

          await api.sendMessage(listItemm, threadID, messageID);
          return;
        } else {
          await api.sendMessage(
            "Lựa chọn không hợp lệ!",
            threadID,
            messageID
          );
          return;
        }
      }

      case "rodMain": {
        const data = replyData.data as UserData;
        const item = replyData.item as Item[];

        if (
          parseInt(body || "0") > item.length ||
          parseInt(body || "0") <= 0
        ) {
          await api.sendMessage(
            "Lựa chọn không hợp lệ!",
            threadID,
            messageID
          );
          return;
        }

        api.unsendMessage(replyData.messageID, threadID);

        const selectedItem = item[parseInt(body || "0") - 1];
        if (!selectedItem) {
          await api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
          return;
        }

        data.mainROD = selectedItem.name;
        fs.writeFileSync(
          checkPath(3, senderID) as string,
          JSON.stringify(data, null, 2)
        );

        await api.sendMessage(
          `[ Minecraft ]\n- Đặt '${selectedItem.name}' thành cúp chính thành công!`,
          threadID,
          messageID
        );
        return;
      }

      case "location": {
        const dataPath = path.join(
          process.cwd(),
          "storage/game/mine/data.json"
        );
        if (!fs.existsSync(dataPath)) {
          await api.sendMessage(
            "Không tìm thấy dữ liệu!",
            threadID,
            messageID
          );
          return;
        }

        const data = JSON.parse(
          fs.readFileSync(dataPath, "utf-8")
        ) as LocationData[];

        if (body != "1" && body != "2") {
          await api.sendMessage(
            "Lựa chọn không hợp lệ!",
            threadID,
            messageID
          );
          return;
        }

        api.unsendMessage(replyData.messageID, threadID);

        const selectedData = data[parseInt(body) - 1];
        if (!selectedData) {
          await api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
          return;
        }

        let listLoca = "[ Minecraft ]\n";
        let number = 1;

        for (const i of selectedData.area) {
          listLoca += `${number++}. ${i.name}\n`;
        }

        (checkPath(4, senderID) as UserData).GPS.locate = selectedData.location;
        fs.writeFileSync(
          checkPath(3, senderID) as string,
          JSON.stringify(checkPath(4, senderID), null, 2)
        );

        let images = "";
        if (body == "1") images = "https://i.imgur.com/placeholder1.jpg";
        if (body == "2") images = "https://i.imgur.com/CxbxCy9.jpg";

        await api.sendMessage(
          {
            body: listLoca + "Vui lòng chọn vùng bạn muốn đào!",
            attachment: await downloadImage(images),
          },
          threadID,
          (_error: any, info: any) => {
            main.onReply.set(info.messageID, {
              commandName,
              messageID: info.messageID,
              author: event.senderID,
              type: "chooseArea",
              area: selectedData,
            });
          },
          messageID
        );
        return;
      }

      case "chooseArea": {
        const area = replyData.area as LocationData;
        const pathh = checkPath(4, senderID) as UserData;
        const pathhh = checkPath(3, senderID) as string;

        if (
          parseInt(body || "0") > area.area.length ||
          parseInt(body || "0") <= 0
        ) {
          await api.sendMessage(
            "Lựa chọn không hợp lệ!",
            threadID,
            messageID
          );
          return;
        }

        api.unsendMessage(replyData.messageID, threadID);

        const selectedArea = area.area[parseInt(body || "0") - 1];
        if (!selectedArea) {
          await api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
          return;
        }

        pathh.GPS.area = selectedArea.name;
        fs.writeFileSync(pathhh, JSON.stringify(pathh, null, 2));

        await api.sendMessage(
          `[ Minecraft ]\nChuyển tới vùng '${area.location} - ${selectedArea.name}' thành công`,
          threadID,
          messageID
        );
        return;
      }

      case "fixfishingrod": {
        const list = replyData.list as Item[];

        if (
          parseInt(body || "0") > list.length ||
          parseInt(body || "0") <= 0
        ) {
          await api.sendMessage(
            "Lựa chọn không hợp lệ!",
            threadID,
            messageID
          );
          return;
        }

        const rod = list[parseInt(body || "0") - 1];
        if (!rod) {
          await api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
          return;
        }

        const durRate = await checkDur(rod.name, rod.durability, "rate");
        if (typeof durRate === "number" && durRate > 75) {
          await api.sendMessage(
            "Chỉ sửa được cúp có độ bền dưới 75%",
            threadID,
            messageID
          );
          return;
        }

        api.unsendMessage(replyData.messageID, threadID);

        const repairCost = parseInt(((rod.price * 1) / 3).toFixed(0));
        const hasMoney = await checkMoney(senderID, repairCost);
        if (!hasMoney) return;

        if (delMoney) {
          await delMoney(
            senderID,
            BigInt(parseInt(((rod.price * 1) / 3).toFixed(0)))
          );
        }

        rod.durability = (await checkDur(
          rod.name,
          rod.durability,
          "reset"
        )) as number;

        fs.writeFileSync(
          checkPath(3, senderID) as string,
          JSON.stringify(checkPath(4, senderID), null, 2)
        );

        await api.sendMessage(
          `[ Minecraft ]\n- Sửa thành công ${rod.name} (${parseInt(((rod.price * 1) / 3).toFixed(0))}$)`,
          threadID,
          messageID
        );
        return;
      }

      case "buyfishingrod": {
        const pathItem = checkPath(2, senderID) as Item[];

        if (
          parseInt(body || "0") > pathItem.length ||
          parseInt(body || "0") <= 0
        ) {
          await api.sendMessage(
            "Lựa chọn không hợp lệ!",
            threadID,
            messageID
          );
          return;
        }

        const data = pathItem[parseInt(body || "0") - 1];
        if (!data) {
          await api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
          return;
        }

        const hasMoney = await checkMoney(senderID, data.price);
        if (!hasMoney) return;

        const userDataObj = checkPath(4, senderID) as UserData;
        if (userDataObj.item.some((i) => i.name == data.name)) {
          await api.sendMessage(
            "Bạn đã sở hữu vật phẩm này rồi!",
            threadID,
            messageID
          );
          return;
        }

        if (delMoney) {
          await delMoney(senderID, BigInt(data.price));
        }

        userDataObj.item.push({
          name: data.name,
          price: data.price,
          durability: data.durability,
          countdown: data.countdown,
          countdownData: null,
          image: data.image,
        });

        fs.writeFileSync(
          checkPath(3, senderID) as string,
          JSON.stringify(userDataObj, null, 2)
        );

        api.unsendMessage(replyData.messageID, threadID);

        const msg = {
          body: `Mua thành công ${data.name}\nGiá mua: ${data.price}$\nĐộ bền: ${data.durability}\nThời gian chờ: ${data.countdown}`,
          attachment: await downloadImage(data.image || ""),
        };

        await api.sendMessage(msg, threadID, messageID);
        return;
      }

      case "chooseFish": {
        const listCategory = replyData.listCategory as FishItem[][];

        if (
          parseInt(body || "0") > listCategory.length ||
          parseInt(body || "0") <= 0
        ) {
          await api.sendMessage(
            "Lựa chọn không hợp lệ!",
            threadID,
            messageID
          );
          return;
        }

        api.unsendMessage(replyData.messageID, threadID);

        const selectedCategory = listCategory[parseInt(body || "0") - 1];
        if (!selectedCategory) {
          await api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
          return;
        }

        if (selectedCategory.length == 0) {
          await api.sendMessage("Không có quặng nào hết", threadID, messageID);
          return;
        }

        let fish = "\n";
        let number = 1;

        for (const i of selectedCategory) {
          fish += `${number++}. ${i.name} (${i.size}cm) - Loại: ${i.category || "N/A"} - ${i.sell}$\n`;
        }

        await api.sendMessage(
          fish +
          "Reply số thứ tự để bán (có thể rep nhiều số) hoặc reply 'all' để bán tất cả cá!",
          threadID,
          (_error: any, info: any) => {
            main.onReply.set(info.messageID, {
              commandName,
              messageID: info.messageID,
              author: event.senderID,
              type: "sell",
              list: selectedCategory,
            });
          },
          messageID
        );
        return;
      }

      case "sell": {
        const list = replyData.list as FishItem[];

        if (
          (parseInt(body || "0") > list.length ||
            parseInt(body || "0") <= 0) &&
          body?.toLowerCase() != "all"
        ) {
          await api.sendMessage(
            "Lựa chọn không hợp lệ!",
            threadID,
            messageID
          );
          return;
        }

        api.unsendMessage(replyData.messageID, threadID);

        const bag = (checkPath(4, senderID) as UserData).fishBag;
        let coins = 0;

        if (body?.toLowerCase() == "all") {
          for (const i of list) {
            if (addMoney) {
              await addMoney(senderID, BigInt(parseInt(String(i.sell))));
            }
            coins += parseInt(String(i.sell));

            const index = (checkPath(4, senderID) as UserData).fishBag.findIndex(
              (item) => item.ID == i.ID
            );
            bag.splice(index, 1);
            fs.writeFileSync(
              checkPath(3, senderID) as string,
              JSON.stringify(checkPath(4, senderID), null, 2)
            );
          }


          const addExp = userData.addExp as ((id: string, amount: number) => Promise<number>) | undefined;
          if (addExp && coins > 0) {
            const gained = Math.max(8, Math.floor(coins / 20000));
            await addExp(senderID, gained);
          }

          await api.sendMessage(
            `Bán thành công ${list.length} quặng và thu về được ${coins}$`,
            threadID,
            messageID
          );
          return;
        } else {
          const msg = body || "";
          const chooses = msg
            .split(" ")
            .map((n) => parseInt(n))
            .filter((n) => !isNaN(n));

          let text = "[ SELL ]\n";
          let number = 1;

          for (const i of chooses) {
            const listItem = list[i - 1];
            if (!listItem) continue;

            const index = (checkPath(4, senderID) as UserData).fishBag.findIndex(
              (item) => item.ID == listItem.ID
            );
            if (index === -1 || !bag[index]) continue;

            text += `${number++}. ${bag[index].name} +${bag[index].sell}$\n`;

            coins += parseInt(String(bag[index].sell));

            if (addMoney) {
              await addMoney(
                senderID,
                BigInt(parseInt(String(bag[index].sell)))
              );
            }
            bag.splice(index, 1);
            fs.writeFileSync(
              checkPath(3, senderID) as string,
              JSON.stringify(checkPath(4, senderID), null, 2)
            );
          }


          const addExp = userData.addExp as ((id: string, amount: number) => Promise<number>) | undefined;
          if (addExp && coins > 0) {
            const gained = Math.max(5, Math.floor(coins / 25000));
            await addExp(senderID, gained);
          }

          await api.sendMessage(text + `\nThu về được ${coins}$`, threadID, messageID);
          return;
        }
      }

      default: {
        api.unsendMessage(replyData.messageID, threadID);
        await api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        return;
      }
    }
  },
};

export default mineCommand;
