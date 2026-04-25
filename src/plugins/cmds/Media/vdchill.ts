import type { Command, CommandOnCallContext } from '@types';

const Command: Command = {
  name: "vdchill",
  alias: ["vdchill"],
  version: "1.0.0",
  role: 0,
  desc: "Xem video chill / nhẹ nhàng ngẫu nhiên",
  guide: "{pn} vdchill → Xem video chill ngẫu nhiên\n   {pn} → Tên lệnh của bot",
  cd: 10,
  prefix: true,
  async onCall({ reply }: CommandOnCallContext): Promise<void> {
    try {
      if (!global.Donix.vdchill?.length) {
        await reply("Không có video chill");
        return;
      }
      await reply(
        {
          body: `Chill thôi ~`,
          attachment: global.Donix.vdchill?.splice?.(0, 1) || [],
        });
    } catch (e) {
      console.error(e);
      await reply("Đã xảy ra lỗi");
    }
  },
};

export default Command;
