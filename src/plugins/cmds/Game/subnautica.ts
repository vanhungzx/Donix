import type { CommandOnCallContext, CommandOnReactContext, CommandOnReplyContext, FacebookClient } from '@types';
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import type { Readable } from "stream";
import { storagePath } from "../../../core/storagePath";

const CAUCA_DIR = storagePath("game", "cauca");

interface FishItem {
  ID: number;
  name: string;
  size: number;
  sell: number;
  category?: string;
  image?: string;
  weight?: number;
}

interface RodItem {
  name: string;
  price: number | string;
  durability: number;
  countdown: number;
  luck: number;
  countdownData?: number | null;
  image?: string;
}

interface EquipmentItem {
  name: string;
  price: number | string;
  countdownDecrease: number;
  luck: number;
  priceIncrease: number;
  description: string;
  image?: string;
}

interface GPSData {
  locate: string | null;
  area: string | null;
}

interface UserGameData {
  name: string;
  ID: string;
  mainROD: string | null;
  accessory: string | null;
  GPS: GPSData;
  fishBag: FishItem[];
  item: RodItem[];
  equipments: EquipmentItem[];
  point: FishItem[];
  timeRegister: string;
}

interface LocationData {
  location: string;
  area: Array<{
    name: string;
    creature: FishItem[];
  }>;
}

interface ReplyDataExtended {
  commandName: string;
  messageID: string;
  author: string;
  type: string;
  data?: UserGameData;
  item?: RodItem[] | EquipmentItem[];
  list?: RodItem[] | FishItem[];
  listCategory?: FishItem[][];
  area?: LocationData;
}

const subnautica = {
  name: "subnautica",
  alias: ["subnau"],
  version: "5.0.0",
  role: 0,
  desc: "Câu cá ở một hành tinh khác, dựa theo tựa game Subnautica khiến bạn đái ra máu vì độ đa dạng của nó UwU",
  guide:
    "• {pn} register/-r: Đăng ký tài khoản câu cá\n" +
    "• {pn} shop/-s: Mở cửa hàng mua bán\n" +
    "• {pn} bag/-b: Xem túi đồ của bạn\n" +
    "• {pn} custom/-c: Tùy chỉnh trang bị\n" +
    "  - custom harpoon: Chọn vũ khí chính\n" +
    "  - custom equip: Chọn phụ kiện\n" +
    "  - custom locate: Chọn địa điểm câu\n" +
    "• {pn} info: Xem thông tin tài khoản\n" +
    "• {pn} top: Xem bảng xếp hạng\n" +
    "• {pn} history: Xem lịch sử câu cá\n",
  cd: 0,
  prefix: true,
  checkPath(type: number, senderID: string) {
    const pathItem = path.join(CAUCA_DIR, "item.json");
    const pathUser = path.join(CAUCA_DIR, "datauser", `${senderID}.json`);
    const pathUser_1 = fs.existsSync(pathUser) ? JSON.parse(fs.readFileSync(pathUser, "utf8")) : null;
    const pathItem_1 = fs.existsSync(pathItem) ? JSON.parse(fs.readFileSync(pathItem, "utf8")) : null;
    const pathEquipment = path.join(CAUCA_DIR, "equipment.json");
    const pathEquipment_1 = fs.existsSync(pathEquipment) ? JSON.parse(fs.readFileSync(pathEquipment, "utf8")) : null;
    if (type == 1) return pathItem;
    if (type == 2) return pathItem_1;
    if (type == 3) return pathUser;
    if (type == 4) return pathUser_1;
    if (type == 5) return pathEquipment_1;
    return null;
  },
  onLoad: async () => {
    const dir = CAUCA_DIR;
    const dirCache = path.join(CAUCA_DIR, "cache");
    const dirData = path.join(CAUCA_DIR, "datauser");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(dirData)) fs.mkdirSync(dirData, { recursive: true });
    if (!fs.existsSync(dirCache)) fs.mkdirSync(dirCache, { recursive: true });
    if (!fs.existsSync(path.join(dir, "item.json")))
      (await axios({
        url: "https://raw.githubusercontent.com/theguardian132/subnautica/main/datasub.json",
        method: "GET",
        responseType: "stream",
      })).data.pipe(fs.createWriteStream(path.join(dir, "data.json")));
    if (!fs.existsSync(path.join(dir, "item.json")))
      (await axios({
        url: "https://raw.githubusercontent.com/theguardian132/subnautica/main/itemsub.json",
        method: "GET",
        responseType: "stream",
      })).data.pipe(fs.createWriteStream(path.join(dir, "item.json")));
    if (!fs.existsSync(path.join(dir, "item.json")))
      (await axios({
        url: "https://raw.githubusercontent.com/theguardian132/subnautica/main/equipment.json",
        method: "GET",
        responseType: "stream",
      })).data.pipe(fs.createWriteStream(path.join(dir, "equipment.json")));
    return;
  },
  onCall: async function (ctx: CommandOnCallContext) {
    const { client: api, event, args, userData, main } = ctx;
    const { threadID, messageID, senderID } = event;
    const { writeFileSync, existsSync, readdirSync } = fs;
    const pathData = path.join(CAUCA_DIR, "datauser", `${senderID}.json`);
    switch (args[0]) {
      case "register":
      case "-r": {
        const nDate = new Date().toLocaleString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
        });
        if (!existsSync(pathData)) {
          const userInfo = await userData.get(senderID);
          const userName = userInfo?.name || "Unknown";
          const obj: UserGameData = {
            name: userName,
            ID: senderID,
            mainROD: null,
            accessory: null,
            GPS: {
              locate: null,
              area: null,
            },
            fishBag: [],
            item: [],
            equipments: [],
            point: [],
            timeRegister: nDate,
          };
          obj.fishBag.push({
            ID: 0,
            name: "Đừng bán con cá này ko là lỗi tao đéo chịu trách nhiệm đâu",
            size: 999999,
            sell: 0,
          });
          obj.point.push({
            ID: 0,
            name: "Đừng bán con cá này ko là lỗi tao đéo chịu trách nhiệm đâu",
            size: 999999,
            sell: 0,
          });
          writeFileSync(pathData, JSON.stringify(obj, null, 4));
          const msg = { body: "(•𝗦𝗨𝗕𝗡𝗔𝗨𝗧𝗜𝗖𝗔•)\n⚔️Đ𝔞̆𝔫𝔤 𝔨𝔦́ 𝔠𝔞̂𝔲 𝔠𝔞́ 𝔱𝔥𝔞̀𝔫𝔥 𝔠𝔬̂𝔫𝔤⚔️\nIt's time to duel!!!", attachment: await this.subnautica() };
          return api.sendMessage(msg, threadID, messageID);
        } else {
          return api.sendMessage(
            { body: "==[𝗦𝗨𝗕𝗡𝗔𝗨𝗧𝗜𝗖𝗔]==\n⚔️Bạn đã có trong cơ sở dữ liệu⚔️", attachment: await this.subnautica() },
            threadID,
            messageID,
          );
        }
      }
      case "shop":
      case "-s": {
        if (!existsSync(pathData)) {
          return api.sendMessage(
            {
              body: "(•𝗦𝗨𝗕𝗡𝗔𝗨𝗧𝗜𝗖𝗔•)\n⚔️Bạn chưa đăng kí tài khoản câu cá!\n Nhập /subnautica -r để đăng kí",
              attachment: await this.subnautica(),
            },
            threadID,
            messageID,
          );
        }
        return api.sendMessage(
          {
            body: "=====[𝗦𝗛𝗢𝗣]=====\n-----------------------\n1. Mua phóng lao và đinh ba\n2. Bán vật phẩm câu được\n3. Nâng cấp/Sửa chửa phóng lao\n4. Mua phụ kiện\n-----------------------\n<Reply tin nhắn này với lựa chọn của bạn>",
            attachment: await this.subnautica(),
          },
          threadID,
          (_error?: Error, info?: { messageID?: string }) => {
            if (info?.messageID) {
              main.onReply.set(info.messageID, {
                commandName: "subnautica",
                messageID: info.messageID,
                author: event.senderID,
                type: "shop",
              });
            }
          },
          messageID,
        );
      }
      case "bag":
      case "-b": {
        if (!existsSync(pathData)) {
          return api.sendMessage(
            {
              body: "<(𝗦𝗨𝗕𝗡𝗔𝗨𝗧𝗜𝗖𝗔)>\n⚔️Bạn chưa đăng kí tài khoản câu cá!\nNhập /subnautica register hoặc -r",
              attachment: await this.subnautica(),
            },
            threadID,
            messageID,
          );
        }
        const data = this.checkPath(4, senderID);
        return api.sendMessage(
          {
            body: `<(𝗦𝗨𝗕𝗡𝗔𝗨𝗧𝗜𝗖𝗔)>\n----------------\n1. Cá (SL: ${data.fishBag.length})\n2. Cần câu (SL: ${data.item.length})\nVui lòng reply vật phẩm cần xem!`,
            attachment: await this.subnautica(),
          },
          threadID,
          (_error?: Error, info?: { messageID?: string }) => {
            if (info?.messageID) {
              main.onReply.set(info.messageID, {
                commandName: "subnautica",
                messageID: info.messageID,
                author: event.senderID,
                type: "choosebag",
              });
            }
          },
          messageID,
        );
      }
      case "custom":
      case "-c": {
        if (!existsSync(pathData)) {
          return api.sendMessage(
            {
              body: "<(𝗦𝗨𝗕𝗡𝗔𝗨𝗧𝗜𝗖𝗔)>\n⚔️Bạn chưa đăng kí tài khoản câu cá!\nNhập /subnautica register hoặc -r",
              attachment: await this.subnautica(),
            },
            threadID,
            messageID,
          );
        }
        if (args[1] == "harpoon") {
          const data = this.checkPath(4, senderID);
          let listItem = "<(•𝗦𝗨𝗕𝗡𝗔𝗨𝗧𝗜𝗖𝗔•)>\n_______________\n";
          let number = 1;
          for (const i of data.item) {
            listItem += `➤${number++}: ${i.name} - Thời gian chờ: ${i.countdown}s - Độ bền: ${i.durability}\n`;
          }
          listItem += "Vui lòng reply để chọn cần vũ khí chính của bạn!";
          return api.sendMessage(
            listItem,
            threadID,
            (_error?: Error, info?: { messageID?: string }) => {
              if (info?.messageID) {
                main.onReply.set(info.messageID, {
                  commandName: "subnautica",
                  messageID: info.messageID,
                  author: event.senderID,
                  type: "rodMain",
                  data,
                  item: data.item,
                });
              }
            },
            messageID,
          );
        }
        if (args[1] == "equip") {
          const data = this.checkPath(4, senderID);
          let listItem = "<(•𝗘𝗤𝗨𝗜𝗣𝗠𝗘𝗡𝗧𝗦•)>\n______________\n";
          let number = 1;
          for (const i of data.equipments) {
            listItem += `${number++}. ${i.name}\n- Mô tả: ${i.description}\n`;
          }
          listItem += "Vui lòng reply để chọn cần phụ kiện của bạn!";
          return api.sendMessage(
            listItem,
            threadID,
            (_error?: Error, info?: { messageID?: string }) => {
              if (info?.messageID) {
                main.onReply.set(info.messageID, {
                  commandName: "subnautica",
                  messageID: info.messageID,
                  author: event.senderID,
                  type: "equipMain",
                  data,
                  item: data.equipments,
                });
              }
            },
            messageID,
          );
        }
        if (args[1] == "locate") {
          return api.sendMessage(
            {
              body: "==[𝗟𝗢𝗖𝗔𝗧𝗜𝗢𝗡]==\n1. The Crater🌏\n2. Sector Zero❄️\n3. ԱហҠហටచហ\n-------------------\n>Reply kèm STT để chọn khu vực",
              attachment: await this.subnautica(),
            },
            threadID,
            (_error?: Error, info?: { messageID?: string }) => {
              if (info?.messageID) {
                main.onReply.set(info.messageID, {
                  commandName: "subnautica",
                  messageID: info.messageID,
                  author: event.senderID,
                  type: "location",
                });
              }
            },
            messageID,
          );
        }
        return;
      }
      case "help": {
        return api.sendMessage(
          {
            body:
              "==[𝗦𝗨𝗕𝗡𝗔𝗨𝗧𝗜𝗖𝗔]==\n-----------------\n- register/-r: Đăng kí\n- custom/-c: custom harpoon để trang bị lao, custom equip để trang bị phụ kiện, custom locate để đặt vị trí câu\n- bag: Xem túi đồ\n- shop/-s: Cửa hàng\n\n=====D-Jukie=====",
            attachment: await this.subnautica(),
          },
          threadID,
          messageID,
        );
      }
      case "info": {
        const data = this.checkPath(4, senderID);
        const dataRank = this.checkPath(4, senderID).point;
        if (data.length == 0) return api.sendMessage("No Information", threadID, messageID);
        const Common = dataRank.filter((i: FishItem) => i.category == "Common");
        const Uncommon = dataRank.filter((i: FishItem) => i.category == "Uncommon");
        const Rare = dataRank.filter((i: FishItem) => i.category == "Rare");
        const Epic = dataRank.filter((i: FishItem) => i.category == "Epic");
        const Legendary = dataRank.filter((i: FishItem) => i.category == "Legendary");
        const Mythical = dataRank.filter((i: FishItem) => i.category == "Mythical");
        const Spectral = dataRank.filter((i: FishItem) => i.category == "Spectral");
        const Etherial = dataRank.filter((i: FishItem) => i.category == "Etherial");
        const Unknown = dataRank.filter((i: FishItem) => i.category == "Unknown");
        const Unreal = dataRank.filter((i: FishItem) => i.category == "Unreal");
        const exp = Math.floor(
          Common.length +
          2 * Uncommon.length +
          4 * Rare.length +
          8 * Epic.length +
          16 * Legendary.length +
          80 * Mythical.length +
          800 * Spectral.length +
          8000 * Etherial.length +
          16000 * Unknown.length +
          80000 * Unreal.length,
        );
        let rank = "";
        if (exp >= 1) rank = "Sắt I";
        if (exp >= 10) rank = "Sắt II";
        if (exp >= 30) rank = "Sắt III";
        if (exp >= 60) rank = "Sắt IV";
        if (exp >= 100) rank = "Sắt V";
        if (exp >= 150) rank = "Đồng I";
        if (exp >= 210) rank = "Đồng II";
        if (exp >= 280) rank = "Đồng III";
        if (exp >= 360) rank = "Bạc I";
        if (exp >= 450) rank = "Bạc II";
        if (exp >= 550) rank = "Bạc III";
        if (exp >= 660) rank = "Vàng I";
        if (exp >= 780) rank = "Vàng II";
        if (exp >= 910) rank = "Vàng III";
        if (exp >= 1050) rank = "Bạch Kim I";
        if (exp >= 1200) rank = "Bạch Kim II";
        if (exp >= 1400) rank = "Bạch Kim III";
        if (exp >= 1800) rank = "Kim Cương I";
        if (exp >= 3000) rank = "Kim Cương II";
        if (exp >= 5000) rank = "Kim Cương III";
        if (exp >= 8000) rank = "Tinh Anh I";
        if (exp >= 11000) rank = "Tinh Anh II";
        if (exp >= 15000) rank = "Tinh Anh III";
        if (exp >= 20000) rank = "Cao Thủ I";
        if (exp >= 30000) rank = "Cao Thủ II";
        if (exp >= 45000) rank = "Cao Thủ III";
        if (exp >= 60000) rank = "Chiến Tướng";
        if (exp >= 100000) rank = "Cần Thủ Chi Thần";
        return api.sendMessage(
          {
            body: `==[𝙄𝙣𝙛𝙤 𝙐𝙨𝙚𝙧]==\n------------------\n- Name: ${data.name}\n- Rank: ${rank} - ${exp}\n- ID: ${data.ID}\n- Weapon: ${data.mainROD != null ? data.mainROD : "Đéo có"
              }\n- Storage: ${data.fishBag.length != null ? data.fishBag.length : "0"}/100\n- Location: ${data.GPS.locate != null ? data.GPS.locate : "Không"
              } - ${data.GPS.area != null ? data.GPS.area : "Không"}\n- Item: ${data.item.length}\n- Số cá đã câu được: ${data.point.length
              }\n- Time created: ${data.timeRegister} \n\n===D-Jukie - Heo Rừng===`,
            attachment: await this.subnautica(),
          },
          threadID,
          messageID,
        );
      }
      case "history": {
        const data = this.checkPath(4, senderID).point;
        if (data.length == 0) return api.sendMessage("No Information", threadID, messageID);
        const Common = data.filter((i: FishItem) => i.category == "Common");
        const Uncommon = data.filter((i: FishItem) => i.category == "Uncommon");
        const Rare = data.filter((i: FishItem) => i.category == "Rare");
        const Epic = data.filter((i: FishItem) => i.category == "Epic");
        const Legendary = data.filter((i: FishItem) => i.category == "Legendary");
        const Mythical = data.filter((i: FishItem) => i.category == "Mythical");
        const Spectral = data.filter((i: FishItem) => i.category == "Spectral");
        const Etherial = data.filter((i: FishItem) => i.category == "Etherial");
        const Unknown = data.filter((i: FishItem) => i.category == "Unknown");
        return api.sendMessage(
          {
            body: `Thành tích hiện tại:\n1. Common - ${Common.length}\n2. Uncommon - ${Uncommon.length}\n3. Rare - ${Rare.length}\n4. Epic - ${Epic.length}\n5. Legendary - ${Legendary.length}\n6. Mythical - ${Mythical.length}\n7. Spectral - ${Spectral.length}\n8. Etherial - ${Etherial.length}\n9. Unknown - ${Unknown.length}\nTổng số cá: ${data.length - 1
              }\nĐiểm Thành tựu: ${Common.length +
              2 * Uncommon.length +
              4 * Rare.length +
              8 * Epic.length +
              16 * Legendary.length +
              80 * Mythical.length +
              800 * Spectral.length +
              8000 * Etherial.length +
              16000 * Unknown.length
              }`,
            attachment: await this.subnautica(),
          },
          threadID,
          messageID,
        );
      }
      case "top": {
        if (!existsSync(pathData)) {
          return api.sendMessage(
            {
              body: "Bạn chưa đăng kí tài khoản!\n Nhập /subnautica register để đăng kí",
              attachment: await this.image("https://i.pinimg.com/originals/b6/f1/1f/b6f11fb474e1e6058489fb3c6357039a.gif"),
            },
            threadID,
            messageID,
          );
        }
        try {
          const data = readdirSync(path.join(CAUCA_DIR, "datauser"));
          if (data.length < 3) return api.sendMessage(`Cần ít nhất có 3 người chơi trên server để xem top`, threadID, messageID);
          const p: UserGameData[] = [];
          for (const i of data) {
            const o = require(path.join(CAUCA_DIR, "datauser", i)) as UserGameData;
            p.push(o);
          }
          p.sort((a, b) => b.point.length - a.point.length);
          let msg = "===TOP 3 NGƯỜI CHƠI CÂU NHIỀU CÁ NHẤT===\n";
          for (let i = 0; i < 3; i++) {
            msg += `${i + 1}. ${p[i].name} với ${p[i].point.length} con\n`;
          }
          return api.sendMessage(msg, threadID, messageID);
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          console.log(e);
          return api.sendMessage(
            {
              body: errorMessage,
            },
            threadID,
            messageID,
          );
        }
      }
      default: {
        const checkTime = async (cooldown: number, dataTime: number) => {
          if (cooldown - (Date.now() - dataTime) > 0) {
            const time = cooldown - (Date.now() - dataTime);
            const minutes = Math.floor(time / 60000);
            const seconds = ((time % 60000) / 1000).toFixed(0);
            api.sendMessage(
              `⏰ Vui lòng mua phóng lao cấp bậc cao hơn để câu liên tiếp trong thời gian ngắn!\n⌚Chờ gian chờ còn lại: ${minutes}:${seconds}!`,
              threadID,
              messageID,
            );
            return false;
          }
          return true;
        };
        if (!existsSync(pathData)) {
          return api.sendMessage(
            {
              body:
                "-<(𝗦𝗨𝗕𝗡𝗔𝗨𝗧𝗜𝗖𝗔)>-\n⚔️Bạn chưa đăng kí tài khoản câu cá!\nNhập /subnautica register hoặc -r",
              attachment: await this.subnautica(),
            },
            threadID,
            messageID,
          );
        }
        let data = this.checkPath(4, senderID);
        if (data.item.length == 0)
          return api.sendMessage(
            {
              body: `
✨=====【 𝗦𝗛𝗢𝗣 𝗣𝗛𝗜ÊU 𝗟ƯU 】=====✨
-----------------------------------
1️⃣ Mua phóng lao và đinh ba sắc bén
2️⃣ Bán những vật phẩm quý báu bạn câu được
3️⃣ Nâng cấp hoặc sửa chữa phóng lao của bạn
4️⃣ Mua phụ kiện hỗ trợ săn bắt hiệu quả hơn
-----------------------------------
🚫 Bạn chưa có phóng lao nào!
📝 Hãy trả lời tin nhắn này với lựa chọn của bạn để bắt đầu cuộc phiêu lưu ngay!
`,
            },
            threadID,
            (_error?: Error, info?: { messageID?: string }) => {
              if (info?.messageID) {
                main.onReply.set(info.messageID, {
                  commandName: "subnautica",
                  messageID: info.messageID,
                  author: event.senderID,
                  type: "shop",
                });
              }
            },
            messageID,
          );
        if (data.fishBag.length >= 40) {
          return api.sendMessage(
            `Hiện đã đầy túi, mau bán bớt cá không nó nổ kho chết con mẹ mày giờ thằng ngu\nThả cảm xúc bất kì vào đây để mở kho cá`,
            threadID,
            (_error?: Error, info?: { messageID?: string }) => {
              if (info?.messageID) {
                main.onReply.set(info.messageID, {
                  commandName: "subnautica",
                  messageID: info.messageID,
                  author: event.senderID,
                  type: "typeFull",
                });
              }
            },
            messageID,
          );
        }
        if (data.mainROD == null) {
          data = this.checkPath(4, senderID);
          let listItem = "<(•𝗦𝗨𝗕𝗡𝗔𝗨𝗧𝗜𝗖𝗔•)>\n_______________\n";
          let number = 1;
          for (const i of data.item) {
            listItem += `➤${number++}: ${i.name} - Thời gian chờ: ${i.countdown}s - Độ bền: ${i.durability}\n`;
          }
          listItem += `Bạn chưa chọn phóng lao để câu cá!\nVui lòng reply để chọn cần vũ khí chính của bạn!`;
          return api.sendMessage(
            listItem,
            threadID,
            (_error?: Error, info?: { messageID?: string }) => {
              if (info?.messageID) {
                main.onReply.set(info.messageID, {
                  commandName: "subnautica",
                  messageID: info.messageID,
                  author: event.senderID,
                  type: "rodMain",
                  data,
                  item: data.item,
                });
              }
            },
            messageID,
          );
        }
        if (data.GPS.locate == null || data.GPS.area == null) {
          return api.sendMessage(
            {
              body:
                "==[𝗟𝗢𝗖𝗔𝗧𝗜𝗢𝗡]==\n1. The Crater🌏\n2. Sector Zero❄️\n3. ԱហҠហටచហ\n-------------------\n>Reply kèm STT để chọn khu vực\nBạn chưa chọn địa điểm để câu cá!\nVui lòng Reply để chọn địa điểm câu!",
            },
            threadID,
            (_error?: Error, info?: { messageID?: string }) => {
              if (info?.messageID) {
                main.onReply.set(info.messageID, {
                  commandName: "subnautica",
                  messageID: info.messageID,
                  author: event.senderID,
                  type: "location",
                });
              }
            },
            messageID,
          );
        }
        const rod = data.mainROD;
        const equip = data.accessory;
        const findEquip = data.equipments.find((i: EquipmentItem) => i.name == equip);
        const location = data.GPS.locate;
        const area = data.GPS.area;
        data = this.checkPath(4, senderID) as UserGameData;
        const findRod = data.item.find((i: RodItem) => i.name == rod);
        if (!findRod) return api.sendMessage("Không tìm thấy vũ khí!", threadID, messageID);
        const equipLuck = equip != null && findEquip ? findEquip.luck : 0;
        const rate =
          Math.floor(
            Math.random() * (100006 - (findRod.luck + equipLuck)),
          ) + (findRod.luck + equipLuck);
        let type: string | false = false;
        if (rate > 4000 && rate <= 34000) type = "Common";
        else if (rate > 34000 && rate <= 59000) type = "Uncommon";
        else if (rate > 59000 && rate <= 79000) type = "Rare";
        else if (rate > 79000 && rate <= 94000) type = "Epic";
        else if (rate > 94000 && rate <= 99000) type = "Legendary";
        else if (rate > 99000 && rate <= 99890) type = "Mythical";
        else if (rate > 99890 && rate <= 99990) type = "Spectral";
        else if (rate > 99990 && rate <= 100000) type = "Etherial";
        else if (rate > 100000 && rate <= 100005) type = "Unknown";
        else if (rate > 100005 && rate <= 100006) type = "Unreal";
        if (findRod.durability <= 0) return api.sendMessage("Vũ khí đã hỏng, bạn cần sửa chữa hoặc chọn một thanh mới!", threadID, messageID);
        const isReady = await checkTime(
          findRod.countdown * (equip != null ? findEquip.countdownDecrease : 1) * 1000,
          findRod.countdownData,
        );
        if (!isReady) {
          return;
        }
        findRod.countdownData = Date.now();
        findRod.durability = findRod.durability - 10;
        writeFileSync(this.checkPath(3, senderID), JSON.stringify(this.checkPath(4, senderID), null, 2));
        if (type == false) return api.sendMessage("Oh, không dính gì cả", threadID, messageID);
        if (!location || !area) return api.sendMessage("Chưa chọn địa điểm câu!", threadID, messageID);
        const fil = (await this.dataFish(location, area)).filter((i: FishItem) => i.category == type);
        if (fil.length == 0) return api.sendMessage("Oh, không dính gì cả", threadID, messageID);
        const getData = fil[Math.floor(Math.random() * fil.length)];
        const userDataUpdate = this.checkPath(4, senderID) as UserGameData;
        const lastFish = userDataUpdate.fishBag[userDataUpdate.fishBag.length - 1];
        const IDF = (lastFish?.ID ?? 0) + 1;
        const priceIncrease = equip != null && findEquip ? findEquip.priceIncrease : 1;
        const sellValue = getData.sell * priceIncrease;
        userDataUpdate.fishBag.push({
          ID: IDF,
          name: getData.name,
          category: getData.category,
          size: getData.size,
          sell: sellValue,
          image: getData.image,
        });
        userDataUpdate.point.push({
          ID: IDF,
          name: getData.name,
          category: getData.category,
          size: getData.size,
          weight: getData.weight,
          sell: getData.sell,
          image: getData.image,
        });
        writeFileSync(this.checkPath(3, senderID), JSON.stringify(userDataUpdate, null, 2));
        const msg = {
          body: `|---<(𝗦𝗨𝗕𝗡𝗔𝗨𝗧𝗜𝗖𝗔)>---|\nChúc mừng bạn đã phóng chết cmn con cá\n-----------------------\n🐟Tên: ${getData.name
            }\n💵Giá: ${sellValue}$\n✡Độ hiếm: ${getData.category || "Unknown"
            }\n📐Size: ${getData.size}cm`,
          attachment: getData.image ? await this.image(getData.image) : undefined,
        };
        return api.sendMessage(msg, threadID, messageID);
      }
    }
  },
  dataFish: async function (a: string, b: string): Promise<FishItem[]> {
    const data = require(path.join(CAUCA_DIR, "data.json")) as LocationData[];
    const loc = data.find((i: LocationData) => i.location == a);
    if (!loc) return [];
    const are = loc.area.find((i: { name: string; creature: FishItem[] }) => i.name == b);
    if (!are) return [];
    return are.creature;
  },
  image: async function (link: string): Promise<Readable[]> {
    const images: Readable[] = [];
    const filePath = path.join(CAUCA_DIR, "cache", "subnautica.png");
    const response = await axios.get(link, {
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
        "sec-ch-ua": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
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
    });
    fs.writeFileSync(filePath, Buffer.from(response.data));
    if (fs.existsSync(filePath)) {
      images.push(fs.createReadStream(filePath));
    }
    return images;
  },
  subnautica: async function (): Promise<Readable[]> {
    const images: Readable[] = [];
    const download = (
      await axios.get("https://i.imgur.com/RFfyXMj.png", {
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
          "sec-ch-ua": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
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
    const subPagePng = path.join(CAUCA_DIR, "cache", "subnauticapage.png");
    fs.writeFileSync(subPagePng, Buffer.from(download, "utf-8"));
    images.push(fs.createReadStream(subPagePng));
    return images;
  },
  onReply: async function (ctx: CommandOnReplyContext) {
    const { event, client: bot, userData, Reply, main, unsend } = ctx;
    const api = (bot as FacebookClient & { api?: FacebookClient }).api || bot;
    if (Reply.author != event.senderID) return;
    const { body, threadID, messageID, senderID } = event;
    const { writeFileSync } = fs;
    const pathItem = this.checkPath(2, senderID);
    const pathEquipment = this.checkPath(5, senderID);
    const checkDur = async (a: string, b: number, c: string | number): Promise<number | string> => {
      const data = require(path.join(CAUCA_DIR, "item.json")) as RodItem[];
      const find = data.find((i: RodItem) => i.name == a);
      if (!find) return "0/0 (0%)";
      if (c == "rate") return (b / find.durability) * 100;
      if (c == "reset") return find.durability;
      return `${b}/${find.durability} (${((b / find.durability) * 100).toFixed(0)}%)`;
    };
    const replyData = Reply as unknown as ReplyDataExtended;
    switch (replyData.type) {
      case "shop": {
        if (!body || isNaN(parseInt(body))) return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        if (body == "1") {
          unsend(Reply.messageID);
          const pathItemData = pathItem as RodItem[];
          let listItem = "===[𝗦𝗛𝗢𝗣]===\n";
          let number = 1;
          for (const i of pathItemData) {
            listItem += `Lv${number++}: ${i.name} (${i.price}$) - Thời gian chờ ${i.countdown} (Độ bền: ${i.durability})\n\n`;
          }
          return api.sendMessage(
            listItem + "Reply tin nhắn này để chọn cần vũ khí cho bạn. Mỗi lần câu trừ 10 độ bền!",
            threadID,
            (_error?: Error, info?: { messageID?: string }) => {
              if (info?.messageID) {
                main.onReply.set(info.messageID, {
                  commandName: "subnautica",
                  messageID: info.messageID,
                  author: event.senderID,
                  type: "buyfishingrod",
                });
              }
            },
            messageID,
          );
        }
        if (body == "2" || Reply.type == "typeFull") {
          unsend(Reply.messageID);
          const userDataCheck = this.checkPath(4, senderID) as UserGameData;
          const data = userDataCheck.fishBag;
          if (data.length == 0) return api.sendMessage("Túi của bạn không có gì cả!", threadID, messageID);
          const Common = data.filter((i: FishItem) => i.category == "Common");
          const Uncommon = data.filter((i: FishItem) => i.category == "Uncommon");
          const Rare = data.filter((i: FishItem) => i.category == "Rare");
          const Epic = data.filter((i: FishItem) => i.category == "Epic");
          const Legendary = data.filter((i: FishItem) => i.category == "Legendary");
          const Mythical = data.filter((i: FishItem) => i.category == "Mythical");
          const Spectral = data.filter((i: FishItem) => i.category == "Spectral");
          const Etherial = data.filter((i: FishItem) => i.category == "Etherial");
          const Unknown = data.filter((i: FishItem) => i.category == "Unknown");
          const Unreal = data.filter((i: FishItem) => i.category == "Unreal");
          const listCategory = [Common, Uncommon, Rare, Epic, Legendary, Mythical, Spectral, Etherial, Unknown, Unreal];
          return api.sendMessage(
            `Chọn loại cá muốn bán:\n1. Common⚪ - ${Common.length}\n2. Uncommon🟢 - ${Uncommon.length}\n3. Rare🔵 - ${Rare.length}\n4. Epic🟣 - ${Epic.length}\n5. Legendary🟡 - ${Legendary.length}\n6. Mythical🔴 - ${Mythical.length}\n7. Spectral😈 - ${Spectral.length}\n8. Etherial🌟 - ${Etherial.length}\n9. Unknown🔯 - ${Unknown.length}\n10. Unreal♾️ - ${Unreal.length}`,
            threadID,
            (_error?: Error, info?: { messageID?: string }) => {
              if (info?.messageID) {
                main.onReply.set(info.messageID, {
                  commandName: "subnautica",
                  messageID: info.messageID,
                  author: event.senderID,
                  type: "chooseFish",
                  listCategory,
                });
              }
            },
            messageID,
          );
        }
        if (body == "3") {
          unsend(Reply.messageID);
          const userDataCheck = this.checkPath(4, senderID) as UserGameData;
          const data = userDataCheck.item;
          let msg = `===𝓕𝓘𝓧 𝓘𝓣𝓔𝓜===\n`;
          let number = 1;
          for (const i of data) {
            msg += `${number++}. ${i.name} - Độ bền: ${await checkDur(i.name, i.durability, 0)}\n`;
          }
          return api.sendMessage(
            msg + "Vui lòng reply vật phẩm muốn sửa!, giá sửa bằng 75% giá vật phẩm",
            threadID,
            (_error?: Error, info?: { messageID?: string }) => {
              if (info?.messageID) {
                main.onReply.set(info.messageID, {
                  commandName: "subnautica",
                  messageID: info.messageID,
                  author: event.senderID,
                  type: "fixfishingrod",
                  list: data,
                });
              }
            },
            messageID,
          );
        }
        if (body == "4") {
          unsend(Reply.messageID);
          const pathEquipmentData = pathEquipment as EquipmentItem[];
          let listItem = "===[SHOP PHỤ KIỆN]===\n";
          let number = 1;
          for (const i of pathEquipmentData) {
            listItem += `${number++}. ${i.name} - ${i.price}$\n- ${i.description}\n_________________\n`;
          }
          return api.sendMessage(
            listItem +
            "Reply tin nhắn này để chọn phụ kiện muốn mua. Trang bị phụ kiện đã mua bằng cách nhập /subnautica custom equip",
            threadID,
            (_error?: Error, info?: { messageID?: string }) => {
              if (info?.messageID) {
                main.onReply.set(info.messageID, {
                  commandName: "subnautica",
                  messageID: info.messageID,
                  author: event.senderID,
                  type: "buyequipment",
                });
              }
            },
            messageID,
          );
        }
        return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
      }
      case "choosebag": {
        if (!body || isNaN(parseInt(body))) return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        unsend(Reply.messageID);
        const data = this.checkPath(4, senderID) as UserGameData;
        if (body == "1") {
          if (data.fishBag.length == 0) return api.sendMessage("Trong túi của bạn không có cái nịt", threadID, messageID);
          let listFish = `===𝓲𝓷𝓿𝓮𝓷𝓽𝓸𝓻𝔂===\n`;
          let number = 1;
          for (const i of data.fishBag) {
            listFish += `${number++}. ${i.name} (${i.size}cm) - ${i.category || "Unknown"} (${i.sell}$)\n`;
          }
          return api.sendMessage(listFish, threadID, messageID);
        }
        if (body == "2") {
          unsend(Reply.messageID);
          if (data.item.length == 0) return api.sendMessage("Trong túi của bạn không có vật phẩm nào!", threadID, messageID);
          let listItemm = `===𝓲𝓷𝓿𝓮𝓷𝓽𝓸𝓻𝔂===\n`;
          let number = 1;
          for (const i of data.item) {
            listItemm += `${number++}. ${i.name} (${i.price}$) - Độ bền: ${i.durability} (${i.countdown}s)\n`;
          }
          return api.sendMessage(listItemm, threadID, messageID);
        }
        return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
      }
      case "rodMain": {
        const data = replyData.data;
        const item = replyData.item;
        if (!data || !item || !Array.isArray(item)) return api.sendMessage("Dữ liệu không hợp lệ!", threadID, messageID);
        const rodItems = item as RodItem[];
        if (!body || isNaN(parseInt(body))) return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        const choice = parseInt(body, 10);
        if (choice > rodItems.length || choice <= 0)
          return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        unsend(Reply.messageID);
        data.mainROD = rodItems[choice - 1].name;
        writeFileSync(this.checkPath(3, senderID), JSON.stringify(data, null, 2));
        return api.sendMessage(
          `===МĂĨŃ ŴĔĂРŐŃ===\n- Đặt '${rodItems[choice - 1].name}' thành vũ khí chính thành công!`,
          threadID,
          messageID,
        );
      }
      case "equipMain": {
        const data = replyData.data;
        const equip = replyData.item;
        if (!data || !equip || !Array.isArray(equip)) return api.sendMessage("Dữ liệu không hợp lệ!", threadID, messageID);
        const equipItems = equip as EquipmentItem[];
        if (!body || isNaN(parseInt(body))) return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        const choice = parseInt(body, 10);
        if (choice > equipItems.length || choice <= 0)
          return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        unsend(Reply.messageID);
        data.accessory = equipItems[choice - 1].name;
        writeFileSync(this.checkPath(3, senderID), JSON.stringify(data, null, 2));
        return api.sendMessage(
          `=== 𝐄𝐐𝐔𝐈𝐏𝐌𝐄𝐍𝐓𝐒 ===\n Đã trang bị '${equipItems[choice - 1].name}'!`,
          threadID,
          messageID,
        );
      }
      case "location": {
        const data = require(path.join(CAUCA_DIR, "data.json")) as LocationData[];
        if (!body || isNaN(parseInt(body))) return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        const choice = parseInt(body, 10);
        if (choice < 1 || choice > 3 || choice > data.length)
          return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        unsend(Reply.messageID);
        let listLoca = "==[𝗟𝗢𝗖𝗔𝗧𝗜𝗢𝗡]==\n";
        let number = 1;
        for (const i of data[choice - 1].area) {
          listLoca += `${number++}. ${i.name}\n`;
        }
        const userDataUpdate = this.checkPath(4, senderID) as UserGameData;
        userDataUpdate.GPS.locate = data[choice - 1].location;
        writeFileSync(this.checkPath(3, senderID), JSON.stringify(userDataUpdate, null, 2));
        let images: string | undefined;
        if (choice == 1) images = "https://i.imgur.com/placeholder1.jpg";
        if (choice == 2) images = "https://i.imgur.com/FtB2vWi.png";
        if (choice == 3) images = "https://i.imgur.com/XyreoAC.png";
        if (!images) {
          return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        }
        return api.sendMessage(
          { body: listLoca + "Vui lòng chọn vùng bạn muốn câu!", attachment: await this.image(images) },
          threadID,
          (_error?: Error, info?: { messageID?: string }) => {
            if (info?.messageID) {
              main.onReply.set(info.messageID, {
                commandName: "subnautica",
                messageID: info.messageID,
                author: event.senderID,
                type: "chooseArea",
                area: data[choice - 1],
              });
            }
          },
          messageID,
        );
      }
      case "chooseArea": {
        if (!body || isNaN(parseInt(body))) return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        const area = replyData.area;
        if (!area) return api.sendMessage("Dữ liệu không hợp lệ!", threadID, messageID);
        const pathh = this.checkPath(4, senderID) as UserGameData;
        const pathhh = this.checkPath(3, senderID);
        const choice = parseInt(body, 10);
        if (choice > area.area.length || choice <= 0)
          return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        unsend(Reply.messageID);
        pathh.GPS.area = area.area[choice - 1].name;
        writeFileSync(pathhh, JSON.stringify(pathh, null, 2));
        return api.sendMessage(
          `==[𝗟𝗢𝗖𝗔𝗧𝗜𝗢𝗡]==\nChuyển tới vùng '${area.location} - ${area.area[choice - 1].name}' thành công`,
          threadID,
          messageID,
        );
      }
      case "fixfishingrod": {
        if (!body || isNaN(parseInt(body))) return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        const list = replyData.list;
        if (!list || !Array.isArray(list)) return api.sendMessage("Dữ liệu không hợp lệ!", threadID, messageID);
        const rodList = list as RodItem[];
        const choice = parseInt(body, 10);
        if (choice > rodList.length || choice <= 0)
          return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        const rod = rodList[choice - 1];
        const rateResult = await checkDur(rod.name, rod.durability, "rate");
        if (typeof rateResult === "number" && rateResult > 75)
          return api.sendMessage("Chỉ sửa được phóng lợn à nhầm phóng lao có độ bền dưới 75%", threadID, messageID);
        unsend(Reply.messageID);
        const priceValue = typeof rod.price === "number" ? rod.price : parseInt(String(rod.price), 10);
        const fixPrice = parseInt((priceValue * (3 / 4)).toFixed(0), 10);
        await checkMoney(senderID, fixPrice);
        await userData.delMoney(senderID, BigInt(fixPrice));
        const resetResult = await checkDur(rod.name, rod.durability, "reset");
        if (typeof resetResult === "number") {
          rod.durability = resetResult;
        }
        writeFileSync(this.checkPath(3, senderID), JSON.stringify(this.checkPath(4, senderID), null, 2));
        return api.sendMessage(
          `===ŦĨЖ ŴĔĂРŐŃ===\n- Sửa thành công ${rod.name} (${fixPrice}$)`,
          threadID,
          messageID,
        );
      }
      case "buyfishingrod": {
        if (!body || isNaN(parseInt(body))) return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        const pathItemData = pathItem as RodItem[];
        const choice = parseInt(body, 10);
        if (choice > pathItemData.length || choice <= 0)
          return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        const data = pathItemData[choice - 1];
        const priceValue = typeof data.price === "number" ? data.price : parseInt(String(data.price), 10);
        await checkMoney(senderID, priceValue);
        const userDataCheck = this.checkPath(4, senderID) as UserGameData;
        if (userDataCheck.item.some((i: RodItem) => i.name == data.name))
          return api.sendMessage("Bạn đã sở hữu vật phẩm này rồi!", threadID, messageID);
        userDataCheck.item.push({
          name: data.name,
          price: data.price,
          durability: data.durability,
          countdown: data.countdown,
          luck: data.luck,
          countdownData: null,
          image: data.image,
        });
        writeFileSync(this.checkPath(3, senderID), JSON.stringify(userDataCheck, null, 2));
        unsend(Reply.messageID);
        await userData.delMoney(senderID, BigInt(priceValue));
        const msg = {
          body: `Mua thành công ${data.name}\nGiá mua: ${priceValue}$\nĐộ bền: ${data.durability}\nLuck: ${data.luck}\nThời gian chờ: ${data.countdown}s`,
          attachment: data.image ? await this.image(data.image) : undefined,
        };
        return api.sendMessage(msg, threadID, messageID);
      }
      case "buyequipment": {
        if (!body || isNaN(parseInt(body))) return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        const pathEquipmentData = pathEquipment as EquipmentItem[];
        const choice = parseInt(body, 10);
        if (choice > pathEquipmentData.length || choice <= 0)
          return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        const data = pathEquipmentData[choice - 1];
        const priceValue = typeof data.price === "number" ? data.price : parseInt(String(data.price), 10);
        await checkMoney(senderID, priceValue);
        const userDataCheck = this.checkPath(4, senderID) as UserGameData;
        if (userDataCheck.equipments.some((i: EquipmentItem) => i.name == data.name))
          return api.sendMessage("Bạn đã sở hữu vật phẩm này rồi!", threadID, messageID);
        userDataCheck.equipments.push({
          name: data.name,
          price: data.price,
          countdownDecrease: data.countdownDecrease,
          luck: data.luck,
          priceIncrease: data.priceIncrease,
          description: data.description,
          image: data.image,
        });
        writeFileSync(this.checkPath(3, senderID), JSON.stringify(userDataCheck, null, 2));
        unsend(Reply.messageID);
        await userData.delMoney(senderID, BigInt(priceValue));
        const msg = {
          body: `Mua thành công ${data.name}\nGiá mua: ${priceValue}$\n________________\n${data.description}`,
          attachment: data.image ? await this.image(data.image) : undefined,
        };
        return api.sendMessage(msg, threadID, messageID);
      }
      case "chooseFish": {
        if (!body || isNaN(parseInt(body))) return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        const listCategory = replyData.listCategory;
        if (!listCategory || !Array.isArray(listCategory)) return api.sendMessage("Dữ liệu không hợp lệ!", threadID, messageID);
        const choice = parseInt(body, 10);
        if (choice > listCategory.length || choice <= 0)
          return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
        unsend(Reply.messageID);
        if (listCategory[choice - 1].length == 0)
          return api.sendMessage("Không có con cá nào hết á, hmmm!", threadID, messageID);
        let fish = "==𝗦𝗨𝗕𝗡𝗔𝗨𝗧𝗜𝗖𝗔==\n";
        let number = 1;
        for (const i of listCategory[choice - 1]) {
          fish += `${number++}. ${i.name} (${i.size}cm) - Loại: ${i.category || "Unknown"} - ${i.sell}$\n`;
        }
        return api.sendMessage(
          fish + "Reply số thứ tự để bán (có thể rep nhiều số) all cái đầu buồi t fix r bug tiền cc",
          threadID,
          (_error?: Error, info?: { messageID?: string }) => {
            if (info?.messageID) {
              main.onReply.set(info.messageID, {
                commandName: "subnautica",
                messageID: info.messageID,
                author: event.senderID,
                type: "sell",
                list: listCategory[choice - 1],
              });
            }
          },
          messageID,
        );
      }
      case "sell": {
        try {
          if (!body) return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
          const list = replyData.list;
          if (!list || !Array.isArray(list)) return api.sendMessage("Dữ liệu không hợp lệ!", threadID, messageID);
          const fishList = list as FishItem[];
          if (body.toLowerCase() != "bugcaiditconmemay" && isNaN(parseInt(body))) {
            return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
          }
          if (body.toLowerCase() != "bugcaiditconmemay" && (parseInt(body, 10) > fishList.length || parseInt(body, 10) <= 0)) {
            return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
          }
          unsend(Reply.messageID);
          const userDataCheck = this.checkPath(4, senderID) as UserGameData;
          const bag = userDataCheck.fishBag;
          let coins = 0;
          if (body.toLowerCase() == "bugcaiditconmemay") {
            for (const i of fishList) {
              const sellValue = typeof i.sell === "number" ? i.sell : parseInt(String(i.sell || 0), 10);
              if (isNaN(sellValue)) continue;
              await userData.addMoney(senderID, BigInt(sellValue));
              coins += sellValue;
              const index = bag.findIndex((item: FishItem) => item.ID == i.ID);
              if (index !== -1) bag.splice(index, 1);
              writeFileSync(this.checkPath(3, senderID), JSON.stringify(userDataCheck, null, 2));
            }

            const addExp = userData.addExp as ((id: string, amount: number) => Promise<number>) | undefined;
            if (addExp && coins > 0) {
              const gained = Math.max(10, Math.floor(coins / 30000));
              await addExp(senderID, gained);
            }
            return api.sendMessage(
              `Bán thành công ${fishList.length} con cá và thu về được ${coins}$`,
              threadID,
              messageID,
            );
          } else {
            const chooses = body
              .split(" ")
              .map((n: string) => parseInt(n, 10))
              .filter((n: number) => !isNaN(n));
            if (chooses.length === 0)
              return api.sendMessage("Không có lựa chọn nào hợp lệ để bán!", threadID, messageID);
            let text = `=====SELL=====\n`;
            let number = 1;
            for (const i of chooses) {
              if (i < 1 || i > fishList.length) continue;
              const fishItem = fishList[i - 1];
              if (!fishItem) continue;
              const index = bag.findIndex((item: FishItem) => item.ID == fishItem.ID);
              if (index === -1) continue;
              const sellValue = typeof bag[index]?.sell === "number" ? bag[index].sell : parseInt(String(bag[index]?.sell || 0), 10);
              coins += sellValue;
              text += `${number++}. ${bag[index]?.name || "Unknown"} +${sellValue}$\n`;
              await userData.addMoney(senderID, BigInt(sellValue));
              bag.splice(index, 1);
              writeFileSync(this.checkPath(3, senderID), JSON.stringify(userDataCheck, null, 2));
            }

            const addExp = userData.addExp as ((id: string, amount: number) => Promise<number>) | undefined;
            if (addExp && coins > 0) {
              const gained = Math.max(6, Math.floor(coins / 40000));
              await addExp(senderID, gained);
            }
            return api.sendMessage(text + `\nThu về được ${coins}$`, threadID, messageID);
          }
        } catch (err: unknown) {
          console.error("Lỗi xảy ra:", err);
          return api.sendMessage("Đã có lỗi xảy ra khi xử lý lệnh!", threadID, messageID);
        }
      }
      default: {
        unsend(Reply.messageID);
        return api.sendMessage("Lựa chọn không hợp lệ!", threadID, messageID);
      }
    }
    async function checkMoney(senderIDCheck: string, maxMoney: number): Promise<void> {
      const userInfo = await userData.get(senderIDCheck);
      const money = userInfo?.money || 0;
      if (Number(money) < parseInt(String(maxMoney), 10))
        throw new Error("Bạn không đủ tiền để thực hiện giao dịch này!");
    }
  },
  onReact: async function ({
    event,
    Reaction,
    main,
    commandName,
  }: CommandOnReactContext): Promise<void> {
    const reactData = Reaction as { type?: string; messageID?: string } | undefined;
    if (reactData?.type === "typeFull" && reactData.messageID) {
      main.onReact.set(reactData.messageID, {
        commandName: commandName,
        messageID: reactData.messageID,
        author: event.senderID,
        type: "typeFull",
      });
    }
  },
};

export default subnautica;
