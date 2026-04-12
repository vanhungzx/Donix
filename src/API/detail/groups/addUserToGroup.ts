"use strict";

import { generateOfflineThreadingID, getType } from "../../request/formatters";

interface MqttClient {
  on(event: "message", listener: (topic: string, message: Buffer) => void): void;
  removeListener(
    event: "message",
    listener: (topic: string, message: Buffer) => void
  ): void;
  publish(
    topic: string,
    message: string,
    options: { qos: number; retain: boolean },
    callback?: (error?: Error) => void
  ): void;
}

interface Context {
  mqttClient: MqttClient | null;
  wsReqNumber: number;
  wsTaskNumber: number;
}

interface DefaultFuncs {
  [key: string]: any;
}

interface Client {
  [key: string]: any;
}

interface TaskPayload {
  thread_key: string | number;
  contact_ids: string[] | number[];
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

interface ResponsePayload {
  [key: string]: any;
}

interface AddUserToGroupResponse {
  success: boolean;
  response: ResponsePayload;
}

type AddUserToGroupCallback = (
  error: Error | null,
  result?: AddUserToGroupResponse
) => void;

export default function (
  _defaultFuncs: DefaultFuncs,
  _client: Client,
  ctx: Context
): (
  userID: string | number | (string | number)[],
  threadID: string | number,
  callback?: AddUserToGroupCallback
) => Promise<AddUserToGroupResponse> {
  return function addUserToGroup(
    userID: string | number | (string | number)[],
    threadID: string | number,
    callback?: AddUserToGroupCallback
  ): Promise<AddUserToGroupResponse> {
    return new Promise<AddUserToGroupResponse>(
      (resolve, reject): void => {
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

        if (getType(userID) !== "Array") {
          userID = [userID] as (string | number)[];
        }

        const reqID: number = ++ctx.wsReqNumber;
        const taskID: number = ++ctx.wsTaskNumber;

        const taskPayload: TaskPayload = {
          thread_key: threadID,
          contact_ids: userID as (string[] | number[]),
          sync_group: 1,
        };

        const payload: Payload = {
          epoch_id: generateOfflineThreadingID(),
          tasks: [
            {
              failure_count: null,
              label: "23",
              payload: JSON.stringify(taskPayload),
              queue_name: threadID.toString(),
              task_id: taskID,
            },
          ],
          version_id: "32181477484799631",
        };

        const form: RequestForm = {
          app_id: "2220391788200892",
          payload: JSON.stringify(payload),
          request_id: reqID,
          type: 3,
        };

        const handleRes = (topic: string, message: Buffer): void => {
          if (topic !== "/ls_resp") return;

          let jsonMsg: {
            request_id?: number;
            payload?: string;
          };

          try {
            jsonMsg = JSON.parse(message.toString());
            jsonMsg.payload = JSON.parse(jsonMsg.payload as string);
          } catch {
            return;
          }

          if (jsonMsg.request_id !== reqID) return;

          ctx.mqttClient?.removeListener("message", handleRes);

          const result: AddUserToGroupResponse = {
            success: true,
            response: jsonMsg.payload as unknown as ResponsePayload,
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
              callback?.(err);
              reject(err);
            }
          }
        );
      }
    );
  };
}
