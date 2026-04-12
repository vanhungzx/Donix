"use strict";

import log from "@log";
import type { DefaultFuncs, MQTTContext } from "@types";
import { generateOfflineThreadingID, getType } from "../../request/formatters.js";

const APP_ID = "2220391788200892";
const VERSION_ID = "26363923589880958";
const LABEL = "25";
const QUEUE_NAME = "admin_status";
const MQTT_TOPIC = "/ls_req";
const MQTT_QOS = 1;
const RESP_TIMEOUT_MS = 15_000;

const toNum = (x: unknown): number | string => {
  const s = String(x);
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n)) return n;
  }
  return s;
};

const mqttOk = (ctx: MQTTContext): boolean => {
  try {
    const c = (ctx as { mqttClient?: { connected?: boolean; reconnecting?: boolean; disconnecting?: boolean; disconnected?: boolean } }).mqttClient;
    return !!(
      c &&
      c.connected &&
      !c.reconnecting &&
      !c.disconnecting &&
      !c.disconnected
    );
  } catch {
    return false;
  }
};

function extractError(x: unknown, depth = 0): unknown {
  if (depth > 15 || x == null) return null;

  if (Array.isArray(x)) {
    for (const it of x) {
      const result = extractError(it, depth + 1);
      if (result) return result;
    }
    return null;
  }

  if (typeof x === "object") {
    const obj = x as Record<string, unknown>;
    if (obj.error || obj.errorMessage || obj.error_code) {
      return obj.error || obj.errorMessage || obj.error_code;
    }
    for (const k of Object.keys(obj)) {
      const result = extractError(obj[k], depth + 1);
      if (result) return result;
    }
  }

  return null;
}

export interface SetAdminStatusResult {
  success: boolean;
  response: unknown;
}

type SetAdminStatusCallback = (err: Error | null, result?: SetAdminStatusResult) => void;

export default function (
  _defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: MQTTContext
): (
  threadID: string | number,
  userID: string | number | (string | number)[],
  admin: boolean,
  callback?: SetAdminStatusCallback
) => Promise<SetAdminStatusResult> {
  return function setAdminStatus(
    threadID: string | number,
    userID: string | number | (string | number)[],
    admin: boolean,
    callback?: SetAdminStatusCallback
  ): Promise<SetAdminStatusResult> {
    let resolveFunc: (value: SetAdminStatusResult) => void = () => {};
    let rejectFunc: (reason?: unknown) => void = () => {};

    const returnPromise = new Promise<SetAdminStatusResult>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    const userCb = typeof callback === "function" ? callback : undefined;

    const cb: SetAdminStatusCallback = (err, data) => {
      if (userCb) userCb(err, data);
      if (err) {
        rejectFunc(err);
        return;
      }
      resolveFunc(data ?? { success: true, response: null });
    };

    if (!ctx?.mqttClient || !mqttOk(ctx)) {
      const err = new Error("Not connected to MQTT");
      log.error(`setAdminStatus: ${err.message}`);
      cb(err);
      rejectFunc(err);
      return returnPromise;
    }

    const tType = getType(threadID);
    if (tType !== "String" && tType !== "Number") {
      const err = new Error("setAdminStatus: threadID must be a string or number");
      cb(err);
      rejectFunc(err);
      return returnPromise;
    }

    const idType = getType(userID);
    let ids: (string | number)[];
    if (idType === "Array") {
      ids = userID as (string | number)[];
    } else if (idType === "String" || idType === "Number") {
      ids = [userID as string | number];
    } else {
      const err = new Error("setAdminStatus: userID must be a string, number, or array");
      cb(err);
      rejectFunc(err);
      return returnPromise;
    }

    if (getType(admin) !== "Boolean") {
      const err = new Error("setAdminStatus: admin must be true or false");
      cb(err);
      rejectFunc(err);
      return returnPromise;
    }

    const isAdmin = admin ? 1 : 0;
    const threadKey = toNum(threadID);

    ctx.wsReqNumber = (Number.isFinite(ctx.wsReqNumber) ? ctx.wsReqNumber : 0) + 1;
    const reqID = ctx.wsReqNumber;

    const tasks = ids.map((id) => {
      ctx.wsTaskNumber = (Number.isFinite(ctx.wsTaskNumber) ? ctx.wsTaskNumber : 0) + 1;
      const taskID = ctx.wsTaskNumber;
      const taskPayload = {
        thread_key: threadKey,
        contact_id: toNum(id),
        is_admin: isAdmin,
        sync_group: 1,
      };
      return {
        failure_count: null as null,
        label: LABEL,
        payload: JSON.stringify(taskPayload),
        queue_name: QUEUE_NAME,
        task_id: taskID,
      };
    });

    const mqttPayload = {
      epoch_id: generateOfflineThreadingID(),
      tasks,
      version_id: VERSION_ID,
    };

    const request = {
      app_id: APP_ID,
      payload: JSON.stringify(mqttPayload),
      request_id: reqID,
      type: 3,
    };

    let timer: NodeJS.Timeout | null = null;
    const cleanup = (onResponse: (topic: string, message: Buffer) => void) => {
      if (timer) clearTimeout(timer);
      timer = null;
      ctx.mqttClient?.removeListener("message", onResponse);
    };

    const onResponse = (topic: string, message: Buffer): void => {
      if (topic !== "/ls_resp") return;

      try {
        let jsonMsg: { request_id?: number | string; payload?: string | unknown };
        try {
          jsonMsg = JSON.parse(message.toString("utf8"));
        } catch {
          return;
        }

        if (jsonMsg?.request_id == null) return;
        if (String(jsonMsg.request_id) !== String(reqID)) return;

        cleanup(onResponse);

        let payloadData: unknown = jsonMsg.payload;
        if (typeof payloadData === "string" && payloadData.trim()) {
          try {
            payloadData = JSON.parse(payloadData);
          } catch {
            /* keep string */
          }
        }

        const error = extractError(payloadData);
        if (error) {
          const err = new Error(typeof error === "string" ? error : String(error));
          (err as { retryable?: boolean }).retryable = true;
          log.error(`setAdminStatus error in response: ${err.message}`);
          cb(err, undefined);
          rejectFunc(err);
          return;
        }

        const result: SetAdminStatusResult = { success: true, response: payloadData };
        cb(null, result);
        resolveFunc(result);
      } catch (e: unknown) {
        cleanup(onResponse);
        const err = e instanceof Error ? e : new Error(String(e));
        log.error(`setAdminStatus parse error: ${err.message}`);
        cb(err, undefined);
        rejectFunc(err);
      }
    };

    ctx.mqttClient.on("message", onResponse);

    timer = setTimeout(() => {
      cleanup(onResponse);
      const err: Error & { retryable?: boolean } = new Error("setAdminStatus timeout");
      err.retryable = true;
      log.error(`setAdminStatus timeout after ${RESP_TIMEOUT_MS}ms (reqID=${reqID})`);
      cb(err, undefined);
      rejectFunc(err);
    }, RESP_TIMEOUT_MS);

    try {
      ctx.mqttClient.publish(
        MQTT_TOPIC,
        Buffer.from(JSON.stringify(request), "utf8"),
        { qos: MQTT_QOS, retain: false },
        (pubErr?: Error) => {
          if (!pubErr) return;
          cleanup(onResponse);
          (pubErr as { retryable?: boolean }).retryable = true;
          log.error(`setAdminStatus publish error: ${pubErr.message}`);
          cb(pubErr, undefined);
          rejectFunc(pubErr);
        }
      );
    } catch (e: unknown) {
      cleanup(onResponse);
      const err = e instanceof Error ? e : new Error(String(e));
      (err as { retryable?: boolean }).retryable = true;
      log.error(`setAdminStatus publish exception: ${err.message}`);
      cb(err, undefined);
      rejectFunc(err);
    }

    return returnPromise;
  };
}
