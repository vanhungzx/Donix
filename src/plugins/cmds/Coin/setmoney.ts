"use strict";

import type { Command, CommandOnCallContext } from '@types';
const parseAmount = (value: string): bigint | null => {
  if (!value || typeof value !== "string") return null;
  if (!isNaN(Number(value))) {
    return BigInt(Math.floor(Number(value)));
  }
  const match = value.match(/^\d+$/);
  if (match) {
    return BigInt(value);
  }
  const complexMatch = value.match(/^(\d*\.?\d*)([bkmtr]*)?(\d*)$/i);
  if (!complexMatch) return null;
  let [, mainNumber, unit, decimalPart] = complexMatch;
  let numericValue = parseFloat(mainNumber + (decimalPart ? "." + decimalPart : ""));
  if (isNaN(numericValue)) return null;

  numericValue = Math.floor(numericValue * 100);
  let baseNumber = BigInt(numericValue);

  switch (unit?.toLowerCase()) {
    case "b":
    case "tỷ":
      return (baseNumber * BigInt(1_000_000_000)) / BigInt(100);
    case "m":
    case "tr":
    case "triệu":
      return (baseNumber * BigInt(1_000_000)) / BigInt(100);
    case "k":
    case "ngàn":
      return (baseNumber * BigInt(1_000)) / BigInt(100);
    default:
      return baseNumber / BigInt(100);
  }
};

const formatCurrency = (amount: number | bigint | null | undefined): string => {
  if (amount === null || amount === undefined) return "";
  const bigIntAmount = typeof amount === "bigint" ? amount : BigInt(amount);
  const strAmount = bigIntAmount.toString();
  const addThou = (numStr: string) => numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return addThou(strAmount) + " VNĐ";
};

const setmoneyCommand: Command = {
  name: "setmoney",
  alias: ["setmon"],
  role: 2,
  desc: "Quản lý số tiền của người dùng",
  category: "Coin",
  version: "1.0.0",
  guide: `1️⃣ Thêm tiền:
    • {pn} add <số tiền> → Thêm tiền cho bản thân
    • {pn} add <số tiền> @tag → Thêm tiền cho người được tag
    Ví dụ: {pn} add 1000 @Nam

    2️⃣ Đặt số tiền:
    • {pn} set <số tiền> → Đặt số tiền cho bản thân
    • {pn} set <số tiền> @tag → Đặt số tiền cho người được tag
    Ví dụ: {pn} set 5000 @Nam

    3️⃣ Xóa tiền:
    • {pn} clean → Xóa tiền của bản thân
    • {pn} clean @tag → Xóa tiền của người được tag
    • {pn} clean all → Xóa tiền của tất cả thành viên trong nhóm

    4️⃣ Xóa toàn bộ:
    • {pn} reset → Xóa dữ liệu tiền của tất cả người dùng trong hệ thống`,
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, userData, reply, react } = ctx;
    const { senderID, mentions, messageReply, participantIDs } = event;

    const mentionID = mentions ? Object.keys(mentions) : [];
    let money: bigint | null = null;

    const moneyArg = args[1] || args[0];

    if (moneyArg && moneyArg !== "all") {
      try {
        money = parseAmount(moneyArg);
        if (money === null || money <= 0n) {
          if (react) react("❌");
          await reply({ body: "❎ Số tiền phải là một số hợp lệ và lớn hơn 0" });
          return;
        }
      } catch (e) {
        if (react) react("❌");
        await reply({ body: "❎ Số tiền không hợp lệ" });
        return;
      }
    }

    const message: string[] = [];
    const error: any[] = [];

    try {
      switch (args[0]) {
        case "add": {
          if (!money || money <= 0n) {
            if (react) react("❌");
            await reply({ body: "❎ Số tiền phải lớn hơn 0" });
            return;
          }

          if (mentionID.length > 0) {
            const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
            if (!addMoney) {
              if (react) react("❌");
              await reply({ body: "❎ Lỗi hệ thống: không thể thêm tiền" });
              return;
            }
            for (const singleID of mentionID) {
              try {
                await addMoney(singleID, money);
                message.push(singleID);
              } catch (e) {
                error.push(e);
              }
            }
            if (react) react("✅");
            await reply({
              body: `✅ Đã cộng thêm ${formatCurrency(money)} cho ${message.length} người`,
            });
            return;
          } else {
            let targetID = senderID;
            if (messageReply?.senderID) {
              targetID = String(messageReply.senderID);
            }

            const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
            if (!addMoney) {
              if (react) react("❌");
              await reply({ body: "❎ Lỗi hệ thống: không thể thêm tiền" });
              return;
            }
            try {
              await addMoney(targetID, money);
              message.push(targetID);
            } catch (e) {
              error.push(e);
            }
            if (react) react("✅");
            await reply({
              body: `✅ Đã cộng thêm ${formatCurrency(money)} cho ${targetID !== senderID ? "1 người" : "bản thân"}`,
            });
            return;
          }
        }

        case "set": {
          if (!money || money < 0n) {
            if (react) react("❌");
            await reply({ body: "❎ Số tiền phải là số dương" });
            return;
          }

          if (mentionID.length > 0) {
            const setMoney = userData.setMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
            if (!setMoney) {
              if (react) react("❌");
              await reply({ body: "❎ Lỗi hệ thống: không thể đặt tiền" });
              return;
            }
            for (const singleID of mentionID) {
              try {
                await setMoney(singleID, money);
                message.push(singleID);
              } catch (e) {
                error.push(e);
              }
            }
            if (react) react("✅");
            await reply({
              body: `✅ Đã đặt số dư thành ${formatCurrency(money)} cho ${message.length} người`,
            });
            return;
          } else {
            let targetID = senderID;
            if (messageReply?.senderID) {
              targetID = String(messageReply.senderID);
            }

            const setMoney = userData.setMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
            if (!setMoney) {
              if (react) react("❌");
              await reply({ body: "❎ Lỗi hệ thống: không thể đặt tiền" });
              return;
            }
            try {
              await setMoney(targetID, money);
              message.push(targetID);
            } catch (e) {
              error.push(e);
            }
            if (react) react("✅");
            await reply({
              body: `✅ Đã đặt số dư thành ${formatCurrency(money)} cho ${targetID !== senderID ? "1 người" : "bản thân"}`,
            });
            return;
          }
        }

        case "clean": {
          if (args[1] === "all") {
            if (!participantIDs || participantIDs.length === 0) {
              if (react) react("❌");
              await reply({ body: "❎ Không tìm thấy danh sách thành viên trong nhóm" });
              return;
            }

            const setMoney = userData.setMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
            if (!setMoney) {
              if (react) react("❌");
              await reply({ body: "❎ Lỗi hệ thống: không thể đặt tiền" });
              return;
            }
            for (const userID of participantIDs) {
              try {
                await setMoney(userID, 0n);
                message.push(userID);
              } catch (e) {
                error.push(e);
              }
            }
            if (react) react("✅");
            await reply({
              body: `✅ Đã xóa toàn bộ tiền của nhóm (${message.length} người)`,
            });
            return;
          } else if (mentionID.length > 0) {
            const setMoney = userData.setMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
            if (!setMoney) {
              if (react) react("❌");
              await reply({ body: "❎ Lỗi hệ thống: không thể đặt tiền" });
              return;
            }
            for (const singleID of mentionID) {
              try {
                await setMoney(singleID, 0n);
                message.push(singleID);
              } catch (e) {
                error.push(e);
              }
            }
            if (react) react("✅");
            await reply({
              body: `✅ Đã xóa tiền của ${message.length} người`,
            });
            return;
          } else {
            let targetID = senderID;
            if (messageReply?.senderID) {
              targetID = String(messageReply.senderID);
            }

            const setMoney = userData.setMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
            if (!setMoney) {
              if (react) react("❌");
              await reply({ body: "❎ Lỗi hệ thống: không thể đặt tiền" });
              return;
            }
            try {
              await setMoney(targetID, 0n);
              message.push(targetID);
            } catch (e) {
              error.push(e);
            }
            if (react) react("✅");
            await reply({
              body: `✅ Đã xóa tiền của ${targetID !== senderID ? "1 người" : "bản thân"}`,
            });
            return;
          }
        }

        case "reset": {
          const idAll = userData.idAll as (() => Promise<string[]>) | undefined;
          if (!idAll) {
            if (react) react("❌");
            await reply({ body: "❎ Lỗi hệ thống: không thể lấy danh sách người dùng" });
            return;
          }
          const allUserIDs = await idAll();

          const setMoney = userData.setMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
          if (!setMoney) {
            if (react) react("❌");
            await reply({ body: "❎ Lỗi hệ thống: không thể đặt tiền" });
            return;
          }
          for (const userID of allUserIDs) {
            try {
              await setMoney(userID, 0n);
              message.push(userID);
            } catch (e) {
              error.push(e);
            }
          }
          if (react) react("✅");
          await reply({
            body: `✅ Đã xóa toàn bộ dữ liệu tiền của ${message.length} người`,
          });
          return;
        }

        default: {
          if (!money || money <= 0n) {
            if (react) react("❌");
            await reply({ body: "❎ Số tiền phải lớn hơn 0" });
            return;
          }

          if (mentionID.length > 0) {
            const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
            if (!addMoney) {
              if (react) react("❌");
              await reply({ body: "❎ Lỗi hệ thống: không thể thêm tiền" });
              return;
            }
            for (const singleID of mentionID) {
              try {
                await addMoney(singleID, money);
                message.push(singleID);
              } catch (e) {
                error.push(e);
              }
            }
            if (react) react("✅");
            await reply({
              body: `✅ Đã cộng thêm ${formatCurrency(money)} cho ${message.length} người`,
            });
            return;
          } else {
            let targetID = senderID;
            if (messageReply?.senderID) {
              targetID = String(messageReply.senderID);
            }

            const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
            if (!addMoney) {
              if (react) react("❌");
              await reply({ body: "❎ Lỗi hệ thống: không thể thêm tiền" });
              return;
            }
            try {
              await addMoney(targetID, money);
              message.push(targetID);
            } catch (e) {
              error.push(e);
            }
            if (react) react("✅");
            await reply({
              body: `✅ Đã cộng thêm ${formatCurrency(money)} cho ${targetID !== senderID ? "1 người" : "bản thân"}`,
            });
            return;
          }
        }
      }
    } catch (e: any) {
      console.error(e);
      if (react) react("❌");
      await reply({ body: "❎ Đã xảy ra lỗi, vui lòng thử lại sau" });
    }
  },
};

export default setmoneyCommand;
