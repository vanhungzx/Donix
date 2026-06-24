import log from "@log";
import { generateOfflineThreadingID } from "../../request/formatters/index";
import type { Context, DefaultFuncs } from "../../request/formatters/helpers";

interface ExtendedError extends Error {
  code?: string;
  permanent?: boolean;
  retryable?: boolean;
}

export interface MusicStickerPayload {
  song_id: string;
  start_time?: string;
  song_title?: string;
  song_subtitle?: string;
  is_explicit?: boolean;
}

interface SendMusicStickerResult {
  body: null;
  messageID: string;
  threadID: string;
}

type SendMusicStickerCallback = (err: Error | null, data?: SendMusicStickerResult) => void;

const CONSTANTS = {
  MQTT_TOPIC: "/ls_req",
  MQTT_QOS: 1,
  SYNC_GROUP: 1,
  SEND_TYPES: {
    STICKER: 2
  }
};

const SEND = {
  APP_ID_POOL: ["772021112871879", "2220391788200892"],
  VERSION_POOL: [
    "25150404991310813",
    "32181477484799631",
    "9723306621127838",
    "24728819436812368",
    "24804310205905615",
    "31104338375848389"
  ]
};

const r = <T>(a: T[]): T => a[(Math.random() * a.length) | 0]!;

const trace = (): string => {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "#";
  for (let i = 0; i < 22; i++) out += c[(Math.random() * c.length) | 0]!;
  return out;
};

const navigationTimestamp = (): number => Date.now() / 1000;
const formatNavigationTs = (ts: number): string => ts.toFixed(3);

/** Navigation chain shaped like Messenger music picker → thread (matches client telemetry style). */
const buildMusicStickerNavigationChain = (): string => {
  const nowTs = navigationTimestamp();
  const threadTs = nowTs - 0.01;
  const safe = (ts: number): string => formatNavigationTs(Math.max(ts, 0));
  const sessionId = 20000000 + Math.floor(Math.random() * 10000000);
  return `MusicPickerBottomSheetFragment,dialog,,${safe(nowTs)},${sessionId},,,${safe(nowTs)};,e2ee_keyboard_popup,tap_composer_list_item,${safe(nowTs - 0.1)},,,,,${safe(nowTs - 0.1)};,thread_open:group,tap_conversation_thread,${safe(threadTs)},,,,,${safe(nowTs)};MainActivity,tab_INBOX,foreground,${safe(nowTs - 1)},${sessionId},,,,,${safe(nowTs - 1)}`;
};

const toNum = (x: string | number): string | number => {
  const s = String(x);
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n)) return n;
  }
  return s;
};

const mqttOk = (ctx: Context): boolean => {
  try {
    const c = (ctx as { mqttClient?: { connected?: boolean; reconnecting?: boolean; disconnecting?: boolean; disconnected?: boolean } }).mqttClient;
    return !!(
      c &&
      c.connected &&
      (ctx as { mqttReady?: boolean }).mqttReady === true &&
      !c.reconnecting &&
      !c.disconnecting &&
      !c.disconnected
    );
  } catch {
    return false;
  }
};

const safePublish = (
  mqttClient: any,
  topic: string,
  message: string,
  options: { qos: number; retain: boolean },
  callback?: (err?: Error) => void
): boolean => {
  if (!mqttClient) {
    if (callback) callback(new Error("MQTT client is not available"));
    return false;
  }
  try {
    const isConnected = mqttClient.connected === true;
    const isDisconnecting = mqttClient.disconnecting === true;
    const isDisconnected = mqttClient.disconnected === true;
    const isReady = mqttClient._donixReady === true;
    const readyState = mqttClient.readyState;
    const isClosing = readyState === 2;
    const isClosed = readyState === 3;
    if (!isConnected || !isReady || isDisconnecting || isDisconnected || isClosing || isClosed) {
      if (callback) callback(new Error("MQTT client is not connected or is closing"));
      return false;
    }
    try {
      mqttClient.publish(topic, message, options, callback);
      return true;
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      if (callback) callback(e);
      return false;
    }
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    if (callback) callback(e);
    return false;
  }
};

const parseResponseStep = (step: unknown, sentOtid: string): { messageID: string } => {
  let messageID: string | null = null;
  const walk = (x: unknown, d: number): void => {
    if (d > 15 || x == null) return;
    if (Array.isArray(x)) {
      if (
        x.length >= 4 &&
        x[0] === 5 &&
        (x[1] === "replaceOptimisticMessage" || x[1] === "replaceOptimsiticMessage") &&
        typeof x[2] === "string" &&
        typeof x[3] === "string"
      ) {
        messageID = x[2];
      }
      for (const it of x) walk(it, d + 1);
    } else if (typeof x === "object") {
      for (const k in x as object) walk((x as Record<string, unknown>)[k], d + 1);
    }
  };
  walk(step, 0);
  return { messageID: messageID || sentOtid };
};

const extractStepError = (step: unknown): ExtendedError | null => {
  let msg: string | null = null;
  let code: string | null = null;
  const walk = (x: unknown, d: number): void => {
    if (d > 20 || x == null) return;
    if (Array.isArray(x)) {
      for (let i = 0; i < x.length; i++) {
        const v = x[i];
        if (v === "markOptimisticMessageFailed" && typeof x[i + 2] === "string") msg = x[i + 2];
        if (v === "updateSubscriptErrorMessage" && typeof x[i + 3] === "string") msg = x[i + 3];
        if (v === "Write error response from server") code = "SERVER_WRITE_ERROR";
        walk(v, d + 1);
      }
    } else if (typeof x === "object") {
      for (const k in x as object) walk((x as Record<string, unknown>)[k], d + 1);
    }
  };
  walk(step, 0);
  if (msg || code) {
    const e: ExtendedError = new Error(msg || code || "STEP_ERROR");
    e.code = code || "STEP_ERROR";
    if (/Không gửi được|Không thể gửi|Thiếu quyền|permission|forbidden/i.test(String(msg || ""))) {
      e.permanent = true;
    }
    return e;
  }
  return null;
};

const TIMEOUT_MS = 30000;

const publishOnce = (
  ctx: Context,
  messagePayload: Record<string, unknown>,
  sentOtid: string,
  threadID: string | number,
  appId: string,
  versionId: string,
  callback: SendMusicStickerCallback | null
): Promise<SendMusicStickerResult> =>
  new Promise((resolve, reject) => {
    if (!mqttOk(ctx)) {
      const e: ExtendedError = new Error("MQTT client is not healthy");
      e.retryable = true;
      const anyCtx = ctx as { _triggerReconnect?: () => void };
      if (typeof anyCtx._triggerReconnect === "function") anyCtx._triggerReconnect();
      return reject(e);
    }
    const anyCtx = ctx as { mqttClient?: { on: (ev: string, fn: (topic: string, message: Buffer) => void) => void; removeListener: (ev: string, fn: (topic: string, message: Buffer) => void) => void }; wsReqNumber?: number; wsTaskNumber?: number };
    const requestId = (anyCtx.wsReqNumber = (anyCtx.wsReqNumber || 0) + 1);
    const taskId = (anyCtx.wsTaskNumber = (anyCtx.wsTaskNumber || 0) + 1);
    const tasks = [
      {
        context: {
          trace_id: (Math.floor(Math.random() * 0xffffffff) | 0) - 0x7fffffff,
          trace_type: 0
        },
        data_trace_id: trace(),
        failure_count: null as null,
        label: "46",
        payload: JSON.stringify(messagePayload),
        queue_name: String(threadID),
        task_id: String(taskId)
      }
    ];
    const content = {
      app_id: appId,
      payload: JSON.stringify({
        epoch_id: generateOfflineThreadingID(),
        tasks,
        version_id: versionId,
        data_trace_id: trace()
      }),
      request_id: requestId,
      type: 3
    };
    let to: NodeJS.Timeout | null = null;
    let messageHandler: ((topic: string, message: Buffer) => void) | null = null;
    let fallbackMid: string | null = null;

    const onMessage = (topic: string, message: Buffer): void => {
      if (topic !== "/ls_resp") return;
      try {
        let json: { request_id?: unknown; payload?: unknown };
        try {
          json = JSON.parse(message.toString("utf8")) as { request_id?: unknown; payload?: unknown };
        } catch {
          return;
        }
        const reqId = json.request_id;
        if (reqId == null || String(reqId) !== String(requestId)) return;
        const payload = json.payload;
        if (typeof payload === "string" && payload.length > 0) {
          const midMatch = payload.match(/mid\.\$[A-Za-z0-9._-]+/);
          if (midMatch?.[0]) fallbackMid = midMatch[0];
          const firstChar = payload.trim()[0];
          if (firstChar === "{" || firstChar === "[") {
            try {
              json.payload = JSON.parse(payload);
            } catch {
              /* keep string */
            }
          }
        }
        if (to) {
          clearTimeout(to);
          to = null;
        }
        if (messageHandler && anyCtx.mqttClient) {
          anyCtx.mqttClient.removeListener("message", messageHandler);
          messageHandler = null;
        }
        const step =
          json.payload &&
          typeof json.payload === "object" &&
          json.payload !== null &&
          "step" in json.payload
            ? (json.payload as { step?: unknown }).step
            : undefined;
        if (step) {
          const err = extractStepError(step);
          if (err) {
            const error = err;
            if (error.code === "SERVER_WRITE_ERROR" && error.permanent) {
              error.permanent = false;
              error.retryable = true;
            }
            return reject(error);
          }
          const parsed = parseResponseStep(step, sentOtid);
          const body: SendMusicStickerResult = {
            body: null,
            messageID: parsed.messageID,
            threadID: String(threadID)
          };
          if (callback) callback(null, body);
          return resolve(body);
        }
        const body: SendMusicStickerResult = {
          body: null,
          messageID: fallbackMid || sentOtid,
          threadID: String(threadID)
        };
        if (callback) callback(null, body);
        return resolve(body);
      } catch (e) {
        if (to) {
          clearTimeout(to);
          to = null;
        }
        if (messageHandler && anyCtx.mqttClient) {
          anyCtx.mqttClient.removeListener("message", messageHandler);
          messageHandler = null;
        }
        try {
          reject(e);
        } catch {
          /* ignore */
        }
      }
    };

    messageHandler = (topic: string, message: Buffer): void => {
      try {
        onMessage(topic, message);
      } catch (error) {
        if (to) {
          clearTimeout(to);
          to = null;
        }
        if (messageHandler && anyCtx.mqttClient) {
          anyCtx.mqttClient.removeListener("message", messageHandler);
        }
        try {
          reject(error);
        } catch {
          /* ignore */
        }
      }
    };

    to = setTimeout(() => {
      to = null;
      if (messageHandler && anyCtx.mqttClient) {
        anyCtx.mqttClient.removeListener("message", messageHandler);
      }
      const e: ExtendedError = new Error(
        `Music sticker send timeout after ${Math.round(TIMEOUT_MS / 1000)}s (thread ${threadID})`
      );
      e.retryable = true;
      reject(e);
    }, TIMEOUT_MS);
    if (to.unref) to.unref();
    anyCtx.mqttClient?.on("message", messageHandler);

    if (
      !safePublish(
        anyCtx.mqttClient,
        CONSTANTS.MQTT_TOPIC,
        JSON.stringify(content),
        { qos: CONSTANTS.MQTT_QOS, retain: false },
        (err?: Error) => {
          if (err) {
            if (to) {
              clearTimeout(to);
              to = null;
            }
            if (messageHandler && anyCtx.mqttClient) {
              anyCtx.mqttClient.removeListener("message", messageHandler);
            }
            const extendedErr = err as ExtendedError;
            extendedErr.retryable = true;
            try {
              reject(err);
            } catch {
              /* ignore */
            }
          }
        }
      )
    ) {
      if (to) {
        clearTimeout(to);
        to = null;
      }
      if (messageHandler && anyCtx.mqttClient) {
        anyCtx.mqttClient.removeListener("message", messageHandler);
      }
      const e: ExtendedError = new Error("Failed to publish message: MQTT client not ready");
      e.retryable = true;
      reject(e);
    }
  });

export default function sendMusicStickerFactory(
  _defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (musicSticker: MusicStickerPayload, threadID: string | number, callback?: SendMusicStickerCallback) => Promise<SendMusicStickerResult> {
  return function sendMusicSticker(
    musicSticker: MusicStickerPayload,
    threadID: string | number,
    callback?: SendMusicStickerCallback
  ): Promise<SendMusicStickerResult> {
    let resolveFunc: (v: SendMusicStickerResult) => void = () => {};
    let rejectFunc: (e: unknown) => void = () => {};

    const returnPromise = new Promise<SendMusicStickerResult>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    const cb: SendMusicStickerCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data!);
      });

    if (!musicSticker?.song_id) {
      const error = new Error("Music sticker metadata is required (song_id is required)");
      log.error(`sendMusicSticker: ${error.message}`);
      cb(error);
      return returnPromise;
    }

    if (threadID == null || threadID === "") {
      const error = new Error("threadID is required");
      log.error(`sendMusicSticker: ${error.message}`);
      cb(error);
      return returnPromise;
    }

    const otid = generateOfflineThreadingID();
    const navigationChain = buildMusicStickerNavigationChain();

    const metadata = {
      xma_music_sticker_message_metadata: {
        song_id: musicSticker.song_id,
        start_time: musicSticker.start_time ?? "1500",
        song_title: musicSticker.song_title ?? "",
        song_subtitle: musicSticker.song_subtitle ?? "",
        is_explicit: musicSticker.is_explicit ?? false
      }
    };

    const dataclassParams = {
      logging_metadata: {
        content_model: null,
        feature_tags: ["IS_NOT_DIALTONE"]
      },
      product_params: null
    };

    const payload: Record<string, unknown> = {
      thread_id: toNum(threadID),
      otid,
      source: 0,
      send_type: CONSTANTS.SEND_TYPES.STICKER,
      sync_group: CONSTANTS.SYNC_GROUP,
      mark_thread_read: 0,
      metadata_dataclass: JSON.stringify(metadata),
      dataclass_params: JSON.stringify(dataclassParams),
      navigation_chain: navigationChain
    };

    const appId = r(SEND.APP_ID_POOL);
    const versionId = SEND.VERSION_POOL[0]!;

    void publishOnce(ctx, payload, otid, threadID, appId, versionId, cb)
      .then((result) => {
        resolveFunc(result);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`sendMusicSticker failed: ${msg}`);
        rejectFunc(err);
      });

    return returnPromise;
  };
}
