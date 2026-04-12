"use strict";

import logger from "@log";
import crypto from "crypto";
import fs from "fs";
import { Readable } from "node:stream";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { Context, DefaultFuncs } from "../../request/formatters/helpers";
import { get } from "../../request/index";
import { getFrom } from "../../utils/htmlParser";

interface UploadVideoWebV2Options {
  videoPath: string | Buffer | Readable;
  targetId?: string;
  source?: string;
  composerEntryPointRef?: string;
}

interface UploadVideoWebV2Result {
  video_id: string;
  waterfall_id: string;
}

type UploadVideoWebV2Callback = (err: Error | null, data?: UploadVideoWebV2Result) => void;

const DEFAULT_SOURCE = "newsfeed_composer";
const DEFAULT_COMPOSER_ENTRY_POINT_REF = "feed";

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

// Generate __req counter (hex format: a2, a3, a4, a5...)
function generateReqCounter(start: number = 10): () => string {
  let counter = start;
  return () => (counter++).toString(36);
}

// PHASE 1: START - Request video_id + chunk size
async function startUploadV2(
  _defaultFuncs: DefaultFuncs,
  ctx: Context,
  fileSize: number,
  fileExtension: string,
  targetId: string,
  source: string,
  composerEntryPointRef: string,
  waterfallId: string,
  getReq: () => string,
  tokens: { fb_dtsg: string; jazoest: string; lsd: string; spin_r?: string; spin_t?: string; rev?: string }
): Promise<{ video_id: string; start_offset: number; end_offset: number; skip_upload?: boolean }> {
  const ctxAny = ctx as any;

  // Build URL-encoded body from form fields
  const form: Record<string, string> = {
    av: ctx.userID,
    __a: "1",
    waterfall_id: waterfallId,
    target_id: targetId,
    source: source,
    composer_entry_point_ref: composerEntryPointRef,
    supports_chunking: "true",
    supports_file_api: "true",
    file_size: String(fileSize),
    file_extension: fileExtension,
    partition_start_offset: "0",
    partition_end_offset: String(fileSize),
    composer_dialog_version: "V2",
    video_publisher_action_source: "", // Empty string, no value
    __aaid: "0",
    __user: ctx.userID,
    __req: getReq(),
    fb_dtsg: tokens.fb_dtsg,
    jazoest: tokens.jazoest,
    lsd: tokens.lsd,
  };

  // Add optional params from context if available
  if (ctxAny.__hs) form.__hs = ctxAny.__hs;
  if (ctxAny.dpr) form.dpr = ctxAny.dpr;
  if (ctxAny.__ccg) form.__ccg = ctxAny.__ccg;
  if (tokens.rev) form.__rev = tokens.rev;
  if (ctxAny.__s) form.__s = ctxAny.__s;
  if (ctxAny.__hsi) form.__hsi = ctxAny.__hsi;
  if (ctxAny.__dyn) form.__dyn = ctxAny.__dyn;
  if (ctxAny.__csr) form.__csr = ctxAny.__csr;
  if (ctxAny.__hsdp) form.__hsdp = ctxAny.__hsdp;
  if (ctxAny.__hblp) form.__hblp = ctxAny.__hblp;
  if (ctxAny.__sjsp) form.__sjsp = ctxAny.__sjsp;
  if (ctxAny.__comet_req) form.__comet_req = ctxAny.__comet_req || "15";
  form.qpl_active_flow_ids = "884152905";

  if (tokens.spin_r) form.__spin_r = tokens.spin_r;
  if (tokens.spin_t) form.__spin_t = tokens.spin_t;
  if (ctxAny.__spin_b) form.__spin_b = ctxAny.__spin_b;
  if (ctxAny.__crn) form.__crn = ctxAny.__crn;

  const url = `https://www.facebook.com/ajax/video/upload/requests/start/?__a=1`;

  // Construct the request body as URL-encoded string
  const params = new URLSearchParams(form);
  const body = params.toString();

  // Build cookie string from jar if available (simple best-effort extraction)
  let cookie = "";
  if (ctx && ctx.jar && typeof ctx.jar.getCookieStringSync === "function") {
    cookie = ctx.jar.getCookieStringSync("https://www.facebook.com/");
  }

  logger.info(`[uploadVideoWebV2] Phase 1: Starting upload - fileSize: ${fileSize}, extension: ${fileExtension}, waterfallId: ${waterfallId}`);

  // Send the fetch request as described
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "accept": "*/*",
      "accept-language": "vi,en-US;q=0.9,en;q=0.8",
      "content-type": "application/x-www-form-urlencoded",
      "priority": "u=1, i",
      "sec-ch-prefers-color-scheme": "dark",
      "sec-ch-ua": "\"Microsoft Edge\";v=\"143\", \"Chromium\";v=\"143\", \"Not A(Brand\";v=\"24\"",
      "sec-ch-ua-full-version-list": "\"Microsoft Edge\";v=\"143.0.3650.80\", \"Chromium\";v=\"143.0.7499.110\", \"Not A(Brand\";v=\"24.0.0.0\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-model": "\"\"",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-ch-ua-platform-version": "\"19.0.0\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-asbd-id": "359341",
      "x-fb-lsd": tokens.lsd,
      "x_fb_video_waterfall_id": waterfallId, // Use correct waterfall ID
      "cookie": cookie,
      "Referer": "https://www.facebook.com/",
    },
    body,
  });

  const responseData = await response.text();
  const cleaned = cleanJSON(responseData) as {
    payload?: {
      video_id?: string;
      start_offset?: number;
      end_offset?: number;
      skip_upload?: boolean;
    };
  };

  if (!cleaned?.payload?.video_id) {
    logger.error(`[uploadVideoWebV2] Phase 1 failed - response: ${JSON.stringify(cleaned)}`);
    throw new Error(`Failed to start upload: ${JSON.stringify(cleaned)}`);
  }

  const result = {
    video_id: cleaned.payload.video_id,
    start_offset: cleaned.payload.start_offset ?? 0,
    end_offset: cleaned.payload.end_offset ?? Math.min(1048576, fileSize), // Default 1MB chunk
    skip_upload: cleaned.payload.skip_upload ?? false,
  };

  logger.info(`[uploadVideoWebV2] Phase 1 success - videoId: ${result.video_id}, start_offset: ${result.start_offset}, end_offset: ${result.end_offset}, skip_upload: ${result.skip_upload}`);

  return result;
}

// Generate upload_id from video buffer (used for rupload entity name)
function generateUploadId(videoBuffer: Buffer): string {
  // Use MD5 hash of video buffer for consistent upload_id
  const hash = crypto.createHash("md5").update(videoBuffer).digest("hex");
  return hash.substring(0, 32); // 32 chars
}

// Get filename from video path
function getVideoFileName(videoPath: string | Buffer | Readable): string {
  if (typeof videoPath === "string") {
    const fileName = path.basename(videoPath);
    return fileName || "video.mp4";
  }
  return "video.mp4";
}

// PHASE 2: RUPLOAD INIT - Check offset
async function checkRuploadOffset(
  defaultFuncs: DefaultFuncs,
  ctx: Context,
  uploadId: string,
  startOffset: number,
  _endOffset: number,
  chunkSize: number,
  getReq: () => string,
  tokens: { fb_dtsg: string; jazoest: string; lsd: string; spin_r?: string; spin_t?: string; rev?: string }
): Promise<number> {
  // Entity name format: {upload_id}-0-{chunk_size} (from dump: 71d874b95431eb437184aadcec4db419-0-1048576)
  const entityName = `${uploadId}-0-${chunkSize}`;
  const ctxAny = ctx as any;

  // Build query params (same as REQ 1)
  const queryParams = new URLSearchParams({
    __aaid: "0",
    __user: ctx.userID,
    __a: "1",
    __req: getReq(),
    fb_dtsg: tokens.fb_dtsg,
    jazoest: tokens.jazoest,
    lsd: tokens.lsd,
  });

  // Add optional params from context
  if (ctxAny.__hs) queryParams.append("__hs", ctxAny.__hs);
  if (ctxAny.dpr) queryParams.append("dpr", ctxAny.dpr);
  if (ctxAny.__ccg) queryParams.append("__ccg", ctxAny.__ccg);
  if (tokens.rev) queryParams.append("__rev", tokens.rev);
  if (ctxAny.__s) queryParams.append("__s", ctxAny.__s);
  if (ctxAny.__hsi) queryParams.append("__hsi", ctxAny.__hsi);
  if (ctxAny.__dyn) queryParams.append("__dyn", ctxAny.__dyn);
  if (ctxAny.__csr) queryParams.append("__csr", ctxAny.__csr);
  if (ctxAny.__hsdp) queryParams.append("__hsdp", ctxAny.__hsdp);
  if (ctxAny.__hblp) queryParams.append("__hblp", ctxAny.__hblp);
  if (ctxAny.__sjsp) queryParams.append("__sjsp", ctxAny.__sjsp);
  if (ctxAny.__comet_req) queryParams.append("__comet_req", ctxAny.__comet_req || "15");
  queryParams.append("qpl_active_flow_ids", "884152905");

  if (tokens.spin_r) queryParams.append("__spin_r", tokens.spin_r);
  if (tokens.spin_t) queryParams.append("__spin_t", tokens.spin_t);
  if (ctxAny.__spin_b) queryParams.append("__spin_b", ctxAny.__spin_b);
  if (ctxAny.__crn) queryParams.append("__crn", ctxAny.__crn);

  // For GET request, use fb_dtsg_ag if available
  if (ctxAny.fb_dtsg_ag) {
    queryParams.set("fb_dtsg_ag", ctxAny.fb_dtsg_ag);
  }

  const url = `https://rupload-sin6-1.up.facebook.com/fb_video/${entityName}?${queryParams.toString()}`;
  logger.info(`[uploadVideoWebV2] Phase 2: Checking offset - entityName: ${entityName}`);

  try {
    const response = await defaultFuncs.get(url, ctx.jar, undefined, ctx, {
      "x-fb-qpl-active-flows": "884152905",
    });

    const responseData = typeof response.data === "string" ? response.data : String(response.data || "");
    const cleaned = cleanJSON(responseData) as { offset?: number; dc?: string };

    if (cleaned?.offset !== undefined) {
      logger.info(`[uploadVideoWebV2] Phase 2: Offset confirmed - offset: ${cleaned.offset}`);
      return cleaned.offset;
    }
  } catch {
    // If request fails, assume offset = startOffset (new upload)
    logger.info(`[uploadVideoWebV2] Phase 2: No existing offset found, starting from ${startOffset}`);
  }

  // Default: assume offset = startOffset (new upload)
  return startOffset;
}

// PHASE 3: RUPLOAD DATA - Upload raw bytes (CRITICAL: NO multipart, NO form-data)
async function uploadRuploadChunk(
  ctx: Context,
  chunk: Buffer,
  uploadId: string,
  videoId: string,
  waterfallId: string,
  startOffset: number,
  endOffset: number,
  fileSize: number,
  chunkSize: number,
  fileName: string,
  fileType: string,
  getReq: () => string,
  tokens: { fb_dtsg: string; jazoest: string; lsd: string; spin_r?: string; spin_t?: string; rev?: string }
): Promise<string> {
  const entityName = `${uploadId}-0-${chunkSize}`;
  const ctxAny = ctx as any;
  const queryParams = new URLSearchParams({
    __aaid: "0",
    __user: ctx.userID,
    __a: "1",
    __req: getReq(),
    fb_dtsg: tokens.fb_dtsg,
    jazoest: tokens.jazoest,
    lsd: tokens.lsd,
  });
  if (ctxAny.__hs) queryParams.append("__hs", ctxAny.__hs);
  if (ctxAny.dpr) queryParams.append("dpr", ctxAny.dpr);
  if (ctxAny.__ccg) queryParams.append("__ccg", ctxAny.__ccg);
  if (tokens.rev) queryParams.append("__rev", tokens.rev);
  if (ctxAny.__s) queryParams.append("__s", ctxAny.__s);
  if (ctxAny.__hsi) queryParams.append("__hsi", ctxAny.__hsi);
  if (ctxAny.__dyn) queryParams.append("__dyn", ctxAny.__dyn);
  if (ctxAny.__csr) queryParams.append("__csr", ctxAny.__csr);
  if (ctxAny.__hsdp) queryParams.append("__hsdp", ctxAny.__hsdp);
  if (ctxAny.__hblp) queryParams.append("__hblp", ctxAny.__hblp);
  if (ctxAny.__sjsp) queryParams.append("__sjsp", ctxAny.__sjsp);
  if (ctxAny.__comet_req) queryParams.append("__comet_req", ctxAny.__comet_req || "15");
  queryParams.append("qpl_active_flow_ids", "884152905");

  if (tokens.spin_r) queryParams.append("__spin_r", tokens.spin_r);
  if (tokens.spin_t) queryParams.append("__spin_t", tokens.spin_t);
  if (ctxAny.__spin_b) queryParams.append("__spin_b", ctxAny.__spin_b);
  if (ctxAny.__crn) queryParams.append("__crn", ctxAny.__crn);
  if (ctxAny.fb_dtsg_ag) queryParams.append("fb_dtsg_ag", ctxAny.fb_dtsg_ag);
  const url = `https://rupload-sin6-1.up.facebook.com/fb_video/${entityName}?${queryParams.toString()}`;
  const headers: Record<string, string> = {
    "accept": "*/*",
    "accept-language": "vi,en-US;q=0.9,en;q=0.8",
    "content-length": String(chunk.length),
    "composer_session_id": waterfallId,
    "end_offset": String(endOffset),
    "id": "undefined",
    "offset": String(startOffset),
    "priority": "u=1, i",
    "product_media_id": videoId,
    "referrer": "https://www.facebook.com/", // Note: "referrer" not "referer"
    "sec-ch-ua": '"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "start_offset": String(startOffset),
    "x-entity-length": String(fileSize), // Total file size
    "x-entity-name": fileName, // Original file name (e.g., "video.mp4")
    "x-entity-type": fileType,
    "x-total-asset-size": String(fileSize),
  };

  logger.info(`[uploadVideoWebV2] Phase 3: Uploading chunk - offset: ${startOffset}-${endOffset}, size: ${chunk.length} bytes`);

  // Use got for raw binary upload (NO transform, NO encoding)
  const { default: got } = await import("got");
  const { CookieJar } = await import("tough-cookie");

  const jar = ctx.jar as any;
  const cookieJar = jar || new CookieJar();

  let response: any;
  let responseData: string;

  try {
    response = await got.post(url, {
      body: chunk, // RAW BUFFER - NO encoding, NO multipart
      headers,
      cookieJar,
      timeout: { request: 300000 }, // 5 minutes
      // Disable automatic content-length calculation to use our manual header
      // got will respect our content-length header
    });

    responseData = typeof response.body === "string" ? response.body : String(response.body || "");
  } catch (err: any) {
    const error = err instanceof Error ? err : new Error(String(err));
    const status = err?.response?.statusCode || err?.statusCode;
    const statusText = err?.response?.statusMessage || "";
    throw new Error(`Upload chunk failed: ${error.message}${status ? ` (Status: ${status} ${statusText})` : ""}`);
  }

  // Parse response to get handle
  let handle: string | undefined;

  try {
    const jsonData = JSON.parse(responseData);
    handle = jsonData.h || jsonData.handle;
  } catch {
    // If not JSON, try to extract handle from response
    handle = responseData.trim();
  }

  if (!handle) {
    logger.warn(`[uploadVideoWebV2] Phase 3: No handle in response, continuing...`);
    // Continue anyway, handle might be optional for chunks
    return "";
  }

  logger.info(`[uploadVideoWebV2] Phase 3: Chunk uploaded - status: ${response.statusCode}, handle: ${handle.substring(0, 50)}...`);
  return handle;
}

// PHASE 4: RECEIVE - Confirm upload completion
async function receiveUploadV2(
  defaultFuncs: DefaultFuncs,
  ctx: Context,
  videoId: string,
  waterfallId: string,
  targetId: string,
  source: string,
  composerEntryPointRef: string,
  fileSize: number,
  handle: string,
  uploadSpeed: number,
  getReq: () => string,
  tokens: { fb_dtsg: string; jazoest: string; lsd: string; spin_r?: string; spin_t?: string; rev?: string }
): Promise<void> {
  const ctxAny = ctx as any;

  const form: Record<string, string> = {
    av: ctx.userID,
    __a: "1",
    waterfall_id: waterfallId,
    target_id: targetId,
    video_id: videoId,
    source: source,
    composer_entry_point_ref: composerEntryPointRef,
    supports_chunking: "true",
    supports_upload_service: "true",
    partition_start_offset: "0",
    partition_end_offset: String(fileSize),
    start_offset: "0",
    end_offset: String(fileSize),
    upload_speed: String(uploadSpeed),
    fbuploader_video_file_chunk: handle, // Handle will be URL encoded by defaultFuncs.post
    composer_dialog_version: "V2",
    __aaid: "0",
    __user: ctx.userID,
    __req: getReq(),
    fb_dtsg: tokens.fb_dtsg,
    jazoest: tokens.jazoest,
    lsd: tokens.lsd,
  };

  // Add optional params from context
  if (ctxAny.__hs) form.__hs = ctxAny.__hs;
  if (ctxAny.dpr) form.dpr = ctxAny.dpr;
  if (ctxAny.__ccg) form.__ccg = ctxAny.__ccg;
  if (tokens.rev) form.__rev = tokens.rev;
  if (ctxAny.__s) form.__s = ctxAny.__s;
  if (ctxAny.__hsi) form.__hsi = ctxAny.__hsi;
  if (ctxAny.__dyn) form.__dyn = ctxAny.__dyn;
  if (ctxAny.__csr) form.__csr = ctxAny.__csr;
  if (ctxAny.__hsdp) form.__hsdp = ctxAny.__hsdp;
  if (ctxAny.__hblp) form.__hblp = ctxAny.__hblp;
  if (ctxAny.__sjsp) form.__sjsp = ctxAny.__sjsp;
  if (ctxAny.__comet_req) form.__comet_req = ctxAny.__comet_req || "15";
  form.qpl_active_flow_ids = "884152905";

  if (tokens.spin_r) form.__spin_r = tokens.spin_r;
  if (tokens.spin_t) form.__spin_t = tokens.spin_t;
  if (ctxAny.__spin_b) form.__spin_b = ctxAny.__spin_b;
  if (ctxAny.__crn) form.__crn = ctxAny.__crn;

  const url = `https://www.facebook.com/ajax/video/upload/requests/receive/?av=${ctx.userID}&__a=1`;

  logger.info(`[uploadVideoWebV2] Phase 4: Receiving upload - videoId: ${videoId}, handle: ${handle.substring(0, 50)}..., uploadSpeed: ${(uploadSpeed / 1024 / 1024).toFixed(2)} MB/s`);

  const response = await defaultFuncs.post(url, ctx.jar, form, ctx, {
    "x-asbd-id": "359341",
    "x-fb-lsd": tokens.lsd,
    "x_fb_video_waterfall_id": waterfallId, // Underscore, not dash
  });

  const responseData = typeof response.data === "string" ? response.data : String(response.data || "");
  const cleaned = cleanJSON(responseData) as { payload?: { start_offset?: number; end_offset?: number } };

  if (!cleaned?.payload) {
    logger.error(`[uploadVideoWebV2] Phase 4 failed - response: ${JSON.stringify(cleaned)}`);
    throw new Error(`Failed to receive upload: ${JSON.stringify(cleaned)}`);
  }

  // Finish condition: start_offset === end_offset
  const isFinished = cleaned.payload.start_offset === cleaned.payload.end_offset;
  logger.success(`[uploadVideoWebV2] Phase 4 success - start_offset: ${cleaned.payload.start_offset}, end_offset: ${cleaned.payload.end_offset}, finished: ${isFinished}`);
}

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (options: UploadVideoWebV2Options | UploadVideoWebV2Callback, callback?: UploadVideoWebV2Callback) => Promise<UploadVideoWebV2Result> {
  return async function uploadVideoWebV2(
    options: UploadVideoWebV2Options | UploadVideoWebV2Callback,
    callback?: UploadVideoWebV2Callback
  ): Promise<UploadVideoWebV2Result> {
    let resolveFunc: (value: UploadVideoWebV2Result) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<UploadVideoWebV2Result>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    let opts: UploadVideoWebV2Options;
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

    const cb: UploadVideoWebV2Callback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        if (data) resolveFunc(data);
      });

    (async () => {
      try {
        logger.info(`[uploadVideoWebV2] Starting video upload process`);

        // Get video buffer
        const videoBuffer = await getVideoBuffer(opts.videoPath);
        const fileSize = videoBuffer.length;
        const fileExtension = path.extname(typeof opts.videoPath === "string" ? opts.videoPath : "video.mp4").slice(1) || "mp4";
        const fileName = getVideoFileName(opts.videoPath);
        const fileType = `video/${fileExtension}`;
        const targetId = opts.targetId || ctx.userID;
        const source = opts.source || DEFAULT_SOURCE;
        const composerEntryPointRef = opts.composerEntryPointRef || DEFAULT_COMPOSER_ENTRY_POINT_REF;
        const waterfallId = uuidv4().replace(/-/g, ""); // Remove dashes to match Facebook format

        logger.info(`[uploadVideoWebV2] Video info - fileSize: ${(fileSize / 1024 / 1024).toFixed(2)} MB, extension: ${fileExtension}, targetId: ${targetId}, waterfallId: ${waterfallId}`);

        // Get tokens
        const tokens = await getTokensFromContext(ctx);
        logger.info(`[uploadVideoWebV2] Tokens retrieved - fb_dtsg: ${tokens.fb_dtsg.substring(0, 20)}..., lsd: ${tokens.lsd}`);

        // ============================================
        // PHASE 1: START - Get video_id + chunk size
        // ============================================
        // Generate req counter (starts from 10 = 'a' in base 36, then a2, a3, a4, a5...)
        const getReq = generateReqCounter(10);

        const startResult = await startUploadV2(
          defaultFuncs,
          ctx,
          fileSize,
          fileExtension,
          targetId,
          source,
          composerEntryPointRef,
          waterfallId,
          getReq,
          tokens
        );
        const videoId = startResult.video_id;
        const chunkSize = startResult.end_offset - startResult.start_offset; // Usually 1MB = 1048576
        const uploadId = generateUploadId(videoBuffer);

        logger.info(`[uploadVideoWebV2] Phase 1 complete - videoId: ${videoId}, chunkSize: ${chunkSize}, uploadId: ${uploadId}`);

        // ============================================
        // PHASE 2 & 3: RUPLOAD - Upload file
        // ============================================
        // If file is small, upload in one go. Otherwise, loop chunks
        let currentOffset = startResult.start_offset;
        const uploadStartTime = Date.now();
        let finalHandle = "";

        // Check if we need chunking (file > chunk size)
        if (fileSize <= chunkSize) {
          // Small file - upload in one go
          logger.info(`[uploadVideoWebV2] File size (${fileSize}) <= chunk size (${chunkSize}), uploading in one go`);

          // PHASE 2: Check offset
          await checkRuploadOffset(
            defaultFuncs,
            ctx,
            uploadId,
            0,
            fileSize,
            chunkSize,
            getReq,
            tokens
          );

          // PHASE 3: Upload entire file
          finalHandle = await uploadRuploadChunk(
            ctx,
            videoBuffer,
            uploadId,
            videoId,
            waterfallId,
            0,
            fileSize,
            fileSize,
            chunkSize,
            fileName,
            fileType,
            getReq,
            tokens
          );
        } else {
          // Large file - loop chunks
          while (currentOffset < fileSize) {
            const chunkEnd = Math.min(currentOffset + chunkSize, fileSize);
            const chunk = videoBuffer.slice(currentOffset, chunkEnd);
            const actualChunkSize = chunk.length;

            logger.info(`[uploadVideoWebV2] Processing chunk - offset: ${currentOffset}-${chunkEnd}, size: ${actualChunkSize} bytes`);

            // PHASE 2: Check offset (rupload init)
            const serverOffset = await checkRuploadOffset(
              defaultFuncs,
              ctx,
              uploadId,
              currentOffset,
              chunkEnd,
              chunkSize,
              getReq,
              tokens
            );

            // If server offset != current offset, we need to resume
            if (serverOffset > currentOffset) {
              logger.info(`[uploadVideoWebV2] Resume detected - server offset: ${serverOffset}, current: ${currentOffset}`);
              currentOffset = serverOffset;
              continue;
            }

            // PHASE 3: Upload raw bytes (rupload data)
            const chunkHandle = await uploadRuploadChunk(
              ctx,
              chunk,
              uploadId,
              videoId,
              waterfallId,
              currentOffset,
              chunkEnd,
              fileSize,
              chunkSize,
              fileName,
              fileType,
              getReq,
              tokens
            );

            // Keep last handle (usually from last chunk)
            if (chunkHandle) {
              finalHandle = chunkHandle;
            }

            // Move to next chunk
            currentOffset = chunkEnd;
          }
        }

        const uploadTime = (Date.now() - uploadStartTime) / 1000;
        const uploadSpeed = fileSize / uploadTime;

        logger.info(`[uploadVideoWebV2] All chunks uploaded - time: ${uploadTime.toFixed(2)}s, speed: ${(uploadSpeed / 1024 / 1024).toFixed(2)} MB/s`);

        // ============================================
        // PHASE 4: RECEIVE - Confirm upload
        // ============================================
        if (!finalHandle) {
          throw new Error("No handle returned from upload");
        }

        await receiveUploadV2(
          defaultFuncs,
          ctx,
          videoId,
          waterfallId,
          targetId,
          source,
          composerEntryPointRef,
          fileSize,
          finalHandle,
          uploadSpeed,
          getReq,
          tokens
        );

        const result = {
          video_id: videoId,
          waterfall_id: waterfallId,
        };

        logger.success(`[uploadVideoWebV2] Upload completed successfully - videoId: ${videoId}, waterfallId: ${waterfallId}`);

        cb(null, result);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[uploadVideoWebV2] Upload failed - ${error.message}${error.stack ? `\nStack: ${error.stack}` : ""}`);
        cb(error);
      }
    })();

    return returnPromise;
  };
}
