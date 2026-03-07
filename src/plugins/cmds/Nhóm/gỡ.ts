import type { Command, CommandOnCallContext } from "@types";

const Command: Command = {
  name: "gỡ",
  alias: ["xóa"],
  version: "1.0.0",
  role: 0,
  desc: "Gỡ tin nhắn của bot",
  guide: "{pn} (reply message)",
  cd: 5,
  prefix: false,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, client } = ctx;
    const { threadID, messageReply } = event;

    if (!messageReply) return;

    const replyMsgID = messageReply.messageID;
    const replySenderID = messageReply.senderID;
    const botID = client.getCurrentUserID();

    if (String(replySenderID) === String(botID)) {
      try {
        await client.unsendMessage(String(replyMsgID) as string, threadID);
      } catch {}
    }
  }
};

export default Command;
