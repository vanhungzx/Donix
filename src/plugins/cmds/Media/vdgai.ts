import type { Command, CommandOnCallContext } from '@types';

const Command: Command = {
  name: "vdgai",
  alias: ["vdgai"],
  version: "1.0.0",
  role: 0,
  desc: "Xem video gái xinh",
  guide: "{pn} vdgai → Xem video gái xinh ngẫu nhiên\n   {pn} → Tên lệnh của bot",
  cd: 10,
  prefix: true,
  async onCall({ reply }: CommandOnCallContext): Promise<void> {
    try {
      if (!global.Donix.vdgai?.length) {
        await reply("Không có video gái");
        return;
      }
      await reply(
        {
          body: `Mê video gái xinh à?`,
          attachment: global.Donix.vdgai?.splice?.(0, 1) || [],
        });
    } catch (e) {
      console.error(e);
      await reply("Đã xảy ra lỗi");
    }
  },
};

export default Command;
