import type { Command, CommandOnCallContext } from "@types";
import { getDbPromisified } from "../../../core/database/schema";

interface ExtendedUserDataModel {
  get(userID: string | number): Promise<{
    userID: string;
    name: string;
    exp?: number;
  } | null>;
  getName?(userID: string | number): Promise<string | undefined>;
}

function calculateLevel(exp: number): number {
  const safeExp = Number.isFinite(exp) && exp >= 0 ? exp : 0;
  const base = 100; 
  return Math.max(1, Math.floor(safeExp / base) + 1);
}

function expForLevel(level: number): number {
  const base = 100;
  return Math.max(0, (level - 1) * base);
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

function makeProgressBar(current: number, max: number, length: number = 20): string {
  if (max <= 0) return "████████████████████";
  const ratio = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

async function getTopExpServer(limit: number = 10): Promise<Array<{ userID: string; name?: string; exp: number }>> {
  const db = getDbPromisified();
  const rows = await db.all(
    "SELECT userID, name, exp FROM User WHERE exp IS NOT NULL AND exp > 0 ORDER BY exp DESC LIMIT ?",
    [limit]
  ) as Array<{ userID: string; name?: string; exp: number }>;

  return rows.map((row) => ({
    userID: String(row.userID),
    name: row.name,
    exp: Number.isFinite(Number(row.exp)) && Number(row.exp) >= 0 ? Number(row.exp) : 0,
  }));
}

async function getTopExpBox(participantIDs: string[], limit: number = 10): Promise<Array<{ userID: string; name?: string; exp: number }>> {
  const members = participantIDs.filter(Boolean).map(String);
  if (members.length === 0) return [];

  const placeholders = members.map(() => "?").join(", ");
  const db = getDbPromisified();

  const rows = await db.all(
    `SELECT userID, name, exp
     FROM User
     WHERE exp IS NOT NULL AND exp > 0 AND userID IN (${placeholders})
     ORDER BY exp DESC
     LIMIT ?`,
    [...members, limit]
  ) as Array<{ userID: string; name?: string; exp: number }>;

  return rows.map((row) => ({
    userID: String(row.userID),
    name: row.name,
    exp: Number.isFinite(Number(row.exp)) && Number(row.exp) >= 0 ? Number(row.exp) : 0,
  }));
}

async function formatTopExpList(
  entries: Array<{ userID: string; name?: string; exp: number }>,
  userData: ExtendedUserDataModel
): Promise<string[]> {
  const medals = ["👑", "🥈", "🥉"];

  return Promise.all(
    entries.map(async (entry, index) => {
      const medal = medals[index] ?? "🏅";
      const name = (await userData.getName?.(entry.userID)) || entry.name || `User ${entry.userID}`;
      const level = calculateLevel(entry.exp);
      const rankTitle = getRankTitle(level);
      return `${medal} ${index + 1}. ${name}\n⭐ Level: ${level} (${rankTitle})\n📈 EXP: ${entry.exp.toLocaleString()}`;
    })
  );
}

const rankCommand: Command = {
  name: "rank",
  version: "1.1.0",
  role: 0,
  desc: "Xem rank/level dựa trên EXP",
  guide:
    "   • {pn} → Xem rank của bạn\n" +
    "   • {pn} @tag → Xem rank của người khác\n" +
    "   • {pn} top box → Xem top EXP trong box\n" +
    "   • {pn} top server → Xem top EXP toàn server\n" +
    "   • EXP được cộng khi chat, tương tác, chơi game (và một số tính năng khác)",
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext) {
    const { event, reply, userData, args } = ctx as typeof ctx & {
      event: typeof ctx["event"] & { participantIDs?: string[] };
    };
    const enhancedUserData = userData as unknown as ExtendedUserDataModel;

    try {
      const senderID = String(event.senderID);

      const subcommand = args?.[0]?.toLowerCase();
      const scope = args?.[1]?.toLowerCase();

      if (subcommand === "top") {
        if (scope === "box" || scope === "group" || scope === "thread") {
          const participantIDs = event.participantIDs || [];
          const topBox = await getTopExpBox(participantIDs, 10);

          if (!topBox.length) {
            await reply({
              body: "⚠️ Không có dữ liệu EXP trong box này.",
            });
            return;
          }

          const list = await formatTopExpList(topBox, enhancedUserData);
          await reply({
            body: `━━ TOP 10 EXP TRONG BOX ━━\n\n${list.join("\n\n")}\n\n📌 Càng tương tác nhiều càng lên hạng nhanh!`,
          });
          return;
        }

        const topServer = await getTopExpServer(10);
        if (!topServer.length) {
          await reply({
            body: "⚠️ Chưa có dữ liệu EXP trên server.",
          });
          return;
        }

        const list = await formatTopExpList(topServer, enhancedUserData);
        await reply({
          body: `━━ TOP 10 EXP TOÀN SERVER ━━\n\n${list.join("\n\n")}\n\n📌 Càng tương tác nhiều càng lên hạng nhanh!`,
        });
        return;
      }

      let targetID = senderID;
      if (event.mentions && Object.keys(event.mentions).length > 0) {
        targetID = Object.keys(event.mentions)[0] as string;
      }

      const user = await enhancedUserData.get(targetID);
      if (!user) {
        await reply({
          body: "⚠️ Không tìm thấy dữ liệu người dùng.",
        });
        return;
      }

      const exp = Number.isFinite(Number(user.exp)) && Number(user.exp) >= 0 ? Number(user.exp) : 0;
      const level = calculateLevel(exp);
      const currentLevelExp = exp - expForLevel(level);
      const nextLevelTotal = expForLevel(level + 1);
      const nextLevelNeed = nextLevelTotal - expForLevel(level) || 100;

      const bar = makeProgressBar(currentLevelExp, nextLevelNeed);
      const rankTitle = getRankTitle(level);

      
      const db = getDbPromisified();

      const userRow = await db.get(
        "SELECT exp FROM User WHERE userID = ? LIMIT 1",
        [targetID]
      ) as any;

      if (!userRow) {
        await reply({
          body: "⚠️ Không tìm thấy dữ liệu EXP của người dùng.",
        });
        return;
      }

      const rankRow = await db.get(
        "SELECT COUNT(*) + 1 AS rank FROM User WHERE exp > ?",
        [userRow.exp || 0]
      ) as any;

      const totalRow = await db.get(
        "SELECT COUNT(*) AS total FROM User WHERE exp IS NOT NULL AND exp > 0"
      ) as any;

      const rank = rankRow?.rank || 1;
      const total = totalRow?.total || 1;

      const displayName =
        (event.mentions && event.mentions[targetID]) ||
        (await enhancedUserData.getName?.(targetID)) ||
        user.name ||
        `User ${targetID}`;

      const isSelf = targetID === senderID;

      const header = isSelf ? "📊 THÔNG TIN RANK CỦA BẠN" : `📊 THÔNG TIN RANK CỦA ${displayName}`;

      const body =
        `${header}\n\n` +
        `👤 Người chơi: ${displayName}\n` +
        `⭐ Level: ${level} (${rankTitle})\n` +
        `📈 EXP: ${exp.toLocaleString()} exp\n` +
        `🏅 Thứ hạng server: #${rank.toLocaleString()} / ${total.toLocaleString()} người\n\n` +
        `📊 Tiến độ level tiếp theo:\n` +
        `   ${bar}\n` +
        `   ${currentLevelExp.toLocaleString()} / ${nextLevelNeed.toLocaleString()} exp\n\n` +
        `💡 Cách tăng EXP:\n` +
        `   • Chat, tương tác nhiều trong nhóm\n` +
        `   • Chơi game (ví dụ: mining, các game khác)\n` +
        `   • Sử dụng một số lệnh / tính năng hỗ trợ bot`;

      await reply({ body });
    } catch (error: unknown) {
      await reply({
        body: `❌ Đã xảy ra lỗi khi lấy thông tin rank: ${error instanceof Error ? error.message : "Lỗi không xác định"
          }`,
      });
    }
  },
};

export default rankCommand;
