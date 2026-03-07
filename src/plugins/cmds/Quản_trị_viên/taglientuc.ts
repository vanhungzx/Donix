"use strict";

import type { Command, CommandOnCallContext } from "@types";
import { sleep } from "@utils/sleep";

interface MessageMention {
  id: string;
  tag: string;
}

const taglientucCommand: Command = {
  name: "taglientuc",
  alias: ["taglientuc"],
  version: "1.2.0",
  role: 1,
  desc: "Tag liên tục người bạn tag với số lần tùy chọn\nCó thể gọi là gọi hồn người đó",
  guide:
    "- Cú pháp: taglientuc @[tag] [số lần] [nội dung] [-d delay] [-i interval]\n" +
    "- Trong đó:\n" +
    "  + @[tag]: Tag người dùng bạn muốn gọi\n" +
    "  + [số lần]: Số lần muốn tag (mặc định: 5, tối đa: 20)\n" +
    "  + [nội dung]: Nội dung tin nhắn (không bắt buộc)\n" +
    "  + -d: Thời gian chờ ban đầu (ms, mặc định: 2000)\n" +
    "  + -i: Khoảng cách giữa các lần tag (ms, mặc định: 500)\n" +
    "- Ví dụ:\n" +
    "  + taglientuc @MinhDong 10 Vào group ngay\n" +
    "  + taglientuc @MinhDong 5 Alo -d 1000 -i 1000",
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { client, event, args } = ctx;

    const mentions = event.mentions;
    if (!mentions || Object.keys(mentions).length === 0) {
      await client.sendMessage(
        "❌ Cần phải tag 1 người bạn muốn gọi hồn",
        event.threadID,
        event.messageID
      );
      return;
    }

    const mentionKeys = Object.keys(mentions);
    const mentionID = mentionKeys[0];
    const mentionName = mentionID ? mentions[mentionID] : undefined;

    if (!mentionID || !mentionName) {
      await client.sendMessage(
        "❌ Cần phải tag 1 người bạn muốn gọi hồn",
        event.threadID,
        event.messageID
      );
      return;
    }

    const tagWords = mentionName.toLowerCase().split(" ");
    const argsCleaned = args.filter(
      (arg: string) => !tagWords.includes(arg.toLowerCase())
    );

    let times = 5;

    for (const word of argsCleaned) {
      if (!isNaN(Number(word))) {
        times = parseInt(word, 10);
        break;
      }
    }

    times = Math.min(Math.max(times, 1), 20);

    let baseDelay = 2000;
    let increment = 500;

    const dIndex = argsCleaned.indexOf("-d");
    const iIndex = argsCleaned.indexOf("-i");

    if (dIndex !== -1 && argsCleaned[dIndex + 1] && !isNaN(Number(argsCleaned[dIndex + 1] ?? ""))) {
      baseDelay = parseInt(argsCleaned[dIndex + 1] as string, 10);
    }

    if (iIndex !== -1 && argsCleaned[iIndex + 1] && !isNaN(Number(argsCleaned[iIndex + 1] ?? ""))) {
      increment = parseInt(argsCleaned[iIndex + 1] as string, 10);
    }

    const content =
      argsCleaned
        .filter(
          (word: string) =>
            isNaN(Number(word)) &&
            word !== "-d" &&
            word !== "-i" &&
            word !== (dIndex !== -1 && argsCleaned[dIndex + 1] ? argsCleaned[dIndex + 1]! : "") &&
            word !== (iIndex !== -1 && argsCleaned[iIndex + 1] ? argsCleaned[iIndex + 1]! : "")
        )
        .join(" ")
        .trim() || "Ra đây chơi em";

    const arraytag: MessageMention[] = [{ id: mentionID, tag: mentionName }];

    const sendMessage = (msg: import("@types").MessageForm) => {
      return client.sendMessage(msg, event.threadID);
    };

    const emojis = ["👻", "💀", "👽", "👾", "🤖", "😈", "👹", "🎃"];

    const getRandomEmoji = () => emojis[Math.floor(Math.random() * emojis.length)];

    await sendMessage(`Bắt đầu gọi hồn! ${getRandomEmoji()}`);

    
    await sleep(baseDelay);

    
    for (let i = 0; i < times; i++) {
      await sendMessage({
        body: `${content} ${mentionName} ${getRandomEmoji()}`,
        mentions: arraytag.map((m) => m.id),
      });

      if (i < times - 1) {
        await sleep(increment);
      }
    }

    
    await sleep(1000);
    await sendMessage({
      body: `Đã hoàn thành gọi hồn ${mentionName}! ${getRandomEmoji()}`,
      mentions: arraytag.map((m) => m.id),
    });
  },
};

export default taglientucCommand;
