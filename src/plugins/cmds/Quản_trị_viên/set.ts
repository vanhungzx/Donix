

import axios from 'axios';
import type { CanvasRenderingContext2D, Image } from 'canvas';
import { createCanvas, loadImage } from 'canvas';
import fsCore from 'fs';
import fs from 'fs-extra';
import path from 'path';
import { STORAGE_SET_MEDIA, TEMP_DIR } from '../../../core/storagePath';

type CanvasImageSource = Image;

interface FormatContext {
  name?: string;
  groupName?: string;
  count?: number | string;
  uid?: number | string;
  time?: string;
  timeNow?: string;
  date?: string;
  timeOnly?: string;
  hour?: string;
  minute?: string;
  day?: string;
  month?: string;
  year?: string;
  dayOfWeek?: string;
  timestamp?: string;
  tag?: string;
  link?: string;
  random?: number | string;
  emoji?: string;
}

interface ThreadInfo {
  adminIDs?: Array<{ id: string } | string>;
  threadName?: string;
  participantIDs?: Array<string | number>;
}

interface CustomMessageConfig {
  text: string;
  type:
    | 'text_only'
    | 'text_image_link'
    | 'text_image_upload'
    | 'text_video_link'
    | 'text_video_upload'
    | 'canvas_auto';
  hasMedia: boolean;
  imageUrl?: string;
  uploadedImage?: string;
  imagePath?: string;
  videoUrl?: string;
  uploadedVideo?: string;
  videoPath?: string;
}

interface ThreadSettings {
  customMessages?: {
    join?: CustomMessageConfig | null;
    leave?: CustomMessageConfig | null;
  };
  noti?: {
    joinNoti?: boolean;
    leaveNoti?: boolean;
  };
}

interface ThreadRecord {
  settings?: ThreadSettings;
  threadInfo?: ThreadInfo;
}

interface ThreadDataStore {
  get(threadID: string | number): Promise<ThreadRecord | undefined>;
  update(threadID: string | number, data: Partial<ThreadRecord>): Promise<void>;
}

interface FacebookAttachment {
  url: string;
  type?: string;
}

interface FacebookEvent {
  threadID: string | number;
  senderID: string | number;
  body?: string;
  attachments?: FacebookAttachment[];
  logMessageType?: string;
  logMessageData?: {
    leftParticipantFbId?: string;
    addedParticipants?: Array<{
      userFbId?: string | number;
      fullName?: string;
    }>;
  };
  author?: string | number;
}

interface SendMessageInfo {
  messageID: string;
}

interface MessengerClient {
  sendMessage(
    message: { body: string; attachment?: fsCore.ReadStream[] },
    threadID: string | number,
    callback?: (err: Error | null, info?: SendMessageInfo) => void
  ): void;
  getCurrentUserID(): string;
  mute?(threadID: string | number): Promise<void> | void;
  changeNickname?(
    nickname: string,
    threadID: string | number,
    userID: string | number
  ): Promise<void> | void;
}

interface OnReplyEntry {
  commandName: string;
  messageID: string;
  author: string | number;
  threadID: string | number;
  type: string;
  /** Nội dung text đã nhập ở bước 1 (upload ảnh/video 2 bước). */
  pendingText?: string;
}

interface OnReplyStore {
  set(messageID: string, value: OnReplyEntry): void;
}

interface MainContext {
  onReply: OnReplyStore;
}

interface UserDataStore {
  getName(userID: string | number): Promise<string>;
}

interface BotConfig {
  PREFIX: string;
  BOTNAME?: string;
}

interface ReplyMetadata {
  type: string;
  author: string | number;
  pendingText?: string;
}

function getMediaDir(threadID: string | number): string {
  return path.join(STORAGE_SET_MEDIA(), String(threadID));
}

function getTempDir(): string {
  return TEMP_DIR();
}

function splitMessageAndUrl(input: string) {
  if (!input) return { text: '', url: '' };
  const sep = input.includes(' | ') ? ' | ' : (input.includes('|') ? '|' : '\n');
  const [a, b] = String(input).split(sep);
  return { text: (a || '').trim(), url: (b || '').trim() };
}

function extFromUrlOrType(u: string, ct?: string | null): string | null {
  const mFromUrl = (String(u || '').split('?')[0] || '').match(/\.(jpg|jpeg|png|gif|mp4|webm|mov)$/i);
  const extFromMatch = mFromUrl?.[1];
  if (extFromMatch) return extFromMatch.toLowerCase();
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



/** Mẫu chữ khi reply đúng một chữ `s` (không tự gõ nội dung). */
const DEFAULT_JOIN_TEXT =
  '🎉 Chào mừng {name} đã đến với {groupName}!\nBạn là thành viên thứ {count} của nhóm 🥳';

const DEFAULT_LEAVE_TEXT = '📝 {name} đã rời khỏi nhóm';

function isDefaultTextReply(body: string): boolean {
  return String(body || '').trim().toLowerCase() === 's';
}

function resolveSetText(raw: string, kind: 'join' | 'leave'): string {
  const t = String(raw || '').trim();
  if (isDefaultTextReply(t)) return kind === 'join' ? DEFAULT_JOIN_TEXT : DEFAULT_LEAVE_TEXT;
  return t;
}

/** Gợi ý ngắn trong luồng; chi tiết trong guide / lệnh full. */
function setGuideRef(): string {
  return (
    '💬 Nội dung hoặc reply s (text mặc định).\n' +
    '📖 Chi tiết: guide hoặc set full.'
  );
}

/** Menu chọn kiểu tin join/leave — tách dòng cho dễ đọc. */
function setJoinLeaveTypeMenu(headerLine: string): string {
  return (
    `${headerLine}\n\n` +
    '1 · Chỉ text\n' +
    '2 · Ảnh + link (text | URL)\n' +
    '3 · Ảnh upload — 2 bước\n' +
    '4 · Video + link (text | URL)\n' +
    '5 · Video upload — 2 bước\n' +
    '6 · Canvas\n\n' +
    '────────\n' +
    setGuideRef()
  );
}

const SET_COMMAND_GUIDE =
  '📋 SET — chi tiết trong guide này\n\n' +
  '▸ {pn} full — gửi lại toàn bộ hướng dẫn trong chat\n' +
  '▸ {pn} join | leave — chọn kiểu 1–6 (reply số)\n' +
  '▸ {pn} noti [join|leave] — không tham số: reply 1 / 2 / "1 2"\n' +
  '▸ {pn} preview | reset\n\n' +
  '━━ Kiểu tin (sau join/leave) ━━\n' +
  '1 Chỉ text\n' +
  '2 Text + ảnh link — "nội dung | https://...jpg/png/gif" (có thể: s | url = chỉ media + text mặc định)\n' +
  '3 Text + ảnh upload — 2 bước: (1) text hoặc s (2) reply + đính ảnh\n' +
  '4 Text + video link — "nội dung | https://...mp4/webm/mov" (có thể: s | url)\n' +
  '5 Text + video upload — 2 bước: (1) text hoặc s (2) reply + đính video\n' +
  '6 Canvas — text banner hoặc s\n\n' +
  '━━ Text mặc định (reply đúng chữ s) ━━\n' +
  'Join: mẫu chào có {name} {groupName} {count} như bot mặc định.\n' +
  'Leave: mẫu 📝 {name} đã rời khỏi nhóm.\n\n' +
  '━━ Biến trong text ━━\n' +
  '{name} {tag} {uid} {link} · {groupName} {count} · {time} {date} {timeOnly} {hour} {minute} {day} {month} {year} {dayOfWeek} {timestamp} · {random} {emoji}\n\n' +
  '━━ Ví dụ ━━\n' +
  '• join → 1 → s\n' +
  '• join → 2 → s | https://i.imgur.com/x.png\n' +
  '• leave → 4 → Bye {name}! | https://…/v.mp4\n' +
  '• Kiểu 3 hoặc 5: bước 1 có thể gõ s\n\n' +
  '━━ Lưu ý ━━\n' +
  '• Link ảnh/video: dùng " | " (cách – dấu | – cách) giữa phần chữ và URL. Có thể gõ "s | https://..." = text mặc định + media.\n' +
  '• Thông báo: phải bật join/leave ({pn} noti, reply 1 / 2 / "1 2" hoặc {pn} noti join|leave) thì bot mới gửi tin khi có người vào/ra.\n' +
  '• Media: ảnh/video tải về hoặc upload được lưu theo từng nhóm tại storage/set_media/<ID nhóm>/ (gốc project). Đổi mẫu: {pn} join / {pn} leave; xem nhanh: {pn} preview; xóa cấu hình + file: {pn} reset.\n' +
  '• Xem lại toàn bộ hướng dẫn: {pn} full hoặc mục guide lệnh set trên menu bot.';


function createFullContext(baseCtx: {
  name?: string;
  groupName?: string;
  count?: number | string;
  uid?: number | string;
}): FormatContext {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  const dd = pad(now.getDate());
  const mm = pad(now.getMonth() + 1);
  const yyyy = now.getFullYear();
  const hh = pad(now.getHours());
  const mi = pad(now.getMinutes());
  const ss = pad(now.getSeconds());

  const daysOfWeek = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const dayOfWeek = daysOfWeek[now.getDay()];

  const emojis = ['🎉', '✨', '🥳', '🎊', '🎈', '🎁', '💫', '🌟', '⭐', '💖', '💕', '💗', '💓', '💝', '🎀', '🎂', '🍰', '🍭', '🍬', '🍫'];
  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  const randomNum = Math.floor(Math.random() * 100) + 1;

  return {
    ...baseCtx,
    time: `${dd}/${mm}/${yyyy} - ${hh}:${mi}:${ss}`,
    timeNow: `${dd}/${mm}/${yyyy} - ${hh}:${mi}:${ss}`,
    date: `${dd}/${mm}/${yyyy}`,
    timeOnly: `${hh}:${mi}:${ss}`,
    hour: hh,
    minute: mi,
    day: dd,
    month: mm,
    year: String(yyyy),
    dayOfWeek: dayOfWeek,
    timestamp: String(Math.floor(now.getTime() / 1000)),
    tag: baseCtx.name ? `@${baseCtx.name}` : '',
    link: baseCtx.uid ? `https://www.facebook.com/profile.php?id=${baseCtx.uid}` : '',
    random: randomNum,
    emoji: randomEmoji
  };
}

function formatText(t: string, ctx: FormatContext): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');


  const dd = pad(now.getDate());
  const mm = pad(now.getMonth() + 1);
  const yyyy = now.getFullYear();
  const hh = pad(now.getHours());
  const mi = pad(now.getMinutes());
  const ss = pad(now.getSeconds());

  const daysOfWeek = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const dayOfWeek = daysOfWeek[now.getDay()];

  const emojis = ['🎉', '✨', '🥳', '🎊', '🎈', '🎁', '💫', '🌟', '⭐', '💖', '💕', '💗', '💓', '💝', '🎀', '🎂', '🍰', '🍭', '🍬', '🍫'];
  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  const randomNum = Math.floor(Math.random() * 100) + 1;

  return String(t || '')

    .replace(/{name}/g, ctx.name || '')
    .replace(/{uid}/g, String(ctx.uid ?? ''))
    .replace(/{tag}/g, ctx.tag || (ctx.name ? `@${ctx.name}` : ''))
    .replace(/{link}/g, ctx.link || (ctx.uid ? `https://www.facebook.com/profile.php?id=${ctx.uid}` : ''))
    .replace(/{groupName}/g, ctx.groupName || '')
    .replace(/{count}/g, String(ctx.count ?? ''))

    .replace(/{time}/g, ctx.time || `${dd}/${mm}/${yyyy} - ${hh}:${mi}:${ss}`)
    .replace(/{timeNow}/g, ctx.timeNow || `${dd}/${mm}/${yyyy} - ${hh}:${mi}:${ss}`)
    .replace(/{date}/g, ctx.date || `${dd}/${mm}/${yyyy}`)
    .replace(/{timeOnly}/g, ctx.timeOnly || `${hh}:${mi}:${ss}`)
    .replace(/{hour}/g, ctx.hour || hh)
    .replace(/{minute}/g, ctx.minute || mi)
    .replace(/{day}/g, ctx.day || dd)
    .replace(/{month}/g, ctx.month || mm)
    .replace(/{year}/g, ctx.year || String(yyyy))
    .replace(/{dayOfWeek}/g, ctx.dayOfWeek ?? dayOfWeek ?? '')
    .replace(/{timestamp}/g, ctx.timestamp ?? String(Math.floor(now.getTime() / 1000)))

    .replace(/{random}/g, String(ctx.random ?? randomNum))
    .replace(/{emoji}/g, ctx.emoji ?? randomEmoji ?? '');
}

function isPhoto(att: { type?: string } | undefined): boolean {
  const k = String(att?.type || '').toLowerCase();
  return k === 'photo' || k === 'image' || k === 'sticker';
}

function isVideo(att: { type?: string } | undefined): boolean {
  return String(att?.type || '').toLowerCase() === 'video';
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
    this.ctx = this.canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
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
        ctx.drawImage(avatarImage as unknown as CanvasImageSource, avatarX - avatarRadius + 3, avatarY - avatarRadius + 3, size, size);
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
      const value = data[i] ?? 0;
      const barHeight = value * maxBarHeight;
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
    const buffer = this.canvas.toBuffer('image/png');
    fsCore.writeFileSync(outputPath, buffer);
    return { success: true, outputPath, buffer };
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
    this.ctx = this.canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
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
        ctx.drawImage(avatarImage as unknown as CanvasImageSource, avatarX - avatarRadius + 3, avatarY - avatarRadius + 3, size, size);
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
      const value = data[i] ?? 0;
      const barHeight = value * maxBarHeight;
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
    const buffer = this.canvas.toBuffer('image/png');
    fsCore.writeFileSync(outputPath, buffer);
    return { success: true, outputPath, buffer };
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
  version: '1.4.3',
  role: 1,
  desc: 'Tùy chỉnh tin join/leave: full, text/link/upload/canvas, reply s = mẫu mặc định',
  guide: SET_COMMAND_GUIDE,
  prefix: true,
  onCall: async function ({
    bot: _bot,
    client,
    args,
    threadData,
    event,
    main,
    commandName,
    config
  }: {
    bot: unknown;
    client: MessengerClient;
    args: string[];
    threadData: ThreadDataStore;
    event: FacebookEvent;
    main: MainContext;
    commandName: string;
    config: BotConfig;
  }) {
    const { threadID, senderID } = event;
    const pn = `${config.PREFIX}${commandName}`;
    if (!args[0]) {
      return client.sendMessage(
        {
          body: `📋 ${pn} join | leave | noti | preview | reset | full`
        },
        threadID
      );
    }
    const thread = (await threadData.get(threadID)) || ({} as ThreadRecord);
    const settings = thread.settings || {};
    const customMessages = settings.customMessages || {};
    switch (String(args[0]).toLowerCase()) {
      case 'full': {
        return client.sendMessage(
          {
            body: SET_COMMAND_GUIDE.replace(/\{pn\}/g, pn)
          },
          threadID
        );
      }
      case 'join': {
        const setupMsg = setJoinLeaveTypeMenu('🎨 Chào mừng — reply số 1–6');
        return client.sendMessage(
          {
            body: setupMsg
          },
          threadID,
          (err: Error | null, info?: SendMessageInfo) => {
            if (err || !info) return;
            main.onReply.set(info.messageID, {
              commandName,
              messageID: info.messageID,
              author: senderID,
              threadID,
              type: 'join_type_selection'
            });
          }
        );
      }
      case 'leave': {
        const setupMsg = setJoinLeaveTypeMenu('💔 Tạm biệt — reply số 1–6');
        return client.sendMessage(
          {
            body: setupMsg
          },
          threadID,
          (err: Error | null, info?: SendMessageInfo) => {
            if (err || !info) return;
            main.onReply.set(info.messageID, {
              commandName,
              messageID: info.messageID,
              author: senderID,
              threadID,
              type: 'leave_type_selection'
            });
          }
        );
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
        return client.sendMessage(
          {
            body: `♻️ Đã reset tin nhắn về mặc định và xóa các file media!`
          },
          threadID
        );
      }
      case 'noti': {
        const threadWithSettings = thread;
        const adminIDs = (threadWithSettings?.threadInfo?.adminIDs || []).map((admin) =>
          typeof admin === 'string' ? admin : String(admin.id)
        );

        if (!adminIDs.includes(String(senderID))) {
          return client.sendMessage(
            {
              body: "❎ Chỉ quản trị viên mới có thể sử dụng lệnh này."
            },
            threadID
          );
        }

        settings.noti = settings.noti || {};
        const { joinNoti = false, leaveNoti = false } = settings.noti;


        if (args[1] && ["join", "leave"].includes(args[1].toLowerCase())) {
          const key = args[1].toLowerCase() === "join" ? "joinNoti" : "leaveNoti";
          settings.noti[key] = !settings.noti[key];

          await threadData.update(threadID, { settings });

          return client.sendMessage(
            {
              body:
                `${settings.noti[key] ? "✅ Bật" : "❌ Tắt"} thông báo ${args[1].toLowerCase() === "join" ? "tham gia" : "rời nhóm"
                } thành công!`
            },
            threadID
          );
        }

        return client.sendMessage(
          {
            body:
          `📢 TRẠNG THÁI THÔNG BÁO HIỆN TẠI\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `1️⃣ Thông báo thành viên mới (join): ${joinNoti ? "✅ Bật" : "❌ Tắt"}\n` +
          `   → Gửi tin nhắn khi có thành viên mới tham gia nhóm\n\n` +
          `2️⃣ Thông báo thành viên rời nhóm (leave): ${leaveNoti ? "✅ Bật" : "❌ Tắt"}\n` +
          `   → Gửi tin nhắn khi có thành viên rời khỏi nhóm\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📌 CÁCH SỬ DỤNG:\n\n` +
          `Cách 1: Reply số để bật/tắt\n` +
          `   • Reply "1" → Bật/tắt thông báo join\n` +
          `   • Reply "2" → Bật/tắt thông báo leave\n` +
          `   • Reply "1 2" → Bật/tắt cả hai cùng lúc\n\n` +
          `Cách 2: Dùng lệnh trực tiếp\n` +
          `   • ${pn} noti join  → Bật/tắt thông báo join\n` +
          `   • ${pn} noti leave → Bật/tắt thông báo leave\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `⚠️ LƯU Ý:\n` +
          `• Phải bật thông báo thì bot mới gửi tin nhắn chào mừng/tạm biệt\n` +
          `• Có thể bật/tắt từng loại thông báo riêng biệt\n` +
          `• Chỉ quản trị viên mới có thể sử dụng lệnh này\n\n` +
          `👉 Reply số (1 hoặc 2) để bật/tắt:`
          },
          threadID,
          async (err: Error | null, info?: SendMessageInfo) => {
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
          customMessages.join?.text || `[chưa set] ${DEFAULT_JOIN_TEXT}`;
        const leaveMsg =
          customMessages.leave?.text || `[chưa set] ${DEFAULT_LEAVE_TEXT}`;
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
          `📁 Folder media: storage/set_media/${threadID}/\n` +
          `📂 Canvas: file PNG tạm trong temp/ khi bot gửi`;
        return client.sendMessage(
          {
            body: previewText
          },
          threadID
        );
      }
      default:
        return client.sendMessage(
          {
            body: `❗ Dùng: join, leave, noti, preview, reset, full`
          },
          threadID
        );
    }
  },
  onReply: async function ({
    bot: _bot,
    client,
    event,
    main,
    commandName,
    Reply,
    threadData
  }: {
    bot: unknown;
    client: MessengerClient;
    event: FacebookEvent;
    main: MainContext;
    commandName: string;
    Reply: ReplyMetadata;
    threadData: ThreadDataStore;
  }) {
    const { threadID, senderID, body, attachments } = event;
    const { type, author } = Reply;
    if (senderID !== author) return;
    const thread = (await threadData.get(threadID)) || {};
    const settings = thread.settings || {};
    const customMessages = settings.customMessages || {};
    const nextSettings = () => mergeSettings(settings, { customMessages });
    try {
      if (type === 'noti_status_selection') {
        const choices = String(body || "")
          .trim()
          .split(/\s+/)
          .map((n) => parseInt(n.trim(), 10))
          .filter((n) => !isNaN(n) && [1, 2].includes(n));

        if (choices.length === 0) {
          return client.sendMessage(
            {
              body:
                `❌ LỰA CHỌN KHÔNG HỢP LỆ!\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `📌 Vui lòng reply số để bật/tắt:\n\n` +
                `• Reply "1" → Bật/tắt thông báo join\n` +
                `• Reply "2" → Bật/tắt thông báo leave\n` +
                `• Reply "1 2" → Bật/tắt cả hai cùng lúc\n\n` +
                `💡 Ví dụ: Reply "1" hoặc "2" hoặc "1 2"`
            },
            threadID
          );
        }

        settings.noti = settings.noti || {};
        const statusChanges: string[] = [];

        for (const choice of choices) {
          const key = choice === 1 ? "joinNoti" : "leaveNoti";
          const oldValue = settings.noti[key] || false;
          settings.noti[key] = !oldValue;
          statusChanges.push(
            `${settings.noti[key] ? "bật" : "tắt"} thông báo ${choice === 1 ? "tham gia (join)" : "rời nhóm (leave)"
            }`
          );
        }

        await threadData.update(threadID, { settings });


        const resultMessage =
          `✅ ĐÃ CẬP NHẬT THÀNH CÔNG!\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📢 Đã ${statusChanges.join(" và ")} thành công!\n\n` +
          `📋 Trạng thái hiện tại:\n` +
          `• Thông báo join: ${settings.noti.joinNoti ? "✅ Bật" : "❌ Tắt"}\n` +
          `• Thông báo leave: ${settings.noti.leaveNoti ? "✅ Bật" : "❌ Tắt"}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `💡 Lưu ý: Phải bật thông báo thì bot mới gửi tin nhắn chào mừng/tạm biệt!`;

        return client.sendMessage(
          {
            body: resultMessage
          },
          threadID
        );
      }
      if (type === 'join_type_selection' || type === 'leave_type_selection') {
        const choice = parseInt(String(body || '').trim(), 10);
        const messageType = type.includes('join') ? 'join' : 'leave';
        if (![1, 2, 3, 4, 5, 6].includes(choice)) {
          return client.sendMessage(
            {
              body: '❗ Chọn số 1–6 (xem guide lệnh set).'
            },
            threadID
          );
        }
        let promptMsg = '';
        let nextType = '';
        const hint = setGuideRef();
        const kind = messageType === 'join' ? 'chào mừng' : 'tạm biệt';
        if (choice === 1) {
          promptMsg = `📝 Reply nội dung ${kind} (hoặc s = mẫu mặc định).\n${hint}`;
          nextType = `${messageType}_text_only`;
        }
        if (choice === 2) {
          promptMsg = `📷 Reply: nội dung | link ảnh — có thể s | url.\n${hint}`;
          nextType = `${messageType}_text_image_link`;
        }
        if (choice === 3) {
          promptMsg = `📷 Bước 1/2 — text hoặc s (ảnh ở bước sau).\n${hint}`;
          nextType = `${messageType}_image_upload_text`;
        }
        if (choice === 4) {
          promptMsg = `🎬 Reply: nội dung | link — có thể s | url.\n${hint}`;
          nextType = `${messageType}_text_video_link`;
        }
        if (choice === 5) {
          promptMsg = `🎬 Bước 1/2 — text hoặc s (video ở bước sau).\n${hint}`;
          nextType = `${messageType}_video_upload_text`;
        }
        if (choice === 6) {
          promptMsg = `🎨 Canvas — text banner hoặc s.\n${hint}`;
          nextType = `${messageType}_canvas_auto`;
        }
        return client.sendMessage(
          {
            body: promptMsg
          },
          threadID,
          (err: Error | null, info?: SendMessageInfo) => {
            if (err || !info) return;
            main.onReply.set(info.messageID, {
              commandName,
              messageID: info.messageID,
              author,
              threadID,
              type: nextType
            });
          }
        );
      }
      if (
        type === 'join_image_upload_text' ||
        type === 'leave_image_upload_text'
      ) {
        const messageType = type.startsWith('join') ? 'join' : 'leave';
        const raw = String(body || '').trim();
        if (!raw) {
          return client.sendMessage(
            { body: '❗ Reply nội dung hoặc s (mặc định).' },
            threadID
          );
        }
        const text = resolveSetText(raw, messageType);
        return client.sendMessage(
          {
            body: '📷 Bước 2/2: reply tin này và đính kèm ảnh.'
          },
          threadID,
          (err: Error | null, info?: SendMessageInfo) => {
            if (err || !info) return;
            main.onReply.set(info.messageID, {
              commandName,
              messageID: info.messageID,
              author,
              threadID,
              type: `${messageType}_image_upload_media`,
              pendingText: text
            });
          }
        );
      }
      if (
        type === 'join_image_upload_media' ||
        type === 'leave_image_upload_media'
      ) {
        const messageType = type.startsWith('join') ? 'join' : 'leave';
        const pendingText = String(Reply.pendingText || '').trim();
        if (!pendingText) {
          return client.sendMessage(
            {
              body:
                '❗ Hết phiên thiết lập. Gõ lại lệnh set join hoặc set leave.'
            },
            threadID
          );
        }
        if (!attachments?.length || !isPhoto(attachments[0])) {
          return client.sendMessage(
            {
              body: '❗ Bước 2: reply kèm ảnh (jpg/png/gif). Chi tiết: guide.'
            },
            threadID
          );
        }
        const filename = `${messageType}_upload_${Date.now()}`;
        const url = attachments[0].url;
        const savedPath = await saveUploadedMedia(url, filename, threadID);
        if (!savedPath) {
          return client.sendMessage(
            { body: '❌ Không lưu được ảnh.' },
            threadID
          );
        }
        customMessages[messageType] = {
          text: pendingText,
          uploadedImage: url,
          imagePath: savedPath,
          type: 'text_image_upload',
          hasMedia: true
        };
        await threadData.update(threadID, { settings: nextSettings() });
        return client.sendMessage(
          {
            body: `✅ Ảnh upload xong. Lưu: storage/set_media/${threadID}/`
          },
          threadID
        );
      }
      if (
        type === 'join_video_upload_text' ||
        type === 'leave_video_upload_text'
      ) {
        const messageType = type.startsWith('join') ? 'join' : 'leave';
        const raw = String(body || '').trim();
        if (!raw) {
          return client.sendMessage(
            { body: '❗ Reply nội dung hoặc s (mặc định).' },
            threadID
          );
        }
        const text = resolveSetText(raw, messageType);
        return client.sendMessage(
          {
            body: '🎬 Bước 2/2: reply tin này và đính kèm video.'
          },
          threadID,
          (err: Error | null, info?: SendMessageInfo) => {
            if (err || !info) return;
            main.onReply.set(info.messageID, {
              commandName,
              messageID: info.messageID,
              author,
              threadID,
              type: `${messageType}_video_upload_media`,
              pendingText: text
            });
          }
        );
      }
      if (
        type === 'join_video_upload_media' ||
        type === 'leave_video_upload_media'
      ) {
        const messageType = type.startsWith('join') ? 'join' : 'leave';
        const pendingText = String(Reply.pendingText || '').trim();
        if (!pendingText) {
          return client.sendMessage(
            {
              body:
                '❗ Hết phiên thiết lập. Gõ lại lệnh set join hoặc set leave.'
            },
            threadID
          );
        }
        if (!attachments?.length || !isVideo(attachments[0])) {
          return client.sendMessage(
            {
              body: '❗ Bước 2: reply kèm video. Chi tiết: guide.'
            },
            threadID
          );
        }
        const filename = `${messageType}_vid_${Date.now()}`;
        const url = attachments[0].url;
        const savedPath = await saveUploadedMedia(url, filename, threadID);
        if (!savedPath) {
          return client.sendMessage(
            { body: '❌ Không lưu được video.' },
            threadID
          );
        }
        customMessages[messageType] = {
          text: pendingText,
          uploadedVideo: url,
          videoPath: savedPath,
          type: 'text_video_upload',
          hasMedia: true
        };
        await threadData.update(threadID, { settings: nextSettings() });
        return client.sendMessage(
          {
            body: `✅ Video upload xong. Lưu: storage/set_media/${threadID}/`
          },
          threadID
        );
      }
      const messageType = type.includes('join') ? 'join' : 'leave';
      if (type.endsWith('_text_only')) {
        const raw = String(body || '').trim();
        if (!raw) {
          return client.sendMessage(
            { body: '❗ Reply nội dung hoặc s (mặc định).' },
            threadID
          );
        }
        const text = resolveSetText(raw, messageType);
        customMessages[messageType] = {
          text,
          type: 'text_only',
          hasMedia: false
        };
        await threadData.update(threadID, { settings: nextSettings() });
        const usedDefault = isDefaultTextReply(raw);
        return client.sendMessage(
          {
            body: `✅ Đã lưu tin ${messageType === 'join' ? 'chào mừng' : 'tạm biệt'}${usedDefault ? ' (mẫu mặc định).' : '.'}`
          },
          threadID
        );
      }
      if (type.endsWith('_text_image_link')) {
        const { text: rawText, url } = splitMessageAndUrl(body || '');
        const trimmedText = String(rawText || '').trim();
        if (!trimmedText || !url) {
          return client.sendMessage(
            {
              body:
                '❗ Định dạng: nội dung hoặc s | link ảnh (có " | "). Xem guide.'
            },
            threadID
          );
        }
        const text = resolveSetText(trimmedText, messageType);
        const filename = `${messageType}_img_${Date.now()}`;
        const savedPath = await downloadMedia(url, filename, threadID);
        if (!savedPath) {
          return client.sendMessage(
            {
              body: `❌ Không thể tải ảnh từ link này!`
            },
            threadID
          );
        }
        customMessages[messageType] = {
          text,
          imageUrl: url,
          imagePath: savedPath,
          type: 'text_image_link',
          hasMedia: true
        };
        await threadData.update(threadID, { settings: nextSettings() });
        return client.sendMessage(
          {
            body: `✅ Ảnh link OK. Lưu: storage/set_media/${threadID}/`
          },
          threadID
        );
      }
      if (type.endsWith('_text_video_link')) {
        const { text: rawText, url } = splitMessageAndUrl(body || '');
        const trimmedText = String(rawText || '').trim();
        if (!trimmedText || !url) {
          return client.sendMessage(
            {
              body:
                '❗ Định dạng: nội dung hoặc s | link video (có " | "). Xem guide.'
            },
            threadID
          );
        }
        const text = resolveSetText(trimmedText, messageType);
        const filename = `${messageType}_video_${Date.now()}`;
        const savedPath = await downloadMedia(url, filename, threadID);
        if (!savedPath) {
          return client.sendMessage(
            {
              body: `❌ Không thể tải video từ link này!`
            },
            threadID
          );
        }
        customMessages[messageType] = {
          text,
          videoUrl: url,
          videoPath: savedPath,
          type: 'text_video_link',
          hasMedia: true
        };
        await threadData.update(threadID, { settings: nextSettings() });
        return client.sendMessage(
          {
            body: `✅ Video link OK. Lưu: storage/set_media/${threadID}/`
          },
          threadID
        );
      }
      if (type.endsWith('_canvas_auto')) {
        const raw = String(body || '').trim();
        if (!raw) {
          return client.sendMessage(
            { body: '❗ Reply text banner hoặc s (mặc định).' },
            threadID
          );
        }
        const text = resolveSetText(raw, messageType);
        customMessages[messageType] = {
          text,
          type: 'canvas_auto',
          hasMedia: true
        };
        await threadData.update(threadID, { settings: nextSettings() });
        return client.sendMessage(
          {
            body: `✅ Canvas đã lưu${isDefaultTextReply(raw) ? ' (mẫu mặc định).' : '.'}`
          },
          threadID
        );
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      return client.sendMessage(
        {
          body: `❌ Có lỗi xảy ra: ${message}`
        },
        threadID
      );
    }
  },
  onEvent: async function ({
    client,
    userData,
    contact,
    threadData,
    config,
    event
  }: {
    client: MessengerClient;
    userData: UserDataStore;
    contact: (message: string, userId: string | number) => Promise<void> | void;
    threadData: ThreadDataStore;
    config: BotConfig;
    event: FacebookEvent;
  }) {
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
          const ctx = createFullContext({
            name,
            groupName: dataThread.threadName || 'nhóm',
            count: dataThread.participantIDs?.length || 0,
            uid: iduser
          });
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
            } else if (
              customMessages.leave.type === 'text_video_link' ||
              customMessages.leave.type === 'text_video_upload'
            ) {
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
        const isBotAdded = added.some((p) => p.userFbId === botID);
        if (isBotAdded) {
          try {
            await client.mute?.(threadID);
          } catch { }
          try {
            await client.changeNickname?.(
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
            const ctx = createFullContext({
              name: userName,
              groupName: dataThread.threadName || 'nhóm',
              count: totalMembers,
              uid: userId
            });
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
              } else if (
                customMessages.join.type === 'text_video_link' ||
                customMessages.join.type === 'text_video_upload'
              ) {
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