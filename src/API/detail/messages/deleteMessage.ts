"use strict";

import type { DefaultFuncs, MQTTContext } from "@core/types";
import { generateOfflineThreadingID } from "../../request/formatters";

interface TaskPayload {
  thread_key: string | number;
  remove_type: number;
  sync_group: number;
}

interface Task {
  failure_count: null;
  label: string;
  payload: string; 
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
  payload: string; 
  request_id: number;
  type: number;
}

interface DeleteMessageResponse {
  success: boolean;
  response: any;
}

type DeleteMessageCallback = (
  error: Error | null,
  result?: DeleteMessageResponse
) => void;

export default function (
  _defaultFuncs: DefaultFuncs,
  _client: any,
  ctx: MQTTContext
): (
  threadKey: string | number,
  removeType?: number,
  callback?: DeleteMessageCallback
) => Promise<DeleteMessageResponse> {
  return function deleteMessage(
    threadKey: string | number,
    removeType: number = 0,
    callback?: DeleteMessageCallback
  ): Promise<DeleteMessageResponse> {
    const cb: DeleteMessageCallback =
      typeof callback === "function" ? callback : () => { };

    return new Promise<DeleteMessageResponse>(
      (resolve, reject): void => {
        if (!ctx.mqttClient || !ctx.mqttClient.publish) {
          const err = new Error("MQTT client is not connected");
          cb(err);
          return reject(err);
        }

        if (!threadKey) {
          const err = new Error("Missing threadKey");
          cb(err);
          return reject(err);
        }

        const reqID: number = ++ctx.wsReqNumber;
        const taskID: number = ++ctx.wsTaskNumber;

        const taskPayload: TaskPayload = {
          thread_key:
            typeof threadKey === "string" ? threadKey : Number(threadKey),
          remove_type: removeType,
          sync_group: 1,
        };

        const payload: Payload = {
          epoch_id: generateOfflineThreadingID(),
          tasks: [
            {
              failure_count: null,
              label: "146",
              payload: JSON.stringify(taskPayload),
              queue_name: String(threadKey),
              task_id: taskID,
            },
          ],
          version_id: "25671290389140391",
        };

        const form: RequestForm = {
          app_id: "2220391788200892",
          payload: JSON.stringify(payload),
          request_id: reqID,
          type: 3,
        };

        let messageHandler: ((topic: string, message: Buffer) => void) | null = null;
        let timeoutId: NodeJS.Timeout | null = null;
        const TIMEOUT_MS = 30000; 

        const cleanup = (): void => {
          if (messageHandler) {
            ctx.mqttClient?.removeListener("message", messageHandler);
            messageHandler = null;
          }
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        };

        messageHandler = (topic: string, message: Buffer): void => {
          if (topic !== "/ls_resp") return;

          let json: {
            request_id?: number;
            payload?: string | any;
          };

          try {
            const messageStr = message.toString();
            json = JSON.parse(messageStr);

            if (typeof json.payload === "string" && json.payload.trim()) {
              try {
                json.payload = JSON.parse(json.payload);
              } catch {
                
              }
            }
          } catch {
            return;
          }

          if (json.request_id !== reqID) return;

          cleanup();

          const result: DeleteMessageResponse = {
            success: true,
            response: json.payload,
          };

          cb(null, result);
          resolve(result);
        };

        timeoutId = setTimeout(() => {
          cleanup();
          const err = new Error("Delete message timeout");
          cb(err);
          reject(err);
        }, TIMEOUT_MS);

        ctx.mqttClient.on("message", messageHandler);

        ctx.mqttClient.publish(
          "/ls_req",
          JSON.stringify(form),
          { qos: 1, retain: false },
          (err?: Error): void => {
            if (err) {
              cleanup();
              cb(err);
              reject(err);
            }
          }
        );
      }
    );
  };
}
