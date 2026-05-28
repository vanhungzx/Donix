import type { Command, CommandOnCallContext } from '@types';

const VIEW_UID = ["61589963865887"];

function isOwner(config: CommandOnCallContext["config"], senderID: string): boolean {
  const o = config.OWNER;

  if (Array.isArray(o)) {
    return o.map(String).includes(String(senderID));
  }

  return o != null && String(o) === String(senderID);
}

const Command: Command = {
  name: "vd",
  alias: ["video"],
  version: "1.3.1",
  role: 0,
  desc: "Xem video ngẫu nhiên",
  guide: `{pn} gái | gai | girl
{pn} trai | boy
{pn} ani | anime
{pn} cos | cosplay
{pn} chill | lofi
{pn} on
{pn} off`,
  cd: 10,
  prefix: true,

  async onCall({ args, reply, threadData, event, config }: CommandOnCallContext): Promise<void> {
    try {
      const input = String(args[0] || "").toLowerCase();
      const threadID = String(event.threadID);
      const senderID = String(event.senderID);

      const thread = await threadData.get(threadID);

      // tạo settings nếu chưa có
      if (!thread.settings || typeof thread.settings !== "object") {
        thread.settings = {};
      }

      if (!thread.settings.video || typeof thread.settings.video !== "object") {
        thread.settings.video = {
          enabled: true
        };
      }

      const settings = thread.settings;

      const isAdmin = isOwner(config, senderID);
      const canBypassOff = VIEW_UID.includes(senderID);

      // ===== ON =====
      if (input === "on") {
        if (!isAdmin) {
          await reply("❌ Chỉ OWNER mới có thể bật video");
          return;
        }

        settings.video.enabled = true;

        await threadData.update(threadID, {
          settings
        });

        await reply("✅ Đã bật video trong nhóm");
        return;
      }

      // ===== OFF =====
      if (input === "off") {
        if (!isAdmin) {
          await reply("❌ Chỉ OWNER mới có thể tắt video");
          return;
        }

        settings.video.enabled = false;

        await threadData.update(threadID, {
          settings
        });

        await reply("❌ Đã tắt video trong nhóm");
        return;
      }

      // ===== CHECK OFF =====
      if (settings.video.enabled === false && !canBypassOff) {
        await reply("❌ Video đã bị tắt trong nhóm này");
        return;
      }

      // ===== MAP VIDEO =====
      const map: Record<string, any> = {
        "gái": global.Donix.vdgai,
        "gai": global.Donix.vdgai,
        "girl": global.Donix.vdgai,

        "trai": global.Donix.vdtrai,
        "boy": global.Donix.vdtrai,

        "ani": global.Donix.vdanime,
        "anime": global.Donix.vdanime,

        "cos": global.Donix.vdcos,
        "cosplay": global.Donix.vdcos,

        "chill": global.Donix.vdchill,
        "lofi": global.Donix.vdchill
      };

      const arr = map[input];

      if (!arr || !Array.isArray(arr) || arr.length === 0) {
        await reply(
`❌ Không có video

📌 Các loại video:
• vd gái | gai | girl
• vd trai | boy
• vd ani | anime
• vd cos | cosplay
• vd chill | lofi`
        );
        return;
      }

      await reply({
        body: `🎬 Video ${input} của bạn đây`,
        attachment: arr.splice(0, 1)
      });

    } catch (error) {
      console.error(error);
      await reply("❌ Đã xảy ra lỗi");
    }
  },
};

export default Command;