import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import logger from "@log";
import type { Context, DefaultFuncs } from "./request/formatters/helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ApiLoaderOptions {
  libPath?: string;
  bot?: Record<string, any>;
  client?: Record<string, any>;
  ctx: Context;
  defaultFuncs: DefaultFuncs;
}

export interface ApiLoaderResult {
  loadedCount: number;
  totalCount: number;
  failedModules: string[];
  methods: Map<string, Function>;
}

const isScriptFile = (fileName: string): boolean => /\.(ts|js)$/i.test(fileName);
const isPromiseLike = (value: unknown): value is Promise<unknown> =>
  typeof (value as { then?: unknown })?.then === "function";

const SKIP_FILES = new Set([
  'mqttReconnect',
  'uploadStoryWithMusic',
]);

export async function loadApiMethods(options: ApiLoaderOptions): Promise<ApiLoaderResult> {
  const { libPath, bot, client, ctx, defaultFuncs } = options;

  const detailPath = libPath || path.resolve(__dirname, "./detail");
  const clientObject = client || bot || {};

  let loadedCount = 0;
  let totalCount = 0;
  const failedModules: string[] = [];
  const methods = new Map<string, Function>();

  const bindApiMethod = async (methodPath: string, methodName: string): Promise<boolean> => {
    try {
      const fileUrl = pathToFileURL(methodPath).href;
      const module = await import(`${fileUrl}?t=${Date.now()}`);
      const fn = module.default || module[methodName] || module[Object.keys(module)[0]];

      if (typeof fn !== "function") {
        logger.error(`[⚠️] ${methodName} không phải là hàm`);
        failedModules.push(methodName);
        return false;
      }

      const boundCandidate = fn(defaultFuncs, clientObject, ctx);
      const boundMethod = isPromiseLike(boundCandidate)
        ? await boundCandidate
        : boundCandidate;
      if (typeof boundMethod === "function") {
        methods.set(methodName, boundMethod);
        loadedCount++;
        return true;
      }

      if (bot && (bot as Record<string, any>)[methodName]) {
        methods.set(methodName, (bot as Record<string, any>)[methodName]);
        loadedCount++;
        return true;
      }

      failedModules.push(methodName);
      return false;
    } catch (e: any) {
      logger.error(`[❌] Lỗi khi nạp ${methodName}: ${e?.message || e}`);
      failedModules.push(methodName);
      return false;
    }
  };

  const loadFromDir = async (dir: string): Promise<void> => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const loadPromises: Promise<boolean>[] = [];

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const subEntries = await fs.readdir(fullPath, { withFileTypes: true });
          for (const subEntry of subEntries) {
            if (!subEntry.isDirectory() && isScriptFile(subEntry.name)) {
              const methodName = subEntry.name.replace(/\.(ts|js)$/i, "");

              if (SKIP_FILES.has(methodName)) {
                continue;
              }
              totalCount++;
              const methodPath = path.join(fullPath, subEntry.name);
              loadPromises.push(bindApiMethod(methodPath, methodName));
            }
          }
          continue;
        }

        if (!entry.isFile() || !isScriptFile(entry.name)) {
          continue;
        }

        const methodName = entry.name.replace(/\.(ts|js)$/i, "");

        if (SKIP_FILES.has(methodName)) {
          continue;
        }

        totalCount++;
        loadPromises.push(bindApiMethod(fullPath, methodName));
      }

      await Promise.all(loadPromises);
    } catch (e: any) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        throw e;
      }
      logger.system(`Thư mục API không tồn tại: ${dir}`);
    }
  };

  try {
    logger.system(`Bắt đầu nạp API từ: ${detailPath}`);
    await loadFromDir(detailPath);
    logger.system(`Hoàn tất nạp API - Thành công ${loadedCount}/${totalCount} phương thức${failedModules.length ? `, thất bại: ${failedModules.join(", ")}` : ""}`);

    return {
      loadedCount,
      totalCount,
      failedModules,
      methods
    };
  } catch (e: any) {
    logger.error(`Lỗi đọc thư mục lib: ${e?.message || e}`);
    throw e;
  }
}
