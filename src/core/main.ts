"use strict";
import fsPromises from "node:fs/promises";
import { join } from "node:path";
import { createAutoReconnectTimer } from "../API/detail/mqtt/listenMqtt";
import login from "../API/index";
import type {
  BotConfig,
  BotEventType,
  Logger as CoreLogger,
  FacebookClient,
  MainData,
  MessageForm,
  SendMessageResult,
  ServicesMap,
  ThreadDataModel as ThreadDataModelType,
  UserDataModel as UserDataModelType,
} from "../types";
import * as appUtils from "../utils";
import { initGlobalCookies } from "../utils/cookieLoader";
import { loadServices } from "../utils/loadServices";
import log from "../utils/log";
import { getConfig, initConfigManager, reloadConfig } from "./configManager";
import type { ThreadData, UserData } from "./database";
import { getDatabases, initDatabases } from "./database";
import { createHandlers } from "./handleEvents/handleEvents";
import { createRefreshDataHandler } from "./handleEvents/handleRefresh";
import type { HandlerEventArgs, HandlerHelpers } from "./handleEvents/modules/types";
import createSchedule from "./handleEvents/Schedule";
import logger from "./logger";
import { storagePath } from "./storagePath";
import { getCleanupManager } from "./managers/cleanupManager";
import initHandleUpload from "./managers/handleUpload";
import { getMemoryManager } from "./managers/memoryManager";
import loadPlugins from "./pluginLoader";
const configInitPromise = (async () => {
  const configInitResult = await initConfigManager();
  if (!configInitResult.success) {
    log.error(`Không thể khởi tạo config: ${configInitResult.error}`);
    process.exit(1);
  }

  const config = getConfig();

  if (!config || Object.keys(config).length === 0) {
    log.error("Config không được load hoặc trống! Kiểm tra lại file config.json");
    process.exit(1);
  }
  return config;
})().catch((err) => {
  log.error(`Lỗi khi khởi tạo config: ${err?.message ?? err}`);
  process.exit(1);
});

const formatError = (err: unknown): string => {
  if (!err) return "Không xác định";

  if (err instanceof Error) {
    return err.message || err.toString();
  }

  if (typeof err === "string") {
    return err;
  }

  const structuredErr = (typeof err === "object" && err !== null
    ? (err as {
      response?: { data?: unknown };
      error?: unknown;
      message?: unknown;
    })
    : { response: undefined, error: undefined, message: undefined });

  const axiosData = structuredErr.response?.data;
  if (axiosData) {
    if (typeof axiosData === "string") return axiosData;
    try {
      return JSON.stringify(axiosData);
    } catch {

    }
  }

  const target = structuredErr.error ?? structuredErr.message ?? err;
  if (!target) return "Không xác định";
  if (typeof target === "string") return target;
  if (target instanceof Error) return target.message || target.toString();

  try {
    return JSON.stringify(target);
  } catch {
    return String(target);
  }
};

const containsLoggedOutSignal = (value: unknown): boolean => {
  const text = String(value ?? "").toLowerCase();
  return (
    text.includes("logged out") ||
    text.includes("account logged out") ||
    text.includes("not logged in") ||
    text.includes("facebook blocked the login") ||
    text.includes("/login.php")
  );
};

interface MessageHandlerDeps {
  client: FacebookClient;
  models?: {
    antist?: unknown;
  };
  main: MainData;
  logger?: CoreLogger;
  utils?: Record<string, unknown>;
  config?: Readonly<BotConfig>;
}

export type MessageHandler = (message: BotEventType) => Promise<void>;

interface SafeTask {
  label: string;
  task: () => Promise<void> | void;
}

const runSafeTask = async (
  label: string,
  task: (() => Promise<void> | void) | undefined,
  logger: CoreLogger | Console,
) => {
  if (typeof task !== "function") return;
  try {
    await task();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (logger?.error) {
      logger.error(`[handleMessage:${label}] ${message}`);
      if (process.env.DEV_MODE && error instanceof Error && error.stack) {
        logger.error(error.stack);
      }
    }
  }
};

const runParallelTasks = async (tasks: SafeTask[], logger: CoreLogger | Console): Promise<void> => {
  await Promise.all(tasks.map(({ label, task }) => runSafeTask(label, task, logger)));
};

const buildHandlerTask = <TArgs>(
  label: string,
  handler: ((args: TArgs) => Promise<unknown> | unknown) | undefined,
  args: TArgs,
): SafeTask | null => {
  if (typeof handler !== "function") return null;
  return {
    label,
    task: async () => {
      await handler(args);
    },
  };
};

const helpersCache = new WeakMap<object, HandlerHelpers>();

const createHelpersFactory =
  (client: FacebookClient, logger?: CoreLogger | Console) =>
    (event: BotEventType): HandlerHelpers => {
      if (helpersCache.has(event)) {
        return helpersCache.get(event as object)!;
      }

      const threadID = event.threadID;
      const messageID = event.messageID ? String(event.messageID) : null;
      const senderID = event.senderID ? String(event.senderID) : null;
      const finalLogger = logger ?? console;

      const ensureThread = () => {
        if (!threadID) throw new Error("Thiếu ID luồng");
        return threadID;
      };

      const ensureMessage = (id?: string | null) => {
        const target = id ?? messageID;
        if (!target) throw new Error("Thiếu ID tin nhắn");
        return target;
      };

      const promisify = <TArgs extends unknown[], TResult>(
        fn: (...args: [...TArgs, (e: Error | null, data: TResult) => void]) => void,
      ) => {
        return (...args: [...TArgs, ((e: Error | null, data: TResult) => void)?]) => {
          return new Promise<TResult>((resolve, reject) => {
            const maybeCallback = args[args.length - 1] as
              | ((e: Error | null, data: TResult) => void)
              | undefined;
            const isCallback = typeof maybeCallback === "function";
            const baseArgs = (isCallback ? args.slice(0, -1) : args) as TArgs;
            fn(...baseArgs, (e, data) => {
              if (isCallback && maybeCallback) maybeCallback(e, data);
              if (e) {
                reject(e);
              } else {
                resolve(data);
              }
            });
          });
        };
      };

      const send = promisify<[MessageForm | string], SendMessageResult>((form, cb) => {
        const tid = ensureThread();
        if (!form) {
          cb(new Error("Tin nhắn trống"), {} as SendMessageResult);
          return;
        }
        void client
          .sendMessage(form, tid, (err?: Error, info?: SendMessageResult) => {
            cb(err ?? null, (info ?? {}) as SendMessageResult);
          })
          .catch((err: Error) => cb(err, {} as SendMessageResult));
      }) as HandlerHelpers["send"];

      const reply = promisify<[MessageForm | string], SendMessageResult>((form, cb) => {
        const tid = ensureThread();
        const mid = ensureMessage();
        if (!form) {
          cb(new Error("Nội dung trả lời trống"), {} as SendMessageResult);
          return;
        }
        void client
          .sendMessage(form, tid, (err?: Error, info?: SendMessageResult) => {
            cb(err ?? null, (info ?? {}) as SendMessageResult);
          }, mid)
          .catch((err: Error) => cb(err, {} as SendMessageResult));
      }) as HandlerHelpers["reply"];

      const unsend = promisify<[string], { success?: boolean }>((msgID, cb) => {
        const tid = ensureThread();
        const mid = msgID ? String(msgID) : messageID;
        if (!mid) {
          cb(new Error("Thiếu ID tin nhắn"), { success: false });
          return;
        }
        void client
          .unsendMessage(mid, tid, (err?: Error | null) => {
            cb(err ?? null, { success: !err });
          })
          .catch((err: Error) => cb(err, { success: false }));
      }) as HandlerHelpers["unsend"];

      const contact = promisify<[MessageForm | string, string | undefined], SendMessageResult>(
        (form, targetID, cb) => {
          const tid = ensureThread();
          const id = targetID?.toString() || senderID;
          if (!id) {
            cb(new Error("Thiếu ID"), {} as SendMessageResult);
            return;
          }
          const payload = form || "";
          void client
            .shareContact(payload as string, id, tid, (err?: Error | null) => {
              cb(err ?? null, {} as SendMessageResult);
            })
            .catch((err: Error) => cb(err, {} as SendMessageResult));
        },
      ) as HandlerHelpers["contact"];

      const edit = promisify<[MessageForm | string, string], { success?: boolean }>(
        (form, msgID, cb) => {
          const mid = ensureMessage(msgID ? String(msgID) : null);
          const text = (typeof form === "string" ? form : (form as { body?: string }).body) || "";
          if (!mid) {
            cb(new Error("Thiếu ID tin nhắn"), { success: false });
            return;
          }
          void client
            .editMessage(text, mid, (err?: Error | null) => {
              cb(err ?? null, { success: !err });
            })
            .catch((err: Error) => cb(err, { success: false }));
        },
      ) as HandlerHelpers["edit"];

      const react = (emoji: string, msgID?: string, tID?: string) => {
        return new Promise<{ success?: boolean }>((resolve, reject) => {
          try {
            if (!emoji) throw new Error("Thiếu emoji");
            const mid = msgID || messageID;
            const tid = tID || threadID;
            if (!mid) throw new Error("Thiếu ID tin nhắn");
            if (!tid) throw new Error("Thiếu ID luồng");
            void client.setMessageReaction(emoji, mid, tid, (e?: Error) =>
              e ? reject(e) : resolve({ success: true }),
            );
          } catch (e) {
            reject(e as Error);
          }
        }).catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          (finalLogger as CoreLogger | Console | undefined)?.error?.(`❌ Lỗi phản ứng: ${msg}`);
          return { success: false };
        });
      };

      const helpers: HandlerHelpers = {
        send,
        reply,
        unsend,
        contact,
        edit,
        react,
      };

      helpersCache.set(event as object, helpers);
      return helpers;
    };

async function createMessageHandler({
  client,
  models,
  main,
  logger,
  utils,
}: MessageHandlerDeps): Promise<MessageHandler> {
  if (!client) {
    throw new Error("Client instance is required to initialize handleEvents");
  }

  const { userData, threadData } = getDatabases(client);
  const finalLogger: CoreLogger | Console = logger ?? console;
  const finalUtils: Record<string, unknown> =
    (utils ?? (appUtils as unknown as Record<string, unknown>));
  const getConfigRef = () => getConfig();

  const services = await loadServices();
  if (finalLogger?.info) {
    finalLogger.info(`Đã load ${Object.keys(services).length} services: ${Object.keys(services).join(", ")}`);
  }

  // Type adapter: implementation has setBan/unBan but type requires addBanned/removeBanned
  // Use Object.assign to add methods while preserving all existing methods and prototype
  Object.assign(userData, {
    addBanned: async (userID: string | number, reason: string) => {
      const userDataImpl = userData as { setBan: (id: string | number, r: string | null) => Promise<Record<string, { reason?: string; time?: number }>>; get: (id: string | number) => Promise<UserData | null> };
      await userDataImpl.setBan(userID, reason);
      const user = await userDataImpl.get(userID);
      if (!user) {
        throw new Error(`User ${userID} not found after ban`);
      }
      return { user, created: false };
    },
    removeBanned: async (userID: string | number) => {
      const userDataImpl = userData as { unBan: (id: string | number) => Promise<boolean> };
      await userDataImpl.unBan(userID);
      return 1;
    },
  });

  Object.assign(threadData, {
    addBanned: async (threadID: string | number, reason: string) => {
      const threadDataImpl = threadData as { setBan: (id: string | number, r: string | null) => Promise<ThreadData> };
      const thread = await threadDataImpl.setBan(threadID, reason);
      return { thread, created: false };
    },
    removeBanned: async (threadID: string | number) => {
      const threadDataImpl = threadData as { unban: (id: string | number) => Promise<ThreadData> };
      await threadDataImpl.unban(threadID);
      return 1;
    },
  });

  // Object.assign has added addBanned/removeBanned methods at runtime
  // TypeScript needs assertion - methods exist at runtime via Object.assign
  const handlers = createHandlers({
    client,
    userData: userData as unknown as UserDataModelType,
    threadData: threadData as unknown as ThreadDataModelType,
    main,
    antist: models?.antist,
    api: services as ServicesMap,
    utils: finalUtils,
    logger: finalLogger,
  });

  const helpersFactory = createHelpersFactory(client, finalLogger);

  return async (message: BotEventType) => {
    if (!message) return;
    const { threadID, senderID, messageID } = message;
    const config = getConfigRef() as unknown as BotConfig;
    const helpers = helpersFactory(message);
    const args: HandlerEventArgs = {
      event: message,
      config,
      helpers,
    };
    await handlers.onEvent(args);
    try {
      switch (message.type) {
        case "event": {

          const refreshHandler = createRefreshDataHandler({
            client,
            userData,
            threadData,
            logger: finalLogger,
          });
          const eventTasks = [
            buildHandlerTask("refreshData", () => refreshHandler({ event: message }), {}),
            buildHandlerTask("handleEvent", handlers.handleEvent, args)
          ].filter(Boolean) as SafeTask[];
          await runParallelTasks(eventTasks, finalLogger);
          break;
        }
        case "message":
        case "message_reply":
        case "message_unsend": {
          const messageTasks = [
            buildHandlerTask("onData", handlers.onData, args),
            buildHandlerTask("onReply", handlers.onReply, args),
            buildHandlerTask("onCall", handlers.onCall, args),
            buildHandlerTask("onChat", handlers.onChat, args),
          ].filter(Boolean) as SafeTask[];
          await runParallelTasks(messageTasks, finalLogger);
          break;
        }
        case "message_reaction": {
          const reaction =
            typeof message.reaction === "string" ? message.reaction : undefined;
          const reactionTasks = [buildHandlerTask("onReact", handlers.onReact, args)].filter(
            Boolean,
          ) as SafeTask[];

          Promise.all([
            (async () => {
              try {
                // Đọc file mỗi lần, không giữ cache trong global để giảm footprint lâu dài.
                const iconPath = storagePath("other", "iconUnsend.json");
                let iconData: unknown = [];
                try {
                  const raw = await fsPromises.readFile(iconPath, "utf-8");
                  iconData = raw ? JSON.parse(raw) : [];
                  if (Array.isArray(iconData) && iconData.length > 1000) {
                    iconData = iconData.slice(0, 1000);
                  }
                } catch {
                  iconData = [];
                }

                const group = Array.isArray(iconData)
                  ? (iconData as Array<{ groupId?: string; iconUnsend?: string }>).find(
                    (i) => i.groupId === threadID,
                  )
                  : null;
                const iconDataObj = Array.isArray(iconData)
                  ? null
                  : (iconData as { status?: boolean; icon?: string } | null);
                const defaultIcons = ["😡", "😠"];

                if (
                  ((group?.iconUnsend && group.iconUnsend === reaction) ||
                    (iconDataObj?.status && iconDataObj?.icon === reaction) ||
                    (!group && defaultIcons.includes(reaction || ""))) &&
                  senderID === client.getCurrentUserID() &&
                  messageID
                ) {
                  await helpers.unsend(messageID).catch(() => { });
                }
              } catch {
                // ignore icon unsend errors
              }
            })(),
            runParallelTasks(reactionTasks, finalLogger),
          ]).catch(() => { });
          break;
        }
        case "typ":
        case "presence":
        case "read_receipt": {
          break;
        }
        case "friend_request_received":
          console.log(message);
          break;
        default: {
          if (config?.DevMode && finalLogger?.warn) {
            finalLogger.warn(`Sự kiện chưa xử lý: ${message.type}`);
          }
        }
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (finalLogger?.error) {
        finalLogger.error(`Lỗi khi xử lý message: ${errMsg}`);
        if (process.env.DEV_MODE && error instanceof Error && error.stack) {
          finalLogger.error(error.stack);
        }
      }
    }
  };
}

export const main: MainData = {
  processData: new Map(),
  cmds: new Map(),
  events: new Map(),
  cd: new Map(),
  onReact: new Map(),
  onReply: new Map(),
  onEvent: [],
  onChat: [],
};

const startAutoCleanup = () => {

  const getCleanupInterval = (): number => {
    const rssMB = process.memoryUsage().rss / 1024 / 1024;
    // Cleanup thường xuyên hơn để realtime (realtime optimization)
    if (rssMB > 280) return 30 * 1000; // 30 giây khi RSS rất cao
    if (rssMB > 200) return 45 * 1000; // 45 giây
    if (rssMB > 150) return 1 * 60 * 1000; // 1 phút
    if (rssMB > 100) return 1.5 * 60 * 1000; // 1.5 phút
    return 2 * 60 * 1000; // 2 phút
  };

  // Giảm MAX_AGE để cleanup nhanh hơn (realtime optimization)
  const getMaxAge = (rssMB: number): number => {
    // Cleanup nhanh hơn khi RSS cao
    if (rssMB > 280) return 2 * 60 * 1000; // 2 phút khi RSS rất cao
    if (rssMB > 200) return 3 * 60 * 1000; // 3 phút
    if (rssMB > 150) return 4 * 60 * 1000; // 4 phút
    return 5 * 60 * 1000; // 5 phút
  };
  const MAX_REPLY_AGE = 2 * 60 * 1000; // 2 phút cho onReply (giảm từ 3 phút)

  const cleanup = async () => {
    const now = Date.now();
    const memUsage = process.memoryUsage();
    const rssMB = memUsage.rss / 1024 / 1024;
    const MAX_AGE = getMaxAge(rssMB); // Dynamic MAX_AGE based on RSS
    let cleanedCount = 0;
    const shouldCleanupNow = (size: number, maxSize: number): boolean => {
      // Aggressive cleanup khi RSS cao (realtime optimization)
      if (rssMB > 280) return size > maxSize * 0.4; // 40% khi RSS rất cao
      if (rssMB > 200) return size > maxSize * 0.5; // 50% khi RSS cao
      return size > maxSize * 0.6; // 60% khi RSS bình thường
    };
    const cdKeysToDelete: string[] = [];
    const cdEntries = Array.from(main.cd.entries());
    for (const [cmdName, userMap] of cdEntries) {
      if (!(userMap instanceof Map)) {
        cdKeysToDelete.push(cmdName);
        continue;
      }
      let hasEntries = false;
      const userIdsToDelete: string[] = [];
      const userEntries = Array.from(userMap.entries());
      for (const [userId, timestamp] of userEntries) {
        if (now - timestamp > MAX_AGE) {
          userIdsToDelete.push(userId);
          cleanedCount++;
        } else {
          hasEntries = true;
        }
      }
      if (userIdsToDelete.length > 0) {
        userIdsToDelete.forEach(id => userMap.delete(id));
      }
      if (!hasEntries) {
        cdKeysToDelete.push(cmdName);
      }
    }
    if (cdKeysToDelete.length > 0) {
      cdKeysToDelete.forEach(key => main.cd.delete(key));
    }
    // Tối ưu onReact: cleanup theo TTL và size limit (realtime optimization)
    const MAX_REACT_ENTRIES = rssMB > 280 ? 10 : (rssMB > 200 ? 15 : (rssMB > 150 ? 25 : 40));
    const MAX_REACT_AGE = 2 * 60 * 1000; // 2 phút cho onReact (giảm từ 5 phút)
    const reactKeysToDelete: string[] = [];

    // Cleanup theo TTL trước (realtime optimization - cleanup entries cũ ngay)
    if (main.onReact.size > 0) {
      const reactEntries = Array.from(main.onReact.entries());
      for (const [key, value] of reactEntries) {
        const reactMeta = value as any;
        const createdAt = reactMeta.createdAt || reactMeta.timestamp || 0;
        if (createdAt > 0 && now - createdAt > MAX_REACT_AGE) {
          reactKeysToDelete.push(key);
          cleanedCount++;
        }
      }
    }

    // Cleanup theo size nếu vẫn còn quá nhiều - CHỈ XÓA ENTRIES CŨ NHẤT (đảm bảo không mất data mới nhất)
    if (shouldCleanupNow(main.onReact.size, MAX_REACT_ENTRIES) || main.onReact.size > MAX_REACT_ENTRIES) {
      const targetSize = Math.floor(MAX_REACT_ENTRIES * 0.5);
      const entriesToDelete = Math.max(0, main.onReact.size - targetSize - reactKeysToDelete.length);

      if (entriesToDelete > 0) {
        // Sort entries theo timestamp (CŨ NHẤT trước) để đảm bảo không xóa entries mới nhất
        const reactEntriesWithTime: Array<[string, number]> = [];
        const reactEntries = Array.from(main.onReact.entries());
        for (const [key, value] of reactEntries) {
          if (reactKeysToDelete.includes(key)) continue; // Đã được đánh dấu xóa
          const reactMeta = value as any;
          const createdAt = reactMeta.createdAt || reactMeta.timestamp || 0;

          // CHỈ xóa entries có timestamp hợp lệ và đã quá TTL một phần (đảm bảo không mất data mới nhất)
          // Entries không có timestamp (createdAt = 0) được coi là CŨ NHẤT và được xóa trước
          // Nhưng để an toàn hơn, chỉ xóa entries có timestamp và đã quá một phần TTL
          if (createdAt > 0) {
            // Chỉ xóa entries đã quá 50% TTL (đảm bảo không xóa entries mới nhất)
            const age = now - createdAt;
            if (age > MAX_REACT_AGE * 0.5) {
              reactEntriesWithTime.push([key, createdAt]);
            }
            // Nếu entry mới hơn 50% TTL, KHÔNG xóa (đảm bảo không mất data mới nhất)
          } else {
            // Entries không có timestamp: chỉ xóa khi chắc chắn là cũ (giả định là cũ)
            reactEntriesWithTime.push([key, 0]); // 0 = rất cũ, được xóa trước
          }
        }

        // Sort theo timestamp tăng dần (entries cũ nhất trước)
        reactEntriesWithTime.sort(([, a], [, b]) => a - b);

        // Chỉ xóa entries CŨ NHẤT (không bao giờ xóa entries mới nhất)
        // Giới hạn số lượng xóa để đảm bảo không xóa quá nhiều
        const safeDeleteCount = Math.min(entriesToDelete, reactEntriesWithTime.length);
        for (let i = 0; i < safeDeleteCount; i++) {
          reactKeysToDelete.push(reactEntriesWithTime[i][0]);
        }
      }
    }

    if (reactKeysToDelete.length > 0) {
      reactKeysToDelete.forEach(key => main.onReact.delete(key));
    }
    // Tối ưu onReply: cleanup theo TTL và giảm size limit (realtime optimization)
    const MAX_REPLY_ENTRIES = rssMB > 280 ? 10 : (rssMB > 200 ? 15 : (rssMB > 150 ? 25 : 40));
    const replyKeysToDelete: string[] = [];

    // Fast path: chỉ iterate nếu có entries
    if (main.onReply.size > 0) {
      const replyEntries = Array.from(main.onReply.entries());

      // Cleanup theo TTL trước (realtime optimization - cleanup entries cũ ngay)
      for (const [key, value] of replyEntries) {
        const replyMeta = value as any;
        const createdAt = replyMeta.createdAt || replyMeta.timestamp || 0;
        if (createdAt > 0 && now - createdAt > MAX_REPLY_AGE) {
          replyKeysToDelete.push(key);
          cleanedCount++;
        }
      }

      // Cleanup theo size nếu vẫn còn quá nhiều - CHỈ XÓA ENTRIES CŨ NHẤT (đảm bảo không mất data mới nhất)
      if (shouldCleanupNow(main.onReply.size, MAX_REPLY_ENTRIES) || main.onReply.size > MAX_REPLY_ENTRIES) {
        const targetSize = Math.floor(MAX_REPLY_ENTRIES * 0.5);
        const entriesToDelete = Math.max(0, main.onReply.size - targetSize - replyKeysToDelete.length);

        if (entriesToDelete > 0) {
          // Sort entries theo timestamp (CŨ NHẤT trước) để đảm bảo không xóa entries mới nhất
          const replyEntriesWithTime: Array<[string, number]> = [];
          for (const [key, value] of replyEntries) {
            if (replyKeysToDelete.includes(key)) continue; // Đã được đánh dấu xóa
            const replyMeta = value as any;
            const createdAt = replyMeta.createdAt || replyMeta.timestamp || 0;

            // CHỈ xóa entries có timestamp hợp lệ và đã quá TTL một phần (đảm bảo không mất data mới nhất)
            // Entries không có timestamp (createdAt = 0) được coi là CŨ NHẤT và được xóa trước
            // Nhưng để an toàn hơn, chỉ xóa entries có timestamp và đã quá một phần TTL
            if (createdAt > 0) {
              // Chỉ xóa entries đã quá 50% TTL (đảm bảo không xóa entries mới nhất)
              const age = now - createdAt;
              if (age > MAX_REPLY_AGE * 0.5) {
                replyEntriesWithTime.push([key, createdAt]);
              }
              // Nếu entry mới hơn 50% TTL, KHÔNG xóa (đảm bảo không mất data mới nhất)
            } else {
              // Entries không có timestamp: chỉ xóa khi chắc chắn là cũ (giả định là cũ)
              replyEntriesWithTime.push([key, 0]); // 0 = rất cũ, được xóa trước
            }
          }

          // Sort theo timestamp tăng dần (entries cũ nhất trước)
          replyEntriesWithTime.sort(([, a], [, b]) => a - b);

          // Chỉ xóa entries CŨ NHẤT (không bao giờ xóa entries mới nhất)
          // Giới hạn số lượng xóa để đảm bảo không xóa quá nhiều
          const safeDeleteCount = Math.min(entriesToDelete, replyEntriesWithTime.length);
          for (let i = 0; i < safeDeleteCount; i++) {
            replyKeysToDelete.push(replyEntriesWithTime[i][0]);
          }
        }
      }
    }

    if (replyKeysToDelete.length > 0) {
      replyKeysToDelete.forEach(key => main.onReply.delete(key));
    }
    // Tối ưu processData: cleanup theo TTL và size limit (realtime optimization)
    const MAX_PROCESS_DATA_ENTRIES = rssMB > 280 ? 10 : (rssMB > 200 ? 15 : (rssMB > 150 ? 25 : 40));
    if (main.processData.size > 0 && (shouldCleanupNow(main.processData.size, MAX_PROCESS_DATA_ENTRIES) || main.processData.size > MAX_PROCESS_DATA_ENTRIES)) {
      const keysToDelete: string[] = [];
      const entriesWithTime: Array<[string, number]> = [];
      const processEntries = Array.from(main.processData.entries());

      // Fast path: cleanup entries cũ trước
      for (const [k, v] of processEntries) {
        if (typeof v === 'number') {
          if (now - v > MAX_AGE) {
            keysToDelete.push(k);
            cleanedCount++;
          } else {
            entriesWithTime.push([k, v]);
          }
        } else {
          // Non-number entries: cleanup ngay (realtime optimization)
          keysToDelete.push(k);
          cleanedCount++;
        }
      }

      if (keysToDelete.length > 0) {
        keysToDelete.forEach(key => main.processData.delete(key));
      }

      // Cleanup theo size nếu vẫn còn quá nhiều (realtime optimization - aggressive cleanup)
      if (main.processData.size > MAX_PROCESS_DATA_ENTRIES) {
        const targetSize = Math.floor(MAX_PROCESS_DATA_ENTRIES * 0.5); // Giảm từ 0.7 xuống 0.5
        const toDelete = main.processData.size - targetSize;

        if (entriesWithTime.length > 0 && toDelete > 0) {
          // Sort và xóa entries cũ nhất (realtime optimization - LRU-like cleanup)
          entriesWithTime.sort(([, a], [, b]) => a - b);
          const additionalKeys = entriesWithTime.slice(0, toDelete).map(([k]) => k);
          if (additionalKeys.length > 0) {
            additionalKeys.forEach(key => main.processData.delete(key));
            cleanedCount += additionalKeys.length;
          }
        }
      }
    }

    // Cleanup temp files cũ (hơn 1 giờ)
    if (rssMB > 150 || cleanedCount > 0) {
      try {
        const tempDirs = [
          join(process.cwd(), "temp"),
          join(process.cwd(), "temp")
        ];
        const MAX_TEMP_AGE = 60 * 60 * 1000; // 1 giờ
        let tempFilesCleaned = 0;

        for (const tempDir of tempDirs) {
          try {
            const files = await fsPromises.readdir(tempDir).catch(() => []);
            for (const file of files) {
              const filePath = join(tempDir, file);
              try {
                const stats = await fsPromises.stat(filePath);
                if (now - stats.mtimeMs > MAX_TEMP_AGE) {
                  await fsPromises.unlink(filePath).catch(() => { });
                  tempFilesCleaned++;
                }
              } catch {
                // Ignore errors
              }
            }
          } catch {
            // Ignore if dir doesn't exist
          }
        }

        if (tempFilesCleaned > 0) {
          log.info(`[Temp Cleanup] Đã xóa ${tempFilesCleaned} temp files cũ`);
        }
      } catch {
        // Ignore temp cleanup errors
      }
    }

    if (cleanedCount > 0) {
      log.info(`[Auto Cleanup] Đã xóa ${cleanedCount} entries cũ | RSS: ${rssMB.toFixed(1)}MB`);
    }

    if (rssMB > 300) {
      log.warn(`RSS cao: ${rssMB.toFixed(1)}MB - Kiểm tra memory leaks hoặc giảm cache size`);
    }
  };

  cleanup();

  let currentTimer: NodeJS.Timeout | null = null;

  const scheduleNextCleanup = () => {
    if (currentTimer) {
      clearTimeout(currentTimer);
    }

    const interval = getCleanupInterval();
    currentTimer = setTimeout(() => {
      cleanup();
      scheduleNextCleanup();
    }, interval);

    if (typeof currentTimer.unref === "function") {
      currentTimer.unref();
    }
  };

  scheduleNextCleanup();

  const cleanupInterval = {
    ref: () => currentTimer?.ref(),
    unref: () => currentTimer?.unref(),
    refresh: () => {
      // Trigger cleanup ngay và schedule lại (realtime optimization)
      cleanup();
      scheduleNextCleanup();
    },
    [Symbol.toPrimitive]: () => (currentTimer ? Number(currentTimer) : 0),
  } as unknown as NodeJS.Timeout;

  log.info("Auto cleanup đã được bật (adaptive interval dựa trên RSS)");
  return cleanupInterval;
};

const memoryManager = getMemoryManager();
memoryManager.start();
const cleanupManager = getCleanupManager();
let cleanupInterval: NodeJS.Timeout | null = startAutoCleanup();

// Expose cleanup timer globally để memory manager có thể trigger cleanup khi RSS cao (realtime optimization)
if (cleanupInterval) {
  (global as any).__autoCleanupTimer = cleanupInterval;
  cleanupManager.registerTimer("auto-cleanup-interval", cleanupInterval, 5);
}

(async () => {
  try {

    await configInitPromise;

    // Initialize global cookies from txt files
    await initGlobalCookies();

    await initDatabases();
    console.log("Database đã sẵn sàng");

    let currentConfig = getConfig();
    if (!currentConfig.cookie || (typeof currentConfig.cookie === "string" && currentConfig.cookie.trim().length === 0)) {
      const reloginMod = await import("./auth_login/auto_relogin");
      if (!reloginMod.isAutoLoginEnabled()) {
        log.error(
          "Lỗi đăng nhập: Thiếu cookie và auto login đang tắt (autoLogin: false). Điền cookie.txt hoặc đặt autoLogin: true."
        );
        process.exit(1);
      }
      log.warn("Không tìm thấy cookie (cookie.txt hoặc fallback config.cookie), đang thử auto login...");
      const autoLoginSuccess = await reloginMod.default();
      if (!autoLoginSuccess) {
        log.error("Lỗi đăng nhập: Thiếu cookie và auto login thất bại. Tạo cookie.txt ở thư mục gốc project (chuỗi cookie Facebook) hoặc cấu hình fbAccounts trong config.json.");
        process.exit(1);
      }
      const reloadResult = await reloadConfig();
      if (!reloadResult.success) {
        log.warn(`Không thể reload config sau auto login: ${reloadResult.error || "Unknown error"}`);
      }
      currentConfig = getConfig();
      if (!currentConfig.cookie || (typeof currentConfig.cookie === "string" && currentConfig.cookie.trim().length === 0)) {
        log.error("Auto login thành công nhưng không lấy được cookie mới!");
        process.exit(1);
      }
      log.success("Đã cập nhật config với cookie mới từ auto login!");
    }

    login(currentConfig.cookie, { userAgent: currentConfig.userAgent },
      async (err: unknown, client?: FacebookClient) => {
        if (err) {
          const errorMsg = formatError(err);

          const errorLike =
            err && typeof err === "object"
              ? (err as { code?: string | number })
              : null;
          const errorCode = errorLike?.code ?? "";

          const isTimeout =
            errorMsg.includes("timeout") ||
            errorMsg.includes("Timeout") ||
            errorMsg.includes("ETIMEDOUT") ||
            errorCode === "ETIMEDOUT";

          const isCookieExpired =
            errorMsg.includes("cookie") ||
            errorMsg.includes("Cookie") ||
            errorMsg.includes("hết hạn") ||
            errorMsg.includes("expired") ||
            errorMsg.includes("login") ||
            errorMsg.includes("Login") ||
            errorMsg.includes("Not logged in");

          if (isCookieExpired) {
            const reloginMod = await import("./auth_login/auto_relogin");
            if (!reloginMod.isAutoLoginEnabled()) {
              log.error(`Lỗi đăng nhập: ${errorMsg}`);
              log.error("Auto login đang tắt (autoLogin: false). Cập nhật cookie.txt hoặc bật lại autoLogin.");
              process.exit(0);
            }
            log.warn("Cookie có vẻ đã hết hạn, đang thử auto login...");
            const autoLoginSuccess = await reloginMod.default();
            if (autoLoginSuccess) {
              const reloadResult = await reloadConfig();
              if (!reloadResult.success) {
                log.warn(`Không thể reload config sau auto login: ${reloadResult.error || "Unknown error"}`);
              }
              log.success("Auto login thành công! Đã cập nhật config với cookie mới. Đang khởi động lại...");
              process.exit(1);
            } else {
              log.error(`Lỗi đăng nhập: ${errorMsg}`);
              log.error("Auto login cũng thất bại. Vui lòng kiểm tra lại thông tin đăng nhập trong config.json!");
            }
          } else if (isTimeout) {
            log.error(`Lỗi đăng nhập: ${errorMsg}`);
            log.warn("Gợi ý: Kiểm tra kết nối mạng, cookie có thể đã hết hạn, hoặc thử lại sau vài phút.");
          } else {
            log.error(`Lỗi đăng nhập: ${errorMsg}`);
          }
          process.exit(0);
        }
        if (!client) {
          log.error("Đăng nhập thất bại: Client không được trả về");
          process.exit(0);
        }
        const { userData, threadData } = getDatabases(client);
        try {
          const latestConfig = getConfig();
          await loadPlugins({
            client,
            main,
            userData,
            threadData,
            config: latestConfig as BotConfig,
            logger: log,
            utils: appUtils,
          });
        } catch (pluginError: unknown) {
          log.error(`Không thể tải plugins: ${formatError(pluginError)}`);
        }

        try {
          const latestConfig = getConfig() as BotConfig;
          const handleUploadEnabled = latestConfig.handleUploadEnabled !== false;
          if (handleUploadEnabled) {
            initHandleUpload({ client });
            log.success("Khởi tạo handleUpload thành công");
          } else {
            log.info("Đã tắt handleUpload theo config (handleUploadEnabled=false)");
          }
        } catch (uploadError: unknown) {
          log.error(`Không thể khởi tạo handleUpload: ${formatError(uploadError)}`);
        }

        try {
          const latestConfig = getConfig() as BotConfig;
          await createSchedule({
            client,
            logger: log,
            main,
            userData,
            threadData,
            config: latestConfig,
          });
          log.success("Khởi tạo scheduler thành công");
        } catch (scheduleError: unknown) {
          log.error(`Không thể khởi tạo scheduler: ${formatError(scheduleError)}`);
        }

        let handleMessage: MessageHandler;
        try {
          const configRef = getConfig() as BotConfig;
          handleMessage = await createMessageHandler({
            client: client,
            main,
            logger: log,
            utils: appUtils,
            config: configRef
          });
          log.success("Khởi tạo message handler thành công, bắt đầu listenMqtt...");
        } catch (handlerError) {
          log.error(`Không thể khởi tạo message handler: ${formatError(handlerError)}`);
          process.exit(1);
        }
        const messageHandler = async (eventErr: unknown, event?: BotEventType) => {
          if (eventErr) {

            const errorMessage = formatError(eventErr);
            const errorLike = eventErr as {
              code?: string;
              errno?: string;
              message?: string;
              error?: string;
            };
            const errorCode = errorLike.code || errorLike.errno || "";
            const errorString = String(errorMessage || '').toLowerCase();
            const isLoggedOutError =
              containsLoggedOutSignal(errorLike.error) ||
              containsLoggedOutSignal(errorLike.message) ||
              containsLoggedOutSignal(errorMessage);

            if (isLoggedOutError || errorLike.error === "Account logged out" ||
              errorLike.message?.includes("logged out") ||
              errorLike.message?.includes("không còn đăng nhập")) {
              log.error(`⚠️ Tài khoản đã bị logout hoặc không còn đăng nhập. Vui lòng đăng nhập lại.`);
              log.error(`Chi tiết: ${errorMessage}`);

              // Khi listenMqtt báo account logged out, thử auto-login rồi restart bot
              try {
                const reloginMod = await import("./auth_login/auto_relogin");
                if (!reloginMod.isAutoLoginEnabled()) {
                  log.error("AUTO-LOGIN đang tắt (autoLogin: false). Cập nhật cookie.txt và khởi động lại bot.");
                  return;
                }
                log.warn("Đang thử AUTO-LOGIN do tài khoản bị logout/không còn đăng nhập...");
                const ok = await reloginMod.default();
                if (ok) {
                  const reloadResult = await reloadConfig();
                  if (!reloadResult.success) {
                    log.warn(`Không thể reload config sau auto login: ${reloadResult.error || "Unknown error"}`);
                  }
                  log.success("AUTO-LOGIN thành công! Đang khởi động lại để áp dụng cookie mới...");
                  process.exit(1);
                } else {
                  log.error("AUTO-LOGIN thất bại. Vui lòng kiểm tra lại thông tin đăng nhập trong config.json!");
                }
              } catch (autoErr: unknown) {
                log.error(`Lỗi khi chạy AUTO-LOGIN sau khi bị logout: ${formatError(autoErr)}`);
              }

              return;
            }

            const isNetworkError =
              errorCode === 'ECONNRESET' ||
              errorCode === 'ECONNREFUSED' ||
              errorCode === 'ETIMEDOUT' ||
              errorString.includes('econnreset') ||
              errorString.includes('connection reset') ||
              errorString.includes('socket hang up') ||
              errorString.includes('connection lost');

            if (isNetworkError) {
              log.warn(`Kết nối MQTT bị ngắt (${errorCode || errorMessage}), sẽ tự động kết nối lại...`);
            } else {
              log.error(`Lỗi trong listenMqtt: ${errorMessage}`);
            }
            return;
          }
          if (!event) return;

          try {
            await handleMessage(event);
          } catch (eventHandleError) {
            log.error(`Lỗi khi xử lý event: ${formatError(eventHandleError)}`);
          }
        };
        let mqttEmitter = client.listenMqtt(messageHandler);

        // Khởi tạo auto reconnect timer để tránh MQTT bị đứng
        const autoReconnectController = createAutoReconnectTimer({
          getConfig,
          client,
          messageHandler,
          formatError,
          getEmitter: () => mqttEmitter,
          setEmitter: (emitter: typeof mqttEmitter) => {
            mqttEmitter = emitter;
          },
        });

        autoReconnectController.start();

        process.on("SIGINT", async () => {
          log.warn("Đang dừng bot...");

          // Cleanup theo thứ tự priority
          try {
            // 1. Dừng memory manager (priority cao)
            memoryManager.stop();

            // 2. Cleanup auto reconnect controller
            autoReconnectController.cleanup();

            // 3. Cleanup tất cả resources đã đăng ký
            await cleanupManager.cleanupAll();

            // 4. Cleanup database connections
            const { closeDatabase } = await import("./database/schema");
            await closeDatabase().catch((e: unknown) => {
              const msg = e instanceof Error ? e.message : String(e);
              log.error(`Lỗi đóng database: ${msg}`);
            });

            log.info("Cleanup hoàn tất, đang thoát...");
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            log.error(`Lỗi trong quá trình cleanup: ${msg}`);
          }

          // Đợi một chút để các cleanup async hoàn tất
          setTimeout(() => {
            process.exit(0);
          }, 1000);
        });
      });
  } catch (e: unknown) {
    log.error(`Lỗi không xác định: ${formatError(e)}`);
    process.exit(1);
  }
})();
process.on("uncaughtException", (error: Error) => {
  // Ignore "write after end" errors as they're handled gracefully
  const errorMsg = error.message || String(error);
  if (errorMsg.includes("write after end") || errorMsg.includes("not opened")) {
    // Silently ignore these stream errors
    return;
  }
  logger.error(`Ngoại lệ chưa bắt: ${formatError(error)}`);
});
process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
  // Ignore "write after end" errors in promise rejections
  if (reason instanceof Error) {
    const errorMsg = reason.message || String(reason);
    if (errorMsg.includes("write after end") || errorMsg.includes("not opened")) {
      // Silently ignore these stream errors
      return;
    }
  }
  logger.error(`Promise bị từ chối chưa xử lý tại: ${formatError(promise)} lý do: ${formatError(reason)}`);
});
