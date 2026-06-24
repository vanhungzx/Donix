import type { MessageEvent, FacebookClient, BotConfig, UserDataModel, ThreadDataModel } from "@types";

export function escapeRegex(s: unknown): string {
  return typeof s === "string" ? s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
}

export async function checkBanned({
  client,
  event,
  config,
  userData,
  threadData,
}: {
  client: FacebookClient;
  event: MessageEvent;
  config: BotConfig;
  userData: UserDataModel;
  threadData: ThreadDataModel;
}): Promise<boolean> {
  try {
    const { body = "", senderID: s, threadID: t } = event;
    const sid = String(s);
    const tid = String(t);

    const isOwner = Array.isArray(config.OWNER) ? config.OWNER.includes(sid) : String(config.OWNER) === sid;
    const isAdmin = Array.isArray(config.ADMIN) ? config.ADMIN.includes(sid) : false;
    if (isOwner || isAdmin || sid === client.id) return false;
    if (!body) return false;

    const [td, ud] = await Promise.all([threadData.get(tid), userData.get(sid)]);
    const set = (td?.data as { PREFIX?: string } | undefined) || {};
    const ub = ud?.banned || {};
    const tb = td?.banned || {};
    const pre = set.PREFIX ?? config.prefix;

    const isU = Object.keys(ub).length > 0;
    const isT = Object.keys(tb).length > 0;
    const isCmd = body.startsWith(pre);

    if (isT) return true;
    if (isU || (config.antiINBOX === false && sid === tid && isCmd)) return true;

    return false;
  } catch {
    return false;
  }
}
