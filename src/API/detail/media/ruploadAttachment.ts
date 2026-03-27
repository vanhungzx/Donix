"use strict";

import axios, { type AxiosResponse } from "axios";
import fs from "fs";
import type { Readable } from "node:stream";
import { getConfig } from "../../../core/configManager";
import type { DefaultFuncs, Context } from "../../request/formatters/helpers";
import { generateOfflineThreadingID } from "../../request/formatters";
import {
  ANALYTICS_HEADER,
  AUDIO_WAVEFORM_FALLBACK,
  DEFAULT_UA,
  FRIENDLY_NAME,
  MEDIA_ENDPOINT,
  MESSAGE_SOURCE,
  ZERO_EH,
} from "./rupload/constants";
import {
  detectContentType,
  detectContentTypeFromBuffer,
  detectMediaType,
} from "./rupload/contentType";
import {
  buildEntityName,
  computeMediaHash,
  ensureString,
  generateUUID,
  logRupload,
  normalizeTask,
  readMagicBytes,
  safeJsonParse,
  sanitizeHeaderFilename,
  streamToBuffer,
  stringifyHeaderValue,
} from "./rupload/helpers";
import { bufferFromSource } from "./rupload/normalize";
import { checkSessionStatus, tryAutoRelogin } from "./rupload/session";
import type {
  AttachmentSource,
  ErrorWithResponse,
  RuploadCallback,
  RuploadContext,
  RuploadInvocationOptions,
  RuploadResult,
  RuploadTask,
} from "./rupload/types";

type RuploadInput =
  | AttachmentSource
  | RuploadTask
  | Array<AttachmentSource | RuploadTask>;

function resolveAccessToken(ctx: RuploadContext): string | undefined {
  const cfg = getConfig() as { token?: Record<string, string | undefined> };
  const tokenObj = cfg.token;
  const firstConfigToken =
    tokenObj && typeof tokenObj === "object"
      ? Object.values(tokenObj).find(
          (value): value is string => typeof value === "string" && value !== ""
        )
      : undefined;

  const ctxCandidates = [
    ctx.eaadToken,
    typeof ctx.globalOptions?.accessToken === "string"
      ? ctx.globalOptions.accessToken
      : undefined,
    ctx.access_token && ctx.access_token !== "NONE" ? ctx.access_token : undefined,
  ];

  return (
    tokenObj?.EAAD ||
    tokenObj?.EAAD6V7 ||
    tokenObj?.EAAAAU ||
    firstConfigToken ||
    ctxCandidates.find(
      (value): value is string => typeof value === "string" && value !== ""
    )
  );
}

function extractHeaderString(
  headers: AxiosResponse["headers"],
  key: string
): string {
  const value = headers?.[key];
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return typeof value === "string" ? value : "";
}

function extractMediaId(parsed: unknown): string | number | undefined {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }

  const container = parsed as Record<string, unknown>;
  const mediaId =
    container.media_id ??
    container.image_id ??
    container.video_id ??
    container.audio_id ??
    container.gif_id ??
    container.id;

  return typeof mediaId === "string" || typeof mediaId === "number"
    ? mediaId
    : undefined;
}

async function retryUploadWithFreshToken(
  endpoint: string,
  headers: Record<string, string>,
  normalized: Awaited<ReturnType<typeof bufferFromSource>>,
  timeoutMs: number,
  token: string
): Promise<AxiosResponse<unknown> | null> {
  if (!normalized.filePath && !normalized.buffer) {
    return null;
  }

  const retryHeaders = { ...headers, authorization: `OAuth ${token}` };
  const retryBody: Buffer | Readable = normalized.filePath
    ? fs.createReadStream(normalized.filePath)
    : normalized.buffer!;

  try {
    return await axios.post(endpoint, retryBody, {
      headers: retryHeaders,
      timeout: timeoutMs,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: () => true,
    });
  } finally {
    if (
      typeof (retryBody as Readable).destroy === "function" &&
      normalized.filePath
    ) {
      try {
        (retryBody as Readable).destroy();
      } catch {
        // ignore retry stream destroy errors
      }
    }
  }
}

export default function ruploadAttachmentModule(
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (
  inputs: RuploadInput,
  optsOrCallback?: RuploadInvocationOptions | RuploadCallback,
  maybeCallback?: RuploadCallback
) => Promise<RuploadResult[]> {
  const ruploadCtx = ctx as RuploadContext;

  return async function ruploadAttachment(
    inputs: RuploadInput,
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

    if (tasks.length === 0) {
      const err = new Error("Please provide at least one attachment");
      cb(err);
      throw err;
    }

    if (!ruploadCtx.userID) {
      const err = new Error("Missing userID in context");
      cb(err);
      throw err;
    }

    if (
      ruploadCtx._autoLoginCooldownUntil &&
      Date.now() < ruploadCtx._autoLoginCooldownUntil
    ) {
      const waitMs = ruploadCtx._autoLoginCooldownUntil - Date.now();
      const err = new Error(
        `AUTO-LOGIN is cooling down (${Math.ceil(waitMs / 1000)}s)`
      );
      cb(err);
      throw err;
    }

    if (ruploadCtx.auto_login && ruploadCtx._autoLoginPromise) {
      logRupload(
        "AUTO-LOGIN is running, waiting before starting upload",
        "warn"
      );
      try {
        await Promise.race([
          ruploadCtx._autoLoginPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Auto login timeout")), 90000)
          ),
        ]);
      } catch (autoLoginError) {
        const message =
          autoLoginError instanceof Error
            ? autoLoginError.message
            : String(autoLoginError);
        logRupload(`AUTO-LOGIN wait failed: ${message}`, "warn");
      }
    }

    let token = resolveAccessToken(ruploadCtx);
    if (!token) {
      const err = new Error("Missing access token for rupload");
      cb(err);
      throw err;
    }

    const results: RuploadResult[] = [];
    let sessionCheckDone = false;

    logRupload(`Starting upload process for ${tasks.length} file(s)`, "info");

    try {
      for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
        let uploadBody: Buffer | Readable | null = null;

        try {
          const task = normalizeTask(tasks[taskIndex]);
          const normalized = await bufferFromSource(task.source);

          let sniffedMime: string | null = null;
          let magicBytesForDetection: Buffer | undefined;

          if (normalized.buffer) {
            magicBytesForDetection =
              normalized.buffer.length > 8192
                ? normalized.buffer.subarray(0, 8192)
                : normalized.buffer;
            sniffedMime = detectContentTypeFromBuffer(normalized.buffer);
          } else if (normalized.filePath) {
            magicBytesForDetection = await readMagicBytes(normalized.filePath);
            sniffedMime = detectContentTypeFromBuffer(magicBytesForDetection);
          } else if (
            normalized.stream &&
            normalized.contentType !== "application/octet-stream"
          ) {
            sniffedMime = normalized.contentType;
          }

          const finalFilename = task.filename || normalized.filename;
          const finalContentType =
            task.contentType ||
            sniffedMime ||
            normalized.contentType ||
            detectContentType(finalFilename);

          const mediaType =
            task.mediaType ||
            detectMediaType(
              finalContentType,
              finalFilename,
              magicBytesForDetection
            );

          const uploadId = (task.uploadId || generateUUID()).toUpperCase();
          const offlineThreadingId =
            task.offlineThreadingId || generateOfflineThreadingID();
          const offlineAttachmentId =
            task.offlineAttachmentId || generateOfflineThreadingID();
          const requestToken = (task.requestToken || generateUUID()).toUpperCase();

          const deviceId =
            ensureString(task.deviceId || options.deviceId || generateUUID()) ||
            generateUUID();
          const senderFbid =
            ensureString(task.senderFbid || options.senderFbid || ruploadCtx.userID) ||
            String(ruploadCtx.userID);
          const bizSenderFbid =
            ensureString(task.bizSenderFbid || options.bizSenderFbid || senderFbid) ||
            senderFbid;
          const to = ensureString(task.to || options.to);
          const userAgent = task.userAgent || options.userAgent || DEFAULT_UA;
          const timeoutMs = task.timeoutMs || options.timeoutMs || 120000;

          const endpoint = `https://rupload.facebook.com/${
            MEDIA_ENDPOINT[mediaType]
          }/${uploadId}`;
          const rawEntityName =
            task.entityName || buildEntityName(mediaType, finalFilename);
          const entityName =
            sanitizeHeaderFilename(rawEntityName) ||
            buildEntityName(mediaType, normalized.filename || "file");

          const headers: Record<string, string> = {
            "User-Agent": userAgent,
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/octet-stream",
            "x-fb-request-analytics-tags": ANALYTICS_HEADER,
            "x-fb-rmd": "state=URL_ELIGIBLE",
            priority: task.priority || "u=3, i",
            "x-entity-name": entityName,
            offline_threading_id: String(offlineThreadingId),
            "x-tigon-is-retry": "False",
            "x-entity-type": finalContentType,
            ttl: "0",
            "x-fb-friendly-name":
              task.friendlyName || FRIENDLY_NAME[mediaType],
            message_source: task.messageSource || MESSAGE_SOURCE[mediaType],
            "x-fb-network-properties": "Wifi;Validated;",
            offset: "0",
            offline_attachment_id: String(offlineAttachmentId),
            "x-entity-length": String(normalized.size),
            authorization: `OAuth ${token}`,
            sender_fbid: senderFbid,
            device_id: deviceId,
            "x-fb-net-hni": "45201",
            "x-fb-sim-hni": "45201",
            client_tags: JSON.stringify({
              is_dialtone: "false",
              is_zero_balance: "false",
            }),
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

          if (
            mediaType === "image" ||
            mediaType === "video" ||
            mediaType === "gif"
          ) {
            if (normalized.buffer) {
              headers.media_hash = await computeMediaHash(normalized.buffer);
            } else if (normalized.filePath) {
              headers.media_hash = await computeMediaHash(
                fs.createReadStream(normalized.filePath)
              );
            }
          }

          if (mediaType === "image" || mediaType === "gif") {
            headers.image_type = "FILE_ATTACHMENT";
            headers.preprocessed_type = finalContentType;
            if (task.isHd) headers.is_hd = "1";
          }

          if (mediaType === "video") {
            headers.video_type = "FILE_ATTACHMENT";
            if (!task.dataclassParams) {
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
            headers.metadata_dataclass = stringifyHeaderValue(
              task.metadataDataclass
            );
          }
          if (mediaType === "gif") {
            if (!headers.dataclass_params) {
              headers.dataclass_params = stringifyHeaderValue({
                logging_metadata: { feature_tags: [] },
                send_instance_metadata: null,
              });
            }
            if (!headers.metadata_dataclass) {
              headers.metadata_dataclass = stringifyHeaderValue({
                sticker: { sticker_pack_id: "", sticker_id: "" },
              });
            }
          }
          if (typeof task.sendMessageByServer !== "undefined") {
            headers.send_message_by_server = String(task.sendMessageByServer);
          }

          if (options.extraHeaders) {
            for (const [key, value] of Object.entries(options.extraHeaders)) {
              headers[key.toLowerCase()] = value;
            }
          }
          if (task.extraHeaders) {
            for (const [key, value] of Object.entries(task.extraHeaders)) {
              headers[key.toLowerCase()] = value;
            }
          }

          if (normalized.stream) {
            if (normalized.size > 0) {
              uploadBody = normalized.stream;
              headers["Content-Length"] = String(normalized.size);
            } else {
              uploadBody = await streamToBuffer(normalized.stream);
              normalized.buffer = uploadBody;
              normalized.size = uploadBody.length;
              headers["Content-Length"] = String(uploadBody.length);
            }
          } else if (normalized.filePath) {
            uploadBody = fs.createReadStream(normalized.filePath);
            headers["Content-Length"] = String(normalized.size);
          } else if (normalized.buffer) {
            uploadBody = normalized.buffer;
            headers["Content-Length"] = String(normalized.buffer.length);
          } else {
            throw new Error("No valid source for upload");
          }

          let response = await axios.post(endpoint, uploadBody, {
            headers,
            timeout: timeoutMs,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            validateStatus: () => true,
          });

          if (
            typeof (uploadBody as Readable)?.destroy === "function" &&
            normalized.filePath
          ) {
            try {
              (uploadBody as Readable).destroy();
            } catch {
              // ignore destroy errors after upload
            }
          }

          let status = response.status || 0;
          const responseContentType = extractHeaderString(
            response.headers,
            "content-type"
          );
          logRupload(
            `Response received for file ${taskIndex + 1}: status=${status}, contentType=${
              responseContentType || "n/a"
            }`,
            "info"
          );

          if (status === 400 && !sessionCheckDone) {
            const sessionStatus = await checkSessionStatus(
              ruploadCtx,
              defaultFuncs,
              {
                name: "BadRequest",
                message: "Response code 400",
                response: {
                  status,
                  statusCode: status,
                  data: response.data,
                },
                statusCode: status,
              }
            );
            sessionCheckDone = true;
            logRupload(`400 Session status: ${sessionStatus.details}`, "warn");

            const hasRealSessionIssue =
              !sessionStatus.cookieLive ||
              sessionStatus.isLoggedOut ||
              sessionStatus.hasCheckpoint ||
              sessionStatus.hasWarning;
            const onlyNotAuthorized =
              sessionStatus.hasNotAuthorizedError && !hasRealSessionIssue;

            if (onlyNotAuthorized) {
              const freshToken = resolveAccessToken(ruploadCtx);
              if (freshToken && freshToken !== token) {
                token = freshToken;
                const retryResponse = await retryUploadWithFreshToken(
                  endpoint,
                  headers,
                  normalized,
                  timeoutMs,
                  token
                );
                if (retryResponse && (retryResponse.status === 200 || retryResponse.status === 201)) {
                  response = retryResponse;
                  status = response.status;
                  logRupload("Retry with refreshed token succeeded", "info");
                }
              }
            } else if (hasRealSessionIssue) {
              const reloginOk = await tryAutoRelogin(ruploadCtx, _api);
              if (reloginOk) {
                const freshToken = resolveAccessToken(ruploadCtx);
                if (freshToken) {
                  token = freshToken;
                  const retryResponse = await retryUploadWithFreshToken(
                    endpoint,
                    headers,
                    normalized,
                    timeoutMs,
                    token
                  );
                  if (retryResponse && (retryResponse.status === 200 || retryResponse.status === 201)) {
                    response = retryResponse;
                    status = response.status;
                    logRupload("Retry after AUTO-LOGIN succeeded", "info");
                  }
                }
              }
            }
          }

          const parsed = safeJsonParse(response.data);
          const mediaId = extractMediaId(parsed);

          if (!mediaId && status !== 200 && status !== 201) {
            throw new Error(
              `Upload failed with status ${status}. Response: ${JSON.stringify(parsed).slice(
                0,
                500
              )}`
            );
          }

          if (mediaId) {
            logRupload(`Upload succeeded with mediaId=${String(mediaId)}`, "info");
          } else {
            logRupload(
              "Upload returned success status but no mediaId was extracted",
              "warn"
            );
          }

          results.push({
            type: mediaType,
            uploadId,
            response: parsed,
            mediaId,
          });

          normalized.buffer = null;
          if (normalized.stream) {
            try {
              if (!normalized.stream.destroyed && normalized.stream.readable) {
                normalized.stream.destroy();
              }
            } catch {
              // ignore post-upload stream cleanup failures
            }
            normalized.stream = null;
          }
        } catch (taskError) {
          const message =
            taskError instanceof Error ? taskError.message : String(taskError);
          logRupload(
            `Error processing file ${taskIndex + 1}/${tasks.length}: ${message}`,
            "error"
          );
          results.push({
            type: "unknown",
            response: { error: message },
            error: message,
          });
        } finally {
          if (uploadBody && typeof (uploadBody as Readable).destroy === "function") {
            try {
              (uploadBody as Readable).destroy();
            } catch {
              // ignore final stream cleanup failures
            }
          }
        }
      }

      const successCount = results.filter((result) => result.mediaId).length;
      const failCount = results.length - successCount;
      logRupload(
        `Upload summary: ${successCount}/${results.length} succeeded, ${failCount} failed`,
        successCount > 0 ? "info" : "warn"
      );

      if (successCount === 0 && results.length > 0) {
        const error = new Error(
          `ruploadAttachment failed: all ${results.length} upload(s) failed`
        );
        cb(error);
        throw error;
      }

      cb(null, results);
      return results;
    } catch (error) {
      const err = error as ErrorWithResponse;
      const statusCode =
        err.response?.status ||
        err.response?.statusCode ||
        err.status ||
        err.statusCode;
      const errorMessage = err.message || String(error);

      logRupload(
        `Upload failed: ${errorMessage}${statusCode ? ` (status ${statusCode})` : ""}`,
        "error"
      );

      if (
        (statusCode === 400 ||
          errorMessage.includes("400") ||
          errorMessage.includes("Bad Request")) &&
        !sessionCheckDone
      ) {
        try {
          const sessionStatus = await checkSessionStatus(
            ruploadCtx,
            defaultFuncs,
            error
          );
          logRupload(`Catch session status: ${sessionStatus.details}`, "warn");
          sessionCheckDone = true;
          if (
            !sessionStatus.cookieLive ||
            sessionStatus.isLoggedOut ||
            sessionStatus.hasCheckpoint ||
            sessionStatus.hasWarning
          ) {
            await tryAutoRelogin(ruploadCtx, _api);
          }
        } catch (sessionError) {
          const message =
            sessionError instanceof Error
              ? sessionError.message
              : String(sessionError);
          logRupload(`Unable to check session: ${message}`, "warn");
        }
      }

      const finalError = error instanceof Error ? error : new Error(String(error));
      cb(finalError);
      throw finalError;
    }
  };
}
