"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnChatContext,
  CommandOnReactContext,
  CommandOnReplyContext,
  ReplyData,
} from '@types';
import axios from "axios";
import { createReadStream } from "fs";
import fs from "fs-extra";
import Jimp from "jimp";
import path from "path";
import { storagePath, tempPath } from "../../../core/storagePath";

const CONFIG = {
  ASSETS_DIR: storagePath("game", "baucua", "img"),
} as const;

const dataPath = storagePath("game", "baucua", "hack-baucua.json");

interface GameData {
  [threadID: string]: GameRoom;
}

interface GameRoom {
  author: string;
  players: Player[];
  set_timeout?: NodeJS.Timeout;
  playing?: boolean;
  rolled?: boolean;
}

interface Player {
  id: string;
  select: string;
  bet_money: bigint;
}

interface CooldownData {
  s: Record<string, number>;
  t?: NodeJS.Timeout;
}

const DICE_NAMES = ["gà", "tôm", "bầu", "cua", "cá", "nai"] as const;

function save(): void {
  fs.ensureDirSync(path.dirname(dataPath));
  // Chỉ lưu dữ liệu thuần (không lưu Timeout, không lưu bigint trực tiếp)
  const plain: Record<string, any> = {};

  Object.entries(data).forEach(([threadID, room]) => {
    plain[threadID] = {
      author: room.author,
      players: room.players.map((player) => ({
        id: player.id,
        select: player.select,
        // bigint -> string để JSON.stringify không lỗi
        bet_money: player.bet_money.toString(),
      })),
      playing: room.playing ?? false,
      rolled: room.rolled ?? false,
    };
  });

  fs.writeFileSync(dataPath, JSON.stringify(plain, null, 2), "utf-8");
}

// Không load phòng từ file khi khởi động: sau restart không thể khôi phục
// setTimeout, nên luôn bắt đầu với data rỗng. File chỉ dùng để lưu trong phiên.
fs.ensureDirSync(path.dirname(dataPath));

declare global {
  var data_command_bcua_rooms: GameData | undefined;
  var data_command_ban_bau_cua_tom_ca_ga_nai: CooldownData | undefined;
}

let data = global.data_command_bcua_rooms;

if (!data) {
  data = global.data_command_bcua_rooms = {};
}

let d = global.data_command_ban_bau_cua_tom_ca_ga_nai;

if (!d) {
  d = global.data_command_ban_bau_cua_tom_ca_ga_nai = { s: {} };
}

if (!d.s) {
  d.s = {};
}

if (!d.t) {
  d.t = setInterval(() => {
    Object.entries(d.s).forEach(([key, value]) => {
      if (value <= Date.now()) {
        delete d.s[key];
      }
    });
  }, 1000);
}

const time_wai_create = 2;
const time_del_ban = 5;
const time_diing = 5;
const bet_money_min = 100;

export async function clearBaucuaRoom(threadID: string): Promise<boolean> {
  let cleared = false;

  const room = data[threadID];
  if (room?.set_timeout) {
    clearTimeout(room.set_timeout);
  }

  if (threadID in data) {
    delete data[threadID];
    save();
    cleared = true;
  }

  const storedRaw = await fs.readJson(dataPath).catch(() => ({}));
  const stored =
    storedRaw && typeof storedRaw === "object" && !Array.isArray(storedRaw)
      ? (storedRaw as Record<string, unknown>)
      : {};

  if (threadID in stored) {
    delete stored[threadID];
    fs.ensureDirSync(path.dirname(dataPath));
    await fs.writeFile(dataPath, JSON.stringify(stored, null, 2), "utf-8");
    cleared = true;
  }

  return cleared;
}

async function stream_url(url: string): Promise<Buffer | undefined> {
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
    });
    return Buffer.from(res.data);
  } catch {
    return undefined;
  }
}

function parseAmount(value: string | number | undefined): bigint | number {
  if (value === undefined || value === null) return NaN;

  if (!isNaN(Number(value))) {
    return BigInt(Math.floor(Number(value)));
  }

  const match = String(value).match(/^\d+$/);
  if (match) return BigInt(value);

  const complexMatch = String(value).match(/^(\d*\.?\d*)([bkmtr]*)?(\d*)$/i);
  if (!complexMatch) return NaN;

  let [, mainNumber, unit, decimalPart] = complexMatch;
  let numericValue = parseFloat(
    mainNumber + (decimalPart ? "." + decimalPart : "")
  );

  if (isNaN(numericValue)) return NaN;

  numericValue = Math.floor(numericValue * 100);
  let baseNumber = BigInt(numericValue);

  switch (unit?.toLowerCase()) {
    case "b":
    case "tỷ":
      return (baseNumber * BigInt(1_000_000_000)) / BigInt(100);
    case "m":
    case "tr":
    case "triệu":
      return (baseNumber * BigInt(1_000_000)) / BigInt(100);
    case "k":
    case "ngàn":
      return (baseNumber * BigInt(1_000)) / BigInt(100);
    default:
      return baseNumber / BigInt(100);
  }
}

function formatCurrency(amount: bigint | number | null | undefined): string {
  if (amount === null || amount === undefined) return "";

  const bigIntAmount = typeof amount === "bigint" ? amount : BigInt(amount);
  const strAmount = bigIntAmount.toString();

  const addThou = (numStr: string) =>
    numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return addThou(strAmount) + " VNĐ";
}

const bcuaCommand: Command = {
  name: "bcua",
  alias: ["bcua"],
  version: "0.0.1",
  role: 0,
  desc: "ban bau, cua, tom, ca, ga, nai",
  guide:
    "\nDùng -baucua create để tạo bàn\n> Để tham gia cược hãy chat: bầu/cua + [số_tiền/allin/%/k/m/b/kb/mb/gb/g]\n> Xem thông tin bàn chat: info\n> Để rời bàn hãy chat: rời\n> bắt đầu xổ chat: lắc\nCông thức:\nĐơn vị sau là số 0\nk 12\nm 15\nb 18\nkb 21\nmb 24\ngb 27\ng 36",
  cd: 3,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext) => {
    const { client, event, args, threadData, main, commandName } = ctx;
    const { threadID: tid, messageID: mid, senderID: sid } = event;

    const send = (msg: any): Promise<any> => {
      return new Promise((resolve) => {
        client.sendMessage(msg, tid, (_err: any, res: any) => resolve(res), mid);
      });
    };

    if (/^(clear|reset)$/i.test(args[0] || "")) {
      const cleared = await clearBaucuaRoom(tid);
      return send(
        cleared
          ? "✅ Đã xóa dữ liệu Bầu Cua của nhóm này."
          : "ℹ️ Nhóm này không có dữ liệu Bầu Cua để xóa."
      );
    }

    const p = data[tid]?.players;

    if (/^(create|c|-c)$/.test(args[0] || "")) {
      if (tid in data) {
        return send("❎ Nhóm đã tạo bàn bầu cua!");
      }

      if (sid in d.s && d.s[sid]) {
        const remaining = d.s[sid] - Date.now();
        const minutes = Math.floor(remaining / 1000 / 60);
        const seconds = Math.floor((remaining / 1000) % 60);
        return send(
          `❎ Vui lòng quay lại sau ${minutes}p${seconds}s mỗi người chỉ được tạo ${time_wai_create}p một lần`
        );
      }

      if (d.s) {
        d.s[sid] = Date.now() + 1000 * 60 * time_wai_create;
      }

      data[tid] = {
        author: sid,
        players: [],
        set_timeout: setTimeout(() => {
          delete data[tid];
          save();
          client.sendMessage(
            `⛔ Đã trôi qua ${time_del_ban}p không có ai lắc, tiến hành hủy bàn`,
            tid
          );
        }, 1000 * 60 * time_del_ban),
      };

      save();
      return send(
        "✅ Tạo bàn bầu cua thành công\n📌 Ghi bầu/cua/nai/tôm/cá/gà + số tiền để cược"
      );
    } else if (/^end$/.test(args[0] || "")) {
      if (!p) {
        return send(
          `❎ Nhóm chưa tạo bàn bầu cua để tạo hãy dùng lệnh: ${args[0]} create`
        );
      }

      const threadInfo = await threadData.get(tid);
      const adminIDs = threadInfo?.threadInfo?.adminIDs || [];

      if (adminIDs.some((admin: any) => admin.id === sid)) {
        return send(
          `📌 Cần 5 người hoặc toàn bộ người chơi trong bàn thả cảm xúc vào tin nhắn này để bình chọn huỷ bàn bầu cua hiện tại`
        ).then((res: any) => {
          res.commandName = commandName;
          res.p = p;
          res.r = 0;
          main.onReact.set(res.messageID, res);
          return res;
        });
      }
    } else {
      const attachmentBuffer = await stream_url(
        "https://i.imgur.com/placeholder.jpg"
      );
      let attachment: any = undefined;

      if (attachmentBuffer) {
        const outPath = tempPath(`bcua-help-${Date.now()}.jpg`);
        await fs.ensureDir(path.dirname(outPath));
        await fs.writeFile(outPath, attachmentBuffer);
        attachment = createReadStream(outPath);
      }

      return send({
        body: `[ BẦU CUA NHIỀU NGƯỜI ]\n────────────────────\n✏️ Để tạo bàn bầu cua:\n𖢨 bcua create | -c | c\n🔰 Để tham gia cược hãy chat:\nbầu/cua/nai/tôm/cá/gà + [số_tiền/allin/%/k/m/b/kb/mb/gb/g]\n🔎 Để xem thông tin bàn hãy chat: infobc\n🔗 Để rời bàn hãy chat: rời\n🎰 Bắt đầu lắc chat: lắc\n📌 Công thức:\n𖢨 Đơn vị sau là số 0:\n─────────────\n[ k 12 | m 15 | b 18 | kb 21 | mb 24 | gb 27 | g 36 ]\n────────────────────\n⚠️ Trong quá trình chơi nếu có lỗi hãy báo với admin`,
        attachment,
      });
    }
  },

  onChat: async (ctx: CommandOnChatContext) => {
    const { client, event, userData, threadData } = ctx;
    const { args = [], threadID: tid, messageID: mid, senderID: sid } = event;

    const send = (msg: any): Promise<any> => {
      return new Promise((resolve) => {
        client.sendMessage(msg, tid, (_err: any, res: any) => resolve(res), mid);
      });
    };

    const select = (args[0] || "").toLowerCase();
    const bet_money_input = args[1];

    const checkMoney = userData.checkMoney as ((id: string) => Promise<bigint | number>) | undefined;
    const get_money = async (id: string): Promise<bigint | number> => {
      return checkMoney ? await checkMoney(id) : 0;
    };

    let p: Player[] | undefined;

    if (
      !(tid in data) ||
      !data[tid] ||
      !["gà", "tôm", "bầu", "cua", "cá", "nai", "infobc", "leave", "lắc"].includes(
        select
      )
    ) {
      return;
    }

    const room = data[tid];
    if (!room) return;
    p = room.players;

    if (room.playing) {
      return send("❎ Bàn đang lắc không thể thực hiện hành động");
    }

    if (["gà", "tôm", "bầu", "cua", "cá", "nai"].includes(select)) {
      let bet_money: bigint | number;

      if (/^(allin|all)$/.test(bet_money_input || "")) {
        bet_money = BigInt(await get_money(sid));
      } else if (/^[0-9]+%$/.test(bet_money_input || "")) {
        const percentMatch = bet_money_input?.match(/^([0-9]+)/);
        if (!percentMatch) {
          return send("❎ Tiền cược không hợp lệ!");
        }
        bet_money =
          (BigInt(await get_money(sid)) * BigInt(percentMatch[0])) /
          BigInt("100");
      } else {
        bet_money = parseAmount(bet_money_input);
      }

      if (typeof bet_money === "number" && isNaN(bet_money)) {
        return send("❎ Tiền cược không hợp lệ!");
      }

      const betAmount = typeof bet_money === "bigint" ? bet_money : BigInt(bet_money);

      if (betAmount < BigInt(bet_money_min)) {
        return send(
          `❎ Tiền cược không được thấp hơn ${formatCurrency(bet_money_min)}`
        );
      }

      if (betAmount > BigInt(await get_money(sid))) {
        return send("❎ Bạn không đủ tiền");
      }

      const player = p.find((player) => player.id === sid);

      if (player) {
        send(
          `✅ Đã thay đổi cược từ ${formatCurrency(player.bet_money)} ${player.select} sang ${formatCurrency(betAmount)} ${select}`
        );
        player.select = select;
        player.bet_money = betAmount;
        save();
      } else {
        p.push({
          id: sid,
          select,
          bet_money: betAmount,
        });
        save();
        return send(
          `✅ Bạn đã cược ${select} với số tiền ${formatCurrency(betAmount)}`
        );
      }
    }

    if (["leave"].includes(select)) {
      if (sid === room.author) {
        if (room.set_timeout) {
          clearTimeout(room.set_timeout);
        }
        delete data[tid];
        save();
        return send(
          "✅ Rời bàn thành công vì bạn là chủ bàn nên bàn sẽ bị huỷ"
        );
      }

      const playerIndex = p.findIndex((player) => player.id === sid);
      if (playerIndex !== -1) {
        p.splice(playerIndex, 1)[0];
        save();
        return send("✅ Rời bàn thành công");
      } else {
        return send("❎ Bạn không có trong bàn tài xỉu");
      }
    }

    if (["infobc"].includes(select)) {
      const getName = userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
      const playerNames = await Promise.all(
        p.map(async (player) => {
          const name = getName ? await getName(player.id) : null;
          return ` ${p.indexOf(player) + 1}. ${name || 'Người chơi'} cược ${formatCurrency(player.bet_money)} vào [ ${player.select} ]\n────────────────────`;
        })
      );

      const authorName = getName ? await getName(room.author) : null;
      const threadInfo = await threadData.get(tid);
      const threadName = threadInfo?.threadName || threadInfo?.threadInfo?.threadName || tid;

      return send(
        `[ THÔNG TIN BÀN BẦU CUA ]\n────────────────────\n👤 Tổng ${p.length} người tham gia gồm:\n${playerNames.join("\n")}\n📌 Chủ bàn: ${authorName}\n🏘️ Nhóm: ${threadName}`
      );
    }

    if (["lắc"].includes(select)) {
      if (sid !== room.author) {
        return send("❎ Bạn không phải chủ bàn nên không thể bắt đầu xổ");
      }

      if (!p || p.length === 0) {
        return send(
          "❎ Chưa có ai tham gia đặt cược nên không thể bắt đầu xổ"
        );
      }

      if (room.rolled) {
        return send("❎ Bàn này đã được lắc trước đó, không thể lắc lại");
      }

      room.rolled = true;
      room.playing = true;
      save();

      const diing = await send("🪇 Bot đang lắc...");

      const diceOptions = [...DICE_NAMES];

      const dices = Array.from({ length: 3 }, () =>
        diceOptions[Math.floor(Math.random() * diceOptions.length)]
      );

      const players = p.reduce(
        (acc, player) => {
          if ((dices as readonly string[]).includes(player.select)) {
            acc.win.push(player);
          } else {
            acc.lose.push(player);
          }
          return acc;
        },
        { win: [] as Player[], lose: [] as Player[] }
      );

      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * time_diing)
      ).then(() => {
        if (diing.messageID) {
          client.unsendMessage(diing.messageID, tid);
        }
      });

      // Đảm bảo thư mục và ảnh tồn tại trước khi đọc
      await fs.ensureDir(CONFIG.ASSETS_DIR);

      const diceImageBuffers = await Promise.all(
        dices.map(async (dice) => {
          const imagePath = path.join(CONFIG.ASSETS_DIR, `${dice}.jpg`);
          if (!(await fs.pathExists(imagePath))) {
            const img = new Jimp(300, 300, 0x222222ff);
            const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
            img.print(
              font,
              0,
              0,
              {
                text: String(dice),
                alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
                alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
              },
              img.getWidth(),
              img.getHeight()
            );
            await img.writeAsync(imagePath);
          }
          return await Jimp.read(imagePath);
        })
      );

      const maxWidth = Math.max(
        ...diceImageBuffers.map((img) => img.getWidth())
      );
      const maxHeight = Math.max(
        ...diceImageBuffers.map((img) => img.getHeight())
      );

      const resultImage = new Jimp(maxWidth * 3, maxHeight);

      for (let i = 0; i < diceImageBuffers.length; i++) {
        const img = diceImageBuffers[i];
        if (img) {
          const resized = img.resize(maxWidth, maxHeight);
          resultImage.composite(resized, i * maxWidth, 0);
        }
      }

      const outPath = tempPath(`result-${Date.now()}.png`);

      await fs.ensureDir(path.dirname(outPath));
      await resultImage.writeAsync(outPath);

      const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
      const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
      const getName = userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
      const winMessages = await Promise.all(
        players.win.map(async (player, i) => {
          const matchingDice = dices.filter((d) => d === player.select).length;
          const winAmount = player.bet_money * BigInt(matchingDice);
          if (addMoney) await addMoney(player.id, winAmount);
          const name = getName ? await getName(player.id) : null;
          return `${i + 1}. ${name || 'Người chơi'}: +${formatCurrency(winAmount)}`;
        })
      );

      const loseMessages = await Promise.all(
        players.lose.map(async (player, i) => {
          const lossAmount = player.bet_money;
          if (delMoney) await delMoney(player.id, lossAmount);
          const name = getName ? await getName(player.id) : null;
          return `${i + 1}. ${name || 'Người chơi'}: -${formatCurrency(lossAmount)}`;
        })
      );

      await send({
        body: `🎲 Kết quả: ${dices.join(" | ")}

[ NGƯỜI THẮNG ]

${winMessages.join("\n") || "Không có ai thắng"}

[ NGƯỜI THUA ]

${loseMessages.join("\n") || "Không có ai thua"}`,
        attachment: createReadStream(outPath),
      });

      const finalRoom = data[tid];
      if (finalRoom?.set_timeout) {
        clearTimeout(finalRoom.set_timeout);
      }
      delete data[tid];
      save();
    }
  },

  onReply: async (ctx: CommandOnReplyContext): Promise<void> => {
    const { client, event, Reply } = ctx;
    const { threadID: tid, messageID: mid } = event;

    const send = (msg: any): Promise<any> => {
      return new Promise((resolve) => {
        client.sendMessage(msg, tid, (_err: any, res: any) => resolve(res), mid);
      });
    };

    const replyData = Reply as ReplyData & { type?: string };
    if (replyData.type === "change.result.dices") {
      await send(`Vui lòng reply [gà/tôm/bầu/cua/cá/nai]`);
      return;
    }
  },

  onReact: async (ctx: CommandOnReactContext) => {
    const { client, event, Reaction } = ctx;
    const { threadID: tid, messageID: mid } = event;

    const send = (msg: any): Promise<any> => {
      return new Promise((resolve) => {
        client.sendMessage(msg, tid, (_err: any, res: any) => resolve(res), mid);
      });
    };

    if (!(tid in data)) {
      return send("❎ Bàn bầu cua đã kết thúc không thể bỏ phiếu tiếp");
    }

    const reaction = Reaction as any;
    reaction.r = (reaction.r || 0) + 1;

    await send(`${reaction.r}/${reaction.p.length}`);

    if (reaction.r === 5 || reaction.r >= reaction.p.length) {
      if (data[tid]?.set_timeout) {
        clearTimeout(data[tid].set_timeout);
      }
      delete data[tid];
      save();
      return send("✅ Đã kết thúc bàn bầu cua");
    }
  },
};

export default bcuaCommand;
