import type { CommandMessenger, EventContext, MessageEvent, MessageForm } from "@types";
import moment from "moment-timezone";
import { checkBanned } from "../../../utils/banned";
import { HandlerDependencies, HandlerEventArgs } from "./types";

export const createHandleEvent =
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
      const { events } = main;
      const { threadID: t, logMessageType: typ } = event;
      const tid = String(t);

      // Only check banned for MessageEvent types
      if ('body' in event && 'senderID' in event) {
        if (await checkBanned({ client, event: event as MessageEvent, config, userData, threadData })) return;
      }

      // Fast path: early return nếu không có events hoặc eventType không hợp lệ
      if (events.size === 0) return;
      const eventType = typeof typ === 'string' ? typ : undefined;
      if (!eventType) return;

      const list: Promise<void>[] = [];

      // Pre-compile event type check (realtime optimization)
      const eventTypeLower = eventType.toLowerCase();

      // Fast path: iterate events map một lần, cache entries
      const eventEntries = Array.from(events.entries());
      const eventEntriesLen = eventEntries.length;

      for (let i = 0; i < eventEntriesLen; i++) {
        const [k, v] = eventEntries[i];
        // Fast path: cache type check
        const types = Array.isArray(v.type) ? v.type : [v.type];
        let matches = false;
        const typesLen = types.length;
        for (let j = 0; j < typesLen; j++) {
          if (types[j] === eventType) {
            matches = true;
            break;
          }
        }
        if (!matches) continue;

        const run = v; // Đã có v từ entries, không cần get lại
        if (!run) continue;
        list.push(
          (async () => {
            const st = config.DevMode ? Date.now() : 0;
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

              const commandUnsend = (messageID: string) => {
                return unsend(messageID);
              };

              const commandEdit = (form: MessageForm | string, messageID: string) => {
                return edit(form, messageID);
              };

              // EventContext requires MessageEvent, but we have BotEventType
              // Cast to MessageEvent if it has the required properties
              const eventForContext = ('body' in event && 'senderID' in event && 'userID' in event && 'author' in event)
                ? event as MessageEvent
                : event as unknown as MessageEvent;

              const context = {
                client,
                event: eventForContext,
                userData,
                threadData,
                contact: commandContact,
                unsend: commandUnsend as typeof commandUnsend,
                edit: commandEdit as typeof commandEdit,
                send: commandSend,
                reply: commandReply,
                main,
                config,
                antist: antist as unknown as string | number | boolean | null | undefined,
                api: api || {},
                utils: (utils || {}) as Record<string, string | number | boolean | null | undefined | ((...args: unknown[]) => unknown)>,
                logger: scopedLogger || { error: () => { }, info: () => { }, warn: () => { }, success: () => { }, system: () => { } },
                react,
              } as unknown as EventContext;
              await run.onCall(context);

              if (config.DevMode && st > 0) {
                scopedLogger?.info?.(
                  `${run.config?.name || k} | ${tid} | ${moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss L")} | ${Date.now() - st}ms`
                );
              }
            } catch (e: unknown) {
              const error = e instanceof Error ? e : new Error(String(e));
              if (config.DevMode) {
                scopedLogger?.error?.(`Lỗi trong ${run.config?.name || k}: ${error.message}`, error.stack);
              } else {
                scopedLogger?.error?.(`Lỗi trong ${run.config?.name || k}: ${error.message}`);
              }
            }
          })());
      }

      await Promise.allSettled(list);
    };
