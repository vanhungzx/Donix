"use strict";

import logger from "@log";
import type { DefaultFuncs, MQTTContext } from "@types";
import { generateOfflineThreadingID } from "../../request/formatters";

interface PollOption {
  [key: string]: unknown;
}

interface PollTaskPayload {
  question_text: string;
  thread_key: number;
  options: PollOption[] | string[];
  sync_group: number;
}

interface PollTask {
  failure_count: null;
  label: string;
  payload: string; 
  queue_name: string;
  task_id: number;
}

interface PollPayload {
  epoch_id: string;
  tasks: PollTask[];
  version_id: string;
}

interface PollRequest {
  app_id: string;
  payload: string; 
  request_id: number;
  type: number;
}

interface CreatePollResponse {
  success: boolean;
  response: any;
}

type CreatePollCallback = (
  error: Error | null,
  result?: CreatePollResponse
) => void;

type CreatePollFn = (
  threadID: string,
  questionText: string,
  options: PollOption[] | string[],
  callback?: CreatePollCallback
) => Promise<CreatePollResponse>;

export default function (
  _defaultFuncs: DefaultFuncs,
  _client: any,
  ctx: MQTTContext
): CreatePollFn {
  return function createPoll(
    threadID: string,
    questionText: string,
    options: PollOption[] | string[],
    callback?: CreatePollCallback
  ): Promise<CreatePollResponse> {
    const cb: CreatePollCallback =
      typeof callback === "function" ? callback : () => { };

    return new Promise<CreatePollResponse>((resolve): void => {
      if (!ctx.mqttClient || !ctx.mqttClient.publish) {
        const err = new Error("MQTT client is not connected");
        logger.error(err.message);
        cb(err);
        return resolve({ success: false, response: null as any });
      }

      if (!threadID || !questionText || !options || options.length === 0) {
        const err = new Error("Missing threadID, questionText, or options");
        cb(err);
        return resolve({ success: false, response: null as any });
      }

      const reqID: number = ++ctx.wsReqNumber;
      const taskID: number = ++ctx.wsTaskNumber;

      const taskPayload: PollTaskPayload = {
        question_text: questionText,
        thread_key: Number(threadID),
        options,
        sync_group: 1,
      };

      const payload: PollPayload = {
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            failure_count: null,
            label: "163",
            payload: JSON.stringify(taskPayload),
            queue_name: "poll_creation",
            task_id: taskID,
          },
        ],
        version_id: "25760180413567656",
      };

      const form: PollRequest = {
        app_id: "2220391788200892",
        payload: JSON.stringify(payload),
        request_id: reqID,
        type: 3,
      };

      const cleanup = (): void => {
        ctx.mqttClient?.removeListener("message", handleResponse);
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

        cleanup();

        const result: CreatePollResponse = {
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
            cleanup();
            logger.error(err.message);
            cb(err);
            resolve({ success: false, response: null as any });
          }
        }
      );
    });
  };
}
