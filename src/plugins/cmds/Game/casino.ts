"use strict";

import type { Command, CommandOnCallContext } from '@types';
import crypto from "crypto";

const casinoCommand: Command = {
  name: "casino",
  alias: ["cs"],
  version: "1.0.0",
  role: 0,
  desc: "Mini game casino: tài xỉu, tung xu, slot",
  category: "Game",
  guide:
    "{p}casino bal | daily | coin <bet> <head|tail>\n{p}casino taixiu <bet> <tai|xiu>\n{p}casino slot <bet>",
  cd: 3,
  prefix: true,

  onLoad: async () => { },

  onChat: async () => { },

  onEvent: async () => { },

  onReply: async () => { },

  onReact: async () => { },

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { client, event, args, userData } = ctx;
    const uid = event.senderID;

    const sub = String(args[0] || "").toLowerCase();

    async function getUser() {
      const u = await userData.get(uid);
      return u || {};
    }

    async function getBal(): Promise<bigint> {
      const u = await getUser();
      const m = (u as any).money;
      return typeof m === "bigint" ? m : BigInt(m || 0);
    }

    function f(n: bigint | number | string): string {
      try {
        return Number(n).toLocaleString("vi-VN");
      } catch {
        return String(n);
      }
    }

    async function add(n: bigint | number): Promise<void> {
      const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
      if (addMoney) await addMoney(uid, BigInt(n));
    }

    const addExp = userData.addExp as ((id: string, amount: number) => Promise<number>) | undefined;

    async function subMoney(n: bigint | number): Promise<void> {
      const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
      if (delMoney) await delMoney(uid, BigInt(n));
    }

    async function setUserPatch(p: any): Promise<void> {
      const u = await getUser();
      await userData.update(uid, { ...u, ...p });
    }

    function parseBet(txt: string | undefined, bal: bigint): bigint | null {
      if (!txt) return null;

      const s = txt.toLowerCase();

      if (s === "all" || s === "max") return bal;

      const map: Record<string, bigint> = {
        k: 1_000n,
        m: 1_000_000n,
        b: 1_000_000_000n,
      };

      const m = s.match(/^(\d+)([kmb])?$/i);

      if (m && m[1]) {
        const base = BigInt(m[1]);
        const mul = m[2] ? (map[m[2].toLowerCase()] || 1n) : 1n;
        return base * mul;
      }

      if (/^\d+$/.test(s)) return BigInt(s);

      return null;
    }

    function rnd(min: number, max: number): number {
      return crypto.randomInt(min, max + 1);
    }

    if (!sub) {
      await client.sendMessage(
        "Dùng: bal | daily | coin <bet> <head|tail> | taixiu <bet> <tai|xiu> | slot <bet>",
        event.threadID,
        event.messageID
      );
      return;
    }

    if (sub === "bal" || sub === "balance") {
      const bal = await getBal();
      await client.sendMessage(
        `Số dư: ${f(bal)} đ`,
        event.threadID,
        event.messageID
      );
      return;
    }

    if (sub === "daily") {
      const now = Date.now();
      const u = await getUser();
      const last = (u as any)?.casino?.lastDaily || 0;
      const left = 24 * 60 * 60 * 1000 - (now - last);

      if (left > 0) {
        const h = Math.floor(left / 3600000);
        const m = Math.floor((left % 3600000) / 60000);
        const s = Math.floor((left % 60000) / 1000);
        await client.sendMessage(
          `Chưa đến giờ nhận. Còn ${h}h ${m}m ${s}s`,
          event.threadID,
          event.messageID
        );
        return;
      }

      const bonus = 50000n;
      await add(bonus);
      await setUserPatch({
        casino: { ...((u as any).casino || {}), lastDaily: now },
      });

      await client.sendMessage(
        `Nhận daily +${f(bonus)} đ`,
        event.threadID,
        event.messageID
      );
      return;
    }

    if (sub === "coin") {
      const bal = await getBal();
      const bet = parseBet(args[1], bal);
      const choice = String(args[2] || "").toLowerCase();

      if (!bet || bet <= 0n) {
        await client.sendMessage(
          "Tiền cược không hợp lệ.",
          event.threadID,
          event.messageID
        );
        return;
      }

      if (bet > bal) {
        await client.sendMessage(
          "Không đủ tiền.",
          event.threadID,
          event.messageID
        );
        return;
      }

      if (!["head", "tail", "h", "t"].includes(choice)) {
        await client.sendMessage(
          "Chọn head/tail.",
          event.threadID,
          event.messageID
        );
        return;
      }

      await subMoney(bet);

      const flip = rnd(0, 1) === 0 ? "head" : "tail";
      const win = choice[0] === flip[0];

      if (win) {
        const prize = bet * 2n;
        await add(prize);
        
        if (addExp) {
          const capped = bet < 50000n ? bet : 50000n;
          const gained = Math.max(5, Math.floor(Number(capped) / 20000));
          await addExp(uid, gained);
        }
        await client.sendMessage(
          `Kết quả: ${flip.toUpperCase()}\nBạn thắng +${f(bet)} đ\nSố dư: ${f(await getBal())} đ`,
          event.threadID,
          event.messageID
        );
        return;
      } else {
        await client.sendMessage(
          `Kết quả: ${flip.toUpperCase()}\nBạn thua -${f(bet)} đ\nSố dư: ${f(await getBal())} đ`,
          event.threadID,
          event.messageID
        );
        return;
      }
    }

    if (sub === "taixiu" || sub === "tx") {
      const bal = await getBal();
      const bet = parseBet(args[1], bal);
      const pick = String(args[2] || "").toLowerCase();

      if (!bet || bet <= 0n) {
        await client.sendMessage(
          "Tiền cược không hợp lệ.",
          event.threadID,
          event.messageID
        );
        return;
      }

      if (bet > bal) {
        await client.sendMessage(
          "Không đủ tiền.",
          event.threadID,
          event.messageID
        );
        return;
      }

      if (!["tai", "xiu"].includes(pick)) {
        await client.sendMessage(
          "Chọn tai/xiu.",
          event.threadID,
          event.messageID
        );
        return;
      }

      await subMoney(bet);

      const d1 = rnd(1, 6);
      const d2 = rnd(1, 6);
      const d3 = rnd(1, 6);
      const sum = d1 + d2 + d3;
      const triple = d1 === d2 && d2 === d3;
      const res = triple ? "house" : sum >= 11 ? "tai" : "xiu";

      if (res === pick && !triple) {
        const prize = bet * 2n;
        await add(prize);
        
        if (addExp) {
          const capped = bet < 80000n ? bet : 80000n;
          const gained = Math.max(8, Math.floor(Number(capped) / 25000));
          await addExp(uid, gained);
        }
        await client.sendMessage(
          `🎲 ${d1}-${d2}-${d3} = ${sum}\nKết quả: ${res.toUpperCase()}\nBạn thắng +${f(bet)} đ\nSố dư: ${f(await getBal())} đ`,
          event.threadID,
          event.messageID
        );
        return;
      } else {
        await client.sendMessage(
          `🎲 ${d1}-${d2}-${d3} = ${sum}\nKết quả: ${triple ? "Bộ ba (nhà ăn)" : res.toUpperCase()}\nBạn thua -${f(bet)} đ\nSố dư: ${f(await getBal())} đ`,
          event.threadID,
          event.messageID
        );
        return;
      }
    }

    if (sub === "slot") {
      const bal = await getBal();
      const bet = parseBet(args[1], bal);

      if (!bet || bet <= 0n) {
        await client.sendMessage(
          "Tiền cược không hợp lệ.",
          event.threadID,
          event.messageID
        );
        return;
      }

      if (bet > bal) {
        await client.sendMessage(
          "Không đủ tiền.",
          event.threadID,
          event.messageID
        );
        return;
      }

      await subMoney(bet);

      const symbols = ["🍒", "🍋", "🍇", "⭐", "7️⃣"];

      function spin(): string {
        const index = rnd(0, symbols.length - 1);
        const result = symbols[index];
        return result ?? symbols[0] ?? "🍒";
      }

      const a = spin();
      const b = spin();
      const c = spin();

      let mult = 0n;

      if (a === b && b === c) {
        mult = a === "7️⃣" ? 10n : 5n;
      }

      if (mult > 0n) {
        const prize = bet * mult;
        await add(prize);
        await client.sendMessage(
          `│ ${a} │ ${b} │ ${c} │\nBạn trúng x${mult} +${f(bet * (mult - 1n))} đ\nSố dư: ${f(await getBal())} đ`,
          event.threadID,
          event.messageID
        );
        return;
      } else {
        await client.sendMessage(
          `│ ${a} │ ${b} │ ${c} │\nKhông trúng\nBạn thua -${f(bet)} đ\nSố dư: ${f(await getBal())} đ`,
          event.threadID,
          event.messageID
        );
        return;
      }
    }

    await client.sendMessage(
      "Lệnh không hợp lệ.",
      event.threadID,
      event.messageID
    );
  },
};

export default casinoCommand;
