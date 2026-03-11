"use strict";

import logger from "@log";
import type { FBResponse } from "@types";
import type { Readable } from "node:stream";
import { extractUserID } from "../../login/contextBuilder";
import type { Context, DefaultFuncs } from "../../request/formatters/helpers";
import uploadFbFactory from "./uploadFb";
import autoRelogin from "../../../core/auth_login/auto_relogin";

interface UploadIdResult {
  mediaId?: string | number;
  media_id?: string | number;
  audio_id?: string | number;
  image_id?: string | number;
  video_id?: string | number;
  gif_id?: string | number;
  file_id?: string | number;
  fbid?: string | number;
  uploadId?: string | number;
  upload_id?: string | number;
  id?: string | number;
  type?: string;
  filename?: string;
  filetype?: string;
  thumbnail_src?: string;
}

interface ErrorWithResponse extends Error {
  response?: {
    status?: number;
    statusCode?: number;
  };
  statusCode?: number;
  status?: number;
}

interface ResponseWithUrl extends FBResponse<string> {
  data: string;
  request?: {
    res?: {
      responseUrl?: string;
    };
  };
}

interface UploadAttachmentResult {
  video_id?: string | number;
  image_id?: string | number;
  audio_id?: string | number;
  file_id?: string | number;
  gif_id?: string | number;
  fbid?: string | number;
  id?: string | number;
  upload_id?: string | number;
  filename?: string;
  filetype?: string;
  thumbnail_src?: string;
}

interface ClientWithRupload {
  ruploadAttachment?: (inputs: unknown) => Promise<Array<{ type?: string; uploadId?: string; mediaId?: string | number }>>;
}

function extractUploadId(r: UploadIdResult | null | undefined): string | number | null {
  if (!r) return null;
  return (
    r.mediaId ||
    r.media_id ||
    r.audio_id ||
    r.image_id ||
    r.video_id ||
    r.gif_id ||
    r.file_id ||
    r.fbid ||
    r.uploadId ||
    r.upload_id ||
    r.id ||
    null
  );
}

/**
 * Kiểm tra trạng thái session/cookie khi gặp lỗi upload
 */
async function checkSessionStatus(
  ctx: Context,
  defaultFuncs: DefaultFuncs,
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
    const userID = extractUserID(ctx.jar);
    if (userID && userID === ctx.userID) {
      result.cookieLive = true;
      result.details += "Cookie: LIVE ✓; ";
    } else {
      result.cookieLive = false;
      result.details += "Cookie: DEAD ✗ (không tìm thấy userID hoặc không khớp); ";
    }

    // 2. Check có bị logout không bằng cách gọi API đơn giản
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

type UploadInput = string | string[] | Readable | Readable[] | Buffer | { path?: string; url?: string; buffer?: Buffer; data?: Buffer; stream?: Readable; filename?: string; contentType?: string };

export default function (
  defaultFuncs: DefaultFuncs,
  client: ClientWithRupload,
  ctx: Context
): (inputs: UploadInput | UploadInput[]) => Promise<UploadAttachmentResult[]> {
  return async function uploadAttachment(inputs: UploadInput | UploadInput[]): Promise<UploadAttachmentResult[]> {
    if (!ctx) {
      throw new Error("Context is required for uploadAttachment");
    }

    const files = Array.isArray(inputs) ? inputs : [inputs];
    if (!files.length) return [];

    // Get ruploadAttachment as fallback
    const ruploader = client?.ruploadAttachment;
    let uploadFbError: unknown = null;

    // Try uploadFb first
    try {
      const uploadFb = uploadFbFactory(defaultFuncs, undefined, ctx);
      const result = await uploadFb(files, { mode: "parallel", concurrency: 3 });

      if (result && result.ids && Array.isArray(result.ids) && result.ids.length > 0) {
        // Return results in the expected format
        const mapped: Array<UploadAttachmentResult | null> = result.ids.map((r) => {
          const id = extractUploadId(r);
          if (!id) return null;
          return {
            video_id: r.video_id || (r.type === "video" ? id : undefined),
            image_id: r.image_id || (r.type === "image" || r.type === "gif" ? id : undefined),
            audio_id: r.audio_id || (r.type === "audio" ? id : undefined),
            file_id: r.file_id,
            gif_id: r.gif_id || (r.type === "gif" ? id : undefined),
            fbid: r.fbid || id,
            id: r.id || id,
            upload_id: r.upload_id,
            filename: r.filename,
            filetype: r.filetype,
            thumbnail_src: r.thumbnail_src,
          };
        });
        return mapped.filter((r) => r !== null) as UploadAttachmentResult[];
      }
    } catch (err) {
      uploadFbError = err;
      // uploadFb failed, will try ruploadAttachment as fallback
      const code = (err as any)?.code;
      if (code !== "NO_METADATA") {
        logger.warn(`uploadAttachment (uploadFb failed): ${(err as Error)?.message || err}`);
      }
    }

    // Fallback to ruploadAttachment if uploadFb failed or returned no IDs
    if (ruploader && typeof ruploader === "function") {
      try {
        const reason =
          uploadFbError
            ? ` (reason: ${String((uploadFbError as any)?.code || "")} ${(uploadFbError as any)?.message || uploadFbError})`
            : " (reason: uploadFb returned no IDs)";
        logger.warn(`[uploadAttachment] fallback -> ruploadAttachment${reason}`);

        // Wrap files into task format that ruploadAttachment expects
        const tasks = files.map((src: any) => ({
          source: src,
        }));

        const rres = await ruploader(tasks);
        if (Array.isArray(rres) && rres.length > 0) {
          // Convert ruploadAttachment results to expected format
          const mapped: Array<UploadAttachmentResult | null> = rres.map((r: { type?: string; uploadId?: string; mediaId?: string | number }) => {
            const id = extractUploadId(r);
            if (!id) {
              logger.warn(`[uploadAttachment] Could not extract ID from ruploadAttachment result: ${JSON.stringify({ type: r?.type, uploadId: r?.uploadId, mediaId: r?.mediaId })}`);
              return null;
            }
            return {
              video_id: r.type === "video" ? id : undefined,
              image_id: r.type === "image" || r.type === "gif" ? id : undefined,
              audio_id: r.type === "audio" ? id : undefined,
              gif_id: r.type === "gif" ? id : undefined,
              fbid: id,
              id: id,
              upload_id: r.uploadId,
            };
          });
          const out = mapped.filter((r) => r !== null) as UploadAttachmentResult[];
          if (out.length > 0) {
            logger.success(`[uploadAttachment] ruploadAttachment success ${out.length}/${files.length} item(s)`);
          } else {
            logger.warn(`[uploadAttachment] ruploadAttachment returned ${rres.length} results but no valid IDs extracted. Results: ${JSON.stringify(rres.map((r: any) => ({ type: r?.type, uploadId: r?.uploadId, mediaId: r?.mediaId })))}`);
          }
          return out;
        } else {
          logger.warn(`[uploadAttachment] ruploadAttachment returned empty or invalid result: ${JSON.stringify(rres)}`);
        }
      } catch (e2) {
        // Both uploadFb and ruploadAttachment failed
        const error = e2 as Error;
        const errorMessage = error?.message || String(e2);

        // Check nếu là 400 Bad Request thì kiểm tra session status
        const errorWithResponse = error as ErrorWithResponse;
        const has400Status = errorWithResponse?.response?.status === 400 ||
          errorWithResponse?.response?.statusCode === 400 ||
          errorWithResponse?.statusCode === 400 ||
          errorWithResponse?.status === 400;
        if (errorMessage.includes("400") || errorMessage.includes("Bad Request") || has400Status) {
          logger.warn(`[uploadAttachment] Phát hiện 400 Bad Request, đang kiểm tra session status...`);
          try {
            const sessionStatus = await checkSessionStatus(ctx, defaultFuncs, e2);
            logger.error(`[uploadAttachment] Session Status: ${sessionStatus.details}`);

            if (!sessionStatus.cookieLive) {
              logger.error(`[uploadAttachment] ⚠️ Cookie đã DEAD - Cần đăng nhập lại!`);
            }
            if (sessionStatus.isLoggedOut) {
              logger.error(`[uploadAttachment] ⚠️ Tài khoản đã bị LOGOUT - Cần đăng nhập lại!`);
            }
            if (sessionStatus.hasCheckpoint) {
              logger.error(
                `[uploadAttachment] ⚠️ Tài khoản bị CHECKPOINT - Cần xử lý checkpoint!`
              );
            }
            if (sessionStatus.hasWarning) {
              logger.error(
                `[uploadAttachment] ⚠️ Tài khoản bị WARNING - Cần kiểm tra tài khoản!`
              );
            }

            // Nếu cookie DEAD hoặc tài khoản đã logout thì thử auto login ngay tại đây
            if (!sessionStatus.cookieLive || sessionStatus.isLoggedOut) {
              try {
                logger.warn(
                  "[uploadAttachment] Cookie/session có vấn đề, đang thử AUTO-LOGIN..."
                );
                const ok = await autoRelogin(ctx as any);
                if (ok) {
                  logger.success(
                    "[uploadAttachment] AUTO-LOGIN thành công. Cookie đã được cập nhật, vui lòng thử gửi lại file."
                  );
                } else {
                  logger.error(
                    "[uploadAttachment] AUTO-LOGIN thất bại. Vui lòng kiểm tra lại thông tin đăng nhập trong config.json!"
                  );
                }
              } catch (autoErr: unknown) {
                const autoMsg =
                  autoErr instanceof Error ? autoErr.message : String(autoErr);
                logger.error(
                  `[uploadAttachment] Lỗi khi chạy AUTO-LOGIN sau khi cookie DEAD/logout: ${autoMsg}`
                );
              }
            }
          } catch (checkErr: unknown) {
            const errMsg = checkErr instanceof Error ? checkErr.message : String(checkErr);
            logger.warn(`[uploadAttachment] Không thể check session status: ${errMsg}`);
          }
        }

        logger.error(`uploadAttachment (both methods failed): ${errorMessage}`);
        throw new Error(
          `Upload failed: uploadFb and ruploadAttachment both failed. Last error: ${errorMessage}`
        );
      }
    }

    throw new Error("Upload failed: uploadFb returned no IDs and ruploadAttachment is not available");
  };
}
