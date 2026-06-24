"use strict";

import logger from "@log";
import type { DefaultFuncs, MQTTContext } from "@core/types";
import { generateOfflineThreadingID } from "../../request/formatters";

const DEFAULT_APP_ID = "2220391788200892";
const DEFAULT_VERSION_ID = "31104338375848389";
const LABEL_UPDATE_ALBUM_TITLE = "686";
const REQUEST_TYPE = 3;
const DEFAULT_TIMEOUT = 15000;

interface UpdateAlbumTitleOptions {
  appId?: string;
  versionId?: string;
  timeoutMs?: number;
}

interface UpdateAlbumTitleResponse {
  success: boolean;
  response: any;
}

type UpdateAlbumTitleCallback = (
  error: Error | null,
  result?: UpdateAlbumTitleResponse
) => void;

export default function (
  _defaultFuncs: DefaultFuncs,
  _api: any,
  ctx: MQTTContext
): (
  threadID: string | number,
  albumID: string | number,
  title: string,
  options?: UpdateAlbumTitleOptions | UpdateAlbumTitleCallback,
  callback?: UpdateAlbumTitleCallback
) => Promise<UpdateAlbumTitleResponse> {
  return function updateSharedAlbumTitle(
    threadID: string | number,
    albumID: string | number,
    title: string,
    options: UpdateAlbumTitleOptions | UpdateAlbumTitleCallback = {},
    callback?: UpdateAlbumTitleCallback
  ): Promise<UpdateAlbumTitleResponse> {
    return new Promise<UpdateAlbumTitleResponse>((resolve, reject) => {
      if (
        typeof options === "function" ||
        Object.prototype.toString.call(options).includes("Function")
      ) {
        callback = options as UpdateAlbumTitleCallback;
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

      if (!title || typeof title !== "string") {
        const err = new Error("title must be a non-empty string");
        cb(err);
        return reject(err);
      }

      const opts: UpdateAlbumTitleOptions = options as UpdateAlbumTitleOptions;
      const queueName = String(threadID);
      const reqId: number = ++ctx.wsReqNumber;
      const taskId: number = ++ctx.wsTaskNumber;

      const taskPayload = {
        shared_album_id: Number(albumID) || albumID,
        thread_key: Number(threadID) || threadID,
        title,
      };

      const envelope = {
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            failure_count: null,
            label: LABEL_UPDATE_ALBUM_TITLE,
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
        const err = new Error("updateSharedAlbumTitle timeout");
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

        const result: UpdateAlbumTitleResponse = {
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
            logger.error(
              `updateSharedAlbumTitle publish error: ${err.message}`
            );
            cb(err);
            reject(err);
          }
        }
      );
    });
  };
}
