import type { BotConfig, ExtendedMessageEvent, FacebookClient, ThreadDataModel, UserDataModel } from "@types";
import fs from "fs-extra";
import moment from "moment-timezone";
import path from "path";
const KEY_PATH = path.join(process.cwd(), "src/storage/rent/keys.json");
const RENT_PATH = path.join(process.cwd(), "src/storage/rent/rent.json");
const FMT = "DD/MM/YYYY";
interface KeyData {
  key: string;
  createdDate?: string;
  expiryDate: string;
  duration?: string;
  type?: "activate" | "renew";
  used?: boolean;
  groupId?: string;
}
interface RentData {
  threadID: string;
  userID?: string;
  startDate?: string;
  endDate: string;
  key?: string | null;
}
const load = <T>(p: string, d: T = [] as T): T => {
  if (!fs.existsSync(p)) return d;
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw || "[]") as T;
  } catch {
    return d;
  }
};
const save = (p: string, v: unknown): void => {
  fs.writeFileSync(p, JSON.stringify(v, null, 2));
};

export async function applyRentKey({
  client,
  event,
  threadData,
  userData,
  config,
}: {
  client: FacebookClient;
  event: ExtendedMessageEvent;
  threadData: ThreadDataModel;
  userData: UserDataModel;
  config: BotConfig;
}): Promise<void> {
  const body = String(event.body || "").trim().toLowerCase();
  if (!/^donix_(?:giahan_)?[a-z0-9]{6}$/.test(body)) return;

  let keys: KeyData[] = load(KEY_PATH, []);
  const k = keys.find((x) => String(x.key).toLowerCase() === body);
  if (!k) {
    await client.sendMessage("❎ Key không hợp lệ!", event.threadID);
    return;
  }

  const typ = k.type === "renew" ? "renew" : body.startsWith("donix_giahan_") ? "renew" : "activate";

  if (k.used) {
    if (String(k.groupId) === String(event.threadID)) {
      await client.sendMessage(`❎ Key đã được sử dụng cho nhóm này rồi!`, event.threadID);
    } else {
      await client.sendMessage(`❎ Key đã được sử dụng cho nhóm: ${k.groupId}`, event.threadID);
    }
    return;
  }

  const now = moment.tz("Asia/Ho_Chi_Minh");
  const keyExp = moment(k.expiryDate, FMT, true);
  if (!keyExp.isValid() || keyExp.isBefore(now, "day")) {
    await client.sendMessage("❎ Key đã hết hạn!", event.threadID);
    return;
  }

  const rent: RentData[] = load(RENT_PATH, []);
  const i = rent.findIndex((r) => String(r.threadID) === String(event.threadID));

  if (typ === "renew" && i === -1) {
    await client.sendMessage("❎ Nhóm chưa kích hoạt. Vui lòng dùng key kích hoạt trước.", event.threadID);
    return;
  }

  if (typ === "activate" && i !== -1) {
    await client.sendMessage("❎ Nhóm đã có data thuê bot. Vui lòng dùng key gia hạn thay vì key kích hoạt.", event.threadID);
    return;
  }

  if (typ === "renew") {
    const m = String(k.duration || "").match(/^(\d+)\s+(days|months)$/i);
    if (!m) {
      await client.sendMessage("❎ Key không có thời hạn hợp lệ!", event.threadID);
      return;
    }
  }

  k.used = true;
  k.groupId = String(event.threadID);
  save(KEY_PATH, keys);

  try {
    let msgTitle = "";

    if (typ === "activate") {
      const end = keyExp;
      rent.push({
        threadID: event.threadID,
        userID: event.senderID,
        startDate: now.format(FMT),
        endDate: end.format(FMT),
        key: k.key,
      });
      msgTitle = "Kích hoạt key";
    } else {
      const m = String(k.duration || "").match(/^(\d+)\s+(days|months)$/i);
      const addNum = parseInt(m![1], 10);
      const addUnit = m![2].toLowerCase() as "days" | "months";
      const curEnd = moment(rent[i].endDate, FMT, true);
      const base = curEnd.isValid() && !now.isAfter(curEnd, "day") ? curEnd : now;

      if (base === now) {
        rent[i].startDate = now.format(FMT);
      }

      const newEnd = base.clone().add(addNum, addUnit);
      rent[i].endDate = newEnd.format(FMT);
      rent[i].userID = event.senderID;
      rent[i].key = k.key;

      msgTitle = "Gia hạn bằng key";
    }

    save(RENT_PATH, rent);

    let uName = "";
    try {
      const getNameFn = (userData as { getName?: (userID: string | number) => Promise<string | undefined> }).getName;
      if (typeof getNameFn === 'function') {
        uName = await getNameFn(event.senderID) || "";
      } else {
        const user = await userData.get(event.senderID);
        uName = user?.name || "";
      }
    } catch {
      uName = "";
    }

    const tInfo = await threadData.get(event.threadID).catch(() => null);

    const threadInfo = tInfo?.threadInfo;
    const threadName = threadInfo && typeof threadInfo === 'object' && 'threadName' in threadInfo && typeof threadInfo.threadName === 'string' ? threadInfo.threadName : undefined;
    const gName = threadName || "Không rõ";
    const userName = uName || "Không xác định";
    const cur = rent.find((r) => String(r.threadID) === String(event.threadID));

    const msgAdmin = `🔔 ${msgTitle}\n• Key: ${k.key}\n• Loại: ${typ === "renew" ? "Gia hạn" : "Kích hoạt"}\n• Nhóm: ${gName} (${event.threadID})\n• Bởi: ${userName} (${event.senderID})\n• Hết hạn: ${cur?.endDate || ""}`;
    const msgGroup = `✅ ${typ === "renew" ? "Gia hạn thành công" : "Kích hoạt thành công"}\n📆 Hết hạn: ${cur?.endDate || ""}\n👤 Bởi: ${userName}`;

    const box = (config as { BOX_ADMIN?: string }).BOX_ADMIN;

    const sendPromises: Promise<unknown>[] = [
      client.sendMessage(msgGroup, event.threadID),
    ];

    if (box && typeof box === 'string') {
      sendPromises.push(client.sendMessage(msgAdmin, box));
    }

    await Promise.all(sendPromises);
  } catch (e) {
    console.error(e);
    await client.sendMessage(`❎ Có lỗi xảy ra khi xử lý key: ${String(e || "")}`, event.threadID);
  }
}
