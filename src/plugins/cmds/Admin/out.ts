import type { Command, CommandOnCallContext } from "@types";

const outCommand: Command = {
  name: "out",
  alias: ["out"],
  version: "1.0.0",
  role: 3,
  desc: "Bot rời khỏi nhóm chat",
  guide: "{pn} - Bot sẽ rời khỏi nhóm chat hiện tại",
  cd: 5,
  prefix: true,
  async onCall(rawCtx: CommandOnCallContext): Promise<void> {
    const ctx = rawCtx as any;
    const { client, event, reply } = ctx;
    const botID = client.getCurrentUserID();
    try {
      await reply("Đã nhận lệnh out nhóm!");
      setTimeout(async () => {
        try {
          await client.removeUserFromGroup(botID, event.threadID);
        } catch (error: any) {
          console.error("Lỗi khi bot rời nhóm:", error);
        }
      }, 1500);
    } catch (error: any) {
      await reply("❎ Lỗi khi bot cố gắng rời khỏi nhóm: " + error.message);
    }
  }
};

export default outCommand;
