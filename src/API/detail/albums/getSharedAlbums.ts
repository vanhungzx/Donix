"use strict";

import type { DefaultFuncs, MQTTContext } from "@core/types";
import logger from "@log";
import { generateOfflineThreadingID } from "../../request/formatters";

const DEFAULT_APP_ID = "2220391788200892";
const DEFAULT_VERSION_ID = "31104338375848389";
const FETCH_LABEL = "676";
const REQUEST_TYPE = 3;

interface AlbumFetchPayload {
  next_page_cursor: string | null;
  thread_key: string;
}

interface AlbumTask {
  failure_count: null;
  label: string;
  payload: string;
  queue_name: string;
  task_id: number;
}

interface AlbumEnvelope {
  epoch_id: string;
  tasks: AlbumTask[];
  version_id: string;
}

interface AlbumRequestForm {
  app_id: string;
  payload: string;
  request_id: number;
  type: number;
}

interface GetSharedAlbumsOptions {
  cursor?: string | null;
  appId?: string;
  versionId?: string;
}

interface GetSharedAlbumsResponse {
  success: boolean;
  response: any;
}

type GetSharedAlbumsCallback = (
  error: Error | null,
  result?: GetSharedAlbumsResponse
) => void;

export default function (
  _defaultFuncs: DefaultFuncs,
  _api: any,
  ctx: MQTTContext
): (
  threadID: string | number,
  options?: string | null | GetSharedAlbumsOptions | GetSharedAlbumsCallback,
  callback?: GetSharedAlbumsCallback
) => Promise<GetSharedAlbumsResponse> {
  return function getSharedAlbums(
    threadID: string | number,
    options: string | null | GetSharedAlbumsOptions | GetSharedAlbumsCallback = null,
    callback?: GetSharedAlbumsCallback
  ): Promise<GetSharedAlbumsResponse> {
    return new Promise<GetSharedAlbumsResponse>((resolve, reject) => {
      if (
        typeof options === "function" ||
        Object.prototype.toString.call(options).includes("Function")
      ) {
        callback = options as GetSharedAlbumsCallback;
        options = null;
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
        const err = new Error("threadID must be a string hoặc number");
        cb(err);
        return reject(err);
      }

      const opts: GetSharedAlbumsOptions =
        options && typeof options === "object"
          ? (options as GetSharedAlbumsOptions)
          : {};

      if (options && typeof options === "string") {
        opts.cursor = options;
      }

      const queueName = String(threadID);
      const reqId: number = ++ctx.wsReqNumber;
      const taskId: number = ++ctx.wsTaskNumber;

      const taskPayload: AlbumFetchPayload = {
        next_page_cursor:
          opts.cursor === undefined ? null : (opts.cursor as string | null),
        thread_key: queueName,
      };

      const envelope: AlbumEnvelope = {
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            failure_count: null,
            label: FETCH_LABEL,
            payload: JSON.stringify(taskPayload),
            queue_name: queueName,
            task_id: taskId,
          },
        ],
        version_id: opts.versionId || DEFAULT_VERSION_ID,
      };

      const form: AlbumRequestForm = {
        app_id: opts.appId || DEFAULT_APP_ID,
        payload: JSON.stringify(envelope),
        request_id: reqId,
        type: REQUEST_TYPE,
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
        ctx.mqttClient?.removeListener("message", onMessage);

        const result: GetSharedAlbumsResponse = {
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
            ctx.mqttClient?.removeListener("message", onMessage);
            logger.error(`getSharedAlbums publish error: ${err.message}`);
            cb(err);
            reject(err);
          }
        }
      );
    });
  };
}
