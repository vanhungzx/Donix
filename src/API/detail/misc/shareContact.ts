"use strict";

import type { DefaultFuncs, MQTTContext } from "@core/types";
import logger from "@log";
import { generateOfflineThreadingID } from "../../request/formatters/index";

interface TaskPayload {
  contact_id: string | number;
  sync_group: number;
  text: string;
  thread_id: string | number;
}

interface Task {
  label: string;
  payload: string; 
  queue_name: string;
  task_id: number;
  failure_count: null;
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

interface ShareContactResponse {
  success: boolean;
  response: any;
}

type ShareContactCallback = (
  error: Error | null,
  result?: ShareContactResponse
) => void;

export default function (
  _defaultFuncs: DefaultFuncs,
  _client: any,
  ctx: MQTTContext
): (
  text: string | null | undefined,
  senderID: string | number,
  threadID: string | number,
  callback?: ShareContactCallback
) => Promise<ShareContactResponse> {
  return function shareContact(
    text: string | null | undefined,
    senderID: string | number,
    threadID: string | number,
    callback?: ShareContactCallback
  ): Promise<ShareContactResponse> {
    const cb: ShareContactCallback =
      typeof callback === "function" ? callback : () => { };

    return new Promise<ShareContactResponse>((resolve, reject): void => {
      if (!ctx.mqttClient || !ctx.mqttClient.publish) {
        const err = new Error("MQTT client is not connected");
        cb(err);
        return reject(err);
      }

      if (!senderID || !threadID) {
        const err = new Error("Missing senderID or threadID");
        cb(err);
        return reject(err);
      }

      const reqID: number = ++ctx.wsReqNumber;
      const taskID: number = ++ctx.wsTaskNumber;

      const taskPayload: TaskPayload = {
        contact_id: senderID,
        sync_group: 1,
        text: text || "",
        thread_id: threadID,
      };

      const payload: Payload = {
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            label: "359",
            payload: JSON.stringify(taskPayload),
            queue_name: "messenger_contact_sharing",
            task_id: taskID,
            failure_count: null,
          },
        ],
        version_id: "7214102258676893",
      };

      const form: RequestForm = {
        app_id: "2220391788200892",
        payload: JSON.stringify(payload),
        request_id: reqID,
        type: 3,
      };

      const handleResponse = (topic: string, message: Buffer): void => {
        if (topic !== "/ls_resp") return;

        let json: {
          request_id?: number;
          payload?: string | any;
        };

        try {
          json = JSON.parse(message.toString());
          json.payload = JSON.parse(json.payload as string);
        } catch (err) {
          return;
        }

        if (json.request_id !== reqID) return;

        ctx.mqttClient?.removeListener("message", handleResponse);

        const result: ShareContactResponse = {
          success: true,
          response: json.payload,
        };

        cb(null, result);
        resolve(result);
      };

      ctx.mqttClient.on("message", handleResponse);

      ctx.mqttClient.publish(
        "/ls_req",
        JSON.stringify(form),
        { qos: 1, retain: false },
        (err?: Error): void => {
          if (err) {
            ctx.mqttClient?.removeListener("message", handleResponse);
            logger.error(err.message);
            cb(err);
            reject(err);
          }
        }
      );
    });
  };
}
