"use strict";

import type { DefaultFuncs, MQTTContext } from "@core/types";
import { generateOfflineThreadingID, getType } from "../../request/formatters";

interface TaskPayload {
  thread_id: string | number;
  contact_id: string | number;
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

interface RemoveUserFromGroupResponse {
  success: boolean;
  response: any;
}

type RemoveUserFromGroupCallback = (
  error: Error | null,
  result?: RemoveUserFromGroupResponse
) => void;

export default function (
  defaultFuncs: DefaultFuncs,
  client: any,
  ctx: MQTTContext
): (
  userID: string | number,
  threadID: string | number,
  callback?: RemoveUserFromGroupCallback
) => Promise<RemoveUserFromGroupResponse> {
  return function removeUserFromGroup(
    userID: string | number,
    threadID: string | number,
    callback?: RemoveUserFromGroupCallback
  ): Promise<RemoveUserFromGroupResponse> {
    return new Promise<RemoveUserFromGroupResponse>(
      (resolve, reject): void => {
        if (!ctx.mqttClient) {
          const err = new Error("Not connected to MQTT");
          callback?.(err);
          return reject(err);
        }

        if (getType(threadID) !== "Number" && getType(threadID) !== "String") {
          const err = new Error(
            `threadID should be a Number or String, not ${getType(threadID)}`
          );
          callback?.(err);
          return reject(err);
        }

        if (getType(userID) !== "Number" && getType(userID) !== "String") {
          const err = new Error(
            `userID should be a Number or String, not ${getType(userID)}`
          );
          callback?.(err);
          return reject(err);
        }

        const reqID: number = ++ctx.wsReqNumber;
        const taskID: number = ++ctx.wsTaskNumber;

        const taskPayload: TaskPayload = {
          thread_id: threadID,
          contact_id: userID,
          sync_group: 1,
        };

        const payload: Payload = {
          epoch_id: generateOfflineThreadingID(),
          tasks: [
            {
              failure_count: null,
              label: "140",
              payload: JSON.stringify(taskPayload),
              queue_name: "remove_participant_v2",
              task_id: taskID,
            },
          ],
          version_id: "24502707779384158",
        };

        const form: RequestForm = {
          app_id: "772021112871879",
          payload: JSON.stringify(payload),
          request_id: reqID,
          type: 3,
        };

        const onResponse = (topic: string, message: Buffer): void => {
          if (topic !== "/ls_resp") return;

          let jsonMsg: {
            request_id?: number;
            payload?: string | any;
          };

          try {
            jsonMsg = JSON.parse(message.toString());
            jsonMsg.payload = JSON.parse(jsonMsg.payload as string);
          } catch {
            return;
          }

          if (jsonMsg.request_id !== reqID) return;

          ctx.mqttClient?.removeListener("message", onResponse);

          const result: RemoveUserFromGroupResponse = {
            success: true,
            response: jsonMsg.payload,
          };

          callback?.(null, result);
          resolve(result);
        };

        ctx.mqttClient.on("message", onResponse);

        ctx.mqttClient.publish(
          "/ls_req",
          JSON.stringify(form),
          { qos: 1, retain: false },
          (err?: Error): void => {
            if (err) {
              ctx.mqttClient?.removeListener("message", onResponse);
              callback?.(err);
              reject(err);
            }
          }
        );
      }
    );
  };
}
