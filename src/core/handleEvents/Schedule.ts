"use strict";

import type { BotConfig, FacebookClient, Logger, MainData } from "@types";
import moment from "moment-timezone";
import { resetGeminiDailyQuota } from "../../plugins/cmds/AI/bot";
import { addConfigListener, getConfig, loadConfig, writeConfig } from "../configManager";
import factory from "./task/scheduler.tasks";
import type { ThreadDataStore, UserDataStore } from "./task/types";

const getDonixState = () => {
  if (!global.Donix) {
    global.Donix = {} as typeof global.Donix;
  }
  return global.Donix;
};

const TZ = "Asia/Ho_Chi_Minh";
const now = () => moment.tz(TZ);

export interface SchedulerConfig {
  enabled: boolean;
  tasks: {
    [key: string]: {
      enabled: boolean;
      type: "at" | "everyMin" | "everyH";
      time?: string;
      chunk?: number;
      hours?: number;
      ensureAll?: boolean;
      strict?: boolean;
    };
  };
}

export type ExtendedBotConfig = BotConfig & {
  scheduler?: SchedulerConfig;
  PREFIX?: string;
  BOTNAME?: string;
  timeZone?: string;
  token?: Record<string, string>;
  tokens?: Record<string, string>;
};

export interface TaskHandler {
  stop: () => void;
  next: () => Date | null;
}

export interface SchedulerState {
  tasks: Map<string, TaskHandler>;
  enabled: boolean;
  config: ExtendedBotConfig;
}

export type SchedulerTaskConfig = SchedulerConfig["tasks"][string];

export interface SchedulerTaskStatus {
  enabled: boolean;
  type: string;
  conf: SchedulerTaskConfig;
  running: boolean;
  next: string | null;
}

export interface SchedulerStatus {
  enabled: boolean;
  tasks: Record<string, SchedulerTaskStatus>;
}

export interface SchedulerAPI {
  status: () => SchedulerStatus;
  startTask: (name: string) => boolean;
  stopTask: (name: string) => void;
  startAll: () => void;
  stopAll: () => void;
  setEnabled: (on: boolean) => Promise<void>;
  runNow: (name: string) => boolean;
  config: ExtendedBotConfig;
  getAllConfig: () => Promise<ExtendedBotConfig>;
  ensure: () => Promise<ExtendedBotConfig>;
  setTask: (name: string, patch: Partial<SchedulerTaskConfig>) => Promise<SchedulerTaskConfig>;
  setConfig: (patch: Partial<SchedulerConfig>) => Promise<SchedulerConfig>;
  save: () => Promise<ExtendedBotConfig>;
  reload: () => Promise<SchedulerStatus>;
}

export interface ScheduleDependencies {
  client: FacebookClient;
  logger?: Logger;
  main: MainData;
  userData: UserDataStore;
  threadData: ThreadDataStore;
  config: BotConfig;
}

const ok = (v: unknown): v is string =>
  typeof v === "string" && v.trim() !== "" && !/^(undefined|null)$/i.test(v.trim());

const safe = (v: unknown, d: string): string => (ok(v) ? String(v).trim() : d);

async function saveConfig(cfg: ExtendedBotConfig): Promise<void> {
  await writeConfig(cfg, true);
}

function ensureDefaults(
  base: ExtendedBotConfig,
  defs: Partial<ExtendedBotConfig>
): { out: ExtendedBotConfig; dirty: boolean } {
  let dirty = false;

  const recur = (a: Record<string, unknown>, b: Record<string, unknown>): void => {
    Object.keys(b).forEach((k) => {
      if (!(k in a)) {
        (a as Record<string, unknown>)[k] = b[k];
        dirty = true;
      } else {
        const av = a[k];
        const bv = b[k];
        if (
          typeof av === "object" &&
          av &&
          typeof bv === "object" &&
          bv &&
          !Array.isArray(av) &&
          !Array.isArray(bv)
        ) {
          recur(av as Record<string, unknown>, bv as Record<string, unknown>);
        }
      }
    });
  };

  const out = JSON.parse(JSON.stringify(base || {})) as ExtendedBotConfig;
  recur(out, defs);

  return { out, dirty };
}

/** Sau mốc HH:mm, vẫn chạy bù nếu bot khởi động trễ / timer trễ (tránh nhảy thẳng sang ngày sau, mất Top 00h). */
const AT_TASK_GRACE_MS = 5 * 60 * 1000;

function makeAt(timeStr: string, fn: () => Promise<void>): TaskHandler {
  let active = true;
  let t: NodeJS.Timeout | null = null;
  let next: Date | null = null;

  const loop = (afterSuccessfulRun: boolean): void => {
    if (!active) return;

    const [h, m] = String(timeStr).split(":").map(Number);
    const n = now();
    let nx;
    let diff: number;

    if (afterSuccessfulRun) {
      nx = n
        .clone()
        .add(1, "day")
        .hour(h || 0)
        .minute(m || 0)
        .second(0)
        .millisecond(0);
      diff = Math.max(100, nx.diff(n));
    } else {
      nx = n.clone().hour(h || 0).minute(m || 0).second(0).millisecond(0);
      if (!nx.isAfter(n)) {
        const lateMs = n.diff(nx);
        if (lateMs > AT_TASK_GRACE_MS) {
          nx = nx.add(1, "day");
        }
      }
      diff = nx.isAfter(n) ? Math.max(100, nx.diff(n)) : 100;
    }

    next = nx.toDate();

    t = setTimeout(async () => {
      if (!active) return;
      try {
        await fn();
      } catch {

      }
      loop(true);
    }, diff);
  };

  loop(false);

  return {
    stop: () => {
      active = false;
      if (t) clearTimeout(t);
    },
    next: () => next,
  };
}

function makeEveryMin(chunk: number, fn: () => Promise<void>): TaskHandler {
  let active = true;
  let t: NodeJS.Timeout | null = null;
  let next: Date | null = null;

  const loop = (): void => {
    if (!active) return;

    const n = now();
    const mn = n.minute();
    const nm = Math.ceil((mn + 1) / chunk) * chunk;

    let nx = n.clone();
    if (nm >= 60) nx = nx.add(1, "hour").minute(0).second(0).millisecond(0);
    else nx = nx.minute(nm).second(0).millisecond(0);

    next = nx.toDate();

    let d = nx.diff(n);
    if (d < 100) d += chunk * 60000;

    t = setTimeout(async () => {
      if (!active) return;
      try {
        await fn();
      } catch {

      }
      loop();
    }, d);
  };

  loop();

  return {
    stop: () => {
      active = false;
      if (t) clearTimeout(t);
    },
    next: () => next,
  };
}

function makeEveryH(h: number, fn: () => Promise<void>): TaskHandler {
  let active = true;
  let t: NodeJS.Timeout | null = null;
  let next: Date | null = null;

  const loop = (): void => {
    if (!active) return;

    const n = now();
    let nx = n.clone().add(h, "hour").startOf("hour");

    next = nx.toDate();

    let d = nx.diff(n);
    if (d < 100) d += h * 3600000;

    t = setTimeout(async () => {
      if (!active) return;
      try {
        await fn();
      } catch { }
      loop();
    }, d);
  };

  loop();

  return {
    stop: () => {
      active = false;
      if (t) clearTimeout(t);
    },
    next: () => next,
  };
}

export function createSchedule(deps: ScheduleDependencies): Promise<void> {
  return initializeScheduler(deps);
}

async function initializeScheduler({
  client,
  logger,
  main,
  userData,
  threadData,
  config: initialConfig,
}: ScheduleDependencies): Promise<void> {
  const baseCfg = (getConfig() || initialConfig) as ExtendedBotConfig;

  const provided = factory({
    config: baseCfg,
    client,
    logger,
    main,
    userData,
    threadData,
  });

  const initBank = provided.initBank;
  const TaskTokenMgr = provided.TokenMgr;
  const updThreads = provided.updThreads;
  const updNick = provided.updNick;
  const notifyExp = provided.notifyExp;
  const sendTop = provided.sendTop;
  const autoInteractFeed = (provided as unknown as { autoInteractFeed?: () => Promise<unknown> }).autoInteractFeed;

  const defaults = {
    scheduler: {
      enabled: true,
      tasks: {
        tokenCheck: { enabled: true, type: "everyH", hours: 2, ensureAll: false, strict: false },
        updNick: { enabled: true, type: "at", time: "00:10" },
        notifyExp: { enabled: true, type: "at", time: "16:00" },
        sendTop: { enabled: true, type: "at", time: "00:01", send: { enabled: true } },
        resetGeminiQuota: { enabled: true, type: "at", time: "00:01" },
        autoRestart: { enabled: false, type: "everyH", hours: 4 },
        autoInteractFeed: { enabled: false, type: "everyMin", chunk: 30, maxPerRun: 3, fetchLimit: 8, reaction: "LIKE", minDelayMs: 2500, maxDelayMs: 6000 },
      },
    },
  } as unknown as Partial<ExtendedBotConfig>;

  const ensured = ensureDefaults(baseCfg, defaults);
  if (ensured.dirty) {
    await saveConfig(ensured.out);
    await loadConfig();
  }

  const cfg = ensured.out;
  const stopBank = await initBank();
  const tok = TaskTokenMgr || null;

  const runners: Record<string, () => Promise<void>> = {
    updThreads: async () => {
      logger?.info?.("Cập nhật nhóm");
      await updThreads();
    },
    tokenCheck: async () => {
      const currentConfig = getCurrentConfig();
      const tcfg = currentConfig.scheduler?.tasks?.tokenCheck;
      const opts = { ensureAll: !!tcfg?.ensureAll, tolerant: !tcfg?.strict };
      if (tok) {
        try {
          await tok.run(currentConfig, opts);
        } catch (e: unknown) {
          const error = e instanceof Error ? e : new Error(String(e));
          logger?.error?.(`Lỗi kiểm tra token: ${error.message}`);
        }
      } else {
        logger?.warn?.("Token manager không khả dụng");
      }
    },
    updNick: async () => {
      logger?.info?.("Cập nhật biệt danh");
      await updNick();
    },
    notifyExp: async () => {
      logger?.info?.("Thông báo hết hạn");
      await notifyExp();
    },
    sendTop: async () => {
      logger?.info?.("Top tương tác");
      await sendTop();
    },
    autoInteractFeed: async () => {
      if (!autoInteractFeed) {
        logger?.warn?.("autoInteractFeed không khả dụng");
        return;
      }
      logger?.info?.("Auto tương tác theo News Feed");
      await autoInteractFeed();
    },
    resetGeminiQuota: async () => {
      logger?.info?.("Reset daily quota Gemini");
      resetGeminiDailyQuota();
    },
    autoRestart: async () => {
      logger?.warn?.("Auto restart mỗi 4h: tiến hành khởi động lại bot");
      setTimeout(() => process.exit(1), 1000);
    },
  };

  if (!(main as unknown as { scheduler?: SchedulerAPI }).scheduler) {
    (main as unknown as { scheduler: Partial<SchedulerAPI> }).scheduler = {};
  }

  const state: SchedulerState = {
    tasks: new Map(),
    enabled: !!cfg.scheduler?.enabled,
    config: cfg,
  };


  const getCurrentConfig = (): ExtendedBotConfig => {
    return (getConfig() || state.config) as ExtendedBotConfig;
  };

  function startTask(name: string): boolean {
    const currentConfig = getCurrentConfig();
    const tcfg = currentConfig.scheduler?.tasks?.[name];
    const run = runners[name];
    const schedulerEnabled = !!currentConfig.scheduler?.enabled;

    if (!tcfg || !run || !tcfg.enabled || !schedulerEnabled) return false;

    stopTask(name);

    let h: TaskHandler | null = null;

    if (tcfg.type === "at") {
      h = makeAt(safe(tcfg.time, "00:00"), run);
    } else if (tcfg.type === "everyMin") {
      h = makeEveryMin(Math.max(1, Number(tcfg.chunk || 10)), run);
    } else if (tcfg.type === "everyH") {
      h = makeEveryH(Math.max(1, Number(tcfg.hours || 2)), run);
    }

    if (!h) return false;

    state.tasks.set(name, h);
    return true;
  }

  function stopTask(name: string): void {
    const h = state.tasks.get(name);
    if (h && h.stop) {
      try {
        h.stop();
      } catch { }
    }
    state.tasks.delete(name);
  }

  function startAll(): void {
    const currentConfig = getCurrentConfig();
    if (!currentConfig.scheduler?.tasks) return;
    Object.keys(currentConfig.scheduler.tasks).forEach((k) => {
      const started = startTask(k);
      if (started) {
        logger?.info?.(`Đã khởi động task: ${k}`);
      } else {
        const tcfg = currentConfig.scheduler?.tasks?.[k];
        if (tcfg && !tcfg.enabled) {
          logger?.info?.(`Task ${k} đã bị tắt`);
        }
      }
    });
  }

  function stopAll(): void {
    Array.from(state.tasks.keys()).forEach((k) => stopTask(k));
  }

  function status(): SchedulerStatus {
    const currentConfig = getCurrentConfig();
    const out: SchedulerStatus = { enabled: !!currentConfig.scheduler?.enabled, tasks: {} };

    if (!currentConfig.scheduler?.tasks) return out;

    for (const [k, v] of Object.entries(currentConfig.scheduler.tasks)) {
      const h = state.tasks.get(k);
      out.tasks[k] = {
        enabled: !!v.enabled,
        type: v.type,
        conf: v,
        running: !!h,
        next: h && h.next ? moment(h.next()).tz(TZ).format("YYYY-MM-DD HH:mm:ss") : null,
      };
    }

    return out;
  }

  async function persist(): Promise<ExtendedBotConfig> {
    const merged = (await loadConfig()) as ExtendedBotConfig;
    const nextCfg = {
      ...merged,
      scheduler: state.config.scheduler,
    } as ExtendedBotConfig;
    await writeConfig({ scheduler: state.config.scheduler }, true);
    await loadConfig();
    state.config = (getConfig() || nextCfg) as ExtendedBotConfig;
    return state.config;
  }

  async function reload(): Promise<SchedulerStatus> {
    const fresh = (await loadConfig()) as ExtendedBotConfig;
    const m = ensureDefaults(fresh, defaults);
    if (m.dirty) {
      await saveConfig(m.out);
      await loadConfig();
    }
    state.config = (getConfig() || m.out) as ExtendedBotConfig;
    stopAll();
    if (state.enabled) startAll();
    return status();
  }

  async function setEnabled(on: boolean): Promise<void> {
    state.enabled = !!on;
    if (!state.config.scheduler) {
      state.config.scheduler = { enabled: true, tasks: {} };
    }
    state.config.scheduler.enabled = state.enabled;
    if (state.enabled) startAll();
    else stopAll();
    await persist();
  }

  function runNow(name: string): boolean {
    const run = runners[name];
    if (!run) return false;
    run().catch(() => { });
    return true;
  }


  void addConfigListener(async (newConfig, oldConfig) => {
    try {
      const freshConfig = newConfig as ExtendedBotConfig;
      const schedulerChanged =
        oldConfig === null ||
        JSON.stringify(oldConfig.scheduler) !== JSON.stringify(freshConfig.scheduler);

      if (schedulerChanged) {
        logger?.info?.("Phát hiện thay đổi scheduler config, đang reload...");
        const m = ensureDefaults(freshConfig, defaults);
        if (m.dirty) {
          await writeConfig({ scheduler: m.out.scheduler }, true);
          await loadConfig();
        }
        state.config = (getConfig() || m.out) as ExtendedBotConfig;
        state.enabled = !!state.config.scheduler?.enabled;
        stopAll();
        if (state.enabled) {
          startAll();
          logger?.info?.("Scheduler đã được reload và khởi động lại");
        } else {
          logger?.info?.("Scheduler đã được reload và tắt");
        }
      }
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      logger?.error?.(`Lỗi khi reload scheduler: ${error.message}`);
    }
  });


  const currentStartConfig = getCurrentConfig();
  state.enabled = !!currentStartConfig.scheduler?.enabled;
  if (state.enabled) {
    startAll();
    logger?.info?.("Scheduler đã được khởi động");
  } else {
    stopAll();
    logger?.info?.("Scheduler đã bị tắt");
  }
  if (tok) {
    const currentConfig = getCurrentConfig();
    if (currentConfig.scheduler?.tasks?.tokenCheck?.enabled) {
      setTimeout(async () => {
        try {
          const maxRetries = 15;
          const retryDelay = 2000;
          let retries = 0;
          let api = getDonixState().api;

          while (retries < maxRetries && (!api || typeof api.getToken !== "function")) {
            if (retries === 0) {
              logger?.info?.("Đang đợi API sẵn sàng để kiểm tra token...");
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            api = getDonixState().api;
            retries++;
          }

          if (!api || typeof api.getToken !== "function") {
            logger?.warn?.("getToken chưa sẵn sàng sau khi đợi, bỏ qua token check lần đầu");
            return;
          }

          logger?.info?.("Chạy kiểm tra token lần đầu");
          const currentConfigForToken = getCurrentConfig();
          await tok.run(currentConfigForToken, {
            ensureAll: !!currentConfigForToken.scheduler?.tasks?.tokenCheck?.ensureAll,
            tolerant: !currentConfigForToken.scheduler?.tasks?.tokenCheck?.strict,
          });
        } catch (e: unknown) {
          const error = e instanceof Error ? e : new Error(String(e));
          logger?.error?.(`Token check lần đầu thất bại: ${error.message}`);
        }
      }, 2000);
    }
  }

  (main as unknown as { scheduler: SchedulerAPI }).scheduler = {
    status,
    startTask,
    stopTask,
    startAll,
    stopAll,
    setEnabled,
    runNow,
    get config() {
      return state.config;
    },
    getAllConfig: async () => {
      return (await loadConfig()) as ExtendedBotConfig;
    },
    ensure: async () => {
      const cur = (await loadConfig()) as ExtendedBotConfig;
      const e = ensureDefaults(cur, defaults);
      if (e.dirty) {
        await saveConfig(e.out);
        await loadConfig();
      }
      state.config = (getConfig() || e.out) as ExtendedBotConfig;
      stopAll();
      if (state.enabled) startAll();
      return state.config;
    },
    async setTask(name: string, patch: Partial<SchedulerTaskConfig>) {
      if (!state.config.scheduler) {
        state.config.scheduler = { enabled: true, tasks: {} };
      }
      if (!state.config.scheduler.tasks) {
        state.config.scheduler.tasks = {};
      }
      const cur = state.config.scheduler.tasks[name] || ({} as SchedulerTaskConfig);
      state.config.scheduler.tasks[name] = { ...cur, ...patch };
      stopTask(name);
      const taskConfig = state.config.scheduler.tasks[name];
      if (state.enabled && taskConfig?.enabled) startTask(name);
      await persist();
      return state.config.scheduler.tasks[name] as SchedulerTaskConfig;
    },
    async setConfig(patch: Partial<SchedulerConfig>) {
      if (!state.config.scheduler) {
        state.config.scheduler = { enabled: true, tasks: {} };
      }
      state.config.scheduler = {
        ...state.config.scheduler,
        ...patch,
        tasks: { ...state.config.scheduler.tasks, ...(patch.tasks || {}) },
      };
      state.enabled = !!state.config.scheduler.enabled;
      stopAll();
      if (state.enabled) startAll();
      await persist();
      return state.config.scheduler;
    },
    async save() {
      return persist();
    },
    async reload() {
      return reload();
    },
  } as SchedulerAPI;

  process.on("SIGINT", () => {
    try {
      (main as unknown as { scheduler?: SchedulerAPI }).scheduler?.stopAll?.();
    } catch { }
    stopBank();
    process.exit(0);
  });
}

export default createSchedule;
