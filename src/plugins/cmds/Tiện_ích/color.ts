"use strict";

import type { Command, CommandOnCallContext } from "@types";

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

function clamp(num: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num));
}

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): RGB | null {
  const cleaned = hex.trim().replace(/^#/, "");
  if (![3, 6].includes(cleaned.length) || !/^[0-9a-fA-F]+$/.test(cleaned)) return null;

  const normalized = cleaned.length === 3
    ? cleaned.split("").map((c) => c + c).join("")
    : cleaned;

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  return { r, g, b };
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const rN = clamp(r, 0, 255) / 255;
  const gN = clamp(g, 0, 255) / 255;
  const bN = clamp(b, 0, 255) / 255;

  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    if (max === rN) {
      h = ((gN - bN) / delta) % 6;
    } else if (max === gN) {
      h = (bN - rN) / delta + 2;
    } else {
      h = (rN - gN) / delta + 4;
    }

    h *= 60;
    if (h < 0) h += 360;

    s = delta / (1 - Math.abs(2 * l - 1));
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function formatColor(hex: string): { body: string } {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return { body: "❌ Mã màu không hợp lệ. Vui lòng dùng dạng #RRGGBB hoặc #RGB." };
  }

  const hsl = rgbToHsl(rgb);
  const preview = "█".repeat(12);

  return {
    body:
      `🎨 MÀU: ${hex.toUpperCase()}\n` +
      `🟥 RGB: (${rgb.r}, ${rgb.g}, ${rgb.b})\n` +
      `🌀 HSL: (${hsl.h}°, ${hsl.s}%, ${hsl.l}%)\n` +
      `🧩 Preview: ${preview}`,
  };
}

function randomColor(): string {
  const rgb: RGB = { r: randomInt(256), g: randomInt(256), b: randomInt(256) };
  return rgbToHex(rgb);
}

function generatePalette(count: number): string[] {
  const c = clamp(Math.round(count), 1, 8);
  const colors: string[] = [];
  for (let i = 0; i < c; i++) {
    colors.push(randomColor());
  }
  return colors;
}

const colorCommand: Command = {
  name: "color",
  alias: ["mau", "mausac", "palette"],
  version: "1.0.0",
  role: 0,
  desc: "Tạo màu ngẫu nhiên, xem thông tin màu, tạo palette",
  guide:
    "   {pn}                → Màu ngẫu nhiên\n" +
    "   {pn} <#hex>         → Xem thông tin màu\n" +
    "   {pn} palette [n]    → Tạo palette ngẫu nhiên (mặc định 5, tối đa 8)\n\n" +
    "Ví dụ:\n" +
    "   {pn}\n" +
    "   {pn} #ff00ff\n" +
    "   {pn} palette 6",
  cd: 2,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { args, reply } = ctx;


    if (args[0]?.toLowerCase() === "palette") {
      const count = args[1] ? parseInt(args[1], 10) : 5;
      const colors = generatePalette(Number.isFinite(count) ? count : 5);
      const lines = colors.map((c, idx) => `${idx + 1}. ${c.toUpperCase()}  ██████`);
      await reply(`🎨 PALETTE NGẪU NHIÊN (${colors.length} màu)\n` + lines.join("\n"));
      return;
    }


    if (args[0]) {
      const hex = args[0].startsWith("#") ? args[0] : `#${args[0]}`;
      const res = formatColor(hex);
      await reply(res.body);
      return;
    }


    const hex = randomColor();
    const res = formatColor(hex);
    await reply({
      body: `🌈 MÀU NGẪU NHIÊN\n${res.body}`,
    });
  },
};

export default colorCommand;
