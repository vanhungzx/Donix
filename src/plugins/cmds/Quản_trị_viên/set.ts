import axios from 'axios';
import { CanvasRenderingContext2D, createCanvas, loadImage } from 'canvas';
import fsCore from 'fs';
import fs from 'fs-extra';
import path from 'path';

function getMediaDir(threadID: string | number): string {
  return path.join(process.cwd(), 'src/storage/set_media', String(threadID));
}

function getTempDir(): string {
  return path.join(process.cwd(), 'src/temp');
}

function splitMessageAndUrl(input: string) {
  if (!input) return { text: '', url: '' };
  const sep = input.includes(' | ') ? ' | ' : (input.includes('|') ? '|' : '\n');
  const [a, b] = String(input).split(sep);
  return { text: (a || '').trim(), url: (b || '').trim() };
}

function extFromUrlOrType(u: string, ct?: string | null): string | null {
  const mFromUrl = (String(u || '').split('?')[0] || '').match(/\.(jpg|jpeg|png|gif|mp4|webm|mov)$/i);
  if (mFromUrl) return mFromUrl[1].toLowerCase();
  if (!ct) return null;
  if (/image\/jpeg/i.test(ct)) return 'jpg';
  if (/image\/png/i.test(ct)) return 'png';
  if (/image\/gif/i.test(ct)) return 'gif';
  if (/video\/mp4/i.test(ct)) return 'mp4';
  if (/video\/webm/i.test(ct)) return 'webm';
  if (/video\/quicktime/i.test(ct)) return 'mov';
  return null;
}

async function streamToFile(stream: NodeJS.ReadableStream, filePath: string): Promise<string> {
  await fs.ensureDir(path.dirname(filePath));
  const ws = fsCore.createWriteStream(filePath);
  stream.pipe(ws);
  await new Promise<void>((resolve, reject) => {
    ws.on('finish', resolve);
    ws.on('error', reject);
    stream.on('error', reject);
  });
  return filePath;
}

async function downloadMedia(url: string, filename: string, threadID: string | number): Promise<string | null> {
  try {
    const res = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: s => s >= 200 && s < 400
    });
    const dir = getMediaDir(threadID);
    await fs.ensureDir(dir);
    const ext = extFromUrlOrType(url, res.headers['content-type'] as string | undefined) || (filename.split('.').pop() || 'bin');
    const safe = filename.replace(/[^\w.-]/g, '_').replace(/\.+/g, '.');
    const filePath = path.join(dir, safe.endsWith(`.${ext}`) ? safe : `${safe}.${ext}`);
    return await streamToFile(res.data as unknown as NodeJS.ReadableStream, filePath);
  } catch {
    return null;
  }
}

async function saveUploadedMedia(attachmentUrl: string, filename: string, threadID: string | number): Promise<string | null> {
  try {
    const res = await axios({
      method: 'GET',
      url: attachmentUrl,
      responseType: 'stream',
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: s => s >= 200 && s < 400
    });
    const dir = getMediaDir(threadID);
    await fs.ensureDir(dir);
    const ext = extFromUrlOrType(attachmentUrl, res.headers['content-type'] as string | undefined) || (filename.split('.').pop() || 'bin');
    const safe = filename.replace(/[^\w.-]/g, '_').replace(/\.+/g, '.');
    const filePath = path.join(dir, safe.endsWith(`.${ext}`) ? safe : `${safe}.${ext}`);
    return await streamToFile(res.data as unknown as NodeJS.ReadableStream, filePath);
  } catch {
    return null;
  }
}

function mergeSettings<T extends object, U extends object>(oldSettings: T | undefined, patch: U): T & U {
  return { ...(oldSettings || {} as T), ...patch } as T & U;
}

function formatText(
  t: string,
  ctx: { name?: string; groupName?: string; count?: number | string; uid?: number | string }
): string {
  return String(t || '')
    .replace(/{name}/g, ctx.name || '')
    .replace(/{groupName}/g, ctx.groupName || '')
    .replace(/{count}/g, String(ctx.count ?? ''))
    .replace(/{uid}/g, String(ctx.uid ?? ''));
}

function isPhoto(att: any): boolean {
  const k = String(att?.type || '').toLowerCase();
  return k === 'photo' || k === 'image' || k === 'sticker';
}

function nowVN(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${dd}/${mm}/${yyyy} - ${hh}:${mi}:${ss}`;
}

function fbAvatar(uid: string | number): string {
  return `https://graph.facebook.com/${uid}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
}

class CyberpunkInterfaceLeave {
  width: number;
  height: number;
  canvas: ReturnType<typeof createCanvas>;
  ctx: CanvasRenderingContext2D;
  colors: { darkBg: string; red: string; brightRed: string; white: string };

  constructor(width = 900, height = 400) {
    this.width = width;
    this.height = height;
    this.canvas = createCanvas(width, height);
    this.ctx = this.canvas.getContext('2d');
    this.colors = { darkBg: '#140a0a', red: '#ff0044', brightRed: '#ff335a', white: '#ffffff' };
  }

  drawMatrixBackground() {
    const { ctx, width, height } = this;
    const { darkBg } = this.colors;
    ctx.fillStyle = darkBg;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(180, 0, 40, 0.15)';
    for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 2);
    ctx.fillStyle = 'rgba(220, 0, 60, 0.08)';
    for (let x = 0; x < width; x += 6) ctx.fillRect(x, 0, 1, height);
    ctx.fillStyle = 'rgba(255, 0, 0, 0.05)';
    ctx.font = '10px monospace';
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const binary = Math.random() > 0.5 ? '1' : '0';
      ctx.fillText(binary, x, y);
    }
    this.drawGridLines();
    this.drawCircuitPatterns();
  }

  drawGridLines() {
    const { ctx, width, height } = this;
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      const y = (i * height) / 20;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(120, 0, 30, 0.12)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  drawCircuitPatterns() {
    const { ctx, width, height, colors } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, 50);
    ctx.lineTo(150, 50);
    ctx.lineTo(150, 100);
    ctx.lineTo(120, 100);
    ctx.stroke();
    ctx.fillStyle = colors.red;
    ctx.beginPath();
    ctx.arc(150, 50, 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.moveTo(width - 150, height - 50);
    ctx.lineTo(width - 50, height - 50);
    ctx.lineTo(width - 50, height - 100);
    ctx.lineTo(width - 80, height - 100);
    ctx.stroke();
    ctx.fillStyle = colors.red;
    ctx.beginPath();
    ctx.arc(width - 50, height - 50, 3, 0, 2 * Math.PI);
    ctx.fill();
    this.drawHexagonPattern(width - 200, 100, 30);
    ctx.restore();
  }

  drawHexagonPattern(centerX: number, centerY: number, size: number) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const x = centerX + (i - 1) * size * 1.5;
        const y = centerY + (j - 1) * size * Math.sqrt(3) / 2;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const angle = (k * Math.PI) / 3;
          const px = x + size * 0.3 * Math.cos(angle);
          const py = y + size * 0.3 * Math.sin(angle);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawCornerBrackets() {
    const { ctx, width, height, colors } = this;
    ctx.save();
    ctx.shadowColor = colors.red;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = colors.red;
    ctx.lineWidth = 3;
    const cornerSize = 30;
    const margin = 20;
    ctx.beginPath();
    ctx.moveTo(margin, margin + cornerSize);
    ctx.lineTo(margin, margin);
    ctx.lineTo(margin + cornerSize, margin);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width - margin - cornerSize, margin);
    ctx.lineTo(width - margin, margin);
    ctx.lineTo(width - margin, margin + cornerSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(margin, height - margin - cornerSize);
    ctx.lineTo(margin, height - margin);
    ctx.lineTo(margin + cornerSize, height - margin);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width - margin - cornerSize, height - margin);
    ctx.lineTo(width - margin, height - margin);
    ctx.lineTo(width - margin, height - margin - cornerSize);
    ctx.stroke();
    ctx.restore();
  }

  async drawAvatar(avatarSource: string | null = null) {
    const { ctx, colors } = this;
    const avatarX = 120;
    const avatarY = 200;
    const avatarRadius = 80;
    ctx.save();
    const extraOuterGlow = ctx.createRadialGradient(avatarX, avatarY, 0, avatarX, avatarY, avatarRadius + 22);
    extraOuterGlow.addColorStop(0, 'rgba(255, 0, 0, 0.25)');
    extraOuterGlow.addColorStop(0.5, 'rgba(255, 0, 0, 0.12)');
    extraOuterGlow.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = extraOuterGlow;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 22, 0, 2 * Math.PI);
    ctx.fill();
    const outerGlow = ctx.createRadialGradient(avatarX, avatarY, 0, avatarX, avatarY, avatarRadius + 12);
    outerGlow.addColorStop(0, 'rgba(255, 0, 0, 0.45)');
    outerGlow.addColorStop(0.5, 'rgba(255, 0, 0, 0.22)');
    outerGlow.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 12, 0, 2 * Math.PI);
    ctx.fill();
    const middleGlow = ctx.createRadialGradient(avatarX, avatarY, 0, avatarX, avatarY, avatarRadius + 7);
    middleGlow.addColorStop(0, 'rgba(255, 0, 0, 0.6)');
    middleGlow.addColorStop(0.7, 'rgba(255, 0, 0, 0.3)');
    middleGlow.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = middleGlow;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 7, 0, 2 * Math.PI);
    ctx.fill();
    const innerGlow = ctx.createRadialGradient(avatarX, avatarY, avatarRadius - 5, avatarX, avatarY, avatarRadius + 3);
    innerGlow.addColorStop(0, 'rgba(255, 0, 0, 0.8)');
    innerGlow.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = innerGlow;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowColor = colors.red;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = colors.red;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius - 3, 0, 2 * Math.PI);
    ctx.clip();
    if (avatarSource) {
      try {
        let imageUrl = avatarSource;
        if (!imageUrl.startsWith('http') && !imageUrl.startsWith('./') && !imageUrl.startsWith('/')) {
          imageUrl = fbAvatar(imageUrl);
        }
        const avatarImage = await loadImage(imageUrl);
        const size = avatarRadius * 2 - 6;
        ctx.drawImage(avatarImage, avatarX - avatarRadius + 3, avatarY - avatarRadius + 3, size, size);
      } catch { }
    }
    ctx.restore();
  }

  drawMainContent(config: { titleText?: string; memberName?: string; groupName?: string; leaveTime?: string } = {}) {
    const { ctx, width, colors } = this;
    const {
      titleText = '>>> THÀNH VIÊN RỜI NHÓM <<<',
      memberName = 'Người Dùng',
      groupName = 'Tên Nhóm',
      leaveTime = nowVN()
    } = config;
    ctx.save();
    ctx.shadowColor = colors.red;
    ctx.shadowBlur = 20;
    ctx.fillStyle = colors.red;
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(titleText, width / 2, 70);
    ctx.shadowBlur = 8;
    ctx.fillStyle = colors.white;
    ctx.fillText(titleText, width / 2, 70);
    ctx.restore();
    ctx.textAlign = 'left';
    const textStartX = 240;
    ctx.save();
    ctx.shadowColor = colors.white;
    ctx.shadowBlur = 10;
    ctx.fillStyle = colors.white;
    ctx.font = 'bold 20px monospace';
    ctx.fillText('THÀNH VIÊN RỜI NHÓM', textStartX, 120);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = colors.brightRed;
    ctx.shadowBlur = 8;
    ctx.fillStyle = colors.brightRed;
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`Tên: ${memberName}`, textStartX, 145);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = colors.white;
    ctx.shadowBlur = 5;
    ctx.fillStyle = colors.white;
    ctx.font = 'bold 16px monospace';
    ctx.fillText(groupName, textStartX, 170);
    ctx.fillText(`Tạm biệt và hẹn gặp lại...`, textStartX, 190);
    ctx.fillText(`Rời lúc ${leaveTime}`, textStartX, 210);
    ctx.restore();
  }

  drawProgressBar() {
    const { ctx, colors } = this;
    const barX = 240;
    const barY = 250;
    const barWidth = 400;
    const barHeight = 12;
    ctx.save();
    ctx.fillStyle = '#2a0f12';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(barX - 20, barY);
    ctx.lineTo(barX - 5, barY);
    ctx.lineTo(barX - 5, barY + barHeight);
    ctx.lineTo(barX - 20, barY + barHeight);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(barX + barWidth + 5, barY);
    ctx.lineTo(barX + barWidth + 20, barY);
    ctx.lineTo(barX + barWidth + 20, barY + barHeight);
    ctx.lineTo(barX + barWidth + 5, barY + barHeight);
    ctx.stroke();
    ctx.shadowColor = colors.red;
    ctx.shadowBlur = 15;
    ctx.strokeStyle = colors.red;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
    const progressGradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
    progressGradient.addColorStop(0, '#ff0022');
    progressGradient.addColorStop(0.3, '#ff335a');
    progressGradient.addColorStop(0.6, '#ff8899');
    progressGradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = progressGradient;
    ctx.fillRect(barX, barY, barWidth, barHeight);
    const pulseGradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
    pulseGradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
    pulseGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.65)');
    pulseGradient.addColorStop(1, 'rgba(255, 255, 255, 0.25)');
    ctx.fillStyle = pulseGradient;
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = colors.brightRed;
    ctx.shadowBlur = 8;
    ctx.fillStyle = colors.brightRed;
    ctx.font = 'bold 13px monospace';
    ctx.fillText('CONNECTION LOST', barX, barY + 28);
    ctx.restore();
  }

  drawDataBars(data: number[] = [0.3, 0.5, 0.2, 0.4, 0.35]) {
    const { ctx, width, height, colors } = this;
    const barWidth = 12;
    const barSpacing = 16;
    const maxBarHeight = 80;
    const startX = width - 120;
    const baseY = height - 60;
    ctx.save();
    for (let i = 0; i < data.length; i++) {
      const barHeight = data[i] * maxBarHeight;
      const x = startX + i * barSpacing;
      const y = baseY - barHeight;
      const gradient = ctx.createLinearGradient(0, baseY, 0, y);
      gradient.addColorStop(0, 'rgba(255, 0, 0, 0.35)');
      gradient.addColorStop(0.5, 'rgba(255, 0, 0, 0.8)');
      gradient.addColorStop(1, '#ff0033');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.shadowColor = colors.red;
      ctx.shadowBlur = 15;
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.shadowBlur = 0;
      ctx.fillStyle = colors.white;
      ctx.fillRect(x, y, barWidth, 2);
    }
    ctx.restore();
  }

  addGlitchEffects() {
    const { ctx, width, height } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const y = Math.random() * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 0, 0, 0.12)';
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  async generate(options: {
    avatarPath?: string | null;
    outputPath?: string;
    contentConfig?: { titleText?: string; memberName?: string; groupName?: string; leaveTime?: string };
    dataValues?: number[];
  } = {}) {
    const {
      avatarPath = null,
      outputPath = 'leave_interface.png',
      contentConfig = {},
      dataValues = [0.3, 0.5, 0.2, 0.4, 0.35]
    } = options;
    this.drawMatrixBackground();
    this.drawCornerBrackets();
    await this.drawAvatar(avatarPath);
    this.drawMainContent(contentConfig);
    this.drawProgressBar();
    this.drawDataBars(dataValues);
    this.addGlitchEffects();

    // Tối ưu: Tạo buffer và cleanup canvas ngay sau khi dùng
    let buffer: Buffer;
    try {
      buffer = this.canvas.toBuffer('image/png');
    } catch (e: any) {
      console.error(`❌ Lỗi khi tạo buffer từ canvas: ${e.message || e}`);
      this.canvas = null as any; // Cleanup canvas reference
      throw e;
    }

    // Cleanup canvas reference ngay sau khi đã tạo buffer để giúp GC
    this.canvas = null as any;

    try {
      fsCore.writeFileSync(outputPath, buffer);
      const result = { success: true, outputPath, buffer };
      // Note: buffer được return nên không cleanup ở đây
      return result;
    } catch (e: any) {
      buffer = null as any; // Cleanup buffer reference trong catch
      throw e;
    }
  }
}

class CyberpunkInterfaceJoin {
  width: number;
  height: number;
  canvas: ReturnType<typeof createCanvas>;
  ctx: CanvasRenderingContext2D;
  colors: { darkBlue: string; cyan: string; brightCyan: string; white: string };

  constructor(width = 900, height = 400) {
    this.width = width;
    this.height = height;
    this.canvas = createCanvas(width, height);
    this.ctx = this.canvas.getContext('2d');
    this.colors = { darkBlue: '#0a1628', cyan: '#00ffff', brightCyan: '#00d9ff', white: '#ffffff' };
  }

  drawMatrixBackground() {
    const { ctx, width, height } = this;
    const { darkBlue } = this.colors;
    ctx.fillStyle = darkBlue;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0, 100, 150, 0.15)';
    for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 2);
    ctx.fillStyle = 'rgba(0, 150, 200, 0.08)';
    for (let x = 0; x < width; x += 6) ctx.fillRect(x, 0, 1, height);
    ctx.fillStyle = 'rgba(0, 255, 255, 0.05)';
    ctx.font = '10px monospace';
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const binary = Math.random() > 0.5 ? '1' : '0';
      ctx.fillText(binary, x, y);
    }
    this.drawGridLines();
    this.drawCircuitPatterns();
  }

  drawGridLines() {
    const { ctx, width, height } = this;
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      const y = (i * height) / 20;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0, 100, 150, 0.1)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  drawCircuitPatterns() {
    const { ctx, width, height, colors } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, 50);
    ctx.lineTo(150, 50);
    ctx.lineTo(150, 100);
    ctx.lineTo(120, 100);
    ctx.stroke();
    ctx.fillStyle = colors.cyan;
    ctx.beginPath();
    ctx.arc(150, 50, 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.moveTo(width - 150, height - 50);
    ctx.lineTo(width - 50, height - 50);
    ctx.lineTo(width - 50, height - 100);
    ctx.lineTo(width - 80, height - 100);
    ctx.stroke();
    ctx.fillStyle = colors.cyan;
    ctx.beginPath();
    ctx.arc(width - 50, height - 50, 3, 0, 2 * Math.PI);
    ctx.fill();
    this.drawHexagonPattern(width - 200, 100, 30);
    ctx.restore();
  }

  drawHexagonPattern(centerX: number, centerY: number, size: number) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const x = centerX + (i - 1) * size * 1.5;
        const y = centerY + (j - 1) * size * Math.sqrt(3) / 2;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const angle = (k * Math.PI) / 3;
          const px = x + size * 0.3 * Math.cos(angle);
          const py = y + size * 0.3 * Math.sin(angle);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawCornerBrackets() {
    const { ctx, width, height, colors } = this;
    ctx.save();
    ctx.shadowColor = colors.cyan;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = colors.cyan;
    ctx.lineWidth = 3;
    const cornerSize = 30;
    const margin = 20;
    ctx.beginPath();
    ctx.moveTo(margin, margin + cornerSize);
    ctx.lineTo(margin, margin);
    ctx.lineTo(margin + cornerSize, margin);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width - margin - cornerSize, margin);
    ctx.lineTo(width - margin, margin);
    ctx.lineTo(width - margin, margin + cornerSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(margin, height - margin - cornerSize);
    ctx.lineTo(margin, height - margin);
    ctx.lineTo(margin + cornerSize, height - margin);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width - margin - cornerSize, height - margin);
    ctx.lineTo(width - margin, height - margin);
    ctx.lineTo(width - margin, height - margin - cornerSize);
    ctx.stroke();
    ctx.restore();
  }

  async drawAvatar(avatarSource: string | null = null) {
    const { ctx, colors } = this;
    const avatarX = 120;
    const avatarY = 200;
    const avatarRadius = 80;
    ctx.save();
    const extraOuterGlow = ctx.createRadialGradient(avatarX, avatarY, 0, avatarX, avatarY, avatarRadius + 22);
    extraOuterGlow.addColorStop(0, 'rgba(0, 255, 255, 0.25)');
    extraOuterGlow.addColorStop(0.5, 'rgba(0, 255, 255, 0.12)');
    extraOuterGlow.addColorStop(1, 'rgba(0, 255, 255, 0)');
    ctx.fillStyle = extraOuterGlow;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 22, 0, 2 * Math.PI);
    ctx.fill();
    const outerGlow = ctx.createRadialGradient(avatarX, avatarY, 0, avatarX, avatarY, avatarRadius + 12);
    outerGlow.addColorStop(0, 'rgba(0, 255, 255, 0.4)');
    outerGlow.addColorStop(0.5, 'rgba(0, 255, 255, 0.2)');
    outerGlow.addColorStop(1, 'rgba(0, 255, 255, 0)');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 12, 0, 2 * Math.PI);
    ctx.fill();
    const middleGlow = ctx.createRadialGradient(avatarX, avatarY, 0, avatarX, avatarY, avatarRadius + 7);
    middleGlow.addColorStop(0, 'rgba(0, 255, 255, 0.6)');
    middleGlow.addColorStop(0.7, 'rgba(0, 255, 255, 0.3)');
    middleGlow.addColorStop(1, 'rgba(0, 255, 255, 0)');
    ctx.fillStyle = middleGlow;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 7, 0, 2 * Math.PI);
    ctx.fill();
    const innerGlow = ctx.createRadialGradient(avatarX, avatarY, avatarRadius - 5, avatarX, avatarY, avatarRadius + 3);
    innerGlow.addColorStop(0, 'rgba(0, 255, 255, 0.8)');
    innerGlow.addColorStop(1, 'rgba(0, 255, 255, 0)');
    ctx.fillStyle = innerGlow;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowColor = colors.cyan;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = colors.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius - 3, 0, 2 * Math.PI);
    ctx.clip();
    if (avatarSource) {
      try {
        let imageUrl = avatarSource;
        if (!imageUrl.startsWith('http') && !imageUrl.startsWith('./') && !imageUrl.startsWith('/')) {
          imageUrl = fbAvatar(imageUrl);
        }
        const avatarImage = await loadImage(imageUrl);
        const size = avatarRadius * 2 - 6;
        ctx.drawImage(avatarImage, avatarX - avatarRadius + 3, avatarY - avatarRadius + 3, size, size);
      } catch { }
    }
    ctx.restore();
  }

  drawMainContent(config: {
    welcomeText?: string;
    memberName?: string;
    groupName?: string;
    memberNumber?: number;
    joinTime?: string;
  } = {}) {
    const { ctx, width, colors } = this;
    const {
      welcomeText = '>>> CHÀO MỪNG VÀO NHÓM <<<',
      memberName = 'Người Dùng',
      groupName = 'Nhóm',
      memberNumber = 0,
      joinTime = nowVN()
    } = config;
    ctx.save();
    ctx.shadowColor = colors.cyan;
    ctx.shadowBlur = 20;
    ctx.fillStyle = colors.cyan;
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(welcomeText, width / 2, 70);
    ctx.shadowBlur = 8;
    ctx.fillStyle = colors.white;
    ctx.fillText(welcomeText, width / 2, 70);
    ctx.restore();
    ctx.textAlign = 'left';
    const textStartX = 240;
    ctx.save();
    ctx.shadowColor = colors.white;
    ctx.shadowBlur = 10;
    ctx.fillStyle = colors.white;
    ctx.font = 'bold 20px monospace';
    ctx.fillText('THÀNH VIÊN MỚI', textStartX, 120);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = colors.brightCyan;
    ctx.shadowBlur = 8;
    ctx.fillStyle = colors.brightCyan;
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`Tên: ${memberName}`, textStartX, 145);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = colors.white;
    ctx.shadowBlur = 5;
    ctx.fillStyle = colors.white;
    ctx.font = 'bold 16px monospace';
    ctx.fillText(groupName, textStartX, 170);
    ctx.fillText(`Thành viên thứ ${memberNumber}`, textStartX, 190);
    ctx.fillText(`Vào lúc ${joinTime}`, textStartX, 210);
    ctx.restore();
  }

  drawProgressBar() {
    const { ctx, colors } = this;
    const barX = 240;
    const barY = 250;
    const barWidth = 400;
    const barHeight = 12;
    ctx.save();
    ctx.fillStyle = '#1a2332';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(barX - 20, barY);
    ctx.lineTo(barX - 5, barY);
    ctx.lineTo(barX - 5, barY + barHeight);
    ctx.lineTo(barX - 20, barY + barHeight);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(barX + barWidth + 5, barY);
    ctx.lineTo(barX + barWidth + 20, barY);
    ctx.lineTo(barX + barWidth + 20, barY + barHeight);
    ctx.lineTo(barX + barWidth + 5, barY + barHeight);
    ctx.stroke();
    ctx.shadowColor = colors.cyan;
    ctx.shadowBlur = 15;
    ctx.strokeStyle = colors.cyan;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
    const progressGradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
    progressGradient.addColorStop(0, '#00ffff');
    progressGradient.addColorStop(0.3, '#00d9ff');
    progressGradient.addColorStop(0.6, '#88ffff');
    progressGradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = progressGradient;
    ctx.fillRect(barX, barY, barWidth, barHeight);
    const pulseGradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
    pulseGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    pulseGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.7)');
    pulseGradient.addColorStop(1, 'rgba(255, 255, 255, 0.3)');
    ctx.fillStyle = pulseGradient;
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = colors.brightCyan;
    ctx.shadowBlur = 8;
    ctx.fillStyle = colors.brightCyan;
    ctx.font = 'bold 13px monospace';
    ctx.fillText('CONNECTION ESTABLISHED', barX, barY + 28);
    ctx.restore();
  }

  drawDataBars(data: number[] = [0.6, 0.8, 0.4, 0.9, 0.7]) {
    const { ctx, width, height, colors } = this;
    const barWidth = 12;
    const barSpacing = 16;
    const maxBarHeight = 80;
    const startX = width - 120;
    const baseY = height - 60;
    ctx.save();
    for (let i = 0; i < data.length; i++) {
      const barHeight = data[i] * maxBarHeight;
      const x = startX + i * barSpacing;
      const y = baseY - barHeight;
      const gradient = ctx.createLinearGradient(0, baseY, 0, y);
      gradient.addColorStop(0, 'rgba(0, 255, 255, 0.4)');
      gradient.addColorStop(0.5, 'rgba(0, 255, 255, 0.8)');
      gradient.addColorStop(1, '#00ffff');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.shadowColor = colors.cyan;
      ctx.shadowBlur = 15;
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.shadowBlur = 0;
      ctx.fillStyle = colors.white;
      ctx.fillRect(x, y, barWidth, 2);
    }
    ctx.restore();
  }

  addGlitchEffects() {
    const { ctx, width, height } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const y = Math.random() * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  async generate(options: {
    avatarPath?: string | null;
    outputPath?: string;
    contentConfig?: {
      welcomeText?: string;
      memberName?: string;
      groupName?: string;
      memberNumber?: number;
      joinTime?: string;
    };
    dataValues?: number[];
  } = {}) {
    const {
      avatarPath = null,
      outputPath = 'cyberpunk_interface.png',
      contentConfig = {},
      dataValues = [0.6, 0.8, 0.4, 0.9, 0.7]
    } = options;
    this.drawMatrixBackground();
    this.drawCornerBrackets();
    await this.drawAvatar(avatarPath);
    this.drawMainContent(contentConfig);
    this.drawProgressBar();
    this.drawDataBars(dataValues);
    this.addGlitchEffects();

    // Tối ưu: Tạo buffer và cleanup canvas ngay sau khi dùng
    let buffer: Buffer;
    try {
      buffer = this.canvas.toBuffer('image/png');
    } catch (e: any) {
      console.error(`❌ Lỗi khi tạo buffer từ canvas: ${e.message || e}`);
      this.canvas = null as any; // Cleanup canvas reference
      throw e;
    }

    // Cleanup canvas reference ngay sau khi đã tạo buffer để giúp GC
    this.canvas = null as any;

    try {
      fsCore.writeFileSync(outputPath, buffer);
      const result = { success: true, outputPath, buffer };
      // Note: buffer được return nên không cleanup ở đây
      return result;
    } catch (e: any) {
      buffer = null as any; // Cleanup buffer reference trong catch
      throw e;
    }
  }
}

async function renderJoinCanvas(
  uid: string | number,
  _threadID: string | number,
  name: string,
  groupName: string,
  count: number
): Promise<string> {
  const dir = getTempDir();
  await fs.ensureDir(dir);
  const out = path.join(dir, `join_${Date.now()}.png`);
  const ui = new CyberpunkInterfaceJoin(900, 400);
  await ui.generate({
    avatarPath: String(uid),
    outputPath: out,
    contentConfig: {
      welcomeText: '>>> CHÀO MỪNG VÀO NHÓM <<<',
      memberName: name,
      groupName,
      memberNumber: count,
      joinTime: nowVN()
    }
  });
  return out;
}

async function renderLeaveCanvas(
  uid: string | number,
  _threadID: string | number,
  name: string,
  groupName: string
): Promise<string> {
  const dir = getTempDir();
  await fs.ensureDir(dir);
  const out = path.join(dir, `leave_${Date.now()}.png`);
  const ui = new CyberpunkInterfaceLeave(900, 400);
  await ui.generate({
    avatarPath: String(uid),
    outputPath: out,
    contentConfig: {
      titleText: '>>> THÀNH VIÊN RỜI NHÓM <<<',
      memberName: name,
      groupName,
      leaveTime: nowVN()
    }
  });
  return out;
}

const command = {
  name: 'set',
  version: '1.3.2',
  role: 1,
  desc: 'Tùy chỉnh tin nhắn chào mừng/tạm biệt với ảnh, video, canvas',
  guide:
    '📋 HƯỚNG DẪN SỬ DỤNG LỆNH SET\n\n' +
    '1️⃣ Tùy chỉnh tin nhắn chào mừng:\n' +
    '   {pn} join\n' +
    '   → Chọn kiểu tin nhắn (text, ảnh, video, canvas)\n' +
    '   → Nhập nội dung tin nhắn\n\n' +
    '2️⃣ Tùy chỉnh tin nhắn tạm biệt:\n' +
    '   {pn} leave\n' +
    '   → Chọn kiểu tin nhắn (text, ảnh, video, canvas)\n' +
    '   → Nhập nội dung tin nhắn\n\n' +
    '3️⃣ Bật/tắt thông báo:\n' +
    '   {pn} noti          → Xem trạng thái và bật/tắt\n' +
    '   {pn} noti join    → Bật/tắt thông báo join\n' +
    '   {pn} noti leave   → Bật/tắt thông báo leave\n\n' +
    '4️⃣ Xem preview:\n' +
    '   {pn} preview\n' +
    '   → Xem tin nhắn và trạng thái hiện tại\n\n' +
    '5️⃣ Reset về mặc định:\n' +
    '   {pn} reset\n' +
    '   → Xóa tất cả cài đặt và file media\n\n' +
    '📝 Biến có thể dùng trong tin nhắn:\n' +
    '   • {name}      → Tên người dùng\n' +
    '   • {groupName} → Tên nhóm\n' +
    '   • {count}     → Số thành viên\n' +
    '   • {uid}       → ID người dùng\n\n' +
    '💡 Ví dụ:\n' +
    '   {pn} join\n' +
    '   → Chọn 1 (chỉ text)\n' +
    '   → Nhập: "Chào mừng {name} đến với {groupName}! Bạn là thành viên thứ {count}"',
  prefix: true,
  onCall: async function ({
    args,
    threadData,
    event,
    main,
    commandName,
    client
  }: any) {
    const { threadID, senderID } = event;
    if (!args[0]) {
      return client.sendMessage(
        `📋 HƯỚNG DẪN SỬ DỤNG LỆNH SET\n\n` +
        `🎯 Các lệnh chính:\n` +
        `• {pn} join     → Tùy chỉnh tin nhắn chào mừng\n` +
        `• {pn} leave    → Tùy chỉnh tin nhắn tạm biệt\n` +
        `• {pn} noti     → Bật/tắt thông báo join/leave\n` +
        `• {pn} preview  → Xem preview tin nhắn hiện tại\n` +
        `• {pn} reset    → Reset về mặc định\n\n` +
        `📝 Cách sử dụng:\n` +
        `1. Gõ: {pn} join hoặc {pn} leave\n` +
        `2. Chọn kiểu tin nhắn (1-5):\n` +
        `   • 1 = Chỉ text\n` +
        `   • 2 = Text + ảnh từ link\n` +
        `   • 3 = Text + ảnh upload\n` +
        `   • 4 = Text + video từ link\n` +
        `   • 5 = Text + canvas tự động\n` +
        `3. Nhập nội dung tin nhắn\n\n` +
        `🔧 Bật/tắt thông báo:\n` +
        `• {pn} noti          → Xem trạng thái\n` +
        `• {pn} noti join     → Bật/tắt thông báo join\n` +
        `• {pn} noti leave    → Bật/tắt thông báo leave\n\n` +
        `📌 Biến có thể dùng: {name}, {groupName}, {count}, {uid}\n\n` +
        `💡 Ví dụ: {pn} join → chọn 1 → nhập "Chào mừng {name}!"`,
        threadID
      );
    }
    const thread = (await threadData.get(threadID)) || {};
    const settings = thread.settings || {};
    const customMessages = settings.customMessages || {};
    switch (String(args[0]).toLowerCase()) {
      case 'join': {
        const setupMsg =
          `🎨 THIẾT LẬP TIN NHẮN CHÀO MỪNG\n\n` +
          `Chọn kiểu tin nhắn bạn muốn:\n\n` +
          `1️⃣ Chỉ text\n` +
          `   → Tin nhắn văn bản đơn giản\n` +
          `   📌 Ví dụ: "Chào mừng {name} đến với {groupName}! 🎉"\n\n` +
          `2️⃣ Text + ảnh từ link\n` +
          `   → Tin nhắn kèm ảnh (từ URL)\n` +
          `   📌 Ví dụ: "Chào mừng {name}! | https://i.imgur.com/abc123.jpg"\n` +
          `   💡 Định dạng: "Nội dung | Link ảnh"\n\n` +
          `3️⃣ Text + ảnh upload\n` +
          `   → Tin nhắn kèm ảnh (upload trực tiếp)\n` +
          `   📌 Ví dụ: Upload ảnh + "Chào mừng {name} đến với {groupName}!"\n` +
          `   💡 Reply kèm ảnh và nội dung\n\n` +
          `4️⃣ Text + video từ link\n` +
          `   → Tin nhắn kèm video (từ URL)\n` +
          `   📌 Ví dụ: "Chào mừng {name}! | https://example.com/welcome.mp4"\n` +
          `   💡 Định dạng: "Nội dung | Link video"\n\n` +
          `5️⃣ Text + canvas tự động\n` +
          `   → Tin nhắn với ảnh canvas đẹp mắt\n` +
          `   📌 Ví dụ: "Chào mừng {name} đến với {groupName}! Bạn là thành viên thứ {count}"\n` +
          `   💡 Tự động tạo ảnh chào mừng với avatar\n\n` +
          `📝 Biến có thể dùng:\n` +
          `   • {name}      → Tên người dùng\n` +
          `   • {groupName} → Tên nhóm\n` +
          `   • {count}     → Số thành viên\n` +
          `   • {uid}       → ID người dùng\n\n` +
          `💡 Ví dụ đầy đủ:\n` +
          `   "🎉 Chào mừng {name} đã tham gia {groupName}!\n` +
          `   Bạn là thành viên thứ {count} của nhóm 🥳"\n\n` +
          `👉 Reply số (1-5) để chọn:`;
        return client.sendMessage(setupMsg, threadID, (err: any, info: any) => {
          if (err) return;
          main.onReply.set(info.messageID, {
            commandName,
            messageID: info.messageID,
            author: senderID,
            threadID,
            type: 'join_type_selection'
          });
        });
      }
      case 'leave': {
        const setupMsg =
          `💔 THIẾT LẬP TIN NHẮN TẠM BIỆT\n\n` +
          `Chọn kiểu tin nhắn bạn muốn:\n\n` +
          `1️⃣ Chỉ text\n` +
          `   → Tin nhắn văn bản đơn giản\n` +
          `   📌 Ví dụ: "{name} đã rời khỏi {groupName}. Hẹn gặp lại! 👋"\n\n` +
          `2️⃣ Text + ảnh từ link\n` +
          `   → Tin nhắn kèm ảnh (từ URL)\n` +
          `   📌 Ví dụ: "Tạm biệt {name}! | https://i.imgur.com/xyz789.jpg"\n` +
          `   💡 Định dạng: "Nội dung | Link ảnh"\n\n` +
          `3️⃣ Text + ảnh upload\n` +
          `   → Tin nhắn kèm ảnh (upload trực tiếp)\n` +
          `   📌 Ví dụ: Upload ảnh + "{name} đã rời khỏi nhóm. Hẹn gặp lại!"\n` +
          `   💡 Reply kèm ảnh và nội dung\n\n` +
          `4️⃣ Text + video từ link\n` +
          `   → Tin nhắn kèm video (từ URL)\n` +
          `   📌 Ví dụ: "Tạm biệt {name}! | https://example.com/goodbye.mp4"\n` +
          `   💡 Định dạng: "Nội dung | Link video"\n\n` +
          `5️⃣ Text + canvas tự động\n` +
          `   → Tin nhắn với ảnh canvas đẹp mắt\n` +
          `   📌 Ví dụ: "{name} đã rời khỏi {groupName}. Hẹn gặp lại!"\n` +
          `   💡 Tự động tạo ảnh tạm biệt với avatar\n\n` +
          `📝 Biến có thể dùng:\n` +
          `   • {name}      → Tên người dùng\n` +
          `   • {groupName} → Tên nhóm\n` +
          `   • {count}     → Số thành viên\n` +
          `   • {uid}       → ID người dùng\n\n` +
          `💡 Ví dụ đầy đủ:\n` +
          `   "👋 {name} đã rời khỏi {groupName}\n` +
          `   Cảm ơn bạn đã đồng hành cùng chúng tôi!\n` +
          `   Hẹn gặp lại trong tương lai! 💙"\n\n` +
          `👉 Reply số (1-5) để chọn:`;
        return client.sendMessage(setupMsg, threadID, (err: any, info: any) => {
          if (err) return;
          main.onReply.set(info.messageID, {
            commandName,
            messageID: info.messageID,
            author: senderID,
            threadID,
            type: 'leave_type_selection'
          });
        });
      }
      case 'reset': {
        const dir = getMediaDir(threadID);
        try {
          await fs.remove(dir);
        } catch { }
        const next = mergeSettings(settings, {
          customMessages: { join: null, leave: null }
        });
        await threadData.update(threadID, { settings: next });
        return client.sendMessage(`♻️ Đã reset tin nhắn về mặc định và xóa các file media!`, threadID);
      }
      case 'noti': {
        const threadWithSettings = thread as any;
        const adminIDs = (threadWithSettings?.threadInfo?.adminIDs || []).map((admin: any) =>
          String(admin?.id || admin)
        );

        if (!adminIDs.includes(String(senderID))) {
          return client.sendMessage("❎ Chỉ quản trị viên mới có thể sử dụng lệnh này.", threadID);
        }

        settings.noti = settings.noti || {};
        const { joinNoti = false, leaveNoti = false } = settings.noti;

        if (["join", "leave"].includes(args[1]?.toLowerCase() || "")) {
          const key = args[1].toLowerCase() === "join" ? "joinNoti" : "leaveNoti";
          settings.noti[key] = !settings.noti[key];

          await threadData.update(threadID, { settings });

          return client.sendMessage(
            `${settings.noti[key] ? "✅ Bật" : "❌ Tắt"} thông báo ${args[1].toLowerCase() === "join" ? "tham gia" : "rời nhóm"
            } thành công!`,
            threadID
          );
        }

        return client.sendMessage(
          `📢 Trạng thái thông báo hiện tại:\n\n` +
          `1. join: ${joinNoti ? "✅ Bật" : "❌ Tắt"}\n` +
          `2. leave: ${leaveNoti ? "✅ Bật" : "❌ Tắt"}\n\n` +
          `📌 Reply số thứ tự để bật/tắt trạng thái tương ứng. Bạn có thể chọn nhiều số, ví dụ: 1 2\n\n` +
          `Hoặc dùng: {pn} noti join / {pn} noti leave`,
          threadID,
          async (err: any, info: any) => {
            if (!err && info?.messageID) {
              main.onReply.set(info.messageID, {
                commandName,
                messageID: info.messageID,
                threadID,
                author: senderID,
                type: 'noti_status_selection'
              });
            }
          }
        );
      }
      case 'preview': {
        const joinMsg =
          customMessages.join?.text ||
          'Mặc định: Chào mừng {name} đã tham gia nhóm!';
        const leaveMsg =
          customMessages.leave?.text || 'Mặc định: {name} đã rời khỏi nhóm';
        let joinMediaStatus = '📎 Không có media';
        let leaveMediaStatus = '📎 Không có media';
        if (customMessages.join?.hasMedia) {
          const p =
            customMessages.join.imagePath || customMessages.join.videoPath;
          joinMediaStatus =
            p && (await fs.pathExists(p))
              ? `📎 Có media (${customMessages.join.type})`
              : '⚠️ File media bị mất';
          if (customMessages.join.type === 'canvas_auto') {
            joinMediaStatus = '🎨 Canvas tự động';
          }
        }
        if (customMessages.leave?.hasMedia) {
          const p =
            customMessages.leave.imagePath || customMessages.leave.videoPath;
          leaveMediaStatus =
            p && (await fs.pathExists(p))
              ? `📎 Có media (${customMessages.leave.type})`
              : '⚠️ File media bị mất';
          if (customMessages.leave.type === 'canvas_auto') {
            leaveMediaStatus = '🎨 Canvas tự động';
          }
        }
        const notiSettings = settings.noti || {};
        const joinNotiStatus = notiSettings.joinNoti ? "✅ Bật" : "❌ Tắt";
        const leaveNotiStatus = notiSettings.leaveNoti ? "✅ Bật" : "❌ Tắt";
        const previewText =
          `📋 PREVIEW TIN NHẮN HIỆN TẠI\n\n` +
          `🎉 Tin nhắn chào mừng:\n${joinMsg}\n${joinMediaStatus}\n📢 Thông báo: ${joinNotiStatus}\n\n` +
          `💔 Tin nhắn tạm biệt:\n${leaveMsg}\n${leaveMediaStatus}\n📢 Thông báo: ${leaveNotiStatus}\n\n` +
          `📁 Folder media: bot/data/set_media/${threadID}/\n` +
          `📂 Temp canvas: temp/set_canvas/${threadID}/`;
        return client.sendMessage(previewText, threadID);
      }
      default:
        return client.sendMessage(
          `❗ Lựa chọn không hợp lệ. Dùng: join, leave, noti, reset, preview`,
          threadID
        );
    }
  },
  onReply: async function ({
    event,
    main,
    commandName,
    Reply,
    threadData,
    client
  }: any) {
    const { threadID, senderID, body, attachments } = event;
    const { type, author, threadID: replyThreadID } = Reply;
    if (String(senderID) !== String(author)) return;
    if (String(threadID) !== String(replyThreadID)) return;
    const thread = (await threadData.get(threadID)) || {};
    const settings = thread.settings || {};
    const customMessages = settings.customMessages || {};
    const nextSettings = () => mergeSettings(settings, { customMessages });
    try {
      if (type === 'noti_status_selection') {
        const choices = String(body || "")
          .trim()
          .split(/\s+/)
          .map((n) => parseInt(n.trim()))
          .filter((n) => !isNaN(n) && [1, 2].includes(n));

        if (choices.length === 0) {
          return client.sendMessage(
            "❌ Lựa chọn không hợp lệ. Vui lòng reply '1' hoặc '2' để thay đổi trạng thái.",
            threadID
          );
        }

        settings.noti = settings.noti || {};
        const statusChanges: string[] = [];

        for (const choice of choices) {
          const key = choice === 1 ? "joinNoti" : "leaveNoti";
          settings.noti[key] = !settings.noti[key];
          statusChanges.push(
            `${settings.noti[key] ? "bật" : "tắt"} thông báo ${choice === 1 ? "tham gia" : "rời nhóm"
            }`
          );
        }

        await threadData.update(threadID, { settings });

        return client.sendMessage(`✅ Đã ${statusChanges.join(" và ")} thành công!`, threadID);
      }
      if (type === 'join_type_selection' || type === 'leave_type_selection') {
        const choice = parseInt(String(body || '').trim(), 10);
        const messageType = type.includes('join') ? 'join' : 'leave';
        if (![1, 2, 3, 4, 5].includes(choice)) {
          return client.sendMessage('❗ Vui lòng chọn số từ 1 đến 5!', threadID);
        }
        let promptMsg = '';
        let nextType = '';
        const messageTypeName = messageType === 'join' ? 'chào mừng' : 'tạm biệt';
        if (choice === 1) {
          promptMsg =
            `📝 NHẬP NỘI DUNG TIN NHẮN ${messageTypeName.toUpperCase()}\n\n` +
            `💬 Nhập nội dung tin nhắn bạn muốn:\n\n` +
            `📌 Biến có thể dùng:\n` +
            `• {name}      → Tên người dùng\n` +
            `• {groupName} → Tên nhóm\n` +
            `• {count}     → Số thành viên\n` +
            `• {uid}       → ID người dùng\n\n` +
            `💡 Ví dụ ${messageType === 'join' ? 'chào mừng' : 'tạm biệt'}:\n` +
            (messageType === 'join'
              ? `"🎉 Chào mừng {name} đã tham gia {groupName}!\n` +
              `Bạn là thành viên thứ {count} của nhóm 🥳\n` +
              `Chúc bạn có những trải nghiệm tuyệt vời!"`
              : `"👋 {name} đã rời khỏi {groupName}\n` +
              `Cảm ơn bạn đã đồng hành cùng chúng tôi!\n` +
              `Hẹn gặp lại trong tương lai! 💙"`) +
            `\n\n📝 Hoặc ví dụ ngắn gọn:\n` +
            (messageType === 'join'
              ? `"Chào mừng {name} đến với {groupName}! 🎉"`
              : `"{name} đã rời khỏi {groupName}. Hẹn gặp lại! 👋"`) +
            `\n\n👉 Reply tin nhắn của bạn:`;
          nextType = `${messageType}_text_only`;
        }
        if (choice === 2) {
          promptMsg =
            `📝 THIẾT LẬP TEXT + ẢNH TỪ LINK\n\n` +
            `📋 Định dạng bắt buộc:\n` +
            `Nội dung tin nhắn | Link ảnh\n\n` +
            `⚠️ Lưu ý: Phải có dấu " | " (khoảng trắng + dấu gạch đứng + khoảng trắng)\n\n` +
            `📌 Biến có thể dùng: {name}, {groupName}, {count}, {uid}\n\n` +
            `💡 Ví dụ ${messageType === 'join' ? 'chào mừng' : 'tạm biệt'}:\n` +
            (messageType === 'join'
              ? `"🎉 Chào mừng {name} đến với {groupName}! | https://i.imgur.com/abc123.jpg"\n\n` +
              `📝 Hoặc ví dụ ngắn:\n` +
              `"Chào mừng {name}! | https://example.com/welcome.jpg"`
              : `"👋 Tạm biệt {name}! Cảm ơn bạn đã đồng hành! | https://i.imgur.com/xyz789.jpg"\n\n` +
              `📝 Hoặc ví dụ ngắn:\n` +
              `"Tạm biệt {name}! | https://example.com/goodbye.jpg"`) +
            `\n\n👉 Reply theo định dạng trên (có dấu | ở giữa):`;
          nextType = `${messageType}_text_image_link`;
        }
        if (choice === 3) {
          promptMsg =
            `📎 UPLOAD ẢNH KÈM NỘI DUNG\n\n` +
            `📋 Cách làm:\n` +
            `1. Upload ảnh (kèm theo tin nhắn này)\n` +
            `2. Nhập nội dung tin nhắn\n\n` +
            `⚠️ Lưu ý: Phải upload ảnh cùng lúc với tin nhắn!\n\n` +
            `📌 Biến có thể dùng: {name}, {groupName}, {count}, {uid}\n\n` +
            `💡 Ví dụ ${messageType === 'join' ? 'chào mừng' : 'tạm biệt'}:\n` +
            (messageType === 'join'
              ? `[Upload ảnh chào mừng] + "🎉 Chào mừng {name} đến với {groupName}!\n` +
              `Bạn là thành viên thứ {count} của nhóm 🥳"\n\n` +
              `📝 Hoặc ngắn gọn:\n` +
              `[Upload ảnh] + "Chào mừng {name} đến với {groupName}!"`
              : `[Upload ảnh tạm biệt] + "👋 {name} đã rời khỏi {groupName}\n` +
              `Cảm ơn bạn đã đồng hành cùng chúng tôi!"\n\n` +
              `📝 Hoặc ngắn gọn:\n` +
              `[Upload ảnh] + "{name} đã rời khỏi nhóm. Hẹn gặp lại!"`) +
            `\n\n👉 Reply kèm ảnh và nội dung:`;
          nextType = `${messageType}_text_image_upload`;
        }
        if (choice === 4) {
          promptMsg =
            `📝 THIẾT LẬP TEXT + VIDEO TỪ LINK\n\n` +
            `📋 Định dạng bắt buộc:\n` +
            `Nội dung tin nhắn | Link video\n\n` +
            `⚠️ Lưu ý: Phải có dấu " | " (khoảng trắng + dấu gạch đứng + khoảng trắng)\n` +
            `📌 Hỗ trợ: .mp4, .webm, .mov\n\n` +
            `📌 Biến có thể dùng: {name}, {groupName}, {count}, {uid}\n\n` +
            `💡 Ví dụ ${messageType === 'join' ? 'chào mừng' : 'tạm biệt'}:\n` +
            (messageType === 'join'
              ? `"🎉 Chào mừng {name} đến với {groupName}! | https://example.com/videos/welcome.mp4"\n\n` +
              `📝 Hoặc ví dụ ngắn:\n` +
              `"Chào mừng {name}! | https://example.com/welcome.mp4"`
              : `"👋 Tạm biệt {name}! Cảm ơn bạn đã đồng hành! | https://example.com/videos/goodbye.mp4"\n\n` +
              `📝 Hoặc ví dụ ngắn:\n` +
              `"Tạm biệt {name}! | https://example.com/goodbye.mp4"`) +
            `\n\n👉 Reply theo định dạng trên (có dấu | ở giữa):`;
          nextType = `${messageType}_text_video_link`;
        }
        if (choice === 5) {
          promptMsg =
            `🎨 THIẾT LẬP CANVAS TỰ ĐỘNG\n\n` +
            `📋 Canvas sẽ tự động tạo ảnh đẹp với:\n` +
            `• Avatar người dùng (tự động lấy)\n` +
            `• Tên nhóm (tự động lấy)\n` +
            `• Nội dung bạn nhập (hiển thị trên banner)\n` +
            `• Hiệu ứng đẹp mắt (${messageType === 'join' ? 'màu xanh cyan' : 'màu đỏ cyberpunk'})\n\n` +
            `📌 Biến có thể dùng: {name}, {groupName}, {count}, {uid}\n\n` +
            `💡 Ví dụ ${messageType === 'join' ? 'chào mừng' : 'tạm biệt'}:\n` +
            (messageType === 'join'
              ? `"🎉 Chào mừng {name} đến với {groupName}!\n` +
              `Bạn là thành viên thứ {count} của nhóm 🥳"\n\n` +
              `📝 Hoặc ngắn gọn:\n` +
              `"Chào mừng {name} đến với {groupName}!"`
              : `"👋 {name} đã rời khỏi {groupName}\n` +
              `Cảm ơn bạn đã đồng hành cùng chúng tôi!\n` +
              `Hẹn gặp lại trong tương lai! 💙"\n\n` +
              `📝 Hoặc ngắn gọn:\n` +
              `"{name} đã rời khỏi {groupName}. Hẹn gặp lại!"`) +
            `\n\n💡 Canvas sẽ tự động tạo ảnh với thiết kế đẹp mắt!\n\n` +
            `👉 Reply nội dung banner:`;
          nextType = `${messageType}_canvas_auto`;
        }
        return client.sendMessage(promptMsg, threadID, (err: any, info: any) => {
          if (err) return;
          main.onReply.set(info.messageID, {
            commandName,
            messageID: info.messageID,
            author: senderID,
            threadID,
            type: nextType
          });
        });
      }
      const messageType = type.includes('join') ? 'join' : 'leave';
      if (type.endsWith('_text_only')) {
        customMessages[messageType] = {
          text: body,
          type: 'text_only',
          hasMedia: false
        };
        await threadData.update(threadID, { settings: nextSettings() });
        return client.sendMessage(
          `✅ Đã thiết lập tin nhắn ${messageType === 'join' ? 'chào mừng' : 'tạm biệt'
          } chỉ text!`,
          threadID
        );
      }
      if (type.endsWith('_text_image_link')) {
        const { text, url } = splitMessageAndUrl(body);
        if (!text || !url) {
          return client.sendMessage(
            `❗ Sai định dạng!\n\n` +
            `📋 Đúng định dạng:\n` +
            `Nội dung tin nhắn | Link ảnh\n\n` +
            `💡 Ví dụ:\n` +
            `"Chào mừng {name}! | https://example.com/image.jpg"`,
            threadID
          );
        }
        const filename = `${messageType}_img_${Date.now()}`;
        const savedPath = await downloadMedia(url, filename, threadID);
        if (!savedPath) return client.sendMessage(`❌ Không thể tải ảnh từ link này!`, threadID);
        customMessages[messageType] = {
          text,
          imageUrl: url,
          imagePath: savedPath,
          type: 'text_image_link',
          hasMedia: true
        };
        await threadData.update(threadID, { settings: nextSettings() });
        return client.sendMessage(
          `✅ Đã thiết lập với ảnh từ link!\n📁 Lưu: bot/data/set_media/${threadID}/`,
          threadID
        );
      }
      if (type.endsWith('_text_image_upload')) {
        if (!attachments || !attachments.length || !isPhoto(attachments[0])) {
          return client.sendMessage(
            `❗ Vui lòng upload ảnh kèm theo nội dung!\n\n` +
            `📋 Cách làm:\n` +
            `1. Upload ảnh (kèm theo tin nhắn này)\n` +
            `2. Nhập nội dung tin nhắn\n\n` +
            `💡 Ví dụ: Upload ảnh + "Chào mừng {name}!"`,
            threadID
          );
        }
        const filename = `${messageType}_upload_${Date.now()}`;
        const url = attachments[0].url;
        const savedPath = await saveUploadedMedia(url, filename, threadID);
        if (!savedPath) return client.sendMessage(`❌ Không thể lưu ảnh upload!`, threadID);
        customMessages[messageType] = {
          text: body,
          uploadedImage: url,
          imagePath: savedPath,
          type: 'text_image_upload',
          hasMedia: true
        };
        await threadData.update(threadID, { settings: nextSettings() });
        return client.sendMessage(
          `✅ Đã thiết lập với ảnh upload!\n📁 Lưu: bot/data/set_media/${threadID}/`,
          threadID
        );
      }
      if (type.endsWith('_text_video_link')) {
        const { text, url } = splitMessageAndUrl(body);
        if (!text || !url) {
          return client.sendMessage(
            `❗ Sai định dạng!\n\n` +
            `📋 Đúng định dạng:\n` +
            `Nội dung tin nhắn | Link video\n\n` +
            `💡 Ví dụ:\n` +
            `"Chào mừng {name}! | https://example.com/video.mp4"`,
            threadID
          );
        }
        const filename = `${messageType}_video_${Date.now()}`;
        const savedPath = await downloadMedia(url, filename, threadID);
        if (!savedPath) return client.sendMessage(`❌ Không thể tải video từ link này!`, threadID);
        customMessages[messageType] = {
          text,
          videoUrl: url,
          videoPath: savedPath,
          type: 'text_video_link',
          hasMedia: true
        };
        await threadData.update(threadID, { settings: nextSettings() });
        return client.sendMessage(
          `✅ Đã thiết lập với video!\n📁 Lưu: bot/data/set_media/${threadID}/`,
          threadID
        );
      }
      if (type.endsWith('_canvas_auto')) {
        customMessages[messageType] = {
          text: body,
          type: 'canvas_auto',
          hasMedia: true
        };
        await threadData.update(threadID, { settings: nextSettings() });
        return client.sendMessage(`✅ Đã thiết lập canvas tự động!`, threadID);
      }
    } catch (error: any) {
      return client.sendMessage(`❌ Có lỗi xảy ra: ${error.message}`, threadID);
    }
  },
  onEvent: async function ({
    client,
    userData,
    contact,
    threadData,
    config,
    event
  }: any) {
    const { threadID, logMessageType } = event;
    try {
      const thread = (await threadData.get(threadID)) || {};
      const settings = thread.settings || {};
      const dataThread = thread.threadInfo || {};
      const customMessages = settings.customMessages || {};
      if (logMessageType === 'log:unsubscribe') {
        if (!settings.noti?.leaveNoti) return;
        const iduser = event?.logMessageData?.leftParticipantFbId;
        if (!iduser || iduser === client.getCurrentUserID()) return;
        const name = await userData.getName(iduser);
        const leaveType =
          event.author === iduser
            ? 'đã tự rời khỏi nhóm'
            : 'đã bị Quản trị viên kick khỏi nhóm';
        if (customMessages.leave) {
          const ctx = {
            name,
            groupName: dataThread.threadName || 'nhóm',
            count: dataThread.participantIDs?.length || 0,
            uid: iduser
          };
          const messageText = formatText(customMessages.leave.text, ctx);
          if (!customMessages.leave.hasMedia || customMessages.leave.type === 'text_only') {
            contact(messageText, iduser);
          } else {
            const attachments: fsCore.ReadStream[] = [];
            if (
              customMessages.leave.type === 'text_image_link' ||
              customMessages.leave.type === 'text_image_upload'
            ) {
              if (
                customMessages.leave.imagePath &&
                (await fs.pathExists(customMessages.leave.imagePath))
              ) {
                attachments.push(
                  fsCore.createReadStream(customMessages.leave.imagePath)
                );
              }
            } else if (customMessages.leave.type === 'text_video_link') {
              if (
                customMessages.leave.videoPath &&
                (await fs.pathExists(customMessages.leave.videoPath))
              ) {
                attachments.push(
                  fsCore.createReadStream(customMessages.leave.videoPath)
                );
              }
            } else if (customMessages.leave.type === 'canvas_auto') {
              const out = await renderLeaveCanvas(
                iduser,
                threadID,
                name,
                dataThread.threadName || 'nhóm'
              );
              if (out && (await fs.pathExists(out))) {
                attachments.push(fsCore.createReadStream(out));
              }
            }
            await client.sendMessage(
              {
                body: messageText,
                attachment: attachments.length ? attachments : undefined
              },
              threadID
            );
          }
        } else {
          const text = `📝 ${name} ${leaveType}`;
          contact(text, iduser);
        }
        return;
      }
      if (logMessageType === 'log:subscribe') {
        const added = event?.logMessageData?.addedParticipants || [];
        const botID = client.getCurrentUserID();
        const isBotAdded = added.some((p: any) => p.userFbId === botID);
        if (isBotAdded) {
          try {
            await client.mute(threadID);
          } catch { }
          try {
            await client.changeNickname(
              `[ ${config.PREFIX} ] • ${config.BOTNAME || 'FujiraBot'}`,
              threadID,
              botID
            );
          } catch { }
          await client.sendMessage(
            {
              body:
                `✅ Kết nối thành công\n\n` +
                `• Prefix: ${config.PREFIX}\n` +
                `• Bot Name: ${config.BOTNAME || 'FujiraBot'}`
            },
            threadID
          );
          return;
        }
        if (!settings.noti?.joinNoti) return;
        for (const p of added) {
          const userName = p.fullName || 'Người dùng';
          const userId = p.userFbId;
          if (!userId) continue;
          const totalMembers = dataThread?.participantIDs?.length || 0;
          if (customMessages.join) {
            const ctx = {
              name: userName,
              groupName: dataThread.threadName || 'nhóm',
              count: totalMembers,
              uid: userId
            };
            const messageText = formatText(customMessages.join.text, ctx);
            if (!customMessages.join.hasMedia || customMessages.join.type === 'text_only') {
              contact(messageText, userId);
            } else {
              const attachments: fsCore.ReadStream[] = [];
              if (
                customMessages.join.type === 'text_image_link' ||
                customMessages.join.type === 'text_image_upload'
              ) {
                if (
                  customMessages.join.imagePath &&
                  (await fs.pathExists(customMessages.join.imagePath))
                ) {
                  attachments.push(
                    fsCore.createReadStream(customMessages.join.imagePath)
                  );
                }
              } else if (customMessages.join.type === 'text_video_link') {
                if (
                  customMessages.join.videoPath &&
                  (await fs.pathExists(customMessages.join.videoPath))
                ) {
                  attachments.push(
                    fsCore.createReadStream(customMessages.join.videoPath)
                  );
                }
              } else if (customMessages.join.type === 'canvas_auto') {
                const out = await renderJoinCanvas(
                  userId,
                  threadID,
                  userName,
                  dataThread.threadName || 'nhóm',
                  totalMembers
                );
                if (out && (await fs.pathExists(out))) {
                  attachments.push(fsCore.createReadStream(out));
                }
              }
              await client.sendMessage(
                {
                  body: messageText,
                  attachment: attachments.length ? attachments : undefined
                },
                threadID
              );
            }
          } else {
            const messageText =
              `🎉 Chào mừng ${userName} đã đến với ${dataThread.threadName || 'nhóm'}!\n` +
              `Bạn là thành viên thứ ${totalMembers} của nhóm 🥳`;
            contact(messageText, userId);
          }
        }
        await threadData.update(threadID, { threadInfo: dataThread });
      }
    } catch { }
  }
};

export default command;
