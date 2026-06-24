import log from "@log";
import type { Context, DefaultFuncs } from "../../request/formatters/helpers";
import { generateOfflineThreadingID } from "../../request/formatters/index";
import { decodeGroupInviteFromLsResp, type GroupInviteJson } from "./decodeLsRespBinary";

const MQTT_TOPIC = "/ls_req";
const MQTT_QOS = 1;

interface PendingGroupInvitePayload {
  has_vanity_name: 0 | 1;
  image_height: number;
  image_width: number;
  link_hash: string;
}

interface FetchPendingGroupInviteResult {
  success: boolean;
  /** Payload gốc (nhị phân / string) từ ls_resp */
  response: unknown;
  /** JSON đã decode, thân thiện để dùng ở UI */
  parsed?: GroupInviteJson;
}

type FetchPendingGroupInviteCallback = (
  err: unknown,
  result?: FetchPendingGroupInviteResult
) => void;

const mqttOk = (ctx: Context): boolean => {
  try {
    const c = (ctx as any)?.mqttClient;
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

const withRetry = async <T>(
  fn: (attempt: number) => Promise<T>,
  tries = 1
): Promise<T> => {
  let last: unknown;
  for (let i = 0; i <= tries; i++) {
    try {
      return await fn(i);
    } catch (e: any) {
      if (!e || e.retryable !== true || i === tries) {
        throw e;
      }
      last = e;
    }
  }
  throw last;
};

export default function fetchPendingGroupInviteFactory(
  _def: DefaultFuncs,
  _api: any,
  ctx: Context
) {
  return function fetchPendingGroupInvite(
    payload: PendingGroupInvitePayload,
    callback?: FetchPendingGroupInviteCallback
  ): Promise<FetchPendingGroupInviteResult> {
    const cb =
      (typeof callback === "function" ? callback : () => { }) as any;

    return new Promise<FetchPendingGroupInviteResult>((resolve, reject) => {
      if (!mqttOk(ctx)) {
        const err = new Error("MQTT client is not connected");
        log.error(`fetchPendingGroupInvite MQTT not connected: ${err.message}`);
        cb(err);
        return reject(err);
      }

      if (!payload || !payload.link_hash) {
        const err = new Error("Missing link_hash for pending group invite");
        cb(err);
        return reject(err);
      }

      const sendOnce = (): Promise<FetchPendingGroupInviteResult> =>
        new Promise((resolveOnce, rejectOnce) => {
          const anyCtx = ctx as any;
          const reqID = (anyCtx.wsReqNumber = (anyCtx.wsReqNumber || 0) + 1);
          const taskID = (anyCtx.wsTaskNumber = (anyCtx.wsTaskNumber || 0) + 1);

          const body: PendingGroupInvitePayload = {
            has_vanity_name: payload.has_vanity_name ?? 0,
            image_height: payload.image_height ?? 720,
            image_width: payload.image_width ?? 720,
            link_hash: payload.link_hash
          };

          const requestPayload = {
            epoch_id: generateOfflineThreadingID(),
            tasks: [
              {
                failure_count: null as null | number,
                label: "434",
                payload: JSON.stringify(body),
                queue_name: "fetch_pending_group_invite",
                task_id: String(taskID)
              }
            ],
            version_id: "31104338375848389"
          };

          const form = {
            app_id: "2220391788200892",
            payload: JSON.stringify(requestPayload),
            request_id: reqID,
            type: 3
          };

          const handleRes = (topic: string, message: Buffer): void => {
            if (topic !== "/ls_resp") return;

            let jsonMsg: any;
            try {
              jsonMsg = JSON.parse(message.toString());
              if (typeof jsonMsg.payload === "string") {
                try {
                  jsonMsg.payload = JSON.parse(jsonMsg.payload);
                } catch {
                  // ignore parse error, keep raw payload
                }
              }
            } catch {
              return;
            }

            if (jsonMsg.request_id !== reqID) return;

            anyCtx.mqttClient?.removeListener("message", handleRes);

            const rawPayload =
              typeof jsonMsg.payload === "string"
                ? jsonMsg.payload
                : JSON.stringify(jsonMsg.payload ?? {});

            let parsed: GroupInviteJson | undefined;
            try {
              parsed = decodeGroupInviteFromLsResp(rawPayload);
            } catch (e) {
              const msg =
                e instanceof Error ? e.message : String(e ?? "unknown error");
              log.warn(
                `fetchPendingGroupInvite decodeGroupInviteFromLsResp error: ${msg}`
              );
            }

            const result: FetchPendingGroupInviteResult = {
              success: true,
              response: jsonMsg.payload,
              parsed
            };
            resolveOnce(result);
          };

          anyCtx.mqttClient?.on("message", handleRes);

          anyCtx.mqttClient?.publish(
            MQTT_TOPIC,
            JSON.stringify(form),
            { qos: MQTT_QOS, retain: false },
            (err: unknown) => {
              if (err) {
                (err as any).retryable = true;
                anyCtx.mqttClient?.removeListener("message", handleRes);
                return rejectOnce(err);
              }
            }
          );
        });

      withRetry(sendOnce)
        .then(result => {
          cb(null, result);
          resolve(result);
        })
        .catch(err => {
          const msg =
            err instanceof Error ? err.message : String(err ?? "unknown error");
          log.error(`fetchPendingGroupInvite failed: ${msg}`);
          cb(err);
          reject(err);
        });
    });
  };
}
