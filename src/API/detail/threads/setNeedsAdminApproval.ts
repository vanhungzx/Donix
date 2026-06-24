"use strict";

import log from "@log";
import type { MQTTContext } from "@types";
import { generateOfflineThreadingID } from "../../request/formatters";

interface AdminApprovalTaskPayload {
  thread_key: number;
  enabled: number;
  sync_group: number;
}

interface AdminApprovalTask {
  failure_count: null;
  label: string;
  payload: string; 
  queue_name: string;
  task_id: number;
}

interface AdminApprovalPayload {
  epoch_id: string;
  tasks: AdminApprovalTask[];
  version_id: string;
}

interface AdminApprovalRequest {
  app_id: string;
  payload: string; 
  request_id: number;
  type: number;
}

interface AdminApprovalResult {
  success: boolean;
  threadID: number;
  enabled: boolean;
  response: unknown;
}

type SetNeedsAdminApprovalCallback = (
  err: Error | null,
  result?: AdminApprovalResult
) => void;

export default function (
  _defaultFuncs: unknown,
  _api: unknown,
  ctx: MQTTContext
): (
  threadID: string | number,
  enabled: unknown,
  callback?: SetNeedsAdminApprovalCallback
) => Promise<AdminApprovalResult> {
  return function setNeedsAdminApproval(
    threadID: string | number,
    enabled: unknown,
    callback?: SetNeedsAdminApprovalCallback
  ): Promise<AdminApprovalResult> {
    const cb: SetNeedsAdminApprovalCallback =
      typeof callback === "function" ? callback : () => { };

    return new Promise<AdminApprovalResult>((resolve, reject) => {
      if (!ctx.mqttClient || typeof ctx.mqttClient.publish !== "function") {
        const err = new Error("MQTT client is not connected");
        log.error(`setNeedsAdminApproval: ${err.message}`);
        cb(err);
        return reject(err);
      }

      if (threadID === undefined || threadID === null || threadID === "") {
        const err = new Error("Missing threadID");
        cb(err);
        return reject(err);
      }

      const threadIdNum = Number(threadID);
      if (!Number.isFinite(threadIdNum)) {
        const err = new Error("Invalid threadID");
        cb(err);
        return reject(err);
      }

      const enabledStr = String(enabled).toLowerCase();
      const flag =
        ["on", "true", "1"].includes(enabledStr) ||
          (!["off", "false", "0"].includes(enabledStr) && Number(enabled))
          ? 1
          : 0;

      ctx.wsReqNumber = (Number.isFinite(ctx.wsReqNumber) ? ctx.wsReqNumber : 0) + 1;
      ctx.wsTaskNumber = (Number.isFinite(ctx.wsTaskNumber) ? ctx.wsTaskNumber : 0) + 1;

      const reqID = ctx.wsReqNumber;
      const taskID = ctx.wsTaskNumber;

      const taskPayload: AdminApprovalTaskPayload = {
        thread_key: threadIdNum,
        enabled: flag,
        sync_group: 1,
      };

      const payload: AdminApprovalPayload = {
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            failure_count: null,
            label: "28",
            payload: JSON.stringify(taskPayload),
            queue_name: "set_needs_admin_approval_for_new_participant",
            task_id: taskID,
          },
        ],
        version_id: "32530113729921146",
      };

      const form: AdminApprovalRequest = {
        app_id: "772021112871879",
        payload: JSON.stringify(payload),
        request_id: reqID,
        type: 3,
      };

      const handleResponse = (topic: string, message: Buffer): void => {
        if (topic !== "/ls_resp") return;

        let json: { request_id?: number; payload?: string | unknown };

        try {
          json = JSON.parse(message.toString());
          json.payload = JSON.parse(json.payload as string);
        } catch {
          return;
        }

        if (json.request_id !== reqID) return;

        ctx.mqttClient?.removeListener("message", handleResponse);

        const result: AdminApprovalResult = {
          success: true,
          threadID: threadIdNum,
          enabled: Boolean(flag),
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
        (err?: Error | null) => {
          if (err) {
            ctx.mqttClient?.removeListener("message", handleResponse);
            log.error(`setNeedsAdminApproval: ${err.message || err}`);
            cb(err);
            reject(err);
          }
        }
      );
    });
  };
}
