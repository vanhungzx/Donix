"use strict";

import type { Command, CommandOnCallContext, FacebookClient, UserDataModel } from "@types";
import fs from "fs-extra";
import path from "path";
import { storagePath } from "../../../core/storagePath";
import { getCleanupManager } from "../../../core/managers/cleanupManager";

interface Countdown {
  id: string;
  threadID: string;
  userID: string;
  userName: string;
  eventName: string;
  targetDate: number;
  createdAt: number;
  active: boolean;
}

const countdownStoragePath = storagePath("other", "countdowns.json");

let countdowns: Countdown[] = [];
let checkInterval: NodeJS.Timeout | null = null;
let unregisterCleanup: (() => void) | null = null;

type CountdownCommandContext = CommandOnCallContext & {
  userData: UserDataModel;
  client: FacebookClient;
  event: CommandOnCallContext["event"] & { isAdmin?: boolean };
};


async function loadCountdowns(): Promise<void> {
  try {
    await fs.ensureDir(path.dirname(countdownStoragePath));
    if (await fs.pathExists(countdownStoragePath)) {
      const data = await fs.readJson(countdownStoragePath);
      countdowns = Array.isArray(data) ? data.filter((c: Countdown) => c.active) : [];
    }
  } catch (e) {
    console.error("Error loading countdowns:", e);
    countdowns = [];
  }
}


async function saveCountdowns(): Promise<void> {
  try {
    await fs.writeJson(countdownStoragePath, countdowns, { spaces: 2 });
  } catch (e) {
    console.error("Error saving countdowns:", e);
  }
}


function parseTimeInput(input: string): number | null {
  const now = Date.now();
  const lower = input.toLowerCase().trim();


  const dateMatch = lower.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (dateMatch) {
    const year = dateMatch[1];
    const month = dateMatch[2];
    const day = dateMatch[3];
    const hour = dateMatch[4] ?? "0";
    const minute = dateMatch[5] ?? "0";

    if (year && month && day) {
      const date = new Date(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        parseInt(hour, 10),
        parseInt(minute, 10)
      );
      if (!isNaN(date.getTime())) {
        return date.getTime();
      }
    }
  }


  const timeMatch = lower.match(/(?:(\d+)d)?\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?/);
  if (timeMatch) {
    const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = timeMatch;
    const totalMs =
      parseInt(days) * 24 * 60 * 60 * 1000 +
      parseInt(hours) * 60 * 60 * 1000 +
      parseInt(minutes) * 60 * 1000 +
      parseInt(seconds) * 1000;
    if (totalMs > 0) {
      return now + totalMs;
    }
  }


  const relativeMatch = lower.match(/^(\d+)\s*(minute|minutes|hour|hours|day|days|h|m|d|s|giây|phút|giờ|ngày)$/);
  if (relativeMatch) {
    const amount = relativeMatch[1];
    const unit = relativeMatch[2];

    if (amount && unit) {
      const num = parseInt(amount, 10);
      let ms = 0;

      if (/^(minute|minutes|m|phút)$/i.test(unit)) {
        ms = num * 60 * 1000;
      } else if (/^(hour|hours|h|giờ)$/i.test(unit)) {
        ms = num * 60 * 60 * 1000;
      } else if (/^(day|days|d|ngày)$/i.test(unit)) {
        ms = num * 24 * 60 * 60 * 1000;
      } else if (/^(s|giây)$/i.test(unit)) {
        ms = num * 1000;
      }

      if (ms > 0) {
        return now + ms;
      }
    }
  }

  return null;
}


function formatTimeRemaining(ms: number): string {
  if (ms <= 0) {
    return "Đã hết hạn";
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} ngày`);
  }
  if (hours % 24 > 0) {
    parts.push(`${hours % 24} giờ`);
  }
  if (minutes % 60 > 0) {
    parts.push(`${minutes % 60} phút`);
  }
  if (seconds % 60 > 0 && days === 0 && hours === 0) {
    parts.push(`${seconds % 60} giây`);
  }

  return parts.length > 0 ? parts.join(" ") : "Sắp đến";
}


function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}


async function checkCountdowns(client: FacebookClient): Promise<void> {
  const now = Date.now();
  const expired: Countdown[] = [];

  for (const cd of countdowns) {
    if (!cd.active) continue;

    if (cd.targetDate <= now) {
      expired.push(cd);
      cd.active = false;

      try {
        await client.sendMessage(
          {
            body: `⏰ ĐẾM NGƯỢC ĐÃ KẾT THÚC!\n\n` +
              `📅 Sự kiện: ${cd.eventName}\n` +
              `👤 Người tạo: ${cd.userName}\n` +
              `⏰ Thời gian: ${formatDate(cd.targetDate)}\n\n` +
              `🎉 Đã đến lúc!`
          },
          cd.threadID
        );
      } catch (e) {
        console.error("Error sending countdown notification:", e);
      }
    }
  }

  if (expired.length > 0) {
    await saveCountdowns();
  }
}


function startCountdownChecker(client: FacebookClient): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }

  // Unregister cleanup cũ nếu có
  if (unregisterCleanup) {
    unregisterCleanup();
    unregisterCleanup = null;
  }

  checkInterval = setInterval(() => {
    checkCountdowns(client).catch(console.error);
  }, 60000);

  // Đăng ký cleanup timer
  const cleanupManager = getCleanupManager();
  unregisterCleanup = cleanupManager.registerTimer(
    "countdown-checker",
    checkInterval,
    3 // Priority trung bình
  );

  // Unref để không giữ process alive
  if (typeof checkInterval.unref === "function") {
    checkInterval.unref();
  }
}

const countdownCommand: Command = {
  name: "countdown",
  alias: ["demnguoc", "cd", "timer"],
  version: "1.0.0",
  role: 0,
  desc: "Tạo đếm ngược đến một sự kiện",
  guide:
    "   {pn} create <tên sự kiện> <thời gian>\n" +
    "   {pn} list - Xem danh sách đếm ngược\n" +
    "   {pn} delete <id> - Xóa đếm ngược\n" +
    "   {pn} view <id> - Xem chi tiết đếm ngược\n\n" +
    "   📅 Định dạng thời gian:\n" +
    "   • YYYY-MM-DD HH:MM (ví dụ: 2024-12-31 23:59)\n" +
    "   • Xd Xh Xm (ví dụ: 5d 3h 30m)\n" +
    "   • X minutes/hours/days (ví dụ: 2 hours)\n\n" +
    "   Ví dụ:\n" +
    "   • {pn} create Năm mới 2024-12-31 23:59\n" +
    "   • {pn} create Sinh nhật 5d 2h\n" +
    "   • {pn} create Deadline 3 hours",
  cd: 3,
  prefix: true,
  async onCall(rawCtx: CommandOnCallContext): Promise<void> {
    const ctx = rawCtx as CountdownCommandContext;
    const { client, event, args, reply, userData } = ctx;

    try {
      await loadCountdowns();


      if (!checkInterval) {
        startCountdownChecker(client);
      }

      const action = args[0]?.toLowerCase() || "help";
      const threadID = String(event.threadID);
      const userID = String(event.senderID);


      const user = await userData.get(userID);
      const userName = user?.name || "Người dùng";

      if (action === "create" || action === "tao" || action === "new") {
        if (args.length < 3) {
          await reply({
            body: "❌ Thiếu tham số!\n\n" +
              "📖 Cú pháp: {pn} create <tên sự kiện> <thời gian>\n\n" +
              "📅 Ví dụ:\n" +
              "• {pn} create Năm mới 2024-12-31 23:59\n" +
              "• {pn} create Sinh nhật 5d 2h\n" +
              "• {pn} create Deadline 3 hours"
          });
          return;
        }

        const eventName = args.slice(1, -1).join(" ");
        const timeInput = args[args.length - 1];

        if (!timeInput) {
          await reply({
            body: "❌ Vui lòng nhập thời gian!"
          });
          return;
        }

        const targetDate = parseTimeInput(timeInput);

        if (!targetDate || targetDate <= Date.now()) {
          await reply({
            body: "❌ Thời gian không hợp lệ hoặc đã qua!\n\n" +
              "💡 Thời gian phải là tương lai. Ví dụ:\n" +
              "• 2024-12-31 23:59\n" +
              "• 5d 3h 30m\n" +
              "• 2 hours"
          });
          return;
        }

        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const countdown: Countdown = {
          id,
          threadID,
          userID,
          userName,
          eventName,
          targetDate,
          createdAt: Date.now(),
          active: true
        };

        countdowns.push(countdown);
        await saveCountdowns();

        const timeRemaining = formatTimeRemaining(targetDate - Date.now());

        await reply({
          body: `✅ ĐÃ TẠO ĐẾM NGƯỢC\n\n` +
            `📅 Sự kiện: ${eventName}\n` +
            `⏰ Thời gian đích: ${formatDate(targetDate)}\n` +
            `⏳ Còn lại: ${timeRemaining}\n` +
            `🆔 ID: ${id}\n\n` +
            `💡 Dùng {pn} view ${id} để xem chi tiết`
        });

      } else if (action === "list" || action === "danhsach" || action === "ls") {
        const threadCountdowns = countdowns.filter(
          (c) => c.threadID === threadID && c.active
        );

        if (threadCountdowns.length === 0) {
          await reply({
            body: "📋 Chưa có đếm ngược nào trong nhóm này.\n\n" +
              "💡 Dùng {pn} create <tên> <thời gian> để tạo mới!"
          });
          return;
        }

        let listText = `📋 DANH SÁCH ĐẾM NGƯỢC (${threadCountdowns.length})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        threadCountdowns.forEach((cd, index) => {
          const remaining = formatTimeRemaining(cd.targetDate - Date.now());
          const shortId = cd.id.split("-")[1] || cd.id.substring(0, 8);

          listText += `${index + 1}. ${cd.eventName}\n`;
          listText += `   ⏳ Còn lại: ${remaining}\n`;
          listText += `   🆔 ID: ${shortId}\n`;
          listText += `   👤 Tạo bởi: ${cd.userName}\n\n`;
        });

        listText += `💡 Dùng {pn} view <id> để xem chi tiết`;

        await reply({
          body: listText
        });

      } else if (action === "view" || action === "xem" || action === "info") {
        if (!args[1]) {
          await reply({
            body: "❌ Vui lòng nhập ID đếm ngược!\n\n" +
              "💡 Dùng {pn} list để xem danh sách"
          });
          return;
        }

        const searchId = args[1];
        const countdown = countdowns.find(
          (c) =>
            c.threadID === threadID &&
            c.active &&
            (c.id === searchId || c.id.includes(searchId) || c.id.endsWith(searchId))
        );

        if (!countdown) {
          await reply({
            body: "❌ Không tìm thấy đếm ngược với ID này!\n\n" +
              "💡 Dùng {pn} list để xem danh sách"
          });
          return;
        }

        const remaining = formatTimeRemaining(countdown.targetDate - Date.now());
        const progress = Math.max(
          0,
          Math.min(
            100,
            ((Date.now() - countdown.createdAt) /
              (countdown.targetDate - countdown.createdAt)) *
            100
          )
        );

        await reply({
          body: `📅 CHI TIẾT ĐẾM NGƯỢC\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📝 Sự kiện: ${countdown.eventName}\n` +
            `⏰ Thời gian đích: ${formatDate(countdown.targetDate)}\n` +
            `⏳ Còn lại: ${remaining}\n` +
            `📊 Tiến độ: ${progress.toFixed(1)}%\n` +
            `👤 Tạo bởi: ${countdown.userName}\n` +
            `📅 Tạo lúc: ${formatDate(countdown.createdAt)}\n` +
            `🆔 ID: ${countdown.id}\n\n` +
            `💡 Dùng {pn} delete ${countdown.id.split("-")[1] || countdown.id.substring(0, 8)} để xóa`
        });

      } else if (action === "delete" || action === "xoa" || action === "del") {
        if (!args[1]) {
          await reply({
            body: "❌ Vui lòng nhập ID đếm ngược cần xóa!\n\n" +
              "💡 Dùng {pn} list để xem danh sách"
          });
          return;
        }

        const searchId = args[1];
        const countdownIndex = countdowns.findIndex(
          (c) =>
            c.threadID === threadID &&
            c.active &&
            (c.id === searchId || c.id.includes(searchId) || c.id.endsWith(searchId))
        );

        if (countdownIndex === -1) {
          await reply({
            body: "❌ Không tìm thấy đếm ngược với ID này!\n\n" +
              "💡 Dùng {pn} list để xem danh sách"
          });
          return;
        }

        const countdown = countdowns[countdownIndex];
        if (!countdown) {
          await reply({
            body: "❌ Không tìm thấy đếm ngược với ID này!\n\n" +
              "💡 Dùng {pn} list để xem danh sách"
          });
          return;
        }


        const isAdmin = Boolean(event.isAdmin);
        if (countdown.userID !== userID && !isAdmin) {
          await reply({
            body: "❌ Bạn không có quyền xóa đếm ngược này!\n\n" +
              "💡 Chỉ người tạo hoặc admin mới có thể xóa"
          });
          return;
        }

        countdown.active = false;
        await saveCountdowns();

        await reply({
          body: `✅ ĐÃ XÓA ĐẾM NGƯỢC\n\n` +
            `📅 Sự kiện: ${countdown.eventName}\n` +
            `🆔 ID: ${countdown.id.split("-")[1] || countdown.id.substring(0, 8)}`
        });

      } else {
        await reply({
          body: "📖 HƯỚNG DẪN SỬ DỤNG ĐẾM NGƯỢC\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
            "📝 Tạo đếm ngược:\n" +
            "• {pn} create <tên sự kiện> <thời gian>\n\n" +
            "📋 Xem danh sách:\n" +
            "• {pn} list\n\n" +
            "👁️ Xem chi tiết:\n" +
            "• {pn} view <id>\n\n" +
            "🗑️ Xóa đếm ngược:\n" +
            "• {pn} delete <id>\n\n" +
            "📅 Định dạng thời gian:\n" +
            "• YYYY-MM-DD HH:MM (ví dụ: 2024-12-31 23:59)\n" +
            "• Xd Xh Xm (ví dụ: 5d 3h 30m)\n" +
            "• X minutes/hours/days (ví dụ: 2 hours)\n\n" +
            "💡 Ví dụ:\n" +
            "• {pn} create Năm mới 2024-12-31 23:59\n" +
            "• {pn} create Sinh nhật 5d 2h\n" +
            "• {pn} create Deadline 3 hours"
        });
      }

    } catch (e: any) {
      console.error("Countdown command error:", e);
      await reply({
        body: `❌ Đã xảy ra lỗi: ${e.message || "Lỗi không xác định"}`
      });
    }
  },
};

export default countdownCommand;
