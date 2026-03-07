import type { MainData } from "@types";

interface UpdateDeps {
  api: any;
  Users: any;
  Threads: any;
  models?: any;
  main?: MainData;
}

type CounterEntry = { id: string; count: number };

interface MessageCounters {
  total: CounterEntry[];
  week: CounterEntry[];
  day: CounterEntry[];
  month: CounterEntry[];
  previousTotal_day: number;
  previousTotal_week: number;
  previousTotal_month: number;
  count: number;
}

const DEFAULT_BUCKET_LIMIT = 50;

const createDefaultCounters = (): MessageCounters => ({
  total: [],
  week: [],
  day: [],
  month: [],
  previousTotal_day: 0,
  previousTotal_week: 0,
  previousTotal_month: 0,
  count: 0,
});

const ensureCounters = (input: any): MessageCounters => {
  if (!input || typeof input !== "object") return createDefaultCounters();
  return {
    total: Array.isArray(input.total) ? [...input.total] : [],
    week: Array.isArray(input.week) ? [...input.week] : [],
    day: Array.isArray(input.day) ? [...input.day] : [],
    month: Array.isArray(input.month) ? [...input.month] : [],
    previousTotal_day: Number.isFinite(input.previousTotal_day) ? input.previousTotal_day : 0,
    previousTotal_week: Number.isFinite(input.previousTotal_week) ? input.previousTotal_week : 0,
    previousTotal_month: Number.isFinite(input.previousTotal_month) ? input.previousTotal_month : 0,
    count: Number.isFinite(input.count) ? input.count : 0,
  };
};

const incrementBucket = (bucket: CounterEntry[], id: string, limit: number = DEFAULT_BUCKET_LIMIT): CounterEntry[] => {
  const target = String(id);
  const next = bucket.map((entry) =>
    entry.id === target ? { ...entry, count: entry.count + 1 } : entry,
  );
  if (!next.some((entry) => entry.id === target)) {
    next.push({ id: target, count: 1 });
  }
  return next.sort((a, b) => b.count - a.count).slice(0, limit);
};

const incrementCounters = (counters: MessageCounters, id: string): MessageCounters => ({
  ...counters,
  count: counters.count + 1,
  total: incrementBucket(counters.total, id),
  week: incrementBucket(counters.week, id),
  day: incrementBucket(counters.day, id),
  month: incrementBucket(counters.month, id),
});

const defaultThreadInfo = () => ({
  threadName: "",
  inviteLink: { link: "", enable: false },
  imageSrc: "",
  nicknames: {},
  adminIDs: [],
  approvalMode: false,
  emoji: "",
  threadTheme: { id: null, accessibility_label: null },
  color: null,
});

const normalizeThreadInfo = (info?: any) => {
  if (!info || typeof info !== "object") return defaultThreadInfo();
  return {
    threadName: info.threadName || info.name || "",
    inviteLink: {
      link: info.inviteLink?.link || info.invite_link?.link || info.link || "",
      enable:
        typeof info.inviteLink?.enable === "boolean"
          ? info.inviteLink.enable
          : Boolean(info.joinableMode || info.joinable_mode),
    },
    imageSrc: info.imageSrc || info.imageSrcFull || "",
    nicknames: typeof info.nicknames === "object" ? info.nicknames : {},
    adminIDs: Array.isArray(info.adminIDs) ? info.adminIDs : [],
    approvalMode:
      typeof info.approvalMode === "boolean"
        ? info.approvalMode
        : typeof info.APPROVAL_MODE === "number"
          ? info.APPROVAL_MODE === 1
          : false,
    emoji: info.emoji || info.thread_quick_reaction_emoji || "",
    threadTheme: {
      id: info.threadTheme?.id || info.theme_id || null,
      accessibility_label: info.threadTheme?.accessibility_label || info.accessibility_label || null,
    },
    color: info.color || info.theme_color || null,
  };
};

const safeThreadInfo = async (Threads: any, threadID: string) => {
  try {
    if (typeof Threads.getInfo === "function") return await Threads.getInfo(threadID);
    if (typeof Threads.info === "function") return await Threads.info(threadID);
  } catch {
    return null;
  }
  return null;
};

const safeUserInfo = async (Users: any, userID: string) => {
  try {
    if (typeof Users.getInfo === "function") return await Users.getInfo(userID);
    if (typeof Users.info === "function") return await Users.info(userID);
  } catch {
    return null;
  }
  return null;
};

const ensureThreadRecord = async (Threads: any, threadID: string) => {
  const existing = await Threads.getData(threadID);
  if (existing) return existing;

  const liveInfo = await safeThreadInfo(Threads, threadID);
  const normalizedInfo = normalizeThreadInfo(liveInfo);
  const result = await Threads.setData(threadID, {
    threadName: normalizedInfo.threadName || `Thread ${threadID}`,
    threadInfo: normalizedInfo,
    messageCount: createDefaultCounters(),
    lastActive: Date.now(),
    banned: {},
    settings: {},
    data: {},
  });
  return result?.thread ?? {
    threadID,
    threadName: normalizedInfo.threadName || `Thread ${threadID}`,
    threadInfo: normalizedInfo,
    messageCount: createDefaultCounters(),
  };
};

const ensureUserRecord = async (Users: any, userID: string, threadID: string, fallbackName?: string) => {
  const existing = await Users.getData(userID);
  if (existing) return existing;

  const info = await safeUserInfo(Users, userID);
  const name = info?.name || fallbackName || `User ${userID}`;
  return await Users.create(userID, {
    name,
    gender: info?.gender,
    userInfo: info || {},
    joinedThreads: { [threadID]: Date.now() },
    data: {},
    setting: {},
    banned: {},
    exp: 0,
    money: 0,
    messageCount: createDefaultCounters(),
  });
};

const refreshThreadInfoIfNeeded = async (Threads: any, threadID: string, record: any) => {
  const hasInfo = record?.threadInfo && Object.keys(record.threadInfo).length;
  if (hasInfo) return normalizeThreadInfo(record.threadInfo);

  const liveInfo = await safeThreadInfo(Threads, threadID);
  const normalized = normalizeThreadInfo(liveInfo || record?.threadInfo);
  await Threads.setData(threadID, {
    threadInfo: normalized,
    threadName: normalized.threadName || record?.threadName,
  });
  return normalized;
};

export type UpdateDataHandler = (message: any) => Promise<void>;

export default function createUpdateData({ Users, Threads }: UpdateDeps): UpdateDataHandler {
  return async (message: any) => {
    if (!message?.threadID || !message?.senderID) return;

    const threadID = String(message.threadID);
    const senderID = String(message.senderID);
    const now = Date.now();

    const [threadRecord, userRecord] = await Promise.all([
      ensureThreadRecord(Threads, threadID),
      ensureUserRecord(Users, senderID, threadID, message?.senderName),
    ]);

    const threadInfo = await refreshThreadInfoIfNeeded(Threads, threadID, threadRecord);
    const updatedThreadCounters = incrementCounters(ensureCounters(threadRecord?.messageCount), senderID);
    const updatedUserCounters = incrementCounters(ensureCounters(userRecord?.messageCount), threadID);

    
    const currentExp = typeof userRecord?.exp === "number" && Number.isFinite(userRecord.exp)
      ? userRecord.exp
      : 0;

    const bodyText = typeof message?.body === "string" ? message.body : "";
    let gainedExp = 0;

    
    const attachments = message?.attachments || [];
    const hasImageOrVideo = Array.isArray(attachments) && attachments.some((att: any) => {
      const type = att?.type || "";
      return type === "photo" || type === "video" || type === "animated_image";
    });

    
    
    
    
    if (hasImageOrVideo) {
      gainedExp = 3; 
    } else {
      gainedExp = 1; 
    }

    
    if (bodyText.length > 50) {
      gainedExp += 3; 
    }

    
    if (!Number.isFinite(gainedExp) || gainedExp < 0) {
      gainedExp = 0;
    }

    const newExp = currentExp + gainedExp;

    await Threads.setData(threadID, {
      threadInfo: threadInfo,
      threadName: message?.threadName || threadInfo.threadName || threadRecord?.threadName,
      lastActive: now,
      messageCount: updatedThreadCounters,
    });

    await Users.setData(senderID, {
      name: userRecord?.name || message?.senderName || `User ${senderID}`,
      joinedThreads: {
        ...(userRecord?.joinedThreads || {}),
        [threadID]: now,
      },
      messageCount: updatedUserCounters,
      exp: newExp,
    });
  };
}
