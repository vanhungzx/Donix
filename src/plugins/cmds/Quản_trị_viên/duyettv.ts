"use strict";

import type {
  ReplyData as BaseReplyData,
  Command,
  CommandOnCallContext,
  CommandOnEventContext,
  CommandOnReplyContext,
} from "@types";

interface ApprovalRequest {
  requesterID: string;
  inviterID: string | null;
  timestamp: number;
}

interface ThreadInfoWithApproval {
  approvalQueue?: ApprovalRequest[];
  adminIDs?: Array<{ id: string } | string>;
}

interface DuyetReplyData extends BaseReplyData {
  commandName: string;
  author: string;
  messageID: string;
  type?: string;
}

interface ErrorInfo {
  type: string;
  users: Array<{ name: string; inviter: string }>;
}

async function getName(userID: string | number, bot: any): Promise<string> {
  try {
    const profileInfo = await bot.getUserInfoMqtt(userID);
    return profileInfo?.name || "Unknown User";
  } catch (error) {
    console.error("Error fetching user name:", error);
    return "Unknown User";
  }
}

const duyettvCommand: Command = {
  name: "duyettv",
  alias: ["duyettv"],
  version: "1.0.0",
  role: 1,
  desc: "Duyệt hoặc từ chối thành viên trong danh sách phê duyệt",
  guide:
    "    1. Gõ {pn} duyettv để xem danh sách chờ duyệt\n" +
    "    2. Reply (phản hồi) tin nhắn kèm số thứ tự để duyệt thành viên\n" +
    "    3. Reply với 'tc' + số thứ tự để từ chối thành viên\n" +
    "    Lưu ý: Chỉ quản trị viên mới có thể sử dụng lệnh này\n\n",
  cd: 0,
  prefix: true,

  async onEvent(ctx: CommandOnEventContext): Promise<void> {
    const { client, event, userData, threadData } = ctx as any;
    const { threadID, logMessageType, logMessageData } = event;

    
    if (logMessageType === "log:approval-queue") {
      const approvalData = logMessageData as any;
      const action = String(approvalData?.action || "").toLowerCase();
      const requestId = approvalData?.recipientFbId;
      const inviterId = approvalData?.inviterFbId;
      const requestSource = approvalData?.requestSource;
      const requestTimestamp = approvalData?.requestTimestamp;

      if (!requestId) {
        return;
      }

      const thread = await threadData.get(threadID);
      const threadInfo = (thread?.threadInfo || {}) as ThreadInfoWithApproval;

      if (!threadInfo.approvalQueue) {
        threadInfo.approvalQueue = [];
      }

      const isRemoveAction =
        action === "removed" ||
        action.includes("remove") ||
        action.includes("reject") ||
        action.includes("delete");

      
      if (isRemoveAction) {
        const requestName = await getName(requestId, client);
        threadInfo.approvalQueue = threadInfo.approvalQueue.filter(
          (request) => String(request.requesterID) !== String(requestId)
        );

        await client.sendMessage(
          `❌ ${requestName} đã bị từ chối khỏi danh sách phê duyệt`,
          threadID
        );
        await threadData.update(threadID, { threadInfo });
        return;
      }

      
      const requestName = await getName(requestId, client);

      let message = "";
      
      if (requestSource === "JOIN_THROUGH_LINK" || (inviterId && String(inviterId) === String(requestId))) {
        
        message = `📝 ${requestName} đã yêu cầu tham gia nhóm qua liên kết nhóm`;
      } else if (requestSource === "ADD" && inviterId && String(inviterId) !== String(requestId)) {
        
        const inviterName = await (userData as any).getName(String(inviterId));
        message = `📝 ${requestName} đã yêu cầu tham gia nhóm qua lời mời của ${inviterName}`;
      } else {
        
        message = `📝 ${requestName} đã yêu cầu tham gia nhóm`;
      }

      
      const exists = threadInfo.approvalQueue.some(
        (request) => String(request.requesterID) === String(requestId)
      );

      if (!exists) {
        threadInfo.approvalQueue.push({
          requesterID: String(requestId),
          inviterID: inviterId ? String(inviterId) : null,
          timestamp: requestTimestamp || Date.now(),
        });
        await threadData.update(threadID, { threadInfo });
      }

      await client.sendMessage(message, threadID);
      return;
    }

    
    if (logMessageType === "log:subscribe") {
      const memJoin = (logMessageData?.addedParticipants || []).map(
        (info: any) => info.userFbId
      );

      const thread = await threadData.get(threadID);
      const threadInfo = (thread?.threadInfo || {}) as ThreadInfoWithApproval;

      if (threadInfo.approvalQueue) {
        let modified = false;

        for (const userID of memJoin) {
          const index = threadInfo.approvalQueue.findIndex(
            (request) => String(request.requesterID) === String(userID)
          );

          if (index !== -1) {
            threadInfo.approvalQueue.splice(index, 1);
            modified = true;
          }
        }

        if (modified) {
          await threadData.update(threadID, { threadInfo });
        }
      }
    }
  },

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { client, event, threadData, commandName, main } = ctx as any;

    try {
      const { threadID, messageID } = event;

      const thread = await threadData.get(threadID);
      const threadInfo = (thread?.threadInfo || {}) as ThreadInfoWithApproval;

      const adminIDs = (threadInfo.adminIDs || []).map((admin: any) =>
        String(admin.id || admin)
      );

      const botID = String(client.getCurrentUserID?.() || client.id || "");

      if (!adminIDs.includes(botID)) {
        await client.sendMessage(
          "⚠️ Cần quyền quản trị viên! Vui lòng thử lại",
          threadID,
          messageID
        );
        return;
      }

      const approvalQueue = threadInfo.approvalQueue || [];

      if (approvalQueue.length === 0) {
        await client.sendMessage(
          "❎ Hiện tại không có thành viên nào trong danh sách phê duyệt!",
          threadID,
          messageID
        );
        return;
      }

      const approvalList = await Promise.all(
        approvalQueue.map(async (item, index) => {
          const requesterName = await getName(item.requesterID, client);
          return `${index + 1}. ${requesterName}\n📝 UID: ${item.requesterID}`;
        })
      );

      const message =
        `📝 Danh sách chờ phê duyệt:\n\n${approvalList.join("\n\n")}\n\n` +
        `📌 Reply số thứ tự để duyệt\n❌ Reply 'tc' + số thứ tự để từ chối`;

      await client.sendMessage(
        message,
        threadID,
        (err: any, res: any) => {
          if (err) {
            console.error(err);
            return;
          }

          if (res?.messageID) {
            main.onReply.set(res.messageID, {
              commandName: commandName || "duyettv",
              author: event.senderID,
              messageID: res.messageID,
              type: "reply",
            } as DuyetReplyData);
          }
        },
        messageID
      );
    } catch (error: any) {
      console.error("Error in duyettv onCall:", error);
      await client.sendMessage(
        "❌ Đã xảy ra lỗi khi thực hiện lệnh.",
        ctx.event.threadID,
        ctx.event.messageID
      );
    }
  },

  async onReply(ctx: CommandOnReplyContext): Promise<void> {
    const { client, userData, Reply, event, threadData } = ctx as any;

    try {
      const { threadID, messageID, senderID, body } = event;

      const thread = await threadData.get(threadID);
      const threadInfo = (thread?.threadInfo || {}) as ThreadInfoWithApproval;

      const adminIDs = (threadInfo.adminIDs || []).map((admin: any) =>
        String(admin.id || admin)
      );

      if (!adminIDs.includes(String(senderID))) {
        await client.sendMessage(
          "❎ Chỉ quản trị viên mới có thể duyệt/từ chối thành viên!",
          threadID,
          messageID
        );
        return;
      }

      const replyData = Reply as DuyetReplyData;

      if (replyData.type === "reply") {
        const bodyText = String(body || "").toLowerCase().trim();
        const isReject = bodyText.startsWith("tc");

        const numbers = (isReject ? bodyText.slice(2) : bodyText)
          .split(" ")
          .map((num) => parseInt(num.trim(), 10))
          .filter(
            (num) =>
              !isNaN(num) &&
              num > 0 &&
              num <= (threadInfo.approvalQueue?.length || 0)
          );

        if (numbers.length === 0) {
          await client.sendMessage(
            "❎ Vui lòng chọn một con số có trong danh sách!",
            threadID,
            messageID
          );
          return;
        }

        if (client.unsendMessage && replyData.messageID) {
          try {
            await client.unsendMessage(replyData.messageID, threadID);
          } catch {
            
          }
        }

        const success: Array<{ name: string; inviter: string }> = [];
        const failed: ErrorInfo[] = [];

        numbers.sort((a, b) => b - a);

        for (const number of numbers) {
          const index = number - 1;
          const approvalQueue = threadInfo.approvalQueue || [];

          if (index < 0 || index >= approvalQueue.length) {
            continue;
          }

          const approvalItem = approvalQueue[index];
          if (!approvalItem) {
            continue;
          }

          const requesterID = approvalItem.requesterID;
          const requesterName = await getName(requesterID, client);
          const inviterID = approvalItem.inviterID;

          let inviterName = "Không có";
          if (inviterID) {
            try {
              inviterName = await (userData as any).getName(String(inviterID));
            } catch {
              inviterName = "Không có";
            }
          }

          try {
            await client.approvalRequest(threadID, [requesterID], !isReject);

            success.push({ name: requesterName, inviter: inviterName });
            approvalQueue.splice(index, 1);
          } catch (error: any) {
            const errorType =
              error?.errorDescription || error?.message || "Lỗi không xác định";

            const existingError = failed.find(
              (err) => err.type === errorType
            );

            if (existingError) {
              existingError.users.push({
                name: requesterName,
                inviter: inviterName,
              });
            } else {
              failed.push({
                type: errorType,
                users: [{ name: requesterName, inviter: inviterName }],
              });
            }
          }
        }

        await threadData.update(threadID, { threadInfo });

        let responseMessage = "";

        if (success.length > 0) {
          responseMessage +=
            `${isReject ? "❌ Đã từ chối" : "✅ Đã duyệt"} thành viên:\n` +
            `${success
              .map(
                (user) =>
                  `👤 ${user.name} (Được mời bởi: ${user.inviter})`
              )
              .join("\n")}\n\n`;
        }

        if (failed.length > 0) {
          for (const error of failed) {
            responseMessage +=
              `⚠️ Không thể ${isReject ? "từ chối" : "duyệt"
              } thành viên:\n` +
              `${error.users
                .map(
                  (user) =>
                    `👤 ${user.name} (Được mời bởi: ${user.inviter})`
                )
                .join("\n")}\nLý do: ${error.type}\n\n`;
          }
        }

        if (responseMessage.trim().length > 0) {
          await client.sendMessage(responseMessage, threadID, messageID);
        }
      }
    } catch (error: any) {
      console.error("Error in duyettv onReply:", error);
      await client.sendMessage(
        "❌ Đã xảy ra lỗi khi thực hiện phản hồi.",
        event.threadID
      );
    }
  },
};

export default duyettvCommand;
