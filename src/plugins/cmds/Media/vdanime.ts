import type { Command, CommandOnCallContext } from '@types';

const Command: Command = {
  name: "vdanime",
  alias: ["vdanime"],
  version: "1.0.0",
  role: 0,
  desc: "Xem video anime",
  guide: "{pn} vdanime → Xem video anime ngẫu nhiên\n   {pn} → Tên lệnh của bot",
  cd: 10,
  prefix: true,
  async onCall({ reply }: CommandOnCallContext): Promise<void> {
    try {
      if (!global.Donix.vdanime?.length) {
        await reply("Không có video anime");
        return;
      }
      await reply(
        {
          body: `Mê video anime à?`,
          attachment: global.Donix.vdanime?.splice?.(0, 1) || [],
        });
    } catch (e) {
      console.error(e);
      await reply("Đã xảy ra lỗi");
    }
  },
};

export default Command;
