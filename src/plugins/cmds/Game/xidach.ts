"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnChatContext,
  CommandOnReplyContext,
} from '@types';

const SUITS = ["♠", "♥", "♦", "♣"] as const;
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

interface Card {
  r: typeof RANKS[number];
  s: typeof SUITS[number];
}

interface Player {
  id: string;
  name: string;
  hand: Card[];
  done: boolean;
  isBot: boolean;
}

interface Dealer {
  hand: Card[];
}

interface GameRank {
  cat: number;
  total: number;
  name: string;
}

interface GameResult {
  id: string;
  name: string;
  isBot: boolean;
  res: number;
}

interface Game {
  host: string;
  hostName: string;
  bet: bigint;
  stage: "lobby" | "playing" | "finished";
  players: Player[];
  dealer: Dealer;
  deck: Card[];
  turn: number;
  to: NodeJS.Timeout | null;
  last: number;
}

const GAMES = new Map<string, Game>();

function deck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      d.push({ r, s });
    }
  }
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = d[i];
    const swap = d[j];
    if (temp && swap) {
      d[i] = swap;
      d[j] = temp;
    }
  }
  return d;
}

function cs(c: Card): string {
  return `${c.r}${c.s}`;
}

function hs(h: Card[], hide = false): string {
  return hide
    ? ["??", ...h.slice(1).map(cs)].join(" ")
    : h.map(cs).join(" ");
}

function total(h: Card[]): number {
  let t = 0;
  let a = 0;
  for (const c of h) {
    if (c.r === "A") {
      a++;
    } else if (["K", "Q", "J", "10"].includes(c.r)) {
      t += 10;
    } else {
      t += parseInt(c.r, 10);
    }
  }
  for (let i = 0; i < a; i++) {
    t += 11;
    if (t > 21) t -= 10;
  }
  return t;
}

function rank(h: Card[]): GameRank {
  const t = total(h);
  const two = h.length === 2;
  const aces = h.filter((x) => x.r === "A").length;
  const ten = h.some((x) => ["10", "J", "Q", "K"].includes(x.r));

  if (two && aces === 2) {
    return { cat: 4, total: 21, name: "Xì Bàng" };
  }
  if (two && aces >= 1 && ten && t === 21) {
    return { cat: 3, total: 21, name: "Xì Dách" };
  }
  if (h.length >= 5 && t <= 21) {
    return { cat: 2, total: t, name: "Ngũ Linh" };
  }
  if (t <= 21) {
    return { cat: 1, total: t, name: String(t) };
  }
  return { cat: 0, total: t, name: "Quắc" };
}

function cmp(p: Card[], d: Card[]): number {
  const a = rank(p);
  const b = rank(d);
  if (a.cat > b.cat) return 1;
  if (a.cat < b.cat) return -1;
  if (a.cat === 1) {
    if (a.total > b.total) return 1;
    if (a.total < b.total) return -1;
    return 0;
  }
  if (a.cat === 0) {
    if (b.cat === 0) return 0;
    return -1;
  }
  return 0;
}

function money(n: bigint | number | string): string {
  try {
    return BigInt(n).toString();
  } catch {
    return String(n);
  }
}

function lobby(g: Game): string {
  const list =
    g.players
      .map((p, i) => `${i + 1}. ${p.name}${p.isBot ? " 🤖" : ""}`)
      .join("\n") || "Chưa có";
  return `🎮 Xì Dách (4 người)\n🧑‍✈️ Chủ bàn: ${g.hostName}\n💵 Cược: ${money(g.bet)}\n👥 Người chơi (${g.players.length}/4):\n${list}\n➡️ join | leave | start | end | help`;
}

function state(g: Game, hideDealer = true): string {
  const lines = [
    `🃏 Nhà cái: ${hs(g.dealer.hand, hideDealer)}${hideDealer ? "" : ` (${rank(g.dealer.hand).name})`
    }`,
  ];
  for (let i = 0; i < g.players.length; i++) {
    const p = g.players[i];
    if (!p) continue;
    const currentPlayer = g.players[g.turn];
    const turn = currentPlayer && p.id === currentPlayer.id ? " ← lượt" : "";
    lines.push(
      `• ${p.name}${p.isBot ? " 🤖" : ""}: ${hs(p.hand)} (${rank(p.hand).name})${turn}`
    );
  }
  return lines.join("\n");
}

function deal(g: Game): void {
  for (const p of g.players) {
    p.hand = [g.deck.pop()!, g.deck.pop()!];
    p.done = false;
  }
  g.dealer.hand = [g.deck.pop()!, g.deck.pop()!];
  g.turn = 0;
  g.stage = "playing";
}

function nextTurn(g: Game): boolean {
  while (g.turn < g.players.length) {
    const currentPlayer = g.players[g.turn];
    if (!currentPlayer || !currentPlayer.done) break;
    g.turn++;
  }
  return g.turn < g.players.length;
}

function settle(g: Game): GameResult[] {
  while (
    rank(g.dealer.hand).cat > 0 &&
    rank(g.dealer.hand).cat < 2 &&
    total(g.dealer.hand) < 17
  ) {
    g.dealer.hand.push(g.deck.pop()!);
  }
  const r: GameResult[] = [];
  for (const p of g.players) {
    r.push({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      res: cmp(p.hand, g.dealer.hand),
    });
  }
  return r;
}

async function payout(
  g: Game,
  userData: any,
  results: GameResult[]
): Promise<void> {
  const b = g.bet;
  for (const x of results) {
    if (!b || b === 0n || x.isBot) continue;
    if (x.res > 0) {
      await userData.addMoney(x.id, b);

      
      const addExp = userData.addExp as ((id: string, amount: number) => Promise<number>) | undefined;
      if (addExp) {
        const capped = b < 100000n ? b : 100000n;
        const gained = Math.max(12, Math.floor(Number(capped) / 25000)); 
        await addExp(String(x.id), gained);
      }
    } else if (x.res < 0) {
      await userData.delMoney(x.id, b);
    }
  }
}

function touch(
  g: Game,
  tid: string,
  reply: (msg: string) => void | Promise<void>
): void {
  g.last = Date.now();
  if (g.to) {
    clearTimeout(g.to);
  }
  g.to = setTimeout(async () => {
    if (!GAMES.get(tid)) return;
    const gg = GAMES.get(tid);
    if (gg?.to) {
      clearTimeout(gg.to);
    }
    GAMES.delete(tid);
    try {
      await reply("⏰ Bàn không hoạt động 5 phút. Đã đóng.");
    } catch {
      
    }
  }, 300000);
}

interface AdvanceContext {
  reply: (msg: string) => void | Promise<void>;
  userData: any;
  tid: string;
}

async function advance(g: Game, ctx: AdvanceContext): Promise<void> {
  if (!nextTurn(g)) {
    const r = settle(g);
    let out = `✅ Kết quả\n${state(g, false)}\n`;
    out +=
      "\n" +
      r
        .map(
          (x) =>
            `${x.name}${x.isBot ? " 🤖" : ""}: ${x.res > 0 ? "Thắng 🎉" : x.res < 0 ? "Thua 💸" : "Hòa 🤝"
            }`
        )
        .join("\n");
    await payout(g, ctx.userData, r);
    g.stage = "finished";
    if (g.to) {
      clearTimeout(g.to);
    }
    GAMES.delete(ctx.tid);
    return ctx.reply(out);
  }
  const cur = g.players[g.turn];
  if (!cur) {
    return ctx.reply("❌ Lỗi: Không tìm thấy người chơi hiện tại");
  }
  if (cur.isBot) {
    let log = `🤖 ${cur.name} chơi\n`;
    while (true) {
      const rk = rank(cur.hand);
      if (rk.cat === 0 || rk.cat >= 2) break;
      if (rk.cat === 1 && rk.total >= 16) break;
      const card = g.deck.pop();
      if (!card) break;
      cur.hand.push(card);
      const lastCard = cur.hand[cur.hand.length - 1];
      if (lastCard) {
        log += `• Bốc: ${cs(lastCard)} → ${rank(cur.hand).name}\n`;
      }
      if (rank(cur.hand).cat === 0 || rank(cur.hand).cat >= 2) break;
    }
    cur.done = true;
    await ctx.reply(log.trim());
    touch(g, ctx.tid, ctx.reply);
    return advance(g, ctx);
  }
  touch(g, ctx.tid, ctx.reply);
  return ctx.reply(`${state(g)}\n➡️ ${cur.name}: hit | stand`);
}

function helpText(prefix = ""): string {
  return [
    "📘 Hướng dẫn nhanh Xì Dách",
    `• ${prefix}xidach [cược] → Tạo bàn (chủ bàn tự vào bàn)`,
    "• join → Tham gia | leave → Rời (chỉ khi chưa bắt đầu)",
    "• start → Bắt đầu (chỉ chủ bàn). Thiếu người sẽ thêm bot 🤖",
    "• end → Kết thúc bàn (chỉ chủ bàn)",
    "• status → Xem tình hình bàn",
    "• Trong lượt: hit/h/bốc để bốc | stand/s/dằn để dừng",
    "🔢 Tính điểm: A=11 (vượt 21 thì A=1); 10/J/Q/K=10",
    "🏆 Hạng tay: Xì Bàng > Xì Dách > Ngũ Linh ≥5 lá ≤21 > Điểm > Quắc",
    "💡 Mẹo: Điểm 16–17 cân nhắc dằn; 12–15 xem bài nhà cái 😉",
  ].join("\n");
}

const xidachCommand: Command = {
  name: "xidach",
  alias: ["xd", "blackjack"],
  version: "1.3.0",
  role: 0,
  desc: "Xì dách 4 người, đấu nhà cái",
  guide: `• {pn}xidach [cược]\n• {pn}xidach join | leave | start | hit | stand | end | status | help\n\nGõ {pn}xidach help để xem cách chơi chi tiết.`,
  cd: 2,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, reply, args, userData } = ctx;
    const tid = event.threadID;
    const uid = event.senderID;
    const sub = (args[0] || "").toLowerCase();

    let g = GAMES.get(tid);

    if (!g && (!sub || /^\d+$/.test(sub))) {
      const bet = /^\d+$/.test(sub) ? BigInt(sub) : 0n;
      const getName = userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
      const hostName = (getName ? await getName(uid) : null) || "Người chơi";

      g = {
        host: uid,
        hostName,
        bet,
        stage: "lobby",
        players: [
          {
            id: uid,
            name: hostName,
            hand: [],
            done: false,
            isBot: false,
          },
        ],
        dealer: { hand: [] },
        deck: deck(),
        turn: 0,
        to: null,
        last: Date.now(),
      };

      GAMES.set(tid, g);
      const replyFn = async (msg: string): Promise<void> => {
        await reply(msg);
      };
      touch(g, tid, replyFn);
      await reply(lobby(g) + `\nℹ️ Gõ "help" để xem cách chơi.`);
      return;
    }

    if (!g) {
      if (sub === "help") {
        await reply(helpText("{pn}"));
        return;
      }
      await reply("Chưa có bàn. Dùng: xidach [cược]");
      return;
    }

    const replyFn = async (msg: string): Promise<void> => {
      await reply(msg);
    };
    touch(g, tid, replyFn);

    if (sub === "help") {
      await reply(helpText("{pn}"));
      return;
    }

    if (sub === "join") {
      if (g.stage !== "lobby") {
        await reply("Ván đang diễn ra");
        return;
      }
      if (g.players.find((p) => p.id === uid)) {
        await reply("Bạn đã ở trong bàn");
        return;
      }
      if (g.players.length >= 4) {
        await reply("Bàn đã đủ 4 người");
        return;
      }
      const getName = userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
      const name = (getName ? await getName(uid) : null) || "Người chơi";
      g.players.push({
        id: uid,
        name,
        hand: [],
        done: false,
        isBot: false,
      });
      const replyFn = async (msg: string): Promise<void> => {
        await reply(msg);
      };
      touch(g, tid, replyFn);
      await reply(lobby(g));
      return;
    }

    if (sub === "leave") {
      if (g.stage !== "lobby") {
        await reply("Ván đang diễn ra");
        return;
      }
      g.players = g.players.filter((p) => p.id !== uid);
      if (uid === g.host) {
        if (g.to) {
          clearTimeout(g.to);
        }
        GAMES.delete(tid);
        await reply("Chủ bàn đã rời. Đã đóng bàn");
        return;
      }
      const replyFn = async (msg: string): Promise<void> => {
        await reply(msg);
      };
      touch(g, tid, replyFn);
      await reply(lobby(g));
      return;
    }

    if (sub === "start") {
      if (g.stage !== "lobby") {
        await reply("Ván đã bắt đầu");
        return;
      }
      if (uid !== g.host) {
        await reply("Chỉ chủ bàn được bắt đầu");
        return;
      }
      if (g.players.length < 2) {
        await reply("Cần ít nhất 2 người");
        return;
      }
      while (g.players.length < 4) {
        g.players.push({
          id: `bot${g.players.length}`,
          name: `Máy ${g.players.length}`,
          hand: [],
          done: false,
          isBot: true,
        });
      }
      g.deck = deck();
      deal(g);
      await reply("🎉 Bắt đầu ván! Chúc may mắn!");
      const replyFn = async (msg: string): Promise<void> => {
        await reply(msg);
      };
      touch(g, tid, replyFn);
      await advance(g, { reply: replyFn, userData, tid });
      return;
    }

    if (sub === "hit" || sub === "h" || sub === "bốc") {
      if (g.stage !== "playing") {
        await reply("Chưa đến giai đoạn chơi");
        return;
      }
      const cur = g.players[g.turn];
      if (!cur || cur.id !== uid) {
        await reply(
          `Chưa đến lượt bạn. Đang là lượt của ${g.players[g.turn]?.name}`
        );
        return;
      }
      cur.hand.push(g.deck.pop()!);
      const rk = rank(cur.hand);
      if (rk.cat === 0 || rk.cat >= 2 || (rk.cat === 1 && rk.total >= 21)) {
        cur.done = true;
      }
      const replyFn = async (msg: string): Promise<void> => {
        await reply(msg);
      };
      touch(g, tid, replyFn);
      await advance(g, { reply: replyFn, userData, tid });
      return;
    }

    if (sub === "stand" || sub === "s" || sub === "dằn" || sub === "dung") {
      if (g.stage !== "playing") {
        await reply("Chưa đến giai đoạn chơi");
        return;
      }
      const cur = g.players[g.turn];
      if (!cur || cur.id !== uid) {
        await reply(
          `Chưa đến lượt bạn. Đang là lượt của ${g.players[g.turn]?.name}`
        );
        return;
      }
      cur.done = true;
      const replyFn = async (msg: string): Promise<void> => {
        await reply(msg);
      };
      touch(g, tid, replyFn);
      await advance(g, { reply: replyFn, userData, tid });
      return;
    }

    if (sub === "end" || sub === "kết" || sub === "cancel") {
      if (uid !== g.host) {
        await reply("Chỉ chủ bàn được kết thúc");
        return;
      }
      if (g.to) {
        clearTimeout(g.to);
      }
      GAMES.delete(tid);
      await reply("Đã đóng bàn");
      return;
    }

    if (
      sub === "status" ||
      sub === "state" ||
      sub === "bàn" ||
      sub === "bài"
    ) {
      if (g.stage === "lobby") {
        await reply(lobby(g));
        return;
      }
      if (g.stage === "playing") {
        const currentPlayer = g.players[g.turn];
        if (currentPlayer) {
          await reply(`${state(g)}\n➡️ ${currentPlayer.name}: hit | stand`);
        } else {
          await reply(state(g));
        }
        return;
      }
      await reply("Bàn đã kết thúc");
      return;
    }

    if (!sub) {
      if (g.stage === "lobby") {
        await reply(lobby(g));
        return;
      }
      if (g.stage === "playing") {
        const currentPlayer = g.players[g.turn];
        if (currentPlayer) {
          await reply(`${state(g)}\n➡️ ${currentPlayer.name}: hit | stand`);
        } else {
          await reply(state(g));
        }
        return;
      }
      await reply(
        "Cú pháp: xidach [cược]|join|leave|start|hit|stand|end|status|help"
      );
      return;
    }

    await reply(
      "Cú pháp: xidach [cược]|join|leave|start|hit|stand|end|status|help"
    );
  },

  async onReply(ctx: CommandOnReplyContext): Promise<void> {
    const { event, reply } = ctx;
    const tid = event.threadID;
    const g = GAMES.get(tid);

    if (!g) return;

    const replyFn = async (msg: string): Promise<void> => {
      await reply(msg);
    };
    touch(g, tid, replyFn);

    const t = (event.body || "").trim().toLowerCase();

    if (
      [
        "help",
        "join",
        "leave",
        "start",
        "end",
        "status",
        "state",
        "bàn",
        "bài",
        "hit",
        "h",
        "bốc",
        "stand",
        "s",
        "dằn",
        "dung",
      ].includes(t)
    ) {
      (event as any).args = [t];
      const onCall = (xidachCommand as any).onCall;
      if (onCall) {
        await onCall({
          ...ctx,
          args: [t],
        } as CommandOnCallContext);
      }
    }
  },

  async onChat(ctx: CommandOnChatContext): Promise<void> {
    const { event, reply } = ctx;
    const tid = event.threadID;
    const g = GAMES.get(tid);

    if (!g) return;

    const replyFn = async (msg: string): Promise<void> => {
      await reply(msg);
    };
    touch(g, tid, replyFn);

    const t = (event.body || "").trim().toLowerCase();

    if (!t) return;

    const keysLobby = [
      ["join"],
      ["leave"],
      ["start"],
      ["end", "kết", "cancel"],
      ["status", "state", "bàn", "bài"],
      ["help"],
    ];

    const keysPlay = [
      ["hit", "h", "bốc"],
      ["stand", "s", "dằn", "dung"],
      ["status", "state", "bàn", "bài"],
      ["help"],
    ];

    const onCall = (xidachCommand as any).onCall;
    if (!onCall) return;

    if (g.stage === "lobby") {
      for (const ks of keysLobby) {
        if (ks.includes(t)) {
          (event as any).args = [ks[0]];
          await onCall({
            ...ctx,
            args: [ks[0]],
          } as CommandOnCallContext);
          return;
        }
      }
      return;
    }

    if (g.stage === "playing") {
      for (const ks of keysPlay) {
        if (ks.includes(t)) {
          (event as any).args = [ks[0]];
          await onCall({
            ...ctx,
            args: [ks[0]],
          } as CommandOnCallContext);
          return;
        }
      }
    }
  },
};

export default xidachCommand;
