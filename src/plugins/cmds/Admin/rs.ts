"use strict";
import type { Command, CommandOnCallContext } from "@types";

type SchedulerLike = {
  setTask?: (name: string, patch: Record<string, unknown>) => Promise<unknown>;
  getStatus?: () => { tasks?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }> };
};

const restartCommand: Command = {
  name: "rs",
  alias: ["reset", "restart"],
  version: "1.1.0",
  role: 3,
  desc: "Khởi động lại Bot",
  guide: `
• {pn}
• {pn} auto on
• {pn} auto off
• {pn} auto status`,
  cd: 0,
  prefix: true,
  async onCall({ event, react, client, args, main, reply }: CommandOnCallContext) {
    const sub = String(args?.[0] || "").toLowerCase();
    const value = String(args?.[1] || "").toLowerCase();

    if (sub === "auto") {
      const scheduler = (main as unknown as { scheduler?: SchedulerLike })?.scheduler;
      if (!scheduler?.setTask) {
        await reply("❎ Scheduler không khả dụng.");
        return;
      }

      if (value === "on" || value === "enable") {
        await scheduler.setTask("autoRestart", {
          enabled: true,
          type: "everyH",
          hours: 4,
        });
        await reply("✅ Đã bật auto restart mỗi 4 giờ.");
        return;
      }

      if (value === "off" || value === "disable") {
        await scheduler.setTask("autoRestart", {
          enabled: false,
          type: "everyH",
          hours: 4,
        });
        await reply("✅ Đã tắt auto restart.");
        return;
      }

      const st = scheduler.getStatus?.();
      const autoCfg = st?.tasks?.autoRestart;
      const enabled = !!autoCfg?.enabled;
      const h = Number((autoCfg?.config?.hours ?? 4) as number) || 4;
      await reply(`ℹ️ Auto restart: ${enabled ? "BẬT" : "TẮT"} | Chu kỳ: ${h}h`);
      return;
    }

    react?.("⏱️");
    client.sendMessage("Đang khởi động lại bot...", event.threadID, (er: any, _info: any) => {
      if (er) {
        console.error(er);
      } else {
        setTimeout(() => {
          process.exit(1);
        }, 1200);
      }
    });
  }
};
export default restartCommand;
