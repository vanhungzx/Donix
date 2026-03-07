"use strict";

import type { DefaultFuncs, MQTTContext } from "@core/types";
import logger from "@log";
import { generateOfflineThreadingID } from "../../request/formatters";

interface TaskPayload {
  message_id: string;
  text: string;
}

interface Task {
  failure_count: null;
  label: string;
  payload: string; 
  queue_name: string;
  task_id: number;
}

interface Payload {
  data_trace_id: null;
  epoch_id: number;
  tasks: Task[];
  version_id: string;
}

interface RequestForm {
  app_id: string;
  payload: string; 
  request_id: number;
  type: number;
}

interface EditMessageResponse {
  body: string;
  messageID: string;
}

interface EditMessageError {
  error: string;
}

type EditMessageCallback = (
  error: EditMessageError | null | undefined,
  result?: EditMessageResponse
) => void;

export default function (
  defaultFuncs: DefaultFuncs,
  client: any,
  ctx: MQTTContext
): (
  text: string,
  messageID: string,
  callback?: EditMessageCallback
) => Promise<EditMessageResponse> {
  return function editMessage(
    text: string,
    messageID: string,
    callback?: EditMessageCallback
  ): Promise<EditMessageResponse> {
    return new Promise<EditMessageResponse>((resolve, reject): void => {
      if (!ctx.mqttClient) {
        const err = new Error("Not connected to MQTT");
        callback?.(err as any, undefined);
        return reject(err);
      }

      if (!text || typeof text !== "string") {
        const err = new Error("Invalid text parameter");
        callback?.(err as any, undefined);
        return reject(err);
      }

      if (!messageID || typeof messageID !== "string") {
        const err = new Error("Invalid messageID parameter");
        callback?.(err as any, undefined);
        return reject(err);
      }

      const reqID: number = ++ctx.wsReqNumber;
      const taskID: number = ++ctx.wsTaskNumber;

      const APP_ID = "2220391788200892";
      const VERSION_ID = "31104338375848389";
      const REQUEST_TYPE = 3;

      const taskPayload: TaskPayload = {
        message_id: messageID,
        text: text,
      };

      const payload: Payload = {
        data_trace_id: null,
        epoch_id: Number(generateOfflineThreadingID()),
        tasks: [
          {
            failure_count: null,
            label: "742",
            payload: JSON.stringify(taskPayload),
            queue_name: "edit_message",
            task_id: taskID,
          },
        ],
        version_id: VERSION_ID,
      };

      const content: RequestForm = {
        app_id: APP_ID,
        payload: JSON.stringify(payload),
        request_id: reqID,
        type: REQUEST_TYPE,
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
          logger.error(err as string);
          return;
        }

        if (jsonMsg.request_id !== reqID) return;

        ctx.mqttClient?.removeListener("message", handleRes);

        try {
          const step = jsonMsg.payload?.step;
          const msgID = step?.[1]?.[2]?.[2]?.[1]?.[2];
          const msgReplace = step?.[1]?.[2]?.[2]?.[1]?.[4];

          if (!msgID || !msgReplace) {
            const err = new Error("Invalid response structure");
            callback?.(err as any, undefined);
            return reject(err);
          }

          const bodies: EditMessageResponse = {
            body: msgReplace,
            messageID: msgID,
          };

          if (msgReplace !== text) {
            const error: EditMessageError = {
              error: "The message is too old or not from you!",
            };
            callback?.(error, bodies);
            return reject(new Error(error.error));
          }

          callback?.(null, bodies);
          resolve(bodies);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          logger.error(error.message);
          callback?.(error as any, undefined);
          reject(error);
        }
      };

      ctx.mqttClient.on("message", handleRes);

      try {
        ctx.mqttClient.publish("/ls_req", JSON.stringify(content), {
          qos: 1,
          retain: false,
        });
      } catch (err) {
        ctx.mqttClient.removeListener("message", handleRes);
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(error.message);
        callback?.(error as any, undefined);
        reject(error);
      }
    });
  };
}
