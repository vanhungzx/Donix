import type { Command, CommandOnCallContext } from '@types';

const Command: Command = {
  name: "vdtrai",
  alias: ["vdtrai"],
  version: "1.0.0",
  role: 0,
  desc: "Xem video trai đẹp",
  guide: "{pn} vdtrai → Xem video trai đẹp ngẫu nhiên\n   {pn} → Tên lệnh của bot",
  cd: 10,
  prefix: true,
  async onCall({ reply }: CommandOnCallContext): Promise<void> {
    try {
      if (!global.Donix.vdtrai?.length) {
        await reply("Không có video trai");
        return;
      }
      await reply(
        {
          body: `Mê video trai đẹp à?`,
          attachment: global.Donix.vdtrai?.splice?.(0, 1) || [],
        });
    } catch (e) {
      console.error(e);
      await reply("Đã xảy ra lỗi");
    }
  },
};

export default Command;
