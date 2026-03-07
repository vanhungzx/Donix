"use strict";

import type { Command, CommandOnCallContext } from "@types";
import axios from "axios";
import { createCanvas, loadImage } from "canvas";
import FormData from "form-data";
import fs, { createReadStream } from "fs";
import path from "path";

const theliemsCommand: Command = {
  name: "theliems",
  alias: ["theliems"],
  version: "1.1.0",
  role: 0,
  desc: "Cắt ảnh vào khung template và blend gradient (tự xoá nền trước)",
  guide: "{pn} [url ảnh hoặc reply ảnh]",
  cd: 5,
  prefix: true,
  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { client, event, args, reply } = ctx;
    const threadID = event.threadID;
    const tempDir = path.join(process.cwd(), "src/temp");

    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const templateUrl = "https://lh3.googleusercontent.com/-aW2vXt6mABc/aDaCR5Zn6nI/AAAAAAADcRE/aeY7RexyXy4QdeaPoOvpa87H8QDjS4X3gCK4BGAsYHg/s0/sd.jpg";

    const srcUrl = await pickImageUrl({ event, args });

    if (!srcUrl) {
      await reply("Gửi kèm ảnh hoặc dán URL ảnh.");
      return;
    }

    const key = "A1EQ9hEM7VWWwXfQo7UeAdck";

    try {
      const [tplBuf, rawBuf] = await Promise.all([download(templateUrl), download(srcUrl)]);
      const inPath = path.join(tempDir, `rb_in_${Date.now()}.jpg`);
      const outRbPath = path.join(tempDir, `rb_out_${Date.now()}.png`);

      fs.writeFileSync(inPath, rawBuf);

      let cutBuf = rawBuf;

      if (key) {
        try {
          await removeBgFromFile(key, inPath, outRbPath);
          cutBuf = fs.readFileSync(outRbPath);
        } catch { }
      }

      try {
        fs.unlinkSync(inPath);
      } catch { }

      try {
        fs.unlinkSync(outRbPath);
      } catch { }

      const tpl = await loadImage(tplBuf);
      const usr = await loadImage(cutBuf);

      const W = tpl.width;
      const H = tpl.height;
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext("2d");

      ctx.drawImage(tpl, 0, 0, W, H);

      const slotX = W / 2 - 300;
      const slotY = 270;
      const slotS = 600;

      const scale = Math.min(slotS / usr.width, slotS / usr.height);
      const dw = Math.floor(usr.width * scale);
      const dh = Math.floor(usr.height * scale);
      const dx = Math.floor(slotX + (slotS - dw) / 2);
      const dy = Math.floor(slotY + (slotS - dh) / 2);

      const lay = createCanvas(W, H);
      const lctx = lay.getContext("2d");

      lctx.drawImage(usr, dx, dy, dw, dh);

      const grd = lctx.createLinearGradient(0, slotY + 130, 0, slotY + slotS);
      grd.addColorStop(0, "rgba(0,0,0,1)");
      grd.addColorStop(0.8, "rgba(0,0,0,1)");
      grd.addColorStop(0.9, "rgba(0,0,0,0.8)");
      grd.addColorStop(1, "rgba(0,0,0,0)");

      lctx.globalCompositeOperation = "destination-in";
      lctx.fillStyle = grd;
      lctx.fillRect(slotX, slotY, slotS, slotS);

      ctx.drawImage(lay, 0, 0);

      const outPath = path.join(tempDir, `cropanh_${Date.now()}.png`);
      fs.writeFileSync(outPath, canvas.toBuffer("image/png"));

      await client.sendMessage(
        { body: "", attachment: createReadStream(outPath) },
        threadID,
        event.messageID
      );

      setTimeout(() => {
        try {
          fs.unlinkSync(outPath);
        } catch { }
      }, 30000);
    } catch (e) {
      console.error(e);
      await reply("Không xử lý được ảnh.");
    }
  },
};

async function pickImageUrl({ event, args }: { event: any; args: string[] }): Promise<string | null> {
  if (args[0] && /^https?:\/\/.+/.test(args[0])) {
    return args[0];
  }
  if (event.messageReply && event.messageReply.attachments && event.messageReply.attachments[0] && event.messageReply.attachments[0].url)
    return event.messageReply.attachments[0].url;
  if (event.attachments && event.attachments[0] && event.attachments[0].url) return event.attachments[0].url;
  return null;
}

async function download(url: string): Promise<Buffer> {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 20000,
    headers: { Referer: "https://www.google.com/" },
  });
  return Buffer.from(res.data);
}

async function removeBgFromFile(
  apiKey: string,
  inputPath: string,
  outPath: string = path.join(process.cwd(), "src/temp", `removebg_${Date.now()}.png`)
): Promise<{ status: number; outPath: string }> {
  const form = new FormData();
  form.append("size", "auto");
  form.append("image_file", fs.createReadStream(inputPath));

  const res = await axios.post("https://api.remove.bg/v1.0/removebg", form, {
    responseType: "arraybuffer",
    headers: { ...form.getHeaders(), "X-Api-Key": apiKey },
    timeout: 60000,
  });

  fs.writeFileSync(outPath, res.data);
  return { status: res.status, outPath: path.resolve(outPath) };
}

export default theliemsCommand;
