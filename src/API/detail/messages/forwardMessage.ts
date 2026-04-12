"use strict";

import type { DefaultFuncs, MQTTContext } from "@core/types";
import logger from "@log";
import { generateOfflineThreadingID } from "../../request/formatters";

interface TaskPayload {
  thread_id: string | number;
  otid: string;
  source: number;
  send_type: number;
  sync_group: number;
  mark_thread_read: number;
  forwarded_msg_id: string;
  strip_forwarded_msg_caption: number;
  initiating_source: number;
}

interface Task {
  failure_count: null;
  label: string;
  payload: string; 
  queue_name: string | number;
  task_id: number;
}

interface Payload {
  epoch_id: string;
  tasks: Task[];
  version_id: string;
}

interface RequestForm {
  app_id: string;
  payload: string; 
  request_id: number;
  type: number;
}

interface ForwardMessageResponse {
  success: boolean;
  response?: any;
}

type ForwardMessageCallback = (
  error: Error | null,
  result?: ForwardMessageResponse
) => void;

let count_req = 0;

export default function (
  _defaultFuncs: DefaultFuncs,
  _client: any,
  ctx: MQTTContext
): (
  threadID: string | number,
  forwardedMsgID: string,
  callback?: ForwardMessageCallback
) => Promise<ForwardMessageResponse> {
  return async function forwardMessage(
    threadID: string | number,
    forwardedMsgID: string,
    callback?: ForwardMessageCallback
  ): Promise<ForwardMessageResponse> {
    return new Promise<ForwardMessageResponse>((resolve, reject): void => {
      if (!ctx.mqttClient) {
        const err = new Error("Not connected to MQTT");
        callback?.(err);
        return reject(err);
      }

      if (!threadID) {
        const err = new Error("Missing threadID parameter");
        callback?.(err);
        return reject(err);
      }

      if (!forwardedMsgID || typeof forwardedMsgID !== "string") {
        const err = new Error("Invalid forwardedMsgID parameter");
        callback?.(err);
        return reject(err);
      }

      const reqID: number = ++ctx.wsReqNumber;
      const taskID: number = Math.floor(Math.random() * 1001);

      const taskPayload: TaskPayload = {
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

      const payload: Payload = {
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            failure_count: null,
            label: "46",
            payload: JSON.stringify(taskPayload),
            queue_name: threadID,
            task_id: taskID,
          },
        ],
        version_id: "8768858626531631",
      };

      const form: RequestForm = {
        app_id: "772021112871879",
        payload: JSON.stringify(payload),
        request_id: ++count_req,
        type: 3,
      };

      const handleResponse = (topic: string, message: Buffer): void => {
        if (topic !== "/ls_resp") return;

        let jsonMsg: {
          request_id?: number;
          payload?: string | any;
        };

        try {
          jsonMsg = JSON.parse(message.toString());
          jsonMsg.payload = JSON.parse(jsonMsg.payload as string);
        } catch (err) {
          logger.error(err as string);
          return;
        }

        if (jsonMsg.request_id !== reqID) return;

        ctx.mqttClient?.removeListener("message", handleResponse);

        const result: ForwardMessageResponse = {
          success: true,
          response: jsonMsg.payload,
        };

        callback?.(null, result);
        resolve(result);
      };

      ctx.mqttClient.on("message", handleResponse);

      try {
        ctx.mqttClient.publish("/ls_req", JSON.stringify(form), {
          qos: 1,
          retain: false,
        });
      } catch (err) {
        ctx.mqttClient.removeListener("message", handleResponse);
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(error.message);
        callback?.(error);
        reject(error);
      }
    });
  };
}
