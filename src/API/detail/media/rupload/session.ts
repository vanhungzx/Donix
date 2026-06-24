"use strict";

import autoRelogin from "../../../../core/auth_login/auto_relogin";
import { extractUserID } from "../../../login/contextBuilder";
import type { DefaultFuncs } from "../../../request/formatters/helpers";
import { logRupload } from "./helpers";
import type { RuploadContext, SessionStatus } from "./types";

function readErrorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n${error.stack || ""}`;
  }
  try {
    return JSON.stringify(error ?? {});
  } catch {
    return String(error);
  }
}

export async function checkSessionStatus(
  ctx: RuploadContext,
  defaultFuncs: DefaultFuncs | undefined,
  error: unknown
): Promise<SessionStatus> {
  const result: SessionStatus = {
    cookieLive: false,
    isLoggedOut: false,
    hasWarning: false,
    hasCheckpoint: false,
    hasNotAuthorizedError: false,
    details: "",
  };

  try {
    if (ctx.jar) {
      const cookieUserId = extractUserID(ctx.jar);
      if (cookieUserId) {
        result.cookieLive = true;
        result.details += `Cookie: LIVE (c_user=${cookieUserId}); `;
      } else {
        result.details += "Cookie: DEAD; ";
      }
    } else {
      result.details += "Cookie: missing jar; ";
    }

    if (defaultFuncs && ctx.jar) {
      try {
        const homepage = await defaultFuncs.get(
          "https://www.facebook.com/",
          ctx.jar,
          null,
          ctx
        );
        const html =
          typeof homepage.data === "string"
            ? homepage.data
            : String(homepage.data ?? "");
        const responseUrl = String(
          (homepage.request as { res?: { responseUrl?: string } } | undefined)
            ?.res?.responseUrl ||
            homepage.config?.url ||
            ""
        ).toLowerCase();

        if (
          responseUrl.includes("/login.php") ||
          html.includes('"__user":0') ||
          html.includes('"USER_ID":0')
        ) {
          result.isLoggedOut = true;
          result.details += "Logout: YES; ";
        } else {
          result.details += "Logout: NO; ";
        }

        if (
          responseUrl.includes("/checkpoint/") ||
          /checkpoint_title|checkpointMain|id="checkpoint"|"checkpoint"/i.test(
            html
          )
        ) {
          result.hasCheckpoint = true;
          result.details += "Checkpoint: YES; ";
        } else {
          result.details += "Checkpoint: NO; ";
        }

        if (
          html.includes("XCheckpointFBScrapingWarningController") ||
          html.includes("601051028565049") ||
          html.includes("FBScrapingWarning")
        ) {
          result.hasWarning = true;
          result.details += "Warning: YES; ";
        } else {
          result.details += "Warning: NO; ";
        }
      } catch (sessionError) {
        const message =
          sessionError instanceof Error
            ? sessionError.message
            : String(sessionError);
        result.details += `Session check failed (${message}); `;
      }
    }

    const errorText = readErrorText(error);
    if (/NotAuthorizedError|User not authorized to perform this request/i.test(errorText)) {
      result.hasNotAuthorizedError = true;
      result.details += "NotAuthorizedError: YES; ";
    }
    if (/checkpoint/i.test(errorText)) {
      result.hasCheckpoint = true;
      result.details += "Checkpoint in error: YES; ";
    }
    if (/warning|FBScrapingWarning|601051028565049/i.test(errorText)) {
      result.hasWarning = true;
      result.details += "Warning in error: YES; ";
    }
    if (/login|logged out|Not logged in|login_required/i.test(errorText)) {
      result.isLoggedOut = true;
      result.details += "Logout in error: YES; ";
    }
  } catch (statusError) {
    const message =
      statusError instanceof Error ? statusError.message : String(statusError);
    result.details += `Unexpected session error (${message}); `;
  }

  return result;
}

export async function tryAutoRelogin(
  ctx: RuploadContext,
  _api?: unknown
): Promise<boolean> {
  try {
    if (
      ctx._autoLoginCooldownUntil &&
      Date.now() < ctx._autoLoginCooldownUntil
    ) {
      const waitMs = ctx._autoLoginCooldownUntil - Date.now();
      logRupload(
        `AUTO-LOGIN is cooling down (${Math.ceil(waitMs / 1000)}s)`,
        "warn"
      );
      return false;
    }

    if (typeof ctx.performAutoLogin === "function") {
      logRupload("Trying ctx.performAutoLogin()", "warn");
      const ok = await ctx.performAutoLogin();
      if (ok) {
        logRupload("AUTO-LOGIN succeeded via ctx.performAutoLogin()", "info");
        return true;
      }
    }

    logRupload("Trying core autoRelogin()", "warn");
    const ok = await autoRelogin(ctx);
    if (ok) {
      logRupload("AUTO-LOGIN succeeded via core autoRelogin()", "info");
    }
    return ok;
  } catch (autoError) {
    const message =
      autoError instanceof Error ? autoError.message : String(autoError);
    logRupload(`AUTO-LOGIN failed: ${message}`, "error");
    return false;
  }
}
