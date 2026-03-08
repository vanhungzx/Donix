"use strict";

import type { DefaultFuncs, MQTTContext } from "@core/types";
import { generateOfflineThreadingID } from "../../request/formatters/index";

interface TaskPayload {
  thread_key: string | number;
  contact_id: string | number;
  nickname: string;
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

interface ChangeNicknameResponse {
  success: boolean;
  response: any;
}

type ChangeNicknameCallback = (
  error: Error | null,
  result?: ChangeNicknameResponse
) => void;

export default function (
  defaultFuncs: DefaultFuncs,
  api: any,
  ctx: MQTTContext
): (
  nickname: string | null | undefined,
  threadID: string | number,
  participantID: string | number,
  callback?: ChangeNicknameCallback
) => Promise<ChangeNicknameResponse> {
  return function changeNickname(
    nickname: string | null | undefined,
    threadID: string | number,
    participantID: string | number,
    callback?: ChangeNicknameCallback
  ): Promise<ChangeNicknameResponse> {
    return new Promise<ChangeNicknameResponse>(
      (resolve, reject): void => {
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

        if (!participantID) {
          const err = new Error("Missing participantID parameter");
          callback?.(err);
          return reject(err);
        }

        const reqID: number = ++ctx.wsReqNumber;
        const taskID: number = ++ctx.wsTaskNumber;

        const taskPayload: TaskPayload = {
          thread_key: threadID,
          contact_id: participantID,
          nickname: nickname || "",
          sync_group: 1,
        };

        const payload: Payload = {
          epoch_id: generateOfflineThreadingID(),
          tasks: [
            {
              failure_count: null,
              label: "44",
              payload: JSON.stringify(taskPayload),
              queue_name: "thread_participant_nickname",
              task_id: taskID,
            },
          ],
          version_id: "8798795233522156",
        };

        const request: RequestForm = {
          app_id: "2220391788200892",
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
          } catch (err) {
            return;
          }

          if (jsonMsg.request_id !== reqID) return;

          ctx.mqttClient?.removeListener("message", onResponse);

          const result: ChangeNicknameResponse = {
            success: true,
            response: jsonMsg.payload,
          };

          callback?.(null, result);
          resolve(result);
        };

        ctx.mqttClient.on("message", onResponse);

        ctx.mqttClient.publish(
          "/ls_req",
          JSON.stringify(request),
          { qos: 1, retain: false },
          (err?: Error): void => {
            if (err) {
              ctx.mqttClient?.removeListener("message", onResponse);
              console.error("changeNicknameMqtt", err);
              callback?.(err);
              reject(err);
            }
          }
        );
      }
    );
  };
}
