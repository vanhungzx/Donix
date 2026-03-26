"use strict";

import type { Command, CommandOnCallContext } from '@types';
const parseAmount = (value: string): bigint | null => {
  if (!value || typeof value !== "string") return null;

  // Remove common formatting and trailing currency.
  let s = value.trim().replace(/,/g, "");
  s = s.replace(/\s*(vnđ|vnd)\s*$/i, "");

  const m = s.match(/^(-?\d+(?:\.\d+)?)(?:\s*([a-zA-ZÀ-ỹ]+))?$/i);
  if (!m) return null;

  const numPart = m[1];
  const unitRaw = (m[2] || "").toLowerCase();

  // Parse as "cents" (x * 100) via string => BigInt to avoid precision loss.
  const negative = numPart.startsWith("-");
  const unsignedNum = negative ? numPart.slice(1) : numPart;
  const [intStr, fracStr = ""] = unsignedNum.split(".");

  if (!/^\d+$/.test(intStr) || (fracStr && !/^\d+$/.test(fracStr))) return null;

  const frac2 = fracStr.padEnd(2, "0").slice(0, 2); // truncate after 2 decimals
  const cents = BigInt(intStr) * 100n + BigInt(frac2);

  const mul =
    unitRaw === "b" || unitRaw === "tỷ" || unitRaw === "ty"
      ? 1_000_000_000n
      : unitRaw === "m" || unitRaw === "tr" || unitRaw === "triệu"
        ? 1_000_000n
        : unitRaw === "k" || unitRaw === "ngàn" || unitRaw === "ngan" || unitRaw === "nghìn" || unitRaw === "nghin"
          ? 1_000n
          : unitRaw === ""
            ? 1n
            : null;

  if (mul === null) return null;
  const out = (cents * mul) / 100n;
  return negative ? -out : out;
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

    3️⃣ Reset tiền (xóa tiền):
    • {pn} clean|rs → Reset tiền của bản thân
    • {pn} clean|rs @tag → Reset tiền của người được tag
    • {pn} clean|rs box|group → Reset tiền của tất cả thành viên trong nhóm
    • {pn} clean|rs all → Reset tiền của toàn server (tất cả user trong hệ thống)

    4️⃣ Xóa toàn bộ:
    • {pn} reset → Xóa dữ liệu tiền của tất cả người dùng trong hệ thống`,
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, userData, reply, react } = ctx;
    const { senderID, mentions, messageReply, participantIDs } = event;

    const mentionID = mentions ? Object.keys(mentions) : [];
    let money: bigint | null = null;

    const action = String(args[0] || "").toLowerCase();
    const shouldParseMoney = action !== "clean" && action !== "rs" && action !== "reset";

    if (shouldParseMoney) {
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

        case "clean":
        case "rs": {
          const sub = (args[1] || "").toLowerCase();

          if (sub === "all") {
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
              body: `✅ Đã reset tiền của toàn server (${message.length} người)`,
            });
            return;
          }

          if (sub === "box" || sub === "group") {
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
              body: `✅ Đã reset tiền của nhóm (${message.length} người)`,
            });
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
