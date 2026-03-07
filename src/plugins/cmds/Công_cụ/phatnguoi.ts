import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import cheerio from "cheerio";
import crypto from "crypto";
import fs from "fs-extra";
import os from "os";
import path from "path";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { CookieJar } from "tough-cookie";
import { URL, URLSearchParams } from "url";

const BASE = "https://www.csgt.vn";
const FORM_URL = `${BASE}/tra-cuu-phuong-tien-vi-pham.html`;
const AJAX_URL = `${BASE}/?mod=contact&task=tracuu_post&ajax`;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function toTypeCode(t: unknown): number {
  const s = String(t || "1").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "");
  if (/^[123]$/.test(s)) return Number(s);
  if (["oto", "xehoi", "car"].includes(s)) return 1;
  if (["xemay", "moto", "motor", "motorbike", "bike"].includes(s)) return 2;
  if (["xedien", "ev", "xedapdien"].includes(s)) return 3;
  return 1;
}

function abs(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function norm(s: unknown): string {
  return String(s || "").replace(/\s+/g, " ").trim();
}

async function preprocessCaptcha(inputPath: string): Promise<string> {
  const tmp = path.join(
    os.tmpdir(),
    `ocr_${Date.now()}_${crypto.randomBytes(6).toString("hex")}.png`
  );

  await sharp(inputPath)
    .rotate()
    .grayscale()
    .normalize()
    .resize({ width: 1200, withoutEnlargement: true })
    .threshold(180)
    .png()
    .toFile(tmp);

  return tmp;
}

async function ocrCaptcha(input: string, _key?: string): Promise<string> {
  // OCR captcha local bằng tesseract.js, không dùng Gemini nữa
  const prePath = await preprocessCaptcha(input);
  const worker = await createWorker("eng");

  try {
    const ret = await worker.recognize(prePath);
    const text = (ret?.data?.text || "").trim();
    const cleaned = text.replace(/[^a-zA-Z0-9]/g, "") || text;
    return cleaned.toLowerCase();
  } catch (e: any) {
    console.error("OCR error:", e?.message || e);
    return "";
  } finally {
    try {
      await worker.terminate();
    } catch {
      // ignore
    }
    try {
      await fs.remove(prePath);
    } catch {
      // ignore
    }
  }
}

async function fetchForm(client: any): Promise<string> {
  const headers = {
    "User-Agent": UA,
    Referer: BASE,
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache"
  };
  const res = await client.get(FORM_URL, { headers, responseType: "text", validateStatus: () => true });
  return String(res.data || "");
}

function extractCaptchaInfo(html: string): { capSrc: string; ipClient: string } {
  const $ = cheerio.load(html);
  let capSrc = "";
  $("img").each((_, img) => {
    const src = String($(img).attr("src") || "");
    const alt = String($(img).attr("alt") || "");
    const id = String($(img).attr("id") || "");
    const cls = String($(img).attr("class") || "");
    if (!capSrc && /captcha/i.test(src + " " + alt + " " + id + " " + cls)) capSrc = src;
  });
  const ipClient = $('input[name="ipClient"]').attr("value") || "";
  return { capSrc, ipClient };
}

async function downloadCaptcha(client: any, src: string): Promise<string> {
  const url = abs(BASE, src);
  const headers = {
    "User-Agent": UA,
    Referer: FORM_URL,
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
  };
  const res = await client.get(url, { headers, responseType: "arraybuffer", validateStatus: () => true });
  const dir = path.join(process.cwd(), "temp");
  await fs.ensureDir(dir);
  const ct = String(res.headers["content-type"] || "");
  const ext = ct.includes("png") ? "png" : ct.includes("jpeg") ? "jpg" : "bin";
  const file = path.join(dir, `csgt_captcha_${Date.now()}.${ext}`);
  await fs.writeFile(file, Buffer.from(res.data));
  return file;
}

async function submitAjax(
  client: any,
  plate: string,
  type: number,
  captcha: string,
  ipClient: string
): Promise<any> {
  const headers = {
    "User-Agent": UA,
    Accept: "*/*",
    "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    Origin: BASE,
    Referer: FORM_URL
  };
  const body = new URLSearchParams({
    BienKS: plate,
    Xe: String(type),
    captcha: String(captcha),
    ipClient: String(ipClient),
    cUrl: FORM_URL
  });
  const res = await client.post(AJAX_URL, body.toString(), { headers, responseType: "text", validateStatus: () => true });
  const txt = String(res.data || "").trim();
  if (txt === "404") return { success: false, message: "Captcha sai hoặc hết hạn" };
  try {
    return JSON.parse(txt);
  } catch {
    return { success: false, message: "Phản hồi không hợp lệ", raw: txt };
  }
}

async function fetchResultPage(client: any, href: string): Promise<{ status: number; html: string; url: string }> {
  const url = abs(BASE, href);
  const headers = {
    "User-Agent": UA,
    Referer: FORM_URL,
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "vi,en-US;q=0.9,en;q=0.8"
  };
  const res = await client.get(url, { headers, responseType: "text", validateStatus: () => true });
  return { status: res.status, html: String(res.data || ""), url };
}

function parseBlocksByTags(html: string): { title: string; updated: string; items: any[] } {
  const $ = cheerio.load(html);
  const container = $("#bodyPrint, #bodyPrint123");
  const result: any[] = [];
  let title = norm($("h1, h2, .title, .page-title").first().text());
  let updated = "";
  $("*").each((_, el) => {
    const txt = norm($(el).text());
    if (!updated && /Dữ liệu được cập nhật/i.test(txt)) updated = txt;
  });
  if (!container.length) return { title, updated, items: result };
  const parts = String(container.html() || "").split(/<hr[^>]*>/i);
  for (const part of parts) {
    const $$ = cheerio.load(`<div class="blk">${part}</div>`);
    const blk = $$(".blk");
    const item: Record<string, string | string[]> = {};
    const extras: string[] = [];
    blk.find(".form-group").each((_, fg) => {
      const lab = norm($$(fg).find("label span").first().text() || $$(fg).find("label").first().text());
      if (lab) {
        let val = norm($$(fg).find(".col-md-9").first().text());
        const key = lab.replace(/[:：]/g, "").trim();
        const keyNorm = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (keyNorm.includes("hanh vi vi pham")) val = val.replace(/^\s*(?:\d+(?:\.[\da-z]+)+)\.?\s*/i, "");
        item[key] = val;
      } else {
        const t = norm($$(fg).text());
        if (t) extras.push(t);
      }
    });
    if (Object.keys(item).length || extras.length) result.push({ ...item, extras });
  }
  return { title, updated, items: result };
}

function getVehicleType(type: number): string {
  const types: Record<number, string> = { 1: "Ô tô", 2: "Xe máy", 3: "Xe điện" };
  return types[type] || "Phương tiện";
}

function formatMessage(plate: string, type: number, items: any[], updated: string): string {
  const vehicleType = getVehicleType(type);
  const updateInfo = updated ? `\n🕐 ${updated}` : "";
  if (!Array.isArray(items) || items.length === 0) {
    return `🎉 KẾT QUẢ TRA CỨU VI PHẠM

🚗 Biển số: ${plate}
📋 Loại xe: ${vehicleType}${updateInfo}

✅ KHÔNG CÓ VI PHẠM

Phương tiện này hiện không có vi phạm được ghi nhận trong hệ thống CSGT.`;
  }
  let msg = `⚠️ KẾT QUẢ TRA CỨU VI PHẠM

🚗 Biển số: ${plate}
📋 Loại xe: ${vehicleType}
🔴 Tổng số vi phạm: ${items.length}${updateInfo}

`;
  items.forEach((item, idx) => {
    msg += `📍 VI PHẠM #${idx + 1}\n\n`;
    if (item["Loại phương tiện"]) {
      msg += `🚙 Loại xe: ${item["Loại phương tiện"]}\n\n`;
    }
    if (item["Màu biển"]) {
      msg += `🎨 Màu biển: ${item["Màu biển"]}\n\n`;
    }
    if (item["Thời gian vi phạm"]) {
      msg += `⏰ Thời gian: ${item["Thời gian vi phạm"]}\n\n`;
    }
    if (item["Địa điểm vi phạm"]) {
      msg += `📍 Địa điểm:\n   ${item["Địa điểm vi phạm"]}\n\n`;
    }
    if (item["Hành vi vi phạm"]) {
      msg += `⚠️ Hành vi:\n   ${item["Hành vi vi phạm"]}\n\n`;
    }
    if (item["Trạng thái"]) {
      const status: string = item["Trạng thái"];
      const icon = status.includes("Chưa") ? "🔴" : "✅";
      msg += `${icon} Trạng thái: ${status}\n\n`;
    }
    if (item["Đơn vị phát hiện vi phạm"]) {
      msg += `👮 Đơn vị phát hiện:\n   ${item["Đơn vị phát hiện vi phạm"]}\n\n`;
    }
    if (Array.isArray(item.extras) && item.extras.length > 0) {
      msg += `📞 Nơi giải quyết:\n`;
      item.extras.forEach((extra: string) => {
        if (extra.includes("Địa chỉ:")) {
          const addresses = extra.replace("Địa chỉ:", "").split("•").map(a => a.trim()).filter(a => a);
          addresses.forEach(addr => {
            msg += `   • ${addr}\n`;
          });
        } else if (!extra.includes("Đội CSGT")) {
          msg += `   ${extra}\n`;
        }
      });
      msg += `\n`;
    }
  });
  msg += `\n💡 Lưu ý: Vui lòng liên hệ đơn vị CSGT để xử lý vi phạm kịp thời.`;
  return msg;
}

const command = {
  name: "phatnguoi",
  alias: ["phatnguoi"],
  version: "2.0.0",
  role: 0,
  desc: "Tra cứu phương tiện vi phạm CSGT",
  guide: "{p}{n} <bienso> [loai: 1|2|3|oto|xemay|xedien]",
  cd: 5,
  prefix: true,
  onLoad: async () => {
    const dir = path.join(process.cwd(), "temp");
    await fs.ensureDir(dir);
  },
  onCall: async ({ event, args, reply, main }: any) => {
    const plate = String(args[0] || "").trim();
    const type = toTypeCode(args[1] || "1");
    if (!plate) return reply("❌ Vui lòng nhập biển số.\n💡 Ví dụ: phat 29A-999.99 oto");
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar, withCredentials: true, timeout: 20000 }));
    const html = await fetchForm(client);
    const { capSrc, ipClient } = extractCaptchaInfo(html);
    if (!capSrc) return reply("❌ Không tìm thấy captcha trên trang.");
    const capFile = await downloadCaptcha(client, capSrc);
    let captcha = await ocrCaptcha(capFile);
    let ajax: any = null;
    if (captcha) ajax = await submitAjax(client, plate, type, captcha, ipClient);
    if (!ajax?.success || !ajax?.href) {
      reply(
        {
          body: "🔐 Vui lòng trả lời tin nhắn này bằng mã captcha trong hình.\n💡 Chỉ nhập chữ và số, không dấu.",
          attachment: fs.createReadStream(capFile)
        },
        (e: any, info: any) => {
          if (e) {
            console.error(e);
            return reply("❌ Đã có lỗi xảy ra, vui lòng thử lại sau.");
          }
          main.onReply.set(info.messageID, {
            commandName: "phatnguoi",
            author: event.senderID,
            messageID: info.messageID,
            data: { jar: jar.toJSON(), plate, type, ipClient, capFile }
          });
        }
      );
      return;
    }
    const page = await fetchResultPage(client, ajax.href);
    const parsed = parseBlocksByTags(page.html);
    const body = formatMessage(plate, type, parsed.items, parsed.updated);
    return reply(body);
  },
  onReply: async ({ event, reply, Reply }: any) => {
    if (Reply.author !== event.senderID) return;
    const text = String(event.body || "").trim();
    if (!/^[a-z0-9]+$/i.test(text)) return reply("❌ Mã captcha không hợp lệ. Chỉ gồm chữ và số.");
    const { jar: jarJson, plate, type, ipClient } = Reply.data || {};
    const jar = CookieJar.fromJSON(jarJson || {});
    const client = wrapper(axios.create({ jar, withCredentials: true, timeout: 20000 }));
    const ajax = await submitAjax(client, plate, type, text, ipClient);
    if (!ajax?.success || !ajax?.href) {
      Reply.delete();
      return reply("❌ Sai captcha hoặc phiên hết hạn.\n💡 Vui lòng thử lại lệnh.");
    }
    const page = await fetchResultPage(client, ajax.href);
    const parsed = parseBlocksByTags(page.html);
    const body = formatMessage(plate, type, parsed.items, parsed.updated);
    Reply.delete();
    return reply(body);
  },
  onChat: async () => { },
  onEvent: async () => { },
  onReact: async () => { }
};

export default command;
