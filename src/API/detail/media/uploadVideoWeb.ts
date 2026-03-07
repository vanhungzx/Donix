"use strict";

import FormData from "form-data";
import fs from "fs";
import { Readable } from "node:stream";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { Context, DefaultFuncs } from "../../request/formatters/helpers";
import { parseAndCheckLogin } from "../../request/formatters/helpers";
import { get } from "../../request/index";
import { getFrom } from "../../utils/htmlParser";

interface UploadVideoWebOptions {
  videoPath?: string | Buffer | Readable;
  targetId?: string;
  source?: string;
  composerEntryPointRef?: string;
  chunkSize?: number; // Default 1MB chunks
  waitForEncode?: boolean; // Wait for video encoding to complete
  waitForCopyright?: boolean; // Wait for copyright check to complete
  maxEncodeWaitTime?: number; // Max time to wait for encode (ms), default 5 minutes
  maxCopyrightWaitTime?: number; // Max time to wait for copyright (ms), default 1 minute
  pollInterval?: number; // Poll interval for status checks (ms), default 2 seconds
}

interface UploadVideoWebResult {
  video_id: string;
  composer_session_id: string;
  waterfall_id: string;
  encode_ready?: boolean; // True if encode completed
  copyright_checked?: boolean; // True if copyright check completed
}

type UploadVideoWebCallback = (err: Error | null, data?: UploadVideoWebResult) => void;

const DEFAULT_CHUNK_SIZE = 1048576; // 1MB
const DEFAULT_SOURCE = "reel_composer";
const DEFAULT_COMPOSER_ENTRY_POINT_REF = "comet_ap_plus_reel_composer_feed_sprout";
const DEFAULT_MAX_ENCODE_WAIT_TIME = 300000; // 5 minutes
const DEFAULT_MAX_COPYRIGHT_WAIT_TIME = 60000; // 1 minute
const DEFAULT_POLL_INTERVAL = 2000; // 2 seconds

function cleanJSON(x: unknown): unknown {
  if (typeof x !== "string") return x;
  const s = x.replace(/^for\s*\(;;\);\s*/i, "");
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

async function getVideoBuffer(input: string | Buffer | Readable): Promise<Buffer> {
  if (Buffer.isBuffer(input)) {
    return input;
  }

  if (typeof input === "string") {
    if (!fs.existsSync(input)) {
      throw new Error(`Video file not found: ${input}`);
    }
    return fs.readFileSync(input);
  }

  if (input instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of input) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Invalid video input");
}

async function getTokensFromContext(ctx: Context): Promise<{
  fb_dtsg: string;
  jazoest: string;
  lsd: string;
  spin_r?: string;
  spin_t?: string;
  rev?: string;
}> {
  // Try to get from context first
  const ctxAny = ctx as any;
  if (ctxAny.fb_dtsg && ctxAny.jazoest && ctxAny.lsd) {
    return {
      fb_dtsg: ctxAny.fb_dtsg,
      jazoest: ctxAny.jazoest,
      lsd: ctxAny.lsd,
      spin_r: ctxAny.spin_r,
      spin_t: ctxAny.spin_t,
      rev: ctxAny.rev,
    };
  }

  // Fetch from Facebook homepage
  const html = await get("https://www.facebook.com/", ctx.jar, undefined, ctx.options, undefined, undefined).then(
    (res) => (typeof res.data === "string" ? res.data : String(res.data || ""))
  );

  const fb_dtsg =
    getFrom(html, '"DTSGInitData",[],{"token":"', '",') ||
    html.match(/name="fb_dtsg"\s+value="([^"]+)"/)?.[1] ||
    "";

  const jazoest =
    getFrom(html, 'name="jazoest" value="', '"') ||
    getFrom(html, "jazoest=", '",') ||
    html.match(/name="jazoest"\s+value="([^"]+)"/)?.[1] ||
    "";

  const lsd = getFrom(html, '["LSD",[],{"token":"', '"}') || html.match(/name="lsd"\s+value="([^"]+)"/)?.[1] || "";

  const spin_r = html.match(/"__spin_r":(\d+)/)?.[1] || "";
  const spin_t = html.match(/"__spin_t":(\d+)/)?.[1] || "";
  const rev = html.match(/"__rev":(\d+)/)?.[1] || "";

  if (!fb_dtsg || !jazoest || !lsd) {
    throw new Error("Could not extract required tokens from Facebook");
  }

  return { fb_dtsg, jazoest, lsd, spin_r, spin_t, rev };
}

async function startUpload(
  ctx: Context,
  fileSize: number,
  fileExtension: string,
  targetId: string,
  source: string,
  composerEntryPointRef: string,
  tokens: { fb_dtsg: string; jazoest: string; lsd: string; spin_r?: string; spin_t?: string; rev?: string }
): Promise<{ video_id: string; composer_session_id: string; waterfall_id: string; start_offset: number; end_offset: number }> {
  const composerSessionId = uuidv4();
  const waterfallId = uuidv4();

  const form: Record<string, string> = {
    av: ctx.userID,
    __a: "1",
    file_size: String(fileSize),
    file_extension: fileExtension,
    target_id: targetId,
    source: source,
    composer_dialog_version: "",
    waterfall_id: waterfallId,
    composer_session_id: composerSessionId,
    composer_entry_point_ref: composerEntryPointRef,
    composer_work_shared_draft_mode: "",
    has_file_been_replaced: "false",
    supports_chunking: "true",
    supports_file_api: "true",
    partition_start_offset: "0",
    partition_end_offset: String(fileSize),
    creator_product: "2",
    spherical: "false",
    video_publisher_action_source: "",
    __aaid: "0",
    __user: ctx.userID,
    __req: "19",
    fb_dtsg: tokens.fb_dtsg,
    jazoest: tokens.jazoest,
    lsd: tokens.lsd,
  };

  if (tokens.spin_r) form.__spin_r = tokens.spin_r;
  if (tokens.spin_t) form.__spin_t = tokens.spin_t;
  if (tokens.rev) form.__rev = tokens.rev;

  const url = `https://vupload-edge.facebook.com/ajax/video/upload/requests/start/?av=${ctx.userID}&__a=1`;

  // Use got for direct control over request format
  const { default: got } = await import("got");
  const { CookieJar } = await import("tough-cookie");

  const jar = ctx.jar as any;
  const cookieJar = jar || new CookieJar();

  // Build form-urlencoded body
  const formBody = new URLSearchParams();
  for (const [key, value] of Object.entries(form)) {
    formBody.append(key, value);
  }

  const response = await got.post(url, {
    body: formBody.toString(),
    headers: {
      "accept": "*/*",
      "accept-language": "vi,en-US;q=0.9,en;q=0.8",
      "content-type": "application/x-www-form-urlencoded",
      "priority": "u=1, i",
      "sec-ch-ua": '"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "x_fb_video_waterfall_id": waterfallId,
      "Referer": "https://www.facebook.com/",
    },
    cookieJar,
    timeout: { request: 300000 }, // 5 minutes
  });

  const responseData = typeof response.body === "string" ? response.body : String(response.body || "");
  const cleaned = cleanJSON(responseData) as { payload?: { video_id?: string; start_offset?: number; end_offset?: number } };

  if (!cleaned?.payload?.video_id) {
    throw new Error(`Failed to start upload: ${JSON.stringify(cleaned)}`);
  }

  return {
    video_id: cleaned.payload.video_id,
    composer_session_id: composerSessionId,
    waterfall_id: waterfallId,
    start_offset: cleaned.payload.start_offset || 0,
    end_offset: cleaned.payload.end_offset || Math.min(DEFAULT_CHUNK_SIZE, fileSize),
  };
}

async function uploadChunk(
  ctx: Context,
  videoBuffer: Buffer,
  videoId: string,
  composerSessionId: string,
  waterfallId: string,
  startOffset: number,
  endOffset: number,
  fileSize: number,
  targetId: string,
  source: string,
  composerEntryPointRef: string,
  tokens: { fb_dtsg: string; jazoest: string; lsd: string; spin_r?: string; spin_t?: string; rev?: string },
  uploadSpeed?: number
): Promise<{ start_offset: number; end_offset: number }> {
  const chunk = videoBuffer.slice(startOffset, endOffset);

  // Build query params for URL (all params go in URL, not form data)
  const queryParams = new URLSearchParams({
    av: ctx.userID,
    composer_session_id: composerSessionId,
    video_id: videoId,
    start_offset: String(startOffset),
    end_offset: String(endOffset),
    source: source,
    target_id: targetId,
    waterfall_id: waterfallId,
    composer_entry_point_ref: composerEntryPointRef,
    composer_work_shared_draft_mode: "",
    composer_dialog_version: "",
    has_file_been_replaced: "false",
    supports_chunking: "true",
    upload_speed: uploadSpeed !== undefined ? String(uploadSpeed) : "",
    partition_start_offset: "0",
    partition_end_offset: String(fileSize),
    __aaid: "0",
    __user: ctx.userID,
    __a: "1",
    __req: "1a",
    fb_dtsg: tokens.fb_dtsg,
    jazoest: tokens.jazoest,
    lsd: tokens.lsd,
  });

  if (tokens.spin_r) queryParams.append("__spin_r", tokens.spin_r);
  if (tokens.spin_t) queryParams.append("__spin_t", tokens.spin_t);
  if (tokens.rev) queryParams.append("__rev", tokens.rev);

  const url = `https://vupload-edge.facebook.com/ajax/video/upload/requests/receive/?${queryParams.toString()}`;

  // Use got for direct control over multipart/form-data
  const { default: got } = await import("got");
  const { CookieJar } = await import("tough-cookie");

  const jar = ctx.jar as any;
  const cookieJar = jar || new CookieJar();

  // Build multipart form data
  const formData = new FormData();
  formData.append("video_file_chunk", chunk, {
    filename: "blob",
    contentType: "application/octet-stream",
  });

  let response: any;
  let responseData: string;

  try {
    response = await got.post(url, {
      body: formData,
      headers: {
        ...formData.getHeaders(),
        "accept": "*/*",
        "accept-language": "vi,en-US;q=0.9,en;q=0.8",
        "priority": "u=1, i",
        "sec-ch-ua": '"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "x_fb_video_waterfall_id": waterfallId,
        "Referer": "https://www.facebook.com/",
      },
      cookieJar,
      timeout: { request: 300000 }, // 5 minutes
    });

    responseData = typeof response.body === "string" ? response.body : String(response.body || "");
  } catch (err: any) {
    const error = err instanceof Error ? err : new Error(String(err));
    const status = err?.response?.statusCode || err?.statusCode;
    const statusText = err?.response?.statusMessage || "";
    throw new Error(`Upload chunk failed: ${error.message}${status ? ` (Status: ${status} ${statusText})` : ""}`);
  }

  // Parse response
  const cleaned = cleanJSON(responseData) as {
    payload?: { start_offset?: number; end_offset?: number };
    error?: unknown;
    errors?: Array<unknown>;
  };

  // Log response for debugging
  if (!cleaned?.payload) {
    console.error(`[uploadVideoWeb] Upload chunk failed - Response: ${responseData.substring(0, 500)}`);
    console.error(`[uploadVideoWeb] Cleaned response:`, JSON.stringify(cleaned, null, 2));

    if (cleaned?.error) {
      throw new Error(`Upload chunk failed: ${JSON.stringify(cleaned.error)}`);
    }
    if (cleaned?.errors && cleaned.errors.length > 0) {
      throw new Error(`Upload chunk failed: ${JSON.stringify(cleaned.errors)}`);
    }
    throw new Error(`Upload chunk failed: No payload returned from server. Response: ${responseData.substring(0, 200)}`);
  }

  // CRITICAL: Use server's returned offset, Facebook doesn't trust client
  return {
    start_offset: cleaned.payload.start_offset ?? endOffset,
    end_offset: cleaned.payload.end_offset ?? endOffset,
  };
}

// Phase 4a: Wait for video encoding to complete
async function waitForEncode(
  defaultFuncs: DefaultFuncs,
  ctx: Context,
  videoId: string,
  maxWaitTime: number,
  pollInterval: number
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const variables = {
        videoID: videoId,
      };

      const form = {
        av: ctx.userID,
        fb_api_caller_class: "RelayModern",
        fb_api_req_friendly_name: "CometVideoEditorCopyrightCheckDetailsLiveQueryUpdaterQuery",
        server_timestamps: true,
        variables: JSON.stringify(variables),
        doc_id: "24740975925605526",
        fb_api_analytics_tags: JSON.stringify(["qpl_active_flow_ids=884152905"]),
      };

      const response = await defaultFuncs
        .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
        .then(parseAndCheckLogin(ctx, defaultFuncs));

      const outArr = Array.isArray(response) ? response : [response];
      const out = (outArr[0] ?? response) as {
        data?: {
          video?: {
            id?: string;
            video_processing_status?: string;
            is_processing?: boolean;
            [key: string]: unknown;
          };
        };
        errors?: Array<unknown>;
        error?: unknown;
      };

      if (out.errors || out.error) {
        // If query fails, assume still processing
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        continue;
      }

      const videoData = out.data?.video;
      if (!videoData) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        continue;
      }

      // Check if video is ready (not processing)
      const isProcessing = videoData.is_processing ?? true;
      const status = videoData.video_processing_status as string | undefined;

      // If status exists and is not "PROCESSING", consider it ready
      if (status && status !== "PROCESSING" && status !== "processing") {
        return true;
      }

      // If explicitly not processing, it's ready
      if (!isProcessing) {
        return true;
      }

      // Still processing, wait and retry
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (err) {
      // On error, assume still processing and retry
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  // Timeout - return false (not confirmed ready)
  return false;
}

// Phase 4b: Check copyright (reuse existing logic)
async function checkCopyright(
  defaultFuncs: DefaultFuncs,
  ctx: Context,
  videoId: string,
  maxWaitTime: number,
  pollInterval: number
): Promise<boolean> {
  try {
    const actorId = ctx.userID;
    const fromMbs = false;

    // Start copyright check
    const clientMutationId = Math.round(Math.random() * 100).toString();
    const variables = {
      input: {
        client_mutation_id: clientMutationId,
        actor_id: actorId,
        from_mbs: fromMbs,
        video_id: videoId,
      },
    };

    const form = {
      av: ctx.userID,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "useCometVideoEditorCopyrightCheckMutation",
      server_timestamps: true,
      variables: JSON.stringify(variables),
      doc_id: "32092344190411312",
      fb_api_analytics_tags: JSON.stringify(["qpl_active_flow_ids=884152905"]),
    };

    await defaultFuncs
      .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
      .then(parseAndCheckLogin(ctx, defaultFuncs));

    // Poll copyright progress
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTime) {
      const progressVariables = {
        videoID: videoId,
      };

      const progressForm = {
        av: ctx.userID,
        fb_api_caller_class: "RelayModern",
        fb_api_req_friendly_name: "CometVideoEditorCopyrightCheckDetailsLiveQueryUpdaterQuery",
        server_timestamps: true,
        variables: JSON.stringify(progressVariables),
        doc_id: "24740975925605526",
        fb_api_analytics_tags: JSON.stringify(["qpl_active_flow_ids=884152905"]),
      };

      const response = await defaultFuncs
        .post("https://www.facebook.com/api/graphql/", ctx.jar, progressForm)
        .then(parseAndCheckLogin(ctx, defaultFuncs));

      const outArr = Array.isArray(response) ? response : [response];
      const out = (outArr[0] ?? response) as {
        data?: {
          video?: {
            copyright_precheck_progress?: {
              percentage?: number;
            };
            if_copyright_precheck_is_finished?: {
              id?: string;
            } | null;
          };
        };
        errors?: Array<unknown>;
        error?: unknown;
      };

      if (out.errors || out.error) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        continue;
      }

      const videoData = out.data?.video;
      if (!videoData) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        continue;
      }

      const progress = videoData.copyright_precheck_progress || {};
      const percentage = progress.percentage || 0;
      const finished = videoData.if_copyright_precheck_is_finished;

      // Check if finished
      if (percentage >= 100 && finished !== null) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Timeout
    return false;
  } catch (err) {
    // On error, return false (not confirmed)
    return false;
  }
}

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (options: UploadVideoWebOptions | UploadVideoWebCallback, callback?: UploadVideoWebCallback) => Promise<UploadVideoWebResult> {
  return async function uploadVideoWeb(
    options: UploadVideoWebOptions | UploadVideoWebCallback,
    callback?: UploadVideoWebCallback
  ): Promise<UploadVideoWebResult> {
    let resolveFunc: (value: UploadVideoWebResult) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<UploadVideoWebResult>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    let opts: UploadVideoWebOptions;
    if (typeof options === "function") {
      callback = options as UploadVideoWebCallback;
      opts = {};
    } else {
      opts = (options || {}) as UploadVideoWebOptions;
    }
    const cb: UploadVideoWebCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        if (data) resolveFunc(data);
      });

    (async () => {
      try {
        // ============================================
        // PHASE 1: INIT - Get video_id + session
        // ============================================
        if (!opts.videoPath) {
          throw new Error("videoPath is required");
        }

        const videoBuffer = await getVideoBuffer(opts.videoPath);
        const fileSize = videoBuffer.length;
        const fileExtension = path.extname(typeof opts.videoPath === "string" ? opts.videoPath : "video.mp4").slice(1) || "mp4";
        const targetId = opts.targetId || ctx.userID;
        const source = opts.source || DEFAULT_SOURCE;
        const composerEntryPointRef = opts.composerEntryPointRef || DEFAULT_COMPOSER_ENTRY_POINT_REF;
        const chunkSize = opts.chunkSize || DEFAULT_CHUNK_SIZE;

        const tokens = await getTokensFromContext(ctx);

        const startResult = await startUpload(ctx, fileSize, fileExtension, targetId, source, composerEntryPointRef, tokens);
        const videoId = startResult.video_id;
        const composerSessionId = startResult.composer_session_id;
        const waterfallId = startResult.waterfall_id;

        // ============================================
        // PHASE 2: UPLOAD - Send video chunks
        // ============================================
        // CRITICAL: Use server's returned offset, don't calculate
        let currentOffset = startResult.start_offset;
        let endOffset = startResult.end_offset;
        let uploadSpeed: number | undefined;

        while (true) {
          const chunkEnd = Math.min(endOffset, fileSize);
          const chunkStartTime = Date.now();

          const result = await uploadChunk(
            ctx,
            videoBuffer,
            videoId,
            composerSessionId,
            waterfallId,
            currentOffset,
            chunkEnd,
            fileSize,
            targetId,
            source,
            composerEntryPointRef,
            tokens,
            uploadSpeed
          );

          // Calculate upload speed for next chunk
          const chunkTime = (Date.now() - chunkStartTime) / 1000;
          const chunkSizeBytes = chunkEnd - currentOffset;
          uploadSpeed = chunkSizeBytes / chunkTime;

          // ============================================
          // PHASE 3: FINISH - Check if upload complete
          // ============================================
          // CRITICAL: Facebook finish condition = start_offset === end_offset
          if (result.start_offset === result.end_offset) {
            // Upload complete
            break;
          }

          // Use server's returned offset (Facebook doesn't trust client)
          currentOffset = result.end_offset;
          endOffset = Math.min(result.end_offset + chunkSize, fileSize);

          // Safety check: if offset >= fileSize, we're done
          if (currentOffset >= fileSize) {
            break;
          }
        }

        // ============================================
        // PHASE 4: PROCESS - Encode + Copyright (ASYNC)
        // ============================================
        let encodeReady = false;
        let copyrightChecked = false;

        const maxEncodeWaitTime = opts.maxEncodeWaitTime || DEFAULT_MAX_ENCODE_WAIT_TIME;
        const maxCopyrightWaitTime = opts.maxCopyrightWaitTime || DEFAULT_MAX_COPYRIGHT_WAIT_TIME;
        const pollInterval = opts.pollInterval || DEFAULT_POLL_INTERVAL;

        // Wait for encode if requested
        if (opts.waitForEncode) {
          encodeReady = await waitForEncode(defaultFuncs, ctx, videoId, maxEncodeWaitTime, pollInterval);
        }

        // Check copyright if requested
        if (opts.waitForCopyright) {
          copyrightChecked = await checkCopyright(defaultFuncs, ctx, videoId, maxCopyrightWaitTime, pollInterval);
        }

        // ============================================
        // PHASE 5: PUBLISH - (Optional, separate call)
        // ============================================
        // Note: Publish is typically done via publishVideoPost() separately
        // This function only handles upload + processing

        const result: UploadVideoWebResult = {
          video_id: videoId,
          composer_session_id: composerSessionId,
          waterfall_id: waterfallId,
        };

        if (opts.waitForEncode) {
          result.encode_ready = encodeReady;
        }

        if (opts.waitForCopyright) {
          result.copyright_checked = copyrightChecked;
        }

        cb(null, result);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        cb(error);
      }
    })();

    return returnPromise;
  };
}
