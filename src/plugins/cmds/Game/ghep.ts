import type { Command, CommandOnCallContext } from "@types";
import axios from "axios";
import { createCanvas, loadImage } from "canvas";
import type { CanvasRenderingContext2D } from "canvas";
import { Readable } from "stream";

const THEME = {
  bg: "#0f172a",
  text: "#f8fafc",
  subText: "#94a3b8",
  pink: "#ec4899",
  rose: "#f43f5e",
  violet: "#8b5cf6",
  grid: "#334155",
};

const W = 900;
const H = 400;

function clampInt(n: unknown, min: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = THEME.grid;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.3;
  const step = 40;
  for (let x = 0; x < W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const grad = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 420);
  grad.addColorStop(0, "rgba(236, 72, 153, 0.20)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function drawConnector(ctx: CanvasRenderingContext2D): void {
  const y = 140;
  const x1 = 150;
  const x2 = W - 150;

  const grad = ctx.createLinearGradient(x1, y, x2, y);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.2, THEME.violet);
  grad.addColorStop(0.5, THEME.pink);
  grad.addColorStop(0.8, THEME.violet);
  grad.addColorStop(1, "rgba(0,0,0,0)");

  ctx.beginPath();
  ctx.strokeStyle = grad;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();

  ctx.save();
  ctx.shadowColor = THEME.pink;
  ctx.shadowBlur = 20;
  ctx.stroke();
  ctx.restore();
}

function drawHeartPath(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const width = size;
  const height = size;
  const topCurveHeight = height * 0.35;

  ctx.beginPath();
  ctx.moveTo(x, y + topCurveHeight);

  ctx.bezierCurveTo(x, y, x - width / 2, y, x - width / 2, y + topCurveHeight);
  ctx.bezierCurveTo(
    x - width / 2,
    y + (height + topCurveHeight) / 2,
    x,
    y + (height + topCurveHeight) / 2,
    x,
    y + height
  );

  ctx.bezierCurveTo(
    x,
    y + (height + topCurveHeight) / 2,
    x + width / 2,
    y + (height + topCurveHeight) / 2,
    x + width / 2,
    y + topCurveHeight
  );
  ctx.bezierCurveTo(x + width / 2, y, x, y, x, y + topCurveHeight);

  ctx.closePath();
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ").filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let currentLine = words[0] ?? "";

  for (let i = 1; i < words.length; i++) {
    const word = words[i] ?? "";
    const metrics = ctx.measureText(`${currentLine} ${word}`);
    if (metrics.width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine += ` ${word}`;
    }
  }
  lines.push(currentLine);
  return lines;
}

async function drawUser(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  user: { name: string; tag: string; img: Awaited<ReturnType<typeof loadImage>> | null }
): Promise<void> {
  const size = 180;
  const r = size / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r + 6, 0, Math.PI * 2);
  const borderGrad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  borderGrad.addColorStop(0, THEME.violet);
  borderGrad.addColorStop(1, THEME.pink);
  ctx.fillStyle = borderGrad;
  ctx.shadowColor = THEME.pink;
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();

  if (user.img) {
    ctx.drawImage(user.img, x - r, y - r, size, size);
  } else {
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(x - r, y - r, size, size);
    ctx.fillStyle = "#fff";
    ctx.font = 'bold 44px "Segoe UI", Sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((user.name || "?").slice(0, 1).toUpperCase(), x, y);
  }
  ctx.restore();

  const textY = y + r + 40;
  ctx.textAlign = "center";

  ctx.fillStyle = THEME.text;
  ctx.font = 'bold 24px "Segoe UI", Sans-serif';
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 4;

  const maxWidth = 200;
  const lineHeight = 28;
  const rawName = user.name || "Unknown";
  const lines = ctx.measureText(rawName).width > maxWidth ? wrapText(ctx, rawName, maxWidth) : [rawName];
  lines.forEach((line, index) => {
    ctx.fillText(line, x, textY + index * lineHeight);
  });

  ctx.shadowBlur = 0;
  ctx.fillStyle = THEME.subText;
  ctx.font = '16px "Segoe UI", Sans-serif';
  const tagY = textY + lines.length * lineHeight + 5;
  ctx.fillText(user.tag || "", x, tagY);
}

function drawHeartCore(ctx: CanvasRenderingContext2D, x: number, y: number, percent: number, message: string): void {
  const size = 125;

  ctx.save();
  ctx.translate(x, y - 65);
  ctx.shadowColor = THEME.rose;
  ctx.shadowBlur = 40;
  ctx.fillStyle = THEME.rose;
  drawHeartPath(ctx, 0, 0, size);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  drawHeartPath(ctx, 0, 0, size);
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = '900 28px "Segoe UI", Sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 5;
  ctx.fillText(`${percent}%`, 0, 58);
  ctx.restore();

  const messageY = y + 100;
  ctx.fillStyle = "rgba(244, 63, 94, 0.12)";
  ctx.strokeStyle = THEME.rose;
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, x - 140, messageY - 25, 280, 50, 25);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = THEME.pink;
  ctx.font = 'bold 18px "Segoe UI", Sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message || "", x, messageY);
}

async function fetchFbAvatarBuffer(fbid: string): Promise<Buffer> {
  const url = `https://graph.facebook.com/${fbid}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: 20000,
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return Buffer.from(res.data);
}

async function makeImage(input: {
  one: string;
  two: string;
  nameOne: string;
  nameTwo: string;
  tagOne: string;
  tagTwo: string;
  percent: number;
  message: string;
}): Promise<Buffer> {
  let img1: Awaited<ReturnType<typeof loadImage>> | null = null;
  let img2: Awaited<ReturnType<typeof loadImage>> | null = null;

  try {
    const [buf1, buf2] = await Promise.all([fetchFbAvatarBuffer(input.one), fetchFbAvatarBuffer(input.two)]);
    img1 = await loadImage(buf1);
    img2 = await loadImage(buf2);
  } catch {
    // fallback ký tự
  }

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  drawBackground(ctx);
  drawConnector(ctx);
  await drawUser(ctx, 150, 140, { name: input.nameOne, tag: input.tagOne, img: img1 });
  await drawUser(ctx, W - 150, 140, { name: input.nameTwo, tag: input.tagTwo, img: img2 });
  drawHeartCore(ctx, W / 2, 150, clampInt(input.percent, 0, 100), input.message);

  return canvas.toBuffer("image/png");
}

function getThreadParticipantIDs(threadData: unknown): string[] {
  const asObj = (v: unknown): Record<string, unknown> => ((v && typeof v === "object") ? (v as Record<string, unknown>) : {});
  const root = asObj(threadData);
  const data = asObj(root.data);
  const threadInfo = asObj(root.threadInfo ?? data.threadInfo);
  const ids = threadInfo.participantIDs;
  if (Array.isArray(ids)) return ids.map((id) => String(id));
  return [];
}

const ghepCommand: Command = {
  name: "ghep",
  alias: ["ghepdoi"],
  version: "2.0.0",
  role: 0,
  desc: "Ghép đôi ngẫu nhiên trong nhóm",
  guide: "{pn}",
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, reply, userData, threadData } = ctx;
    const { threadID, senderID } = event;

    try {
      const rates = [21, 67, 19, 37, 17, 96, 52, 62, 76, 83, 100, 99, 0, 48];
      const percent = rates[Math.floor(Math.random() * rates.length)] ?? 50;

      const getName = userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
      const nameMe = (getName ? await getName(String(senderID)).catch(() => null) : null) || "Bạn";

      const thread = await threadData.get(String(threadID)).catch(() => null);
      const ids = getThreadParticipantIDs(thread);
      if (!ids.length) {
        await reply("Không lấy được danh sách thành viên.");
        return;
      }

      let targetId = ids[Math.floor(Math.random() * ids.length)] ?? String(senderID);
      if (ids.length > 1) {
        for (let i = 0; i < 10 && String(targetId) === String(senderID); i++) {
          targetId = ids[Math.floor(Math.random() * ids.length)] ?? targetId;
        }
      }

      const nameCrush = (getName ? await getName(String(targetId)).catch(() => null) : null) || "Người bí ẩn";
      const imageBuffer = await makeImage({
        one: String(senderID),
        two: String(targetId),
        nameOne: nameMe,
        nameTwo: nameCrush,
        tagOne: "Chồng",
        tagTwo: "Vợ",
        percent,
        message: "Trời sinh một cặp",
      });

      const imageStream = Readable.from(imageBuffer);
      await reply({
        body: `🎁 Chúc mừng ${nameMe} đã được ghép đôi với ${nameCrush} 🎉\n🎊 Tỉ lệ hợp đôi: 〘${percent}%〙🥳`,
        mentions: [
          { id: String(senderID), tag: nameMe },
          { id: String(targetId), tag: nameCrush },
        ],
        attachment: {
          stream: imageStream,
          filename: `ghep_${Date.now()}.png`,
          contentType: "image/png",
        },
      });
    } catch (error) {
      console.error("ghep error:", error);
      await reply("Lỗi khi ghép đôi.");
    }
  },
};

export default ghepCommand;