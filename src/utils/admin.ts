"use strict";
import type { BotConfig, Command, FacebookClient, ThreadDataModel } from "@types";

export async function checkAdminBox(
  client: FacebookClient,
  tid: string,
  sid: string,
  cfg: BotConfig,
  threadData: ThreadDataModel
): Promise<boolean> {
  try {

    const isOwner = Array.isArray(cfg.OWNER) ? cfg.OWNER.includes(sid) : String(cfg.OWNER) === sid;
    const isAdmin = Array.isArray(cfg.ADMIN) ? cfg.ADMIN.includes(sid) : false;
    if (sid === client.id || isOwner || isAdmin) return false;
    if (cfg.adminOnly === true) return true;

    const inf = (await threadData.get(tid))?.threadInfo;
    const adminIDs = inf && typeof inf === 'object' && 'adminIDs' in inf ? inf.adminIDs : undefined;
    const isAd = Array.isArray(adminIDs) ? adminIDs.some((a) => {
      const admin = typeof a === 'object' && a !== null && 'id' in a ? a as { id: string } : { id: String(a) };
      return admin.id === sid;
    }) : false;

    const adminbox = cfg.adminbox;
    const isAdminboxEnabled = adminbox && typeof adminbox === 'object' && adminbox !== null && !Array.isArray(adminbox) && tid in adminbox && (adminbox as Record<string, unknown>)[tid] === true;
    return !isAd && !!isAdminboxEnabled;
  } catch {
    return false;
  }
}
export function normalizeOwnerNP(cfg: unknown): { all: boolean; list: string[] } {
  if (cfg === true) return { all: true, list: [] };
  if (cfg === false) return { all: false, list: [] };
  if (Array.isArray(cfg)) return { all: false, list: cfg };
  if (typeof cfg === "object" && cfg !== null) {
    const obj = cfg as { all?: boolean; list?: unknown };
    return {
      all: obj.all === true,
      list: Array.isArray(obj.list) ? obj.list.filter((x): x is string => typeof x === 'string') : [],
    };
  }
  return { all: true, list: [] };
}

export function ownerNoPrefixAllowed(cmd: Command | null, config: BotConfig, isOwner: boolean): boolean {
  if (!isOwner || !cmd) return false;
  const ownerNoPrefix = (config as { OWNER_NOPREFIX?: unknown }).OWNER_NOPREFIX;
  const cfg = normalizeOwnerNP(ownerNoPrefix);
  if (cfg.all) return true;
  const set = new Set(cfg.list.map((x) => String(x).toLowerCase()));
  const name = String(cmd.name || "").toLowerCase();
  if (set.has(name)) return true;
  const aliasList = [
    ...(Array.isArray(cmd.alias) ? cmd.alias : []),
  ];
  for (const a of aliasList) {
    if (set.has(String(a).toLowerCase())) return true;
  }
  return false;
}
