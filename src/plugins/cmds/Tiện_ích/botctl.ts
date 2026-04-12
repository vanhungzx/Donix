import type { Command, CommandOnCallContext } from "@types";
import { getConfig, updateConfigKey } from "../../../core/configManager";

function fmtBool(v: unknown): string {
  return v !== false ? "BẬT" : "TẮT";
}

const botctlCommand: Command = {
  name: "botctl",
  alias: ["botmode", "bottgl"],
  version: "1.0.0",
  role: 3,
  desc: "Bật/tắt tương tác bot (lệnh/onChat) và autodown toàn bot",
  guide:
    "{pn} botctl — xem trạng thái\n" +
    "{pn} botctl interact on|off — tương tác (member)\n" +
    "{pn} botctl autodown on|off — tải link tự động toàn bot\n",
  cd: 3,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { args, reply } = ctx;
    const sub = (args[0] || "status").toLowerCase();
    const val = (args[1] || "").toLowerCase();

    if (sub === "interact" || sub === "tuongtac") {
      if (val !== "on" && val !== "off") {
        await reply({ body: "❎ Dùng: interact on hoặc interact off" });
        return;
      }
      const on = val === "on";
      const r = await updateConfigKey("botInteractionEnabled", on);
      if (!r.success) {
        await reply({ body: `❌ Không thể cập nhật config: ${r.error || "unknown"}` });
        return;
      }
      await reply({
        body: `✅ Tương tác bot (lệnh / onChat / reply-flow): ${on ? "BẬT" : "TẮT"}`,
      });
      return;
    }

    if (sub === "autodown" || sub === "atd") {
      if (val !== "on" && val !== "off") {
        await reply({ body: "❎ Dùng: autodown on hoặc autodown off" });
        return;
      }
      const on = val === "on";
      const r = await updateConfigKey("botAutodownEnabled", on);
      if (!r.success) {
        await reply({ body: `❌ Không thể cập nhật config: ${r.error || "unknown"}` });
        return;
      }
      await reply({
        body: `✅ Autodown toàn bot: ${on ? "BẬT" : "TẮT"} (ghi đè cài đặt theo nhóm khi tắt)`,
      });
      return;
    }

    const cfg = getConfig() as Record<string, unknown>;
    const interact = cfg.botInteractionEnabled !== false;
    const autodown = cfg.botAutodownEnabled !== false;

    await reply({
      body: [
        "⚙️ BOT — CÔNG TẮC TOÀN CỤC",
        `- Tương tác (member): ${fmtBool(interact)}`,
        `- Autodown: ${fmtBool(autodown)}`,
        "",
        "📝 interact off: chỉ OWNER/ADMIN gõ lệnh + onChat/onReply.",
        "📝 autodown off: không tự tải link trên mọi nhóm.",
      ].join("\n"),
    });
  },
};

export default botctlCommand;
