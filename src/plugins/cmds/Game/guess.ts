"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnReplyContext,
} from '@types';

interface GuessReplyData {
  commandName: string;
  author: string;
  messageID: string;
  threadID: string;
  num: string;
  at: number;
  streak: number;
}

function rd(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function formatNumber($: number | bigint | string): string {
  let $_ = $.toString();
  let _ = $_.split(".");
  let i = _[0] || "0";
  let $0 = _.length > 1 ? "." + _[1] : "";
  let $$ = /(-?\d+)(\d{3})/;
  while ($$.test(i)) {
    i = i.replace($$, "$1,$2");
  }
  return i + $0;
}

const guessCommand: Command = {
  name: "guess",
  alias: ["guess"],
  version: "1.0.0",
  role: 0,
  desc: "Trò chơi đoán số",
  guide:
    "{pn} -> Trò chơi đoán số gồm 4 chữ số\n- Reply 'gợi ý' để xem gợi ý (tốn 20,000 VND)\n- Reply 'streak' để xem chuỗi thắng hiện tại\n- Thưởng cơ bản 1,000,000 VND nếu đoán đúng\n- Thưởng thêm 100,000 VND cho mỗi lần thắng liên tiếp\n- Mỗi lần đoán sai sẽ bị trừ 50,000 VND khỏi phần thưởng",
  cd: 5,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext) {
    const { client, event, main, commandName, userData } = ctx;
    const num = rd();
    console.log(num);

    await client.sendMessage(
      `🎮 Hãy đoán một số có 4 chữ số\nReply:\n- "gợi ý" để xem gợi ý\n- "streak" để xem chuỗi thắng\n- hoặc nhập đáp án của bạn`,
      event.threadID,
      async (err?: Error, info?: unknown) => {
        if (err) return console.error(err);
        const msgInfo = info as { messageID?: string } | undefined;

        const userDataObj = await userData.get(event.senderID);
        const userDataData = userDataObj?.data && typeof userDataObj.data === 'object'
          ? userDataObj.data as { guess?: { streak?: number } }
          : undefined;
        const streak = userDataData?.guess?.streak || 0;

        if (!main.onReply) {
          main.onReply = new Map();
        }

        if (msgInfo?.messageID) {
          main.onReply.set(msgInfo.messageID, {
            commandName,
            author: event.senderID,
            messageID: msgInfo.messageID,
            threadID: event.threadID,
            num,
            at: 0,
            streak,
          });
        }
      }
    );
  },

  onReply: async function (ctx: CommandOnReplyContext): Promise<void> {
    const { client, main, event, Reply, userData, commandName } = ctx;

    if (!Reply) return;
    const replyData = Reply as unknown as GuessReplyData;

    if (event.senderID !== replyData.author) return;

    const guess = event.body || "";
    const num = replyData.num;

    if (guess.toLowerCase() === "streak") {
      await client.sendMessage(
        `🏆 Chuỗi thắng hiện tại của bạn: ${replyData.streak}\nThưởng thêm: ${formatNumber(
          replyData.streak * 100000
        )} VND`,
        event.threadID,
        event.messageID
      );
      return;
    }

    if (guess.toLowerCase() === "gợi ý") {
      const coinsdown = 20000;
      const userDataObj = await userData.get(event.senderID);
      const balance = userDataObj?.money || 0n;

      if (coinsdown > Number(balance)) {
        await client.sendMessage(
          `❌ Số dư không đủ ${formatNumber(coinsdown)} VND để xem gợi ý`,
          event.threadID,
          event.messageID
        );
        return;
      }

      const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
      if (delMoney) await delMoney(event.senderID, BigInt(coinsdown));

      const numInt = parseInt(num, 10);
      const range1 = Math.floor((numInt - 900) / 100) * 100;
      const range2 = Math.ceil((numInt + 1000) / 100) * 100;

      let hint = num
        .split("")
        .map((digit, index) => (index === 1 ? digit : "_"))
        .join(" ");

      let oddEven = num
        .split("")
        .map((n) => (parseInt(n) % 2 === 0 ? "chẵn" : "lẻ"))
        .join(", ");

      if (replyData.messageID) {
        client.unsendMessage(replyData.messageID, event.threadID);
      }

      await client.sendMessage(
        `🔍 Gợi ý nâng cao:\n1️⃣ Số nằm trong khoảng: ${range1} - ${range2}\n2️⃣ Mẫu số: ${hint}\n3️⃣ Các chữ số lần lượt là: ${oddEven}`,
        event.threadID,
        (err?: Error, info?: { messageID?: string }) => {
          if (err) return console.error(err);
          const msgInfo = info;

          if (!main.onReply) {
            main.onReply = new Map();
          }

          if (msgInfo.messageID) {
            main.onReply.set(msgInfo.messageID, {
              commandName,
              author: event.senderID,
              messageID: msgInfo.messageID,
              threadID: event.threadID,
              num,
              at: replyData.at,
              streak: replyData.streak,
            });
          }
        }
      );
      return;
    }

    if (guess.length !== 4 || !/^\d{4}$/.test(guess)) {
      if (replyData.messageID) {
        client.unsendMessage(replyData.messageID, event.threadID);
      }

      await client.sendMessage(
        `❌ Vui lòng đoán một số có 4 chữ số\nReply vào tin nhắn này để trả lời!`,
        event.threadID,
        (err?: Error, info?: { messageID?: string }) => {
          if (err) return console.error(err);
          const msgInfo = info;

          if (!main.onReply) {
            main.onReply = new Map();
          }

          if (msgInfo.messageID) {
            main.onReply.set(msgInfo.messageID, {
              commandName,
              author: event.senderID,
              messageID: msgInfo.messageID,
              threadID: event.threadID,
              num,
              at: replyData.at,
              streak: replyData.streak,
            });
          }
        }
      );
      return;
    }

    const baseMoney = 1000000;
    const streakBonus = replyData.streak * 100000;
    let correctDigits = 0;
    let correctPositions = 0;

    for (let i = 0; i < guess.length; i++) {
      const guessChar = guess[i];
      const numChar = num[i];
      if (guessChar && num.includes(guessChar)) correctDigits++;
      if (guessChar && numChar && guessChar === numChar) correctPositions++;
    }

    if (guess === num) {
      if (replyData.messageID) {
        client.unsendMessage(replyData.messageID, event.threadID);
      }

      const totalWin = baseMoney + streakBonus - replyData.at * 50000;
      const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
      if (addMoney) await addMoney(event.senderID, BigInt(totalWin));

      await userData.update(event.senderID, {
        data: { guess: { streak: replyData.streak + 1 } },
      });

      await client.sendMessage(
        `🎉 Chúc mừng! Bạn đã đoán đúng số: ${num}\n💰 Tiền thưởng: ${formatNumber(
          baseMoney - replyData.at * 50000
        )} VND\n🏆 Thưởng chuỗi thắng (${replyData.streak + 1}): ${formatNumber(streakBonus)} VND\n💵 Tổng nhận: ${formatNumber(
          totalWin
        )} VND`,
        event.threadID,
        event.messageID
      );
      return;
    } else {
      if (baseMoney - replyData.at * 50000 <= 0) {
        if (replyData.messageID) {
          client.unsendMessage(replyData.messageID, event.threadID);
        }

        await userData.update(event.senderID, {
          data: { guess: { streak: 0 } },
        });

        await client.sendMessage(
          `💔 Bạn thua! Chuỗi thắng đã bị đứt!`,
          event.threadID,
          event.messageID
        );
        return;
      }

      replyData.at += 1;

      if (replyData.messageID) {
        client.unsendMessage(replyData.messageID, event.threadID);
      }

      await client.sendMessage(
        `📊 Kết quả đoán:\n✅ Số chữ số đúng: ${correctDigits}\n🎯 Số vị trí đúng: ${correctPositions}\n🔄 Số lần đoán: ${replyData.at}\n💰 Tiền thưởng còn lại: ${formatNumber(
          baseMoney - replyData.at * 50000
        )} VND\n\nReply để tiếp tục đoán!`,
        event.threadID,
        (err?: Error, info?: unknown) => {
          if (err) return console.error(err);
          const msgInfo = info as { messageID?: string } | undefined;

          if (!main.onReply) {
            main.onReply = new Map();
          }

          if (msgInfo?.messageID) {
            main.onReply.set(msgInfo.messageID, {
              commandName,
              author: event.senderID,
              messageID: msgInfo.messageID,
              threadID: event.threadID,
              num,
              at: replyData.at + 1,
              streak: 0,
            });
          }
        }
      );
      return;
    }
  },
};

export default guessCommand;
