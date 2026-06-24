import type { DefaultFuncs, MQTTContext } from "@core/types";
import logger from "@log";
import { generateOfflineThreadingID } from "../../request/formatters/index";

interface UnsendMessageResult {
  success?: boolean;
  body?: string;
  messageID?: string;
}

interface UnsendMessageCallback {
  (err: Error | null, data?: UnsendMessageResult): void;
}

export default function (
  _defaultFuncs: DefaultFuncs,
  _client: any,
  ctx: MQTTContext
): (
  messageID: string,
  threadID: string | number,
  callback?: UnsendMessageCallback
) => Promise<UnsendMessageResult> {
  return function unsendMessage(
    messageID: string,
    threadID: string | number,
    callback?: UnsendMessageCallback
  ): Promise<UnsendMessageResult> {
    return new Promise((resolve, reject) => {
      if (!ctx.mqttClient) {
        const err = new Error("Not connected to MQTT");
        callback?.(err);
        return reject(err);
      }

      const reqID = (ctx.wsReqNumber = (ctx.wsReqNumber || 0) + 1);
      const taskID = (ctx.wsTaskNumber = (ctx.wsTaskNumber || 0) + 1);

      const APP_ID = "2220391788200892";
      const VERSION_ID = "31104338375848389";
      const REQUEST_TYPE = 3;

      const taskPayload = {
        message_id: messageID,
        thread_key: String(threadID),
        sync_group: 1,
      };

      const task = {
        failure_count: null,
        label: "33",
        payload: JSON.stringify(taskPayload),
        queue_name: "unsend_message",
        task_id: taskID,
      };

      const content = {
        app_id: APP_ID,
        payload: JSON.stringify({
          tasks: [task],
          epoch_id: generateOfflineThreadingID(),
          version_id: VERSION_ID,
        }),
        request_id: reqID,
        type: REQUEST_TYPE,
      };

      try {
        ctx.mqttClient.publish("/ls_req", JSON.stringify(content), {
          qos: 1 as const,
          retain: false,
        });
      } catch (err: any) {
        logger.error(`unsendMessage (MQTT publish failed): ${err.message || err}`);
        callback?.(err);
        return reject(err);
      }

      const handleRes = (topic: string, message: Buffer): void => {
        if (topic !== "/ls_resp") return;

        let jsonMsg: any;
        try {
          jsonMsg = JSON.parse(message.toString());
          jsonMsg.payload = JSON.parse(jsonMsg.payload);
        } catch (err) {
          return;
        }

        if (jsonMsg.request_id !== reqID) return;

        ctx.mqttClient?.removeListener("message", handleRes);

        try {
          const msgID = jsonMsg.payload.step?.[1]?.[2]?.[2]?.[1]?.[2];
          const msgReplace = jsonMsg.payload.step?.[1]?.[2]?.[2]?.[1]?.[4];

          if (msgID && msgReplace) {
            const bodies: UnsendMessageResult = {
              body: msgReplace,
              messageID: msgID,
            };

            callback?.(null, bodies);
            return resolve(bodies);
          } else {
            const result: UnsendMessageResult = { success: true };
            callback?.(null, result);
            return resolve(result);
          }
        } catch (err) {
          const result: UnsendMessageResult = { success: true };
          callback?.(null, result);
          return resolve(result);
        }
      };

      ctx.mqttClient.on("message", handleRes);
    });
  };
}
