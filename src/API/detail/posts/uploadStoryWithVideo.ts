"use strict";

import fs from "fs";
import { Readable } from "node:stream";
import logger from "@log";
import type { Context } from "@types";
import { v4 as uuidv4 } from "uuid";
import { type DefaultFuncs } from "../../request/formatters/helpers";

interface UploadStoryWithVideoOptions {
  videoPath: string | Buffer | Readable;
  targetId?: string;
  composerSessionId?: string;
}

interface UploadStoryWithVideoResult {
  story_id?: string;
  story?: unknown;
  url?: string;
  video_id?: string;
}

type UploadStoryWithVideoCallback = (err: Error | null, data?: UploadStoryWithVideoResult) => void;

export default function (
  _defaultFuncs: DefaultFuncs,
  api: any,
  ctx: Context
): (options: UploadStoryWithVideoOptions | UploadStoryWithVideoCallback, callback?: UploadStoryWithVideoCallback) => Promise<UploadStoryWithVideoResult> {
  return function uploadStoryWithVideo(
    options: UploadStoryWithVideoOptions | UploadStoryWithVideoCallback,
    callback?: UploadStoryWithVideoCallback
  ): Promise<UploadStoryWithVideoResult> {
    let resolveFunc: (value: UploadStoryWithVideoResult) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<UploadStoryWithVideoResult>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    let opts: UploadStoryWithVideoOptions;
    if (typeof options === "function") {
      callback = options as UploadStoryWithVideoCallback;
      const error = new Error("videoPath is required");
      callback(error);
      return returnPromise;
    } else {
      opts = (options || {}) as UploadStoryWithVideoOptions;
    }

    if (!opts.videoPath) {
      const error = new Error("videoPath is required");
      callback?.(error);
      rejectFunc(error);
      return returnPromise;
    }

    const cb: UploadStoryWithVideoCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        if (data) resolveFunc(data);
      });

    (async () => {
      try {
        const targetId = opts.targetId || ctx.userID;
        const composerSessionId = opts.composerSessionId || uuidv4();

        // Step 1: Upload video using uploadVideoWebV2
        logger.info(`[uploadStoryWithVideo] Uploading video...`);

        // Check if uploadVideoWebV2 is available
        if (!api?.uploadVideoWebV2) {
          throw new Error("uploadVideoWebV2 is not available. Please ensure it's loaded.");
        }

        // Prepare video input
        let videoInput: string | Buffer | Readable;
        if (Buffer.isBuffer(opts.videoPath) || opts.videoPath instanceof Readable) {
          // For Buffer or Stream, we need to save to temp file first
          // Or handle it differently - for now, require file path
          throw new Error("Buffer and Stream inputs are not yet supported. Please provide a file path.");
        } else if (typeof opts.videoPath === "string") {
          if (!fs.existsSync(opts.videoPath)) {
            throw new Error(`Video file not found: ${opts.videoPath}`);
          }
          videoInput = opts.videoPath;
        } else {
          throw new Error("Invalid videoPath type");
        }

        // Upload video
        const uploadResult = await api.uploadVideoWebV2({
          videoPath: videoInput,
          targetId: targetId,
          source: "stories",
        });

        if (!uploadResult?.video_id) {
          throw new Error("Failed to upload video: No video_id returned");
        }

        const videoId = uploadResult.video_id;
        logger.success(`[uploadStoryWithVideo] Video uploaded successfully - video_id: ${videoId}`);

        // Step 2: Publish video story using publishVideoStory
        logger.info(`[uploadStoryWithVideo] Publishing video story...`);

        if (!api?.publishVideoStory) {
          throw new Error("publishVideoStory is not available. Please ensure it's loaded.");
        }

        const storyResult = await api.publishVideoStory({
          videoId: videoId,
          targetId: targetId,
          composerSessionId: composerSessionId,
        });

        if (!storyResult?.story_id) {
          throw new Error("Failed to publish video story: No story_id returned");
        }

        const result: UploadStoryWithVideoResult = {
          story_id: storyResult.story_id,
          url: storyResult.url,
          video_id: videoId,
          story: storyResult.story,
        };

        logger.success(`[uploadStoryWithVideo] Successfully created video story - story_id: ${result.story_id || "N/A"}, video_id: ${videoId}`);
        cb(null, result);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[uploadStoryWithVideo] Exception occurred - ${error.message}${error.stack ? `\nStack: ${error.stack}` : ""}`);
        cb(error);
      }
    })();

    return returnPromise;
  };
}
