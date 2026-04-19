import type { Command, CommandOnCallContext } from "@types";
import { updateConfigKey } from "../../../core/configManager";

type Action = "on" | "off";

const ON_WORDS = new Set(["on", "bật", "bat", "1", "true"]);
const OFF_WORDS = new Set(["off", "tắt", "tat", "0", "false"]);

function parseAction(value: string | undefined): Action | null {
  if (!value) return null;
  const v = value.toLowerCase().trim();
  if (ON_WORDS.has(v)) return "on";
  if (OFF_WORDS.has(v)) return "off";
  return null;
}

function readBotNoPrefixEnabled(cfg: Record<string, unknown> | undefined): boolean {
  const v = cfg?.botNoPrefixEnabled;
  if (v === undefined || v === null) return true;
  return v !== false;
}

const bottoggleCommand: Command = {
  name: "bottoggle",
  alias: ["bottg", "botnp"],
  version: "1.0.0",
  role: 3,
  desc: "Bật/tắt gọi lệnh bot (AI) không cần prefix — khi tắt chỉ còn {PREFIX}bot",
  guide:
    "• {pn}: Xem trạng thái\n" +
    "• {pn} on: Cho phép gõ \"bot ...\" không cần prefix\n" +
    "• {pn} off: Chặn \"bot ...\" không prefix (vẫn dùng {PREFIX}bot)",
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

    const cfg = config as Record<string, unknown>;
    const current = readBotNoPrefixEnabled(cfg);

    if (args.length === 0) {
      const st = current ? "✅ BẬT" : "⏸️ TẮT";
      await reply(
        `🤖 Gọi lệnh \`bot\` không cần prefix: ${st}\n\n` +
          `• BẬT: mọi người gõ đầu dòng \`bot ...\` sẽ chạy AI.\n` +
          `• TẮT: chỉ \`${String(cfg.PREFIX ?? "/")}bot ...\` mới chạy (tránh spam / nhầm lệnh).\n\n` +
          `💡 Dùng: {pn} on | off`
      );
      return;
    }

    const action = parseAction(args[0]);
    if (!action) {
      await reply("❎ Dùng: {pn} on hoặc {pn} off");
      return;
    }

    const enable = action === "on";
    await updateConfigKey("botNoPrefixEnabled", enable);

    await reply(
      enable
        ? "✅ Đã BẬT: có thể gõ `bot ...` không cần prefix.\n💾 Đã lưu vào config."
        : "⏸️ Đã TẮT: không nhận `bot ...` không prefix.\n📌 Vẫn dùng được `" +
            String(cfg.PREFIX ?? "/") +
            "bot ...`\n💾 Đã lưu vào config."
    );
  },
};

export default bottoggleCommand;
