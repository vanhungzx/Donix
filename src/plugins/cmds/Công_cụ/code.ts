import axios from "axios";
import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import moment from "moment-timezone";
import { Client } from "discord.js-selfbot-v13";
import type { Command, CommandOnCallContext } from "@types";

/**
 * Interface cho dữ liệu người chơi Play Together
 */
interface Player {
  roleID: string;
  roleName: string;
}

/**
 * Interface cho dữ liệu người dùng theo từng nhóm
 */
interface UserDataRecord {
  players: Player[];
  history: any[];
}

interface UserData {
  [threadID: string]: UserDataRecord;
}

/**
 * Interface cho cài đặt tự động
 */
interface AutoSettings {
  [threadID: string]: boolean;
}

/**
 * Interface cho dữ liệu tạm thời lưu kết quả redeem
 */
interface TempRedeem {
  [key: string]: {
    time: string;
    success: boolean;
  };
}

const DATA_DIR = path.join(process.cwd(), "storage");
const USER_FILE = path.join(DATA_DIR, "user.json");
const AUTO_FILE = path.join(DATA_DIR, "pt_auto_settings.json");
const TEMP_FILE = path.join(DATA_DIR, "pt_redeem_temp.json");

const VNG_REDEEM_URL = "https://vgrapi-sea.vnggames.com/coordinator/api/v1/code/redeem";
const VNG_LOGIN_URL = "https://billing.vnggames.com/fe/api/auth/quick";
const CLIENT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjIjoxMDY2MSwiYSI6MTA2NjEsInMiOjF9.B08-6v9oP3rNxrvImC-WBO-AN0mru77ZNLOgqosNIjA";
const SERVER_ID = "2";
const GAME_CODE = "661";
const GIFTCODE_CHANNEL_ID = "1443532382073524315";
const DISCORD_TOKEN = "MTQwMjkyMTE5MDM4MDUzNTg1OA.GE_ck4.nl3MXVo6XN7itK1PDJz3YCnVQO9kvsUoyWm4HM";

const listUA = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
];

let discordClient: Client | null = null;

const loadJSON = async <T>(file: string, defaultData: T): Promise<T> => {
  await fs.ensureDir(DATA_DIR);
  if (!(await fs.pathExists(file))) {
    await fs.writeJson(file, defaultData, { spaces: 2 });
    return defaultData;
  }
  return fs.readJson(file);
};

const saveJSON = async (file: string, data: any): Promise<void> => {
  await fs.writeJson(file, data, { spaces: 2 });
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const getTime = () => moment().tz("Asia/Ho_Chi_Minh").format("HH:mm - DD/MM");
const uuid = () => crypto.randomUUID();
const getUA = () => listUA[Math.floor(Math.random() * listUA.length)];

async function checkRoleValid(roleID: string): Promise<{ success: boolean; roleName?: string; cleanID?: string }> {
  const cleanID = String(roleID).replace(/\s+/g, "");
  const params = new URLSearchParams({
    platform: "mobile", clientKey: CLIENT_KEY, loginType: "9", lang: "VI",
    roleID: cleanID, roleName: cleanID, getVgaId: "1"
  }).toString();
  try {
    const res = await axios.post(VNG_LOGIN_URL, params, {
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": getUA() }
    });
    if (res.data?.returnCode === 1) return { success: true, roleName: res.data?.data?.roleName || "N/A", cleanID };
    return { success: false };
  } catch (e) { return { success: false }; }
}

async function ensureRoleName(p: Player, threadID: string, userData: UserData): Promise<boolean> {
  if (p.roleName && p.roleName !== "N/A" && p.roleName !== "") return false;
  const check = await checkRoleValid(p.roleID);
  if (check.success) {
    p.roleName = check.roleName || "N/A";
    const idx = userData[threadID].players.findIndex(player => player.roleID === p.roleID);
    if (idx !== -1) userData[threadID].players[idx].roleName = p.roleName;
    return true;
  }
  return false;
}

async function redeemForRole(roleID: string, roleName: string, giftcode: string): Promise<boolean> {
  try {
    const res = await axios.post(VNG_REDEEM_URL, {
      serverId: SERVER_ID, gameCode: GAME_CODE,
      roleId: roleID, roleName: roleName || roleID, code: giftcode
    }, {
      headers: {
        "content-type": "application/json", "x-client-region": "VN",
        "x-request-id": uuid(), "user-agent": getUA()
      },
      timeout: 15000
    });
    const d = res.data || {};
    return d.success === true || d.code === 1 || String(d.message || "").toLowerCase().includes("success");
  } catch (e) { return false; }
}

async function handleAutoRedeem(api: any, giftcode: string): Promise<void> {
  const autoSettings = await loadJSON<AutoSettings>(AUTO_FILE, {});
  const userData = await loadJSON<UserData>(USER_FILE, {});
  const temp = await loadJSON<TempRedeem>(TEMP_FILE, {});
  let isDataChanged = false;

  for (const threadID in autoSettings) {
    if (autoSettings[threadID] !== true) continue;
    
    const players = userData[threadID]?.players || [];
    if (players.length === 0) continue;

    api.sendMessage(`🎁 [AUTO] Phát hiện code mới: ${giftcode}`, threadID);
    
    let s = 0, f = 0;
    for (let p of players) {
      const key = `${p.roleID}|${giftcode}`;
      if (temp[key]) continue;

      const updated = await ensureRoleName(p, threadID, userData);
      if (updated) isDataChanged = true;

      const success = await redeemForRole(p.roleID, p.roleName, giftcode);
      temp[key] = { time: getTime(), success };
      if (success) s++; else f++;
      
      await delay(2000);
    }
    
    if (isDataChanged) await saveJSON(USER_FILE, userData);
    await saveJSON(TEMP_FILE, temp);
    api.sendMessage(`✅ [AUTO] Code: ${giftcode}\n- Thành công: ${s}\n- Thất bại: ${f}`, threadID);
  }
}

function parseGiftcode(message: any): string | null {
  try {
    let contents: string[] = [];
    const extract = (obj: any) => {
      if (!obj) return;
      if (Array.isArray(obj)) obj.forEach(extract);
      else if (typeof obj === "object") {
        if (obj.content) contents.push(obj.content);
        if (obj.components) extract(obj.components);
      }
    };
    extract(message.components || []);
    for (let text of contents) {
      if (text.includes("# `")) {
        const match = text.match(/#\s*`([^`]+)`/);
        if (match) return match[1];
      }
    }
    return null;
  } catch { return null; }
}

async function startDiscordScanner(api: any): Promise<void> {
  if (discordClient || !DISCORD_TOKEN) return;
  discordClient = new Client({ checkUpdate: false });
  discordClient.on("ready", () => console.log("[DISCORD] Đang quét Giftcode Play Together..."));
  
  discordClient.on("messageCreate", async (message) => {
    if (message.channelId !== GIFTCODE_CHANNEL_ID) return;
    const code = parseGiftcode(message);
    if (code) handleAutoRedeem(api, code.toUpperCase());
  });

  discordClient.login(DISCORD_TOKEN).catch(() => console.error("[DISCORD] Token lỗi!"));
}

const code: Command = {
  name: "code",
  version: "16.0.0",
  role: 0,
  credits: "nvh & yamato",
  desc: "Giftcode Play Together",
  guide: "{pn} add [ID] | {pn} auto on/off | {pn} [giftcode]",
  cd: 5,
  prefix: true,

  onLoad: async ({ api }: any) => {
    await fs.ensureDir(DATA_DIR);
    startDiscordScanner(api);
  },

  onReply: async (ctx: any) => {
    const { event, reply, handleReply } = ctx;
    const { threadID, body } = event;
    const userData = await loadJSON<UserData>(USER_FILE, {});
    if (handleReply.type === "delete_id") {
      const indices = body.split(/\s+/).map((n: string) => parseInt(n) - 1).filter((n: number) => !isNaN(n) && n >= 0 && n < (userData[threadID]?.players?.length || 0));
      if (!indices.length) return;
      
      indices.sort((a: number, b: number) => b - a);
      for (const idx of indices) userData[threadID].players.splice(idx, 1);
      
      await saveJSON(USER_FILE, userData);
      return reply(`🗑 Đã cập nhật lại danh sách sau khi xoá.`);
    }
  },

  onCall: async (ctx: CommandOnCallContext) => {
    const { event, args, reply, send } = ctx;
    const { threadID } = event;
    const sub = (args[0] || "").toLowerCase();

    const userData = await loadJSON<UserData>(USER_FILE, {});
    const autoSettings = await loadJSON<AutoSettings>(AUTO_FILE, {});
    const temp = await loadJSON<TempRedeem>(TEMP_FILE, {});

    if (!userData[threadID]) userData[threadID] = { players: [], history: [] };

    if (sub === "auto") {
      const mode = (args[1] || "").toLowerCase();
      autoSettings[threadID] = (mode === "on");
      await saveJSON(AUTO_FILE, autoSettings);
      return reply(`✅ Đã ${autoSettings[threadID] ? "BẬT" : "TẮT"} auto cho nhóm.`);
    }

    if (sub === "add") {
      const ids = args.slice(1).map((s: string) => s.trim()).filter(Boolean);
      if (!ids.length) return reply("⚠️ Nhập ID cần thêm!");
      
      let added = [];
      for (const id of ids) {
        if (userData[threadID].players.some(p => p.roleID === id)) continue;
        const check = await checkRoleValid(id);
        if (check.success) {
          userData[threadID].players.push({ roleID: check.cleanID!, roleName: check.roleName! });
          added.push(check.roleName);
        }
      }
      await saveJSON(USER_FILE, userData);
      return reply(`✅ Đã thêm: ${added.join(", ") || "Không có nhân vật mới"}`);
    }

    if (sub === "list") {
      const players = userData[threadID].players;
      if (!players.length) return reply("📦 Box trống.");
      let msg = `╭─ DANH SÁCH BOX ─⭓\n`;
      players.forEach((p, i) => msg += `│ ${i + 1}. ${p.roleName || "Chưa có tên"} (${p.roleID})\n`);
      msg += "╰──────────────⭓\n👉 Reply số để xoá.";
      return send(msg, (e: any, info: any) => {
        (global as any).client.handleReply.push({ 
          name: "code", 
          messageID: info.messageID, 
          type: "delete_id",
          author: event.senderID 
        });
      });
    }

    if (args.length === 1 && sub !== "help") {
      const giftcode = args[0].toUpperCase();
      const players = userData[threadID].players;
      if (!players.length) return reply("❎ Box chưa có ID.");

      reply(`🚀 Đang quét [ ${giftcode} ] cho ${players.length} ID...`);
      let s = 0, f = 0;
      let isDataChanged = false;
      for (let p of players) {
        const key = `${p.roleID}|${giftcode}`;
        const updated = await ensureRoleName(p, threadID, userData);
        if (updated) isDataChanged = true;
        
        const success = await redeemForRole(p.roleID, p.roleName, giftcode);
        temp[key] = { time: getTime(), success };
        if (success) s++; else f++;
        await delay(1500);
      }
      if (isDataChanged) await saveJSON(USER_FILE, userData);
      await saveJSON(TEMP_FILE, temp);
      return reply(`✅ Kết quả: ${giftcode}\n- Thành công: ${s}\n- Thất bại: ${f}`);
    }

    return reply(`╭──── GIFTCODE ────⭓\n│ 1. {pn} add [ID]\n│ 2. {pn} list\n│ 3. {pn} [Giftcode]\n│ 4. {pn} auto on/off\n╰───────────────────⭓`);
  }
};

export default code;
