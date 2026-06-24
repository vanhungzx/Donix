"use strict";

import logger from "@log";
import type { Context, DefaultFuncs } from "../../request/formatters/helpers.js";
import { get } from "../../request/index.js";

/* ===================== Types ===================== */
type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [k: string]: Json };

type LsOp = [5, string, ...Json[]]; // [5, "opName", ...params]

type Payload = { step?: Json };

interface ContactInfo {
  id: string;
  name: string | null;
  avatar: string | null;
}

interface MemberInfo {
  id: string;
  name: string | null;
  avatar: string | null;
  displayName: string | null;
  roleLabel: string | null;
  joinTs: number | null;
}

interface GroupInfo {
  id: string;
  name: string | null;
  avatar: string | null;
  emoji: string | null;
  emojiUrl: string | null;
  inviteLink: string | null;
  createdText: string | null;
  unconnectedCount: number | null;
  lastActivity: string | null;
  themeFbid: string | null;
  settings: Record<string, Json> | null;
}

interface CreatorInfo {
  id: string | null;
  name: string;
  username: string;
  avatar: string | null;
  displayName: string | null;
}

export interface ParsedGroupResult {
  group: GroupInfo;
  creator: CreatorInfo;
  memberCount: number;
  unconnectedCount: number | null;
  members: MemberInfo[];
}

type ThreadInfoHtmlCallback = (
  err: Error | null,
  result?: ParsedGroupResult | null
) => void;

/* ===================== tiny utils ===================== */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isJson(v: unknown): v is Json {
  if (v === null) return true;
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (Array.isArray(v)) return v.every(isJson);
  if (isRecord(v)) return Object.values(v).every(isJson);
  return false;
}

function safeJsonParse(text: string): Json | null {
  try {
    const v: unknown = JSON.parse(text);
    return isJson(v) ? v : null;
  } catch {
    return null;
  }
}

function pickFirstString(
  arr: Json[],
  predicate: (s: string) => boolean
): string | null {
  for (const x of arr) {
    if (typeof x === "string" && predicate(x)) return x;
  }
  return null;
}

function cpLen(s: string): number {
  return Array.from(s).length;
}

/* ===================== Unicode decode ===================== */
function decodeUnicode(str: string): string {
  let result = str.replace(
    /\\u([dD][89a-fA-F][0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})/g,
    (m, high, low) => {
      try {
        const codePoint =
          0x10000 +
          ((parseInt(high, 16) - 0xd800) << 10) +
          (parseInt(low, 16) - 0xdc00);
        return String.fromCodePoint(codePoint);
      } catch {
        return m;
      }
    }
  );

  result = result.replace(/\\u([0-9a-fA-F]{4})/g, (m, code) => {
    const cp = parseInt(code, 16);
    if (cp >= 0xd800 && cp <= 0xdfff) return m;
    return String.fromCharCode(cp);
  });

  return result;
}

/* ===================== HTML/script extraction ===================== */
function stripJsPrefix(s: string): string {
  let t = s.trim();
  if (t.startsWith("for (;;);")) t = t.slice("for (;;);".length).trim();
  if (t.startsWith("ata-sjs>")) t = t.replace(/^ata-sjs>/, "").trim();
  t = t.replace(/^\s*;+/, "").trim();
  return t;
}

function findAllScriptContents(html: string): string[] {
  const out: string[] = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const content = (m[1] ?? "").trim();
    if (content) out.push(content);
  }
  return out;
}

function findPayloadStringsDeep(node: Json, out: string[] = []): string[] {
  if (typeof node === "string") {
    if (
      node.includes('"step"') &&
      (node.includes('{"step"') || node.includes('"step":'))
    ) {
      out.push(node);
    }
    return out;
  }
  if (Array.isArray(node)) {
    for (const it of node) findPayloadStringsDeep(it, out);
    return out;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, Json>;
    for (const k of Object.keys(obj)) findPayloadStringsDeep(obj[k], out);
  }
  return out;
}

function findPayloadStringsByRegex(rawScript: string): string[] {
  const out: string[] = [];
  const re = /"(\{[^"]*?"step"\s*:\s*\[[\s\S]*?\][\s\S]*?\})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawScript)) !== null) {
    const candidate = m[1];
    if (candidate && candidate.includes('"step"')) out.push(candidate);
  }
  return out;
}

function extractPayloadsFromHtmlString(html: string): {
  payloads: Payload[];
  creatorUsername: string;
} {
  const scripts = findAllScriptContents(html);

  const payloads: Payload[] = [];
  const seen = new Set<string>();

  for (const raw of scripts) {
    const cleaned = stripJsPrefix(raw);
    const asJson = safeJsonParse(cleaned);

    const candidates: string[] = asJson
      ? findPayloadStringsDeep(asJson, [])
      : findPayloadStringsByRegex(cleaned);

    for (const c of candidates) {
      const cc = stripJsPrefix(c);

      let objJson: Json | null = safeJsonParse(cc);

      if (!objJson && cc.includes('\\"step\\"')) {
        const unescaped = cc.replace(/\\"/g, '"');
        objJson = safeJsonParse(unescaped);
      }

      if (!objJson || typeof objJson !== "object" || Array.isArray(objJson))
        continue;

      const payload: Payload = objJson as unknown as Payload;
      if (!payload.step) continue;

      const sig = JSON.stringify(payload).slice(0, 300);
      if (seen.has(sig)) continue;
      seen.add(sig);

      payloads.push(payload);
    }
  }

  const usernameMatch = html.match(/@([a-zA-Z0-9.]+)(?=<)/);
  const creatorUsername = usernameMatch ? `@${usernameMatch[1]}` : "Unknown";

  return { payloads, creatorUsername };
}

/* ===================== Lightspeed parsing ===================== */
function iterOps(node: Json, out: LsOp[] = []): LsOp[] {
  if (!Array.isArray(node)) return out;

  if (node.length >= 2 && node[0] === 5 && typeof node[1] === "string") {
    const op = node as unknown as LsOp;
    out.push(op);
  }

  for (const it of node) iterOps(it, out);
  return out;
}

function has19(op: LsOp, value: string): boolean {
  const v = String(value);
  return op.some((p) => Array.isArray(p) && p[0] === 19 && String(p[1]) === v);
}

function isEmojiString(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (cpLen(t) !== 1) return false;
  if (/[A-Za-z0-9À-ỹ]/u.test(t)) return false;
  return true;
}

function isLikelyGroupName(s: string): boolean {
  const t = s.trim();
  if (t.length < 3) return false;
  if (t.startsWith("http")) return false;
  if (t.startsWith("Bạn:")) return false;

  if (/đã gửi/i.test(t)) return false;
  if (/tin nhắn thoại|tin nhắn hình ảnh|video|file|sticker/i.test(t))
    return false;

  if (/Bạn chưa kết nối với/i.test(t)) return false;
  if (/đã tạo nhóm này/i.test(t)) return false;

  if (t === "inbox" || t === "messenger_reply_reminder") return false;

  return true;
}

function normalizeUrl(s: string): string {
  return s.replace(/\\\//g, "/");
}

function pickGroupNameSmart(params: Json[]): string | null {
  const strs = params.filter((p): p is string => typeof p === "string");
  const idxBox = strs.findIndex((s) => s === "ab: .boxinfo");
  if (idxBox !== -1) {
    for (let i = idxBox + 1; i < strs.length; i++) {
      const s = strs[i];
      if (!s) continue;
      if (s.startsWith("ab:")) continue;
      if (s.startsWith("http")) continue;
      if (!isLikelyGroupName(s)) continue;
      return decodeUnicode(s);
    }
  }

  let best: string | null = null;
  let bestScore = -1;

  for (const s of strs) {
    const t = s.trim();
    if (!t) continue;
    if (t.startsWith("ab:")) continue;
    if (t.startsWith("http")) continue;
    if (t.startsWith("{") && t.includes("theme_fbid")) continue;
    if (!isLikelyGroupName(t)) continue;

    let score = 0;
    score += Math.min(20, t.length);
    if (/\s/.test(t)) score += 5;
    if (/[A-Za-zÀ-ỹ]/u.test(t)) score += 2;
    if (/đã gửi|tin nhắn|sticker|video|file/i.test(t)) score -= 50;

    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  return best ? decodeUnicode(best) : null;
}

function buildContactMap(ops: LsOp[]): Map<string, ContactInfo> {
  const map = new Map<string, ContactInfo>();

  for (const op of ops) {
    if (op[1] !== "verifyContactRowExists") continue;
    const params = op.slice(2);

    const uidParam = params.find((p) => Array.isArray(p) && p[0] === 19) as
      | Json[]
      | undefined;
    if (!uidParam || !Array.isArray(uidParam) || uidParam.length < 2) continue;
    const uid = String(uidParam[1]);

    const avatar = params.find(
      (p) =>
        typeof p === "string" &&
        p.includes("fbcdn.net") &&
        p.includes("https")
    );

    const name = params.find((p) => {
      if (typeof p !== "string") return false;
      const s = p.trim();
      if (!s || s.startsWith("http")) return false;
      if (s.includes("/")) return false;
      if (/^\d+$/.test(s)) return false;
      return s.length >= 2;
    });

    const old = map.get(uid);
    map.set(uid, {
      id: uid,
      name: old?.name ?? (typeof name === "string" ? decodeUnicode(name) : null),
      avatar:
        old?.avatar ??
        (typeof avatar === "string" ? normalizeUrl(avatar) : null),
    });
  }

  return map;
}

function extractParticipantIdFromAdd(op: LsOp, groupId: string): string | null {
  const params = op.slice(2);
  const g = String(groupId);

  const idxGroup = params.findIndex(
    (p) => Array.isArray(p) && p[0] === 19 && String(p[1]) === g
  );
  if (idxGroup === -1) return null;

  for (let i = idxGroup + 1; i < params.length; i++) {
    const p = params[i];
    if (Array.isArray(p) && p[0] === 19) {
      const v = String(p[1]);
      if (v !== "0") return v;
    }
  }
  return null;
}

function extractJoinTs(params: Json[], uid: string): number | null {
  const uidIdx = params.findIndex(
    (p) => Array.isArray(p) && p[0] === 19 && String(p[1]) === String(uid)
  );
  if (uidIdx === -1) return null;

  for (let i = uidIdx + 1; i < params.length; i++) {
    const p = params[i];
    if (Array.isArray(p) && p[0] === 19) {
      const v = String(p[1]);
      if (v !== "0" && v.length >= 11) return Number(v);
    }
  }
  return null;
}

function parseGroupFromPayload(
  payload: Payload,
  groupId: string,
  creatorUsername: string
): ParsedGroupResult | null {
  const ops = iterOps(payload.step ?? null);
  if (!ops.length) return null;

  const payloadStr = JSON.stringify(payload);
  if (!payloadStr.includes(groupId)) return null;

  const contact = buildContactMap(ops);

  const group: GroupInfo = {
    id: String(groupId),
    name: null,
    avatar: null,
    emoji: null,
    emojiUrl: null,
    inviteLink: null,
    createdText: null,
    unconnectedCount: null,
    lastActivity: null,
    themeFbid: null,
    settings: null,
  };

  const creator: CreatorInfo = {
    id: null,
    name: "Unknown",
    username: creatorUsername || "Unknown",
    avatar: null,
    displayName: null,
  };

  const threadOp = ops.find(
    (op) =>
      (op[1] === "deleteThenInsertThread" || op[1] === "updateOrInsertThread") &&
      has19(op, groupId)
  );

  if (threadOp) {
    const params = threadOp.slice(2);

    const nameCand = pickGroupNameSmart(params);
    if (nameCand) group.name = nameCand;

    const avatarRaw = pickFirstString(
      params,
      (s) => s.includes("fbcdn.net") && s.includes("https")
    );
    group.avatar = avatarRaw ? normalizeUrl(avatarRaw) : null;

    const emoji = params.find((x) => typeof x === "string" && isEmojiString(x));
    group.emoji = typeof emoji === "string" ? emoji : null;

    group.emojiUrl = pickFirstString(
      params,
      (s) =>
        s.startsWith("https://static.xx.fbcdn.net/images/emoji.php") ||
        s.includes("/images/emoji.php")
    );

    const createdText = pickFirstString(params, (s) => s.endsWith("đã tạo nhóm này"));
    group.createdText = createdText ? decodeUnicode(createdText) : null;

    const unconn = pickFirstString(
      params,
      (s) => s.includes("Bạn chưa kết nối với") && s.includes("thành viên")
    );
    if (unconn) {
      const m = unconn.match(/(\d+)\s+thành viên/);
      group.unconnectedCount = m ? Number(m[1]) : null;
    }

    const activity = pickFirstString(params, (s) => /đã gửi/i.test(s));
    group.lastActivity = activity ? decodeUnicode(activity) : null;

    const settingsStr = pickFirstString(
      params,
      (s) => s.startsWith("{") && s.includes("theme_fbid")
    );
    if (settingsStr) {
      try {
        const v: unknown = JSON.parse(settingsStr);
        if (isRecord(v)) {
          const rec: Record<string, Json> = {};
          for (const [k, val] of Object.entries(v)) if (isJson(val)) rec[k] = val;
          group.settings = rec;
          const tf = rec["theme_fbid"];
          group.themeFbid =
            typeof tf === "number" || typeof tf === "string" ? String(tf) : null;
        }
      } catch {
        // ignore
      }
    }
  }

  const addOps = ops.filter(
    (op) => op[1] === "addParticipantIdToGroupThread" && has19(op, groupId)
  );
  const members: MemberInfo[] = [];
  const seen = new Set<string>();

  for (const op of addOps) {
    const uid = extractParticipantIdFromAdd(op, groupId);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);

    const params = op.slice(2);

    const roleLabelRaw = params.find(
      (p) =>
        typeof p === "string" &&
        (p.includes("Người tạo nhóm") ||
          p.includes("Do bạn thêm") ||
          p.includes("đã thêm"))
    );
    const roleLabel =
      typeof roleLabelRaw === "string" ? decodeUnicode(roleLabelRaw) : null;

    const displayNameRaw = params.find((p) => {
      if (typeof p !== "string") return false;
      const s = p.trim();
      if (!s) return false;
      if (s.startsWith("http")) return false;
      if (s.includes("/")) return false;
      if (roleLabelRaw && s === roleLabelRaw) return false;
      if (/Người tạo nhóm|Do bạn thêm|đã thêm/i.test(s)) return false;
      return true;
    });
    const displayName =
      typeof displayNameRaw === "string" ? decodeUnicode(displayNameRaw) : null;

    const joinTs = extractJoinTs(params, uid);
    const c = contact.get(uid);

    const m: MemberInfo = {
      id: uid,
      name: c?.name ?? null,
      avatar: c?.avatar ?? null,
      displayName,
      roleLabel,
      joinTs,
    };

    members.push(m);

    if (!creator.id && (m.roleLabel ?? "").includes("Người tạo nhóm")) {
      creator.id = m.id;
      creator.displayName = m.displayName;
    }
  }

  if (creator.id) {
    const c = contact.get(creator.id);
    if (c?.name) creator.name = c.name;
    if (c?.avatar) creator.avatar = c.avatar;
  }

  if (!group.name) {
    const m = payloadStr.match(/"([^"]*[\u{1D400}-\u{1D7FF}][^"]*)"/u);
    if (m) group.name = decodeUnicode(m[1]);
  }

  return {
    group,
    creator,
    memberCount: members.length,
    unconnectedCount: group.unconnectedCount,
    members,
  };
}

export default function (
  _defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (
  threadID: string,
  callback?: ThreadInfoHtmlCallback
) => Promise<ParsedGroupResult | null> {
  return function threadInfoHtml(
    threadID: string,
    callback?: ThreadInfoHtmlCallback
  ): Promise<ParsedGroupResult | null> {
    const cb: ThreadInfoHtmlCallback =
      typeof callback === "function" ? callback : () => { };

    return (async (): Promise<ParsedGroupResult | null> => {
      try {
        if (!threadID) throw new Error("threadID is required");

        const url = `https://www.facebook.com/messages/t/${threadID}`;

        const res = await get(url, ctx.jar, {}, ctx.options, ctx, {});
        const data = (res as { data?: unknown }).data;
        const html = typeof data === "string" ? data : "";
        if (!html) throw new Error("Empty HTML from Messenger thread page");

        const { payloads, creatorUsername } = extractPayloadsFromHtmlString(html);

        let parsed: ParsedGroupResult | null = null;
        for (const p of payloads) {
          const g = parseGroupFromPayload(p, threadID, creatorUsername);
          if (g) {
            parsed = g;
            break;
          }
        }

        if (!parsed) {
          logger.warn(
            `threadInfoHtml: không tìm thấy dữ liệu nhóm cho threadID=${threadID}`
          );
        }

        cb(null, parsed);
        return parsed;
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        logger.error(`threadInfoHtml: failed for threadID=${threadID} | ${err.message}`);
        cb(err);
        throw err;
      }
    })();
  };
}
