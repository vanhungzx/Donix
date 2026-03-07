import type { Command } from "@types";
import loadPlugins from "../../../core/pluginLoader";
const command: Command = {
  name: "reload",
  version: "1.0.0",
  desc: "Reload lại toàn bộ lệnh và sự kiện",
  guide: "reload",
  prefix: true,
  cd: 5,
  role: 3,
  alias: ["rl", "reloadcmd"],
  async onCall({ client, main, userData, threadData, config, logger, utils, reply, event }): Promise<void> {
    const sid = String(event.senderID);
    const isOwner = Array.isArray(config.OWNER) ? config.OWNER.includes(sid) : String(config.OWNER) === sid;
    if (!isOwner) {
      await reply("⛔ Lệnh này chỉ dành cho chủ bot.");
      return;
    }
    try {
      await loadPlugins({
        client,
        main,
        userData,
        threadData,
        config,
        logger,
        utils,
        reloadToken: Date.now(),
      } as any);
      await reply("✅ Đã reload lại toàn bộ commands và events.");
    } catch (e: any) {
      logger?.error?.(`Reload plugins error: ${e?.message || e}`);
      await reply(`❎ Reload thất bại: ${e?.message || e}`);
    }
  },
};

export default command;
