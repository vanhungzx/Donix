"use strict";

import type { MQTTContext } from "@types";
import { generateOfflineThreadingID } from "../../request/formatters";

interface ShareLinkTaskPayload {
  otid: string;
  source: number;
  sync_group: number;
  send_type: number;
  mark_thread_read: number;
  url: string;
  text: string;
  thread_id: string;
  initiating_source: number;
}

interface ShareLinkTask {
  label: number;
  payload: string; 
  queue_name: string;
  task_id: number;
  failure_count: null;
}

interface ShareLinkPayload {
  tasks: ShareLinkTask[];
  epoch_id: string;
  version_id: string;
}

interface ShareLinkRequest {
  app_id: string;
  payload: string; 
  request_id: number;
  type: number;
}

type ShareLinkCallback = (err: Error | null, data?: unknown) => void;

export default function (
  _defaultFuncs: unknown,
  _api: unknown,
  ctx: MQTTContext
): (
  text: string | undefined,
  url: string | undefined,
  threadID: string,
  callback?: ShareLinkCallback
) => Promise<unknown> {
  return async function shareLink(
    text: string | undefined,
    url: string | undefined,
    threadID: string,
    callback?: ShareLinkCallback
  ): Promise<unknown> {
    let resolveFunc: (value: unknown) => void = () => {};
    let rejectFunc: (reason?: unknown) => void = () => {};

    const returnPromise = new Promise<unknown>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    const cb: ShareLinkCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      });

    if (!ctx.mqttClient) {
      const err = new Error("Not connected to MQTT");
      cb(err);
      return returnPromise;
    }

    if (!threadID || typeof threadID !== "string") {
      const err = new Error("Invalid threadID");
      cb(err);
      return returnPromise;
    }

    const taskPayload: ShareLinkTaskPayload = {
      otid: generateOfflineThreadingID(),
      source: 524289,
      sync_group: 1,
      send_type: 6,
      mark_thread_read: 0,
      url: url || "https://www.facebook.com/",
      text: text || "",
      thread_id: threadID,
      initiating_source: 0,
    };

    const payload: ShareLinkPayload = {
      tasks: [
        {
          label: 46,
          payload: JSON.stringify(taskPayload),
          queue_name: threadID,
          task_id: (Math.random() * 1001) << 0,
          failure_count: null,
        },
      ],
      epoch_id: generateOfflineThreadingID(),
      version_id: "7191105584331330",
    };

    
    ctx.req_ID = (Number.isFinite(ctx.req_ID) ? (ctx.req_ID as number) : 0) + 1;

    const request: ShareLinkRequest = {
      app_id: "2220391788200892",
      payload: JSON.stringify(payload),
      request_id: ctx.req_ID as number,
      type: 3,
    };

    try {
      ctx.mqttClient.publish(
        "/ls_req",
        JSON.stringify(request),
        { qos: 1, retain: false },
        (err?: Error | null) => {
          if (err) {
            cb(err);
          } else {
            cb(null, { success: true });
          }
        }
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      cb(error);
    }

    return returnPromise;
  };
}
