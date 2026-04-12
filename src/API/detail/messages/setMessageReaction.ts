import type { DefaultFuncs, MQTTContext } from "@core/types";
import logger from "@log";
import {
  generateOfflineThreadingID,
  getCurrentTimestamp,
} from "../../request/formatters";

interface SetMessageReactionResult {
  success: boolean;
}

interface SetMessageReactionCallback {
  (err: Error | null, data?: SetMessageReactionResult): void;
}

export default function (
  _defaultFuncs: DefaultFuncs,
  _client: any,
  ctx: MQTTContext
): (
  reaction: string,
  messageID: string,
  threadID: string | number,
  callback?: SetMessageReactionCallback
) => Promise<SetMessageReactionResult> {
  return function setMessageReaction(
    reaction: string,
    messageID: string,
    threadID: string | number,
    callback?: SetMessageReactionCallback
  ): Promise<SetMessageReactionResult> {
    return new Promise((resolve, reject) => {
      if (!ctx.mqttClient) {
        const err = new Error("MQTT client not connected");
        if (typeof callback === "function") callback(err);
        return reject(err);
      }

      if (!reaction || !messageID || !threadID) {
        const err = new Error("Missing required parameters");
        if (typeof callback === "function") callback(err);
        return reject(err);
      }

      const reqID = (ctx.wsReqNumber = (ctx.wsReqNumber || 0) + 1);
      const taskID = (ctx.wsTaskNumber = (ctx.wsTaskNumber || 0) + 1);

      const APP_ID = "2220391788200892";
      const VERSION_ID = "31104338375848389";
      const REQUEST_TYPE = 3;

      const dataclassParams = JSON.stringify({
        logging_metadata: {
          feature_tags: ["IS_NOT_DIALTONE", "IS_NOT_DIALTONE"],
        },
      });

      const taskPayload = {
        thread_key: String(threadID),
        timestamp_ms: getCurrentTimestamp(),
        message_id: messageID,
        reaction,
        actor_id: ctx.userID,
        reaction_style: null,
        sync_group: 1,
        send_attribution: null,
        dataclass_params: dataclassParams,
        attachment_fbid: null,
      };

      const task = {
        failure_count: null,
        label: "29",
        payload: JSON.stringify(taskPayload),
        queue_name: JSON.stringify(["reaction", messageID]),
        task_id: taskID,
      };

      const mqttForm = {
        app_id: APP_ID,
        payload: JSON.stringify({
          data_trace_id: null,
          epoch_id: parseInt(generateOfflineThreadingID()),
          tasks: [task],
          version_id: VERSION_ID,
        }),
        request_id: reqID,
        type: REQUEST_TYPE,
      };

      const handleResponse = (topic: string, message: Buffer): void => {
        if (topic !== "/ls_resp") return;

        let json: any;
        try {
          json = JSON.parse(message.toString());
          json.payload = JSON.parse(json.payload);
        } catch {
          return;
        }

        if (json.request_id !== reqID) return;

        ctx.mqttClient?.removeListener("message", handleResponse);

        const result: SetMessageReactionResult = { success: true };
        if (typeof callback === "function") callback(null, result);
        return resolve(result);
      };

      ctx.mqttClient.on("message", handleResponse);

      ctx.mqttClient.publish(
        "/ls_req",
        JSON.stringify(mqttForm),
        { qos: 1 as const, retain: false },
        (err: any) => {
          if (err) {
            ctx.mqttClient?.removeListener("message", handleResponse);
            logger.error(`setMessageReaction: ${err.message || err}`);
            if (typeof callback === "function") callback(err);
            return reject(err);
          }
        }
      );
    });
  };
}
