/**
 * nongtrai v2 — Thông báo Nông Trại (SSE), on/off/status
 * URL + key: config.json → nongtrai.apiBase, nongtrai.apiKey
 */

import type { Command, CommandOnCallContext, CommandOnLoadContext } from "@types";
import fs from "fs-extra";
import path from "path";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { getConfig } from "../../../core/configManager";
import log from "../../../utils/log";

const DATA_DIR = path.join(process.cwd(), "storage", "other");
const CONFIG_PATH = path.join(DATA_DIR, "nongtrai_data.json");
const LEGACY_PATH = path.join(DATA_DIR, "nongtrai_sse.json");

const STREAM_PATH = "/api/v1/ptgvn/nongtrai/stream";
const DEFAULT_API_BASE = "https://donixdev.com";
const RECONNECT_MS = 10_000;
const SSE_SOCKET_TIMEOUT_MS = 90_000;
const SSE_IDLE_TIMEOUT_MS = 70_000;

type SendMessageFn = (message: string, threadID: string, callback?: (err?: unknown) => void) => unknown;

interface NongtraiState {
  req: http.ClientRequest | null;
  reconnectTimer: NodeJS.Timeout | null;
  activeThreads: string[];
  client: any;
}

function getNongtraiConfig() {
  const raw = getConfig()?.nongtrai;
  const obj = raw && typeof raw === "object" ? raw : ({} as Record<string, unknown>);
  const apiBase = String((obj as { apiBase?: string }).apiBase || DEFAULT_API_BASE).replace(/\/$/, "");
  const apiKey =
    typeof (obj as { apiKey?: string }).apiKey === "string" ? (obj as { apiKey: string }).apiKey : "";
  return { apiBase, apiKey };
}

function streamUrl() {
  const { apiBase } = getNongtraiConfig();
  return `${apiBase}${STREAM_PATH}`;
}

function resolveSendMessage(apiLike: any): SendMessageFn | null {
  if (apiLike && typeof apiLike.sendMessage === "function") return apiLike.sendMessage.bind(apiLike);
  if (apiLike?.api && typeof apiLike.api.sendMessage === "function")
    return apiLike.api.sendMessage.bind(apiLike.api);
  if (apiLike?.client && typeof apiLike.client.sendMessage === "function")
    return apiLike.client.sendMessage.bind(apiLike.client);
  return null;
}

function sendToThread(apiLike: any, threadID: string, message: string): void {
  const sendMessage = resolveSendMessage(apiLike);
  if (!sendMessage) {
    log.error("[nongtrai] Không tìm thấy hàm sendMessage trong api/client");
    return;
  }
  try {
    const out = sendMessage(message, threadID, (err?: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`[nongtrai] gửi box ${threadID}: ${msg}`);
      }
    });
    if (out && typeof (out as Promise<unknown>).catch === "function") {
      (out as Promise<unknown>).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        log.error(`[nongtrai] gửi box ${threadID}: ${msg}`);
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`[nongtrai] gửi box ${threadID}: ${msg}`);
  }
}

function getState(): NongtraiState {
  const g = global as typeof globalThis & {
    __nongtraiSSE?: NongtraiState;
    _nongtraiSetClient?: (loginClient: any) => void;
    _nongtraiSetApi?: (loginClient: any) => void;
  };

  if (!g.__nongtraiSSE) {
    g.__nongtraiSSE = {
      req: null,
      reconnectTimer: null,
      activeThreads: [],
      client: null,
    };
  }
  return g.__nongtraiSSE;
}

function clearReconnectTimer(st = getState()): void {
  if (st.reconnectTimer) {
    clearTimeout(st.reconnectTimer);
    st.reconnectTimer = null;
  }
}

function scheduleReconnect(st = getState()): void {
  if (st.reconnectTimer || st.activeThreads.length === 0 || !st.client) {
    return;
  }
  log.info(`[nongtrai] Thử kết nối lại sau ${RECONNECT_MS / 1000}s…`);
  st.reconnectTimer = setTimeout(() => {
    st.reconnectTimer = null;
    startSseStream(st.client);
  }, RECONNECT_MS);
  if (st.reconnectTimer && typeof st.reconnectTimer.unref === "function") {
    st.reconnectTimer.unref();
  }
}

async function saveConfig(): Promise<void> {
  const st = getState();
  try {
    await fs.ensureDir(DATA_DIR);
    await fs.writeJson(CONFIG_PATH, st.activeThreads, { spaces: 2 });
  } catch (e) {
    const err = e as Error;
    log.error(`[nongtrai] saveConfig: ${err.message}`);
  }
}

async function loadThreadsFromDisk(): Promise<void> {
  const st = getState();
  try {
    await fs.ensureDir(DATA_DIR);
    if (await fs.pathExists(CONFIG_PATH)) {
      const data = await fs.readJson(CONFIG_PATH);
      st.activeThreads = Array.isArray(data) ? data.map(String) : [];
      return;
    }
    if (await fs.pathExists(LEGACY_PATH)) {
      const legacy = await fs.readJson(LEGACY_PATH);
      const enabled = legacy?.enabled && typeof legacy.enabled === "object" ? legacy.enabled : {};
      st.activeThreads = Object.entries(enabled)
        .filter(([, v]) => v === true)
        .map(([k]) => String(k));
      await saveConfig();
      log.info(`[nongtrai] migrated ${st.activeThreads.length} nhóm từ nongtrai_sse.json`);
      return;
    }
    st.activeThreads = [];
    await fs.writeJson(CONFIG_PATH, [], { spaces: 2 });
  } catch (e) {
    const err = e as Error;
    log.warn(`[nongtrai] loadThreadsFromDisk: ${err.message}`);
    st.activeThreads = [];
  }
}

function connectNongtraiSse(
  apiUrl: string,
  apiKey: string,
  onData: (data: unknown) => void,
  onError?: (err: Error) => void
): http.ClientRequest {
  const u = new URL(apiUrl);
  const lib = u.protocol === "https:" ? https : http;
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
  };
  if (apiKey) headers["x-api-key"] = apiKey;
  let settled = false;
  let idleTimer: NodeJS.Timeout | null = null;

  const clearIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const emitErrorOnce = (error: unknown) => {
    if (settled) {
      return;
    }
    settled = true;
    clearIdleTimer();
    if (onError) {
      onError(error instanceof Error ? error : new Error(String(error || "unknown")));
    }
  };

  const req = lib.request(
    {
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: `${u.pathname}${u.search}`,
      method: "GET",
      headers,
    },
    (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        emitErrorOnce(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const resetIdleTimer = () => {
        clearIdleTimer();
        idleTimer = setTimeout(() => {
          emitErrorOnce(new Error(`SSE idle timeout after ${SSE_IDLE_TIMEOUT_MS}ms`));
          try {
            req.destroy();
          } catch {
            /* empty */
          }
        }, SSE_IDLE_TIMEOUT_MS);
        if (idleTimer && typeof idleTimer.unref === "function") {
          idleTimer.unref();
        }
      };
      res.setEncoding("utf8");
      let buf = "";
      resetIdleTimer();
      res.on("data", (chunk) => {
        resetIdleTimer();
        buf += chunk;
        let sep: number;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, sep).trimEnd();
          buf = buf.slice(sep + 2);
          if (block.startsWith(":")) continue;

          const dataLine = block.split("\n").find((line) => line.startsWith("data:"));
          if (!dataLine) continue;

          try {
            onData(JSON.parse(dataLine.slice(5).trim()));
          } catch (e) {
            emitErrorOnce(e);
            return;
          }
        }
      });
      res.on("error", (e) => emitErrorOnce(e));
      res.on("end", () => {
        emitErrorOnce(new Error("Connection ended by server"));
      });
      res.on("close", () => {
        emitErrorOnce(new Error("SSE socket closed"));
      });
    }
  );

  req.setTimeout(SSE_SOCKET_TIMEOUT_MS);
  req.on("timeout", () => {
    emitErrorOnce(new Error(`SSE socket timeout after ${SSE_SOCKET_TIMEOUT_MS}ms`));
    try {
      req.destroy();
    } catch {
      /* empty */
    }
  });
  req.on("error", (e) => emitErrorOnce(e));
  req.on("close", () => {
    emitErrorOnce(new Error("SSE request closed"));
  });

  req.end();
  return req;
}

function startSseStream(messenger: any): void {
  const st = getState();
  if (messenger) st.client = messenger;
  const clientApi = st.client;
  if (!clientApi) return;
  if (st.req) return;
  clearReconnectTimer(st);

  const { apiKey } = getNongtraiConfig();
  const url = streamUrl();

  log.info("[nongtrai] Bắt đầu kết nối SSE…");

  let activeReq: http.ClientRequest | null = null;
  activeReq = connectNongtraiSse(
    url,
    apiKey,
    (payload: any) => {
      if (payload.type === "heartbeat" || payload.type === "sse_connected") return;

      if (payload.type === "channel_update" && payload.notificationText) {
        const list = st.activeThreads;
        if (list.length === 0) return;
        const c = st.client;
        if (!c) {
          return;
        }

        for (const tid of list) {
          sendToThread(c, String(tid), String(payload.notificationText));
        }
      }
    },
    (err) => {
      if (st.req && st.req !== activeReq) {
        return;
      }
      log.error(`[nongtrai] SSE: ${err?.message || err}`);
      st.req = null;
      scheduleReconnect(st);
    }
  );
  st.req = activeReq;
}

function installLoginHook(): void {
  const g = global as typeof globalThis & {
    _nongtraiSetClient?: (loginClient: any) => void;
    _nongtraiSetApi?: (loginClient: any) => void;
  };
  const setter = (loginClient: any) => {
    const st = getState();
    st.client = loginClient;
    if (st.activeThreads.length > 0 && !st.req) {
      startSseStream(loginClient);
    }
  };
  g._nongtraiSetClient = setter;
  g._nongtraiSetApi = setter;
}

const nongtraiCommand: Command = {
  name: "nongtrai",
  alias: ["nt"],
  version: "2.0.0",
  role: 0,
  desc: "Nhận thông báo sự kiện nông trại (SSE)",
  guide: "{pn} on | {pn} off | {pn} status",
  cd: 5,
  prefix: true,

  onLoad: async (ctx: CommandOnLoadContext) => {
    const { client } = ctx;
    await loadThreadsFromDisk();
    const st = getState();
    st.client = client;
    installLoginHook();
    if (st.activeThreads.length > 0 && !st.req) {
      startSseStream(client);
    }
    log.info(`[nongtrai] loaded: ${st.activeThreads.length} box đang bật`);
  },

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { client, event, args, reply } = ctx;
    const { threadID } = event;
    const action = args[0] ? String(args[0]).toLowerCase() : "";
    const st = getState();
    st.client = client;
    const list = st.activeThreads;

    try {
      switch (action) {
        case "on": {
          const tid = String(threadID);
          if (list.includes(tid)) {
            await reply("Box này đang bật thông báo nông trại rồi.");
            return;
          }
          list.push(tid);
          await saveConfig();
          if (!st.req) startSseStream(client);
          await reply("✅ Đã BẬT thông báo nông trại cho box này.");
          return;
        }
        case "off": {
          const tid = String(threadID);
          if (!list.includes(tid)) {
            await reply("Box này vốn dĩ đã tắt thông báo rồi mày.");
            return;
          }
          st.activeThreads = list.filter((id) => id !== tid);
          await saveConfig();

          if (st.activeThreads.length === 0) {
            clearReconnectTimer(st);
            if (st.req) {
              try {
                st.req.destroy();
              } catch {
                /* empty */
              }
              st.req = null;
            }
            log.info("[nongtrai] Đã ngắt SSE (không còn box nào).");
          }
          await reply("❌ Đã TẮT thông báo nông trại cho box này.");
          return;
        }
        case "status": {
          const tid = String(threadID);
          const isSubbed = list.includes(tid);
          const isRunning = !!st.req;
          const statusMsg =
            `📊 TRẠNG THÁI NÔNG TRẠI\n` +
            `- Box này: ${isSubbed ? "Đang nhận (ON) 🟢" : "Đã tắt (OFF) 🔴"}\n` +
            `- Luồng SSE toàn cục: ${isRunning ? "Đang chạy 🟢" : "Ngắt kết nối 🔴"}\n` +
            `- Tổng số box đang bật: ${list.length}`;
          await reply(statusMsg);
          return;
        }
        default:
          await reply("Sai cú pháp. Dùng: nongtrai on | nongtrai off | nongtrai status");
      }
    } catch (e) {
      const err = e as Error;
      log.error(`[nongtrai] onCall: ${err.message}`);
      await reply("❌ Lỗi: " + (err.message || "không xác định"));
    }
  },
};

export default nongtraiCommand;