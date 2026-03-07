import type { Command, CommandOnCallContext } from "@types";

interface Province {
  name: string;
  codes: number[];
}

interface ProvinceAfter34 {
  name: string;
  components: string[];
  codes: number[];
}

const normalize = (s: string | null | undefined): string => {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(tp|tinh|thanh pho|thanhpho)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const CURR: Province[] = [
  { name: "Cao Bằng", codes: [11] },
  { name: "Lạng Sơn", codes: [12] },
  { name: "Quảng Ninh", codes: [14] },
  { name: "Hải Phòng", codes: [15, 16] },
  { name: "Thái Bình", codes: [17] },
  { name: "Nam Định", codes: [18] },
  { name: "Phú Thọ", codes: [19] },
  { name: "Thái Nguyên", codes: [20] },
  { name: "Yên Bái", codes: [21] },
  { name: "Tuyên Quang", codes: [22] },
  { name: "Hà Giang", codes: [23] },
  { name: "Lào Cai", codes: [24] },
  { name: "Lai Châu", codes: [25] },
  { name: "Sơn La", codes: [26] },
  { name: "Điện Biên", codes: [27] },
  { name: "Hòa Bình", codes: [28] },
  { name: "Hà Nội", codes: [29, 30, 31, 32, 33, 40] },
  { name: "Hải Dương", codes: [34] },
  { name: "Ninh Bình", codes: [35] },
  { name: "Thanh Hóa", codes: [36] },
  { name: "Nghệ An", codes: [37] },
  { name: "Hà Tĩnh", codes: [38] },
  { name: "Đồng Nai", codes: [39, 60] },
  { name: "TP. Hồ Chí Minh", codes: [41, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59] },
  { name: "Đà Nẵng", codes: [43] },
  { name: "Đắk Lắk", codes: [47] },
  { name: "Đắk Nông", codes: [48] },
  { name: "Lâm Đồng", codes: [49] },
  { name: "Bình Dương", codes: [61] },
  { name: "Long An", codes: [62] },
  { name: "Tiền Giang", codes: [63] },
  { name: "Vĩnh Long", codes: [64] },
  { name: "Cần Thơ", codes: [65] },
  { name: "Đồng Tháp", codes: [66] },
  { name: "An Giang", codes: [67] },
  { name: "Kiên Giang", codes: [68] },
  { name: "Cà Mau", codes: [69] },
  { name: "Tây Ninh", codes: [70] },
  { name: "Bến Tre", codes: [71] },
  { name: "Bà Rịa - Vũng Tàu", codes: [72] },
  { name: "Quảng Bình", codes: [73] },
  { name: "Quảng Trị", codes: [74] },
  { name: "Thừa Thiên Huế", codes: [75] },
  { name: "Quảng Ngãi", codes: [76] },
  { name: "Bình Định", codes: [77] },
  { name: "Phú Yên", codes: [78] },
  { name: "Khánh Hòa", codes: [79] },
  { name: "Cục CSGT", codes: [80] },
  { name: "Gia Lai", codes: [81] },
  { name: "Kon Tum", codes: [82] },
  { name: "Sóc Trăng", codes: [83] },
  { name: "Trà Vinh", codes: [84] },
  { name: "Ninh Thuận", codes: [85] },
  { name: "Bình Thuận", codes: [86] },
  { name: "Vĩnh Phúc", codes: [88] },
  { name: "Hưng Yên", codes: [89] },
  { name: "Hà Nam", codes: [90] },
  { name: "Quảng Nam", codes: [92] },
  { name: "Bình Phước", codes: [93] },
  { name: "Bạc Liêu", codes: [94] },
  { name: "Hậu Giang", codes: [95] },
  { name: "Bắc Kạn", codes: [97] },
  { name: "Bắc Giang", codes: [98] },
  { name: "Bắc Ninh", codes: [99] }
];

const AFTER34: ProvinceAfter34[] = [
  { name: "TP Hà Nội", components: ["TP Hà Nội"], codes: [29, 30, 31, 32, 33, 40] },
  { name: "TP Hồ Chí Minh", components: ["Bình Dương", "TP Hồ Chí Minh", "Bà Rịa - Vũng Tàu"], codes: [41, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 61, 72] },
  { name: "TP Hải Phòng", components: ["TP Hải Phòng", "Hải Dương"], codes: [15, 16, 34] },
  { name: "TP Đà Nẵng", components: ["TP Đà Nẵng", "Quảng Nam"], codes: [43, 92] },
  { name: "TP Cần Thơ", components: ["TP Cần Thơ", "Sóc Trăng", "Hậu Giang"], codes: [65, 83, 95] },
  { name: "TP Huế", components: ["TP Huế"], codes: [75] },
  { name: "Cao Bằng", components: ["Cao Bằng"], codes: [11] },
  { name: "Lạng Sơn", components: ["Lạng Sơn"], codes: [12] },
  { name: "Bắc Ninh", components: ["Bắc Ninh", "Bắc Giang"], codes: [98, 99] },
  { name: "Quảng Ninh", components: ["Quảng Ninh"], codes: [14] },
  { name: "Hưng Yên", components: ["Hưng Yên", "Thái Bình"], codes: [17, 89] },
  { name: "Ninh Bình", components: ["Ninh Bình", "Nam Định", "Hà Nam"], codes: [18, 35, 90] },
  { name: "Phú Thọ", components: ["Phú Thọ", "Hòa Bình", "Vĩnh Phúc"], codes: [19, 28, 88] },
  { name: "Thái Nguyên", components: ["Thái Nguyên", "Bắc Kạn"], codes: [20, 97] },
  { name: "Lào Cai", components: ["Yên Bái", "Lào Cai"], codes: [21, 24] },
  { name: "Tuyên Quang", components: ["Hà Giang", "Tuyên Quang"], codes: [22, 23] },
  { name: "Lai Châu", components: ["Lai Châu"], codes: [25] },
  { name: "Sơn La", components: ["Sơn La"], codes: [26] },
  { name: "Điện Biên", components: ["Điện Biên"], codes: [27] },
  { name: "Thanh Hóa", components: ["Thanh Hóa"], codes: [36] },
  { name: "Nghệ An", components: ["Nghệ An"], codes: [37] },
  { name: "Hà Tĩnh", components: ["Hà Tĩnh"], codes: [38] },
  { name: "Quảng Trị", components: ["Quảng Bình", "Quảng Trị"], codes: [73, 74] },
  { name: "Quảng Ngãi", components: ["Quảng Ngãi", "Kon Tum"], codes: [76, 82] },
  { name: "Gia Lai", components: ["Bình Định", "Gia Lai"], codes: [77, 81] },
  { name: "Khánh Hòa", components: ["Khánh Hòa", "Ninh Thuận"], codes: [79, 85] },
  { name: "Lâm Đồng", components: ["Lâm Đồng", "Đắk Nông", "Bình Thuận"], codes: [48, 49, 86] },
  { name: "Đắk Lắk", components: ["Đắk Lắk", "Phú Yên"], codes: [47, 78] },
  { name: "Đồng Nai", components: ["Đồng Nai", "Bình Phước"], codes: [39, 60, 93] },
  { name: "Tây Ninh", components: ["Tây Ninh", "Long An"], codes: [62, 70] },
  { name: "Vĩnh Long", components: ["Vĩnh Long", "Bến Tre", "Trà Vinh"], codes: [64, 71, 84] },
  { name: "Đồng Tháp", components: ["Đồng Tháp", "Tiền Giang"], codes: [63, 66] },
  { name: "An Giang", components: ["An Giang", "Kiên Giang"], codes: [67, 68] },
  { name: "Cà Mau", components: ["Cà Mau", "Bạc Liêu"], codes: [69, 94] }
];

const RESERVED = new Set<number>([10, 42, 44, 45, 46, 87, 91, 96]);

const idxCodes = (list: (Province | ProvinceAfter34)[]): Map<number, string[]> => {
  const m = new Map<number, string[]>();
  for (const p of list) {
    for (const c of p.codes) {
      if (!m.has(c)) {
        m.set(c, []);
      }
      m.get(c)!.push(p.name);
    }
  }
  return m;
};

const codeCurr = idxCodes(CURR);
const codeAfter = idxCodes(AFTER34);

const mapAfterByName = new Map<string, ProvinceAfter34>(AFTER34.map((x) => [x.name, x]));

const fmtCodes = (arr: number[]): string => {
  return [...new Set(arr)].sort((a, b) => a - b).join(", ");
};

const codeFromPlate = (s: string | number): number => {
  const m = String(s).match(/(\d{2})/);
  const matched = m && m[1];
  return matched ? parseInt(matched, 10) : NaN;
};

const header = (t: string): string => `--- ${t} ---`;

const renderByCode = (code: number): string => {
  if (RESERVED.has(code)) {
    return `${header("Cũ")}\nMã dự trữ: ${code}\n\n${header("Mới")}\nMã dự trữ: ${code}`;
  }

  const olds =
    (codeCurr.get(code) || []).map((n) => `${n}: ${code}`).join("\n") || "Không tìm thấy";

  const news =
    (codeAfter.get(code) || [])
      .map((n) => {
        const it = mapAfterByName.get(n);
        return it ? `${it.name} (${it.components.join(" + ")}): ${fmtCodes(it.codes)}` : "";
      })
      .filter(Boolean)
      .join("\n") || "Không tìm thấy";

  return `${header("Cũ")}\n${olds}\n\n${header("Mới")}\n${news}`;
};

const findCurrByName = (q: string): Province[] => {
  const k = normalize(q);
  const res: Province[] = [];
  for (const it of CURR) {
    if (normalize(it.name).includes(k)) {
      res.push(it);
    }
  }
  return res;
};

const findAfterByNameOrComponent = (q: string): ProvinceAfter34[] => {
  const k = normalize(q);
  const res: ProvinceAfter34[] = [];
  for (const it of AFTER34) {
    if (normalize(it.name).includes(k) || it.components.some((c) => normalize(c).includes(k))) {
      res.push(it);
    }
  }
  return res;
};

const renderByName = (q: string): string => {
  const olds =
    findCurrByName(q)
      .map((it) => `${it.name}: ${fmtCodes(it.codes)}`)
      .join("\n") || "Không tìm thấy";

  const news =
    findAfterByNameOrComponent(q)
      .map((it) => `${it.name} (${it.components.join(" + ")}): ${fmtCodes(it.codes)}`)
      .join("\n") || "Không tìm thấy";

  return `${header("Cũ")}\n${olds}\n\n${header("Mới")}\n${news}`;
};

const bienCommand: Command = {
  name: "bien",
  alias: ["bienso"],
  version: "1.4.0",
  role: 0,
  desc: "Tra biển số trước/sau sáp nhập (chuẩn 34 tỉnh)",
  guide: "{p}bien <mã|biển|tên>",
  cd: 3,
  prefix: true,
  async onCall(ctx: CommandOnCallContext) {
    const { args, reply } = ctx;

    const q = (args || []).join(" ").trim();

    if (!q) {
      await reply("Dùng: bien <mã/biển/tên>");
      return;
    }

    const code = codeFromPlate(q);
    if (!Number.isNaN(code)) {
      await reply(renderByCode(code));
      return;
    }

    await reply(renderByName(q));
  }
};

export default bienCommand;
