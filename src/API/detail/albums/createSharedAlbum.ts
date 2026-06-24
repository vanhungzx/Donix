"use strict";

import crypto from "node:crypto";
import logger from "@log";
import type { DefaultFuncs, MQTTContext } from "@core/types";
import { generateOfflineThreadingID } from "../../request/formatters";

const DEFAULT_APP_ID = "2220391788200892";
const DEFAULT_VERSION_ID = "31104338375848389";
const CREATE_LABEL = "662";
const REQUEST_TYPE = 3;
const TIMEOUT_MS = 15000;

interface AlbumTaskPayload {
  contribution_otids: Record<string, string | number>;
  offline_threading_id: string | number;
  thread_key: string;
  title: string;
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

interface CreateSharedAlbumOptions {
  contributions?: Record<string, string | number>;
  offlineThreadingId?: string | number;
  appId?: string;
  versionId?: string;
}

interface CreateSharedAlbumResponse {
  success: boolean;
  response: any;
}

type CreateSharedAlbumCallback = (
  error: Error | null,
  result?: CreateSharedAlbumResponse
) => void;

const randomGuid = (): string => {
  const bytes = crypto.randomUUID ? crypto.randomUUID() : undefined;
  if (bytes) return bytes.toUpperCase();
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return template.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  }).toUpperCase();
};

export default function (
  _defaultFuncs: DefaultFuncs,
  _api: any,
  ctx: MQTTContext
): (
  threadID: string | number,
  title: string,
  options?: CreateSharedAlbumOptions | CreateSharedAlbumCallback,
  callback?: CreateSharedAlbumCallback
) => Promise<CreateSharedAlbumResponse> {
  return function createSharedAlbum(
    threadID: string | number,
    title: string,
    options: CreateSharedAlbumOptions | CreateSharedAlbumCallback = {},
    callback?: CreateSharedAlbumCallback
  ): Promise<CreateSharedAlbumResponse> {
    return new Promise<CreateSharedAlbumResponse>((resolve, reject) => {
      if (
        typeof options === "function" ||
        Object.prototype.toString.call(options).includes("Function")
      ) {
        callback = options as CreateSharedAlbumCallback;
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

      if (!title || typeof title !== "string") {
        const err = new Error("title must be a non-empty string");
        cb(err);
        return reject(err);
      }

      const opts: CreateSharedAlbumOptions = options as CreateSharedAlbumOptions;
      const queueName = String(threadID);
      const reqId: number = ++ctx.wsReqNumber;
      const taskId: number = ++ctx.wsTaskNumber;

      const offlineThreadingId =
        opts.offlineThreadingId || generateOfflineThreadingID();

      let contribution_otids = opts.contributions;
      if (
        !contribution_otids ||
        typeof contribution_otids !== "object" ||
        Object.keys(contribution_otids).length === 0
      ) {
        contribution_otids = {
          [randomGuid()]: offlineThreadingId,
        };
      }

      const taskPayload: AlbumTaskPayload = {
        contribution_otids,
        offline_threading_id: offlineThreadingId,
        thread_key: queueName,
        title,
      };

      const envelope: AlbumEnvelope = {
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            failure_count: null,
            label: CREATE_LABEL,
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

      let timeout: NodeJS.Timeout | null = setTimeout(() => {
        timeout = null;
        ctx.mqttClient?.removeListener("message", onMessage);
        const err = new Error("createSharedAlbum timeout");
        cb(err);
        reject(err);
      }, TIMEOUT_MS);

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

        const result: CreateSharedAlbumResponse = {
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
            logger.error(`createSharedAlbum publish error: ${err.message}`);
            cb(err);
            reject(err);
          }
        }
      );
    });
  };
}
