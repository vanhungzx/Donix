import type { Command, CommandOnCallContext } from "@types";
import axios from "axios";

const emojimixCommand: Command = {
  name: "emojimix",
  alias: ["emix", "emojikitchen"],
  version: "1.1.0",
  role: 0,
  desc: "Mix 2 emoji bằng Tenor Emoji Kitchen",
  guide: "{pn} 😀+🥶\n{pn} 😺 x 😎\nHoặc reply 1 tin có 2 emoji",
  cd: 5,
  prefix: true,

  async onCall(context: CommandOnCallContext): Promise<void> {
    const { event, args, reply } = context as any;
    const key = "AIzaSyBimM3JNO2qthJ3BCb_AnipuFo6sPj_H-U";
    if (!key) {
      await reply("Thiếu TENOR_KEY. Thêm vào env hoặc config.");
      return;
    }
    const src = ((event.messageReply?.body || "") + " " + (args.join(" ") || "")).trim();
    const picks = [...src.matchAll(/\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\u200D\p{Extended_Pictographic})*/gu)]
      .map(m => m[0])
      .filter(Boolean);
    if (picks.length < 2) {
      await reply("Nhập 2 emoji. Ví dụ: emojimix 😀+🥶");
      return;
    }
    const [e1, e2] = picks as [string, string];
    const fetchMix = async (a: string, b: string): Promise<string | null> => {
      const { data } = await axios.get("https://tenor.googleapis.com/v2/featured", {
        params: {
          key,
          client_key: "donixbot",
          component: "emojikitchen",
          collection: "emoji_kitchen_v6",
          media_filter: "png_transparent",
          q: `${a}_${b}`,
          limit: 8
        },
        timeout: 15000
      });
      if (!data?.results?.length) return null;
      for (const r of data.results) {
        const u =
          r?.media_formats?.png_transparent?.url ||
          r?.media_formats?.gif?.url ||
          r?.url ||
          r?.itemurl;
        if (u) return u;
      }
      return null;
    };
    try {
      let url = await fetchMix(e1, e2);
      if (!url) url = await fetchMix(e2, e1);
      if (!url) {
        await reply("Không tìm thấy bản mix cho cặp emoji này.");
        return;
      }
      const img = await axios.get(url, { responseType: "stream", timeout: 20000 });
      await reply({ body: `${e1} + ${e2}`, attachment: img.data });
    } catch {
      await reply("Lỗi khi tạo emojimix.");
    }
  },
};

export default emojimixCommand;
