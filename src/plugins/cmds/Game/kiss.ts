"use strict";

import type { Command, CommandOnCallContext } from '@types';
import axios from "axios";
import { createReadStream } from "fs";
import fs from "fs-extra";
import Jimp from "jimp";
import path from "path";

const formatCurrency = (amount: bigint | number | null | undefined): string => {
  if (amount === null || amount === undefined) return "";
  const bigIntAmount = typeof amount === "bigint" ? amount : BigInt(amount);
  const strAmount = bigIntAmount.toString();
  const addThou = (numStr: string): string =>
    numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return addThou(strAmount) + " VNĐ";
};

const romanticMessages: string[] = [
  "💚 Yeu anh ❤",
  "💛 Yeu em 💜",
  "💖 Forever yours 💖",
  "💝 My heart beats for you 💝",
  "💑 Together forever 💑",
];

const kissReactions: string[] = [
  "💋 sweetly kisses 💋",
  "🤗 passionately embraces 💝",
  "😘 gently pecks 💕",
  "❤️ romantically kisses 💞",
  "🫂 lovingly hugs and kisses 💑",
];

interface MakeImageParams {
  one: string;
  two: string;
}

async function makeImage({ one, two }: MakeImageParams): Promise<string> {
  const __root = path.resolve(
    path.join(process.cwd(), "src/storage/image")
  );
  const hon_img = await Jimp.read(path.join(__root, "kiss.jpg"));
  const pathImg = path.join(__root, `hon_${one}_${two}.png`);
  const avatarOnePath = path.join(__root, `avt_${one}.png`);
  const avatarTwoPath = path.join(__root, `avt_${two}.png`);

  await Promise.all([
    downloadAvatar(one, avatarOnePath),
    downloadAvatar(two, avatarTwoPath),
  ]);

  const [circleOne, circleTwo] = await Promise.all([
    Jimp.read(await createCircle(avatarOnePath)),
    Jimp.read(await createCircle(avatarTwoPath)),
  ]);

  hon_img
    .resize(700, 440)
    .brightness(0.1)
    .contrast(0.1)
    .composite(circleOne.resize(200, 200), 390, 23)
    .composite(circleTwo.resize(180, 180), 140, 80);

  const raw = await hon_img.getBufferAsync("image/png");
  fs.writeFileSync(pathImg, raw);
  fs.unlinkSync(avatarOnePath);
  fs.unlinkSync(avatarTwoPath);
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
    fs.writeFileSync(filePath, Buffer.from(response.data, "utf-8"));
  } catch (error) {
    console.error(`Failed to download avatar for user ${userId}`, error);
  }
}

async function createCircle(imagePath: string): Promise<Buffer> {
  const image = await Jimp.read(imagePath);
  image.circle();
  return await image.getBufferAsync("image/png");
}

const kissCommand: Command = {
  name: "kiss",
  alias: ["kiss", "hon"],
  version: "2.1.0",
  role: 0,
  desc: "Hôn người bạn tag với hiệu ứng đặc biệt",
  guide:
    "{pn} [@tag] - Tag người bạn muốn hôn. Lệnh này sẽ tạo ra một hình ảnh hôn, tính toán độ hảo cảm và tạo hiệu ứng đặc biệt.",
  cd: 5,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { event, client: api, userData, threadData } = ctx;
    const { threadID, messageID, senderID } = event;
    const mention = Object.keys(event.mentions || {});
    const one = senderID;
    const two = mention[0];

    if (!two) {
      await api.sendMessage(
        "❎ Vui lòng tag 1 người bạn muốn hôn",
        threadID,
        messageID
      );
      return;
    }

    const hc = Math.floor(Math.random() * 101) + 100;
    const rd = Math.floor(Math.random() * 15) + 1;
    const reward = BigInt(hc * rd);
    const luckBonus = Math.random() < 0.1 ? 2n : 1n;
    const finalReward = reward * luckBonus;

    const threadDataResult = await threadData.get(threadID);
    if (!threadDataResult || !threadDataResult.threadInfo) {
      await api.sendMessage(
        "❌ Không thể lấy thông tin nhóm",
        threadID,
        messageID
      );
      return;
    }
    const threadInfo = threadDataResult.threadInfo;
    const userName1 =
      threadInfo.userInfo.find((user: any) => user.id === one)?.name ||
      "Someone";
    const userName2 =
      threadInfo.userInfo.find((user: any) => user.id === two)?.name ||
      "Someone";

    const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
    if (addMoney) {
      await addMoney(senderID, finalReward);
    }

    const randomMessage =
      romanticMessages[Math.floor(Math.random() * romanticMessages.length)];
    const randomReaction =
      kissReactions[Math.floor(Math.random() * kissReactions.length)];

    try {
      const imagePath = await makeImage({ one, two });
      if (!imagePath) {
        await api.sendMessage(
          "❌ Không thể tạo hình ảnh",
          threadID,
          messageID
        );
        return;
      }

      await api.sendMessage(
        {
          body:
            `${randomMessage}\n` +
            `👥 ${userName1} ${randomReaction} ${userName2}\n` +
            `💓 Độ hảo cảm: ${hc}%\n` +
            `🎯 Hệ số may mắn: ${rd}x\n` +
            `${luckBonus === 2n ? "🍀 LUCKY BONUS x2!\n" : ""}` +
            `💰 Thưởng: + ${formatCurrency(Number(finalReward))}`,
          attachment: createReadStream(imagePath as string),
        },
        threadID,
        messageID
      );

      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
      if (messageID && threadID) {
        await api.setMessageReaction("💝", messageID, threadID, () => { });
      }
    } catch (error) {
      console.error("Error in kiss command:", error);
      await api.sendMessage(
        "❌ An error occurred while processing your request.",
        threadID,
        messageID
      );
    }
  },
};

export default kissCommand;
