import log from "@log";
import type {
  DefaultFuncsHttpResponse,
  FBResponse,
  FbNetworkResponse,
} from "../../types/request.js";
import {
  CheckpointRequiredError,
  clearCheckpointManualRequired,
  setCheckpointManualRequired,
} from "../request/checkpointCooldown.js";
import { saveCookies } from "../request/clients.js";
import type { Context, GlobalOptions } from "../request/formatters/helpers.js";
import { get } from "../request/index.js";
import { bypassScrapingWarning } from "./bypassScrapingWarning.js";

type Resp = FBResponse<string> | FbNetworkResponse;

function responseUrl(r: Resp): string {
  const reqUrl = (r as { request?: { res?: { responseUrl?: string } } }).request?.res?.responseUrl;
  if (reqUrl) return reqUrl;
  const cfg = (r as { config?: { baseURL?: string; url?: string }; url?: string }).config;
  if (cfg?.baseURL) {
    return new URL(cfg.url || "/", cfg.baseURL).toString();
  }
  const topUrl = (r as { url?: string }).url;
  return (typeof cfg?.url === "string" ? cfg.url : "") || (typeof topUrl === "string" ? topUrl : "");
}

function responseBody(r: Resp): string {
  if (typeof r.data === "string") {
    return r.data;
  }
  const body = "body" in r ? r.body : undefined;
  if (typeof body === "string") {
    return body;
  }
  return String(r.data ?? body ?? "");
}

function isScrapingWarningCheckpoint(r: Resp): boolean {
  const url = responseUrl(r);
  const body = responseBody(r);
  return (
    url.includes("checkpoint/601051028565049") ||
    body.includes("XCheckpointFBScrapingWarningController") ||
    body.includes("601051028565049") ||
    body.includes("FBScrapingWarning")
  );
}

function raiseCheckpointRequired(options: GlobalOptions): never {
  setCheckpointManualRequired(options, {
    ms: 15 * 60_000,
    reason: "checkpoint scraping warning",
  });
  log.error(
    "Phat hien checkpoint scraping warning 049. Dung automation va xu ly checkpoint thu cong tren Facebook."
  );
  throw new CheckpointRequiredError(
    "Tai khoan dang bi Facebook yeu cau kiem tra thu cong (checkpoint 601051028565049). Hay mo Facebook trong trinh duyet, hoan tat checkpoint, cap nhat cookie, roi dang nhap lai."
  );
}

async function tryBypassOrRaise(
  jar: Context["jar"],
  options: GlobalOptions,
  html: string
): Promise<void> {
  log.warn("Phat hien checkpoint scraping warning 049. Dang thu bypass bang FBScrapingWarningMutation...");
  try {
    const ok = await bypassScrapingWarning(jar, html);
    if (ok) {
      log.success("Bypass scraping warning thanh cong! Tiep tuc dang nhap...");
      clearCheckpointManualRequired(options);
      if (options._checkpointCooldownUntil) {
        options._checkpointCooldownUntil = 0;
      }
      if (options._autoLoginCooldownUntil) {
        options._autoLoginCooldownUntil = 0;
      }
      return;
    }
  } catch (bypassErr: unknown) {
    const msg = bypassErr instanceof Error ? bypassErr.message : String(bypassErr);
    log.warn(`Bypass scraping warning that bai: ${msg}`);
  }
  raiseCheckpointRequired(options);
}

export async function bypassAutomation(
  resp: DefaultFuncsHttpResponse | null | undefined,
  jar: Context["jar"],
  options: GlobalOptions
): Promise<DefaultFuncsHttpResponse> {
  try {
    if (resp) {
      if (isScrapingWarningCheckpoint(resp as Resp)) {
        await tryBypassOrRaise(jar, options, responseBody(resp as Resp));
        const refreshed = await get(
          "https://www.facebook.com/",
          jar,
          undefined,
          options,
          undefined,
          undefined
        ).then(saveCookies(jar));
        if (isScrapingWarningCheckpoint(refreshed as Resp)) {
          raiseCheckpointRequired(options);
        }
        return refreshed;
      }
      return resp;
    }

    const res = await get(
      "https://www.facebook.com/",
      jar,
      undefined,
      options,
      undefined,
      undefined
    ).then(saveCookies(jar));

    if (isScrapingWarningCheckpoint(res as Resp)) {
      await tryBypassOrRaise(jar, options, responseBody(res as Resp));
      const refreshed = await get(
        "https://www.facebook.com/",
        jar,
        undefined,
        options,
        undefined,
        undefined
      ).then(saveCookies(jar));
      if (isScrapingWarningCheckpoint(refreshed as Resp)) {
        raiseCheckpointRequired(options);
      }
      return refreshed;
    }

    return res;
  } catch (e: unknown) {
    if (e instanceof CheckpointRequiredError) {
      throw e;
    }
    const errorMessage = e instanceof Error ? e.message : String(e);
    log.error(`Loi khi kiem tra automation warning: ${errorMessage}`);
    if (resp) {
      return resp;
    }
    return await get(
      "https://www.facebook.com/",
      jar,
      undefined,
      options,
      undefined,
      undefined
    ).then(saveCookies(jar));
  }
}
