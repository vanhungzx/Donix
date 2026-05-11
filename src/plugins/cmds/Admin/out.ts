import type { Command, CommandOnCallContext } from "@types";

const outCommand: Command = {
  name: "out",
  alias: ["out"],
  version: "1.2.0",
  role: 3,
  desc: "Bot rời khỏi nhóm chat",
  guide:
    "{pn}: Bot rời nhóm hiện tại\n" +
    "{pn} all: Bot rời tất cả nhóm (trừ box đang dùng lệnh)",
  cd: 5,
  prefix: true,

  async onCall(rawCtx: CommandOnCallContext): Promise<void> {
    const ctx = rawCtx as any;
    const { client, event, args, reply } = ctx;

    const botID = client.getCurrentUserID();

    try {

      // OUT ALL (GIỮ LẠI BOX ĐANG DÙNG LỆNH)
      if (args[0]?.toLowerCase() === "all") {

        const threads = await client.getThreadList(
          9999,
          null,
          ["INBOX"]
        );

        const currentThreadID = event.threadID;

        const groupThreads = threads.filter(
          (thread: any) =>
            thread.isGroup &&
            thread.threadID !== currentThreadID
        );

        await reply(
          `📤 Đang rời khỏi ${groupThreads.length} nhóm...\n⏳ Box hiện tại sẽ được giữ lại`
        );

        let success = 0;
        let failed = 0;

        for (const thread of groupThreads) {
          try {
            await client.removeUserFromGroup(
              botID,
              thread.threadID
            );

            success++;

            // Delay tránh spam API
            await new Promise((resolve) =>
              setTimeout(resolve, 800)
            );

          } catch (err) {
            failed++;

            console.error(
              `Lỗi khi rời nhóm ${thread.threadID}:`,
              err
            );
          }
        }

        return reply(
          `✅ Đã rời khỏi ${success} nhóm` +
          (failed > 0
            ? `\n❎ Thất bại: ${failed} nhóm`
            : "") +
          `\n📌 Đã giữ lại box hiện tại`
        );
      }

      // OUT BOX HIỆN TẠI
      await reply("📤 Đã nhận lệnh out nhóm!");

      setTimeout(async () => {
        try {
          await client.removeUserFromGroup(
            botID,
            event.threadID
          );
        } catch (error: any) {
          console.error(
            "Lỗi khi bot rời nhóm:",
            error
          );
        }
      }, 1500);

    } catch (error: any) {

      await reply(
        "❎ Lỗi khi bot cố gắng rời nhóm: " +
        error.message
      );

    }
  }
};

export default outCommand;