import type { FacebookClient } from "@types";
import axios from "axios";
import Canvas from "canvas";
import fs from "fs-extra";
import Jimp from "jimp";
import path from "path";
import sharp from "sharp";
import { Readable } from "stream";
import { STORAGE_FONT } from "../../../core/storagePath";

type AvatarCacheItem = { buf: Buffer; at: number; bytes: number };

const W = 1200;

const COLORS = {
  bgGradStart: "#2d1b4e",
  bgGradEnd: "#0f3a4a",
  glassBase: "rgba(30, 41, 59, 0.5)",
  glassReflect: "rgba(255, 255, 255, 0.08)",
  glassBorder: "rgba(255, 255, 255, 0.15)",
  adminRing: "#d4af37",
  adminGlow: "rgba(212, 175, 55, 0.5)",
  adminBadge: "#8b00ff",
  memberRing: "#00d4ff",
  memberGlow: "rgba(0, 212, 255, 0.4)",
  textMain: "#ffffff",
  textSub: "#94a3b8",
  onlineDot: "#00ff88",
  headerBorder: "rgba(212, 175, 55, 0.6)",
};

const LAYOUT = {
  adminSize: 80,
  memberSize: 62,
  adminGap: 16,
  memberGap: 14,
  maxRowWidth: 1000,
  headerSpace: 300,
  cardPaddingTop: 100,
  titleToGrid: 75,
  sectionGap: 70,
  footerGap: 45,
  bottomPadding: 30,
  cardMarginX: 100,
  cardMarginBottom: 50,
};

function roundRect(ctx: Canvas.CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function calculateRowsHeight(count: number, size: number, gap: number, maxWidth: number): number {
  if (count === 0) return 0;
  const itemWidth = size + gap;
  const maxPerRow = Math.floor((maxWidth + gap) / itemWidth);
  const numRows = Math.ceil(count / maxPerRow);
  return numRows * (size + gap + 12) - gap - 12;
}

function drawTechBackground(ctx: Canvas.CanvasRenderingContext2D, H: number): void {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, COLORS.bgGradStart);
  grad.addColorStop(1, COLORS.bgGradEnd);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(100, 200, 255, 0.15)";
  ctx.lineWidth = 1;
  const horizontalLines = Math.ceil(H / 35);
  for (let i = 0; i < horizontalLines; i++) {
    const y = (H / horizontalLines) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  for (let i = 0; i < 30; i++) {
    const x = (W / 30) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(150, 100, 255, 0.1)";
  ctx.lineWidth = 2;
  const diagonalLines = Math.ceil((W + H) / 100);
  for (let i = -10; i < diagonalLines; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 100, 0);
    ctx.lineTo(i * 100 + H, H);
    ctx.stroke();
  }
  const spot1 = ctx.createRadialGradient(200, 150, 0, 200, 150, 400);
  spot1.addColorStop(0, "rgba(138, 43, 226, 0.2)");
  spot1.addColorStop(1, "transparent");
  ctx.fillStyle = spot1;
  ctx.fillRect(0, 0, W, H);
  const spot2 = ctx.createRadialGradient(W - 200, H - 150, 0, W - 200, H - 150, 400);
  spot2.addColorStop(0, "rgba(0, 191, 255, 0.15)");
  spot2.addColorStop(1, "transparent");
  ctx.fillStyle = spot2;
  ctx.fillRect(0, 0, W, H);
}

function drawGlassCard(ctx: Canvas.CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = COLORS.glassBase;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  const reflect = ctx.createLinearGradient(x, y, x, y + h / 2);
  reflect.addColorStop(0, COLORS.glassReflect);
  reflect.addColorStop(1, "transparent");
  ctx.fillStyle = reflect;
  ctx.fill();
  ctx.strokeStyle = COLORS.glassBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawSectionTitle(
  ctx: Canvas.CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  accentColor: string
): void {
  ctx.save();
  ctx.font = 'bold 26px "Segoe UI", sans-serif';
  const textWidth = ctx.measureText(text).width;
  const padding = 40;
  const frameW = textWidth + padding * 2;
  const frameH = 56;
  const frameX = x - frameW / 2;
  const frameY = y - frameH / 2;
  const radius = 16;
  ctx.save();
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 0;
  roundRect(ctx, frameX, frameY, frameW, frameH, radius);
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.restore();
  roundRect(ctx, frameX, frameY, frameW, frameH, radius);
  const bgGrad = ctx.createLinearGradient(frameX, frameY, frameX, frameY + frameH);
  bgGrad.addColorStop(0, "rgba(255, 255, 255, 0.12)");
  bgGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.08)");
  bgGrad.addColorStop(1, "rgba(255, 255, 255, 0.05)");
  ctx.fillStyle = bgGrad;
  ctx.fill();
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.restore();
  roundRect(ctx, frameX + 2, frameY + 2, frameW - 4, frameH - 4, radius - 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = COLORS.textMain;
  ctx.font = 'bold 26px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  try {
    (ctx as Canvas.CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "3px";
  } catch {
    /* node-canvas có thể không hỗ trợ */
  }
  ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
  ctx.shadowBlur = 8;
  ctx.fillText(text, x, y);

  ctx.restore();
}

async function drawHeader(
  ctx: Canvas.CanvasRenderingContext2D,
  x: number,
  y: number,
  groupLogoUrl: string | null,
  groupName: string
): Promise<void> {
  const logoSize = 140;
  const logoY = y - 120;
  ctx.save();
  ctx.shadowColor = COLORS.adminGlow;
  ctx.shadowBlur = 25;
  ctx.beginPath();
  ctx.arc(x, logoY, logoSize / 2 + 8, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.adminGlow;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, logoY, logoSize / 2 + 5, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.adminRing;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, logoY, logoSize / 2 + 2, 0, Math.PI * 2);
  ctx.strokeStyle = COLORS.headerBorder;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (groupLogoUrl) {
    try {
      const logo = await Canvas.loadImage(groupLogoUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, logoY, logoSize / 2, 0, Math.PI * 2);
      ctx.clip();
      const scale = Math.max(logoSize / logo.width, logoSize / logo.height);
      const sw = logo.width * scale;
      const sh = logo.height * scale;
      ctx.drawImage(logo, x - sw / 2, logoY - sh / 2, sw, sh);
      ctx.restore();
    } catch {
      const logoGrad = ctx.createRadialGradient(x, logoY, 0, x, logoY, logoSize / 2);
      logoGrad.addColorStop(0, "#8b00ff");
      logoGrad.addColorStop(1, "#00d4ff");
      ctx.fillStyle = logoGrad;
      ctx.beginPath();
      ctx.arc(x, logoY, logoSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const logoGrad = ctx.createRadialGradient(x, logoY, 0, x, logoY, logoSize / 2);
    logoGrad.addColorStop(0, "#8b00ff");
    logoGrad.addColorStop(1, "#00d4ff");
    ctx.fillStyle = logoGrad;
    ctx.beginPath();
    ctx.arc(x, logoY, logoSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const grad = ctx.createLinearGradient(x - 300, y, x + 300, y);
  grad.addColorStop(0, "#fbbf24");
  grad.addColorStop(0.5, "#ffffff");
  grad.addColorStop(1, "#00d4ff");
  ctx.save();
  ctx.fillStyle = grad;
  ctx.font = 'bold 42px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  try {
    (ctx as Canvas.CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "2px";
  } catch {
    /* ignore */
  }
  ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
  ctx.shadowBlur = 15;
  ctx.fillText(groupName || "CỘNG ĐỒNG BOTCHAT VN", x, y);
  ctx.restore();
}

async function drawAvatar(
  ctx: Canvas.CanvasRenderingContext2D,
  avatarBuffer: Buffer | null,
  x: number,
  y: number,
  size: number,
  type: "admin" | "member"
): Promise<void> {
  const r = size / 2;
  const isAdmin = type === "admin";
  const ringColor = isAdmin ? COLORS.adminRing : COLORS.memberRing;
  const glowColor = isAdmin ? COLORS.adminGlow : COLORS.memberGlow;
  const ringWidth = isAdmin ? 3 : 2.5;
  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.arc(x, y, r + ringWidth + 1, 0, Math.PI * 2);
  ctx.fillStyle = glowColor;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(x, y, r + ringWidth, 0, Math.PI * 2);
  ctx.fillStyle = ringColor;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r + 0.5, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.glassBase;
  ctx.fill();
  if (avatarBuffer) {
    try {
      const img = await Canvas.loadImage(avatarBuffer);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      const scale = Math.max(size / img.width, size / img.height);
      const sw = img.width * scale;
      const sh = img.height * scale;
      ctx.drawImage(img, x - sw / 2, y - sh / 2, sw, sh);
      ctx.restore();
    } catch {
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (isAdmin) {
    const badgeSize = size * 0.35;
    const badgeY = y - r - badgeSize * 0.4;
    ctx.save();
    ctx.shadowColor = "rgba(139, 0, 255, 0.6)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x, badgeY, badgeSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.adminBadge;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(x, badgeY);
    ctx.rotate(Math.PI / 6);
    ctx.font = `${badgeSize * 0.7}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("👑", 0, 0);
    ctx.restore();
  } else {
    const dotSize = 6;
    const dotX = x + r * 0.8;
    const dotY = y + r * 0.8;
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotSize + 2, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.glassBase;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.onlineDot;
    ctx.fill();
    ctx.shadowColor = COLORS.onlineDot;
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

async function drawAutoWrapAvatars(
  ctx: Canvas.CanvasRenderingContext2D,
  avatarList: Buffer[],
  centerX: number,
  startY: number,
  size: number,
  gap: number,
  maxWidth: number,
  type: "admin" | "member"
): Promise<void> {
  const itemWidth = size + gap;
  const maxPerRow = Math.floor((maxWidth + gap) / itemWidth);
  const rows: Buffer[][] = [];
  for (let i = 0; i < avatarList.length; i += maxPerRow) {
    rows.push(avatarList.slice(i, i + maxPerRow));
  }
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const rowWidth = row.length * size + (row.length - 1) * gap;
    const rowStartX = centerX - rowWidth / 2;
    const y = startY + rowIndex * (size + gap + 12);

    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const x = rowStartX + colIndex * (size + gap) + size / 2;
      const buf = row[colIndex];
      await drawAvatar(ctx, buf ?? null, x, y + size / 2, size, type);
    }
  }
}

const avatarCache = new Map<string, AvatarCacheItem>();
const AVATAR_CACHE_TTL_MS = 5 * 60 * 1000;
const AVATAR_CACHE_MAX_ITEMS = 50;
const AVATAR_CACHE_MAX_BYTES = 5 * 1024 * 1024;
let avatarCacheBytes = 0;

let fontRegistrationCache: { registered: boolean; familyName: string } | null = null;

const avatarCacheCleanup = setInterval(() => {
  const t = Date.now();
  for (const [key, item] of avatarCache.entries()) {
    if (t - item.at > AVATAR_CACHE_TTL_MS) {
      avatarCache.delete(key);
      avatarCacheBytes -= item.bytes;
    }
  }
  while (avatarCache.size > AVATAR_CACHE_MAX_ITEMS || avatarCacheBytes > AVATAR_CACHE_MAX_BYTES) {
    const firstKey = avatarCache.keys().next().value as string | undefined;
    if (!firstKey) break;
    const removed = avatarCache.get(firstKey);
    avatarCache.delete(firstKey);
    if (removed) avatarCacheBytes -= removed.bytes;
  }
}, 60000);
avatarCacheCleanup.unref?.();

function avatarCacheGet(key: string): Buffer | null {
  const hit = avatarCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > AVATAR_CACHE_TTL_MS) {
    avatarCache.delete(key);
    avatarCacheBytes -= hit.bytes;
    return null;
  }
  avatarCache.delete(key);
  avatarCache.set(key, { ...hit, at: Date.now() });
  return hit.buf;
}

function avatarCacheSet(key: string, buf: Buffer): void {
  const bytes = buf.byteLength;
  const existing = avatarCache.get(key);
  if (existing) {
    avatarCacheBytes -= existing.bytes;
    avatarCache.delete(key);
  }
  avatarCache.set(key, { buf, at: Date.now(), bytes });
  avatarCacheBytes += bytes;
  while (avatarCache.size > AVATAR_CACHE_MAX_ITEMS || avatarCacheBytes > AVATAR_CACHE_MAX_BYTES) {
    const firstKey = avatarCache.keys().next().value as string | undefined;
    if (!firstKey) break;
    const removed = avatarCache.get(firstKey);
    avatarCache.delete(firstKey);
    if (removed) avatarCacheBytes -= removed.bytes;
  }
}

type ThreadUser = { id: string; thumbSrc?: string; gender?: string | null };
type AdminId = { id: string };
type ThreadInfoLite = {
  userInfo?: ThreadUser[];
  adminIDs?: AdminId[];
  name?: string;
  imageSrc?: string;
};

const command = {
  name: "taoanhbox",
  alias: ["family"],
  version: "4.0.0",
  role: 0,
  desc: "Tạo ảnh all thành viên trong box (banner glass 16:9 ~1200px)",
  guide: "family [help]",
  cd: 5,
  prefix: true,

  onCall: async function ({
    event,
    client,
    args,
    threadData,
  }: {
    event: { threadID: string; messageID?: string };
    client: FacebookClient;
    args: string[];
    threadData: { get: (tid: string) => Promise<unknown> };
  }) {
    const { threadID, messageID } = event;

    const reply = async (body: string): Promise<void> => {
      await client.sendMessage(body, threadID, messageID);
    };

    const replyWithAttachment = async (body: string, buf: Buffer): Promise<void> => {
      const filename = `taoanhbox_${Date.now()}.png`;
      const stream = Readable.from(buf);
      await new Promise<void>((resolve, reject) => {
        void client.sendMessage(
          { body, attachment: { stream, filename, contentType: "image/png" } },
          threadID,
          (err?: Error) => {
            if (err) reject(err);
            else resolve();
          },
          messageID
        );
      });
    };

    const circle = async (image: Buffer, cacheKey?: string): Promise<Buffer> => {
      if (cacheKey) {
        const cached = avatarCacheGet(cacheKey);
        if (cached) return cached;
      }
      const img = await Jimp.read(image);
      const width = img.getWidth();
      const height = img.getHeight();
      if (width !== height) {
        const s = Math.min(width, height);
        const x = (width - s) / 2;
        const y = (height - s) / 2;
        img.crop(x, y, s, s);
      }
      img.circle();
      const result = await img.getBufferAsync("image/png");
      if (cacheKey) avatarCacheSet(cacheKey, result);
      return result;
    };

    if (!threadID) {
      console.error("❌ Lỗi: Không tìm thấy threadID");
      return;
    }

    if (args[0] === "help" || args[0] === "0" || args[0] === "-h") {
      await reply(
        "Sử dụng: " +
          "taoanhbox" +
          " — tạo banner thành viên (glass / tech)\n" +
          "Lệnh rút gọn: family\n" +
          "Ví dụ: family"
      );
      return;
    }

    let fontFamilyName = "TUVBenchmark";
    if (fontRegistrationCache) {
      fontFamilyName = fontRegistrationCache.familyName;
    } else {
      const fontDir = STORAGE_FONT();
      const fontPath = path.join(fontDir, "TUVBenchmark.ttf");
      const fontExists = await fs.pathExists(fontPath);
      if (!fontExists) {
        console.warn(`Font file không tồn tại tại: ${fontPath}`);
      }
      let fontRegistered = false;
      if (fontExists) {
        try {
          const stats = await fs.stat(fontPath);
          if (stats.size > 0) {
            Canvas.registerFont(fontPath, { family: "TUVBenchmark" });
            fontFamilyName = "TUVBenchmark";
            fontRegistered = true;
            console.log(`✓ Đã đăng ký font "${fontFamilyName}" thành công (${(stats.size / 1024).toFixed(2)} KB)`);
          } else {
            console.warn("Font file rỗng, sẽ xóa để bạn chép lại font...");
            await fs.unlink(fontPath);
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("Lỗi khi xử lý font:", msg);
        }
      }
      if (!fontRegistered) {
        console.warn("⚠️ Không thể đăng ký font TUVBenchmark, sẽ sử dụng font mặc định (Sans)");
        fontFamilyName = "Sans";
      }
      fontRegistrationCache = { registered: fontRegistered, familyName: fontFamilyName };
    }

    console.log(`📝 Sẽ sử dụng font: "${fontFamilyName}"`);

    const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
    const isThreadUser = (v: unknown): v is ThreadUser => isRecord(v) && typeof v.id === "string";
    const isAdminId = (v: unknown): v is AdminId => isRecord(v) && typeof v.id === "string";
    const asThreadInfoLite = (v: unknown): ThreadInfoLite => {
      if (!isRecord(v)) return {};
      const out: ThreadInfoLite = {};
      const ui = v["userInfo"];
      const ai = v["adminIDs"];
      if (Array.isArray(ui)) out.userInfo = ui.filter(isThreadUser);
      if (Array.isArray(ai)) out.adminIDs = ai.filter(isAdminId);
      if (typeof v["name"] === "string") out.name = v["name"];
      if (typeof v["imageSrc"] === "string") out.imageSrc = v["imageSrc"];
      return out;
    };

    const td = await threadData.get(threadID);
    const tdRec = isRecord(td) ? td : {};
    const threadInfo = asThreadInfoLite(
      tdRec["threadInfo"] ?? (isRecord(tdRec["data"]) ? (tdRec["data"] as Record<string, unknown>)["threadInfo"] : undefined)
    );
    let userInfo: ThreadUser[] = Array.isArray(threadInfo.userInfo) ? threadInfo.userInfo : [];
    let adminIDsRaw: unknown[] = [];
    const threadInfoRaw =
      tdRec["threadInfo"] ?? (isRecord(tdRec["data"]) ? (tdRec["data"] as Record<string, unknown>)["threadInfo"] : undefined);
    if (isRecord(threadInfoRaw) && Array.isArray(threadInfoRaw["adminIDs"])) {
      adminIDsRaw = threadInfoRaw["adminIDs"] as unknown[];
    }
    const name = threadInfo.name ?? "";
    const imageSrc = threadInfo.imageSrc;

    const getThreadInfoFn = client["getThreadInfo"];
    if (typeof getThreadInfoFn === "function") {
      try {
        const liveInfo = await (getThreadInfoFn as (tid: string) => Promise<unknown>)(threadID);
        const live = asThreadInfoLite(liveInfo);
        if (Array.isArray(live.userInfo) && live.userInfo.length) userInfo = live.userInfo;

        if (isRecord(liveInfo) && Array.isArray(liveInfo["adminIDs"])) {
          adminIDsRaw = liveInfo["adminIDs"] as unknown[];
        }
      } catch {
        /* ignore */
      }
    }

    const admin: string[] = [];
    const extractAdminID = (adminEntry: unknown): string | null => {
      if (typeof adminEntry === "string") return adminEntry;
      if (typeof adminEntry === "number") return String(adminEntry);
      if (isRecord(adminEntry) && typeof adminEntry.id === "string") return adminEntry.id;
      if (isRecord(adminEntry) && typeof adminEntry.id === "number") return String(adminEntry.id);
      return null;
    };
    for (const adminEntry of adminIDsRaw) {
      const adminId = extractAdminID(adminEntry);
      if (adminId) admin.push(adminId);
    }

    const adminUsers: ThreadUser[] = [];
    const normalUsers: ThreadUser[] = [];
    for (const user of userInfo) {
      if (user.gender !== undefined) {
        if (admin.includes(user.id)) adminUsers.push(user);
        else normalUsers.push(user);
      }
    }

    const loadAvatar = async (user: ThreadUser): Promise<Buffer | null> => {
      try {
        let raw: ArrayBuffer | Buffer;
        const thumb = user.thumbSrc;
        try {
          if (thumb) {
            const avatarData = await axios.get<ArrayBuffer>(thumb, {
              responseType: "arraybuffer",
              timeout: 5000,
            });
            raw = avatarData.data;
          } else {
            throw new Error("no thumb");
          }
        } catch {
          const avatarData = await axios.get<ArrayBuffer>(
            `https://graph.facebook.com/${user.id}/picture?height=720&width=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
            { responseType: "arraybuffer", timeout: 5000 }
          );
          raw = avatarData.data;
        }
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        return await circle(buf, user.id);
      } catch (e: unknown) {
        console.error(`Lỗi khi tải avatar ${user.id}:`, e);
        return null;
      }
    };

    const batchSize = 15;
    const adminAvatarBuffers: Buffer[] = [];
    const memberAvatarBuffers: Buffer[] = [];
    for (let i = 0; i < adminUsers.length; i += batchSize) {
      const batch = adminUsers.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(loadAvatar));
      for (const result of results) {
        if (result) adminAvatarBuffers.push(result);
      }
    }
    for (let i = 0; i < normalUsers.length; i += batchSize) {
      const batch = normalUsers.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(loadAvatar));
      for (const result of results) {
        if (result) memberAvatarBuffers.push(result);
      }
    }

    await reply(
      `🍗 Đang tạo banner cộng đồng...\n` +
        `👑 Admin: ${adminAvatarBuffers.length}\n` +
        `👥 Thành viên: ${memberAvatarBuffers.length}\n` +
        `📊 Tổng: ${adminAvatarBuffers.length + memberAvatarBuffers.length}`
    );

    const adminH = calculateRowsHeight(adminAvatarBuffers.length, LAYOUT.adminSize, LAYOUT.adminGap, LAYOUT.maxRowWidth);
    const memberH = calculateRowsHeight(memberAvatarBuffers.length, LAYOUT.memberSize, LAYOUT.memberGap, LAYOUT.maxRowWidth);
    const cardStartY = LAYOUT.headerSpace;
    const relativeAdminTitleY = LAYOUT.cardPaddingTop;
    const relativeAdminGridY = relativeAdminTitleY + LAYOUT.titleToGrid;
    const relativeMemberTitleY = relativeAdminGridY + adminH + LAYOUT.sectionGap;
    const relativeMemberGridY = relativeMemberTitleY + LAYOUT.titleToGrid;
    const relativeFooterY = relativeMemberGridY + memberH + LAYOUT.footerGap;
    const realCardHeight = relativeFooterY + LAYOUT.bottomPadding;
    const H = cardStartY + realCardHeight + LAYOUT.cardMarginBottom;
    const canvas = Canvas.createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    drawTechBackground(ctx, H);
    const cardW = W - LAYOUT.cardMarginX * 2;
    drawGlassCard(ctx, LAYOUT.cardMarginX, cardStartY, cardW, realCardHeight, 24);

    let groupLogoUrl: string | null = null;
    if (imageSrc) {
      groupLogoUrl = imageSrc;
    } else {
      try {
        const getThreadPictureFn = client["getThreadPicture"];
        if (typeof getThreadPictureFn === "function") {
          groupLogoUrl = (await (getThreadPictureFn as (tid: string) => Promise<string>)(threadID)) ?? null;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("Không thể lấy avatar nhóm:", msg);
      }
    }

    await drawHeader(ctx, W / 2, cardStartY - 80, groupLogoUrl, name || "");

    if (adminAvatarBuffers.length > 0) {
      drawSectionTitle(ctx, "BAN QUẢN TRỊ", W / 2, cardStartY + relativeAdminTitleY, COLORS.adminRing);
      await drawAutoWrapAvatars(
        ctx,
        adminAvatarBuffers,
        W / 2,
        cardStartY + relativeAdminGridY,
        LAYOUT.adminSize,
        LAYOUT.adminGap,
        LAYOUT.maxRowWidth,
        "admin"
      );
    }
    if (memberAvatarBuffers.length > 0) {
      drawSectionTitle(ctx, "THÀNH VIÊN", W / 2, cardStartY + relativeMemberTitleY, COLORS.memberRing);
      await drawAutoWrapAvatars(
        ctx,
        memberAvatarBuffers,
        W / 2,
        cardStartY + relativeMemberGridY,
        LAYOUT.memberSize,
        LAYOUT.memberGap,
        LAYOUT.maxRowWidth,
        "member"
      );
    }

    ctx.fillStyle = COLORS.textSub;
    ctx.font = '16px "Segoe UI", sans-serif';
    try {
      (ctx as Canvas.CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "1px";
    } catch {
      /* ignore */
    }
    ctx.textAlign = "center";
    const total = adminAvatarBuffers.length + memberAvatarBuffers.length;
    ctx.fillText(`Tổng thành viên: ${total.toLocaleString("vi-VN")}`, W / 2, cardStartY + relativeFooterY + 5);

    let buffer: Buffer;
    try {
      buffer = canvas.toBuffer("image/png");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`❌ Lỗi khi tạo buffer từ canvas: ${msg}`);
      await reply(`❌ Lỗi: Không thể tạo buffer từ canvas: ${msg}`);
      return;
    }

    if (buffer.length === 0) {
      await reply("❌ Lỗi: Buffer ảnh rỗng");
      return;
    }

    let finalBuffer: Buffer;
    try {
      finalBuffer = await sharp(buffer).png({ compressionLevel: 6, adaptiveFiltering: true }).toBuffer();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`⚠️ Không thể xử lý với sharp: ${msg}, sử dụng buffer gốc`);
      finalBuffer = buffer;
    }

    if (!finalBuffer || finalBuffer.length === 0) {
      await reply("❌ Lỗi: Buffer ảnh rỗng sau khi xử lý");
      return;
    }

    const finalFileSizeMB = (finalBuffer.length / (1024 * 1024)).toFixed(2);
    try {
      await replyWithAttachment(
        `🍗 Hoàn thành: ${total} thành viên\n` +
          `👑 Admin: ${adminAvatarBuffers.length}\n` +
          `👥 Thành viên: ${memberAvatarBuffers.length}\n` +
          `📊 Kích thước file: ${finalFileSizeMB} MB`,
        finalBuffer
      );
    } catch (sendError: unknown) {
      const msg = sendError instanceof Error ? sendError.message : String(sendError);
      await reply(`❌ Không gửi được ảnh: ${msg}`);
    }
  },
};

export default command;
