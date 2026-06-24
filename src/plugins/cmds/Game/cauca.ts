"use strict";

import fs from "fs-extra";
import path from "path";
import type { Command, CommandOnCallContext, CommandOnReplyContext } from "@types";

// ---- Types ----

interface Fish {
  id: string;
  name: string;
  emoji?: string;
  price: number;
  rarity: number;
  weightMin?: number;
  weightMax?: number;
  weight?: number;
  [key: string]: unknown;
}

interface Rod {
  id: string;
  name: string;
  price: number;
  durability: number;
  maxWeight: number;
  [key: string]: unknown;
}

interface LocationConfig {
  id: string;
  name: string;
  emoji?: string;
  unlockPrice?: number;
  minWait: number;
  maxWait: number;
  rareFishBonus: number;
  [key: string]: unknown;
}

interface Bait {
  id: string;
  name: string;
  price: number;
  reduction: number;
  luck: number;
  [key: string]: unknown;
}

interface Cooler {
  id: string;
  name: string;
  price: number;
  multiplier: number;
  capacity: number;
  [key: string]: unknown;
}

interface ItemConfig {
  id: string;
  name: string;
  price: number;
  description?: string;
  [key: string]: unknown;
}

interface FishingBuffs {
  luckEndTime: number;
  oneShotNoDurabilityLoss?: boolean;
  nextCastLuckBonus?: number;
  nextCastDoubleFish?: boolean;
  noDurabilityLossCount?: number;
  halfDurabilityCount?: number;
  [key: string]: unknown;
}

interface FishingData {
  rod: string | null;
  rodDurability: number;
  bait: string | null;
  cooler: string | null;
  location: string;
  unlockedLocations: string[];
  totalCaught: number;
  totalValue: bigint | number;
  caughtFish: Record<string, number>;
  inventory: Record<string, number>;
  items: Record<string, number>;
  buffs: FishingBuffs;
  dailyQuests: DailyQuest[];
  lastQuestDate: string;
  lastStealTime: number;
  protectionEnd: number;
  lastStealerID: string | null;
  lastActive: number;
  lastCatchTime: number;
  lastCatchFishName: string | null;
  catchStreak: number;
  [key: string]: unknown;
}

interface DailyQuestReward {
  money: number;
  [key: string]: unknown;
}

interface DailyQuest {
  type: string;
  target: number;
  reward: DailyQuestReward;
  desc: string;
  fishName?: string;
  progress?: number;
  completed?: boolean;
  claimed?: boolean;
  [key: string]: unknown;
}

type FishingDataMap = Record<string, FishingData>;

interface CaucaReplyData {
  commandName: string;
  messageID: string;
  author: string;
  threadID: string;
  type: string;
  category?: "rod" | "bait" | "cooler" | "location" | "item" | "inventory" | "choose_location" | string;
  [key: string]: unknown;
}

interface CaucaUsersHelper {
  getUser: (userID: string) => Promise<{ money?: number; name?: string } | null>;
  addMoney: (userID: string, amount: bigint) => Promise<unknown>;
  delMoney: (userID: string, amount: bigint) => Promise<unknown>;
}

// (Giữ các helper ở trên, không cần context riêng nữa; context dùng trực tiếp CommandOnCallContext / CommandOnReplyContext)

// ---- Logger helpers ----

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

// Simple local logger to avoid missing dependency and keep TypeScript happy
function log(level: "INFO" | "WARN" | "ERROR", message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${level}] ${message}`);
}

const dataDir = path.join(process.cwd(), "storage", "cauca2");
const configDir = path.join(dataDir, "config");
const fishingDataPath = path.join(dataDir, "fishing_data.json");
const gameConfigPath = path.join(dataDir, "game_config.json");

fs.ensureDirSync(dataDir);

// Lock mechanism để tránh race condition
const userLocks = new Map<string, boolean>();

async function withLock(
  userID: string,
  callback: () => Promise<unknown>
): Promise<unknown | string> {
  if (userLocks.has(userID)) {
    return "⚠️ Thao tác quá nhanh, từ từ thôi mày!";
  }

  userLocks.set(userID, true);

  // Fallback auto-release nếu xử lý quá lâu (ví dụ I/O kẹt, logic treo)
  const autoReleaseTimer = setTimeout(() => {
    if (userLocks.has(userID)) {
      userLocks.delete(userID);
      log("WARN", `[CAUCA] Lock auto-released for user ${userID} do xử lý quá lâu`);
    }
  }, 10000); // 10s: đủ dài để xử lý bình thường, chỉ chạy khi có vấn đề bất thường

  try {
    return await callback();
  } catch (e: unknown) {
    log("ERROR", `[CAUCA] Lock error for user ${userID}: ${getErrorMessage(e)}`);
    throw e;
  } finally {
    // Logic chuẩn: xử lý xong là mở lock ngay
    clearTimeout(autoReleaseTimer);
    userLocks.delete(userID);
  }
}

function toMoneyBigInt(value: unknown): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0n;
    return BigInt(Math.floor(value));
  }
  const s = String(value).trim();
  if (!s) return 0n;
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const intPart = s.split(".")[0];
    if (!intPart || intPart === "-" || intPart === "+") return 0n;
    try {
      return BigInt(intPart);
    } catch {
      return 0n;
    }
  }
  if (/^-?\d+$/.test(s)) {
    try {
      return BigInt(s);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

let FISH_LIST: Fish[] = [];
let RODS: Rod[] = [];
let LOCATIONS: LocationConfig[] = [];
let BAITS: Bait[] = [];
let COOLERS: Cooler[] = [];
let ITEMS: ItemConfig[] = [];
let fishingDataMap: FishingDataMap = {};

// Leaderboard cache để tránh sort lại mỗi lần user xem top
interface LeaderboardEntry {
  uid: string;
  totalCaught: number;
  totalValue: bigint;
}

let LEADERBOARD_CACHE: {
  rich: LeaderboardEntry[];
  fisher: LeaderboardEntry[];
  lastUpdate: number;
} = {
  rich: [],
  fisher: [],
  lastUpdate: 0
};

// Weather Events system
let WEATHER_STATE: {
  current: string;
  bonus: number;
  endTime: number;
  lastChange: number;
  notifyThreads: boolean;
} = {
  current: "normal", // normal, rain, storm, sunny
  bonus: 0, // Bonus % cho cá hiếm
  endTime: 0, // Timestamp khi event kết thúc
  lastChange: Date.now(),
  notifyThreads: false // Flag để notify khi có storm/rain
};

// PVP system (ăn trộm)
const PVP_COOLDOWN = 30 * 60 * 1000; // 30 phút giữa các lần trộm
const PVP_STEAL_PERCENT = 0.1; // Trộm được 10% inventory
const PVP_PROTECTION_DURATION = 60 * 60 * 1000; // Bảo vệ 1h sau khi bị trộm
const stealBannedUntil: Record<string, number> = {}; // uid -> timestamp (bẫy chống trộm)

// Helper functions cho timezone VN
function getVNNow(): Date {
  const now = new Date();
  const vnString = now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" });
  return new Date(vnString);
}

function getVNDateString(): string {
  const vnNow = getVNNow();
  return vnNow.toISOString().split("T")[0]; // YYYY-MM-DD
}

function validateConfig(): boolean {
  const errors: string[] = [];

  // Check required arrays
  if (!Array.isArray(FISH_LIST) || FISH_LIST.length === 0) {
    errors.push("FISH_LIST rỗng hoặc không hợp lệ");
  }
  if (!Array.isArray(RODS) || RODS.length === 0) {
    errors.push("RODS rỗng hoặc không hợp lệ");
  }
  if (!Array.isArray(LOCATIONS) || LOCATIONS.length === 0) {
    errors.push("LOCATIONS rỗng hoặc không hợp lệ");
  }

  // Validate fish data
  // Cho phép cá rác có price = 0, chỉ cấm price bị thiếu hoặc âm
  const invalidFish = FISH_LIST.find(f =>
    !f.name ||
    f.price === undefined ||
    f.price === null ||
    f.price < 0 ||
    f.rarity === undefined ||
    f.rarity === null ||
    f.rarity <= 0
  );
  if (invalidFish) {
    errors.push(`Cá "${invalidFish.name || 'unknown'}" có dữ liệu không hợp lệ (price/rarity)`);
  }

  // Validate rods
  const invalidRod = RODS.find(r => !r.id || !r.name || !r.price || r.price <= 0 || !r.durability || r.durability <= 0 || !r.maxWeight);
  if (invalidRod) {
    errors.push(`Cần câu "${invalidRod.name || 'unknown'}" có dữ liệu không hợp lệ`);
  }

  // Validate coolers
  const invalidCooler = COOLERS.find(c =>
    !c.id ||
    !c.name ||
    c.price === undefined ||
    c.multiplier === undefined ||
    c.capacity === undefined ||
    c.capacity <= 0
  );
  if (invalidCooler) {
    errors.push(`Thùng đá "${invalidCooler.name || 'unknown'}" có dữ liệu không hợp lệ (price/multiplier/capacity)`);
  }

  if (errors.length > 0) {
    log("WARN", `[CAUCA] Config validation errors: ${errors.join("; ")}`);
    return false;
  }
  return true;
}

function loadJsonFile<T>(filePath: string, fallback: T[] = []): T[] {
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      return Array.isArray(data) ? (data as T[]) : fallback;
    }
  } catch (err: unknown) {
    log("WARN", `[CAUCA] Load ${path.basename(filePath)}: ${getErrorMessage(err)}`);
  }
  return fallback;
}

function loadGameConfig(): void {
  if (fs.existsSync(configDir)) {
    try {
      FISH_LIST = loadJsonFile<Fish>(path.join(configDir, "fish.json"), []);
      RODS = loadJsonFile<Rod>(path.join(configDir, "rods.json"), []);
      LOCATIONS = loadJsonFile<LocationConfig>(path.join(configDir, "locations.json"), []);
      BAITS = loadJsonFile<Bait>(path.join(configDir, "baits.json"), []);
      COOLERS = loadJsonFile<Cooler>(path.join(configDir, "coolers.json"), []);
      ITEMS = loadJsonFile<ItemConfig>(path.join(configDir, "items.json"), []);
      if (!validateConfig()) {
        log("ERROR", "[CAUCA] Config game lỗi lòi mắt. Check lại file trong config/ đi tml.");
      }
      return;
    } catch (err: unknown) {
      log("WARN", `[CAUCA] Load từ config/ lỗi: ${getErrorMessage(err)}, fallback game_config.json`);
    }
  }

  if (fs.existsSync(gameConfigPath)) {
    try {
      const gameConfig = JSON.parse(fs.readFileSync(gameConfigPath, "utf8")) as {
        _default?: {
          fish?: Fish[];
          rods?: Rod[];
          locations?: LocationConfig[];
          baits?: Bait[];
          coolers?: Cooler[];
          ITEMS?: ItemConfig[];
          items?: ItemConfig[];
        };
      };
      if (gameConfig._default) {
        FISH_LIST = gameConfig._default.fish || [];
        RODS = gameConfig._default.rods || [];
        LOCATIONS = gameConfig._default.locations || [];
        BAITS = gameConfig._default.baits || [];
        COOLERS = gameConfig._default.coolers || [];
        ITEMS = gameConfig._default.ITEMS || gameConfig._default.items || [];
      }
      if (!validateConfig()) {
        log("ERROR", "[CAUCA] Config game lỗi lòi mắt. Check lại file json đi tml.");
      }
    } catch (err: unknown) {
      log("ERROR", `[CAUCA] Error loading game config: ${getErrorMessage(err)}`);
      FISH_LIST = [];
      RODS = [];
      LOCATIONS = [];
      BAITS = [];
      COOLERS = [];
      ITEMS = [];
    }
  } else {
    fs.ensureDirSync(configDir);
    const defaultConfig = { _default: { fish: [], rods: [], locations: [], baits: [], coolers: [], ITEMS: [] } };
    fs.writeFileSync(gameConfigPath, JSON.stringify(defaultConfig, null, 2));
    log("WARN", "[CAUCA] Game config không tồn tại, đã tạo file mặc định. Có thể tách config ra thư mục config/.");
  }
}

function getDefaultFishingData(): FishingData {
  if (fishingDataMap._default) {
    const d = fishingDataMap._default as FishingData;
    return {
      rod: d.rod ?? null,
      rodDurability: d.rodDurability ?? 0,
      bait: d.bait ?? null,
      cooler: d.cooler ?? null,
      location: d.location ?? "location_01",
      unlockedLocations: d.unlockedLocations ?? ["location_01"],
      totalCaught: d.totalCaught ?? 0,
      totalValue: typeof d.totalValue === "number" ? d.totalValue : Number(d.totalValue ?? 0),
      caughtFish: d.caughtFish ?? {},
      inventory: d.inventory ?? {},
      items: d.items ?? {},
      buffs: d.buffs ?? { luckEndTime: 0 },
      dailyQuests: d.dailyQuests ?? [],
      lastQuestDate: d.lastQuestDate ?? "",
      lastStealTime: d.lastStealTime ?? 0,
      protectionEnd: d.protectionEnd ?? 0,
      lastStealerID: d.lastStealerID ?? null,
      lastActive: d.lastActive ?? 0,
      lastCatchTime: d.lastCatchTime ?? 0,
      lastCatchFishName: d.lastCatchFishName ?? null,
      catchStreak: d.catchStreak ?? 0
    };
  }
  return {
    rod: null,
    rodDurability: 0,
    bait: null,
    cooler: null,
    location: "location_01",
    unlockedLocations: ["location_01"],
    totalCaught: 0,
    totalValue: 0,
    caughtFish: {},
    inventory: {},
    items: {},
    buffs: { luckEndTime: 0 },
    dailyQuests: [],
    lastQuestDate: "",
    lastStealTime: 0,
    protectionEnd: 0,
    lastStealerID: null,
    lastActive: 0,
    lastCatchTime: 0,
    lastCatchFishName: null,
    catchStreak: 0
  };
}

function loadFishingData(): void {
  if (fs.existsSync(fishingDataPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(fishingDataPath, "utf8")) as FishingDataMap;
      fishingDataMap = parsed || {};
      if (!fishingDataMap._default) {
        fishingDataMap._default = getDefaultFishingData();
        saveFishingData();
      }
    } catch (err: unknown) {
      fishingDataMap = {};
      fishingDataMap._default = getDefaultFishingData();
      saveFishingData();
      log("WARN", `[CAUCA] Error loading fishing data, reset to default: ${getErrorMessage(err)}`);
    }
  } else {
    fishingDataMap = {
      _default: getDefaultFishingData()
    };
    saveFishingData();
  }
}

function saveFishingData(): void {
  try {
    fs.writeFileSync(fishingDataPath, JSON.stringify(fishingDataMap, null, 2));
  } catch (err: unknown) {
    log("ERROR", `[CAUCA] Error saving fishing data: ${getErrorMessage(err)}`);
  }
}

// Fix memory leak: Clear interval cũ trước khi tạo mới
const SAVE_INTERVAL = 30000;

declare global {
  // eslint-disable-next-line no-var
  var fishingSaveInterval: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var fishingLeaderboardInterval: NodeJS.Timeout | undefined;
}

if (global.fishingSaveInterval) {
  clearInterval(global.fishingSaveInterval);
}

global.fishingSaveInterval = setInterval(() => {
  saveFishingData();
}, SAVE_INTERVAL);

loadGameConfig();
loadFishingData();

// Init weather system
initWeatherSystem();

/**
 * Cập nhật leaderboard từ fishingDataMap
 * Chỉ chạy định kỳ, không chạy mỗi lần user xem top
 */
function updateLeaderboard(): void {
  try {
    // Convert map sang array, bỏ qua _default
    const allUsers = Object.entries(fishingDataMap)
      .filter(([uid]) => uid !== "_default")
      .map(([uid, data]) => {
        // Tính lại totalValue từ caughtFish để đảm bảo chính xác
        let totalValue = 0n;
        if (data.caughtFish && Object.keys(data.caughtFish).length > 0) {
          for (const [fishName, count] of Object.entries(data.caughtFish)) {
            const fish = FISH_LIST.find((f) => f.name === fishName);
            if (fish) {
              const fishPriceBigInt = toMoneyBigInt(fish.price);
              totalValue += fishPriceBigInt * BigInt(count || 0);
            }
          }
        }

        return {
          uid,
          totalCaught: Number(data.totalCaught || 0),
          totalValue
        };
      });

    if (allUsers.length === 0) {
      LEADERBOARD_CACHE.rich = [];
      LEADERBOARD_CACHE.fisher = [];
      LEADERBOARD_CACHE.lastUpdate = Date.now();
      return;
    }

    // Sort Top Đại Gia (theo totalValue - BigInt)
    LEADERBOARD_CACHE.rich = [...allUsers]
      .sort((a, b) => {
        if (a.totalValue > b.totalValue) return -1;
        if (a.totalValue < b.totalValue) return 1;
        return 0;
      })
      .slice(0, 10);

    // Sort Top Cần Thủ (theo totalCaught)
    LEADERBOARD_CACHE.fisher = [...allUsers]
      .sort((a, b) => b.totalCaught - a.totalCaught)
      .slice(0, 10);

    LEADERBOARD_CACHE.lastUpdate = Date.now();
    log("INFO", `[CAUCA] Leaderboard updated - ${allUsers.length} users`);
  } catch (err: unknown) {
    log("ERROR", `[CAUCA] Error updating leaderboard: ${getErrorMessage(err)}`);
  }
}

// Update leaderboard mỗi 5 phút
const LEADERBOARD_UPDATE_INTERVAL = 5 * 60 * 1000;
if (global.fishingLeaderboardInterval) {
  clearInterval(global.fishingLeaderboardInterval);
}

global.fishingLeaderboardInterval = setInterval(() => {
  updateLeaderboard();
}, LEADERBOARD_UPDATE_INTERVAL);

// Update ngay lúc khởi động
updateLeaderboard();

function formatCurrency(amount: bigint | number): string {
  const big = typeof amount === "bigint" ? amount : BigInt(amount || 0);
  const str = big.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${str} VNĐ`;
}

// Fix BigInt precision khi tính tiền bán cá
function calculateSellPrice(priceBigInt: bigint, qty: number, multiplier: number): bigint {
  // Convert giá sang Number, tính toán, rồi ném về BigInt
  // An toàn nếu số không vượt quá Number.MAX_SAFE_INTEGER (2^53 - 1)
  const baseTotal = Number(priceBigInt) * qty;
  const finalTotal = Math.floor(baseTotal * multiplier);
  return BigInt(finalTotal);
}

// Tính tổng số cá đang có trong túi
function getCurrentTotalFish(inventory: Record<string, number> = {}): number {
  return Object.values(inventory).reduce((total, qty) => total + (Number(qty) || 0), 0);
}

// Lấy sức chứa tối đa dựa trên thùng đá hiện tại
function getMaxCapacity(coolerID: string | null): number {
  const DEFAULT_CAPACITY = 20;
  if (!coolerID) return DEFAULT_CAPACITY;
  const cooler = COOLERS.find((c) => c.id === coolerID);
  if (cooler && typeof cooler.capacity === "number" && cooler.capacity > 0) {
    return cooler.capacity;
  }
  return DEFAULT_CAPACITY;
}

/**
 * Vẽ thanh tiến độ dạng text
 */
function drawProgressBar(current: number, max: number, length = 10): string {
  const safeMax = max > 0 ? max : 1;
  const percent = Math.min(Math.max(0, current / safeMax), 1);
  const filledLength = Math.round(length * percent);
  const emptyLength = length - filledLength;
  const filledChar = "■";
  const emptyChar = "□";
  const percentStr = Math.round(percent * 100) + "%";
  return `[${filledChar.repeat(filledLength)}${emptyChar.repeat(emptyLength)}] ${percentStr}`;
}

// ==================== DAILY QUESTS SYSTEM ====================
// Nhiệm vụ cố định theo ngày (cùng ngày = cùng 3 nhiệm vụ cho mọi user)

const QUEST_TEMPLATES: DailyQuest[] = [
  { type: "catch_fish", target: 10, reward: { money: 5000 }, desc: "Câu 10 con cá bất kỳ" },
  { type: "catch_fish", target: 20, reward: { money: 10000 }, desc: "Câu 20 con cá bất kỳ" },
  { type: "catch_fish", target: 30, reward: { money: 15000 }, desc: "Câu 30 con cá bất kỳ" },
  { type: "catch_specific", target: 5, reward: { money: 8000 }, desc: "Câu 5 con {fish}" },
  { type: "catch_specific", target: 10, reward: { money: 15000 }, desc: "Câu 10 con {fish}" },
  { type: "sell_value", target: 50000, reward: { money: 10000 }, desc: "Bán cá thu về 50,000 VNĐ" },
  { type: "sell_value", target: 100000, reward: { money: 20000 }, desc: "Bán cá thu về 100,000 VNĐ" },
  { type: "catch_rare", target: 3, reward: { money: 20000 }, desc: "Câu 3 con cá hiếm (giá > 20k)" },
  { type: "catch_rare", target: 5, reward: { money: 35000 }, desc: "Câu 5 con cá hiếm (giá > 20k)" }
];

/** Seed từ chuỗi ngày (VD: 2026-02-07) → RNG cố định theo ngày */
function createSeededRandom(seedStr: string): () => number {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = ((h << 5) - h) + seedStr.charCodeAt(i);
    h = h | 0;
  }
  return function (): number {
    h = Math.imul(48271, h) & 0x7FFFFFFF;
    return h / 0x7FFFFFFF;
  };
}

function generateDailyQuests(_userID: string, dateStr?: string): DailyQuest[] {
  const today = dateStr || getVNDateString();
  const rng = createSeededRandom(today);
  const quests: DailyQuest[] = [];
  const usedTypes = new Set<string>();
  const indices = [...Array(QUEST_TEMPLATES.length)].map((_, i) => i);

  while (quests.length < 3 && indices.length > 0) {
    const idx = Math.floor(rng() * indices.length);
    const templateIndex = indices.splice(idx, 1)[0];
    const template = QUEST_TEMPLATES[templateIndex] as DailyQuest;
    const key = `${template.type}_${template.target}`;

    if (usedTypes.has(key)) continue;
    usedTypes.add(key);

    const quest: DailyQuest = { ...template };

    if (quest.type === "catch_specific" && FISH_LIST.length > 0) {
      const fishIndex = Math.floor(rng() * FISH_LIST.length);
      const randomFish = FISH_LIST[fishIndex];
      quest.fishName = randomFish.name;
      quest.desc = quest.desc.replace("{fish}", randomFish.emoji + " " + randomFish.name);
    }

    quest.progress = 0;
    quest.completed = false;
    quest.claimed = false;
    quests.push(quest);
  }

  return quests;
}

function checkAndResetDailyQuests(userID: string): void {
  const data = fishingDataMap[userID];
  if (!data) return;

  const today = getVNDateString();
  const lastQuestDate = data.lastQuestDate || "";

  if (lastQuestDate !== today) {
    data.dailyQuests = generateDailyQuests(userID, today);
    data.lastQuestDate = today;
    data.questProgress = {};
    saveFishingData();
  }
}

function updateQuestProgress(
  userID: string,
  questType: string,
  amount = 1,
  fishName: string | null = null,
  sellValue = 0
): void {
  const data = fishingDataMap[userID];
  if (!data || !data.dailyQuests) return;

  checkAndResetDailyQuests(userID);

  for (const quest of data.dailyQuests) {
    if (quest.completed || quest.claimed) continue;

    let shouldUpdate = false;

    if (questType === "catch" && quest.type === "catch_fish") {
      quest.progress = (quest.progress ?? 0) + amount;
      shouldUpdate = true;
    } else if (questType === "catch" && quest.type === "catch_specific" && quest.fishName === fishName) {
      quest.progress = (quest.progress ?? 0) + amount;
      shouldUpdate = true;
    } else if (questType === "catch_rare" && quest.type === "catch_rare" && fishName) {
      const fish = FISH_LIST.find(f => f.name === fishName);
      if (fish && fish.price > 20000) {
        quest.progress = (quest.progress ?? 0) + amount;
        shouldUpdate = true;
      }
    } else if (questType === "sell" && quest.type === "sell_value") {
      quest.progress = (quest.progress ?? 0) + sellValue;
      shouldUpdate = true;
    }

    if (shouldUpdate && (quest.progress ?? 0) >= quest.target) {
      quest.completed = true;
      quest.progress = quest.target;
    }
  }

  saveFishingData();
}

// ==================== WEATHER EVENTS SYSTEM ====================

// Track active threads để notify weather (chỉ notify khi có user active gần đây)
const activeThreads: Map<string, number> = new Map(); // Map<threadID, lastActivity>

function triggerWeatherEvent(shouldNotify = false) {
  const events = [
    { name: "normal", bonus: 0, emoji: "🌤️", desc: "Thời tiết bình thường" },
    { name: "rain", bonus: 15, emoji: "🌧️", desc: "Mưa rào! Cá hiếm xuất hiện nhiều hơn +15%" },
    { name: "storm", bonus: 25, emoji: "⛈️", desc: "Bão tố! Cá siêu hiếm xuất hiện +25%" },
    { name: "sunny", bonus: -10, emoji: "☀️", desc: "Nắng gắt! Cá hiếm khó câu hơn -10%" }
  ];

  const event = events[Math.floor(Math.random() * events.length)];
  const duration = (30 + Math.random() * 60) * 60 * 1000;
  const previousWeather = WEATHER_STATE.current;

  WEATHER_STATE.current = event.name;
  WEATHER_STATE.bonus = event.bonus;
  WEATHER_STATE.endTime = Date.now() + duration;
  WEATHER_STATE.lastChange = Date.now();

  log("INFO", `[CAUCA] Weather event: ${event.name} (${event.desc}) - Duration: ${Math.floor(duration / 60000)} phút`);

  // Notify nếu là storm hoặc rain (chỉ khi thay đổi từ weather khác và shouldNotify = true)
  if (shouldNotify && (event.name === "storm" || event.name === "rain") && previousWeather !== event.name) {
    WEATHER_STATE.notifyThreads = true; // Flag để notify trong lần câu cá tiếp theo
  }

  return event;
}

function checkWeatherEvent() {
  if (Date.now() >= WEATHER_STATE.endTime) {
    triggerWeatherEvent(false); // Không notify khi check, chỉ notify khi auto-change từ interval
  }
}

function getWeatherBonus() {
  checkWeatherEvent();
  return WEATHER_STATE.bonus || 0;
}

function initWeatherSystem() {
  triggerWeatherEvent(false); // Trigger lúc start không notify
  setInterval(() => {
    if (Date.now() >= WEATHER_STATE.endTime) {
      triggerWeatherEvent(true); // Notify khi auto-change (chỉ storm/rain)
    }
  }, 60 * 60 * 1000);
}

// ==================== DATA CLEANUP SYSTEM ====================

function cleanupInactiveUsers(): number {
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let deletedCount = 0;

  for (const uid in fishingDataMap) {
    if (uid === "_default") continue; // Bỏ qua default

    const data = fishingDataMap[uid];
    const lastActive = data.lastActive || 0;

    // Xóa user không active > 30 ngày
    if (lastActive > 0 && (now - lastActive > THIRTY_DAYS)) {
      delete fishingDataMap[uid];
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    saveFishingData();
    log("INFO", `[CAUCA] Cleaned up ${deletedCount} inactive users (>30 days)`);
  }

  return deletedCount;
}

// Cleanup khi start bot và mỗi tuần
cleanupInactiveUsers();
setInterval(() => {
  cleanupInactiveUsers();
}, 7 * 24 * 60 * 60 * 1000); // Mỗi tuần

// ==================== PVP SYSTEM (Ăn trộm) ====================

function canSteal(attackerID: string, targetID: string): { can: boolean; reason?: string } {
  const attackerData = fishingDataMap[attackerID];
  const targetData = fishingDataMap[targetID];

  if (!attackerData || !targetData) return { can: false, reason: "Không tìm thấy dữ liệu" };

  if (stealBannedUntil[attackerID] && Date.now() < stealBannedUntil[attackerID]) {
    const minLeft = Math.ceil((stealBannedUntil[attackerID] - Date.now()) / 60000);
    return { can: false, reason: `Bạn đang bị cấm trộm do bẫy chống trộm (${minLeft} phút)` };
  }

  const lastSteal = attackerData.lastStealTime || 0;
  if (Date.now() - lastSteal < PVP_COOLDOWN) {
    const minutesLeft = Math.ceil((PVP_COOLDOWN - (Date.now() - lastSteal)) / 60000);
    return { can: false, reason: `Còn ${minutesLeft} phút mới được trộm tiếp` };
  }

  const protectionEnd = targetData.protectionEnd || 0;
  if (Date.now() < protectionEnd) {
    const minutesLeft = Math.ceil((protectionEnd - Date.now()) / 60000);
    return { can: false, reason: `Người này đang được bảo vệ (${minutesLeft} phút)` };
  }

  const targetInventory = targetData.inventory || {};
  const totalFish = getCurrentTotalFish(targetInventory);
  if (totalFish === 0) {
    return { can: false, reason: "Người này không có cá để trộm" };
  }

  return { can: true };
}

function stealFish(attackerID: string, targetID: string): {
  success: boolean;
  reason?: string;
  stolen?: Record<string, number>;
  totalStolen?: number;
} {
  const check = canSteal(attackerID, targetID);
  if (!check.can) return { success: false, reason: check.reason };

  const attackerData = fishingDataMap[attackerID];
  const targetData = fishingDataMap[targetID];
  const targetInventory = { ...(targetData.inventory || {}) };

  const totalFish = getCurrentTotalFish(targetInventory);
  const stealCount = Math.max(1, Math.floor(totalFish * PVP_STEAL_PERCENT));

  const stolen: Record<string, number> = {};
  let remaining = stealCount;
  const fishTypes = Object.keys(targetInventory).filter(name => targetInventory[name] > 0);

  while (remaining > 0 && fishTypes.length > 0) {
    const randomType = fishTypes[Math.floor(Math.random() * fishTypes.length)];
    const available = targetInventory[randomType] || 0;
    if (available <= 0) {
      fishTypes.splice(fishTypes.indexOf(randomType), 1);
      continue;
    }

    const stealThis = Math.min(remaining, Math.max(1, Math.floor(available * 0.3)));
    stolen[randomType] = (stolen[randomType] || 0) + stealThis;
    targetInventory[randomType] = available - stealThis;
    if (targetInventory[randomType] <= 0) {
      delete targetInventory[randomType];
      fishTypes.splice(fishTypes.indexOf(randomType), 1);
    }
    remaining -= stealThis;
  }

  const attackerInventory: Record<string, number> = { ...(attackerData.inventory || {}) };
  for (const [fishName, qty] of Object.entries(stolen)) {
    attackerInventory[fishName] = (attackerInventory[fishName] || 0) + qty;
  }

  attackerData.inventory = attackerInventory;
  attackerData.lastStealTime = Date.now();
  attackerData.protectionEnd = 0; // Mất bảo vệ khi đi trộm (aggressive mode)
  attackerData.lastActive = Date.now();

  targetData.inventory = targetInventory;
  targetData.protectionEnd = Date.now() + PVP_PROTECTION_DURATION;
  targetData.lastStealerID = attackerID; // Để nạn nhân dùng bẫy chống trộm
  targetData.lastActive = Date.now();

  saveFishingData();

  return {
    success: true,
    stolen,
    totalStolen: stealCount
  };
}

function drawFish(baitLuck = 0, locationBonus = 0, weatherBonus = 0, luckBuffPercent = 0) {
  const random = Math.random() * 100;
  let cumulative = 0;
  const totalBonus = baitLuck + locationBonus + weatherBonus + luckBuffPercent;
  for (const fish of FISH_LIST) {
    const adjustedRarity = fish.rarity + (fish.rarity * totalBonus / 100);
    cumulative += adjustedRarity;
    if (random <= cumulative) return fish;
  }
  return FISH_LIST[FISH_LIST.length - 1] || FISH_LIST[0];
}

// Flavor text vui khi câu (random theo loại cá)
const CATCH_FLAVOR = {
  trash: [
    "Câu nhầm đồ rồi! 😅",
    "Ôi mùi... 🤢",
    "Rác đầy biển thật.",
    "Có khi nào đây là giày của thần Poseidon? 🏛️",
    "Bỏ túi đi, đừng vứt xuống nước nữa!"
  ],
  superRare: [
    "Cả đời cần thủ mới thấy! 🌟",
    "Legendary!!!",
    "Màn hình đỏ luôn! 🔴",
    "Đem khoe cả group đi!",
    "Vé số trúng rồi!"
  ],
  rare: [
    "Đỉnh! 👑",
    "Mánh ngon!",
    "Cá này bán được giá.",
    "Câu trúng tủ rồi!"
  ],
  normal: [
    "Ngon! 👍",
    "Ổn đấy.",
    "Thêm một con.",
    "Cần thủ bình tĩnh."
  ]
};

function getCatchFlavorText(fish: Fish | null | undefined): string {
  if (!fish || !fish.name) return "";
  if (fish.price === 0) {
    return CATCH_FLAVOR.trash[Math.floor(Math.random() * CATCH_FLAVOR.trash.length)];
  }
  if (fish.name === "Cá vạn cân") {
    return "🐋 Vạn cân đây rồi!!! Cần thủ huyền thoại!";
  }
  if (fish.rarity <= 1) {
    return CATCH_FLAVOR.superRare[Math.floor(Math.random() * CATCH_FLAVOR.superRare.length)];
  }
  if (fish.rarity <= 3) {
    return CATCH_FLAVOR.rare[Math.floor(Math.random() * CATCH_FLAVOR.rare.length)];
  }
  return CATCH_FLAVOR.normal[Math.floor(Math.random() * CATCH_FLAVOR.normal.length)];
}

function getFishingData(userID: string): FishingData | null {
  if (fishingDataMap[userID]) {
    const data = fishingDataMap[userID];
    let totalValue = 0;
    if (data.caughtFish && Object.keys(data.caughtFish).length > 0) {
      for (const [fishName, count] of Object.entries(data.caughtFish)) {
        const fish = FISH_LIST.find((f) => f.name === fishName);
        if (fish) totalValue += fish.price * count;
      }
    }
    const normalized: FishingData = {
      rod: data.rod ?? null,
      rodDurability: data.rodDurability ?? 0,
      bait: data.bait ?? null,
      cooler: data.cooler ?? null,
      location: data.location ?? "location_01",
      unlockedLocations: data.unlockedLocations ?? ["location_01"],
      totalCaught: data.totalCaught ?? 0,
      totalValue,
      caughtFish: data.caughtFish ?? {},
      inventory: data.inventory ?? {},
      items: data.items ?? {},
      buffs: data.buffs ?? { luckEndTime: 0 },
      dailyQuests: data.dailyQuests ?? [],
      lastQuestDate: data.lastQuestDate ?? "",
      lastStealTime: data.lastStealTime ?? 0,
      protectionEnd: data.protectionEnd ?? 0,
      lastStealerID: data.lastStealerID ?? null,
      lastActive: data.lastActive ?? 0,
      lastCatchTime: data.lastCatchTime ?? 0,
      lastCatchFishName: data.lastCatchFishName ?? null,
      catchStreak: data.catchStreak ?? 0
    };
    return normalized;
  }
  return null;
}

function createFishingData(userID: string, initialData: Partial<FishingData> = {}): FishingData {
  const defaultData = getDefaultFishingData();
  const newData = { ...defaultData, ...initialData };
  fishingDataMap[userID] = newData;
  saveFishingData();
  return newData;
}

function saveFishingDataForUser(userID: string, data: FishingData): void {
  const dataToSave = {
    rod: data.rod,
    rodDurability: data.rodDurability,
    bait: data.bait,
    cooler: data.cooler,
    location: data.location,
    unlockedLocations: data.unlockedLocations,
    totalCaught: data.totalCaught,
    totalValue: data.totalValue || 0,
    caughtFish: data.caughtFish,
    inventory: data.inventory,
    items: data.items || {},
    buffs: data.buffs || { luckEndTime: 0 },
    dailyQuests: data.dailyQuests || [],
    lastQuestDate: data.lastQuestDate || "",
    lastStealTime: data.lastStealTime || 0,
    protectionEnd: data.protectionEnd || 0,
    lastStealerID: data.lastStealerID || null,
    lastActive: data.lastActive || Date.now(),
    lastCatchTime: data.lastCatchTime || 0,
    lastCatchFishName: data.lastCatchFishName || null,
    catchStreak: data.catchStreak || 0
  };
  fishingDataMap[userID] = dataToSave;
  if (!fishingDataMap._default) fishingDataMap._default = getDefaultFishingData();
  saveFishingData();
}

const caucaCommand: Command = {
  // Metadata for new command system
  name: "cauca",
  alias: ["fishing", "fish", "cau"],
  version: "1.0.0",
  role: 0,
  desc: "Câu cá kiếm tiền, giải trí nhẹ nhàng",
  guide:
    "{pn} - Câu cá\n" +
    "{pn} shop - Xem cửa hàng (reply số để mua)\n" +
    "{pn} buy [tên] - Mua đồ trực tiếp\n" +
    "{pn} inventory - Xem túi đồ (reply số để bán)\n" +
    "{pn} sell [tên cá] [số lượng] - Bán cá\n" +
    "{pn} sellall - Bán hết tất cả cá trong túi\n" +
    "{pn} location / diadiem - Xem/đổi địa điểm\n" +
    "{pn} map / bando - Xem bản đồ tất cả địa điểm (có mô tả)\n" +
    "{pn} profile / info / me - Xem thông tin cần thủ\n" +
    "{pn} top [rich/fisher] - Xem bảng xếp hạng\n" +
    "{pn} quest / daily - Xem nhiệm vụ hàng ngày\n" +
    "{pn} claim [số] - Nhận thưởng nhiệm vụ\n" +
    "{pn} weather - Xem thời tiết hiện tại\n" +
    "{pn} steal @[người] - Trộm cá (PVP)\n" +
    "{pn} use <id> - Dùng vật phẩm (vd: {pn} use repair_kit)\n" +
    "{pn} bag / tui - Xem túi vật phẩm\n" +
    "{pn} album / sotay - Xem sổ tay cá (bộ sưu tập)",
  cd: 5,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { event, args, reply, main, userData, commandName } = ctx as any;
    const uid: string = event.senderID;
    const threadID: string = event.threadID;
    if (!uid || !threadID) return;

    const Users: CaucaUsersHelper = {
      getUser: (userID: string) => userData.get(userID),
      addMoney: async (userID: string, amount: bigint) => {
        const addMoney = (userData as any).addMoney as
          | ((id: string, value: bigint) => Promise<void>)
          | undefined;
        if (addMoney) {
          await addMoney(userID, amount);
        }
      },
      delMoney: async (userID: string, amount: bigint) => {
        const delMoney = (userData as any).delMoney as
          | ((id: string, value: bigint) => Promise<void>)
          | undefined;
        if (delMoney) {
          await delMoney(userID, amount);
        }
      }
    };

    const globalData = {
      handleReply: (main as any).onReply as Map<string, CaucaReplyData>
    };

    const action = (args[0] || "").toLowerCase();

    // Wrap các action quan trọng trong lock để tránh race condition
    const criticalActions = ["buy", "sell", "sellall", "steal", "trom", "anrom", "use", "dung", ""]; // "" là action mặc định (câu cá)
    const needsLock = criticalActions.includes(action);

    if (needsLock) {
      const lockResult = await withLock(uid, async () => {
        return await executeAction();
      });

      if (typeof lockResult === "string") {
        await reply(lockResult);
        return;
      }
      return;
    }

    // Actions không cần lock (shop, inventory, location, profile)
    return await executeAction();

    async function executeAction(): Promise<void> {
      try {
        const user = await Users.getUser(uid);
        if (!user) {
          await reply("❌ Không tìm thấy thông tin người dùng!");
          return;
        }

        const currentMoney = BigInt(user?.money ?? 0);
        let fishingData = getFishingData(uid);

        // ---- SHOP ----
        if (action === "shop") {
          const shopMsg =
            "🛒 CỬA HÀNG ĐỒ CÂU\n" +
            "─────────────────\n\n" +
            "Chọn loại đồ bạn muốn xem:\n\n" +
            "1. 🎣 CẦN CÂU\n" +
            "2. 🪱 MỒI\n" +
            "3. 🧊 THÙNG ĐÁ\n" +
            "4. 📍 ĐỊA ĐIỂM\n" +
            "5. 🧪 TẠP HÓA (Thuốc/Bùa)\n\n" +
            "📋 Reply số (1-5) để chọn loại | 4 = Địa điểm (mở khóa map)";
          return reply(
            shopMsg,
            (err: Error | null, info?: { messageID?: string }) => {
              if (err || !info?.messageID) return;
              globalData.handleReply.set(info.messageID, {
                commandName,
                messageID: info.messageID,
                author: uid,
                threadID,
                type: "shop_category"
              });
            }
          );
        }

        // ---- BUY ----
        if (action === "buy") {
          const itemName = args.slice(1).join(" ").toLowerCase();
          if (!itemName) {
            await reply("❌ Cú pháp: {pn} buy [tên vật phẩm]");
            return;
          }

          const rodToBuy = RODS.find((r) => r.name.toLowerCase() === itemName);
          if (rodToBuy) {
            if (fishingData && fishingData.rod === rodToBuy.id) {
              await reply("⚠️ Bạn đã có cần này rồi!");
              return;
            }
            const rodPrice = toMoneyBigInt(rodToBuy.price);
            if (currentMoney < rodPrice) {
              await reply(`❌ Không đủ tiền! Cần ${formatCurrency(rodToBuy.price)}`);
              return;
            }
            if (!fishingData) {
              fishingData = createFishingData(uid, { rod: rodToBuy.id, rodDurability: rodToBuy.durability });
            } else {
              const updated = { ...fishingData, rod: rodToBuy.id, rodDurability: rodToBuy.durability };
              saveFishingDataForUser(uid, updated);
              fishingData = updated;
            }
            await Users.delMoney(uid, rodPrice);
            const finalMoney = await Users.getUser(uid).then((u) => BigInt(u?.money ?? 0));
            await reply(`✅ Đã mua ${rodToBuy.name}!\n💰 Số dư: ${formatCurrency(finalMoney)}\n\nRa hồ quăng cần ngay!`);
            return;
          }

          const baitToBuy = BAITS.find((b) => b.name.toLowerCase() === itemName);
          if (baitToBuy) {
            if (!fishingData) {
              await reply("❌ Bạn chưa có cần câu! Mua cần trước nhé.");
              return;
            }
            if (fishingData.bait === baitToBuy.id) {
              await reply("⚠️ Bạn đã có mồi này rồi!");
              return;
            }
            if (currentMoney < BigInt(baitToBuy.price)) {
              await reply(`❌ Không đủ tiền! Cần ${formatCurrency(baitToBuy.price)}`);
              return;
            }
            const updated = { ...fishingData, bait: baitToBuy.id };
            saveFishingDataForUser(uid, updated);
            await Users.delMoney(uid, BigInt(baitToBuy.price));
            const finalMoney = await Users.getUser(uid).then((u) => BigInt(u?.money ?? 0));
            await reply(`✅ Đã mua ${baitToBuy.name}!\n💰 Số dư: ${formatCurrency(finalMoney)}`);
            return;
          }

          const coolerToBuy = COOLERS.find((c) => c.name.toLowerCase() === itemName);
          if (coolerToBuy) {
            if (!fishingData) {
              await reply("❌ Bạn chưa có cần câu! Mua cần trước nhé.");
              return;
            }
            if (fishingData.cooler === coolerToBuy.id) {
              await reply("⚠️ Bạn đã có thùng đá này rồi!");
              return;
            }
            const coolerPrice = toMoneyBigInt(coolerToBuy.price);
            if (currentMoney < coolerPrice) {
              await reply(`❌ Không đủ tiền! Cần ${formatCurrency(coolerToBuy.price)}`);
              return;
            }
            const updated = { ...fishingData, cooler: coolerToBuy.id };
            saveFishingDataForUser(uid, updated);
            await Users.delMoney(uid, coolerPrice);
            const finalMoney = await Users.getUser(uid).then((u) => BigInt(u?.money ?? 0));
            await reply(`✅ Đã mua ${coolerToBuy.name}!\n💰 Số dư: ${formatCurrency(finalMoney)}`);
            return;
          }

          const locationToUnlock = LOCATIONS.find((l) => l.name.toLowerCase() === itemName);
          if (locationToUnlock && locationToUnlock.unlockPrice) {
            if (!fishingData) {
              if (!locationToUnlock.unlockPrice) {
                createFishingData(uid, { unlockedLocations: [locationToUnlock.id], location: locationToUnlock.id });
                await reply(`✅ Đã mở khóa ${locationToUnlock.emoji} ${locationToUnlock.name}! Dùng {pn} location để chuyển đến.`);
                return;
              }
              await reply("❌ Bạn chưa có dữ liệu câu cá! Mua cần trước nhé.");
              return;
            }
            if (fishingData.unlockedLocations?.includes(locationToUnlock.id)) {
              await reply("⚠️ Bạn đã mở khóa địa điểm này rồi!");
              return;
            }
            const unlockPrice = toMoneyBigInt(locationToUnlock.unlockPrice);
            if (currentMoney < unlockPrice) {
              await reply(`❌ Không đủ tiền! Cần ${formatCurrency(locationToUnlock.unlockPrice)}`);
              return;
            }
            const updatedUnlocked = [...(fishingData.unlockedLocations || ["location_01"]), locationToUnlock.id];
            const updated = { ...fishingData, unlockedLocations: updatedUnlocked };
            saveFishingDataForUser(uid, updated);
            await Users.delMoney(uid, unlockPrice);
            const finalMoney = await Users.getUser(uid).then((u) => BigInt(u?.money ?? 0));
            await reply(`✅ Đã mở khóa ${locationToUnlock.emoji} ${locationToUnlock.name}!\n💰 Số dư: ${formatCurrency(finalMoney)}\nDùng: {pn} location ${locationToUnlock.name} để chuyển đến.`);
            return;
          }

          const itemToBuy = ITEMS.find((i) => i.name.toLowerCase() === itemName || i.id === itemName.toLowerCase());
          if (itemToBuy) {
            const itemPrice = toMoneyBigInt(itemToBuy.price);
            if (currentMoney < itemPrice) {
              await reply(`❌ Không đủ tiền! Cần ${formatCurrency(itemToBuy.price)}`);
              return;
            }
            if (!fishingData) {
              fishingData = createFishingData(uid, { items: { [itemToBuy.id]: 1 } });
            } else {
              const items = { ...(fishingData.items || {}) };
              items[itemToBuy.id] = (items[itemToBuy.id] || 0) + 1;
              const updated = { ...fishingData, items };
              saveFishingDataForUser(uid, updated);
            }
            await Users.delMoney(uid, itemPrice);
            const finalMoney = await Users.getUser(uid).then((u) => BigInt(u?.money ?? 0));
            await reply(`✅ Đã mua ${itemToBuy.name}!\n💰 Số dư: ${formatCurrency(finalMoney)}\n💡 Dùng: {pn} use ${itemToBuy.id}`);
            return;
          }

          await reply("❌ Không tìm thấy vật phẩm này trong cửa hàng!");
          return;
        }

        // ---- USE / DÙNG (Vật phẩm theo ID) ----
        if (action === "use" || action === "dung") {
          const itemID = (args[1] || "").trim().toLowerCase();
          if (!itemID) {
            await reply("❌ Vui lòng nhập ID vật phẩm!\nVí dụ: {pn} use repair_kit\n💡 Xem túi: {pn} bag | Mua: {pn} shop → 5");
            return;
          }
          if (!fishingData) {
            await reply("❌ Bạn chưa có dữ liệu câu cá! Mua đồ tại {pn} shop trước.");
            return;
          }
          const userItems = fishingData.items || {};
          if (!userItems[itemID] || userItems[itemID] <= 0) {
            return reply("❌ Bạn không có vật phẩm này trong túi! Vào {pn} shop mua đi.");
          }
          const itemConfig = ITEMS.find((i) => i.id === itemID);
          if (!itemConfig) {
            return reply("❌ Vật phẩm không hợp lệ. Dùng {pn} bag để xem túi.");
          }
          const now = Date.now();
          let updated = { ...fishingData };
          let msg = "";

          switch (itemID) {
            case "repair_kit":
              if (!fishingData.rod) {
                return reply("❌ Bạn chưa có cần câu!");
              }
              const currentRod = RODS.find((r) => r.id === fishingData.rod);
              if (!currentRod) {
                return reply("❌ Cần câu không hợp lệ!");
              }
              updated.rodDurability = currentRod.durability;
              msg = `🛠️ Đã sửa chữa ${currentRod.name}! Độ bền: ${currentRod.durability}/${currentRod.durability}`;
              break;
            case "lucky_charm":
            case "lucky_charm_super":
              if (!updated.buffs) updated.buffs = { luckEndTime: 0 };
              const currentLuckEnd = updated.buffs.luckEndTime || now;
              const durationMs = typeof itemConfig.duration === "number" ? itemConfig.duration : 600000;
              const newLuckEnd = Math.max(currentLuckEnd, now) + durationMs;
              const luckBonusVal = typeof (itemConfig as any).bonus === "number" ? (itemConfig as any).bonus : 20;
              updated.buffs = { ...updated.buffs, luckEndTime: newLuckEnd, luckBonus: luckBonusVal as number };
              const luckMin = Math.floor(durationMs / 60000);
              msg = `🍀 Đã dùng ${itemConfig.name}! Tỷ lệ cá hiếm +${luckBonusVal}% trong ${luckMin} phút.`;
              break;
            case "shield_vip":
            case "shield_24h":
              const currentShieldEnd = fishingData.protectionEnd || now;
              const shieldDurationMs = typeof itemConfig.duration === "number" ? itemConfig.duration : 7200000;
              const newShieldEnd = Math.max(currentShieldEnd, now) + shieldDurationMs;
              updated.protectionEnd = newShieldEnd;
              const shieldHours = Math.floor(shieldDurationMs / 3600000);
              msg = `🛡️ Đã dùng ${itemConfig.name}! Chống trộm trong ${shieldHours} giờ tới.`;
              break;
            case "repair_kit_pro":
              if (!fishingData.rod) return reply("❌ Bạn chưa có cần câu!");
              const rodPro = RODS.find((r) => r.id === fishingData.rod);
              if (!rodPro) return reply("❌ Cần câu không hợp lệ!");
              updated.rodDurability = rodPro.durability;
              if (!updated.buffs) updated.buffs = { luckEndTime: 0 };
              updated.buffs = { ...updated.buffs, oneShotNoDurabilityLoss: true };
              msg = `🛠️ Đã dùng ${itemConfig.name}! Độ bền full + lần câu tiếp theo không mất độ bền.`;
              break;
            case "energy_drink":
              if (!fishingData.rod) return reply("❌ Bạn chưa có cần câu!");
              const rodDrink = RODS.find((r) => r.id === fishingData.rod);
              if (!rodDrink) return reply("❌ Cần câu không hợp lệ!");
              const currentDur = fishingData.rodDurability ?? rodDrink.durability;
              const heal = Math.floor(rodDrink.durability / 2);
              updated.rodDurability = Math.min(rodDrink.durability, currentDur + heal);
              msg = `⚡ Đã dùng ${itemConfig.name}! Độ bền: ${updated.rodDurability}/${rodDrink.durability}`;
              break;
            case "treasure_map":
              if (!updated.buffs) updated.buffs = { luckEndTime: 0 };
              updated.buffs = { ...updated.buffs, nextCastLuckBonus: 50 };
              msg = `🗺️ Đã dùng ${itemConfig.name}! Lần câu tiếp theo +50% tỷ lệ cá hiếm.`;
              break;
            case "lucky_charm_mini":
              if (!updated.buffs) updated.buffs = { luckEndTime: 0 };
              const curLuckEnd = updated.buffs.luckEndTime || now;
              const miniDurationMs = typeof itemConfig.duration === "number" ? itemConfig.duration : 300000;
              const newEnd = Math.max(curLuckEnd, now) + miniDurationMs;
              const bonusVal = typeof (itemConfig as any).bonus === "number" ? (itemConfig as any).bonus : 10;
              updated.buffs = { ...updated.buffs, luckEndTime: newEnd, luckBonus: bonusVal as number };
              msg = `🍀 Đã dùng ${itemConfig.name}! +${bonusVal}% cá hiếm trong ${Math.floor(miniDurationMs / 60000)} phút.`;
              break;
            case "shield_6h":
              const curShield = fishingData.protectionEnd || now;
              const shield6hMs = typeof itemConfig.duration === "number" ? itemConfig.duration : 21600000;
              updated.protectionEnd = Math.max(curShield, now) + shield6hMs;
              msg = `🛡️ Đã dùng ${itemConfig.name}! Chống trộm 6 giờ.`;
              break;
            case "repair_kit_mega":
              if (!fishingData.rod) return reply("❌ Bạn chưa có cần câu!");
              const rodMega = RODS.find((r) => r.id === fishingData.rod);
              if (!rodMega) return reply("❌ Cần câu không hợp lệ!");
              updated.rodDurability = rodMega.durability;
              if (!updated.buffs) updated.buffs = { luckEndTime: 0 };
              updated.buffs = { ...updated.buffs, noDurabilityLossCount: 3 };
              msg = `🛠️ Đã dùng ${itemConfig.name}! Full độ bền + 3 lần câu không mất độ bền.`;
              break;
            case "golden_rod_oil":
              if (!updated.buffs) updated.buffs = { luckEndTime: 0 };
              updated.buffs = { ...updated.buffs, halfDurabilityCount: 2 };
              msg = `🛢️ Đã dùng ${itemConfig.name}! 2 lần câu tiếp giảm 50% mất độ bền.`;
              break;
            case "fisher_blessing":
              if (!updated.buffs) updated.buffs = { luckEndTime: 0 };
              updated.buffs = { ...updated.buffs, nextCastLuckBonus: 80 };
              msg = `🙏 Đã dùng ${itemConfig.name}! Lần câu tiếp +80% cá hiếm.`;
              break;
            case "double_catch":
              if (!updated.buffs) updated.buffs = { luckEndTime: 0 };
              updated.buffs = { ...updated.buffs, nextCastDoubleFish: true };
              msg = `✨ Đã dùng ${itemConfig.name}! Lần câu tiếp nhận x2 cá.`;
              break;
            case "anti_steal_trap":
              const thiefID = fishingData.lastStealerID;
              if (!thiefID) return reply("❌ Chưa có ai trộm bạn gần đây! Dùng sau khi bị trộm.");
              stealBannedUntil[thiefID] = now + 3600000; // 1h
              updated.lastStealerID = null;
              msg = `🪤 Đã kích hoạt ${itemConfig.name}! Kẻ trộm bị cấm trộm 1 giờ.`;
              break;
            default:
              return reply("❌ Vật phẩm này chưa được hỗ trợ.");
          }

          updated.items = { ...userItems };
          updated.items[itemID]--;
          if (updated.items[itemID] === 0) delete updated.items[itemID];
          updated.lastActive = now;
          saveFishingDataForUser(uid, updated);
          return reply(msg);
        }

        // ---- MAP / BẢN ĐỒ (xem tất cả map có mô tả) ----
        if (action === "map" || action === "bando" || action === "maps") {
          let mapMsg = "🗺️ BẢN ĐỒ CÂU CÁ\n─────────────────\n\n";
          LOCATIONS.forEach((loc, i) => {
            const stt = i + 1;
            const unlocked = fishingData?.unlockedLocations?.includes(loc.id) ?? loc.id === "location_01";
            const current = fishingData?.location === loc.id ? " ✅ (Đang ở đây)" : "";
            const lockStatus = unlocked ? "" : " 🔒";
            const priceText = loc.unlockPrice ? ` • Mở khóa: ${formatCurrency(loc.unlockPrice)}` : " • Miễn phí";
            mapMsg += `${stt}. ${loc.emoji} ${loc.name}${priceText}${current}${lockStatus}\n`;
            mapMsg += `   ⏰ ${loc.minWait}-${loc.maxWait}s | Bonus cá hiếm: +${loc.rareFishBonus}%\n`;
            if (loc.description) mapMsg += `   💬 ${loc.description}\n`;
            mapMsg += "\n";
          });
          mapMsg += "📋 Reply tên địa điểm (hoặc số thứ tự) để chuyển đến | Hoặc: {pn} location [tên]";
          return reply(
            mapMsg,
            (err: Error | null, info?: { messageID?: string }) => {
              if (err || !info?.messageID) return;
              globalData.handleReply.set(info.messageID, {
                commandName,
                messageID: info.messageID,
                author: uid,
                threadID: event.threadID,
                type: "choose_location"
              });
            }
          );
        }

        // ---- LOCATION / DIADIEM ----
        if (action === "location" || action === "diadiem") {
          const locationName = args.slice(1).join(" ").trim().toLowerCase();

          if (!locationName) {
            let locMsg = "📍 ĐỊA ĐIỂM CÂU CÁ\n─────────────────\n\n";
            LOCATIONS.forEach((loc, i) => {
              const stt = i + 1;
              const unlocked = fishingData?.unlockedLocations?.includes(loc.id) ?? loc.id === "location_01";
              const current = fishingData?.location === loc.id ? " ✅ (Đang ở đây)" : "";
              const lockStatus = unlocked ? "" : " 🔒 (Chưa mở khóa)";
              const priceText = loc.unlockPrice ? ` - ${formatCurrency(loc.unlockPrice)}` : "";
              locMsg += `${stt}. ${loc.emoji} ${loc.name}${priceText}${current}${lockStatus}\n`;
              locMsg += `   ⏰ ${loc.minWait}-${loc.maxWait}s | Bonus cá hiếm: +${loc.rareFishBonus}%`;
              if (loc.description) locMsg += `\n   💬 ${loc.description}`;
              locMsg += "\n\n";
            });
            locMsg += "📋 Reply tên địa điểm (hoặc số) để chuyển | {pn} map xem bản đồ";
            return reply(
              locMsg,
              (err: Error | null, info?: { messageID?: string }) => {
                if (err || !info?.messageID) return;
                globalData.handleReply.set(info.messageID, {
                  commandName,
                  messageID: info.messageID,
                  author: uid,
                  threadID: event.threadID,
                  type: "choose_location"
                });
              }
            );
          }

          const targetLocation = LOCATIONS.find((l) => l.name.toLowerCase() === locationName);
          if (!targetLocation) {
            await reply("❌ Không tìm thấy địa điểm này!");
            return;
          }

          if (!fishingData) {
            if (targetLocation.id !== "location_01") {
              await reply(`❌ Địa điểm chưa mở khóa. Vào shop mua: {pn} shop → reply 4 (Địa điểm) → reply số địa điểm để mua.`);
              return;
            }
            createFishingData(uid, { location: targetLocation.id, unlockedLocations: [targetLocation.id] });
            await reply(`✅ Đã chuyển đến ${targetLocation.emoji} ${targetLocation.name}! Mua cần tại {pn} shop`);
            return;
          }

          if (!fishingData.unlockedLocations?.includes(targetLocation.id)) {
            await reply(`❌ Địa điểm chưa mở khóa. Vào shop: {pn} shop → reply 4 → reply số địa điểm để mua.`);
            return;
          }
          if (fishingData.location === targetLocation.id) {
            await reply(`⚠️ Bạn đang ở ${targetLocation.emoji} ${targetLocation.name} rồi!`);
            return;
          }
          const updated = { ...fishingData, location: targetLocation.id };
          saveFishingDataForUser(uid, updated);
          await reply(`✅ Đã chuyển đến ${targetLocation.emoji} ${targetLocation.name}!\n⏰ ${targetLocation.minWait}-${targetLocation.maxWait}s | +${targetLocation.rareFishBonus}% cá hiếm`);
          return;
        }

        // ---- INVENTORY / TUI / BAG ----
        // ---- BAG / TUI (Túi vật phẩm - Items only) ----
        if (action === "bag" || action === "tui") {
          if (!fishingData) {
            await reply("❌ Bạn chưa có dữ liệu câu cá! Mua cần tại {pn} shop");
            return;
          }
          const myItems = fishingData.items || {};
          const itemKeys = Object.keys(myItems).filter((id) => (myItems[id] || 0) > 0);
          if (itemKeys.length === 0) {
            return reply("🎒 Túi vật phẩm trống trơn! Vào {pn} shop → 5. Vật phẩm mua đi.");
          }
          let msg = "🎒 TÚI VẬT PHẨM\n─────────────────\n";
          for (const id of itemKeys) {
            const qty = myItems[id];
            const info = ITEMS.find((i) => i.id === id);
            if (info) {
              msg += `- ${info.name} (x${qty}): ${info.description || ""}\n`;
            }
          }
          msg += "\n💡 Dùng lệnh: {pn} use <id> để sử dụng.\nVí dụ: {pn} use repair_kit";
          return reply(msg);
        }

        // ---- INVENTORY (Túi cá - xem & bán cá) ----
        if (action === "inventory") {
          if (!fishingData) {
            await reply("❌ Bạn chưa có dữ liệu câu cá! Mua cần tại {pn} shop");
            return;
          }
          const inventory = fishingData.inventory || {};
          const totalItems = Object.values(inventory).reduce((s, c) => s + c, 0);
          if (totalItems === 0) {
            await reply("🎒 Túi cá trống! Câu cá để có cá nhé! (Túi vật phẩm: {pn} bag)");
            return;
          }
          let invMsg = "🎒 TÚI CÁ\n─────────────────\n📦 Tổng: " + totalItems + " con\n\n";
          const items = [];
          let idx = 1;
          for (const [fishName, count] of Object.entries(inventory)) {
            if (count > 0) {
              const fish = FISH_LIST.find((f) => f.name === fishName);
              if (fish) {
                items.push({ fish, count, index: idx++ });
                invMsg += `${items.length}. ${fish.emoji} ${fish.name}: ${count} con (${formatCurrency(fish.price * count)})\n`;
              }
            }
          }
          invMsg += "\n📋 Reply tin nhắn này với số để bán (1, 2, 3...)\n💡 Hoặc: {pn} sell [tên cá] [số lượng]";
          return reply(
            invMsg,
            (err: Error | null, info?: { messageID?: string }) => {
              if (err || !info?.messageID) return;
              globalData.handleReply.set(info.messageID, {
                commandName,
                messageID: info.messageID,
                author: uid,
                threadID,
                type: "inventory"
              });
            }
          );
        }

        // ---- SELL ----
        if (action === "sell") {
          if (!fishingData) {
            await reply("❌ Bạn chưa có dữ liệu câu cá! {pn} shop");
            return;
          }
          const rest = args.slice(1);
          const quantity = parseInt(rest[rest.length - 1], 10);
          const fishName = (isNaN(quantity) ? rest : rest.slice(0, -1)).join(" ").trim();
          const qty = isNaN(quantity) || quantity <= 0 ? 1 : quantity;

          if (!fishName) {
            await reply("❌ Cú pháp: {pn} sell [tên cá] [số lượng]\nVí dụ: {pn} sell Cá chép 5");
            return;
          }

          const fish = FISH_LIST.find((f) => f.name.toLowerCase() === fishName.toLowerCase());
          if (!fish) {
            await reply(`❌ Không tìm thấy loại cá "${fishName}"!`);
            return;
          }
          const inv = fishingData.inventory || {};
          const currentCount = inv[fish.name] || 0;
          if (currentCount < qty) {
            await reply(`❌ Bạn chỉ có ${currentCount} con ${fish.name}, không đủ để bán ${qty} con!`);
            return;
          }
          const cooler = fishingData.cooler ? COOLERS.find((c) => c.id === fishingData.cooler) : null;
          const multiplier = cooler?.multiplier || 1;
          const fishPriceBigInt = toMoneyBigInt(fish.price);
          const totalPrice = calculateSellPrice(fishPriceBigInt, qty, multiplier);
          const newInventory = { ...inv };
          newInventory[fish.name] = currentCount - qty;
          if (newInventory[fish.name] <= 0) delete newInventory[fish.name];
          const updated = {
            ...fishingData,
            inventory: newInventory,
            lastActive: Date.now()
          };

          // Cộng tiền trước, xóa cá sau để tránh trường hợp mất cá mà không được tiền
          await Users.addMoney(uid, totalPrice);
          saveFishingDataForUser(uid, updated);

          // Track quest progress
          checkAndResetDailyQuests(uid);
          updateQuestProgress(uid, "sell", 0, null, Number(totalPrice));

          await reply(
            `✅ Đã bán ${qty} con ${fish.emoji} ${fish.name}!\n💰 Nhận: ${formatCurrency(totalPrice)}` +
            (multiplier > 1 ? ` (x${multiplier} ${cooler?.name})` : "") +
            `\n🎒 Còn: ${newInventory[fish.name] || 0} con`
          );
          return;
        }

        // ---- SELLALL (Bán hết tất cả cá) ----
        if (action === "sellall" || action === "sellhet" || action === "banhet") {
          if (!fishingData) {
            await reply("❌ Bạn chưa có dữ liệu câu cá! {pn} shop");
            return;
          }
          const inventory = fishingData.inventory || {};
          const inventoryKeys = Object.keys(inventory).filter((fishName) => {
            const qty = inventory[fishName] || 0;
            return qty > 0;
          });

          if (inventoryKeys.length === 0) {
            await reply("🎒 Túi đang rỗng, có gì đâu mà bán cha nội?");
            return;
          }

          const cooler = fishingData.cooler ? COOLERS.find((c) => c.id === fishingData.cooler) : null;
          const multiplier = cooler?.multiplier || 1;

          let totalMoneyEarned = 0n;
          let totalFishSold = 0;
          const soldDetails = [];

          // Duyệt qua inventory và tính tiền
          for (const fishName of inventoryKeys) {
            const qty = inventory[fishName] || 0;
            if (qty <= 0) continue;

            const fish = FISH_LIST.find((f) => f.name === fishName);
            if (!fish) continue; // Skip cá lỗi

            const fishPriceBigInt = toMoneyBigInt(fish.price);
            const price = calculateSellPrice(fishPriceBigInt, qty, multiplier);
            totalMoneyEarned += price;
            totalFishSold += qty;
            soldDetails.push(`${fish.emoji} ${fishName}: ${qty} con`);
          }

          if (totalFishSold === 0) {
            await reply("❌ Không có cá hợp lệ để bán!");
            return;
          }

          // Reset inventory và cập nhật data
          const updated = {
            ...fishingData,
            inventory: {},
            lastActive: Date.now()
          };

          // Cộng tiền trước, xóa cá sau để tránh mất cá mà không có tiền
          await Users.addMoney(uid, totalMoneyEarned);
          saveFishingDataForUser(uid, updated);

          // Track quest progress
          checkAndResetDailyQuests(uid);
          updateQuestProgress(uid, "sell", 0, null, Number(totalMoneyEarned));

          const finalMoney = await Users.getUser(uid).then((u) => BigInt(u?.money ?? 0));
          let replyMsg =
            "💰 BÁN HẾT THÀNH CÔNG\n─────────────────\n" +
            `🐟 Tổng số cá: ${totalFishSold} con\n` +
            `💵 Thu về: ${formatCurrency(totalMoneyEarned)}` +
            (multiplier > 1 ? ` (x${multiplier} ${cooler?.name})` : "") +
            `\n💰 Số dư mới: ${formatCurrency(finalMoney)}\n` +
            `🎒 Túi đồ đã sạch sẽ, đi câu tiếp đi!`;

          if (soldDetails.length <= 5) {
            replyMsg += "\n\n📋 Chi tiết:\n" + soldDetails.join("\n");
          }

          await reply(replyMsg);
          return;
        }

        // ---- QUEST / DAILY ----
        if (action === "quest" || action === "daily" || action === "nhiemvu") {
          if (!fishingData) {
            await reply("❌ Bạn chưa có dữ liệu câu cá! {pn} shop");
            return;
          }

          checkAndResetDailyQuests(uid);
          const quests = fishingData.dailyQuests || [];

          if (quests.length === 0) {
            await reply("📋 NHIỆM VỤ HÀNG NGÀY\n─────────────────\n\n❌ Chưa có nhiệm vụ nào!");
            return;
          }

          let questMsg = "📋 NHIỆM VỤ HÀNG NGÀY\n─────────────────\n\n";

          for (let i = 0; i < quests.length; i++) {
            const q = quests[i];
            const progressVal = q.progress ?? 0;
            const progressBar = drawProgressBar(progressVal, q.target, 10);
            const status = q.claimed ? "✅ Đã nhận thưởng" : q.completed ? "🎁 Hoàn thành - Dùng {pn} claim để nhận" : "⏳ Đang làm";
            questMsg += `${i + 1}. ${q.desc}\n   ${progressBar} (${progressVal}/${q.target})\n   ${status}\n   💰 Thưởng: ${formatCurrency(q.reward.money)}\n\n`;
          }

          questMsg += "💡 Dùng: {pn} claim [số] để nhận thưởng";
          await reply(questMsg);
          return;
        }

        // ---- CLAIM QUEST REWARD ----
        if (action === "claim") {
          if (!fishingData) {
            await reply("❌ Bạn chưa có dữ liệu câu cá!");
            return;
          }

          checkAndResetDailyQuests(uid);
          const quests = fishingData.dailyQuests || [];

          const questIndex = parseInt(args[1], 10) - 1;
          if (isNaN(questIndex) || questIndex < 0 || questIndex >= quests.length) {
            await reply("❌ Cú pháp: {pn} claim [số nhiệm vụ]\nVí dụ: {pn} claim 1");
            return;
          }

          const quest = quests[questIndex];
          if (!quest.completed) {
            await reply(`❌ Nhiệm vụ chưa hoàn thành! (${quest.progress}/${quest.target})`);
            return;
          }

          if (quest.claimed) {
            await reply("⚠️ Bạn đã nhận thưởng nhiệm vụ này rồi!");
            return;
          }

          quest.claimed = true;
          const rewardMoney = BigInt(quest.reward.money || 0);
          await Users.addMoney(uid, rewardMoney);
          saveFishingDataForUser(uid, fishingData);

          const finalMoney = await Users.getUser(uid).then((u) => BigInt(u?.money ?? 0));
          await reply(
            `✅ NHẬN THƯỞNG THÀNH CÔNG\n─────────────────\n` +
            `📋 Nhiệm vụ: ${quest.desc}\n` +
            `💰 Nhận: ${formatCurrency(rewardMoney)}\n` +
            `💵 Số dư: ${formatCurrency(finalMoney)}`
          );
          return;
        }

        // ---- WEATHER ----
        if (action === "weather" || action === "thoitiet") {
          checkWeatherEvent();
          const weatherEmoji = WEATHER_STATE.current === "rain" ? "🌧️" : WEATHER_STATE.current === "storm" ? "⛈️" : WEATHER_STATE.current === "sunny" ? "☀️" : "🌤️";
          const timeLeft = Math.max(0, WEATHER_STATE.endTime - Date.now());
          const minutesLeft = Math.floor(timeLeft / 60000);

          let weatherDesc = "";
          if (WEATHER_STATE.current === "rain") {
            weatherDesc = "Mưa rào! Cá hiếm xuất hiện nhiều hơn +15%";
          } else if (WEATHER_STATE.current === "storm") {
            weatherDesc = "Bão tố! Cá siêu hiếm xuất hiện +25%";
          } else if (WEATHER_STATE.current === "sunny") {
            weatherDesc = "Nắng gắt! Cá hiếm khó câu hơn -10%";
          } else {
            weatherDesc = "Thời tiết bình thường";
          }

          await reply(
            `🌤️ THỜI TIẾT HIỆN TẠI\n─────────────────\n` +
            `${weatherEmoji} ${weatherDesc}\n` +
            `⏰ Còn lại: ${minutesLeft} phút\n` +
            `💡 Thời tiết thay đổi định kỳ, ảnh hưởng đến tỷ lệ cá hiếm!`
          );
          return;
        }

        // ---- STEAL / PVP ----
        if (action === "steal" || action === "trom" || action === "anrom") {
          if (!fishingData) {
            await reply("❌ Bạn chưa có dữ liệu câu cá!");
            return;
          }

          const targetMention = event.mentions || {};
          const targetIDs = Object.keys(targetMention);

          if (targetIDs.length === 0) {
            await reply("❌ Cú pháp: {pn} steal @[người muốn trộm]\n💡 Trộm được 10% số cá trong túi của người đó");
            return;
          }

          const targetID = targetIDs[0];
          if (targetID === uid) {
            await reply("❌ Không thể trộm chính mình!");
            return;
          }

          const result = stealFish(uid, targetID);

          if (!result.success) {
            await reply(`❌ ${result.reason}`);
            return;
          }

          const targetUser = await Users.getUser(targetID).catch(() => null);
          const targetName = targetUser?.name || `User ${targetID.slice(-4)}`;

          const stolenList: string[] = [];
          const stolenMap = result.stolen || {};
          for (const [fishName, qty] of Object.entries(stolenMap)) {
            const fish = FISH_LIST.find(f => f.name === fishName);
            if (fish) stolenList.push(`${fish.emoji} ${fishName}: ${qty} con`);
          }

          await reply(
            `🎭 TRỘM THÀNH CÔNG!\n─────────────────\n` +
            `👤 Nạn nhân: ${targetName}\n` +
            `🐟 Đã trộm: ${result.totalStolen} con\n` +
            `📋 Chi tiết:\n${stolenList.join("\n")}\n\n` +
            `⏰ Cooldown: 30 phút\n` +
            `🛡️ ${targetName} được bảo vệ 1 giờ`
          );

          // Notify trong thread (mention target)
          try {
            const mentionTag = targetMention[targetID] || targetName;
            await reply(
              `⚠️ ${mentionTag} vừa bị ${user?.name || "ai đó"} trộm ${result.totalStolen} con cá!\n🛡️ ${mentionTag} được bảo vệ 1 giờ.`
            );
          } catch { }

          return;
        }

        // ---- TOP / LEADERBOARD ----
        if (action === "top" || action === "leaderboard" || action === "bxh") {
          const subAction = (args[1] || "").toLowerCase();
          const cache = LEADERBOARD_CACHE;
          const lastUpdateTime = Math.floor((Date.now() - cache.lastUpdate) / 1000 / 60);

          // Helper để lấy tên user (có thể cache sau)
          async function getUserName(userID: string): Promise<string> {
            try {
              const u = await Users.getUser(userID);
              return u?.name || `User ${userID.slice(-4)}`;
            } catch {
              return `User ${userID.slice(-4)}`;
            }
          }

          // Top Đại Gia (Rich)
          if (subAction === "rich" || subAction === "money" || subAction === "tiền") {
            if (cache.rich.length === 0) {
              await reply("📊 BẢNG XẾP HẠNG\n─────────────────\n\n❌ Chưa có dữ liệu xếp hạng!");
              return;
            }

            let topMsg = "💰 TOP ĐẠI GIA (Tổng giá trị cá đã câu)\n─────────────────\n\n";
            const topRich = cache.rich.slice(0, 10);

            for (let i = 0; i < topRich.length; i++) {
              const entry = topRich[i];
              const userName = await getUserName(entry.uid);
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
              topMsg += `${medal} ${userName}\n   💵 ${formatCurrency(entry.totalValue)}\n\n`;
            }

            topMsg += `⏰ Cập nhật ${lastUpdateTime} phút trước`;
            await reply(topMsg);
            return;
          }

          // Top Cần Thủ (Fisher)
          if (subAction === "fisher" || subAction === "caught" || subAction === "câu") {
            if (cache.fisher.length === 0) {
              await reply("📊 BẢNG XẾP HẠNG\n─────────────────\n\n❌ Chưa có dữ liệu xếp hạng!");
              return;
            }

            let topMsg = "🎣 TOP CẦN THỦ (Số cá đã câu)\n─────────────────\n\n";
            const topFisher = cache.fisher.slice(0, 10);

            for (let i = 0; i < topFisher.length; i++) {
              const entry = topFisher[i];
              const userName = await getUserName(entry.uid);
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
              topMsg += `${medal} ${userName}\n   🐟 ${entry.totalCaught.toLocaleString()} con\n\n`;
            }

            topMsg += `⏰ Cập nhật ${lastUpdateTime} phút trước`;
            await reply(topMsg);
            return;
          }

          // Mặc định: Show cả 2 bảng
          if (cache.rich.length === 0 && cache.fisher.length === 0) {
            await reply("📊 BẢNG XẾP HẠNG\n─────────────────\n\n❌ Chưa có dữ liệu xếp hạng!");
            return;
          }

          let combinedMsg = "📊 BẢNG XẾP HẠNG\n─────────────────\n\n";

          // Top Đại Gia (Top 5)
          if (cache.rich.length > 0) {
            combinedMsg += "💰 TOP ĐẠI GIA (Top 5)\n";
            const topRich = cache.rich.slice(0, 5);
            for (let i = 0; i < topRich.length; i++) {
              const entry = topRich[i];
              const userName = await getUserName(entry.uid);
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
              combinedMsg += `${medal} ${userName} - ${formatCurrency(entry.totalValue)}\n`;
            }
            combinedMsg += "\n";
          }

          // Top Cần Thủ (Top 5)
          if (cache.fisher.length > 0) {
            combinedMsg += "🎣 TOP CẦN THỦ (Top 5)\n";
            const topFisher = cache.fisher.slice(0, 5);
            for (let i = 0; i < topFisher.length; i++) {
              const entry = topFisher[i];
              const userName = await getUserName(entry.uid);
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
              combinedMsg += `${medal} ${userName} - ${entry.totalCaught.toLocaleString()} con\n`;
            }
            combinedMsg += "\n";
          }

          combinedMsg += `💡 Dùng: {pn} top rich (Đại gia) | {pn} top fisher (Cần thủ)\n`;
          combinedMsg += `⏰ Cập nhật ${lastUpdateTime} phút trước`;
          await reply(combinedMsg);
          return;
        }

        // ---- ALBUM / SỔ TAY CÁ ----
        if (action === "album" || action === "sotay" || action === "collection") {
          const caughtFishData = fishingData?.caughtFish || {};
          const speciesCaught = Object.keys(caughtFishData).length;
          const totalSpecies = FISH_LIST.length;
          const percent = totalSpecies > 0 ? Math.round((speciesCaught / totalSpecies) * 100) : 0;
          let albumMsg =
            "📖 SỔ TAY CÁ\n─────────────────\n" +
            `🐟 Đã câu: ${speciesCaught}/${totalSpecies} loại (${percent}%)\n\n`;
          if (speciesCaught === 0) {
            albumMsg += "Chưa câu được con nào. Thử {pn} để bắt đầu!\n";
          } else {
            const list = FISH_LIST.map((f) => {
              const count = caughtFishData[f.name] || 0;
              return count > 0 ? `  ✅ ${f.emoji} ${f.name}: ${count} con` : `  ⬜ ${f.emoji} ${f.name}`;
            });
            albumMsg += list.join("\n");
            if (speciesCaught === totalSpecies) albumMsg += "\n\n🏆 Bộ sưu tập full! Cần thủ huyền thoại!";
          }
          albumMsg += "\n─────────────────";
          await reply(albumMsg);
          return;
        }

        // ---- PROFILE / INFO / ME ----
        if (action === "profile" || action === "info" || action === "me" || action === "myinfo") {
          const userName = user?.name || "Người chơi";
          if (!fishingData) {
            await reply(
              "🎣 THÔNG TIN CẦN THỦ\n─────────────────\n" +
              `👤 Tên: ${userName}\n💰 Tiền: ${formatCurrency(currentMoney)}\n\n` +
              "❌ Bạn chưa có dữ liệu câu cá!\n💡 Bắt đầu: {pn} shop → mua cần, {pn} location → chọn địa điểm"
            );
            return;
          }
          const currentRod = fishingData.rod ? RODS.find((r) => r.id === fishingData.rod) : null;
          const currentBait = fishingData.bait ? BAITS.find((b) => b.id === fishingData.bait) : null;
          const currentCooler = fishingData.cooler ? COOLERS.find((c) => c.id === fishingData.cooler) : null;
          const maxCapacity = getMaxCapacity(fishingData.cooler);
          const totalFish = getCurrentTotalFish(fishingData.inventory || {});
          const capacityBar = drawProgressBar(totalFish, maxCapacity, 15);
          const currentLocation = LOCATIONS.find((l) => l.id === fishingData.location) || LOCATIONS[0];
          const totalItems = Object.values(fishingData.inventory || {}).reduce((s, c) => s + c, 0);
          const caughtCount = Object.keys(fishingData.caughtFish || {}).length;

          let profileMsg =
            "🎣 THÔNG TIN CẦN THỦ\n─────────────────\n" +
            `👤 Tên: ${userName}\n💰 Tiền: ${formatCurrency(currentMoney)}\n\n` +
            `🎣 Cần: ${currentRod ? `${currentRod.name} (Max ${currentRod.maxWeight}kg, Độ bền ${fishingData.rodDurability || 0}/${currentRod.durability})` : "Chưa có - Mua tại shop"}\n` +
            `🪱 Mồi: ${currentBait ? `${currentBait.name} (-${currentBait.reduction}s, +${currentBait.luck}% luck)` : "Không có"}\n` +
            `🧊 Thùng đá: ${currentCooler ? `${currentCooler.name} (x${currentCooler.multiplier})` : "Không có"}\n` +
            `🎒 Sức chứa: ${totalFish}/${maxCapacity} con\n` +
            `${capacityBar}\n` +
            `📍 Địa điểm: ${currentLocation.emoji} ${currentLocation.name}\n\n` +
            `📊 Thống kê: ${fishingData.totalCaught} con đã câu | Tổng giá trị: ${formatCurrency(fishingData.totalValue)}\n` +
            `🎒 Trong túi: ${totalItems} con | Loại cá đã câu: ${caughtCount}/${FISH_LIST.length}`;
          const nowProfile = Date.now();
          let buffMsg = "";
          if (fishingData.buffs && fishingData.buffs.luckEndTime > nowProfile) {
            const timeLeft = Math.ceil((fishingData.buffs.luckEndTime - nowProfile) / 60000);
            const luckBonus = fishingData.buffs.luckBonus ?? 20;
            buffMsg += `🍀 Luck +${luckBonus}% (${timeLeft}p) `;
          }
          if (fishingData.protectionEnd > nowProfile) {
            const timeLeft = Math.ceil((fishingData.protectionEnd - nowProfile) / 60000);
            buffMsg += `🛡️ Bảo vệ (${timeLeft}p)`;
          }
          if (buffMsg) {
            profileMsg += `\n\n✨ Hiệu ứng: ${buffMsg.trim()}`;
          }
          const myItems = fishingData.items || {};
          const itemKeys = Object.keys(myItems).filter((id) => (myItems[id] || 0) > 0);
          if (itemKeys.length > 0) {
            profileMsg += "\n\n🎒 Túi vật phẩm: ";
            profileMsg += itemKeys.map((id) => {
              const info = ITEMS.find((i) => i.id === id);
              return info ? `${info.name} x${myItems[id]}` : null;
            }).filter(Boolean).join(" | ");
          }
          if (Object.keys(fishingData.caughtFish || {}).length > 0) {
            profileMsg += "\n\n🐟 Bộ sưu tập:";
            for (const [fName, count] of Object.entries(fishingData.caughtFish)) {
              const f = FISH_LIST.find((x) => x.name === fName);
              if (f) profileMsg += `\n  • ${f.emoji} ${fName}: ${count} con`;
            }
          }
          await reply(profileMsg);
          return;
        }

        // ---- FISHING (mặc định khi gõ lệnh không tham số hoặc tham số khác) ----
        if (!fishingData) {
          await reply("❌ Bạn chưa có dữ liệu câu cá! Bắt đầu: {pn} shop, {pn} location");
          return;
        }
        if (!fishingData.rod) {
          await reply("❌ Bạn chưa có cần câu! Mua tại {pn} shop");
          return;
        }

        const currentRod = RODS.find((r) => r.id === fishingData.rod);
        if (!currentRod) {
          await reply("❌ Cần câu không hợp lệ! Mua lại tại shop.");
          return;
        }
        const currentDurability = fishingData.rodDurability ?? currentRod.durability;
        if (currentDurability <= 0) {
          await reply("⚠️ Cần câu đã hết độ bền! Mua cần mới tại {pn} shop");
          return;
        }

        const currentLocation = LOCATIONS.find((l) => l.id === fishingData.location) || LOCATIONS[0];
        const currentBait = fishingData.bait ? BAITS.find((b) => b.id === fishingData.bait) : null;
        let inventory = fishingData.inventory || {};

        // Check túi đầy trước khi câu tiếp
        const currentFishCount = getCurrentTotalFish(inventory);
        const maxCapacity = getMaxCapacity(fishingData.cooler);
        if (currentFishCount >= maxCapacity) {
          await reply(
            "🎒 TÚI ĐẦY RỒI\n─────────────────\n" +
            `📦 Số cá hiện tại: ${currentFishCount}/${maxCapacity} con\n` +
            "❌ Thùng chứa đã chật cứng, không thể câu thêm!\n" +
            "💡 Hãy bán bớt cá (dùng {pn} inventory / {pn} sell) hoặc nâng cấp thùng đá xịn hơn để tiếp tục câu."
          );
          return;
        }

        const baitLuck = currentBait?.luck || 0;
        const locationBonus = currentLocation.rareFishBonus || 0;
        const weatherBonus = getWeatherBonus();
        const now = Date.now();
        let activeLuckBonus = 0 as number;
        const buffs = fishingData.buffs as FishingBuffs;
        if (buffs && buffs.luckEndTime > now) {
          const luckBonusField = (buffs as any).luckBonus;
          activeLuckBonus = typeof luckBonusField === "number" ? luckBonusField : 20;
        }
        if (buffs && typeof buffs.nextCastLuckBonus === "number") {
          activeLuckBonus += buffs.nextCastLuckBonus;
        }
        const caughtFish = drawFish(baitLuck, locationBonus, weatherBonus, activeLuckBonus);
        let addQty = (fishingData.buffs && fishingData.buffs.nextCastDoubleFish) ? 2 : 1;
        const isLuckyDouble = addQty === 1 && Math.random() < 0.05;
        if (isLuckyDouble) addQty = 2;

        // Combo: câu cùng loại trong 3 phút → +10% giá
        const COMBO_WINDOW_MS = 3 * 60 * 1000;
        const lastCatchTime = fishingData.lastCatchTime || 0;
        const lastCatchFishName = fishingData.lastCatchFishName || null;
        const prevStreak = fishingData.catchStreak || 0;
        const sameFishInTime = lastCatchFishName === caughtFish.name && (now - lastCatchTime) < COMBO_WINDOW_MS;
        const streak = sameFishInTime ? prevStreak + 1 : 1;
        const comboBonus = streak >= 2 ? 0.1 : 0;

        // Track quest progress
        checkAndResetDailyQuests(uid);
        updateQuestProgress(uid, "catch", addQty, caughtFish.name);
        if (caughtFish.price > 20000) {
          updateQuestProgress(uid, "catch_rare", addQty, caughtFish.name);
        }

        const fishWeight = caughtFish.weight ?? 0;
        if (fishWeight > currentRod.maxWeight) {
          const breakBuffs = { ...(fishingData.buffs || {}) };
          delete breakBuffs.oneShotNoDurabilityLoss;
          delete breakBuffs.nextCastLuckBonus;
          delete breakBuffs.nextCastDoubleFish;
          delete breakBuffs.noDurabilityLossCount;
          delete breakBuffs.halfDurabilityCount;
          const updated = {
            ...fishingData,
            rodDurability: 0,
            buffs: breakBuffs
          };
          saveFishingDataForUser(uid, updated);
          await reply(
            `⚠️ XOẢNG!!!\n\n💀 Con ${caughtFish.emoji} ${caughtFish.name} nặng quá (${fishWeight}kg)!\n` +
            `🎣 Cần ${currentRod.name} gãy rồi. Mua cần mới đi! (Max: ${currentRod.maxWeight}kg)`
          );
          return;
        }

        let durabilityLoss = Math.max(1, Math.min(3, Math.floor(fishWeight / 10)));
        if (fishingData.buffs && fishingData.buffs.oneShotNoDurabilityLoss) {
          durabilityLoss = 0;
        } else if (fishingData.buffs && (fishingData.buffs.noDurabilityLossCount || 0) > 0) {
          durabilityLoss = 0;
        } else if (fishingData.buffs && (fishingData.buffs.halfDurabilityCount || 0) > 0) {
          durabilityLoss = Math.max(1, Math.floor(durabilityLoss / 2));
        }
        const newDurability = Math.max(0, (fishingData.rodDurability ?? currentRod.durability) - durabilityLoss);
        const cooler = fishingData.cooler ? COOLERS.find((c) => c.id === fishingData.cooler) : null;
        const multiplier = cooler?.multiplier || 1;
        const caughtFishPriceBigInt = toMoneyBigInt(caughtFish.price);
        let finalPrice = calculateSellPrice(caughtFishPriceBigInt, addQty, multiplier);
        if (comboBonus > 0) {
          finalPrice = BigInt(Math.floor(Number(finalPrice) * (1 + comboBonus)));
        }
        const newBuffs: FishingBuffs = { ...(fishingData.buffs || { luckEndTime: 0 }) };
        if (newBuffs.oneShotNoDurabilityLoss) delete newBuffs.oneShotNoDurabilityLoss;
        if (newBuffs.nextCastLuckBonus) delete newBuffs.nextCastLuckBonus;
        if (newBuffs.nextCastDoubleFish) delete newBuffs.nextCastDoubleFish;
        if ((newBuffs.noDurabilityLossCount ?? 0) > 0) {
          newBuffs.noDurabilityLossCount = (newBuffs.noDurabilityLossCount ?? 0) - 1;
          if (newBuffs.noDurabilityLossCount === 0) delete newBuffs.noDurabilityLossCount;
        }
        if ((newBuffs.halfDurabilityCount ?? 0) > 0) {
          newBuffs.halfDurabilityCount = (newBuffs.halfDurabilityCount ?? 0) - 1;
          if (newBuffs.halfDurabilityCount === 0) delete newBuffs.halfDurabilityCount;
        }
        const updated = {
          ...fishingData,
          rodDurability: newDurability,
          buffs: newBuffs,
          totalCaught: fishingData.totalCaught + addQty,
          caughtFish: {
            ...fishingData.caughtFish,
            [caughtFish.name]: (fishingData.caughtFish[caughtFish.name] || 0) + addQty
          },
          inventory: {
            ...inventory,
            [caughtFish.name]: (inventory[caughtFish.name] || 0) + addQty
          },
          lastActive: Date.now(),
          lastCatchTime: now,
          lastCatchFishName: caughtFish.name,
          catchStreak: streak
        };
        saveFishingDataForUser(uid, updated);

        // Track active thread để notify weather
        activeThreads.set(threadID, Date.now());

        const userName = user?.name || "Người chơi";
        const weatherEmoji = WEATHER_STATE.current === "rain" ? "🌧️" : WEATHER_STATE.current === "storm" ? "⛈️" : WEATHER_STATE.current === "sunny" ? "☀️" : "🌤️";
        const rarityTier = caughtFish.rarity <= 1 ? "🌟 Cá siêu hiếm!" : caughtFish.rarity <= 3 ? "✨ Cá hiếm!" : null;
        const flavorText = getCatchFlavorText(caughtFish);
        let msg =
          "🎣 KẾT QUẢ CÂU CÁ\n─────────────────\n" +
          `👤 Cần thủ: ${userName}\n📍 ${currentLocation.emoji} ${currentLocation.name} ${weatherEmoji} ${WEATHER_STATE.current === "normal" ? "" : `(${WEATHER_STATE.bonus > 0 ? "+" : ""}${WEATHER_STATE.bonus}%)`}\n` +
          (rarityTier ? `${rarityTier}\n` : "") +
          (isLuckyDouble ? "🍀 May mắn! Câu trúng đôi!\n" : "") +
          (streak >= 2 ? `🔥 Combo x${streak}! +10% giá con này!\n` : "") +
          `✨ Chiến lợi phẩm: ${caughtFish.emoji} ${caughtFish.name}${addQty > 1 ? ` x${addQty}` : ""}\n⚖️ ${caughtFish.weight}kg\n` +
          `🎣 Độ bền cần: ${newDurability}/${currentRod.durability} (-${durabilityLoss})\n` +
          `🎒 Đã lưu vào túi! 💰 Giá bán ước tính: ${formatCurrency(finalPrice)}`;
        if (multiplier > 1) msg += ` (x${multiplier} ${cooler?.name})`;
        if (flavorText) msg += `\n💬 ${flavorText}`;
        msg += "\n📋 {pn} inventory để xem túi | {pn} sell [tên cá] để bán\n─────────────────";
        if (newDurability <= 0) msg += "\n⚠️ Cần đã hết độ bền! Mua cần mới tại shop.";
        else if (newDurability <= currentRod.durability * 0.2) msg += `\n⚠️ Cần sắp hết độ bền! (${newDurability}/${currentRod.durability})`;
        if (caughtFish.price > 50000) msg += "\n🔥 Trúng mánh rồi!";
        else if (caughtFish.name === "Chiếc giày cũ") msg += "\n😅 Xui quá, câu nhầm rác!";
        else msg += "\n😊 Có còn hơn không.";

        // Weather notification (chỉ khi có flag và là storm/rain)
        if (WEATHER_STATE.notifyThreads && (WEATHER_STATE.current === "storm" || WEATHER_STATE.current === "rain")) {
          const weatherDesc = WEATHER_STATE.current === "storm"
            ? "⛈️ BÃO TỐ! Cá siêu hiếm xuất hiện +25%!"
            : "🌧️ MƯA RÀO! Cá hiếm xuất hiện nhiều hơn +15%!";
          try {
            await reply(
              `${weatherDesc}\n💡 Đây là cơ hội tốt để câu cá hiếm!`
            );
            WEATHER_STATE.notifyThreads = false; // Chỉ notify 1 lần
          } catch { }
        }

        await reply(msg);
      } catch (error: unknown) {
        log("ERROR", `[CAUCA] Fishing error: ${getErrorMessage(error)}`);
        await reply("❌ Có lỗi xảy ra khi câu cá!");
      }
    }
  },

  onReply: async (ctx: CommandOnReplyContext): Promise<void> => {
    const { client, event, reply, main, userData, Reply, commandName } = ctx as any;
    const uid: string = event.senderID;
    const body: string = (event.body || "").trim().toLowerCase();
    const text = body;

    const Users: CaucaUsersHelper = {
      getUser: (userID: string) => userData.get(userID),
      addMoney: async (userID: string, amount: bigint) => {
        const addMoney = (userData as any).addMoney as
          | ((id: string, value: bigint) => Promise<void>)
          | undefined;
        if (addMoney) {
          await addMoney(userID, amount);
        }
      },
      delMoney: async (userID: string, amount: bigint) => {
        const delMoney = (userData as any).delMoney as
          | ((id: string, value: bigint) => Promise<void>)
          | undefined;
        if (delMoney) {
          await delMoney(userID, amount);
        }
      }
    };

    const globalData = {
      handleReply: (main as any).onReply as Map<string, CaucaReplyData>
    };

    const replyData = Reply as CaucaReplyData | undefined;

    // Debug: log toàn bộ onReply cho cauca
    log(
      "INFO",
      `[CAUCA] onReply | cmd=${commandName} | uid=${uid} | body="${body}" | replyData=${JSON.stringify(
        replyData || {}
      )}`
    );

    // Plugin loader đã route đúng command; chỉ cần chắc có Reply và đúng author
    if (!replyData || replyData.author !== uid) {
      log("INFO", "[CAUCA] onReply: skip do không khớp author hoặc thiếu Reply");
      return;
    }

    // Lock cho các action mua/bán trong onReply
    const needsLock = replyData.type === "shop" || replyData.type === "inventory";

    if (needsLock) {
      const lockResult = await withLock(uid, async () => {
        return await executeReplyAction();
      });

      if (typeof lockResult === "string") {
        return await reply(lockResult);
      }
      return;
    }

    return await executeReplyAction();

    async function executeReplyAction() {
      const rd = replyData as CaucaReplyData;
      try {
        const user = await Users.getUser(uid);
        if (!user) {
          await reply("❌ Không tìm thấy thông tin người dùng!");
          return;
        }
        const currentMoney = BigInt(user?.money ?? 0);
        let fishingData = getFishingData(uid);

        // ---- SHOP CATEGORY (chọn 1-4, sau đó reply để mua trong loại đã chọn) ----
        if (rd.type === "shop_category") {
          try {
            log("INFO", `[CAUCA] onReply shop_category | choice=${text}`);
            const categoryChoice = parseInt(text, 10);
            if (isNaN(categoryChoice) || categoryChoice < 1 || categoryChoice > 5) {
              await reply("❌ Vui lòng reply với số từ 1-5!");
              return;
            }
            let category: "rod" | "bait" | "cooler" | "location" | "item" | null = null;
            let categoryMsg = "";

            if (categoryChoice === 1) {
              category = "rod";
              categoryMsg = "🎣 CẦN CÂU\n─────────────────\n\n";
              RODS.forEach((rod, i) => {
                const owned = fishingData?.rod === rod.id;
                categoryMsg += `${i + 1}. ${rod.name}: ${formatCurrency(rod.price)} (Max: ${rod.maxWeight}kg, Độ bền: ${rod.durability})${owned ? " ✅" : ""}\n`;
              });
            } else if (categoryChoice === 2) {
              category = "bait";
              categoryMsg = "🪱 MỒI\n─────────────────\n\n";
              BAITS.forEach((bait, i) => {
                const owned = fishingData?.bait === bait.id;
                categoryMsg += `${i + 1}. ${bait.name}: ${formatCurrency(bait.price)} (-${bait.reduction}s, +${bait.luck}% luck)${owned ? " ✅" : ""}\n`;
              });
            } else if (categoryChoice === 3) {
              category = "cooler";
              categoryMsg = "🧊 THÙNG ĐÁ\n─────────────────\n\n";
              COOLERS.forEach((cooler, i) => {
                const owned = fishingData?.cooler === cooler.id;
                categoryMsg += `${i + 1}. ${cooler.name}: ${formatCurrency(cooler.price)} (x${cooler.multiplier} giá)${owned ? " ✅" : ""}\n`;
              });
            } else if (categoryChoice === 4) {
              category = "location";
              categoryMsg = "📍 ĐỊA ĐIỂM (mở khóa map)\n─────────────────\n\n";
              LOCATIONS.forEach((loc, i) => {
                const stt = i + 1;
                const unlocked = fishingData?.unlockedLocations?.includes(loc.id) ?? loc.id === "location_01";
                const current = fishingData?.location === loc.id;
                const priceText = loc.unlockPrice ? ` (${formatCurrency(loc.unlockPrice)})` : "";
                categoryMsg += `${stt}. ${loc.emoji} ${loc.name}${priceText}${current ? " ✅" : ""}${!unlocked ? " 🔒" : ""}\n`;
              });
            } else if (categoryChoice === 5) {
              category = "item";
              categoryMsg = "🧪 VẬT PHẨM (Items)\n─────────────────\n\n";
              ITEMS.forEach((item, i) => {
                const qty = (fishingData?.items || {})[item.id] || 0;
                categoryMsg += `${i + 1}. ${item.name} (${item.id}): ${formatCurrency(item.price)} - ${item.description || ""}${qty > 0 ? ` [Đang có: ${qty}]` : ""}\n`;
              });
            }

            if (!category) {
              await reply("❌ Lỗi không xác định loại!");
              return;
            }

            categoryMsg += "\n📋 Reply tin nhắn này với số để mua/chọn (1, 2, 3...)";
            // Gửi bằng client.sendMessage để chắc chắn lấy được messageID
            const sendResult = await new Promise<{ messageID?: string } | null>((resolve) => {
              try {
                client.sendMessage(
                  categoryMsg,
                  event.threadID,
                  (err: Error | null, info?: { messageID?: string }) => {
                    if (err) {
                      log("ERROR", `[CAUCA] shop_category client.sendMessage error: ${getErrorMessage(err)}`);
                      return resolve(null);
                    }
                    return resolve(info ?? null);
                  },
                  event.messageID
                );
              } catch (sendErr) {
                log("ERROR", `[CAUCA] shop_category client.sendMessage exception: ${getErrorMessage(sendErr)}`);
                resolve(null);
              }
            });

            if (!sendResult?.messageID) {
              await reply("❌ Không gửi được danh sách shop, vui lòng thử lại.");
              return;
            }

            const newMessageID = sendResult.messageID;
            log(
              "INFO",
              `[CAUCA] register handleReply shop | mid=${newMessageID} | category=${String(
                category
              )}`
            );
            globalData.handleReply.set(newMessageID, {
              commandName,
              messageID: newMessageID,
              author: uid,
              threadID: event.threadID,
              type: "shop",
              category
            });
            if (rd.messageID) globalData.handleReply.delete(rd.messageID);
            return;
          } catch (err) {
            log("ERROR", `[CAUCA] onReply shop_category exception: ${getErrorMessage(err)}`);
            await reply("❌ Đã xảy ra lỗi khi xử lý shop (bước chọn loại). Vui lòng báo admin.");
            return;
          }
        }

        // ---- CHỌN ĐỊA ĐIỂM (reply từ map/location list, hỗ trợ STT) ----
        if (rd.type === "choose_location") {
          let raw = (event.body || "").trim().toLowerCase();
          const sttPrefixes = ["location ", "địa điểm ", "chuyển đến ", "đến ", "diadiem "];
          for (const p of sttPrefixes) {
            if (raw.startsWith(p)) {
              raw = raw.slice(p.length).trim();
              break;
            }
          }
          let targetLocation = null;
          const num = parseInt(raw, 10);
          if (!isNaN(num) && num >= 1 && num <= LOCATIONS.length) {
            targetLocation = LOCATIONS[num - 1];
          }
          if (!targetLocation) {
            targetLocation = LOCATIONS.find((l) => l.name.toLowerCase() === raw);
          }
          if (!targetLocation) {
            targetLocation = LOCATIONS.find((l) => l.name.toLowerCase().includes(raw) || raw.includes(l.name.toLowerCase()));
          }
          if (!targetLocation) {
            await reply(`❌ Không tìm thấy địa điểm "${(event.body || "").trim()}". Reply tên địa điểm hoặc số (1-${LOCATIONS.length}).`);
            return;
          }
          if (!fishingData) {
            if (targetLocation.id !== "location_01") {
              await reply(`❌ Địa điểm chưa mở khóa. Vào shop: {pn} shop → reply 4 (Địa điểm) → reply số địa điểm để mua.`);
              if (rd.messageID) globalData.handleReply.delete(rd.messageID);
              return;
            }
            createFishingData(uid, { location: targetLocation.id, unlockedLocations: [targetLocation.id] });
            await reply(`✅ Đã chuyển đến ${targetLocation.emoji} ${targetLocation.name}! Mua cần tại {pn} shop`);
            if (rd.messageID) globalData.handleReply.delete(rd.messageID);
            return;
          }
          if (!fishingData.unlockedLocations?.includes(targetLocation.id)) {
            await reply(`❌ Địa điểm chưa mở khóa. Vào shop: {pn} shop → reply 4 → reply số địa điểm để mua.`);
            if (rd.messageID) globalData.handleReply.delete(rd.messageID);
            return;
          }
          if (fishingData.location === targetLocation.id) {
            await reply(`⚠️ Bạn đang ở ${targetLocation.emoji} ${targetLocation.name} rồi!`);
            if (rd.messageID) globalData.handleReply.delete(rd.messageID);
            return;
          }
          const updated = { ...fishingData, location: targetLocation.id };
          saveFishingDataForUser(uid, updated);
          await reply(`✅ Đã chuyển đến ${targetLocation.emoji} ${targetLocation.name}!\n⏰ ${targetLocation.minWait}-${targetLocation.maxWait}s | +${targetLocation.rareFishBonus}% cá hiếm`);
          if (rd.messageID) globalData.handleReply.delete(rd.messageID);
          return;
        }

        // ---- SHOP (mua item trong loại đã chọn) ----
        if (rd.type === "shop") {
          log("INFO", `[CAUCA] onReply shop | category=${String(rd.category)} | choice=${text}`);
          const choice = parseInt(text, 10);
          if (isNaN(choice) || choice < 1) {
            await reply("❌ Vui lòng reply với số (1, 2, 3...)");
            return;
          }
          const category = rd.category;

          if (category === "rod" && choice <= RODS.length) {
            const rodToBuy = RODS[choice - 1];
            const rodPrice = toMoneyBigInt(rodToBuy.price);
            if (!fishingData) {
              if (currentMoney < rodPrice) {
                await reply(`❌ Không đủ tiền! Cần ${formatCurrency(rodToBuy.price)}`);
                return;
              }
              createFishingData(uid, { rod: rodToBuy.id, rodDurability: rodToBuy.durability });
            } else {
              if (fishingData.rod === rodToBuy.id) {
                await reply("⚠️ Bạn đã có cần này rồi!");
                return;
              }
              if (currentMoney < rodPrice) {
                await reply(`❌ Không đủ tiền! Cần ${formatCurrency(rodToBuy.price)}`);
                return;
              }
              const updated = { ...fishingData, rod: rodToBuy.id, rodDurability: rodToBuy.durability };
              saveFishingDataForUser(uid, updated);
            }
            await Users.delMoney(uid, rodPrice);
            const finalMoney = await Users.getUser(uid).then((u) => BigInt(u?.money ?? 0));
            await reply(`✅ Đã mua ${rodToBuy.name}!\n💰 Số dư: ${formatCurrency(finalMoney)}`);
            if (rd.messageID) globalData.handleReply.delete(rd.messageID);
            return;
          }

          if (category === "bait" && choice <= BAITS.length) {
            if (!fishingData) {
              await reply("❌ Bạn chưa có cần câu! Mua cần trước.");
              return;
            }
            const baitToBuy = BAITS[choice - 1];
            if (fishingData.bait === baitToBuy.id) {
              await reply("⚠️ Bạn đã có mồi này rồi!");
              return;
            }
            const baitPrice = toMoneyBigInt(baitToBuy.price);
            if (currentMoney < baitPrice) {
              await reply(`❌ Không đủ tiền! Cần ${formatCurrency(baitToBuy.price)}`);
              return;
            }
            const updated = { ...fishingData, bait: baitToBuy.id };
            saveFishingDataForUser(uid, updated);
            await Users.delMoney(uid, baitPrice);
            const finalMoney = await Users.getUser(uid).then((u) => BigInt(u?.money ?? 0));
            await reply(`✅ Đã mua ${baitToBuy.name}!\n💰 Số dư: ${formatCurrency(finalMoney)}`);
            if (rd.messageID) globalData.handleReply.delete(rd.messageID);
            return;
          }

          if (category === "cooler" && choice <= COOLERS.length) {
            if (!fishingData) {
              await reply("❌ Bạn chưa có cần câu! Mua cần trước.");
              return;
            }
            const coolerToBuy = COOLERS[choice - 1];
            if (fishingData.cooler === coolerToBuy.id) {
              await reply("⚠️ Bạn đã có thùng đá này rồi!");
              return;
            }
            const coolerPrice = toMoneyBigInt(coolerToBuy.price);
            if (currentMoney < coolerPrice) {
              await reply(`❌ Không đủ tiền! Cần ${formatCurrency(coolerToBuy.price)}`);
              return;
            }
            const updated = { ...fishingData, cooler: coolerToBuy.id };
            saveFishingDataForUser(uid, updated);
            await Users.delMoney(uid, coolerPrice);
            const finalMoney = await Users.getUser(uid).then((u) => BigInt(u?.money ?? 0));
            await reply(`✅ Đã mua ${coolerToBuy.name}!\n💰 Số dư: ${formatCurrency(finalMoney)}`);
            if (rd.messageID) globalData.handleReply.delete(rd.messageID);
            return;
          }

          if (category === "item" && choice <= ITEMS.length) {
            const itemToBuy = ITEMS[choice - 1];
            const itemPrice = toMoneyBigInt(itemToBuy.price);
            if (currentMoney < itemPrice) {
              await reply(`❌ Không đủ tiền! Cần ${formatCurrency(itemToBuy.price)}`);
              return;
            }
            if (!fishingData) {
              fishingData = createFishingData(uid, { items: { [itemToBuy.id]: 1 } });
            } else {
              const items = { ...(fishingData.items || {}) };
              if (!items[itemToBuy.id]) items[itemToBuy.id] = 0;
              items[itemToBuy.id]++;
              const updated = { ...fishingData, items };
              saveFishingDataForUser(uid, updated);
            }
            await Users.delMoney(uid, itemPrice);
            const finalMoney = await Users.getUser(uid).then((u) => BigInt(u?.money ?? 0));
            await reply(`✅ Đã mua thành công ${itemToBuy.name}!\n💰 Số dư: ${formatCurrency(finalMoney)}\n💡 Dùng: {pn} use ${itemToBuy.id}`);
            if (rd.messageID) globalData.handleReply.delete(rd.messageID);
            return;
          }

          if (category === "location" && choice <= LOCATIONS.length) {
            const locationToSelect = LOCATIONS[choice - 1];
            if (!fishingData) {
              if (locationToSelect.id !== "location_01") {
                await reply(`❌ Chưa mở khóa! Mở khóa: {pn} buy ${locationToSelect.name}`);
                return;
              }
              createFishingData(uid, { location: locationToSelect.id, unlockedLocations: [locationToSelect.id] });
              await reply(`✅ Đã chuyển đến ${locationToSelect.emoji} ${locationToSelect.name}! Mua cần tại {pn} shop`);
              if (rd.messageID) globalData.handleReply.delete(rd.messageID);
              return;
            }
            const unlocked = fishingData.unlockedLocations?.includes(locationToSelect.id);
            if (unlocked) {
              if (fishingData.location === locationToSelect.id) {
                await reply(`⚠️ Bạn đang ở ${locationToSelect.emoji} ${locationToSelect.name} rồi!`);
                return;
              }
              const updated = { ...fishingData, location: locationToSelect.id };
              saveFishingDataForUser(uid, updated);
              await reply(`✅ Đã chuyển đến ${locationToSelect.emoji} ${locationToSelect.name}!`);
              if (rd.messageID) globalData.handleReply.delete(rd.messageID);
              return;
            }
            if (!locationToSelect.unlockPrice) {
              await reply("⚠️ Địa điểm này không cần mở khóa!");
              return;
            }
            const unlockPrice = toMoneyBigInt(locationToSelect.unlockPrice);
            if (currentMoney < unlockPrice) {
              await reply(`❌ Không đủ tiền! Cần ${formatCurrency(locationToSelect.unlockPrice)}`);
              return;
            }
            const updatedUnlocked = [...(fishingData.unlockedLocations || ["location_01"]), locationToSelect.id];
            const updated = { ...fishingData, unlockedLocations: updatedUnlocked, location: locationToSelect.id };
            saveFishingDataForUser(uid, updated);
            await Users.delMoney(uid, unlockPrice);
            const finalMoney = await Users.getUser(uid).then((u) => BigInt(u?.money ?? 0));
            await reply(`✅ Đã mở khóa ${locationToSelect.emoji} ${locationToSelect.name}!\n💰 Số dư: ${formatCurrency(finalMoney)}\n📍 Đã chuyển đến địa điểm này!`);
            if (rd.messageID) globalData.handleReply.delete(rd.messageID);
            return;
          }

          await reply("❌ Lựa chọn không hợp lệ!");
          return;
        }

        // ---- INVENTORY REPLY (bán cá theo số thứ tự) ----
        if (rd.type === "inventory") {
          if (!fishingData) {
            await reply("❌ Bạn chưa có dữ liệu câu cá!");
            return;
          }
          const choice = parseInt(text, 10);
          if (isNaN(choice) || choice < 1) {
            await reply("❌ Vui lòng reply với số (1, 2, 3...)");
            return;
          }
          const inventory = fishingData.inventory || {};
          const items = [];
          for (const [fishName, count] of Object.entries(inventory)) {
            if (count > 0) {
              const fish = FISH_LIST.find((f) => f.name === fishName);
              if (fish) items.push({ fish, count });
            }
          }
          if (choice > items.length) {
            await reply("❌ Lựa chọn không hợp lệ!");
            return;
          }
          const selectedItem = items[choice - 1];
          if (!selectedItem) {
            await reply("❌ Không tìm thấy vật phẩm!");
            return;
          }
          const quantity = selectedItem.count;
          const cooler = fishingData.cooler ? COOLERS.find((c) => c.id === fishingData.cooler) : null;
          const multiplier = cooler?.multiplier || 1;
          const fishPriceBigInt = toMoneyBigInt(selectedItem.fish.price);
          const totalPrice = calculateSellPrice(fishPriceBigInt, quantity, multiplier);
          const newInventory = { ...inventory };
          delete newInventory[selectedItem.fish.name];
          const updated = { ...fishingData, inventory: newInventory };
          saveFishingDataForUser(uid, updated);
          await Users.addMoney(uid, totalPrice);
          await reply(
            `✅ Đã bán ${quantity} con ${selectedItem.fish.emoji} ${selectedItem.fish.name}!\n💰 Nhận: ${formatCurrency(totalPrice)}` +
            (multiplier > 1 ? ` (x${multiplier} ${cooler?.name})` : "")
          );
          if (rd.messageID) globalData.handleReply.delete(rd.messageID);
          return;
        }
      } catch (error: unknown) {
        log("ERROR", `[CAUCA] Fishing reply error: ${getErrorMessage(error)}`);
        await reply("❌ Có lỗi xảy ra!");
      }
    }
  }
};

export default caucaCommand;