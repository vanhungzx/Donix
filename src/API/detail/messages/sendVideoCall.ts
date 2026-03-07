"use strict";

import type { MQTTContext } from "@types";

// Safe publish helper to prevent "write after end" errors
const safePublish = (mqttClient: any, topic: string, message: string | Buffer, options: any, callback?: (err?: Error) => void): boolean => {
  if (!mqttClient) {
    const err = new Error("MQTT client is not available");
    if (callback) callback(err);
    return false;
  }

  try {
    // Check if client is connected and not closing
    const isConnected = mqttClient.connected === true;
    const isDisconnecting = mqttClient.disconnecting === true;
    const isDisconnected = mqttClient.disconnected === true;
    const readyState = mqttClient.readyState;

    // WebSocket ready states: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
    const isClosing = readyState === 2;
    const isClosed = readyState === 3;

    if (!isConnected || isDisconnecting || isDisconnected || isClosing || isClosed) {
      const err = new Error("MQTT client is not connected or is closing");
      if (callback) callback(err);
      return false;
    }

    // Try to publish
    try {
      mqttClient.publish(topic, message, options, callback);
      return true;
    } catch (err: any) {
      // Handle "write after end" and other stream errors
      if (err.message && (err.message.includes("write after end") || err.message.includes("write after end"))) {
        const writeErr = new Error("MQTT stream is closed");
        if (callback) callback(writeErr);
        return false;
      }
      if (callback) callback(err);
      return false;
    }
  } catch (err: any) {
    if (callback) callback(err);
    return false;
  }
};

interface SendVideoCallOptions {
  threadID: string;
  sdp?: string;
  sdpBase64?: string;
  rawBase64?: string; // Raw base64 string to send as-is (for protobuf messages)
  callType?: "webrtc" | "rtc_multi" | "onevc";
  payload?: Record<string, any>;
}

type SendVideoCallCallback = (err: Error | null, data?: { success: boolean; topic: string }) => void;

export default function (
  _defaultFuncs: unknown,
  _api: unknown,
  ctx: MQTTContext
): (
  options: SendVideoCallOptions | SendVideoCallCallback,
  callback?: SendVideoCallCallback
) => Promise<{ success: boolean; topic: string }> {
  return function sendVideoCall(
    options: SendVideoCallOptions | SendVideoCallCallback,
    callback?: SendVideoCallCallback
  ): Promise<{ success: boolean; topic: string }> {
    let resolveFunc: (value: { success: boolean; topic: string }) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<{ success: boolean; topic: string }>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    const cb: SendVideoCallCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        if (data) resolveFunc(data);
      });

    // Handle callback-only usage
    if (typeof options === "function") {
      callback = options as SendVideoCallCallback;
      const err = new Error("sendVideoCall requires options: { threadID, sdp or sdpBase64 }");
      cb(err);
      return returnPromise;
    }

    const opts = options as SendVideoCallOptions;

    if (!ctx.mqttClient) {
      const err = new Error("Not connected to MQTT");
      cb(err);
      return returnPromise;
    }

    if (!opts.threadID || typeof opts.threadID !== "string") {
      const err = new Error("threadID is required");
      cb(err);
      return returnPromise;
    }

    if (!opts.sdp && !opts.sdpBase64 && !opts.rawBase64) {
      const err = new Error("Either sdp, sdpBase64, or rawBase64 is required");
      cb(err);
      return returnPromise;
    }

    // Determine topic based on callType
    // Use /t_ prefix topics for WebRTC (Facebook uses these for video calls)
    const topic = opts.callType === "rtc_multi"
      ? "/t_rtc_multi"
      : opts.callType === "onevc"
        ? "/t_onevc"
        : "/t_webrtc";

    // Build message payload
    let message: Record<string, any> = {
      from: ctx.userID,
      to: opts.threadID,
      thread_id: opts.threadID,
      timestamp: Date.now(),
      ...opts.payload
    };

    // Handle different SDP formats
    let messageToSend: string | Buffer;

    if (opts.rawBase64) {
      // Send raw base64 as binary buffer (for protobuf-encoded messages)
      try {
        messageToSend = Buffer.from(opts.rawBase64, "base64");
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Invalid base64 string");
        cb(error);
        return returnPromise;
      }
    } else if (opts.sdpBase64) {
      // Decode base64 to string and send as JSON
      try {
        message.sdp = Buffer.from(opts.sdpBase64, "base64").toString("utf-8");
        messageToSend = JSON.stringify(message);
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Invalid base64 SDP");
        cb(error);
        return returnPromise;
      }
    } else if (opts.sdp) {
      // Use raw SDP string and send as JSON
      message.sdp = opts.sdp;
      messageToSend = JSON.stringify(message);
    } else {
      // Default: send as JSON
      messageToSend = JSON.stringify(message);
    }

    try {
      const published = safePublish(
        ctx.mqttClient,
        topic,
        messageToSend,
        { qos: 1 },
        (err?: Error) => {
          if (err) {
            cb(err);
          } else {
            cb(null, { success: true, topic });
          }
        }
      );

      if (!published) {
        const err = new Error("Failed to publish video call message");
        cb(err);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      cb(error);
    }

    return returnPromise;
  };
}
