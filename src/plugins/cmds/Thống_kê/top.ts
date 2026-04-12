import type {
  Command,
  CommandOnCallContext,
  CommandOnReplyContext,
  ThreadDataModel,
  UserDataModel
} from "@types";
import { getDbPromisified } from "../../../core/database/schema";

type ExtendedUserDataModel = UserDataModel & {
  getTopMoneyThread(
    participantIDs: string[],
    limit?: number
  ): Promise<Array<{ userID: string; money: number | bigint }>>;
  getTopMoneyServer(
    limit?: number
  ): Promise<Array<{ userID: string; money: number | bigint }>>;
  getTopExp(limit?: number): Promise<Array<{ userID: string; exp: number }>>;
};

/** Narrowing for thread store helpers not on `ThreadDataModel` typings. */
type ThreadTopExtras = {
  getTopThreads(
    limit?: number
  ): Promise<Array<{ threadID: string; name: string | null; messageCount: number }>>;
  getTopServerUsers(
    limit?: number
  ): Promise<Array<{ userID: string; messageCount: number; threadCount: number }>>;
  getTopInteractions(
    threadID: string | number,
    limit?: number
  ): Promise<{
    total: Array<{ id: string; count: number }>;
    week: Array<{ id: string; count: number }>;
    day: Array<{ id: string; count: number }>;
    month: Array<{ id: string; count: number }>;
    count: number;
  }>;
};

function formatMoney(money: number | bigint | string | undefined | null): string {
  if (money === undefined || money === null) return "0";
  if (typeof money === "bigint") {
    return money.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  if (typeof money === "string") {
    const s = money.trim().replace(/,/g, "");
    if (!/^\d+$/.test(s)) return "0";
    return BigInt(s).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  if (!Number.isFinite(money)) return "0";
  const intVal = Math.trunc(money);
  return intVal.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function calculateLevel(exp: number): number {
  const safeExp = Number.isFinite(exp) && exp >= 0 ? exp : 0;
  const base = 100;
  return Math.max(1, Math.floor(safeExp / base) + 1);
}

function getRankTitle(level: number): string {
  if (level >= 50) return "🐉 Thần Thoại";
  if (level >= 40) return "🔥 Huyền Thoại";
  if (level >= 30) return "💎 Kim Cương";
  if (level >= 20) return "🏆 Vàng";
  if (level >= 10) return "🥈 Bạc";
  if (level >= 5) return "🥉 Đồng";
  return "🌱 Tân Thủ";
}

const topCommand: Command = {
  name: "top",
  version: "1.1.0",
  role: 0,
  desc: "Xem các bảng xếp hạng",
  guide:
    "- top thread: Xem danh sách các nhóm hàng đầu\n- top user: Xem danh sách người dùng hàng đầu\n- top money: Xem bảng xếp hạng tiền\n- top level: Xem bảng xếp hạng cấp độ\n- top exp: Xem bảng xếp hạng kinh nghiệm\n- top interact: Xem bảng xếp hạng tương tác",
  cd: 5,
  prefix: true,
  async onReply(ctx: CommandOnReplyContext) {
    const { event, userData, reply, Reply } = ctx;
    const enhancedUserData = userData as ExtendedUserDataModel;
    const { args, participantIDs: p, senderID } = event as typeof event & {
      participantIDs?: string[];
      senderID: string;
    };

    const replyMeta = (Reply || {}) as { author?: string };
    if (!Reply || senderID !== replyMeta.author) {
      return;
    }

    if (!args || args.length === 0) {
      return;
    }

    try {
      const topThread = await enhancedUserData.getTopMoneyThread(p || []);
      const topServer = await enhancedUserData.getTopMoneyServer();

      switch (args[0]) {
        case "1": {
          const topBoxMsg = await Promise.all(
            topThread
              .sort((a: { money?: number | bigint }, b: { money?: number | bigint }) => {
                const aMoney = typeof a.money === "bigint" ? a.money : BigInt(a.money ?? 0);
                const bMoney = typeof b.money === "bigint" ? b.money : BigInt(b.money ?? 0);
                if (bMoney > aMoney) return 1;
                if (bMoney < aMoney) return -1;
                return 0;
              })
              .slice(0, 15)
              .map(async (record: { userID: string; money?: number | bigint }, index: number) => {
                const medal = index < 3 ? ["👑", "🥈", "🥉"][index] : "🏅";
                const name = await enhancedUserData.getName(record.userID as string);
                return `${medal} ${index + 1}. ${name}\n💰 ${formatMoney(record.money as number | bigint | string | undefined)}`;
              })
          );

          await reply({
            body: `━━ TOP MONEY TRONG BOX ━━\n\n${topBoxMsg.join("\n")}\n\n⚠️ Nghiêm cấm buôn bán coin | Phát hiện = Ban vĩnh viễn\n💎 Báo cáo gian lận sẽ được thưởng`
          });
          break;
        }

        case "2": {
          const topServerMsg = await Promise.all(
            topServer
              .sort((a: { money?: number | bigint }, b: { money?: number | bigint }) => {
                const aMoney = typeof a.money === "bigint" ? a.money : BigInt(a.money ?? 0);
                const bMoney = typeof b.money === "bigint" ? b.money : BigInt(b.money ?? 0);
                if (bMoney > aMoney) return 1;
                if (bMoney < aMoney) return -1;
                return 0;
              })
              .slice(0, 15)
              .map(async (record: { userID: string; money?: number | bigint }, index: number) => {
                const medal = index < 3 ? ["👑", "🥈", "🥉"][index] : "🏅";
                const name = await enhancedUserData.getName(record.userID as string);
                return `${medal} ${index + 1}. ${name}\n💰 ${formatMoney(record.money as number | bigint | string | undefined)}`;
              })
          );

          await reply({
            body: `━━ TOP MONEY TOÀN SERVER ━━\n\n${topServerMsg.join("\n")}\n\n⚠️ Nghiêm cấm buôn bán coin | Phát hiện = Ban vĩnh viễn\n💎 Báo cáo gian lận sẽ được thưởng`
          });
          break;
        }

        default:
          break;
      }
    } catch (error: unknown) {
      console.error("Top command onReply error:", error);
      await reply({
        body: `❌ Đã xảy ra lỗi: ${error instanceof Error ? error.message : "Lỗi không xác định"
          }`
      });
    }
  },

  async onCall(ctx: CommandOnCallContext) {
    const { event, reply, args, userData, main, commandName, threadData } = ctx;

    const enhancedUserData = userData as ExtendedUserDataModel;
    const enhancedThreadData = threadData as ThreadDataModel & ThreadTopExtras;

    if (!args || args.length === 0) {
      await reply({
        body: `━━ BẢNG XẾP HẠNG ━━\n\n→ top thread: Xem BXH nhóm 👥\n→ top money: Xem BXH tiền 💰\n→ top exp: Xem BXH kinh nghiệm ⭐\n→ top level: Xem BXH cấp độ 📊\n→ top interact: Xem BXH tương tác 💭`
      });
      return;
    }

    const subcommand = args[0]?.toLowerCase();

    try {
      switch (subcommand) {
        case "thread": {
          const topThreads = await enhancedThreadData.getTopThreads();

          const threadList = topThreads
            .slice(0, 15)
            .map((thread, index: number) => {
              const medal = index < 3 ? ["👑", "🥈", "🥉"][index] : "🏅";
              const name = thread.name ?? "Không tên";
              return `${medal} ${index + 1}. ${name}\n💬 Messages: ${thread.messageCount.toLocaleString()}\n`;
            })
            .join("\n");

          await reply({
            body: `━━ TOP 15 NHÓM TƯƠNG TÁC CAO NHẤT ━━\n\n${threadList}\n\n📝 Hãy tương tác nhiều để nâng hạng nhé!`
          });
          break;
        }

        case "user": {
          const topUsers = await enhancedThreadData.getTopServerUsers();

          const userList = await Promise.all(
            topUsers
              .slice(0, 15)
              .map(async (user: { userID: string; messageCount: number }, index: number) => {
                const medal = index < 3 ? ["👑", "🥈", "🥉"][index] : "🏅";
                const name = await enhancedUserData.getName(user.userID);
                return `${medal} ${index + 1}. ${name}\n💭 Messages: ${user.messageCount.toLocaleString()}\n`;
              })
          );

          await reply({
            body: `━━ TOP 15 NGƯỜI DÙNG TƯƠNG TÁC CAO NHẤT ━━\n\n${userList.join("\n")}\n\n📝 Hãy tương tác nhiều để nâng hạng nhé!`
          });
          break;
        }

        case "interact": {
          const interactions = await enhancedThreadData.getTopInteractions(event.threadID);

          if (!interactions || !interactions.total) {
            await reply({
              body: "⚠️ Không có dữ liệu tương tác nào."
            });
            return;
          }

          const totalInteractions = interactions.total
            .filter((user: { id: string; count: number }) => user.count > 0)
            .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
            .slice(0, 15);

          if (totalInteractions.length === 0) {
            await reply({
              body: "⚠️ Chưa có thành viên nào tương tác."
            });
            return;
          }

          const interactionList = await Promise.all(
            totalInteractions.map(
              async (user: { id: string; count: number }, index: number) => {
                const medal = index < 3 ? ["👑", "🥈", "🥉"][index] : "🏅";
                const name = await enhancedUserData.getName(user.id);
                return `${medal} ${index + 1}. ${name}\n💭 Tin nhắn: ${user.count.toLocaleString()}\n`;
              }
            )
          );

          await reply({
            body: `━━ TOP 15 TƯƠNG TÁC TRONG NHÓM ━━\n\n${interactionList.join("\n")}\n\n📊 Tổng tin nhắn: ${interactions.count.toLocaleString()}\n📝 Hãy tương tác nhiều để nâng hạng nhé!`
          });
          break;
        }

        case "money": {
          const replyInfo = (await reply({
            body:
              "━━ KIỂM TRA TOP MONEY ━━\n\n" +
              "1. Top money trong box 📦\n" +
              "2. Top money toàn server 🌐\n\n" +
              "→ Reply số để xem top tương ứng"
          })) as { messageID?: string } | void;

          if (replyInfo && replyInfo.messageID) {
            main.onReply.set(replyInfo.messageID, {
              commandName,
              author: event.senderID,
              messageID: replyInfo.messageID,
              type: "money"
            });
          }
          break;
        }

        case "level": {
          const allUsers = await enhancedUserData.getAll(["userID", "data"]);

          const levelOf = (u: (typeof allUsers)[number]): number => {
            const d = u.data;
            if (d == null || typeof d !== "object") return 0;
            const lv = (d as Record<string, unknown>).level;
            return typeof lv === "number" ? lv : 0;
          };

          const levelList = allUsers
            .filter((user) => levelOf(user) > 0)
            .sort((a, b) => levelOf(b) - levelOf(a))
            .slice(0, 15)
            .map(async (user, index) => {
                const medal = index < 3 ? ["👑", "🥈", "🥉"][index] : "🏅";
                const name = await enhancedUserData.getName(user.userID);
                return `${medal} ${index + 1}. ${name}\n📊 Level: ${levelOf(user)}`;
              });

          const formattedList = await Promise.all(levelList);

          await reply({
            body: `━━ TOP 15 LEVEL CAO NHẤT SERVER ━━\n\n${formattedList.join("\n")}\n\n📝 Hãy tương tác nhiều để tăng level nhé!`
          });
          break;
        }

        case "exp": {
          const topExpUsers = await enhancedUserData.getTopExp(15);

          if (!topExpUsers || topExpUsers.length === 0) {
            await reply({
              body: "⚠️ Chưa có dữ liệu EXP nào."
            });
            return;
          }

          const expList = await Promise.all(
            topExpUsers.map(async (user: { userID: string; exp: number }, index: number) => {
              const medal = index < 3 ? ["👑", "🥈", "🥉"][index] : "🏅";
              const name = await enhancedUserData.getName(user.userID);
              const exp = Number.isFinite(Number(user.exp)) && Number(user.exp) >= 0 ? Number(user.exp) : 0;
              const level = calculateLevel(exp);
              const rankTitle = getRankTitle(level);


              const db = getDbPromisified();
              const rankRow = await db.get(
                "SELECT COUNT(*) + 1 AS rank FROM User WHERE exp > ?",
                [exp]
              ) as any;
              const rank = rankRow?.rank || index + 1;

              return `${medal} ${index + 1}. ${name}\n⭐ Level: ${level} (${rankTitle})\n📈 EXP: ${exp.toLocaleString()}\n🏅 Rank: #${rank}`;
            })
          );

          await reply({
            body: `━━ TOP 15 EXP CAO NHẤT SERVER ━━\n\n${expList.join("\n\n")}\n\n📝 Hãy tương tác nhiều để tăng EXP và rank nhé!`
          });
          break;
        }

        default: {
          await reply({
            body:
              "━━ BẢNG XẾP HẠNG ━━\n\n" +
              "→ top thread: Xem BXH nhóm 👥\n" +
              "→ top user: Xem BXH người dùng 👤\n" +
              "→ top money: Xem BXH tiền 💰\n" +
              "→ top exp: Xem BXH kinh nghiệm ⭐\n" +
              "→ top level: Xem BXH cấp độ 📊\n" +
              "→ top interact: Xem BXH tương tác 💭"
          });
          break;
        }
      }
    } catch (error: unknown) {
      console.error("Top command error:", error);
      await reply({
        body: `❌ Đã xảy ra lỗi: ${error instanceof Error ? error.message : "Lỗi không xác định"
          }`
      });
    }
  }
};

export default topCommand;
