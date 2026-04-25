import type { Command, CommandOnCallContext } from '@types';

const ALLOW_UID = ["61586845605819"];

const Command: Command = {
  name: "vd",
  alias: ["video"],
  version: "1.2.0",
  role: 0,
  desc: "Xem video ngẫu nhiên",
  guide: `{pn}vd gái | gai | girl
{pn}vd trai | boy
{pn}vd ani | anime
{pn}vd cos | cosplay
{pn}vd chill | lofi
{pn}vd on/off`,
  cd: 10,
  prefix: true,

  async onCall({ args, reply, threadData, event }: CommandOnCallContext): Promise<void> {
    try {
      const input = args[0]?.toLowerCase();
      const threadID = event.threadID;
      const senderID = event.senderID;

      const thread = await threadData.get(threadID);
      const settings = thread?.settings || {};

      if (!settings.video) settings.video = { enabled: true };

      const isAllow = ALLOW_UID.includes(senderID);

      // ON
      if (input === "on") {
        if (!isAllow) {
          await reply("❌ Bạn không có quyền bật video");
          return;
        }
        settings.video.enabled = true;
        await threadData.update(threadID, { settings });
        await reply("✅ Đã bật video");
        return;
      }

      // OFF
      if (input === "off") {
        if (!isAllow) {
          await reply("❌ Bạn không có quyền tắt video");
          return;
        }
        settings.video.enabled = false;
        await threadData.update(threadID, { settings });
        await reply("❌ Đã tắt video");
        return;
      }

      // nếu off thì chặn người thường
      if (settings.video.enabled === false && !isAllow) {
        await reply("❌ Video đã bị tắt trong nhóm này");
        return;
      }

      // mapping nhiều cách gọi
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

      if (!arr || !arr.length) {
        await reply(
`❌ Không có video

Các loại video:
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

    } catch (e) {
      console.error(e);
      await reply("❌ Đã xảy ra lỗi");
    }
  },
};

export default Command;