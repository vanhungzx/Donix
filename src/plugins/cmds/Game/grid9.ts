"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnReplyContext,
} from '@types';

interface Grid9State {
  host: string;
  tid: string;
  bet: bigint;
  types: Record<number, "bomb" | "gold" | "silver" | "bronze">;
  picks: Map<string, Set<number>>;
  deadline: number;
  msgId: string | null;
  tmr: NodeJS.Timeout | null;
}

const TIME = 60;

function fmt(n: bigint | number): string {
  const s = String(n);
  const neg = s.startsWith("-");
  const t = neg ? s.slice(1) : s;
  const r = t.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return neg ? "-" + r : r;
}

function toBig(v: any): bigint | null {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v))
    return BigInt(Math.floor(v));
  if (/^\d+$/.test(String(v))) return BigInt(String(v));
  return null;
}

function mulDiv(a: bigint, m: number, d: number): bigint {
  return (a * BigInt(m)) / BigInt(d);
}

function gridStr(): string {
  return "1 2 3\n4 5 6\n7 8 9";
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    const swap = a[j];
    if (t !== undefined && swap !== undefined) {
      a[i] = swap;
      a[j] = t;
    }
  }
  return a;
}

async function finalize(
  state: Grid9State,
  key: string,
  main: any,
  unsend: ((msgId: string) => Promise<void> | void) | undefined,
  send: (text: string) => void | Promise<void>,
  userData: any
): Promise<void> {
  try {
    if (state.msgId && main.onReply) {
      main.onReply.delete(state.msgId);
    }
  } catch {
    
  }

  try {
    if (state.msgId && unsend) {
      await unsend(state.msgId);
    }
  } catch {
    
  }

  main.processData.delete(key);

  const em: Record<string, string> = {
    bomb: "💣",
    gold: "🏆",
    silver: "💎",
    bronze: "⭐",
  };

  let board = "";
  for (let i = 0; i < 9; i++) {
    const type = state.types[i];
    board += (type ? em[type] : "❓") + (i % 3 === 2 ? "\n" : " ");
  }

  const lines: string[] = [];

  for (const [uid, set] of state.picks.entries()) {
    let loss = 0n;
    let prof = 0n;

    for (const pos of set) {
      const t = state.types[pos];

      if (t === "bomb") {
        loss += state.bet;
      } else if (t === "gold") {
        prof += state.bet * 3n;
      } else if (t === "silver") {
        prof += state.bet * 2n;
      } else if (t === "bronze") {
        prof += mulDiv(state.bet, 3, 2);
      }
    }

    const net = prof - loss;

    if (net > 0n) {
      await userData.addMoney(uid, net);
    } else if (net < 0n) {
      await userData.delMoney(uid, -net);
    }

    const name = await userData.getName(uid).catch(() => uid);
    lines.push(
      `${name}: ${[...set].map((v) => v + 1).join(", ")} → ${net >= 0n ? "+" + fmt(net) : "-" + fmt(-net)
      }`
    );
  }

  const sum = lines.length ? lines.join("\n") : "Không có ai tham gia.";

  await send(`GRID9 KẾT THÚC\nBảng:\n${board}\n\nKết quả:\n${sum}`);
}

const grid9Command: Command = {
  name: "grid9",
  alias: ["g9", "kho"],
  version: "1.0.5",
  role: 0,
  desc: "Chọn ô 3x3: kho báu ăn tiền, bom mất cược",
  guide:
    "{pn} <cược>\nTrả lời tin nhắn của client bằng các số 1-9, tối đa 3 ô (vd: 2 5 9)",
  cd: 5,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { event, args, client, reply, send, unsend, main, userData } = ctx;
    const tid = String(event.threadID);
    const key = `grid9:${tid}`;

    const post = (
      text: string,
      cb: (info: { messageID?: string }) => void
    ): void => {
      let fired = false;
      const fire = (info: { messageID?: string } | undefined) => {
        if (fired) return;
        fired = true;
        cb(info || {});
      };

      try {
        const r = client.sendMessage(
          text,
          tid,
          (_e?: Error, info?: unknown) => {
            const msgInfo = info as { messageID?: string } | undefined;
            fire(msgInfo);
          },
          event.messageID
        );
        if (r && typeof r.then === "function") {
          r.then((info: unknown) => {
            const msgInfo = info as { messageID?: string } | undefined;
            fire(msgInfo);
          }).catch(() => {
            
          });
        }
      } catch {
        const p = reply(text, (info: unknown) => {
          const msgInfo = info as { messageID?: string } | undefined;
          fire(msgInfo);
        });
        if (p && typeof p.then === "function") {
          p.then((info: unknown) => {
            const msgInfo = info as { messageID?: string } | undefined;
            fire(msgInfo);
          }).catch(() => {
            
          });
        }
      }
    };

    const sub = (args[0] || "").toLowerCase();

    if (sub === "cancel") {
      if (!main.processData) {
        await reply("Chưa có bàn nào.");
        return;
      }

      const stx = main.processData.get(key) as Grid9State | undefined;
      if (!stx) {
        await reply("Chưa có bàn nào.");
        return;
      }

      if (stx.host !== event.senderID) {
        await reply("Chỉ chủ phòng mới được chốt.");
        return;
      }

      if (stx.tmr) {
        clearTimeout(stx.tmr);
      }

      const unsendFn = unsend ? ((msgId: string) => {
        const result = unsend(msgId);
        if (result && typeof result.then === 'function') {
          return result.then(() => { }) as Promise<void>;
        }
        return Promise.resolve();
      }) : undefined;
      const sendFn = send ? ((text: string) => {
        const result = send(text);
        if (result && typeof result.then === 'function') {
          return result.then(() => { }) as Promise<void>;
        }
        return Promise.resolve();
      }) : (() => Promise.resolve());
      await finalize(stx, key, main, unsendFn, sendFn, userData);
      return;
    }

    const bet = toBig(args[0]);
    if (typeof bet !== "bigint" || bet <= 0n) {
      await reply("Nhập số tiền cược hợp lệ. Ví dụ: grid9 1000");
      return;
    }

    if (!main.processData) {
      main.processData = new Map();
    }

    if (main.processData.get(key)) {
      await reply("Đang có bàn GRID9 khác, chờ kết thúc.");
      return;
    }

    const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const dist = shuffle([...cells]);
    const types: Record<number, "bomb" | "gold" | "silver" | "bronze"> = {};

    for (let i = 0; i < 9; i++) {
      types[i] = "bronze";
    }
    for (let i = 0; i < 2; i++) {
      const idx = dist[i];
      if (idx !== undefined) {
        types[idx] = "bomb";
      }
    }
    for (let i = 2; i < 4; i++) {
      const idx = dist[i];
      if (idx !== undefined) {
        types[idx] = "gold";
      }
    }
    for (let i = 4; i < 6; i++) {
      const idx = dist[i];
      if (idx !== undefined) {
        types[idx] = "silver";
      }
    }

    const deadline = Date.now() + TIME * 1000;
    const picks = new Map<string, Set<number>>();

    const st: Grid9State = {
      host: event.senderID,
      tid,
      bet,
      types,
      picks,
      deadline,
      msgId: null,
      tmr: null,
    };

    main.processData.set(key, st);

    post(
      `GRID9\nCược: ${fmt(bet)}\nThời gian: ${TIME}s\nChọn tối đa 3 ô bằng cách TRẢ LỜI tin nhắn này (vd: 2 5 9)\n${gridStr()}`,
      (info) => {
        st.msgId = info.messageID || null;

        if (!main.onReply) {
          main.onReply = new Map();
        }

        if (info.messageID) {
          main.onReply.set(info.messageID, {
            commandName: "grid9",
            messageID: info.messageID,
            author: "any",
            data: { key },
          });
        }

        const unsendFn = unsend ? ((msgId: string) => {
          const result = unsend(msgId);
          if (result && typeof result.then === 'function') {
            return result.then(() => { }) as Promise<void>;
          }
          return Promise.resolve();
        }) : undefined;
        const sendFn = send ? ((text: string) => {
          const result = send(text);
          if (result && typeof result.then === 'function') {
            return result.then(() => { }) as Promise<void>;
          }
          return Promise.resolve();
        }) : (() => Promise.resolve());
        st.tmr = setTimeout(() => {
          finalize(st, key, main, unsendFn, sendFn, userData);
        }, TIME * 1000);
      }
    );
  },

  onReply: async function (ctx: CommandOnReplyContext): Promise<void> {
    const { event, Reply, main, reply } = ctx;

    const replyData = Reply as { data?: { key?: string } } | undefined;
    const key = replyData?.data?.key;
    if (!key) return;

    if (!main.processData) return;

    const st = main.processData.get(key) as Grid9State | undefined;
    if (!st) return;

    if (Date.now() > st.deadline) return;

    const text = (event.body || "").trim();
    if (!text) return;

    const tokens = text.split(/\s+/).slice(0, 3);
    const nums: number[] = [];

    for (const tk of tokens) {
      const m = tk.match(/^[1-9]$/);
      if (m) {
        nums.push(parseInt(m[0], 10) - 1);
      }
    }

    if (!nums.length) {
      await reply("Nhập các số 1-9. Ví dụ: 2 5 9");
      return;
    }

    const cur = st.picks.get(event.senderID) || new Set<number>();
    if (cur.size >= 3) {
      await reply("Bạn đã đủ 3 ô.");
      return;
    }

    for (const n of nums) {
      if (cur.size >= 3) break;
      if (n >= 0 && n < 9) {
        cur.add(n);
      }
    }

    st.picks.set(event.senderID, cur);
    const show = [...cur].map((v) => v + 1).join(", ");

    reply("Đã chọn: " + show);
  },
};

export default grid9Command;
