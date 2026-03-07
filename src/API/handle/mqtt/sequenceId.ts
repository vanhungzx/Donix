import log from "@log";
import utils, { get } from "../../request/index";
import { GRAPHQL_DOC_ID } from "./constants";
import { getSequenceIdFromHtml } from "./htmlSequenceId";
import { reconnectMqtt } from "./reconnect";
const { parseAndCheckLogin } = utils;

export function handleAutoLogin(ctx: any, resData: any, retry = true, _defaultFuncs: any): void {
  const resStr = JSON.stringify(resData);
  if (resStr.includes("XCheckpointFBScrapingWarningController") || resStr.includes("601051028565049")) {
    throw { error: "Not logged in.", res: resData };
  }
  if (resStr.includes("https://www.facebook.com/login.php?")) {
    if (!ctx.auto_login && retry) {
      ctx.auto_login = true;
      console.error("Phiên đăng nhập hết hạn");
    }
  }
  if (resStr.includes("1501092823525282")) {
    log.error("Bot bị checkpoint 282, đang tự động đăng nhập và đổi account...");
    // Trigger auto login với skip current account
    (async () => {
      try {
        const autoRelogin = (await import("../../../core/auth_login/auto_relogin")).default;
        const ok = await autoRelogin(ctx, true); // true = skip current account
        if (ok) {
          log.success("AUTO-LOGIN thành công sau checkpoint 282! Đang khởi động lại bot...");
          process.exit(1); // Exit code 1 để restart bot
        } else {
          log.error("AUTO-LOGIN thất bại sau checkpoint 282. Vui lòng kiểm tra lại tài khoản!");
          process.exit(1); // Vẫn restart để thử lại
        }
      } catch (autoErr: any) {
        log.error(`Lỗi khi auto login sau checkpoint 282: ${autoErr?.message || autoErr}`);
        process.exit(1); // Vẫn restart để thử lại
      }
    })();
    return; // Không tiếp tục xử lý
  }
  if (resStr.includes("828281030927956")) {
    log.error("Bot bị checkpoint 956, vui lòng kiểm tra tài khoản!");
  } else if (!ctx.auto_login && retry) {
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

        if (Array.isArray(resData) && resData.length > 0) {
          const syncSeqId = resData[0]?.o0?.data?.viewer?.message_threads?.sync_sequence_id;
          if (syncSeqId) {
            newSeqId = typeof syncSeqId === "string" ? syncSeqId : String(syncSeqId);
            log.success(`Đã lấy sequence ID từ GraphQL: ${newSeqId}`);
            return newSeqId;
          }
        }
      } catch (error: any) {
        log.warn(`Lỗi khi lấy sequence ID từ GraphQL: ${error?.message || error}`);
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
): () => void {
  return async () => {
    ctx.t_mqttCalled = false;

    // Ưu tiên lấy từ HTML trước
    const seqIdFromHtml = await getSequenceIdFromHtmlOrGraphQL(ctx, defaultFuncs);
    if (seqIdFromHtml) {
      ctx.lastSeqId = seqIdFromHtml;
      listenMqtt(defaultFuncs, api, ctx, globalCallback);
      return;
    }

    // Fallback về GraphQL như cũ
    const postData = {
      av: ctx.userID,
      queries: JSON.stringify(buildQuery(1, ["INBOX"], false))
    };
    return defaultFuncs
      .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, postData)
      .then(parseAndCheckLogin(ctx, defaultFuncs))
      .then((resData: any) => {
        handleAutoLogin(ctx, resData, false, defaultFuncs);
        if (resData.includes("XCheckpointFBScrapingWarningController") || resData.includes("601051028565049")) {
          handleFBWarning(api, ctx, messageCleanupInterval);
          throw { error: "Not logged in.", res: resData };
        }
        if (!Array.isArray(resData) || !resData.length) return;
        const lastRes = resData[resData.length - 1];
        if (lastRes?.error_results > 0) {
          console.warn("getSeqID: Có lỗi trong kết quả", resData[0]?.o0?.errors);
        }
        if (lastRes?.successful_results === 0) {
          console.warn("getSeqID: Không có kết quả thành công", resData);
          return;
        }
        const syncSeqId = resData[0]?.o0?.data?.viewer?.message_threads?.sync_sequence_id;
        if (syncSeqId) {
          ctx.lastSeqId = syncSeqId;
          listenMqtt(defaultFuncs, api, ctx, globalCallback);
        } else {
          console.warn("getSeqID: Không tìm thấy sync_sequence_id", resData);
        }
      })
      .catch((err: any) => handleGetSeqIDError(err, ctx, api, globalCallback, messageCleanupInterval));
  };
}

export function handleFBWarning(api: any, ctx: any, messageCleanupInterval: NodeJS.Timeout | null): void {
  console.log("049");
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
        log.error(`HTTP error: ${err.message || err}`);
        return;
      }
      let result;
      try {
        result = JSON.parse(response);
      } catch (e: any) {
        log.error(`Invalid JSON response: ${e.message}`);
        return;
      }
      if (result.errors) {
        log.error(`FB API error: ${result.errors[0]?.message || "Unknown"}`);
        return;
      }
      if (result.data?.fb_scraping_warning_clear?.success) {
        log.success("FB warning 049 cleared");
        reconnectMqtt(ctx, messageCleanupInterval);
      } else {
        log.error("Failed to clear FB warning");
      }
    }
  );
}

export function handleGetSeqIDError(
  err: any,
  ctx: any,
  api: any,
  globalCallback: any,
  messageCleanupInterval: NodeJS.Timeout | null
): void {
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
    return;
  }

  log.error(`getSeqID error: ${err}`);
  const errStr = JSON.stringify(err);
  if (errStr.includes("XCheckpointFBScrapingWarningController") || errStr.includes("601051028565049")) {
    console.log("049");
    handleFBWarning(api, ctx, messageCleanupInterval);
    throw { error: "Not logged in.", res: errStr };
  }
  if (errStr.includes("https://www.facebook.com/login.php?")) {
    console.error("Phiên đăng nhập hết hạn");
  }
  if (typeof err === "object" && (err as any).error === "Not logged in") {
    ctx.loggedIn = false;
  }
  globalCallback(err);
}
