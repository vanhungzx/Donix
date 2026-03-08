import type { BotEvent as BotEventDefinition, EventContext } from "@types";

const botEvent: BotEventDefinition = {
  name: "botEvent",
  version: "1.0.2",
  desc: "Log: thêm bot, bot bị kick/tự rời, nhóm đổi tên",
  type: ["log:unsubscribe", "log:subscribe", "log:thread-name"],

  onCall: async (rawCtx: EventContext): Promise<void> => {
    const ctx = rawCtx as EventContext & {
      client?: {
        getCurrentUserID?: () => string | number;
        ctx?: { userID?: string | number };
        id?: string | number;
      };
      threadData: {
        get: (threadID: string) => Promise<{ threadInfo?: { threadName?: string; name?: string } } | null>;
        getName: (threadID: string) => Promise<string | undefined>;
      };
      userData: {
        getName: (userID: string) => Promise<string | undefined>;
      };
      config: {
        BOXADMIN?: string | string[];
        [key: string]: unknown;
      };
    };

    const { event, threadData, userData, config } = ctx;
    const client = ctx.client;

    const t = String(event.threadID || "");
    const data = event.logMessageData || {};
    const type = String(event.logMessageType || "");

    const author = String(
      (event as any).author ||
      (data as any).initiator ||
      (data as any).adder ||
      (data as any).remover ||
      ""
    );

    const BOT_ID = String(
      client?.getCurrentUserID?.() ??
      (client as any)?.ctx?.userID ??
      (client as any)?.id ??
      ""
    );

    let task = "";

    if (type === "log:thread-name") {
      const info = (await threadData.get(t))?.threadInfo || {};
      const oldName = (info as any).threadName || (info as any).name || "Tên không tồn tại";
      const newName = (data as any).name || (data as any).threadName || "Tên không tồn tại";

      task = `Người dùng thay đổi tên nhóm từ: '${oldName}' thành '${newName}'`;
    } else if (type === "log:subscribe") {
      const addedRaw =
        (data as any).addedParticipants ||
        (data as any).added_participants ||
        (data as any).addedUsers ||
        [];

      const arr = Array.isArray(addedRaw) ? addedRaw : [];

      const added = arr.map((v) => {
        if (v && typeof v === "object") {
          return String(
            (v as any).userFbId ||
            (v as any).user_id ||
            (v as any).id ||
            (v as any).uid ||
            ""
          );
        }
        return String(v || "");
      });

      if (added.includes(BOT_ID)) {
        task = "Người dùng đã thêm bot vào một nhóm mới!";
      }
    } else if (type === "log:unsubscribe") {
      const left = String(
        (data as any).leftParticipantFbId ||
        (data as any).left_participant_fb_id ||
        (data as any).left_user_fb_id ||
        (data as any).removed_participant ||
        (data as any).uid ||
        (data as any).id ||
        ""
      );

      if (left === BOT_ID) {
        task =
          author && author !== BOT_ID
            ? `Bot bị kick khỏi nhóm bởi ID: ${author}`
            : "Bot tự rời nhóm.";
      }
    }

    if (!task) return;

    const cachedInfo = (await threadData.get(t))?.threadInfo || {};
    const fallbackName = await threadData.getName(t);
    const threadName =
      (cachedInfo as any).threadName ||
      (cachedInfo as any).name ||
      fallbackName ||
      "Không rõ";

    const authorName = author
      ? (await userData.getName(author)) || "Không rõ"
      : "Không rõ";

    const timeStr = new Date().toLocaleString("vi-VN", {
      hour12: false,
      timeZone: "Asia/Ho_Chi_Minh"
    });

    const formReport = `=== Thông báo của bot ===
» Nhóm: ${threadName} (${t})
»  Có hành động: ${task}
» Hành động được tạo bởi người dùng: ${authorName} (${author})
» ${timeStr} «`;

    const targetsRaw = config.BOXADMIN;
    const targets = Array.isArray(targetsRaw) ? targetsRaw : [targetsRaw];

    for (const box of targets.filter(Boolean) as string[]) {
      await (ctx as any).client?.sendMessage?.(formReport, box);
    }
  }
};

export default botEvent;
