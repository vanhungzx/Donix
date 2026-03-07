import type {
  BotConfig,
  Command,
  CommandMessenger,
  CommandOnCallContext,
  CommandOnChatContext,
  CommandOnEventContext,
  CommandOnReplyContext,
  ExtendedMessageEvent,
  FacebookClient,
  Logger,
  MainData,
  ThreadDataModel,
  UserDataModel
} from "@types";
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import type { Readable } from "stream";
import { getConfig } from "../../../core/configManager";
type ThreadID = string;

interface BoxNameEntry {
  threadID: ThreadID;
  name?: string;
}

interface MentionEntry {
  tag: string;
  id: string;
}

interface BoxImageEntry {
  threadID: ThreadID;
  imageSrc?: string;
}

interface NicknameEntry {
  threadID: ThreadID;
  nicknames?: Record<string, string>;
}

interface EmojiEntry {
  emoji: string;
  enabled: boolean;
}

interface ThemeEntry {
  themeid: string;
  enabled: boolean;
}

type ToggleMap = Record<ThreadID, boolean>;
type EmojiMap = Record<ThreadID, EmojiEntry>;
type ThemeMap = Record<ThreadID, ThemeEntry>;

type AntiDataMap = {
  boxname: BoxNameEntry[];
  boximage: BoxImageEntry[];
  nickname: NicknameEntry[];
  antiout: ToggleMap;
  emoji: EmojiMap;
  theme: ThemeMap;
  qtv: ToggleMap;
  join: ToggleMap;
  spam: ToggleMap;
  unsend: ToggleMap;
  tagall: ToggleMap;
  link: ToggleMap;
};

type AntiDataKey = keyof AntiDataMap;

type ThreadInfoRecord = {
  threadID?: string;
  threadName?: string;
  adminIDs: Array<{ id: string } | { id: string;[key: string]: unknown }>;
  imageSrc?: string;
  [key: string]: unknown;
};

type MessagePayload = Parameters<FacebookClient["sendMessage"]>[0];

type SendMessageInfoLite = {
  messageID?: string;
  threadID?: string;
  timestamp?: number;
  [key: string]: string | number | undefined;
};

const isBotPrivileged = (userID: string, config?: BotConfig): boolean => {
  const adminBot = Array.isArray(config?.ADMIN)
    ? config.ADMIN.map(String)
    : config?.ADMIN
      ? [String(config.ADMIN)]
      : [];
  const ownerList = Array.isArray(config?.OWNER)
    ? config.OWNER.map(String)
    : config?.OWNER
      ? [String(config.OWNER)]
      : [];
  return adminBot.includes(userID) || ownerList.includes(userID);
};

const logError = (logger: Logger | undefined, message: string, error?: unknown): void => {
  if (logger && typeof logger.error === "function") {
    logger.error(message, error as Error | string | number | boolean | null | undefined);
  }
};

const logInfo = (logger: Logger | undefined, message: string): void => {
  if (logger && typeof logger.info === "function") {
    logger.info(message);
  }
};

class AntiDataManager {
  dataDir: string;
  files: Record<AntiDataKey, string>;

  constructor() {
    this.dataDir = path.resolve(process.cwd(), "src/storage/anti");
    this.files = {
      boxname: path.join(this.dataDir, "boxname.json"),
      boximage: path.join(this.dataDir, "boximage.json"),
      nickname: path.join(this.dataDir, "nickname.json"),
      antiout: path.join(this.dataDir, "antiout.json"),
      emoji: path.join(this.dataDir, "emoji.json"),
      theme: path.join(this.dataDir, "theme.json"),
      qtv: path.join(this.dataDir, "qtv.json"),
      join: path.join(this.dataDir, "join.json"),
      spam: path.join(this.dataDir, "spam.json"),
      unsend: path.join(this.dataDir, "unsend.json"),
      tagall: path.join(this.dataDir, "tagall.json"),
      link: path.join(this.dataDir, "link.json")
    };
    this.initializeFiles();
  }

  initializeFiles(): void {
    fs.ensureDirSync(this.dataDir);
    const defaultStructures: AntiDataMap = {
      boxname: [],
      boximage: [],
      nickname: [],
      antiout: {},
      emoji: {},
      theme: {},
      qtv: {},
      join: {},
      spam: {},
      unsend: {},
      tagall: {},
      link: {}
    };
    (Object.entries(this.files) as Array<[AntiDataKey, string]>).forEach(([key, filePath]) => {
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultStructures[key], null, 2));
      }
    });
  }

  readData<T extends AntiDataKey>(type: T): AntiDataMap[T] {
    try {
      const filePath = this.files[type];
      if (!filePath) {
        throw new Error(`Unknown anti data type: ${type}`);
      }
      return JSON.parse(fs.readFileSync(filePath, "utf8")) as AntiDataMap[T];
    } catch (error) {
      console.error(`Error reading ${type} data:`, error);
      if (type === "boxname" || type === "boximage" || type === "nickname") {
        return [] as unknown as AntiDataMap[T];
      }
      return {} as AntiDataMap[T];
    }
  }

  writeData<T extends AntiDataKey>(type: T, data: AntiDataMap[T]): boolean {
    try {
      const filePath = this.files[type];
      if (!filePath) {
        throw new Error(`Unknown anti data type: ${type}`);
      }
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error(`Error writing ${type} data:`, error);
      return false;
    }
  }

  getAllData(): {
    boxname: AntiDataMap["boxname"];
    boximage: AntiDataMap["boximage"];
    antiNickname: AntiDataMap["nickname"];
    antiout: AntiDataMap["antiout"];
    antiEmoji: AntiDataMap["emoji"];
    antiTheme: AntiDataMap["theme"];
    antiQtv: AntiDataMap["qtv"];
    antijoin: AntiDataMap["join"];
    antispam: AntiDataMap["spam"];
    antiunsend: AntiDataMap["unsend"];
    antitagall: AntiDataMap["tagall"];
    antilink: AntiDataMap["link"];
  } {
    return {
      boxname: this.readData("boxname"),
      boximage: this.readData("boximage"),
      antiNickname: this.readData("nickname"),
      antiout: this.readData("antiout"),
      antiEmoji: this.readData("emoji"),
      antiTheme: this.readData("theme"),
      antiQtv: this.readData("qtv"),
      antijoin: this.readData("join"),
      antispam: this.readData("spam"),
      antiunsend: this.readData("unsend"),
      antitagall: this.readData("tagall"),
      antilink: this.readData("link")
    };
  }
}

async function handleSpamKick(
  api: FacebookClient,
  senderID: string,
  threadID: string,
  userData: UserDataModel,
  reason: string
): Promise<void> {
  try {
    const userInfo = await userData.get(senderID).catch(() => null);
    const userName = userInfo?.name || "Người dùng";
    await api.removeUserFromGroup(senderID, threadID).catch((err: unknown) => {
      console.error(`[Anti-Spam] Không thể kick ${senderID}:`, err);
      throw err;
    });
    await api
      .sendMessage(
        {
          body: `⚠️ Đã tự động kick ${userName} do ${reason}`
        },
        threadID
      )
      .catch((err: unknown) => {
        console.error(`[Anti-Spam] Không thể gửi thông báo:`, err);
      });
  } catch (error) {
    console.error(`[Anti-Spam] Lỗi khi kick người dùng ${senderID}:`, error);
    throw error;
  }
}

async function unSend({
  event,
  client,
  userData,
  threadData: _threadData,
  dataManager: _dataManager,
  logger
}: {
  event: ExtendedMessageEvent;
  client: FacebookClient;
  userData: UserDataModel;
  threadData: ThreadDataModel;
  dataManager: AntiDataManager;
  logger: Logger;
}): Promise<void> {
  const { messageID, senderID, threadID, body, type, attachments } = event;
  const botID = String(client.getCurrentUserID());
  const senderIDStr = String(senderID);
  if (senderIDStr === botID) return;
  const g = global as Record<string, unknown>;
  if (!g.logMessage) {
    g.logMessage = new Map<string, unknown>();
  }
  const logMessage = g.logMessage as Map<string, unknown>;
  if (type !== "message_unsend") {
    try {
      const msgData: {
        msgBody: string;
        attachment: Array<Record<string, unknown>>;
        senderID: string;
        timestamp: number;
      } = {
        msgBody: body || "",
        attachment: attachments?.map((att) => ({ ...(att as unknown as Record<string, unknown>) })) || [],
        senderID: senderIDStr,
        timestamp: Date.now()
      };
      logMessage.set(String(messageID), msgData);
      if (logMessage.size > 1000) {
        const entries = Array.from(logMessage.entries());
        const toDelete = entries.slice(0, entries.length - 1000);
        toDelete.forEach(([key]) => logMessage.delete(key));
      }
      return;
    } catch (error) {
      if (logger && typeof logger.error === "function") {
        logger.error("[Anti-Unsend] Lỗi khi lưu tin nhắn:", error as Error);
      }
      return;
    }
  }
  try {
    const message = logMessage.get(String(messageID)) as
      | {
        msgBody?: string;
        attachment?: Array<{ url?: string }>;
      }
      | undefined;
    if (!message) return;
    const senderName: string =
      (typeof userData.getName === "function"
        ? await userData.getName(senderIDStr).catch(() => "Người dùng")
        : "Người dùng") || "Người dùng";
    if (!message.attachment || message.attachment.length === 0) {
      if (message.msgBody) {
        try {
          const mentions: MentionEntry[] = [{ tag: senderName, id: senderIDStr }];
          const notifyMsg: MessagePayload = {
            body: `⚠️ ${senderName} đã gỡ một tin nhắn:\n\n${message.msgBody}`,
            mentions
          };
          await client.sendMessage(notifyMsg, threadID);
        } catch (error) {
          console.log(error);
          logError(logger, "[Anti-Unsend] Lỗi khi gửi tin nhắn text:", error as Error);
        }
      }
      logMessage.delete(String(messageID));
      return;
    }
    const msgAttachment: Readable[] = [];
    const msgBody = `⚠️ ${senderName} đã gỡ ${message.attachment.length} tệp đính kèm${message.msgBody ? `\n\nNội dung: ${message.msgBody}` : ""}`;
    for (const file of message.attachment) {
      try {
        if (!file.url) continue;
        const response = await axios.get(file.url, {
          responseType: "stream",
          timeout: 10000
        });
        msgAttachment.push(response.data as Readable);
      } catch (error) {
        logError(logger, "[Anti-Unsend] Lỗi khi tải file:", error);
      }
    }
    if (msgAttachment.length > 0 || msgBody) {
      try {
        const notifyMsg: MessagePayload = {
          body: msgBody,
          attachment: msgAttachment
        };
        await client.sendMessage(notifyMsg, threadID);
      } catch (error) {
        logError(logger, "[Anti-Unsend] Lỗi khi gửi tin nhắn:", error);
      }
    }
    logMessage.delete(String(messageID));
  } catch (error) {
    logError(logger, "[Anti-Unsend] Lỗi chung:", error);
    console.error("[Anti-Unsend] Lỗi chung:", error);
  }
}

type ToggleOnlyKey = "antiout" | "qtv" | "join" | "spam" | "unsend" | "tagall" | "link";

async function handleAnti(
  option: string,
  {
    client,
    event,
    dataManager,
    threadInfo,
    permssion,
    collectResult = false,
    privileged = false
  }: {
    client: FacebookClient;
    event: ExtendedMessageEvent;
    dataManager: AntiDataManager;
    threadInfo: {
      threadID?: string;
      threadName?: string;
      adminIDs: Array<{ id: string } | { id: string;[key: string]: unknown }>;
      [key: string]: unknown;
    };
    permssion: number;
    collectResult?: boolean;
    privileged?: boolean;
  }
): Promise<{ message: string; hasChange: boolean } | void> {
  const { threadID, messageID } = event;
  const senderIDStr = String(event.senderID);
  const isThreadAdmin = Array.isArray(threadInfo.adminIDs)
    ? threadInfo.adminIDs.some((item) => String(item.id) === senderIDStr)
    : false;
  const adminCheck = threadInfo.adminIDs.some(
    (item) => String(item.id) === String(client.getCurrentUserID())
  );
  const sendNoPermission = async (): Promise<{ message: string; hasChange: boolean } | void> => {
    const message = "⚠️ Không đủ quyền hạn!";
    if (collectResult) {
      return { message, hasChange: false };
    }
    await client.sendMessage(message, threadID, messageID);
  };
  const toggleFeature = async (
    dataType: ToggleOnlyKey,
    value: boolean | null = null
  ): Promise<{ message: string; hasChange: boolean } | void> => {
    const data = dataManager.readData(dataType);
    const isActive = value ?? (data[threadID] || false);
    dataManager.writeData(dataType, {
      ...data,
      [threadID]: !isActive
    });
    const message = `☑️ ${isActive ? "Tắt" : "Bật"} anti ${dataType}`;
    if (collectResult) {
      return { message, hasChange: true };
    }
    await client.sendMessage(message, threadID, messageID);
  };
  if (permssion < 1 && !isThreadAdmin && !privileged && !["7", "qtv"].includes(option)) {
    return sendNoPermission();
  }
  const arrayFeatures: Record<string, [string, "boxname" | "boximage" | "nickname", string]> = {
    "1": ["namebox", "boxname", "name"],
    "2": ["imagebox", "boximage", "imageSrc"],
    "3": ["nickname", "nickname", "nicknames"]
  };
  for (const [num, [name, dataType, prop]] of Object.entries(arrayFeatures)) {
    if (option === num || option === name) {
      const items = dataManager.readData(dataType);
      const isActive = items.find((item) => item.threadID === threadID);
      const message = `☑️ ${isActive ? "Tắt" : "Bật"} anti ${name}`;
      if (isActive) {
        const newItems = items.filter((item) => item.threadID !== threadID);
        dataManager.writeData(dataType, newItems);
      } else {
        if (name === "nickname") {
          items.push({
            threadID,
            [prop]: threadInfo[prop] || {}
          });
        } else {
          items.push({
            threadID,
            [prop]: threadInfo[prop] || threadInfo.threadName
          });
        }
        dataManager.writeData(dataType, items);
      }
      if (collectResult) {
        return { message, hasChange: true };
      }
      await client.sendMessage(message, threadID, messageID);
    }
  }
  const boolFeatures: Record<string, ToggleOnlyKey | "emoji" | "theme"> = {
    "4": "antiout",
    "5": "emoji",
    "6": "theme",
    "8": "join",
    "9": "spam",
    "10": "unsend",
    "11": "tagall",
    "12": "link"
  };
  for (const [num, key] of Object.entries(boolFeatures)) {
    if (option === num || option === key.replace("anti", "")) {
      if (["emoji", "theme"].includes(key)) {
        const data = dataManager.readData(key as "emoji" | "theme");
        const currentData =
          data[threadID] ||
          (key === "emoji"
            ? {
              emoji: threadInfo[key] as string | undefined,
              enabled: false
            }
            : {
              themeid: threadInfo[key] as string | undefined,
              enabled: false
            });
        currentData.enabled = !currentData.enabled;
        dataManager.writeData(key as "emoji" | "theme", {
          ...data,
          [threadID]: currentData as EmojiEntry & ThemeEntry
        });
        const message = `☑️ ${currentData.enabled ? "Bật" : "Tắt"} anti ${key}`;
        if (collectResult) {
          return { message, hasChange: true };
        }
        await client.sendMessage(message, threadID, messageID);
      }
      return toggleFeature(key as ToggleOnlyKey);
    }
  }
  if (option === "7" || option === "qtv") {
    if (!adminCheck) {
      const message = "❎ Bot cần quyền quản trị viên!";
      if (collectResult) {
        return { message, hasChange: false };
      }
      await client.sendMessage(message, threadID, messageID);
      return;
    }
    return toggleFeature("qtv");
  }
  const message = "❎ Lựa chọn không hợp lệ!";
  if (collectResult) {
    return { message, hasChange: false };
  }
  await client.sendMessage(message, threadID);
}

const antiCommand = {
  name: "anti",
  alias: ["antist"],
  version: "2.1.0",
  role: 1,
  desc: "Anti change Box chat vip pro",
  guide:
    "{pn}\n\n" +
    "1. Anti namebox: Chống đổi tên nhóm\n" +
    "2. Anti imagebox: Chống đổi ảnh nhóm\n" +
    "3. Anti nickname: Chống đổi biệt danh\n" +
    "4. Anti out: Chống rời nhóm\n" +
    "5. Anti emoji: Chống đổi emoji\n" +
    "6. Anti theme: Chống đổi theme (màu sắc)\n" +
    "7. Anti qtv: Chống thay đổi quản trị viên\n" +
    "8. Anti join: Chống thêm thành viên\n" +
    "9. Anti spam: Chống spam tin nhắn\n" +
    "10. Anti unsend: Chống gỡ tin nhắn\n" +
    "11. Anti tagall: Chống tag all\n" +
    "12. Anti link: Chống gửi link\n\n" +
    "Cách dùng: {pn} anti [số/tên] hoặc reply tin nhắn theo số/tên để bật/tắt",
  cd: 5,
  prefix: true,
  onEvent: async function (ctx: CommandOnEventContext & {
    send: CommandMessenger;
    threadData: ThreadDataModel;
    userData: UserDataModel;
    utils: Record<string, unknown>;
    logger: Logger;
    config: BotConfig;
  }) {
    const { threadID, author, logMessageType, logMessageData } = ctx.event;
    const client = ctx.client as FacebookClient;
    const userData = ctx.userData as UserDataModel;
    const threadData = ctx.threadData as ThreadDataModel;
    const logger = ctx.logger as Logger;
    const send = ctx.send as CommandMessenger;
    const utilsCtx = ctx.utils as { stream?: (url: string, ext: string) => Promise<unknown> };
    const dataManager = new AntiDataManager();
    const dataAnti = dataManager.getAllData();
    if (dataAnti.antiunsend?.[threadID]) {
      await unSend({ event: ctx.event, client, threadData, userData, dataManager, logger });
    }
    if (!ctx.event.logMessageBody) return;
    const botID = String(client.getCurrentUserID());
    const dataThread = (await threadData.get(threadID))?.threadInfo as ThreadInfoRecord | undefined;
    if (!dataThread) return;
    const logData = (logMessageData || {}) as Record<string, unknown>;
    const authorStr = String(author);
    const authorIsThreadAdmin = Array.isArray(dataThread.adminIDs)
      ? dataThread.adminIDs.some((admin: { id: string }) => String(admin.id) === authorStr)
      : false;
    const isAdminAuthor = authorStr === botID || authorIsThreadAdmin;
    const handlers: Record<string, () => Promise<void>> = {
      "log:thread-name": async () => {
        const boxnameData = dataManager.readData("boxname");
        const findAnti = boxnameData.find((item) => item.threadID === threadID);
        if (!findAnti) return;
        if (isAdminAuthor) {
          findAnti.name = (logData.name as string | undefined) || findAnti.name || dataThread.threadName;
          dataManager.writeData("boxname", boxnameData);
        } else {
          await client.sendMessage(`⚠️ Bạn không có quyền đổi tên nhóm`, threadID);
          const revertName = findAnti.name || dataThread.threadName || "";
          if (revertName) {
            await client.setThreadName(revertName, threadID);
          }
        }
      },
      "log:user-nickname": async () => {
        const nicknameData = dataManager.readData("nickname");
        const findAnti = nicknameData.find((item) => item.threadID === threadID);
        if (!findAnti) return;
        if (isAdminAuthor) {
          if (!findAnti.nicknames) findAnti.nicknames = {};
          const participantId = String(logData.participant_id || "");
          if (participantId) {
            findAnti.nicknames[participantId] = (logData.nickname as string | undefined) || "";
          }
          dataManager.writeData("nickname", nicknameData);
        } else {
          const participantId = String(logData.participant_id || "");
          await client.sendMessage(`⚠️ Bạn không có quyền đổi tên người dùng`, threadID);
          await client.changeNickname(
            participantId ? findAnti.nicknames?.[participantId] || "" : "",
            threadID,
            participantId
          );
        }
      },
      "log:unsubscribe": async () => {
        const antioutData = dataManager.readData("antiout");
        if (!antioutData[threadID]) return;
        const id = String(logData.leftParticipantFbId || "");
        const authorStr = String(author);
        const botIDStr = String(botID);
        if (authorStr !== id || id === botIDStr) return;
        const name =
          ((await userData.getName(id).catch(() => "Người dùng")) as string) ||
          "Người dùng";
        try {
          await client.addUserToGroup(id, threadID);
          client.sendMessage(
            `⚠️ Đã thêm lại ${name}`,
            threadID,
            (err?: Error, info?: SendMessageInfoLite) => {
              if (!err && info?.messageID) {
                setTimeout(
                  () => client.unsendMessage(info.messageID || "", threadID).catch(() => { }),
                  60000
                );
              }
            }
          );
        } catch (error) {
          logError(logger, `[Anti-Out] Không thể thêm lại ${name}:`, error);
          client.sendMessage(
            `⚠️ Không thể thêm lại ${name}`,
            threadID,
            (err?: Error, info?: SendMessageInfoLite) => {
              const msgId = info?.messageID;
              if (!err && msgId) {
                setTimeout(
                  () => client.unsendMessage(msgId, threadID).catch(() => { }),
                  60000
                );
              }
            }
          );
        }
      },
      "log:thread-color": async () => {
        const themeData = dataManager.readData("theme");
        if (isAdminAuthor) {
          themeData[threadID] = {
            themeid: (logData.theme_id as string) || "",
            enabled: themeData[threadID]?.enabled ?? true
          } as ThemeEntry;
          dataManager.writeData("theme", themeData);
          const emojiData = dataManager.readData("emoji");
          if (emojiData[threadID]?.enabled) {
            const emoji = (logData.theme_emoji as string) || "👍";
            emojiData[threadID] = {
              emoji,
              enabled: emojiData[threadID]?.enabled ?? true
            };
            dataManager.writeData("emoji", emojiData);
          }
        } else {
          const currentData = themeData[threadID];
          if (currentData?.enabled) {
            await client.setTheme(currentData.themeid, threadID);
            await client.sendMessage(
              `⚠️ Bạn không có quyền đổi chủ đề nhóm`,
              threadID
            );
          }
        }
      },
      "log:thread-icon": async () => {
        const emojiData = dataManager.readData("emoji");
        if (isAdminAuthor) {
          const emoji =
            (logData.thread_icon as string) ||
            (logData.thread_quick_reaction_emoji as string) ||
            "👍";
          emojiData[threadID] = {
            emoji,
            enabled: emojiData[threadID]?.enabled ?? true
          };
          dataManager.writeData("emoji", emojiData);
        } else {
          const currentData = emojiData[threadID];
          if (currentData?.enabled) {
            await (client.setEmoji as unknown as (emoji: string, threadID: string) => Promise<void>)(
              currentData.emoji || "👍",
              threadID
            );
            await (client.sendMessage as unknown as (form: MessagePayload, threadID: string) => Promise<unknown>)(
              `⚠️ Bạn không có quyền đổi emoji nhóm`,
              threadID
            );
          }
        }
      },
      "log:thread-admins": async () => {
        const authorStr = String(author);
        const botIDStr = String(botID);
        if (authorStr === botIDStr) return;
        try {
          const qtvData = dataManager.readData("qtv");
          if (qtvData && qtvData[threadID] === true) {
            if (
              logData.ADMIN_EVENT === "add_admin" ||
              logData.ADMIN_EVENT === "remove_admin"
            ) {
              const targetID = String(logData.TARGET_ID || "");
              if (targetID === botIDStr) return;
              if (logData.ADMIN_EVENT === "remove_admin") {
                await (client.setAdminStatus as unknown as (thread: string, user: string, status: boolean) => Promise<void>)(
                  threadID,
                  authorStr,
                  false
                ).catch(() => { });
                await (client.setAdminStatus as unknown as (thread: string, user: string, status: boolean) => Promise<void>)(
                  threadID,
                  targetID,
                  true
                ).catch(() => { });
              } else if (logData.ADMIN_EVENT === "add_admin") {
                await (client.setAdminStatus as unknown as (thread: string, user: string, status: boolean) => Promise<void>)(
                  threadID,
                  authorStr,
                  false
                ).catch(() => { });
                await (client.setAdminStatus as unknown as (thread: string, user: string, status: boolean) => Promise<void>)(
                  threadID,
                  targetID,
                  false
                ).catch(() => { });
              }
              await (client.sendMessage as unknown as (form: MessagePayload, threadID: string) => Promise<unknown>)(
                "⚠️ Kích hoạt chế độ chống cướp box",
                threadID
              ).catch(() => { });
            }
          }
        } catch (error) {
          logError(logger, "[Anti-QTV] Lỗi khi xử lý thay đổi admin:", error);
          console.error("[Anti-QTV] Lỗi khi xử lý thay đổi admin:", error);
        }
      },
      "log:subscribe": async () => {
        const joinData = dataManager.readData("join");
        if (isAdminAuthor || !joinData[threadID]) return;
        const members = Array.isArray(logData.addedParticipants)
          ? (logData.addedParticipants as Array<{ userFbId: string | number }>)
          : [];
        const botIDStr = String(botID);
        if (members.some((m: { userFbId: string | number }) => String(m.userFbId) === botIDStr)) return;
        for (const member of members) {
          try {
            const memberID = String(member.userFbId);
            await client.removeUserFromGroup(memberID, threadID);
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            logError(logger, "[Anti-Join] Lỗi khi kick thành viên:", error);
            console.error(`[Anti-Join] Lỗi khi kick thành viên:`, error);
          }
        }
        if (members.length > 0) {
          try {
            await send(`⚠️ Đã thực thi anti join - đã kick ${members.length} thành viên mới`);
          } catch {
            // ignore send errors
          }
        }
      },
      "log:thread-image": async () => {
        logInfo(logger, `[Anti-BoxImage] Nhận event log:thread-image cho thread ${threadID}`);
        const boximageData = dataManager.readData("boximage");
        const findAnti = boximageData.find((item) => item.threadID === threadID);
        logInfo(
          logger,
          `[Anti-BoxImage] Trạng thái anti: ${findAnti ? "BẬT" : "TẮT"} | isAdminAuthor=${String(
            isAdminAuthor
          )}`
        );
        const updateImage = async () => {
          const imageUrl = (logMessageData.url as string) || "";
          const hasUrl = imageUrl.trim();
          if (!hasUrl) {
            delete dataThread.imageSrc;
            logInfo(logger, `Image của nhóm [${dataThread.threadName || "Unknown"}] đã bị xóa`);
          } else {
            dataThread.imageSrc = imageUrl;
            logInfo(logger, `Image của nhóm [${dataThread.threadName || "Unknown"}] đã được cập nhật`);
          }
          await threadData.update(
            threadID,
            {
              threadInfo: dataThread,
              imageSrc: hasUrl ? imageUrl : ""
            } as unknown as ThreadInfoRecord
          );
        };
        if (findAnti) {
          if (isAdminAuthor) {
            const imageUrl = (logMessageData.url as string) || "";
            logInfo(logger, `[Anti-BoxImage] QTV/bot đổi ảnh, url mới=${imageUrl}`);
            if (imageUrl.trim()) {
              findAnti.imageSrc = imageUrl;
            }
            dataManager.writeData("boximage", boximageData);
            await updateImage();
          } else {
            const revertUrl = findAnti.imageSrc || dataThread.imageSrc;
            logInfo(
              logger,
              `[Anti-BoxImage] Member đổi ảnh, revertUrl=${revertUrl || "EMPTY"}, hasStream=${String(
                !!utilsCtx.stream
              )}`
            );
            if (revertUrl && utilsCtx.stream) {
              try {
                const imageStream = await utilsCtx.stream(revertUrl, "jpg");
                await client.changeGroupImage(imageStream as unknown as string, threadID);
                logInfo(logger, "[Anti-BoxImage] Đã revert ảnh nhóm thành công");
              } catch (err) {
                logError(logger, "[Anti-BoxImage] Lỗi khi revert ảnh nhóm:", err);
              }
            } else if (!revertUrl) {
              logInfo(logger, "[Anti-BoxImage] Không có revertUrl để đổi lại ảnh");
            } else if (!utilsCtx.stream) {
              logInfo(logger, "[Anti-BoxImage] utils.stream không tồn tại trong ctx.utils");
            }
            await client.sendMessage("⚠️ Bạn không có quyền đổi ảnh nhóm", threadID);
          }
        } else {
          logInfo(logger, "[Anti-BoxImage] Anti ảnh đang TẮT, chỉ cập nhật threadInfo");
          await updateImage();
        }
      },
      "log:tagall": async () => {
        const tagallData = dataManager.readData("tagall");
        if (!tagallData[threadID] || isAdminAuthor) return;
        const authorStr = String(author);
        const name =
          ((await userData.getName(authorStr).catch(() => "Người dùng")) as string) ||
          "Người dùng";
        const threadName = dataThread.threadName || "Nhóm";
        const messageBody = ctx.event.body || "không có nội dung";
        try {
          await client.sendMessage(
            `⚠️ Người dùng ${name} đã tagall nhóm ${threadName} với tin nhắn: ${messageBody}\n\nNgười dùng sẽ bị kick ngay lập tức`,
            threadID
          );
          await client.removeUserFromGroup(authorStr, threadID);
          await client.sendMessage(
            `⚠️ Đã kick thành viên ${name} do tag all`,
            threadID
          );
        } catch (error) {
          logError(logger, `[Anti-Tagall] Lỗi khi xử lý tagall:`, error);
          console.error(`[Anti-Tagall] Lỗi khi xử lý tagall:`, error);
        }
      }
    };
    const logType = String(logMessageType || "");
    if (handlers[logType]) {
      await handlers[logType]().catch(console.error);
    }
  },
  onLoad: async () => {
    new AntiDataManager();
  },
  onReply: async function ({
    client,
    event,
    args,
    Reply,
    threadData
  }: CommandOnReplyContext & { threadData: ThreadDataModel }): Promise<void> {
    const { senderID, threadID, messageID } = event;
    const { author, role } = Reply;
    if (author !== senderID) {
      await client.sendMessage(
        "❎ Bạn không phải người dùng lệnh",
        threadID,
        messageID
      );
      return;
    }
    const dataManager = new AntiDataManager();
    const threadInfo = (await threadData.get(threadID))!.threadInfo as ThreadInfoRecord;
    const options = args.map((item: string) =>
      isNaN(Number(item)) ? item.toLowerCase() : item
    );
    const botConfig = getConfig() as unknown as BotConfig;
    const senderIDStr = String(senderID);
    const privileged = isBotPrivileged(senderIDStr, botConfig);
    const permssion = typeof role === "number" ? role : privileged ? 2 : 0;
    const groupedResults: {
      bật: string[];
      tắt: string[];
      errors: string[];
    } = {
      bật: [],
      tắt: [],
      errors: []
    };
    for (const option of options) {
      const result = await handleAnti(option, {
        client,
        event: event as ExtendedMessageEvent,
        dataManager,
        threadInfo,
        permssion,
        collectResult: true,
        privileged
      });
      if (result) {
        if (result.message.includes("❎") || result.message.includes("⚠️")) {
          groupedResults.errors.push(result.message);
        } else if (result.message.includes("Bật")) {
          const featureName = result.message.replace("☑️ Bật anti ", "");
          groupedResults.bật.push(featureName);
        } else if (result.message.includes("Tắt")) {
          const featureName = result.message.replace("☑️ Tắt anti ", "");
          groupedResults.tắt.push(featureName);
        }
      }
    }
    const messages: string[] = [];
    if (groupedResults.bật.length > 0) {
      messages.push(`☑️ Bật anti ${groupedResults.bật.join(", ")}`);
    }
    if (groupedResults.tắt.length > 0) {
      messages.push(`☑️ Tắt anti ${groupedResults.tắt.join(", ")}`);
    }
    if (groupedResults.errors.length > 0) {
      messages.push(...groupedResults.errors);
    }
    if (messages.length > 0) {
      const combinedMessage = messages.join("\n");
      await client.sendMessage(combinedMessage, threadID, messageID);
    }
  },
  handleAnti,
  onChat: async function ({
    client: api,
    event,
    threadData,
    userData,
    config,
    logger,
    unsend
  }: CommandOnChatContext & {
    threadData: ThreadDataModel;
    userData: UserDataModel;
    config: BotConfig;
    logger: Logger;
    unsend: (messageID: string, threadID: string) => Promise<void>;
  }) {
    try {
      const { threadID, senderID, body, messageID } = event;
      const dataManager = new AntiDataManager();
      const linkData = dataManager.readData("link");
      if (linkData[threadID] === true) {
        try {
          const data = (await threadData.get(threadID))?.threadInfo as ThreadInfoRecord | undefined;
          if (data) {
            const adminIDs =
              data.adminIDs?.map((admin: { id: string }) => String(admin.id)) || [];
            const adminBot = Array.isArray(config.ADMIN)
              ? config.ADMIN.map(String)
              : config.ADMIN
                ? [String(config.ADMIN)]
                : [];
            const botID = String(api.getCurrentUserID());
            const OWNER = Array.isArray(config.OWNER)
              ? config.OWNER.map(String)
              : config.OWNER
                ? [String(config.OWNER)]
                : [];
            const senderIDStr = String(senderID);
            const isAdminOrBot =
              senderIDStr === botID ||
              adminIDs.includes(senderIDStr) ||
              adminBot.includes(senderIDStr) ||
              OWNER.includes(senderIDStr);
            if (!isAdminOrBot) {
              const linkRegex =
                /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/[^\s]*)?)/gi;
              const hasLink = linkRegex.test(body || "");
              if (hasLink) {
                const userName =
                  ((await userData.get(senderIDStr).catch(() => null)) as { name?: string } | null)
                    ?.name ||
                  "Người dùng";
                try {
                  if (messageID) {
                    await unsend(messageID, threadID).catch(() => { });
                  }
                  await api.removeUserFromGroup(senderIDStr, threadID);
                  await api
                    .sendMessage(
                      {
                        body: `⚠️ Đã kick ${userName} do gửi link trong nhóm.`
                      },
                      threadID
                    )
                    .catch(() => { });
                } catch (error) {
                  logError(logger, "[Anti-Link] Lỗi khi kick người dùng:", error);
                }
                return;
              }
            }
          }
        } catch (error) {
          logError(logger, "[Anti-Link] Lỗi khi xử lý anti link:", error);
        }
      }
      const globalAny = global as typeof global & {
        threadSpamData?: Record<string, Map<string, unknown>>;
      };
      if (!globalAny.threadSpamData) {
        globalAny.threadSpamData = {};
      }
      if (!globalAny.threadSpamData[threadID]) {
        globalAny.threadSpamData[threadID] = new Map<string, unknown>();
      }
      const spamData = dataManager.readData("spam");
      const findAnti = spamData[threadID] === true;
      if (!findAnti) return;
      const senderIDStr = String(senderID);
      const threadSpamMap = globalAny.threadSpamData[threadID] as Map<
        string,
        { count: number; startTime: number; lastMessage: string }
      >;
      try {
        const data = (await threadData.get(threadID))?.threadInfo as ThreadInfoRecord | undefined;
        if (!data) return;
        const adminIDs = data.adminIDs?.map((admin: { id: string }) => String(admin.id)) || [];
        const adminBot = Array.isArray(config.ADMIN)
          ? config.ADMIN.map(String)
          : config.ADMIN
            ? [String(config.ADMIN)]
            : [];
        const botID = String(api.getCurrentUserID());
        const OWNER = Array.isArray(config.OWNER)
          ? config.OWNER.map(String)
          : config.OWNER
            ? [String(config.OWNER)]
            : [];
        const isAdminOrBot =
          senderIDStr === botID ||
          adminIDs.includes(senderIDStr) ||
          adminBot.includes(senderIDStr) ||
          OWNER.includes(senderIDStr);
        if (isAdminOrBot) return;
        if (!threadSpamMap.has(senderIDStr)) {
          threadSpamMap.set(senderIDStr, {
            count: 0,
            startTime: Date.now(),
            lastMessage: body || ""
          });
        }
        const userSpamData = threadSpamMap.get(senderIDStr) as {
          count: number;
          startTime: number;
          lastMessage: string;
        };
        const currentTime = Date.now();
        const messageBody = String(body || "").trim();
        if (currentTime - userSpamData.startTime > 8000) {
          userSpamData.count = 0;
          userSpamData.startTime = currentTime;
        }
        try {
          if (messageBody && messageBody === userSpamData.lastMessage) {
            userSpamData.count++;
            if (userSpamData.count > 6 && currentTime - userSpamData.startTime <= 8000) {
              await handleSpamKick(api, senderIDStr, threadID, userData, "spam lặp lại tin nhắn");
              threadSpamMap.delete(senderIDStr);
              return;
            }
          } else {
            userSpamData.count = 1;
            userSpamData.startTime = currentTime;
            userSpamData.lastMessage = messageBody;
          }
        } catch (kickError) {
          logError(logger, "[Anti-Spam] Lỗi khi xử lý spam:", kickError);
          console.error("[Anti-Spam] Lỗi khi xử lý spam:", kickError);
        }
      } catch (dataError) {
        logError(logger, "[Anti-Spam] Lỗi khi xử lý dữ liệu nhóm:", dataError);
        console.error("[Anti-Spam] Lỗi khi xử lý dữ liệu nhóm:", dataError);
      }
    } catch (error) {
      logError(logger, "[Anti-Spam] Lỗi chung:", error);
      console.error("[Anti-Spam] Lỗi chung:", error);
    }
  },
  onCall: async function ({
    client,
    permission,
    args,
    event,
    threadData,
    config,
    main,
    commandName
  }: CommandOnCallContext & {
    threadData: ThreadDataModel;
    config: BotConfig;
    main: MainData;
  }) {
    const permssion: number = (permission ?? 0) as number;
    const { threadID, senderID, messageID } = event;
    try {
      const dataManager = new AntiDataManager();
      const threadInfo = (await threadData.get(threadID))?.threadInfo as
        | {
          threadID?: string;
          threadName?: string;
          adminIDs: Array<{ id: string } | { id: string;[key: string]: unknown }>;
          [key: string]: unknown;
        }
        | null;
      if (!threadInfo) return;
      const senderIDStr = String(senderID);
      const privileged = isBotPrivileged(senderIDStr, config);
      const permValue = privileged ? 2 : permssion;
      if (args.length > 0) {
        const option = String(args[0]).toLowerCase();
        await handleAnti(option, {
          client,
          event: event as ExtendedMessageEvent,
          dataManager,
          threadInfo,
          permssion: permValue,
          privileged
        });
        return;
      }
      const getStatus = (condition: boolean) => (condition ? "bật" : "tắt");
      const boxnameData = dataManager.readData("boxname");
      const boximageData = dataManager.readData("boximage");
      const nicknameData = dataManager.readData("nickname");
      const antioutData = dataManager.readData("antiout");
      const emojiData = dataManager.readData("emoji");
      const themeData = dataManager.readData("theme");
      const qtvData = dataManager.readData("qtv");
      const joinData = dataManager.readData("join");
      const spamData = dataManager.readData("spam");
      const unsendData = dataManager.readData("unsend");
      const tagallData = dataManager.readData("tagall");
      const linkData = dataManager.readData("link");
      const threadStatuses: Record<string, boolean> = {
        boxname: boxnameData.some((item: { threadID: string | number }) => item.threadID === threadID),
        boximage: boximageData.some((item: { threadID: string | number }) => item.threadID === threadID),
        nickname: nicknameData.some((item: { threadID: string | number }) => item.threadID === threadID),
        antiout: antioutData[threadID] || false,
        antiEmoji: emojiData[threadID]?.enabled || false,
        antiTheme: themeData[threadID]?.enabled || false,
        antiQtv: qtvData[threadID] || false,
        antijoin: joinData[threadID] || false,
        antiSpam: spamData[threadID] || false,
        antiUnsend: unsendData[threadID] || false,
        antiTagall: tagallData[threadID] || false,
        antilink: linkData[threadID] || false
      };
      const statusList = Object.entries(threadStatuses).map(
        ([key, value], index: number) => {
          const num = index + 1;
          const name = key.replace(/^anti/, "").toLowerCase();
          return `${num}. Anti ${name}: ${getStatus(value)}`;
        }
      );
      const responseMessage = [
        "[ Anti Change Info Group ]",
        "",
        ...statusList,
        "",
        `📌 Reply (phản hồi) theo số hoặc tên để thay đổi trạng thái, hoặc sử dụng \`${config.PREFIX}anti [số/tên]\` để thay đổi trực tiếp`
      ].join("\n");
      client.sendMessage(
        responseMessage,
        threadID,
        (err?: Error, info?: SendMessageInfoLite) => {
          if (err) {
            client.sendMessage("❎ Lỗi xảy ra!", threadID);
            return;
          }
          if (info?.messageID) {
            main.onReply.set(info.messageID, {
              commandName,
              author: senderID,
              messageID: info.messageID,
              permssion
            });
          }
        },
        messageID
      );
    } catch (error) {
      console.error("Anti command error:", error);
      client.sendMessage("❎ Đã xảy ra lỗi!", threadID);
    }
  }
} as unknown as Command;

export default antiCommand;
