import type { Command, CommandOnCallContext, CommandOnReplyContext, FacebookClient } from "@types";
import { sleep } from "@utils/sleep";

interface PendingEntry {
  threadID: string;
  name?: string;
  isGroup?: boolean;
  [key: string]: any;
}

interface PendingReplyData {
  commandName: string;
  messageID: string;
  author: string;
  pending: PendingEntry[];
  [key: string]: unknown;
}

function buildNickname(config: any): string {
  const prefix = config?.PREFIX ? `『 ${config.PREFIX} 』 ⪼ ` : "";
  const botName = config?.BOTNAME || "donix bot";
  return `${prefix}${botName}`;
}

function normalizePendingToThreadInfo(pendingEntry: PendingEntry): any {
  
  return {
    threadID: pendingEntry.threadID,
    threadName: pendingEntry.name || "Undefined Group Name",
    participantIDs: pendingEntry.participantIDs || [],
    userInfo: Array.isArray(pendingEntry.participants)
      ? pendingEntry.participants.map((p: any) => ({
        id: p?.id || p?.userID || p?.participantID || "",
        name: p?.name || p?.fullName || "Unknown User",
        gender: p?.gender || null,
      }))
      : [],
    isGroup: pendingEntry.isGroup ?? true,
    emoji: pendingEntry.emoji || "👍",
    color: pendingEntry.color || "#0084FF",
    threadTheme: pendingEntry.threadTheme || {
      id: "",
      accessibility_label: "",
    },
    nicknames: pendingEntry.nicknames || {},
    adminIDs: pendingEntry.adminIDs || [],
    approvalMode: pendingEntry.approvalMode || false,
    imageSrc: pendingEntry.imageSrc || "",
    inviteLink: pendingEntry.inviteLink || "",
  };
}

async function ensureThreadStored(
  threadID: string,
  threadInfo: any,
  threadData: any,
  userData: any,
  logger: any
): Promise<void> {
  if (!threadInfo) {
    return;
  }

  const dataThread = {
    threadID: threadInfo.threadID || threadID,
    threadName: threadInfo.threadName || "Undefined Group Name",
    participantIDs: threadInfo.participantIDs || [],
    userInfo: threadInfo.userInfo || [],
    unreadCount: 0,
    messageCount: 0,
    timestamp: Date.now().toString(),
    muteUntil: null,
    isGroup: threadInfo.isGroup ?? true,
    isSubscribed: true,
    isArchived: false,
    folder: "INBOX",
    cannotReplyReason: null,
    eventReminders: [],
    emoji: threadInfo.emoji || "👍",
    color: threadInfo.color || "#0084FF",
    threadTheme: {
      id: threadInfo?.threadTheme?.id || "",
      accessibility_label: threadInfo?.threadTheme?.accessibility_label || "",
    },
    nicknames: threadInfo.nicknames || {},
    adminIDs: threadInfo.adminIDs || [],
    approvalMode: threadInfo.approvalMode || false,
    approvalQueue: [],
    reactionsMuteMode: "reactions_not_muted",
    mentionsMuteMode: "mentions_not_muted",
    isPinProtected: false,
    relatedPageThread: null,
    snippet: "",
    snippetSender: "",
    snippetAttachments: [],
    serverTimestamp: Date.now().toString(),
    imageSrc: threadInfo.imageSrc || "",
    isCanonicalUser: false,
    isCanonical: false,
    recipientsLoadable: true,
    hasEmailParticipant: false,
    readOnly: false,
    canReply: true,
    lastMessageType: "message",
    lastReadTimestamp: Date.now().toString(),
    threadType: 2,
    inviteLink: threadInfo.inviteLink || "",
  };

  const formThread = {
    threadName: threadInfo.threadName,
    threadInfo: dataThread,
    banned: {},
    settings: {},
    data: {},
  };

  await threadData.create(threadID, formThread);

  if (Array.isArray(dataThread.userInfo)) {
    for (const user of dataThread.userInfo) {
      const userID = String(user?.id ?? "");
      if (!userID) continue;

      const existing = await userData.get(userID);
      if (!existing) {
        const newUserData = {
          name: user?.name || "Undefined User",
          userInfo: user,
          setting: {},
          gender: user?.gender || null,
          data: {},
        };

        await userData.create(userID, newUserData);
        if (logger?.success) {
          logger.success(`New user: ${user?.name || "Undefined User"} (${userID})`);
        }
        await sleep(300);
      }
    }
  }
}

function parseIndices(input: string, max: number): { indices: number[]; invalid: string[] } {
  const normalized = input
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const indices: number[] = [];
  const invalid: string[] = [];

  for (const token of normalized) {
    const num = Number(token);
    if (!Number.isInteger(num) || num <= 0 || num > max) {
      invalid.push(token);
      continue;
    }
    if (!indices.includes(num)) {
      indices.push(num);
    }
  }

  return { indices, invalid };
}

async function approvePending(
  entries: PendingEntry[],
  ctx: CommandOnReplyContext,
  nickname: string
): Promise<number> {
  const { threadData, userData, logger, client } = ctx;
  let count = 0;

  for (const pendingRequest of entries) {
    const requestThreadID = String(pendingRequest?.threadID || "");
    if (!requestThreadID) {
      console.error("Invalid pending request: missing threadID", pendingRequest);
      continue;
    }

    try {
      let threadInfo = null;
      try {
        threadInfo = await threadData.info(requestThreadID);
      } catch (infoError) {
        
        if (logger?.warn) {
          logger.warn(`Thread ${requestThreadID} not found in database, will create new entry`);
        }
      }

      if (threadInfo) {
        await ensureThreadStored(requestThreadID, threadInfo, threadData, userData, logger);
      } else if (pendingRequest) {
        
        const normalizedInfo = normalizePendingToThreadInfo(pendingRequest);
        await ensureThreadStored(requestThreadID, normalizedInfo, threadData, userData, logger);
      }

      if (client) {
        try {
          await (client as any).changeNickname(
            nickname,
            requestThreadID,
            client.getCurrentUserID()
          );
        } catch (nicknameError) {
          
          if (logger?.warn) {
            const errorMsg = nicknameError instanceof Error ? nicknameError.message : String(nicknameError);
            logger.warn(`Failed to change nickname for thread ${requestThreadID}: ${errorMsg}`);
          }
        }

        try {
          await client.sendMessage("☑️ Phê duyệt thành công", requestThreadID);
          count++;

          if (logger?.success) {
            logger.success(
              `New thread: ${(threadInfo && threadInfo.threadName) || pendingRequest?.name || "Unknown"} (${requestThreadID})`
            );
          }
        } catch (sendError: any) {
          const errorMsg = sendError?.errorDescription || sendError?.message || String(sendError);
          console.error(`Failed to send approval message to thread ${requestThreadID}:`, errorMsg);
          if (logger?.error) {
            logger.error(`Failed to send message to ${requestThreadID}: ${errorMsg}`);
          }
          
        }
      } else {
        console.error(`Client not available for thread ${requestThreadID}`);
        if (logger?.error) {
          logger.error(`Client not available for thread ${requestThreadID}`);
        }
      }

      await sleep(500);
    } catch (error) {
      console.error(`Error processing thread ${requestThreadID}:`, error);
      if (logger?.error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error processing thread ${requestThreadID}: ${errorMsg}`);
      }
    }
  }

  return count;
}

async function rejectPending(
  entries: PendingEntry[],
  client: FacebookClient,
  message: string,
  logger?: any
): Promise<number> {
  let count = 0;

  for (const pendingRequest of entries) {
    const requestThreadID = String(pendingRequest.threadID);
    try {
      if (client) {
        try {
          await client.sendMessage(
            `❌ ${message} ${pendingRequest.name || "Người dùng không xác định"}`,
            requestThreadID
          );
          count++;
        } catch (sendError: any) {
          const errorMsg = sendError?.errorDescription || sendError?.message || String(sendError);
          console.error(`Failed to send rejection message to thread ${requestThreadID}:`, errorMsg);
          if (logger?.error) {
            logger.error(`Failed to send rejection message to ${requestThreadID}: ${errorMsg}`);
          }
          
        }
      } else {
        console.error(`Client not available for thread ${requestThreadID}`);
      }
      await sleep(300);
    } catch (error) {
      console.error(`Error rejecting thread ${requestThreadID}:`, error);
      if (logger?.error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error rejecting thread ${requestThreadID}: ${errorMsg}`);
      }
    }
  }

  if (logger?.success && count > 0) {
    logger.success("PENDING", `Rejected ${count} request(s)`);
  }

  return count;
}

async function handlePendingReply(ctx: CommandOnReplyContext): Promise<void> {
  const { event, Reply, config, client } = ctx;
  const { body = "", threadID, messageID, senderID } = event;

  const replyData = Reply as PendingReplyData;

  if (!replyData || senderID !== replyData.author) {
    return;
  }

  const lowercase = body.trim().toLowerCase();
  const nickname = buildNickname(config);

  if (lowercase === "all" || lowercase === "a") {
    const count = await approvePending(replyData.pending, ctx, nickname);
    await client.sendMessage(
      `[ PENDING ] - Đã phê duyệt tất cả ${count} yêu cầu`,
      threadID,
      messageID
    );
    return;
  }

  if (lowercase === "call" || lowercase === "cancelall") {
    const count = await rejectPending(
      replyData.pending,
      client,
      "Đã từ chối yêu cầu từ"
    );
    await client.sendMessage(
      `[ PENDING ] - Đã từ chối tất cả ${count} yêu cầu`,
      threadID,
      messageID
    );
    return;
  }

  if (lowercase.startsWith("c")) {
    const { indices, invalid } = parseIndices(
      lowercase.slice(1),
      replyData.pending.length
    );
    if (invalid.length > 0) {
      await client.sendMessage(
        `❌ Các số không hợp lệ: ${invalid.join(", ")}`,
        threadID,
        messageID
      );
      return;
    }

    const targets = indices
      .map((idx) => replyData.pending[idx - 1])
      .filter((entry): entry is PendingEntry => Boolean(entry));
    const count = await rejectPending(
      targets,
      client,
      "Đã từ chối yêu cầu từ"
    );
    await client.sendMessage(
      `[ PENDING ] - Đã từ chối thành công ${count} yêu cầu`,
      threadID,
      messageID
    );
    return;
  }

  const { indices, invalid } = parseIndices(
    lowercase,
    replyData.pending.length
  );
  if (invalid.length > 0) {
    await client.sendMessage(
      `❌ Các số không hợp lệ: ${invalid.join(", ")}`,
      threadID,
      messageID
    );
    return;
  }

  if (indices.length === 0) {
    await client.sendMessage(
      `❌ Vui lòng chọn ít nhất một yêu cầu hợp lệ.`,
      threadID,
      messageID
    );
    return;
  }

  const targets = indices
    .map((idx) => replyData.pending[idx - 1])
    .filter((entry): entry is PendingEntry => Boolean(entry));
  const count = await approvePending(targets, ctx, nickname);
  await client.sendMessage(
    `[ PENDING ] - Đã phê duyệt thành công ${count} yêu cầu`,
    threadID,
    messageID
  );
}

async function sendPendingList(
  ctx: CommandOnCallContext,
  list: PendingEntry[],
  title: string
): Promise<void> {
  const { event, commandName, main, client } = ctx;
  const { threadID, messageID, senderID } = event;

  let msg = "";
  let index = 1;

  for (const entry of list) {
    msg += `${index++}. ${entry.name || "Không rõ tên"}\n${entry.threadID}\n`;
  }

  const body = `📋 ${title}: ${list.length}\n${msg}\n📩 Reply (phản hồi):\n• Số hoặc nhiều số (VD: 1 2 3) để duyệt\n• "all" hoặc "a" để duyệt tất cả\n• "c[số]" để từ chối (VD: c1 c2)\n• "call" để từ chối tất cả`;
  await client.sendMessage(
    body,
    threadID,
    (error: any, info: any) => {
      if (!error) {
        main.onReply.set(info.messageID, {
          commandName,
          messageID: info.messageID,
          author: senderID,
          pending: list,
        } as PendingReplyData);
      }
    },
    messageID
  );
}

const pendingCommand: Command = {
  name: "p",
  alias: ["pending"],
  version: "1.1.0",
  role: 3,
  desc: "Quản lý tin nhắn chờ của bot",
  category: "Admin",
  guide:
    "   + [u/-u]: Xem danh sách người dùng đang chờ duyệt\n" +
    "   + [t/-t]: Xem danh sách nhóm đang chờ duyệt\n" +
    "   + [a/-a]: Xem tất cả danh sách đang chờ duyệt\n" +
    "   + [approveall]: Duyệt tất cả yêu cầu\n" +
    "   + [rejectall]: Từ chối tất cả yêu cầu",
  cd: 5,
  prefix: true,

  async onReply(ctx: CommandOnReplyContext) {
    await handlePendingReply(ctx);
  },

  async onCall(ctx: CommandOnCallContext) {
    const { event, args, config, client } = ctx;
    const { threadID, messageID } = event;
    const action = args[0]?.toLowerCase() || "";

    if (!args.length) {
      await client.sendMessage(
        "❯ Pending user: Hàng chờ người dùng\n❯ Pending thread: Hàng chờ nhóm\n❯ Pending all: Tất cả box đang chờ duyệt\n❯ Approve all: Duyệt tất cả\n❯ Reject all: Từ chối tất cả",
        threadID,
        messageID
      );
      return;
    }

    try {
      const spam = (await client.getThreadList(100, null, ["OTHER"])) || [];
      const pending = (await client.getThreadList(100, null, ["PENDING"])) || [];
      const list = [...spam, ...pending];
      if (action === "user" || action === "u" || action === "-u") {
        const userList = list.filter((group) => !group.isGroup);
        if (userList.length === 0) {
          await client.sendMessage("[ PENDING ] - Hiện tại không có người dùng nào trong hàng chờ", threadID, messageID);
          return;
        }
        await sendPendingList(ctx, userList, "Tổng số người dùng cần duyệt");
        return;
      }

      if (action === "thread" || action === "t" || action === "-t") {
        const threadList = list.filter((group) => group.isSubscribed && group.isGroup);
        if (threadList.length === 0) {
          await client.sendMessage("[ PENDING ] - Hiện tại không có nhóm nào trong hàng chờ", threadID, messageID);
          return;
        }
        await sendPendingList(ctx, threadList, "Tổng số nhóm cần duyệt");
        return;
      }

      if (action === "all" || action === "a" || action === "-a") {
        if (list.length === 0) {
          await client.sendMessage("[ PENDING ] - Hiện tại không có User & Thread nào trong hàng chờ", threadID, messageID);
          return;
        }
        await sendPendingList(ctx, list, "Tổng số User & Thread cần duyệt");
        return;
      }

      if (action === "approveall") {
        const nickname = buildNickname(config);
        let count = 0;
        for (const pendingRequest of list) {
          try {
            await client.changeNickname(
              nickname,
              pendingRequest.threadID,
              client.getCurrentUserID()
            );
            await client.sendMessage(`❯ Admin Bot`, pendingRequest.threadID);
            count++;
            await sleep(300);
          } catch (error) {
            console.error(`Error approving ${pendingRequest.threadID}:`, error);
          }
        }
        await client.sendMessage(`[ PENDING ] - Đã phê duyệt tất cả ${count} yêu cầu`, threadID, messageID);
        return;
      }

      if (action === "rejectall") {
        const count = await rejectPending(list, client, "Đã từ chối yêu cầu từ");
        await client.sendMessage(`[ PENDING ] - Đã từ chối tất cả ${count} yêu cầu`, threadID, messageID);
        return;
      }
    } catch (error) {
      console.error("Failed to handle pending command:", error);
      await client.sendMessage("[ PENDING ] - Không thể lấy danh sách chờ", threadID, messageID);
    }
  },
};

export default pendingCommand;
