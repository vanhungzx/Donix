import { promises as fs, watch, writeFileSync } from "fs";
import { createRequire } from "module";
import * as path from "path";
import { join } from "path";
import { fileURLToPath } from "url";
import * as v8 from "v8";
import * as vm from "vm";
import log from "../utils/log";
import { readSessionCookieSync, writeSessionCookieSync } from "./sessionCookieFile";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = join(__dirname, "config", "config.json");

let currentConfig: Record<string, any> = {};
let watcher: ReturnType<typeof watch> | null = null;
let isReloading = false;
let reloadTimeout: NodeJS.Timeout | null = null;
const configListeners = new Set<(config: Record<string, any>, oldConfig: Record<string, any> | null) => void | Promise<void>>();

function validateConfig(config: any): { valid: boolean; error?: string } {
  if (!config || typeof config !== "object") {
    return { valid: false, error: "Config phải là một object" };
  }

  if (config.OWNER !== undefined && !Array.isArray(config.OWNER) && typeof config.OWNER !== "string") {
    return { valid: false, error: "OWNER phải là array hoặc string" };
  }

  if (config.ADMIN !== undefined && !Array.isArray(config.ADMIN)) {
    return { valid: false, error: "ADMIN phải là array" };
  }

  if (config.BOX_ADMIN !== undefined && !Array.isArray(config.BOX_ADMIN) && typeof config.BOX_ADMIN !== "string") {
    return { valid: false, error: "BOX_ADMIN phải là array hoặc string" };
  }

  if (config.adminbox !== undefined && typeof config.adminbox !== "object") {
    return { valid: false, error: "adminbox phải là object" };
  }

  return { valid: true };
}

export const loadConfig = async (): Promise<Record<string, any>> => {
  try {

    const requireFn = createRequire(__filename);

    try {
      delete requireFn.cache[requireFn.resolve(CONFIG_PATH)];
    } catch { }

    const configContent = await fs.readFile(CONFIG_PATH, "utf-8");
    const isJsonFile = CONFIG_PATH.endsWith('.json');

    const processLoadedConfig = async (loaded: any, oldConfig: Record<string, any> | null = null): Promise<Record<string, any>> => {
      currentConfig = v8.deserialize(v8.serialize(loaded));

      const fromFile = readSessionCookieSync();
      const jsonFallback =
        typeof currentConfig.cookie === "string" ? currentConfig.cookie.trim() : "";
      currentConfig.cookie = fromFile || jsonFallback;

      const globalAny = global as typeof globalThis & { account?: { cookie?: string; token?: any } };
      const tokenSource = currentConfig.token;
      const tokenValue =
        tokenSource && typeof tokenSource === "object" && !Array.isArray(tokenSource)
          ? { ...tokenSource }
          : tokenSource?.EAAAAU
            ? { EAAAAU: tokenSource.EAAAAU }
            : null;

      globalAny.account = {
        cookie: currentConfig.cookie,
        token: tokenValue
      };

      for (const listener of configListeners) {
        try {
          if (typeof listener === "function") await listener(currentConfig, oldConfig ?? null);
        } catch (err: any) {
          log.error(`Lỗi listener cấu hình: ${err?.message ?? err}`);
        }
      }

      if (typeof (currentConfig as any).onConfigReload === "function") {
        await (currentConfig as any).onConfigReload(currentConfig);
      }

      if (oldConfig) Object.keys(oldConfig).forEach(key => delete oldConfig[key]);

      return currentConfig;
    };

    if (isJsonFile) {
      try {
        const config = JSON.parse(configContent);
        const oldConfig = currentConfig ? v8.deserialize(v8.serialize(currentConfig)) : null;
        await processLoadedConfig(config, oldConfig);
        log.success("Đã nạp cấu hình thành công từ JSON!");
        return currentConfig;
      } catch (jsonError: any) {
        log.error(`Lỗi khi parse JSON: ${jsonError.message}`);
        throw new Error(`Không thể parse config JSON: ${jsonError.message}`);
      }
    }

    try {
      const context = vm.createContext({
        require: requireFn,
        module: { exports: {} },
        exports: {},
        __dirname: path.dirname(CONFIG_PATH),
        __filename: CONFIG_PATH,
        console,
        Buffer,
        process: { env: process.env, cwd: process.cwd },
      });

      vm.runInContext(configContent, context, { filename: CONFIG_PATH, displayErrors: true });
      const loaded = context.module.exports?.default ?? context.module.exports?.config ?? context.module.exports;

      const oldConfig = currentConfig ? v8.deserialize(v8.serialize(currentConfig)) : null;
      await processLoadedConfig(loaded, oldConfig);
      log.success("Đã nạp cấu hình thành công bằng VM!");
      return currentConfig;
    } catch (vmError: any) {

      try {
        const config = JSON.parse(configContent);
        const oldConfig = currentConfig ? v8.deserialize(v8.serialize(currentConfig)) : null;
        await processLoadedConfig(config, oldConfig);
        log.success("Đã nạp cấu hình thành công từ JSON (fallback)!");
        return currentConfig;
      } catch (jsonError: any) {
        throw new Error(`Không thể load config: VM error: ${vmError.message}, JSON error: ${jsonError.message}`);
      }
    }
  } catch (error: any) {
    log.error(`Lỗi khi đọc config file từ ${CONFIG_PATH}: ${error.message}`);
    log.error(`Chi tiết lỗi: ${error.stack || error}`);

    const defaultConfig = {
      PREFIX: "'",
      prefix: "'",
      DevMode: true,
      OWNER: ["502275138"],
      ADMIN: [],
      OWNER_NOPREFIX: true,
      antiINBOX: true,
      adminOnly: false,
      adminbox: {},
      BOX_ADMIN: [],
      loadSrcips: {
        enable: true,
        cmdDis: [],
        eventDis: [],
      },
    };
    currentConfig = defaultConfig;
    return defaultConfig;
  }
};

export function getConfig(): Readonly<Record<string, any>> {
  return currentConfig;
}

/** Đồng bộ cookie phiên trong RAM (sau khi ghi `cookie.txt`). */
export function applySessionCookieToRuntime(cookie: string): void {
  const v = typeof cookie === "string" ? cookie.trim() : "";
  (currentConfig as Record<string, unknown>).cookie = v;
  const globalAny = global as typeof globalThis & { account?: { cookie?: string; token?: any } };
  const tokenSource = currentConfig.token;
  const tokenValue =
    tokenSource && typeof tokenSource === "object" && !Array.isArray(tokenSource)
      ? { ...tokenSource }
      : tokenSource?.EAAAAU
        ? { EAAAAU: tokenSource.EAAAAU }
        : null;
  globalAny.account = {
    cookie: v,
    token: tokenValue,
  };
}

function formatValue(value: any, maxLength: number = 50): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value.length > maxLength ? value.substring(0, maxLength) + "..." : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.length <= 3) {
      return `[${value.map(v => formatValue(v, 20)).join(", ")}]`;
    }
    return `[${value.length} items]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    if (keys.length <= 3) {
      const pairs = keys.slice(0, 3).map(k => `${k}: ${formatValue(value[k], 15)}`);
      return `{${pairs.join(", ")}${keys.length > 3 ? "..." : ""}}`;
    }
    return `{${keys.length} keys}`;
  }
  return String(value).substring(0, maxLength);
}

function compareConfig(oldConfig: Record<string, any>, newConfig: Record<string, any>): string[] {
  const changes: string[] = [];
  const MAX_CHANGES = 50;

  for (const key of Object.keys(oldConfig)) {
    if (changes.length >= MAX_CHANGES) break;
    if (!(key in newConfig)) {
      changes.push(`❌ Xóa: ${key} = ${formatValue(oldConfig[key])}`);
    }
  }

  for (const key of Object.keys(newConfig)) {
    if (changes.length >= MAX_CHANGES) break;

    const oldValue = oldConfig[key];
    const newValue = newConfig[key];

    if (!(key in oldConfig)) {

      changes.push(`➕ Thêm: ${key} = ${formatValue(newValue)}`);
    } else {

      try {
        const oldSerialized = v8.serialize(oldValue);
        const newSerialized = v8.serialize(newValue);
        if (oldSerialized.compare(newSerialized) !== 0) {
          changes.push(`Thay đổi: ${key}\n   Cũ: ${formatValue(oldValue)}\n   Mới: ${formatValue(newValue)}`);
        }
      } catch (e) {

        if (oldValue !== newValue) {
          changes.push(`Thay đổi: ${key}\n   Cũ: ${formatValue(oldValue)}\n   Mới: ${formatValue(newValue)}`);
        }
      }
    }
  }

  return changes;
}

export async function reloadConfig(): Promise<{ success: boolean; error?: string }> {
  if (isReloading) {
    return { success: false, error: "Đang reload config, vui lòng đợi" };
  }

  try {
    isReloading = true;
    const oldConfig = currentConfig ? v8.deserialize(v8.serialize(currentConfig)) : {};

    await loadConfig();

    const validation = validateConfig(currentConfig);
    if (!validation.valid) {
      log.error(`Config không hợp lệ: ${validation.error}`);
      return { success: false, error: validation.error };
    }

    let changes: string[] = [];
    if (Object.keys(oldConfig).length > 0) {
      try {
        changes = compareConfig(oldConfig, currentConfig);
      } catch (e: any) {
        log.warn(`Không thể so sánh config (có thể do kích thước lớn): ${e?.message ?? e}`);
      }
    }

    if (changes.length > 0) {
      log.info("Phát hiện thay đổi trong config:");
      changes.forEach(change => {
        log.info(change);
      });
      changes.length = 0;
    } else if (Object.keys(oldConfig).length > 0) {
      log.info("Không có thay đổi trong config");
    }

    if (oldConfig) Object.keys(oldConfig).forEach(key => delete oldConfig[key]);

    log.success(`Config đã được reload thành công (${Object.keys(currentConfig).length} keys)`);
    return { success: true };
  } catch (error: any) {
    log.error(`Lỗi khi reload config: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    isReloading = false;
  }
}

export async function writeConfig(newConfig: Record<string, any>, merge: boolean = true): Promise<{ success: boolean; error?: string }> {
  try {

    const validation = validateConfig(newConfig);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const finalConfig = merge ? { ...currentConfig, ...newConfig } : newConfig;

    if (typeof finalConfig.cookie === "string" && finalConfig.cookie.trim()) {
      writeSessionCookieSync(finalConfig.cookie.trim());
    }
    const { cookie: _omitSessionCookie, ...persisted } = finalConfig;

    writeFileSync(CONFIG_PATH, JSON.stringify(persisted, null, 2), "utf-8");

    const reloadResult = await reloadConfig();

    if (reloadResult.success) {
      log.success("Config đã được ghi thành công");
    }

    return reloadResult;
  } catch (error: any) {
    log.error(`Lỗi khi ghi config: ${error.message}`);
    return { success: false, error: error.message };
  }
}

export async function updateConfigKey(key: string, value: any): Promise<{ success: boolean; error?: string }> {
  try {
    const keys = key.split(".");
    const newConfig = { ...currentConfig };

    let target: any = newConfig;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!target[k] || typeof target[k] !== "object") {
        target[k] = {};
      }
      target = target[k];
    }

    target[keys[keys.length - 1]] = value;

    return await writeConfig(newConfig, true);
  } catch (error: any) {
    log.error(`Lỗi khi cập nhật config key: ${error.message}`);
    return { success: false, error: error.message };
  }
}

const setupConfigWatcher = (): ReturnType<typeof watch> | null => {
  let isReloading = false;

  try {
    const watcher = watch(CONFIG_PATH, async (eventType) => {
      if (eventType === "change" && !isReloading) {
        isReloading = true;
        if (reloadTimeout) clearTimeout(reloadTimeout);

        reloadTimeout = setTimeout(async () => {
          try {
            const oldConfig = currentConfig ? v8.deserialize(v8.serialize(currentConfig)) : {};
            await loadConfig();

            const changes = compareConfig(oldConfig, currentConfig);
            log.success("Đã tải lại cấu hình do tệp thay đổi");

            if (changes.length > 0) {
              log.info(`Phát hiện thay đổi cấu hình: ${changes.join(", ")}`);
            }

            Object.keys(oldConfig).forEach(key => delete oldConfig[key]);
          } catch (err: any) {
            log.error(`Không thể tải lại cấu hình: ${err?.message ?? err}`);
          }
          isReloading = false;
        }, 100);

        if (reloadTimeout && typeof (reloadTimeout as any).unref === "function") {
          (reloadTimeout as any).unref();
        }
      }
    });

    return watcher;
  } catch (error: any) {
    log.error(`Không thể watch config file: ${error.message}`);
    return null;
  }
};

export const addConfigListener = (listener: (config: Record<string, any>, oldConfig: Record<string, any> | null) => void | Promise<void>): (() => void) => {
  if (typeof listener !== "function") {
    throw new TypeError("Listener cấu hình phải là hàm");
  }

  configListeners.add(listener);

  return () => {
    configListeners.delete(listener);
  };
};

export async function initConfigManager(): Promise<{ success: boolean; error?: string }> {

  const result = await reloadConfig();

  if (!result.success) {
    log.error(`Không thể khởi tạo config manager: ${result.error}`);
    return result;
  }

  if (Object.keys(currentConfig).length === 0) {
    const errorMsg = "Config được load nhưng trống, kiểm tra lại file config.json";
    log.error(errorMsg);
    return { success: false, error: errorMsg };
  }

  watcher = setupConfigWatcher();

  if (watcher) {
    log.success(`Config manager đã được khởi tạo và đang watch file: ${CONFIG_PATH}`);
    return { success: true };
  } else {
    const errorMsg = "Không thể watch config file";
    log.error(errorMsg);
    return { success: false, error: errorMsg };
  }
}

export function stopWatching(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
    log.info("Đã dừng watch config file");
  }
  if (reloadTimeout) {
    clearTimeout(reloadTimeout);
    reloadTimeout = null;
  }
}

export default getConfig;
