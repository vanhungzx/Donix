import type { CommandContextBase, CommandMessenger, CommandOnReplyContext, EditMessenger, ExtendedMessageEvent, MessageForm, ReplyData, UnsendMessenger } from "@types";
import { checkAdminBox } from "../../../utils/admin";
import { checkBanned } from "../../../utils/banned";
import { rent } from "../../../utils/rent";
import { HandlerDependencies, HandlerEventArgs } from "./types";

export const createOnReply =
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
      const body = String(event.body || "");
      const { threadID: t, senderID: s, messageID: mid, messageReply } = event;
      if (!messageReply || typeof messageReply !== "object" || !("messageID" in messageReply)) return;
      const tid = String(t);
      const sid = String(s);
      const replyMessageID = String(messageReply.messageID || "");
      const [r1, r2, r3] = await Promise.all([
        rent(tid, sid, client, config, event as ExtendedMessageEvent),
        checkBanned({ client, event: event as ExtendedMessageEvent, config, userData, threadData }),
        checkAdminBox(client, tid, sid, config, threadData),
      ]);

      if (r1 || r2 || r3) return;

      const cfgAny = config as Record<string, unknown>;
      if (cfgAny.botInteractionEnabled === false) {
        const OWNER = config.OWNER;
        const ADMIN = config.ADMIN;
        const adminListRp: string[] = Array.isArray(ADMIN)
          ? ADMIN.map((id) => String(id))
          : ADMIN != null
            ? [String(ADMIN)]
            : [];
        const isOwnerRp = Array.isArray(OWNER) ? OWNER.includes(sid) : String(OWNER) === sid;
        if (!isOwnerRp && !adminListRp.includes(sid)) return;
      }

      const Rep = main.onReply.get(replyMessageID);
      if (!Rep || typeof Rep === "function" || !Rep.commandName) return;
      const replyData = Rep as ReplyData;

      replyData.delete = () => main.onReply.delete(replyMessageID);

      // Fast path: tìm command trực tiếp trước, chỉ iterate nếu không tìm thấy (realtime optimization)
      let cmd = main.cmds.get(replyData.commandName);
      if (!cmd) {
        // Fallback: tìm trong alias
        const cmdValues = Array.from(main.cmds.values());
        const cmdValuesLen = cmdValues.length;
        for (let i = 0; i < cmdValuesLen; i++) {
          const c = cmdValues[i];
          if (c.alias?.includes(replyData.commandName)) {
            cmd = c;
            break;
          }
        }
      }

      if (!cmd) return;

      try {
        const args = body.trim().split(/\s+/) || [];

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

        const context = {
          client,
          event: event as ExtendedMessageEvent,
          userData,
          threadData,
          Reply: replyData,
          args,
          contact: commandContact,
          unsend: commandUnsend,
          edit: commandEdit,
          send: commandSend,
          reply: commandReply,
          main,
          commandName: replyData.commandName,
          config,
          ...(antist !== undefined ? { antist: antist as string | number | boolean | CommandContextBase | ReplyData } : {}),
          api: api || {},
          utils: (utils || {}) as Record<string, string | number | boolean | ((...args: unknown[]) => unknown)>,
          logger: scopedLogger || { error: () => { }, info: () => { }, warn: () => { }, success: () => { }, system: () => { } },
          react,
          messageID: mid || "",
          author: String((event as ExtendedMessageEvent).author || sid || ""),
        } as unknown as CommandOnReplyContext;
        await cmd.onReply?.(context);

        const info = (await threadData.get(tid))?.threadInfo;
        const threadName = info?.threadName || info?.name || tid;
        const getName = userData.getName as ((sid: string) => Promise<string | null | undefined>) | undefined;
        const name = getName ? await getName(sid) : null;
        const ts = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

        scopedLogger?.info?.(
          `onReply: ${replyData.commandName} | by ${name || sid} (${sid}) | at ${ts} | group ${threadName} (${tid}) | body "${body}"`
        );
      } catch (e: unknown) {
        const error = e instanceof Error ? e : new Error(String(e));
        const errorDetails = error.stack || error.message || String(e);
        scopedLogger?.error?.(`Reply handler error in ${replyData.commandName}:`, errorDetails);
        client.sendMessage(`Error: ${error.message}`, tid, mid || "").catch(() => { });
      }
    };
