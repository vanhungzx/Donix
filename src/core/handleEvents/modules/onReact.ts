import type { Command, CommandMessenger, ExtendedMessageEvent, Logger, MessageForm, ReactData, ServicesMap } from "@types";
import { checkAdminBox } from "../../../utils/admin";
import { checkBanned } from "../../../utils/banned";
import { rent } from "../../../utils/rent";
import { HandlerDependencies, HandlerEventArgs } from "./types";

export const createOnReact =
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
      const { reply, send, contact, react, unsend, edit } = helpers;
      const t = event.threadID;
      const s = event.senderID || event.userID;
      const mid = event.messageID;
      const tid = String(t);
      const sid = String(s);

      const [r1, r2, r3] = await Promise.all([
        rent(tid, sid, client, config, event as ExtendedMessageEvent),
        checkBanned({ client, event: event as ExtendedMessageEvent, config, userData, threadData }),
        checkAdminBox(client, tid, sid, config, threadData),
      ]);

      if (r1 || r2 || r3) return;

      if (!mid) return;

      const { onReact: store, cmds } = main;
      const R = store.get(mid);
      if (!R || typeof R === "function" || !("commandName" in R)) return;

      const reactData = R as ReactData;
      reactData.delete = () => store.delete(mid);
      const { commandName } = reactData;

      if (!commandName) {
        if (mid) {
          client.sendMessage("Không tìm thấy tên lệnh để thực hiện phản ứng!", tid, mid);
        }
        scopedLogger?.error?.("onReaction", "Không tìm thấy tên lệnh để thực hiện phản ứng!", "REACTION");
        return;
      }

      // Fast path: tìm command trực tiếp trước, chỉ iterate nếu không tìm thấy (realtime optimization)
      let cmd = cmds.get(commandName);
      if (!cmd) {
        // Fallback: tìm trong alias
        const cmdValues = Array.from(cmds.values());
        const cmdValuesLen = cmdValues.length;
        for (let i = 0; i < cmdValuesLen; i++) {
          const c = cmdValues[i];
          if (c.alias?.includes(commandName)) {
            cmd = c;
            break;
          }
        }
      }

      if (!cmd) {
        if (mid) {
          client.sendMessage(`Không tìm thấy lệnh "${commandName}"`, tid, mid);
        }
        scopedLogger?.error?.("onReaction", `Lệnh "${commandName}" không tồn tại`, "REACTION");
        return;
      }


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

      const commandReact = (emoji: string) => {
        return react(emoji);
      };


      const defaultApi: ServicesMap = api || ({} as ServicesMap);
      const defaultUtils: Record<string, string | number | boolean | null | undefined | ((...args: unknown[]) => unknown)> = (utils || {}) as Record<string, string | number | boolean | null | undefined | ((...args: unknown[]) => unknown)>;
      const defaultLogger: Logger = scopedLogger || {
        error: () => { },
        info: () => { },
        warn: () => { },
        success: () => { },
        system: () => { },
      } as Logger;

      try {
        const context = {
          client,
          event: event as ExtendedMessageEvent,
          userData,
          threadData,
          Reaction: {
            ...reactData,
            messageID: reactData.messageID || mid || "",
            author: reactData.author || sid,
            reaction: (event.reaction as string) || "",
          },
          main,
          args: [],
          commandName,
          config,
          antist: antist as unknown as string | number | boolean | null | undefined,
          api: defaultApi,
          utils: defaultUtils,
          logger: defaultLogger,
          contact: commandContact,
          unsend: commandUnsend as typeof commandUnsend,
          edit: commandEdit as typeof commandEdit,
          send: commandSend,
          reply: commandReply,
          react: commandReact,
          messageID: reactData.messageID || mid || "",
          author: reactData.author || sid,
        } as unknown as Parameters<NonNullable<Command["onReact"]>>[0];

        await cmd.onReact?.(context);

        const info = (await threadData.get(tid))?.threadInfo;
        const threadName = info?.threadName || info?.name || tid;
        const getName = userData.getName as ((sid: string) => Promise<string | null | undefined>) | undefined;
        const name = getName ? await getName(sid) : null;
        const ts = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

        scopedLogger?.info?.(
          `onReaction: ${commandName} | by ${name || sid} (${sid}) | at ${ts} | group ${threadName} (${tid}) | reaction ${event.reaction || ""}`
        );
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        scopedLogger?.error?.(`onReaction error in ${commandName}:`, errorMessage);
        if (mid) {
          client.sendMessage(`Lỗi xảy ra khi thực hiện: ${commandName} - ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`, tid, mid).catch(() => { });
        }
      }
    };
