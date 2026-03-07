"use strict";

import axios from "axios";
import log from "@log";
import type { DefaultFuncs, MQTTContext } from "@types";
import { generateOfflineThreadingID } from "../../request/formatters/index";
import { getConfig } from "../../../core/configManager";

interface PinnedMessage {
  message_id: string;
  is_user_generated?: boolean;
  timestamp_precise?: string;
  snippet?: string | null;
  blob_attachments?: string | null;
  message_sender: {
    id?: string;
    name?: string;
  };
  replied_to_message?: string | null;
  eyebrow_text?: string | null;
  message_power_up?: string | null;
}

export interface PinListResult {
  threadID: string;
  pinnedMessages: PinnedMessage[];
  count: number;
}

type PinListCallback = (err: Error | null, data?: PinListResult) => void;

export default function (
  _defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: MQTTContext
): (threadID: string | number, callback?: PinListCallback) => Promise<PinListResult> {
  return async function pinList(
    threadID: string | number,
    callback?: PinListCallback
  ): Promise<PinListResult> {
    let resolveFunc: (value: PinListResult) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<PinListResult>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (typeof callback !== "function") {
      callback = (err: Error | null, data?: PinListResult) => {
        if (err) return rejectFunc(err);
        if (data) resolveFunc(data);
      };
    }

    if (!threadID) {
      const err = new Error("threadID is required");
      callback(err);
      rejectFunc(err);
      return returnPromise;
    }

    try {
      const doc_id = "1163656786482721628679297687";

      const variables = {
        thread_ids: [String(threadID)],
        medium_preview_height: 263,
        full_screen_height: 4096,
        small_preview_width: 390,
        large_preview_width: 960,
        full_screen_width: 4096,
        large_preview_height: 480,
        scale: "1.5",
        small_preview_height: 195,
        nt_context: {
          styles_id: "48aa9bafd01f10f7bc81ee10dd0b81aa",
          using_white_navbar: true,
          pixel_ratio: 1.5,
          is_push_on: true,
          bloks_version: "e4ac5d6944a7e6c15b7353672e454568871b99f82a8810e33351bd7aa0bd97ea",
        },
        medium_preview_width: 526,
        blur: 0,
      };

      const form = new URLSearchParams({
        client_doc_id: doc_id,
        method: "post",
        locale: "en_US",
        pretty: "false",
        format: "json",
        variables: JSON.stringify(variables),
        fb_api_req_friendly_name: "PinnedMessagesQuery",
        fb_api_caller_class: "graphservice",
        fb_api_analytics_tags: JSON.stringify(["GraphServices"]),
        client_trace_id: generateOfflineThreadingID(),
        server_timestamps: "true",
      });

        const config = getConfig();
        const accessToken =
          (config as any)?.token?.EAAD ||
          (config as any)?.token?.EAAAAU ||
          (config as any)?.token &&
          typeof (config as any).token === "object"
            ? (Object.values((config as any).token)[0] as string)
            : undefined;


      const response = await axios({
        method: "POST",
        url: "https://graph.facebook.com/graphql",
        headers: {
          host: "graph.facebook.com",
          "x-graphql-client-library": "graphservice",
          "content-type": "application/x-www-form-urlencoded",
          "x-fb-friendly-name": "PinnedMessagesQuery",
          authorization: `OAuth ${accessToken}`,
          "user-agent":
            "Dalvik/2.1.0 (Linux; U; Android 9; V2241A Build/PQ3A.190705.05211459) [FBAN/Orca-Android;FBAV/391.2.0.20.404;FBPN/com.facebook.orca;FBLC/en_US;FBBV/437533963;FBCR/MobiFone;FBMF/vivo;FBBD/vivo;FBDV/V2241A;FBSV/9;FBCA/x86:armeabi-v7a;FBDM/{density=1.5,width=1600,height=900};FB_FW/1;]",
          "accept-encoding": "gzip, deflate",
          "x-fb-http-engine": "Liger",
        },
        data: form.toString(),
        validateStatus: () => true,
      });

      if (response.status !== 200) {
        const err = new Error(`GraphQL request failed with status ${response.status}`);
        log.error(`[pinList] Request error: ${err.message}`);
        callback(err);
        rejectFunc(err);
        return returnPromise;
      }

      if (response.data?.errors?.length) {
        const error = new Error(
          response.data.errors[0]?.message || "GraphQL error"
        );
        log.error(`[pinList] GraphQL error: ${error.message}`);
        callback(error);
        rejectFunc(error);
        return returnPromise;
      }

      const pinnedMessages: PinnedMessage[] = [];
      const threads = response.data?.data?.message_threads || [];

      if (threads.length > 0 && threads[0].pinned_messages_v2) {
        for (const item of threads[0].pinned_messages_v2) {
          const msg = item.message;
          if (!msg) continue;

          let attachmentUrl: string | null = null;
          const blobAttachments = msg.blob_attachments || [];

          if (blobAttachments.length > 0) {
            const attach = blobAttachments[0];
            if (attach.__typename === "MessageImage") {
              attachmentUrl =
                attach.image_full_screen?.uri ||
                attach.image_large_preview?.uri ||
                null;
            } else if (attach.__typename === "MessageVideo") {
              attachmentUrl = attach.attachment_video_url || null;
            } else if (attach.__typename === "MessageAudio") {
              attachmentUrl = attach.playable_url || null;
            }
          }

          let repliedToID: string | null = null;
          if (
            msg.replied_to_message?.status === "VALID" &&
            msg.replied_to_message.message
          ) {
            repliedToID =
              msg.replied_to_message.message.message_sender?.id || null;
          }

          pinnedMessages.push({
            message_id: msg.message_id,
            is_user_generated: msg.is_user_generated,
            timestamp_precise: msg.timestamp_precise,
            snippet: msg.snippet,
            blob_attachments: attachmentUrl,
            message_sender: {
              id: msg.message_sender?.id,
              name: msg.message_sender?.messaging_actor?.name,
            },
            replied_to_message: repliedToID,
            eyebrow_text: msg.pinned_messages_v2_metadata?.eyebrow_text,
            message_power_up: msg.message_power_up?.style || null,
          });
        }
      }

      const result: PinListResult = {
        threadID: String(threadID),
        pinnedMessages,
        count: pinnedMessages.length,
      };

      callback(null, result);
      resolveFunc(result);
      return returnPromise;
    } catch (err: any) {
      const error =
        err instanceof Error ? err : new Error(String(err?.message || err));
      log.error(`[pinList] Error: ${error.message}`);
      callback(error);
      rejectFunc(error);
      return returnPromise;
    }
  };
}
