"use strict";

import type { Command, CommandOnCallContext } from '@types';
const formatNumber = (value: number | bigint | undefined | null): string => {
  if (value === undefined || value === null) return "0";
  if (typeof value === "bigint") {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  const num = value;
  if (!Number.isFinite(num)) return "0";
  const intVal = Math.trunc(num);
  return intVal.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
const moneyCommand: Command = {
  name: "money",
  desc: "Kiểm tra số tiền của user",
  alias: ["balance", "bal", "tien", "tiền", "checkmoney", "mon"],
  version: "1.0.0",
  role: 0,
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { client, event, args, userData, reply } = ctx;
    const { senderID, mentions } = event;
    let targetID: string | null = null;
    if (mentions && Object.keys(mentions).length > 0) {
      const mentionKeys = Object.keys(mentions);
      if (mentionKeys.length > 0 && mentionKeys[0]) {
        targetID = mentionKeys[0].replace(/\&mibextid=ZbWKwL/g, "");
      }
    } else if (event.type === "message_reply" && event.messageReply?.senderID) {
      targetID = String(event.messageReply.senderID);
    } else if (args.length > 0 && args[0]) {
      const candidate = args[0];
      try {
        new URL(candidate);
        if (client.getUID) {
          targetID = String(await (client.getUID as (url: string) => Promise<string>)(candidate));
        }
      } catch {
        if (/^\d+$/.test(candidate)) {
          targetID = candidate;
        }
      }
    }
    if (!targetID) {
      targetID = senderID || null;
    }
    if (!targetID) {
      await reply({
        body: "❌ Không thể xác định người dùng",
      });
      return;
    }
    try {
      const user = await userData.get(targetID);
      if (!user) {
        await reply({
          body: `❌ Không tìm thấy thông tin user: ${targetID}\n💡 User này chưa có dữ liệu trong hệ thống`,
        });
        return;
      }
      const money = user.money || 0;
      const isSelf = String(targetID) === String(senderID);
      let text = "";
      if (isSelf) {
        text = `Số tiền hiện tại của bạn: ${formatNumber(money)}đ`;
      } else {
        const userName = user.name || "Người dùng";
        text = `Số tiền hiện tại của ${userName}: ${formatNumber(money)}đ`;
      }
      await reply({ body: text });
    } catch (error: any) {
      await reply({
        body: `❌ Đã xảy ra lỗi khi kiểm tra tiền:\n${error?.message || error}`,
      });
    }
  },
};
export default moneyCommand;
