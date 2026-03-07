import type { ExtendedMessageEvent, FacebookClient, Logger, ThreadDataModel, UserDataModel } from "@types";
import moment from "moment-timezone";

interface MessageCountData {
  total: Array<{ id: string; count: number; lastInteraction: number | null }>;
  week: Array<{ id: string; count: number; lastInteraction: number | null }>;
  day: Array<{ id: string; count: number; lastInteraction: number | null }>;
  month: Array<{ id: string; count: number; lastInteraction: number | null }>;
  time: number;
  count: number;
}

export async function updateMessageCount(
  event: ExtendedMessageEvent,
  threadData: ThreadDataModel,
  userData: UserDataModel,
  client: FacebookClient,
  logger?: Logger
): Promise<void> {
  if (!event?.isGroup || event.senderID === client.id) return;

  const tid = String(event.threadID);
  const sid = String(event.senderID);
  const now = Date.now();
  const day = moment.tz("Asia/Ho_Chi_Minh").day();
  const iso = moment.tz("Asia/Ho_Chi_Minh").toDate();

  try {
    const th = await threadData.get(tid);
    if (!th) return;

    if (!th.messageCount) {
      th.messageCount = { total: [], week: [], day: [], month: [], time: day, count: 0 };
    }

    const mcRaw = th.messageCount;
    let mc: MessageCountData;
    if (typeof mcRaw === 'number' || !mcRaw || typeof mcRaw !== 'object') {
      mc = { total: [], week: [], day: [], month: [], time: day, count: 0 };
      th.messageCount = mc as unknown as Record<string, unknown>;
    } else {
      mc = mcRaw as unknown as MessageCountData;
    }
    const periods: Array<keyof Pick<MessageCountData, 'total' | 'week' | 'day' | 'month'>> = ["total", "week", "day", "month"];

    for (const p of periods) {
      if (!Array.isArray(mc[p])) mc[p] = [];
    }

    const eventPids = Array.isArray(event.participantIDs) ? event.participantIDs : undefined;
    const threadPids = th.threadInfo && typeof th.threadInfo === 'object' && 'participantIDs' in th.threadInfo && Array.isArray(th.threadInfo.participantIDs) ? th.threadInfo.participantIDs : undefined;
    let pids: string[] = eventPids || threadPids || [];
    if (!Array.isArray(pids)) pids = [];

    const tpl = { count: 0, lastInteraction: null as number | null };
    const upd = new Map<string, { joinedThreads: Record<string, Date> }>();

    for (const id of pids) {
      let added = false;

      for (const p of periods) {
        const periodKey = p as keyof Pick<MessageCountData, 'total' | 'week' | 'day' | 'month'>;
        const list = mc[periodKey] as Array<{ id: string; count: number; lastInteraction: number | null }>;
        if (!list.some((u) => u.id === id)) {
          list.push({ id, ...tpl });
          added = true;
        }
      }

      const ui = await userData.get(id);
      if (!ui) {
        try {
          let userName = "Undefined User";
          let userInfoData: Record<string, unknown> = {};
          if (typeof userData.info === "function") {
            try {
              const info = await userData.info(id);
              if (info) {
                userName = (typeof info === 'object' && info !== null && 'name' in info && typeof info.name === 'string')
                  ? info.name
                  : (typeof info === 'object' && info !== null && 'firstName' in info && typeof info.firstName === 'string')
                    ? info.firstName
                    : "Undefined User";
                userInfoData = typeof info === 'object' && info !== null ? info as Record<string, unknown> : {};
              }
            } catch (error: unknown) {
              // Ignore error
            }
          }
          await userData.create(id, {
            name: userName,
            userInfo: userInfoData,
            data: {},
            joinedThreads: { [tid]: iso },
          });
          if (logger?.success) {
            logger.success(`Đã tạo dữ liệu mới cho thành viên ${userName} (${id}) trong nhóm ${tid}`);
          }
        } catch (e: unknown) {
          const error = e instanceof Error ? e : new Error(String(e));
          if (logger?.error) {
            logger.error(`Failed to create user data for ${id}: ${error.message || String(e)}`);
          }
        }
      } else if (!ui.joinedThreads?.[tid]) {
        upd.set(id, { joinedThreads: { [tid]: iso } });
        if (logger?.success) {
          logger.success(`Thành viên mới đã tham gia nhóm ${tid}: ${id} | ${moment(iso).format("DD/MM/YYYY HH:mm:ss")}`);
        }
      }

      if (added && logger?.info) {
        logger.info(`Đã thêm thành viên ${id} vào hệ thống theo dõi tin nhắn trong nhóm ${tid}`);
      }
    }

    if (upd.size) {
      await Promise.all([...upd].map(([id, data]) => userData.update(id, data)));
    }

    for (const p of periods) {
      const periodKey = p as keyof Pick<MessageCountData, 'total' | 'week' | 'day' | 'month'>;
      const list = mc[periodKey] as Array<{ id: string; count: number; lastInteraction: number | null }>;
      const u = list.find((u) => u.id === sid);
      if (u) {
        u.count++;
        u.lastInteraction = now;
      }
    }

    if (typeof mc === 'object' && mc !== null && 'count' in mc && typeof mc.count === 'number') {
      mc.count++;
    }
    await threadData.update(tid, { messageCount: mc as unknown as Record<string, unknown> });
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    if (logger?.error) {
      logger.error(`Lỗi xử lý dữ liệu cho nhóm ${tid}: ${error.message || String(e)}`);
    }
  }
}
