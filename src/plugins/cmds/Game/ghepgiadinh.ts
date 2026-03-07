"use strict";

import type {
  Command,
  CommandOnCallContext,
} from '@types';
import axios from "axios";
import { createCanvas, loadImage } from "canvas";
import fs from "fs-extra";
import path from "path";

const TempRoot = path.join(process.cwd(), "src/temp");
if (!fs.existsSync(TempRoot)) fs.mkdirSync(TempRoot, { recursive: true });


const UI = {
  
  KIDS_TOP_FACTOR: 0.54, 
  KIDS_TOP_EXTRA: 50, 
  
  TRUNK_CLEARANCE: 32, 
  
  KID_ROW_GAP: 84, 
  KID_BOTTOM_BUFFER: 120, 
  
  KID_LABEL_GAP: 14, 
  KID_PILL_H: 42, 
  KID_PILL_MIN_W: 110, 
  KID_PILL_MAX_W: 180, 
  KID_FONT: "bold 22px sans-serif",
  KID_SAFE_EXTRA: 20,
};


async function downloadAvatarBuffer(id: string): Promise<Buffer> {
  const url = `https://graph.facebook.com/${id}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
  const buf = (await axios.get(url, { responseType: "arraybuffer" })).data;
  return Buffer.from(buf);
}


function rand(seed: number): () => number {
  let t = Math.imul(seed ^ 0x9e3779b1, 2654435761) >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function roundedRect(
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function drawMeshBg(
  ctx: any,
  W: number,
  H: number,
  pal: string[],
  seed: number
): void {
  const rnd = rand(seed);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, pal[0]);
  g.addColorStop(1, pal[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 6; i++) {
    const rx = W * rnd();
    const ry = H * rnd();
    const r = Math.max(W, H) * (0.35 + rnd() * 0.35);
    const rg = ctx.createRadialGradient(rx, ry, 0, rx, ry, r);
    rg.addColorStop(0, pal[2 + (i % (pal.length - 2))] + "cc");
    rg.addColorStop(1, pal[2 + (i % (pal.length - 2))] + "00");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(rx, ry, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  ctx.strokeStyle = "#ffffff10";
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function drawCard(ctx: any, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.shadowColor = "#00000040";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  roundedRect(ctx, x, y, w, h, 28);
  ctx.fillStyle = "#ffffff1f";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#ffffff40";
  ctx.stroke();
  ctx.restore();
}

function drawAvatar(
  ctx: any,
  img: any,
  cx: number,
  cy: number,
  size: number,
  ringFrom: string,
  ringTo: string
): void {
  const r = size / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, cx - r, cy - r, size, size);
  ctx.restore();

  const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  grad.addColorStop(0, ringFrom);
  grad.addColorStop(1, ringTo);
  const lw = Math.max(12, Math.floor(size * 0.065));
  ctx.lineWidth = lw;
  ctx.strokeStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r - lw / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "#0000002b";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.78, r * 0.86, r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}


function drawHeartGlowCentered(
  ctx: any,
  cx: number,
  cy: number,
  size: number,
  core: string,
  glow: string
): void {
  ctx.save();
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 1.25);
  rg.addColorStop(0, glow + "66");
  rg.addColorStop(1, glow + "00");
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 1.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = glow + "99";
  ctx.shadowBlur = size * 0.35;

  ctx.translate(cx, cy);
  const k = size / 18;
  ctx.scale(k, -k);
  ctx.beginPath();
  let first = true;
  for (let t = 0; t <= Math.PI * 2 + 0.001; t += 0.03) {
    const x = 16 * Math.sin(t) ** 3;
    const y =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);
    if (first) {
      ctx.moveTo(x, y);
      first = false;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fillStyle = core;
  ctx.fill();
  ctx.restore();
}


function computeKidGridSmart(
  W: number,
  H: number,
  margin: number,
  topY: number,
  count: number
): { cols: number; rows: number; size: number; gap: number } {
  const gap = 36;
  const availW = W - margin * 2;
  const availH = H - topY - margin - UI.KID_BOTTOM_BUFFER;

  let cols = Math.max(1, Math.min(count, 8));
  let rows = Math.ceil(count / cols);
  let size = Math.floor((availW - gap * (cols - 1)) / cols);
  const min = 110;

  while ((rows * (size + UI.KID_ROW_GAP)) > availH || size < min) {
    cols = Math.min(10, cols + 1);
    rows = Math.ceil(count / cols);
    size = Math.floor((availW - gap * (cols - 1)) / cols);
    if (cols >= 10) break;
  }
  return { cols, rows, size: Math.max(min, Math.min(size, 180)), gap };
}


function fitFont(
  ctx: any,
  text: string,
  maxWidth: number,
  basePx: number = 22
): number {
  let px = basePx;
  ctx.font = `bold ${px}px sans-serif`;
  while (ctx.measureText(text).width > maxWidth - 20 && px > 14) {
    px -= 1;
    ctx.font = `bold ${px}px sans-serif`;
  }
  return px;
}

interface MakeFamilyImageParams {
  husband: string;
  wife: string;
  kids: string[];
  seed?: number;
}

async function makeFamilyImage({
  husband,
  wife,
  kids,
  seed = Date.now(),
}: MakeFamilyImageParams): Promise<string> {
  const W = 1600;
  const H = 900;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as any;

  const palettes: string[][] = [
    ["#111827", "#0b1220", "#6366f1", "#22d3ee", "#f472b6"],
    ["#0f172a", "#0b1324", "#22c55e", "#3b82f6", "#e879f9"],
    ["#0a0a0a", "#111111", "#f59e0b", "#ef4444", "#8b5cf6"],
  ];
  const selectedPal = palettes[seed % palettes.length];
  const pal: string[] = selectedPal || palettes[0] || ["#111827", "#0b1220", "#6366f1", "#22d3ee", "#f472b6"];

  drawMeshBg(ctx, W, H, pal, seed);
  const margin = 64;
  drawCard(ctx, margin, margin, W - margin * 2, H - margin * 2);

  const sizeParent = Math.max(220, Math.floor(W * 0.16));
  const parentsY = Math.floor(H * 0.33);
  const gapParents = Math.floor(W * 0.1);
  const pTotal = sizeParent * 2 + gapParents;
  const pStart = Math.floor(W / 2 - pTotal / 2);

  const [hBuf, wBuf, ...kBufs] = await Promise.all([
    downloadAvatarBuffer(husband),
    downloadAvatarBuffer(wife),
    ...kids.map((id) => downloadAvatarBuffer(id)),
  ]);
  const [hImg, wImg, ...kImgs] = await Promise.all([
    loadImage(hBuf),
    loadImage(wBuf),
    ...kBufs.map((b) => loadImage(b)),
  ]);

  const hCX = pStart + sizeParent / 2;
  const wCX = pStart + sizeParent + gapParents + sizeParent / 2;
  const pCY = parentsY + sizeParent / 2;

  
  const centerX = (hCX + wCX) / 2;
  const centerY = pCY;
  const pal4: string = pal[4] || "#f472b6";
  const pal3: string = pal[3] || "#22d3ee";
  const pal2: string = pal[2] || "#6366f1";
  drawHeartGlowCentered(
    ctx,
    centerX,
    centerY,
    Math.floor(sizeParent * 0.5),
    pal4,
    pal3
  );

  
  drawAvatar(ctx, hImg, hCX, pCY, sizeParent, pal2, pal3);
  drawAvatar(ctx, wImg, wCX, pCY, sizeParent, pal4, pal3);

  
  const pillW = 160;
  const pillH = 46;
  roundedRect(
    ctx,
    hCX - pillW / 2,
    pCY + sizeParent / 2 + 26,
    pillW,
    pillH,
    pillH / 2
  );
  ctx.fillStyle = "#111827cc";
  ctx.fill();
  roundedRect(
    ctx,
    wCX - pillW / 2,
    pCY + sizeParent / 2 + 26,
    pillW,
    pillH,
    pillH / 2
  );
  ctx.fillStyle = "#111827cc";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText("Chồng", hCX, pCY + sizeParent / 2 + 26 + pillH / 2 + 0.5);
  ctx.fillText("Vợ", wCX, pCY + sizeParent / 2 + 26 + pillH / 2 + 0.5);

  
  ctx.font = "700 56px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Family Guy", W / 2, margin + 84);

  
  const trunkTop = pCY + sizeParent / 2 + 26 + pillH + 18;
  const kidsTopY = Math.max(
    Math.floor(H * UI.KIDS_TOP_FACTOR),
    trunkTop + UI.KIDS_TOP_EXTRA
  );
  ctx.strokeStyle = "#ffffff2a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2, trunkTop);
  ctx.lineTo(W / 2, kidsTopY - UI.TRUNK_CLEARANCE);
  ctx.stroke();

  
  if (kids.length) {
    const grid = computeKidGridSmart(W, H, margin + 40, kidsTopY, kids.length);
    const sizeKid = grid.size;
    const cellSpan = sizeKid + grid.gap; 

    for (let r = 0; r < grid.rows; r++) {
      const countInRow = Math.min(grid.cols, kids.length - r * grid.cols);
      const rowW = countInRow * sizeKid + (countInRow - 1) * grid.gap;
      let x = Math.floor((W - rowW) / 2);
      let y = kidsTopY + r * (sizeKid + UI.KID_ROW_GAP);
      const safeBottom =
        H - (margin + UI.KID_BOTTOM_BUFFER + UI.KID_SAFE_EXTRA);
      
      const rowBottom = y + sizeKid + UI.KID_LABEL_GAP + UI.KID_PILL_H;
      if (rowBottom > safeBottom) {
        y -= rowBottom - safeBottom;
      }

      for (let i = 0; i < countInRow; i++) {
        const idx = r * grid.cols + i;
        const cx = x + sizeKid / 2;
        const cy = y + sizeKid / 2;

        
        ctx.strokeStyle = "#ffffff2a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, y - 18);
        ctx.lineTo(cx, trunkTop);
        ctx.stroke();

        
        drawAvatar(ctx, kImgs[idx], cx, cy, sizeKid, pal3, pal2);

        
        let labelW = Math.min(UI.KID_PILL_MAX_W, Math.floor(cellSpan - 12));
        labelW = Math.max(UI.KID_PILL_MIN_W, labelW);
        const labelH = UI.KID_PILL_H;
        const labelX = cx - labelW / 2;
        const labelY = cy + sizeKid / 2 + UI.KID_LABEL_GAP;

        roundedRect(ctx, labelX, labelY, labelW, labelH, Math.min(21, labelH / 2));
        ctx.fillStyle = "#111827cc";
        ctx.fill();

        
        const text = `Con ${idx + 1}`;
        ctx.font = UI.KID_FONT;
        const px = fitFont(ctx, text, labelW, 22);
        ctx.font = `bold ${px}px sans-serif`;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, cx, labelY + labelH / 2 + 0.5);
        x += sizeKid + grid.gap;
      }
    }
  }

  const out = path.join(
    TempRoot,
    `family_${husband}_${wife}_${kids.join("_") || "0"}_${Date.now().toString(36)}.png`
  );
  await fs.writeFile(out, canvas.toBuffer("image/png"));
  return out;
}


function normGender(g: any): "MALE" | "FEMALE" | null {
  if (g == null) return null;
  const s = String(g).toUpperCase();
  if (s === "MALE" || s === "FEMALE") return s;
  if (s === "1") return "FEMALE";
  if (s === "2") return "MALE";
  return null;
}

interface UserInfo {
  id?: string;
  uid?: string;
  name?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  gender?: any;
}

interface ThreadInfo {
  userInfo?: UserInfo[] | Record<string, UserInfo>;
  participantIDs?: string[];
}

function extractFromThreadInfo(
  info: ThreadInfo | undefined,
  id: string
): { name?: string; gender: "MALE" | "FEMALE" | null } {
  if (!info?.userInfo) return { gender: null };
  let u: UserInfo | null = null;
  if (Array.isArray(info.userInfo)) {
    u =
      info.userInfo.find(
        (x) => String(x.id || x.uid) === String(id)
      ) || null;
  } else {
    u = info.userInfo[id] || null;
  }
  if (!u) return { gender: null };
  return {
    name:
      u.name ||
      u.fullName ||
      `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
      undefined,
    gender: normGender(u.gender),
  };
}

interface UserProfile {
  id: string;
  name: string;
  gender: "MALE" | "FEMALE" | null;
}

async function getUserProfile(
  userData: any,
  info: ThreadInfo | undefined,
  id: string
): Promise<UserProfile> {
  const u = await userData.get(id);
  const name =
    u?.name || extractFromThreadInfo(info, id).name || String(id);
  const g1 = normGender(u?.userInfo?.gender);
  const g2 = extractFromThreadInfo(info, id).gender;
  const gender = g1 || g2 || null;
  return { id, name, gender };
}

function resolveRoles(
  aID: string,
  bID: string,
  aGender: "MALE" | "FEMALE" | null,
  bGender: "MALE" | "FEMALE" | null
): { husbandID: string; wifeID: string } {
  if (aGender === "MALE" && bGender === "FEMALE")
    return { husbandID: aID, wifeID: bID };
  if (aGender === "FEMALE" && bGender === "MALE")
    return { husbandID: bID, wifeID: aID };
  if (bGender === "MALE" && aGender !== "MALE")
    return { husbandID: bID, wifeID: aID };
  if (aGender === "MALE") return { husbandID: aID, wifeID: bID };
  if (bGender === "FEMALE") return { husbandID: aID, wifeID: bID };
  return Math.random() < 0.5
    ? { husbandID: aID, wifeID: bID }
    : { husbandID: bID, wifeID: aID };
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = a[i];
    const swap = a[j];
    if (temp !== undefined && swap !== undefined) {
      a[i] = swap;
      a[j] = temp;
    }
  }
  return a.slice(0, n);
}

function uniq(arr: any[]): string[] {
  return Array.from(new Set(arr.map((x) => String(x))));
}

interface ParseIntentResult {
  mentionIDs: string[];
  kidCount: number | null;
  allowSame: boolean;
  rand2: boolean;
}

function parseIntent(event: any): ParseIntentResult {
  const body = String(event.body || "");
  const m = event.mentions;
  let mentionIDs: string[] = [];
  if (Array.isArray(m)) mentionIDs = m.map((x: any) => x.id);
  else if (m && typeof m === "object") mentionIDs = Object.keys(m);
  mentionIDs = uniq(mentionIDs);
  const nums = body.match(/\d+/g);
  const lastNum = nums && nums.length > 0 ? nums[nums.length - 1] : undefined;
  const kidCount =
    lastNum
      ? Math.max(0, Math.min(8, parseInt(lastNum, 10)))
      : null;
  const allowSame = /\bsame\b/i.test(body);
  const rand2 = /\brand2\b/i.test(body);
  return { mentionIDs, kidCount, allowSame, rand2 };
}

function pickSpouseNoTag(
  me: UserProfile,
  enriched: UserProfile[],
  allowSame: boolean
): UserProfile {
  let pool = enriched;
  if (!allowSame) {
    if (me.gender === "MALE")
      pool = enriched.filter((u) => u.gender === "FEMALE");
    else if (me.gender === "FEMALE")
      pool = enriched.filter((u) => u.gender === "MALE");
  }
  if (pool.length === 0) pool = enriched;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  return selected || enriched[0] || me;
}

const cleanedOnce = new Set<string>();
function rmSafe(p: string): void {
  if (cleanedOnce.has(p)) return;
  cleanedOnce.add(p);
  try {
    fs.rmSync(p, { force: true });
  } catch {
    
  }
}

const ghepgiadinhCommand: Command = {
  name: "ghepgiadinh",
  alias: ["giadinh"],
  version: "2.1.0",
  role: 0,
  desc: "Ghép gia đình ngẫu nhiên: vợ, chồng và con",
  guide: "{pn} [same] [rand2] [số con] [tag 1-2 người]",
  cd: 10,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { client, event, userData, threadData } = ctx;
    const { threadID, senderID, messageID } = event;
    try {
      const info = (await threadData.get(threadID))?.threadInfo as
        | ThreadInfo
        | undefined;

      if (!info?.participantIDs?.length) {
        await client.sendMessage(
          "Không đủ dữ liệu thành viên.",
          threadID,
          messageID
        );
        return;
      }

      const clientID = await client.getCurrentUserID();
      const members = info.participantIDs.filter(
        (id) => id !== senderID && id !== clientID
      );
      if (members.length < 1) {
        await client.sendMessage(
          "Cần ít nhất 2 người trong nhóm để ghép gia đình.",
          threadID,
          messageID
        );
        return;
      }

      const me = await getUserProfile(userData, info, senderID);
      const enriched = await Promise.all(
        members.map((id) => getUserProfile(userData, info, id))
      );

      const { mentionIDs, kidCount, allowSame, rand2 } = parseIntent(event);

      let husbandID: string, wifeID: string;
      if (mentionIDs.length >= 2) {
        const id0 = mentionIDs[0];
        const id1 = mentionIDs[1];
        if (!id0 || !id1) {
          await client.sendMessage(
            "Lỗi: Không thể xác định người được tag.",
            threadID,
            messageID
          );
          return;
        }
        const a = await getUserProfile(userData, info, id0);
        const b = await getUserProfile(userData, info, id1);
        ({ husbandID, wifeID } = resolveRoles(
          a.id,
          b.id,
          a.gender,
          b.gender
        ));
      } else if (mentionIDs.length === 1) {
        const id0 = mentionIDs[0];
        if (!id0) {
          await client.sendMessage(
            "Lỗi: Không thể xác định người được tag.",
            threadID,
            messageID
          );
          return;
        }
        const chosen = await getUserProfile(userData, info, id0);
        ({ husbandID, wifeID } = resolveRoles(
          senderID,
          chosen.id,
          me.gender,
          chosen.gender
        ));
      } else if (rand2) {
        if (enriched.length < 2) {
          await client.sendMessage(
            "Chưa đủ thành viên khác để ghép 2 người ngẫu nhiên.",
            threadID,
            messageID
          );
          return;
        }
        const pair = pickRandom(
          enriched.map((u) => u.id),
          2
        );
        const id0 = pair[0];
        const id1 = pair[1];
        if (!id0 || !id1) {
          await client.sendMessage(
            "Lỗi: Không thể chọn người ngẫu nhiên.",
            threadID,
            messageID
          );
          return;
        }
        const a = await getUserProfile(userData, info, id0);
        const b = await getUserProfile(userData, info, id1);
        ({ husbandID, wifeID } = resolveRoles(
          a.id,
          b.id,
          a.gender,
          b.gender
        ));
      } else {
        const chosen = pickSpouseNoTag(me, enriched, allowSame);
        ({ husbandID, wifeID } = resolveRoles(
          senderID,
          chosen.id,
          me.gender,
          chosen.gender
        ));
      }

      const excluded = new Set([husbandID, wifeID]);
      const rest = enriched.filter((u) => !excluded.has(u.id));
      const maxKids = Math.min(8, rest.length);
      const finalKidCount =
        kidCount == null
          ? maxKids === 0
            ? 0
            : Math.min(4, 1 + Math.floor(Math.random() * Math.min(4, maxKids)))
          : Math.max(0, Math.min(maxKids, kidCount));
      const kids =
        finalKidCount > 0
          ? pickRandom(
            rest.map((u) => u.id),
            finalKidCount
          )
          : [];

      const husband = await getUserProfile(userData, info, husbandID);
      const wife = await getUserProfile(userData, info, wifeID);
      const kidInfos = await Promise.all(
        kids.map((id) => getUserProfile(userData, info, id))
      );

      const mentions = [
        { id: husbandID, tag: husband.name },
        { id: wifeID, tag: wife.name },
        ...kidInfos.map((k, i) => ({ id: kids[i], tag: k.name })),
      ] as any;

      const imgPath = await makeFamilyImage({
        husband: husbandID,
        wife: wifeID,
        kids,
        seed: Number(threadID) || Date.now(),
      });

      const stream = fs.createReadStream(imgPath);
      stream.on("close", () => rmSafe(imgPath));

      const bodyLines = [
        `👨‍🦰 Chồng: ${husband.name}`,
        `👩‍🦰 Vợ: ${wife.name}`,
        kids.length
          ? `👶 Con: ${kidInfos.map((k) => k.name).join(", ")}`
          : `👶 Con: Chưa có`,
      ];

      await client.sendMessage(
        {
          body: `🎉 Ghép gia đình thành công!\n${bodyLines.join("\n")}`,
          mentions,
          attachment: stream,
        },
        threadID,
        messageID
      );
    } catch (e: any) {
      console.log(e);
      try {
        client.sendMessage(
          "Đã xảy ra lỗi khi ghép gia đình.",
          threadID,
          messageID
        );
      } catch {
        
      }
    }
  },
};

export default ghepgiadinhCommand;
