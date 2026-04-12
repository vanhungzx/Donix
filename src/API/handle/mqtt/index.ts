"use strict";

import log from "@log";
import { EventEmitter as NodeEventEmitter } from "events";
import {
  createMqttClient,
  markMqttActivity,
  resetMqttReadyState,
  setupMqttConnection
} from "./connection";
import {
  handleFriendRequest,
  handleLsResponse,
  handlePresenceUpdate,
  handleTmsMessage,
  handleTypingNotification,
  handleWebRTCMessage
} from "./messageHandlers";
import { reconnectMqtt, resetReconnectCount, isCurrentlyReconnecting } from "./reconnect";
import { createGetSeqID } from "./sequenceId";

let messageCleanupInterval: NodeJS.Timeout | null = null;

type MqttCallback = (err: any, msg?: any) => any;

function createRealtimeCallbackWrapper(baseCallback: MqttCallback, ctx: any): MqttCallback {
  const realtime = ctx?.options?.mqttRealtime === true;
  if (!realtime) return baseCallback;

  const concurrency = Number.isFinite(ctx?.options?.mqttCallbackConcurrency)
    ? Math.max(1, Math.min(Number(ctx.options.mqttCallbackConcurrency), 16))
    : 1;

  let inFlight = 0;
  const queue: Array<{ err: any; msg: any }> = [];

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
          // Ignore callback errors to keep the realtime pipeline alive.
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
    queue.push({ err, msg });
    drain();
  };
}

function shouldIgnoreMqttClientEvent(ctx: any, mqttClient: any): boolean {
  if (!mqttClient) return true;
  if (ctx?.mqttClient !== mqttClient) return true;
  return mqttClient._donixIntentionalClose === true;
}

function listenMqtt(defaultFuncs: any, api: any, ctx: any, globalCallback: any): void {
  resetMqttReadyState(ctx);

  if (ctx.mqttClient) {
    ctx.mqttClient._donixIntentionalClose = true;
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
  mqttClient._donixIntentionalClose = false;
  ctx.mqttClient = mqttClient;
  (global as any).mqttClient = mqttClient;

  try {
    mqttClient.setMaxListeners(30);
  } catch {
    // ignore
  }

  const getSeqID = createGetSeqID(ctx, defaultFuncs, api, listenMqtt, globalCallback, messageCleanupInterval);

  const reconnectTriggerDebounceMs = Number.isFinite(ctx?.options?.mqttReconnectTriggerDebounceMs)
    ? Math.max(3000, Math.min(Number(ctx.options.mqttReconnectTriggerDebounceMs), 60000))
    : 15000;

  ctx._triggerReconnect = function triggerReconnectIfUnhealthy() {
    if (isCurrentlyReconnecting()) return;
    if (
      ctx._lastReconnectTrigger &&
      Date.now() - ctx._lastReconnectTrigger < reconnectTriggerDebounceMs
    ) {
      return;
    }
    ctx._lastReconnectTrigger = Date.now();
    log.warn("MQTT không healthy khi gửi tin, đang kích hoạt reconnect...");
    reconnectMqtt(ctx, messageCleanupInterval, getSeqID);
  };

  mqttClient.on("error", (err: any) => {
    if (shouldIgnoreMqttClientEvent(ctx, mqttClient)) {
      return;
    }

    const errorMsg = err?.message || String(err || "");
    const lowerMsg = errorMsg.toLowerCase();

    const isNetworkErr =
      lowerMsg.includes("enotfound") ||
      lowerMsg.includes("econnreset") ||
      lowerMsg.includes("network") ||
      err?.code === "ENOTFOUND" ||
      err?.code === "ECONNRESET";

    const isClientDisconnecting =
      lowerMsg.includes("client disconnecting") || lowerMsg.includes("client disconnect");

    resetMqttReadyState(ctx);

    if (isClientDisconnecting) {
      log.info(`MQTT client đang đóng kết nối: ${errorMsg}`);
      reconnectMqtt(ctx, messageCleanupInterval, getSeqID);
      return;
    }

    if (isNetworkErr) {
      log.warn(`Lỗi mạng kết nối MQTT: ${errorMsg}. Sẽ tự động kết nối lại khi có mạng...`);
    } else {
      log.error(`Lỗi kết nối MQTT: ${errorMsg}`);
    }

    reconnectMqtt(ctx, messageCleanupInterval, getSeqID);
  });

  mqttClient.on("close", () => {
    if (shouldIgnoreMqttClientEvent(ctx, mqttClient)) {
      return;
    }

    resetMqttReadyState(ctx);
    if (!ctx.isReconnecting) {
      log.warn("MQTT connection closed, attempting reconnect...");
      reconnectMqtt(ctx, messageCleanupInterval, getSeqID);
    }
  });

  mqttClient.on("offline", () => {
    if (shouldIgnoreMqttClientEvent(ctx, mqttClient)) {
      return;
    }

    resetMqttReadyState(ctx);
    if (!ctx.isReconnecting) {
      log.warn("MQTT went offline, attempting reconnect...");
      reconnectMqtt(ctx, messageCleanupInterval, getSeqID);
    }
  });

  mqttClient.on("disconnect", () => {
    if (shouldIgnoreMqttClientEvent(ctx, mqttClient)) {
      return;
    }

    resetMqttReadyState(ctx);
    if (!ctx.isReconnecting) {
      log.warn("MQTT disconnected, attempting reconnect...");
      reconnectMqtt(ctx, messageCleanupInterval, getSeqID);
    }
  });

  setupMqttConnection(
    mqttClient,
    ctx,
    listenMqtt,
    defaultFuncs,
    api,
    globalCallback,
    getSeqID
  );

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
    if (shouldIgnoreMqttClientEvent(ctx, mqttClient)) {
      return;
    }

    try {
      markMqttActivity(ctx);

      const firstChar = topic.length > 1 ? topic.charAt(1) : "";
      const isWebRTCTopic =
        (firstChar === "w" && topic.includes("webrtc")) ||
        (firstChar === "r" && topic.includes("rtc_multi")) ||
        (firstChar === "o" && topic.includes("onevc"));

      if (isWebRTCTopic) {
        try {
          const messageStr = Buffer.isBuffer(message) ? message.toString("utf-8") : String(message);
          const jsonMessage = JSON.parse(messageStr);
          handleWebRTCMessage(jsonMessage, ctx, globalCallback, topic);
          return;
        } catch {
          try {
            handleWebRTCMessage({ raw: message, binary: true }, ctx, globalCallback, topic);
          } catch (err: any) {
            console.error("Error handling binary WebRTC message:", err);
          }
          return;
        }
      }

      const messageStr = Buffer.isBuffer(message) ? message.toString() : (message as any);
      if (!messageStr) return;

      let jsonMessage: any;
      try {
        jsonMessage = JSON.parse(messageStr);
      } catch {
        return;
      }

      if (topic === TOPIC_T_MS) {
        handleTmsMessage(jsonMessage, ctx, defaultFuncs, api, globalCallback);
      } else if (topic === TOPIC_THREAD_TYPING || topic === TOPIC_ORCA_TYPING) {
        handleTypingNotification(jsonMessage, globalCallback);
      } else if (topic === TOPIC_ORCA_PRESENCE) {
        if (!ctx.options.updatePresence) {
          handlePresenceUpdate(jsonMessage, globalCallback);
        }
      } else if (topic === TOPIC_LS_RESP) {
        handleLsResponse(jsonMessage, ctx);
      } else if (
        topic === TOPIC_WEBRTC ||
        topic === TOPIC_RTC_MULTI ||
        topic === TOPIC_ONEVC ||
        topic === TOPIC_T_WEBRTC ||
        topic === TOPIC_T_RTC_MULTI ||
        topic === TOPIC_T_ONEVC ||
        topic === TOPIC_WEBRTC_RESPONSE ||
        topic === TOPIC_WEBRTC_RTC
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
    if (shouldIgnoreMqttClientEvent(ctx, mqttClient)) {
      return;
    }

    resetReconnectCount();
    if (!process.env.OnStatus) {
      log.success("Đã mở kết nối đến server chat Facebook, đang chờ /t_ms...");
      (process.env as any).OnStatus = "true";
    }
  });
}

export default function (defaultFuncs: any, api: any, ctx: any) {
  let globalCallback: any = () => { };

  const getSeqID = createGetSeqID(ctx, defaultFuncs, api, listenMqtt, globalCallback, messageCleanupInterval);

  const createMessageEmitter = () => {
    class MessageEmitter extends NodeEventEmitter {
      stopListening(cb: () => void = () => { }) {
        globalCallback = () => { };
        resetMqttReadyState(ctx);

        const activeClient = ctx.mqttClient;
        if (!activeClient) {
          cb();
          return;
        }

        activeClient._donixIntentionalClose = true;

        const channels = ["/webrtc", "/rtc_multi", "/onevc"];
        channels.forEach((channel) => {
          try {
            activeClient.unsubscribe(channel);
          } catch {
            // ignore unsubscribe errors
          }
        });

        try {
          if (activeClient.connected && !activeClient.disconnecting && !activeClient.disconnected) {
            activeClient.publish("/browser_close", "{}", { qos: 1 }, () => {
              // ignore publish errors during shutdown
            });
          }
        } catch {
          // ignore publish errors during shutdown
        }

        if (activeClient.connected) {
          activeClient.end(false, () => {
            if (ctx.mqttClient === activeClient) {
              ctx.mqttClient = undefined;
            }
            cb();
          });
        } else {
          if (ctx.mqttClient === activeClient) {
            ctx.mqttClient = undefined;
          }
          cb();
        }
      }

      stopListeningAsync() {
        return new Promise<void>((resolve) => this.stopListening(resolve));
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
