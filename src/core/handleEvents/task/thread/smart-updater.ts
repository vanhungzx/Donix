"use strict";

import { FacebookClient } from "../../../../types/client";
import logger from "../../../logger";
import type { Logger, ThreadDataStore, UserDataStore } from "../types";

interface ThreadInfo {
  threadID?: string;
  threadName?: string;
  userInfo?: Array<{ id: string; name?: string; gender?: string | null }>;
  [key: string]: any;
}

interface UserStats {
  created: number;
  updated: number;
  total: number;
}

interface SmartUpdaterOptions {
  client: FacebookClient;
  logger?: Logger;
  threadData: ThreadDataStore;
  userData: UserDataStore;
}

interface SmartUpdaterResult {
  (tid: string): Promise<ThreadInfo | null>;
  triggerUpdate: () => Promise<void>;
  stop: () => void;
}

type JobPriority = 0 | 1 | 2;

type ThreadState = {
  inflight: boolean;
  cooldownUntil: number;
  failCount: number;
  lastEnqueuedAt: number;
};

export async function createSmartThreadUpdater(
  options: SmartUpdaterOptions
): Promise<SmartUpdaterResult> {
  const { client, logger: customLogger, threadData, userData } = options;
  const log =
    customLogger ||
    logger ||
    ({
      error() { },
      info() { },
      warn() { },
      success() { },
      system() { },
      debug() { },
    } as any);

  const CONCURRENCY = 3;
  const MAX_QUEUE_SIZE = 200;
  const SCAN_BATCH_SIZE = 25;
  const USER_BATCH_SIZE = 5;

  const API_TIMEOUT = 30_000;

  const UPDATE_INTERVAL = 15 * 60_000;
  const UPDATE_THRESHOLD = 15 * 60_000;

  const BASE_COOLDOWN_ON_FAIL = 2 * 60_000;
  const MAX_COOLDOWN = 30 * 60_000;

  const MIN_GAP_MS = 300;
  const SCAN_YIELD_MS = 5;

  const now = () => Date.now();
  const yieldLoop = () => new Promise<void>(r => setImmediate(r));

  function sleep(ms: number) {
    return new Promise<void>(r => setTimeout(r, ms));
  }

  function withTimeout<T>(promise: Promise<T>, ms: number, msg = "timeout"): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
    ]);
  }

  const state = new Map<string, ThreadState>();
  const getState = (tid: string): ThreadState => {
    const s = state.get(tid);
    if (s) return s;
    const init: ThreadState = { inflight: false, cooldownUntil: 0, failCount: 0, lastEnqueuedAt: 0 };
    state.set(tid, init);
    return init;
  };

  const queued = new Set<string>();
  const q0: string[] = [];
  const q1: string[] = [];
  const q2: string[] = [];

  function qSize() {
    return q0.length + q1.length + q2.length;
  }

  function enqueue(tid: string, prio: JobPriority) {
    if (!tid) return;
    if (queued.has(tid)) return;
    if (qSize() >= MAX_QUEUE_SIZE) return;

    const s = getState(tid);
    const t = now();
    if (s.cooldownUntil > t) return;
    if (s.inflight) return;

    queued.add(tid);
    s.lastEnqueuedAt = t;

    if (prio === 2) q2.push(tid);
    else if (prio === 1) q1.push(tid);
    else q0.push(tid);
  }

  function dequeue(): string | undefined {
    const tid = q2.shift() || q1.shift() || q0.shift();
    if (!tid) return;
    queued.delete(tid);
    return tid;
  }

  let running = 0;
  let stopped = false;

  let lastApiAt = 0;
  async function apiGate() {
    const t = now();
    const wait = Math.max(0, MIN_GAP_MS - (t - lastApiAt));
    if (wait) await sleep(wait);
    lastApiAt = now();
  }

  function computeCooldownMs(failCount: number) {
    const ms = BASE_COOLDOWN_ON_FAIL * Math.pow(2, Math.max(0, failCount - 1));
    return Math.min(ms, MAX_COOLDOWN);
  }

  async function upsertUsers(info: ThreadInfo): Promise<UserStats> {
    const users = info.userInfo || [];
    if (!users.length) return { created: 0, updated: 0, total: 0 };

    const seen = new Set<string>();
    const uniqueUsers = users.filter(u => u?.id && !seen.has(u.id) && seen.add(u.id));

    let created = 0;
    let updated = 0;

    for (let i = 0; i < uniqueUsers.length; i += USER_BATCH_SIZE) {
      const batch = uniqueUsers.slice(i, i + USER_BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async u => {
          const payload = {
            name: u.name || "Facebook User",
            userInfo: u,
            gender: u.gender ?? null,
          };

          const exists = await withTimeout(
            userData.get?.(u.id) || Promise.resolve(null),
            API_TIMEOUT,
            `Timeout get user ${u.id}`
          ).catch(() => null);

          if (exists) {
            await withTimeout(
              userData.update?.(u.id, payload) || Promise.resolve(),
              API_TIMEOUT,
              `Timeout update user ${u.id}`
            ).catch(() => { });
            updated++;
          } else {
            await withTimeout(
              userData.create?.(u.id, payload) || Promise.resolve(),
              API_TIMEOUT,
              `Timeout create user ${u.id}`
            ).catch(() => { });
            created++;
          }
        })
      );

      await yieldLoop();
    }

    return { created, updated, total: created + updated };
  }

  async function upsertThread(tid: string, info: ThreadInfo) {
    const data = { threadName: info.threadName, threadInfo: info, lastActive: now() };
    await withTimeout(threadData.update(tid, data), API_TIMEOUT, `Timeout update thread ${tid}`).catch(() => { });
  }

  async function handleJob(tid: string) {
    const s = getState(tid);
    const t = now();
    if (s.cooldownUntil > t || s.inflight) return;

    s.inflight = true;

    try {
      await apiGate();

      const info = (await withTimeout(
        client.getThreadInfo?.(tid) || Promise.reject(new Error("getThreadInfo not available")),
        API_TIMEOUT,
        `Timeout getThreadInfo ${tid}`
      )) as ThreadInfo;

      if (!info || (!info.threadID && !info.threadName)) throw new Error("empty threadInfo");

      const userStats = await withTimeout(upsertUsers(info), API_TIMEOUT, `Timeout upsert users ${tid}`)
        .catch(() => ({ created: 0, updated: 0, total: 0 }));

      await upsertThread(tid, info);

      s.failCount = 0;
      s.cooldownUntil = 0;

      log.info?.(
        `Cập nhật ${info.threadName || tid} (${tid})` +
        (userStats.total ? ` | User: +${userStats.created}/~${userStats.updated}` : "")
      );
    } catch (e: any) {
      s.failCount++;
      const cd = computeCooldownMs(s.failCount);
      s.cooldownUntil = now() + cd;
      log.warn?.(`Lỗi cập nhật ${tid}: ${e?.message || e} (cooldown ${Math.round(cd / 1000)}s)`);
    } finally {
      s.inflight = false;
      await yieldLoop();
    }
  }

  async function runWorkerLoop() {
    if (stopped) return;

    while (!stopped && running < CONCURRENCY) {
      const tid = dequeue();
      if (!tid) break;

      running++;
      void handleJob(tid)
        .catch(e => log.error?.(`Job crash ${tid}: ${e?.message || e}`))
        .finally(() => {
          running--;
          setImmediate(runWorkerLoop);
        });
    }
  }

  let scanRunning = false;

  async function scanAndEnqueue() {
    if (scanRunning || stopped) return;
    scanRunning = true;

    try {
      const t = now();
      const allThreads = (await withTimeout(
        (threadData.getAll as any)(["threadID", "lastActive"]),
        API_TIMEOUT * 2,
        "Timeout getAll threads"
      ).catch(() => [])) as Array<{ threadID: string; lastActive?: number | null }>;

      let need = 0;

      for (let i = 0; i < allThreads.length; i += SCAN_BATCH_SIZE) {
        const batch = allThreads.slice(i, i + SCAN_BATCH_SIZE);

        for (const row of batch) {
          const tid = String(row.threadID || "");
          if (!tid) continue;

          const s = getState(tid);
          if (s.inflight) continue;
          if (s.cooldownUntil > t) continue;

          const last = Number(row.lastActive) || 0;
          if (t - last > UPDATE_THRESHOLD) {
            enqueue(tid, 1);
            need++;
          }
        }

        await yieldLoop();
        if (SCAN_YIELD_MS > 0) await sleep(SCAN_YIELD_MS);
      }

      if (need) log.info?.(`Cần cập nhật ~${need} nhóm (queue=${qSize()}, running=${running})`);
      setImmediate(runWorkerLoop);
    } catch (e: any) {
      log.error?.(`scanAndEnqueue error: ${e?.message || e}`);
    } finally {
      scanRunning = false;
    }
  }

  async function getThreadInfoSmart(tid: string): Promise<ThreadInfo | null> {
    try {
      const cached = await withTimeout(threadData.get(tid), API_TIMEOUT, `Timeout get cached ${tid}`).catch(() => null);
      if (cached?.threadInfo) return cached.threadInfo;

      enqueue(tid, 2);
      setImmediate(runWorkerLoop);

      await yieldLoop();

      const after = await withTimeout(threadData.get(tid), API_TIMEOUT, `Timeout get after ${tid}`).catch(() => null);
      return after?.threadInfo || null;
    } catch (e: any) {
      log.error?.(`getThreadInfoSmart error ${tid}: ${e?.message || e}`);
      return null;
    }
  }

  const INITIAL_DELAY = 15_000;
  const initTimer = setTimeout(() => void scanAndEnqueue(), INITIAL_DELAY);

  const interval = setInterval(() => void scanAndEnqueue(), UPDATE_INTERVAL);
  (interval as any).unref?.();

  const stop = () => {
    stopped = true;
    clearTimeout(initTimer);
    clearInterval(interval);
    q0.length = q1.length = q2.length = 0;
    queued.clear();
  };

  const triggerUpdate = async () => {
    await scanAndEnqueue();
  };

  return Object.assign(getThreadInfoSmart, { triggerUpdate, stop });
}
