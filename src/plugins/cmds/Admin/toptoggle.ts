import type { Command, CommandOnCallContext } from "@types";
import { getSendTopMessagesEnabled, setSendTopMessagesEnabled } from "../../../core/handleEvents/task/interactions/top";

const toptoggleCommand: Command = {
  name: "toptoggle",
  alias: ["toptg", "toptoggle", "topttoggle"],
  version: "1.0.0",
  role: 3,
  desc: "Bật/tắt gửi tin nhắn Top Tương Tác cho toàn bộ nhóm (dữ liệu vẫn được reset như bình thường)",
  guide: "• {pn}: Xem trạng thái hiện tại\n• {pn} on: Bật gửi tin nhắn\n• {pn} off: Tắt gửi tin nhắn",
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

    const action = (args[0] || "").toLowerCase().trim();
    const currentStatus = getSendTopMessagesEnabled();

    if (action === "on" || action === "bật" || action === "1" || action === "true") {
      await setSendTopMessagesEnabled(true);
      await reply("✅ Đã BẬT gửi tin nhắn Top Tương Tác cho TOÀN BỘ NHÓM.\n📊 Dữ liệu vẫn được reset như bình thường.\n💾 Trạng thái đã được lưu vào config.");
    } else if (action === "off" || action === "tắt" || action === "0" || action === "false") {
      await setSendTopMessagesEnabled(false);
      await reply("⏸️ Đã TẮT gửi tin nhắn Top Tương Tác cho TOÀN BỘ NHÓM.\n📊 Dữ liệu vẫn được reset như bình thường.\n💾 Trạng thái đã được lưu vào config.");
    } else {

      const statusText = currentStatus ? "✅ BẬT" : "⏸️ TẮT";
      await reply(
        `📊 Trạng thái gửi tin nhắn Top Tương Tác: ${statusText}\n` +
        `🌐 Áp dụng cho: TOÀN BỘ NHÓM trong hệ thống\n\n` +
        `💡 Sử dụng:\n` +
        `• {pn} on - Bật gửi tin nhắn (tất cả nhóm)\n` +
        `• {pn} off - Tắt gửi tin nhắn (tất cả nhóm)\n\n` +
        `ℹ️ Lưu ý: Dù bật hay tắt, dữ liệu vẫn được reset như bình thường.`
      );
    }
  },
};

export default toptoggleCommand;