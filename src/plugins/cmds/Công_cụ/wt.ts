import type { Command, CommandOnCallContext } from "@types";
import fs from "fs-extra";
import path from "path";
import moment from "moment-timezone";
import { Client, TextChannel } from "discord.js-selfbot-v13";

// --- Constants & Helper Functions (Giữ nguyên logic) ---
const DATA_DIR = path.join(process.cwd(), "storage");
fs.ensureDirSync(DATA_DIR);

const SETTINGS_PATH = path.join(DATA_DIR, "weather_settings.json");
const LAST_MSG_PATH = path.join(DATA_DIR, "last_processed_messages.json");
const PREMIUM_PATH = path.join(DATA_DIR, "weather_premium.json");
const CACHE_WEATHER_PATH = path.join(DATA_DIR, "weather_cache.json");

const MENU_CHANNEL_ID = "1432726952841580655";
const LOG_CHANNEL_IDS = [
  "15171103689951115138",
  "1517390903927504906",
  "1497641756664004689"
];
const DISCORD_TOKEN = "MTQwMjkyMTE5MDM4MDUzNTg1OA.GqzYJN.6KHQlEWnVg94evT6mhxIOHyWvQVzB58J1DpNZY";
const CLICK_COOLDOWN = 30 * 60 * 1000;

let discordClient: any = null;
let pollingTimer: any = null;

function loadJSON<T>(filePath: string, defaultData: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      fs.ensureDirSync(path.dirname(filePath));
      fs.writeJsonSync(filePath, defaultData, { spaces: 2 });
      return defaultData;
    }
    return fs.readJsonSync(filePath);
  } catch (e) { return defaultData; }
}

function saveJSON<T>(filePath: string, data: T): void {
  try { fs.writeJsonSync(filePath, data, { spaces: 2 }); } catch (e) { }
}

function getPremiumLevel(threadID: string): string {
  const premiumData = loadJSON<Record<string, string>>(PREMIUM_PATH, {});
  return premiumData[threadID] || "free";
}

function getLimitByLevel(level: string): number {
  switch (level) {
    case "pre1": return 20;
    case "pre2": return 30;
    case "pre3": return 999;
    default: return 10;
  }
}

// Các hàm xử lý thời tiết...
function parseWeatherData(message: any) { /* Giữ nguyên logic cũ */ 
  if (!message) return { weatherList: [], discordUpdateTime: null };
  let content = "";
  function findData(comps: any[]) {
    if (!comps || !Array.isArray(comps)) return;
    comps.forEach(comp => {
      if (comp.content) content += "\n" + comp.content;
      if (comp.components) findData(comp.components);
    });
  }
  if (message.components) findData(message.components);
  if (!content.trim()) content = message.content || "";
  const weatherList: { name: string; time: number }[] = [];
  const regex = /<:[^:]+:\d+>\s*\*\*([^*]+)\*\*\s*-\s*<t:(\d+):t>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    weatherList.push({ name: match[1].trim(), time: Number(match[2]) });
  }
  return {
    weatherList,
    discordUpdateTime: moment(message.timestamp).tz("Asia/Ho_Chi_Minh").format("HH:mm DD/MM")
  };
}

function buildWeatherText(parsedData: any, threadID: string, isAuto: boolean = false): string {
  const { weatherList, discordUpdateTime } = parsedData;
  const now = moment().unix();
  const formatTime = (ts: number) => moment.unix(ts).tz("Asia/Ho_Chi_Minh").format("HH:mm");
  const level = getPremiumLevel(threadID);
  const limit = getLimitByLevel(level);

  let msg = `🛰️ 【 WEATHER LOG 】 🛰️\n-------------------------------------\n⏰ Cập nhật: ${discordUpdateTime || "Không rõ"}\n🤖 Chế độ: ${isAuto ? "Tự động" : "Thủ công"}\n⭐ Gói: ${level.toUpperCase()}\n-------------------------------------\n\n`;
  if (weatherList.length === 0) msg += `⚠️ Không tìm thấy dữ liệu.`;
  else {
    let displayList = (level === "pre3") ? weatherList : weatherList.filter((w: any) => w.time >= now - 300).slice(0, limit);
    if (displayList.length === 0) msg += `✨ Hiện tại không có dự báo mới.`;
    else displayList.forEach((w: any) => {
        let status = (now >= w.time && now < w.time + 600) ? "🟢" : "⚪";
        msg += `${status} **${w.name}**: ${formatTime(w.time)}\n`;
      });
  }
  msg += `\n-------------------------------------\n✨ Zenitsu - Donate để xem thêm\n🔗 https://zenitsu.site.je`;
  return msg;
}

async function getLatestLogMessage(): Promise<any> {
    let latestMsg: any = null;
    if (!discordClient) return null;
    for (const channelId of LOG_CHANNEL_IDS) {
      try {
        const channel = await discordClient.channels.fetch(channelId) as TextChannel;
        const msgs = await channel.messages.fetch({ limit: 1 });
        const msg = msgs.first();
        if (msg && (!latestMsg || msg.createdTimestamp > latestMsg.createdTimestamp)) latestMsg = msg;
      } catch (e) { }
    }
    return latestMsg;
}

async function getInteractiveWeather(force: boolean = false): Promise<any> {
  if (!discordClient || !discordClient.isReady()) return null;
  const cache = loadJSON<{lastClick: number, lastData: any}>(CACHE_WEATHER_PATH, { lastClick: 0, lastData: null });
  const now = Date.now();
  if (!force && (now - cache.lastClick < CLICK_COOLDOWN) && cache.lastData) return cache.lastData;

  try {
    const menuChannel = await discordClient.channels.fetch(MENU_CHANNEL_ID) as TextChannel;
    let messages = await menuChannel.messages.fetch({ limit: 10 });
    const mainInteraction = messages.find((m: any) => m.components.some((row: any) => row.components.some((c: any) => c.customId === "utilities_select")));
    
    if (mainInteraction) {
        await (mainInteraction as any).selectMenu("utilities_select", ["weather_trigger"]);
        await new Promise(r => setTimeout(r, 4000));
        messages = await menuChannel.messages.fetch({ limit: 5 });
        const featureMenuButtonMsg = messages.find((m: any) => m.components.some((row: any) => row.components.some((c: any) => c.label === "Menu Tính Năng")));
        if (featureMenuButtonMsg) {
            const btn = featureMenuButtonMsg.components[0].components.find((c: any) => c.label === "Menu Tính Năng");
            await (featureMenuButtonMsg as any).clickButton(btn.customId);
            await new Promise(r => setTimeout(r, 4000));
        }
        messages = await menuChannel.messages.fetch({ limit: 5 });
        const areaSelectMsg = messages.find((m: any) => m.components.some((row: any) => row.components.some((c: any) => c.type === 3)));
        if (areaSelectMsg) {
            const selectMenu = areaSelectMsg.components[0].components[0];
            await (areaSelectMsg as any).selectMenu(selectMenu.customId, [selectMenu.options[0].value]);
            await new Promise(r => setTimeout(r, 3000));
            const lookupBtn = areaSelectMsg.components.find((row: any) => row.components.some((c: any) => c.label === "Tra cứu"))?.components.find((c: any) => c.label === "Tra cứu");
            if (lookupBtn) await (areaSelectMsg as any).clickButton(lookupBtn.customId);
            await new Promise(r => setTimeout(r, 6000));
        }
    }
    const latestMsg = await getLatestLogMessage();
    if (latestMsg) {
      cache.lastClick = now;
      cache.lastData = latestMsg;
      saveJSON(CACHE_WEATHER_PATH, cache);
      return latestMsg;
    }
    return cache.lastData;
  } catch (e) { return cache.lastData; }
}

async function startDiscordReader(api: any): Promise<void> {
  if (discordClient) return;
  discordClient = new Client({ checkUpdate: false });
  discordClient.on("ready", () => {
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = setInterval(async () => {
        try {
            const lastProcessed = loadJSON<any>(LAST_MSG_PATH, { weather: null });
            const weatherMsg = await getInteractiveWeather();
            if (weatherMsg && weatherMsg.id !== lastProcessed.weather) {
              const parsed = parseWeatherData(weatherMsg);
              if (parsed.weatherList.length > 0) {
                 const settings = loadJSON<Record<string, boolean>>(SETTINGS_PATH, {});
                 for (const tid in settings) {
                     if (settings[tid] === true) {
                         try { await api.sendMessage(buildWeatherText(parsed, tid, true), tid); } catch (e) { }
                     }
                 }
                lastProcessed.weather = weatherMsg.id;
                saveJSON(LAST_MSG_PATH, lastProcessed);
              }
            }
        } catch (e) {}
    }, 60000);
  });
  try { await discordClient.login(DISCORD_TOKEN); } catch (e) { discordClient = null; }
}

// --- CẤU TRÚC COMMAND THEO VÍ DỤ ---

const weatherCommand: Command = {
  name: "wt",
  desc: "Weather Multi-Log Support",
  guide: "{pn} [check/on/off/active]",
  role: 0,
  cd: 5,
  prefix: true,

  onLoad: async (ctx) => {
    startDiscordReader(ctx.api);
  },

  onCall: async (ctx: CommandOnCallContext) => {
    const { event, args } = ctx;
    const { threadID, senderID } = event;
    const action = args[0]?.toLowerCase();

    if (action === "on" || action === "off") {
      const settings = loadJSON<Record<string, boolean>>(SETTINGS_PATH, {});
      settings[threadID] = action === "on";
      saveJSON(SETTINGS_PATH, settings);
      return ctx.reply(`✅ Đã ${action === "on" ? "BẬT" : "TẮT"} auto weather.`);
    }

    if (action === "check") {
      const weatherMsg = await getInteractiveWeather();
      if (!weatherMsg) return ctx.reply("❌ Không có dữ liệu.");
      return ctx.reply(buildWeatherText(parseWeatherData(weatherMsg), threadID, false));
    }

    if (action === "active") {
      const ADMIN_ID = "61550030184394";
      if (senderID !== ADMIN_ID) return ctx.reply("⚠️ Bạn không có quyền!");
      const level = args[1]?.toLowerCase();
      if (!["pre1", "pre2", "pre3", "free"].includes(level || "")) return ctx.reply("⚠️ Cú pháp: /wt active [free/pre1/pre2/pre3]");
      const premiumData = loadJSON<Record<string, string>>(PREMIUM_PATH, {});
      premiumData[threadID] = level;
      saveJSON(PREMIUM_PATH, premiumData);
      return ctx.reply(`✅ Đã kích hoạt gói ${level.toUpperCase()} cho Box này.`);
    }

    ctx.reply("✨ WEATHER INTERACTIVE ✨\n• /wt check\n• /wt on/off\n• /wt active (Admin)");
  }
};

export default weatherCommand;
