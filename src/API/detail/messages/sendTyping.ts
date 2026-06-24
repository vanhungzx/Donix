"use strict";

import logger from "@log";
import type { DefaultFuncs, MQTTContext } from '@types';
import { getType } from "../../request/formatters/index";

interface TypingOptions {
  duration?: number | null;
  autoStop?: boolean;
  type?: number;
  isGroup?: boolean;
}

interface TypingPayload {
  thread_key: string | number;
  is_group_thread: number;
  is_typing: number;
  attribution: number;
  sync_group: number;
  thread_type: number;
}

interface TypingRequestPayload {
  label: string;
  payload: string;
  version: string;
}

interface TypingRequestForm {
  app_id: string;
  payload: string;
  request_id: number;
  type: number;
}

type SendTypingCallback = (error: Error | null, result?: boolean) => void;

export default function (
  _defaultFuncs: DefaultFuncs,
  _client: any,
  ctx: MQTTContext
): (
  threadID: string | number | (string | number)[],
  isTyping: boolean,
  options?: TypingOptions | SendTypingCallback,
  callback?: SendTypingCallback
) => Promise<boolean> {
  return function sendTyping(
    threadID: string | number | (string | number)[],
    isTyping: boolean,
    options?: TypingOptions | SendTypingCallback,
    callback?: SendTypingCallback
  ): Promise<boolean> {
    return new Promise<boolean>((resolve, reject): void => {

      if (
        getType(options) === "Function" ||
        getType(options) === "AsyncFunction"
      ) {
        callback = options as SendTypingCallback;
        options = {};
      }

      const typingOptions: TypingOptions = (options as TypingOptions) || {};

      if (
        !callback ||
        (getType(callback) !== "Function" &&
          getType(callback) !== "AsyncFunction")
      ) {
        callback = (err: Error | null, data?: boolean): void => {
          if (err) return reject(err);
          resolve(data ?? true);
        };
      }

      if (!threadID) {
        const err = new Error("threadID is required");
        callback(err);
        return reject(err);
      }

      const appId: string =
        (ctx as any).TYPING_APP_ID ||
        (ctx as any).typingAppId ||
        "772021112871879";

      const version: string =
        (ctx as any).TYPING_VERSION ||
        (ctx as any).typingVersion ||
        "8965252033599983";

      const duration: number =
        typingOptions.duration == null ? 1200 : typingOptions.duration;

      const autoStop: boolean = typingOptions.autoStop !== false;

      const attribution: number = typingOptions.type || 0;

      const isGroupDefault: number =
        typingOptions.isGroup === true
          ? 1
          : typingOptions.isGroup === false
            ? 0
            : 1;

      const threadIDs: (string | number)[] = Array.isArray(threadID)
        ? threadID
        : [threadID];

      const client = ctx.mqttClient;

      if (!client || !client.publish) {
        const err = new Error("mqtt client not available");
        callback(err);
        return reject(err);
      }

      function publishTyping(tid: string | number, on: boolean): void {
        const isGroupThread: number = isGroupDefault;

        const threadType: number = isGroupThread ? 2 : 1;

        let key: string | number = parseInt(String(tid), 10);

        if (!Number.isFinite(key)) {
          key = String(tid);
        }

        ctx.req_ID = ((ctx as any).req_ID || 0) + 1;

        const typingPayload: TypingPayload = {
          thread_key: key,
          is_group_thread: isGroupThread,
          is_typing: on ? 1 : 0,
          attribution: attribution,
          sync_group: 1,
          thread_type: threadType,
        };

        const requestPayload: TypingRequestPayload = {
          label: "3",
          payload: JSON.stringify(typingPayload),
          version: String(version),
        };

        const form: TypingRequestForm = {
          app_id: appId,
          payload: JSON.stringify(requestPayload),
          request_id: (ctx as any).req_ID,
          type: 4,
        };

        try {
          client?.publish("/ls_req", JSON.stringify(form), {
            qos: 1,
            retain: false,
          });
        } catch (err) {
          logger.error(err as string);
        }
      }

      try {
        for (let i = 0; i < threadIDs.length; i++) {
          const tid = threadIDs[i];
          if (tid !== undefined) {
            publishTyping(tid, !!isTyping);
          }
        }

        if (isTyping && autoStop) {
          setTimeout((): void => {
            for (let j = 0; j < threadIDs.length; j++) {
              const tid = threadIDs[j];
              if (tid !== undefined) {
                publishTyping(tid, false);
              }
            }
          }, duration);
        }

        callback(null, true);
        resolve(true);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        callback(error);
        reject(error);
      }
    });
  };
}
