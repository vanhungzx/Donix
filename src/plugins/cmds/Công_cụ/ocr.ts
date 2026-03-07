"use strict";

import axios from "axios";
import crypto from "crypto";
import fs from "fs-extra";
import os from "os";
import path from "path";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

// Nếu project của bạn có type Command thì import, còn không thì để any
import type { Command, CommandOnCallContext } from "@types";

function norm(s: unknown): string {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function tempDir(): string {
  const dir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function downloadImage(url: string): Promise<string> {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 20000
  });
  const dir = tempDir();
  const file = path.join(
    dir,
    `ocr_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
  );
  await fs.writeFile(file, Buffer.from(res.data));
  return file;
}

async function preprocess(inputPath: string): Promise<string> {
  const tmp = path.join(
    os.tmpdir(),
    `ocr_${Date.now()}_${crypto.randomBytes(6).toString("hex")}.png`
  );

  await sharp(inputPath)
    .rotate()
    .grayscale()
    .normalize()
    .resize({ width: 1200, withoutEnlargement: true })
    .png()
    .toFile(tmp);

  return tmp;
}

async function ocrLocal(inputPath: string, lang = "eng"): Promise<string> {
  const prePath = await preprocess(inputPath);
  const worker = await createWorker(lang);

  try {
    const anyWorker = worker as any;

    // Chuẩn bị worker với whitelist chỉ cho chữ và số, psm 7 (single line)
    await anyWorker.setParameters({
      tessedit_char_whitelist: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
      tessedit_pageseg_mode: "7"
    });

    const ret = await anyWorker.recognize(prePath);
    const text = norm(ret?.data?.text || "");
    const clean = text.replace(/[^a-zA-Z0-9]/g, "") || text;
    return clean;
  } finally {
    try {
      await worker.terminate();
    } catch { }
    try {
      await fs.remove(prePath);
    } catch { }
  }
}

const command: Command = {
  name: "ocr",
  alias: ["ocr", "readtext"],
  version: "1.0.0",
  role: 0,
  desc: "Nhận diện chữ trong ảnh (OCR)",
  guide: "{p}{n} (gửi kèm ảnh hoặc reply vào ảnh)\n{p}{n} vi (nếu bạn có thêm traineddata tiếng Việt)",
  cd: 3,
  prefix: true,
  onCall: async ({ event, args, reply }: CommandOnCallContext): Promise<void> => {
    const langArg = String(args[0] || "").trim().toLowerCase();
    const lang = langArg || "eng";

    // Tuỳ vào framework, tên field có thể khác, bạn chỉnh lại cho đúng:
    const attachments =
      (event.messageReply && event.messageReply.attachments) ||
      event.attachments ||
      [];

    if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
      await reply("❌ Vui lòng gửi kèm 1 ảnh hoặc reply vào 1 ảnh để OCR.");
      return;
    }

    const imgAtt = (attachments as any[]).find(
      (a: any) => /photo|image/i.test(a?.type || "") && a?.url
    );
    if (!imgAtt || !imgAtt.url) {
      await reply("❌ Không tìm thấy ảnh hợp lệ trong tin nhắn.");
      return;
    }

    const processingMsg = await reply("⏳ Đang xử lý OCR, vui lòng chờ...");

    try {
      const localPath = await downloadImage(imgAtt.url || "");
      const text = await ocrLocal(localPath, lang);

      if (!text) {
        await reply("❌ Không nhận diện được chữ trong ảnh.");
      }

      await reply(
        `✅ KẾT QUẢ OCR (${lang.toUpperCase()}):\n\n${text}`
      );
    } catch (e: any) {
      console.error("OCR command error:", e);
      await reply("❌ Đã xảy ra lỗi khi OCR ảnh.");
    } finally {
      try {
        if (processingMsg?.messageID) {
          // nếu framework có hàm unsend/edit thì bạn có thể xoá/thay thế thông báo "đang xử lý"
        }
      } catch { }
    }
  },

  onReply: async () => { },
  onChat: async () => { },
  onEvent: async () => { },
  onReact: async () => { }
};

export default command;
