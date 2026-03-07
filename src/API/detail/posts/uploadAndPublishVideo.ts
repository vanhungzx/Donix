"use strict";

import logger from "@log";
import type { Context } from "@types";
import { Readable } from "node:stream";
import type { DefaultFuncs } from "../../request/formatters/helpers";
import uploadVideoWebV2 from "../media/uploadVideoWebV2";
import publishVideoPost from "./publishVideoPost";

interface UploadAndPublishVideoOptions {
  videoPath: string | Buffer | Readable;
  message?: string;
  groupID?: string;
  allowUserID?: string | string[];
  baseState?: 1 | 2 | 3; // 1 = EVERYONE, 2 = FRIENDS, 3 = SELF
  isFbShort?: boolean;
  enableRemix?: boolean;
  autoGenCaptions?: boolean;
  targetId?: string;
  source?: string;
  composerEntryPointRef?: string;
}

interface UploadAndPublishVideoResult {
  video_id: string;
  waterfall_id: string;
  post_id?: string;
  url?: string;
  story?: unknown;
}

type UploadAndPublishVideoCallback = (err: Error | null, data?: UploadAndPublishVideoResult) => void;

export default function (
  defaultFuncs: DefaultFuncs,
  api: unknown,
  ctx: Context
): (
  options: UploadAndPublishVideoOptions | UploadAndPublishVideoCallback,
  callback?: UploadAndPublishVideoCallback
) => Promise<UploadAndPublishVideoResult> {
  return async function uploadAndPublishVideo(
    options: UploadAndPublishVideoOptions | UploadAndPublishVideoCallback,
    callback?: UploadAndPublishVideoCallback
  ): Promise<UploadAndPublishVideoResult> {
    let resolveFunc: (value: UploadAndPublishVideoResult) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<UploadAndPublishVideoResult>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    let opts: UploadAndPublishVideoOptions;
    if (typeof options === "function") {
      const error = new Error("videoPath is required");
      callback?.(error);
      rejectFunc(error);
      return returnPromise;
    } else {
      opts = options || {};
    }

    if (!opts.videoPath) {
      const error = new Error("videoPath is required");
      callback?.(error);
      rejectFunc(error);
      return returnPromise;
    }

    const cb: UploadAndPublishVideoCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        if (data) resolveFunc(data);
      });

    (async () => {
      try {
        logger.info(`[uploadAndPublishVideo] Starting upload and publish process`);

        // Step 1: Upload video
        const uploadResult = await uploadVideoWebV2(defaultFuncs, api, ctx)({
          videoPath: opts.videoPath,
          targetId: opts.targetId,
          source: opts.source,
          composerEntryPointRef: opts.composerEntryPointRef,
        });

        logger.info(`[uploadAndPublishVideo] Video uploaded successfully - videoId: ${uploadResult.video_id}`);

        // Step 2: Publish video post
        const publishResult = await publishVideoPost(defaultFuncs, api, ctx)({
          videoId: uploadResult.video_id,
          message: opts.message,
          baseState: opts.baseState,
          isFbShort: opts.isFbShort,
          enableRemix: opts.enableRemix,
        });

        logger.success(`[uploadAndPublishVideo] Video published successfully - post_id: ${publishResult.post_id || "N/A"}, url: ${publishResult.url || "N/A"}`);

        const result: UploadAndPublishVideoResult = {
          video_id: uploadResult.video_id,
          waterfall_id: uploadResult.waterfall_id,
          post_id: publishResult.post_id ?? undefined,
          url: publishResult.url ?? undefined,
          story: publishResult.story,
        };

        cb(null, result);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[uploadAndPublishVideo] Failed - ${error.message}${error.stack ? `\nStack: ${error.stack}` : ""}`);
        cb(error);
      }
    })();

    return returnPromise;
  };
}
