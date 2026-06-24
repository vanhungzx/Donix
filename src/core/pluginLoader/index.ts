import type { Command, MainData } from "@core/types";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import logger from "../logger";

interface PluginLoaderOptions {
  client: any;
  main: MainData;
  userData: any;
  threadData: any;
  config: any;
  logger?: typeof logger;
  utils?: Record<string, any>;

  reloadToken?: number;
}

interface LoadResult {
  loadedCount: number;
  loadedCategories?: Record<string, number>;
}

interface CommandModule {
  name: string;
  category?: string;
  setup?: { rule?: number };
  config?: {
    name: string;
    cooldowns?: number;
    hasPermission?: number;
    hasPermssion?: number;
    [key: string]: any;
  };
  onCall?: (ctx: any) => void | Promise<void>;
  onLoad?: (ctx: any) => void | Promise<void>;
  onEvent?: boolean | (() => void | Promise<void>);
  onChat?: boolean | (() => void | Promise<void>);
  [key: string]: any;
}

interface EventModule {
  name: string;
  type: string | string[];
  config?: {
    name: string;
    [key: string]: any;
  };
  onCall: (ctx: any) => void | Promise<void>;
  onLoad?: (ctx: any) => void | Promise<void>;
  [key: string]: any;
}

const isFunction = (target: unknown): target is (...args: any[]) => any => typeof target === "function";

const ensureMainShape = (main: MainData): void => {
  main.processData ??= new Map();
  main.cmds ??= new Map();
  main.events ??= new Map();
  main.cd ??= new Map();
  main.onReact ??= new Map();
  main.onReply ??= new Map();
  main.onEvent ??= [];
  main.onChat ??= [];
};

const ensureGlobalClient = (main: MainData): void => {
  const globalAny = global as typeof globalThis & { client?: Record<string, any> };
  if (!globalAny.client) {
    globalAny.client = {};
  }
  globalAny.client.commandMap = main.cmds;
  globalAny.client.eventMap = main.events;
  globalAny.client.reactionHandlers = globalAny.client.reactionHandlers ?? [];
  globalAny.client.replyHandlers = globalAny.client.replyHandlers ?? [];
};

const resolveLogger = (customLogger?: typeof logger) => customLogger ?? logger;

const createHookContext = (options: PluginLoaderOptions) => ({
  client: options.client,
  main: options.main,
  userData: options.userData,
  threadData: options.threadData,
  config: options.config,
  logger: resolveLogger(options.logger),
  utils: options.utils ?? {},
});

const callHookSafely = async (
  hook: ((ctx: any) => void | Promise<void>) | undefined,
  moduleName: string,
  hookType: string,
  options: PluginLoaderOptions,
) => {
  if (!isFunction(hook)) return;
  const activeLogger = resolveLogger(options.logger);
  try {

    const timeout = 30000;
    await Promise.race([
      hook(createHookContext(options)),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error(`Hook ${hookType} timeout after ${timeout}ms`)), timeout)
      ),
    ]);
  } catch (error: any) {
    activeLogger.error?.(`Error in ${hookType} for ${moduleName}: ${error?.message || error}`);
    if (error?.stack) {
      activeLogger.error?.(error.stack);
    }
  }
};

const handleCommandModule = async (
  modulePath: string,
  fileName: string,
  dir: string,
  options: PluginLoaderOptions,
  loadedCategories: Record<string, number>,
) => {
  const moduleUrl =
    pathToFileURL(modulePath).href + (options.reloadToken ? `?v=${options.reloadToken}` : "");
  const imported = await import(moduleUrl);
  const moduleExports = imported.default ?? imported;
  const cmdModule = moduleExports as CommandModule;

  const moduleName = cmdModule.name || path.parse(fileName).name;
  if (!moduleName) {
    throw new Error(`Invalid format in commands: ${fileName}`);
  }
  if (!cmdModule.onCall && !cmdModule.run && !cmdModule.Run && !cmdModule.Start && !cmdModule.start) {
    throw new Error(`Command "${moduleName}" is missing an onCall handler`);
  }

  const registry = options.main.cmds;
  if (registry.has(moduleName)) {
    resolveLogger(options.logger).warn?.(`Duplicate command name: ${moduleName} - skipping`);
    return;
  }

  const relativePath = path.relative(dir, modulePath);
  const pathParts = relativePath.split(path.sep).filter(Boolean);
  let category = cmdModule.category;
  if (!category && pathParts.length > 1) {
    category = pathParts[0];
    try {
      cmdModule.category = category;
    } catch {

    }
  }
  category = category ?? "";
  loadedCategories[category] = (loadedCategories[category] || 0) + 1;

  await callHookSafely(cmdModule.onLoad, moduleName, "onLoad", options);

  if (cmdModule.onEvent && !options.main.onEvent.includes(moduleName)) {
    options.main.onEvent.push(moduleName);
  }
  if (cmdModule.onChat && !options.main.onChat.includes(moduleName)) {
    options.main.onChat.push(moduleName);
  }

  // Normalize onChat and onEvent to match Command interface (functions only, not booleans)
  const normalizedModule: Command = {
    ...cmdModule,
    onChat: typeof cmdModule.onChat === "function" ? cmdModule.onChat : undefined,
    onEvent: typeof cmdModule.onEvent === "function" ? cmdModule.onEvent : undefined,
  };

  registry.set(moduleName, normalizedModule);
};

const handleEventModule = async (
  modulePath: string,
  fileName: string,
  options: PluginLoaderOptions,
) => {
  const moduleUrl =
    pathToFileURL(modulePath).href + (options.reloadToken ? `?v=${options.reloadToken}` : "");
  const imported = await import(moduleUrl);
  const moduleExports = imported.default ?? imported;
  const eventModule = moduleExports as EventModule;

  const moduleName = eventModule.name || path.parse(fileName).name;
  if (!moduleName || !isFunction(eventModule.onCall)) {
    throw new Error(`Invalid format in events: ${fileName}`);
  }

  const registry = options.main.events;
  if (registry.has(moduleName)) {
    resolveLogger(options.logger).warn?.(`Duplicate event name: ${moduleName} - skipping`);
    return;
  }

  await callHookSafely(eventModule.onLoad, moduleName, "onLoad", options);
  registry.set(moduleName, eventModule);
};

const loadModules = async (
  dir: string,
  _collection: "cmds" | "events",
  disabledList: string[],
  type: "commands" | "events",
  options: PluginLoaderOptions,
  onlySubFolders = false,
): Promise<LoadResult> => {
  let loadedCount = 0;
  const loadedCategories: Record<string, number> = {};
  const disabled = new Set(disabledList.map((item) => item.toLowerCase()));
  const activeLogger = resolveLogger(options.logger);

  const collectFiles = (currentPath: string, isRoot = true): string[] => {
    const files: string[] = [];
    try {
      if (!fs.existsSync(currentPath)) {
        return files;
      }
      const items = fs.readdirSync(currentPath);
      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        try {
          const stat = fs.statSync(itemPath);
          if (stat.isDirectory()) {
            files.push(...collectFiles(itemPath, false));
            continue;
          }

          const lowerName = item.toLowerCase();
          if (
            !(item.endsWith(".ts")) ||
            item.includes("example") ||
            disabled.has(lowerName) ||
            (onlySubFolders && isRoot)
          ) {
            continue;
          }
          files.push(itemPath);
        } catch (statError: any) {
          activeLogger.warn?.(`Cannot stat ${itemPath}: ${statError?.message || statError}`);
        }
      }
    } catch (error: any) {
      activeLogger.error?.(`Error scanning directory ${currentPath}: ${error?.message || error}`);
    }
    return files;
  };

  if (!fs.existsSync(dir)) {
    activeLogger.error?.(`Directory does not exist: ${dir}`);
    return { loadedCount: 0, loadedCategories: type === "commands" ? loadedCategories : undefined };
  }

  const files = collectFiles(dir);
  if (files.length === 0) {
    return { loadedCount: 0, loadedCategories: type === "commands" ? loadedCategories : undefined };
  }

  const CONCURRENCY_LIMIT = 10;
  let currentIndex = 0;

  const loadNextBatch = async (): Promise<void> => {
    while (currentIndex < files.length) {
      const batch = files.slice(currentIndex, currentIndex + CONCURRENCY_LIMIT);
      currentIndex += CONCURRENCY_LIMIT;

      const batchPromises = batch.map(async (filePath) => {
        const fileName = path.basename(filePath);
        try {
          if (type === "commands") {
            await handleCommandModule(filePath, fileName, dir, options, loadedCategories);
          } else {
            await handleEventModule(filePath, fileName, options);
          }
          loadedCount++;
        } catch (error: any) {
          activeLogger.error?.(`Failed to load ${type} ${fileName}: ${error?.message || error}`);
          if (error?.stack) {
            activeLogger.error?.(error.stack);
          }
        }
      });

      await Promise.all(batchPromises);
    }
  };

  await loadNextBatch();
  return { loadedCount, loadedCategories: type === "commands" ? loadedCategories : undefined };
};

export async function loadPlugins(options: PluginLoaderOptions): Promise<void> {
  const activeLogger = resolveLogger(options.logger);
  try {
    ensureMainShape(options.main);
    ensureGlobalClient(options.main);

    if (options.main.cmds?.clear) options.main.cmds.clear();
    if (options.main.events?.clear) options.main.events.clear();
    if (options.main.cd?.clear) options.main.cd.clear();
    if (options.main.onReact?.clear) options.main.onReact.clear();
    if (options.main.onReply?.clear) options.main.onReply.clear();
    options.main.onEvent.splice(0, options.main.onEvent.length);
    options.main.onChat.splice(0, options.main.onChat.length);

    if (!options.config?.loadSrcips?.enable) {
      activeLogger.info?.("Plugin loading is disabled via config.loadSrcips.enable");
      return;
    }

    const commandPath = path.join(process.cwd(), "src", "plugins", "cmds");
    const eventPath = path.join(process.cwd(), "src", "plugins", "events");
    const cmdDisabled = options.config.loadSrcips?.cmdDis || [];
    const eventDisabled = options.config.loadSrcips?.eventDis || [];

    const { loadedCount: loadedCommandsCount, loadedCategories } = await loadModules(
      commandPath,
      "cmds",
      cmdDisabled,
      "commands",
      options,
      true,
    );

    const { loadedCount: loadedEventsCount } = await loadModules(
      eventPath,
      "events",
      eventDisabled,
      "events",
      options,
      false,
    );

    const logSuccess = (message: string) => {
      if (activeLogger.success) activeLogger.success(message);
      else activeLogger.info?.(message);
    };

    logSuccess(`Đã tải: ${loadedCommandsCount} lệnh - ${loadedEventsCount} sự kiện`);
    if (loadedCategories && Object.keys(loadedCategories).length > 0) {
      const categoriesStr = Object.entries(loadedCategories)
        .map(([cat, count]) => `${cat || "uncategorized"}(${count})`)
        .join(", ");
      logSuccess(`Danh mục: ${categoriesStr}`);
    }

    if (options.config?.DevMode) {
      const onChatNames = options.main.onChat.map((item) => (typeof item === "string" ? item : "function")).join(", ");
      const onEventNames = options.main.onEvent.map((item) => (typeof item === "string" ? item : "function")).join(", ");
      activeLogger.info(`main.onChat: [${onChatNames}]`);
      activeLogger.info(`main.onEvent: [${onEventNames}]`);
    }
  } catch (error: any) {
    activeLogger.error?.(`Lỗi tải plugins: ${error?.message || error}`);
    if (error?.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}

export default loadPlugins;
