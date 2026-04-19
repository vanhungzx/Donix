import type { Command, CommandOnCallContext } from "@types";
import {
  getSendTopMessagesStatus,
  setSendTopMessagesEnabled,
  type TopPeriod,
} from "../../../core/handleEvents/task/interactions/top";

type Action = "on" | "off";

const PERIOD_ALIASES: Record<string, TopPeriod> = {
  day: "day",
  ngày: "day",
  ngay: "day",
  d: "day",
  week: "week",
  tuần: "week",
  tuan: "week",
  w: "week",
  month: "month",
  tháng: "month",
  thang: "month",
  m: "month",
};

const PERIOD_LABELS: Record<TopPeriod, string> = {
  day: "Ngày",
  week: "Tuần",
  month: "Tháng",
};

const ON_WORDS = new Set(["on", "bật", "bat", "1", "true"]);
const OFF_WORDS = new Set(["off", "tắt", "tat", "0", "false"]);

function parseAction(value: string | undefined): Action | null {
  if (!value) return null;
  const v = value.toLowerCase().trim();
  if (ON_WORDS.has(v)) return "on";
  if (OFF_WORDS.has(v)) return "off";
  return null;
}

function parsePeriod(value: string | undefined): TopPeriod | null {
  if (!value) return null;
  const v = value.toLowerCase().trim();
  return PERIOD_ALIASES[v] ?? null;
}

function fmtStatus(enabled: boolean): string {
  return enabled ? "✅ BẬT" : "⏸️ TẮT";
}

function buildStatusMessage(): string {
  const s = getSendTopMessagesStatus();
  const lines: string[] = [];
  lines.push(`📊 Trạng thái gửi Top Tương Tác (tất cả nhóm):`);
  lines.push(
    `• Tổng: ${fmtStatus(s.global)} ${s.global ? "" : "(đang tắt toàn bộ)"}`.trim()
  );
  lines.push(`• 📅 Top Ngày:  ${fmtStatus(s.day)}`);
  lines.push(`• 📈 Top Tuần:  ${fmtStatus(s.week)}`);
  lines.push(`• 📋 Top Tháng: ${fmtStatus(s.month)}`);
  lines.push("");
  lines.push("💡 Sử dụng:");
  lines.push("• {pn} on / off — Bật/tắt toàn bộ");
  lines.push("• {pn} ngày on / off — Bật/tắt Top Ngày");
  lines.push("• {pn} tuần on / off — Bật/tắt Top Tuần");
  lines.push("• {pn} tháng on / off — Bật/tắt Top Tháng");
  lines.push("");
  lines.push("ℹ️ Lưu ý: Dù bật hay tắt, dữ liệu vẫn được reset như bình thường.");
  return lines.join("\n");
}

const toptoggleCommand: Command = {
  name: "toptoggle",
  alias: ["toptg", "toptoggle", "topttoggle"],
  version: "1.1.0",
  role: 3,
  desc: "Bật/tắt gửi tin nhắn Top Tương Tác (tổng / ngày / tuần / tháng) cho toàn bộ nhóm",
  guide:
    "• {pn}: Xem trạng thái hiện tại\n" +
    "• {pn} on | off: Bật/tắt toàn bộ\n" +
    "• {pn} ngày on | off: Bật/tắt Top Ngày\n" +
    "• {pn} tuần on | off: Bật/tắt Top Tuần\n" +
    "• {pn} tháng on | off: Bật/tắt Top Tháng",
  cd: 0,
  prefix: true,
  onCall: async (ctx: CommandOnCallContext) => {
    const { reply, args, event, config } = ctx;

    const isOwner = (id: string | number): boolean => {
      const target = String(id);
      if (Array.isArray(config?.OWNER)) {
        return config.OWNER.map(String).includes(target);
      }
      return String(config?.OWNER) === target;
    };

    if (!isOwner(event.senderID)) {
      await reply("❎ Lệnh này chỉ dành cho Chủ bot.");
      return;
    }

    if (args.length === 0) {
      await reply(buildStatusMessage());
      return;
    }

    let period: TopPeriod | null = null;
    let action: Action | null = null;

    const first = args[0];
    const second = args[1];

    const firstAsPeriod = parsePeriod(first);
    if (firstAsPeriod) {
      period = firstAsPeriod;
      action = parseAction(second);
    } else {
      action = parseAction(first);
      if (action && second) {
        period = parsePeriod(second);
      }
    }

    if (!action) {
      await reply(
        "❎ Cú pháp không hợp lệ.\n\n" + buildStatusMessage()
      );
      return;
    }

    const enable = action === "on";
    await setSendTopMessagesEnabled(enable, period ?? undefined);

    const scope = period
      ? `Top ${PERIOD_LABELS[period]}`
      : "TOÀN BỘ (ngày + tuần + tháng)";
    const head = enable
      ? `✅ Đã BẬT gửi tin nhắn ${scope}.`
      : `⏸️ Đã TẮT gửi tin nhắn ${scope}.`;

    await reply(
      `${head}\n` +
        `🌐 Áp dụng cho: TOÀN BỘ NHÓM trong hệ thống.\n` +
        `📊 Dữ liệu vẫn được reset như bình thường.\n` +
        `💾 Trạng thái đã được lưu vào config.\n\n` +
        buildStatusMessage()
    );
  },
};

export default toptoggleCommand;
