import type {
  Command, ExtendedMessageEvent, FacebookClient, Logger
} from "@types";
import fs from "fs-extra";
import moment from "moment-timezone";
import path from "path";
import { findBestMatch } from "string-similarity";
import { ownerNoPrefixAllowed } from "../../../utils/admin";
import { escapeRegex } from "../../../utils/banned";
import { dataInit } from "../../../utils/data-init";
import coreLogger from "../../../utils/log";
import { readRent, rent } from "../../../utils/rent";
import type { ThreadData } from "../../database/thread-data";
import { HandlerDependencies, HandlerEventArgs } from "./types";

const fmt = (t: number) => moment(t).tz("Asia/Ho_Chi_Minh").format("HH:mm:ss | DD/MM/YYYY");

export const temp = async (
  client: FacebookClient,
  text: string,
  tid: string,
  mid?: string,
  ms: number = 15000,
  log: Logger = coreLogger
): Promise<void> => {
  try {
    client.sendMessage(text, tid, (err, info) => {
      if (err) {
        log.error?.(`Error sending temp message: ${err.message}`);
        return;
      }
      if (!info?.messageID) return;
      setTimeout(() => {
        client.unsendMessage(info.messageID as string, tid);
      }, ms);
    }, mid);
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    log.error?.(`Error sending temp message: ${error.message}`);
  }
};

const cmdErr = async (
  client: FacebookClient,
  cmd: Command,
  e: Error,
  tid: string,
  mid: string | undefined,
  log: Logger = coreLogger
) => {
  log.error?.(`Command ${cmd.name} error: ${e.message}`);
  await temp(client, `❎ Lỗi lệnh ${cmd.name}: ${e.message}`, tid, mid, undefined, log);
};

export const createOnCall = ({
  client,
  userData,
  threadData,
  main,
  antist,
  api,
  utils,
  logger: runtimeLogger,
}: HandlerDependencies) =>
  async ({ event, config, helpers }: HandlerEventArgs) => {
    const scopedLogger = runtimeLogger ?? coreLogger;
    const { reply, send, contact, react, unsend, edit } = helpers;
    const now = Date.now();

    const { body = "", senderID: s, threadID: t, messageID: mid, type } = event;
    const bodyStr = String(body);
    const sid = String(s);
    const tid = String(t);
    const { antiINBOX, PREFIX, ADMIN, OWNER, DevMode, adminOnly, adminbox } = config;
    const { cmds, cd } = main;

    const extEvent = event as ExtendedMessageEvent;
    const mentions = extEvent.mentions || {};
    const botIdCandidate = (client as unknown as { id?: string | number }).id;
    const botId = botIdCandidate !== undefined ? String(botIdCandidate) : "";
    const isBotMentioned =
      !!botId && Object.prototype.hasOwnProperty.call(mentions, botId);
    const botMentionNames = isBotMentioned ? [mentions[botId]] : [];

    const rawBotName = (config as Record<string, unknown>)["BOTNAME"];
    const botName = typeof rawBotName === "string" ? rawBotName : undefined;

    const stripBotMentions = (text: string): string => {
      let result = text;
      if (botName) {
        result = result.replace(
          new RegExp(`@?${escapeRegex(botName)}`, "gi"),
          " "
        );
      }
      if (botMentionNames.length) {
        for (const name of botMentionNames) {
          if (!name) continue;
          result = result.replace(
            new RegExp(`@?${escapeRegex(name)}`, "gi"),
            " "
          );
        }
      }
      return result.replace(/\s+/g, " ").trim();
    };

    await dataInit(main, event as ExtendedMessageEvent, threadData, userData);

    if (type === "message" && bodyStr?.startsWith && sid !== client.id) {
      const pre0 = await threadData.get(tid).then((d: ThreadData | null) => {
        const prefix = d?.data?.PREFIX || PREFIX;
        return typeof prefix === 'string' ? prefix : String(prefix || '');
      });
      const isOwnerCheck = Array.isArray(OWNER) ? OWNER.includes(sid) : String(OWNER) === sid;
      const isAdminCheck = Array.isArray(ADMIN) ? ADMIN.includes(sid) : false;

      if (bodyStr.startsWith(pre0) && !isOwnerCheck && !isAdminCheck) {
        const name = bodyStr.slice(pre0.length).trim().split(/\s+/)[0]?.toLowerCase();
        const data = await readRent();
        const r = data.find(rentItem => String(rentItem.threadID) === String(tid));

        if (name !== "callad") {
          if (!r) {
            return client.sendMessage("❎ Nhóm của bạn chưa thuê bot, liên hệ Admin để thuê bot", tid, mid);
          }
          const end = moment.tz(String(r.endDate).trim(), "DD/MM/YYYY", "Asia/Ho_Chi_Minh");
          const cur = moment.tz("Asia/Ho_Chi_Minh");
          if (end.isValid() && cur.isAfter(end)) {
            return client.sendMessage("⚠️ Nhóm của bạn đã hết hạn thuê bot, liên hệ Admin để gia hạn", tid, mid);
          }
        }
      }
    }

    if (await rent(tid, sid, client, config, event as ExtendedMessageEvent)) return;

    const [tr, ur] = await Promise.all([threadData.get(tid), userData.get(sid)]);
    const set = tr?.data || {};
    const settings = tr?.settings || {};
    const inf = tr?.threadInfo || {};

    const pre =
      (typeof set.PREFIX === "string" ? set.PREFIX : undefined) ||
      (typeof PREFIX === "string" ? PREFIX : String(PREFIX || ""));

    const prefixParts: string[] = [escapeRegex(pre)];
    if (botName) {
      prefixParts.push(escapeRegex(`@${botName}`), escapeRegex(botName));
    }
    if (botMentionNames.length) {
      for (const name of botMentionNames) {
        if (!name) continue;
        prefixParts.push(escapeRegex(name), escapeRegex(`@${name}`));
      }
    }

    const preRe = new RegExp(
      `^(<@!?${sid}>|${prefixParts.join("|")})\\s*`,
      "i"
    );

    const isOwner = Array.isArray(OWNER) ? OWNER.includes(sid) : String(OWNER) === sid;
    const isAdmin = Array.isArray(ADMIN) ? ADMIN.includes(sid) : false;
    const isTAdmin =
      (Array.isArray(inf.adminIDs)
        ? inf.adminIDs.some((a) => {
          if (typeof a === "string" || typeof a === "number") {
            return String(a) === sid;
          }
          if (a && typeof a === "object" && "id" in a) {
            return String((a as { id: string | number }).id) === sid;
          }
          return false;
        })
        : false) || false;
    const isBotAdmin = isOwner || isAdmin;
    const isGroup = event.isGroup || false;

    if (bodyStr.startsWith(pre)) {
      if (adminOnly && !isBotAdmin) {
        return client.sendMessage("⚠ Bot đang bảo trì !!!", tid, mid);
      }
      if ((adminbox as Record<string, boolean> | undefined)?.[tid] && !isBotAdmin && !isTAdmin && isGroup) {
        return client.sendMessage("[ WARNING ] - Chỉ quản trị viên nhóm mới dùng được bot!", tid, mid);
      }
    }

    if (bodyStr.startsWith(pre)) {
      const ub = ur?.banned;
      const tb = tr?.banned;

      // Check if banned is actually banned - handle all possible cases
      const isActuallyBanned = (banned: unknown): boolean => {
        // Handle null, undefined, false, 0, NaN, empty string
        if (banned === null || banned === undefined) return false;
        if (banned === false || banned === 0 || (typeof banned === 'number' && isNaN(banned))) return false;

        // Handle string cases
        if (typeof banned === 'string') {
          const trimmed = banned.trim();
          // Empty string or '{}' (with or without spaces) means not banned
          if (trimmed === '' || trimmed === '{}') return false;

          // Try to parse as JSON (banned is usually stored as JSON string in database)
          try {
            const parsed = JSON.parse(trimmed);
            // If parsed to null, empty object, or empty array, not banned
            if (parsed === null) return false;
            if (Array.isArray(parsed) && parsed.length === 0) return false;
            if (typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length === 0) {
              return false;
            }
            // If parsed to object with keys, it's banned
            if (typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
              return true;
            }
            // For other parsed types (string, number, boolean, array with items), not banned
            // because banned should be an object
            return false;
          } catch {
            // If not valid JSON, it's likely corrupted data or invalid format
            // Treat as not banned to avoid false positives
            return false;
          }
        }

        // Handle array - arrays are not valid banned format
        if (Array.isArray(banned)) return false;

        // Handle object cases
        if (typeof banned === 'object') {
          // Empty object means not banned
          const keys = Object.keys(banned);
          if (keys.length === 0) return false;

          // Object with keys means banned (even if values are null/undefined)
          // This matches the expected format: Record<string, { reason?: string; time?: number }>
          return true;
        }

        // For other types (boolean true, numbers > 0, etc.), consider as not banned
        // since banned should be an object or string
        return false;
      };

      const isU = isActuallyBanned(ub);
      const isT = isActuallyBanned(tb);

      if ((isU || isT || (antiINBOX === false && sid === tid)) && !isBotAdmin) {
        const info = isU ? ub : tb;
        const typ = isU ? "Bạn" : "Nhóm";
        const reason = (typeof info === 'object' && info !== null && 'reason' in info && typeof info.reason === 'string') ? info.reason : "Không rõ";
        const time = (typeof info === 'object' && info !== null && 'time' in info && typeof info.time === 'number') ? info.time : Date.now();
        return temp(
          client,
          `⩺ ${typ} bị mất quyền công dân\n⩺ Lý do: ${reason}\n⩺ Lúc: ${fmt(time)}\n⩺ Liên hệ Admin để unban`,
          tid,
          mid,
          undefined,
          scopedLogger
        );
      }
    }

    const bodyWithoutBotTag = stripBotMentions(bodyStr);

    if (bodyStr === pre || (isBotMentioned && !bodyWithoutBotTag)) {
      const arr = [
        `Ơiii bạn ơi (*´∀｀*) \nDùng ${pre}help để xem lệnh nha! 💕`,
        `Bạn đang tìm lệnh hả? (｡♥‿♥｡)\nGõ ${pre}help để xem nè! ✨`,
        `Hehe bạn cute ghê ~\nDùng ${pre}help để xem danh sách lệnh nha! 🌸`,
        `Mình có thể giúp gì cho bạn không? (◕‿◕✿)\nGõ ${pre}help để xem lệnh nè! 💝`,
        `Bạn muốn xem lệnh hả? (｡◕‿◕｡)\nDùng ${pre}help nha! 🎀`,
        `Chào bạn đáng yêu! ٩(◕‿◕｡)۶\nGõ ${pre}help để xem mình có thể làm gì nè! 🌟`,
      ];
      if (reply) {
        await reply({ body: arr[Math.floor(Math.random() * arr.length)] });
      }
      return;
    }

    let args: string[] = [];
    let inCmd = "";
    let cmd: Command | null = null;

    if (preRe.test(bodyStr)) {
      const m = bodyStr.match(preRe)?.[0] || "";
      const rawAfterPrefix = bodyStr.slice(m.length).trim();
      const cleanedAfterPrefix = rawAfterPrefix.replace(/^[,.:;-]+\s*/, "");
      args = cleanedAfterPrefix.trim().split(/\s+/);
      inCmd = args.shift()?.toLowerCase() || "";
      cmd =
        cmds.get(inCmd) ||
        [...cmds.values()].find((c: Command) => c.alias?.includes(inCmd)) ||
        null;
    } else {
      const parts = bodyStr.trim().split(/\s+/);
      inCmd = parts.shift()?.toLowerCase() || "";
      cmd =
        cmds.get(inCmd) ||
        [...cmds.values()].find((c: Command) => c.alias?.includes(inCmd)) ||
        null;

      const canNP =
        cmd && (cmd.prefix === false || ownerNoPrefixAllowed(cmd, config, isOwner));
      if (canNP || isBotMentioned) {
        args = parts;
        if (!isOwner) {
          if (adminOnly && !isBotAdmin) {
            return client.sendMessage("⚠ Bot đang bảo trì !!!", tid, mid);
          }
          if ((adminbox as Record<string, boolean> | undefined)?.[tid] && !isBotAdmin && !isTAdmin && isGroup) {
            return client.sendMessage("[ WARNING ] - Chỉ quản trị viên nhóm mới dùng được bot!", tid, mid);
          }
        }
      } else {
        cmd = null;
      }
    }

    if (!cmd) {
      if (!bodyStr.startsWith(pre)) return;

      const all = [...cmds.values()];
      const names: string[] = [];
      for (const c of all) {
        names.push(c.name);
        if (c.alias) names.push(...c.alias);
      }

      let sug = "";
      if (inCmd && names.length) {
        try {
          const r = findBestMatch(inCmd, names);
          sug = `\n💭 Có phải bạn muốn tìm lệnh: ${r.bestMatch.target}?`;
        } catch { }
      }

      return temp(client, `❎ Lệnh không tồn tại\n📝 Gõ ${pre}help để xem lệnh${sug}`, tid, mid, 30000, scopedLogger);
    }

    const bannedInfo = (set.bannedCommandsInfo || {}) as Record<string, { bannedBy: string; time: number }>;
    const bc = bannedInfo[cmd.name];
    if (bc && !isBotAdmin && sid !== bc.bannedBy) {
      const u = await userData.get(bc.bannedBy);
      const nm = u?.name || "Unknown";
      const role =
        Array.isArray(OWNER) && OWNER.includes(bc.bannedBy)
          ? "Chủ Bot"
          : Array.isArray(ADMIN) && ADMIN.includes(bc.bannedBy)
            ? "Admin Bot"
            : "Quản Trị Viên";

      return temp(client, `⚠️ Lệnh "${cmd.name}" bị cấm bởi ${role} ${nm} trong nhóm này`, tid, mid, undefined, scopedLogger);
    }

    const dis = path.join(process.cwd(), "storage/other/disable-command.json");
    if (await fs.pathExists(dis)) {
      try {
        const d = await fs.readJson(dis);
        if ((d[tid]?.commands?.[cmd.name] || (cmd.category && d[tid]?.categories?.[cmd.category])) && !isBotAdmin) {
          if (cmd.category && d[tid]?.categories?.[cmd.category]) {
            return client.sendMessage(`❎ Nhóm đã cấm category '${cmd.category}'`, tid, mid);
          }
          if (d[tid]?.commands?.[cmd.name]) {
            return client.sendMessage(`❎ Lệnh '${cmd.name}' đã bị cấm`, tid, mid);
          }
        }
      } catch { }
    }
    const perm = isOwner ? 3 : isAdmin ? 2 : isTAdmin ? 1 : 0;
    const commandRoles = (settings.commandRoles || {}) as Record<string, number>;
    const requiredRole = typeof commandRoles[cmd.name] === "number" ? commandRoles[cmd.name] : (cmd.role ?? 0);
    if (requiredRole > perm) {
      react("⛔");
      return temp(
        client,
        `📌 Lệnh ${cmd.name} yêu cầu quyền: ${["Thành viên", "Quản Trị Viên", "ADMIN BOT", "Chủ Bot"][requiredRole]}`,
        tid,
        mid,
        undefined,
        scopedLogger
      );
    }
    if (!cd.has(cmd.name)) {
      cd.set(cmd.name, new Map());
    }
    const ts = cd.get(cmd.name);
    if (!ts) {
      return;
    }
    const exp = (cmd.cd || 1) * 1000;
    const lastTime = ts.get(sid);
    if (lastTime !== undefined && now < lastTime + exp) {
      react("⏱️");
      return temp(client, "Thao tác quá nhanh, chậm lại!", tid, mid, undefined, scopedLogger);
    }
    try {
      await cmd.onCall?.({
        client,
        event: event as ExtendedMessageEvent,
        args,
        userData,
        threadData,
        permssion: perm,
        main,
        react,
        commandName: cmd.name,
        config,
        api,
        antist,
        utils: utils || {},
        logger: scopedLogger,
        contact,
        unsend,
        edit,
        send,
        reply,
      });
      ts.set(sid, now);
      if (DevMode) {
        scopedLogger?.info?.(`Lệnh ${cmd.name} chạy lúc ${fmt(now)} bởi ${sid} trong nhóm ${tid}, tốn: ${Date.now() - now}ms`);
      }
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      await cmdErr(client, cmd, error, tid, mid, scopedLogger);
    }
  };
