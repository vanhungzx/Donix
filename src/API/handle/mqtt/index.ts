"use strict";

import log from "@log";
import { EventEmitter as NodeEventEmitter } from "events";
import { createMqttClient, setupMqttConnection } from "./connection";
import { handleFriendRequest, handleLsResponse, handlePresenceUpdate, handleTmsMessage, handleTypingNotification, handleWebRTCMessage } from "./messageHandlers";
import { reconnectMqtt, resetReconnectCount } from "./reconnect";
import { createGetSeqID } from "./sequenceId";

let messageCleanupInterval: NodeJS.Timeout | null = null;

type MqttCallback = (err: any, msg?: any) => any;

function createRealtimeCallbackWrapper(baseCallback: MqttCallback, ctx: any): MqttCallback {
  const realtime = ctx?.options?.mqttRealtime === true;
  if (!realtime) return baseCallback;

  // Đảm bảo luôn đọc concurrency một cách an toàn khi ctx.options chưa được set
  const rawConcurrency = ctx?.options?.mqttCallbackConcurrency;
  const numericConcurrency = Number(rawConcurrency);
  const concurrency = Number.isFinite(numericConcurrency)
    ? Math.max(1, Math.min(numericConcurrency, 16))
    : 1;

  // Tối ưu: Thêm queue limit dựa trên memory để tránh memory buildup
  // Concurrency control prevents overwhelming the event loop.
  let inFlight = 0;
  const queue: Array<{ err: any; msg: any }> = [];
  // Dynamic queue limit based on RSS memory
  const getMaxQueueSize = (): number => {
    try {
      const rssMB = process.memoryUsage().rss / 1024 / 1024;
      if (rssMB > 300) return 50; // Rất thấp khi RSS rất cao
      if (rssMB > 280) return 100; // Thấp khi RSS cao
      if (rssMB > 250) return 200; // Trung bình khi RSS tăng
      return 500; // Bình thường
    } catch {
      return 500; // Fallback
    }
  };

  const defer = (fn: () => void) => {
    if (typeof setImmediate === "function") {
      setImmediate(fn);
    } else {
      setTimeout(fn, 0);
    }
  };

  const runOne = (item: { err: any; msg: any }) => {
    inFlight++;
    try {
      Promise.resolve(baseCallback(item.err, item.msg))
        .catch(() => {
          // Don't crash the pipeline on callback errors.
        })
        .finally(() => {
          inFlight--;
          if (queue.length > 0) defer(drain);
        });
    } catch {
      inFlight--;
      if (queue.length > 0) defer(drain);
    }
  };

  const drain = () => {
    while (inFlight < concurrency && queue.length > 0) {
      const item = queue.shift()!;
      runOne(item);
    }
  };

  return (err: any, msg?: any) => {
    // Tối ưu: Giới hạn queue size dựa trên memory để tránh memory buildup
    const maxQueue = getMaxQueueSize();
    if (queue.length >= maxQueue) {
      // Xóa message cũ nhất khi queue đầy (FIFO)
      queue.shift();
      // Log warning nếu drop quá nhiều
      if (queue.length >= maxQueue * 0.9) {
        console.warn(`[MQTT] Queue gần đầy (${queue.length}/${maxQueue}), đã drop message cũ`);
      }
    }
    queue.push({ err, msg });
    drain();
  };
}

function listenMqtt(defaultFuncs: any, api: any, ctx: any, globalCallback: any): void {
  // Cleanup previous client instance to avoid socket/listener leaks.
  if (ctx.mqttClient) {
    try {
      ctx.mqttClient.removeAllListeners();
    } catch {
      // ignore
    }
    try {
      ctx.mqttClient.end(true);
    } catch {
      // ignore
    }
    ctx.mqttClient = undefined;
  }

  const mqttClient = createMqttClient(ctx);
  ctx.mqttClient = mqttClient;
  (global as any).mqttClient = mqttClient;
  // Tối ưu: Expose ctx globally để cleanup có thể truy cập ctx.tasks
  (global as any).mqttContext = ctx;

  // Set MaxListeners to 0 (unlimited) to avoid MaxListenersExceededWarning
  try {
    mqttClient.setMaxListeners(0);
  } catch {
    // ignore
  }

  const getSeqID = createGetSeqID(ctx, defaultFuncs, api, listenMqtt, globalCallback, messageCleanupInterval);

  mqttClient.on("error", (err: any) => {
    const errorMsg = err?.message || String(err || "");
    const lowerMsg = errorMsg.toLowerCase();

    const isNetworkErr =
      lowerMsg.includes("enotfound") ||
      lowerMsg.includes("econnreset") ||
      lowerMsg.includes("econnrefused") ||
      lowerMsg.includes("connection refused") ||
      lowerMsg.includes("no subscription existed") ||
      lowerMsg.includes("network") ||
      err?.code === "ENOTFOUND" ||
      err?.code === "ECONNRESET" ||
      err?.code === "ECONNREFUSED";

    // Trường hợp phổ biến khi client đang tự đóng kết nối (ví dụ stopListening/end)
    // Thư viện MQTT thường bắn error "client disconnecting" nhưng đây không phải lỗi nặng.
    const isClientDisconnecting =
      lowerMsg.includes("client disconnecting") || lowerMsg.includes("client disconnect");

    if (isClientDisconnecting) {
      log.info(`MQTT client đang đóng kết nối: ${errorMsg}`);
      // Vẫn cho phép logic reconnect xử lý nếu cần, nhưng không log error "đỏ"
      reconnectMqtt(ctx, messageCleanupInterval, getSeqID);
      return;
    }

    // Lỗi "Connection refused: No subscription existed" cần reconnect ngay
    const isConnectionRefused =
      lowerMsg.includes("connection refused") ||
      lowerMsg.includes("no subscription existed");

    if (isNetworkErr || isConnectionRefused) {
      log.warn(`Lỗi kết nối MQTT: ${errorMsg}. Sẽ tự động kết nối lại...`);
    } else {
      log.error(`Lỗi kết nối MQTT: ${errorMsg}`);
    }

    // Luôn gọi reconnect cho mọi lỗi để đảm bảo kết nối được khôi phục
    reconnectMqtt(ctx, messageCleanupInterval, getSeqID);
  });

  mqttClient.on("close", () => {
    if (!ctx.isReconnecting) {
      log.warn("MQTT connection closed, attempting reconnect...");
      reconnectMqtt(ctx, messageCleanupInterval, getSeqID);
    }
  });

  mqttClient.on("offline", () => {
    if (!ctx.isReconnecting) {
      log.warn("MQTT went offline, attempting reconnect...");
      reconnectMqtt(ctx, messageCleanupInterval, getSeqID);
    }
  });

  mqttClient.on("disconnect", () => {
    if (!ctx.isReconnecting) {
      log.warn("MQTT disconnected, attempting reconnect...");
      reconnectMqtt(ctx, messageCleanupInterval, getSeqID);
    }
  });

  setupMqttConnection(mqttClient, ctx, listenMqtt, defaultFuncs, api, globalCallback);

  // Pre-compile topic strings for fast comparisons (realtime optimization)
  const TOPIC_T_MS = "/t_ms";
  const TOPIC_THREAD_TYPING = "/thread_typing";
  const TOPIC_ORCA_TYPING = "/orca_typing_notifications";
  const TOPIC_ORCA_PRESENCE = "/orca_presence";
  const TOPIC_LS_RESP = "/ls_resp";
  const TOPIC_WEBRTC = "/webrtc";
  const TOPIC_RTC_MULTI = "/rtc_multi";
  const TOPIC_ONEVC = "/onevc";
  const TOPIC_T_WEBRTC = "/t_webrtc";
  const TOPIC_T_RTC_MULTI = "/t_rtc_multi";
  const TOPIC_T_ONEVC = "/t_onevc";
  const TOPIC_WEBRTC_RESPONSE = "/webrtc_response";
  const TOPIC_WEBRTC_RTC = "/webrtc_rtc";

  mqttClient.on("message", (topic: string, message: Buffer) => {
    try {
      // Fast path: WebRTC topics (most common after /t_ms)
      // Use charAt(1) check for "/" + "w"/"r"/"o" to avoid full string includes() scan
      const firstChar = topic.length > 1 ? topic.charAt(1) : "";
      const isWebRTCTopic = firstChar === "w" && topic.includes("webrtc") ||
        firstChar === "r" && topic.includes("rtc_multi") ||
        firstChar === "o" && topic.includes("onevc");

      if (isWebRTCTopic) {
        // Try to parse as JSON first
        try {
          const messageStr = Buffer.isBuffer(message) ? message.toString("utf-8") : String(message);
          const jsonMessage = JSON.parse(messageStr);
          handleWebRTCMessage(jsonMessage, ctx, globalCallback, topic);
          return;
        } catch {
          // If JSON parse fails, handle as binary
          try {
            handleWebRTCMessage({ raw: message, binary: true }, ctx, globalCallback, topic);
          } catch (err: any) {
            console.error("Error handling binary WebRTC message:", err);
          }
          return;
        }
      }

      // Fast path: avoid toString() if already string
      const messageStr = Buffer.isBuffer(message) ? message.toString() : (message as any);
      if (!messageStr) return;

      let jsonMessage: any;
      try {
        jsonMessage = JSON.parse(messageStr);
      } catch {
        return;
      }
      console.log(JSON.stringify(jsonMessage, null, 2));

      // Fast path: use strict equality for exact topic matches (faster than switch for common cases)
      if (topic === TOPIC_T_MS) {
        handleTmsMessage(jsonMessage, ctx, defaultFuncs, api, globalCallback);
      } else if (topic === TOPIC_THREAD_TYPING || topic === TOPIC_ORCA_TYPING) {
        handleTypingNotification(jsonMessage, globalCallback);
      } else if (topic === TOPIC_ORCA_PRESENCE) {
        // An toàn hơn khi ctx.options chưa tồn tại
        if (!ctx.options || !ctx.options.updatePresence) {
          handlePresenceUpdate(jsonMessage, globalCallback);
        }
      } else if (topic === TOPIC_LS_RESP) {
        handleLsResponse(jsonMessage, ctx);
      } else if (
        topic === TOPIC_WEBRTC || topic === TOPIC_RTC_MULTI || topic === TOPIC_ONEVC ||
        topic === TOPIC_T_WEBRTC || topic === TOPIC_T_RTC_MULTI || topic === TOPIC_T_ONEVC ||
        topic === TOPIC_WEBRTC_RESPONSE || topic === TOPIC_WEBRTC_RTC
      ) {
        handleWebRTCMessage(jsonMessage, ctx, globalCallback, topic);
      } else {
        handleFriendRequest(jsonMessage, globalCallback);
      }
    } catch (ex: any) {
      console.error("Message parsing error:", ex);
      if (ex.stack) console.error(ex.stack);
    }
  });

  mqttClient.on("connect", function () {
    resetReconnectCount();
    if (!process.env.OnStatus) {
      log.success("Đã kết nối đến server chat Facebook");
      (process.env as any).OnStatus = "true";
    }
  });

  // `disconnect` handler already exists above; don't add no-op listeners.
}

export default function (defaultFuncs: any, api: any, ctx: any) {
  let globalCallback: any = () => { };

  const getSeqID = createGetSeqID(ctx, defaultFuncs, api, listenMqtt, globalCallback, messageCleanupInterval);

  const createMessageEmitter = () => {
    class MessageEmitter extends NodeEventEmitter {
      stopListening(cb: () => void = () => { }) {
        globalCallback = () => { };
        if (!ctx.mqttClient) {
          cb();
          return;
        }
        const channels = ["/webrtc", "/rtc_multi", "/onevc"];
        channels.forEach(channel => {
          try {
            ctx.mqttClient.unsubscribe(channel);
          } catch {
            // Ignore unsubscribe errors
          }
        });

        // Safe publish to prevent "write after end" errors
        try {
          if (ctx.mqttClient.connected && !ctx.mqttClient.disconnecting && !ctx.mqttClient.disconnected) {
            ctx.mqttClient.publish("/browser_close", "{}", { qos: 1 }, () => {
              // Ignore publish errors during shutdown
            });
          }
        } catch {
          // Ignore publish errors during shutdown
        }

        if (ctx.mqttClient.connected) {
          ctx.mqttClient.end(false, () => {
            ctx.mqttClient = undefined;
            cb();
          });
        } else {
          ctx.mqttClient = undefined;
          cb();
        }
      }
      stopListeningAsync() {
        return new Promise<void>(resolve => this.stopListening(resolve));
      }
    }
    return new MessageEmitter();
  };

  return function startListening(callback?: any) {
    const msgEmitter = createMessageEmitter();
    const baseCallback: MqttCallback =
      callback ||
      ((err: any, msg: any) => {
        if (err) {
          msgEmitter.emit("error", err);
        } else {
          msgEmitter.emit("message", msg);
        }
      });

    globalCallback = createRealtimeCallbackWrapper(baseCallback, ctx);

    // Nếu đã có seq ID từ login, sử dụng luôn
    if (ctx.lastSeqId) {
      log.system(`Sử dụng sequence ID từ login: ${ctx.lastSeqId}`);
      listenMqtt(defaultFuncs, api, ctx, globalCallback);
    } else if (!ctx.firstListen) {
      ctx.lastSeqId = null;
      ctx.syncToken = undefined;
      ctx.t_mqttCalled = false;
      getSeqID();
    } else {
      ctx.syncToken = undefined;
      ctx.t_mqttCalled = false;
      getSeqID();
    }

    ctx.firstListen = false;
    api.stopListening = (msgEmitter as any).stopListening.bind(msgEmitter);
    api.stopListeningAsync = (msgEmitter as any).stopListeningAsync.bind(msgEmitter);
    return msgEmitter;
  };
}

if (process.listenerCount("SIGINT") === 0) {
  process.on("SIGINT", () => {
    if ((global as any).mqttClient) {
      (global as any).mqttClient.end();
    }
    process.exit();
  });
}
