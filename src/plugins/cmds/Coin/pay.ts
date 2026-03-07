import type { Command, CommandOnCallContext } from "@types";

const toBI = (v: any): bigint => {
  if (typeof v === "bigint") return v;
  if (typeof v === "string") return BigInt(v.trim());
  if (typeof v === "number") return BigInt(Math.floor(v));
  if (v == null) return 0n;
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
};

const parseAmount = (value: string | undefined, balance: bigint): bigint | null => {
  if (!value) return null;

  if (String(value).toLowerCase() === "all") return balance;

  const percentMatch = String(value).match(/^(\d+(\.\d+)?)%$/);
  if (percentMatch && percentMatch[1]) {
    const p = Math.floor(parseFloat(percentMatch[1]) * 100);
    if (p <= 0 || p > 10000) return null;
    const b = toBI(balance);
    return (b * BigInt(p)) / 100n;
  }

  if (!isNaN(Number(value))) return BigInt(Math.floor(Number(value)));

  const match = String(value).match(/^\d+$/);
  if (match) return BigInt(value);

  const complexMatch = String(value).match(/^(\d*\.?\d*)([bkmtrịệũngàntriệu|tr|ngàn|tỷ]*)?(\d*)$/i);
  if (!complexMatch) return null;

  let [, mainNumber, unit, decimalPart] = complexMatch;
  let numericValue = parseFloat(mainNumber + (decimalPart ? "." + decimalPart : ""));
  if (isNaN(numericValue)) return null;

  numericValue = Math.floor(numericValue * 100);
  let baseNumber = BigInt(numericValue);

  switch ((unit || "").toLowerCase()) {
    case "b":
    case "tỷ":
      return (baseNumber * 1000000000n) / 100n;
    case "m":
    case "tr":
    case "triệu":
      return (baseNumber * 1000000n) / 100n;
    case "k":
    case "ngàn":
      return (baseNumber * 1000n) / 100n;
    default:
      return baseNumber / 100n;
  }
};

const formatCurrency = (amount: bigint | number | string): string => {
  const big = toBI(amount);
  const s = big.toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " VNĐ";
};

const feeCeil = (coinsBI: bigint, pct: number): bigint => {
  return (coinsBI * BigInt(pct) + 99n) / 100n;
};

const maxTransferForAll = (balanceBI: bigint, pct: number): bigint => {
  return (balanceBI * 100n) / (100n + BigInt(pct));
};

async function onCall(ctx: CommandOnCallContext): Promise<void> {
  const { event, reply, userData, args } = ctx;
  const { senderID, mentions } = event;

  const transactionFeePercentage = 5;

  async function handleTransfer(recipientID: string, coins: bigint, name: string, isAll: boolean = false): Promise<void> {
    const senderData = await userData.get(senderID);
    if (!senderData) {
      await reply("❎ Không tìm thấy thông tin người gửi!");
      return;
    }

    let balance = toBI(senderData.money);
    let amount = toBI(coins);

    if (isAll) {
      amount = maxTransferForAll(balance, transactionFeePercentage);
    }

    let fee = feeCeil(amount, transactionFeePercentage);

    if (amount <= 0n || fee < 0n || amount + fee > balance) {
      await reply("❎ Số tiền bạn muốn chuyển lớn hơn số tiền bạn hiện có hoặc không hợp lệ!");
      return;
    }

    await reply(
      {
        body: `✅ Bạn đã chuyển ${formatCurrency(amount)} cho ${name}\n🧮 Phí giao dịch là ${transactionFeePercentage}% (${formatCurrency(fee)})`,
        mentions: [{ tag: name, id: recipientID }],
      },
      async () => {
        await (userData as any).addMoney(recipientID, amount);
        await (userData as any).delMoney(senderID, amount + fee);
      }
    );
  }

  if (!args[0]) {
    await reply("❎ Vui lòng nhập số tiền hoặc phần trăm muốn chuyển");
    return;
  }

  const senderData = await userData.get(senderID);
  if (!senderData) {
    await reply("❎ Không tìm thấy thông tin người gửi!");
    return;
  }

  const balanceRaw = senderData.money;
  const balance = toBI(balanceRaw);

  if (event.messageReply) {
    const isAll = String(args[0]).toLowerCase() === "all";
    const coins = parseAmount(isAll ? "all" : args[0], balance);

    if (coins === null) {
      await reply("❎ Nội dung bạn nhập không phải là 1 con số hoặc phần trăm hợp lệ!");
      return;
    }

    const recipientID = event.messageReply.senderID;
    if (!recipientID) {
      await reply("❎ Không thể xác định người nhận tiền!");
      return;
    }

    const recipientData = await userData.get(String(recipientID));
    if (!recipientData) {
      await reply("❎ Không tìm thấy thông tin người nhận!");
      return;
    }

    await handleTransfer(String(recipientID), coins, recipientData.name || "Người dùng", isAll);
  } else if (mentions && Object.keys(mentions).length > 0) {
    const mentionKeys = Object.keys(mentions);
    const mention = mentionKeys[0];
    if (!mention) {
      await reply("❎ Không thể xác định người nhận tiền!");
      return;
    }
    const nameLength = String(mentions[mention] || "").split(" ").length;
    const isAll = String(args[0]).toLowerCase() === "all";
    const coins = parseAmount(isAll ? "all" : args[nameLength], balance);

    if (coins === null) {
      await reply("❎ Vui lòng nhập số tiền hoặc phần trăm hợp lệ");
      return;
    }

    const namePay = String(mentions[mention] || "").replace(/@/g, "");
    await handleTransfer(String(mention), coins, namePay, isAll);
  } else {
    await reply("❎ Vui lòng tag hoặc reply tin nhắn của người muốn chuyển tiền!");
  }
}

const payCommand: Command = {
  name: "pay",
  alias: ["chuyentien"],
  version: "1.3.1",
  role: 0,
  desc: "Chuyển tiền của bản thân cho ai đó",
  guide:
    "1. Tag người nhận và số tiền:\n" +
    "   {pn} @tên_người_nhận [số tiền/phần trăm]\n\n" +
    "2. Sử dụng đơn vị tiền tệ:\n" +
    "   {pn} @tên_người_nhận [số tiền][đơn vị]\n" +
    "   Đơn vị: k (nghìn), m/tr (triệu), b (tỷ)\n\n" +
    "   Ví dụ: {pn} @tên_người_nhận 100k\n\n" +
    "3. Sử dụng phần trăm:\n" +
    "   {pn} @tên_người_nhận [số]%\n\n" +
    "4. Reply tin nhắn:\n" +
    "   Reply tin nhắn người nhận và gõ: {pn} [số tiền/phần trăm]\n\n" +
    "5. Chuyển toàn bộ số dư:\n" +
    "   {pn} all @tên_người_nhận hoặc reply với all",
  cd: 5,
  prefix: true,
  onCall,
};

export default payCommand;
