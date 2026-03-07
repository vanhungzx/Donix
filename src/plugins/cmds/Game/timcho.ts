"use strict";

import type { Command, CommandOnCallContext } from '@types';
import axios from "axios";
import { createCanvas, loadImage, registerFont } from "canvas";
import { createReadStream } from "fs";
import fs from "fs-extra";
import path from "path";

const locations: string[] = [
  "khu vực Cầu Giấy",
  "gần chợ Đông Ba",
  "quanh khu Hồ Gươm",
  "khu phố cổ Hà Nội",
  "gần công viên Thống Nhất",
  "khu vực Hai Bà Trưng",
  "quanh khu vực Tây Hồ",
];

interface MakeImageParams {
  authorName: string;
  userId: string;
  userName: string;
  timeString: string;
  location: string;
}

async function makeImage({
  authorName,
  userId,
  userName,
  timeString,
  location,
}: MakeImageParams): Promise<string> {
  const cache = path.join(process.cwd(), "src/temp");
  const pathImg = path.join(cache, `timcho_${userId}_${Date.now()}.png`);
  const avatarPath = path.join(cache, `avt_${userId}.png`);

  await downloadAvatar(userId, avatarPath);

  const fontPath = path.join(
    process.cwd(),
    "src/storage/font/TUVBenchmark.ttf"
  );

  try {
    registerFont(fontPath, { family: "Rocliento" });
  } catch (e) {
    
  }

  const width = 600;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#e8e8e8";
  ctx.fillRect(0, 0, width, height);

  const lines: string[] = [
    `Vào lúc tối ${timeString} trong lúc`,
    `đi dạo tại ${location},`,
    `Em có lạc mất con chó tên ${userName}.`,
    `như ảnh dưới`,
    `Ai thấy thì vui lòng liên hệ ${authorName},`,
    `có hậu tạ.`,
  ];

  const fontSize = 26;
  const maxWidth = 540;
  const lineHeight = fontSize * 1.6;

  ctx.textBaseline = "top";
  ctx.fillStyle = "#222";

  const totalHeight = lines.length * lineHeight;
  let y = (280 - totalHeight) / 2;

  ctx.font = `bold ${fontSize}px Rocliento`;

  for (const line of lines) {
    ctx.fillText(line, 30, y, maxWidth);
    y += lineHeight;
  }

  try {
    const avatar = await loadImage(avatarPath);
    const avatarSize = 300;
    const avatarX = (width - avatarSize) / 2;
    const avatarY = 280;

    ctx.fillStyle = "#fff";
    ctx.fillRect(avatarX - 10, avatarY - 10, avatarSize + 20, avatarSize + 20);
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  } catch (e: any) {
    console.error("Lỗi tải avatar:", e?.message || e);
  }

  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(pathImg, buffer);
  fs.unlinkSync(avatarPath);

  return pathImg;
}

async function downloadAvatar(userId: string, filePath: string): Promise<void> {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${userId}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
      { responseType: "arraybuffer" }
    );
    fs.writeFileSync(filePath, Buffer.from(response.data));
  } catch (error) {
    console.error(`Failed to download avatar for user ${userId}`, error);
    
    const canvas = createCanvas(512, 512);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#cccccc";
    ctx.fillRect(0, 0, 512, 512);
    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(filePath, buffer);
  }
}

const timchoCommand: Command = {
  name: "timcho",
  alias: ["timcho", "findpet", "lacmat"],
  version: "1.0.0",
  role: 0,
  desc: "Troll bạn bè bằng cách tạo thông báo tìm kiếm 'thú cưng' bị lạc",
  guide:
    "{pn} [@tag] - Tag bạn để troll bằng poster tìm kiếm. Tên người được tag sẽ trở thành tên 'thú cưng' bị lạc 😂",
  cd: 10,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { event, client: api, userData, threadData } = ctx;
    const { threadID, messageID, senderID } = event;
    const mention = Object.keys(event.mentions || {});
    const targetUser = mention[0] || senderID;

    const currentDate = new Date();
    const lostDate = new Date(
      currentDate.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000
    );

    const timeString = lostDate.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const location =
      locations[Math.floor(Math.random() * locations.length)];
    const shareReward = BigInt(Math.floor(Math.random() * 500) + 200);

    const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
    if (addMoney) {
      await addMoney(senderID, shareReward);
    }

    
    const addExp = userData.addExp as ((id: string, amount: number) => Promise<number>) | undefined;
    if (addExp) {
      const gained = 10;
      await addExp(senderID, gained);
    }

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
    const userName =
      threadInfo.userInfo.find((user: any) => user.id === targetUser)?.name ||
      "Chủ nhân";
    const getName = userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
    const authorName = getName ? (await getName(event.senderID)) || "Bạn" : "Bạn";

    try {
      const imagePath = await makeImage({
        authorName,
        userId: targetUser,
        userName,
        timeString,
        location: location || "khu vực Cầu Giấy",
      });

      await api.sendMessage(
        {
          body: ``,
          attachment: createReadStream(imagePath),
        },
        threadID,
        messageID
      );

      fs.unlinkSync(imagePath);
    } catch (error) {
      console.error("Error in timcho command:", error);
      await api.sendMessage(
        "❌ Đã xảy ra lỗi khi tạo thông báo tìm kiếm.",
        threadID,
        messageID
      );
    }
  },
};

export default timchoCommand;
