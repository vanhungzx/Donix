/**
 * nongtrai.js v2 — Thông báo Nông Trại (SSE), on/off/status
 * URL + key: main/config/config.json → nongtrai.apiBase, nongtrai.apiKey
 */

import fs from "fs-extra";
import path from "path";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { getConfig } from "../../../core/configManager";

interface NongtraiState {
  req: http.ClientRequest | null;
  activeThreads: string[];
  /** Messenger client (has sendMessage) — not the same as command context `api` (services map). */
  client: any;
}

const DATA_DIR = path.join(process.cwd(), "storage", "other");
const CONFIG_PATH = path.join(DATA_DIR, "nongtrai_data.json");
const LEGACY_PATH = path.join(DATA_DIR, "nongtrai_sse.json");

const STREAM_PATH = "/api/v1/ptgvn/nongtrai/stream";
const DEFAULT_API_BASE = "https://donixdev.com";
const RECONNECT_MS = 10_000;

function getNongtraiConfig() {
  const raw = getConfig()?.nongtrai;
  const obj = raw && typeof raw === "object" ? raw : {};
  const apiBase = (obj.apiBase || DEFAULT_API_BASE).replace(/\/$/, "");
  const apiKey = typeof obj.apiKey === "string" ? obj.apiKey : "";
  return { apiBase, apiKey };
}

function log(level: "INFO" | "WARN" | "ERROR", message: string): void {
  const now = new Date().toISOString();
  const line = `[${now}] [${level}] ${message}`;
  if (level === "ERROR") {
    console.error(line);
    return;
  }
  if (level === "WARN") {
    console.warn(line);
    return;
  }
  console.log(line);
}

function streamUrl() {
  const { apiBase } = getNongtraiConfig();
  return `${apiBase}${STREAM_PATH}`;
}

type SendMessageFn = (message: string, threadID: string, callback?: (err?: unknown) => void) => unknown;

function resolveSendMessage(apiLike: any): SendMessageFn | null {
  if (apiLike && typeof apiLike.sendMessage === "function") return apiLike.sendMessage.bind(apiLike);
  if (apiLike?.api && typeof apiLike.api.sendMessage === "function") return apiLike.api.sendMessage.bind(apiLike.api);
  if (apiLike?.client && typeof apiLike.client.sendMessage === "function") return apiLike.client.sendMessage.bind(apiLike.client);
  return null;
}

function sendToThread(apiLike: any, threadID: string, message: string): void {
  const sendMessage = resolveSendMessage(apiLike);
  if (!sendMessage) {
    log("ERROR", "[nongtrai] Không tìm thấy hàm sendMessage trong api/client");
    return;
  }
  try {
    sendMessage(message, threadID, (err?: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log("ERROR", `[nongtrai] gửi box ${threadID}: ${msg}`);
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", `[nongtrai] gửi box ${threadID}: ${msg}`);
  }
}

function getState(): NongtraiState {
  const g = global as typeof globalThis & {
    __nongtraiSSE?: NongtraiState;
    _nongtraiSetClient?: (loginClient: any) => void;
  };

  if (!g.__nongtraiSSE) {
    g.__nongtraiSSE = {
      req: null,
      activeThreads: [],
      client: null,
    };
  }
  return g.__nongtraiSSE;
}

async function saveConfig() {
  const st = getState();
  try {
    await fs.ensureDir(DATA_DIR);
    await fs.writeJson(CONFIG_PATH, st.activeThreads, { spaces: 2 });
  } catch (e) {
    const error = e as Error;
    log("ERROR", `[nongtrai] saveConfig: ${error.message}`);
  }
}

async function loadThreadsFromDisk() {
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
      log("INFO", `[nongtrai] migrated ${st.activeThreads.length} nhóm từ nongtrai_sse.json`);
      return;
    }
    st.activeThreads = [];
    await fs.writeJson(CONFIG_PATH, [], { spaces: 2 });
  } catch (e) {
    const error = e as Error;
    log("WARN", `[nongtrai] loadThreadsFromDisk: ${error.message}`);
    st.activeThreads = [];
  }
}

function connectNongtraiSse(
  apiUrl: string,
  apiKey: string,
  onData: (data: any) => void,
  onError?: (err: unknown) => void
) {
  const u = new URL(apiUrl);
  const lib = u.protocol === "https:" ? https : http;
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
  };
  if (apiKey) headers["x-api-key"] = apiKey;
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
        onError?.(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      res.setEncoding("utf8");
      let buf = "";
      res.on("data", (chunk) => {
        buf += chunk;
        let sep;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, sep).trimEnd();
          buf = buf.slice(sep + 2);
          if (block.startsWith(":")) continue;
          const dataLine = block.split("\n").find((line) => line.startsWith("data:"));
          if (!dataLine) continue;
          try {
            onData(JSON.parse(dataLine.slice(5).trim()));
          } catch (e) {
            if (onError) onError(e);
          }
        }
      });
      res.on("error", (e) => onError && onError(e));
      res.on("end", () => {
        if (onError) onError(new Error("Connection ended by server"));
      });
    }
  );
  req.on("error", (e) => onError && onError(e));
  req.end();
  return req;
}

function startSseStream(messenger: any) {
  const st = getState();
  if (messenger) st.client = messenger;
  const clientApi = st.client;
  if (!clientApi) return;
  if (st.req) return;

  const { apiKey } = getNongtraiConfig();
  const url = streamUrl();

  log("INFO", "[nongtrai] Bắt đầu kết nối SSE…");

  st.req = connectNongtraiSse(
    url,
    apiKey,
    (payload) => {
      if (payload.type === "heartbeat" || payload.type === "sse_connected") return;
      if (payload.type === "channel_update" && payload.notificationText) {
        const list = st.activeThreads;
        if (list.length === 0) return;
        for (const tid of list) {
          sendToThread(clientApi, tid, String(payload.notificationText));
        }
      }
    },
    (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      log("ERROR", `[nongtrai] SSE: ${msg}`);
      st.req = null;
      if (st.activeThreads.length > 0 && st.client) {
        log("INFO", `[nongtrai] Thử kết nối lại sau ${RECONNECT_MS / 1000}s…`);
        setTimeout(() => startSseStream(st.client), RECONNECT_MS);
      }
    }
  );
}

const command = {
  name: "nongtrai",
  alias: ["nt"],
  version: "2.0.0",
  role: 0,
  desc: "Nhận thông báo sự kiện nông trại (SSE)",
  guide: "{pn} on | {pn} off | {pn} status",
  cd: 5,
  prefix: true,

  onLoad: async () => {
    await loadThreadsFromDisk();
    const st = getState();
    const g = global as typeof globalThis & {
      _nongtraiSetClient?: (loginClient: any) => void;
    };
    g._nongtraiSetClient = (loginClient) => {
      st.client = loginClient;
      if (st.activeThreads.length > 0 && !st.req) {
        startSseStream(loginClient);
      }
    };
    log("INFO", `[nongtrai] loaded: ${st.activeThreads.length} box đang bật`);
  },

  onCall: async ({ client, event, args, reply }: any) => {
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
            return reply("Box này đang bật thông báo nông trại rồi.");
          }
          list.push(tid);
          await saveConfig();
          if (!st.req) startSseStream(client);
          return reply("✅ Đã BẬT thông báo nông trại cho box này.");
        }
        case "off": {
          const tid = String(threadID);
          if (!list.includes(tid)) {
            return reply("Box này vốn dĩ đã tắt thông báo rồi mày.");
          }
          st.activeThreads = list.filter((id) => id !== tid);
          await saveConfig();
          if (st.activeThreads.length === 0 && st.req) {
            try {
              st.req.destroy();
            } catch (_) {}
            st.req = null;
            log("INFO", "[nongtrai] Đã ngắt SSE (không còn box nào).");
          }
          return reply("❌ Đã TẮT thông báo nông trại cho box này.");
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
          return reply(statusMsg);
        }
        default:
          return reply("Sai cú pháp. Dùng: nongtrai on | nongtrai off | nongtrai status");
      }
    } catch (e) {
      const error = e as Error;
      log("ERROR", `[nongtrai] run: ${error.message}`);
      return reply("❌ Lỗi: " + (error.message || "không xác định"));
    }
  },
};

export default command;