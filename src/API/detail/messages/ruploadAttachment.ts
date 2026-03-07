"use strict";

import type { DefaultFuncs, FacebookContext, FBResponse } from '@types';
import crypto from "crypto";
import fs from "fs";
import got from "got";
import stream from "node:stream";
import path from "path";
import { URL } from "url";
import autoReloginWithFacebookWeb from "../../../core/auth_login/auto_relogin";
import { getConfig } from "../../../core/configManager";
import logger from "../../../core/logger";
import { extractUserID } from "../../login/contextBuilder";
import { generateOfflineThreadingID, isReadableStream } from "../../request/formatters";

type AttachmentSource =
  | stream.Readable
  | string
  | Buffer
  | {
    path?: string;
    url?: string;
    buffer?: Buffer;
    data?: Buffer;
    stream?: stream.Readable;
    contentType?: string;
    filename?: string;
  };

type RuploadMediaType = "image" | "video" | "audio" | "gif";

interface RuploadInvocationOptions {
  timeoutMs?: number;
  userAgent?: string;
  to?: string | number;
  senderFbid?: string | number;
  bizSenderFbid?: string | number;
  deviceId?: string;
  extraHeaders?: Record<string, string>;
}

interface RuploadTask extends RuploadInvocationOptions {
  source: AttachmentSource;
  mediaType?: RuploadMediaType;
  filename?: string;
  contentType?: string;
  uploadId?: string;
  offlineThreadingId?: string;
  offlineAttachmentId?: string;
  requestToken?: string;
  entityName?: string;
  messageSource?: string;
  friendlyName?: string;
  priority?: string;
  sendMessageByServer?: string;
  dataclassParams?: Record<string, any>;
  metadataDataclass?: Record<string, any>;
  waveformData?: {
    amplitudes: number[];
    sampling_freq: number;
  };
  audioType?: string;
  isHd?: boolean;
}

interface NormalizedAttachment {
  buffer: Buffer;
  filename: string;
  contentType: string;
  size: number;
}

interface RuploadResult {
  type: RuploadMediaType;
  uploadId: string;
  response: Record<string, unknown> | string;
  mediaId?: string | number;
}

type RuploadCallback = (err: Error | null, data?: RuploadResult[]) => void;

const DEFAULT_UA =
  "Dalvik/2.1.0 (Linux; U; Android 9; 23113RKC6C Build/PQ3A.190605.06171036) [FBAN/Orca-Android;FBAV/524.0.0.44.109;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/788947415;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBDV/23113RKC6C;FBSV/9;FBCA/x86:armeabi-v7a;FBDM/{density=3.0,width=1080,height=1920};FB_FW/1;]";

const MEDIA_ENDPOINT: Record<RuploadMediaType, string> = {
  image: "messenger_image",
  video: "messenger_video",
  audio: "messenger_audio",
  gif: "messenger_gif",
};

const FRIENDLY_NAME: Record<RuploadMediaType, string> = {
  image: "msysDataTask4",
  video: "msysDataTask3",
  audio: "msysDataTask4",
  gif: "msysDataTask4",
};

const MESSAGE_SOURCE: Record<RuploadMediaType, string> = {
  image: "65554",
  video: "65540",
  audio: "65537",
  gif: "65554",
};

const AUDIO_WAVEFORM_FALLBACK = {
  amplitudes: [0.0, 0.066, 0.091, 0.059, 0.094, 0.11, 0.077, 0.072, 0.064],
  sampling_freq: 2,
};

const ANALYTICS_HEADER = JSON.stringify({
  network_tags: { product: "256002347743983", retry_attempt: "0" },
  application_tags: "unknown",
});

const ZERO_EH =
  "2,,AUYKnE5rPfughZhCzzFyALO2sT6e3DkSHGBCJFd0CF5qVrYHvK0Alu9-dVN6GH4RyeQ";

function isHttpUrl(input: string): boolean {
  return /^https?:\/\/.+/.test(input);
}

async function streamToBuffer(readable: stream.Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return await new Promise<Buffer>((resolve, reject) => {
    readable.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
    if (readable.readable && readable.isPaused()) readable.resume();
  });
}

async function bufferFromSource(input: AttachmentSource): Promise<NormalizedAttachment> {
  if (!input) throw new Error("Invalid attachment source");

  if (Buffer.isBuffer(input)) {
    return {
      buffer: input,
      filename: `file-${Date.now()}`,
      contentType: "application/octet-stream",
      size: input.length,
    };
  }

  if (typeof input === "string") {
    if (fs.existsSync(input) && fs.statSync(input).isFile()) {
      const buffer = await fs.promises.readFile(input);
      const filename = path.basename(input);
      return {
        buffer,
        filename,
        contentType: detectContentType(filename),
        size: buffer.length,
      };
    }

    if (isHttpUrl(input)) {
      const res = await got.get(input, { responseType: "buffer" });
      const contentType = res.headers["content-type"] || "application/octet-stream";
      const filename = path.basename(new URL(input).pathname) || `file-${Date.now()}`;
      return {
        buffer: res.body,
        filename,
        contentType,
        size: res.body.length,
      };
    }

    throw new Error(`Unsupported string source: ${input}`);
  }

  if (isReadableStream(input)) {
    const buffer = await streamToBuffer(input as stream.Readable);
    return {
      buffer,
      filename: `file-${Date.now()}`,
      contentType: "application/octet-stream",
      size: buffer.length,
    };
  }

  if (typeof input === "object") {
    const obj = input as any;
    if (obj.buffer && Buffer.isBuffer(obj.buffer)) {
      return {
        buffer: obj.buffer,
        filename: obj.filename || `file-${Date.now()}`,
        contentType: obj.contentType || "application/octet-stream",
        size: obj.buffer.length,
      };
    }
    if (obj.data && Buffer.isBuffer(obj.data)) {
      return {
        buffer: obj.data,
        filename: obj.filename || `file-${Date.now()}`,
        contentType: obj.contentType || "application/octet-stream",
        size: obj.data.length,
      };
    }
    if (obj.path && fs.existsSync(obj.path)) {
      const buffer = await fs.promises.readFile(obj.path);
      const filename = obj.filename || path.basename(obj.path);
      return {
        buffer,
        filename,
        contentType: obj.contentType || detectContentType(filename),
        size: buffer.length,
      };
    }
    if (obj.url && typeof obj.url === "string") {
      return bufferFromSource(obj.url);
    }
    if (obj.stream && isReadableStream(obj.stream)) {
      const buffer = await streamToBuffer(obj.stream);
      return {
        buffer,
        filename: obj.filename || `file-${Date.now()}`,
        contentType: obj.contentType || "application/octet-stream",
        size: buffer.length,
      };
    }
  }

  throw new Error("Unable to normalize attachment source");
}

function detectContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/m4a";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}

function detectMediaType(contentType: string, filename: string): RuploadMediaType {
  const mime = contentType.toLowerCase();
  const ext = path.extname(filename).toLowerCase();
  if (mime.includes("video") || [".mp4", ".mov", ".avi"].includes(ext)) return "video";
  if (mime.includes("audio") || [".mp3", ".wav", ".m4a"].includes(ext)) return "audio";
  if (mime.includes("gif") || ext === ".gif") return "gif";
  return "image";
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}





function ensureString(value: string | number | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? value : String(value);
}

function stringifyHeaderValue(value: any): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function safeJsonParse(body: string): any {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function normalizeTask(input: AttachmentSource | RuploadTask): RuploadTask {
  if (typeof input === "object" && input && "source" in input) {
    return input as RuploadTask;
  }
  return { source: input as AttachmentSource };
}

function buildEntityName(mediaType: RuploadMediaType, filename: string): string {
  if (mediaType === "image") {
    return `${generateUUID().toUpperCase()}.jpg`;
  }
  const base = path.basename(filename);
  return base || generateUUID().toUpperCase();
}

function computeMediaHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

interface ErrorWithResponse extends Error {
  response?: {
    status?: number;
    statusCode?: number;
    body?: string | Record<string, unknown>;
  };
  statusCode?: number;
  status?: number;
  body?: string | Record<string, unknown>;
}

interface ResponseWithUrl extends FBResponse<string> {
  data: string;
  request?: {
    res?: {
      responseUrl?: string;
    };
  };
}

/**
 * Kiểm tra trạng thái session/cookie khi gặp lỗi upload
 */
async function checkSessionStatus(
  ctx: FacebookContext,
  defaultFuncs: DefaultFuncs | undefined,
  error: unknown
): Promise<{
  cookieLive: boolean;
  isLoggedOut: boolean;
  hasWarning: boolean;
  hasCheckpoint: boolean;
  details: string;
}> {
  const result = {
    cookieLive: false,
    isLoggedOut: false,
    hasWarning: false,
    hasCheckpoint: false,
    details: "",
  };

  try {
    // 1. Check cookie có còn live không
    if (ctx?.jar) {
      const userID = extractUserID(ctx.jar);
      if (userID && userID === ctx.userID) {
        result.cookieLive = true;
        result.details += "Cookie: LIVE ✓; ";
      } else {
        result.cookieLive = false;
        result.details += "Cookie: DEAD ✗ (không tìm thấy userID hoặc không khớp); ";
      }
    } else {
      result.details += "Cookie: Không có jar; ";
    }

    // 2. Check có bị logout không bằng cách gọi API đơn giản
    if (defaultFuncs && ctx?.jar) {
      try {
        const testRes = await defaultFuncs.get("https://www.facebook.com/", ctx.jar) as ResponseWithUrl;
        const html = typeof testRes?.data === "string" ? testRes.data : String(testRes?.data || "");
        const url = testRes?.request?.res?.responseUrl || testRes?.config?.url || "";

        // Check redirect đến login
        if (
          url.includes("/login.php") ||
          url.includes("login") ||
          html.includes("https://www.facebook.com/login.php") ||
          html.includes('"__user":0') ||
          html.includes('"USER_ID":0')
        ) {
          result.isLoggedOut = true;
          result.details += "Logout: YES ✗; ";
        } else {
          result.isLoggedOut = false;
          result.details += "Logout: NO ✓; ";
        }

        // 3. Check checkpoint
        if (
          html.includes("/checkpoint/") ||
          html.includes("checkpoint") ||
          html.includes("1501092823525282") ||
          html.includes("828281030927956") ||
          url.includes("/checkpoint/")
        ) {
          result.hasCheckpoint = true;
          result.details += "Checkpoint: YES ✗; ";
        } else {
          result.hasCheckpoint = false;
          result.details += "Checkpoint: NO ✓; ";
        }

        // 4. Check warning
        if (
          html.includes("XCheckpointFBScrapingWarningController") ||
          html.includes("601051028565049") ||
          html.includes("FBScrapingWarning")
        ) {
          result.hasWarning = true;
          result.details += "Warning: YES ✗; ";
        } else {
          result.hasWarning = false;
          result.details += "Warning: NO ✓; ";
        }
      } catch (checkErr: unknown) {
        const errMsg = checkErr instanceof Error ? checkErr.message : String(checkErr);
        result.details += `Không thể check session (${errMsg}); `;
      }
    }

    // Check trong error response nếu có
    const errorStr = JSON.stringify(error || {});
    if (errorStr.includes("XCheckpointFBScrapingWarningController") || errorStr.includes("601051028565049")) {
      result.hasWarning = true;
      result.details += "Warning trong error: YES ✗; ";
    }
    if (errorStr.includes("/checkpoint/") || errorStr.includes("checkpoint")) {
      result.hasCheckpoint = true;
      result.details += "Checkpoint trong error: YES ✗; ";
    }
    if (errorStr.includes("/login.php") || errorStr.includes("Not logged in")) {
      result.isLoggedOut = true;
      result.details += "Logout trong error: YES ✗; ";
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    result.details += `Lỗi khi check session: ${errMsg}; `;
  }

  return result;
}

export default function ruploadAttachmentModule(
  _defaultFuncs: DefaultFuncs,
  _api: any,
  ctx: FacebookContext
): (
  inputs: AttachmentSource | RuploadTask | Array<AttachmentSource | RuploadTask>,
  optsOrCallback?: RuploadInvocationOptions | RuploadCallback,
  maybeCallback?: RuploadCallback
) => Promise<RuploadResult[]> {
  return async function ruploadAttachment(
    inputs: AttachmentSource | RuploadTask | Array<AttachmentSource | RuploadTask>,
    optsOrCallback?: RuploadInvocationOptions | RuploadCallback,
    maybeCallback?: RuploadCallback
  ): Promise<RuploadResult[]> {
    let options: RuploadInvocationOptions = {};
    let callback: RuploadCallback | undefined;

    if (typeof optsOrCallback === "function") {
      callback = optsOrCallback;
    } else if (optsOrCallback) {
      options = optsOrCallback;
    }

    if (typeof maybeCallback === "function") {
      callback = maybeCallback;
    }

    const cb: RuploadCallback = callback || (() => undefined);

    const tasks = Array.isArray(inputs) ? inputs : [inputs];
    if (!tasks.length) {
      const err = new Error("Please provide at least one attachment");
      cb(err);
      throw err;
    }

    if (!ctx?.userID) {
      const err = new Error("Missing userID in context");
      cb(err);
      throw err;
    }

    const token = getConfig().token?.EAAD;
    if (!token) {
      const err = new Error("Missing access token for rupload");
      cb(err);
      throw err;
    }

    const results: RuploadResult[] = [];

    try {
      for (const rawItem of tasks) {
        const task = normalizeTask(rawItem);
        const normalized = await bufferFromSource(task.source);
        const mediaType =
          task.mediaType ||
          (task.contentType
            ? detectMediaType(task.contentType, task.filename || normalized.filename)
            : detectMediaType(normalized.contentType, task.filename || normalized.filename));

        const uploadId = (task.uploadId || generateUUID()).toUpperCase();
        const offlineThreadingId = generateOfflineThreadingID();
        const offlineAttachmentId = generateOfflineThreadingID();
        const requestToken = task.requestToken || generateUUID().toUpperCase();
        const deviceId = ensureString(task.deviceId || options.deviceId || generateUUID()) || generateUUID();
        const senderFbid = ctx.userID;
        const bizSenderFbid = ensureString(task.bizSenderFbid || options.bizSenderFbid || senderFbid) || String(senderFbid);
        const to = ensureString(task.to || options.to);
        const userAgent = task.userAgent || options.userAgent || DEFAULT_UA;
        const endpoint = `https://rupload.facebook.com/${MEDIA_ENDPOINT[mediaType]}/${uploadId}`;
        const entityName = task.entityName || buildEntityName(mediaType, task.filename || normalized.filename);
        const contentType = task.contentType || normalized.contentType || detectContentType(entityName);

        const headers: Record<string, string> = {
          "User-Agent": userAgent,
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/octet-stream",
          "x-fb-request-analytics-tags": ANALYTICS_HEADER,
          "x-fb-rmd": "state=URL_ELIGIBLE",
          priority: "u=3, i",
          "x-entity-name": entityName,
          "offline_threading_id": offlineThreadingId,
          "x-tigon-is-retry": "False",
          "x-entity-type": contentType,
          ttl: "0",
          "x-fb-friendly-name": FRIENDLY_NAME[mediaType],
          "message_source": MESSAGE_SOURCE[mediaType],
          "x-fb-network-properties": "Wifi;Validated;",
          offset: "0",
          "offline_attachment_id": offlineAttachmentId,
          "x-entity-length": String(normalized.size),
          authorization: `OAuth ${token}`,
          "sender_fbid": ctx.userID,
          "device_id": deviceId,
          "x-fb-net-hni": "45201",
          "x-fb-sim-hni": "45201",
          "client_tags": JSON.stringify({ is_dialtone: "false", is_zero_balance: "false" }),
          "x-fb-connection-type": "WIFI",
          "x-fb-http-engine": "Tigon/Liger",
          "x-fb-client-ip": "True",
          "x-fb-server-cluster": "True",
          "x-fb-conn-uuid-client": generateUUID().replace(/-/g, ""),
          "app-scope-id-header": deviceId,
          "x-zero-f-device-id": deviceId,
          "x-zero-eh": ZERO_EH,
          request_token: requestToken,
        };

        if (to) headers.to = to;
        if (bizSenderFbid) headers.biz_sender_fbid = bizSenderFbid;

        if (mediaType === "image" || mediaType === "video" || mediaType === "gif") {
          headers.media_hash = computeMediaHash(normalized.buffer);
        }

        if (mediaType === "image" || mediaType === "gif") {

          headers.image_type = "FILE_ATTACHMENT";
          headers.preprocessed_type = contentType;
          if (task.isHd) headers.is_hd = "1";
        }

        if (mediaType === "video") {

          headers.video_type = "FILE_ATTACHMENT";
          if (!headers.dataclass_params && !task.dataclassParams) {
            headers.dataclass_params = stringifyHeaderValue({
              send_instance_metadata: null,
            });
          }
        }

        if (mediaType === "audio") {
          headers.audio_type = task.audioType || "VOICE_MESSAGE";
          headers.waveform_data = stringifyHeaderValue(
            task.waveformData || AUDIO_WAVEFORM_FALLBACK
          );
        }

        if (task.dataclassParams) {
          headers.dataclass_params = stringifyHeaderValue(task.dataclassParams);
        }

        if (task.metadataDataclass) {
          headers.metadata_dataclass = stringifyHeaderValue(task.metadataDataclass);
        }

        if (mediaType === "gif") {
          if (!headers.dataclass_params && !task.dataclassParams) {
            headers.dataclass_params = stringifyHeaderValue({
              logging_metadata: { feature_tags: [] },
              send_instance_metadata: null,
            });
          }
          if (!headers.metadata_dataclass && !task.metadataDataclass) {
            headers.metadata_dataclass = stringifyHeaderValue({
              sticker: {
                sticker_pack_id: "",
                sticker_id: "",
              },
            });
          }
        }

        if (typeof task.sendMessageByServer !== "undefined") {
          headers.send_message_by_server = String(task.sendMessageByServer);
        }

        if (options.extraHeaders) {
          for (const [k, v] of Object.entries(options.extraHeaders)) {
            headers[k.toLowerCase()] = v;
          }
        }

        if (task.extraHeaders) {
          for (const [k, v] of Object.entries(task.extraHeaders)) {
            headers[k.toLowerCase()] = v;
          }
        }

        const response = await got.post(endpoint, {
          headers,
          body: normalized.buffer,
          http2: true,
          timeout: { request: options.timeoutMs || 120000 },
          decompress: true,
        });

        // Check nếu response status là 400
        if (response.statusCode === 400) {
          logger.warn(
            `[ruploadAttachment] Phát hiện 400 Bad Request, đang kiểm tra session status...`
          );
          try {
            const errorInfo: ErrorWithResponse = {
              name: "BadRequest",
              message: "Response code 400",
              response: {
                status: response.statusCode,
                statusCode: response.statusCode,
                body: response.body,
              },
              statusCode: response.statusCode,
            };
            const sessionStatus = await checkSessionStatus(ctx, _defaultFuncs, errorInfo);
            logger.error(
              `[ruploadAttachment] Response code 400 (Bad Request) - Session Status: ${sessionStatus.details}`
            );

            if (!sessionStatus.cookieLive) {
              logger.error(
                `[ruploadAttachment] ⚠️ Cookie đã DEAD - Cần đăng nhập lại!`
              );
            }
            if (sessionStatus.isLoggedOut) {
              logger.error(
                `[ruploadAttachment] ⚠️ Tài khoản đã bị LOGOUT - Cần đăng nhập lại!`
              );
            }
            if (sessionStatus.hasCheckpoint) {
              logger.error(
                `[ruploadAttachment] ⚠️ Tài khoản bị CHECKPOINT - Cần xử lý checkpoint!`
              );
            }
            if (sessionStatus.hasWarning) {
              logger.error(
                `[ruploadAttachment] ⚠️ Tài khoản bị WARNING - Cần kiểm tra tài khoản!`
              );
            }

            // Nếu cookie DEAD hoặc tài khoản đã logout thì thử auto login ngay tại đây
            if (!sessionStatus.cookieLive || sessionStatus.isLoggedOut) {
              try {
                logger.warn(
                  "[ruploadAttachment] Cookie/session có vấn đề, đang thử AUTO-LOGIN bằng facebook_web..."
                );
                const ok = await autoReloginWithFacebookWeb(ctx as any);
                if (ok) {
                  logger.success(
                    "[ruploadAttachment] AUTO-LOGIN thành công. Cookie đã được cập nhật, vui lòng thử gửi lại file."
                  );
                } else {
                  logger.error(
                    "[ruploadAttachment] AUTO-LOGIN thất bại. Vui lòng kiểm tra lại thông tin đăng nhập trong config.json!"
                  );
                }
              } catch (autoErr: unknown) {
                const autoMsg =
                  autoErr instanceof Error ? autoErr.message : String(autoErr);
                logger.error(
                  `[ruploadAttachment] Lỗi khi chạy AUTO-LOGIN sau khi cookie DEAD/logout: ${autoMsg}`
                );
              }
            }
          } catch (checkErr: unknown) {
            const errMsg = checkErr instanceof Error ? checkErr.message : String(checkErr);
            logger.warn(`[ruploadAttachment] Không thể check session status: ${errMsg}`);
          }
        }

        const parsed = safeJsonParse(response.body);
        const mediaId =
          (parsed && (parsed.media_id || parsed.image_id || parsed.video_id || parsed.audio_id || parsed.gif_id)) ||
          undefined;

        if (!mediaId) {
          logger.warn(
            `[ruploadAttachment] No mediaId extracted from response for ${mediaType}. Status: ${response.statusCode}. Response keys: ${parsed && typeof parsed === "object" ? Object.keys(parsed).join(", ") : "N/A"}. Response preview: ${typeof parsed === "string" ? parsed.slice(0, 200) : JSON.stringify(parsed).slice(0, 200)}`
          );
        } else {
          logger.success(
            `[ruploadAttachment] Lấy mediaId thành công cho ${mediaType}: ${String(mediaId)} (uploadId=${String(
              uploadId ?? ""
            )})`
          );
        }

        const result: RuploadResult = {
          type: mediaType,
          uploadId,
          response: parsed,
          mediaId,
        };

        results.push(result);
      }

      cb(null, results);
      return results;
    } catch (error: unknown) {
      const errorWithResponse = error as ErrorWithResponse;
      const errorMessage = errorWithResponse?.message || String(error);
      const statusCode = errorWithResponse?.response?.statusCode ||
        errorWithResponse?.response?.status ||
        errorWithResponse?.statusCode ||
        errorWithResponse?.status;

      // Check nếu là 400 Bad Request thì kiểm tra session status
      if (statusCode === 400 || errorMessage.includes("400") || errorMessage.includes("Bad Request")) {
        logger.warn(
          `[ruploadAttachment] Phát hiện 400 Bad Request trong error, đang kiểm tra session status...`
        );
        try {
          const sessionStatus = await checkSessionStatus(ctx, _defaultFuncs, error);
          logger.error(
            `[ruploadAttachment] Response code 400 (Bad Request) - Session Status: ${sessionStatus.details}`
          );

          if (!sessionStatus.cookieLive) {
            logger.error(
              `[ruploadAttachment] ⚠️ Cookie đã DEAD - Cần đăng nhập lại!`
            );
          }
          if (sessionStatus.isLoggedOut) {
            logger.error(
              `[ruploadAttachment] ⚠️ Tài khoản đã bị LOGOUT - Cần đăng nhập lại!`
            );
          }
          if (sessionStatus.hasCheckpoint) {
            logger.error(
              `[ruploadAttachment] ⚠️ Tài khoản bị CHECKPOINT - Cần xử lý checkpoint!`
            );
          }
          if (sessionStatus.hasWarning) {
            logger.error(
              `[ruploadAttachment] ⚠️ Tài khoản bị WARNING - Cần kiểm tra tài khoản!`
            );
          }

          // Nếu cookie DEAD hoặc tài khoản đã logout thì thử auto login ngay tại đây
          if (!sessionStatus.cookieLive || sessionStatus.isLoggedOut) {
            try {
              logger.warn(
                "[ruploadAttachment] Cookie/session có vấn đề, đang thử AUTO-LOGIN bằng facebook_web..."
              );
              const ok = await autoReloginWithFacebookWeb(ctx as any);
              if (ok) {
                logger.success(
                  "[ruploadAttachment] AUTO-LOGIN thành công. Cookie đã được cập nhật, vui lòng thử gửi lại file."
                );
              } else {
                logger.error(
                  "[ruploadAttachment] AUTO-LOGIN thất bại. Vui lòng kiểm tra lại thông tin đăng nhập trong config.json!"
                );
              }
            } catch (autoErr: unknown) {
              const autoMsg =
                autoErr instanceof Error ? autoErr.message : String(autoErr);
              logger.error(
                `[ruploadAttachment] Lỗi khi chạy AUTO-LOGIN sau khi cookie DEAD/logout: ${autoMsg}`
              );
            }
          }
        } catch (checkErr: unknown) {
          const errMsg = checkErr instanceof Error ? checkErr.message : String(checkErr);
          logger.warn(`[ruploadAttachment] Không thể check session status: ${errMsg}`);
        }
      }

      logger.error(`[ruploadAttachment] ${errorMessage}`);
      const finalError = error instanceof Error ? error : new Error(String(error));
      cb(finalError);
      throw finalError;
    }
  };
}

export type {
  AttachmentSource,
  RuploadInvocationOptions, RuploadResult, RuploadTask
};
