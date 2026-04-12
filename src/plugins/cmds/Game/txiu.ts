"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnChatContext,
  CommandOnReactContext,
  CommandOnReplyContext,
  ReactData,
  ReplyData,
} from "@types";
import axios from "axios";
import { createCanvas, registerFont } from "canvas";
import { createReadStream } from "fs";
import fs from "fs-extra";
import Jimp from "jimp";
import path from "path";
import { storagePath, TEMP_DIR } from "../../../core/storagePath";
import { txiuAddHistory, txiuGetHistory, txiuGetJackpot, txiuSetJackpot } from "../../../services/taixiu-db";

const TIME_CREATE_COOLDOWN_MS = 5 * 60 * 1000;
const TIME_ROOM_AUTO_END_MS = 5 * 60 * 1000;
const TIME_DIING_SEC = 10;
const RATE = 1;
const BET_MONEY_MIN = 50n;
const JACKPOT_CONTRIBUTION_PERCENT = 5;
const SELECT_VALUES: Record<string, string> = { t: "Tài", x: "Xỉu" };

function txiuJackpotCut(bet: bigint): bigint {
  return (bet * BigInt(JACKPOT_CONTRIBUTION_PERCENT)) / BigInt(100);
}

/** Cược tối đa sao cho bet + cut(bet) <= balance (integer, an toàn khi thua trừ hũ). */
function txiuMaxBetAffordable(balance: bigint): bigint {
  if (balance <= 0n) return 0n;
  return (balance * BigInt(100)) / BigInt(100 + JACKPOT_CONTRIBUTION_PERCENT);
}

/** Mặc định toàn bot: có ảnh. Chỉ OWNER: !txiu noimg | !txiu imgdefault (một cấu hình cho mọi nhóm) */

function isConfigOwner(config: { OWNER?: string | string[] } | null | undefined, senderId: string): boolean {
  const o = config?.OWNER;
  if (o == null) return false;
  return Array.isArray(o) ? o.map(String).includes(String(senderId)) : String(o) === String(senderId);
}

const dataDir = storagePath("game", "taixiu");
const globalTxiuJsonPath = path.join(dataDir, "global.json");

type GlobalTxiuFile = { diceImage?: boolean };

async function txiuShowDiceImageGlobal(): Promise<boolean> {
  try {
    if (!(await fs.pathExists(globalTxiuJsonPath))) return true;
    const j = (await fs.readJson(globalTxiuJsonPath)) as GlobalTxiuFile;
    return j.diceImage !== false;
  } catch {
    return true;
  }
}

async function persistGlobalTxiuDiceImage(mode: "off" | "on" | "default"): Promise<void> {
  await fs.ensureDir(dataDir);
  if (mode === "default") {
    if (!(await fs.pathExists(globalTxiuJsonPath))) return;
    const j = (await fs.readJson(globalTxiuJsonPath).catch(() => ({}))) as GlobalTxiuFile;
    delete j.diceImage;
    if (Object.keys(j).length === 0) await fs.remove(globalTxiuJsonPath);
    else await fs.writeJson(globalTxiuJsonPath, j, { spaces: 2 });
    return;
  }
  const j = ((await fs.pathExists(globalTxiuJsonPath))
    ? await fs.readJson(globalTxiuJsonPath).catch(() => ({}))
    : {}) as GlobalTxiuFile;
  j.diceImage = mode === "on";
  await fs.writeJson(globalTxiuJsonPath, j, { spaces: 2 });
}
const diceImgDir = path.join(dataDir, "img");

interface TxiuPlayer {
  id: string;
  select: string;
  bet_money: bigint;
}

interface TxiuRoom {
  author: string;
  players: TxiuPlayer[];
  set_timeout?: NodeJS.Timeout;
  playing?: boolean;
}

interface JackpotThread {
  amount: bigint;
  chance: number;
}

interface GameData {
  [threadID: string]: TxiuRoom;
}

interface CooldownData {
  s: Record<string, number>;
  t?: NodeJS.Timeout;
}

declare global {
  var data_command_ban_tai_xiu: CooldownData | undefined;
}

let gameData: GameData = {};
let d = global.data_command_ban_tai_xiu;
if (!d) d = global.data_command_ban_tai_xiu = { s: {} };
if (!d.s) d.s = {};
if (!d.t) {
  d.t = setInterval(() => {
    Object.entries(d.s).forEach(([key, value]) => {
      if (value <= Date.now()) delete d.s[key];
    });
  }, 1000);
}

function dicesSumMinMax(sMin: number, sMax: number): number[] {
  for (; ;) {
    const i = [0, 0, 0].map(() => Math.floor(Math.random() * 6) + 1);
    const s = i[0] + i[1] + i[2];
    if (s >= sMin && s <= sMax) return i;
  }
}

function parseAmount(value: string | number | undefined): bigint | number {
  if (value === undefined || value === null) return NaN;
  if (!isNaN(Number(value))) return BigInt(Math.floor(Number(value)));
  const match = String(value).match(/^\d+$/);
  if (match) return BigInt(value);
  const complexMatch = String(value).match(/^(\d*\.?\d*)([bkmtr]*)?(\d*)$/i);
  if (!complexMatch) return NaN;
  let [, mainNumber, unit, decimalPart] = complexMatch;
  let numericValue = parseFloat(mainNumber + (decimalPart ? "." + decimalPart : ""));
  numericValue = Math.floor(numericValue * 100);
  const baseNumber = BigInt(numericValue);
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
  const addThou = (numStr: string) => numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return addThou(strAmount) + " VNĐ";
}

const DAY_NO_HU = [
  [6, 6, 6],
  [1, 1, 1],
  [2, 2, 2],
  [3, 3, 3],
  [4, 4, 4],
  [5, 5, 5],
];

function isTrungDayNoHu(xucXac: number[]): boolean {
  if (xucXac.length < 3) return false;
  const sortedInput = [...xucXac].sort((a, b) => a - b);
  return DAY_NO_HU.some((d) => {
    const sortedD = [...d].sort((a, b) => a - b);
    return sortedInput.every((val, idx) => val === sortedD[idx]);
  });
}

async function compositeDices(dices: number[]): Promise<string> {
  const paths = dices.map((n) => path.join(diceImgDir, `${n}.jpg`));
  const images = await Promise.all(paths.map((p) => Jimp.read(p).catch(() => null)));
  const valid = images.filter((img): img is Jimp => img != null);
  if (valid.length === 0) throw new Error("Không đọc được ảnh xúc xắc");
  const w = valid.reduce((a, img) => a + img.getWidth(), 0);
  const h = Math.max(...valid.map((img) => img.getHeight()));
  const composite = new Jimp(w, h);
  let x = 0;
  for (const img of valid) {
    composite.composite(img, x, 0);
    x += img.getWidth();
  }
  const outPath = path.join(TEMP_DIR(), `txiu_${Date.now()}.png`);
  await fs.ensureDir(path.dirname(outPath));
  await composite.writeAsync(outPath);
  return outPath;
}

const txiuCommand: Command = {
  name: "txiu",
  alias: ["txiu"],
  version: "2.0.0",
  role: 0,
  desc: "Game tài xỉu nhiều người chơi",
  guide: `   {pn} [lựa chọn] [số tiền]

    1️⃣ Tạo bàn chơi:
       • {pn} create hoặc {pn} c để tạo bàn mới
       • {pn} end để kết thúc bàn
       • Gõ "xổ" để bắt đầu tung xúc xắc
       • Gõ "rời" để rời khỏi bàn chơi
       • Gõ "infotx" để xem thông tin bàn

    2️⃣ Cách đặt cược:
       • Gõ "tài" hoặc "xỉu" + số tiền để đặt cược
       • VD: tài 1000, xỉu 5000

    3️⃣ Cách đặt tiền cược:
       • Số tiền trực tiếp: 1000, 5000, 10000,...
       • Dùng "allin" hoặc "all" để cược tất cả số tiền
       • Dùng % để cược theo phần trăm số dư:
         VD: tài 50% (cược 50% số tiền hiện có)

    4️⃣ Đơn vị tiền tệ:
       • tr = triệu | b = tỷ

    5️⃣ OWNER bot — ảnh xúc xắc (một cấu hình cho toàn bot, mọi nhóm):
       • {pn} noimg | tat-anh | tắt ảnh — tắt ảnh (chỉ chữ)
       • {pn} imgdefault | mac-dinh | mặc định — về mặc định (có ảnh)
       • {pn} imgon | bat-anh | bật ảnh — bật ảnh

    💡 Chủ bàn có 5 phút để xổ, sau đó bàn sẽ tự hủy`,
  cd: 3,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext) => {
    const { client, event, args, threadData, main, commandName } = ctx;
    const { threadID: tid, messageID: mid, senderID: sid } = event;
    const prf = (ctx.config?.PREFIX as string) || "!";

    const sendWithId = (msg: unknown): Promise<{ messageID?: string }> =>
      new Promise((resolve) => {
        client.sendMessage(
          msg as string | object,
          tid,
          (_err: Error | null, res: { messageID?: string }) => resolve(res || {}),
          mid
        );
      });

    const send = async (msg: unknown): Promise<void> => {
      await sendWithId(msg);
    };

    const p = gameData[tid]?.players;

    if (/^(create|c|-c)$/.test(args[0] || "")) {
      if (tid in gameData) return send("❎ Nhóm đã tạo bàn tài xỉu rồi!");
      if (sid in d.s && d.s[sid] > Date.now()) {
        const remaining = d.s[sid] - Date.now();
        const minutes = Math.floor(remaining / 1000 / 60);
        const seconds = Math.floor((remaining / 1000) % 60);
        return send(`⏳ Vui lòng quay lại sau ${minutes} phút ${seconds} giây. Mỗi người chỉ được tạo bàn mỗi 5 phút một lần`);
      }
      d.s[sid] = Date.now() + TIME_CREATE_COOLDOWN_MS;
      gameData[tid] = {
        author: sid,
        players: [],
        set_timeout: setTimeout(() => {
          delete gameData[tid];
          client.sendMessage("⛔ Đã 5p trôi qua không có ai xổ, tiến hành hủy bàn", tid);
        }, TIME_ROOM_AUTO_END_MS),
      };
      return send("✅ Tạo bàn tài xỉu thành công\n📌 Ghi tài/xỉu + số tiền để cược");
    }

    if (/^end$/.test(args[0] || "")) {
      if (!p) return send(`❎ Nhóm chưa tạo bàn tài xỉu. Để tạo hãy dùng: ${prf}txiu create`);
      const threadInfo = (await threadData.get(tid))?.threadInfo;
      const adminIDs = threadInfo?.adminIDs || [];
      const isAdmin = adminIDs.some((a: { id?: string } | string) => (typeof a === "object" ? a?.id === sid : a === sid));
      if (!isAdmin) return send("❎ Chỉ QTV nhóm mới có thể kết thúc bàn.");
      const getName = ctx.userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
      const playerLines = await Promise.all(p.map(async (pl, i) => `${i + 1}. ${getName ? await getName(pl.id) : pl.id}`));
      const required = Math.ceil((p.length * 50) / 100);
      const sent = await sendWithId({
        body: `📌 QTV đã yêu cầu kết thúc bàn tài xỉu. Những người đặt cược sau thả cảm xúc để xác nhận.\n\n${playerLines.join("\n")}\n\nTổng cảm xúc đạt ${required}/${p.length} người bàn tài xỉu sẽ kết thúc.`,
      });
      const res = sent as { messageID?: string; commandName?: string; p?: TxiuPlayer[]; r?: number };
      if (res?.messageID) {
        res.commandName = commandName;
        res.p = p;
        res.r = 0;
        main.onReact.set(res.messageID, res as unknown as ReactData);
      }
      return;
    }

    if (/^stats$/.test(args[0] || "")) {
      try {
        const historyData = await txiuGetHistory(tid, 1000);
        if (!historyData || historyData.length === 0) return send("❎ Chưa có lịch sử phiên nào trong nhóm này");
        const totalGames = historyData.length;
        const taiCount = historyData.filter((g) => g.result === "t").length;
        const xiuCount = historyData.filter((g) => g.result === "x").length;
        const taiPercent = totalGames ? ((taiCount / totalGames) * 100).toFixed(1) : "0";
        const xiuPercent = totalGames ? ((xiuCount / totalGames) * 100).toFixed(1) : "0";

        const fontPath = storagePath("font", "TUVBenchmark.ttf");
        async function ensureFont() {
          if (fs.existsSync(fontPath)) return;
          try {
            const { data } = await axios.get(
              "https://drive.google.com/u/0/uc?id=1NIoSu00tStE8bIpVgFjWt2in9hkiIzYz&export=download",
              { responseType: "arraybuffer" }
            );
            await fs.ensureDir(path.dirname(fontPath));
            fs.writeFileSync(fontPath, Buffer.from(data));
          } catch (e) {
            console.error("Failed to download font:", e);
          }
        }
        await ensureFont();
        if (!fs.existsSync(fontPath)) return send("❎ Không thể tải font để tạo biểu đồ.");

        registerFont(fontPath, { family: "CustomFont" });
        const width = 900;
        const height = 450;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");
        const scaleFactor = 2;
        canvas.width = width * scaleFactor;
        canvas.height = height * scaleFactor;
        ctx.scale(scaleFactor, scaleFactor);

        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, "#3d1e56");
        gradient.addColorStop(1, "#120d1b");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#ffcc00";
        ctx.font = "bold 28px 'CustomFont'";
        ctx.textAlign = "center";
        ctx.fillText("Thống Kê Tài Xỉu", width / 2, 50);
        ctx.fillStyle = "#ffffff";
        ctx.font = "18px 'CustomFont'";
        ctx.fillText(`Tổng số phiên: ${totalGames}`, width / 2, 80);
        ctx.fillText(`Tài: ${taiCount} (${taiPercent}%) - Xỉu: ${xiuCount} (${xiuPercent}%)`, width / 2, 110);

        const paddingTop = 130;
        const paddingBottom = 60;
        const paddingX = 80;
        const labelPadding = 50;
        const chartWidth = width - paddingX * 2 - labelPadding;
        const chartHeight = height - paddingTop - paddingBottom;
        ctx.strokeStyle = "#aaaaaa";
        ctx.lineWidth = 1.5;
        for (let i = 3; i <= 18; i += 3) {
          const y = height - paddingBottom - (i - 3) * (chartHeight / 15);
          ctx.beginPath();
          ctx.moveTo(paddingX + labelPadding, y);
          ctx.lineTo(width - paddingX, y);
          ctx.stroke();
          ctx.fillStyle = "#ffffff";
          ctx.font = "16px 'CustomFont'";
          ctx.textAlign = "center";
          ctx.fillText(String(i), paddingX + labelPadding / 2, y + 5);
        }
        for (let i = 0; i < 8; i++) {
          const x = paddingX + labelPadding + (i * chartWidth) / 7;
          ctx.beginPath();
          ctx.moveTo(x, height - paddingBottom);
          ctx.lineTo(x, paddingTop);
          ctx.stroke();
        }
        const slice = historyData.slice(0, 8).reverse();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        slice.forEach((game, i) => {
          const x = paddingX + labelPadding + (i * chartWidth) / 7;
          const y = height - paddingBottom - ((game.sum - 3) * chartHeight) / 15;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        slice.forEach((game, i) => {
          const x = paddingX + labelPadding + (i * chartWidth) / 7;
          const y = height - paddingBottom - ((game.sum - 3) * chartHeight) / 15;
          const isTai = game.result === "t";
          ctx.fillStyle = isTai ? "black" : "white";
          ctx.beginPath();
          ctx.arc(x, y, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "black";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = isTai ? "white" : "black";
          ctx.font = "bold 18px 'CustomFont'";
          ctx.fillText(String(game.sum), x, y + 6);
        });
        const legendX = paddingX + labelPadding;
        const legendY = height - 50;
        ctx.font = "bold 18px 'CustomFont'";
        ctx.textAlign = "left";
        ctx.fillStyle = "black";
        ctx.beginPath();
        ctx.arc(legendX, legendY + 20, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.fillText("Tài (≥11)", legendX + 30, legendY + 25);
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(legendX + 150, legendY + 20, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.fillText("Xỉu (<11)", legendX + 180, legendY + 25);

        const chartPath = path.join(TEMP_DIR(), `txiu_chart_${tid}.png`);
        await fs.ensureDir(path.dirname(chartPath));
        const out = fs.createWriteStream(chartPath);
        const stream = canvas.createPNGStream();
        stream.pipe(out);
        await new Promise<void>((resolve, reject) => {
          out.on("finish", () => resolve());
          out.on("error", reject);
        });
        const historyDisplay = slice.map((g) => (g.result === "t" ? "⚫" : "⚪")).join("");
        await send({
          body: `[ THỐNG KÊ TÀI XỈU ]\n━━━━━━━━━━━━━━━━━━━\nTổng số phiên: ${totalGames}\nTài: ${taiCount} (${taiPercent}%)\nXỉu: ${xiuCount} (${xiuPercent}%)\n━━━━━━━━━━━━━━━━━━━\n8 phiên gần nhất:\n${historyDisplay}`,
          attachment: createReadStream(chartPath),
        });
      } catch (err) {
        console.error("Error generating txiu chart:", err);
        return send("❎ Đã xảy ra lỗi khi tạo biểu đồ.");
      }
      return;
    }

    const arg0 = (args[0] || "").trim().toLowerCase().normalize("NFC");
    const joined2 = [args[0], args[1]]
      .filter(Boolean)
      .join(" ")
      .trim()
      .toLowerCase()
      .normalize("NFC")
      .replace(/\s+/g, "");
    const isNoImg =
      /^(noimg|tat-anh|tat_anh|tatanh|tắt-ảnh|tắtảnh)$/.test(arg0) ||
      joined2 === "tắtảnh" ||
      joined2 === "tatanh";
    const isImgOn =
      /^(imgon|img|bat-anh|bat_anh|batanh|bật-ảnh|bậtảnh)$/.test(arg0) ||
      joined2 === "bậtảnh" ||
      joined2 === "batanh";
    const isImgDefault =
      /^(imgdefault|mac-dinh|mac_dinh|macdinh|mặc-định|mặcđịnh)$/.test(arg0) ||
      joined2 === "mặcđịnh" ||
      joined2 === "macdinh" ||
      joined2 === "imgdefault";
    if (isNoImg || isImgOn || isImgDefault) {
      if (!isConfigOwner(ctx.config as { OWNER?: string | string[] } | undefined, sid)) {
        return send("❎ Chỉ OWNER bot mới có thể chỉnh cấu hình ảnh tài xỉu.");
      }
      if (isNoImg) {
        await persistGlobalTxiuDiceImage("off");
        return send("✅ Đã tắt ảnh xúc xắc toàn bot. Kết quả chỉ gửi chữ.");
      }
      if (isImgOn) {
        await persistGlobalTxiuDiceImage("on");
        return send("✅ Đã bật ảnh xúc xắc toàn bot.");
      }
      await persistGlobalTxiuDiceImage("default");
      return send("✅ Đã đặt mặc định toàn bot: có ảnh xúc xắc.");
    }

    return send(
      `✏️ Để tạo bàn tài xỉu:\n𖢨 ${prf}txiu create | -c | c\n🔰 Để tham gia cược hãy chat:\ntài/xỉu [số_tiền/allin/%/tr/tỷ]\n🔎 Để xem thông tin bàn hãy chat: infotx\n🔗 Để rời bàn hãy chat: rời\n🎰 Bắt đầu xổ chat: xổ\n🖼 OWNER — toàn bot: ${prf}txiu noimg | ${prf}txiu imgdefault | ${prf}txiu imgon`
    );
  },

  onChat: async (ctx: CommandOnChatContext) => {
    const { client, event, userData, threadData, main, commandName } = ctx;
    const { args = [], threadID: tid, messageID: mid, senderID: sid } = event;

    const sendWithId = (msg: unknown): Promise<{ messageID?: string }> =>
      new Promise((resolve) => {
        client.sendMessage(
          msg as string | object,
          tid,
          (_err: Error | null, res: { messageID?: string }) => resolve(res || {}),
          mid
        );
      });

    const send = async (msg: unknown): Promise<void> => {
      await sendWithId(msg);
    };

    const rawSelect = (args[0] || "").toLowerCase();
    const select =
      /^(tài|tai|t)$/.test(rawSelect) ? "t"
        : /^(xỉu|xiu|x)$/.test(rawSelect) ? "x"
          : /^(rời|leave)$/.test(rawSelect) ? "l"
            : /^infotx$/.test(rawSelect) ? "i"
              : /^xổ$/.test(rawSelect) ? "o"
                : /^(end|remove|xóa)$/.test(rawSelect) ? "r"
                  : null;

    const checkMoney = userData.checkMoney as ((id: string) => Promise<bigint | number>) | undefined;
    const money = async (id: string) => (checkMoney ? await checkMoney(id) : 0);
    const betMoneyInput = args[1];

    if (!(tid in gameData) || select == null) return;
    const room = gameData[tid];
    const p = room.players;
    if (room.playing) return send("❎ Bàn đang xổ không thể thực hiện hành động");

    if (select === "t" || select === "x") {
      let betMoney: bigint;
      const balanceNow = BigInt(await money(sid));
      const maxAffordable = txiuMaxBetAffordable(balanceNow);

      if (/^(allin|all)$/.test(betMoneyInput || "")) {
        betMoney = maxAffordable;
      } else if (/^[0-9]+%$/.test(betMoneyInput || "")) {
        const match = betMoneyInput?.match(/^([0-9]+)/);
        if (!match) return send("❎ Tiền cược không hợp lệ");
        betMoney = (balanceNow * BigInt(match[1])) / BigInt(100);
        if (betMoney > maxAffordable) betMoney = maxAffordable;
      } else {
        const parsed = parseAmount(betMoneyInput);
        if (typeof parsed === "number" && isNaN(parsed)) return send("❎ Tiền cược không hợp lệ");
        betMoney = typeof parsed === "bigint" ? parsed : BigInt(parsed);
      }
      if (betMoney < BET_MONEY_MIN) return send(`❎ Vui lòng đặt ít nhất ${formatCurrency(BET_MONEY_MIN)}`);
      const balanceCheck = BigInt(await money(sid));
      const maxAgain = txiuMaxBetAffordable(balanceCheck);
      if (betMoney + txiuJackpotCut(betMoney) > balanceCheck) {
        if (maxAgain < BET_MONEY_MIN) {
          return send(
            `❎ Không đủ tiền. Khi thua bot trừ thêm ${JACKPOT_CONTRIBUTION_PERCENT}% vào hũ (cược + hũ ≤ số dư).`
          );
        }
        return send(
          `❎ Không đủ tiền (thua sẽ trừ cược + ${JACKPOT_CONTRIBUTION_PERCENT}% hũ). Tối đa có thể cược: ${formatCurrency(maxAgain)}`
        );
      }
      const player = p.find((pl) => pl.id === sid);
      if (player) {
        player.select = select;
        player.bet_money = betMoney;
        return send(`✅ Đã thay đổi cược từ "${SELECT_VALUES[player.select]}" ${formatCurrency(player.bet_money)} sang ${SELECT_VALUES[select]} ${formatCurrency(betMoney)}`);
      }
      p.push({ id: sid, select, bet_money: betMoney });
      return send(`✅ Bạn đã cược "${SELECT_VALUES[select]}" với số tiền ${formatCurrency(betMoney)}`);
    }

    if (select === "l") {
      if (sid === room.author) {
        if (room.set_timeout) clearTimeout(room.set_timeout);
        delete gameData[tid];
        return send("✅ Rời bàn thành công vì bạn là chủ bàn nên bàn sẽ bị huỷ");
      }
      const idx = p.findIndex((pl) => pl.id === sid);
      if (idx !== -1) {
        p.splice(idx, 1);
        return send("✅ Rời bàn thành công");
      }
      return send("❎ Bạn không có trong bàn tài xỉu");
    }

    if (select === "i") {
      const getName = userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
      const playerList = await Promise.all(
        p.map(async (pl, i) => {
          const name = getName ? await getName(pl.id) : pl.id;
          return ` ${i + 1}. ${name} cược ${formatCurrency(pl.bet_money)} vào ${SELECT_VALUES[pl.select]}\n────────────────────`;
        })
      );
      const hostName = getName ? await getName(room.author) : room.author;
      return send(
        `[ THÔNG TIN BÀN TÀI XỈU ]\n────────────────────\n🎰 Tỉ lệ ăn 1 : ${RATE}\n👤 Tổng ${p.length} người tham gia gồm:\n${playerList.join("\n")}\n📌 Chủ bàn: ${hostName}`
      );
    }

    if (select === "o") {
      if (sid !== room.author) return send("❎ Bạn không phải chủ bàn nên không thể bắt đầu xổ");
      if (p.length === 0) return send("❎ Chưa có ai tham gia đặt cược nên không thể bắt đầu xổ");

      room.playing = true;
      const jackpotRow = await txiuGetJackpot(tid);
      const jackpotData: JackpotThread = { amount: jackpotRow.amount, chance: jackpotRow.chance };
      if (!Number.isFinite(jackpotData.chance)) jackpotData.chance = 1;

      const diing = await sendWithId("🎲 Bot đang lắc, Chờ xíu...");
      const dices = dicesSumMinMax(4, 17);
      const sum = dices.reduce((a, b) => a + b, 0);
      const winner = sum > 10 ? "t" : "x";
      const winnerPlayers = p.filter((pl) => pl.select === winner);
      const losePlayers = p.filter((pl) => pl.select !== winner);

      losePlayers.forEach((player) => {
        const contribution = (player.bet_money * BigInt(JACKPOT_CONTRIBUTION_PERCENT)) / BigInt(100);
        jackpotData.amount += contribution;
      });

      jackpotData.chance = Math.min(jackpotData.chance + 0.2, 1);
      const jackpotAmount = jackpotData.amount;
      let jackpotWinner: TxiuPlayer | undefined;

      if (isTrungDayNoHu(dices) && jackpotAmount > 0n && Math.random() < 0.25) {
        if (winnerPlayers.length > 0) {
          jackpotWinner = winnerPlayers[Math.floor(Math.random() * winnerPlayers.length)];
          const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
          if (addMoney) await addMoney(jackpotWinner.id, jackpotAmount);
          jackpotData.amount = 0n;
          jackpotData.chance = 0.3;
        }
      } else if (Math.random() * 100 < jackpotData.chance && jackpotAmount > 0n && winnerPlayers.length > 0) {
        jackpotWinner = winnerPlayers[Math.floor(Math.random() * winnerPlayers.length)];
        const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (addMoney) await addMoney(jackpotWinner.id, jackpotAmount);
        jackpotData.amount = 0n;
        jackpotData.chance = 0.3;
      }

      await txiuAddHistory(tid, { time: Date.now(), result: winner, dices, sum });
      await txiuSetJackpot(tid, { amount: jackpotData.amount, chance: jackpotData.chance });
      const historyData = await txiuGetHistory(tid, 8);

      const historyDisplay = historyData.map((g) => (g.result === "t" ? "⚫" : "⚪")).reverse().join("");
      if (diing?.messageID) client.unsendMessage(diing.messageID, tid);
      await new Promise((r) => setTimeout(r, 1000 * TIME_DIING_SEC));

      const showDice = await txiuShowDiceImageGlobal();
      let imagePath = "";
      if (showDice) {
        try {
          imagePath = await compositeDices(dices);
        } catch {
          imagePath = "";
        }
      }

      const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
      const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
      const getName = userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;

      let totalJackpotContribution = BigInt(0);
      for (const pl of losePlayers) {
        const loss = pl.bet_money;
        const contribution = (loss * BigInt(JACKPOT_CONTRIBUTION_PERCENT)) / BigInt(100);
        const owed = loss + contribution;
        if (delMoney) {
          try {
            await delMoney(pl.id, owed);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.startsWith("Insufficient funds.")) {
              const cur = BigInt(await money(pl.id));
              if (cur > 0n) {
                try {
                  await delMoney(pl.id, cur);
                } catch (e2) {
                  console.error("txiu delMoney fallback failed:", pl.id, e2);
                }
              }
              console.error("txiu insufficient at settle (balance changed after bet?):", pl.id, msg);
            } else {
              throw e;
            }
          }
        }
        totalJackpotContribution += contribution;
      }

      const winLines = await Promise.all(
        winnerPlayers.map(async (pl, i) => {
          const win = pl.bet_money * BigInt(RATE);
          if (addMoney) await addMoney(pl.id, win);
          const name = getName ? await getName(pl.id) : pl.id;
          return `${i + 1}. ${name}\n  + ${formatCurrency(win)}`;
        })
      );
      const loseLines = await Promise.all(
        losePlayers.map(async (pl, i) => {
          const name = getName ? await getName(pl.id) : pl.id;
          return `${i + 1}. ${name}\n  - ${formatCurrency(pl.bet_money)}`;
        })
      );
      const jackpotLine = jackpotWinner
        ? `\n💥 ${getName ? await getName(jackpotWinner.id) : jackpotWinner.id} nổ hũ: ${formatCurrency(jackpotAmount)}`
        : "";

      const jackpotNow = (await txiuGetJackpot(tid)).amount;
      const bodyFinal =
        `Kết quả: ${dices.join(" | ")} - Tổng: ${sum} điểm (${SELECT_VALUES[winner]})\n\n[ Người Thắng ]\n${winLines.join("\n") || "Không có ai thắng"}\n\n[ Người Thua ]\n${loseLines.join("\n") || "Không có ai thua"}\n\nHũ hiện tại: ${formatCurrency(jackpotNow)} (tăng thêm: ${formatCurrency(totalJackpotContribution)})${jackpotLine}\nPhiên gần đây:\n${historyDisplay}`;

      if (imagePath && fs.existsSync(imagePath)) {
        await send({ body: bodyFinal, attachment: createReadStream(imagePath) });
      } else {
        await send(bodyFinal);
      }

      if (room.set_timeout) clearTimeout(room.set_timeout);
      delete gameData[tid];
    }

    if (select === "r") {
      const threadInfo = (await threadData.get(tid))?.threadInfo;
      const adminIDs = threadInfo?.adminIDs || [];
      const isAdmin = adminIDs.some((a: { id?: string } | string) => (typeof a === "object" ? a?.id === sid : a === sid));
      if (!isAdmin) return;
      const getName = userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
      const playerNames = await Promise.all(p.map(async (pl, i) => `${i + 1}. ${getName ? await getName(pl.id) : pl.id}`));
      const required = Math.ceil((p.length * 50) / 100);
      const sent = await sendWithId(
        `📌 QTV đã yêu cầu kết thúc bàn tài xỉu. Những người đặt cược sau thả cảm xúc để xác nhận.\n\n${playerNames.join("\n")}\n\nTổng cảm xúc đạt ${required}/${p.length} người bàn tài xỉu sẽ kết thúc.`
      );
      const res = sent as { messageID?: string; commandName?: string; p?: TxiuPlayer[]; r?: number };
      if (res?.messageID) {
        res.commandName = commandName;
        res.p = p;
        res.r = 0;
        main.onReact.set(res.messageID, res as unknown as ReactData);
      }
    }
  },

  onReply: async (ctx: CommandOnReplyContext) => {
    const { client, event, Reply } = ctx;
    const { threadID: tid, messageID: mid } = event;
    const send = (msg: unknown): Promise<void> =>
      new Promise((resolve) => {
        client.sendMessage(msg as string | object, tid, () => resolve(), mid);
      });
    const replyData = Reply as ReplyData & { type?: string; cb?: (d: number[]) => void };
    if (replyData.type === "change.result.dices") {
      const args = (event.body || "").trim().split(/\s+/);
      if (args.length === 3 && args.every((x) => isFinite(Number(x)) && Number(x) > 0 && Number(x) < 7)) {
        if (replyData.cb) replyData.cb(args.map(Number));
        return send("✅ Đã thay đổi kết quả tài xỉu");
      }
      if (/^(tài|tai|t|xỉu|xiu|x)$/.test((args[0] || "").toLowerCase())) {
        const isTai = /^(tài|tai|t)$/.test(args[0].toLowerCase());
        const dices = isTai ? dicesSumMinMax(11, 17) : dicesSumMinMax(4, 10);
        return send(`✅ Đã thay đổi kết quả thành ${args[0]}\n🎲 Xúc xắc: ${dices.join(".")}`);
      }
      return send("⚠️ Vui lòng reply tài/xỉu hoặc 3 số của mặt xúc xắc\nVD: 2 3 4");
    }
  },

  onReact: async (ctx: CommandOnReactContext): Promise<void> => {
    const { client, event, Reaction } = ctx;
    const { threadID: tid } = event;
    const send = (msg: unknown): Promise<void> =>
      new Promise((resolve) => {
        client.sendMessage(msg as string | object, tid, () => resolve());
      });
    if (!(tid in gameData)) {
      await send("❎ Bàn tài xỉu đã kết thúc không thể bỏ phiếu tiếp");
      return;
    }
    const reactData = Reaction as ReactData & { p?: TxiuPlayer[]; r?: number };
    if (reactData.p?.some((pl) => pl.id === event.senderID || pl.id === event.userID)) {
      reactData.r = (reactData.r || 0) + 1;
      await send(`📌 Đã có ${reactData.r}/${reactData.p.length} phiếu`);
      const required = Math.ceil((reactData.p.length * 50) / 100);
      if (reactData.r >= required) {
        const room = gameData[tid];
        if (room?.set_timeout) clearTimeout(room.set_timeout);
        delete gameData[tid];
        await send("✅ Đã hủy bàn tài xỉu thành công");
      }
    }
  },
};

export default txiuCommand;
