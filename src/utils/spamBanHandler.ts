import type {
  BotConfig,
  ExtendedMessageEvent,
  FacebookClient,
  ThreadDataModel,
  UserDataModel,
} from "@types";

interface SpamState {
  threads: Record<
    string,
    {
      events: number[];
      uniq: Map<string, number>;
      bodies: Map<string, number[]>;
      strikes: number;
      lastBan: number;
    }
  >;
  users: Record<
    string,
    Record<
      string,
      {
        events: number[];
        strikes: number;
        lastBan: number;
      }
    >
  >;
}

declare global {
  // eslint-disable-next-line no-var
  var __SPAM: SpamState | undefined;
}

interface BanInfo {
  reason?: string;
  time?: number;
  until?: number;
  strikes?: number;
  [key: string]: string | number | undefined;
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}p${String(r).padStart(2, "0")}s` : `${m}p`;
}

function prune(arr: number[], ms: number, now: number): number[] {
  const t = now - ms;
  let i = 0;
  while (i < arr.length && (arr[i] ?? 0) < t) i++;
  if (i) arr.splice(0, i);
  return arr;
}

function nextDur(strikes: number, arr: number[]): number {
  const idx = Math.min(strikes, arr.length - 1);
  return arr[idx] ?? arr[arr.length - 1] ?? 0;
}

function getBanInfo(banned: any): BanInfo | null {
  // Support both legacy shapes:
  // - BanInfo: { reason, time, until, strikes, ... }
  // - Record<string, BanInfo>: { auto: { ... } }
  if (!banned || typeof banned !== "object" || Array.isArray(banned)) return null;
  if (Object.keys(banned).length === 0) return null;

  // If it looks like a BanInfo directly, return it.
  if ("reason" in banned || "until" in banned || "time" in banned || "strikes" in banned) {
    return banned as BanInfo;
  }

  // Otherwise pick the first nested object value.
  const firstKey = Object.keys(banned)[0];
  if (!firstKey) return null;
  const item = (banned as Record<string, any>)[firstKey];
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  return item as BanInfo;
}

interface HandleSpamBanArgs {
  client: FacebookClient;
  event: ExtendedMessageEvent;
  config: BotConfig;
  threadData: ThreadDataModel;
  userData: UserDataModel;
}

export async function handleSpamBanOnChat({
  client,
  event,
  config,
  threadData,
  userData,
}: HandleSpamBanArgs): Promise<void> {
  const { senderID, threadID, body } = event;
  if (!threadID || !senderID) return;

  const rec = await threadData.get(threadID);
  if (!rec || !rec.data) return;

  const prefix = rec.data?.PREFIX || config.PREFIX;

  // Bỏ qua tin nhắn của bot
  if (senderID === client.getCurrentUserID()) return;

  // Bỏ qua ADMIN / OWNER
  const sid = String(senderID);
  const ownerField = config["OWNER"] as string | string[] | undefined;
  const adminField = config["ADMIN"] as string[] | undefined;

  const isOwner = Array.isArray(ownerField)
    ? ownerField.includes(sid)
    : String(ownerField || "") === sid;
  const isAdmin = Array.isArray(adminField)
    ? adminField.includes(sid)
    : false;
  if (isOwner || isAdmin) return;

  const now = Date.now();

  // Xử lý ban hiện tại (user/thread)
  const tInfo = await threadData.get(threadID);
  const currentThreadBan = getBanInfo((tInfo as any)?.banned);
  if (currentThreadBan?.until && now >= currentThreadBan.until) {
    // Ban nhóm đã hết hạn -> gỡ ban
    await threadData.update(threadID, { banned: null } as Partial<{ banned: null }>);
  } else if (currentThreadBan) {
    // Nhóm đang bị ban còn hiệu lực -> bỏ qua, không tăng thêm strike
    return;
  }

  const uInfo = await userData.get(senderID);
  const currentUserBan = getBanInfo((uInfo as any)?.banned);
  if (currentUserBan?.until && now >= currentUserBan.until) {
    // Ban user đã hết hạn -> gỡ ban
    await userData.update(senderID, { banned: null } as Partial<{ banned: null }>);
  } else if (currentUserBan) {
    // User đang bị ban còn hiệu lực -> bỏ qua, không tăng thêm strike
    return;
  }

  // Chỉ xử lý khi message là lệnh (bắt đầu bằng prefix)
  const finalPrefix = String(prefix ?? "");
  if (!body || !finalPrefix || !body.startsWith(finalPrefix)) return;

  if (!global.__SPAM) global.__SPAM = { threads: {}, users: {} };
  const state = global.__SPAM;

  if (!state.threads[threadID]) {
    state.threads[threadID] = {
      events: [],
      uniq: new Map(),
      bodies: new Map(),
      strikes: 0,
      lastBan: 0,
    };
  }

  const th = state.threads[threadID];
  const windowMs = 60000;
  const burstMs = 3000;

  th.events.push(now);
  prune(th.events, windowMs, now);

  th.uniq.set(senderID, now);
  for (const [uid, ts] of Array.from(th.uniq.entries())) {
    if (ts < now - windowMs) th.uniq.delete(uid);
  }

  const bArr = th.bodies.get(body) || [];
  bArr.push(now);
  th.bodies.set(body, prune(bArr, windowMs, now));

  if (!state.users[senderID]) state.users[senderID] = {};
  const u = state.users[senderID];

  if (!u[threadID]) {
    u[threadID] = { events: [], strikes: 0, lastBan: 0 };
  }

  const ue = u[threadID];
  ue.events.push(now);
  prune(ue.events, windowMs, now);

  const burstCountUser = ue.events.filter((t) => t > now - burstMs).length;
  const burstCountThread = th.events.filter((t) => t > now - burstMs).length;
  const topRepeated = Math.max(
    0,
    ...Array.from(th.bodies.values()).map((a) => a.length),
  );
  const userPerMin = ue.events.length;
  const threadPerMin = th.events.length;
  const uniqUsers = th.uniq.size;
  const bodyTrimmed = (body || "").trim();
  const isPurePrefixSpam =
    bodyTrimmed === prefix && (burstCountUser >= 3 || userPerMin >= 5);

  // Ưu tiên xử lý spam prefix riêng
  if (isPurePrefixSpam) {
    const strikes = ue.strikes + 1;
    ue.strikes = strikes;
    const dur = nextDur(strikes - 1, [1800000, 3600000, 10800000]); // 30p, 1h, 3h
    const reason = "Spam prefix bot liên tục";

    const bannedEntry: BanInfo = {
      reason,
      time: now,
      until: now + dur,
      strikes,
    };

    // Store as a flat BanInfo object for consistency with other commands/checks
    await userData.update(senderID, { banned: bannedEntry } as any);

    const name = (await userData.get(senderID))?.name || "Người dùng";
    await client.sendMessage(
      `${name} bị cấm vì spam prefix bot. Tự mở sau ${fmt(dur)}.`,
      threadID,
    );
    ue.events = [];
    return;
  }

  // Spam user thường
  if (userPerMin > 10 || burstCountUser > 5) {
    const strikes = ue.strikes + 1;
    ue.strikes = strikes;
    const dur = nextDur(strikes - 1, [600000, 1800000, 7200000]); // 10p, 30p, 2h
    const reason =
      userPerMin > 10 ? "Spam cá nhân >10 lệnh/phút" : "Burst cá nhân";

    const bannedEntry: BanInfo = {
      reason,
      time: now,
      until: now + dur,
      strikes,
    };

    // Store as a flat BanInfo object for consistency with other commands/checks
    await userData.update(senderID, { banned: bannedEntry } as any);

    const name = (await userData.get(senderID))?.name || "Người dùng";
    await client.sendMessage(
      `${name} bị cấm: ${reason}. Tự mở sau ${fmt(dur)}.`,
      threadID,
    );
    ue.events = [];
    return;
  }

  // Spam nhóm
  const threadSpamHard = threadPerMin > 40;
  const threadSpamSoft = threadPerMin > 20 && uniqUsers >= 3;
  const threadBurst = burstCountThread > 8;
  const repeatAbuse = topRepeated >= 10;

  if (threadSpamHard || threadSpamSoft || threadBurst || repeatAbuse) {
    const strikes = th.strikes + 1;
    th.strikes = strikes;
    const dur = nextDur(strikes - 1, [600000, 3600000, 21600000]); // 10p, 1h, 6h
    const reason = threadSpamHard
      ? "Spam nhóm nặng >40 lệnh/phút"
      : threadBurst
        ? "Burst nhóm"
        : repeatAbuse
          ? "Lặp lệnh cùng nội dung"
          : "Spam nhóm >20 lệnh/phút từ ≥3 người";

    const bannedEntry: BanInfo = {
      reason,
      time: now,
      until: now + dur,
      strikes,
    };

    // Store as a flat BanInfo object for consistency with other commands/checks
    await threadData.update(threadID, { banned: bannedEntry } as any);

    await client.sendMessage(
      `Nhóm bị cấm: ${reason}. Tự mở sau ${fmt(dur)}.`,
      threadID,
    );

    delete state.threads[threadID];
  }
}
