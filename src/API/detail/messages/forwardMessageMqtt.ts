"use strict";

import type { MQTTContext } from "@types";
import { generateOfflineThreadingID } from "../../request/formatters";

interface ForwardTaskPayload {
  thread_id: string;
  otid: string;
  source: number;
  send_type: number;
  sync_group: number;
  mark_thread_read: number;
  forwarded_msg_id: string;
  strip_forwarded_msg_caption: number;
  initiating_source: number;
}

interface ForwardTask {
  failure_count: null;
  label: string;
  payload: string; 
  queue_name: string;
  task_id: number;
}

interface ForwardPayload {
  epoch_id: string;
  tasks: ForwardTask[];
  version_id: string;
}

interface ForwardRequest {
  app_id: string;
  payload: string; 
  request_id: number;
  type: number;
}

type ForwardMessageCallback = (err: Error | null, data?: unknown) => void;

let countReq = 0;

export default function (
  _defaultFuncs: unknown,
  _api: unknown,
  ctx: MQTTContext
): (
  threadID: string,
  forwardedMsgID: string,
  callback?: ForwardMessageCallback
) => Promise<unknown> {
  return function forwardMessageMqtt(
    threadID: string,
    forwardedMsgID: string,
    callback?: ForwardMessageCallback
  ): Promise<unknown> {
    let resolveFunc: (value: unknown) => void = () => {};
    let rejectFunc: (reason?: unknown) => void = () => {};

    const returnPromise = new Promise<unknown>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    const cb: ForwardMessageCallback =
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

    if (!forwardedMsgID || typeof forwardedMsgID !== "string") {
      const err = new Error("Invalid forwardedMsgID");
      cb(err);
      return returnPromise;
    }

    const taskPayload: ForwardTaskPayload = {
      thread_id: threadID,
      otid: generateOfflineThreadingID(),
      source: 65544,
      send_type: 5,
      sync_group: 1,
      mark_thread_read: 0,
      forwarded_msg_id: forwardedMsgID,
      strip_forwarded_msg_caption: 0,
      initiating_source: 1,
    };

    const payload: ForwardPayload = {
      epoch_id: generateOfflineThreadingID(),
      tasks: [
        {
          failure_count: null,
          label: "46",
          payload: JSON.stringify(taskPayload),
          queue_name: threadID,
          task_id: Math.floor(Math.random() * 1001),
        },
      ],
      version_id: "8768858626531631",
    };

    const form: ForwardRequest = {
      app_id: "772021112871879",
      payload: JSON.stringify(payload),
      request_id: ++countReq,
      type: 3,
    };

    try {
      ctx.mqttClient.publish("/ls_req", JSON.stringify(form));
      cb(null, { success: true });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      cb(error);
    }

    return returnPromise;
  };
}
