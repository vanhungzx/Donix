"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnChatContext,
} from "@types";
import moment from "moment-timezone";

const KEY = [
  "hello",
  "hi",
  "hai",
  "chào",
  "hí",
  "híí",
  "lô",
  "hii",
  "helo",
  "hê nhô",
];

type TimeOfDay =
  | "lateNight"
  | "earlyMorning"
  | "morning"
  | "noon"
  | "afternoon"
  | "evening"
  | "night"
  | "midnight";

const getTimeOfDay = (h: number): TimeOfDay => {
  if (h >= 0 && h < 4) return "lateNight";
  if (h >= 4 && h < 7) return "earlyMorning";
  if (h >= 7 && h < 11) return "morning";
  if (h >= 11 && h < 13) return "noon";
  if (h >= 13 && h < 17) return "afternoon";
  if (h >= 17 && h < 19) return "evening";
  if (h >= 19 && h < 22) return "night";
  return "midnight";
};

const greetingsByTime: Record<TimeOfDay, string[]> = {
  earlyMorning: [
    "chúc buổi sáng sớm tràn đầy năng lượng 🌅",
    "dậy sớm quá ha, nhớ uống nước ấm nha 🫖",
    "sáng sớm rồi, chúc một ngày mới chill chill 😘",
  ],
  morning: [
    "chúc buổi sáng vui vẻ và đáng yêu ☀️",
    "mong hôm nay là một ngày xịn xò với bạn 🩷",
    "nhớ ăn sáng nha, đừng bỏ bữa 🍞",
  ],
  noon: [
    "nghỉ trưa chút đi, đừng cày quá nha 😌",
    "ăn trưa chưa? nhớ ăn đủ chất nhen 🍱",
    "trưa rồi, tranh thủ thư giãn xíu đi 😴",
  ],
  afternoon: [
    "chúc buổi chiều mát mẻ, không drama nha 🌤️",
    "làm gì thì cũng nhẹ nhàng thôi nhen 🐌",
    "giữ sức khoẻ ha, chiều dễ mệt lắm đó 🌸",
  ],
  evening: [
    "chúc chiều tà an yên nha 🌇",
    "tan làm chưa? nghỉ ngơi xíu đi 😚",
    "chiều tới rồi, không cần gấp gáp nữa 🎶",
  ],
  night: [
    "chúc buổi tối chill chill, đừng stress nghen 🌙",
    "tối rồi, nghỉ sớm cho đẹp da nè 🛋️",
    "chúc mộng đẹp, không gặp deadline 💆",
  ],
  midnight: [
    "tối muộn rồi, nhớ ngủ sớm nha 😴",
    "ngủ sớm đi, sáng mai dậy mới tỉnh táo 💤",
    "có thức thì cũng nhớ giữ ấm nhen 🤧",
  ],
  lateNight: [
    "giờ này còn thức là hơi bị lì á 🌚",
    "sáng tinh mơ mà chưa ngủ là hơi mệt đó 🥱"
  ],
};

const hiCommand: Command = {
  name: "hi",
  alias: ["hi"],
  version: "1.4.1",
  role: 1,
  desc: "Hi chào thành viên kèm lời chúc theo thời gian",
  category: "Nhóm",
  guide: "[]",
  cd: 5,
  prefix: true,

  onChat: async function (ctx: CommandOnChatContext) {
    const { event, client, userData, threadData } = ctx;
    const { threadID, messageID, senderID, body } = event;

    const botID = client.getCurrentUserID();
    if (senderID === botID) return;

    try {
      const data = await threadData.get(threadID);
      const hiStatus = data?.data?.hi;

      if (
        (typeof hiStatus === "undefined" || hiStatus) &&
        body &&
        KEY.includes(body.toLowerCase())
      ) {
        const hour = parseInt(moment.tz("Asia/Ho_Chi_Minh").format("H"));
        const timeKey = getTimeOfDay(hour);
        const messages = greetingsByTime[timeKey] || [
          "chúc bạn một ngày vui vẻ 👋",
        ];
        const random = messages[Math.floor(Math.random() * messages.length)];
        const getName = userData.getName as ((sid: string) => Promise<string | null | undefined>) | undefined;
        const name = getName ? await getName(senderID) : "Người dùng";
        const tagText = name && name.startsWith("@") ? name : `${name || "Người dùng"}`;
        const mentions = [{ tag: tagText, id: senderID }] as any;
        const finalMessage = `Hí ${tagText}, ${random}`;

        await client.sendMessage(
          { body: finalMessage, mentions },
          threadID,
          messageID
        );
      }
    } catch (error: any) {
      
      console.error("[HI] onChat error:", error.message);
    }
  },

  onCall: async function (ctx: CommandOnCallContext) {
    const { event, client, threadData } = ctx;
    const { threadID, messageID } = event;

    try {
      const data = await threadData.get(threadID);
      const hiStatus = data?.data?.hi;
      const newStatus = !(typeof hiStatus === "undefined" || hiStatus);

      await threadData.update(threadID, {
        data: { hi: newStatus },
      });

      await client.sendMessage(
        `☑️ Đã ${newStatus ? "bật" : "tắt"} hi thành công!`,
        threadID,
        messageID
      );
    } catch (error: any) {
      await client.sendMessage(
        `❌ Đã xảy ra lỗi: ${error.message}`,
        threadID,
        messageID
      );
    }
  },
};

export default hiCommand;
