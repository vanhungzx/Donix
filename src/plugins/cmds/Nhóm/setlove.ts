import type { Command, CommandOnCallContext, EventContext } from "@types";
import fs from "fs-extra";
import path from "path";
import axios from "axios";
import moment from "moment-timezone";
import { createCanvas, registerFont, loadImage, CanvasRenderingContext2D, Image } from "canvas";

moment.tz.setDefault("Asia/Ho_Chi_Minh");
moment.locale("vi");

// Ensure storage directory exists and setlove.json is initialized
const DATA_DIR = path.join(process.cwd(), "storage");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const dataPath = path.join(DATA_DIR, "setlove.json");
if (!fs.existsSync(dataPath)) fs.writeJsonSync(dataPath, {});

// Type definitions for setlove data
interface LoveInfo {
  lover: string;
  time: number;
  milestones: number[];
}

interface ThreadLoveData {
  [userID: string]: LoveInfo;
}

interface AllLoveData {
  [threadID: string]: ThreadLoveData;
}

const MILESTONES = [30, 70, 100, 200, 365, 500, 1000];
const LOVE_QUOTES = [
  "Love is simple, just you & me ❤️",
  "Together is a wonderful place to be 💞",
  "You are my today and all of my tomorrows 💖",
  "Love grows stronger every single day 💕",
  "My favorite place is right next to you 💓"
];

// ================= HELPER FUNCTIONS =================

function loadJSON<T>(filePath: string, defaultData: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      fs.ensureDirSync(path.dirname(filePath));
      fs.writeJsonSync(filePath, defaultData, { spaces: 2 });
      return defaultData;
    }
    return fs.readJsonSync(filePath);
  } catch (e) {
    console.error(`Error loading JSON from ${filePath}:`, e);
    return defaultData;
  }
}

function saveJSON<T>(filePath: string, data: T): void {
  try {
    fs.writeJsonSync(filePath, data, { spaces: 2 });
  } catch (e) {
    console.error(`Error saving JSON to ${filePath}:`, e);
  }
}

async function drawTextWithEmoji(ctx: CanvasRenderingContext2D, text: string | number, x: number, y: number, fontSize: number, align: CanvasTextAlign = "left") {
  const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
  const parts = String(text).split(emojiRegex);
  
  let totalWidth = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (emojiRegex.test(part)) {
      totalWidth += fontSize + 5;
    } else if (part) {
      totalWidth += ctx.measureText(part).width;
    }
  }

  let currentX = x;
  if (align === "center") currentX -= totalWidth / 2;
  else if (align === "right") currentX -= totalWidth;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (emojiRegex.test(part)) {
      try {
        const codePoint = [...part].map(char => char.codePointAt(0)?.toString(16)).join("-");
        const emojiImg = await loadImage(`https://abs.twimg.com/emoji/v2/72x72/${codePoint}.png`);
        ctx.drawImage(emojiImg, currentX, y - fontSize + 5, fontSize, fontSize);
        currentX += fontSize + 5;
      } catch (e) { 
        console.error("Error loading emoji image:", e);
        currentX += 5; 
      }
    } else if (part) {
      ctx.fillText(part, currentX, y);
      currentX += ctx.measureText(part).width;
    }
  }
}

function drawCircleImage(ctx: CanvasRenderingContext2D, img: Image, x: number, y: number, size: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
  
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2, true);
  ctx.stroke();
}

// ================= VẼ CANVAS =================
async function createLoveCard(name1: string, name2: string, avatar1: string, avatar2: string, days: number, date: string, quote: string): Promise<string> {
  const width = 1000;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#ff758c");
  gradient.addColorStop(1, "#ff7eb3");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.beginPath(); ctx.arc(100, 100, 200, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(900, 500, 150, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  const margin = 50;
  // @ts-ignore
  ctx.roundRect(margin, margin, width - margin * 2, height - margin * 2, 30);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 60px Arial";
  ctx.textAlign = "left";
  await drawTextWithEmoji(ctx, "💖 SET LOVE 💖", width / 2, 130, 60, "center");

  const avatarSize = 200;
  const centerY = height / 2;
  
  try {
    const [img1, img2] = await Promise.all([
      loadImage(avatar1),
      loadImage(avatar2)
    ]);
    drawCircleImage(ctx, img1, 150, centerY - avatarSize / 2 - 30, avatarSize);
    drawCircleImage(ctx, img2, width - 150 - avatarSize, centerY - avatarSize / 2 - 30, avatarSize);
  } catch (e) {
    console.error("Error loading avatars:", e);
  }

  ctx.fillStyle = "#fff";
  const heartX = width / 2;
  const heartY = centerY - 10;
  const heartSize = 60;
  ctx.beginPath();
  ctx.moveTo(heartX, heartY + heartSize / 4);
  ctx.bezierCurveTo(heartX, heartY, heartX - heartSize / 2, heartY, heartX - heartSize / 2, heartY + heartSize / 4);
  ctx.bezierCurveTo(heartX - heartSize / 2, heartY + heartSize / 2, heartX, heartY + heartSize * 0.75, heartX, heartY + heartSize);
  ctx.bezierCurveTo(heartX, heartY + heartSize * 0.75, heartX + heartSize / 2, heartY + heartSize / 2, heartX + heartSize / 2, heartY + heartSize / 4);
  ctx.bezierCurveTo(heartX + heartSize / 2, heartY, heartX, heartY, heartX, heartY + heartSize / 4);
  ctx.fill();

  ctx.font = "bold 30px Arial";
  await drawTextWithEmoji(ctx, name1.toUpperCase(), 150 + avatarSize / 2, centerY + avatarSize / 2 + 30, 30, "center");
  await drawTextWithEmoji(ctx, name2.toUpperCase(), width - 150 - avatarSize / 2, centerY + avatarSize / 2 + 30, 30, "center");

  ctx.textAlign = "center";
  ctx.font = "bold 90px Arial";
  ctx.fillText(days.toString(), width / 2, centerY - 50);
  
  ctx.font = "bold 25px Arial";
  ctx.fillText("DAYS OF LOVE", width / 2, centerY - 10);
  
  ctx.font = "italic 24px Arial";
  ctx.fillText(`Since: ${date}`, width / 2, centerY + 100);

  ctx.font = "italic 22px Arial";
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  await drawTextWithEmoji(ctx, `"${quote}"`, width / 2, height - 90, 22, "center");

  const imagePath = path.join(DATA_DIR, `love_${Date.now()}.png`);
  fs.writeFileSync(imagePath, canvas.toBuffer("image/png"));
  return imagePath;
}

// ================= GỬI CARD =================
async function sendLoveCard(api: CommandOnCallContext["api"], threadID: string, uid1: string, uid2: string, startTime: number) {
  const info1 = (await api.getUserInfo(uid1))[uid1];
  const info2 = (await api.getUserInfo(uid2))[uid2];
  
  const avatar1 = `https://graph.facebook.com/${uid1}/picture?height=720&width=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
  const avatar2 = `https://graph.facebook.com/${uid2}/picture?height=720&width=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;

  const start = moment(startTime).tz("Asia/Ho_Chi_Minh").startOf("day");
  const now = moment().startOf("day");
  const days = now.diff(start, "days");
  const date = start.format("DD/MM/YYYY");
  const quote = LOVE_QUOTES[Math.floor(Math.random() * LOVE_QUOTES.length)];

  const cardPath = await createLoveCard(info1.name, info2.name, avatar1, avatar2, days, date, quote);

  return api.sendMessage({
    body: `💖 Chúc mừng hạnh phúc hai bạn: ${info1.name} ❤️ ${info2.name}!\n⏳ Đã bên nhau được ${days} ngày.`,
    attachment: fs.createReadStream(cardPath)
  }, threadID, () => {
    if (fs.existsSync(cardPath)) fs.unlinkSync(cardPath);
  });
}

const setloveCommand: Command = {
  name: "setlove",
  version: "4.3.0",
  hasPermssion: 0,
  credits: "nvh",
  description: "Setlove với giao diện Card Canvas",
  commandCategory: "Box",
  usages: "add @tag | check [@tag/reply] | del",
  cooldowns: 5,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext) => {
    const { reply, event, args, api } = ctx;
    const { threadID, senderID, mentions, messageReply } = event;
    const data = loadJSON<AllLoveData>(dataPath, {});
    if (!data[threadID]) data[threadID] = {};

    const sub = args[0];

    if (sub === "add") {
      if (data[threadID][senderID]) return reply("❌ Bạn đã setlove rồi!");

      let loverID: string | undefined = Object.keys(mentions).length ? Object.keys(mentions)[0] : (messageReply ? messageReply.senderID : undefined);
      if (!loverID) return reply("❌ Tag hoặc reply người muốn setlove!");
      if (loverID === senderID) return reply("❌ Không thể tự setlove với bản thân!");
      if (data[threadID][loverID]) return reply("❌ Người này đã có setlove!");

      const time = Date.now();
      data[threadID][senderID] = { lover: loverID, time, milestones: [] };
      data[threadID][loverID] = { lover: senderID, time, milestones: [] };
      saveJSON(dataPath, data);

      return sendLoveCard(api, threadID, senderID, loverID, time);
    }

    if (sub === "check") {
      let targetID: string = Object.keys(mentions).length ? Object.keys(mentions)[0] : (messageReply ? messageReply.senderID : senderID);
      const info = data[threadID][targetID];
      if (!info) return reply("❌ Người này chưa setlove!");
      return sendLoveCard(api, threadID, targetID, info.lover, info.time);
    }

    if (sub === "del") {
      const info = data[threadID][senderID];
      if (!info) return reply("❌ Bạn chưa có setlove!");
      delete data[threadID][info.lover];
      delete data[threadID][senderID];
      saveJSON(dataPath, data);
      return reply("💔 Đã hủy setlove thành công!");
    }

    // ĐÃ FIX: Sử dụng optional chaining để tránh lỗi nếu config không tồn tại
    const prefix = (ctx as any).global?.config?.PREFIX || "/"; 
    
    return reply(
      `== [ HƯỚNG DẪN SETLOVE ] ==\n` +
      `1. ${prefix}setlove add @tag: Thiết lập tình cảm với người được tag.\n` +
      `2. ${prefix}setlove check: Xem thông tin tình cảm của bản thân.\n` +
      `3. ${prefix}setlove check @tag: Xem thông tin tình cảm của người được tag.\n` +
      `4. ${prefix}setlove del: Hủy bỏ thiết lập tình cảm hiện tại.\n` +
      `--------------------------\n` +
      `🌸 Hệ thống sẽ tự động gửi thông báo chúc mừng vào các cột mốc: 30, 70, 100, 200, 365... ngày bên nhau!`
    );
  },

  onEvent: async (ctx: EventContext) => {
    const { api, event } = ctx;
    const { threadID } = event;
    if (!fs.existsSync(dataPath)) return;
    const data = loadJSON<AllLoveData>(dataPath, {});
    if (!data[threadID]) return;

    for (const uid in data[threadID]) {
      const info = data[threadID][uid];
      const start = moment(info.time).tz("Asia/Ho_Chi_Minh").startOf("day");
      const days = moment().startOf("day").diff(start, "days");

      if (MILESTONES.includes(days) && !info.milestones.includes(days)) {
        info.milestones.push(days);
        saveJSON(dataPath, data);
        await sendLoveCard(api, threadID, uid, info.lover, info.time);
      }
    }
  }
};

export default setloveCommand;
