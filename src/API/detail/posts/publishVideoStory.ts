"use strict";

import logger from "@log";
import type { Context } from "@types";
import { v4 as uuidv4 } from "uuid";
import { parseAndCheckLogin, type DefaultFuncs } from "../../request/formatters/helpers";

interface PublishVideoStoryOptions {
  videoId: string;
  targetId?: string;
  composerSessionId?: string;
}

interface PublishVideoStoryResult {
  story_id?: string;
  story?: unknown;
  url?: string;
}

type PublishVideoStoryCallback = (err: Error | null, data?: PublishVideoStoryResult) => void;

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (options: PublishVideoStoryOptions | PublishVideoStoryCallback, callback?: PublishVideoStoryCallback) => Promise<PublishVideoStoryResult> {
  return function publishVideoStory(
    options: PublishVideoStoryOptions | PublishVideoStoryCallback,
    callback?: PublishVideoStoryCallback
  ): Promise<PublishVideoStoryResult> {
    let resolveFunc: (value: PublishVideoStoryResult) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<PublishVideoStoryResult>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    let opts: PublishVideoStoryOptions;
    if (typeof options === "function") {
      callback = options as PublishVideoStoryCallback;
      const error = new Error("videoId is required");
      callback(error);
      return returnPromise;
    } else {
      opts = (options || {}) as PublishVideoStoryOptions;
    }

    if (!opts.videoId) {
      const error = new Error("videoId is required");
      callback?.(error);
      rejectFunc(error);
      return returnPromise;
    }

    const cb: PublishVideoStoryCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        if (data) resolveFunc(data);
      });

    (async () => {
      try {
        const videoId = opts.videoId;
        const targetId = opts.targetId || ctx.userID;
        const composerSessionId = opts.composerSessionId || uuidv4();

        const timestamp = Date.now();
        const attributionId = `StoriesCreateRoot.react,comet.stories.create,unexpected,${timestamp},968884,,,;CometHomeRoot.react,comet.home,logo,${timestamp - 6887777},486380,4748854339,,`;

        const variables = {
          input: {
            audiences: [
              {
                stories: {
                  self: {
                    target_id: targetId,
                  },
                },
              },
            ],
            audiences_is_complete: true,
            logging: {
              composer_session_id: composerSessionId,
            },
            navigation_data: {
              attribution_id_v2: attributionId,
            },
            source: "WWW",
            attachments: [
              {
                video: {
                  id: videoId,
                  notify_when_processed: true,
                  was_created_via_unified_video_flow: {
                    was_created_via_unified_video_flow: true,
                  },
                  story_media_audio_data: {
                    raw_media_type: "VIDEO",
                  },
                  video_media_metadata: {
                    audio: {
                      audio_type: "original_audio",
                      start_time_s: 0,
                      volume_level: 1,
                    },
                    is_audio_muted: false,
                  },
                  overlays: [],
                },
              },
            ],
            tracking: [null],
            actor_id: targetId,
            client_mutation_id: Math.round(Math.random() * 100).toString(),
          },
        };

        const form = {
          av: ctx.userID,
          fb_api_caller_class: "RelayModern",
          fb_api_req_friendly_name: "StoriesCreateMutation",
          server_timestamps: true,
          variables: JSON.stringify(variables),
          doc_id: "24226878183562473",
          fb_api_analytics_tags: JSON.stringify(["qpl_active_flow_ids=884152905"]),
        };

        logger.info(`[publishVideoStory] Publishing video story - videoId: ${videoId}, targetId: ${targetId}, sessionId: ${composerSessionId}`);

        const response = await defaultFuncs
          .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
          .then(parseAndCheckLogin(ctx, defaultFuncs));

        const outArr = Array.isArray(response) ? response : [response];
        const out = (outArr[0] ?? response) as {
          data?: {
            story_create?: {
              story?: {
                id?: string;
                url?: string;
                [key: string]: unknown;
              };
            };
          };
          errors?: Array<unknown>;
          error?: unknown;
        };

        if (out.errors || out.error) {
          const errorMsg = `Failed to publish video story: ${JSON.stringify(out.errors || out.error)}`;
          logger.error(`[publishVideoStory] ${errorMsg}`);
          throw new Error(errorMsg);
        }

        const storyData = out.data?.story_create?.story;

        if (storyData) {
          const result: PublishVideoStoryResult = {
            story_id: storyData.id as string | undefined,
            url: storyData.url as string | undefined,
            story: storyData,
          };
          logger.success(`[publishVideoStory] Successfully published video story - story_id: ${result.story_id || "N/A"}, url: ${result.url || "N/A"}`);
          cb(null, result);
        } else {
          const error = new Error("Failed to publish video story: No story data returned");
          logger.error(`[publishVideoStory] ${error.message}`);
          cb(error);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[publishVideoStory] Exception occurred - ${error.message}${error.stack ? `\nStack: ${error.stack}` : ""}`);
        cb(error);
      }
    })();

    return returnPromise;
  };
}
