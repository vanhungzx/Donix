"use strict";

import type { Command, CommandOnCallContext } from "@types";
import { createCanvas, loadImage, registerFont } from "canvas";
import fs from "fs";
import path from "path";

const DEFAULT_RULES_TITLE = "QUY TẮC NHÓM";

async function ensureLocalFont({
  fontName,
  cssFamily,
  fontDir = path.join(process.cwd(), "core", "assets", "font"),
}: {
  fontName?: string | null;
  cssFamily: string;
  fontDir?: string;
}): Promise<void> {
  if (!fs.existsSync(fontDir)) return;

  const fontFiles = fs
    .readdirSync(fontDir)
    .filter((f: string) => f.toLowerCase().endsWith(".ttf"));

  const registerFontWithWeights = (fontPath: string, family: string): boolean => {
    if (!fs.existsSync(fontPath)) return false;

    const weights = ["normal", "400", "500", "600", "700", "bold", "800", "900"];
    let registered = false;
    for (const weight of weights) {
      try {
        registerFont(fontPath, { family, weight });
        registered = true;
      } catch {
        
      }
    }
    if (!registered) {
      try {
        registerFont(fontPath, { family });
        registered = true;
      } catch (e: any) {
        console.error(`Failed to register font ${fontPath}:`, e.message);
      }
    }
    return registered;
  };

  if (fontName) {
    const fontFile = fontFiles.find((f: string) =>
      f.toLowerCase().includes(fontName.toLowerCase())
    );
    if (fontFile) {
      const fontPath = path.join(fontDir, fontFile);
      if (registerFontWithWeights(fontPath, cssFamily)) {
        return;
      }
    }
  }

  const preferredFonts = ["TUVBenchmark.ttf", "Play-Bold.ttf"];
  for (const pref of preferredFonts) {
    const fontFile = fontFiles.find((f: string) => f === pref);
    if (fontFile) {
      const fontPath = path.join(fontDir, fontFile);
      if (registerFontWithWeights(fontPath, cssFamily)) {
        return;
      }
    }
  }

  if (fontFiles.length > 0) {
    const firstFontFile = fontFiles[0]!;
    const fontPath = path.join(fontDir, firstFontFile);
    registerFontWithWeights(fontPath, cssFamily);
  }
}

function rrect(
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: any, text: string, maxW: number, font: string): string[] {
  ctx.font = font;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width <= maxW) line = t;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function splitColumns(
  ctx: any,
  items: string[],
  colW: number,
  cssFamily: string
): {
  left: { main: boolean; text: string; cost: number }[];
  right: { main: boolean; text: string; cost: number }[];
} {
  const m = items.map((s: string) => {
    const main = /^\d+\./.test(s.trim());
    const text = s.replace(/^\d+\.\s*/, "");
    const font = main
      ? `bold 26px ${cssFamily}, "Courier New", Consolas, Monaco, monospace`
      : `normal 24px ${cssFamily}, "Courier New", Consolas, Monaco, monospace`;
    const lines = wrap(ctx, text, colW - (main ? 48 : 36), font);
    return { main, text, cost: lines.length };
  });
  const total = m.reduce((a, b) => a + b.cost, 0);
  const target = Math.ceil(total / 2);
  const left: { main: boolean; text: string; cost: number }[] = [];
  const right: { main: boolean; text: string; cost: number }[] = [];
  let acc = 0;
  for (const it of m) {
    if (acc < target) {
      left.push(it);
      acc += it.cost;
    } else right.push(it);
  }
  return { left, right };
}

function drawAccentBackground(ctx: any, width: number, height: number): void {
  const g1 = ctx.createLinearGradient(0, 0, 0, height);
  g1.addColorStop(0, "#0b1220");
  g1.addColorStop(1, "#0a0e19");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, width, height);
  const rg = ctx.createRadialGradient(
    width * 0.15,
    height * 0.2,
    20,
    width * 0.15,
    height * 0.2,
    Math.max(width, height) * 0.7
  );
  rg.addColorStop(0, "rgba(14,165,233,0.20)");
  rg.addColorStop(0.6, "rgba(99,102,241,0.08)");
  rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, width, height);
}

function drawChip(
  ctx: any,
  x: number,
  y: number,
  text: string,
  cssFamily: string
): { w: number; h: number } {
  const padX = 14;
  const padY = 10;
  ctx.font = `bold 18px ${cssFamily}, "Courier New", Consolas, Monaco, monospace`;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 36;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(14,165,233,0.12)";
  rrect(ctx, x, y, w, h, 999);
  ctx.fill();
  ctx.strokeStyle = "rgba(14,165,233,0.25)";
  ctx.lineWidth = 1.5;
  rrect(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 999);
  ctx.stroke();
  ctx.fillStyle = "rgba(186,230,253,0.95)";
  ctx.fillText(text, x + padX, y + h - padY);
  ctx.restore();
  return { w, h };
}

function drawRich(
  ctx: any,
  text: string,
  x: number,
  y: number,
  maxW: number,
  main: boolean,
  cssFamily: string
): number {
  const font = main
    ? `bold 26px ${cssFamily}, "Courier New", Consolas, Monaco, monospace`
    : `normal 24px ${cssFamily}, "Courier New", Consolas, Monaco, monospace`;
  const lines = wrap(ctx, text, maxW, font);
  ctx.font = font;
  const lineHeight = main ? 36 : 32;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    ctx.fillStyle = "rgba(248,250,252,0.92)";
    ctx.fillText(ln, x, y + i * lineHeight);
  }
  return lines.length * lineHeight;
}

function getTitleFontSize(
  ctx: any,
  title: string,
  maxWidth: number,
  cssFamily: string,
  minSize = 32,
  maxSize = 56
): number {
  let fontSize = maxSize;
  let width = 0;

  do {
    ctx.font = `bold ${fontSize}px ${cssFamily}, "Courier New", Consolas, Monaco, monospace`;
    width = ctx.measureText(title).width;
    if (width <= maxWidth || fontSize <= minSize) break;
    fontSize -= 2;
  } while (fontSize > minSize && width > maxWidth);

  return Math.max(fontSize, minSize);
}

function drawTitle(
  ctx: any,
  title: string,
  x: number,
  y: number,
  maxWidth: number,
  cssFamily: string
): number {
  const actualMaxWidth = Math.max(maxWidth - 32, 200);
  const fontSize = getTitleFontSize(ctx, title, actualMaxWidth, cssFamily);
  ctx.font = `bold ${fontSize}px ${cssFamily}, "Courier New", Consolas, Monaco, monospace`;
  const textWidth = ctx.measureText(title).width;
  const finalMaxWidth = Math.min(actualMaxWidth, textWidth);
  const gradTitle = ctx.createLinearGradient(x, 0, x + finalMaxWidth, 0);
  gradTitle.addColorStop(0, "#38bdf8");
  gradTitle.addColorStop(1, "#818cf8");
  ctx.fillStyle = gradTitle;

  if (textWidth > actualMaxWidth) {
    let displayTitle = title;
    while (
      ctx.measureText(displayTitle + "...").width > actualMaxWidth &&
      displayTitle.length > 0
    ) {
      displayTitle = displayTitle.slice(0, -1);
    }
    if (displayTitle.length < title.length) {
      displayTitle += "...";
    }
    ctx.fillText(displayTitle, x, y);
  } else {
    ctx.fillText(title, x, y);
  }

  return fontSize;
}

interface RenderTailwindRulesOptions {
  width?: number;
  height?: number;
  background?: string | null;
  out?: string;
  fontDir?: string;
  title?: string;
  subtitle?: string;
  chipText?: string;
  rules?: string[];
  fontName?: string | null;
  cssFamily?: string;
}

async function renderTailwindRules({
  width = 1280,
  height = 768,
  background = null,
  out = "rules_tailwind.png",
  fontDir = path.join(process.cwd(), "core", "assets", "font"),
  title = "LUẬT NHÓM",
  subtitle = "Áp dụng cho toàn bộ thành viên",
  chipText = "Cập nhật",
  rules = [],
  fontName = null,
  cssFamily = "monospace",
}: RenderTailwindRulesOptions = {}): Promise<string> {
  await ensureLocalFont({ fontName, cssFamily, fontDir });

  const tempCanvas = createCanvas(width, height);
  const tempCtx: any = tempCanvas.getContext("2d");

  const pad = 64;
  const inner = 40;
  const contentW = width - pad * 2 - inner * 2;
  const gap = 56;
  const colW = Math.floor((contentW - gap) / 2);

  tempCtx.font = `bold 18px ${cssFamily}, "Courier New", Consolas, Monaco, monospace`;
  const calcChipTextWidth = tempCtx.measureText(chipText).width;
  const calcChipWidth = calcChipTextWidth + 28 + 20;

  const titleMaxWidth = width - pad * 2 - 32 - calcChipWidth - 20 - 32;
  const titleFontSize = getTitleFontSize(tempCtx, title, titleMaxWidth, cssFamily);

  const headerHeight = 44 + titleFontSize + 8 + 36 + 24 + 1 + 20;
  const footerHeight = 100;

  tempCtx.font = `bold 26px ${cssFamily}, "Courier New", Consolas, Monaco, monospace`;
  const { left, right } = splitColumns(tempCtx, rules, colW, cssFamily);

  let leftHeight = 0;
  for (const it of left) {
    const text = it.text;
    const font = it.main
      ? `bold 26px ${cssFamily}, "Courier New", Consolas, Monaco, monospace`
      : `normal 24px ${cssFamily}, "Courier New", Consolas, Monaco, monospace`;
    tempCtx.font = font;
    const lines = wrap(tempCtx, text, colW - (it.main ? 48 : 36), font);
    leftHeight += lines.length * (it.main ? 36 : 32) + 6;
  }

  let rightHeight = 0;
  for (const it of right) {
    const text = it.text;
    const font = it.main
      ? `bold 26px ${cssFamily}, "Courier New", Consolas, Monaco, monospace`
      : `normal 24px ${cssFamily}, "Courier New", Consolas, Monaco, monospace`;
    tempCtx.font = font;
    const lines = wrap(tempCtx, text, colW - (it.main ? 48 : 36), font);
    rightHeight += lines.length * (it.main ? 36 : 32) + 6;
  }

  const contentHeight = Math.max(leftHeight, rightHeight);
  const calculatedHeight = pad * 2 + headerHeight + contentHeight + footerHeight;
  const finalHeight = Math.max(height, calculatedHeight + 40);

  const canvas = createCanvas(width, finalHeight);
  const ctx: any = canvas.getContext("2d");

  if (background) {
    try {
      const bg = await loadImage(background);
      ctx.drawImage(bg, 0, 0, width, finalHeight);
    } catch {
      drawAccentBackground(ctx, width, finalHeight);
    }
  } else {
    drawAccentBackground(ctx, width, finalHeight);
  }

  const panel = {
    x: pad,
    y: pad,
    w: width - pad * 2,
    h: finalHeight - pad * 2,
    r: 32,
  };

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 28;
  ctx.fillStyle = "rgba(17,24,39,0.75)";
  rrect(ctx, panel.x, panel.y, panel.w, panel.h, panel.r);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  rrect(ctx, panel.x + 1, panel.y + 1, panel.w - 2, panel.h - 2, panel.r - 2);
  ctx.stroke();

  ctx.font = `bold 14px ${cssFamily}, "Courier New", Consolas, Monaco, monospace`;
  ctx.fillStyle = "rgba(186,230,253,0.85)";
  ctx.fillText("RULES", panel.x + 32, panel.y + 44);

  const titleX = panel.x + 32;
  const titleY = panel.y + 96;
  const titleMaxW = panel.w - 32 - calcChipWidth - 20 - 32;
  const actualTitleSize = drawTitle(ctx, title, titleX, titleY, titleMaxW, cssFamily);

  const subtitleY = titleY + actualTitleSize + 8;
  ctx.font = `normal 22px ${cssFamily}, "Courier New", Consolas, Monaco, monospace`;
  ctx.fillStyle = "rgba(203,213,225,0.9)";
  ctx.fillText(subtitle, panel.x + 32, subtitleY);

  drawChip(
    ctx,
    panel.x + panel.w - calcChipWidth,
    panel.y + 36,
    chipText,
    cssFamily
  );

  const dividerY = subtitleY + 24;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(panel.x + 24, dividerY);
  ctx.lineTo(panel.x + panel.w - 24, dividerY);
  ctx.stroke();

  const top = dividerY + 20;
  const leftX = panel.x + inner;
  const rightX = leftX + colW + gap;
  const splitResult = splitColumns(ctx, rules, colW, cssFamily);
  const leftCol = splitResult.left;
  const rightCol = splitResult.right;

  let ly = top;
  for (const it of leftCol) {
    const textX = leftX;
    ly += drawRich(ctx, it.text, textX, ly, colW, it.main, cssFamily);
    ly += 6;
  }

  let ry = top;
  for (const it of rightCol) {
    const textX = rightX;
    ry += drawRich(ctx, it.text, textX, ry, colW, it.main, cssFamily);
    ry += 6;
  }

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(panel.x + 24, panel.y + panel.h - 64);
  ctx.lineTo(panel.x + panel.w - 24, panel.y + panel.h - 64);
  ctx.stroke();

  ctx.font = `normal 18px ${cssFamily}, "Courier New", Consolas, Monaco, monospace`;
  ctx.fillStyle = "rgba(203,213,225,0.85)";
  ctx.fillText(
    "Giữ thái độ tôn trọng • Không spam • Cùng xây box văn minh",
    panel.x + 32,
    panel.y + panel.h - 28
  );

  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  return out;
}

const ruleCommand: Command = {
  name: "rule",
  alias: ["luat", "luật"],
  version: "1.5.2",
  role: 0,
  desc: "Thiết lập và xem quy tắc nhóm",
  guide: `1) {pn} add <nội dung hoặc khối nhiều dòng>

• Dòng đầu (nếu không ở dạng "1. ...") sẽ là tiêu đề
• Các quy tắc dạng:
  1. ...
  2. ...
• Reply 1 ảnh: nếu nhiều quy tắc -> ảnh tiêu đề; nếu 1 quy tắc -> gắn ảnh cho quy tắc


2) {pn} del <số>
3) {pn} edit <số> <nội dung mới> (có thể reply ảnh)
4) {pn} list
5) {pn} clear
6) {pn} notify on|off
7) {pn} canvas on|off - Bật/tắt chế độ render ảnh canvas`,
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { client, event, reply, threadData, args, utils } = ctx as any;

    const action = (args[0] || "").toLowerCase();
    const threadID = event.threadID;
    let data = (await threadData.get(threadID)) || {};
    data.settings = data.settings || {};
    data.settings.rules = Array.isArray(data.settings.rules)
      ? data.settings.rules
      : [];
    data.settings.ruleImages = Array.isArray(data.settings.ruleImages)
      ? data.settings.ruleImages
      : [];
    if (typeof data.settings.rulesNotify === "undefined")
      data.settings.rulesNotify = true;
    if (typeof data.settings.rulesTitle === "undefined")
      data.settings.rulesTitle = "";
    if (typeof data.settings.rulesCover === "undefined")
      data.settings.rulesCover = null;
    if (typeof data.settings.rulesCanvasMode === "undefined")
      data.settings.rulesCanvasMode = false;

    const imgFromReply = (): string | null =>
      event.messageReply?.attachments?.[0]?.url || null;

    const parseTitleAndRules = (
      raw: string
    ): {
      title: string;
      rules: string[];
    } => {
      const text = String(raw || "").replace(/\r/g, "");
      let lines = text.split("\n").map((x: string) => x.replace(/\s+$/g, ""));
      while (lines.length && !(lines[0] ?? "").trim()) lines.shift();
      while (lines.length && !(lines[lines.length - 1] ?? "").trim())
        lines.pop();
      if (!lines.length) return { title: "", rules: [] };
      const numberRe = /^\s*\d+[\.\)]\s*/;
      const first = lines[0] || "";
      const hasNumberedFirst = numberRe.test(first);
      let title = hasNumberedFirst ? "" : first.trim();
      const startIdx = hasNumberedFirst ? 0 : 1;
      const numbered = lines.slice(startIdx);
      let rules: string[] = [];
      let cur: string[] = [];
      for (const ln of numbered) {
        if (numberRe.test(ln)) {
          if (cur.length) rules.push(cur.join("\n").trim());
          cur = [ln.replace(numberRe, "")];
        } else {
          if (!cur.length) cur = [ln];
          else cur.push(ln);
        }
      }
      if (cur.length) rules.push(cur.join("\n").trim());
      if (!rules.length && title && !hasNumberedFirst) {
        rules = [title];
        title = "";
      }
      return { title, rules };
    };

    const buildAllRulesBody = (settings: any): string => {
      const hasRules =
        Array.isArray(settings.rules) && settings.rules.length > 0;
      const header =
        settings.rulesTitle === ""
          ? DEFAULT_RULES_TITLE
          : settings.rulesTitle || DEFAULT_RULES_TITLE;
      let body = header;
      if (hasRules) {
        const parts = settings.rules.map(
          (r: string, i: number) => `${i + 1}. ${r}`
        );
        body += "\n" + parts.join("\n\n");
      }
      return body.trim();
    };

    const sendAllRulesOnce = async (settings: any): Promise<void> => {
      if (!settings?.rules?.length && !settings?.rulesTitle) return;
      if (settings.rulesTitle === "") {
        settings.rulesTitle = DEFAULT_RULES_TITLE;
        await threadData.update(threadID, { settings });
      }

      if (settings.rulesCanvasMode) {
        try {
          const tempDir = path.join(process.cwd(), "temp");
          if (!fs.existsSync(tempDir))
            fs.mkdirSync(tempDir, { recursive: true });
          const outputPath = path.join(
            tempDir,
            `rules_${threadID}_${Date.now()}.png`
          );

          const title = settings.rulesTitle || DEFAULT_RULES_TITLE;
          const rulesList = settings.rules.map(
            (r: string, i: number) => `${i + 1}. ${r}`
          );

          await renderTailwindRules({
            title: title,
            subtitle: "Áp dụng cho toàn bộ thành viên",
            chipText: "Cập nhật",
            rules: rulesList,
            background: settings.rulesCover || null,
            out: outputPath,
            cssFamily: "monospace",
          });

          if (!fs.existsSync(outputPath)) {
            throw new Error("Canvas output file not created");
          }

          const attachment = fs.createReadStream(outputPath);
          await client.sendMessage({ attachment }, threadID);

          setTimeout(() => {
            try {
              if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            } catch {
              
            }
          }, 5000);
          return;
        } catch (err) {
          console.error("Canvas render error:", err);
        }
      }

      const body = buildAllRulesBody(settings);
      let attachment: any = null;
      if (settings.rulesCover) {
        try {
          attachment = await utils.stream(settings.rulesCover, "jpg");
        } catch {
          
        }
      }
      try {
        if (attachment) {
          await client.sendMessage({ body, attachment }, threadID);
        } else {
          await client.sendMessage(body, threadID);
        }
      } catch {
        await client.sendMessage(body, threadID);
      }
    };

    switch (action) {
      case "add": {
        const body = event.body || "";
        const at = body.toLowerCase().indexOf("add");
        const bodyAfterCmd = at >= 0 ? body.slice(at + 3).trim() : "";
        const raw =
          bodyAfterCmd ||
          event.messageReply?.body ||
          args.slice(1).join(" ") ||
          "";
        if (!raw) {
          await reply("⚠️ Vui lòng nhập nội dung cần thêm.");
          return;
        }
        const img = imgFromReply();
        const { title, rules } = parseTitleAndRules(raw);

        if (title) data.settings.rulesTitle = title;
        if (!title && !data.settings.rulesTitle && rules.length)
          data.settings.rulesTitle = DEFAULT_RULES_TITLE;

        if (rules.length <= 1) {
          const content = (rules[0] || raw).trim();
          if (!content) {
            await reply("⚠️ Nội dung trống.");
            return;
          }
          data.settings.rules.push(content);
          data.settings.ruleImages.push(img || null);
          if (img && data.settings.rules.length > 1)
            data.settings.rulesCover = img;
          await threadData.update(threadID, { settings: data.settings });
          await reply(
            `✅ Đã thêm quy tắc${img ? " kèm hình" : ""}:\n➕ ${content}`
          );
          return;
        }

        for (const r of rules) {
          data.settings.rules.push(r);
          data.settings.ruleImages.push(null);
        }
        if (img) data.settings.rulesCover = img;
        await threadData.update(threadID, { settings: data.settings });
        await reply(
          `✅ Đã thêm ${rules.length} quy tắc${title ? " và cập nhật tiêu đề" : ""
          }${img ? " (ảnh tiêu đề)" : ""}.`
        );
        return;
      }

      case "del": {
        const index = parseInt(args[1], 10) - 1;
        if (
          !Number.isInteger(index) ||
          index < 0 ||
          index >= data.settings.rules.length
        ) {
          await reply("⚠️ Số thứ tự không hợp lệ.");
          return;
        }
        const removed = data.settings.rules.splice(index, 1)[0];
        data.settings.ruleImages.splice(index, 1);
        await threadData.update(threadID, { settings: data.settings });
        await reply(`🗑️ Đã xóa:\n❌ ${removed}`);
        return;
      }

      case "edit": {
        const idx = parseInt(args[1], 10) - 1;
        const newContent = (
          args.slice(2).join(" ") ||
          event.messageReply?.body ||
          ""
        ).trim();
        if (
          !Number.isInteger(idx) ||
          idx < 0 ||
          idx >= data.settings.rules.length
        ) {
          await reply("⚠️ Số thứ tự cần sửa không hợp lệ.");
          return;
        }
        if (!newContent) {
          await reply("⚠️ Vui lòng nhập nội dung mới.");
          return;
        }
        const img = imgFromReply() || data.settings.ruleImages[idx] || null;
        const old = data.settings.rules[idx];
        data.settings.rules[idx] = newContent;
        data.settings.ruleImages[idx] = img;
        await threadData.update(threadID, { settings: data.settings });
        await reply(
          `✏️ Đã sửa quy tắc${img ? " kèm hình" : ""
          }:\nCũ: ${old}\nMới: ${newContent}`
        );
        return;
      }

      case "list": {
        const s = data.settings;
        if (!s.rules.length && !s.rulesTitle) {
          await reply("📭 Nhóm chưa có quy tắc nào.");
          return;
        }
        await sendAllRulesOnce(s);
        return;
      }

      case "clear": {
        if (
          !data.settings.rules.length &&
          !data.settings.rulesTitle &&
          !data.settings.rulesCover
        ) {
          await reply("📭 Không có gì để xóa.");
          return;
        }
        data.settings.rules = [];
        data.settings.ruleImages = [];
        data.settings.rulesTitle = "";
        data.settings.rulesCover = null;
        await threadData.update(threadID, { settings: data.settings });
        await reply("🧹 Đã xóa toàn bộ quy tắc và tiêu đề.");
        return;
      }

      case "notify":
      case "noti": {
        const opt = (args[1] || "").toLowerCase();
        if (opt === "on") {
          data.settings.rulesNotify = true;
          await threadData.update(threadID, { settings: data.settings });
          await reply("🔔 Đã bật thông báo quy tắc khi có TVM.");
          return;
        } else if (opt === "off") {
          data.settings.rulesNotify = false;
          await threadData.update(threadID, { settings: data.settings });
          await reply("🔕 Đã tắt thông báo quy tắc khi có TVM.");
          return;
        } else {
          await reply(
            `⚙️ Trạng thái: ${data.settings.rulesNotify ? "Bật 🔔" : "Tắt 🔕"
            }\nDùng: rule notify on/off`
          );
          return;
        }
      }

      case "canvas": {
        const opt = (args[1] || "").toLowerCase();
        if (opt === "on") {
          data.settings.rulesCanvasMode = true;
          await threadData.update(threadID, { settings: data.settings });
          await reply("🎨 Đã bật chế độ render canvas cho quy tắc.");
          return;
        } else if (opt === "off") {
          data.settings.rulesCanvasMode = false;
          await threadData.update(threadID, { settings: data.settings });
          await reply("📝 Đã tắt chế độ render canvas (chuyển về text).");
          return;
        } else {
          await reply(
            `⚙️ Trạng thái Canvas: ${data.settings.rulesCanvasMode ? "Bật 🎨" : "Tắt 📝"
            }\nDùng: rule canvas on/off`
          );
          return;
        }
      }

      default: {
        const store = (await threadData.get(threadID)) || {};
        const s = store.settings || {};
        if ((!s.rules || !s.rules.length) && !s.rulesTitle) {
          await reply("📭 Nhóm chưa có quy tắc nào.");
          return;
        }
        await sendAllRulesOnce(s);
        return;
      }
    }
  },

  
  async onEvent(ctx: any): Promise<void> {
    const { client, event, threadData, utils } = ctx;

    if (event.logMessageType !== "log:subscribe") return;
    const threadID = event.threadID;
    const store = (await threadData.get(threadID)) || {};
    const settings = store.settings || {};
    if (!settings?.rulesNotify) return;
    if (!settings?.rules?.length && !settings?.rulesTitle) return;

    const buildAllRulesBody = (): string => {
      const hasRules =
        Array.isArray(settings.rules) && settings.rules.length > 0;
      const header =
        settings.rulesTitle === ""
          ? DEFAULT_RULES_TITLE
          : settings.rulesTitle || DEFAULT_RULES_TITLE;
      let body = header;
      if (hasRules) {
        const parts = settings.rules.map(
          (r: string, i: number) => `${i + 1}. ${r}`
        );
        body += "\n" + parts.join("\n\n");
      }
      return body.trim();
    };

    const sendAllRulesOnce = async (): Promise<void> => {
      if (settings.rulesCanvasMode) {
        try {
          const tempDir = path.join(process.cwd(), "temp");
          if (!fs.existsSync(tempDir))
            fs.mkdirSync(tempDir, { recursive: true });
          const outputPath = path.join(
            tempDir,
            `rules_${threadID}_${Date.now()}.png`
          );

          const title = settings.rulesTitle || DEFAULT_RULES_TITLE;
          const rulesList = settings.rules.map(
            (r: string, i: number) => `${i + 1}. ${r}`
          );

          await renderTailwindRules({
            title: title,
            subtitle: "Áp dụng cho toàn bộ thành viên",
            chipText: "Cập nhật",
            rules: rulesList,
            background: settings.rulesCover || null,
            out: outputPath,
            cssFamily: "monospace",
          });

          if (!fs.existsSync(outputPath)) {
            throw new Error("Canvas output file not created");
          }

          const attachment = fs.createReadStream(outputPath);
          await client.sendMessage({ attachment }, threadID);

          setTimeout(() => {
            try {
              if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            } catch {
              
            }
          }, 5000);
          return;
        } catch (err) {
          console.error("Canvas render error:", err);
        }
      }

      const body = buildAllRulesBody();
      let attachment: any = null;
      if (settings.rulesCover) {
        try {
          attachment = await utils.stream(settings.rulesCover, "jpg");
        } catch {
          
        }
      }
      try {
        if (attachment) {
          await client.sendMessage({ body, attachment }, threadID);
        } else {
          await client.sendMessage(body, threadID);
        }
      } catch {
        await client.sendMessage(body, threadID);
      }
    };

    await sendAllRulesOnce();
  },
};

export default ruleCommand;
