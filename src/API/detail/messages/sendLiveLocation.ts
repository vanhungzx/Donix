import log from "@log";
import { generateOfflineThreadingID } from "../../request/formatters/index";
import type { Context, DefaultFuncs } from "../../request/formatters/helpers";

const MQTT_TOPIC = "/ls_req";
const MQTT_QOS = 1;

interface LiveLocation {
  latitude: number;
  longitude: number;
  expiration_timestamp_ms?: number;
  duration?: number;
  geo_timestamp_ms?: number;
  start_timestamp_ms?: number;
}

interface SendLiveLocationResult {
  success: boolean;
  response: unknown;
}

type SendLiveLocationCallback = (err: unknown, result?: SendLiveLocationResult) => void;

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

const toNum = (x: unknown): number | string => {
  const s = String(x);
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n)) {
      return n;
    }
  }
  return s;
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
      await new Promise((r) =>
        setTimeout(r, Math.min(800 * Math.pow(1.3, i), 3000))
      );
      last = e;
    }
  }
  throw last;
};

export default function sendLiveLocationFactory(
  _def: DefaultFuncs,
  _api: any,
  ctx: Context
) {
  return function sendLiveLocation(
    location: LiveLocation,
    threadID: string | number,
    callback?: SendLiveLocationCallback
  ): Promise<SendLiveLocationResult> {
    const cb: SendLiveLocationCallback =
      typeof callback === "function" ? callback : () => { };

    return new Promise<SendLiveLocationResult>((resolve, reject) => {
      if (!mqttOk(ctx)) {
        const err = new Error("MQTT client is not connected");
        log.error("sendLiveLocation", err);
        cb(err);
        return reject(err);
      }

      if (
        !location ||
        location.latitude == null ||
        location.longitude == null
      ) {
        const err = new Error("Live location requires latitude and longitude");
        cb(err);
        return reject(err);
      }

      if (!threadID) {
        const err = new Error("Missing threadID");
        cb(err);
        return reject(err);
      }

      const sendOnce = (): Promise<SendLiveLocationResult> =>
        new Promise((resolveOnce, rejectOnce) => {
          const anyCtx = ctx as any;
          const reqID = (anyCtx.wsReqNumber = (anyCtx.wsReqNumber || 0) + 1);
          const taskID = (anyCtx.wsTaskNumber = (anyCtx.wsTaskNumber || 0) + 1);
          const now = Date.now();

          const expirationMs =
            location.expiration_timestamp_ms ||
            now + (location.duration || 3600000); // Default 1 hour
          const geoTimestampMs = location.geo_timestamp_ms || now;
          const startTimestampMs = location.start_timestamp_ms || now;

          const payload = {
            epoch_id: generateOfflineThreadingID(),
            tasks: [
              {
                failure_count: null as null | number,
                label: "250",
                payload: JSON.stringify({
                  expiration_timestamp_ms: expirationMs,
                  geo_timestamp_ms: geoTimestampMs,
                  latitude: location.latitude,
                  longitude: location.longitude,
                  start_timestamp_ms: startTimestampMs,
                  thread_key: toNum(threadID),
                }),
                queue_name: "live_location_session",
                task_id: String(taskID),
              },
            ],
            version_id: "31104338375848389",
          };

          const form = {
            app_id: "2220391788200892",
            payload: JSON.stringify(payload),
            request_id: reqID,
            type: 3,
          };

          anyCtx.mqttClient?.publish(
            MQTT_TOPIC,
            JSON.stringify(form),
            { qos: MQTT_QOS, retain: false },
            (err: unknown) => {
              if (err) {
                (err as any).retryable = true;
                return rejectOnce(err);
              }
              const result: SendLiveLocationResult = {
                success: true,
                response: null,
              };
              resolveOnce(result);
            }
          );
        });

      withRetry(sendOnce, 1)
        .then((result) => {
          cb(null, result);
          resolve(result);
        })
        .catch((err) => {
          log.error("sendLiveLocation", err);
          cb(err);
          reject(err);
        });
    });
  };
}
