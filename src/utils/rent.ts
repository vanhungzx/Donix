import type { BotConfig, ExtendedMessageEvent, FacebookClient } from "@types";
import fs from "fs-extra";
import moment from "moment-timezone";
import path from "path";
const RENT_PATH = path.join(process.cwd(), "src/storage/rent/rent.json");
interface RentData {
  threadID: string;
  endDate?: string;
  [key: string]: unknown;
}

// Cache rent data với TTL 10 giây để giảm I/O
let rentCache: RentData[] | null = null;
let rentCacheTime: number = 0;
const RENT_CACHE_TTL = 10 * 1000; // 10 giây

export async function readRent(): Promise<RentData[]> {
  const now = Date.now();

  // Sử dụng cache nếu còn hiệu lực
  if (rentCache !== null && (now - rentCacheTime) < RENT_CACHE_TTL) {
    return rentCache;
  }

  try {
    const raw = await fs.readFile(RENT_PATH, "utf8");
    const data = JSON.parse(raw || "[]");
    const result = Array.isArray(data) ? data : [];

    // Cập nhật cache
    rentCache = result;
    rentCacheTime = now;

    return result;
  } catch {
    const result: RentData[] = [];
    rentCache = result;
    rentCacheTime = now;
    return result;
  }
}

export async function rent(
  tid: string,
  sid: string,
  client: FacebookClient,
  cfg: BotConfig,
  ev?: ExtendedMessageEvent
): Promise<boolean> {
  if (!sid || !client?.id || !cfg?.OWNER) return false;
  const isOwner = Array.isArray(cfg.OWNER) ? cfg.OWNER.includes(sid) : String(cfg.OWNER) === sid;
  const isAdmin = Array.isArray(cfg.ADMIN) ? cfg.ADMIN.includes(sid) : false;
  if (sid === client.id || isOwner || isAdmin) return false;
  if (ev?.author) {
    const isAuthorOwner = Array.isArray(cfg.OWNER) ? cfg.OWNER.includes(ev.author) : String(cfg.OWNER) === ev.author;
    const isAuthorAdmin = Array.isArray(cfg.ADMIN) ? cfg.ADMIN.includes(ev.author) : false;
    if (ev.author === client.id || isAuthorOwner || isAuthorAdmin) {
      return false;
    }
  }
  try {
    const data = await readRent();
    const r = data.find((i) => String(i.threadID) === String(tid));
    if (!r?.endDate) return true;
    const end = moment.tz(String(r.endDate).trim(), "DD/MM/YYYY", "Asia/Ho_Chi_Minh");
    if (!end.isValid()) return true;
    return moment.tz("Asia/Ho_Chi_Minh").isAfter(end);
  } catch {
    return false;
  }
}
