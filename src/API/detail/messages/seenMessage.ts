"use strict";

import type { MQTTContext } from "@types";
import { generateOfflineThreadingID } from "../../request/formatters";

interface SeenTaskPayload {
  thread_id: string;
  last_read_watermark_ts: number;
  sync_group: number;
}

interface SeenTask {
  failure_count: null;
  label: string;
  payload: string; 
  queue_name: string;
  task_id: number;
}

interface SeenPayload {
  epoch_id: string;
  tasks: SeenTask[];
  version_id: string;
}

interface SeenRequest {
  app_id: string;
  payload: string; 
  request_id: number;
  type: number;
}

type SeenMessageFn = (threadID: string) => void;

let countReq = 0;

export default function (
  _defaultFuncs: unknown,
  _api: unknown,
  ctx: MQTTContext
): SeenMessageFn {
  return function seenMessage(threadID: string): void {
    const payload: SeenPayload = {
      epoch_id: generateOfflineThreadingID(),
      tasks: [
        {
          failure_count: null,
          label: "21",
          payload: JSON.stringify({
            thread_id: threadID,
            last_read_watermark_ts: Date.now(),
            sync_group: 1,
          } as SeenTaskPayload),
          queue_name: threadID,
          task_id: Math.floor(Math.random() * 1001),
        },
      ],
      version_id: "24292451943674760",
    };

    const form: SeenRequest = {
      app_id: "772021112871879",
      payload: JSON.stringify(payload),
      request_id: ++countReq,
      type: 3,
    };

    try {
      ctx.mqttClient?.publish("/ls_req", JSON.stringify(form));
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("MQTT publish error in seenMessage:", error);
    }
  };
}
