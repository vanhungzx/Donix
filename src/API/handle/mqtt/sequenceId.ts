import log from "@log";
import utils, { get } from "../../request/index";
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

export async function handleAutoLogin(ctx: any, resData: any, retry = true, _defaultFuncs: any): Promise<void> {
  const resStr = signalText(resData);
  if (isLoggedOutSignal(resStr)) {
    if (!ctx.auto_login && retry) {
      ctx.auto_login = true;
      console.error("Phiên đăng nhập hết hạn");
    }
  }

  // Xử lý checkpoint 282 - tự động đổi acc
  if (isCheckpoint282Signal(resStr)) {
    log.error("Bot bị checkpoint 282, đang tự động đổi tài khoản...");
    try {
      const { default: autoRelogin } = await import("../../../core/auth_login/auto_relogin");
      const { reloadConfig } = await import("../../../core/configManager");
      const ok = await autoRelogin(ctx);
      if (ok) {
        const reloadResult = await reloadConfig();
        if (!reloadResult.success) {
          log.warn(`Không thể reload config sau auto login: ${reloadResult.error || "Unknown error"}`);
        }
        log.success("AUTO-LOGIN thành công sau checkpoint 282! Đang khởi động lại...");
        process.exit(1);
      } else {
        log.error("AUTO-LOGIN thất bại sau checkpoint 282. Vui lòng kiểm tra lại thông tin đăng nhập!");
        process.exit(0);
      }
    } catch (autoErr: any) {
      log.error(`Lỗi khi thực hiện AUTO-LOGIN sau checkpoint 282: ${autoErr?.message || autoErr}`);
      process.exit(0);
    }
    return;
  }

  // Xử lý checkpoint 956 - tự động đổi acc
  if (isCheckpoint956Signal(resStr)) {
    log.error("Bot bị checkpoint 956, đang tự động đổi tài khoản...");
    try {
      const { default: autoRelogin } = await import("../../../core/auth_login/auto_relogin");
      const { reloadConfig } = await import("../../../core/configManager");
      const ok = await autoRelogin(ctx);
      if (ok) {
        const reloadResult = await reloadConfig();
        if (!reloadResult.success) {
          log.warn(`Không thể reload config sau auto login: ${reloadResult.error || "Unknown error"}`);
        }
        log.success("AUTO-LOGIN thành công sau checkpoint 956! Đang khởi động lại...");
        process.exit(1);
      } else {
        log.error("AUTO-LOGIN thất bại sau checkpoint 956. Vui lòng kiểm tra lại thông tin đăng nhập!");
        process.exit(0);
      }
    } catch (autoErr: any) {
      log.error(`Lỗi khi thực hiện AUTO-LOGIN sau checkpoint 956: ${autoErr?.message || autoErr}`);
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

export function buildQuery(limit = 50, tags = ["INBOX", "ARCHIVED", "PENDING", "OTHER"], includeReceipts = true): any {
  return {
    o0: {
      doc_id: GRAPHQL_DOC_ID,
      query_params: {
        limit,
        before: null,
        tags,
        includeDeliveryReceipts: includeReceipts,
        includeSeqID: true
      }
    }
  };
}

export async function getSequenceIdFromHtmlOrGraphQL(ctx: any, defaultFuncs: any): Promise<string | null> {
  try {
    // Ưu tiên lấy từ HTML trước
    log.system("Đang lấy sequence ID từ HTML...");
    const htmlRes = await get("https://www.facebook.com/", ctx.jar, undefined, ctx);
    const html = typeof htmlRes?.data === "string" ? htmlRes.data : String(htmlRes?.data ?? "");
    let newSeqId = getSequenceIdFromHtml(html);

    if (newSeqId) {
      log.success(`Đã lấy sequence ID từ HTML: ${newSeqId}`);
      return newSeqId;
    }

    // Nếu không lấy được từ HTML, thử lấy từ GraphQL
    log.warn("Không tìm thấy sequence ID từ HTML, đang thử lấy từ GraphQL...");
    if (defaultFuncs) {
      try {
        const postData = {
          av: ctx.userID,
          queries: JSON.stringify(buildQuery(1, ["INBOX"], true))
        };

        const rawRes = await defaultFuncs.post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, postData, ctx);
        const resData = await parseAndCheckLogin(ctx, defaultFuncs)(rawRes);

        if (isScrapingWarningSignal(resData)) {
          log.warn("GraphQL trả về scraping warning 049 khi lấy sequence ID, sẽ xử lý ở vòng retry.");
          return null;
        }

        if (Array.isArray(resData) && resData.length > 0) {
          const syncSeqId = resData[0]?.o0?.data?.viewer?.message_threads?.sync_sequence_id;
          if (syncSeqId) {
            newSeqId = typeof syncSeqId === "string" ? syncSeqId : String(syncSeqId);
            log.success(`Đã lấy sequence ID từ GraphQL: ${newSeqId}`);
            return newSeqId;
          }
        }
      } catch (error: any) {
        if (isScrapingWarningSignal(error)) {
          log.warn("GraphQL trả về scraping warning 049 khi lấy sequence ID, sẽ xử lý ở fallback.");
        } else {
          log.warn(`Lỗi khi lấy sequence ID từ GraphQL: ${formatSignalForLog(error)}`);
        }
      }
    }

    log.warn("Không thể lấy sequence ID từ cả HTML và GraphQL");
    return null;
  } catch (error: any) {
    log.error(`Lỗi khi lấy sequence ID: ${error?.message || error}`);
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

    // Ưu tiên lấy từ HTML trước
    const seqIdFromHtml = await getSequenceIdFromHtmlOrGraphQL(ctx, defaultFuncs);
    if (seqIdFromHtml) {
      ctx.lastSeqId = seqIdFromHtml;
      listenMqtt(defaultFuncs, api, ctx, globalCallback);
      return "started";
    }

    // Fallback về GraphQL như cũ
    const postData = {
      av: ctx.userID,
      queries: JSON.stringify(buildQuery(1, ["INBOX"], false))
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
          log.warn("getSeqID: Không có dữ liệu GraphQL để khởi động lại MQTT");
          return "retry" as const;
        }
        const lastRes = resData[resData.length - 1];
        if (lastRes?.error_results > 0) {
          console.warn("getSeqID: Có lỗi trong kết quả", resData[0]?.o0?.errors);
        }
        if (lastRes?.successful_results === 0) {
          console.warn("getSeqID: Không có kết quả thành công", resData);
          return "retry" as const;
        }
        const syncSeqId = resData[0]?.o0?.data?.viewer?.message_threads?.sync_sequence_id;
        if (syncSeqId) {
          ctx.lastSeqId = syncSeqId;
          listenMqtt(defaultFuncs, api, ctx, globalCallback);
          return "started" as const;
        } else {
          console.warn("getSeqID: Không tìm thấy sync_sequence_id", resData);
          return "retry" as const;
        }
      })
      .catch((err: any) => handleGetSeqIDError(err, ctx, api, globalCallback, messageCleanupInterval));
  };
}

export function handleFBWarning(api: any, _ctx: any, _messageCleanupInterval: NodeJS.Timeout | null): Promise<boolean> {
  log.warn("Phát hiện scraping warning 049, đang thử clear mềm trước khi retry MQTT...");
  return new Promise<boolean>((resolve) => {
    api.httpPost(
      "https://www.facebook.com/api/graphql/",
      {
        av: api.getCurrentUserID(),
        fb_api_caller_class: "RelayModern",
        fb_api_req_friendly_name: "FBScrapingWarningMutation",
        variables: "{}",
        server_timestamps: "true",
        doc_id: "6339492849481770"
      },
      (err: any, response: any) => {
        if (err) {
          log.error(`HTTP error khi clear FB warning 049: ${formatSignalForLog(err)}`);
          resolve(false);
          return;
        }
        let result;
        try {
          result = JSON.parse(response);
        } catch (e: any) {
          log.error(`Invalid JSON khi clear FB warning 049: ${e.message}`);
          resolve(false);
          return;
        }
        if (result.errors) {
          log.error(`FB API error khi clear warning 049: ${result.errors[0]?.message || "Unknown"}`);
          resolve(false);
          return;
        }
        if (result.data?.fb_scraping_warning_clear?.success) {
          log.success("FB warning 049 cleared");
          resolve(true);
        } else {
          log.error("Failed to clear FB warning 049");
          resolve(false);
        }
      }
    );
  });
}

export async function handleGetSeqIDError(
  err: any,
  ctx: any,
  api: any,
  globalCallback: any,
  messageCleanupInterval: NodeJS.Timeout | null
): Promise<GetSeqIdResult> {
  const errCode = err?.code || err?.errno || '';
  const errMessage = String(err?.message || err || '').toLowerCase();
  const isNetworkErr =
    errCode === 'ENOTFOUND' ||
    errCode === 'ECONNRESET' ||
    errCode === 'ECONNREFUSED' ||
    errCode === 'ETIMEDOUT' ||
    errMessage.includes('getaddrinfo enotfound') ||
    errMessage.includes('econnreset') ||
    errMessage.includes('connection reset') ||
    errMessage.includes('network');

  if (isNetworkErr) {
    log.warn(`getSeqID error (lỗi mạng): ${err?.message || err}. Sẽ tự động thử lại khi có mạng...`);
    // Đối với lỗi mạng, không gọi globalCallback với error để tránh trigger các handlers khác
    // Reconnect logic sẽ tự động retry
    return "retry";
  }

  if (isScrapingWarningSignal(err)) {
    const cleared = await handleFBWarning(api, ctx, messageCleanupInterval);
    return cleared ? "retry" : "fatal";
  }
  log.error(`getSeqID error: ${formatSignalForLog(err)}`);
  const errStr = signalText(err);
  if (errStr.includes("https://www.facebook.com/login.php?")) {
    console.error("Phiên đăng nhập hết hạn");
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
