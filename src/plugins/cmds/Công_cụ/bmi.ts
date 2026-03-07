import type { Command, CommandOnCallContext } from "@types";
import { createCanvas } from "canvas";
import * as fs from "fs";
import * as path from "path";

function classifyWPRO(b: number): [string, string] {
  if (b < 18.5) return ["Thiếu cân", "Bổ sung dinh dưỡng, tập đều để tăng cân bền vững"];
  if (b < 23) return ["Bình thường", "Duy trì ăn uống cân bằng và vận động hiện tại"];
  if (b < 25) return ["Thừa cân mức nhẹ", "Giảm nhẹ năng lượng, tăng vận động nhịp nhàng"];
  if (b < 30) return ["Béo phì độ I", "Cắt giảm calo hợp lý và tập luyện có kế hoạch"];
  if (b < 35) return ["Béo phì độ II", "Tham khảo bác sĩ/dinh dưỡng để phác đồ phù hợp"];
  return ["Béo phì độ III", "Cần theo dõi y khoa sát và giảm cân an toàn"];
}

const bmiCommand: Command = {
  name: "bmi",
  alias: ["chisocannang"],
  version: "1.6.0",
  role: 0,
  desc: "Tính BMI, IBW theo giới tính",
  guide: "{pn} [chiều cao m|cm] [cân nặng kg] [tuổi?]",
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext) {
    const { event, args, userData, config, reply } = ctx as any;
    const { senderID } = event;

    if (!args[0] || !args[1]) {
      return reply({
        body: `❎ Dùng: ${config.PREFIX}bmi [chiều cao m|cm] [cân nặng kg] [tuổi?]`
      });
    }

    const hRaw = String(args[0]).replace(/[^\d.]/g, "");
    const wRaw = String(args[1]).replace(/[^\d.]/g, "");
    const ageRaw = args[2] ? String(args[2]).replace(/[^\d.]/g, "") : "";

    if (!hRaw || !wRaw || !isFinite(Number(hRaw)) || !isFinite(Number(wRaw))) {
      return reply({
        body: "⚠️ Nhập đúng định dạng chiều cao và cân nặng."
      });
    }

    let height = parseFloat(hRaw);
    const weight = parseFloat(wRaw);

    if (height <= 0 || weight <= 0) {
      return reply({
        body: "⚠️ Giá trị không hợp lệ."
      });
    }

    if (height >= 3) height = height / 100;

    const heightCm = Math.round(height * 100);

    const name = (await userData.getName(senderID)) || "Người dùng";
    const profile = await userData.get(senderID);
    const genderCode = profile?.userInfo?.gender || "";
    const genderText = genderCode === "MALE" ? "Nam" : genderCode === "FEMALE" ? "Nữ" : "Chưa rõ";

    const bmi = Number((weight / (height * height)).toFixed(2));

    const [state, advice] = classifyWPRO(bmi);

    const idealWeightLow = Number((18.5 * height * height).toFixed(1));
    const idealWeightHigh = Number((22.9 * height * height).toFixed(1));

    let ibw: number | null = null;
    if (genderCode === "MALE") ibw = Number((50 + 0.9 * Math.max(0, heightCm - 152)).toFixed(1));
    if (genderCode === "FEMALE") ibw = Number((45.5 + 0.9 * Math.max(0, heightCm - 152)).toFixed(1));

    const age = ageRaw && isFinite(Number(ageRaw)) ? parseInt(ageRaw) : null;

    let bmr: number | null = null;
    if (age && (genderCode === "MALE" || genderCode === "FEMALE")) {
      if (genderCode === "MALE") {
        bmr = Math.round(10 * weight + 6.25 * heightCm - 5 * age + 5);
      } else {
        bmr = Math.round(10 * weight + 6.25 * heightCm - 5 * age - 161);
      }
    }

    const tempDir = path.join(process.cwd(), "temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const imagePath = path.join(tempDir, `bmi_${senderID}_${Date.now()}.png`);

    const WIDTH = 1200;
    const HEIGHT = 420;

    const canvas = createCanvas(WIDTH, HEIGHT);
    const canvasCtx = canvas.getContext("2d");

    canvasCtx.fillStyle = "#ffffff";
    canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

    canvasCtx.fillStyle = "#111827";
    canvasCtx.font = "bold 28px Arial";
    canvasCtx.fillText("Biểu đồ chỉ số BMI", 40, 50);

    const bar = { x: 80, y: 140, w: 1040, h: 36 };

    const grad = canvasCtx.createLinearGradient(bar.x, bar.y, bar.x + bar.w, bar.y);
    grad.addColorStop(0, "#60a5fa");
    grad.addColorStop((18.5 - 15) / 25, "#34d399");
    grad.addColorStop((23 - 15) / 25, "#fbbf24");
    grad.addColorStop((25 - 15) / 25, "#f59e0b");
    grad.addColorStop((30 - 15) / 25, "#ef4444");
    grad.addColorStop(1, "#b91c1c");

    canvasCtx.fillStyle = grad;
    canvasCtx.fillRect(bar.x, bar.y, bar.w, bar.h);

    canvasCtx.fillStyle = "#111827";
    canvasCtx.font = "14px Arial";

    [15, 18.5, 23, 25, 30, 40].forEach((v) => {
      const x = bar.x + ((v - 15) / 25) * bar.w;
      canvasCtx.fillRect(x, bar.y + bar.h, 2, 10);
      canvasCtx.fillText(String(v), x - 12, bar.y + bar.h + 26);
    });

    const pinX = Math.min(Math.max(bar.x + ((bmi - 15) / 25) * bar.w, bar.x), bar.x + bar.w);
    canvasCtx.beginPath();
    canvasCtx.moveTo(pinX, bar.y - 18);
    canvasCtx.lineTo(pinX - 10, bar.y - 2);
    canvasCtx.lineTo(pinX + 10, bar.y - 2);
    canvasCtx.closePath();
    canvasCtx.fillStyle = "#111827";
    canvasCtx.fill();

    canvasCtx.font = "bold 22px Arial";
    canvasCtx.fillText(`BMI: ${bmi} — ${state}`, 40, 240);

    canvasCtx.font = "16px Arial";
    canvasCtx.fillText(`Tên: ${name}`, 40, 272);
    canvasCtx.fillText(`Giới tính: ${genderText}`, 40, 300);
    canvasCtx.fillText(`Chiều cao: ${height.toFixed(2)} m (${heightCm} cm)`, 40, 328);
    canvasCtx.fillText(`Cân nặng: ${weight} kg`, 40, 356);
    canvasCtx.fillText(`Khuyến nghị: ${advice}`, 40, 392);

    const out = fs.createWriteStream(imagePath);
    canvas.createPNGStream().pipe(out);

    await new Promise<void>((resolve) => {
      out.on("finish", () => resolve());
    });

    let body = `👤 Tên: ${name}\n🧭 Giới tính: ${genderText}\n📏 Chiều cao: ${height.toFixed(2)} m (${heightCm} cm)\n⚖️ Cân nặng: ${weight} kg\n📝 BMI: ${bmi}\n✏️ Tình trạng: ${state}\n💡 Lời khuyên: ${advice}\n📊 Khoảng cân nặng khoẻ mạnh: ${idealWeightLow}–${idealWeightHigh} kg`;

    if (ibw !== null) body += `\n🎯 Cân nặng lý tưởng (Devine): ${ibw} kg`;
    if (bmr !== null) body += `\n🔥 BMR ước tính: ${bmr} kcal/ngày`;

    await reply({
      body,
      attachment: fs.createReadStream(imagePath)
    });

    setTimeout(() => fs.unlink(imagePath, () => { }), 10000);
  }
};

export default bmiCommand;
