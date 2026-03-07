import axios from "axios";
import { CanvasRenderingContext2D, createCanvas, loadImage, registerFont } from "canvas";
import fs from "fs-extra";
import path from "path";
import { URLSearchParams } from "url";
const FONT_DIR = path.join(process.cwd(), "storage", "font");
const F_INTER = path.join(FONT_DIR, "Inter-Variable.ttf");
const F_MONO = path.join(FONT_DIR, "JetBrainsMono-Regular.ttf");
const FONT_URL_INTER = "https://github.com/google/fonts/raw/main/ofl/inter/Inter-VariableFont_slnt,wght.ttf";
const FONT_URL_MONO = "https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/ttf/JetBrainsMono-Regular.ttf";

type BankMeta = {
  name: string;
  bin: string;
  colors: [string, string];
};

const BANKS: Record<string, BankMeta> = {
  VCB: { name: "Vietcombank", bin: "970436", colors: ["#00E676", "#24C8A1"] },
  MBB: { name: "MB Bank", bin: "970422", colors: ["#2D6BFF", "#7AA2FF"] },
  BIDV: { name: "BIDV", bin: "970418", colors: ["#1E40AF", "#60A5FA"] },
  TCB: { name: "Techcombank", bin: "970407", colors: ["#EF4444", "#F97316"] },
  VTB: { name: "VietinBank", bin: "970415", colors: ["#2563EB", "#EF4444"] },
  AGRIBANK: { name: "Agribank", bin: "970405", colors: ["#B91C1C", "#22C55E"] },
  ACB: { name: "ACB", bin: "970416", colors: ["#0EA5E9", "#2563EB"] },
  VPB: { name: "VPBank", bin: "970432", colors: ["#22C55E", "#16A34A"] },
  VIB: { name: "VIB", bin: "970441", colors: ["#F59E0B", "#F97316"] },
  TPB: { name: "TPBank", bin: "970423", colors: ["#9F2FFF", "#F97316"] },
  STB: { name: "Sacombank", bin: "970403", colors: ["#2563EB", "#0EA5E9"] },
  HDB: { name: "HDBank", bin: "970437", colors: ["#F59E0B", "#EF4444"] },
  OCB: { name: "OCB", bin: "970448", colors: ["#16A34A", "#22C55E"] },
  SHB: { name: "SHB", bin: "970443", colors: ["#F59E0B", "#F97316"] },
  MSB: { name: "MSB", bin: "970426", colors: ["#EF4444", "#F97316"] },
  EIB: { name: "Eximbank", bin: "970431", colors: ["#2563EB", "#0EA5E9"] },
  SCB: { name: "SCB", bin: "970429", colors: ["#2563EB", "#9333EA"] },
  LPB: { name: "LienVietPostBank", bin: "970449", colors: ["#2563EB", "#22C55E"] },
  ABB: { name: "ABBank", bin: "970425", colors: ["#10B981", "#0EA5E9"] },
  VAB: { name: "VietABank", bin: "970427", colors: ["#DC2626", "#F59E0B"] },
  BVB: { name: "BaoVietBank", bin: "970438", colors: ["#7C3AED", "#A78BFA"] },
  SGB: { name: "Saigonbank", bin: "970400", colors: ["#38BDF8", "#0EA5E9"] },
  KLB: { name: "KienlongBank", bin: "970452", colors: ["#06B6D4", "#22D3EE"] },
  PGB: { name: "PGBank", bin: "970430", colors: ["#F59E0B", "#FBBF24"] },
  NAB: { name: "NamABank", bin: "970428", colors: ["#2563EB", "#38BDF8"] },
  NCB: { name: "NCB", bin: "970419", colors: ["#EF4444", "#2563EB"] },
  VCCB: { name: "VietCapitalBank", bin: "970454", colors: ["#EF4444", "#1D4ED8"] },
  SEAB: { name: "SeABank", bin: "970440", colors: ["#EF4444", "#F59E0B"] },
  BAB: { name: "BacABank", bin: "970409", colors: ["#0EA5E9", "#7C3AED"] },
  PVCB: { name: "PVcomBank", bin: "970412", colors: ["#F97316", "#EF4444"] },
  OJB: { name: "OceanBank", bin: "970414", colors: ["#0EA5E9", "#06B6D4"] },
  GPB: { name: "GPBank", bin: "970408", colors: ["#F59E0B", "#DC2626"] },
  IVB: { name: "IndovinaBank", bin: "970434", colors: ["#10B981", "#22C55E"] },
  VIETBANK: { name: "VietBank", bin: "970433", colors: ["#7C3AED", "#EC4899"] },
  CAKE: { name: "CAKE", bin: "546034", colors: ["#10B981", "#22C55E"] },
  UBANK: { name: "Ubank", bin: "546035", colors: ["#F59E0B", "#EF4444"] },
  TIMO: { name: "Timo", bin: "963388", colors: ["#EF4444", "#F97316"] },
  VBSP: { name: "VBSP", bin: "999888", colors: ["#22C55E", "#16A34A"] },
  WOORI: { name: "Woori Bank", bin: "970457", colors: ["#2563EB", "#0EA5E9"] },
  VRB: { name: "VRB", bin: "970421", colors: ["#F59E0B", "#EF4444"] },
  SHBVN: { name: "Shinhan Bank", bin: "970424", colors: ["#DC2626", "#1F2937"] },
  CIMB: { name: "CIMB", bin: "422589", colors: ["#DC2626", "#1F2937"] },
  CBB: { name: "CBBank", bin: "970444", colors: ["#DC2626", "#F59E0B"] },
  VBARD: { name: "VBARD", bin: "970406", colors: ["#22C55E", "#10B981"] }
};

const TOP_BANKS: string[] = ["VCB", "MBB", "BIDV", "TCB", "AGRIBANK", "ACB", "VTB", "STB", "TPB", "VIB", "VPB", "EIB", "SCB", "LPB"];
const DEFAULT_TEMPLATE = "qr_only";

async function ensureFont(file: string, url: string): Promise<void> {
  await fs.ensureDir(FONT_DIR);
  if (!(await fs.pathExists(file))) {
    const res = await axios.get<ArrayBuffer>(encodeURI(url), {
      responseType: "arraybuffer",
      timeout: 25000,
      validateStatus: s => typeof s === "number" && s >= 200 && s < 400
    });
    await fs.writeFile(file, Buffer.from(res.data));
  }
}

async function loadPreferredFonts(): Promise<void> {
  try {
    await ensureFont(F_INTER, FONT_URL_INTER);
  } catch { }
  try {
    await ensureFont(F_MONO, FONT_URL_MONO);
  } catch { }
  try {
    if (await fs.pathExists(F_INTER)) registerFont(F_INTER, { family: "Inter" });
  } catch { }
  try {
    if (await fs.pathExists(F_MONO)) registerFont(F_MONO, { family: "JetBrains Mono" });
  } catch { }
}

function ensureTemp(): string {
  const p = path.join(process.cwd(), "src/temp");
  fs.ensureDirSync(p);
  return p;
}

function toVND(n: number | string): string {
  const x = Number(n || 0);
  return x.toLocaleString("vi-VN") + " ₫";
}

function groupDigits(s: string | number): string {
  const t = String(s || "").replace(/\s+/g, "");
  return t.replace(/(\d)(?=(\d{4})+(?!\d))/g, "$1 ");
}

function resolveBank(input?: string | null): { code: string; meta: BankMeta } {
  if (!input) return { code: "VCB", meta: BANKS.VCB };
  const up = String(input).toUpperCase().replace(/\s+/g, "");
  if (BANKS[up]) return { code: up, meta: BANKS[up] };
  for (const [code, meta] of Object.entries(BANKS)) {
    if (meta.name.toUpperCase().replace(/\s+/g, "") === up) return { code, meta };
  }
  for (const [code, meta] of Object.entries(BANKS)) {
    if (meta.bin === up) return { code, meta };
  }
  return {
    code: up,
    meta: {
      name: up,
      bin: up,
      colors: ["#0EA5E9", "#A78BFA"]
    }
  };
}

type BuildVietQROptions = {
  bank?: string;
  accountNumber: string | number;
  accountName?: string;
  amount?: number | string;
  addInfo?: string;
  template?: string;
  size?: number;
  logo?: number;
};

function buildVietQRUrl({
  bank,
  accountNumber,
  accountName,
  amount,
  addInfo,
  template = DEFAULT_TEMPLATE,
  size = 1000,
  logo = 0
}: BuildVietQROptions): string {
  const { meta } = resolveBank(bank);
  const bin = meta.bin;
  const acc = String(accountNumber || "").replace(/\s+/g, "");
  const params = new URLSearchParams();
  if (accountName) params.append("accountName", accountName);
  if (amount && Number(amount) > 0) params.append("amount", String(Number(amount)));
  if (addInfo) params.append("addInfo", addInfo);
  if (size) params.append("size", String(size));
  params.append("logo", String(logo));
  params.append("v", String(Date.now()));
  return `https://img.vietqr.io/image/${bin}-${acc}-${template}.png?${params.toString()}`;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: 20000,
    validateStatus: s => typeof s === "number" && s >= 200 && s < 400
  });
  return Buffer.from(res.data);
}

type Ctx = CanvasRenderingContext2D;

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paintModernBG(ctx: Ctx, w: number, h: number, c1: string, c2: string): void {
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, "#0F172A");
  base.addColorStop(0.5, "#1E293B");
  base.addColorStop(1, "#0F172A");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const meshes = [
    { x: w * 0.15, y: h * 0.2, r1: 100, r2: w * 0.5, c: c1 },
    { x: w * 0.85, y: h * 0.4, r1: 100, r2: w * 0.6, c: c2 },
    { x: w * 0.5, y: h * 0.8, r1: 100, r2: w * 0.4, c: c1 }
  ];
  meshes.forEach(m => {
    const g = ctx.createRadialGradient(m.x, m.y, m.r1, m.x, m.y, m.r2);
    g.addColorStop(0, m.c + "55");
    g.addColorStop(0.5, m.c + "22");
    g.addColorStop(1, "#00000000");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let i = 0; i < w; i += 60) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, h);
    ctx.stroke();
  }
  for (let i = 0; i < h; i += 60) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(w, i);
    ctx.stroke();
  }
}

function drawGlowFrame(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, c1: string, c2: string): void {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, c1);
  g.addColorStop(0.5, c2);
  g.addColorStop(1, c1);
  ctx.save();
  ctx.shadowBlur = 35;
  ctx.shadowColor = c1;
  rrect(ctx, x, y, w, h, r);
  ctx.lineWidth = 4;
  ctx.strokeStyle = g;
  ctx.stroke();
  ctx.restore();
}

function fitText(ctx: Ctx, text: string, max: number, font: string): { text: string; font: string } {
  ctx.font = font;
  if (ctx.measureText(text).width <= max) return { text, font };
  const match = font.match(/(\d+)px/);
  let size = match ? Number(match[1]) : 16;
  while (size > 16 && ctx.measureText(text).width > max) {
    size -= 2;
    ctx.font = font.replace(/(\d+)px/, size + "px");
  }
  return { text, font: ctx.font };
}

type ComposePosterOptions = {
  qrBuf: Buffer;
  bank?: string;
  accountNumber: string | number;
  accountName?: string;
  amount?: number | string;
  addInfo?: string;
  width?: number;
  height?: number;
};

async function composePoster({
  qrBuf,
  bank,
  accountNumber,
  accountName,
  amount,
  addInfo,
  width = 1400,
  height = 2100
}: ComposePosterOptions): Promise<Buffer> {
  await loadPreferredFonts().catch(() => { });
  const { meta } = resolveBank(bank);
  const [brand1, brand2] = meta.colors || ["#14B8A6", "#A78BFA"];
  const c = createCanvas(width, height);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Cannot get 2D context from canvas");
  paintModernBG(ctx, width, height, brand1, brand2);
  const pad = 60;
  const cardW = width - pad * 2;
  const cardH = height - pad * 2;
  drawGlowFrame(ctx, pad, pad, cardW, cardH, 40, brand1, brand2);
  rrect(ctx, pad + 6, pad + 6, cardW - 12, cardH - 12, 36);
  const cardGrad = ctx.createLinearGradient(pad, pad, pad, pad + cardH);
  cardGrad.addColorStop(0, "rgba(15,23,42,0.98)");
  cardGrad.addColorStop(1, "rgba(30,41,59,0.98)");
  ctx.fillStyle = cardGrad;
  ctx.fill();
  ctx.textAlign = "center";
  const headerGrad = ctx.createLinearGradient(width / 2 - 300, pad + 100, width / 2 + 300, pad + 100);
  headerGrad.addColorStop(0, brand1);
  headerGrad.addColorStop(1, brand2);
  ctx.fillStyle = headerGrad;
  const headerFit = fitText(ctx, meta.name.toUpperCase(), cardW - 150, "900 80px Inter, sans-serif");
  ctx.font = headerFit.font;
  ctx.fillText(headerFit.text, width / 2, pad + 100);
  ctx.font = "700 32px Inter, sans-serif";
  ctx.fillStyle = "rgba(203,213,225,0.9)";
  ctx.fillText("VietQR • NAPAS 247", width / 2, pad + 145);
  const lineY = pad + 170;
  const lineW = 600;
  const lineX = (width - lineW) / 2;
  const lineGrad = ctx.createLinearGradient(lineX, lineY, lineX + lineW, lineY);
  lineGrad.addColorStop(0, "rgba(255,255,255,0)");
  lineGrad.addColorStop(0.5, brand1);
  lineGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(lineX, lineY);
  ctx.lineTo(lineX + lineW, lineY);
  ctx.stroke();
  const qrSize = 850;
  const qx = (width - qrSize) / 2;
  const qy = pad + 220;
  rrect(ctx, qx - 10, qy - 10, qrSize + 20, qrSize + 20, 30);
  ctx.fillStyle = "#0A0E17";
  ctx.fill();
  drawGlowFrame(ctx, qx, qy, qrSize, qrSize, 24, brand1, brand2);
  rrect(ctx, qx + 6, qy + 6, qrSize - 12, qrSize - 12, 20);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  const qrImg = await loadImage(qrBuf);
  const qrPad = 40;
  ctx.drawImage(qrImg, qx + qrPad, qy + qrPad, qrSize - qrPad * 2, qrSize - qrPad * 2);
  const infoY = qy + qrSize + 70;
  const centerX = width / 2;
  const rowGap = 100;
  const row1W = cardW - 120;
  const row1X = (width - row1W) / 2;
  rrect(ctx, row1X, infoY, row1W, 110, 20);
  ctx.fillStyle = "rgba(30,41,59,0.6)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(148,163,184,0.95)";
  ctx.font = "700 28px Inter, sans-serif";
  ctx.fillText("SỐ TÀI KHOẢN", centerX, infoY + 40);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 44px Inter, sans-serif";
  const accNum = groupDigits(accountNumber || "");
  ctx.fillText(accNum, centerX, infoY + 90);
  const row2Y = infoY + rowGap + 20;
  rrect(ctx, row1X, row2Y, row1W, 110, 20);
  ctx.fillStyle = "rgba(30,41,59,0.6)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(148,163,184,0.95)";
  ctx.font = "700 28px Inter, sans-serif";
  ctx.fillText("NGÂN HÀNG", centerX, row2Y + 40);
  ctx.fillStyle = "#FFFFFF";
  const bankFit = fitText(ctx, meta.name.toUpperCase(), row1W - 60, "800 42px Inter, sans-serif");
  ctx.font = bankFit.font;
  ctx.fillText(bankFit.text, centerX, row2Y + 90);
  const row3Y = row2Y + rowGap + 20;
  rrect(ctx, row1X, row3Y, row1W, 110, 20);
  ctx.fillStyle = "rgba(30,41,59,0.6)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(148,163,184,0.95)";
  ctx.font = "700 28px Inter, sans-serif";
  ctx.fillText("CHỦ TÀI KHOẢN", centerX, row3Y + 40);
  ctx.fillStyle = "#FFFFFF";
  const nameFit = fitText(ctx, String(accountName || "").toUpperCase(), row1W - 60, "800 42px Inter, sans-serif");
  ctx.font = nameFit.font;
  ctx.fillText(nameFit.text, centerX, row3Y + 90);
  const row4Y = row3Y + rowGap + 20;
  const note = addInfo ? String(addInfo) : "Thanh toán";
  rrect(ctx, row1X, row4Y, row1W, 110, 20);
  ctx.fillStyle = "rgba(30,41,59,0.6)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(148,163,184,0.95)";
  ctx.font = "700 28px Inter, sans-serif";
  ctx.fillText("NỘI DUNG CHUYỂN KHOẢN", centerX, row4Y + 40);
  ctx.fillStyle = "#FFFFFF";
  const noteFit = fitText(ctx, note, row1W - 60, "800 42px Inter, sans-serif");
  ctx.font = noteFit.font;
  ctx.fillText(noteFit.text, centerX, row4Y + 90);
  const amtY = row4Y + rowGap + 40;
  const amtBoxW = row1W;
  const amtBoxH = 170;
  const amtBoxX = row1X;
  ctx.save();
  ctx.shadowBlur = 30;
  ctx.shadowColor = brand1 + "88";
  rrect(ctx, amtBoxX, amtY, amtBoxW, amtBoxH, 24);
  const amtBgGrad = ctx.createLinearGradient(amtBoxX, amtY, amtBoxX + amtBoxW, amtY + amtBoxH);
  amtBgGrad.addColorStop(0, "rgba(30,41,59,0.8)");
  amtBgGrad.addColorStop(1, "rgba(15,23,42,0.8)");
  ctx.fillStyle = amtBgGrad;
  ctx.fill();
  const borderGrad = ctx.createLinearGradient(amtBoxX, amtY, amtBoxX + amtBoxW, amtY);
  borderGrad.addColorStop(0, brand1);
  borderGrad.addColorStop(0.5, brand2);
  borderGrad.addColorStop(1, brand1);
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(148,163,184,0.95)";
  ctx.font = "700 32px Inter, sans-serif";
  ctx.fillText("SỐ TIỀN CHUYỂN KHOẢN", centerX, amtY + 50);
  const amtGrad = ctx.createLinearGradient(centerX - 400, amtY + 100, centerX + 400, amtY + 100);
  amtGrad.addColorStop(0, brand1);
  amtGrad.addColorStop(0.5, "#FFFFFF");
  amtGrad.addColorStop(1, brand2);
  ctx.fillStyle = amtGrad;
  ctx.font = "900 72px Inter, sans-serif";
  const amtText = amount && Number(amount) > 0 ? toVND(amount) : "Người gửi nhập số tiền";
  ctx.fillText(amtText, centerX, amtY + 130);
  const btnW = 450;
  const btnH = 80;
  const bx = centerX - btnW / 2;
  const by = amtY + amtBoxH + 50;
  const btnG = ctx.createLinearGradient(bx, by, bx + btnW, by + btnH);
  btnG.addColorStop(0, brand1);
  btnG.addColorStop(1, brand2);
  rrect(ctx, bx, by, btnW, btnH, 20);
  ctx.fillStyle = btnG;
  ctx.fill();
  ctx.shadowBlur = 25;
  ctx.shadowColor = brand1;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.font = "900 32px Inter, sans-serif";
  ctx.fillStyle = "#0A0E17";
  ctx.fillText("QUÉT MÃ ĐỂ THANH TOÁN", centerX, by + 52);
  return c.toBuffer("image/png");
}

function splitArgs(text: string): string[] {
  return String(text || "")
    .split("|")
    .map(s => s.trim())
    .filter(Boolean);
}

type QuickParsed = {
  banks: string[];
  accountNumber: string;
  accountName: string;
  amount: number;
  addInfo: string;
};

function parseQuick(text: string): QuickParsed | null {
  const parts = splitArgs(text);
  if (!parts.length) return null;
  const head = parts[0];
  const tokens = head.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const banksRaw = tokens[0] || "";
  let banks: string[] = [];
  if (/^all$/i.test(banksRaw)) banks = [...TOP_BANKS];
  else banks = banksRaw.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  const acc = tokens
    .slice(1)
    .join(" ")
    .replace(/\D/g, "");
  const name = parts[1] || "";
  const amount = parts[2] ? Number(String(parts[2]).replace(/[^\d]/g, "")) || 0 : 0;
  const note = parts[3] || "";
  if (!acc || !name) return null;
  return { banks, accountNumber: acc, accountName: name, amount, addInfo: note };
}

type GeneratePosterOptions = {
  bank?: string;
  accountNumber: string | number;
  accountName?: string;
  amount?: number | string;
  addInfo?: string;
  outDir: string;
  template?: string;
  size?: number;
  width?: number;
  height?: number;
};

async function generateVietQRPoster({
  bank,
  accountNumber,
  accountName,
  amount,
  addInfo,
  outDir,
  template = DEFAULT_TEMPLATE,
  size = 1000,
  width = 1400,
  height = 2100
}: GeneratePosterOptions): Promise<string> {
  const url = buildVietQRUrl({ bank, accountNumber, accountName, amount, addInfo, template, size });
  const qrBuf = await fetchBuffer(url);
  const buf = await composePoster({ qrBuf, bank, accountNumber, accountName, amount, addInfo, width, height });
  await fs.ensureDir(outDir);
  const code = resolveBank(bank).code;
  const file = path.join(outDir, `vietqr_modern_${code}_${String(accountNumber).replace(/\s+/g, "")}_${Date.now()}.png`);
  await fs.writeFile(file, buf);
  return file;
}

function normalizeBanks(b?: string | string[]): string[] {
  if (!b) return ["VCB"];
  if (Array.isArray(b)) return b.map(s => String(s).toUpperCase().trim()).filter(Boolean);
  const s = String(b).trim();
  if (!s) return ["VCB"];
  if (/^all$/i.test(s)) return [...TOP_BANKS];
  return s.split(",").map(x => x.trim().toUpperCase()).filter(Boolean);
}

export type VietQRPosterInput = {
  banks?: string | string[];
  accountNumber?: string | number;
  accountName?: string;
  amount?: number | string;
  addInfo?: string;
  outDir?: string;
  template?: string;
  size?: number;
  width?: number;
  height?: number;
};

export default async function vietqrPoster(input: string | VietQRPosterInput): Promise<string | string[]> {
  const opts: VietQRPosterInput = input && typeof input === "object" ? { ...input } : {};
  if (typeof input === "string") {
    const quick = parseQuick(input);
    if (quick) {
      Object.assign(opts, quick);
    }
  }
  const banks = normalizeBanks(opts.banks);
  const accountNumber = opts.accountNumber || "";
  const accountName = opts.accountName || "";
  const amount = opts.amount ? Number(opts.amount) || 0 : 0;
  const addInfo = opts.addInfo || "";
  const outDir = opts.outDir || ensureTemp();
  const template = opts.template || DEFAULT_TEMPLATE;
  const size = opts.size || 1000;
  const width = opts.width || 1400;
  const height = opts.height || 2100;
  if (!accountNumber || !accountName) throw new Error("Thiếu accountNumber hoặc accountName");
  await loadPreferredFonts().catch(() => { });
  const files: string[] = [];
  for (const b of banks) {
    try {
      const f = await generateVietQRPoster({
        bank: b,
        accountNumber,
        accountName,
        amount,
        addInfo,
        outDir,
        template,
        size,
        width,
        height
      });
      files.push(f);
    } catch { }
  }
  return files.length === 1 ? files[0] : files;
}
