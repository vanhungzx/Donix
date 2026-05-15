import log from "@log";
import utils, { get } from "../../request/index";
import { clearCheckpointManualRequired, setCheckpointManualRequired } from "../../request/checkpointCooldown.js";
import { bypassScrapingWarning } from "../../login/bypassScrapingWarning.js";
import { GRAPHQL_DOC_ID } from "./constants";
import { isCheckpoint282Signal, isCheckpoint956Signal } from "./checkpointSignals";
import { getSequenceIdFromHtml } from "./htmlSequenceId";

const { parseAndCheckLogin } = utils;

export type GetSeqIdResult = "started" | "retry" | "fatal";

function signalText(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof Error) {
    const extra = (input as Error & { error?: string; res?: unknown }).error || "";
    const res = (input as Error & { res?: unknown }).res;
    return `${input.message || ""} ${extra} ${signalText(res)}`.trim();
  }
  if (input && typeof input === "object") {
    try {
      return JSON.stringify(input);
    } catch {
      return String(input);
    }
  }
  return String(input ?? "");
}

function isScrapingWarningSignal(input: unknown): boolean {
  const text = signalText(input);
  return (
    text.includes("XCheckpointFBScrapingWarningController") ||
    text.includes("601051028565049") ||
    text.includes("checkpoint/601051028565049") ||
    text.includes("FBScrapingWarning")
  );
}

function isLoggedOutSignal(input: unknown): boolean {
  const text = signalText(input).toLowerCase();
  return (
    text.includes("https://www.facebook.com/login.php?") ||
    text.includes("/login.php") ||
    text.includes("\"error\":\"not logged in.\"") ||
    text.includes("\"error\":\"not logged in\"") ||
    text.includes("not logged in") ||
    text.includes("facebook blocked the login") ||
    text.includes("logged out")
  );
}

function formatSignalForLog(input: unknown): string {
  const text = signalText(input).replace(/\s+/g, " ").trim();
  return text.length > 280 ? `${text.slice(0, 277)}...` : text;
}

export async function handleAutoLogin(
  ctx: any,
  resData: any,
  retry = true,
  _defaultFuncs: any
): Promise<void> {
  const resStr = signalText(resData);
  if (isLoggedOutSignal(resStr)) {
    if (!ctx.auto_login && retry) {
      ctx.auto_login = true;
      console.error("Phien dang nhap het han");
    }
  }

  if (isCheckpoint282Signal(resStr)) {
    log.error("Bot bi checkpoint 282, dang tu dong doi tai khoan...");
    try {
      const { default: autoRelogin } = await import("../../../core/auth_login/auto_relogin");
      const { reloadConfig } = await import("../../../core/configManager");
      const ok = await autoRelogin(ctx);
      if (ok) {
        const reloadResult = await reloadConfig();
        if (!reloadResult.success) {
          log.warn(`Khong the reload config sau auto login: ${reloadResult.error || "Unknown error"}`);
        }
        log.success("AUTO-LOGIN thanh cong sau checkpoint 282! Dang khoi dong lai...");
        process.exit(1);
      } else {
        log.error("AUTO-LOGIN that bai sau checkpoint 282. Vui long kiem tra lai thong tin dang nhap!");
        process.exit(0);
      }
    } catch (autoErr: any) {
      log.error(`Loi khi thuc hien AUTO-LOGIN sau checkpoint 282: ${autoErr?.message || autoErr}`);
      process.exit(0);
    }
    return;
  }

  if (isCheckpoint956Signal(resStr)) {
    log.error("Bot bi checkpoint 956, dang tu dong doi tai khoan...");
    try {
      const { default: autoRelogin } = await import("../../../core/auth_login/auto_relogin");
      const { reloadConfig } = await import("../../../core/configManager");
      const ok = await autoRelogin(ctx);
      if (ok) {
        const reloadResult = await reloadConfig();
        if (!reloadResult.success) {
          log.warn(`Khong the reload config sau auto login: ${reloadResult.error || "Unknown error"}`);
        }
        log.success("AUTO-LOGIN thanh cong sau checkpoint 956! Dang khoi dong lai...");
        process.exit(1);
      } else {
        log.error("AUTO-LOGIN that bai sau checkpoint 956. Vui long kiem tra lai thong tin dang nhap!");
        process.exit(0);
      }
    } catch (autoErr: any) {
      log.error(`Loi khi thuc hien AUTO-LOGIN sau checkpoint 956: ${autoErr?.message || autoErr}`);
      process.exit(0);
    }
    return;
  }

  if (!ctx.auto_login && retry) {
    ctx.auto_login = true;
    log.error("Auto login successful! Restarting...");
    ctx.auto_login = false;
    process.exit(1);
  }
}

export function buildQuery(
  limit = 50,
  tags = ["INBOX", "ARCHIVED", "PENDING", "OTHER"],
  includeReceipts = true
): any {
  return {
    o0: {
      doc_id: GRAPHQL_DOC_ID,
      query_params: {
        limit,
        before: null,
        tags,
        includeDeliveryReceipts: includeReceipts,
        includeSeqID: true,
      },
    },
  };
}

export async function getSequenceIdFromHtmlOrGraphQL(
  ctx: any,
  defaultFuncs: any
): Promise<string | null> {
  try {
    log.system("Dang lay sequence ID tu HTML...");
    const htmlRes = await get("https://www.facebook.com/", ctx.jar, undefined, ctx);
    const html = typeof htmlRes?.data === "string" ? htmlRes.data : String(htmlRes?.data ?? "");
    let newSeqId = getSequenceIdFromHtml(html);

    if (newSeqId) {
      log.success(`Da lay sequence ID tu HTML: ${newSeqId}`);
      return newSeqId;
    }

    log.warn("Khong tim thay sequence ID tu HTML, dang thu lay tu GraphQL...");
    if (defaultFuncs) {
      try {
        const postData = {
          av: ctx.userID,
          queries: JSON.stringify(buildQuery(1, ["INBOX"], true)),
        };

        const rawRes = await defaultFuncs.post(
          "https://www.facebook.com/api/graphqlbatch/",
          ctx.jar,
          postData,
          ctx
        );
        const resData = await parseAndCheckLogin(ctx, defaultFuncs)(rawRes);

        if (isScrapingWarningSignal(resData)) {
          log.warn("GraphQL tra ve scraping warning 049 khi lay sequence ID.");
          return null;
        }

        if (Array.isArray(resData) && resData.length > 0) {
          const syncSeqId = resData[0]?.o0?.data?.viewer?.message_threads?.sync_sequence_id;
          if (syncSeqId) {
            newSeqId = typeof syncSeqId === "string" ? syncSeqId : String(syncSeqId);
            log.success(`Da lay sequence ID tu GraphQL: ${newSeqId}`);
            return newSeqId;
          }
        }
      } catch (error: any) {
        if (isScrapingWarningSignal(error)) {
          log.warn("GraphQL tra ve scraping warning 049 khi lay sequence ID.");
        } else {
          log.warn(`Loi khi lay sequence ID tu GraphQL: ${formatSignalForLog(error)}`);
        }
      }
    }

    log.warn("Khong the lay sequence ID tu ca HTML va GraphQL");
    return null;
  } catch (error: any) {
    log.error(`Loi khi lay sequence ID: ${error?.message || error}`);
    return null;
  }
}

export function createGetSeqID(
  ctx: any,
  defaultFuncs: any,
  api: any,
  listenMqtt: any,
  globalCallback: any,
  messageCleanupInterval: NodeJS.Timeout | null
): () => Promise<GetSeqIdResult> {
  return async () => {
    ctx.t_mqttCalled = false;

    const seqIdFromHtml = await getSequenceIdFromHtmlOrGraphQL(ctx, defaultFuncs);
    if (seqIdFromHtml) {
      ctx.lastSeqId = seqIdFromHtml;
      listenMqtt(defaultFuncs, api, ctx, globalCallback);
      return "started";
    }

    const postData = {
      av: ctx.userID,
      queries: JSON.stringify(buildQuery(1, ["INBOX"], false)),
    };

    return defaultFuncs
      .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, postData)
      .then(parseAndCheckLogin(ctx, defaultFuncs))
      .then(async (resData: any) => {
        if (isScrapingWarningSignal(resData)) {
          const cleared = await handleFBWarning(api, ctx, messageCleanupInterval);
          return cleared ? ("retry" as const) : ("fatal" as const);
        }
        await handleAutoLogin(ctx, resData, false, defaultFuncs);
        if (!Array.isArray(resData) || !resData.length) {
          log.warn("getSeqID: Khong co du lieu GraphQL de khoi dong lai MQTT");
          return "retry" as const;
        }
        const lastRes = resData[resData.length - 1];
        if (lastRes?.error_results > 0) {
          console.warn("getSeqID: Co loi trong ket qua", resData[0]?.o0?.errors);
        }
        if (lastRes?.successful_results === 0) {
          console.warn("getSeqID: Khong co ket qua thanh cong", resData);
          return "retry" as const;
        }
        const syncSeqId = resData[0]?.o0?.data?.viewer?.message_threads?.sync_sequence_id;
        if (syncSeqId) {
          ctx.lastSeqId = syncSeqId;
          listenMqtt(defaultFuncs, api, ctx, globalCallback);
          return "started" as const;
        }
        console.warn("getSeqID: Khong tim thay sync_sequence_id", resData);
        return "retry" as const;
      })
      .catch((err: any) =>
        handleGetSeqIDError(err, ctx, api, globalCallback, messageCleanupInterval)
      );
  };
}

export async function handleFBWarning(
  _api: any,
  ctx: any,
  _messageCleanupInterval: NodeJS.Timeout | null
): Promise<boolean> {
  log.warn("Phat hien scraping warning 049. Dang thu bypass bang FBScrapingWarningMutation...");
  try {
    const ok = await bypassScrapingWarning(ctx.jar);
    if (ok) {
      log.success("Bypass scraping warning thanh cong trong getSeqID!");
      clearCheckpointManualRequired(ctx);
      if (ctx?.options) clearCheckpointManualRequired(ctx.options);
      if (ctx?.globalOptions) clearCheckpointManualRequired(ctx.globalOptions);
      if (ctx._checkpointCooldownUntil) ctx._checkpointCooldownUntil = 0;
      if (ctx._autoLoginCooldownUntil) ctx._autoLoginCooldownUntil = 0;
      return true;
    }
  } catch (e: any) {
    log.warn(`Bypass scraping warning that bai: ${e?.message || e}`);
  }
  const reason = "checkpoint scraping warning";
  setCheckpointManualRequired(ctx, { ms: 15 * 60_000, reason });
  if (ctx?.options && ctx.options !== ctx) {
    setCheckpointManualRequired(ctx.options, { ms: 15 * 60_000, reason });
  }
  if (ctx?.globalOptions && ctx.globalOptions !== ctx.options) {
    setCheckpointManualRequired(ctx.globalOptions, { ms: 15 * 60_000, reason });
  }
  log.error(
    "Phat hien scraping warning 049. Bypass khong thanh cong, yeu cau xu ly checkpoint thu cong."
  );
  return false;
}

export async function handleGetSeqIDError(
  err: any,
  ctx: any,
  api: any,
  globalCallback: any,
  messageCleanupInterval: NodeJS.Timeout | null
): Promise<GetSeqIdResult> {
  const errCode = err?.code || err?.errno || "";
  const errMessage = String(err?.message || err || "").toLowerCase();
  const isNetworkErr =
    errCode === "ENOTFOUND" ||
    errCode === "ECONNRESET" ||
    errCode === "ECONNREFUSED" ||
    errCode === "ETIMEDOUT" ||
    errMessage.includes("getaddrinfo enotfound") ||
    errMessage.includes("econnreset") ||
    errMessage.includes("connection reset") ||
    errMessage.includes("network");

  if (isNetworkErr) {
    log.warn(`getSeqID error (loi mang): ${err?.message || err}. Se tu dong thu lai khi co mang...`);
    return "retry";
  }

  if (isScrapingWarningSignal(err)) {
    const cleared = await handleFBWarning(api, ctx, messageCleanupInterval);
    return cleared ? "retry" : "fatal";
  }

  log.error(`getSeqID error: ${formatSignalForLog(err)}`);
  const errStr = signalText(err);
  if (errStr.includes("https://www.facebook.com/login.php?")) {
    console.error("Phien dang nhap het han");
  }
  if (isLoggedOutSignal(err) && !isScrapingWarningSignal((err as any)?.res)) {
    ctx.loggedIn = false;
    if (err && typeof err === "object") {
      (err as any).error = "Account logged out";
    }
    globalCallback(err);
    return "fatal";
  }
  globalCallback(err);
  return "retry";
}
