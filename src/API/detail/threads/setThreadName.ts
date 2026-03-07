"use strict";

import logger from "../../../core/logger";
import type { DefaultFuncs, MQTTContext } from "@core/types";
import { generateOfflineThreadingID, getType } from "../../request/formatters";

interface TaskPayload {
  thread_key: string | number;
  thread_name: string;
  sync_group: number;
}

interface Task {
  failure_count: null;
  label: string;
  payload: string; // JSON stringified TaskPayload
  queue_name: string;
  task_id: number;
}

interface Payload {
  epoch_id: string;
  tasks: Task[];
  version_id: string;
}

interface RequestForm {
  app_id: string;
  payload: string; // JSON stringified Payload
  request_id: number;
  type: number;
}

interface SetThreadNameResponse {
  success: boolean;
  response: any;
}

type SetThreadNameCallback = (
  error: Error | null,
  result?: SetThreadNameResponse
) => void;

export default function (
  defaultFuncs: DefaultFuncs,
  api: any,
  ctx: MQTTContext
): (
  newTitle: string,
  threadID: string | number,
  callback?: SetThreadNameCallback
) => Promise<SetThreadNameResponse> {
  return function setThreadName(
    newTitle: string,
    threadID: string | number,
    callback?: SetThreadNameCallback
  ): Promise<SetThreadNameResponse> {
    return new Promise<SetThreadNameResponse>((resolve, reject): void => {
      if (!ctx.mqttClient) {
        const err = new Error("Not connected to MQTT");
        callback?.(err);
        return reject(err);
      }

      if (getType(threadID) !== "Number" && getType(threadID) !== "String") {
        const err = new Error(
          "ThreadID should be of type Number or String."
        );
        callback?.(err);
        return reject(err);
      }

      if (!newTitle || typeof newTitle !== "string") {
        const err = new Error("newTitle must be a non-empty string");
        callback?.(err);
        return reject(err);
      }

      const reqID: number = ++ctx.wsReqNumber;
      const taskID: number = ++ctx.wsTaskNumber;

      const taskPayload: TaskPayload = {
        thread_key: threadID,
        thread_name: newTitle,
        sync_group: 1,
      };

      const payload: Payload = {
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            failure_count: null,
            label: "32",
            payload: JSON.stringify(taskPayload),
            queue_name: threadID.toString(),
            task_id: taskID,
          },
        ],
        version_id: "30516460601335759",
      };

      const form: RequestForm = {
        app_id: "772021112871879",
        payload: JSON.stringify(payload),
        request_id: reqID,
        type: 3,
      };

      const handleRes = (topic: string, message: Buffer): void => {
        if (topic !== "/ls_resp") return;

        let jsonMsg: {
          request_id?: number;
          payload?: string | any;
        };

        try {
          jsonMsg = JSON.parse(message.toString());
          jsonMsg.payload = JSON.parse(jsonMsg.payload as string);
        } catch (err) {
          return;
        }

        if (jsonMsg.request_id !== reqID) return;

        ctx.mqttClient?.removeListener("message", handleRes);

        const result: SetThreadNameResponse = {
          success: true,
          response: jsonMsg.payload,
        };

        callback?.(null, result);
        resolve(result);
      };

      ctx.mqttClient.on("message", handleRes);

      ctx.mqttClient.publish(
        "/ls_req",
        JSON.stringify(form),
        { qos: 1, retain: false },
        (err?: Error): void => {
          if (err) {
            ctx.mqttClient?.removeListener("message", handleRes);
            logger.error(`setThreadName (MQTT publish failed): ${err.message}`);
            callback?.(err);
            reject(err);
          }
        }
      );
    });
  };
}
