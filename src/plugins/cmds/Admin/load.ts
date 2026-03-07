"use strict";

import type { BotConfig, BotEvent, Command, CommandOnCallContext, MainData } from '@types';
import { cleanupRequireCache } from "@utils/memory";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type MutableBotConfig = BotConfig & {
  loadSrcips: {
    enable?: boolean;
    cmdDis: string[];
    eventDis: string[];
  };
  configModule?: Record<string, Record<string, any>>;
  configValue?: Record<string, Record<string, any>>;
  [key: string]: any;
};

interface CommandFileEntry {
  folder: string;
  file: string;
  name: string;
  absPath: string;
}

interface EventFileEntry {
  file: string;
  name: string;
  absPath: string;
}

interface LoadCommandOptions {
  names: string[];
  api: any;
  userData: any;
  threadData: any;
  main: MainData;
  config: MutableBotConfig;
  logger: any;
  client: any;
  utils: any;
}

interface UnloadCommandOptions {
  names: string[];
  main: MainData;
  config: MutableBotConfig;
}

interface LoadEventOptions {
  names: string[];
  main: MainData;
  config: MutableBotConfig;
  logger: any;
  client: any;
}

interface UnloadEventOptions {
  names: string[];
  main: MainData;
  config: MutableBotConfig;
}

interface CommandLoadResult {
  loadedCount: number;
  loaded: Array<{ name: string; category: string }>;
  errorList: string[];
}

interface CommandUnloadResult {
  unloadedCount: number;
  unloaded: Array<{ name: string; category: string }>;
  errorList: string[];
}

interface EventLoadResult {
  loadedCount: number;
  loaded: Array<{ name: string }>;
  errorList: string[];
}

interface EventUnloadResult {
  unloadedCount: number;
  unloaded: Array<{ name: string }>;
  errorList: string[];
}

const CONFIG_FILE_PATH = path.resolve(process.cwd(), "src", "core", "config", "config.json");

const importVersionMap = new Map<string, number>();
const MAX_VERSION_MAP_SIZE = 500;

const BATCH_SIZE = 5;
const BATCH_DELAY = 50;

function cleanupVersionMap(): void {
  const rssMB = process.memoryUsage().rss / 1024 / 1024;
  const maxSize = rssMB > 250 ? 200 : MAX_VERSION_MAP_SIZE;

  if (importVersionMap.size > maxSize) {

    const entries = Array.from(importVersionMap.entries());
    const toDelete = entries.slice(0, Math.floor(entries.length * 0.6));
    toDelete.forEach(([path]) => importVersionMap.delete(path));
  }
}

function ensureConfigShape(config: MutableBotConfig): void {
  config.loadSrcips = config.loadSrcips || { enable: true, cmdDis: [], eventDis: [] };
  config.loadSrcips.cmdDis = Array.isArray(config.loadSrcips.cmdDis) ? [...config.loadSrcips.cmdDis] : [];
  config.loadSrcips.eventDis = Array.isArray(config.loadSrcips.eventDis) ? [...config.loadSrcips.eventDis] : [];
  config.configModule = config.configModule || {};
  config.configValue = config.configValue || {};
}

function readJsonConfig(): MutableBotConfig | null {
  try {
    if (!existsSync(CONFIG_FILE_PATH)) {
      return null;
    }
    const raw = readFileSync(CONFIG_FILE_PATH, "utf8");
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw) as MutableBotConfig;
    ensureConfigShape(parsed);
    return parsed;
  } catch (error) {
    console.error("Failed to read config file:", error);
    return null;
  }
}

function persistConfig(config: MutableBotConfig): void {
  try {
    const fileConfig = readJsonConfig() ?? { ...config };
    ensureConfigShape(fileConfig);
    ensureConfigShape(config);

    fileConfig.loadSrcips = fileConfig.loadSrcips || { enable: true, cmdDis: [], eventDis: [] };
    fileConfig.loadSrcips.enable = config.loadSrcips.enable ?? fileConfig.loadSrcips.enable ?? true;
    fileConfig.loadSrcips.cmdDis = Array.from(new Set(config.loadSrcips.cmdDis));
    fileConfig.loadSrcips.eventDis = Array.from(new Set(config.loadSrcips.eventDis));

    if (config.configModule) {
      fileConfig.configModule = config.configModule;
    }
    if (config.configValue) {
      fileConfig.configValue = config.configValue;
    }

    const replacer = (_key: string, value: any) => {
      if (value instanceof Map) {
        return Object.fromEntries(value);
      }
      if (value instanceof Set) {
        return Array.from(value);
      }
      return value;
    };

    writeFileSync(CONFIG_FILE_PATH, `${JSON.stringify(fileConfig, replacer, 2)}\n`, "utf8");

    Object.keys(fileConfig).forEach((key) => {
      if (key !== "loadSrcips" && key !== "configModule" && key !== "configValue") {
        delete (fileConfig as any)[key];
      }
    });
  } catch (error: any) {
    console.error("Failed to persist config:", error);
  }
}

function listAllCmdFiles(): CommandFileEntry[] {
  const root = path.join(process.cwd(), "src/plugins", "cmds");
  if (!existsSync(root)) return [];

  const results: CommandFileEntry[] = [];

  const processDirectory = (dir: string, folderName: string) => {
    const items = readdirSync(dir);
    for (const item of items) {
      const abs = path.join(dir, item);
      const stat = statSync(abs);
      if (stat.isDirectory()) {
        processDirectory(abs, folderName ? path.join(folderName, item) : item);
        continue;
      }

      if (!item.endsWith(".ts") && !item.endsWith(".js")) continue;

      const relativeFolder = folderName;
      results.push({
        folder: relativeFolder || "",
        file: item,
        name: item.replace(/\.(ts|js)$/i, ""),
        absPath: abs,
      });
    }
  };

  const entries = readdirSync(root);
  for (const entry of entries) {
    const abs = path.join(root, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      processDirectory(abs, entry);
    } else if (stat.isFile() && (entry.endsWith(".ts") || entry.endsWith(".js"))) {
      results.push({
        folder: "",
        file: entry,
        name: entry.replace(/\.(ts|js)$/i, ""),
        absPath: abs,
      });
    }
  }

  return results;
}

function isCommandDisabled(config: MutableBotConfig, entry: CommandFileEntry): boolean {
  const disabled = new Set(config.loadSrcips.cmdDis);
  return disabled.has(entry.file) || disabled.has(`${entry.name}.js`) || disabled.has(`${entry.name}.ts`);
}

function listAllEventFiles(): EventFileEntry[] {
  const root = path.join(process.cwd(), "src/plugins", "events");
  if (!existsSync(root)) return [];

  const files = readdirSync(root);
  return files
    .filter((file) => (file.endsWith(".ts") || file.endsWith(".js")) && !file.includes("example"))
    .map((file) => ({
      file,
      name: file.replace(/\.(ts|js)$/i, ""),
      absPath: path.join(root, file),
    }));
}

async function loadCommands({
  names,
  api,
  userData,
  threadData,
  main,
  config,
  logger,
  client,
  utils,
}: LoadCommandOptions): Promise<CommandLoadResult> {
  const errorList: string[] = [];
  const loaded: Array<{ name: string; category: string }> = [];
  let loadedCount = 0;
  ensureConfigShape(config);

  const all = listAllCmdFiles();

  const processModule = async (entry: CommandFileEntry) => {
    const { absPath, name: nameModule, folder } = entry;
    try {

      const version = (importVersionMap.get(absPath) || 0) + 1;
      importVersionMap.set(absPath, version);
      const fileUrl = pathToFileURL(absPath).href;
      const moduleUrl = `${fileUrl}?update=${version}`;
      const imported = await import(moduleUrl);
      const command: Command & Record<string, any> = imported.default || imported;

      const registeredName = (command?.name || nameModule) as string;

      if (typeof command?.onCall !== "function") {
        throw new Error("Invalid module format");
      }

      main.cmds.delete(nameModule);
      main.cmds.delete(registeredName);
      if (!Array.isArray(main.onEvent)) main.onEvent = [];
      if (!Array.isArray(main.onChat)) main.onChat = [];
      main.onEvent = main.onEvent.filter((i: any) => i !== nameModule && i !== registeredName);
      main.onChat = main.onChat.filter((i: any) => i !== nameModule && i !== registeredName);

      const category = folder ? folder.replace(/\\/g, "/").split("/")[0] : command.category || "";

      command.category = category || command.category;

      if (typeof command.onLoad === "function") {
        await command.onLoad({
          client,
          api,
          threadData,
          userData,
          utils,
          main,
          config,
          logger,
        });
      }

      if (command.onEvent) {
        const eventName = registeredName;
        if (!main.onEvent.includes(eventName)) {
          main.onEvent.push(eventName);
        }
      }

      if (command.onChat) {
        const chatName = registeredName;
        if (!main.onChat.includes(chatName)) {
          main.onChat.push(chatName);
        }
      }

      command.name = registeredName;
      main.cmds.set(registeredName, command);

      config.loadSrcips.cmdDis = config.loadSrcips.cmdDis.filter(
        (f) => f !== entry.file && f !== `${entry.name}.js` && f !== `${entry.name}.ts`
      );

      logger?.success?.(`Loaded command ${registeredName} from ${category || "root"}`);
      loadedCount++;
      loaded.push({ name: registeredName, category: category || "root" });
    } catch (error: any) {
      errorList.push(`- ${nameModule}: ${error?.message || error}`);
    }
  };

  let entriesToLoad: CommandFileEntry[];
  if (names.length > 0) {

    entriesToLoad = [];
    for (const moduleName of names) {
      const entry = all.find((e) => e.name === moduleName);
      if (entry) {
        entriesToLoad.push(entry);
      } else {
        errorList.push(`- ${moduleName}: not found`);
      }
    }
  } else {
    entriesToLoad = all.filter((entry) => !isCommandDisabled(config, entry));
  }

  for (let i = 0; i < entriesToLoad.length; i += BATCH_SIZE) {
    const batch = entriesToLoad.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((entry) => processModule(entry)));

    if (i + BATCH_SIZE < entriesToLoad.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
    }
  }

  config.loadSrcips.cmdDis = Array.from(new Set(config.loadSrcips.cmdDis));
  persistConfig(config);

  cleanupVersionMap();

  cleanupRequireCache();

  return { loadedCount, loaded, errorList };
}

async function unloadCommands({ names, main, config }: UnloadCommandOptions): Promise<CommandUnloadResult> {
  const errorList: string[] = [];
  const unloaded: Array<{ name: string; category: string }> = [];
  let unloadedCount = 0;
  ensureConfigShape(config);

  const all = listAllCmdFiles();

  const processUnload = (entry: CommandFileEntry) => {
    const { name: nameModule, folder, file, absPath } = entry;
    const category: string = folder ? (folder.replace(/\\/g, "/").split("/")[0] || "root") : "root";

    const cmd = main.cmds.get(nameModule);
    if (cmd) {

      if (typeof (cmd as any).onUnload === "function") {
        try {
          (cmd as any).onUnload();
        } catch (e) {

        }
      }
      main.cmds.delete(nameModule);
    }

    if (Array.isArray(main.onEvent)) {
      main.onEvent = main.onEvent.filter((i: any) => i !== nameModule);
    }
    if (Array.isArray(main.onChat)) {
      main.onChat = main.onChat.filter((i: any) => i !== nameModule);
    }

    importVersionMap.delete(absPath);

    config.loadSrcips.cmdDis = config.loadSrcips.cmdDis.filter(
      (f) => f !== file && f !== `${nameModule}.js` && f !== `${nameModule}.ts`
    );
    config.loadSrcips.cmdDis.push(file);

    unloadedCount++;
    unloaded.push({ name: nameModule, category });
  };

  if (names.length > 0) {
    for (const moduleName of names) {
      const hit = all.find((entry) => entry.name === moduleName);
      if (!hit) {
        errorList.push(`- ${moduleName}: not found`);
        continue;
      }
      processUnload(hit);
    }
  } else {
    for (const entry of all) {
      processUnload(entry);
    }
  }

  config.loadSrcips.cmdDis = Array.from(new Set(config.loadSrcips.cmdDis));
  persistConfig(config);

  cleanupRequireCache();

  return { unloadedCount, unloaded, errorList };
}

async function loadEvents({ names, main, config, logger, client }: LoadEventOptions): Promise<EventLoadResult> {
  const errorList: string[] = [];
  const loaded: Array<{ name: string }> = [];
  let loadedCount = 0;
  ensureConfigShape(config);

  config.configModule = config.configModule || {};
  config.configValue = config.configValue || {};

  const all = listAllEventFiles();

  const processEvent = async (entry: EventFileEntry) => {
    const { absPath, name: nameModule, file } = entry;
    try {

      const version = (importVersionMap.get(absPath) || 0) + 1;
      importVersionMap.set(absPath, version);
      const fileUrl = pathToFileURL(absPath).href;
      const moduleUrl = `${fileUrl}?update=${version}`;
      const imported = await import(moduleUrl);
      const eventModule: Record<string, any> = imported.default || imported;

      const registeredName = (eventModule?.name || nameModule) as string;

      if (!eventModule?.type || typeof eventModule?.onCall !== "function") {
        throw new Error("Invalid event format");
      }

      main.events.delete(nameModule);
      main.events.delete(registeredName);

      if (typeof eventModule.onLoad === "function") {
        await eventModule.onLoad({ client, config });
      }

      main.events.set(registeredName, eventModule as BotEvent);

      config.loadSrcips.eventDis = config.loadSrcips.eventDis.filter(
        (f) => f !== file && f !== `${entry.name}.js` && f !== `${entry.name}.ts`
      );

      logger?.log?.(`Loaded event ${registeredName}`, "LOADED");
      loadedCount++;
      loaded.push({ name: registeredName });
    } catch (error: any) {
      errorList.push(`- ${nameModule}: ${error?.message || error}`);
    }
  };

  let entriesToLoad: EventFileEntry[];
  if (names.length > 0) {

    entriesToLoad = [];
    for (const moduleName of names) {
      const entry = all.find((e) => e.name === moduleName);
      if (entry) {
        entriesToLoad.push(entry);
      } else {
        errorList.push(`- ${moduleName}: not found`);
      }
    }
  } else {
    entriesToLoad = all.filter((entry) => !config.loadSrcips.eventDis.includes(entry.file));
  }

  for (let i = 0; i < entriesToLoad.length; i += BATCH_SIZE) {
    const batch = entriesToLoad.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((entry) => processEvent(entry)));

    if (i + BATCH_SIZE < entriesToLoad.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
    }
  }

  config.loadSrcips.eventDis = Array.from(new Set(config.loadSrcips.eventDis));
  persistConfig(config);

  cleanupVersionMap();

  cleanupRequireCache();

  return { loadedCount, loaded, errorList };
}

async function unloadEvents({ names, main, config }: UnloadEventOptions): Promise<EventUnloadResult> {
  const errorList: string[] = [];
  const unloaded: Array<{ name: string }> = [];
  let unloadedCount = 0;
  ensureConfigShape(config);

  const all = listAllEventFiles();

  const processUnload = (entry: EventFileEntry) => {
    const { name: nameModule, file, absPath } = entry;

    const event = main.events.get(nameModule);
    if (event) {

      if (typeof (event as any).onUnload === "function") {
        try {
          (event as any).onUnload();
        } catch (e) {

        }
      }
      main.events.delete(nameModule);
    }

    importVersionMap.delete(absPath);

    config.loadSrcips.eventDis = config.loadSrcips.eventDis.filter(
      (f) => f !== file && f !== `${nameModule}.js` && f !== `${nameModule}.ts`
    );
    config.loadSrcips.eventDis.push(file);

    unloadedCount++;
    unloaded.push({ name: nameModule });
  };

  if (names.length > 0) {
    for (const moduleName of names) {
      const hit = all.find((entry) => entry.name === moduleName);
      if (!hit) {
        errorList.push(`- ${moduleName}: not found`);
        continue;
      }
      processUnload(hit);
    }
  } else {
    for (const entry of all) processUnload(entry);
  }

  config.loadSrcips.eventDis = Array.from(new Set(config.loadSrcips.eventDis));
  persistConfig(config);

  cleanupRequireCache();

  return { unloadedCount, unloaded, errorList };
}

const loadCommand: Command = {
  name: "load",
  alias: ["load"],
  version: "1.2.0",
  role: 3,
  desc: "Load/unload commands or events",
  guide: `
• {pn} <name>
• {pn} all
• {pn} un <name>
• {pn} unall
• {pn} event <name>
• {pn} event all
• {pn} event un <name>
• {pn} event unall`,
  cd: 2,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { args, reply, main, config, logger, client, api, userData, threadData, utils } = ctx;

    const send = (message: string) => {
      reply({ body: message });
    };

    if (!args.length) {
      send("Ví dụ: load admin | load un admin | load all | load unall | load event join | load event un join");
      return;
    }

    const isEvent = ["event", "evt"].includes(String(args[0]).toLowerCase());
    const sub = (isEvent ? args[1] : args[0])?.toLowerCase() ?? "";
    const list = isEvent ? args.slice(2) : args.slice(1);

    if (!isEvent) {
      if (sub === "all") {
        const { loadedCount, errorList } = await loadCommands({
          names: [],
          userData,
          api,
          threadData,
          main,
          config: config as MutableBotConfig,
          logger,
          client,
          utils,
        });

        if (errorList.length) {
          send(`❎ Lỗi khi load lệnh:\n${errorList.join("\n")}`);
          return;
        }
        send(`☑️ Đã tải ${loadedCount} lệnh`);
        return;
      }

      if (sub === "unall") {
        const { unloadedCount, errorList } = await unloadCommands({
          names: [],
          main,
          config: config as MutableBotConfig,
        });

        if (errorList.length) {
          send(`❎ Lỗi khi hủy lệnh:\n${errorList.join("\n")}`);
          return;
        }
        send(`✅ Đã hủy tải ${unloadedCount} lệnh`);
        return;
      }

      if (sub === "un") {
        if (!list.length) {
          send("Thiếu tên lệnh cần hủy");
          return;
        }

        const { unloadedCount, unloaded, errorList } = await unloadCommands({
          names: list,
          main,
          config: config as MutableBotConfig,
        });

        if (errorList.length) {
          send(`❎ Lỗi khi hủy lệnh:\n${errorList.join("\n")}`);
          return;
        }
        send(`✅ Đã hủy ${unloadedCount} lệnh:${unloaded.map((i) => `\n- ${i.name} (${i.category})`).join("")}`);
        return;
      }

      const names = args.filter(Boolean);

      const { loadedCount, loaded, errorList } = await loadCommands({
        names,
        userData,
        api,
        threadData,
        main,
        config: config as MutableBotConfig,
        logger,
        client,
        utils,
      });

      if (errorList.length) {
        send(`❎ Lỗi khi load lệnh:\n${errorList.join("\n")}`);
        return;
      }
      send(`☑️ Đã tải ${loadedCount} lệnh:${loaded.map((i) => `\n- ${i.name} (${i.category})`).join("")}`);
      return;
    }

    if (sub === "all") {
      const { loadedCount, errorList } = await loadEvents({
        names: [],
        main,
        config: config as MutableBotConfig,
        logger,
        client,
      });

      if (errorList.length) {
        send(`❎ Lỗi khi load sự kiện:\n${errorList.join("\n")}`);
        return;
      }
      send(`☑️ Đã tải ${loadedCount} sự kiện`);
      return;
    }

    if (sub === "unall") {
      const { unloadedCount, errorList } = await unloadEvents({
        names: [],
        main,
        config: config as MutableBotConfig,
      });

      if (errorList.length) {
        send(`❎ Lỗi khi hủy sự kiện:\n${errorList.join("\n")}`);
        return;
      }
      send(`✅ Đã hủy tải ${unloadedCount} sự kiện`);
      return;
    }

    if (sub === "un") {
      if (!list.length) {
        send("Thiếu tên sự kiện cần hủy");
        return;
      }

      const { unloadedCount, unloaded, errorList } = await unloadEvents({
        names: list,
        main,
        config: config as MutableBotConfig,
      });

      if (errorList.length) {
        send(`❎ Lỗi khi hủy sự kiện:\n${errorList.join("\n")}`);
        return;
      }
      send(`✅ Đã hủy ${unloadedCount} sự kiện:${unloaded.map((i) => `\n- ${i.name}`).join("")}`);
      return;
    }

    const eventNames = args.slice(1);
    if (!eventNames.length) {
      send("Thiếu tên sự kiện cần load");
      return;
    }

    const { loadedCount, loaded, errorList } = await loadEvents({
      names: eventNames,
      main,
      config: config as MutableBotConfig,
      logger,
      client,
    });

    if (errorList.length) {
      send(`❎ Lỗi khi load sự kiện:\n${errorList.join("\n")}`);
      return;
    }
    send(`☑️ Đã tải ${loadedCount} sự kiện:${loaded.map((i) => `\n- ${i.name}`).join("")}`);
    return;
  },
};

export default loadCommand;
