"use strict";

import logger from "../../../core/logger";
import type { DefaultFuncs, MQTTContext } from "@core/types";
import { generateOfflineThreadingID } from "../../request/formatters/index";

const CHANGE_THREAD_EMOJI = {
  APP_ID: "2220391788200892",
  VERSION: "35076557095268364",
  LABEL: "100003",
  QUEUE_NAME: "thread_quick_reaction"
};

const CONSTANTS = {
  MQTT_TOPIC: "/ls_req",
  MQTT_QOS: 1
};

const mqttOk = (ctx: MQTTContext): boolean => {
  try {
    const c = (ctx as any)?.mqttClient;
    return !!(
      c &&
      c.connected &&
      !c.reconnecting &&
      !c.disconnecting &&
      !c.disconnected
    );
  } catch {
    return false;
  }
};

const toNum = (x: unknown): number | string => {
  const s = String(x);
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n)) return n;
  }
  return s;
};

type ChangeThreadEmojiResponse = {
  success: boolean;
  threadID: string;
  emoji: string;
  response?: unknown;
};

type ChangeThreadEmojiCallback = (
  err: Error | null,
  data?: ChangeThreadEmojiResponse
) => void;

function extractError(x: unknown, depth = 0): unknown {
  if (depth > 15 || x == null) return null;

  if (Array.isArray(x)) {
    for (const it of x) {
      const result = extractError(it, depth + 1);
      if (result) return result;
    }
    return null;
  }

  if (typeof x === "object") {
    const obj = x as Record<string, unknown>;
    if (obj.error || obj.errorMessage || obj.error_code) {
      return obj.error || obj.errorMessage || obj.error_code;
    }
    for (const k of Object.keys(obj)) {
      const result = extractError(obj[k], depth + 1);
      if (result) return result;
    }
  }

  return null;
}

export default function (
  _defaultFuncs: DefaultFuncs,
  _api: any,
  ctx: MQTTContext
): (
  emoji: string,
  threadID: string | number,
  callback?: ChangeThreadEmojiCallback
) => Promise<ChangeThreadEmojiResponse> {
  return function changeThreadEmoji(
    emoji: string,
    threadID: string | number,
    callback?: ChangeThreadEmojiCallback
  ): Promise<ChangeThreadEmojiResponse> {
    const cb: ChangeThreadEmojiCallback =
      typeof callback === "function" ? callback : () => {};

    return new Promise<ChangeThreadEmojiResponse>((resolve, reject) => {
      if (!emoji || typeof emoji !== "string" || !emoji.trim()) {
        const err = new Error("Emoji must be a non-empty string");
        cb(err);
        return reject(err);
      }

      if (
        threadID == null ||
        (typeof threadID !== "number" && typeof threadID !== "string")
      ) {
        const err = new Error("ThreadID should be of type Number or String");
        cb(err);
        return reject(err);
      }

      if (!ctx?.mqttClient || !mqttOk(ctx)) {
        const err = new Error("MQTT client is not connected or not healthy");
        (err as any).retryable = true;
        cb(err);
        return reject(err);
      }

      const reqID: number = ++ctx.wsReqNumber;
      const taskID: number = ++ctx.wsTaskNumber;

      const taskPayload = {
        avatar_sticker_instruction_key_id: null,
        custom_emoji: emoji,
        sync_group: 1,
        thread_key: toNum(threadID)
      };

      const task = {
        failure_count: "5",
        label: CHANGE_THREAD_EMOJI.LABEL,
        payload: JSON.stringify(taskPayload),
        queue_name: CHANGE_THREAD_EMOJI.QUEUE_NAME,
        task_id: String(taskID),
        task_stats: {
          queue_latency: 0
        }
      };

      const mqttPayload = {
        epoch_id: generateOfflineThreadingID(),
        tasks: [task],
        version_id: CHANGE_THREAD_EMOJI.VERSION
      };

      const request = {
        app_id: CHANGE_THREAD_EMOJI.APP_ID,
        payload: JSON.stringify(mqttPayload),
        request_id: reqID,
        type: 3
      };

      let timer: NodeJS.Timeout | null = null;
      const cleanup = (onResponse: (topic: string, message: Buffer) => void) => {
        if (timer) clearTimeout(timer);
        timer = null;
        ctx.mqttClient?.removeListener("message", onResponse);
      };

      const onResponse = (topic: string, message: Buffer): void => {
        if (topic !== "/ls_resp") return;

        try {
          let jsonMsg: any;
          try {
            jsonMsg = JSON.parse(message.toString("utf8"));
          } catch {
            return;
          }

          if (jsonMsg?.request_id == null) return;
          if (String(jsonMsg.request_id) !== String(reqID)) return;

          cleanup(onResponse);

          let payloadData: unknown = jsonMsg.payload;
          if (typeof payloadData === "string" && payloadData.trim()) {
            try {
              payloadData = JSON.parse(payloadData);
            } catch {
              // ignore malformed payload JSON
            }
          }

          const error = extractError(payloadData);
          if (error) {
            const err = new Error(
              typeof error === "string" ? error : String(error)
            );
            (err as any).retryable = true;
            logger.error(`changeThreadEmoji error in response: ${err.message}`);
            cb(err);
            return reject(err);
          }

          const result: ChangeThreadEmojiResponse = {
            success: true,
            threadID: String(threadID),
            emoji,
            response: payloadData
          };

          cb(null, result);
          resolve(result);
        } catch (e: any) {
          cleanup(onResponse);
          logger.error(
            `changeThreadEmoji parse error: ${e?.message || String(e)}`
          );
          const err = e instanceof Error ? e : new Error(String(e));
          cb(err);
          reject(err);
        }
      };

      ctx.mqttClient.on("message", onResponse);

      timer = setTimeout(() => {
        cleanup(onResponse);
        const err: any = new Error("Change thread emoji timeout");
        err.retryable = true;
        logger.error(
          `changeThreadEmoji timeout after 10s (reqID=${reqID}, threadID=${String(threadID)})`
        );
        cb(err);
        reject(err);
      }, 10_000);

      try {
        ctx.mqttClient.publish(
          CONSTANTS.MQTT_TOPIC,
          Buffer.from(JSON.stringify(request), "utf8"),
          { qos: CONSTANTS.MQTT_QOS, retain: false },
          (err?: Error) => {
            if (!err) return;
            cleanup(onResponse);
            (err as any).retryable = true;
            logger.error(
              `changeThreadEmoji publish error: ${err?.message || String(err)}`
            );
            cb(err);
            reject(err);
          }
        );
      } catch (e: any) {
        cleanup(onResponse);
        const err = e instanceof Error ? e : new Error(String(e));
        (err as any).retryable = true;
        logger.error(`changeThreadEmoji publish exception: ${err.message}`);
        cb(err);
        reject(err);
      }
    });
  };
}

