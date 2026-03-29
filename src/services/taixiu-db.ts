import { getDbPromisified } from "../core/database/schema";

export type TaixiuStreakData = {
  current: number;
  highest: number;
  loses: number;
};

export type TaixiuHistoryEntry = {
  bet: string;
  diceResult: string;
  gameResult: string;
  win: boolean;
  winAmount: string;
  jackpotWin: boolean;
  timestamp: number;
};

const toBigIntSafe = (raw: unknown): bigint => {
  try {
    if (raw === null || raw === undefined) return 0n;
    if (typeof raw === "bigint") return raw;
    if (typeof raw === "number") return BigInt(Math.trunc(raw));
    const s = String(raw).trim();
    if (!s) return 0n;
    return BigInt(s);
  } catch {
    return 0n;
  }
};

export async function taixiuGetJackpot(threadID: string): Promise<bigint> {
  const db = getDbPromisified();
  const row = await db.get(`SELECT amount FROM TaixiuJackpot WHERE threadID = ? LIMIT 1`, [String(threadID)]);
  return toBigIntSafe(row?.amount);
}

export async function taixiuAddToJackpot(threadID: string, contribution: bigint): Promise<void> {
  const db = getDbPromisified();
  const tid = String(threadID);
  const cur = await taixiuGetJackpot(tid);
  const next = cur + contribution;
  await db.run(
    `INSERT INTO TaixiuJackpot(threadID, amount, updatedAt)
     VALUES(?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(threadID) DO UPDATE SET amount = excluded.amount, updatedAt = CURRENT_TIMESTAMP`,
    [tid, next.toString()]
  );
}

export async function taixiuResetJackpot(threadID: string): Promise<bigint> {
  const db = getDbPromisified();
  const tid = String(threadID);
  const cur = await taixiuGetJackpot(tid);
  await db.run(
    `INSERT INTO TaixiuJackpot(threadID, amount, updatedAt)
     VALUES(?, '0', CURRENT_TIMESTAMP)
     ON CONFLICT(threadID) DO UPDATE SET amount = '0', updatedAt = CURRENT_TIMESTAMP`,
    [tid]
  );
  return cur;
}

export async function taixiuUpdateWinStreak(userID: string, win: boolean): Promise<TaixiuStreakData> {
  const db = getDbPromisified();
  const uid = String(userID);
  const row = await db.get(
    `SELECT current, highest, loses FROM TaixiuWinStreak WHERE userID = ? LIMIT 1`,
    [uid]
  );
  const cur: TaixiuStreakData = {
    current: Number(row?.current ?? 0),
    highest: Number(row?.highest ?? 0),
    loses: Number(row?.loses ?? 0),
  };

  let next: TaixiuStreakData;
  if (win) {
    const current = cur.current + 1;
    next = {
      current,
      highest: Math.max(cur.highest, current),
      loses: 0,
    };
  } else {
    next = {
      current: 0,
      highest: cur.highest,
      loses: cur.loses + 1,
    };
  }

  await db.run(
    `INSERT INTO TaixiuWinStreak(userID, current, highest, loses, updatedAt)
     VALUES(?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(userID) DO UPDATE SET
       current = excluded.current,
       highest = excluded.highest,
       loses = excluded.loses,
       updatedAt = CURRENT_TIMESTAMP`,
    [uid, next.current, next.highest, next.loses]
  );
  return next;
}

export async function taixiuGetWinStreak(userID: string): Promise<TaixiuStreakData> {
  const db = getDbPromisified();
  const uid = String(userID);
  const row = await db.get(
    `SELECT current, highest, loses FROM TaixiuWinStreak WHERE userID = ? LIMIT 1`,
    [uid]
  );
  return {
    current: Number(row?.current ?? 0),
    highest: Number(row?.highest ?? 0),
    loses: Number(row?.loses ?? 0),
  };
}

export async function taixiuClearGroup(threadID: string): Promise<void> {
  const db = getDbPromisified();
  const tid = String(threadID);
  await db.run(`DELETE FROM TaixiuHistory WHERE threadID = ?`, [tid]);
}

export async function taixiuSaveHistory(entry: {
  userID: string;
  threadID?: string;
  bet: string;
  diceResult: string;
  gameResult: string;
  winAmount: bigint | number | string;
  jackpotWin?: boolean;
  timestamp?: number;
}): Promise<void> {
  const db = getDbPromisified();
  const uid = String(entry.userID);
  const tid = String(entry.threadID ?? "");
  const ts = Number(entry.timestamp ?? Date.now());
  const win = entry.gameResult === "win" ? 1 : 0;
  const jackpotWin = entry.jackpotWin ? 1 : 0;
  const winAmountStr =
    typeof entry.winAmount === "bigint" ? entry.winAmount.toString() : String(entry.winAmount);

  await db.run(
    `INSERT INTO TaixiuHistory(threadID, userID, bet, diceResult, gameResult, win, winAmount, jackpotWin, timestamp)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tid, uid, entry.bet, entry.diceResult, entry.gameResult, win, winAmountStr, jackpotWin, ts]
  );

  // keep last 10 per user in each thread
  const rows = await db.all(
    `SELECT id FROM TaixiuHistory WHERE userID = ? AND threadID = ? ORDER BY timestamp DESC LIMIT -1 OFFSET 10`,
    [uid, tid]
  );
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id).filter((x) => x != null);
    const placeholders = ids.map(() => "?").join(",");
    await db.run(`DELETE FROM TaixiuHistory WHERE id IN (${placeholders})`, ids);
  }
}

export async function taixiuGetHistory(
  userID: string,
  limit: number = 10,
  threadID?: string
): Promise<TaixiuHistoryEntry[]> {
  const db = getDbPromisified();
  const uid = String(userID);
  const tid = typeof threadID === "string" ? String(threadID) : null;
  const rows =
    tid === null
      ? await db.all(
          `SELECT bet, diceResult, gameResult, win, winAmount, jackpotWin, timestamp
           FROM TaixiuHistory
           WHERE userID = ?
           ORDER BY timestamp ASC
           LIMIT ?`,
          [uid, limit]
        )
      : await db.all(
          `SELECT bet, diceResult, gameResult, win, winAmount, jackpotWin, timestamp
           FROM TaixiuHistory
           WHERE userID = ? AND threadID = ?
           ORDER BY timestamp ASC
           LIMIT ?`,
          [uid, tid, limit]
        );
  return (rows || []).map((r: any) => ({
    bet: String(r.bet ?? ""),
    diceResult: String(r.diceResult ?? ""),
    gameResult: String(r.gameResult ?? ""),
    win: Number(r.win ?? 0) === 1,
    winAmount: String(r.winAmount ?? "0"),
    jackpotWin: Number(r.jackpotWin ?? 0) === 1,
    timestamp: Number(r.timestamp ?? 0),
  }));
}

export async function txiuGetJackpot(threadID: string): Promise<{ amount: bigint; chance: number }> {
  const db = getDbPromisified();
  const tid = String(threadID);
  const row = await db.get(
    `SELECT amount, chance FROM TxiuJackpot WHERE threadID = ? LIMIT 1`,
    [tid]
  );
  if (!row) return { amount: 0n, chance: 0.3 };
  return { amount: toBigIntSafe(row.amount), chance: Number(row.chance ?? 0.3) };
}

export async function txiuSetJackpot(threadID: string, data: { amount: bigint; chance: number }): Promise<void> {
  const db = getDbPromisified();
  const tid = String(threadID);
  const chance = Number.isFinite(data.chance) ? data.chance : 0.3;
  await db.run(
    `INSERT INTO TxiuJackpot(threadID, amount, chance, updatedAt)
     VALUES(?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(threadID) DO UPDATE SET
       amount = excluded.amount,
       chance = excluded.chance,
       updatedAt = CURRENT_TIMESTAMP`,
    [tid, data.amount.toString(), chance]
  );
}

export async function txiuAddHistory(threadID: string, h: { time: number; result: string; dices: number[]; sum: number }): Promise<void> {
  const db = getDbPromisified();
  const tid = String(threadID);
  const d1 = Number(h.dices?.[0] ?? 0);
  const d2 = Number(h.dices?.[1] ?? 0);
  const d3 = Number(h.dices?.[2] ?? 0);
  await db.run(
    `INSERT INTO TxiuHistory(threadID, time, result, dice1, dice2, dice3, sum)
     VALUES(?, ?, ?, ?, ?, ?, ?)`,
    [tid, Number(h.time), String(h.result), d1, d2, d3, Number(h.sum)]
  );

  // keep last 8 per thread
  const rows = await db.all(
    `SELECT id FROM TxiuHistory WHERE threadID = ? ORDER BY time DESC LIMIT -1 OFFSET 8`,
    [tid]
  );
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id).filter((x) => x != null);
    const placeholders = ids.map(() => "?").join(",");
    await db.run(`DELETE FROM TxiuHistory WHERE id IN (${placeholders})`, ids);
  }
}

export async function txiuGetHistory(threadID: string, limit: number = 8): Promise<Array<{ result: string; sum: number; dices: number[] }>> {
  const db = getDbPromisified();
  const tid = String(threadID);
  const rows = await db.all(
    `SELECT result, sum, dice1, dice2, dice3
     FROM TxiuHistory
     WHERE threadID = ?
     ORDER BY time DESC
     LIMIT ?`,
    [tid, limit]
  );
  return (rows || []).map((r: any) => ({
    result: String(r.result ?? ""),
    sum: Number(r.sum ?? 0),
    dices: [Number(r.dice1 ?? 0), Number(r.dice2 ?? 0), Number(r.dice3 ?? 0)],
  }));
}
