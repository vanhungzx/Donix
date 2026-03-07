import type { Command, CommandOnCallContext } from "@types";
import axios from "axios";
import { createCanvas } from "canvas";
import fs from "fs-extra";
import path from "path";

const TZ = "Asia/Ho_Chi_Minh";
const W = 1080;
const H = 1920;
const P = 40;

interface WeatherInfo {
  t: string;
  icon: string;
  col: string;
  light: string;
}

interface GeocodeResult {
  lat: number;
  lon: number;
  name: string;
}

interface ForecastData {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    precipitation_probability?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    weather_code?: number[];
    precipitation?: number[];
    wind_speed_10m?: number[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    precipitation_probability_max?: number[];
    wind_speed_10m_max?: number[];
  };
}

const pad = (n: number): string => String(n).padStart(2, "0");

const deg = (v: number | null | undefined): number => Math.round(Number(v || 0));

const fmtH = (s: string | null | undefined): string => s?.slice(11, 16) || "";

const fmtD = (s: string | null | undefined): string => {
  const parts = String(s || "").split("T")[0]?.split("-") ?? [];
  const m = parts[1] ?? "";
  const d = parts[2] ?? "";
  return `${pad(Number(d) || 0)}/${pad(Number(m) || 0)}`;
};

const pick = <T>(arr: T[] | null | undefined, i: number, f: T | string = "-"): T | string => {
  const v = arr?.[i];
  return v === null || v === undefined
    ? f
    : typeof v === "number"
      ? Number.isInteger(v)
        ? v
        : String(+v.toFixed(1))
      : v;
};

const deA = (s: string): string => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const quickMap = new Map<string, string>(
  Object.entries({
    hn: "Hà Nội",
    "ha noi": "Hà Nội",
    hanoi: "Hà Nội",
    "hà nội": "Hà Nội",
    sg: "TP.HCM",
    "sai gon": "TP.HCM",
    saigon: "TP.HCM",
    hcm: "TP.HCM",
    "ho chi minh": "TP.HCM",
    dn: "Đà Nẵng",
    "da nang": "Đà Nẵng",
    hp: "Hải Phòng",
    "hai phong": "Hải Phòng",
    ct: "Cần Thơ",
    "can tho": "Cần Thơ",
    nt: "Nha Trang",
    "nha trang": "Nha Trang",
  })
);

const wmoInfo = (c: number): WeatherInfo => {
  const map: Record<number, WeatherInfo> = {
    0: { t: "Trời quang", icon: "☀️", col: "#FF6B6B", light: "#FFECEC" },
    1: { t: "Ít mây", icon: "🌤️", col: "#FFD93D", light: "#FFF9E6" },
    2: { t: "Có mây", icon: "⛅", col: "#A8DADC", light: "#F0F8FA" },
    3: { t: "U ám", icon: "☁️", col: "#95A3A3", light: "#F5F5F5" },
    45: { t: "Sương mù", icon: "🌫️", col: "#C0C0C0", light: "#F8F8F8" },
    48: { t: "Sương mù", icon: "🌫️", col: "#C0C0C0", light: "#F8F8F8" },
    51: { t: "Mưa nhỏ", icon: "🌧️", col: "#4A90E2", light: "#E6F2FF" },
    53: { t: "Mưa nhỏ", icon: "🌧️", col: "#4A90E2", light: "#E6F2FF" },
    55: { t: "Mưa", icon: "🌧️", col: "#2E5C8A", light: "#D0E8FF" },
    61: { t: "Mưa", icon: "🌧️", col: "#4A90E2", light: "#E6F2FF" },
    63: { t: "Mưa đều", icon: "🌧️", col: "#2E5C8A", light: "#D0E8FF" },
    65: { t: "Mưa nặng", icon: "🌧️", col: "#1A3A5C", light: "#B8DAFF" },
    71: { t: "Tuyết", icon: "❄️", col: "#B8E6FF", light: "#F0F9FF" },
    73: { t: "Tuyết", icon: "❄️", col: "#B8E6FF", light: "#F0F9FF" },
    75: { t: "Tuyết nặng", icon: "❄️", col: "#7ECBFF", light: "#D9EFFF" },
    77: { t: "Mưa tuyết", icon: "🌨️", col: "#A0D8FF", light: "#E6F5FF" },
    80: { t: "Mưa rào", icon: "🌧️", col: "#4A90E2", light: "#E6F2FF" },
    81: { t: "Mưa rào", icon: "🌧️", col: "#2E5C8A", light: "#D0E8FF" },
    82: { t: "Mưa rào nặng", icon: "🌧️", col: "#1A3A5C", light: "#B8DAFF" },
    85: { t: "Tuyết rào", icon: "🌨️", col: "#B8E6FF", light: "#F0F9FF" },
    86: { t: "Tuyết rào nặng", icon: "🌨️", col: "#7ECBFF", light: "#D9EFFF" },
    95: { t: "Dông", icon: "⛈️", col: "#8B5FBF", light: "#F3EBFF" },
    96: { t: "Dông mưa đá", icon: "⛈️", col: "#7C6FD9", light: "#EFE6FF" },
    99: { t: "Dông mưa đá", icon: "⛈️", col: "#6B5FCC", light: "#EBE0FF" },
  };
  return map[c] || { t: "Không rõ", icon: "❓", col: "#999", light: "#F5F5F5" };
};

async function geocode(q: string, lang: string = "vi"): Promise<GeocodeResult | null> {
  const { data } = await axios.get("https://geocoding-api.open-meteo.com/v1/search", {
    params: { name: q, count: 1, language: lang, format: "json" },
  });

  const r = data?.results?.[0];
  if (!r) return null;

  return { lat: r.latitude, lon: r.longitude, name: r.name };
}

async function forecast(lat: number, lon: number, tz: string = TZ): Promise<ForecastData> {
  const params = {
    latitude: lat,
    longitude: lon,
    timezone: tz,
    temperature_unit: "celsius",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m",
    hourly: "temperature_2m,weather_code,precipitation,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
    forecast_days: 14,
  };

  const { data } = await axios.get("https://api.open-meteo.com/v1/forecast", { params });
  return data;
}

function rect(ctx: any, x: number, y: number, w: number, h: number, r: number = 20): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, -Math.PI / 2);
  ctx.closePath();
}

function drawHeader(ctx: any, loc: string, cur: ForecastData["current"], date: string): void {
  
  const grad = ctx.createLinearGradient(0, 0, W, 500);
  grad.addColorStop(0, "#667eea");
  grad.addColorStop(0.5, "#764ba2");
  grad.addColorStop(1, "#f093fb");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 480);

  
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 52px 'Segoe UI', system-ui";
  ctx.textAlign = "left";
  ctx.fillText(loc, P, 120);

  
  ctx.font = "20px 'Segoe UI', system-ui";
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillText(date, P, 165);

  
  const wi = wmoInfo(cur?.weather_code || 0);
  ctx.font = "120px Arial";
  ctx.textAlign = "right";
  ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
  ctx.shadowBlur = 15;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  ctx.fillText(wi.icon, W - P - 30, 160);
  ctx.shadowColor = "transparent";

  
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 120px 'Segoe UI'";
  ctx.textAlign = "left";
  ctx.fillText(`${deg(cur?.temperature_2m)}°`, P, 320);

  
  ctx.font = "28px 'Segoe UI', system-ui";
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.fillText(wi.t, P, 365);

  ctx.font = "20px 'Segoe UI', system-ui";
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillText(`Cảm giác ${deg(cur?.apparent_temperature)}°C`, P, 410);

  
  const statsY = 500;
  const boxW = (W - P * 2 - 20) / 4;
  const stats = [
    { icon: "💧", label: "Độ ẩm", val: `${deg(cur?.relative_humidity_2m)}%` },
    { icon: "💨", label: "Gió", val: `${deg(cur?.wind_speed_10m)}` },
    { icon: "🌧️", label: "Mưa", val: `${pick([cur?.precipitation], 0)}mm` },
    { icon: "📈", label: "Xác suất", val: `${deg(cur?.precipitation_probability)}%` },
  ];

  stats.forEach((s, i) => {
    const x = P + i * (boxW + 5);
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;
    rect(ctx, x, statsY, boxW, 110, 18);
    ctx.fill();
    ctx.shadowColor = "transparent";

    ctx.fillStyle = "#2C3E50";
    ctx.font = "36px Arial";
    ctx.textAlign = "center";
    ctx.fillText(s.icon, x + boxW / 2, statsY + 38);

    ctx.font = "bold 13px 'Segoe UI'";
    ctx.fillStyle = "#666";
    ctx.fillText(s.label, x + boxW / 2, statsY + 68);

    ctx.font = "bold 18px 'Segoe UI'";
    ctx.fillStyle = "#1a1a1a";
    ctx.fillText(s.val, x + boxW / 2, statsY + 100);
  });
}

function drawHourlyChart(ctx: any, hourly: ForecastData["hourly"], start: number, take: number): void {
  const y = 680;

  
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = "rgba(0, 0, 0, 0.08)";
  ctx.shadowBlur = 15;
  ctx.shadowOffsetY = 5;
  rect(ctx, P, y, W - P * 2, 340, 28);
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.fillStyle = "#2C3E50";
  ctx.font = "bold 26px 'Segoe UI'";
  ctx.textAlign = "left";
  ctx.fillText("🕐 Dự báo 12h tới", P + 30, y + 60);

  
  let maxT = -1e9;
  let minT = 1e9;
  for (let i = 0; i < take; i++) {
    const v = +pick(hourly?.temperature_2m, start + i, 0);
    maxT = Math.max(maxT, v);
    minT = Math.min(minT, v);
  }
  const range = Math.max(1, maxT - minT);

  
  const chartY = y + 140;
  const chartH = 140;
  const chartW = W - P * 2 - 60;
  const colW = chartW / (take - 1 || 1);

  const pts: [number, number, number][] = [];
  for (let i = 0; i < take; i++) {
    const v = +pick(hourly?.temperature_2m, start + i, 0);
    const px = P + 30 + colW * i;
    const py = chartY + chartH - 40 - ((v - minT) / range) * (chartH - 60);
    pts.push([px, py, v]);
  }

  if (pts.length === 0) {
    return;
  }

  
  ctx.strokeStyle = "#667eea";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1]!;
    const p1 = pts[i]!;
    const dx = p1[0] - p0[0];
    ctx.bezierCurveTo(p0[0] + dx / 3, p0[1], p0[0] + (2 * dx) / 3, p1[1], p1[0], p1[1]);
  }
  ctx.stroke();

  
  pts.forEach((pt, i) => {
    ctx.fillStyle = "#667eea";
    ctx.beginPath();
    ctx.arc(pt[0], pt[1], 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(pt[0], pt[1], 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2C3E50";
    ctx.font = "bold 16px 'Segoe UI'";
    ctx.textAlign = "center";
    ctx.fillText(`${deg(pt[2])}°`, pt[0], pt[1] - 28);

    ctx.fillStyle = "#667";
    ctx.font = "13px 'Segoe UI'";
    ctx.fillText(fmtH(hourly?.time?.[start + i]), pt[0], chartY + chartH + 28);
  });
}

function drawDaily(ctx: any, daily: ForecastData["daily"], dTake: number): void {
  const y = 1080;

  ctx.fillStyle = "#2C3E50";
  ctx.font = "bold 26px 'Segoe UI'";
  ctx.textAlign = "left";
  ctx.fillText("📅 10 ngày tới", P, y + 50);

  
  const cardW = (W - P * 2 - 24) / 5;
  for (let i = 0; i < dTake && i < 5; i++) {
    const cx = P + i * (cardW + 6);
    const cy = y + 80;

    const wi = wmoInfo(pick(daily?.weather_code, i, 0) as number);

    
    ctx.fillStyle = wi.light;
    ctx.shadowColor = "rgba(0, 0, 0, 0.06)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    rect(ctx, cx, cy, cardW, 220, 16);
    ctx.fill();
    ctx.shadowColor = "transparent";

    const centerX = cx + cardW / 2;

    
    ctx.fillStyle = wi.col;
    ctx.font = "bold 15px 'Segoe UI'";
    ctx.textAlign = "center";
    ctx.fillText(fmtD(daily?.time?.[i]), centerX, cy + 35);

    
    ctx.font = "56px Arial";
    ctx.fillText(wi.icon, centerX, cy + 100);

    
    ctx.font = "14px 'Segoe UI'";
    ctx.fillStyle = wi.col;
    ctx.fillText(wi.t, centerX, cy + 135);

    
    const maxT = deg(pick(daily?.temperature_2m_max, i, 0) as number);
    const minT = deg(pick(daily?.temperature_2m_min, i, 0) as number);
    ctx.font = "bold 20px 'Segoe UI'";
    ctx.fillStyle = "#2C3E50";
    ctx.fillText(`${maxT}°`, centerX, cy + 168);
    ctx.font = "15px 'Segoe UI'";
    ctx.fillStyle = "#95A5A6";
    ctx.fillText(`${minT}°`, centerX, cy + 195);
  }

  ctx.shadowColor = "transparent";
}

async function renderCard(outPath: string, loc: string, data: ForecastData): Promise<void> {
  const c = createCanvas(W, H);
  const ctx = c.getContext("2d");

  
  ctx.fillStyle = "#FAFBFC";
  ctx.fillRect(0, 0, W, H);

  const now = new Date();
  const dayName = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][now.getDay()];
  const date = `Thứ ${dayName}, ${pad(now.getDate())}/${pad(now.getMonth() + 1)} ${now.getFullYear()}`;

  drawHeader(ctx, loc, data.current || {}, date);

  const ht = data.hourly?.time || [];
  let start = 0;
  if (data.current?.time) {
    const ix = ht.findIndex((t) => t >= data.current!.time!);
    start = ix >= 0 ? ix : 0;
  }
  const take = Math.min(12, Math.max(0, ht.length - start));
  drawHourlyChart(ctx, data.hourly || {}, start, take);

  const dTake = Math.min(10, (data.daily?.time || []).length);
  drawDaily(ctx, data.daily || {}, dTake);

  await fs.ensureDir(path.dirname(outPath));
  await fs.writeFile(outPath, c.toBuffer("image/png"));
}

function todaySummary(data: ForecastData): string {
  const d = data.daily || {};
  const cur = data.current || {};
  const wi = wmoInfo(cur.weather_code || 0);
  const tmin = pick(d.temperature_2m_min, 0, "-");
  const tmax = pick(d.temperature_2m_max, 0, "-");

  return `${wi.icon} ${wi.t}\n🌡️ ${tmin}°~${tmax}°C | 💨 ${deg(cur.wind_speed_10m)}km/h | 💧 ${deg(cur.relative_humidity_2m)}%`;
}

async function onCall(ctx: CommandOnCallContext): Promise<void> {
  const { args, reply } = ctx;

  try {
    const raw = args.join(" ").trim();
    if (!raw) {
      await reply("Nhập địa điểm");
      return;
    }

    const norm = deA(raw);
    const q = quickMap.get(norm) || raw;
    const lang = /[aăâáàảãạắằẳẵặấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữự]/i.test(raw) ? "vi" : "en";

    const geo = await geocode(q, lang);
    if (!geo) {
      await reply("Không tìm thấy địa điểm");
      return;
    }

    const data = await forecast(geo.lat, geo.lon, TZ);
    const out = path.join(process.cwd(), "temp", `wt_${Date.now()}.png`);

    try {
      await renderCard(out, geo.name, data);
      await reply({ body: todaySummary(data), attachment: fs.createReadStream(out) });
      setTimeout(() => fs.remove(out).catch(() => { }), 30_000);
    } catch (e) {
      await reply(todaySummary(data));
    }
  } catch {
    await reply("Lỗi lấy dữ liệu");
  }
}

const weatherCommand: Command = {
  name: "weather",
  alias: ["wt", "thoitiet"],
  version: "6.0.0",
  role: 0,
  desc: "Thời tiết chi tiết",
  guide: "{pn} <địa điểm>",
  cd: 5,
  prefix: true,
  onCall,
};

export default weatherCommand;
