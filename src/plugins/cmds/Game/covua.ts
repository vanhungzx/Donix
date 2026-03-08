"use strict";

import type { Command, CommandOnCallContext, CommandOnReplyContext } from "@types";
import axios from "axios";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { storagePath } from "../../../core/storagePath";

const require = createRequire(import.meta.url);
const ChessCore = require(storagePath("game", "chess"));

type Color = "white" | "black" | "";
type Turn = "w" | "b";

interface GamePlayer {
  id: string;
  color: Color;
}

interface GameSession {
  author: string;
  start: 0 | 1;
  type: 2;
  player: GamePlayer[];
  play: Turn;
}

interface ChessReplyData {
  commandName: string;
  author: string;
  messageID: string;
  type: Turn;
}

const games = new Map<string, GameSession>();

const CHESS_STORAGE_DIR = storagePath("game", "chess");
const CHESS_IMAGES_DIR = path.join(CHESS_STORAGE_DIR, "images");
const CHESS_STATE_PATH = path.join(CHESS_STORAGE_DIR, "game_state.json");
const CHESS_FONT_PATH = path.join(CHESS_STORAGE_DIR, "font", "Montserrat-Bold.ttf");
const CHESS_PIECES_DIR = path.join(CHESS_STORAGE_DIR, "image");

function bFlip(coord: string): string {
  const map: Record<string, string> = { a: "h", b: "g", c: "f", d: "e", e: "d", f: "c", g: "b", h: "a" };
  const c = map[String(coord[0] || "").toLowerCase()] || "";
  const r = 9 - parseInt(String(coord[1] || "0"), 10);
  return c + r;
}

async function attachFromUrlOrPath(u: string): Promise<NodeJS.ReadableStream> {
  if (/^https?:\/\/.+/.test(u)) {
    const res = await axios.get<NodeJS.ReadableStream>(u, { responseType: "stream" });
    return res.data;
  }
  return fs.createReadStream(u);
}

const covuaCommand: Command = {
  name: "cv",
  alias: ["chess", "covua"],
  version: "1.3.0",
  role: 0,
  desc: "Cờ vua 2 người chơi ngay trong nhóm",
  guide: "{pn} create|join|chiavai|start|leave|end|check|help\nTrả lời ảnh bàn cờ bằng: e2 e4 [q|r|n|b]",
  cd: 3,
  prefix: true,

  async onLoad() {
    ChessCore.init({
      imagesDir: CHESS_IMAGES_DIR,
      statePath: CHESS_STATE_PATH,
      fontPath: CHESS_FONT_PATH,
      piecesDir: CHESS_PIECES_DIR,
      baseUrl: "",
    });
  },

  async onCall({ event, args, reply, main, userData, commandName }: CommandOnCallContext) {
    const tid = String(event.threadID);
    const sid = String(event.senderID);
    const sub = String(args[0] || "").toLowerCase();

    if (!games.has(tid)) games.set(tid, { author: "", start: 0, type: 2, player: [], play: "w" });
    const game = games.get(tid)!;

    if (sub === "create" || sub === "c") {
      if (game.author) {
        await reply("⚠️ Nhóm đang có bàn cờ vua!");
        return;
      }
      const newGame: GameSession = { author: sid, start: 0, type: 2, player: [{ id: sid, color: "" }], play: "w" };
      games.set(tid, newGame);
      await reply(`✅ Đã tạo bàn cờ, bạn đã tự động tham gia!\n📌 Trạng thái: ${newGame.player.length}/${newGame.type}`);
      return;
    }

    if (sub === "check") {
      await reply(`📌 Trạng thái: ${game.player.length}/${game.type}${game.start ? " • đang chơi" : ""}`);
      return;
    }

    if (sub === "join") {
      if (!game.author) {
        await reply("⚠ Hiện tại chưa có bàn cờ nào!");
        return;
      }
      if (game.start === 1) {
        await reply("⚠ Ván cờ đã bắt đầu!");
        return;
      }
      if (game.player.find(p => p.id === sid)) {
        await reply("⚠ Bạn đã tham gia!");
        return;
      }
      if (game.player.length >= game.type) {
        await reply("⚠ Phòng đã đầy!");
        return;
      }
      game.player.push({ id: sid, color: "" });
      games.set(tid, game);
      await reply(`📌 Trạng thái: ${game.player.length}/${game.type}`);
      return;
    }

    if (sub === "leave") {
      if (!game.author) {
        await reply("❎ Nhóm này không có bàn cờ vua!");
        return;
      }
      if (!game.player.find(p => p.id === sid)) {
        await reply("❎ Bạn chưa tham gia bàn này!");
        return;
      }
      if (game.start === 1) {
        await reply("❎ Ván cờ đã bắt đầu!");
        return;
      }
      if (game.author === sid) {
        await ChessCore.removeBoard(tid).catch(() => null);
        games.delete(tid);
        await reply("📌 Chủ game rời bàn, đã hủy ván.");
        return;
      } else {
        const i = game.player.findIndex(p => p.id === sid);
        if (i >= 0) game.player.splice(i, 1);
        games.set(tid, game);
        await reply("⚠ Bạn đã rời khỏi bàn cờ.");
        return;
      }
    }

    if (sub === "end") {
      if (!game.author) {
        await reply("⚠ Nhóm này không có bàn cờ vua!");
        return;
      }
      if (game.author !== sid) {
        await reply("⚠ Chỉ chủ bàn mới được kết thúc ván!");
        return;
      }
      const ok = await ChessCore.removeBoard(tid).then(r => !!r?.status).catch(() => false);
      games.delete(tid);
      await reply(ok ? "✅ Đã kết thúc bàn cờ!" : "⚠ Đã xảy ra lỗi khi kết thúc bàn cờ!");
      return;
    }

    if (sub === "chiavai") {
      if (!game.author) {
        await reply("⚠ Hiện tại chưa có bàn cờ nào!");
        return;
      }
      if (game.start === 1) {
        await reply("⚠ Ván cờ đã bắt đầu!");
        return;
      }
      if (game.player.length !== game.type) {
        await reply(`⚠ Cần đủ ${game.type} người. Hiện có ${game.player.length}/${game.type}.`);
        return;
      }
      const json = JSON.stringify(game.player);
      const b64 = Buffer.from(json, "utf8").toString("base64");
      const res = await ChessCore.getPlayer(tid, b64);
      if (!res || res.status !== true) {
        await reply("⚠ Lỗi chia vai.");
        return;
      }
      const mappedPlayers: GamePlayer[] = (res.result || []).map(p => ({
        id: String((p as any)?.id ?? ""),
        color: ((p as any)?.color === "black" ? "black" : "white") as Color,
      }));
      if (mappedPlayers.some(p => !p.id)) {
        await reply("⚠ Lỗi chia vai.");
        return;
      }
      game.player = mappedPlayers;
      game.play = res.start;
      games.set(tid, game);
      let msg = "Thông tin người chơi:";
      let n = 1;
      for (const p of game.player) {
        let name: string = p.id;
        if (userData && (userData as any).getName) {
          try {
            name = await (userData as any).getName(p.id);
          } catch {

          }
        }
        msg += `\n${n++}. ${name}: ${p.color}`;
      }
      msg += `\n${res.message}`;
      await reply(msg);
      return;
    }

    if (sub === "start" || sub === "s") {
      if (!game.author) {
        await reply("⚠ Chưa có ván cờ nào!");
        return;
      }
      if (game.author !== sid) {
        await reply("⚠ Chỉ chủ bàn mới được bắt đầu!");
        return;
      }
      if (game.start === 1) {
        await reply("⚠ Đã bắt đầu rồi.");
        return;
      }
      if (game.player.length !== game.type) {
        await reply(`⚠ Đang thiếu người: ${game.player.length}/${game.type}.`);
        return;
      }
      if (!game.player.some(p => p.color)) {
        const json = JSON.stringify(game.player);
        const b64 = Buffer.from(json, "utf8").toString("base64");
        const res = await ChessCore.getPlayer(tid, b64);
        if (!res || res.status !== true) {
          await reply("⚠ Lỗi chia vai.");
          return;
        }
        const mappedPlayers: GamePlayer[] = (res.result || []).map(p => ({
          id: String((p as any)?.id ?? ""),
          color: ((p as any)?.color === "black" ? "black" : "white") as Color,
        }));
        if (mappedPlayers.some(p => !p.id)) {
          await reply("⚠ Lỗi chia vai.");
          return;
        }
        game.player = mappedPlayers;
        game.play = res.start;
      }
      const b = await ChessCore.board(tid);
      if (!b?.status) {
        await reply("⚠ Lỗi tạo bàn.");
        return;
      }
      game.start = 1;
      games.set(tid, game);
      let name1 = game.player[0]?.id || "Player 1";
      let name2 = game.player[1]?.id || "Player 2";
      if (userData && (userData as any).getName) {
        try {
          name1 = await (userData as any).getName(game.player[0]?.id);
        } catch { }
        try {
          name2 = await (userData as any).getName(game.player[1]?.id);
        } catch { }
      }
      const form = {
        body: `[ Bắt Đầu Thành Công ]\n──────────────\n👤 ${name1}: ${game.player[0]?.color}\n👤 ${name2}: ${game.player[1]?.color}\n\nĐến lượt: ${b.play === "w" ? "trắng" : "đen"}`,
        attachment: await attachFromUrlOrPath(b.url),
      };
      await reply(form, (e?: unknown, info?: { messageID?: string }) => {
        if (e) return;
        const messageID = info?.messageID;
        if (messageID) {
          if (!main.onReply) main.onReply = new Map();
          main.onReply.set(messageID, { commandName, author: event.senderID, messageID, type: b.play });
        }
      });
      return;
    }

    if (sub === "help" || sub === "h") {
      await reply('Cột: a–h, Hàng: 1–8\nVí dụ: e2 e4\nPhong tốt: thêm q|r|n|b, ví dụ: a7 a8 q');
      return;
    }

    await reply(`[ Game Cờ Vua ]\n/${covuaCommand.name} create | join | chiavai | start | leave | end | check | help`);
    return;
  },

  async onReply({ event, Reply, reply, main, commandName }: CommandOnReplyContext) {
    const tid = String(event.threadID);
    const sid = String(event.senderID);
    const game = games.get(tid);
    if (!game || game.start !== 1) return;
    if (!game.player.find(p => p.id === sid)) {
      await reply("Bạn không ở trong ván này.");
      return;
    }
    const replyData = Reply as unknown as ChessReplyData | undefined;
    if (!replyData) return;
    const myColor = (game.player.find(p => p.id === sid)?.color || "white") === "white" ? "w" : "b";
    if (myColor !== replyData.type) {
      await reply(`Đây là lượt của bên ${replyData.type === "w" ? "white" : "black"}.`);
      return;
    }
    const parts = String(event.body || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      await reply("Nhập đúng định dạng: e2 e4 [q|r|n|b]");
      return;
    }
    const fromRaw = parts[0] as string;
    const toRaw = parts[1] as string;
    const promo = parts[2] as string | undefined;
    let from = fromRaw;
    let to = toRaw;
    if (replyData.type === "b") {
      from = bFlip(from);
      to = bFlip(to);
    }
    const res = await ChessCore.move(
      tid,
      String(from).toLowerCase(),
      String(to).toLowerCase(),
      promo ? String(promo).toLowerCase() : undefined
    );
    if (!res) {
      await reply("Nước đi không hợp lệ.");
      return;
    }
    if (res.status === false) {
      if (res.game === "end") {
        await reply(`Bàn cờ đã kết thúc\nWin: ${res.win === "w" ? "black" : "white"}\nTrạng thái: ${res.message}`);
        await ChessCore.removeBoard(tid).catch(() => null);
        games.delete(tid);
        return;
      }
      await reply(res.message || "Nước đi không hợp lệ.");
      return;
    }
    const form = {
      body: `✅ Bên ${res.play === "w" ? "đen" : "trắng"} đã đi\n📌 Đến lượt bên ${res.play === "w" ? "trắng" : "đen"}`,
      attachment: await attachFromUrlOrPath(res.url),
    };
    await reply(form, (e?: unknown, info?: { messageID?: string }) => {
      if (e) return;
      const messageID = info?.messageID;
      if (messageID) {
        if (!main.onReply) main.onReply = new Map();
        main.onReply.set(messageID, { commandName, author: event.senderID, messageID, type: res.play });
      }
    });
    return;
  },
};

export default covuaCommand;
