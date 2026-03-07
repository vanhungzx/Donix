import type { Command, CommandMessenger, CommandOnEventContext, EditMessenger, ExtendedMessageEvent, MessageEvent, MessageForm, UnsendMessenger } from "@types";
import moment from "moment-timezone";
import { checkBanned } from "../../../utils/banned";
import { rent } from "../../../utils/rent";
import { HandlerDependencies, HandlerEventArgs } from "./types";
export const createOnEvent =
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
      const scopedLogger = runtimeLogger;
      const { contact, unsend, edit, send, reply, react } = helpers;
      if (!event) return;

      const { threadID: t, senderID: s } = event || {};
      const tid = String(t || "");
      const sid = String(s || "");

      // Only check rent and banned for MessageEvent types
      const isMessageEvent = 'body' in event && 'senderID' in event && 'userID' in event && 'author' in event;
      const [r1, r2] = await Promise.all([
        isMessageEvent ? rent(tid, sid, client, config, event as ExtendedMessageEvent) : Promise.resolve(false),
        isMessageEvent ? checkBanned({ client, event: event as MessageEvent, config, userData, threadData }) : Promise.resolve(false)
      ]);

      if (r1 || r2) return;

      const list = main.onEvent || [];
      const hs = list
        .filter((k): k is string => typeof k === "string")
        .map((k: string) => main.cmds.get(k))
        .filter((c): c is Command => c !== undefined && c?.onEvent !== undefined && typeof c.onEvent === "function");

      // Tối ưu: Sử dụng Promise.allSettled để không bị dừng khi một handler lỗi
      await Promise.allSettled(
        hs.map((c: Command) =>
          (async () => {
            const st = Date.now();
            try {
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

              // CommandOnEventContext requires MessageEvent
              const eventForContext = ('body' in event && 'senderID' in event && 'userID' in event && 'author' in event)
                ? event as MessageEvent
                : event as unknown as MessageEvent;

              const context: CommandOnEventContext = {
                event: eventForContext,
                args: [],
                client,
                userData,
                threadData,
                contact: commandContact,
                unsend: commandUnsend,
                edit: commandEdit,
                send: commandSend,
                reply: commandReply,
                main,
                commandName: c.name,
                config,
                antist,
                api: api || {},
                utils: (utils || {}) as Record<string, string | number | boolean | ((...args: unknown[]) => unknown)>,
                logger: scopedLogger || { error: () => { }, info: () => { }, warn: () => { }, success: () => { }, system: () => { } },
                react,
              };
              if (c.onEvent) {
                await c.onEvent(context);
              }
              if (config.DevMode) {
                scopedLogger?.info?.(
                  `${c.config?.name || c.name} | ${tid} | ${moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss L")} | ${Date.now() - st}ms`
                );
              }
            } catch (e: unknown) {
              const error = e instanceof Error ? e : new Error(String(e));
              if (config.DevMode) {
                scopedLogger?.error?.(`Lỗi trong ${c.config?.name || c.name}: ${error.message}`, error.stack);
              } else {
                scopedLogger?.error?.(`Lỗi trong ${c.config?.name || c.name}: ${error.message}`);
              }
            }
          })()
        )
      );
    };
