"use strict";

import type { Command, CommandOnCallContext } from "@types";

function formatTimestamp(timestamp: number): string {
  if (!timestamp) return "Không rõ";
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Vừa xong";
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatActorNames(actors: Array<{ name?: string }>): string {
  if (!actors || actors.length === 0) return "";
  if (actors.length === 1) return actors[0]?.name || "Ai đó";
  if (actors.length === 2) {
    return `${actors[0]?.name || "Ai đó"} và ${actors[1]?.name || "ai đó"}`;
  }
  return `${actors[0]?.name || "Ai đó"} và ${actors.length - 1} người khác`;
}

const notificationsCommand: Command = {
  name: "notifications",
  alias: ["thongbao"],
  version: "1.0.0",
  role: 3,
  desc: "Xem thông báo Facebook",
  guide:
    "{pn} notifications [số lượng]\n" +
    "{pn} notifications new|latest|moi (lấy thông báo mới nhất)\n" +
    "{pn} → Tên lệnh của bot",
  cd: 10,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { client, args, reply } = ctx;

    try {
      const firstArg = (args[0] || "").toString().toLowerCase();
      const isLatestOnly = ["new", "latest", "moi", "mớI", "newest"].includes(firstArg);
      const count =
        isLatestOnly
          ? 1
          : args[0] && !isNaN(Number(args[0]))
            ? Math.min(Number(args[0]), 50)
            : 15;

      await reply({
        body: "🔄 Đang tải thông báo..."
      });

      const result = await (client.getNotifications as (options?: { count?: number }) => Promise<{
        notifications: Array<{
          id: string;
          text: string;
          timestamp: number;
          is_unread: boolean;
          actors: Array<{ name?: string; id?: string }>;
          context?: { name?: string; url?: string };
          href?: string;
        }>;
        unread_count?: number;
        has_more?: boolean;
      }>)({ count });

      if (!result || !result.notifications || result.notifications.length === 0) {
        await reply({
          body: "📭 Không có thông báo nào!"
        });
        return;
      }

      // Ensure newest-first, then apply latest-only mode if requested.
      const sorted = [...result.notifications].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      const notifications = isLatestOnly ? sorted.slice(0, 1) : sorted;
      const { unread_count = 0, has_more = false } = result;

      let message = `📬 THÔNG BÁO FACEBOOK\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      message += `📊 Tổng số: ${notifications.length} thông báo\n`;
      message += `🔔 Chưa đọc: ${unread_count}\n`;
      if (has_more) {
        message += `📄 Còn nhiều thông báo khác...\n`;
      }
      message += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      notifications.forEach((noti, index) => {
        const actorNames = formatActorNames(noti.actors);
        const timeAgo = formatTimestamp(noti.timestamp);
        const unreadIcon = noti.is_unread ? "🔴" : "⚪";
        const contextInfo = noti.context?.name ? `\n   📍 ${noti.context.name}` : "";

        message += `${unreadIcon} [${index + 1}] ${noti.text || "Thông báo"}\n`;
        if (actorNames || contextInfo) {
          message += `   👤 ${actorNames || " "}${contextInfo}\n`;
        }
        message += `   ⏰ ${timeAgo}\n`;
        if (noti.href) {
          message += `   🔗 ${noti.href}\n`;
        }
        message += `\n`;
      });

      message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `💡 Sử dụng: {pn} notifications [số lượng] để xem thêm`;

      // Avoid overly long message bodies (platform limits vary).
      const MAX_LEN = 3800;
      const safeMessage =
        message.length > MAX_LEN
          ? `${message.slice(0, MAX_LEN)}\n...\n(Đã cắt bớt vì quá dài)`
          : message;

      await reply({ body: safeMessage });
    } catch (e: any) {
      await reply({
        body: `❌ Lỗi: ${e.message || "Không thể lấy thông báo"}`
      });
    }
  }
};

export default notificationsCommand;
