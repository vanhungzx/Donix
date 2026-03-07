"use strict";
import type { Command, CommandOnCallContext } from "@types";
const restartCommand: Command = {
  name: "rs",
  alias: ["reset", "restart"],
  version: "1.1.0",
  role: 3,
  desc: "Khởi động lại Bot",
  guide: `
• {pn}`,
  cd: 0,
  prefix: true,
  async onCall({ event, react, client }: CommandOnCallContext) {
    react?.("⏱️");
    client.sendMessage("Đang khởi động lại bot...", event.threadID, (er: any, info: any) => {
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
