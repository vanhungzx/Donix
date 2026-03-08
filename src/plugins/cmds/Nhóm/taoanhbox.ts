import axios from "axios";
import Canvas from "canvas";
import fs from "fs-extra";
import Jimp from "jimp";
import path from "path";
import { fileURLToPath } from "url";
import { STORAGE_FONT, storagePath } from "../../../core/storagePath";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type AvatarCacheItem = { buf: Buffer; at: number; bytes: number };
const avatarCache = new Map<string, AvatarCacheItem>();
const AVATAR_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes (reduced from 30 for RAM optimization)
const AVATAR_CACHE_MAX_ITEMS = 120; // Reduced from 200 for RAM optimization
const AVATAR_CACHE_MAX_BYTES = 15 * 1024 * 1024; // 15MB (reduced from 25MB for RAM optimization)
let avatarCacheBytes = 0;

function avatarCacheGet(key: string): Buffer | null {
  const hit = avatarCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > AVATAR_CACHE_TTL_MS) {
    avatarCache.delete(key);
    avatarCacheBytes -= hit.bytes;
    return null;
  }
  // refresh LRU order
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

  // Evict oldest until within bounds
  while (avatarCache.size > AVATAR_CACHE_MAX_ITEMS || avatarCacheBytes > AVATAR_CACHE_MAX_BYTES) {
    const firstKey = avatarCache.keys().next().value as string | undefined;
    if (!firstKey) break;
    const removed = avatarCache.get(firstKey);
    avatarCache.delete(firstKey);
    if (removed) avatarCacheBytes -= removed.bytes;
  }
}

const command = {
  name: "taoanhbox",
  alias: ["family"],
  version: "4.0.0",
  role: 0,
  desc: "Tạo ảnh all thành viên trong box với tỉ lệ 16:9",
  guide: "family <size> [#mã màu] [title]",
  cd: 5,
  prefix: true,
  circle: async (image: Buffer, cacheKey?: string): Promise<Buffer> => {
    if (cacheKey) {
      const cached = avatarCacheGet(cacheKey);
      if (cached) return cached;
    }

    const img = await Jimp.read(image);
    const width = img.getWidth();
    const height = img.getHeight();

    if (width !== height) {
      const size = Math.min(width, height);
      const x = (width - size) / 2;
      const y = (height - size) / 2;
      img.crop(x, y, size, size);
    }

    img.circle();
    const result = await img.getBufferAsync("image/png");

    if (cacheKey) {
      avatarCacheSet(cacheKey, result);
    }

    return result;
  },
  onCall: async function ({
    event,
    client,
    args,
    threadData,
  }: {
    event: any;
    client: any;
    args: string[];
    threadData: any;
  }) {
    const circle = this.circle;

    const { threadID, messageID } = event;
    const live: any[] = [];
    const admin: string[] = [];

    if (args[0] === "help" || args[0] === "0" || args[0] === "-h") {
      return client.sendMessage(
        "Sử dụng: " +
        this.name +
        " [size avt]" +
        " [#mã màu]" +
        " [tên nhóm (title)]" +
        "\nTùy chọn thêm:" +
        "\n- columns [số]: Đặt số cột (8-20)" +
        "\n- bg [số]: Chọn background (0-5)" +
        "\nVí dụ: family 250 #ffffff columns 12",
        threadID,
        messageID
      );
    }

    const fontDir = STORAGE_FONT();
    const fontPath = path.join(fontDir, "TUVBenchmark.ttf");

    // NOTE: Không tự tải font từ URL nữa. Nếu thiếu font thì sẽ fallback sang font mặc định.
    if (!fs.existsSync(fontPath)) {
      console.warn(`Font file không tồn tại tại: ${fontPath}`);
    }

    let fontRegistered = false;
    let fontFamilyName = "TUVBenchmark";

    if (fs.existsSync(fontPath)) {
      try {
        const stats = fs.statSync(fontPath);
        if (stats.size > 0) {
          // Register với đúng 1 family name cố định để tránh mismatch/cảnh báo "couldn't load font ..."
          // (node-canvas/Pango khá nhạy về family + weight trong chuỗi ctx.font)
          Canvas.registerFont(fontPath, { family: "TUVBenchmark" });
          fontFamilyName = "TUVBenchmark";
          fontRegistered = true;

          if (fontRegistered) {
            console.log(`✓ Đã đăng ký font "${fontFamilyName}" thành công (${(stats.size / 1024).toFixed(2)} KB)`);
          } else {
            console.warn("⚠️ Không thể đăng ký font với bất kỳ tên nào");
          }
        } else {
          console.warn("Font file rỗng, sẽ xóa để bạn chép lại font...");
          fs.unlinkSync(fontPath);
        }
      } catch (e: any) {
        console.error("Lỗi khi xử lý font:", e.message || e);
      }
    }

    if (!fontRegistered) {
      console.warn("⚠️ Không thể đăng ký font TUVBenchmark, sẽ sử dụng font mặc định (Sans)");
      fontFamilyName = "Sans";
    }


    console.log(`📝 Sẽ sử dụng font: "${fontFamilyName}"`);

    type ThreadUser = { id: string; name?: string; gender?: string | null };
    type AdminId = { id: string };
    type ThreadInfoLite = {
      userInfo?: ThreadUser[];
      adminIDs?: AdminId[];
      name?: string;
      imageSrc?: string;
    };

    const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
    const isThreadUser = (v: unknown): v is ThreadUser =>
      isRecord(v) && typeof v.id === "string";
    const isAdminId = (v: unknown): v is AdminId =>
      isRecord(v) && typeof v.id === "string";
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
    const threadInfo = asThreadInfoLite(tdRec["threadInfo"] ?? (isRecord(tdRec["data"]) ? (tdRec["data"] as Record<string, unknown>)["threadInfo"] : undefined));

    // NOTE: threadInfo.userInfo may be stripped to save RAM.
    // Fallback to realtime fetch when needed.
    let userInfo: ThreadUser[] = Array.isArray(threadInfo.userInfo) ? threadInfo.userInfo : [];
    let adminIDs: AdminId[] = Array.isArray(threadInfo.adminIDs) ? threadInfo.adminIDs : [];
    const name = threadInfo.name;
    const imageSrc = threadInfo.imageSrc;

    const clientRec = isRecord(client) ? client : {};
    const getThreadInfoFn = clientRec["getThreadInfo"];
    if (userInfo.length === 0 && typeof getThreadInfoFn === "function") {
      try {
        const liveInfo = await (getThreadInfoFn as (tid: string) => Promise<unknown>)(threadID);
        const live = asThreadInfoLite(liveInfo);
        if (Array.isArray(live.userInfo) && live.userInfo.length) userInfo = live.userInfo;
        if (Array.isArray(live.adminIDs) && live.adminIDs.length) adminIDs = live.adminIDs;
      } catch {
        // ignore
      }
    }

    for (const idAD of adminIDs) admin.push(idAD.id);

    const adminUsers: any[] = [];
    const normalUsers: any[] = [];
    for (const user of userInfo) {
      if (user.gender !== undefined) {
        if (admin.includes(user.id)) {
          adminUsers.push(user);
        } else {
          normalUsers.push(user);
        }
        live.push(user);
      }
    }

    const baseWidth = 3840;
    const headerHeight = 350;
    const basePadding = 20;

    const calculateOptimalLayout = (totalMembers: number) => {
      const aspectRatio = 16 / 9;
      const usableHeight = baseWidth / aspectRatio - headerHeight;

      let bestColumns = 15;
      let bestSize = 0;
      let bestRows = 0;

      for (let cols = 10; cols <= 20; cols++) {
        const rows = Math.ceil(totalMembers / cols);
        const sizeByWidth = Math.floor((baseWidth - basePadding * (cols + 1)) / cols);
        const sizeByHeight = Math.floor(usableHeight / rows - basePadding);
        const size = Math.min(sizeByWidth, sizeByHeight);

        if (size >= bestSize && cols > bestColumns) {
          bestSize = size;
          bestColumns = cols;
          bestRows = rows;
        } else if (size > bestSize) {
          bestSize = size;
          bestColumns = cols;
          bestRows = rows;
        }
      }

      let specifiedColumns: number | null = null;
      for (let i = 0; i < args.length - 1; i++) {
        const currentArg = args[i];
        const nextArg = args[i + 1];
        if (currentArg && currentArg.toLowerCase() === "columns" && nextArg) {
          specifiedColumns = parseInt(nextArg, 10);
          break;
        }
      }

      return {
        columns: specifiedColumns || bestColumns,
        size:
          !args[0] || args[0] === "0"
            ? bestSize
            : Math.min(parseInt(args[0], 10), bestSize),
        rows: bestRows,
      };
    };

    const optimalLayout = calculateOptimalLayout(live.length);
    const avatarSize = optimalLayout.size;
    const columns = optimalLayout.columns;
    const padding = basePadding;

    const adminRows = Math.ceil(adminUsers.length / columns);
    const normalRows = Math.ceil(normalUsers.length / columns);
    const totalRows = adminRows + normalRows;

    const adminSectionHeight =
      adminRows > 0 ? adminRows * (avatarSize + padding) + padding : 0;
    const normalSectionHeight =
      normalRows > 0 ? normalRows * (avatarSize + padding) + padding : 0;
    const extraPadding = padding * 4;

    const calculatedHeight =
      headerHeight +
      adminSectionHeight +
      (adminRows > 0 ? padding * 2 : 0) +
      normalSectionHeight +
      extraPadding;
    const aspectRatioHeight = Math.ceil((baseWidth * 9) / 16);
    const canvasHeight = Math.max(calculatedHeight, aspectRatioHeight);

    client.sendMessage(
      `🍗 Ảnh dự tính: ${live.length}\n` +
      `🍠 Size background: ${baseWidth} x ${canvasHeight}\n` +
      `🥑 Size Avatar: ${avatarSize}\n` +
      `🥪 Số cột: ${columns} (tối ưu)\n` +
      `📐 Tổng số hàng: ${totalRows} (${adminRows} hàng admin, ${normalRows} hàng thường)`,
      threadID,
      messageID
    );

    const canvas = Canvas.createCanvas(baseWidth, canvasHeight);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;

    // Load background from local storage
    const bgDir = storagePath("image", "taoanhbox", "bg");
    await fs.ensureDir(bgDir);

    // NOTE: Không tự tải background từ URL nữa, chỉ dùng file local trong thư mục bg/
    // Get available background files
    let bgFiles: string[] = [];
    try {
      const files = await fs.readdir(bgDir);
      bgFiles = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort();
    } catch (e) {
      console.warn("Không thể đọc thư mục background:", e);
    }

    const availableBgs = bgFiles.map(f => path.join(bgDir, f));

    let bgImg: any = null;
    let bgIndex = Math.floor(Math.random() * Math.max(1, availableBgs.length));

    for (let i = 0; i < args.length - 1; i++) {
      const currentArg = args[i];
      const nextArg = args[i + 1];
      if (currentArg && currentArg.toLowerCase() === "bg" && nextArg) {
        bgIndex = parseInt(nextArg, 10);
        break;
      }
    }

    // Try to load from local file first
    if (availableBgs.length > 0) {
      try {
        const selectedBgIndex = bgIndex < availableBgs.length && bgIndex >= 0 ? bgIndex : 0;
        const bgPath = availableBgs[selectedBgIndex];
        if (fs.existsSync(bgPath)) {
          bgImg = await Canvas.loadImage(bgPath);
        }
      } catch (e) {
        console.error("Lỗi tải background local:", e);
      }
    }

    // Draw background
    if (bgImg) {
      // Scale and center background with blur effect
      const scale = Math.max(baseWidth / bgImg.width, canvasHeight / bgImg.height);
      const scaledWidth = bgImg.width * scale;
      const scaledHeight = bgImg.height * scale;
      const x = (baseWidth - scaledWidth) / 2;
      const y = (canvasHeight - scaledHeight) / 2;

      // Add dark overlay for better text visibility
      ctx.drawImage(bgImg, x, y, scaledWidth, scaledHeight);

      // Add gradient overlay for depth
      const overlay = ctx.createLinearGradient(0, 0, 0, canvasHeight);
      overlay.addColorStop(0, "rgba(0,0,0,0.3)");
      overlay.addColorStop(0.5, "rgba(0,0,0,0.1)");
      overlay.addColorStop(1, "rgba(0,0,0,0.4)");
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, baseWidth, canvasHeight);
    } else {
      // Beautiful gradient fallback
      const gradient = ctx.createLinearGradient(0, 0, baseWidth, canvasHeight);
      gradient.addColorStop(0, "#1a1a2e");
      gradient.addColorStop(0.3, "#16213e");
      gradient.addColorStop(0.6, "#0f3460");
      gradient.addColorStop(1, "#533483");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, baseWidth, canvasHeight);

      // Add subtle pattern
      ctx.fillStyle = "rgba(255,255,255,0.02)";
      for (let i = 0; i < baseWidth; i += 100) {
        for (let j = 0; j < canvasHeight; j += 100) {
          ctx.fillRect(i, j, 50, 50);
        }
      }
    }

    // --- Layout helpers (no panels) ---
    const gridY = headerHeight + 26;
    const rowGapBase = basePadding; // will be refined per-row later
    const fullRowWidth = columns * (avatarSize + rowGapBase) - rowGapBase;
    const gridX = Math.max(0, Math.floor((baseWidth - fullRowWidth) / 2) - rowGapBase * 2);
    void gridX;
    void gridY;



    let title = name as string;
    if (args.length > 2) {
      const specialParams = ["columns", "bg"];
      const titleParts: string[] = [];
      let skipNext = false;

      for (let i = 2; i < args.length; i++) {
        if (skipNext) {
          skipNext = false;
          continue;
        }

        const currentArg = args[i];
        if (currentArg && specialParams.includes(currentArg.toLowerCase()) && i < args.length - 1) {
          skipNext = true;
          continue;
        }

        if (currentArg) {
          titleParts.push(currentArg);
        }
      }

      if (titleParts.length > 0) {
        title = titleParts.join(" ");
      }
    }

    // Load frames từ local (không tự tải URL nữa)
    let khungAvt: any;
    let khungAvtbox: any;
    const frameDir = storagePath("image", "taoanhbox");
    await fs.ensureDir(frameDir);

    try {
      const frame1Path = path.join(frameDir, "khung_avt.png");
      const frame2Path = path.join(frameDir, "khung_avtbox.png");

      if (fs.existsSync(frame1Path) && fs.statSync(frame1Path).size > 0) {
        khungAvt = await Canvas.loadImage(frame1Path);
      } else {
        console.warn(`⚠️ Thiếu khung local: ${frame1Path} (sẽ bỏ qua khung này)`);
      }

      if (fs.existsSync(frame2Path) && fs.statSync(frame2Path).size > 0) {
        khungAvtbox = await Canvas.loadImage(frame2Path);
      } else {
        console.warn(`⚠️ Thiếu khung local: ${frame2Path} (sẽ bỏ qua khung này)`);
      }
    } catch (e) {
      console.error("Lỗi tải khung avatar:", e);
    }

    const groupAvatarSize = Math.min(avatarSize, 250);
    const groupAvatarY = 42;
    const centerX = (baseWidth - groupAvatarSize) / 2;
    let avatarDrawn = false;


    const drawGroupAvatar = async (avatarUrl: string): Promise<boolean> => {
      try {
        const boxAvatar = await axios.get(avatarUrl, {
          responseType: "arraybuffer",
          timeout: 10000
        });

        const boxAvatarImg = await circle(boxAvatar.data);
        const boxAvatarLoad = await Canvas.loadImage(boxAvatarImg);

        // Soft shadow behind group avatar
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.35)";
        ctx.shadowBlur = 18;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 10;
        ctx.drawImage(
          boxAvatarLoad,
          centerX,
          groupAvatarY,
          groupAvatarSize,
          groupAvatarSize
        );
        ctx.restore();

        // Ring
        ctx.save();
        const cx = centerX + groupAvatarSize / 2;
        const cy = groupAvatarY + groupAvatarSize / 2;
        const ring = ctx.createLinearGradient(cx - groupAvatarSize / 2, cy, cx + groupAvatarSize / 2, cy);
        ring.addColorStop(0, "rgba(255,255,255,0.55)");
        ring.addColorStop(1, "rgba(255,255,255,0.18)");
        ctx.beginPath();
        ctx.arc(cx, cy, groupAvatarSize / 2 + 4, 0, Math.PI * 2);
        ctx.lineWidth = 6;
        ctx.strokeStyle = ring;
        ctx.stroke();
        ctx.restore();


        if (khungAvt) {
          ctx.drawImage(
            khungAvt,
            centerX,
            groupAvatarY,
            groupAvatarSize,
            groupAvatarSize
          );
        }
        return true;
      } catch (e: any) {
        console.error(`Lỗi khi vẽ avatar từ URL ${avatarUrl}:`, e.message || e);
        return false;
      }
    };


    if (imageSrc) {
      avatarDrawn = await drawGroupAvatar(imageSrc);
    }


    if (!avatarDrawn) {
      try {
        const threadPicture = await client.getThreadPicture(threadID);
        if (threadPicture) {
          avatarDrawn = await drawGroupAvatar(threadPicture);
        }
      } catch (e: any) {
        console.error("Không thể lấy avatar nhóm từ getThreadPicture:", e.message || e);
      }
    }


    if (!avatarDrawn) {
      console.warn("⚠️ Không thể vẽ avatar nhóm, sẽ bỏ qua phần này");
    }

    const safeTitle = (() => {
      try {
        return decodeURIComponent(title);
      } catch {
        return title;
      }
    })();

    // Nếu title có ký tự "đặc biệt" (emoji/ký tự symbol lạ), tránh dùng font custom để khỏi lỗi/ugly output.
    // Allow: chữ (mọi ngôn ngữ), số, khoảng trắng, dấu câu. Anything else -> fallback.
    const titleHasSpecialChars = /[^\p{L}\p{N}\p{Zs}\p{P}]/u.test(safeTitle);
    const titleFontFamily = !titleHasSpecialChars ? fontFamilyName : "Sans";
    const titleFontFamilyCss =
      titleFontFamily.includes(" ") ? `"${titleFontFamily}"` : titleFontFamily;

    const fontSize = Math.min(100, groupAvatarSize / 2.5);


    // NOTE: Tránh set "bold" trong ctx.font vì có thể gây warning "couldn't load font ... Bold ..."
    // Nếu font file là Bold sẵn thì vẫn sẽ hiển thị dày; nếu không, phần stroke/glow bên dưới sẽ bù.
    ctx.font = `${fontSize}px ${titleFontFamilyCss}`;
    ctx.textAlign = "center";

    const textY = groupAvatarY + groupAvatarSize + 96;
    const textWidth = ctx.measureText(safeTitle).width;

    const gradientStyles = [
      {
        colors: [
          { pos: 0, color: "#990033" },
          { pos: 0.3, color: "#663399" },
          { pos: 0.7, color: "#003366" },
          { pos: 1, color: "#660033" },
        ],
        glowColors: [
          "rgba(255,255,255,0.2)",
          "rgba(255,255,255,0.3)",
          "rgba(255,235,180,0.4)",
          "rgba(255,240,200,0.5)",
          "rgba(255,250,220,0.6)",
        ],
        strokeColor: "#FFFFCC",
      },
      {
        colors: [
          { pos: 0, color: "#663300" },
          { pos: 0.3, color: "#996633" },
          { pos: 0.5, color: "#CC9966" },
          { pos: 0.7, color: "#996633" },
          { pos: 1, color: "#663300" },
        ],
        glowColors: [
          "rgba(255,215,0,0.2)",
          "rgba(255,215,0,0.3)",
          "rgba(255,223,0,0.4)",
          "rgba(255,215,0,0.5)",
          "rgba(255,215,0,0.6)",
        ],
        strokeColor: "#FFDF00",
      },
      {
        colors: [
          { pos: 0, color: "#002233" },
          { pos: 0.3, color: "#004466" },
          { pos: 0.5, color: "#006699" },
          { pos: 0.7, color: "#004466" },
          { pos: 1, color: "#002233" },
        ],
        glowColors: [
          "rgba(200,220,255,0.2)",
          "rgba(200,220,255,0.3)",
          "rgba(220,235,255,0.4)",
          "rgba(230,240,255,0.5)",
          "rgba(240,250,255,0.6)",
        ],
        strokeColor: "#B0C4DE",
      },
      {
        colors: [
          { pos: 0, color: "#330033" },
          { pos: 0.3, color: "#660066" },
          { pos: 0.5, color: "#993399" },
          { pos: 0.7, color: "#660066" },
          { pos: 1, color: "#330033" },
        ],
        glowColors: [
          "rgba(255,100,255,0.2)",
          "rgba(255,100,255,0.3)",
          "rgba(255,120,255,0.4)",
          "rgba(255,140,255,0.5)",
          "rgba(255,160,255,0.6)",
        ],
        strokeColor: "#FF80FF",
      },
      {
        colors: [
          { pos: 0, color: "#330000" },
          { pos: 0.3, color: "#660000" },
          { pos: 0.5, color: "#993300" },
          { pos: 0.7, color: "#CC6600" },
          { pos: 1, color: "#FFCC00" },
        ],
        glowColors: [
          "rgba(255,150,0,0.2)",
          "rgba(255,120,0,0.3)",
          "rgba(255,80,0,0.4)",
          "rgba(255,50,0,0.5)",
          "rgba(255,30,0,0.6)",
        ],
        strokeColor: "#FFCC00",
      },
    ];

    const selectedStyle =
      gradientStyles[Math.floor(Math.random() * gradientStyles.length)];

    if (!selectedStyle) {
      return client.sendMessage("❌ Lỗi: Không thể tạo style cho text", threadID, messageID);
    }

    const textGradient = ctx.createLinearGradient(
      (baseWidth - textWidth) / 2,
      textY,
      (baseWidth + textWidth) / 2,
      textY
    );

    selectedStyle.colors.forEach(c => {
      textGradient.addColorStop(c.pos, c.color);
    });

    // Enhanced text rendering with better glow and shadow
    const glowSize = 20;
    const glowSteps = 8;
    const glowColors = selectedStyle.glowColors;

    // Draw multiple glow layers for depth
    for (let i = 0; i < glowSteps; i++) {
      const size = (glowSize * (i + 1)) / glowSteps;
      const glowColor = glowColors[Math.min(i, glowColors.length - 1)];
      if (!glowColor) continue;

      ctx.shadowColor = glowColor;
      ctx.shadowBlur = size * 1.5;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = Math.max(2, size / 2);
      ctx.strokeText(safeTitle, baseWidth / 2, textY);
    }

    // Reset shadow
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // Outer stroke
    ctx.strokeStyle = selectedStyle.strokeColor;
    ctx.lineWidth = 6;
    ctx.strokeText(safeTitle, baseWidth / 2, textY);

    // Inner stroke for definition
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 2;
    ctx.strokeText(safeTitle, baseWidth / 2, textY);

    // Fill with gradient
    ctx.fillStyle = textGradient;
    ctx.fillText(safeTitle, baseWidth / 2, textY);

    // Parallel avatar loading function
    const loadAvatar = async (user: any): Promise<{ buffer: Buffer; user: any } | null> => {
      try {
        let avatarData;
        try {
          avatarData = await axios.get(user.thumbSrc, {
            responseType: "arraybuffer",
            timeout: 5000,
          });
        } catch (e) {
          avatarData = await axios.get(
            `https://graph.facebook.com/${user.id}/picture?height=720&width=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
            { responseType: "arraybuffer", timeout: 5000 }
          );
        }
        const avatarBuffer = await circle(avatarData.data, user.id);
        return { buffer: avatarBuffer, user };
      } catch (e) {
        console.error(`Lỗi khi tải avatar ${user.id}:`, e);
        return null;
      }
    };

    // Load all avatars in parallel (batched for performance)
    const batchSize = 15;
    const avatarMap = new Map<string, Buffer>();

    // Load admin avatars
    for (let i = 0; i < adminUsers.length; i += batchSize) {
      const batch = adminUsers.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(loadAvatar));
      for (const result of results) {
        if (result) {
          avatarMap.set(result.user.id, result.buffer);
        }
      }
    }

    // Load normal user avatars
    for (let i = 0; i < normalUsers.length; i += batchSize) {
      const batch = normalUsers.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(loadAvatar));
      for (const result of results) {
        if (result) {
          avatarMap.set(result.user.id, result.buffer);
        }
      }
    }

    // Draw all avatars
    // Khoảng cách giữa title và hàng avatar đầu tiên (tránh bị "sát" như ảnh bạn gửi)
    const gridTopGap = 90;
    let currentY = Math.max(headerHeight + 52, textY + gridTopGap);
    let membersDrawn = 0;

    // Draw admin avatars
    if (adminUsers.length > 0) {
      let adminRow = 0;
      let adminCol = 0;

      for (const adminUser of adminUsers) {
        const avatarBuffer = avatarMap.get(adminUser.id);
        if (!avatarBuffer) continue;

        try {
          const rowWidth = Math.min(adminUsers.length - adminRow * columns, columns);
          const paddingForRow = Math.min(basePadding, (baseWidth / columns) * 0.05);
          const avatarWidthWithPadding = avatarSize + paddingForRow;
          const startX = (baseWidth - (rowWidth * avatarWidthWithPadding - paddingForRow)) / 2;
          const currentX = startX + adminCol * avatarWidthWithPadding;

          const avatarLoad = await Canvas.loadImage(avatarBuffer);

          // Admin avatar: stronger shadow + premium ring + badge
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,0.34)";
          ctx.shadowBlur = 10;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 5;
          ctx.drawImage(avatarLoad, currentX, currentY, avatarSize, avatarSize);
          ctx.restore();

          // ring
          ctx.save();
          const cx = currentX + avatarSize / 2;
          const cy = currentY + avatarSize / 2;
          const ring = ctx.createLinearGradient(cx - avatarSize / 2, cy, cx + avatarSize / 2, cy);
          ring.addColorStop(0, "rgba(255, 215, 0, 0.95)");
          ring.addColorStop(0.55, "rgba(255, 120, 0, 0.85)");
          ring.addColorStop(1, "rgba(255, 60, 180, 0.85)");
          ctx.beginPath();
          ctx.arc(cx, cy, avatarSize / 2 + 3, 0, Math.PI * 2);
          ctx.lineWidth = 6;
          ctx.strokeStyle = ring;
          ctx.stroke();
          ctx.restore();

          if (khungAvtbox) {
            ctx.drawImage(khungAvtbox, currentX, currentY, avatarSize, avatarSize);
          }

          adminCol++;
          if (adminCol >= columns) {
            adminCol = 0;
            adminRow++;
            currentY += avatarSize + paddingForRow;
          }

          membersDrawn++;
        } catch (e) {
          console.error(`Lỗi khi vẽ admin ${adminUser.id}:`, e);
          continue;
        }
      }

      if (adminCol > 0) {
        currentY += avatarSize + basePadding;
      }
      currentY += padding;
    }

    // Draw normal user avatars
    let normalRow = 0;
    let normalCol = 0;

    for (const user of normalUsers) {
      const avatarBuffer = avatarMap.get(user.id);
      if (!avatarBuffer) continue;

      try {
        const rowWidth = Math.min(normalUsers.length - normalRow * columns, columns);
        const paddingForRow = Math.min(basePadding, (baseWidth / columns) * 0.05);
        const avatarWidthWithPadding = avatarSize + paddingForRow;
        const startX = (baseWidth - (rowWidth * avatarWidthWithPadding - paddingForRow)) / 2;
        const currentX = startX + normalCol * avatarWidthWithPadding;

        const avatarLoad = await Canvas.loadImage(avatarBuffer);

        // Normal avatar: cleaner shadow + soft ring
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.22)";
        ctx.shadowBlur = 7;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4;
        ctx.drawImage(avatarLoad, currentX, currentY, avatarSize, avatarSize);
        ctx.restore();

        ctx.save();
        const cx = currentX + avatarSize / 2;
        const cy = currentY + avatarSize / 2;
        const ring = ctx.createLinearGradient(cx - avatarSize / 2, cy, cx + avatarSize / 2, cy);
        ring.addColorStop(0, "rgba(255,255,255,0.42)");
        ring.addColorStop(1, "rgba(255,255,255,0.14)");
        ctx.beginPath();
        ctx.arc(cx, cy, avatarSize / 2 + 2, 0, Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = ring;
        ctx.stroke();
        ctx.restore();

        normalCol++;
        if (normalCol >= columns) {
          normalCol = 0;
          normalRow++;
          currentY += avatarSize + paddingForRow;
        }

        membersDrawn++;
      } catch (e) {
        console.error(`Lỗi khi vẽ user ${user.id}:`, e);
        continue;
      }
    }

    console.log(
      `Canvas size: ${canvas.width} x ${canvas.height}, Last Y position: ${currentY}`
    );


    const buffer = canvas.toBuffer("image/png");
    const fileSizeMB = (buffer.length / (1024 * 1024)).toFixed(2);

    console.log(`📊 Kích thước ảnh: ${buffer.length} bytes (${fileSizeMB} MB)`);
    console.log(`📐 Kích thước canvas: ${canvas.width} x ${canvas.height}px`);


    if (buffer.length === 0) {
      return client.sendMessage(
        "❌ Lỗi: Buffer ảnh rỗng",
        threadID,
        messageID
      );
    }


    const tempDir = path.join(process.cwd(), "src/temp");
    await fs.ensureDir(tempDir);
    const pathAVT = path.join(tempDir, `${Date.now() + 10000}.png`);

    try {
      fs.writeFileSync(pathAVT, buffer);
      console.log(`💾 Đã lưu file tạm: ${pathAVT}`);
    } catch (e: any) {
      console.error(`❌ Không thể lưu file tạm: ${e.message || e}`);
      return client.sendMessage(
        `❌ Lỗi: Không thể lưu file ảnh: ${e.message || e}`,
        threadID,
        messageID
      );
    }


    if (!fs.existsSync(pathAVT)) {
      return client.sendMessage(
        "❌ Lỗi: File ảnh không tồn tại sau khi ghi",
        threadID,
        messageID
      );
    }

    const fileStats = fs.statSync(pathAVT);
    if (fileStats.size === 0) {
      fs.unlinkSync(pathAVT);
      return client.sendMessage(
        "❌ Lỗi: File ảnh rỗng",
        threadID,
        messageID
      );
    }

    const safeUnlink = (filePath: string) => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e: any) {
        console.error(`Lỗi khi xóa file temp: ${e.message || e}`);
      }
    };

    try {


      return client.sendMessage(
        {
          body:
            `🍗 Hoàn thành: ${membersDrawn}/${live.length} thành viên\n` +
            `🔒 Bỏ qua: ${(userInfo as any[]).length - live.length
            } tài khoản bị khóa\n` +
            `🍠 Kích thước avatar: ${avatarSize}px\n` +
            `🌈 Số cột: ${columns}\n` +
            `📊 Kích thước file: ${fileSizeMB} MB`,
          attachment: {
            path: pathAVT,
            filename: `taoanhbox_${Date.now()}.png`,
          },
        },
        threadID,
        (error: any) => {
          if (error) {
            console.error("Lỗi khi gửi message:", error);
            return client.sendMessage(
              `❌ Đã xảy ra lỗi khi gửi ảnh: ${error.message || error}`,
              threadID,
              () => safeUnlink(pathAVT),
              messageID
            );
          }
          safeUnlink(pathAVT);
        },
        messageID
      );
    } catch (sendError: any) {
      safeUnlink(pathAVT);
      return client.sendMessage(
        `❌ Không gửi được ảnh: ${sendError.message || sendError}`,
        threadID,
        messageID
      );
    }
  },
};

export default command;
