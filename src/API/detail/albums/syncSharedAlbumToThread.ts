"use strict";

import logger from "@log";
import type { DefaultFuncs, MQTTContext } from "@core/types";
import { generateOfflineThreadingID } from "../../request/formatters/index";

const DEFAULT_APP_ID = "2220391788200892";
const DEFAULT_VERSION_ID = "31104338375848389";
const LABEL_SYNC_ALBUM = "688";
const REQUEST_TYPE = 3;
const DEFAULT_TIMEOUT = 12000;

interface SyncAlbumOptions {
  appId?: string;
  versionId?: string;
  timeoutMs?: number;
}

interface SyncAlbumResponse {
  success: boolean;
  response: any;
}

type SyncAlbumCallback = (
  error: Error | null,
  result?: SyncAlbumResponse
) => void;

export default function (
  _defaultFuncs: DefaultFuncs,
  _api: any,
  ctx: MQTTContext
): (
  threadID: string | number,
  albumID: string | number,
  options?: SyncAlbumOptions | SyncAlbumCallback,
  callback?: SyncAlbumCallback
) => Promise<SyncAlbumResponse> {
  return function syncSharedAlbumToThread(
    threadID: string | number,
    albumID: string | number,
    options: SyncAlbumOptions | SyncAlbumCallback = {},
    callback?: SyncAlbumCallback
  ): Promise<SyncAlbumResponse> {
    return new Promise<SyncAlbumResponse>((resolve, reject) => {
      if (
        typeof options === "function" ||
        Object.prototype.toString.call(options).includes("Function")
      ) {
        callback = options as SyncAlbumCallback;
        options = {};
      }

      const cb =
        typeof callback === "function"
          ? callback
          : () => {
            
          };

      if (!ctx.mqttClient || typeof ctx.mqttClient.publish !== "function") {
        const err = new Error("MQTT client is not connected");
        cb(err);
        return reject(err);
      }

      if (
        (typeof threadID !== "string" && typeof threadID !== "number") ||
        !threadID
      ) {
        const err = new Error("threadID must be a string or number");
        cb(err);
        return reject(err);
      }

      if (
        (typeof albumID !== "string" && typeof albumID !== "number") ||
        !albumID
      ) {
        const err = new Error("albumID must be a string or number");
        cb(err);
        return reject(err);
      }

      const opts: SyncAlbumOptions = options as SyncAlbumOptions;
      const queueName = String(threadID);
      const reqId: number = ++ctx.wsReqNumber;
      const taskId: number = ++ctx.wsTaskNumber;

      const taskPayload = {
        album_id: Number(albumID) || albumID,
        thread_key: Number(threadID) || threadID,
      };

      const envelope = {
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            failure_count: null,
            label: LABEL_SYNC_ALBUM,
            payload: JSON.stringify(taskPayload),
            queue_name: queueName,
            task_id: taskId,
          },
        ],
        version_id: opts.versionId || DEFAULT_VERSION_ID,
      };

      const form = {
        app_id: opts.appId || DEFAULT_APP_ID,
        payload: JSON.stringify(envelope),
        request_id: reqId,
        type: REQUEST_TYPE,
      };

      const timeoutMs =
        typeof opts.timeoutMs === "number" && opts.timeoutMs > 0
          ? opts.timeoutMs
          : DEFAULT_TIMEOUT;

      let timeout: NodeJS.Timeout | null = setTimeout(() => {
        timeout = null;
        ctx.mqttClient?.removeListener("message", onMessage);
        const err = new Error("syncSharedAlbumToThread timeout");
        cb(err);
        reject(err);
      }, timeoutMs);

      const clearTimeoutSafely = (): void => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
      };

      function onMessage(topic: string, message: Buffer): void {
        if (topic !== "/ls_resp") return;

        let json: { request_id?: number; payload?: any };
        try {
          json = JSON.parse(message.toString());
          if (typeof json.payload === "string") {
            json.payload = JSON.parse(json.payload);
          }
        } catch {
          return;
        }

        if (json.request_id !== reqId) return;

        clearTimeoutSafely();
        ctx.mqttClient?.removeListener("message", onMessage);

        const result: SyncAlbumResponse = {
          success: true,
          response: json.payload,
        };
        cb(null, result);
        resolve(result);
      }

      ctx.mqttClient.on("message", onMessage);

      ctx.mqttClient.publish(
        "/ls_req",
        JSON.stringify(form),
        { qos: 1, retain: false },
        (err?: Error) => {
          if (err) {
            clearTimeoutSafely();
            ctx.mqttClient?.removeListener("message", onMessage);
            logger.error(`syncSharedAlbumToThread publish error: ${err.message}`);
            cb(err);
            reject(err);
          }
        }
      );
    });
  };
}
