"use strict";

import logger from "@log";
import type { DefaultFuncs, MQTTContext } from "@types";
import { generateOfflineThreadingID } from "../../request/formatters";

const DEFAULT_APP_ID = "2220391788200892";
const DEFAULT_VERSION_ID = "25150404991310813";

const LABEL_MAGIC_WORDS = "348";
const REQUEST_TYPE = 3;

interface MagicWordEntry {
  emoji: string;
  selection_type?: string | null;
}

interface UpdateMagicWordsOptions {
  appId?: string;
  versionId?: string;
  timeoutMs?: number;
}

interface UpdateMagicWordsResponse {
  success: boolean;
  response: any;
}

type UpdateMagicWordsCallback = (
  error: Error | null,
  result?: UpdateMagicWordsResponse
) => void;

type MagicWordsMap = Record<string, MagicWordEntry>;

export default function (
  _defaultFuncs: DefaultFuncs,
  _api: any,
  ctx: MQTTContext
): (
  
  text: string,
  emoji: string,
  threadID: string | number,
  callback?: UpdateMagicWordsCallback
) => Promise<UpdateMagicWordsResponse> & {
  
  raw: (
    threadID: string | number,
    magicWordsToAdd: MagicWordsMap,
    magicWordsToRemove?: string[],
    options?: UpdateMagicWordsOptions | UpdateMagicWordsCallback,
    callback?: UpdateMagicWordsCallback
  ) => Promise<UpdateMagicWordsResponse>;
} {
  function coreUpdateMagicWords(
    threadID: string | number,
    magicWordsToAdd: MagicWordsMap,
    magicWordsToRemove: string[] = [],
    options: UpdateMagicWordsOptions | UpdateMagicWordsCallback = {},
    callback?: UpdateMagicWordsCallback
  ): Promise<UpdateMagicWordsResponse> {
    return new Promise<UpdateMagicWordsResponse>((resolve, reject) => {
      if (
        typeof options === "function" ||
        Object.prototype.toString.call(options).includes("Function")
      ) {
        callback = options as UpdateMagicWordsCallback;
        options = {};
      }

      const cb =
        typeof callback === "function"
          ? callback
          : () => {
            
          };

      if (!ctx.mqttClient || typeof ctx.mqttClient.publish !== "function") {
        const err = new Error("MQTT client is not connected");
        cb(err);
        return reject(err);
      }

      if ((typeof threadID !== "string" && typeof threadID !== "number") || !threadID) {
        const err = new Error("threadID must be a string or number");
        cb(err);
        return reject(err);
      }

      const hasAdd =
        !!magicWordsToAdd &&
        typeof magicWordsToAdd === "object" &&
        Object.keys(magicWordsToAdd).length > 0;
      const hasRemove =
        Array.isArray(magicWordsToRemove) && magicWordsToRemove.length > 0;

      if (!hasAdd && !hasRemove) {
        const err = new Error(
          "Either magicWordsToAdd or magicWordsToRemove must be non-empty"
        );
        cb(err);
        return reject(err);
      }

      const opts: UpdateMagicWordsOptions = options as UpdateMagicWordsOptions;
      const queueName = `magicwords_${String(threadID)}`;
      const reqId: number = ++ctx.wsReqNumber;
      const taskId: number = ++ctx.wsTaskNumber;

      const normalizedAdd: Record<string, MagicWordEntry> = {};
      if (hasAdd) {
        for (const [key, value] of Object.entries(magicWordsToAdd)) {
          if (!value || typeof value.emoji !== "string" || !value.emoji.trim()) {
            continue;
          }
          normalizedAdd[key] = {
            emoji: value.emoji,
            selection_type:
              value.selection_type === undefined ? null : value.selection_type,
          };
        }
      }

      const normalizedRemove = hasRemove ? magicWordsToRemove : [];

      const taskPayload = {
        magic_words_to_add: normalizedAdd,
        magic_words_to_remove: normalizedRemove,
        sync_group: 1,
        thread_key: Number(threadID) || threadID,
      };

      const envelope = {
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            failure_count: null,
            label: LABEL_MAGIC_WORDS,
            payload: JSON.stringify(taskPayload),
            queue_name: queueName,
            task_id: taskId,
          },
        ],
        version_id: opts.versionId || DEFAULT_VERSION_ID,
      };

      const form = {
        app_id: opts.appId || DEFAULT_APP_ID,
        payload: JSON.stringify(envelope),
        request_id: reqId,
        type: REQUEST_TYPE,
      };

      function onMessage(topic: string, message: Buffer): void {
        if (topic !== "/ls_resp") return;

        let json: { request_id?: number; payload?: any };
        try {
          json = JSON.parse(message.toString());
          if (typeof json.payload === "string") {
            json.payload = JSON.parse(json.payload);
          }
        } catch {
          return;
        }

        if (json.request_id !== reqId) return;

        ctx.mqttClient?.removeListener("message", onMessage);

        const result: UpdateMagicWordsResponse = {
          success: true,
          response: json.payload,
        };
        cb(null, result);
        resolve(result);
      }

      ctx.mqttClient.on("message", onMessage);

      ctx.mqttClient.publish(
        "/ls_req",
        JSON.stringify(form),
        { qos: 1, retain: false },
        (err?: Error) => {
          if (err) {
            ctx.mqttClient?.removeListener("message", onMessage);
            logger.error(`updateMagicWords publish error: ${err.message}`);
            cb(err);
            reject(err);
          }
        }
      );
    });
  }

  
  const fn = function updateMagicWords(
    text: string,
    emoji: string,
    threadID: string | number,
    callback?: UpdateMagicWordsCallback
  ): Promise<UpdateMagicWordsResponse> {
    const map: MagicWordsMap = {
      [text]: {
        emoji,
        selection_type: null,
      },
    };
    return coreUpdateMagicWords(threadID, map, [], {}, callback);
  } as any;

  
  fn.raw = coreUpdateMagicWords;

  
  fn.remove = function removeMagicWords(
    texts: string | string[],
    threadID: string | number,
    callback?: UpdateMagicWordsCallback
  ): Promise<UpdateMagicWordsResponse> {
    const list = Array.isArray(texts) ? texts : [texts];
    return coreUpdateMagicWords(threadID, {}, list, {}, callback);
  };

  return fn;
}
