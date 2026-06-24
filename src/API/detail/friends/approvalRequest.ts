"use strict";

import type { MQTTContext } from "@types";
import { generateOfflineThreadingID } from "../../request/formatters";

type ApprovalCallback = (err?: Error | null) => void;

let countReq = 0;

export default function (
  _defaultFuncs: unknown,
  _api: unknown,
  ctx: MQTTContext
): (threadID: string, contactIDs: string | string[], accepted: boolean, callback?: ApprovalCallback) => Promise<void> | void {
  return function approvalRequest(
    threadID: string,
    contactIDs: string | string[],
    accepted: boolean,
    callback?: ApprovalCallback
  ): Promise<void> | void {
    const exec = (cb: ApprovalCallback): void => {
      if (typeof accepted !== "boolean") {
        return cb(new Error("accepted parameter must be a boolean (true or false)"));
      }

      let contacts: string[];
      if (typeof contactIDs === "string") {
        contacts = [contactIDs];
      } else if (Array.isArray(contactIDs)) {
        contacts = contactIDs;
      } else {
        return cb(new Error("contactIDs must be a string or an array of IDs"));
      }

      const payload = {
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            failure_count: null,
            label: "27",
            payload: JSON.stringify({
              thread_key: threadID,
              contact_ids: contacts,
              accepted: accepted ? 1 : 0,
            }),
            queue_name: "respond_to_admin_approval_request",
            task_id: 1654,
          },
        ],
        version_id: "29298109013137003",
      };

      const form = JSON.stringify({
        app_id: "772021112871879",
        payload: JSON.stringify(payload),
        request_id: ++countReq,
        type: 3,
      });

      const { mqttClient } = ctx;
      if (!mqttClient || typeof mqttClient.publish !== "function") {
        return cb(new Error("MQTT client is not available to publish approval request"));
      }

      try {
        mqttClient.publish("/ls_req", form);
        cb(null);
      } catch (err) {
        cb(err instanceof Error ? err : new Error(String(err)));
      }
    };

    if (!callback) {
      return new Promise<void>((resolve, reject) => {
        exec((err) => (err ? reject(err) : resolve()));
      });
    }

    exec(callback);
  };
}
