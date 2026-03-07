"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnChatContext,
  MessageForm,
} from "@types";
import { createCanvas, loadImage } from "canvas";
import { createReadStream } from "fs";
import fs from "fs-extra";
import path from "path";

interface Card {
  value: string;
  suit: "spades" | "hearts" | "diamonds" | "clubs";
  weight: number;
  icon: string;
}

interface BaicaoPlayer {
  id: string;
  name: string;
  card1?: Card;
  card2?: Card;
  card3?: Card;
  total: number;
  changeLeft: number;
  ready: boolean;
}

interface BaicaoTable {
  host: string;
  bet: bigint;
  started: boolean;
  dealt: boolean;
  readyCount: number;
  deck: Card[];
  players: BaicaoPlayer[];
}

const TABLES = new Map<string, BaicaoTable>();

const VALUES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS: Array<Card["suit"]> = ["spades", "hearts", "diamonds", "clubs"];

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const v of VALUES) {
    for (const s of SUITS) {
      let weight = parseInt(v, 10);
      if (["J", "Q", "K"].includes(v)) weight = 10;
      else if (v === "A") weight = 11;
      const icon =
        s === "spades" ? "♠️" : s === "hearts" ? "♥️" : s === "diamonds" ? "♦️" : "♣️";
      deck.push({ value: v, suit: s, weight, icon });
    }
  }

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = deck[i];
    const b = deck[j];
    if (a && b) {
      deck[i] = b;
      deck[j] = a;
    }
  }

  return deck;
}

function calcTotal(c1: Card, c2: Card, c3: Card): number {
  let sum = c1.weight + c2.weight + c3.weight;
  if (sum >= 20) sum -= 20;
  if (sum >= 10) sum -= 10;
  return sum;
}

function cardImageFilename(card: Card): string {
  const rank =
    card.value === "J"
      ? "jack"
      : card.value === "Q"
        ? "queen"
        : card.value === "K"
          ? "king"
          : card.value === "A"
            ? "ace"
            : card.value;
  return `${rank}_of_${card.suit}.png`;
}

async function renderCardsToFile(cards: Card[], baseDir: string, filePrefix: string) {
  const width = 500 * cards.length;
  const height = 726;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0b5f3b";
  ctx.fillRect(0, 0, width, height);

  const baseUrl =
    "https://raw.githubusercontent.com/ntkhang03/poker-cards/main/cards";

  let x = 0;
  for (const c of cards) {
    const url = `${baseUrl}/${cardImageFilename(c)}`;
    const img = await loadImage(url);
    ctx.drawImage(img, x, 0, 500, 726);
    x += 500;
  }

  await fs.ensureDir(baseDir);
  const filePath = path.join(
    baseDir,
    `${filePrefix}_${Date.now()}_${Math.random().toString(36).slice(2)}.png`,
  );

  // Tối ưu: Tạo buffer và cleanup canvas ngay sau khi dùng
  let buffer: Buffer;
  try {
    buffer = canvas.toBuffer("image/png");
  } catch (e: any) {
    console.error(`❌ Lỗi khi tạo buffer từ canvas: ${e.message || e}`);
    canvas = null as any; // Cleanup canvas reference
    throw e;
  }

  // Cleanup canvas reference ngay sau khi đã tạo buffer
  canvas = null as any;

  try {
    await fs.writeFile(filePath, buffer);
    // Cleanup buffer reference sau khi đã ghi file
    buffer = null as any;
    return filePath;
  } catch (e: any) {
    buffer = null as any; // Cleanup buffer reference trong catch
    throw e;
  }
}

function formatMoney(n: bigint | number | string): string {
  try {
    const num = typeof n === "bigint" ? Number(n) : Number(n);
    if (!Number.isFinite(num)) return String(n);
    return num.toLocaleString("vi-VN");
  } catch {
    return String(n);
  }
}

function parseBet(txt: string | undefined): bigint | null {
  if (!txt) return null;
  const s = txt.trim().toLowerCase();
  if (!/^\d+$/.test(s)) return null;
  const v = BigInt(s);
  if (v <= 0n) return null;
  return v;
}

function helpText(prefix = ""): string {
  return (
    "🃏====[ Bàn Bài Cào ]====🃏\n\n" +
    "Chào mừng bạn tới sòng bài cào nhóm!\n" +
    "Các lệnh:\n" +
    `• ${prefix}baicao create [tiền cược]\n` +
    `• ${prefix}baicao join\n` +
    `• ${prefix}baicao leave\n` +
    `• ${prefix}baicao start\n` +
    `• ${prefix}baicao info\n\n` +
    "Trong lúc chơi (gửi trực tiếp vào nhóm):\n" +
    "• \"Chia bài\" để chia bài cho tất cả người chơi (chỉ chủ bàn)\n" +
    "• \"Đổi bài\" để đổi ngẫu nhiên 1 lá (mỗi người 2 lượt)\n" +
    "• \"ready\" để sẵn sàng lật bài\n" +
    "• \"nonready\" để xem những người chưa sẵn sàng"
  );
}

const TEMP_DIR = "src/temp";

const baicaoCommand: Command = {
  name: "baicao",
  alias: ["3cay", "3cây", "baicaonhom"],
  version: "1.0.0",
  role: 0,
  desc: "Game bài cào (3 cây) nhiều người trong nhóm, có đặt cược",
  guide: helpText("{pn}"),
  cd: 0,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, reply, userData } = ctx;
    const tid = event.threadID;
    const uid = event.senderID;

    const sub = (args[0] || "").toLowerCase();
    const table = TABLES.get(tid);

    const checkMoney = userData.checkMoney as
      | ((id: string) => Promise<bigint | number | string>)
      | undefined;
    const addMoney = userData.addMoney as
      | ((id: string, amount: bigint) => Promise<void>)
      | undefined;
    const delMoney = userData.delMoney as
      | ((id: string, amount: bigint) => Promise<void>)
      | undefined;
    const getName = userData.getName as
      | ((id: string) => Promise<string | null | undefined>)
      | undefined;

    if (!sub) {
      await reply(helpText("{pn}"));
      return;
    }

    if (!checkMoney || !addMoney || !delMoney) {
      await reply("❎ Lỗi: không thể truy cập dữ liệu tiền tệ.");
      return;
    }

    if (sub === "create" || sub === "-c") {
      if (table) {
        await reply("🃏 Nhóm này đã có bàn bài cào đang mở.");
        return;
      }
      const bet = parseBet(args[1]);
      if (!bet || bet < 1n) {
        await reply("⚡ Mức cược không hợp lệ (phải là số nguyên dương).");
        return;
      }
      const bal = BigInt(await checkMoney(uid));
      if (bal < bet) {
        await reply(
          `⚡ Bạn không đủ tiền để tạo bàn với giá: ${formatMoney(bet)} VNĐ.`,
        );
        return;
      }

      await delMoney(uid, bet);
      const name = (getName ? await getName(uid) : null) || "Người chơi";

      const t: BaicaoTable = {
        host: uid,
        bet,
        started: false,
        dealt: false,
        readyCount: 0,
        deck: [],
        players: [
          {
            id: uid,
            name,
            total: 0,
            changeLeft: 2,
            ready: false,
          },
        ],
      };
      TABLES.set(tid, t);

      await reply(
        `🎲 Bàn bài cào với giá ${formatMoney(
          bet,
        )} VNĐ đã được tạo.\nNgười tạo không cần join.\nDùng: baicao join để tham gia.`,
      );
      return;
    }

    if (sub === "join" || sub === "-j") {
      if (!table) {
        await reply(
          "🃏 Hiện tại chưa có bàn bài cào nào, hãy tạo bằng: baicao create [tiền cược]",
        );
        return;
      }
      if (table.started) {
        await reply("Bàn đã bắt đầu, không thể tham gia thêm.");
        return;
      }
      if (table.players.find((p) => p.id === uid)) {
        await reply("Bạn đã tham gia bàn này rồi.");
        return;
      }

      const bal = BigInt(await checkMoney(uid));
      if (bal < table.bet) {
        await reply(
          `Bạn không đủ tiền để tham gia với mức cược ${formatMoney(
            table.bet,
          )} VNĐ.`,
        );
        return;
      }

      await delMoney(uid, table.bet);
      const name = (getName ? await getName(uid) : null) || "Người chơi";
      table.players.push({
        id: uid,
        name,
        total: 0,
        changeLeft: 2,
        ready: false,
      });
      TABLES.set(tid, table);
      await reply("Bạn đã tham gia bàn bài cào thành công.");
      return;
    }

    if (sub === "leave" || sub === "-l") {
      if (!table || !table.players) {
        await reply(
          "🃏 Hiện tại chưa có bàn bài cào nào, hãy tạo bằng: baicao create [tiền cược]",
        );
        return;
      }
      if (!table.players.some((p) => p.id === uid)) {
        await reply("⚡ Bạn chưa tham gia bàn bài cào trong nhóm này.");
        return;
      }
      if (table.started) {
        await reply("⚡ Bàn đã bắt đầu chia bài, không thể rời.");
        return;
      }

      if (table.host === uid) {
        TABLES.delete(tid);
        await reply("Chủ bàn đã rời, bàn đã được giải tán.");
        return;
      }

      table.players = table.players.filter((p) => p.id !== uid);
      TABLES.set(tid, table);
      await reply("Bạn đã rời khỏi bàn bài cào.");
      return;
    }

    if (sub === "start" || sub === "-s") {
      if (!table) {
        await reply(
          "🃏 Hiện tại chưa có bàn bài cào nào, hãy tạo bằng: baicao create [tiền cược]",
        );
        return;
      }
      if (table.host !== uid) {
        await reply("Chỉ chủ bàn mới được bắt đầu ván.");
        return;
      }
      if (table.players.length <= 1) {
        await reply(
          "Bàn hiện chưa có người chơi nào khác, hãy mời mọi người dùng: baicao join",
        );
        return;
      }
      if (table.started) {
        await reply("Bàn đã vào thời gian chơi / chia bài rồi.");
        return;
      }

      table.deck = buildDeck();
      table.started = true;
      table.dealt = false;
      table.readyCount = 0;
      for (const p of table.players) {
        p.card1 = undefined;
        p.card2 = undefined;
        p.card3 = undefined;
        p.total = 0;
        p.changeLeft = 2;
        p.ready = false;
      }
      TABLES.set(tid, table);
      await reply(
        "⚡ Bàn bài cào đã vào sóng.\nChủ bàn hãy gửi \"Chia bài\" trong nhóm để chia bài cho mọi người.",
      );
      return;
    }

    if (sub === "info" || sub === "-i") {
      if (!table || !table.players) {
        await reply(
          "🃏 Hiện tại chưa có bàn bài cào nào, hãy tạo bằng: baicao create [tiền cược]",
        );
        return;
      }

      const hostName =
        table.players.find((p) => p.id === table.host)?.name || table.host;
      await reply(
        "🎰== Bàn Bài Cào ==🎰" +
        `\n- Nhà Cái: ${hostName} (${table.host})` +
        `\n- Tổng số người chơi: ${table.players.length} người` +
        `\n- Mức cược: ${formatMoney(table.bet)} VNĐ`,
      );
      return;
    }

    await reply(
      "Cú pháp: baicao create|join|leave|start|info\nGõ baicao để xem hướng dẫn chi tiết.",
    );
  },

  async onChat(ctx: CommandOnChatContext): Promise<void> {
    const { event, reply, contact, userData } = ctx;
    const tid = event.threadID;
    const uid = event.senderID;
    const bodyRaw = event.body || "";
    const body = bodyRaw.trim();
    if (!body) return;

    const table = TABLES.get(tid);
    if (!table || !table.started) return;

    const lower = body.toLowerCase();

    const getName = userData.getName as
      | ((id: string) => Promise<string | null | undefined>)
      | undefined;
    const addMoney = userData.addMoney as
      | ((id: string, amount: bigint) => Promise<void>)
      | undefined;

    if (lower.startsWith("chia bài")) {
      if (table.dealt) return;
      if (uid !== table.host) {
        await reply("Chỉ chủ bàn mới có thể chia bài.");
        return;
      }

      if (table.deck.length < table.players.length * 3) {
        table.deck = buildDeck();
      }

      for (const p of table.players) {
        const c1 = table.deck.pop();
        const c2 = table.deck.pop();
        const c3 = table.deck.pop();
        if (!c1 || !c2 || !c3) continue;

        p.card1 = c1;
        p.card2 = c2;
        p.card3 = c3;
        p.total = calcTotal(c1, c2, c3);

        try {
          const cards = [c1, c2, c3];
          const filePath = await renderCardsToFile(
            cards,
            TEMP_DIR,
            `baicao_${tid}_${p.id}`,
          );

          const bodyMsg =
            `Bài của bạn 🎲: ` +
            `${c1.value}${c1.icon} | ${c2.value}${c2.icon} | ${c3.value}${c3.icon}\n\n` +
            `Tổng bài của bạn: ${p.total}`;

          const dmMessage: MessageForm = {
            body: bodyMsg,
            attachment: createReadStream(filePath),
          };

          await contact(dmMessage, p.id);

          fs.unlink(filePath).catch(() => { });
        } catch {
          // gửi text nếu lỗi ảnh
          const fallbackMessage: MessageForm = {
            body:
              `Bài của bạn 🎲: ` +
              `${p.card1?.value}${p.card1?.icon} | ${p.card2?.value}${p.card2?.icon} | ${p.card3?.value}${p.card3?.icon}\n\n` +
              `Tổng bài của bạn: ${p.total}`,
          };
          await contact(fallbackMessage, p.id);
        }
      }

      table.dealt = true;
      TABLES.set(tid, table);
      await reply(
        "💦 Chia bài thành công! Mỗi người có 2 lượt đổi bài (gửi \"Đổi bài\"), sau đó gõ \"ready\" khi sẵn sàng lật bài.\nNếu không thấy bài, hãy kiểm tra tin nhắn chờ.",
      );
      return;
    }

    if (lower.startsWith("đổi bài")) {
      if (!table.dealt) return;

      const player = table.players.find((p) => p.id === uid);
      if (!player) return;
      if (player.changeLeft <= 0) {
        await reply("Bạn đã dùng hết lượt đổi bài.");
        return;
      }
      if (player.ready) {
        await reply("Bạn đã ready, không thể đổi bài nữa.");
        return;
      }
      if (!player.card1 || !player.card2 || !player.card3) return;

      if (table.deck.length === 0) {
        table.deck = buildDeck();
      }

      const slots: Array<"card1" | "card2" | "card3"> = ["card1", "card2", "card3"];
      const idx = Math.floor(Math.random() * slots.length);
      const slot = slots[idx];
      const newCard = table.deck.pop();
      if (!newCard) return;

      if (slot === "card1") player.card1 = newCard;
      else if (slot === "card2") player.card2 = newCard;
      else player.card3 = newCard;

      if (player.card1 && player.card2 && player.card3) {
        player.total = calcTotal(player.card1, player.card2, player.card3);
      }

      player.changeLeft -= 1;
      TABLES.set(tid, table);

      try {
        if (player.card1 && player.card2 && player.card3) {
          const cards = [player.card1, player.card2, player.card3];
          const filePath = await renderCardsToFile(
            cards,
            TEMP_DIR,
            `baicao_${tid}_${player.id}`,
          );

          const bodyMsg =
            `🃏 Bài của bạn sau khi đổi: ` +
            `${player.card1.value}${player.card1.icon} | ${player.card2.value}${player.card2.icon} | ${player.card3.value}${player.card3.icon}\n\n` +
            `⚡ Tổng bài của bạn: ${player.total}\n` +
            `Lượt đổi còn lại: ${player.changeLeft}`;

          const dmMessage: MessageForm = {
            body: bodyMsg,
            attachment: createReadStream(filePath),
          };

          await contact(dmMessage, player.id);

          fs.unlink(filePath).catch(() => { });
        }
      } catch {
        const fallbackMessage: MessageForm = {
          body:
            `🃏 Bài của bạn sau khi đổi: ` +
            `${player.card1?.value}${player.card1?.icon} | ${player.card2?.value}${player.card2?.icon} | ${player.card3?.value}${player.card3?.icon}\n\n` +
            `⚡ Tổng bài của bạn: ${player.total}\n` +
            `Lượt đổi còn lại: ${player.changeLeft}`,
        };
        await contact(fallbackMessage, player.id);
      }

      return;
    }

    if (lower.startsWith("ready")) {
      if (!table.dealt) return;

      const player = table.players.find((p) => p.id === uid);
      if (!player) return;
      if (player.ready) return;

      player.ready = true;
      table.readyCount += 1;
      TABLES.set(tid, table);

      const name =
        (getName ? await getName(player.id) : null) || player.name || player.id;

      if (table.readyCount === table.players.length) {
        const ranking = [...table.players].sort((a, b) => b.total - a.total);
        const lines: string[] = [];
        let pos = 1;
        for (const info of ranking) {
          lines.push(
            `${pos++} • ${info.name} với ` +
            `${info.card1?.value}${info.card1?.icon} | ` +
            `${info.card2?.value}${info.card2?.icon} | ` +
            `${info.card3?.value}${info.card3?.icon} => ${info.total} nút 💸`,
          );
        }

        if (addMoney) {
          const pot = table.bet * BigInt(table.players.length);
          await addMoney(ranking[0].id, pot);
        }

        TABLES.delete(tid);

        await reply(
          `⚡ Kết quả:\n\n${lines.join(
            "\n",
          )}\n\nNgười chơi top 1 nhận về số tiền tương ứng ${table.bet * BigInt(table.players.length)
          } VNĐ 💵`,
        );
      } else {
        await reply(
          `😻 Người chơi: ${name} vừa sẵn sàng lật bài, còn lại: ${table.players.length - table.readyCount
          } người chơi chưa lật bài.`,
        );
      }
      return;
    }

    if (lower.startsWith("nonready")) {
      const notReady = table.players.filter((p) => !p.ready);
      if (!notReady.length) return;

      const names: string[] = [];
      for (const p of notReady) {
        const name =
          (getName ? await getName(p.id) : null) || p.name || p.id;
        names.push(name);
      }

      await reply(
        "😿 Những người chơi chưa sẵn sàng bao gồm: " + names.join(", "),
      );
      return;
    }
  },
};

export default baicaoCommand;
