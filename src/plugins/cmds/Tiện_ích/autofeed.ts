import type { Command, CommandOnCallContext } from "@types";
import fs from "fs-extra";
import path from "node:path";
import { getConfig, updateConfigKey } from "../../../core/configManager";

function fmtBool(v: unknown): string {
  return v ? "BẬT" : "TẮT";
}

const STATE_PATH = path.join(process.cwd(), "src/storage/auto_interact/feed_state.json");

function fmtTime(ms?: number): string {
  if (!ms) return "Không rõ";
  const d = new Date(ms);
  return d.toLocaleString("vi-VN");
}

function fmtMs(ms?: unknown): string {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return "Không rõ";
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

function fmtNum(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("vi-VN");
}

const autoFeedCommand: Command = {
  name: "autofeed",
  alias: ["autottfeed", "autotacfeed"],
  version: "1.0.0",
  role: 3,
  desc: "Auto tương tác theo News Feed (scheduler task)",
  guide:
    "{pn} autofeed status\n" +
    "{pn} autofeed on|off\n" +
    "{pn} autofeed run (chạy ngay 1 lần)\n" +
    "{pn} autofeed comment on|off (bật/tắt auto comment)\n" +
    "{pn} autofeed comment add <text> (thêm template comment)\n" +
    "{pn} autofeed comment list (xem danh sách templates)\n" +
    "{pn} autofeed comment remove <số> (xóa template theo số thứ tự)\n",
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { args, reply, main } = ctx;
    const sub = (args[0] || "status").toLowerCase();

    if (sub === "on" || sub === "off") {
      const on = sub === "on";
      const r = await updateConfigKey("scheduler.tasks.autoInteractFeed.enabled", on);
      if (!r.success) {
        await reply({ body: `❌ Không thể cập nhật config: ${r.error || "unknown"}` });
        return;
      }
      await reply({ body: `✅ autoInteractFeed: ${on ? "BẬT" : "TẮT"} (scheduler sẽ tự reload)` });
      return;
    }

    if (sub === "run") {
      const ok = (main as any)?.scheduler?.runNow?.("autoInteractFeed");
      await reply({ body: ok ? "✅ Đã trigger chạy ngay autoInteractFeed." : "❌ Không tìm thấy scheduler hoặc task autoInteractFeed." });
      return;
    }

    if (sub === "comment") {
      const cfg = getConfig() as any;
      const tcfg = cfg?.scheduler?.tasks?.autoInteractFeed || {};
      const commentAction = (args[1] || "").toLowerCase();

      if (commentAction === "on" || commentAction === "off") {
        const on = commentAction === "on";
        const r = await updateConfigKey("scheduler.tasks.autoInteractFeed.enableComment", on);
        if (!r.success) {
          await reply({ body: `❌ Không thể cập nhật config: ${r.error || "unknown"}` });
          return;
        }
        await reply({ body: `✅ Auto comment: ${on ? "BẬT" : "TẮT"} (scheduler sẽ tự reload)` });
        return;
      }

      if (commentAction === "add") {
        const text = args.slice(2).join(" ").trim();
        if (!text) {
          await reply({ body: "❌ Vui lòng nhập nội dung comment: {pn} autofeed comment add <text>" });
          return;
        }
        const templates = Array.isArray(tcfg.commentTemplates) ? [...tcfg.commentTemplates] : [];
        if (templates.length >= 50) {
          await reply({ body: "❌ Đã đạt tối đa 50 templates. Vui lòng xóa bớt trước khi thêm." });
          return;
        }
        templates.push(text);
        const r = await updateConfigKey("scheduler.tasks.autoInteractFeed.commentTemplates", templates);
        if (!r.success) {
          await reply({ body: `❌ Không thể cập nhật config: ${r.error || "unknown"}` });
          return;
        }
        await reply({ body: `✅ Đã thêm template comment: "${text}"\nTổng: ${templates.length} templates` });
        return;
      }

      if (commentAction === "list") {
        const templates = Array.isArray(tcfg.commentTemplates) ? tcfg.commentTemplates : [];
        if (templates.length === 0) {
          await reply({ body: "📝 Chưa có template comment nào.\nDùng: {pn} autofeed comment add <text> để thêm." });
          return;
        }
        const lines = ["📝 DANH SÁCH TEMPLATE COMMENT:"];
        templates.forEach((t: string, i: number) => {
          lines.push(`${i + 1}. ${t}`);
        });
        lines.push(`\nTổng: ${templates.length} templates`);
        await reply({ body: lines.join("\n") });
        return;
      }

      if (commentAction === "remove") {
        const numStr = args[2];
        const num = Number(numStr);
        if (!Number.isFinite(num) || num < 1) {
          await reply({ body: "❌ Vui lòng nhập số thứ tự hợp lệ: {pn} autofeed comment remove <số>" });
          return;
        }
        const templates = Array.isArray(tcfg.commentTemplates) ? [...tcfg.commentTemplates] : [];
        if (num > templates.length) {
          await reply({ body: `❌ Không tìm thấy template số ${num}. Tổng: ${templates.length} templates.` });
          return;
        }
        const removed = templates.splice(num - 1, 1)[0];
        const r = await updateConfigKey("scheduler.tasks.autoInteractFeed.commentTemplates", templates);
        if (!r.success) {
          await reply({ body: `❌ Không thể cập nhật config: ${r.error || "unknown"}` });
          return;
        }
        await reply({ body: `✅ Đã xóa template: "${removed}"\nCòn lại: ${templates.length} templates` });
        return;
      }

      await reply({
        body:
          "💬 QUẢN LÝ AUTO COMMENT\n\n" +
          "• {pn} autofeed comment on|off - Bật/tắt auto comment\n" +
          "• {pn} autofeed comment add <text> - Thêm template\n" +
          "• {pn} autofeed comment list - Xem danh sách\n" +
          "• {pn} autofeed comment remove <số> - Xóa template",
      });
      return;
    }

    const cfg = getConfig() as any;
    const tcfg = cfg?.scheduler?.tasks?.autoInteractFeed || {};
    const enabled = !!tcfg.enabled && !!cfg?.scheduler?.enabled;

    const state = (await fs.readJson(STATE_PATH).catch(() => null)) as any;
    const stats = state?.stats || {};
    const last = stats?.lastRun || null;

    const schedulerStatus = (main as any)?.scheduler?.status?.();
    const nextRun =
      schedulerStatus?.tasks?.autoInteractFeed?.running && schedulerStatus?.tasks?.autoInteractFeed?.next
        ? String(schedulerStatus.tasks.autoInteractFeed.next)
        : null;

    const statusLines = [
      "⚙️ AUTO FEED — TRẠNG THÁI",
      `- Scheduler tổng: ${fmtBool(cfg?.scheduler?.enabled)}`,
      `- Task autoInteractFeed: ${fmtBool(tcfg.enabled)}`,
      `- Đang hiệu lực: ${fmtBool(enabled)}`,
      nextRun ? `- Lần chạy tiếp theo: ${nextRun}` : "",
      "",
      "📊 THỐNG KÊ (cộng dồn)",
      `- Đã thả reaction: ${fmtNum(stats?.totalReacted)}`,
      `- Đã comment: ${fmtNum(stats?.totalCommented)}`,
      `- Đã xét bài (processed): ${fmtNum(stats?.totalProcessed)}`,
      `- Đã bỏ qua (skipped): ${fmtNum(stats?.totalSkipped)}`,
      `- Lỗi (errors): ${fmtNum(stats?.totalErrors)}`,
      "",
      "🕒 LẦN CHẠY GẦN NHẤT",
      last ? `- Thời gian: ${fmtTime(Number(last.at || 0))}` : `- Thời gian: Chưa có`,
      last ? `- Kết quả: reacted=${fmtNum(last.reacted)}/${fmtNum(last.processed)} | commented=${fmtNum(last.commented)} | skipped=${fmtNum(last.skipped)} | errors=${fmtNum(last.errors)}` : "",
      last ? `- Thời lượng: ${fmtMs(last.durationMs)}` : "",
      "",
      "🧩 CẤU HÌNH ĐANG ÁP DỤNG",
      `- Kiểu lịch: ${tcfg.type || "?"}`,
      tcfg.type === "everyMin" ? `- Chu kỳ: mỗi ${fmtNum(tcfg.chunk ?? "?")} phút` : "",
      tcfg.type === "everyH" ? `- Chu kỳ: mỗi ${fmtNum(tcfg.hours ?? "?")} giờ` : "",
      tcfg.type === "at" ? `- Thời điểm: ${tcfg.time ?? "?"}` : "",
      `- Reaction: ${tcfg.reaction || "LIKE"}`,
      `- Auto comment: ${fmtBool(tcfg.enableComment)}`,
      tcfg.enableComment ? `- Comment max / lần: ${fmtNum(tcfg.maxCommentsPerRun ?? 1)}` : "",
      tcfg.enableComment ? `- Tỷ lệ comment: ${Math.round(Number(tcfg.commentProbability ?? 0.15) * 100)}%` : "",
      tcfg.enableComment && Array.isArray(tcfg.commentTemplates) && tcfg.commentTemplates.length > 0
        ? `- Templates (${tcfg.commentTemplates.length}): ${tcfg.commentTemplates.slice(0, 3).join(", ")}${tcfg.commentTemplates.length > 3 ? "..." : ""}`
        : "",
      `- Max / lần chạy: ${fmtNum(tcfg.maxPerRun ?? 3)}`,
      `- Lấy từ feed: ${fmtNum(tcfg.fetchLimit ?? 8)} bài`,
      `- Nghỉ sau khi react: ${fmtMs(tcfg.minDelayMs ?? 2500)} .. ${fmtMs(tcfg.maxDelayMs ?? 6000)}`,
      tcfg.enableComment
        ? `- Nghỉ trước khi comment: ${fmtMs(tcfg.commentDelayMsMin ?? 1500)} .. ${fmtMs(tcfg.commentDelayMsMax ?? 5500)}`
        : "",
      tcfg.preRunJitterMsMax !== undefined ? `- Jitter trước khi chạy: 0 .. ${fmtMs(tcfg.preRunJitterMsMax)}` : "",
      tcfg.viewDelayMsMin !== undefined || tcfg.viewDelayMsMax !== undefined
        ? `- Giả lập đọc bài: ${fmtMs(tcfg.viewDelayMsMin ?? 900)} .. ${fmtMs(tcfg.viewDelayMsMax ?? 4200)}`
        : "",
      tcfg.interactProbability !== undefined ? `- Tỷ lệ tương tác: ${Math.round(Number(tcfg.interactProbability || 0) * 100)}%` : "",
    ].filter(Boolean);

    await reply({ body: statusLines.join("\n") });
  },
};

export default autoFeedCommand;
