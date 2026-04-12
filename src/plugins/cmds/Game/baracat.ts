"use strict";

import type { Command, CommandOnCallContext } from "@types";
import { CanvasRenderingContext2D, createCanvas, loadImage } from "canvas";
import { createReadStream } from "fs";
import fs from "fs-extra";
import path from "path";
import { TEMP_DIR } from "../../../core/storagePath";

// ===== CẤU HÌNH HÌNH ẢNH LÁ BÀI =====
// Bạn hãy tải thư mục `cards` từ repo:
//   https://github.com/ntkhang03/poker-cards/tree/main/cards
// và đặt vào: storage/game/baracat/cards
//
// Repo đó dùng quy ước tên file dạng: 2C.png, AD.png, 10H.png, KS.png ...
// rank: A, 2..10, J, Q, K
// suit: C (Clubs), D (Diamonds), H (Hearts), S (Spades)

const CONFIG = {
  // Tải trực tiếp ảnh lá bài từ GitHub (repo poker-cards)
  CARDS_BASE_URL: "https://raw.githubusercontent.com/ntkhang03/poker-cards/main/cards",
  MIN_BET: 1000n,
  COOLDOWN: 5,
} as const;

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const SUITS = ["C", "D", "H", "S"] as const;

type Rank = (typeof RANKS)[number];
type Suit = (typeof SUITS)[number];

interface Card {
  rank: Rank;
  suit: Suit;
}

type Side = "player" | "banker" | "tie";

interface Hand {
  cards: Card[];
}

function cardValue(c: Card): number {
  if (c.rank === "A") return 1;
  if (["10", "J", "Q", "K"].includes(c.rank)) return 0;
  return Number(c.rank);
}

function handTotal(h: Hand): number {
  const sum = h.cards.reduce((t, c) => t + cardValue(c), 0);
  return sum % 10;
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

function parseBet(txt: string | undefined, bal: bigint): bigint | null {
  if (!txt) return null;
  const s = txt.trim().toLowerCase();

  if (s === "all" || s === "allin" || s === "max") return bal;

  const percent = s.match(/^(\d+)%$/);
  if (percent && percent[1]) {
    const p = BigInt(percent[1]);
    if (p <= 0n || p > 100n) return null;
    return (bal * p) / 100n;
  }

  if (/^\d+$/.test(s)) return BigInt(s);

  const m = s.match(/^(\d+)([kmb])$/i);
  if (m && m[1]) {
    const base = BigInt(m[1]);
    const u = m[2].toLowerCase();
    if (u === "k") return base * 1_000n;
    if (u === "m") return base * 1_000_000n;
    if (u === "b") return base * 1_000_000_000n;
  }

  return null;
}

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ rank: r, suit: s });
    }
  }
  // shuffle
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

function filenameForCard(c: Card): string {
  // Phù hợp với repo poker-cards:
  // 2_of_clubs.png, 10_of_hearts.png, ace_of_spades.png, queen_of_diamonds.png ...
  const rankMap: Record<Rank, string> = {
    A: "ace",
    "2": "2",
    "3": "3",
    "4": "4",
    "5": "5",
    "6": "6",
    "7": "7",
    "8": "8",
    "9": "9",
    "10": "10",
    J: "jack",
    Q: "queen",
    K: "king",
  };

  const suitMap: Record<Suit, string> = {
    C: "clubs",
    D: "diamonds",
    H: "hearts",
    S: "spades",
  };

  const r = rankMap[c.rank];
  const s = suitMap[c.suit];
  return `${r}_of_${s}.png`;
}

async function loadCardImage(c: Card) {
  const url = `${CONFIG.CARDS_BASE_URL}/${filenameForCard(c)}`;
  return await loadImage(url);
}

function drawTableBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Nền xanh bàn
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#0b5f3b");
  gradient.addColorStop(1, "#063820");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Viền bàn
  ctx.strokeStyle = "#f5d590";
  ctx.lineWidth = 8;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  // Vùng Player & Banker
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  const midY = height / 2;
  ctx.beginPath();
  ctx.moveTo(40, midY);
  ctx.lineTo(width - 40, midY);
  ctx.stroke();

  ctx.font = "bold 40px sans-serif";
  ctx.textAlign = "center";

  // PLAYER (xanh)
  ctx.fillStyle = "#4fc3f7";
  ctx.shadowColor = "#4fc3f7";
  ctx.shadowBlur = 12;
  ctx.fillText("PLAYER", width * 0.25, midY - 20);

  // BANKER (đỏ)
  ctx.fillStyle = "#ff5252";
  ctx.shadowColor = "#ff5252";
  ctx.shadowBlur = 12;
  ctx.fillText("BANKER", width * 0.75, midY - 20);

  ctx.shadowBlur = 0;
}

async function renderBaccaratResult(player: Hand, banker: Hand): Promise<string> {
  const width = 900;
  const height = 480;
  let canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawTableBackground(ctx, width, height);

  const playerImages = await Promise.all(player.cards.map((c) => loadCardImage(c)));
  const bankerImages = await Promise.all(banker.cards.map((c) => loadCardImage(c)));

  if (!playerImages[0] || !bankerImages[0]) {
    throw new Error("Card images not found");
  }

  const cardWidth = 110;
  const cardHeight = 160;
  const gap = 15;

  // Player cards (hàng dưới khu PLAYER)
  const totalPlayerWidth = playerImages.length * cardWidth + (playerImages.length - 1) * gap;
  let startXPlayer = width * 0.25 - totalPlayerWidth / 2;
  const yPlayer = height / 2 + 35;

  for (const img of playerImages) {
    ctx.drawImage(img, startXPlayer, yPlayer, cardWidth, cardHeight);
    startXPlayer += cardWidth + gap;
  }

  // Banker cards (hàng dưới khu BANKER)
  const totalBankerWidth = bankerImages.length * cardWidth + (bankerImages.length - 1) * gap;
  let startXBanker = width * 0.75 - totalBankerWidth / 2;
  const yBanker = height / 2 + 35;

  for (const img of bankerImages) {
    ctx.drawImage(img, startXBanker, yBanker, cardWidth, cardHeight);
    startXBanker += cardWidth + gap;
  }

  const tmpRoot = TEMP_DIR();
  await fs.ensureDir(tmpRoot);
  const outPath = path.join(
    tmpRoot,
    `baracat_${Date.now()}_${Math.random().toString(36).slice(2)}.png`
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
    await fs.writeFile(outPath, buffer);
    // Cleanup buffer reference sau khi đã ghi file
    buffer = null as any;
    return outPath;
  } catch (e: any) {
    buffer = null as any; // Cleanup buffer reference trong catch
    throw e;
  }
}

function whoWins(player: Hand, banker: Hand): Side {
  const p = handTotal(player);
  const b = handTotal(banker);
  if (p > b) return "player";
  if (b > p) return "banker";
  return "tie";
}

// Luật rút bài Baccarat (đơn giản nhưng đúng logic chuẩn cơ bản)
function drawBaccarat(deck: Card[]): { player: Hand; banker: Hand } {
  const player: Hand = { cards: [] };
  const banker: Hand = { cards: [] };

  // 2 lá đầu
  player.cards.push(deck.pop()!, deck.pop()!);
  banker.cards.push(deck.pop()!, deck.pop()!);

  const p0 = handTotal(player);
  const b0 = handTotal(banker);

  // Natural 8/9: dừng
  if (p0 >= 8 || b0 >= 8) {
    return { player, banker };
  }

  // Player rút nếu <= 5
  let playerThird: Card | null = null;
  if (p0 <= 5) {
    playerThird = deck.pop() || null;
    if (playerThird) player.cards.push(playerThird);
  }

  const b1 = handTotal(banker);

  // Banker rút theo bảng chuẩn (đã rút xong lá thứ 3 của Player nếu có)
  if (!playerThird) {
    // Player đứng
    if (b1 <= 5) {
      const c = deck.pop();
      if (c) banker.cards.push(c);
    }
  } else {
    const pt = cardValue(playerThird);
    if (b1 <= 2) {
      const c = deck.pop();
      if (c) banker.cards.push(c);
    } else if (b1 === 3 && pt !== 8) {
      const c = deck.pop();
      if (c) banker.cards.push(c);
    } else if (b1 === 4 && pt >= 2 && pt <= 7) {
      const c = deck.pop();
      if (c) banker.cards.push(c);
    } else if (b1 === 5 && pt >= 4 && pt <= 7) {
      const c = deck.pop();
      if (c) banker.cards.push(c);
    } else if (b1 === 6 && pt >= 6 && pt <= 7) {
      const c = deck.pop();
      if (c) banker.cards.push(c);
    } else {
      // 7 đứng, hoặc các trường hợp còn lại
    }
  }

  return { player, banker };
}

function sideLabel(side: Side): string {
  if (side === "player") return "Player (Người chơi)";
  if (side === "banker") return "Banker (Nhà cái)";
  return "Tie (Hòa)";
}

const baracatCommand: Command = {
  name: "baracat",
  alias: ["baccarat", "bac"],
  version: "1.0.0",
  role: 0,
  desc: "Game Baccarat (Player vs Banker) dùng bộ ảnh poker-cards",
  guide:
    "{p}baracat <tiền cược> <player|banker|tie>\n" +
    "Ví dụ:\n" +
    "• {p}baracat 1000 player\n" +
    "• {p}baracat 50k banker\n" +
    "• {p}baracat all tie",
  cd: CONFIG.COOLDOWN,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { client, event, args, userData } = ctx;
    const uid = event.senderID;

    const betTxt = String(args[0] || "");
    const sideTxt = String(args[1] || "").toLowerCase();

    if (!betTxt || !sideTxt) {
      await client.sendMessage(
        "Cú pháp: baracat <tiền cược> <player|banker|tie>",
        event.threadID,
        event.messageID
      );
      return;
    }

    const sideMap: Record<string, Side> = {
      p: "player",
      player: "player",
      banker: "banker",
      b: "banker",
      tie: "tie",
      t: "tie",
      hòa: "tie",
      hoa: "tie",
    };

    const side = sideMap[sideTxt];
    if (!side) {
      await client.sendMessage(
        "Bên cược không hợp lệ. Chọn: player | banker | tie",
        event.threadID,
        event.messageID
      );
      return;
    }

    const checkMoney = userData.checkMoney as
      | ((id: string) => Promise<bigint | number>)
      | undefined;
    const bal = BigInt(checkMoney ? await checkMoney(uid) : 0);

    const bet = parseBet(betTxt, bal);
    if (!bet || bet <= 0n) {
      await client.sendMessage(
        "Tiền cược không hợp lệ.",
        event.threadID,
        event.messageID
      );
      return;
    }

    if (bet < CONFIG.MIN_BET) {
      await client.sendMessage(
        `Tiền cược tối thiểu là ${formatMoney(CONFIG.MIN_BET)} đ`,
        event.threadID,
        event.messageID
      );
      return;
    }

    if (bet > bal) {
      await client.sendMessage(
        `Bạn không đủ tiền. Số dư: ${formatMoney(bal)} đ`,
        event.threadID,
        event.messageID
      );
      return;
    }

    const delMoney = userData.delMoney as
      | ((id: string, amount: bigint) => Promise<void>)
      | undefined;
    if (delMoney) await delMoney(uid, bet);

    const deck = buildDeck();
    const { player, banker } = drawBaccarat(deck);
    const winner = whoWins(player, banker);

    let payout = 0n;
    if (winner === "player" && side === "player") {
      payout = bet * 2n; // 1:1
    } else if (winner === "banker" && side === "banker") {
      // Banker ăn 5% phí (chuẩn Baccarat), làm tròn đơn giản
      const win = bet * 2n;
      const fee = (bet * 5n) / 100n;
      payout = win - fee;
    } else if (winner === "tie" && side === "tie") {
      payout = bet * 9n; // tie 1:8 (trả lại cả gốc) ~ x9
    } else if (winner === "tie" && (side === "player" || side === "banker")) {
      // Hòa: trả lại tiền nếu cược Player/Banker
      payout = bet;
    }

    const addMoney = userData.addMoney as
      | ((id: string, amount: bigint) => Promise<void>)
      | undefined;
    const addExp = userData.addExp as
      | ((id: string, amount: number) => Promise<number>)
      | undefined;

    if (payout > 0n && addMoney) {
      await addMoney(uid, payout);
      if (addExp) {
        const capped = bet < 100000n ? bet : 100000n;
        const gained = Math.max(10, Math.floor(Number(capped) / 30000));
        await addExp(uid, gained);
      }
    }

    let imagePath: string | null = null;
    try {
      imagePath = await renderBaccaratResult(player, banker);
    } catch (e) {
      console.error("Baracat render image error:", e);
      imagePath = null;
    }

    const pTotal = handTotal(player);
    const bTotal = handTotal(banker);

    const lines: string[] = [];
    lines.push("🎴 BẢN KẾT QUẢ BACCART");
    lines.push(
      `👤 Player: ${player.cards
        .map((c) => `${c.rank}${c.suit}`)
        .join(" ")} (điểm: ${pTotal})`
    );
    lines.push(
      `🏦 Banker: ${banker.cards
        .map((c) => `${c.rank}${c.suit}`)
        .join(" ")} (điểm: ${bTotal})`
    );
    lines.push("");
    lines.push(`➡️ Bạn cược: ${sideLabel(side)} với ${formatMoney(bet)} đ`);
    lines.push(`🏁 Kết quả: ${sideLabel(winner)}`);

    if (payout > bet) {
      lines.push(
        `🎉 Thắng! Nhận về: +${formatMoney(payout - bet)} đ (tổng nhận: ${formatMoney(
          payout
        )} đ)`
      );
    } else if (payout === bet) {
      lines.push("🤝 Hòa, hoàn tiền cược.");
    } else {
      lines.push(`💸 Thua, mất: -${formatMoney(bet)} đ`);
    }

    const body = lines.join("\n");

    if (imagePath && (await fs.pathExists(imagePath))) {
      await client.sendMessage(
        {
          body,
          attachment: createReadStream(imagePath),
        },
        event.threadID,
        event.messageID
      );
    } else {
      await client.sendMessage(body, event.threadID, event.messageID);
    }
  },
};

export default baracatCommand;
