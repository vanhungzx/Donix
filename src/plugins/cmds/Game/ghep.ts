"use strict";

import type { Command, CommandOnCallContext } from '@types';
import axios from "axios";
import fs from "fs-extra";
import Jimp from "jimp";
import path from "path";

interface MakeImageParams {
  one: string;
  two: string;
}

async function circle(imagePath: string): Promise<Buffer> {
  const image = await Jimp.read(imagePath);
  image.circle();
  return await image.getBufferAsync("image/png");
}

async function makeImage({ one, two }: MakeImageParams): Promise<string> {
  const __root = path.resolve(process.cwd(), "src/temp");

  try {
    if (!fs.existsSync(__root)) {
      await fs.ensureDir(__root);
    }

    const pairing_img = await Jimp.read(
      path.join(process.cwd(), "src/storage/image/pairing.png")
    );

    const pathImg = path.join(__root, `pairing_${one}_${two}.png`);
    const avatarOne = path.join(__root, `avt_${one}.png`);
    const avatarTwo = path.join(__root, `avt_${two}.png`);

    const getAvatarOne = (
      await axios.get(
        `https://graph.facebook.com/${one}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
        { responseType: "arraybuffer" }
      )
    ).data;
    await fs.writeFile(avatarOne, Buffer.from(getAvatarOne));

    const getAvatarTwo = (
      await axios.get(
        `https://graph.facebook.com/${two}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
        { responseType: "arraybuffer" }
      )
    ).data;
    await fs.writeFile(avatarTwo, Buffer.from(getAvatarTwo));

    const circleOne = await Jimp.read(await circle(avatarOne));
    const circleTwo = await Jimp.read(await circle(avatarTwo));

    pairing_img
      .composite(circleOne.resize(150, 150), 980, 200)
      .composite(circleTwo.resize(150, 150), 140, 200);

    const raw = await pairing_img.getBufferAsync("image/png");
    await fs.writeFile(pathImg, raw);

    try {
      if (fs.existsSync(avatarOne)) fs.unlinkSync(avatarOne);
      if (fs.existsSync(avatarTwo)) fs.unlinkSync(avatarTwo);
    } catch (cleanupError) {
      console.error("Error cleaning up temporary files:", cleanupError);
    }

    return pathImg;
  } catch (error) {
    console.error("Error in makeImage:", error);
    throw error;
  }
}

const ghepCommand: Command = {
  name: "ghep",
  alias: ["ghep"],
  version: "1.0.1",
  role: 0,
  desc: "Ghép đôi với những người trong nhóm",
  guide: "   {pn}",
  cd: 5,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    try {
      const { client, event, userData, threadData } = ctx;
      const { threadID, messageID, senderID } = event;

      const tl = [
        "21%",
        "67%",
        "19%",
        "37%",
        "17%",
        "96%",
        "52%",
        "62%",
        "76%",
        "83%",
        "100%",
        "99%",
        "0%",
        "48%",
      ];
      const tle = tl[Math.floor(Math.random() * tl.length)];

      const dataa = await userData.get(senderID);
      const namee = dataa?.name || "Người dùng";

      const loz = await threadData.get(threadID);
      const participantIDs =
        loz?.threadInfo?.participantIDs || loz?.threadInfo?.userInfo?.map((u: any) => u.id) || [];

      if (participantIDs.length === 0) {
        await client.sendMessage(
          "❌ Không tìm thấy thành viên trong nhóm!",
          threadID,
          messageID
        );
        return;
      }

      const id = participantIDs[Math.floor(Math.random() * participantIDs.length)];
      const data = await userData.get(id);

      if (!data) {
        await client.sendMessage(
          "❌ Không tìm thấy thông tin người dùng!",
          threadID,
          messageID
        );
        return;
      }

      const name = data.name || "Người dùng";

      const arraytag = [
        { id: senderID, tag: namee },
        { id: id, tag: name },
      ] as any;

      const sex = data.gender;
      const gender =
        Number(sex) === 2 ? "Nam🧑" : Number(sex) === 1 ? "Nữ👩‍🦰" : "Trần Đức Bo";

      const one = senderID;
      const two = id;

      const imagePath = await makeImage({ one, two });

      await client.sendMessage(
        {
          body: `🎁 ️Chúc mừng ${namee} đã được ghép đôi với ${name} 🎉\n🎊 ️Tỉ Lệ Hợp Đôi là: 〘${tle}〙🥳`,
          mentions: arraytag,
          attachment: fs.createReadStream(imagePath),
        },
        threadID,
        () => {
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        },
        messageID
      );
    } catch (e: any) {
      console.log(e);
      const { client, event } = ctx;
      await client.sendMessage(
        "❌ Đã xảy ra lỗi khi xử lý yêu cầu!",
        event.threadID,
        event.messageID
      );
    }
  },
};

export default ghepCommand;
