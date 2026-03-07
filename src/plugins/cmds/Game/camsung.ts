"use strict";

import type { Command, CommandOnCallContext } from '@types';

const camsungCommand: Command = {
  name: "camsung",
  alias: ["camsung"],
  version: "1.0.0",
  role: 0,
  desc: "Game giải trí về tình yêu, cắm sừng!",
  guide:
    "{pn} @tag\n\n- @tag: Tag người bạn muốn cắm sừng\n\nVí dụ: {pn} @nguoi_ban_muon_cam_sung",
  cd: 5,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    try {
      const { client, event, userData } = ctx;
      const { threadID, messageID, senderID, mentions } = event;

      if (!mentions || Object.keys(mentions).length === 0) {
        await client.sendMessage(
          "[💔] ➜ Vui lòng tag người bạn muốn cắm sừng!",
          threadID,
          messageID
        );
        return;
      }

      const victim = Object.keys(mentions)[0];
      if (!victim) {
        await client.sendMessage(
          "[💔] ➜ Vui lòng tag người bạn muốn cắm sừng!",
          threadID,
          messageID
        );
        return;
      }

      const clientID = client.getCurrentUserID?.() || client.id || "";

      if (victim === clientID || senderID === victim) {
        await client.sendMessage(
          "[💔] ➜ Rất tiếc, bạn không thể cắm sừng người này, vui lòng thử lại!",
          threadID,
          messageID
        );
        return;
      }

      const victimData = await userData.get(victim);
      const senderData = await userData.get(senderID);

      const nameVictim = victimData?.name || "Người dùng";
      const nameSender = senderData?.name || "Người dùng";

      const moneyVictim =
        typeof victimData?.money === "bigint"
          ? Number(victimData.money)
          : victimData?.money || 0;
      const moneySender =
        typeof senderData?.money === "bigint"
          ? Number(senderData.money)
          : senderData?.money || 0;

      const route = Math.floor(Math.random() * 2);

      if (route === 0) {
        const money = Math.floor(Math.random() * 1000) + 1;

        if (moneyVictim <= 0) {
          await client.sendMessage(
            {
              body: `[💔] ➜ Bạn vừa định cắm sừng ${nameVictim}, nhưng họ là người chung thủy nên bạn thất bại!`,
              mentions: [{ tag: nameVictim, id: victim }] as any,
            },
            threadID,
            messageID
          );
          return;
        }

        const messageSuccess =
          moneyVictim >= money
            ? `[💔] ➜ Bạn vừa cắm sừng ${nameVictim} thành công! Hãy giấu kỹ nhé, nếu người yêu bạn phát hiện thì toang!`
            : `[💔] ➜ Bạn vừa cắm sừng ${nameVictim} ngay trong nhóm này. Chúc mừng bạn đã trở thành một kẻ phản bội!`;

        await client.sendMessage(
          {
            body: messageSuccess,
            mentions: [{ tag: nameVictim, id: victim }] as any,
          },
          threadID,
          messageID
        );
        const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (addMoney) {
          await addMoney(victim, BigInt(-money));
          await addMoney(senderID, BigInt(money));
        }
        return;
      }

      if (moneySender <= 0) {
        await client.sendMessage(
          "[💔] ➜ Vì bạn xấu và không có tiền nên không ai cho bạn cắm sừng cả. Hãy đi trùng tu lại nhé!",
          threadID,
          messageID
        );
        return;
      }

      const half = Math.floor(moneySender / 2);

      await client.sendMessage(
        {
          body: `[💔] ➜ Bạn vừa bị xe tông khi đang đi cắm sừng và mất ${moneySender}$ để nằm viện!`,
          mentions: [{ tag: nameSender, id: senderID }] as any,
        },
        threadID,
        messageID
      );
      await client.sendMessage(
        {
          body: `[💔] ➜ Xin chia buồn với ${nameVictim}, vợ bạn vừa đánh ghen ${nameSender} khiến cái quần bay lên cây ổi!`,
          mentions: [
            { tag: nameVictim, id: victim },
            { tag: nameSender, id: senderID },
          ] as any,
        },
        threadID
      );
      const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
      if (addMoney) {
        await addMoney(senderID, BigInt(-moneySender));
        await addMoney(victim, BigInt(half));
      }
      return;
    } catch (e: any) {
      console.error("[LỖI CẮM SỪNG]:", e);
      const { client, event } = ctx;
      await client.sendMessage(
        "[💔] ➜ Đã xảy ra lỗi khi xử lý game. Vui lòng thử lại sau.",
        event.threadID,
        event.messageID
      );
    }
  },
};

export default camsungCommand;
