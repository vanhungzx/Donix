import type { Command, CommandOnCallContext } from '@types';
import moment from "moment-timezone";

const canList = ["Canh", "Tân", "Nhâm", "Quý", "Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ"];

const chiList = ["Thân", "Dậu", "Tuất", "Hợi", "Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi"];

const menhMap: Record<string, string> = {
  "Giáp Tý": "Kim",
  "Ất Sửu": "Kim",
  "Bính Dần": "Hỏa",
  "Đinh Mão": "Hỏa",
  "Mậu Thìn": "Mộc",
  "Kỷ Tỵ": "Mộc",
  "Canh Ngọ": "Thổ",
  "Tân Mùi": "Thổ",
  "Nhâm Thân": "Kim",
  "Quý Dậu": "Kim",
  "Giáp Tuất": "Hỏa",
  "Ất Hợi": "Hỏa",
  "Bính Tý": "Thủy",
  "Đinh Sửu": "Thủy",
  "Mậu Dần": "Thổ",
  "Kỷ Mão": "Thổ",
  "Canh Thìn": "Kim",
  "Tân Tỵ": "Kim",
  "Nhâm Ngọ": "Mộc",
  "Quý Mùi": "Mộc",
  "Giáp Thân": "Thủy",
  "Ất Dậu": "Thủy",
  "Bính Tuất": "Thổ",
  "Đinh Hợi": "Thổ",
  "Mậu Tý": "Hỏa",
  "Kỷ Sửu": "Hỏa",
  "Canh Dần": "Mộc",
  "Tân Mão": "Mộc",
  "Nhâm Thìn": "Thủy",
  "Quý Tỵ": "Thủy",
  "Giáp Ngọ": "Kim",
  "Ất Mùi": "Kim",
  "Bính Thân": "Hỏa",
  "Đinh Dậu": "Hỏa",
  "Mậu Tuất": "Mộc",
  "Kỷ Hợi": "Mộc",
  "Canh Tý": "Thổ",
  "Tân Sửu": "Thổ",
  "Nhâm Dần": "Kim",
  "Quý Mão": "Kim",
  "Giáp Thìn": "Hỏa",
  "Ất Tỵ": "Hỏa",
  "Bính Ngọ": "Thủy",
  "Đinh Mùi": "Thủy",
  "Mậu Thân": "Thổ",
  "Kỷ Dậu": "Thổ",
  "Canh Tuất": "Kim",
  "Tân Hợi": "Kim",
  "Nhâm Tý": "Mộc",
  "Quý Sửu": "Mộc"
};

const menhProperties: Record<string, { mauHop: string; huongHop: string }> = {
  Kim: {
    mauHop: "Trắng, Xám, Ghi",
    huongHop: "Tây, Tây Bắc, Đông Bắc, Tây Nam"
  },
  Mộc: {
    mauHop: "Xanh lá cây",
    huongHop: "Đông, Đông Nam, Nam"
  },
  Thủy: {
    mauHop: "Xanh dương, Đen",
    huongHop: "Bắc"
  },
  Hỏa: {
    mauHop: "Đỏ, Hồng, Tím",
    huongHop: "Nam, Đông, Đông Nam"
  },
  Thổ: {
    mauHop: "Vàng, Nâu",
    huongHop: "Tây Nam, Đông Bắc"
  }
};

interface ZodiacSign {
  name: string;
  start: { day: number; month: number };
  end: { day: number; month: number };
}

const zodiacSigns: ZodiacSign[] = [
  { name: "Bảo Bình", start: { day: 20, month: 1 }, end: { day: 18, month: 2 } },
  { name: "Song Ngư", start: { day: 19, month: 2 }, end: { day: 20, month: 3 } },
  { name: "Bạch Dương", start: { day: 21, month: 3 }, end: { day: 19, month: 4 } },
  { name: "Kim Ngưu", start: { day: 20, month: 4 }, end: { day: 20, month: 5 } },
  { name: "Song Tử", start: { day: 21, month: 5 }, end: { day: 20, month: 6 } },
  { name: "Cự Giải", start: { day: 21, month: 6 }, end: { day: 22, month: 7 } },
  { name: "Sư Tử", start: { day: 23, month: 7 }, end: { day: 22, month: 8 } },
  { name: "Xử Nữ", start: { day: 23, month: 8 }, end: { day: 22, month: 9 } },
  { name: "Thiên Bình", start: { day: 23, month: 9 }, end: { day: 22, month: 10 } },
  { name: "Bọ Cạp", start: { day: 23, month: 10 }, end: { day: 21, month: 11 } },
  { name: "Nhân Mã", start: { day: 22, month: 11 }, end: { day: 21, month: 12 } },
  { name: "Ma Kết", start: { day: 22, month: 12 }, end: { day: 19, month: 1 } }
];

function getZodiacSign(day: number, month: number): string {
  for (const sign of zodiacSigns) {
    
    if (sign.start.month > sign.end.month) {
      if ((month === sign.start.month && day >= sign.start.day) ||
        (month === sign.end.month && day <= sign.end.day)) {
        return sign.name;
      }
    } else {
      
      if ((month === sign.start.month && day >= sign.start.day) ||
        (month === sign.end.month && day <= sign.end.day) ||
        (month > sign.start.month && month < sign.end.month)) {
        return sign.name;
      }
    }
  }
  return "";
}

const ageCommand: Command = {
  name: "age",
  alias: ["tuoi"],
  version: "2.0.0",
  role: 0,
  desc: "Tính tuổi, Can Chi, mệnh, phong thủy...",
  guide: "   {pn} [ngày/tháng/năm sinh]",
  cd: 0,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { utils, event, args, config, reply } = ctx;

    const input = args[0];
    if (!input) {
      await reply({
        body: `❎ Vui lòng nhập đúng format: ${config.PREFIX}${ctx.commandName} ngày/tháng/năm`
      });
      return;
    }

    const parts = input.split("/").map((s) => parseInt(s));
    const [d, m, y] = parts;

    if (!d || !m || !y || m > 12 || d > 31) {
      await reply({
        body: "⚠️ Ngày sinh không hợp lệ!"
      });
      return;
    }

    const now = moment.tz("Asia/Ho_Chi_Minh");
    const birth = moment.tz(`${y}-${m}-${d}`, "YYYY-M-D", "Asia/Ho_Chi_Minh");

    if (!birth.isValid()) {
      await reply({
        body: "⚠️ Ngày sinh không hợp lệ!"
      });
      return;
    }

    const years = now.diff(birth, "years");
    const months = now.diff(birth, "months");
    const weeks = now.diff(birth, "weeks");
    const days = now.diff(birth, "days");
    const hours = now.diff(birth, "hours");
    const minutes = now.diff(birth, "minutes");
    const seconds = now.diff(birth, "seconds");

    const zodiacSign = getZodiacSign(d, m);
    const can = canList[y % 10];
    const chi = chiList[y % 12];
    const canChi = `${can} ${chi}`;
    const menh = menhMap[canChi] || "Không rõ";
    const phongThuy = menhProperties[menh] || { mauHop: "Không rõ", huongHop: "Không rõ" };

    try {
      const avatarUrl = `https://graph.facebook.com/${event.senderID}/picture?height=720&width=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
      const stream = await (utils.stream as any)(avatarUrl, "jpg");

      await reply({
        body: `🎂 Thông tin ngày sinh của bạn 🎂

📅 Ngày sinh: ${input}
⭐ Cung hoàng đạo: ${zodiacSign}
🐾 Con giáp: ${chi}
📜 Năm Can Chi: ${canChi}
🔥 Mệnh ngũ hành: ${menh}
🎨 Màu hợp: ${phongThuy.mauHop || "Không rõ"}
🧭 Hướng hợp: ${phongThuy.huongHop || "Không rõ"}
⏳ Thời gian bạn đã sống:
🗓️ Năm: ${years}
📆 Tháng: ${months}
📅 Tuần: ${weeks}
📍 Ngày: ${days}
⏰ Giờ: ${hours}
🕓 Phút: ${minutes}
⏱️ Giây: ${seconds}
📝 Bạn hiện tại ${years} tuổi`,
        attachment: [stream]
      });
    } catch (error: any) {
      await reply({
        body: `🎂 Thông tin ngày sinh của bạn 🎂

📅 Ngày sinh: ${input}
⭐ Cung hoàng đạo: ${zodiacSign}
🐾 Con giáp: ${chi}
📜 Năm Can Chi: ${canChi}
🔥 Mệnh ngũ hành: ${menh}
🎨 Màu hợp: ${phongThuy.mauHop || "Không rõ"}
🧭 Hướng hợp: ${phongThuy.huongHop || "Không rõ"}
⏳ Thời gian bạn đã sống:
🗓️ Năm: ${years}
📆 Tháng: ${months}
📅 Tuần: ${weeks}
📍 Ngày: ${days}
⏰ Giờ: ${hours}
🕓 Phút: ${minutes}
⏱️ Giây: ${seconds}
📝 Bạn hiện tại ${years} tuổi`
      });
    }
  }
};

export default ageCommand;
