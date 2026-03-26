import type { Command, CommandOnCallContext } from "@types";
import fs from "fs";
import path from "path";
import { DB_PATH } from "../../../core/storagePath";
import { checkDatabaseHealth, getDbMetrics, getDbPromisified } from "../../../core/database/schema";
import { getThreadData } from "../../../core/database/thread-data";
import { getUserData } from "../../../core/database/user-data";

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

const formatNumber = (num: number): string => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

function formatMoneyAny(money: number | bigint | string | undefined | null): string {
  if (money === undefined || money === null) return "0";
  if (typeof money === "bigint") {
    return money.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  if (typeof money === "string") {
    const s = money.trim().replace(/,/g, "");
    if (!s) return "0";
    // Handle rare decimal strings (e.g. AVG/MIN/MAX when SQLite returns float as TEXT).
    if (/^-?\d+\.\d+$/.test(s)) {
      const intPart = s.split(".")[0];
      return BigInt(intPart).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    if (/^-?\d+$/.test(s)) {
      return BigInt(s).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    return "0";
  }
  if (!Number.isFinite(money)) return "0";
  const intVal = Math.trunc(money);
  return intVal.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const getDbFilePath = (): string => {
  return DB_PATH();
};

const parseMaybeJSON = (v: any): any => {
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch {
      return v;
    }
  }
  return v;
};

const isRealBannedValue = (raw: any): boolean => {
  if (raw == null) return false;

  // Normalize legacy placeholders
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return false;
    if (s === "{}") return false;
    if (s.toLowerCase() === "null") return false;
  }

  const parsed = parseMaybeJSON(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  return Object.keys(parsed).length > 0;
};

const countRealBanned = async (db: any, table: "User" | "Thread"): Promise<number> => {
  const rows = (await db.all(`SELECT banned FROM ${table} WHERE banned IS NOT NULL`)) as Array<{ banned: any }>;
  let count = 0;
  for (const r of rows) {
    if (isRealBannedValue(r?.banned)) count += 1;
  }
  return count;
};

const dbCommand: Command = {
  name: "db",
  alias: ["database", "databaseinfo"],
  version: "1.0.0",
  role: 2,
  desc: "Quản lý và xem thông tin database",
  guide: `
• {pn}: Xem thông tin tổng quan database
• {pn} full: Xem thông tin đầy đủ database
• {pn} status: Xem trạng thái database
• {pn} tables: Xem thông tin các bảng
• {pn} table <name>: Xem chi tiết bảng (User/Thread)
• {pn} table <name> rows [limit] [offset]: Xem dữ liệu trong bảng (mặc định limit=5)
• {pn} stats: Thống kê chi tiết database
• {pn} info: Thông tin kỹ thuật database
• {pn} optimize: Tối ưu database (PRAGMA optimize)
• {pn} vacuum: Dọn dẹp database (VACUUM)
• {pn} health: Kiểm tra sức khỏe database
• {pn} size: Xem kích thước database
• {pn} users: Thống kê users
• {pn} threads: Thống kê threads
• {pn} top <money|exp>: Top users theo money hoặc exp
  `,
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { args, reply, logger } = ctx;
    const subCommand = (args[0] || "").toLowerCase().trim();

    try {
      const db = getDbPromisified();
      const userData = getUserData();
      const threadData = getThreadData();

      if (!subCommand || subCommand === "info" || subCommand === "i") {
        await showDatabaseInfo(db, reply);
        return;
      }

      switch (subCommand) {
        case "full":
        case "f":
          return await showFullInfo(db, reply);

        case "status":
        case "st":
          return await showStatus(db, reply);

        case "tables":
        case "table":
        case "tb":
          const tableName = args[1];
          if (tableName) {
            const action = (args[2] || "").toLowerCase().trim();
            if (["rows", "row", "data", "view", "v"].includes(action)) {
              const limit = Number(args[3] ?? 5);
              const offset = Number(args[4] ?? 0);
              return await showTableRows(db, tableName, reply, { limit, offset });
            }
            return await showTableInfo(db, tableName, reply);
          }
          return await showTablesList(db, reply);

        case "stats":
        case "stat":
        case "s":
          return await showStats(db, reply);

        case "optimize":
        case "opt":
          return await optimizeDatabase(db, reply);

        case "vacuum":
        case "clean":
        case "cleanup":
          return await vacuumDatabase(db, reply);

        case "health":
        case "h":
          return await checkHealth(reply);

        case "size":
        case "sz":
          return await showSize(reply);

        case "users":
        case "user":
        case "u":
          return await showUsersStats(db, userData, reply);

        case "threads":
        case "thread":
        case "t":
          return await showThreadsStats(db, threadData, reply);

        case "top":
          const type = args[1]?.toLowerCase() || "money";
          return await showTopUsers(db, type, reply);

        default:
          void reply({
            body: `❌ Lệnh không hợp lệ!\n\n📖 Sử dụng: {pn} <full|status|tables|stats|info|optimize|vacuum|health|size|users|threads|top>\n\nGõ {pn} để xem hướng dẫn chi tiết.`,
          });
          return;
      }
    } catch (error: any) {
      logger?.error?.(`Database command error: ${error.message}`);
      void reply({
        body: `❌ Lỗi: ${error.message}`,
      });
      return;
    }
  },
};

async function showDatabaseInfo(db: any, reply: any) {
  try {
    const dbPath = getDbFilePath();
    const stats = fs.statSync(dbPath);
    const size = stats.size;

    const pageSize = await db.get("PRAGMA page_size") as any;
    const pageCount = await db.get("PRAGMA page_count") as any;
    const journalMode = await db.get("PRAGMA journal_mode") as any;
    const synchronous = await db.get("PRAGMA synchronous") as any;
    const cacheSize = await db.get("PRAGMA cache_size") as any;
    const busyTimeout = await db.get("PRAGMA busy_timeout") as any;

    const userCount = await db.get("SELECT COUNT(*) as count FROM User") as any;
    const threadCount = await db.get("SELECT COUNT(*) as count FROM Thread") as any;

    const info = `📊 THÔNG TIN DATABASE

📁 Kích thước: ${formatBytes(size)}
📄 Số trang: ${formatNumber(pageCount?.page_count || 0)}
📏 Kích thước trang: ${formatNumber(pageSize?.page_size || 0)} bytes
📍 Path: ${dbPath}

👥 Users: ${formatNumber(userCount?.count || 0)}
💬 Threads: ${formatNumber(threadCount?.count || 0)}

⚙️ Cấu hình:
• Journal Mode: ${journalMode?.journal_mode || "N/A"}
• Synchronous: ${synchronous?.synchronous || "N/A"}
• Cache Size: ${cacheSize?.cache_size || "N/A"} pages
• Busy Timeout: ${busyTimeout?.busy_timeout || "N/A"} ms

💡 Sử dụng: {pn} stats để xem thống kê chi tiết`;

    return reply({ body: info });
  } catch (error: any) {
    throw new Error(`Failed to get database info: ${error.message}`);
  }
}

async function showStats(db: any, reply: any) {
  try {

    const totalUsers = await db.get("SELECT COUNT(*) as count FROM User") as any;
    const usersWithMoney = await db.get("SELECT COUNT(*) as count FROM User WHERE money > 0") as any;
    const totalMoney = await db.get("SELECT SUM(money) as total FROM User") as any;
    const avgMoney = await db.get("SELECT AVG(money) as avg FROM User") as any;
    const maxMoney = await db.get("SELECT MAX(money) as max FROM User") as any;
    const totalExp = await db.get("SELECT SUM(exp) as total FROM User") as any;
    const avgExp = await db.get("SELECT AVG(exp) as avg FROM User") as any;
    const bannedUsersCount = await countRealBanned(db, "User");

    const totalThreads = await db.get("SELECT COUNT(*) as count FROM Thread") as any;
    const activeThreads = await db.get("SELECT COUNT(*) as count FROM Thread WHERE lastActive IS NOT NULL") as any;
    const bannedThreadsCount = await countRealBanned(db, "Thread");

    const dbPath = getDbFilePath();
    const stats = fs.statSync(dbPath);
    const size = stats.size;

    const statsText = `📊 THỐNG KÊ DATABASE

👥 USERS:
• Tổng số: ${formatNumber(totalUsers?.count || 0)}
• Có tiền: ${formatNumber(usersWithMoney?.count || 0)}
• Bị ban: ${formatNumber(bannedUsersCount || 0)}
• Tổng tiền: ${formatMoneyAny(totalMoney?.total || 0)}
• Tiền TB: ${formatMoneyAny(avgMoney?.avg || 0)}
• Tiền cao nhất: ${formatMoneyAny(maxMoney?.max || 0)}
• Tổng EXP: ${formatNumber(Number(totalExp?.total || 0))}
• EXP TB: ${formatNumber(Math.round(Number(avgExp?.avg || 0)))}

💬 THREADS:
• Tổng số: ${formatNumber(totalThreads?.count || 0)}
• Đang hoạt động: ${formatNumber(activeThreads?.count || 0)}
• Bị ban: ${formatNumber(bannedThreadsCount || 0)}

💾 DATABASE:
• Kích thước: ${formatBytes(size)}
• File: database.sqlite`;

    return reply({ body: statsText });
  } catch (error: any) {
    throw new Error(`Failed to get stats: ${error.message}`);
  }
}

async function optimizeDatabase(db: any, reply: any) {
  try {
    await reply({ body: "⏳ Đang tối ưu database..." });

    await db.run("PRAGMA optimize;");
    await db.run("PRAGMA analysis_limit=400;");
    await db.run("PRAGMA optimize;");

    const info = await db.get("PRAGMA integrity_check") as any;

    return reply({
      body: `✅ Đã tối ưu database thành công!\n\n${info?.integrity_check === "ok" ? "✓ Database integrity: OK" : `⚠ Database integrity: ${info?.integrity_check || "Unknown"}`}`,
    });
  } catch (error: any) {
    throw new Error(`Failed to optimize database: ${error.message}`);
  }
}

async function vacuumDatabase(db: any, reply: any) {
  try {
    await reply({ body: "⏳ Đang dọn dẹp database (VACUUM)...\n⚠️ Quá trình này có thể mất vài phút!" });

    await db.run("VACUUM;");
    await db.run("PRAGMA optimize;");

    const dbPath = getDbFilePath();
    const stats = fs.statSync(dbPath);
    const newSize = stats.size;

    return reply({
      body: `✅ Đã dọn dẹp database thành công!\n\n📁 Kích thước sau VACUUM: ${formatBytes(newSize)}`,
    });
  } catch (error: any) {
    throw new Error(`Failed to vacuum database: ${error.message}`);
  }
}

async function checkHealth(reply: any) {
  try {
    const isHealthy = await checkDatabaseHealth();

    if (isHealthy) {
      return reply({
        body: `✅ Database đang hoạt động tốt!\n\n• Connection: OK\n• Health check: PASSED`,
      });
    } else {
      return reply({
        body: `⚠️ Database có vấn đề!\n\n• Connection: FAILED\n• Health check: FAILED\n\nVui lòng kiểm tra lại.`,
      });
    }
  } catch (error: any) {
    return reply({
      body: `❌ Lỗi kiểm tra sức khỏe: ${error.message}`,
    });
  }
}

async function showSize(reply: any) {
  try {
    const dbPath = getDbFilePath();
    const stats = fs.statSync(dbPath);
    const size = stats.size;
    const created = stats.birthtime;
    const modified = stats.mtime;

    const db = getDbPromisified();
    const pageCount = await db.get("PRAGMA page_count") as any;
    const pageSize = await db.get("PRAGMA page_size") as any;
    const freePages = await db.get("PRAGMA freelist_count") as any;

    const sizeText = `💾 KÍCH THƯỚC DATABASE

📁 File size: ${formatBytes(size)}
📄 Pages: ${formatNumber(pageCount?.page_count || 0)}
📏 Page size: ${formatNumber(pageSize?.page_size || 0)} bytes
🗑️ Free pages: ${formatNumber(freePages?.freelist_count || 0)}

📅 Tạo: ${created.toLocaleString("vi-VN")}
🔄 Sửa đổi: ${modified.toLocaleString("vi-VN")}

💡 Sử dụng {pn} vacuum để dọn dẹp và giảm kích thước`;

    return reply({ body: sizeText });
  } catch (error: any) {
    throw new Error(`Failed to get size: ${error.message}`);
  }
}

async function showUsersStats(db: any, userData: any, reply: any) {
  try {
    const totalUsers = await db.get("SELECT COUNT(*) as count FROM User") as any;
    const usersWithMoney = await db.get("SELECT COUNT(*) as count FROM User WHERE money > 0") as any;
    const usersWithExp = await db.get("SELECT COUNT(*) as count FROM User WHERE exp > 0") as any;
    const bannedUsersCount = await countRealBanned(db, "User");

    const topMoney = await userData.getTopMoneyServer(5);
    const totalMoney = await db.get("SELECT SUM(money) as total FROM User") as any;

    const usersText = `👥 THỐNG KÊ USERS

📊 Tổng quan:
• Tổng số users: ${formatNumber(totalUsers?.count || 0)}
• Users có tiền: ${formatNumber(usersWithMoney?.count || 0)}
• Users có EXP: ${formatNumber(usersWithExp?.count || 0)}
• Users bị ban: ${formatNumber(bannedUsersCount || 0)}

💰 Top 5 users giàu nhất:
${topMoney.map((u: any, i: number) => `${i + 1}. ${u.userID}: ${formatMoneyAny(u.money)}`).join("\n")}

💵 Tổng tiền hệ thống: ${formatMoneyAny(totalMoney?.total || 0)}`;

    return reply({ body: usersText });
  } catch (error: any) {
    throw new Error(`Failed to get users stats: ${error.message}`);
  }
}

async function showThreadsStats(db: any, threadData: any, reply: any) {
  try {
    const totalThreads = await db.get("SELECT COUNT(*) as count FROM Thread") as any;
    const activeThreads = await db.get("SELECT COUNT(*) as count FROM Thread WHERE lastActive IS NOT NULL") as any;
    const bannedThreadsCount = await countRealBanned(db, "Thread");

    const topThreads = await threadData.getTopThreads(5);

    const threadsText = `💬 THỐNG KÊ THREADS

📊 Tổng quan:
• Tổng số threads: ${formatNumber(totalThreads?.count || 0)}
• Threads đang hoạt động: ${formatNumber(activeThreads?.count || 0)}
• Threads bị ban: ${formatNumber(bannedThreadsCount || 0)}

🔥 Top 5 threads hoạt động nhất:
${topThreads.map((t: any, i: number) => `${i + 1}. ${t.name || t.threadID}: ${formatNumber(t.messageCount)} tin nhắn`).join("\n")}`;

    return reply({ body: threadsText });
  } catch (error: any) {
    throw new Error(`Failed to get threads stats: ${error.message}`);
  }
}

async function showTopUsers(db: any, type: string, reply: any) {
  try {
    const userData = getUserData();
    let topUsers: Array<{ userID: string; money?: number | bigint; exp?: number }> = [];
    let title = "";

    if (type === "money" || type === "m") {
      topUsers = await userData.getTopMoneyServer(10);
      title = "💰 TOP 10 USERS GIÀU NHẤT";
    } else if (type === "exp" || type === "e" || type === "experience") {
      const results = await db.all("SELECT userID, exp FROM User ORDER BY exp DESC LIMIT 10") as any[];
      topUsers = results.map((r: any) => ({ userID: r.userID, exp: r.exp || 0 }));
      title = "⭐ TOP 10 USERS EXP CAO NHẤT";
    } else {
      return reply({ body: `❌ Loại không hợp lệ! Sử dụng: {pn} top <money|exp>` });
    }

    const topText = `${title}\n\n${topUsers.map((u, i) => {
      const rank = i + 1;
      const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`;
      const value = type === "money" || type === "m"
        ? formatMoneyAny(u.money || 0)
        : formatNumber(Number(u.exp || 0));
      const unit = type === "money" || type === "m" ? "💰" : "⭐";
      return `${medal} ${u.userID}: ${value} ${unit}`;
    }).join("\n")}`;

    return reply({ body: topText });
  } catch (error: any) {
    throw new Error(`Failed to get top users: ${error.message}`);
  }
}

async function showFullInfo(db: any, reply: any) {
  try {
    const dbPath = getDbFilePath();
    const stats = fs.statSync(dbPath);
    const size = stats.size;
    const created = stats.birthtime;
    const modified = stats.mtime;

    const pageSize = await db.get("PRAGMA page_size") as any;
    const pageCount = await db.get("PRAGMA page_count") as any;
    const freePages = await db.get("PRAGMA freelist_count") as any;
    const journalMode = await db.get("PRAGMA journal_mode") as any;
    const synchronous = await db.get("PRAGMA synchronous") as any;
    const cacheSize = await db.get("PRAGMA cache_size") as any;
    const busyTimeout = await db.get("PRAGMA busy_timeout") as any;
    const mmapSize = await db.get("PRAGMA mmap_size") as any;
    const walAutoCheckpoint = await db.get("PRAGMA wal_autocheckpoint") as any;
    const integrity = await db.get("PRAGMA integrity_check") as any;

    const totalUsers = await db.get("SELECT COUNT(*) as count FROM User") as any;
    const usersWithMoney = await db.get("SELECT COUNT(*) as count FROM User WHERE money > 0") as any;
    const totalMoney = await db.get("SELECT SUM(money) as total FROM User") as any;
    const maxMoney = await db.get("SELECT MAX(money) as max FROM User") as any;
    const totalExp = await db.get("SELECT SUM(exp) as total FROM User") as any;
    const bannedUsersCount = await countRealBanned(db, "User");

    const totalThreads = await db.get("SELECT COUNT(*) as count FROM Thread") as any;
    const activeThreads = await db.get("SELECT COUNT(*) as count FROM Thread WHERE lastActive IS NOT NULL") as any;
    const bannedThreadsCount = await countRealBanned(db, "Thread");

    const userTableSize = await db.get("SELECT COUNT(*) as count, SUM(LENGTH(userInfo) + LENGTH(setting) + LENGTH(data) + LENGTH(banned) + LENGTH(joinedThreads) + LENGTH(messageCount)) as size FROM User") as any;
    const threadTableSize = await db.get("SELECT COUNT(*) as count, SUM(LENGTH(threadInfo) + LENGTH(banned) + LENGTH(settings) + LENGTH(data) + LENGTH(messageCount)) as size FROM Thread") as any;

    const fullInfo = `📊 THÔNG TIN ĐẦY ĐỦ DATABASE

💾 FILE DATABASE:
• Đường dẫn: ${dbPath}
• Kích thước: ${formatBytes(size)}
• Tạo: ${created.toLocaleString("vi-VN")}
• Sửa đổi: ${modified.toLocaleString("vi-VN")}

📄 CẤU TRÚC:
• Số trang: ${formatNumber(pageCount?.page_count || 0)}
• Kích thước trang: ${formatNumber(pageSize?.page_size || 0)} bytes
• Trang trống: ${formatNumber(freePages?.freelist_count || 0)}
• Dung lượng thực: ${formatBytes((pageCount?.page_count || 0) * (pageSize?.page_size || 0))}

⚙️ CẤU HÌNH:
• Journal Mode: ${journalMode?.journal_mode || "N/A"}
• Synchronous: ${synchronous?.synchronous || "N/A"}
• Cache Size: ${cacheSize?.cache_size || "N/A"} pages (${formatBytes(Math.abs(Number(cacheSize?.cache_size || 0)) * (pageSize?.page_size || 0))})
• Mmap Size: ${formatBytes(Number(mmapSize?.mmap_size || 0))}
• Busy Timeout: ${busyTimeout?.busy_timeout || "N/A"} ms
• WAL Checkpoint: ${walAutoCheckpoint?.wal_autocheckpoint || "N/A"} pages
• Integrity: ${integrity?.integrity_check === "ok" ? "✅ OK" : integrity?.integrity_check || "Unknown"}

👥 BẢNG USER:
• Tổng số: ${formatNumber(totalUsers?.count || 0)}
• Có tiền: ${formatNumber(usersWithMoney?.count || 0)}
• Bị ban: ${formatNumber(bannedUsersCount || 0)}
• Tổng tiền: ${formatMoneyAny(totalMoney?.total || 0)}
• Tiền cao nhất: ${formatMoneyAny(maxMoney?.max || 0)}
• Tổng EXP: ${formatNumber(Number(totalExp?.total || 0))}
• Dung lượng JSON: ${formatBytes(Number(userTableSize?.size || 0))}

💬 BẢNG THREAD:
• Tổng số: ${formatNumber(totalThreads?.count || 0)}
• Đang hoạt động: ${formatNumber(activeThreads?.count || 0)}
• Bị ban: ${formatNumber(bannedThreadsCount || 0)}
• Dung lượng JSON: ${formatBytes(Number(threadTableSize?.size || 0))}

📈 TỔNG KẾT:
• Tổng records: ${formatNumber((totalUsers?.count || 0) + (totalThreads?.count || 0))}
• Tổng dung lượng JSON: ${formatBytes(Number(userTableSize?.size || 0) + Number(threadTableSize?.size || 0))}
• Tỷ lệ sử dụng: ${((((pageCount?.page_count || 0) - (freePages?.freelist_count || 0)) / (pageCount?.page_count || 1)) * 100).toFixed(2)}%`;

    return reply({ body: fullInfo });
  } catch (error: any) {
    throw new Error(`Failed to get full info: ${error.message}`);
  }
}

async function showStatus(db: any, reply: any) {
  try {
    const isHealthy = await checkDatabaseHealth();
    const dbPath = getDbFilePath();
    const stats = fs.existsSync(dbPath) ? fs.statSync(dbPath) : null;
    const walPath = dbPath + "-wal";
    const shmPath = dbPath + "-shm";
    const walStats = fs.existsSync(walPath) ? fs.statSync(walPath) : null;
    const shmStats = fs.existsSync(shmPath) ? fs.statSync(shmPath) : null;

    const journalMode = await db.get("PRAGMA journal_mode") as any;
    const synchronous = await db.get("PRAGMA synchronous") as any;
    const busyTimeout = await db.get("PRAGMA busy_timeout") as any;
    const integrity = await db.get("PRAGMA integrity_check") as any;
    const walMode = await db.get("PRAGMA journal_mode") as any;
    const pageCount = await db.get("PRAGMA page_count") as any;
    const pageSize = await db.get("PRAGMA page_size") as any;
    const freePages = await db.get("PRAGMA freelist_count") as any;

    let connectionStatus = "❌ Disconnected";
    try {
      await db.get("SELECT 1");
      connectionStatus = "✅ Connected";
    } catch {
      connectionStatus = "❌ Error";
    }

    let walStatus = "N/A";
    if (walMode?.journal_mode === "wal") {
      try {
        await db.get("PRAGMA wal_checkpoint(TRUNCATE)");
        walStatus = "Active";
      } catch {
        walStatus = "Error";
      }
    }

    const m = getDbMetrics();
    const sinceSec = Math.max(1, Math.floor((Date.now() - (m.startedAt || Date.now())) / 1000));
    const rps = (m.readCount / sinceSec).toFixed(2);
    const wps = (m.writeCount / sinceSec).toFixed(2);
    const avgRead = m.readCount ? (m.totalReadMs / m.readCount).toFixed(1) : "0";
    const avgWrite = m.writeCount ? (m.totalWriteMs / m.writeCount).toFixed(1) : "0";

    const pc = Number(pageCount?.page_count || 0);
    const ps = Number(pageSize?.page_size || 0);
    const fp = Number(freePages?.freelist_count || 0);
    const usedPages = Math.max(0, pc - fp);
    const usedPct = pc ? ((usedPages / pc) * 100).toFixed(2) : "0.00";
    const usedBytes = usedPages * ps;
    const freeBytes = fp * ps;

    const statusText = `📊 TRẠNG THÁI DATABASE

🔌 KẾT NỐI:
• Trạng thái: ${connectionStatus}
• Health Check: ${isHealthy ? "✅ PASSED" : "❌ FAILED"}
• Integrity: ${integrity?.integrity_check === "ok" ? "✅ OK" : "⚠️ " + (integrity?.integrity_check || "Unknown")}

📁 FILE:
• Path: ${dbPath}
• Tồn tại: ${stats ? "✅ Yes" : "❌ No"}
• DB size: ${stats ? formatBytes(stats.size) : "N/A"}
• WAL size: ${walStats ? formatBytes(walStats.size) : "N/A"}
• SHM size: ${shmStats ? formatBytes(shmStats.size) : "N/A"}
• Sửa đổi: ${stats ? stats.mtime.toLocaleString("vi-VN") : "N/A"}

⚙️ CẤU HÌNH:
• Journal Mode: ${journalMode?.journal_mode || "N/A"} ${walMode?.journal_mode === "wal" ? "✅" : ""}
• Synchronous: ${synchronous?.synchronous || "N/A"}
• Busy Timeout: ${busyTimeout?.busy_timeout || "N/A"} ms
• WAL Status: ${walStatus}

📦 MỨC SỬ DỤNG (PAGES):
• Page size: ${formatNumber(ps)} bytes
• Tổng pages: ${formatNumber(pc)} • Free: ${formatNumber(fp)}
• Dùng: ${formatBytes(usedBytes)} (${usedPct}%) • Trống: ${formatBytes(freeBytes)}

📈 ĐỌC/GHI (từ lúc bot start):
• Read ops: ${formatNumber(m.readCount)} • Avg: ${avgRead} ms • RPS: ${rps}
• Write ops: ${formatNumber(m.writeCount)} • Avg: ${avgWrite} ms • WPS: ${wps}
• Exec ops: ${formatNumber(m.execCount)} • Prepared: ${formatNumber(m.preparedCount)}
• Last read: ${m.lastReadAt ? new Date(m.lastReadAt).toLocaleString("vi-VN") : "N/A"}
• Last write: ${m.lastWriteAt ? new Date(m.lastWriteAt).toLocaleString("vi-VN") : "N/A"}
• Last error: ${m.lastError ? `${m.lastError} (${m.lastErrorAt ? new Date(m.lastErrorAt).toLocaleString("vi-VN") : "N/A"})` : "N/A"}

📊 HOẠT ĐỘNG:
• Transactions: ✅ Supported
• Foreign Keys: ✅ Enabled`;

    return reply({ body: statusText });
  } catch (error: any) {
    throw new Error(`Failed to get status: ${error.message}`);
  }
}

async function showTablesList(db: any, reply: any) {
  try {
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name") as any[];

    const tablesInfo = await Promise.all(tables.map(async (table: any) => {

      const safeTableName = table.name.replace(/[^a-zA-Z0-9_]/g, '');
      if (!safeTableName || safeTableName !== table.name) {
        throw new Error(`Invalid table name: ${table.name}`);
      }
      const count = await db.get(`SELECT COUNT(*) as count FROM "${safeTableName}"`) as any;
      const tableInfo = await db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, [table.name]) as any;
      const indexes = await db.all(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=? AND name NOT LIKE 'sqlite_%'`, [table.name]) as any[];

      return {
        name: table.name,
        count: count?.count || 0,
        sql: tableInfo?.sql || "",
        indexes: indexes.map((idx: any) => idx.name),
      };
    }));

    const tablesText = `📋 DANH SÁCH BẢNG

${tablesInfo.map((t, i) => {
      return `${i + 1}. 📊 ${t.name}
   • Records: ${formatNumber(t.count)}
   • Indexes: ${t.indexes.length} (${t.indexes.slice(0, 3).join(", ")}${t.indexes.length > 3 ? "..." : ""})`;
    }).join("\n\n")}

💡 Sử dụng:
• {pn} table <tên_bảng> để xem chi tiết
• {pn} table <tên_bảng> rows [limit] [offset] để xem dữ liệu`;

    return reply({ body: tablesText });
  } catch (error: any) {
    throw new Error(`Failed to get tables list: ${error.message}`);
  }
}

async function showTableInfo(db: any, tableName: string, reply: any) {
  try {
    const normalizedName = tableName.charAt(0).toUpperCase() + tableName.slice(1).toLowerCase();
    const validTables = ["User", "Thread"];

    if (!validTables.includes(normalizedName)) {
      return reply({ body: `❌ Bảng không hợp lệ! Các bảng có sẵn: ${validTables.join(", ")}` });
    }

    const schema = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [normalizedName]) as any;

    const count = await db.get(`SELECT COUNT(*) as count FROM "${normalizedName}"`) as any;
    const indexes = await db.all(`SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND name NOT LIKE 'sqlite_%'`, [normalizedName]) as any[];
    const triggers = await db.all(`SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name=?`, [normalizedName]) as any[];

    const columns = await db.all(`PRAGMA table_info("${normalizedName}")`) as any[];

    let sizeEstimate = 0;
    if (normalizedName === "User") {
      const size = await db.get("SELECT SUM(LENGTH(userInfo) + LENGTH(setting) + LENGTH(data) + LENGTH(banned) + LENGTH(joinedThreads) + LENGTH(messageCount)) as size FROM User") as any;
      sizeEstimate = Number(size?.size || 0);
    } else if (normalizedName === "Thread") {
      const size = await db.get("SELECT SUM(LENGTH(threadInfo) + LENGTH(banned) + LENGTH(settings) + LENGTH(data) + LENGTH(messageCount)) as size FROM Thread") as any;
      sizeEstimate = Number(size?.size || 0);
    }

    const tableInfo = `📊 THÔNG TIN BẢNG: ${normalizedName}

📈 THỐNG KÊ:
• Số records: ${formatNumber(count?.count || 0)}
• Số cột: ${columns.length}
• Số indexes: ${indexes.length}
• Số triggers: ${triggers.length}
• Dung lượng JSON (ước tính): ${formatBytes(sizeEstimate)}

📋 CÁC CỘT:
${columns.map((col: any) => {
      const nullable = col.notnull === 0 ? "NULL" : "NOT NULL";
      const defaultVal = col.dflt_value ? ` DEFAULT ${col.dflt_value}` : "";
      const pk = col.pk === 1 ? " PRIMARY KEY" : "";
      return `• ${col.name}: ${col.type}${nullable}${defaultVal}${pk}`;
    }).join("\n")}

🔍 INDEXES:
${indexes.length > 0 ? indexes.map((idx: any) => `• ${idx.name}`).join("\n") : "• Không có indexes"}

⚡ TRIGGERS:
${triggers.length > 0 ? triggers.map((t: any) => `• ${t.name}`).join("\n") : "• Không có triggers"}

📝 SCHEMA:
${schema?.sql || "N/A"}`;

    return reply({ body: tableInfo });
  } catch (error: any) {
    throw new Error(`Failed to get table info: ${error.message}`);
  }
}

async function showTableRows(
  db: any,
  tableName: string,
  reply: any,
  opts: { limit: number; offset: number }
) {
  try {
    const normalizedName = tableName.charAt(0).toUpperCase() + tableName.slice(1).toLowerCase();
    const validTables = ["User", "Thread"];

    if (!validTables.includes(normalizedName)) {
      return reply({ body: `❌ Bảng không hợp lệ! Các bảng có sẵn: ${validTables.join(", ")}` });
    }

    const limitRaw = Number.isFinite(opts.limit) ? Math.floor(opts.limit) : 5;
    const offsetRaw = Number.isFinite(opts.offset) ? Math.floor(opts.offset) : 0;
    const limit = Math.max(1, Math.min(20, limitRaw));
    const offset = Math.max(0, offsetRaw);

    const count = await db.get(`SELECT COUNT(*) as count FROM "${normalizedName}"`) as any;

    // Pick lightweight columns by default to avoid huge messages
    const selectFields =
      normalizedName === "User"
        ? `userID, name, money, exp, banned, createdAt, updatedAt`
        : `threadID, threadName, lastActive, banned, createdAt, updatedAt`;

    const rows = await db.all(
      `SELECT ${selectFields} FROM "${normalizedName}" ORDER BY rowid DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    ) as any[];

    if (!rows.length) {
      return reply({ body: `✅ Bảng ${normalizedName} không có dữ liệu (hoặc offset quá lớn).` });
    }

    const lines: string[] = [];
    lines.push(`🧾 DỮ LIỆU BẢNG: ${normalizedName}`);
    lines.push(`• Tổng records: ${formatNumber(count?.count || 0)}`);
    lines.push(`• Hiển thị: ${limit} dòng (offset ${offset})`);
    lines.push("");

    rows.forEach((r: any, idx: number) => {
      if (normalizedName === "User") {
        const ban = isRealBannedValue(r?.banned) ? "Có" : "Không";
        lines.push(
          `${offset + idx + 1}. ${r?.name || "N/A"} (${r?.userID || "N/A"})\n` +
          `   • Money: ${formatMoneyAny(r?.money || 0)}\n` +
          `   • EXP: ${formatNumber(Number(r?.exp || 0))}\n` +
          `   • Banned: ${ban}`
        );
      } else {
        const ban = isRealBannedValue(r?.banned) ? "Có" : "Không";
        lines.push(
          `${offset + idx + 1}. ${r?.threadName || "Không tên"} (${r?.threadID || "N/A"})\n` +
          `   • LastActive: ${r?.lastActive ?? "N/A"}\n` +
          `   • Banned: ${ban}`
        );
      }
    });

    lines.push("");
    lines.push(`💡 Dùng: {pn} table ${normalizedName} rows ${limit} ${offset + limit}`);

    return reply({ body: lines.join("\n") });
  } catch (error: any) {
    throw new Error(`Failed to get table rows: ${error.message}`);
  }
}

export default dbCommand;
