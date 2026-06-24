"use strict";

import fs from "fs";
import { Readable } from "node:stream";
import logger from "@log";
import type { Context } from "@types";
import { v4 as uuidv4 } from "uuid";
import { parseAndCheckLogin, type DefaultFuncs } from "../../request/formatters/helpers";

interface UploadStoryWithImageAndMusicOptions {
  imagePath: string | Buffer | Readable;
  musicAssetId: string; // Use track.id or track.display_id from getStoryMusicList result
  targetId?: string;
  composerSessionId?: string;
  highlightStartTimeMs?: number; // Start time in milliseconds for music highlight (default: 0)
}

interface UploadStoryWithImageAndMusicResult {
  story_id?: string;
  logging_token?: string;
  photo_id?: string;
  story?: unknown;
}

type UploadStoryWithImageAndMusicCallback = (err: Error | null, data?: UploadStoryWithImageAndMusicResult) => void;

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (options: UploadStoryWithImageAndMusicOptions | UploadStoryWithImageAndMusicCallback, callback?: UploadStoryWithImageAndMusicCallback) => Promise<UploadStoryWithImageAndMusicResult> {
  return function uploadStoryWithImageAndMusic(
    options: UploadStoryWithImageAndMusicOptions | UploadStoryWithImageAndMusicCallback,
    callback?: UploadStoryWithImageAndMusicCallback
  ): Promise<UploadStoryWithImageAndMusicResult> {
    let resolveFunc: (value: UploadStoryWithImageAndMusicResult) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<UploadStoryWithImageAndMusicResult>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    let opts: UploadStoryWithImageAndMusicOptions;
    if (typeof options === "function") {
      callback = options as UploadStoryWithImageAndMusicCallback;
      const error = new Error("imagePath and musicAssetId are required");
      callback(error);
      return returnPromise;
    } else {
      opts = (options || {}) as UploadStoryWithImageAndMusicOptions;
    }

    if (!opts.imagePath || !opts.musicAssetId) {
      const error = new Error("imagePath and musicAssetId are required");
      callback?.(error);
      rejectFunc(error);
      return returnPromise;
    }

    const cb: UploadStoryWithImageAndMusicCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        if (data) resolveFunc(data);
      });

    (async () => {
      try {
        const targetId = opts.targetId || ctx.userID;
        const composerSessionId = opts.composerSessionId || uuidv4();
        const highlightStartTimeMs = opts.highlightStartTimeMs || 0;

        // Step 1: Prepare image file
        let imageStream: Readable;
        if (Buffer.isBuffer(opts.imagePath)) {
          // Convert Buffer to stream
          imageStream = Readable.from(opts.imagePath);
        } else if (typeof opts.imagePath === "string") {
          if (!fs.existsSync(opts.imagePath)) {
            throw new Error(`Image file not found: ${opts.imagePath}`);
          }
          imageStream = fs.createReadStream(opts.imagePath);
        } else {
          imageStream = opts.imagePath;
        }

        // Step 2: Upload image to Facebook
        logger.info(`[uploadStoryWithImageAndMusic] Uploading image...`);

        const uploadForm: Record<string, unknown> = {
          source: 8,
          profile_id: targetId,
          waterfallxapp: "comet_stories",
          farr: imageStream,
          upload_id: "jsc_c_y",
        };

        const uploadResponse = await defaultFuncs
          .postFormData(
            "https://upload.facebook.com/ajax/react_composer/attachments/photo/upload",
            ctx.jar,
            uploadForm as Record<string, string | number | boolean | null | undefined>
          )
          .then(parseAndCheckLogin(ctx, defaultFuncs));

        const uploadData = Array.isArray(uploadResponse) ? uploadResponse[0] : uploadResponse;
        const uploadPayload = (uploadData as { payload?: { photoID?: string | number } })?.payload;

        if (!uploadPayload?.photoID) {
          const error = new Error("Failed to upload image: No photoID returned");
          logger.error(`[uploadStoryWithImageAndMusic] ${error.message}`);
          throw error;
        }

        const photoId = String(uploadPayload.photoID);
        logger.success(`[uploadStoryWithImageAndMusic] Image uploaded successfully - photoID: ${photoId}`);

        // Step 3: Create story with image and music
        const timestamp = Date.now();
        const attributionId = `StoriesCreateRoot.react,comet.stories.create,unexpected,${timestamp},375169,,,;CometHomeRoot.react,comet.home,via_cold_start,${timestamp - 6887777},325500,4748854339,,`;

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
                  video_generation_params: {
                    music_story: {
                      audio_asset_id: opts.musicAssetId,
                      highlight_start_time_ms: highlightStartTimeMs,
                      photo_id: photoId,
                    },
                  },
                  overlays: [],
                },
              },
            ],
            tracking: [null],
            actor_id: targetId,
            client_mutation_id: "1",
          },
        };

        const form = {
          av: ctx.userID,
          fb_api_caller_class: "RelayModern",
          fb_api_req_friendly_name: "StoriesCreateMutation",
          server_timestamps: true,
          variables: JSON.stringify(variables),
          doc_id: "24226878183562473",
        };

        logger.info(`[uploadStoryWithImageAndMusic] Creating story - photoId: ${photoId}, musicAssetId: ${opts.musicAssetId}, targetId: ${targetId}, highlightStartTimeMs: ${highlightStartTimeMs}`);

        const response = await defaultFuncs
          .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
          .then(parseAndCheckLogin(ctx, defaultFuncs));

        const outArr = Array.isArray(response) ? response : [response];
        const out = (outArr[0] ?? response) as {
          data?: {
            story_create?: {
              story_id?: string | null;
              logging_token?: string;
              viewer?: {
                actor?: {
                  story_bucket?: {
                    nodes?: Array<{
                      id?: string;
                      first_story_to_show?: {
                        id?: string;
                        [key: string]: unknown;
                      };
                      [key: string]: unknown;
                    }>;
                  };
                  [key: string]: unknown;
                };
                [key: string]: unknown;
              };
              [key: string]: unknown;
            };
          };
          errors?: Array<unknown>;
          error?: unknown;
        };

        if (out.errors || out.error) {
          const errorMsg = `Failed to create story: ${JSON.stringify(out.errors || out.error)}`;
          logger.error(`[uploadStoryWithImageAndMusic] ${errorMsg}`);
          throw new Error(errorMsg);
        }

        const storyCreate = out.data?.story_create;
        const storyId = storyCreate?.story_id;
        const loggingToken = storyCreate?.logging_token;
        const firstStory = storyCreate?.viewer?.actor?.story_bucket?.nodes?.[0]?.first_story_to_show;

        if (storyId || firstStory) {
          const result: UploadStoryWithImageAndMusicResult = {
            story_id: storyId || firstStory?.id || undefined,
            logging_token: loggingToken,
            photo_id: photoId,
            story: firstStory || storyCreate,
          };
          logger.success(`[uploadStoryWithImageAndMusic] Successfully created story - story_id: ${result.story_id || "N/A"}, photo_id: ${photoId}, musicAssetId: ${opts.musicAssetId}`);
          cb(null, result);
        } else {
          // Log full response for debugging
          logger.error(`[uploadStoryWithImageAndMusic] Failed to create story - Response: ${JSON.stringify(out, null, 2)}`);
          const error = new Error("Failed to create story: No story data returned");
          cb(error);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[uploadStoryWithImageAndMusic] Exception occurred - ${error.message}${error.stack ? `\nStack: ${error.stack}` : ""}`);
        cb(error);
      }
    })();

    return returnPromise;
  };
}
