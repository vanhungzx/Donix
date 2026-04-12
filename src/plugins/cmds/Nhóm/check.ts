import type {
  BotConfig,
  Command,
  CommandOnCallContext,
  CommandOnReactContext,
  CommandOnReplyContext,
  MessageForm,
  ReactData,
  ReplyData,
  SendMessageResult,
  ThreadDataModel,
} from '@types';
import type { UserData } from '../../../core/database/user-data';
import type { UserInfo as FbGraphUserInfo } from '../../../types/client';
import moment from "moment-timezone";

const TZ = "Asia/Ho_Chi_Minh";
const SECTIONS = ["total", "week", "day", "month"] as const;
type SectionKey = (typeof SECTIONS)[number];
const SECTION_LABEL: Record<SectionKey, string> = {
  total: "Tổng",
  week: "Tuần",
  day: "Ngày",
  month: "Tháng",
};

interface MessageCountItem {
  id: string;
  count: number;
  lastInteraction?: number;
  name?: string;
  roleTag?: string;
}

type MessageCountStore = Record<SectionKey, MessageCountItem[]>;

/** OWNER/ADMIN mở rộng so với BotConfig tối thiểu. */
type DonixBotConfig = BotConfig & { OWNER?: string | string[]; ADMIN?: string[] };

const formatNumber = (value: number | undefined | null): string => {
  if (!Number.isFinite(value)) return "0";
  return (value ?? 0).toLocaleString("vi-VN");
};

const createDefaultMessageCount = (): MessageCountStore => ({
  total: [],
  week: [],
  day: [],
  month: [],
});

const VI_BADGE = (total: number): string => {
  if (total >= 500_000) return "Huyền thoại";
  if (total >= 200_000) return "Cao thủ";
  if (total >= 100_000) return "Kim cương";
  if (total >= 50_000) return "Bạch kim";
  if (total >= 10_000) return "Vàng";
  if (total >= 5_000) return "Bạc";
  if (total >= 1_000) return "Đồng";
  return "Tân binh";
};

const formatTime = (timestamp?: number): string => {
  if (!timestamp) return "Không có";
  return moment(timestamp).tz(TZ).format("HH:mm:ss | DD/MM/YYYY");
};

/** joinedThreads lưu Date → JSON thành chuỗi ISO; parseInt chỉ đọc 2026 → ms gần epoch 1970. */
const parseJoinedAtMs = (raw: unknown): number => {
  const fallback = Date.now();
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return fallback;
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    }
    const t = Date.parse(s);
    return Number.isNaN(t) ? fallback : t;
  }
  return fallback;
};

const mapSectionArg = (input?: string): { key: SectionKey; label: string } => {
  if (!input) return { key: "total", label: SECTION_LABEL.total };
  const value = input.toLowerCase();
  switch (value) {
    case "day":
    case "-d":
      return { key: "day", label: SECTION_LABEL.day };
    case "week":
    case "-w":
      return { key: "week", label: SECTION_LABEL.week };
    case "month":
    case "-m":
      return { key: "month", label: SECTION_LABEL.month };
    default:
      return { key: "total", label: SECTION_LABEL.total };
  }
};

const limitFrom = (value: string | undefined, defaultLimit = 50): number => {
  if (!value) return defaultLimit;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(Math.max(parsed, 1), 200);
};

interface ThreadUserInfoRow {
  id?: string | number;
  name?: string;
  gender?: string | null;
}

interface ThreadInfoWithParticipants {
  userInfo?: ThreadUserInfoRow[];
  adminIDs?: unknown;
}

type ThreadDataWithIdAll = ThreadDataModel & { idAll?: () => Promise<string[]> };

const ensureMessageCount = (store: unknown): MessageCountStore => {
  if (!store || typeof store !== "object") return createDefaultMessageCount();
  const result: MessageCountStore = createDefaultMessageCount();
  const raw = store as Record<string, unknown>;
  for (const key of SECTIONS) {
    const section = raw[key];
    result[key] = Array.isArray(section) ? (section as MessageCountItem[]) : [];
  }
  return result;
};

/** Chuẩn hoá adminIDs (string[] hoặc { id }[]) thành danh sách UID. */
const threadAdminIds = (info: ThreadInfoWithParticipants | null | undefined): string[] => {
  const raw = info?.adminIDs;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      if (typeof a === "string" || typeof a === "number") return String(a);
      if (a && typeof a === "object" && "id" in a) return String((a as { id: unknown }).id ?? "");
      return "";
    })
    .filter(Boolean);
};

const isThreadAdmin = (info: ThreadInfoWithParticipants | null | undefined, userId: string): boolean =>
  threadAdminIds(info).includes(String(userId));

const deriveRoleTag = (id: string, botID: string, config: DonixBotConfig): string => {
  if (String(id) === String(botID)) return "Bot";
  const ownerRaw = config.OWNER;
  const owners = Array.isArray(ownerRaw) ? ownerRaw.map(String) : [String(ownerRaw ?? "")];
  if (owners.filter(Boolean).includes(String(id))) return "Chủ bot";
  const adminList = config.ADMIN;
  if (Array.isArray(adminList) && adminList.map(String).includes(String(id))) {
    return "Admin bot";
  }
  return "";
};

/** Tên hiển thị theo thread (userData.getName thường trống với nhiều UID). */
const participantNameMapFromThreadInfo = (
  threadInfo: ThreadInfoWithParticipants | null | undefined,
): Map<string, string> => {
  const map = new Map<string, string>();
  const list = Array.isArray(threadInfo?.userInfo) ? threadInfo.userInfo : [];
  for (const u of list) {
    if (u?.id != null && u.name) map.set(String(u.id), String(u.name));
  }
  return map;
};

const getUserInfoRows = (info: unknown): ThreadUserInfoRow[] => {
  if (!info || typeof info !== "object") return [];
  const u = (info as ThreadInfoWithParticipants).userInfo;
  return Array.isArray(u) ? u : [];
};

async function allThreadIds(threadData: ThreadDataModel): Promise<string[]> {
  const idAll = (threadData as ThreadDataWithIdAll).idAll;
  if (typeof idAll !== "function") return [];
  try {
    const ids = await idAll();
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}


const checkCommand = {
  name: "check",
  desc: "Thống kê & xếp hạng tương tác (ngày/tuần/tháng/toàn bộ, trong nhóm & toàn hệ thống)",
  alias: ["checktt", "cou", "count"],
  version: "1.2.6",
  role: 0,
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const {
      client,
      utils,
      event,
      args,
      threadData,
      send,
      userData,
      main,
      config,
      reply,
      commandName,
    } = ctx;

    const botConfig = config as DonixBotConfig;

    const isOwner = (id: string | number): boolean => {
      const target = String(id);
      const owner = botConfig.OWNER;
      if (Array.isArray(owner)) {
        return owner.map(String).includes(target);
      }
      return String(owner ?? "") === target;
    };

    const parseUID = async (fallbackSelf = true, index = 1): Promise<string | null> => {
      const candidate = args[index];
      const mentioned = Object.keys(event.mentions || {});
      if (mentioned.length > 0 && mentioned[0]) return mentioned[0].replace(/\&mibextid=ZbWKwL/g, "");
      if (event.type === "message_reply" && event.messageReply?.senderID) {
        return String(event.messageReply.senderID);
      }
      if (candidate) {
        try {
          new URL(candidate);
          if (client.getUID) {
            return String((await client.getUID(candidate)) || candidate);
          }
          return candidate;
        } catch {
          if (/^\d+$/.test(candidate)) return candidate;
        }
      }
      return fallbackSelf ? event.senderID : null;
    };

    const computeServerRank = async (targetId: string, section: SectionKey = "total") => {
      const threadIDs = await allThreadIds(threadData);

      const aggregated: Record<string, number> = {};

      for (const tid of threadIDs || []) {
        try {
          const td = await threadData.get(tid);
          const records: MessageCountItem[] | undefined = td?.messageCount?.[section];
          if (!Array.isArray(records)) continue;
          for (const item of records) {
            if (item?.id && typeof item.count === "number") {
              aggregated[item.id] = (aggregated[item.id] ?? 0) + item.count;
            }
          }
        } catch {

        }
      }

      const list: MessageCountItem[] = Object.entries(aggregated)
        .map(([id, count]) => ({ id, count }))
        .filter((entry) => entry.id)
        .sort((a, b) => b.count - a.count);

      const index = list.findIndex((entry) => String(entry.id) === String(targetId));
      return {
        rank: index >= 0 ? index + 1 : null,
        totalUsers: list.length,
        count: index >= 0 ? (list[index]?.count ?? 0) : 0,
        full: list,
      };
    };

    try {
      await new Promise((resolve) => setTimeout(resolve, 200));

      if (!event.isGroup && args[0]?.toLowerCase() !== "clear") {
        await reply("❎ Lệnh này chỉ dùng trong nhóm.");
        return;
      }

      const { threadID, senderID, participantIDs = [] } = event;
      const query = (args[0] ?? "").toLowerCase();

      let threadDataResult = await threadData.get(threadID);
      if (!threadDataResult) {
        await threadData.set(threadID, { messageCount: createDefaultMessageCount() });
        await reply("ℹ️ Nhóm chưa có dữ liệu. Hệ thống vừa khởi tạo dữ liệu mới, vui lòng thử lại.");
        return;
      }

      const messageCount = ensureMessageCount(threadDataResult.messageCount);
      threadDataResult.messageCount = messageCount;

      const filterSection = (section: MessageCountItem[]): MessageCountItem[] => {
        return section.filter((entry) => entry?.id && participantIDs.includes(entry.id));
      };

      let mutated = false;
      for (const key of SECTIONS) {
        const before = messageCount[key].length;
        messageCount[key] = filterSection(messageCount[key]);
        if (messageCount[key].length !== before) mutated = true;
      }
      if (mutated) {
        await threadData.update(threadID, { messageCount });
      }

      const getThreadInfo = async () => {
        const latest = await threadData.get(threadID);
        return latest?.threadInfo ?? threadDataResult?.threadInfo ?? null;
      };

      // --- Subcommand: check die (thống kê mem die theo kiểu ndfb, KHÔNG kick) ---
      if (["die", "ndfb", "memdie"].includes(query)) {
        const info = await getThreadInfo();
        if (!info) {
          await reply("❎ Không lấy được thông tin nhóm (threadInfo trống), hãy thử gửi vài tin nhắn rồi dùng lệnh lại.");
          return;
        }

        const userInfo = getUserInfoRows(info);

        if (userInfo.length === 0) {
          await reply("❎ Nhóm chưa có dữ liệu userInfo, vui lòng thử lại sau hoặc dùng lại lệnh sau khi bot hoạt động thêm một thời gian.");
          return;
        }

        const lockedUsers = userInfo.filter((u) => u && (u.gender === undefined || u.gender === null));

        if (lockedUsers.length === 0) {
          await reply("✅ Trong nhóm hiện tại không phát hiện tài khoản bị khoá (không có user nào có gender null/undefined trong threadInfo).");
          return;
        }

        const botID = client.id;
        const adminIDs = threadAdminIds(info);
        const isBotAdmin = adminIDs.includes(String(botID));

        const lines: string[] = [];
        for (let i = 0; i < lockedUsers.length; i += 1) {
          const u = lockedUsers[i];
          const uid = String(u.id);
          let name = u.name as string | undefined;
          if (!name) {
            try {
              name = (await userData.getName(uid)) ?? "Người dùng Facebook";
            } catch {
              name = "Người dùng Facebook";
            }
          }
          lines.push(`${i + 1}. ${name} (${uid})`);
        }

        const header = [
          "🔎 THỐNG KÊ TÀI KHOẢN CÓ NGUY CƠ BỊ KHÓA",
          "",
          `📌 Số lượng phát hiện: ${lockedUsers.length}`,
          `👮 Bot là quản trị viên nhóm: ${isBotAdmin ? "Có" : "Không"}`,
          "",
          "📋 Danh sách (theo threadInfo.userInfo):",
        ];

        await reply([...header, ...lines].join("\n"));
        return;
      }

      if (query === "compare") {
        const uid1 = await parseUID(false, 1);
        const uid2 = await parseUID(false, 2);
        if (!uid1 || !uid2) {
          await reply("❎ Dùng: compare <@/uid1> <@/uid2>.");
          return;
        }

        const name1 = (await userData.getName(uid1)) ?? "Người dùng";
        const name2 = (await userData.getName(uid2)) ?? "Người dùng";

        const pick = (section: MessageCountItem[], id: string) =>
          section.find((entry) => entry?.id === id)?.count ?? 0;

        const stats1 = {
          day: pick(messageCount.day, uid1),
          week: pick(messageCount.week, uid1),
          month: pick(messageCount.month, uid1),
          total: pick(messageCount.total, uid1),
        };

        const stats2 = {
          day: pick(messageCount.day, uid2),
          week: pick(messageCount.week, uid2),
          month: pick(messageCount.month, uid2),
          total: pick(messageCount.total, uid2),
        };

        const rankIn = (section: MessageCountItem[], id: string) =>
          section
            .slice()
            .sort((a, b) => (b?.count ?? 0) - (a?.count ?? 0))
            .findIndex((entry) => entry?.id === id) + 1 || "N/A";

        const rank1 = rankIn(messageCount.total, uid1);
        const rank2 = rankIn(messageCount.total, uid2);

        await reply(
          [
            "『 SO SÁNH THÀNH VIÊN 』",
            "",
            `👤 ${name1}`,
            `🎖️ Hạng: ${VI_BADGE(stats1.total)}`,
            `📊 Hôm nay: ${formatNumber(stats1.day)} tin`,
            `📊 Tuần: ${formatNumber(stats1.week)} tin`,
            `📊 Tháng: ${formatNumber(stats1.month)} tin`,
            `📊 Tổng: ${formatNumber(stats1.total)} tin (Top ${rank1})`,
            "",
            `👤 ${name2}`,
            `🎖️ Hạng: ${VI_BADGE(stats2.total)}`,
            `📊 Hôm nay: ${formatNumber(stats2.day)} tin`,
            `📊 Tuần: ${formatNumber(stats2.week)} tin`,
            `📊 Tháng: ${formatNumber(stats2.month)} tin`,
            `📊 Tổng: ${formatNumber(stats2.total)} tin (Top ${rank2})`,
          ].join("\n"),
        );
        return;
      }

      if (query === "trừ") {
        if (!isOwner(senderID)) {
          await reply("❎ Tính năng này chỉ dành cho Chủ bot.");
          return;
        }

        if (!args[1] || Number.isNaN(Number.parseInt(args[1], 10))) {
          await reply("❎ Vui lòng nhập phần trăm cần trừ (0–100).");
          return;
        }

        const percent = Number.parseInt(args[1], 10);
        if (percent < 0 || percent > 100) {
          await reply("❎ Vui lòng nhập phần trăm cần trừ (0–100).");
          return;
        }

        const uid = await parseUID(true, 2);
        if (!uid) {
          await reply("❎ Vui lòng tag/reply người cần trừ tương tác.");
          return;
        }

        for (const key of SECTIONS) {
          const index = messageCount[key].findIndex((entry) => entry?.id === uid);
          if (index === -1) continue;
          const entry = messageCount[key][index];
          if (!entry) continue;
          const current = entry.count ?? 0;
          const decrease = Math.round(current * (percent / 100));
          entry.count = Math.max(0, current - decrease);
        }

        await threadData.update(threadID, { messageCount });
        const name = (await userData.getName(uid)) ?? "Người dùng";
        await reply(`✅ Đã trừ ${percent}% tương tác của ${name} ở mọi mốc.`);
        return;
      }

      if (query === "cộng") {
        if (!isOwner(senderID)) {
          await reply("❎ Tính năng này chỉ dành cho Chủ bot.");
          return;
        }

        if (!args[1] || Number.isNaN(Number.parseInt(args[1], 10)) || Number.parseInt(args[1], 10) < 0) {
          await reply("❎ Vui lòng nhập số tin nhắn muốn cộng.");
          return;
        }

        const uid = await parseUID(false, 2);
        if (!uid) {
          await reply("❎ Vui lòng tag/reply người cần cộng tương tác.");
          return;
        }

        const increment = Number.parseInt(args[1], 10);
        for (const key of SECTIONS) {
          const entry = messageCount[key].find((item) => item?.id === uid);
          if (entry) {
            entry.count = (entry.count ?? 0) + increment;
          } else {
            messageCount[key].push({ id: uid, count: increment, lastInteraction: Date.now() });
          }
        }

        await threadData.update(threadID, { messageCount });
        const name = (await userData.getName(uid)) ?? "Người dùng";
        await reply(`✅ Đã cộng ${formatNumber(increment)} tin cho ${name} ở mọi mốc.`);
        return;
      }

      if (query === "set") {
        if (!isOwner(senderID)) {
          await reply("❎ Tính năng này chỉ dành cho Chủ bot.");
          return;
        }

        if (!args[1] || Number.isNaN(Number.parseInt(args[1], 10)) || Number.parseInt(args[1], 10) < 0) {
          await reply("❎ Vui lòng nhập số tin nhắn muốn đặt.");
          return;
        }

        const uid = await parseUID(false, 2);
        if (!uid) {
          await reply("❎ Vui lòng tag/reply người cần đặt số tin nhắn.");
          return;
        }

        const targetCount = Number.parseInt(args[1], 10);
        for (const key of SECTIONS) {
          const entry = messageCount[key].find((item) => item?.id === uid);
          if (entry) {
            entry.count = targetCount;
          } else {
            messageCount[key].push({ id: uid, count: targetCount, lastInteraction: Date.now() });
          }
        }

        await threadData.update(threadID, { messageCount });
        const name = (await userData.getName(uid)) ?? "Người dùng";
        await reply(`✅ Đã đặt ${formatNumber(targetCount)} tin cho ${name} ở mọi mốc.`);
        return;
      }

      if (query === "lọc") {
        const info = await getThreadInfo();
        const botID = client.id;

        if (!isThreadAdmin(info, String(botID))) {
          await reply("❎ Cần cấp quyền Quản trị viên cho bot.");
          return;
        }

        if (!isThreadAdmin(info, String(senderID)) && !isOwner(senderID)) {
          await reply("❎ Bạn không đủ quyền để lọc thành viên.");
          return;
        }

        if (!args[1] || Number.isNaN(Number.parseInt(args[1], 10)) || Number.parseInt(args[1], 10) < 0) {
          await reply("❎ Vui lòng nhập ngưỡng tối thiểu (số tin không âm).");
          return;
        }

        const min = Number.parseInt(args[1], 10);
        const removed: string[] = [];

        for (const uid of participantIDs) {
          if (uid === botID) continue;
          const record = messageCount.total.find((entry) => entry?.id === uid);
          const count = record?.count ?? 0;
          if (count <= min) {
            try {
              await client.removeUserFromGroup(uid, threadID);
              removed.push(uid);
              await new Promise((resolve) => setTimeout(resolve, 600));
            } catch {

            }
          }
        }

        if (removed.length === 0) {
          await reply(`✅ Không có thành viên nào ≤ ${formatNumber(min)} tin.`);
          return;
        }

        const nameByParticipant = participantNameMapFromThreadInfo(info);
        let fromGraph: Record<string, FbGraphUserInfo> = {};
        try {
          fromGraph = await client.getUserInfo(removed);
        } catch {
          fromGraph = {};
        }

        const names = await Promise.all(
          removed.map(async (id) => {
            const sid = String(id);
            const fromThread = nameByParticipant.get(sid);
            if (fromThread) return fromThread;
            const record = messageCount.total.find((entry) => String(entry?.id) === sid);
            if (record?.name) return record.name;
            const g = fromGraph[sid];
            if (g?.name) return g.name;
            return (await userData.getName(id)) ?? "Người dùng";
          }),
        );

        const output = [
          "✅ ĐÃ XOÁ THÀNH VIÊN",
          "",
          `📊 Số lượng: ${removed.length} thành viên`,
          `📉 Ngưỡng: ≤ ${formatNumber(min)} tin`,
          "",
          "📋 Danh sách:",
          ...names.map((name: string, index: number) => `${index + 1}. ${name}`),
        ].join("\n");

        await reply(output);
        return;
      }

      if (query === "refresh") {
        const info = await getThreadInfo();
        if (!isThreadAdmin(info, String(senderID)) && !isOwner(senderID)) {
          await reply("❎ Bạn không đủ quyền để làm mới dữ liệu.");
          return;
        }

        let removed = 0;
        for (const key of SECTIONS) {
          const before = messageCount[key].length;
          messageCount[key] = messageCount[key].filter((entry) => participantIDs.includes(entry.id));
          removed += before - messageCount[key].length;
        }

        await threadData.update(threadID, { messageCount });
        await reply(
          removed > 0
            ? `✅ Đã dọn ${removed} ID không còn trong nhóm.`
            : "✅ Dữ liệu đã gọn, không có ID cần xoá.",
        );
        return;
      }

      if (query === "box") {
        const totals = SECTIONS.reduce(
          (result, key) => {
            result[key] = messageCount[key].reduce((sum, item) => sum + (item?.count ?? 0), 0);
            return result;
          },
          { total: 0, day: 0, week: 0, month: 0 } satisfies Record<SectionKey, number>,
        );

        const interactionRates = {
          dayRate: totals.total > 0 ? (totals.day / totals.total) * 100 : 0,
          weekRate: totals.total > 0 ? (totals.week / totals.total) * 100 : 0,
          monthRate: totals.total > 0 ? (totals.month / totals.total) * 100 : 0,
        };

        try {
          const threadInfo = await getThreadInfo();
          if (!threadInfo) {
            await reply("❎ Không thể lấy thông tin nhóm");
            return;
          }

          const adminIdList = threadAdminIds(threadInfo);
          const adminNames = await Promise.all(
            adminIdList.map(async (adminId) => {
              try {
                return (await userData.getName(adminId)) ?? "Unknown Admin";
              } catch (error) {
                console.error("Error getting admin name:", error);
                return "Unknown Admin";
              }
            }),
          );

          const genderMale: string[] = [];
          const genderFemale: string[] = [];
          const genderUnknown: string[] = [];

          if (Array.isArray(threadInfo.userInfo)) {
            for (const user of threadInfo.userInfo) {
              if (!user) continue;
              switch (user.gender) {
                case "MALE":
                  genderMale.push(user.name ?? "Unknown");
                  break;
                case "FEMALE":
                  genderFemale.push(user.name ?? "Unknown");
                  break;
                default:
                  genderUnknown.push(user.name ?? "Unknown");
                  break;
              }
            }
          }

          const replyData: MessageForm = {
            body: [
              `Nhóm: ${threadInfo.threadName ?? "không có"}`,
              `ID: ${threadInfo.threadID ?? threadID}`,
              `Phê duyệt: ${threadInfo.approvalMode ? "bật" : "tắt"}`,
              `Emoji: ${threadInfo.emoji ?? "👍"}`,
              `Số thành viên: ${threadInfo.participantIDs?.length ?? 0} (Nam: ${genderMale.length}, Nữ: ${genderFemale.length})`,
              "",
              "Quản trị viên:",
              adminNames.map((name: string) => `- ${name}`).join("\n"),
              "",
              "Tin nhắn:",
              `- Hôm nay: ${totals.day.toLocaleString("vi-VN")}`,
              `- Trong tuần: ${totals.week.toLocaleString("vi-VN")}`,
              `- Trong tháng: ${totals.month.toLocaleString("vi-VN")}`,
              `- Tổng: ${totals.total.toLocaleString("vi-VN")}`,
              "",
              "Tỷ lệ tương tác:",
              `- Ngày: ${interactionRates.dayRate.toFixed(2)}%`,
              `- Tuần: ${interactionRates.weekRate.toFixed(2)}%`,
              `- Tháng: ${interactionRates.monthRate.toFixed(2)}%`,
            ].join("\n"),
          };

          if (threadInfo.imageSrc && utils?.stream) {
            try {
              const stream = utils.stream as (url: string, ext: string) => Promise<unknown>;
              const att = await stream(threadInfo.imageSrc, "jpg");
              if (typeof replyData === "object" && replyData !== null && !Array.isArray(replyData)) {
                (replyData as Record<string, unknown>).attachment = att;
              }
            } catch (error) {
              console.error("Error loading group image:", error);
            }
          }

          await reply(replyData);
        } catch (error: unknown) {
          console.error("Error in box command:", error);
          const msg = error instanceof Error ? error.message : String(error);
          await reply(`❎ Không thể lấy thông tin nhóm của bạn!\n${msg}`);
        }

        return;
      }

      if (query === "reset") {
        const info = await getThreadInfo();
        if (!isThreadAdmin(info, String(senderID)) && !isOwner(senderID)) {
          await reply("❎ Bạn không đủ quyền để đặt lại dữ liệu.");
          return;
        }

        for (const key of SECTIONS) {
          messageCount[key] = [];
        }
        await threadData.update(threadID, { messageCount });
        await reply("✅ Đã đặt lại toàn bộ dữ liệu tương tác của nhóm.");
        return;
      }

      if (query === "call") {
        const info = await getThreadInfo();
        if (!isThreadAdmin(info, String(senderID)) && !isOwner(senderID)) {
          await reply("❎ Bạn không đủ quyền dùng tính năng này.");
          return;
        }

        const botID = client.id;
        const lowIDs = messageCount.day
          .filter((entry) => (entry?.count ?? 0) < 5 && entry.id !== botID && entry.id)
          .map((entry) => entry.id)
          .filter((id): id is string => Boolean(id));

        if (lowIDs.length === 0) {
          await reply("✅ Hôm nay không có thành viên tương tác thấp.");
          return;
        }

        const mentions: Array<{ tag: string; id: string }> = [];
        const lines: string[] = [];

        for (let i = 0; i < lowIDs.length; i += 1) {
          const id = lowIDs[i];
          if (!id) continue;
          const name: string = (await userData.getName(id)) ?? "Người dùng";
          mentions.push({ tag: name, id });
          lines.push(`${i + 1}. @${name}`);
        }

        const output = [
          "📣 NHẮC NHỞ TƯƠNG TÁC HÔM NAY",
          "",
          ...lines.map((line) => line.replace(/^\d+\.\s*/, "")),
        ].join("\n");

        await send({ body: output, mentions });
        return;
      }

      if (["server", "-s", "sever", "-sv", "hethong", "hệthống", "hệ-thống", "maychu", "máychủ"].includes(query)) {
        const section = mapSectionArg(args[1]);
        const limit = limitFrom(args[2], 50);
        const { full } = await computeServerRank(senderID, section.key);
        const top = full.slice(0, limit);

        const botID = client.id;
        for (const entry of top) {
          try {
            entry.name = (await userData.getName(entry.id)) ?? "Người dùng";
          } catch {
            entry.name = "Người dùng";
          }
          entry.roleTag = deriveRoleTag(String(entry.id), String(botID), botConfig);
        }

        const totalMessages = full.reduce((sum, item) => sum + (item.count ?? 0), 0);
        const selfIndex = full.findIndex((entry) => String(entry.id) === String(senderID));
        const body = [
          `『 TOP TOÀN HỆ THỐNG – ${section.label.toUpperCase()} 』`,
          "",
          ...top.map(
            (entry, index) =>
              `${String(index + 1).padStart(2, " ")}. ${entry.name}${entry.roleTag ? ` (${entry.roleTag})` : ""} • ${formatNumber(entry.count)} tin`,
          ),
          "",
          `📊 Tổng tin nhắn: ${formatNumber(totalMessages)}`,
          `🏆 Hạng của bạn: ${selfIndex >= 0 ? selfIndex + 1 : "N/A"}/${formatNumber(full.length)}`,
        ].join("\n");

        await reply(body);
        return;
      }

      let data: MessageCountItem[] | undefined;
      let header = "";
      let topLimit: number | null = null;

      switch (query) {
        case "all":
        case "-a":
          data = messageCount.total;
          header = "Bảng xếp hạng (Tổng)";
          topLimit = args[1] && /^\d+$/.test(args[1]) ? Number.parseInt(args[1], 10) : null;
          break;
        case "week":
        case "-w":
          data = messageCount.week;
          header = "Bảng xếp hạng (Tuần)";
          topLimit = args[1] && /^\d+$/.test(args[1]) ? Number.parseInt(args[1], 10) : null;
          break;
        case "day":
        case "-d":
          data = messageCount.day;
          header = "Bảng xếp hạng (Ngày)";
          topLimit = args[1] && /^\d+$/.test(args[1]) ? Number.parseInt(args[1], 10) : null;
          break;
        case "month":
        case "-m":
          data = messageCount.month;
          header = "Bảng xếp hạng (Tháng)";
          topLimit = args[1] && /^\d+$/.test(args[1]) ? Number.parseInt(args[1], 10) : null;
          break;
        default: {
          const uid = await parseUID(true, 0);
          if (!uid) return;

          const sortedTotal = messageCount.total
            .filter((entry) => entry?.id)
            .slice()
            .sort((a, b) => (b?.count ?? 0) - (a?.count ?? 0));

          const record = sortedTotal.find((entry) => entry?.id === uid);
          const name = (await userData.getName(uid)) ?? "Người dùng";

          const countTotal = record?.count ?? 0;
          const countDay = messageCount.day.find((entry) => entry?.id === uid)?.count ?? 0;
          const countWeek = messageCount.week.find((entry) => entry?.id === uid)?.count ?? 0;
          const countMonth = messageCount.month.find((entry) => entry?.id === uid)?.count ?? 0;
          const lastInteraction = formatTime(record?.lastInteraction);
          const rankInGroup = sortedTotal.findIndex((entry) => entry?.id === uid);
          const totalUsers = sortedTotal.length;
          const dayDenominator = messageCount.day.reduce((sum, entry) => sum + (entry?.count ?? 0), 0);
          const todayRate = dayDenominator ? ((countDay / dayDenominator) * 100).toFixed(2) : "0.00";

          const info = await getThreadInfo();
          let role = "Thành viên";
          if (isOwner(uid)) role = "Chủ bot";
          else if (Array.isArray(botConfig.ADMIN) && botConfig.ADMIN.map(String).includes(String(uid))) {
            role = "Quản trị viên bot";
          } else if (isThreadAdmin(info, String(uid))) {
            role = "Quản trị viên nhóm";
          }

          let userStore = await userData.get(uid);
          if (!userStore) {
            const newStore: Partial<UserData> = { joinedThreads: { [threadID]: Date.now() } };
            await userData.set(uid, newStore);
            userStore = (await userData.get(uid)) ?? null;
          }
          if (!userStore?.joinedThreads) {
            const updatedStore: Partial<UserData> = {
              ...(userStore || {}),
              joinedThreads: { [threadID]: Date.now() },
            };
            await userData.set(uid, updatedStore);
            userStore = (await userData.get(uid)) ?? null;
          }
          if (userStore && !userStore.joinedThreads?.[threadID]) {
            const updatedStore: Partial<UserData> = {
              ...userStore,
              joinedThreads: { ...(userStore.joinedThreads || {}), [threadID]: Date.now() },
            };
            await userData.set(uid, updatedStore);
            userStore = (await userData.get(uid)) ?? null;
          }

          const joinedRaw = userStore?.joinedThreads?.[threadID];
          const joinedAt = parseJoinedAtMs(joinedRaw);
          const joinMoment = moment.tz(joinedAt, TZ);
          const now = moment.tz(TZ);
          const diff = {
            d: now.diff(joinMoment, "days"),
            h: now.diff(joinMoment, "hours") % 24,
            m: now.diff(joinMoment, "minutes") % 60,
            s: now.diff(joinMoment, "seconds") % 60,
          };

          const serverDay = await computeServerRank(uid, "day");
          const serverWeek = await computeServerRank(uid, "week");
          const serverMonth = await computeServerRank(uid, "month");
          const serverTotal = await computeServerRank(uid, "total");

          const lines = [
            "⚡️ HỒ SƠ THỐNG KÊ THÀNH VIÊN",
            "",
            "👤 THÔNG TIN",
            `Họ tên: ${name}`,
            `Vai trò: ${role}`,
            `Hạng: ${VI_BADGE(countTotal)}`,
            "",
            "📊 CHỈ SỐ TƯƠNG TÁC",
            `Hôm nay: ${formatNumber(countDay)} tin`,
            `Tuần này: ${formatNumber(countWeek)} tin`,
            `Tháng này: ${formatNumber(countMonth)} tin`,
            `Tích luỹ: ${formatNumber(countTotal)} tin`,
            "",
            "📈 XẾP HẠNG",
            `Nhóm (Tổng): Top ${rankInGroup + 1} / ${formatNumber(totalUsers)}`,
            `Hệ thống (Ngày): ${serverDay.rank ? `Top ${formatNumber(serverDay.rank)} / ${formatNumber(serverDay.totalUsers)}` : "Chưa có dữ liệu"}`,
            `Hệ thống (Tuần): ${serverWeek.rank ? `Top ${formatNumber(serverWeek.rank)} / ${formatNumber(serverWeek.totalUsers)}` : "Chưa có dữ liệu"}`,
            `Hệ thống (Tháng): ${serverMonth.rank ? `Top ${formatNumber(serverMonth.rank)} / ${formatNumber(serverMonth.totalUsers)}` : "Chưa có dữ liệu"}`,
            `Hệ thống (Tổng): ${serverTotal.rank ? `Top ${formatNumber(serverTotal.rank)} / ${formatNumber(serverTotal.totalUsers)}` : "Chưa có dữ liệu"}`,
            "",
            "🧮 PHÂN TÍCH",
            `Tỉ trọng hôm nay: ${todayRate}%`,
            `Hoạt động gần nhất: ${lastInteraction}`,
            "",
            "⏳ DẤU MỐC THAM GIA",
            `Thời điểm: ${joinMoment.format("HH:mm:ss - DD/MM/YYYY")}`,
            `Đã được: ${diff.d} ngày ${diff.h} giờ ${diff.m} phút ${diff.s} giây`,
            "",
            "💡 Mẹo: Thả cảm xúc 😆 vào tin nhắn này để xem bảng xếp hạng tổng của nhóm",
          ];

          await reply(lines.join("\n"), (error: Error | null, infoCallback?: SendMessageResult) => {
            if (!error && infoCallback?.messageID) {
              const payload: ReactData & { iduser: string } = {
                commandName,
                messageID: infoCallback.messageID,
                author: event.senderID,
                iduser: uid,
              };
              main.onReact.set(infoCallback.messageID, payload);
            }
          });

          return;
        }
      }

      if (Array.isArray(data)) {
        const filtered = data.filter((entry) => entry?.id);

        for (const entry of filtered) {
          try {
            entry.name = (await userData.getName(entry.id)) ?? "Người dùng";
          } catch {
            entry.name = "Người dùng";
          }
        }

        const sorted = filtered
          .filter((entry) => typeof entry.count === "number")
          .slice()
          .sort((a, b) => b.count - a.count);
        const displayed = topLimit ? sorted.slice(0, topLimit) : sorted;
        const botID = client.id;

        for (const entry of displayed) {
          entry.roleTag = deriveRoleTag(String(entry.id), String(botID), botConfig);
        }

        const sumShown = displayed.reduce((sum, entry) => sum + (entry.count ?? 0), 0);
        const yourRank = sorted.findIndex((entry) => entry?.id === event.senderID);
        const totalUsers = sorted.length;

        const body = [
          `『 ${header.toUpperCase()}${topLimit ? ` • TOP ${topLimit}` : ""} 』`,
          "",
          ...displayed.map(
            (entry, index) =>
              `${String(index + 1).padStart(2, " ")}. ${entry.name ?? "Người dùng"}${entry.roleTag ? ` (${entry.roleTag})` : ""} • ${formatNumber(entry.count)} tin`,
          ),
          "",
          `📊 Tổng tin nhắn (hiển thị): ${formatNumber(sumShown)}`,
          `🏆 Hạng của bạn: ${yourRank >= 0 ? yourRank + 1 : "N/A"}/${formatNumber(totalUsers)}`,
          "",
          "📌 Gợi ý: Reply số thứ tự để xoá thành viên khỏi nhóm (yêu cầu quyền quản trị viên)",
        ].join("\n");

        const output = body;

        await reply(output, (error: Error | null, infoCallback?: SendMessageResult) => {
          if (!error && infoCallback?.messageID) {
            const payload = {
              commandName,
              messageID: infoCallback.messageID,
              tag: "locmen",
              thread: event.threadID,
              author: event.senderID,
              storage: sorted,
            } as unknown as ReplyData;
            main.onReply.set(infoCallback.messageID, payload);
          }
        });
      } else {
        await reply("❎ Không có dữ liệu để hiển thị.");
      }
    } catch (error: unknown) {
      console.error("Error in check command:", error);
      const msg = error instanceof Error ? error.message : String(error);
      await reply(`❎ Đã xảy ra lỗi: ${msg}`);
    }
  },

  async onReact(ctx: CommandOnReactContext) {
    const { unsend, reply, event, userData, client, Reaction, commandName, main, threadData, config } = ctx;
    const botConfig = config as DonixBotConfig;

    try {
      const reactionData = Reaction as ReactData & { iduser?: string };
      const reactorID = event.userID ?? event.senderID;
      if (reactorID !== reactionData?.author) return;
      if (event.reaction !== "😆") return;

      const messageCount: MessageCountStore | undefined = (await threadData.get(event.threadID))?.messageCount;
      if (!messageCount) {
        await reply("❎ Không có dữ liệu.");
        return;
      }

      const data = messageCount.total ?? [];
      for (const entry of data) {
        if (!entry?.id) continue;
        try {
          entry.name = (await userData.getName(entry.id)) ?? "Người dùng";
        } catch {
          entry.name = "Người dùng";
        }
      }

      const sorted = data
        .filter((entry) => entry?.id && typeof entry.count === "number")
        .slice()
        .sort((a, b) => b.count - a.count);

      const yourRank = sorted.findIndex((entry) => entry?.id === reactionData?.iduser);
      const youName = reactionData.iduser
        ? ((await userData.getName(reactionData.iduser)) ?? "Bạn")
        : "Bạn";
      const target = event.senderID === reactionData?.iduser ? "Bạn" : youName;
      const botID = client.getCurrentUserID();

      for (const entry of sorted) {
        entry.roleTag = deriveRoleTag(String(entry.id), String(botID), botConfig);
      }

      const totalMessages = sorted.reduce((sum, entry) => sum + (entry.count ?? 0), 0);
      const youMessages = sorted[yourRank]?.count ?? 0;

      const body = [
        "『 BẢNG XẾP HẠNG TỔNG 』",
        "",
        ...sorted.map(
          (entry, index) =>
            `${String(index + 1).padStart(2, " ")}. ${entry.name ?? "Người dùng"}${entry.roleTag ? ` (${entry.roleTag})` : ""} • ${entry.count.toLocaleString("vi-VN")} tin`,
        ),
        "",
        `📊 Tổng tin nhắn: ${totalMessages.toLocaleString("vi-VN")}`,
        `🏆 ${target} đang xếp hạng: ${yourRank >= 0 ? yourRank + 1 : "N/A"} với ${youMessages.toLocaleString("vi-VN")} tin`,
        "",
        "📌 Gợi ý: Reply số thứ tự để xoá thành viên (yêu cầu quyền quản trị viên)",
      ].join("\n");

      const output = body;

      await reply(output, (error: Error | null, infoCallback?: SendMessageResult) => {
        if (!error && infoCallback?.messageID) {
          const payload = {
            commandName,
            messageID: infoCallback.messageID,
            tag: "locmen",
            thread: event.threadID,
            author: event.senderID,
            storage: sorted,
          } as unknown as ReplyData;
          main.onReply.set(infoCallback.messageID, payload);
        }
      });

      if (reactionData?.messageID) {
        await unsend?.(reactionData.messageID);
      }
    } catch (error) {
      console.error("Error in check command:", error);
      await reply("❎ Có lỗi khi xử lý phản ứng.");
    }
  },

  async onReply(ctx: CommandOnReplyContext) {
    const { client, event, Reply, threadData, userData, reply } = ctx;

    try {
      const replyData = Reply as ReplyData & {
        tag?: string;
        storage?: MessageCountItem[];
      };
      if (!Reply || event.senderID !== replyData.author) return;

      const { threadID } = event;
      const body = (event.body ?? "").trim();
      const store = await threadData.get(threadID);
      if (!store) {
        await reply("❎ Không thể lấy dữ liệu nhóm.");
        return;
      }

      const info = store.threadInfo;
      const botID = client.getCurrentUserID();

      if (replyData.tag === "locmen") {
        if (!isThreadAdmin(info, String(botID))) {
          await reply("❎ Bot cần quyền Quản trị viên.");
          return;
        }

        if (!isThreadAdmin(info, String(event.senderID))) {
          await reply("❎ Bạn không đủ quyền xoá thành viên.");
          return;
        }

        const numbers = body.split(/\s+/);
        if (!numbers.every((value) => /^\d+$/.test(value))) {
          await reply("⚠️ Vui lòng chỉ nhập số thứ tự, cách nhau bởi dấu cách.");
          return;
        }

        if (!Array.isArray(replyData.storage)) {
          await reply("❎ Dữ liệu nội bộ không hợp lệ.");
          return;
        }

        const indexes = numbers.map((value) => Number.parseInt(value, 10));
        const removed: string[] = [];
        const failed: number[] = [];

        for (const index of indexes) {
          const target = replyData.storage[index - 1];
          if (!target?.id) {
            failed.push(index);
            continue;
          }

          try {
            const name = (await userData.getName(target.id)) ?? "Người dùng";
            await client.removeUserFromGroup(target.id, threadID);
            removed.push(`${index}. ${name}`);
            await new Promise((resolve) => setTimeout(resolve, 600));
          } catch {
            failed.push(index);
          }
        }

        const outputLines = [
          "🔄 KẾT QUẢ XOÁ THÀNH VIÊN",
          "",
          `✅ Thành công: ${removed.length}`,
          `❌ Thất bại: ${failed.length}`,
        ];

        if (removed.length > 0) {
          outputLines.push("", "📋 Danh sách đã xoá:");
          removed.forEach((item, index) => {
            outputLines.push(`${index + 1}. ${item.replace(/^\d+\.\s*/, "")}`);
          });
        }
        const output = outputLines.join("\n");

        await reply(output);
      }
    } catch {
      await reply("❎ Có lỗi khi xử lý trả lời");
    }
  },
} satisfies Command;

export default checkCommand;
