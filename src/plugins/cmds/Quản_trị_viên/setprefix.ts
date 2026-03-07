"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnChatContext,
  CommandOnReactContext,
  ReactData,
} from "@types";

interface ThreadDataWithPrefix {
  data?: {
    PREFIX?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface PrefixReactData extends ReactData {
  PREFIX?: string;
}

const setprefixCommand: Command = {
  name: "setprefix",
  alias: ["prefix"],
  version: "2.0.0",
  role: 1,
  desc: "Đặt lại prefix của nhóm",
  guide:
    "{pn} <prefix mới> - Đặt prefix mới cho nhóm chat\n" +
    "    {pn} reset - Đặt lại prefix về mặc định\n" +
    "    Ví dụ:\n" +
    "    {pn} !\n" +
    "    {pn} $\n" +
    "    {pn} reset",
  cd: 5,
  prefix: true,

  onReact: async (ctx: CommandOnReactContext): Promise<void> => {
    const { client, reply, event, threadData, config, Reaction, unsend } = ctx;

    try {
      const reactorID = event.userID || event.senderID;
      const reactData = Reaction as PrefixReactData;

      if (String(reactorID) !== String(reactData.author)) {
        return;
      }

      const { threadID } = event;
      const thread = (await threadData.get(String(threadID))) as ThreadDataWithPrefix | null;
      const data = thread?.data || {};

      const prefix = reactData.PREFIX;

      if (!prefix) {
        await reply("❌ Không tìm thấy prefix trong dữ liệu");
        return;
      }

      data.PREFIX = prefix;

      await threadData.update(String(threadID), { data });
      unsend(reactData.messageID || "");
      const botID = String(
        client.getCurrentUserID?.() || client.id || ""
      );
      await client.changeNickname(
        `『 ${prefix} 』 ⪼ ${config.BOTNAME}`,
        event.threadID,
        botID
      );
      await reply(`☑️ Đã thay đổi prefix của nhóm thành: ${prefix}`);
      return;
    } catch (e: any) {
      console.error("Error in setprefix onReact:", e);
      await reply("❌ Đã xảy ra lỗi khi thay đổi prefix");
      return;
    }
  },

  onCall: async (ctx: CommandOnCallContext) => {
    const { client, event, args, threadData, reply, config, main, commandName } = ctx;

    if (typeof args[0] === "undefined") {
      await reply("⚠️ Vui lòng nhập prefix mới để thay đổi prefix của nhóm");
      return;
    }

    const prefix = args[0].trim();

    if (!prefix) {
      await reply("⚠️ Vui lòng nhập prefix mới để thay đổi prefix của nhóm");
      return;
    }

    if (prefix === "reset") {
      const thread = (await threadData.get(event.threadID)) as ThreadDataWithPrefix | null;
      const data = thread?.data || {};

      const defaultPrefix = String(config.PREFIX || "");

      data.PREFIX = defaultPrefix;

      await threadData.update(event.threadID, { data });

      const uid = String(
        client.getCurrentUserID?.() || client.id || ""
      );

      if (client.changeNickname && uid) {
        await client.changeNickname(
          `『 ${defaultPrefix} 』 ⪼ ${config.BOTNAME}`,
          event.threadID,
          uid
        );
      }

      await reply(`☑️ Đã reset prefix về mặc định: ${defaultPrefix}`);
      return;
    }

    client.sendMessage(
      `📝 Bạn đang yêu cầu set prefix mới: ${prefix}\n👉 Reaction tin nhắn này để xác nhận`,
      event.threadID,
      (error: any, info: any) => {
        if (!error && info?.messageID) {
          main.onReact.set(info.messageID, {
            commandName: commandName || "setprefix",
            messageID: info.messageID,
            author: event.senderID,
            PREFIX: prefix,
          } as any);
        }
      },
      event.messageID
    );
  },

  onChat: async (ctx: CommandOnChatContext): Promise<void> => {
    const { event, threadData, config, reply } = ctx;

    const thread = (await threadData.get(event.threadID)) as ThreadDataWithPrefix | null;
    const globalPrefix = String(config.PREFIX || "");
    const prefix = thread?.data?.PREFIX || globalPrefix;

    if (event?.body && event?.body?.toLowerCase() === "prefix") {
      await reply(`⩺ Prefix của nhóm: ${prefix}`);
      return;
    }

    return;
  },
};

export default setprefixCommand;
