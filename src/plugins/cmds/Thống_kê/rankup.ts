"use strict";

import type { Command, CommandOnCallContext, CommandOnEventContext } from "@types";

interface SendMessageOptions {
  body?: string;
  mentions?: { tag: string; id: string }[];
}

interface ThreadDataWithRankup {
  data?: {
    rankup?: boolean;
    customRankup?: string;
  };
}

interface UserDataWithExp {
  exp?: number | bigint;
  name?: string;
}

// Công thức tính level từ exp
function calculateLevel(exp: number): number {
  if (isNaN(exp) || exp < 0) return 1;
  return Math.floor(Math.sqrt(1 + (4 * exp) / 3 + 1) / 2);
}

// Tính exp tối thiểu cần để đạt level
function expForLevel(level: number): number {
  if (level <= 1) return 0;
  // Đảo ngược công thức: level = floor((sqrt(1 + 4*exp/3 + 1) / 2))
  // => exp = 3 * ((2 * level)^2 - 2) / 4
  return Math.ceil((3 * ((2 * level) ** 2 - 2)) / 4);
}

const rankupCommand: Command = {
  name: "rankup",
  alias: ["rankup"],
  version: "1.0.1",
  role: 1,
  desc: "Thông báo rankup cho từng nhóm, người dùng",
  guide:
    "• {pn}: Bật/tắt thông báo rankup\n" +
    "• {pn} check: Xem thông tin level hiện tại\n" +
    "• Khi bật: Bot sẽ thông báo khi user lên level\n" +
    "• Khi tắt: Bot sẽ không thông báo rankup",
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, threadData, userData, reply, args } = ctx;
    const { threadID, senderID } = event;
    const tid = String(threadID);
    const sid = String(senderID);

    try {
      // Lấy thông tin user để hiển thị level
      const user = (await userData.get(sid)) as UserDataWithExp | null;
      const currentExp = user ? Number(user.exp || 0) : 0;
      const currentLevel = calculateLevel(currentExp);
      const nextLevel = currentLevel + 1;
      const expForNextLevel = expForLevel(nextLevel);
      const expNeeded = Math.max(0, expForNextLevel - currentExp);

      // Nếu là subcommand "check", chỉ hiển thị thông tin
      if (args[0]?.toLowerCase() === "check") {
        const getName = userData.getName?.bind(userData) as
          | ((sid: string) => Promise<string | undefined>)
          | undefined;
        const userName = user?.name || (getName ? (await getName(sid)) || "Bạn" : "Bạn");

        const thread = (await threadData.get(tid)) as ThreadDataWithRankup | null;
        const data = thread?.data || {};
        const rankupStatus = data.rankup === true ? "✅ Đã bật" : "❌ Đã tắt";

        const checkMessage =
          `📊 Thông tin Rankup - ${userName}\n\n` +
          `🎯 Level hiện tại: ${currentLevel}\n` +
          `⭐ EXP hiện tại: ${currentExp.toLocaleString()}\n` +
          `📈 EXP cần để lên level ${nextLevel}: ${expNeeded.toLocaleString()}\n` +
          `📝 Trạng thái thông báo: ${rankupStatus}`;

        await reply(checkMessage);
        return;
      }

      // Toggle rankup (mặc định là false/tắt)
      const thread = (await threadData.get(tid)) as ThreadDataWithRankup | null;
      const data = thread?.data || {};

      let statusMessage = "";
      if (data.rankup === true) {
        data.rankup = false;
        statusMessage = "❌ Đã tắt thông báo rankup!";
      } else {
        data.rankup = true;
        statusMessage = "✅ Đã bật thông báo rankup!";
      }

      await threadData.update(tid, { data });

      // Hiển thị thông tin level
      const infoMessage =
        `\n\n📊 Thông tin Level:\n` +
        `• Level hiện tại: ${currentLevel}\n` +
        `• EXP hiện tại: ${currentExp.toLocaleString()}\n` +
        `• EXP cần để lên level ${nextLevel}: ${expNeeded.toLocaleString()}`;

      await reply(statusMessage + infoMessage);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Không thể cập nhật cài đặt";
      await reply(`❌ Lỗi: ${errorMessage}`);
    }
  },

  async onEvent(ctx: CommandOnEventContext): Promise<void> {
    const { event, userData, threadData, client, send, config, unsend } = ctx;

    // Chỉ xử lý message events
    if (!event.isGroup || event.senderID === client.id) return;

    const tid = String(event.threadID);
    const sid = String(event.senderID);

    try {
      // Kiểm tra cài đặt rankup của nhóm (mặc định là false/tắt)
      const thread = (await threadData.get(tid)) as ThreadDataWithRankup | null;
      const threadData_obj = thread?.data || {};

      // Nếu rankup bị tắt hoặc chưa được bật, chỉ cộng exp không thông báo
      const user = (await userData.get(sid)) as UserDataWithExp | null;
      const currentExp = user ? Number(user.exp || 0) : 0;
      const newExp = currentExp + 1;

      await userData.update(sid, { exp: newExp });

      if (threadData_obj.rankup !== true) {
        // Rankup tắt: chỉ cộng exp, không thông báo
        return;
      }

      if (!user || isNaN(currentExp)) return;

      // Tính level hiện tại và level mới
      const curLevel = calculateLevel(currentExp);
      const newLevel = calculateLevel(newExp);

      // Kiểm tra nếu lên level
      if (newLevel > curLevel && newLevel !== 1) {
        const getName = userData.getName?.bind(userData) as
          | ((sid: string) => Promise<string | undefined>)
          | undefined;

        const userName =
          user.name || (getName ? (await getName(sid)) || "Người dùng" : "Người dùng");

        // Lấy custom message hoặc dùng mặc định
        const customMessage = threadData_obj.customRankup;
        let message =
          customMessage ||
          "Trình độ chém gió của {name} đã đạt tới level {level}";

        message = message
          .replace(/\{name}/g, userName)
          .replace(/\{level}/g, String(newLevel));

        // Gửi thông báo (chỉ text)
        const sendOptions: SendMessageOptions = {
          body: message,
          mentions: [{ tag: userName, id: sid }],
        };

        try {
          const sentInfo = await send(sendOptions);

          // Auto unsend nếu được bật
          const rankupConfig = (config as {
            rankup?: { autoUnsend?: boolean; unsendMessageAfter?: number };
          })?.rankup;

          const autoUnsend = rankupConfig?.autoUnsend !== false;
          const unsendAfter = rankupConfig?.unsendMessageAfter || 10;

          if (
            autoUnsend &&
            sentInfo &&
            "messageID" in sentInfo &&
            typeof sentInfo.messageID === "string"
          ) {
            setTimeout(async () => {
              try {
                if (unsend) {
                  await unsend(sentInfo.messageID as string, tid);
                }
              } catch {
                // Ignore unsend errors
              }
            }, unsendAfter * 1000);
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          console.error(`[rankup] Send error: ${errorMessage}`);
        }
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[rankup] Error: ${errorMessage}`);
    }
  },
};

export default rankupCommand;
