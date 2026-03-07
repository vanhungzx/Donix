import type { CommandMessenger, CommandOnChatContext, EditMessenger, ExtendedMessageEvent, MessageForm, UnsendMessenger } from "@types";
import fs from "fs-extra";
import path from "path";
import { checkAdminBox } from "../../../utils/admin";
import { checkBanned } from "../../../utils/banned";
import { rent } from "../../../utils/rent";
import { handleSpamBanOnChat } from "../../../utils/spamBanHandler";
import { HandlerDependencies, HandlerEventArgs } from "./types";

/**
 * Tạo handler xử lý khi có tin nhắn chat (không phải lệnh)
 * Handler này xử lý các sự kiện onChat từ các command
 * Bao gồm: kiểm tra rent, ban, adminbox, shortcut, và chạy các onChat handlers
 */
export const createOnChat =
  ({
    client,
    userData,
    threadData,
    main,
    antist,
    api,
    utils,
    logger: runtimeLogger,
  }: HandlerDependencies) =>
    async ({ event, config, helpers }: HandlerEventArgs) => {
      // Khởi tạo logger và helper functions
      const scopedLogger = runtimeLogger;
      const { reply, send, contact, react, unsend, edit } = helpers;
      const tid = String(event.threadID || "");

      // Nếu không có threadID thì không xử lý
      if (!tid) {
        return;
      }

      // Lấy nội dung tin nhắn và parse arguments
      const body = String(event.body || "");
      const args = body ? body.trim().split(/\s+/) : [];
      const sid = String(event.senderID || event.userID || "");

      // Chạy handler spam ban độc lập (không bị chặn bởi ban/adminbox)
      try {
        await handleSpamBanOnChat({
          client,
          event: event as ExtendedMessageEvent,
          config,
          threadData,
          userData,
        });
      } catch {
        // ignore spam-ban errors
      }

      // Kiểm tra các điều kiện cơ bản: rent, ban, adminbox (không ảnh hưởng tới spam-ban)
      try {
        const [isRent, isBanned, isAdminBox] = await Promise.all([
          rent(tid, sid, client, config, event as ExtendedMessageEvent).catch(() => false),
          checkBanned({ client, event: event as ExtendedMessageEvent, config, userData, threadData }).catch(() => false),
          checkAdminBox(client, tid, sid, config, threadData).catch(() => false)
        ]);

        // Nếu có một trong các điều kiện trên thì dừng xử lý
        if (isRent || isBanned || isAdminBox) return;

        // Xử lý shortcut (lệnh tắt, phím tắt) - luôn import mới, không cache global
        try {
          const resolvedShortcutPath = path.resolve(process.cwd(), "src/plugins/cmds/Nhóm/shortcut.ts");
          // Kiểm tra file shortcut có tồn tại không
          if (await fs.pathExists(resolvedShortcutPath)) {
            // Dynamic import shortcut module mỗi lần, không dùng cache global
            const { pathToFileURL } = await import("node:url");
            const fileUrl = pathToFileURL(resolvedShortcutPath).href;
            const shortcutModule = await import(fileUrl);
            const shortcut = shortcutModule.default || shortcutModule;

            // Nếu shortcut có hàm event thì gọi nó
            if (shortcut && typeof shortcut.event === "function") {
              const shortcutResult = await shortcut.event({
                event,
                args,
                client,
                userData,
                threadData,
                contact,
                unsend,
                edit,
                send,
                reply,
                body,
                main,
                config,
                api,
                antist,
                utils,
                logger: scopedLogger,
                react,
              });

              // Nếu shortcut đã xử lý tin nhắn thì dừng lại
              if (shortcutResult === true || shortcutResult === 1 || (shortcutResult && (shortcutResult.handled || shortcutResult.matched))) return;
              // Nếu shortcut trả về function thì gọi nó
              if (typeof shortcutResult === "function") await shortcutResult();
            }
          }
        } catch (e: unknown) {
          const error = e instanceof Error ? e : new Error(String(e));
          scopedLogger?.error?.("shortcut event", error.message || String(e));
        }
      } catch (e: unknown) {
        const error = e instanceof Error ? e : new Error(String(e));
        scopedLogger?.error?.("gate", error.message || String(e));
        return;
      }

      // Xử lý các onChat handlers từ các command
      try {
        const { cmds, onChat: list = [] } = main;

        // Wrap helpers to match CommandMessenger signature
        const commandSend: CommandMessenger = (...args: unknown[]) => {
          const form = args[0] as MessageForm;
          return send(form);
        };

        const commandReply: CommandMessenger = (...args: unknown[]) => {
          const form = args[0] as MessageForm;
          return reply(form);
        };

        const commandContact: CommandMessenger = (...args: unknown[]) => {
          const form = args[0] as MessageForm;
          const targetID = args[1] as string | undefined;
          return contact(form, targetID);
        };

        const commandUnsend: UnsendMessenger = ((messageID: string, callback?: (err: Error | null, data?: { success?: boolean }) => void) => {
          if (callback) {
            return unsend(messageID).then(data => {
              callback(null, data);
              return data;
            }).catch(err => {
              callback(err, undefined);
              throw err;
            });
          }
          return unsend(messageID);
        }) as UnsendMessenger;

        const commandEdit: EditMessenger = ((form: MessageForm | string, messageID: string, callback?: (err: Error | null, data?: { success?: boolean }) => void) => {
          if (callback) {
            return edit(form, messageID).then(data => {
              callback(null, data);
              return data;
            }).catch(err => {
              callback(err, undefined);
              throw err;
            });
          }
          return edit(form, messageID);
        }) as EditMessenger;

        // Mảng chứa các promise để chạy song song
        const commandPromises: Promise<void>[] = [];

        // Duyệt qua danh sách các command có onChat handler
        for (const k of list) {
          // Bỏ qua nếu không phải string
          if (typeof k !== "string") continue;
          const c = cmds.get(k);
          // Bỏ qua nếu command không tồn tại hoặc không có onChat handler
          if (!c || !c.onChat || typeof c.onChat !== "function") continue;
          const onChatHandler = c.onChat;
          const commandName = c.name;

          // Tạo promise để chạy onChat handler
          const promise = (async () => {
            try {
              const context: CommandOnChatContext = {
                event: event as ExtendedMessageEvent,
                args,
                client,
                userData,
                threadData,
                contact: commandContact,
                unsend: commandUnsend,
                edit: commandEdit,
                send: commandSend,
                reply: commandReply,
                body,
                main,
                commandName,
                config,
                api: api || {},
                antist,
                utils: (utils || {}) as Record<string, string | number | boolean | ((...args: unknown[]) => unknown)>,
                logger: scopedLogger || { error: () => { }, info: () => { }, warn: () => { }, success: () => { }, system: () => { } },
                react,
              };
              const h = await onChatHandler(context);

              // Nếu handler trả về function thì gọi nó
              if (typeof h === "function") await h();
            } catch (e: unknown) {
              // Log lỗi nếu có nhưng không dừng các handler khác
              const error = e instanceof Error ? e : new Error(String(e));
              scopedLogger?.error?.(`onChat:${commandName}`, error.message || String(e));
            }
          })();

          commandPromises.push(promise);
        }

        // Chạy tất cả onChat handlers song song và đợi tất cả hoàn thành (kể cả lỗi)
        await Promise.allSettled(commandPromises);
      } catch (e: unknown) {
        const error = e instanceof Error ? e : new Error(String(e));
        scopedLogger?.error?.("handlers", error.message || String(e));
      }
    };
