"use strict";

import type { Command, CommandOnCallContext } from '@types';
import axios from "axios";
import { createReadStream } from "fs";
import fs from "fs-extra";
import Jimp from "jimp";
import path from "path";
import { TEMP_DIR } from "../../../core/storagePath";

interface MakeImageParams {
  one: string;
  two: string;
}

async function makeImage({ one, two }: MakeImageParams): Promise<string> {
  const __root = path.resolve(TEMP_DIR());
  await fs.ensureDir(__root);

  
  const bopco_img = await Jimp.read(path.join(__root, "bopco.jpg"));
  const pathImg = path.join(__root, `bopco_${one}_${two}.png`);

  const avatarOnePath = path.join(__root, `avt_${one}.png`);
  const avatarTwoPath = path.join(__root, `avt_${two}.png`);

  
  await Promise.all([
    downloadAvatar(one, avatarOnePath),
    downloadAvatar(two, avatarTwoPath),
  ]);

  
  const [circleOne, circleTwo] = await Promise.all([
    convertAndCreateCircle(avatarOnePath),
    convertAndCreateCircle(avatarTwoPath),
  ]);

  
  bopco_img
    .resize(700, 440)
    .brightness(-0.1) 
    .contrast(0.2) 
    .composite(circleOne.resize(180, 180), 50, 100) 
    .composite(circleTwo.resize(160, 160), 450, 120); 

  const raw = await bopco_img.getBufferAsync("image/png");
  await fs.writeFile(pathImg, raw);

  
  if (fs.existsSync(avatarOnePath)) {
    fs.unlinkSync(avatarOnePath);
  }
  if (fs.existsSync(avatarTwoPath)) {
    fs.unlinkSync(avatarTwoPath);
  }

  return pathImg;
}

async function downloadAvatar(
  userId: string,
  filePath: string
): Promise<void> {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${userId}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
      { responseType: "arraybuffer" }
    );
    await fs.writeFile(filePath, Buffer.from(response.data));
  } catch (error) {
    console.error(`Failed to download avatar for user ${userId}`, error);
  }
}

async function convertAndCreateCircle(imagePath: string): Promise<Jimp> {
  try {
    const image = await Jimp.read(imagePath);
    image.circle();
    const pngBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
    const convertedImage = await Jimp.read(pngBuffer);
    return convertedImage;
  } catch (error) {
    console.error("Error processing image:", error);
    throw error;
  }
}

const bopcoCommand: Command = {
  name: "bopco",
  alias: ["bopco", "bopcco", "siętco"],
  version: "1.0.0",
  role: 0,
  desc: "Bóp cổ người bạn tag với hiệu ứng đặc biệt",
  guide:
    "{pn} [@tag] - Tag người bạn muốn bóp cổ. Lệnh này sẽ tạo ra một hình ảnh bóp cổ, tính toán độ tức giận và tạo hiệu ứng đặc biệt.",
  cd: 5,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { client, event, userData, threadData } = ctx;
    const { threadID, messageID, senderID } = event;

    const mention = Object.keys(event.mentions || {});
    const one = senderID;
    const two = mention[0];

    if (!two) {
      await client.sendMessage(
        "❎ Vui lòng tag 1 người bạn muốn bóp cổ",
        threadID,
        messageID
      );
      return;
    }

    
    const angerLevel = Math.floor(Math.random() * 101);

    
    const dangerMultiplier = Math.floor(Math.random() * 20) + 1;

    try {
      const threadInfo = await threadData.get(threadID);
      const userInfo = threadInfo?.threadInfo?.userInfo || [];

      const getName = userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
      const userName1 =
        userInfo.find((user: any) => user.id === one)?.name ||
        (getName ? await getName(one) : null) ||
        "Someone";
      const userName2 =
        userInfo.find((user: any) => user.id === two)?.name ||
        (getName ? await getName(two) : null) ||
        "Someone";

      const imagePath = await makeImage({ one, two });

      await client.sendMessage(
        {
          body:
            `👥 ${userName1} bóp cổ ${userName2}\n` +
            `😡 Độ tức giận: ${angerLevel}%\n` +
            `⚡ Hệ số nguy hiểm: ${dangerMultiplier}x`,
          attachment: createReadStream(imagePath),
        },
        threadID,
        messageID
      );

      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }

      if (messageID) {
        await client.setMessageReaction("💀", messageID, threadID).catch(() => {
          
        });
      }
    } catch (error: any) {
      console.error("Error in bopco command:", error);
      await client.sendMessage(
        "❌ Đã xảy ra lỗi khi xử lý yêu cầu của bạn.",
        threadID,
        messageID
      );
    }
  },
};

export default bopcoCommand;
