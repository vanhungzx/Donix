"use strict";

import type { Command, CommandOnCallContext } from "@types";
import fs from "fs-extra";
import { storagePath, STORAGE_OTHER } from "../../../core/storagePath";

interface GroupSettings {
  maxWarn: number;
  autoReset: boolean;
  resetAfterDays: number;
  notifyGroup: boolean;
  autoKick: boolean;
  banTime: number;
}

interface UserWarnData {
  warns: number;
  reason: string[];
  time: string;
  threadID?: string;
}

interface BanInfo {
  time: number;
  until: number;
}

interface CanhBaoData {
  groupSettings?: Record<string, GroupSettings>;
  bannedUsers?: Record<string, Record<string, BanInfo>>;
  [key: string]: UserWarnData | Record<string, GroupSettings> | Record<string, Record<string, BanInfo>> | undefined | any;
}

const dataPath = storagePath("other", "canhbao.json");
const dataDir = STORAGE_OTHER();

function loadData(): CanhBaoData {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  let data: CanhBaoData = {};
  try {
    if (fs.existsSync(dataPath)) {
      data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
    }
  } catch (err) {

  }

  if (!data.groupSettings) {
    data.groupSettings = {};
  }
  if (!data.bannedUsers) {
    data.bannedUsers = {};
  }

  return data;
}

function saveData(data: CanhBaoData): void {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

const canhbaoCommand: Command = {
  name: "canhbao",
  alias: ["warn", "warning"],
  version: "1.2.0",
  role: 1,
  desc: "Cảnh báo và kick người dùng ra khỏi nhóm",
  guide: `Hướng dẫn sử dụng lệnh cảnh báo:

    • list: Xem danh sách người bị cảnh báo trong nhóm

    • reset: Đặt lại số cảnh báo của thành viên

      + reset @tag: Đặt lại cảnh báo của một người

      + reset all: Đặt lại cảnh báo của tất cả

    • config: Cài đặt hệ thống cảnh báo (chỉ QTV)

      + maxwarn: Số cảnh báo tối đa

      + autoreset: Tự động reset (true/false)

      + resetdays: Số ngày để tự reset

      + notify: Thông báo nhóm (true/false)

      + autokick: Tự động kick khi đủ cảnh báo (true/false)

      + bantime: Thời gian cấm quay lại (phút)

    • info @tag: Xem thông tin cảnh báo của một người

    • unban @tag: Gỡ lệnh cấm cho người dùng

    • @tag [lý do]: Cảnh báo người dùng`,
  cd: 0,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { client, event, args, userData, permission, config, reply } = ctx;

    const data = loadData();
    const threadID = event.threadID;

    if (!data.groupSettings![threadID]) {
      data.groupSettings![threadID] = {
        maxWarn: 3,
        autoReset: false,
        resetAfterDays: 7,
        notifyGroup: true,
        autoKick: true,
        banTime: 30,
      };
    }

    const settings = data.groupSettings![threadID];


    if (args[0] === "unban") {
      const owners = Array.isArray(config.OWNER)
        ? config.OWNER.map(String)
        : config.OWNER
          ? [String(config.OWNER)]
          : [];
      const admins = Array.isArray(config.ADMIN)
        ? config.ADMIN.map(String)
        : config.ADMIN
          ? [String(config.ADMIN)]
          : [];

      if (
        permission !== 2 &&
        !admins.includes(String(event.senderID)) &&
        !owners.includes(String(event.senderID))
      ) {
        await reply("⚠️ Bạn không có quyền sử dụng lệnh này");
        return;
      }

      const mention =
        (event.mentions && Object.keys(event.mentions)[0]) ||
        (event.type === "message_reply" ? event.messageReply?.senderID : null);

      if (!mention) {
        await reply("❎ Vui lòng tag hoặc reply người cần gỡ cấm");
      }

      const mentionStr = String(mention);

      if (
        data.bannedUsers![mentionStr] &&
        data.bannedUsers![mentionStr][threadID]
      ) {
        delete data.bannedUsers![mentionStr][threadID];
        saveData(data);
        await reply(`✅ Đã gỡ lệnh cấm cho người dùng`);
      }

      await reply("❎ Người dùng này không bị cấm!");
    }


    if (
      args[0] === "config" &&
      (permission === 2 ||
        (config.ADMIN && Array.isArray(config.ADMIN)
          ? config.ADMIN.includes(event.senderID)
          : config.ADMIN === event.senderID) ||
        (config.OWNER && Array.isArray(config.OWNER)
          ? config.OWNER.includes(event.senderID)
          : config.OWNER === event.senderID))
    ) {
      const option = args[1];
      const value = args[2];

      if (!option) {
        await reply(
          `⚙️ Cài đặt hiện tại:\n` +
          `- Số cảnh báo tối đa: ${settings.maxWarn}\n` +
          `- Tự động reset: ${settings.autoReset}\n` +
          `- Reset sau: ${settings.resetAfterDays} ngày\n` +
          `- Thông báo nhóm: ${settings.notifyGroup}\n` +
          `- Tự động kick: ${settings.autoKick}\n` +
          `- Thời gian cấm: ${settings.banTime} phút\n\n` +
          `Cách dùng: canhbao config [tùy chọn] [giá trị]\n` +
          `Tùy chọn: maxwarn, autoreset, resetdays, notify, autokick, bantime`
        );
        return;
      }

      switch (option) {
        case "maxwarn":
          settings.maxWarn = parseInt(value || "3") || 3;
          break;
        case "autoreset":
          settings.autoReset = value === "true";
          break;
        case "resetdays":
          settings.resetAfterDays = parseInt(value || "7") || 7;
          break;
        case "notify":
          settings.notifyGroup = value === "true";
          break;
        case "autokick":
          settings.autoKick = value === "true";
          break;
        case "bantime":
          settings.banTime = parseInt(value || "30") || 30;
          break;
      }

      saveData(data);
      await reply("✅ Đã cập nhật cài đặt cảnh báo nhóm!");
    }


    if (args[0] === "info") {
      const mention =
        (event.mentions && Object.keys(event.mentions)[0]) ||
        (event.type === "message_reply" ? event.messageReply?.senderID : null);

      if (!mention) {
        await reply("❎ Vui lòng tag hoặc reply để xem thông tin cảnh báo");
      }

      const mentionStr = String(mention);
      const userWarns = (data[mentionStr] as UserWarnData) || {
        warns: 0,
        reason: [],
        time: "Chưa từng",
      };
      const user = await userData.get(mentionStr);
      const name = user?.name || mentionStr;
      const isBanned = data.bannedUsers![mentionStr]?.[threadID];

      await reply(
        `📊 Thông tin cảnh báo của ${name}:\n` +
        `- Số lần cảnh báo: ${userWarns.warns}/${settings.maxWarn}\n` +
        `- Lần cảnh báo cuối: ${userWarns.time}\n` +
        `- Lý do: ${userWarns.reason.join(", ") || "Không có"}\n` +
        `- Trạng thái: ${isBanned ? "⛔ Đang bị cấm" : "✅ Bình thường"}`
      );
      return;
    }


    if (args[0] === "list") {
      const list: string[] = [];

      for (const id in data) {
        if (id === "groupSettings" || id === "bannedUsers") continue;

        const warnData = data[id] as UserWarnData | undefined;
        if (
          warnData &&
          typeof warnData === "object" &&
          warnData.threadID === threadID
        ) {
          const user = await userData.get(id).catch(() => null);
          const name = user?.name || id;
          const warns = warnData.warns;
          const reason = warnData.reason.join(", ");
          const time = warnData.time;
          const isBanned = data.bannedUsers![id]?.[threadID]
            ? "⛔ Đang bị cấm"
            : "✅ Bình thường";

          const info = `👤 ${name} vi phạm ${warns}/${settings.maxWarn} lần\n📝 Nội dung: ${reason}\n⏰ Thời gian: ${time}\n📌 Trạng thái: ${isBanned}`;
          list.push(info);
        }
      }

      if (list.length === 0) {
        await reply("❎ Không có ai bị cảnh báo trong nhóm này!");
      }

      let msg = "📋 Danh sách cảnh báo trong nhóm:\n\n";
      list.forEach((info, i) => {
        msg += `${i + 1}. ${info}\n\n`;
      });

      await reply(msg);
    }


    if (args[0] === "reset") {
      const owners = Array.isArray(config.OWNER)
        ? config.OWNER.map(String)
        : config.OWNER
          ? [String(config.OWNER)]
          : [];
      const admins = Array.isArray(config.ADMIN)
        ? config.ADMIN.map(String)
        : config.ADMIN
          ? [String(config.ADMIN)]
          : [];

      if (
        permission !== 1 &&
        !admins.includes(String(event.senderID)) &&
        !owners.includes(String(event.senderID))
      ) {
        await reply("⚠️ Bạn không có quyền sử dụng lệnh này");
        return;
      }

      if (args[1] === "all") {
        Object.keys(data).forEach((id) => {
          if (id === "groupSettings" || id === "bannedUsers") return;

          const warnData = data[id] as UserWarnData | undefined;
          if (
            warnData &&
            typeof warnData === "object" &&
            warnData.threadID === threadID
          ) {
            delete data[id];
          }
        });

        if (data.bannedUsers) {
          Object.keys(data.bannedUsers).forEach((id) => {
            if (data.bannedUsers![id]?.[threadID]) {
              delete data.bannedUsers![id][threadID];
            }
          });
        }

        saveData(data);
        await reply("✅ Đã đặt lại số lần cảnh báo và lệnh cấm của tất cả thành viên!");
      }

      const mention =
        (event.mentions && Object.keys(event.mentions)[0]) ||
        (event.type === "message_reply" ? event.messageReply?.senderID : null);

      if (!mention) {
        await reply("❎ Vui lòng tag hoặc reply tin nhắn");
      }

      const mentionStr = String(mention);
      const user = await userData.get(mentionStr).catch(() => null);
      const name = user?.name || mentionStr;

      if (
        data[mentionStr] ||
        (data.bannedUsers![mentionStr] &&
          data.bannedUsers![mentionStr][threadID])
      ) {
        delete data[mentionStr];
        if (data.bannedUsers![mentionStr]) {
          delete data.bannedUsers![mentionStr][threadID];
        }
        saveData(data);
        await reply(`✅ Đã đặt lại cảnh báo và lệnh cấm của ${name}`);
      }

      await reply(`❎ ${name} chưa bị cảnh báo!`);
    }


    const mention =
      (event.mentions && Object.keys(event.mentions)[0]) ||
      (event.type === "message_reply" ? event.messageReply?.senderID : null);

    if (!mention) {
      await reply("❎ Vui lòng tag hoặc reply tin nhắn");
    }

    const mentionStr = String(mention);
    const owners = Array.isArray(config.OWNER)
      ? config.OWNER.map(String)
      : config.OWNER
        ? [String(config.OWNER)]
        : [];

    if (owners.includes(mentionStr)) {
      await reply("❎ Không thể cảnh báo Owner!");
    }

    if (data.bannedUsers![mentionStr]?.[threadID]) {
      const banInfo = data.bannedUsers![mentionStr][threadID];
      const timeLeft = Math.ceil((banInfo.until - Date.now()) / (60 * 1000));

      if (timeLeft > 0) {
        await reply(
          `⛔ Người dùng này đang bị cấm. Vui lòng thử lại sau ${timeLeft} phút.`
        );
        return;
      } else {
        delete data.bannedUsers![mentionStr][threadID];
      }
    }

    const reason =
      args
        .slice(event.mentions && Object.keys(event.mentions).length > 0 ? 1 : 0)
        .join(" ") || "Không có";
    const user = await userData.get(mentionStr).catch(() => null);
    const name = user?.name || mentionStr;

    if (!data[mentionStr]) {
      data[mentionStr] = { warns: 0, reason: [] };
    }

    const userWarns = data[mentionStr] as UserWarnData;
    userWarns.warns++;
    userWarns.threadID = threadID;
    userWarns.reason.push(reason);
    userWarns.time = new Date().toLocaleString();

    if (settings.autoReset) {
      setTimeout(() => {
        const currentData = loadData();
        if (currentData[mentionStr]) {
          delete currentData[mentionStr];
          saveData(currentData);

          if (settings.notifyGroup) {
            reply(`🔄 Tự động reset cảnh báo của ${name}`).catch(() => { });
          }
        }
      }, settings.resetAfterDays * 24 * 60 * 60 * 1000);
    }

    saveData(data);

    if (userWarns.warns >= settings.maxWarn && settings.autoKick) {

      if (!data.bannedUsers![mentionStr]) {
        data.bannedUsers![mentionStr] = {};
      }

      data.bannedUsers![mentionStr][threadID] = {
        time: Date.now(),
        until: Date.now() + settings.banTime * 60 * 1000,
      };

      try {
        await client.removeUserFromGroup(mentionStr, event.threadID);
      } catch {

      }

      await reply(
        `⛔ Đã kick ${name} (${userWarns.warns}/${settings.maxWarn} cảnh báo)\n` +
        `⏰ Không thể thêm lại trong ${settings.banTime} phút`
      );

      delete data[mentionStr];
      saveData(data);
    } else {
      await reply(
        `⚠️ ${name} bị cảnh báo (${userWarns.warns}/${settings.maxWarn})\n` +
        `📝 Lý do: ${reason}\n` +
        (settings.autoReset
          ? `🔄 Tự động reset sau ${settings.resetAfterDays} ngày`
          : "")
      );
    }
  },
};

export default canhbaoCommand;
