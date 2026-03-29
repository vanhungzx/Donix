import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";
import logger from "../../utils/log";
import { retry } from "../../utils/retry";
import { STORAGE_SQLITE, DB_PATH as getDbPath } from "../storagePath";

const DB_DIR = STORAGE_SQLITE();
const DB_PATH = getDbPath();

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

function createLine(char: string | null = null, fullWidth: boolean = false): string {
  const width = process.stdout.columns || 80;
  const lineChar = char || '─';
  return fullWidth ? lineChar.repeat(width) : lineChar.repeat(Math.min(width, 80));
}

function promisifyDb(db: sqlite3.Database) {
  // Basic in-process metrics (since last initDatabase()).
  // Useful for `db status` to show read/write usage and last activity.
  const metrics = getDbMetricsInternal();

  const track = async <T>(
    kind: "read" | "write" | "exec",
    fn: () => Promise<T>
  ): Promise<T> => {
    const start = Date.now();
    try {
      const res = await fn();
      const dur = Date.now() - start;
      if (kind === "read") {
        metrics.readCount += 1;
        metrics.totalReadMs += dur;
        metrics.lastReadAt = Date.now();
      } else if (kind === "write") {
        metrics.writeCount += 1;
        metrics.totalWriteMs += dur;
        metrics.lastWriteAt = Date.now();
      } else {
        metrics.execCount += 1;
        metrics.totalExecMs += dur;
        metrics.lastWriteAt = Date.now();
      }
      metrics.lastQueryAt = Date.now();
      return res;
    } catch (err: any) {
      metrics.lastErrorAt = Date.now();
      metrics.lastError = String(err?.message || err);
      throw err;
    }
  };

  return {
    run: (sql: string, params?: any[]): Promise<sqlite3.RunResult> => {
      return track("write", () => new Promise((resolve, reject) => {
        db.run(sql, params || [], function (err) {
          if (err) reject(err);
          else resolve(this);
        });
      }));
    },
    get: (sql: string, params?: any[]): Promise<any> => {
      return track("read", () => new Promise((resolve, reject) => {
        db.get(sql, params || [], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      }));
    },
    all: (sql: string, params?: any[]): Promise<any[]> => {
      return track("read", () => new Promise((resolve, reject) => {
        db.all(sql, params || [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      }));
    },
    exec: (sql: string): Promise<void> => {
      return track("exec", () => new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
          if (err) reject(err);
          else resolve();
        });
      }));
    },
    close: (): Promise<void> => {
      return new Promise((resolve, reject) => {
        db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },

    prepare: (sql: string): sqlite3.Statement => {
      // Use a small statement cache; finalized in closeDatabase()
      const m = getDbMetricsInternal();
      m.preparedCount += 1;
      m.lastQueryAt = Date.now();
      return getPreparedStatement(sql);
    },
  };
}

let db: sqlite3.Database | null = null;
let dbPromisified: ReturnType<typeof promisifyDb> | null = null;

const preparedStatements = new Map<string, sqlite3.Statement>();

export type DbMetrics = {
  startedAt: number;
  readCount: number;
  writeCount: number;
  execCount: number;
  preparedCount: number;
  totalReadMs: number;
  totalWriteMs: number;
  totalExecMs: number;
  lastQueryAt: number | null;
  lastReadAt: number | null;
  lastWriteAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
};

let __dbMetrics: DbMetrics | null = null;

function getDbMetricsInternal(): DbMetrics {
  if (!__dbMetrics) {
    __dbMetrics = {
      startedAt: Date.now(),
      readCount: 0,
      writeCount: 0,
      execCount: 0,
      preparedCount: 0,
      totalReadMs: 0,
      totalWriteMs: 0,
      totalExecMs: 0,
      lastQueryAt: null,
      lastReadAt: null,
      lastWriteAt: null,
      lastErrorAt: null,
      lastError: null,
    };
  }
  return __dbMetrics;
}

export function getDbMetrics(): DbMetrics {
  // Return a shallow copy to avoid accidental mutation by callers.
  const m = getDbMetricsInternal();
  return { ...m };
}

export function resetDbMetrics(): void {
  __dbMetrics = null;
}

export function getDatabase(): sqlite3.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

export function getDbPromisified() {
  if (!dbPromisified) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return dbPromisified;
}

function getPreparedStatement(sql: string): sqlite3.Statement {
  if (!preparedStatements.has(sql)) {
    const stmt = db!.prepare(sql);
    preparedStatements.set(sql, stmt);
    return stmt;
  }
  return preparedStatements.get(sql)!;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

async function getTableColumns(tableName: string): Promise<Set<string>> {
  const dbProm = getDbPromisified();
  const rows = await dbProm.all(
    `PRAGMA table_info(${quoteIdentifier(tableName)})`
  ) as Array<{ name?: string }>;
  return new Set(rows.map((row) => String(row.name || "")));
}

function findExistingColumn(columns: Set<string>, candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (columns.has(candidate)) return candidate;
  }
  return null;
}

async function ensureThreadTableColumns(): Promise<void> {
  const dbProm = getDbPromisified();
  const tableName = "Thread";
  const qTable = quoteIdentifier(tableName);
  const columns = await getTableColumns(tableName);

  const ensureColumn = async (columnName: string, definition: string): Promise<void> => {
    if (columns.has(columnName)) return;
    await dbProm.run(`ALTER TABLE ${qTable} ADD COLUMN ${quoteIdentifier(columnName)} ${definition}`);
    columns.add(columnName);
  };

  const threadIdSource = findExistingColumn(columns, [
    "threadId",
    "threadid",
    "thread_id",
    "groupId",
    "groupID",
    "group_id",
  ]);

  if (!columns.has("threadID")) {
    logger.warn("Phát hiện bảng Thread cũ thiếu cột threadID, đang tự động migration...");
    await ensureColumn("threadID", "TEXT");

    if (threadIdSource) {
      await dbProm.run(
        `UPDATE ${qTable}
         SET ${quoteIdentifier("threadID")} = CAST(${quoteIdentifier(threadIdSource)} AS TEXT)
         WHERE ${quoteIdentifier("threadID")} IS NULL
            OR TRIM(${quoteIdentifier("threadID")}) = ''`
      );
    } else if (columns.has("num")) {
      await dbProm.run(
        `UPDATE ${qTable}
         SET ${quoteIdentifier("threadID")} = CAST(${quoteIdentifier("num")} AS TEXT)
         WHERE ${quoteIdentifier("threadID")} IS NULL
            OR TRIM(${quoteIdentifier("threadID")}) = ''`
      );
      logger.warn("Không tìm thấy cột thread ID cũ để backfill, tạm thời dùng Thread.num cho dữ liệu legacy.");
    }
  }

  await ensureColumn("threadName", "TEXT");
  await ensureColumn("threadInfo", "TEXT DEFAULT '{}'");
  await ensureColumn("banned", "TEXT");
  await ensureColumn("settings", "TEXT DEFAULT '{}'");
  await ensureColumn("data", "TEXT DEFAULT '{}'");
  await ensureColumn("messageCount", "TEXT");
  await ensureColumn("imageSrc", "TEXT");
  await ensureColumn("lastActive", "INTEGER");
  await ensureColumn("createdAt", "DATETIME");
  await ensureColumn("updatedAt", "DATETIME");

  const threadNameSource = findExistingColumn(columns, ["name", "thread_name"]);
  if (threadNameSource && threadNameSource !== "threadName") {
    await dbProm.run(
      `UPDATE ${qTable}
       SET ${quoteIdentifier("threadName")} = CAST(${quoteIdentifier(threadNameSource)} AS TEXT)
       WHERE ${quoteIdentifier("threadName")} IS NULL
          OR TRIM(${quoteIdentifier("threadName")}) = ''`
    );
  }

  const settingsSource = findExistingColumn(columns, ["setting"]);
  if (settingsSource && settingsSource !== "settings") {
    await dbProm.run(
      `UPDATE ${qTable}
       SET ${quoteIdentifier("settings")} = ${quoteIdentifier(settingsSource)}
       WHERE ${quoteIdentifier("settings")} IS NULL
          OR TRIM(${quoteIdentifier("settings")}) = ''
          OR TRIM(${quoteIdentifier("settings")}) = '{}'`
    );
  }

  await dbProm.run(
    `UPDATE ${qTable}
     SET ${quoteIdentifier("threadInfo")} = '{}'
     WHERE ${quoteIdentifier("threadInfo")} IS NULL
        OR TRIM(${quoteIdentifier("threadInfo")}) = ''`
  );
  await dbProm.run(
    `UPDATE ${qTable}
     SET ${quoteIdentifier("settings")} = '{}'
     WHERE ${quoteIdentifier("settings")} IS NULL
        OR TRIM(${quoteIdentifier("settings")}) = ''`
  );
  await dbProm.run(
    `UPDATE ${qTable}
     SET ${quoteIdentifier("data")} = '{}'
     WHERE ${quoteIdentifier("data")} IS NULL
        OR TRIM(${quoteIdentifier("data")}) = ''`
  );
  await dbProm.run(
    `UPDATE ${qTable}
     SET ${quoteIdentifier("createdAt")} = CURRENT_TIMESTAMP
     WHERE ${quoteIdentifier("createdAt")} IS NULL`
  );
  await dbProm.run(
    `UPDATE ${qTable}
     SET ${quoteIdentifier("updatedAt")} = COALESCE(${quoteIdentifier("updatedAt")}, ${quoteIdentifier("createdAt")}, CURRENT_TIMESTAMP)
     WHERE ${quoteIdentifier("updatedAt")} IS NULL`
  );
}

async function createTables(): Promise<void> {
  const dbProm = getDbPromisified();

  await dbProm.exec(`
    CREATE TABLE IF NOT EXISTS User (
      num INTEGER PRIMARY KEY AUTOINCREMENT,
      userID TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      gender INTEGER,
      userInfo TEXT DEFAULT '{}',
      setting TEXT DEFAULT '{}',
      data TEXT DEFAULT '{}',
      banned TEXT,
      joinedThreads TEXT DEFAULT '{}',
      exp INTEGER DEFAULT 0,
      money INTEGER DEFAULT 0,
      messageCount TEXT DEFAULT '{}',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbProm.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_userID ON User(userID);
    CREATE INDEX IF NOT EXISTS idx_user_name ON User(name);
    CREATE INDEX IF NOT EXISTS idx_user_money ON User(money);
    CREATE INDEX IF NOT EXISTS idx_user_exp ON User(exp);
    CREATE INDEX IF NOT EXISTS idx_user_money_exp ON User(money DESC, exp DESC);
    CREATE INDEX IF NOT EXISTS idx_user_created ON User(createdAt);
  `);

  await dbProm.exec(`
    CREATE TABLE IF NOT EXISTS Thread (
      num INTEGER PRIMARY KEY AUTOINCREMENT,
      threadID TEXT NOT NULL UNIQUE,
      threadName TEXT,
      threadInfo TEXT DEFAULT '{}',
      banned TEXT,
      settings TEXT DEFAULT '{}',
      data TEXT DEFAULT '{}',
      messageCount TEXT,
      imageSrc TEXT,
      lastActive INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureThreadTableColumns();

  // --- Tài/Xỉu (taixiu / txiu) ---
  // Use TEXT for very large money (BigInt) to avoid SQLite INTEGER overflow.
  await dbProm.exec(`
    CREATE TABLE IF NOT EXISTS TaixiuJackpot (
      threadID TEXT PRIMARY KEY,
      amount TEXT NOT NULL DEFAULT '0',
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS TaixiuWinStreak (
      userID TEXT PRIMARY KEY,
      current INTEGER NOT NULL DEFAULT 0,
      highest INTEGER NOT NULL DEFAULT 0,
      loses INTEGER NOT NULL DEFAULT 0,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS TaixiuHistory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      threadID TEXT NOT NULL DEFAULT '',
      userID TEXT NOT NULL,
      bet TEXT NOT NULL,
      diceResult TEXT NOT NULL,
      gameResult TEXT NOT NULL,
      win INTEGER NOT NULL DEFAULT 0,
      winAmount TEXT NOT NULL DEFAULT '0',
      jackpotWin INTEGER NOT NULL DEFAULT 0,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS TxiuJackpot (
      threadID TEXT PRIMARY KEY,
      amount TEXT NOT NULL DEFAULT '0',
      chance REAL NOT NULL DEFAULT 0.3,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS TxiuHistory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      threadID TEXT NOT NULL,
      time INTEGER NOT NULL,
      result TEXT NOT NULL,
      dice1 INTEGER NOT NULL,
      dice2 INTEGER NOT NULL,
      dice3 INTEGER NOT NULL,
      sum INTEGER NOT NULL
    );
  `);

  try {
    await dbProm.run(`ALTER TABLE TaixiuHistory ADD COLUMN threadID TEXT NOT NULL DEFAULT ''`);
  } catch (err: any) {
    if (!/(duplicate column|already exists)/i.test(err?.message || "")) {
      throw err;
    }
  }

  await dbProm.exec(`
    CREATE INDEX IF NOT EXISTS idx_taixiu_history_user_time
      ON TaixiuHistory(userID, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_taixiu_history_thread_time
      ON TaixiuHistory(threadID, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_taixiu_history_user_thread_time
      ON TaixiuHistory(userID, threadID, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_txiu_history_thread_time
      ON TxiuHistory(threadID, time DESC);
  `);

  await dbProm.exec(`
    CREATE INDEX IF NOT EXISTS idx_thread_threadID ON Thread(threadID);
    CREATE INDEX IF NOT EXISTS idx_thread_threadName ON Thread(threadName);
    CREATE INDEX IF NOT EXISTS idx_thread_lastActive ON Thread(lastActive);
    CREATE INDEX IF NOT EXISTS idx_thread_lastActive_desc ON Thread(lastActive DESC);
  `);

  await dbProm.exec(`
    CREATE TRIGGER IF NOT EXISTS update_user_timestamp
    AFTER UPDATE ON User
    BEGIN
      UPDATE User SET updatedAt = CURRENT_TIMESTAMP WHERE num = NEW.num;
    END;

    CREATE TRIGGER IF NOT EXISTS update_thread_timestamp
    AFTER UPDATE ON Thread
    BEGIN
      UPDATE Thread SET updatedAt = CURRENT_TIMESTAMP WHERE num = NEW.num;
    END;
  `);

  // Cleanup legacy/invalid banned values so checks don't mis-detect bans.
  // Some old versions stored '{}' or '' (or even 'null') instead of SQL NULL.
  try {
    await dbProm.run(
      `UPDATE User
       SET banned = NULL
       WHERE banned IS NOT NULL
         AND (TRIM(banned) = '' OR TRIM(banned) = '{}' OR LOWER(TRIM(banned)) = 'null')`
    );
  } catch {
    // Best-effort cleanup; ignore on failure.
  }

  try {
    await dbProm.run(
      `UPDATE Thread
       SET banned = NULL
       WHERE banned IS NOT NULL
         AND (TRIM(banned) = '' OR TRIM(banned) = '{}' OR LOWER(TRIM(banned)) = 'null')`
    );
  } catch {
    // Best-effort cleanup; ignore on failure.
  }
}

const authenticateWithRetry = async (): Promise<void> => {
  return retry(
    async () => {
      if (!db) {
        throw new Error("Database connection not established");
      }
      await getDbPromisified().get("SELECT 1");
      logger.info("Xác thực kết nối database thành công");
    },
    {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 5000,
    }
  );
};

export async function initDatabase(): Promise<void> {
  try {
    resetDbMetrics();

    db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        logger.error(`Lỗi mở database: ${err.message}`);
        throw err;
      }
    });

    dbPromisified = promisifyDb(db);

    await dbPromisified.run("PRAGMA journal_mode = WAL;");
    await dbPromisified.run("PRAGMA synchronous = NORMAL;");
    await dbPromisified.run("PRAGMA cache_size = -20000;");
    await dbPromisified.run("PRAGMA temp_store = MEMORY;");
    await dbPromisified.run("PRAGMA busy_timeout = 30000;");
    await dbPromisified.run("PRAGMA query_only = 0;");
    await dbPromisified.run("PRAGMA mmap_size = 268435456;");
    await dbPromisified.run("PRAGMA threads = 1;");
    await dbPromisified.run("PRAGMA page_size = 4096;");
    await dbPromisified.run("PRAGMA foreign_keys = ON;");

    await dbPromisified.run("PRAGMA wal_autocheckpoint = 1000;");
    await dbPromisified.run("PRAGMA optimize;");

    await dbPromisified.run("PRAGMA automatic_index = ON;");
    await dbPromisified.run("PRAGMA query_flattener = ON;");

    logger.info(`Đã kết nối database: ${path.basename(DB_PATH)}`);
    logger.info("Đã tối ưu cài đặt SQLite PRAGMA cho hiệu suất tối đa");

    await createTables();
    logger.info("Đồng bộ hóa models database thành công");

    await authenticateWithRetry();

    console.log(createLine(null, true));
  } catch (error: any) {
    logger.error(`Khởi tạo database thất bại: ${error.message}`);
    throw error;
  }
}

let healthCheckInterval: NodeJS.Timeout | null = null;

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    if (!db) return false;
    await getDbPromisified().get("SELECT 1");
    return true;
  } catch (error: any) {
    logger.error(`Database health check failed: ${error.message}`);
    return false;
  }
}

export function startDatabaseMaintenance(): void {
  if (healthCheckInterval) return;

  healthCheckInterval = setInterval(async () => {
    try {

      const isHealthy = await checkDatabaseHealth();
      if (!isHealthy) {
        logger.warn("Database connection không healthy, đang thử reconnect...");
        try {
          if (db) {
            await getDbPromisified().get("SELECT 1");
            logger.info("Database đã reconnect thành công");
          }
        } catch (error: any) {
          logger.error(`Không thể reconnect database: ${error.message}`);
        }
      }

      const now = Date.now();
      const lastVacuum = (global as any).__lastDbVacuum || 0;
      const VACUUM_INTERVAL = 4 * 60 * 60 * 1000;

      if (now - lastVacuum > VACUUM_INTERVAL) {
        try {
          await getDbPromisified().run("PRAGMA optimize;");
          (global as any).__lastDbVacuum = now;
          logger.info("Đã tối ưu database (PRAGMA optimize)");
        } catch (error: any) {
          logger.error(`Lỗi khi tối ưu database: ${error.message}`);
        }
      }
    } catch (error: any) {
      logger.error(`Lỗi trong database maintenance: ${error.message}`);
    }
  }, 15 * 60 * 1000);

  (healthCheckInterval as any).unref?.();
  logger.info("Đã bật database maintenance (health check + periodic optimization)");
}

export function stopDatabaseMaintenance(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

export async function closeDatabase(): Promise<void> {
  try {
    stopDatabaseMaintenance();

    for (const stmt of preparedStatements.values()) {
      try {
        stmt.finalize();
      } catch (e) {

      }
    }
    preparedStatements.clear();

    if (db) {
      await getDbPromisified().close();
      db = null;
      dbPromisified = null;
      logger.info("Đã đóng kết nối database");
    }
  } catch (error: any) {
    logger.error(`Lỗi khi đóng database: ${error.message}`);
  }
}
