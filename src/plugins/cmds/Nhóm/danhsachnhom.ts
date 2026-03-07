"use strict";

import type { Command, CommandOnCallContext, CommandOnReplyContext } from '@types';
import moment from 'moment-timezone';

const TZ = "Asia/Ho_Chi_Minh";

/**
 * Format thời gian lần cuối truy cập nhóm
 * @param timestamp Unix timestamp (seconds) từ viewer_last_visited_time
 * @returns Chuỗi thời gian đã format hoặc "Chưa truy cập"
 */
const formatLastVisitedTime = (timestamp: number | null): string => {
  if (!timestamp) return "Chưa truy cập";
  return moment.unix(timestamp).tz(TZ).format("HH:mm:ss | DD/MM/YYYY");
};

const danhsachnhomCommand: Command = {
  name: "danhsachnhom",
  alias: ["dsnhom", "listgroup", "groups"],
  version: "1.0.0",
  role: 0,
  desc: "Xem danh sách các nhóm Facebook đã tham gia",
  guide: `{pn}

Hiển thị danh sách tất cả các nhóm Facebook mà bạn đã tham gia.
Reply số thứ tự để xem thông tin chi tiết của một nhóm.`,
  cd: 10,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { client, reply, event, main, commandName } = ctx;

    try {
      await reply("⏳ Đang lấy danh sách nhóm...");

      const result = await (client.getJoinedGroups as any)?.();

      if (!result || !result.groups || result.groups.length === 0) {
        await reply("❌ Không tìm thấy nhóm nào hoặc có lỗi xảy ra.");
        return;
      }

      const groups = result.groups;
      const total = result.total_joined_groups ?? groups.length;

      let body = `📋 DANH SÁCH NHÓM ĐÃ THAM GIA\n\n`;
      body += `📊 Tổng số: ${total} nhóm\n\n`;

      const displayCount = Math.min(groups.length, 20);
      for (let i = 0; i < displayCount; i++) {
        const group = groups[i];
        const index = i + 1;
        const id = group.id || "Không rõ ID";
        const name = group.name || "Không có tên";
        const url = group.url || "";
        // viewer_last_visited_time: Thời gian lần cuối bạn truy cập/mở nhóm trên Facebook
        const lastVisitedTime = formatLastVisitedTime(group.lastVisitedTime);

        body += `${index}. ${name}\n`;
        body += `   🆔 ID: ${id}\n`;
        if (url) {
          body += `   🔗 ${url}\n`;
        }
        body += `   ⏰ Lần cuối truy cập: ${lastVisitedTime}\n`;
        if (i < displayCount - 1) {
          body += `\n`;
        }
      }

      if (groups.length > displayCount) {
        body += `\n... và ${groups.length - displayCount} nhóm khác`;
      }

      const sent = await reply(body);

      if (sent?.messageID) {
        (main as any).onReply.set(sent.messageID, {
          commandName,
          messageID: sent.messageID,
          author: event.senderID,
          groups: groups.slice(0, displayCount),
        });
      }
    } catch (error: any) {
      console.error("Error in danhsachnhom command:", error);
      await reply(`❌ Đã xảy ra lỗi: ${error?.message || error}`);
    }
  },

  async onReply(ctx: CommandOnReplyContext): Promise<void> {
    const { client, event, Reply, reply } = ctx;

    try {
      const data = Reply as any;
      if (!data || event.senderID !== data.author) return;

      const text = (event.body || "").trim();
      if (!/^\d+$/.test(text)) {
        await reply("❎ Vui lòng nhập số thứ tự của nhóm cần xem chi tiết.");
        return;
      }

      const index = parseInt(text, 10);
      const groups: any[] = Array.isArray(data.groups) ? data.groups : [];
      const group = groups[index - 1];

      if (!group || !group.id) {
        await reply("❎ Số thứ tự không hợp lệ hoặc không tìm thấy nhóm tương ứng.");
        return;
      }

      const info = await (client.getGroupInfo as any)?.(group.id);
      if (!info) {
        await reply("❎ Không thể lấy thông tin chi tiết của nhóm (có thể do lỗi hoặc thiếu quyền).");
        return;
      }

      const lines: string[] = [];
      lines.push("📖 THÔNG TIN NHÓM");
      lines.push("");
      lines.push(`📌 Tên: ${info.name || "Không có"}`);
      lines.push(`🆔 ID: ${info.id}`);
      if (info.url) lines.push(`🔗 Link: ${info.url}`);

      if (info.activity) {
        lines.push("");
        lines.push("📊 Hoạt động");
        if (typeof info.activity.number_of_posts_in_last_day === "number") {
          lines.push(`• Bài viết 24h qua: ${info.activity.number_of_posts_in_last_day}`);
        }
        if (typeof info.activity.number_of_posts_in_last_month === "number") {
          lines.push(`• Bài viết 30 ngày qua: ${info.activity.number_of_posts_in_last_month}`);
        }
        if (info.activity.group_total_members_info_text) {
          lines.push(`• Thành viên: ${info.activity.group_total_members_info_text}`);
        } else if (info.member_count_text) {
          lines.push(`• Thành viên: ${info.member_count_text}`);
        }
        if (info.activity.group_new_members_info_text) {
          lines.push(`• Thành viên mới: ${info.activity.group_new_members_info_text}`);
        }
      } else if (info.member_count_text) {
        lines.push("");
        lines.push(`📊 Thành viên: ${info.member_count_text}`);
      }

      if (info.privacy || info.discoverability) {
        lines.push("");
        lines.push("🔐 Quyền riêng tư & hiển thị");
        if (info.privacy?.label) {
          lines.push(`• Quyền riêng tư: ${info.privacy.label}`);
        }
        if (info.discoverability?.label) {
          lines.push(`• Khả năng tìm kiếm: ${info.discoverability.label}`);
        }
      }

      if (info.tags && info.tags.length > 0) {
        lines.push("");
        lines.push(
          `🏷️ Chủ đề: ${info.tags
            .map((t: { name?: string | null }) => t.name)
            .filter(Boolean)
            .join(", ")}`
        );
      }

      if (info.locations && info.locations.length > 0) {
        lines.push("");
        lines.push(
          `📍 Vị trí: ${info.locations
            .map((loc: { name?: string | null }) => loc.name)
            .filter(Boolean)
            .join(", ")}`
        );
      }

      if (info.friends_member_sentence) {
        lines.push("");
        lines.push(`👥 Bạn bè: ${info.friends_member_sentence}`);
      }

      if (info.admin_moderator_sentence) {
        lines.push(`🛡️ Quản trị/kiểm duyệt: ${info.admin_moderator_sentence}`);
      }

      if (info.description) {
        lines.push("");
        lines.push("📝 Mô tả:");
        // Tránh quá dài: cắt bớt nếu mô tả cực dài
        const maxDescLen = 1000;
        const desc =
          info.description.length > maxDescLen
            ? info.description.slice(0, maxDescLen) + "…"
            : info.description;
        lines.push(desc);
      }

      if (info.rules && info.rules.length > 0) {
        lines.push("");
        lines.push("📌 Một số nội quy:");
        const maxRules = Math.min(info.rules.length, 5);
        for (let i = 0; i < maxRules; i++) {
          const rule = info.rules[i];
          const title = rule.title || `Nội quy ${i + 1}`;
          const desc = rule.description || "";
          const shortDesc =
            desc.length > 300 ? desc.slice(0, 300) + "…" : desc;
          lines.push(`• ${title}: ${shortDesc}`);
        }
        if (info.rules.length > maxRules) {
          lines.push(`(Còn ${info.rules.length - maxRules} nội quy khác)`);
        }
      }

      await reply(lines.join("\n"));
    } catch (error: any) {
      console.error("Error in danhsachnhom onReply:", error);
      await reply(`❌ Đã xảy ra lỗi khi lấy thông tin nhóm: ${error?.message || error}`);
    }
  },
};

export default danhsachnhomCommand;
