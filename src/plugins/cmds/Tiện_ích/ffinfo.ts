"use strict";

import type { Command, CommandOnCallContext } from "@types";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

const LINE = "------------------------------";
const LINE2 = "------------------------------";

const RANK_ICON: Record<string, string> = {
  BRONZE: "🟫",
  SILVER: "🩶",
  GOLD: "🥇",
  PLATINUM: "🩵",
  DIAMOND: "💎",
  HEROIC: "🔥",
  GRANDMASTER: "👑",
  MASTER: "🏆",
  UNRANKED: "⬜"
};

function rankIcon(key: unknown): string {
  return RANK_ICON[String(key ?? "").toUpperCase()] || "🎖️";
}

const GENDER_MAP: Record<string, string> = {
  GENDERMALE: "♂️ Nam",
  GENDERFEMALE: "♀️ Nữ",
  GENDERNONE: "❓ Không xác định"
};

function primeLabel(level: unknown): string {
  const icons = ["", "⭐", "⭐⭐", "💫", "💫💫", "🌟", "🌟🌟", "✨", "✨✨"];
  const idx = typeof level === "number" ? level : Number(level ?? 0);
  return icons[idx] || "⭐";
}

type UnknownObject = Record<string, unknown>;
type ReplyPayload = { body: string; attachment?: NodeJS.ReadableStream | NodeJS.ReadableStream[] };
const MAX_REPLY_LEN = 1800;

function fmt(num: unknown): string {
  const n = typeof num === "string" ? Number.parseFloat(num) : num;
  return typeof n === "number" && !Number.isNaN(n) ? new Intl.NumberFormat("vi-VN").format(n) : String(num ?? 0);
}

function ts(stamp: unknown): string {
  if (!stamp || stamp === "0" || stamp === 0) return "N/A";
  try {
    return new Date(Number.parseInt(String(stamp), 10) * 1000).toLocaleString("vi-VN");
  } catch {
    return String(stamp);
  }
}

function tsDate(stamp: unknown): string {
  if (!stamp || stamp === "0" || stamp === 0) return "N/A";
  try {
    return new Date(Number.parseInt(String(stamp), 10) * 1000).toLocaleDateString("vi-VN");
  } catch {
    return String(stamp);
  }
}

function cleanKey(str: unknown, prefix: string): string {
  const input = String(str ?? "");
  return input.replace(new RegExp(`^${prefix}`, "i"), "") || input;
}

function getObj(input: unknown): UnknownObject {
  return typeof input === "object" && input !== null ? (input as UnknownObject) : {};
}

function getArr(input: unknown): UnknownObject[] {
  return Array.isArray(input) ? (input as UnknownObject[]) : [];
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function formatStatsData(stats: UnknownObject, indent = 0): string {
  let out = "";
  const pad = "  ".repeat(indent);
  for (const [k, v] of Object.entries(stats)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      out += `${pad}${k}:\n${formatStatsData(v as UnknownObject, indent + 1)}`;
    } else if (Array.isArray(v)) {
      out += `${pad}${k}: [${v.length} mục]\n`;
    } else {
      out += `${pad}${k}: ${typeof v === "number" ? fmt(v) : String(v)}\n`;
    }
  }
  return out;
}

type FFDeps = {
  getPlayerInfo: (server: string, uid: string, decode?: boolean, callSignSrc?: number) => Promise<UnknownObject | null>;
  searchAccount: (params: { server: string; keyword: string }) => Promise<unknown>;
  getPlayerStats: (params: { server: string; uid: string; gamemode: string; matchmode: string }) => Promise<UnknownObject>;
  getPlayerItems: (params: { server: string; uid: string }) => Promise<UnknownObject | null>;
  renderFreeFireStatsCanvas: (data: UnknownObject) => Buffer;
  mapPlayerStatsToCanvasData: (stats: UnknownObject, uid: string, server: string, matchmode?: string) => UnknownObject;
  renderFreeFireCSStatsCanvas: (data: UnknownObject) => Buffer;
  mapCSStatsToCanvasData: (stats: UnknownObject, uid: string, server: string, matchmode?: string) => UnknownObject;
};

let freeFireDepsPromise: Promise<FFDeps> | null = null;
const nodeRequire = createRequire(import.meta.url);

async function getFreeFireDeps(): Promise<FFDeps> {
  if (!freeFireDepsPromise) {
    freeFireDepsPromise = Promise.resolve().then(() => {
      const info = nodeRequire("../../../services/freefire-api/info/index.js") as Record<string, unknown>;
      const service = nodeRequire("../../../services/freefire-api/service.js") as Record<string, unknown>;
      const serviceDefault =
        typeof service.default === "object" && service.default !== null
          ? (service.default as Record<string, unknown>)
          : {};
      const canvas = nodeRequire("../../../services/freefire-api/freefireStatsCanvas.js") as Record<string, unknown>;

      const readFn = <T extends (...args: never[]) => unknown>(obj: Record<string, unknown>, key: string): T | null => {
        const val = obj[key];
        return typeof val === "function" ? (val as T) : null;
      };

      const getPlayerInfoFn = readFn<FFDeps["getPlayerInfo"]>(info, "getPlayerInfo");
      const searchAccountFn =
        readFn<FFDeps["searchAccount"]>(service, "searchAccount") ??
        readFn<FFDeps["searchAccount"]>(serviceDefault, "searchAccount");
      const getPlayerStatsFn =
        readFn<FFDeps["getPlayerStats"]>(service, "getPlayerStats") ??
        readFn<FFDeps["getPlayerStats"]>(serviceDefault, "getPlayerStats");
      const getPlayerItemsFn =
        readFn<FFDeps["getPlayerItems"]>(service, "getPlayerItems") ??
        readFn<FFDeps["getPlayerItems"]>(serviceDefault, "getPlayerItems");
      const renderBRFn = readFn<FFDeps["renderFreeFireStatsCanvas"]>(canvas, "renderFreeFireStatsCanvas");
      const mapBRFn = readFn<FFDeps["mapPlayerStatsToCanvasData"]>(canvas, "mapPlayerStatsToCanvasData");
      const renderCSFn = readFn<FFDeps["renderFreeFireCSStatsCanvas"]>(canvas, "renderFreeFireCSStatsCanvas");
      const mapCSFn = readFn<FFDeps["mapCSStatsToCanvasData"]>(canvas, "mapCSStatsToCanvasData");

      if (!getPlayerInfoFn || !searchAccountFn || !getPlayerStatsFn || !getPlayerItemsFn || !renderBRFn || !mapBRFn || !renderCSFn || !mapCSFn) {
        throw new Error("Không thể nạp đủ dependency Free Fire.");
      }

      return {
        getPlayerInfo: getPlayerInfoFn,
        searchAccount: searchAccountFn,
        getPlayerStats: getPlayerStatsFn,
        getPlayerItems: getPlayerItemsFn,
        renderFreeFireStatsCanvas: renderBRFn,
        mapPlayerStatsToCanvasData: mapBRFn,
        renderFreeFireCSStatsCanvas: renderCSFn,
        mapCSStatsToCanvasData: mapCSFn
      };
    });
  }
  return freeFireDepsPromise;
}

const ffinfoCommand: Command = {
  name: "ffinfo",
  alias: ["freefire", "ff", "ffplayer"],
  version: "2.0.0",
  role: 0,
  desc: "Tra cứu thông tin người chơi FreeFire – UID, rank, clan, stats, items",
  guide: [
    "{pn} <uid> [server]                          – Tra cứu thông tin player",
    "{pn} search <tên> [server]                   – Tìm kiếm player theo tên",
    "{pn} stats <uid> [server] [gamemode] [mode]  – Thống kê chi tiết",
    "{pn} items <uid> [server]                    – Xem trang bị đầy đủ",
    "",
    "📝 Server mặc định: VN | Gamemode: br / cs | Matchmode: CAREER / NORMAL / RANKED"
  ].join("\n"),
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { args, reply, react, logger } = ctx;
    logger?.info?.(`[ffinfo] onCall args=${JSON.stringify(args)}`);
    const doReply = async (payload: ReplyPayload): Promise<void> => {
      if (typeof reply === "function") {
        await withTimeout(reply(payload as never), 12000, "reply");
      }
    };

    const doReact = async (emoji: string): Promise<void> => {
      if (typeof react === "function") {
        await react(emoji);
      }
    };

    const action = args[0]?.toLowerCase();

    const splitMessage = (body: string, maxLen = MAX_REPLY_LEN): string[] => {
      if (body.length <= maxLen) return [body];
      const lines = body.split("\n");
      const chunks: string[] = [];
      let current = "";
      for (const line of lines) {
        const next = current ? `${current}\n${line}` : line;
        if (next.length <= maxLen) {
          current = next;
          continue;
        }
        if (current) chunks.push(current);
        if (line.length <= maxLen) {
          current = line;
          continue;
        }
        let start = 0;
        while (start < line.length) {
          const part = line.slice(start, start + maxLen);
          chunks.push(part);
          start += maxLen;
        }
        current = "";
      }
      if (current) chunks.push(current);
      return chunks;
    };

    const safeReply = async (body: string): Promise<void> => {
      const chunks = splitMessage(body);
      logger?.info?.(`[ffinfo] safeReply chunks=${chunks.length} totalLen=${body.length}`);
      for (let i = 0; i < chunks.length; i += 1) {
        const prefix = chunks.length > 1 ? `[${i + 1}/${chunks.length}]\n` : "";
        logger?.info?.(`[ffinfo] safeReply sending chunk=${i + 1}/${chunks.length} len=${chunks[i].length}`);
        void doReply({ body: `${prefix}${chunks[i]}` })
          .then(() => logger?.info?.(`[ffinfo] safeReply sent chunk=${i + 1}/${chunks.length}`))
          .catch((error: unknown) => {
            const msg = error instanceof Error ? error.message : String(error);
            logger?.warn?.(`[ffinfo] safeReply failed chunk=${i + 1}/${chunks.length}: ${msg}`);
          });
      }
    };

    if (!action || action === "help") {
      logger?.info?.("[ffinfo] branch=help");
      await safeReply(
        `🔥 FREE FIRE INFO — HƯỚNG DẪN\n${LINE}\n` +
        `🔹 {pn} <uid> [server]             – Hồ sơ đầy đủ\n` +
        `🔹 {pn} search <tên> [server]      – Tìm kiếm\n` +
        `🔹 {pn} stats <uid> [sv] [gm] [mm] – Thống kê\n` +
        `🔹 {pn} items <uid> [server]        – Trang bị\n` +
        `${LINE}\n` +
        `🌍 Server: VN IND SG TH ID TW US BR PK ME CIS RU\n` +
        `🎮 Gamemode: br | cs\n` +
        `🏆 Matchmode: CAREER | NORMAL | RANKED`
      );
      return;
    }

    try {
      logger?.info?.("[ffinfo] loading dependencies...");
      const deps = await getFreeFireDeps();
      logger?.info?.("[ffinfo] dependencies loaded");

      if (action === "search") {
        logger?.info?.("[ffinfo] branch=search");
        const keyword = args[1];
        const server = (args[2] || "VN").toUpperCase();
        if (!keyword) return await safeReply("❌ Nhập tên cần tìm!\n📝 Ví dụ: {pn} search ProPlayer VN");
        if (keyword.length < 3) return await safeReply("❌ Tên phải có ít nhất 3 ký tự!");

        await doReact("⏳");

        const rawRes = await deps.searchAccount({ server, keyword });
        const res = getObj(rawRes);
        const directAccounts = Array.isArray(rawRes) ? (rawRes as UnknownObject[]) : [];
        if (Object.keys(res).length === 0 && directAccounts.length === 0) {
          return await safeReply(`❌ Không tìm thấy "${keyword}" trên server ${server}`);
        }

        const accountsRaw = directAccounts.length > 0 ? directAccounts : (res.accounts ?? res.accountList);
        const accounts = Array.isArray(accountsRaw) ? accountsRaw : [];
        let msg = `🔍 TÌM KIẾM: "${keyword}"\n🌍 Server: ${server}\n${LINE}\n`;
        if (accounts.length > 0) {
          accounts.slice(0, 10).forEach((acc, i) => {
            msg += `${i + 1}. 👤 ${String(acc.nickname ?? acc.name ?? "N/A")}\n`;
            msg += `   🆔 UID: ${String(acc.accountid ?? acc.uid ?? "N/A")}\n`;
            if (acc.level != null) msg += `   📊 Level: ${fmt(acc.level)}\n`;
            if (acc.rank != null) msg += `   🏆 Rank: ${String(acc.rank)}\n`;
            msg += "\n";
          });
          if (accounts.length > 10) msg += `⚠️ Hiển thị 10/${accounts.length} kết quả`;
        } else {
          msg += JSON.stringify(res, null, 2);
        }
        await doReact("✅");
        return await safeReply(msg);
      }

      if (action === "stats") {
        logger?.info?.("[ffinfo] branch=stats");
        const uid = args[1];
        const server = (args[2] || "VN").toUpperCase();
        const gamemode = (args[3] || "br").toLowerCase();
        const matchmode = (args[4] || "CAREER").toUpperCase();

        if (!uid) return await safeReply("❌ Nhập UID!\n📝 Ví dụ: {pn} stats 3301447047 VN br CAREER");
        if (!/^\d+$/.test(uid)) return await safeReply("❌ UID phải là số!");

        await doReact("⏳");
        await safeReply(`⏳ Đang lấy thống kê [${gamemode.toUpperCase()}/${matchmode}] cho UID ${uid}…`);

        const statsResult = getObj(await deps.getPlayerStats({ server, uid, gamemode, matchmode }));
        if (!statsResult.success) return await safeReply(`❌ Không thể lấy thống kê UID ${uid}`);

        const stats = getObj(statsResult.data);
        const metadata = getObj(statsResult.metadata);

        if (gamemode === "br" && matchmode === "CAREER" && Object.keys(stats).length > 0) {
          let tmp = "";
          try {
            const buf = deps.renderFreeFireStatsCanvas(deps.mapPlayerStatsToCanvasData(stats, uid, server, matchmode));
            const dir = path.join(process.cwd(), "temp");
            await fs.promises.mkdir(dir, { recursive: true });
            tmp = path.join(dir, `ffstats_br_${uid}_${Date.now()}.png`);
            await fs.promises.writeFile(tmp, buf);
            await doReply({ body: `📊 Thống kê BR CAREER — UID ${uid} | ${server}`, attachment: fs.createReadStream(tmp) });
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            await safeReply(`❌ Lỗi render ảnh: ${msg}`);
          } finally {
            if (tmp) void fs.promises.unlink(tmp).catch(() => undefined);
          }
          await doReact("✅");
          return;
        }

        if (gamemode === "cs" && matchmode === "CAREER" && (stats.csstats || stats.csStats)) {
          let tmp = "";
          try {
            const buf = deps.renderFreeFireCSStatsCanvas(deps.mapCSStatsToCanvasData(stats, uid, server, matchmode));
            const dir = path.join(process.cwd(), "temp");
            await fs.promises.mkdir(dir, { recursive: true });
            tmp = path.join(dir, `ffstats_cs_${uid}_${Date.now()}.png`);
            await fs.promises.writeFile(tmp, buf);
            await doReply({ body: `📊 Thống kê CS CAREER — UID ${uid} | ${server}`, attachment: fs.createReadStream(tmp) });
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            await safeReply(`❌ Lỗi render ảnh CS: ${msg}`);
          } finally {
            if (tmp) void fs.promises.unlink(tmp).catch(() => undefined);
          }
          await doReact("✅");
          return;
        }

        let msg = `📊 THỐNG KÊ FREE FIRE\n${LINE}\n`;
        msg += `🆔 UID: ${String(metadata.uid ?? uid)}\n`;
        msg += `🌍 Server: ${String(metadata.server ?? server)}\n`;
        msg += `🎮 Mode: ${String(metadata.gamemode ?? gamemode).toUpperCase()} / ${String(metadata.matchmode ?? matchmode)}\n`;
        msg += `${LINE}\n`;
        msg += Object.keys(stats).length > 0 ? formatStatsData(stats) : "⚠️ Không có dữ liệu";
        await doReact("✅");
        return await safeReply(msg);
      }

      if (action === "items") {
        logger?.info?.("[ffinfo] branch=items");
        const uid = args[1];
        const server = (args[2] || "VN").toUpperCase();

        if (!uid) return await safeReply("❌ Nhập UID!\n📝 Ví dụ: {pn} items 3301447047 VN");
        if (!/^\d+$/.test(uid)) return await safeReply("❌ UID phải là số!");

        await doReact("⏳");
        await safeReply(`⏳ Đang lấy items của UID ${uid}…`);

        const res = getObj(await deps.getPlayerItems({ server, uid }));
        if (Object.keys(res).length === 0) return await safeReply(`❌ Không lấy được items UID ${uid}`);

        const bi = getObj(res.basic_info);
        const items = getObj(res.items);
        const outfit = getArr(items.outfit);
        const weapons = getArr(getObj(items.weapons).shown_skins);
        const skills = getArr(getObj(items.skills).equipped);
        const pet = getObj(items.pet);

        const named = (arr: UnknownObject[]): UnknownObject[] => arr.filter((i) => i.name && i.name !== "Unknown Item");

        let msg = `🎮 TRANG BỊ FREE FIRE\n${LINE}\n`;
        msg += `🆔 UID: ${uid}  🌍 ${server}\n`;
        if (bi.nickname) msg += `👤 ${String(bi.nickname)}  📊 Lv.${String(bi.level ?? "?")}\n`;
        msg += `${LINE}\n`;

        if (named(outfit).length) {
          msg += "👕 OUTFIT\n";
          named(outfit).forEach((o, i) => {
            msg += `  ${i + 1}. ${String(o.name)}${o.rarity && o.rarity !== "NONE" ? ` [${String(o.rarity)}]` : ""}\n`;
          });
          msg += `${LINE2}\n`;
        }
        if (named(weapons).length) {
          msg += "🔫 VŨ KHÍ\n";
          named(weapons).forEach((w, i) => {
            msg += `  ${i + 1}. ${String(w.name)}${w.rarity && w.rarity !== "NONE" ? ` [${String(w.rarity)}]` : ""}\n`;
          });
          msg += `${LINE2}\n`;
        }
        if (named(skills).length) {
          msg += "⚡ KỸ NĂNG\n";
          named(skills).forEach((s, i) => {
            msg += `  ${i + 1}. ${String(s.name)}${s.rarity && s.rarity !== "NONE" ? ` [${String(s.rarity)}]` : ""}\n`;
          });
          msg += `${LINE2}\n`;
        }
        if (Object.keys(pet).length > 0) {
          const petItem = getObj(pet.pet_item);
          const skinItem = getObj(pet.skin_item);
          msg += "🐾 PET\n";
          if (petItem.name && petItem.name !== "Unknown Item") msg += `  • Loài: ${String(petItem.name)}\n`;
          if (pet.name) msg += `  • Tên: ${String(pet.name)}\n`;
          msg += `  • Level: ${String(pet.level ?? "N/A")}  EXP: ${fmt(pet.exp ?? 0)}\n`;
          if (skinItem.name && skinItem.name !== "Unknown Item") msg += `  • Skin: ${String(skinItem.name)}\n`;
          if (pet.selected_skill_id && pet.selected_skill_id !== 0) msg += `  • Skill ID: ${String(pet.selected_skill_id)}\n`;
        }

        if (!named(outfit).length && !named(weapons).length && !named(skills).length && Object.keys(pet).length === 0) {
          msg += "⚠️ Không có items nào";
        }

        await doReact("✅");
        return await safeReply(msg);
      }

      logger?.info?.("[ffinfo] branch=profile");
      const uid = args[0];
      const server = (args[1] || "VN").toUpperCase();

      if (!uid) return await safeReply('❌ Nhập UID hoặc dùng "{pn} help" để xem hướng dẫn!');
      if (!/^\d+$/.test(uid)) return await safeReply("❌ UID phải là số!\n📝 Ví dụ: {pn} 3301447047");

      logger?.info?.(`[ffinfo] profile: preparing request uid=${uid} server=${server}`);
      void doReact("⏳");
      try {
        void safeReply(`⏳ Đang tra cứu UID ${uid} — server ${server}…`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger?.warn?.(`[ffinfo] preload reply failed: ${msg}`);
      }

      logger?.info?.("[ffinfo] profile: calling getPlayerInfo");
      const p = getObj(await withTimeout(deps.getPlayerInfo(server, uid, false, 7), 20000, "getPlayerInfo"));
      logger?.info?.(`[ffinfo] profile: getPlayerInfo done keys=${Object.keys(p).length}`);
      if (Object.keys(p).length === 0) return await safeReply(`❌ Không tìm thấy UID ${uid} trên server ${server}`);

      const bi = getObj(p.basic_info);
      const ext = getObj(p.extended_info);
      const rank = getObj(p.rank_info);
      const eq = getObj(p.equipped_items);
      const soc = getObj(p.social_info);
      const clan = getObj(p.clan_basic_info);
      const cap = getObj(p.captain_basic_info);
      const pet = getObj(p.pet_info);
      const cr = getObj(p.credit_score_info);
      const pri = getObj(p.prime_info);
      const vet = getObj(p.veteran_info);
      const hist = getArr(p.history_ep_info);
      const mmr = getArr(p.mmr_list);
      const lb = getObj(p.leaderboard_titles);
      const ms = getObj(p.mode_stats_summary);
      const news = getArr(p.news);

      let msg = "====== 👤 FULL PROFILE 👤 ======\n";

      msg += `🆔 UID: ${String(bi.account_id ?? uid)}\n`;
      msg += `👤 Name: ${String(bi.nickname ?? "N/A")}\n`;
      msg += `🆙 Level: ${String(bi.level ?? "N/A")} (Exp: ${fmt(bi.exp ?? 0)})\n`;
      msg += `🌍 Region: ${String(bi.region ?? server)}  👍 Likes: ${fmt(bi.liked ?? 0)}\n`;
      if (bi.created_at) msg += `📅 Tạo: ${tsDate(bi.created_at)}\n`;
      if (bi.last_login_at) msg += `🕐 Đăng nhập cuối: ${ts(bi.last_login_at)}\n`;
      if (soc.signature && soc.signature !== ".....") msg += `📝 Bio: ${String(soc.signature)}\n`;

      const gender = GENDER_MAP[String(soc.gender ?? "").toUpperCase()] || "";
      if (gender) msg += `${gender.startsWith("♂") ? "🔵" : "🔴"} Giới tính: ${gender}\n`;
      if (soc.language) msg += `🗣️ Ngôn ngữ: ${cleanKey(soc.language, "LANGUAGE")}\n`;
      msg += `${LINE}\n`;

      msg += "🏆 [ XẾP HẠNG ]\n";
      const br = getObj(rank.br);
      if (br.show !== false) {
        msg += `${rankIcon(br.rank_key)} BR: ${String(br.full_label ?? br.tier_name ?? "N/A")}\n`;
        if (br.points != null) msg += `   • Điểm: ${fmt(br.points)}\n`;
        if (br.current_stars != null) msg += `   • Sao: ${fmt(br.current_stars)}${br.max_stars != null ? `/${fmt(br.max_stars)}` : ""}\n`;
        if (ext.peak_rank_pos != null && Number(ext.peak_rank_pos) > 0) msg += `   • Đỉnh mùa: Top ${fmt(ext.peak_rank_pos)}\n`;
      }

      const cs = getObj(rank.cs);
      if (cs.show !== false) {
        if (cs.is_ban) {
          msg += "🚫 CS: Đang bị cấm xếp hạng\n";
        } else {
          msg += `${rankIcon(cs.rank_key)} CS: ${String(cs.full_label ?? cs.tier_name ?? "N/A")}\n`;
          if (cs.points != null) msg += `   • Điểm: ${fmt(cs.points)}\n`;
          if (cs.current_stars != null) msg += `   • Sao: ${fmt(cs.current_stars)}\n`;
          if (ext.cs_peak_rank_pos != null && Number(ext.cs_peak_rank_pos) > 0) msg += `   • Đỉnh CS: Top ${fmt(ext.cs_peak_rank_pos)}\n`;
          if (ext.cs_peak_tournament_rank_pos != null && Number(ext.cs_peak_tournament_rank_pos) > 0) {
            msg += `   • Đỉnh Giải đấu: Top ${fmt(ext.cs_peak_tournament_rank_pos)}\n`;
          }
        }
      }

      const hippo = getObj(rank.hippo);
      if (ext.show_hippo_rank && hippo.full_label) {
        msg += `🐺 Lone Wolf: ${String(hippo.full_label)}\n`;
        if (hippo.points != null) msg += `   • Điểm: ${fmt(hippo.points)}\n`;
        const hippoPeak = getObj(hippo.peak);
        if (hippoPeak.full_label) msg += `   • Đỉnh: ${String(hippoPeak.full_label)}\n`;
      }

      if (ms.reached_heroic_count != null) msg += `🔥 Đạt Heroic: ${fmt(ms.reached_heroic_count)} lần\n`;
      if (ms.max_score != null) msg += `📈 Điểm cao nhất: ${fmt(ms.max_score)}\n`;
      msg += `${LINE}\n`;

      const outfitList = getArr(eq.outfit);
      const skillList = getArr(eq.skills);
      const namedOutfit = outfitList.filter((o) => o.name && o.name !== "Unknown Item");
      const namedSkills = skillList.filter((s) => s.name && s.name !== "Unknown Item");

      if (namedOutfit.length || namedSkills.length || eq.is_star || eq.is_awaken || eq.avatar_id != null) {
        msg += "🎭 [ TRANG BỊ ]\n";
        if (eq.avatar_id != null) msg += `  • Avatar ID: ${fmt(eq.avatar_id)}\n`;
        if (eq.skin_color != null) msg += `  • Màu da: ${fmt(eq.skin_color)}\n`;
        if (eq.is_awaken === true) msg += "  • Nhân vật thức tỉnh: ✅\n";
        if (eq.is_star === true) msg += "  • Đánh dấu sao: ⭐\n";
        if (namedOutfit.length) msg += `  • Trang phục: ${namedOutfit.map((o) => String(o.name)).join(" | ")}\n`;
        if (namedSkills.length) msg += `  • Kỹ năng: ${namedSkills.map((s) => String(s.name)).join(" | ")}\n`;
        const pveWeapon = getObj(eq.pve_weapon);
        if (pveWeapon.name && pveWeapon.name !== "Unknown Item") msg += `  • Vũ khí PvE: ${String(pveWeapon.name)}\n`;
        msg += `${LINE}\n`;
      }

      if (clan.clan_name) {
        msg += "🛡️ [ CLAN INFO ]\n";
        msg += `  • Tên: ${String(clan.clan_name)} (Lv.${fmt(clan.clan_level ?? "?")})\n`;
        msg += `  • ID: ${String(clan.clan_id ?? "N/A")}\n`;
        if (cap.nickname) {
          msg += `  • Đội trưởng: ${String(cap.nickname)}`;
          if (cap.level) msg += ` (Lv.${fmt(cap.level)})`;
          if (cap.liked) msg += `  👍 ${fmt(cap.liked)}`;
          msg += "\n";
        } else if (clan.captain_id) {
          msg += `  • Đội trưởng UID: ${fmt(clan.captain_id)}\n`;
        }
        msg += `  • Thành viên: ${fmt(clan.member_num ?? "?")}/${fmt(clan.capacity ?? "?")}\n`;
        if (clan.honor_point != null) msg += `  • Điểm danh dự: ${fmt(clan.honor_point)}\n`;
        msg += `${LINE}\n`;
      }

      if (pet.id || pet.pet_item) {
        msg += "🐾 [ PET ]\n";
        const petItem = getObj(pet.pet_item);
        if (petItem.name && petItem.name !== "Unknown Item") msg += `  • Loài: ${String(petItem.name)}\n`;
        if (pet.name) msg += `  • Tên: ${String(pet.name)}\n`;
        msg += `  • Level: ${String(pet.level ?? "N/A")}  EXP: ${fmt(pet.exp ?? 0)}\n`;
        const skinItem = getObj(pet.skin_item);
        if (skinItem.name && skinItem.name !== "Unknown Item") msg += `  • Skin: ${String(skinItem.name)}\n`;
        if (pet.selected_skill_id && pet.selected_skill_id !== 0) msg += `  • Skill ID: ${String(pet.selected_skill_id)}\n`;
        if (pet.is_marked_star) msg += "  • ⭐ Đánh dấu sao\n";
        msg += `${LINE}\n`;
      }

      if (soc.rank_show && soc.rank_show !== "RANKSHOWNONE") {
        msg += `👁️ Hiển thị rank: ${cleanKey(soc.rank_show, "RANKSHOW")}\n`;
      }
      if (soc.time_online && soc.time_online !== "TIMEONLINENONE") {
        msg += `🟢 Trạng thái online: ${cleanKey(soc.time_online, "TIMEONLINE")}\n`;
      }

      if (mmr.length > 0) {
        msg += `${LINE}\n📊 [ MMR ]\n`;
        mmr.forEach((m) => {
          if (m.mode && m.mmr !== undefined) {
            msg += `  • ${String(m.mode)}: ${fmt(m.mmr)}`;
            if (m.streak_wins) msg += `  🔥${fmt(m.streak_wins)} streak`;
            msg += "\n";
          }
        });
      }

      const lbWeaponPower = getArr(lb.weapon_power);
      const lbGuildWar = getArr(lb.guild_war);
      const lbRanking = getArr(lb.ranking);
      const lbCsPeak = getArr(lb.cs_peak);
      const lbAny = lbWeaponPower.length + lbGuildWar.length + lbRanking.length + lbCsPeak.length;
      if (lbAny > 0) {
        msg += `${LINE}\n🏅 [ DANH HIỆU LEADERBOARD ]\n`;
        if (lbWeaponPower.length) msg += `  • Sức mạnh vũ khí: ${lbWeaponPower.length} danh hiệu\n`;
        if (lbGuildWar.length) msg += `  • Guild War: ${lbGuildWar.length} danh hiệu\n`;
        if (lbRanking.length) msg += `  • Ranking: ${lbRanking.length} danh hiệu\n`;
        if (lbCsPeak.length) msg += `  • CS Đỉnh: ${lbCsPeak.length} danh hiệu\n`;
      }
      if (p.ranking_leaderboard_pos != null && Number(p.ranking_leaderboard_pos) > 0) {
        msg += `  • Vị trí toàn server: Top ${fmt(p.ranking_leaderboard_pos)}\n`;
      }

      if (hist.length > 0) {
        msg += `${LINE}\n🎟️ [ ELITE PASS ] (${hist.length} mùa)\n`;
        hist.slice(0, 8).forEach((ep) => {
          const owned = ep.owned_pass === true;
          const icon = owned ? "✅" : "⬜";
          const epLabel = ep.ep_event_id != null ? `Mùa ${fmt(ep.ep_event_id)}` : String(ep.event_name ?? "N/A");
          const ml = ep.max_level && Number(ep.max_level) > 0 ? `/${fmt(ep.max_level)}` : "";
          msg += `  ${icon} ${epLabel}: ${fmt(ep.badge_count ?? 0)}${ml} huy hiệu`;
          if (!owned) msg += " (Free)";
          msg += "\n";
        });
        if (hist.length > 8) msg += `  … và ${hist.length - 8} mùa khác\n`;
        const ownedCount = hist.filter((e) => e.owned_pass).length;
        msg += `  📌 Tổng Elite Pass đã mua: ${ownedCount}/${hist.length} mùa\n`;
      }

      msg += `${LINE}\n📌 [ MỞ RỘNG ]\n`;
      msg += `  • Mùa hiện tại: ${String(ext.season_id ?? "N/A")}\n`;
      msg += `  • Elite Pass: ${ext.has_elite_pass ? "✅ Đang có" : "❌ Không có"}\n`;
      msg += `  • Huy hiệu: ${String(ext.badge_count ?? "N/A")}\n`;
      if (ext.is_prime_member) msg += "  • Prime Member: ✅\n";

      if (pri.is_prime) {
        msg += `${LINE}\n⭐ [ PRIME ]\n`;
        msg += `  • Cấp: ${String(pri.prime_level_label ?? `Prime ${String(pri.prime_level ?? 0)}`)}  ${primeLabel(pri.prime_level)}\n`;
      }

      if (cr.score !== undefined) {
        msg += `${LINE}\n✅ [ UY TÍN ]\n`;
        msg += `  • Điểm: ${fmt(cr.score)}/100\n`;
        const lvMap: Record<number, string> = { 0: "Chưa xếp", 1: "A", 2: "B", 3: "C", 4: "D" };
        if (typeof cr.summary_level === "number" && cr.summary_level <= 4) msg += `  • Xếp hạng: ${lvMap[cr.summary_level]}\n`;
        if (cr.reward_state) msg += `  • Thưởng: ${cleanKey(cr.reward_state, "REWARDSTATE")}\n`;
        msg += `  • Like / Vi phạm (kỳ): ${fmt(cr.periodic_likes ?? 0)} / ${fmt(cr.periodic_illegal ?? 0)}\n`;
        msg += `  • Số trận tuần: ${fmt(cr.weekly_match_count ?? 0)}\n`;
      }

      const preVet = p.pre_veteran_type ?? vet.pre_veteran_type;
      const preVetStr = typeof preVet === "string" ? preVet : String(preVet ?? "");
      if (preVetStr && preVetStr !== "PREVETERANACTIONTYPENONE" && preVet !== 0) {
        const vetMap: Record<string, string> = {
          PREVETERANACTIONTYPENONE: "Không",
          PREVETERANACTIONTYPEACTIVITY: "Tham gia sự kiện cựu thủ",
          PREVETERANACTIONTYPEBUFF: "Đang có buff cựu thủ"
        };
        msg += `${LINE}\n🎖️ [ CỰU THỦ ]\n`;
        msg += `  • Trạng thái: ${vetMap[preVetStr] || preVetStr}\n`;
        if (vet.veteran_leave_days_tag && Number(vet.veteran_leave_days_tag) > 0) msg += `  • Số ngày nghỉ: ${fmt(vet.veteran_leave_days_tag)}\n`;
        if (vet.return_at && Number(vet.return_at) > 0) msg += `  • Ngày trở về: ${tsDate(vet.return_at)}\n`;
      }

      if (news.length > 0) {
        msg += `${LINE}\n📰 [ HOẠT ĐỘNG GẦN ĐÂY ]\n`;
        news.slice(0, 3).forEach((n) => {
          const c = getObj(n.content);
          msg += `  • ${String(n.type ?? "Sự kiện")}`;
          if (c.rank) msg += ` — Rank: ${String(c.rank)}`;
          if (c.gamemode) msg += ` — ${String(c.gamemode)}`;
          if (n.update_time) msg += ` (${ts(n.update_time)})`;
          msg += "\n";
        });
        if (news.length > 3) msg += `  … và ${news.length - 3} tin khác\n`;
      }

      if (p.diamond_cost != null && Number(p.diamond_cost) > 0) {
        msg += `${LINE}\n💎 Chi phí kim cương (ước tính): ${fmt(p.diamond_cost)}\n`;
      }

      msg += `${LINE}\n`;
      msg += `💡 {pn} stats ${uid} ${server} br CAREER\n`;
      msg += `💡 {pn} stats ${uid} ${server} cs CAREER\n`;
      msg += `💡 {pn} items ${uid} ${server}`;

      logger?.info?.(`[ffinfo] profile: final message len=${msg.length}`);
      void doReact("✅");
      logger?.info?.("[ffinfo] profile: sending final reply");
      void safeReply(msg);
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logger?.error?.(`[ffinfo] ${message}${stack ? ` | ${stack}` : ""}`);
      return await safeReply(`❌ Lỗi: ${message}`);
    }
  }
};

export default ffinfoCommand;

