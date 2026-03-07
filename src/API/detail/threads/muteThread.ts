"use strict";

import type { MQTTContext } from "@types";
import { generateOfflineThreadingID } from "../../request/formatters";

interface MuteTaskPayload {
  thread_key: string;
  mailbox_type: number;
  mute_expire_time_ms: number;
  sync_group: number;
}

interface MuteTask {
  failure_count: null;
  label: string;
  payload: string; 
  queue_name: string;
  task_id: number;
}

interface MutePayload {
  epoch_id: string;
  tasks: MuteTask[];
  version_id: string;
}

interface MuteRequest {
  app_id: string;
  payload: string; 
  request_id: number;
  type: number;
}

type MuteThreadFn = (threadID: string, muteState?: boolean) => Promise<void>;

export default function (
  _defaultFuncs: unknown,
  _api: unknown,
  ctx: MQTTContext
): MuteThreadFn {
  return async function muteThread(
    threadID: string,
    muteState: boolean = true
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!ctx.mqttClient) {
        const err = new Error("Not connected to MQTT");
        return reject(err);
      }

      if (!threadID || typeof threadID !== "string") {
        const err = new Error("Invalid threadID");
        return reject(err);
      }

      const reqID: number = ++ctx.wsReqNumber;

      const taskPayload: MuteTaskPayload = {
        thread_key: threadID,
        mailbox_type: 0,
        mute_expire_time_ms: muteState ? -1 : 0,
        sync_group: 1,
      };

      const payload: MutePayload = {
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            failure_count: null,
            label: "144",
            payload: JSON.stringify(taskPayload),
            queue_name: threadID,
            task_id: Math.floor(Math.random() * 1001),
          },
        ],
        version_id: "28135182729462275",
      };

      const form: MuteRequest = {
        app_id: "2220391788200892",
        payload: JSON.stringify(payload),
        request_id: reqID,
        type: 3,
      };

      try {
        ctx.mqttClient.publish("/ls_req", JSON.stringify(form), {
          qos: 1,
          retain: false,
        });
        resolve();
      } catch (err) {
        console.error("muteMqtt", err);
        const error = err instanceof Error ? err : new Error(String(err));
        reject(error);
      }
    });
  };
}
