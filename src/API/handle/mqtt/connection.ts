import HttpsProxyAgent from "https-proxy-agent";
import mqtt from "mqtt";
import websocket from "../../ws-stream";
import { topics } from "./constants";

export function createMqttClient(ctx: any): any {
  const sessionID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) + 1;
  const GUID = ctx.clientId;

  let host = ctx.mqttEndpoint
    ? `${ctx.mqttEndpoint}&sid=${sessionID}&cid=${GUID}`
    : ctx.region
      ? `wss://edge-chat.facebook.com/chat?region=${ctx.region.toLowerCase()}&sid=${sessionID}&cid=${GUID}`
      : `wss://edge-chat.facebook.com/chat?sid=${sessionID}&cid=${GUID}`;

  const mqttOptions: any = {
    clientId: `mqttwsclient`,
    protocolId: "MQIsdp",
    protocolVersion: 3,
    clean: true,
    keepalive: 30,
    // IMPORTANT: Disable mqtt.js auto-reconnect.
    // We implement our own reconnect logic in `reconnectMqttHandler` to avoid
    // multiple reconnect loops and duplicated connection churn.
    reconnectPeriod: 0,
    connectTimeout: 5000,
    reschedulePings: false,
    queueQoSZero: false,
    incomingStore: null,
    outgoingStore: null,
    username: JSON.stringify({
      u: ctx.userID,
      s: sessionID,
      chat_on: ctx.options?.online ?? false,
      fg: true,
      d: GUID,
      ct: "websocket",
      aid: 219994525426954,
      asi: null,
      aids: null,
      mqtt_sid: "",
      cp: 3,
      ecp: 10,
      st: [],
      pm: [],
      dc: "",
      no_auto_fg: true,
      gas: null,
      pack: [],
      p: null,
      php_override: "",
      a: ctx.options?.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    }),
    wsOptions: {
      headers: {
        Cookie: ctx.jar.getCookieStringSync("https://www.facebook.com/"),
        Origin: "https://www.facebook.com",
        Referer: "https://www.facebook.com/",
        Host: new URL(host).hostname,
        "User-Agent": ctx.options?.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0"
      },
      origin: "https://www.facebook.com",
      protocolVersion: 13,
      binaryType: "arraybuffer",
      perMessageDeflate: false,
      // Giới hạn payload nhỏ lại để giảm áp lực bộ nhớ (heap/RSS).
      // Mặc định 4MB, có thể cấu hình qua ctx.options.mqttMaxPayload (min 1MB, max 16MB).
      maxPayload: (ctx.options?.mqttMaxPayload && Number.isFinite(ctx.options.mqttMaxPayload))
        ? Math.max(1 * 1024 * 1024, Math.min(ctx.options.mqttMaxPayload, 16 * 1024 * 1024))
        : 4 * 1024 * 1024
    }
  };

  if (ctx.options?.proxy) {
    mqttOptions.wsOptions.agent = new HttpsProxyAgent(ctx.options.proxy);
  }

  return new (mqtt as any).Client((_: any) => websocket(host, mqttOptions.wsOptions), mqttOptions);
}

export function setupMqttConnection(mqttClient: any, ctx: any, listenMqtt: any, defaultFuncs: any, api: any, globalCallback: any): void {
  const chatOn = ctx.options.online;

  // Only register this connect handler once per client instance.
  mqttClient.once("connect", function () {
    mqttClient.subscribe(topics, { qos: 1, retain: false });
    const useSyncToken = Boolean(ctx.syncToken);
    const topic = useSyncToken ? "/messenger_sync_get_diffs" : "/messenger_sync_create_queue";

    // Tuning knobs for realtime/latency vs throughput.
    // - Smaller batch sizes reduce "latency per delta" (realtime feel),
    //   but may increase overhead.
    const realtime = ctx?.options?.mqttRealtime === true;
    const maxDeltasAbleToProcess = Number.isFinite(ctx?.options?.mqttMaxDeltasAbleToProcess)
      ? Math.max(5, Math.min(Number(ctx.options.mqttMaxDeltasAbleToProcess), 200))
      : (realtime ? 25 : 50);
    const deltaBatchSize = Number.isFinite(ctx?.options?.mqttDeltaBatchSize)
      ? Math.max(10, Math.min(Number(ctx.options.mqttDeltaBatchSize), 500))
      : (realtime ? 50 : 200);

    const queue: any = {
      sync_api_version: 11,
      max_deltas_able_to_process: maxDeltasAbleToProcess,
      delta_batch_size: deltaBatchSize,
      encoding: "JSON",
      entity_fbid: ctx.userID,
      device_params: null
    };
    if (useSyncToken) {
      queue.last_seq_id = ctx.lastSeqId;
      queue.sync_token = ctx.syncToken;
    } else {
      queue.initial_titan_sequence_id = ctx.lastSeqId;
    }

    // Safe publish to prevent "write after end" errors
    try {
      if (mqttClient.connected && !mqttClient.disconnecting && !mqttClient.disconnected) {
        mqttClient.publish(topic, JSON.stringify(queue), { qos: 1, retain: false }, (err: any) => {
          if (err && !err.message?.includes("write after end")) {
            console.error("Error publishing sync queue:", err);
          }
        });
      }
    } catch (err: any) {
      if (!err.message?.includes("write after end")) {
        console.error("Error publishing sync queue:", err);
      }
    }

    try {
      if (mqttClient.connected && !mqttClient.disconnecting && !mqttClient.disconnected) {
        mqttClient.publish("/foreground_state", JSON.stringify({ foreground: chatOn }), { qos: 1 }, (err: any) => {
          if (err && !err.message?.includes("write after end")) {
            console.error("Error publishing foreground state:", err);
          }
        });
      }
    } catch (err: any) {
      if (!err.message?.includes("write after end")) {
        console.error("Error publishing foreground state:", err);
      }
    }

    try {
      if (mqttClient.connected && !mqttClient.disconnecting && !mqttClient.disconnected) {
        mqttClient.publish("/set_client_settings", JSON.stringify({ make_user_available_when_in_foreground: true }), { qos: 1 }, (err: any) => {
          if (err && !err.message?.includes("write after end")) {
            console.error("Error publishing client settings:", err);
          }
        });
      }
    } catch (err: any) {
      if (!err.message?.includes("write after end")) {
        console.error("Error publishing client settings:", err);
      }
    }
    // Guard: if we never receive `/t_ms` to mark "ready", refresh seqID and restart MQTT.
    const existingTimer = ctx._tmsHandshakeTimeout as NodeJS.Timeout | undefined;
    if (existingTimer) clearTimeout(existingTimer);

    const maxRetries = 3;
    const currentRetry = (ctx._tmsHandshakeRetry || 0) as number;

    const rTimeout = setTimeout(async () => {
      ctx._tmsHandshakeTimeout = undefined;

      if (currentRetry >= maxRetries) {
        console.warn(`t_ms handshake thất bại ${maxRetries} lần, lấy seqID mới và thử lại...`);
        ctx._tmsHandshakeRetry = 0;
        // Reset sync state hoàn toàn - BẮT BUỘC lấy seqID mới
        ctx.syncToken = undefined;
        ctx.lastSeqId = undefined;
        ctx.t_mqttCalled = false;
      } else {
        ctx._tmsHandshakeRetry = currentRetry + 1;
        console.warn(`t_ms handshake timeout (lần ${currentRetry + 1}/${maxRetries}), thử lại...`);
      }

      try {
        mqttClient.end(true);
      } catch {
        // ignore
      }
      ctx.mqttClient = undefined;
      listenMqtt(defaultFuncs, api, ctx, globalCallback);
    }, 20000);
    ctx._tmsHandshakeTimeout = rTimeout;
    ctx.tmsWait = () => {
      clearTimeout(rTimeout);
      ctx._tmsHandshakeTimeout = undefined;
      ctx._tmsHandshakeRetry = 0;
      if (ctx.options.emitReady) {
        globalCallback({ type: "ready", error: null });
      }
      delete ctx.tmsWait;
    };
  });
}
