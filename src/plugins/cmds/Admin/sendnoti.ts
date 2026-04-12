"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnReplyContext,
  MessageForm,
  ReplyData,
  UserDataModel,
} from "@types";
import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { TEMP_DIR } from "../../../core/storagePath";

let atmDir: string[] = [];

interface Attachment {
  type: "photo" | "video" | "audio";
  url: string;
}

interface ThreadInfoWithAdmins {
  adminIDs?: Array<{ id: string } | string>;
  name?: string;
  threadName?: string;
}

interface ThreadDataWithInfo {
  threadInfo?: ThreadInfoWithAdmins;
}

interface SendNotiReply {
  type: "sendnoti" | "reply";
  threadID: string;
  messID?: string;
  originalSender?: string;
  adminGroupID?: string;
}

interface MessageInfo {
  messageID?: string;
}

interface ExtendedThreadDataModel {
  idAll: () => Promise<string[]>;
  get: (threadID: string | number) => Promise<ThreadDataWithInfo | null>;
  [key: string]: unknown;
}

function fmtNoti(adminName: string, content: string): string {
  return [
    "[ Thông Báo Admin ]",
    ``,
    `👤 Từ Admin: ${adminName}`,
    "📝 Nội dung: " + content,
    "",
    "📌 Reply tin nhắn này để phản hồi",
  ].join("\n");
}

function fmtUserFeedback(userName: string, threadName: string, content: string): string {
  return [
    "[ Phản Hồi Thông Báo ]",
    ``,
    `👤 Người dùng: ${userName}`,
    `👥 Nhóm: ${threadName}`,
    "💬 Nội dung: " + content,
    "",
    "📌 Reply tin nhắn này để trả lời người dùng",
  ].join("\n");
}

function fmtAdminReply(adminName: string, content: string): string {
  return [
    "[ Phản Hồi Từ Admin ]",
    ``,
    `👤 Admin: ${adminName}`,
    "💬 Nội dung: " + content,
    "",
    "📌 Reply tin nhắn này để tiếp tục trao đổi",
  ].join("\n");
}

interface AttachmentData {
  body: string;
  attachment?: Readable[];
}

async function getAtm(attachments: Attachment[], text: string): Promise<AttachmentData> {
  const tempDir = TEMP_DIR();
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const savedAttachments: Readable[] = [];

  for (let i = 0; i < attachments.length; i++) {
    const a = attachments[i];
    if (a && (a.type === "photo" || a.type === "video" || a.type === "audio") && a.url) {
      try {
        const res = await axios.get(a.url, { responseType: "stream" });
        const ts = Date.now();
        const ext = a.type === "photo" ? "jpg" : a.type === "video" ? "mp4" : "mp3";
        const fileName = `reply_${ts}_${i}.${ext}`;
        const filePath = path.join(tempDir, fileName);

        const writer = fs.createWriteStream(filePath);
        res.data.pipe(writer);

        await new Promise<void>((resolve, reject) => {
          writer.on("finish", resolve);
          writer.on("error", reject);
        });

        savedAttachments.push(fs.createReadStream(filePath));
        atmDir.push(filePath);
      } catch {
        // ignore
      }
    }
  }

  return { body: text, attachment: savedAttachments };
}

const sendNotiCommand: Command = {
  name: "sendnoti",
  alias: ["noti", "send"],
  version: "1.1.0",
  role: 3,
  desc: "Gửi thông báo đến tất cả nhóm",
  guide: "{pn} sendnoti <tin nhắn>\n{pn} sendnoti (reply media) <tin nhắn>",
  cd: 0,
  prefix: true,

  onReply: async function (rawCtx: CommandOnReplyContext): Promise<void> {
    const ctx = rawCtx as CommandOnReplyContext & {
      client: {
        sendMessage: (
          form: unknown,
          threadID: string,
          callback?: (err?: Error, info?: MessageInfo) => void
        ) => Promise<unknown>;
      };
      event: {
        threadID: string;
        messageID: string;
        senderID: string;
        body?: string;
        attachments?: Attachment[];
      };
      config: { BOX_ADMIN: string };
      userData: UserDataModel;
      threadData: ExtendedThreadDataModel;
      main: { onReply: Map<string, ReplyData> };
      commandName: string;
      Reply: SendNotiReply;
    };

    const { client, event, config, userData, threadData, main, commandName } = ctx;
    const Reply = ctx.Reply;
    const { threadID, messageID, senderID, body } = event;

    const ADMIN_GROUP_ID = config.BOX_ADMIN;
    const targetAdminGroupID = Reply.adminGroupID || ADMIN_GROUP_ID;

    try {
      // Keep reply flow direction stable:
      // - "sendnoti": user/group -> admin box
      // - "reply": admin box -> original group
      if (Reply.type === "sendnoti") {
        if (Reply.threadID && String(threadID) !== String(Reply.threadID)) return;
        if (Reply.originalSender && String(senderID) !== String(Reply.originalSender)) return;
      }
      if (Reply.type === "reply" && String(threadID) !== String(targetAdminGroupID)) return;

      const name = (await userData.getName(senderID)) || "Người dùng";
      const thread = await threadData.get(threadID);
      const info = thread?.threadInfo as ThreadInfoWithAdmins | undefined;
      const threadName = info?.name || info?.threadName || "Unknown";

      switch (Reply.type) {
        case "sendnoti": {
          const text = fmtUserFeedback(name, threadName, body || "(không có nội dung)");
          const attachments = (event.attachments || []) as Attachment[];

          const msgData = (attachments.length
            ? await getAtm(attachments, text)
            : { body: text }) as MessageForm;

          await new Promise<void>((resolve) => {
            client.sendMessage(msgData, targetAdminGroupID, async (err?: Error, infoMsg?: MessageInfo) => {
              try {
                for (const p of atmDir) if (fs.existsSync(p)) await fs.promises.unlink(p);
              } catch {
                // ignore
              }
              atmDir = [];

              if (!err && infoMsg?.messageID) {
                main.onReply.set(infoMsg.messageID, {
                  commandName,
                  author: senderID,
                  type: "reply",
                  messageID: infoMsg.messageID,
                  messID: messageID,
                  threadID,
                  originalSender: senderID,
                  adminGroupID: targetAdminGroupID,
                });
              }

              resolve();
            });
          });

          break;
        }

        case "reply": {
          const adminName = (await userData.getName(senderID)) || "Admin";
          const text = fmtAdminReply(adminName, body || "(không có nội dung)");
          const attachments = (event.attachments || []) as Attachment[];

          const msgData = (attachments.length
            ? await getAtm(attachments, text)
            : { body: text }) as MessageForm;

          await new Promise<void>((resolve) => {
            client.sendMessage(
              msgData,
              Reply.threadID,
              async (err?: Error, infoMsg?: MessageInfo) => {
                try {
                  for (const p of atmDir) if (fs.existsSync(p)) await fs.promises.unlink(p);
                } catch {
                  // ignore
                }
                atmDir = [];

                if (!err && infoMsg?.messageID) {
                  main.onReply.set(infoMsg.messageID, {
                    commandName,
                    author: Reply.originalSender || senderID,
                    type: "sendnoti",
                    messageID: infoMsg.messageID,
                    threadID: Reply.threadID,
                    originalSender: Reply.originalSender,
                  });
                }

                resolve();
              },
              Reply.messID
            );
          });

          break;
        }
      }
    } catch {
      // ignore
    }
  },

  onCall: async (rawCtx: CommandOnCallContext): Promise<void> => {
    const ctx = rawCtx as CommandOnCallContext & {
      client: {
        sendMessage: (
          form:
            | string
            | { body: string; attachment?: NodeJS.ReadableStream[]; mentions?: Array<{ id: string; tag: string }> },
          threadID: string,
          callback?: (err?: Error, info?: MessageInfo) => void
        ) => Promise<unknown>;
      };
      event: { threadID: string; messageID: string; senderID: string; messageReply?: { attachments?: Attachment[] } };
      args: string[];
      threadData: ExtendedThreadDataModel;
      config: { BOX_ADMIN: string };
      main: { onReply: Map<string, ReplyData> };
      commandName: string;
      userData: UserDataModel;
    };

    const { client, event, args, threadData, config, main, commandName, userData } = ctx;
    const ADMIN_GROUP_ID = config.BOX_ADMIN;

    try {
      const content = args.join(" ").trim();

      if (!content) {
        await client.sendMessage("⚠️ Vui lòng nhập nội dung thông báo!", event.threadID, event.messageID);
        return;
      }

      const allThreadIds = await threadData.idAll();

      if (!allThreadIds?.length) {
        await client.sendMessage("❌ Không tìm thấy nhóm nào!", event.threadID, event.messageID);
        return;
      }

      const tempDir = TEMP_DIR();
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const savedAttachments: string[] = [];
      let hasMedia = false;

      const replyAttachments = (event.messageReply?.attachments || []) as Attachment[];
      if (replyAttachments.length) {
        hasMedia = true;
        await client.sendMessage("🔄 Đang tải và lưu media...", event.threadID, event.messageID);

        for (let i = 0; i < replyAttachments.length; i++) {
          const a = replyAttachments[i];
          if (a && (a.type === "photo" || a.type === "video" || a.type === "audio") && a.url) {
            try {
              const res = await axios.get(a.url, { responseType: "stream" });
              const ts = Date.now();
              const ext = a.type === "photo" ? "jpg" : a.type === "video" ? "mp4" : "mp3";
              const fileName = `noti_${ts}_${i}.${ext}`;
              const filePath = path.join(tempDir, fileName);

              const writer = fs.createWriteStream(filePath);
              res.data.pipe(writer);

              await new Promise<void>((resolve, reject) => {
                writer.on("finish", resolve);
                writer.on("error", reject);
              });

              savedAttachments.push(filePath);
            } catch {
              // ignore
            }
          }
        }
      }

      await client.sendMessage(
        `🔄 Đang gửi thông báo đến ${allThreadIds.length} nhóm...`,
        event.threadID,
        event.messageID
      );

      let successCount = 0;
      let failCount = 0;

      const adminName = (await userData.getName(event.senderID)) || "Admin";
      const bodyTemplate = fmtNoti(adminName, content);

      for (const tid of allThreadIds) {
        try {
          // ✅ XÓA TAG QTV NHÓM: không build mentions/adminTagsText nữa
          const body: { body: string; attachment?: Readable[] } = {
            body: bodyTemplate,
          };

          if (hasMedia && savedAttachments.length) {
            body.attachment = savedAttachments.map((p) => fs.createReadStream(p));
          }

          await new Promise<void>((resolve) => {
            client.sendMessage(body as any, tid, (err?: Error, infoMsg?: MessageInfo) => {
              if (err) {
                failCount++;
              } else {
                successCount++;
                if (infoMsg?.messageID) {
                  main.onReply.set(infoMsg.messageID, {
                    commandName,
                    author: event.senderID,
                    type: "sendnoti",
                    messageID: infoMsg.messageID,
                    threadID: tid,
                    adminGroupID: ADMIN_GROUP_ID,
                  });
                }
              }
              resolve();
            });
          });

          await new Promise((r) => setTimeout(r, 2000));
        } catch {
          failCount++;
        }
      }

      if (savedAttachments.length) {
        for (const p of savedAttachments) {
          try {
            if (fs.existsSync(p)) fs.unlinkSync(p);
          } catch {
            // ignore
          }
        }
      }

      await client.sendMessage(
        [
          "✅ Đã gửi thông báo xong!",
          `📊 Thành công: ${successCount} nhóm`,
          `❌ Thất bại: ${failCount} nhóm`,
          hasMedia ? "🗑️ Đã dọn dẹp file tạm" : "",
          "",
          "💡 Người dùng có thể reply thông báo để phản hồi về nhóm admin",
        ]
          .filter(Boolean)
          .join("\n"),
        event.threadID,
        event.messageID
      );
      return;
    } catch {
      await client.sendMessage("❌ Đã xảy ra lỗi khi gửi thông báo!", event.threadID, event.messageID);
      return;
    }
  },
};

export default sendNotiCommand;