"use strict";

import type { DefaultFuncs, MQTTContext } from "@core/types";
import type stream from "node:stream";
import { generateOfflineThreadingID } from "../../request/formatters/index";
import { parseAndCheckLogin } from "../../request/formatters/helpers";

type UploadForm = Record<string, stream.Readable | string | Buffer>;

interface UploadMetadata {
  image_id?: string;
  [key: string]: unknown;
}

interface UploadPayload {
  metadata?: UploadMetadata[];
  [key: string]: unknown;
}

interface UploadResponse {
  error?: unknown;
  payload?: UploadPayload;
  [key: string]: unknown;
}

interface TaskPayload {
  thread_key: string;
  image_id: string;
  sync_group: number;
}

interface Task {
  failure_count: null;
  label: string;
  payload: string; // JSON stringified TaskPayload
  queue_name: string;
  task_id: number;
}

interface MqttPayload {
  epoch_id: string;
  tasks: Task[];
  version_id: string;
}

interface MqttRequest {
  app_id: string;
  payload: string; // JSON stringified MqttPayload
  request_id: number;
  type: number;
}

type ChangeGroupImageResponse = {
  success: boolean;
  // The shape of this response is controlled by Facebook's MQTT API and is not
  // fully documented, so we keep it as unknown but non-any.
  response: unknown;
};

type ChangeGroupImageCallback = (
  error: Error | null,
  result?: ChangeGroupImageResponse
) => void;

type ImageInput = stream.Readable | string | Buffer;

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: MQTTContext
): (
  image: ImageInput,
  threadID: string,
  callback?: ChangeGroupImageCallback
) => Promise<ChangeGroupImageResponse> {
  function handleUpload(image: ImageInput): Promise<{ image_id: string }> {
    if (!ctx.fb_dtsg) {
      throw new Error("fb_dtsg is required for upload");
    }

    const form: UploadForm = {
      images_only: "true",
      fb_dtsg: ctx.fb_dtsg,
      "attachment[]": image,
    };

    const userId = ctx.userID || "";
    const uploadUrl = new URL(
      "https://www.facebook.com/ajax/mercury/upload.php"
    );
    uploadUrl.searchParams.set("__aaid", "0");
    if (userId) uploadUrl.searchParams.set("__user", String(userId));
    uploadUrl.searchParams.set("__a", "1");
    uploadUrl.searchParams.set("__req", "3");

    return defaultFuncs
      .postFormData(
        uploadUrl.toString(),
        ctx.jar,
        // postFormData expects a key/value bag; runtime supports streams for attachment
        form as Record<string, string | number | boolean | null | undefined>,
        {}
      )
      .then(parseAndCheckLogin(ctx, defaultFuncs))
      .then((res) => {
        const resData = res as UploadResponse;
        if (resData.error) throw resData;
        if (!resData.payload?.metadata?.[0]?.image_id) {
          throw new Error("Upload failed: no image_id in response");
        }
        return resData.payload.metadata[0] as { image_id: string };
      });
  }

  return function changeGroupImage(
    image: ImageInput,
    threadID: string,
    callback?: ChangeGroupImageCallback
  ): Promise<ChangeGroupImageResponse> {
    return new Promise<ChangeGroupImageResponse>(
      (resolve, reject): void => {
        if (!ctx.mqttClient) {
          const err = new Error("Not connected to MQTT");
          callback?.(err);
          return reject(err);
        }

        if (!threadID || typeof threadID !== "string") {
          const err = new Error("Invalid threadID");
          callback?.(err);
          return reject(err);
        }

        const reqID: number = ++ctx.wsReqNumber;
        const taskID: number = ++ctx.wsTaskNumber;

        const onResponse = (topic: string, message: Buffer): void => {
          if (topic !== "/ls_resp") return;

          let jsonMsg: {
            request_id?: number;
            payload?: string | unknown;
          };

          try {
            jsonMsg = JSON.parse(message.toString());
            jsonMsg.payload = JSON.parse(jsonMsg.payload as string);
          } catch (err) {
            return;
          }

          if (jsonMsg.request_id !== reqID) return;

          ctx.mqttClient?.removeListener("message", onResponse);

          const result: ChangeGroupImageResponse = {
            success: true,
            response: jsonMsg.payload,
          };

          callback?.(null, result);
          resolve(result);
        };

        ctx.mqttClient.on("message", onResponse);

        handleUpload(image)
          .then((payload: { image_id: string }) => {
            const imageID = payload.image_id;

            const taskPayload: TaskPayload = {
              thread_key: threadID,
              image_id: imageID,
              sync_group: 1,
            };

            const mqttPayload: MqttPayload = {
              epoch_id: generateOfflineThreadingID(),
              tasks: [
                {
                  failure_count: null,
                  label: "37",
                  payload: JSON.stringify(taskPayload),
                  queue_name: "thread_image",
                  task_id: taskID,
                },
              ],
              version_id: "30516460601335759",
            };

            const request: MqttRequest = {
              app_id: "772021112871879",
              payload: JSON.stringify(mqttPayload),
              request_id: reqID,
              type: 3,
            };

            ctx.mqttClient?.publish("/ls_req", JSON.stringify(request), {
              qos: 1,
              retain: false,
            });
          })
          .catch((err: unknown) => {
            ctx.mqttClient?.removeListener("message", onResponse);
            console.error("changeGroupImageMqtt", err);
            const error = err instanceof Error ? err : new Error(String(err));
            callback?.(error);
            reject(error);
          });
      }
    );
  };
}
