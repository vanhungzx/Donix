import type { Command, CommandOnCallContext } from '@types';

const Command: Command = {
  name: "vdcos",
  alias: ["vdcos"],
  version: "1.0.0",
  role: 0,
  desc: "Xem video cosplay",
  guide: "{pn} vdcos → Xem video cosplay ngẫu nhiên\n   {pn} → Tên lệnh của bot",
  cd: 10,
  prefix: true,
  async onCall({ reply }: CommandOnCallContext): Promise<void> {
    try {
      if (!global.Donix.vdcos?.length) {
        await reply("Không có video cosplay");
        return;
      }
      await reply(
        {
          body: `Mê video cosplay à?`,
          attachment: global.Donix.vdcos?.splice?.(0, 1) || [],
        });
    } catch (e) {
      console.error(e);
      await reply("Đã xảy ra lỗi");
    }
  },
};

export default Command;
