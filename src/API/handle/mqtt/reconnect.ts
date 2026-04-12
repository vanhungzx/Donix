import log from "@log";
import autoRelogin from "../../../core/auth_login/auto_relogin";
import { reloadConfig } from "../../../core/configManager";
import { saveCookies } from "../../request/clients.js";
import { parseAndCheckLogin } from "../../request/formatters/helpers";
import { get, post } from "../../request/index";
import { maxReconnectAttempts, reconnectBackoff, topics } from "./constants";
import { buildQuery } from "./sequenceId";

let mqttReconnectCount = 0;
let reconnectTimeout: NodeJS.Timeout | null = null;
let isReconnecting = false;
let reconnectPromise: Promise<boolean> | null = null;
let networkErrorRetryTimeout: NodeJS.Timeout | null = null;
let reconnectStartedAt = 0;
const MAX_RECONNECT_LOCK_MS = 120_000; // 2 phút tối đa cho mỗi lần reconnect

export function resetReconnectCount(): void {
  mqttReconnectCount = 0;
}

export function getReconnectCount(): number {
  return mqttReconnectCount;
}

export function isCurrentlyReconnecting(): boolean {
  // Auto-unlock nếu reconnect bị treo quá lâu
  if (isReconnecting && reconnectStartedAt > 0 && Date.now() - reconnectStartedAt > MAX_RECONNECT_LOCK_MS) {
    log.warn(`Reconnect bị treo quá ${MAX_RECONNECT_LOCK_MS / 1000}s, tự động mở khóa`);
    isReconnecting = false;
    reconnectPromise = null;
    reconnectStartedAt = 0;
  }
  return isReconnecting;
}

export function cancelReconnect(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (networkErrorRetryTimeout) {
    clearTimeout(networkErrorRetryTimeout);
    networkErrorRetryTimeout = null;
  }
  isReconnecting = false;
  reconnectPromise = null;
  reconnectStartedAt = 0;
}

/**
 * Kiểm tra xem lỗi có phải là lỗi mạng không
 */
function isNetworkError(error: any): boolean {
  if (!error) return false;

  const errorCode = error?.code || error?.errno || '';
  const errorMessage = String(error?.message || '').toLowerCase();
  const errorString = String(error || '').toLowerCase();

  return (
    errorCode === 'ENOTFOUND' ||
    errorCode === 'ECONNRESET' ||
    errorCode === 'ECONNREFUSED' ||
    errorCode === 'ETIMEDOUT' ||
    errorCode === 'EHOSTUNREACH' ||
    errorCode === 'ENETUNREACH' ||
    errorMessage.includes('getaddrinfo enotfound') ||
    errorMessage.includes('econnreset') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('connection refused') ||
    errorMessage.includes('server unavailable') ||
    errorMessage.includes('connection reset') ||
    errorMessage.includes('socket hang up') ||
    errorMessage.includes('connection lost') ||
    errorMessage.includes('network') ||
    errorString.includes('enotfound') ||
    errorString.includes('econnreset') ||
    errorString.includes('econnrefused') ||
    errorString.includes('connection refused') ||
    errorString.includes('server unavailable')
  );
}

/**
 * Main reconnect handler for MQTT with improved logic
 */
export async function reconnectMqttHandler(
  ctx: any,
  defaultFuncs: any,
  getSeqID: () => Promise<void>,
  onReconnect?: () => void,
  forceReconnect: boolean = false
): Promise<boolean> {
  // Nếu đang có reconnect đang chạy, kiểm tra xem có bị treo không
  if (reconnectPromise) {
    if (reconnectStartedAt > 0 && Date.now() - reconnectStartedAt > MAX_RECONNECT_LOCK_MS) {
      log.warn("Reconnect promise bị treo, hủy và tạo mới");
      cancelReconnect();
    } else {
      return reconnectPromise;
    }
  }

  // Nếu force reconnect (từ event close/offline/disconnect), bỏ qua kiểm tra connection state
  if (!forceReconnect) {
    // Kiểm tra connection state trước khi reconnect
    const mqttClient = ctx.mqttClient as any;
    if (mqttClient) {
      // Kiểm tra các trạng thái disconnected/disconnecting trước
      if (mqttClient.disconnected === true || mqttClient.disconnecting === true) {
        // Connection đã bị đóng, cần reconnect
      } else {
        // Kiểm tra nhiều trạng thái để đảm bảo chính xác
        const connected = mqttClient.connected === true;
        const readyState = mqttClient.readyState;
        const reconnecting = mqttClient.reconnecting === true;

        // WebSocket ready states: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
        const isOpen = readyState === 1;
        const isClosing = readyState === 2;
        const isClosed = readyState === 3;

        // Nếu thực sự connected và không đang đóng, không cần reconnect
        if (connected && isOpen && !isClosing && !isClosed && !reconnecting) {
          return false;
        }
      }
    }
  }

  // Atomic check-and-set để tránh race condition
  if (isReconnecting) {
    return reconnectPromise || Promise.resolve(false);
  }

  // Set isReconnecting ngay từ đầu để tránh nhiều lần kiểm tra login status cùng lúc
  isReconnecting = true;
  reconnectStartedAt = Date.now();
  ctx.isReconnecting = true;

  // Helper function để bypass checkpoint
  const bypassCheckpoint = async (html: string): Promise<boolean> => {
    try {
      const getFrom = (str: string, start: string, end: string): string | null => {
        const startIdx = str.indexOf(start);
        if (startIdx === -1) return null;
        const endIdx = str.indexOf(end, startIdx + start.length);
        if (endIdx === -1) return null;
        return str.substring(startIdx + start.length, endIdx);
      };

      const cookieUID = async (): Promise<string | undefined> => {
        try {
          const cookies = typeof ctx.jar?.getCookies === "function"
            ? await ctx.jar.getCookies("https://www.facebook.com")
            : [];
          return cookies.find((c: any) => c.key === "i_user")?.value ||
            cookies.find((c: any) => c.key === "c_user")?.value;
        } catch {
          return undefined;
        }
      };

      const htmlUID = (body: string): string | null => {
        const match = body.match(/"USER_ID"\s*:\s*"(\d+)"/) ||
          body.match(/\["CurrentUserInitialData",\[\],\{.*?"USER_ID":"(\d+)".*?\},\d+\]/);
        return match?.[1] || null;
      };

      const UID = (await cookieUID()) || htmlUID(html);
      if (!UID) {
        log.warn("Không tìm thấy UID để bypass checkpoint");
        return false;
      }

      const fb_dtsg = getFrom(html, '"DTSGInitData",[],{"token":"', '",') ||
        html.match(/name="fb_dtsg"\s+value="([^"]+)"/)?.[1];
      const jazoest = getFrom(html, 'name="jazoest" value="', '"') ||
        getFrom(html, "jazoest=", '",') ||
        html.match(/name="jazoest"\s+value="([^"]+)"/)?.[1];
      const lsd = getFrom(html, '["LSD",[],{"token":"', '"}') ||
        html.match(/name="lsd"\s+value="([^"]+)"/)?.[1];

      if (!fb_dtsg || !jazoest || !lsd) {
        log.warn("Không tìm thấy đủ thông tin để bypass checkpoint");
        return false;
      }

      const form = {
        av: UID,
        fb_dtsg,
        jazoest,
        lsd,
        fb_api_caller_class: "RelayModern",
        fb_api_req_friendly_name: "FBScrapingWarningMutation",
        variables: "{}",
        server_timestamps: true,
        doc_id: 6339492849481770,
      };

      await post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form, ctx)
        .then(saveCookies(ctx.jar));

      log.warn("Đã thử bypass checkpoint automation của Facebook...");
      return true;
    } catch (e: any) {
      log.error(`Lỗi khi bypass checkpoint: ${e?.message || e}`);
      return false;
    }
  };

  try {
    log.system("Đang kiểm tra trạng thái đăng nhập trước khi reconnect...");
    const htmlRes = await get("https://www.facebook.com/", ctx.jar, undefined, ctx);
    const html = typeof htmlRes?.data === "string" ? htmlRes.data : String(htmlRes?.data ?? "");
    const resStr = html;
    const url = htmlRes?.request?.res?.responseUrl ||
      htmlRes?.config?.url ||
      htmlRes?.url ||
      "";

    if (url.includes("https://www.facebook.com/login.php") ||
      url.includes("/login.php") ||
      resStr.includes("https://www.facebook.com/login.php")) {
      log.error("Phát hiện redirect đến trang login - Tài khoản đã bị logout");
      isReconnecting = false;
      ctx.isReconnecting = false;
      reconnectPromise = null;
      return false;
    }

    if (resStr.includes("828281030927956") || resStr.includes("1501092823525282")) {
      const checkpointCode = resStr.includes("1501092823525282") ? "282" : "956";
      log.error(`Bot bị checkpoint ${checkpointCode}, đang tự động đổi tài khoản...`);
      isReconnecting = false;
      ctx.isReconnecting = false;
      reconnectPromise = null;

      try {
        const ok = await autoRelogin(ctx);
        if (ok) {
          const reloadResult = await reloadConfig();
          if (!reloadResult.success) {
            log.warn(`Không thể reload config sau auto login: ${reloadResult.error || "Unknown error"}`);
          }
          log.success(`AUTO-LOGIN thành công sau checkpoint ${checkpointCode}! Đang khởi động lại...`);
          process.exit(1);
        } else {
          log.error(`AUTO-LOGIN thất bại sau checkpoint ${checkpointCode}. Vui lòng kiểm tra lại thông tin đăng nhập!`);
          process.exit(0);
        }
      } catch (autoErr: any) {
        log.error(`Lỗi khi thực hiện AUTO-LOGIN sau checkpoint ${checkpointCode}: ${autoErr?.message || autoErr}`);
        process.exit(0);
      }
      return false;
    }

    if (resStr.includes("XCheckpointFBScrapingWarningController") ||
      resStr.includes("601051028565049") ||
      url.includes("checkpoint/601051028565049")) {
      log.warn("Phát hiện checkpoint scraping warning, đang thử bypass...");
      const bypassed = await bypassCheckpoint(resStr);

      if (bypassed) {
        try {
          const refreshedRes = await get("https://www.facebook.com/", ctx.jar, undefined, ctx);
          const refreshedHtml = typeof refreshedRes?.data === "string" ? refreshedRes.data : String(refreshedRes?.data ?? "");
          const refreshedUrl = refreshedRes?.request?.res?.responseUrl ||
            refreshedRes?.config?.url ||
            refreshedRes?.url ||
            "";

          if (refreshedUrl.includes("checkpoint/601051028565049") ||
            refreshedHtml.includes("XCheckpointFBScrapingWarningController") ||
            refreshedHtml.includes("601051028565049")) {
            log.warn("Checkpoint vẫn còn sau khi bypass");
            isReconnecting = false;
            ctx.isReconnecting = false;
            reconnectPromise = null;
            return false;
          } else {
            log.success("Bypass checkpoint thành công, sẽ tiếp tục reconnect MQTT...");

            const refreshedUserIDMatch = refreshedHtml.match(/\["CurrentUserInitialData",\[\],({.*?}),\d+\]/);
            if (refreshedUserIDMatch) {
              try {
                const userData = JSON.parse(refreshedUserIDMatch[1]);
                if (userData.USER_ID && userData.USER_ID === ctx.userID) {
                  log.success("Tài khoản vẫn còn đăng nhập sau khi bypass, tiếp tục reconnect...");
                }
              } catch { }
            }
          }
        } catch (refreshErr: any) {
          log.warn(`Lỗi khi refresh sau bypass: ${refreshErr?.message || refreshErr}`);
        }
      } else {
        isReconnecting = false;
        ctx.isReconnecting = false;
        reconnectPromise = null;
        return false;
      }
    }

    const userIDMatch = html.match(/\["CurrentUserInitialData",\[\],({.*?}),\d+\]/);
    let isLoggedIn = false;
    if (userIDMatch) {
      try {
        const userData = JSON.parse(userIDMatch[1]);
        if (userData.USER_ID && userData.USER_ID === ctx.userID) {
          isLoggedIn = true;
        }
      } catch { }
    }

    if (!isLoggedIn && defaultFuncs) {
      try {
        const postData = {
          av: ctx.userID,
          queries: JSON.stringify(buildQuery(1, ["INBOX"], true))
        };
        const rawRes = await defaultFuncs.post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, postData, ctx);
        const resData = await parseAndCheckLogin(ctx, defaultFuncs)(rawRes);

        if (resData.die || resData.logout ||
          (Array.isArray(resData) && resData.length > 0 && resData[resData.length - 1]?.error_results > 0)) {
          log.error("Tài khoản đã bị logout hoặc không còn đăng nhập (qua GraphQL).");
          isLoggedIn = false;
        } else {
          isLoggedIn = true;
        }
      } catch (checkErr: any) {
        log.warn(`Không thể kiểm tra trạng thái đăng nhập qua GraphQL: ${checkErr?.message || checkErr}`);
      }
    }

    if (!isLoggedIn) {
      // Thử auto-login khi phát hiện tài khoản không còn đăng nhập
      try {
        log.warn("Tài khoản đã bị logout hoặc cookie hết hạn. Đang thử AUTO-LOGIN trước khi reconnect MQTT...");
        const ok = await autoRelogin(ctx);
        if (ok) {
          log.success("AUTO-LOGIN thành công. Cookie đã được cập nhật, sẽ tiếp tục reconnect MQTT...");
        } else {
          log.error("AUTO-LOGIN thất bại. Không thể reconnect MQTT.");
          isReconnecting = false;
          ctx.isReconnecting = false;
          reconnectPromise = null;
          return false;
        }
      } catch (autoErr: any) {
        log.error(
          `Lỗi khi chạy AUTO-LOGIN trước reconnect MQTT: ${autoErr?.message || autoErr}`
        );
        isReconnecting = false;
        ctx.isReconnecting = false;
        reconnectPromise = null;
        return false;
      }
    }

    log.success("Tài khoản vẫn còn đăng nhập, tiếp tục reconnect...");
  } catch (checkErr: any) {
    const isNetworkErr = isNetworkError(checkErr);
    if (isNetworkErr) {
      log.warn(`Lỗi mạng khi kiểm tra trạng thái đăng nhập: ${checkErr?.message || checkErr}. Sẽ thử lại...`);
      // Đối với lỗi mạng, vẫn tiếp tục reconnect process nhưng sẽ retry nếu fail
    } else {
      // Với yêu cầu "reconnect all trường hợp", coi mọi lỗi khi check login
      // đều không chặn quá trình reconnect, chỉ log cảnh báo rồi tiếp tục
      log.warn(`Lỗi khi kiểm tra trạng thái đăng nhập (sẽ vẫn reconnect): ${checkErr?.message || checkErr}`);
    }
  }

  // Yêu cầu "reconnect all trường hợp":
  // Không dừng hẳn sau maxReconnectAttempts nữa, chỉ dùng counter
  // để tính backoff, luôn cho phép tiếp tục retry.
  if (mqttReconnectCount >= maxReconnectAttempts * 2) {
    log.warn(`Đã thử kết nối lại nhiều lần (${mqttReconnectCount}), sẽ tiếp tục thử với delay dài hơn...`);
    mqttReconnectCount = maxReconnectAttempts; // Giữ delay ở mức cao nhưng không dừng hẳn
  }

  mqttReconnectCount++;
  // Tăng delay theo số lần thử, với giới hạn tối đa
  const delay = Math.min(
    reconnectBackoff * Math.pow(1.5, Math.min(mqttReconnectCount - 1, 10)),
    30000 // Delay tối đa 30s để đảm bảo không spam quá nhiều
  );

  log.warn(
    `Đang thử kết nối lại MQTT lần ${mqttReconnectCount}/${maxReconnectAttempts} (sau ${delay}ms)`
  );

  reconnectPromise = new Promise<boolean>((resolve) => {
    reconnectTimeout = setTimeout(async () => {
      reconnectTimeout = null;

      try {
        const currentClient = ctx.mqttClient as any;
        if (currentClient) {
          const connected = currentClient.connected === true;
          const readyState = currentClient.readyState;
          const isOpen = readyState === 1;
          const isClosing = readyState === 2;
          const isClosed = readyState === 3;
          const isDisconnected = currentClient.disconnected === true;
          const isDisconnecting = currentClient.disconnecting === true;

          // Chỉ hủy reconnect nếu thực sự connected và không đang đóng
          if (connected && isOpen && !isClosing && !isClosed && !isDisconnected && !isDisconnecting) {
            log.info("MQTT đã kết nối trong lúc đợi, hủy reconnect");
            isReconnecting = false;
            ctx.isReconnecting = false;
            reconnectPromise = null;
            resolve(false);
            return;
          }
        }

        if (ctx.mqttClient) {
          try {
            const mqttClient = ctx.mqttClient as any;
            if (mqttClient.connected) {
              await Promise.all(
                topics.map(
                  (topic) =>
                    new Promise<void>((resolveUnsub) => {
                      mqttClient.unsubscribe(topic, () => resolveUnsub());
                    }).catch(() => { })
                )
              );

              await new Promise<void>((resolvePub) => {
                try {
                  if (mqttClient.connected && !mqttClient.disconnecting && !mqttClient.disconnected) {
                    mqttClient.publish("/browser_close", "{}", { qos: 1 }, () => {
                      // Ignore errors during cleanup
                      resolvePub();
                    });
                  } else {
                    resolvePub();
                  }
                } catch {
                  // Ignore errors during cleanup
                  resolvePub();
                }
              }).catch(() => { });
            }

            mqttClient.removeAllListeners('error');
            mqttClient.removeAllListeners('close');
            mqttClient.removeAllListeners('offline');
            mqttClient.removeAllListeners('disconnect');
            mqttClient.removeAllListeners('connect');
            mqttClient.removeAllListeners('message');
            mqttClient.removeAllListeners();

            await Promise.race([
              new Promise<void>((resolve) => {
                if (mqttClient) {
                  mqttClient.end(false, () => resolve());
                } else {
                  resolve();
                }
              }),
              new Promise<void>((resolve) => {
                setTimeout(() => {
                  if (mqttClient) {
                    mqttClient.end(true);
                  }
                  resolve();
                }, 500);
              })
            ]);
          } catch (e: any) {
            log.error(`Lỗi khi dọn dẹp MQTT client: ${e.message}`);
          } finally {
            ctx.mqttClient = undefined;
          }
        }

        // Reset sync state hoàn toàn - BẮT BUỘC lấy seqID mới
        ctx.syncToken = undefined;
        ctx.lastSeqId = undefined;
        ctx.t_mqttCalled = false;
        delete ctx.tmsWait;

        if (onReconnect) {
          onReconnect();
        }

        log.system("Đang lấy sequence ID mới trước khi reconnect MQTT...");
        await getSeqID();

        // Reset counter khi reconnect thành công
        mqttReconnectCount = 0;
        isReconnecting = false;
        reconnectStartedAt = 0;
        ctx.isReconnecting = false;
        reconnectPromise = null;
        log.success("Đã sẵn sàng kết nối lại MQTT với sequence ID mới");
        resolve(true);
      } catch (e: any) {
        const isNetworkErr = isNetworkError(e);
        const errorMsg = e?.message || String(e);

        if (isNetworkErr) {
          log.warn(`Lỗi mạng trong quá trình reconnect: ${errorMsg}. Sẽ thử lại sau khi có mạng...`);

          // Đối với lỗi mạng, reset counter và schedule retry lại
          // Không tăng mqttReconnectCount nữa vì đây là lỗi mạng, không phải lỗi logic
          const networkRetryDelay = Math.min(
            reconnectBackoff * Math.pow(1.5, Math.min(mqttReconnectCount, 8)),
            30000
          );

          isReconnecting = false;
          reconnectStartedAt = 0;
          ctx.isReconnecting = false;
          reconnectPromise = null;

          // Schedule retry lại sau khi có mạng
          if (networkErrorRetryTimeout) {
            clearTimeout(networkErrorRetryTimeout);
          }

          networkErrorRetryTimeout = setTimeout(() => {
            networkErrorRetryTimeout = null;
            log.system("Đang thử kết nối lại sau lỗi mạng...");
            // Gọi lại reconnect với forceReconnect = true để bỏ qua check connection state
            reconnectMqttHandler(ctx, defaultFuncs, getSeqID, onReconnect, true)
              .catch((retryErr: any) => {
                log.warn(`Lỗi khi retry sau lỗi mạng: ${retryErr?.message || retryErr}`);
              });
          }, networkRetryDelay);

          resolve(false);
        } else {
          // Với yêu cầu "reconnect all trường hợp", đối với lỗi không phải mạng
          // cũng luôn retry với backoff, không giới hạn số lần.
          log.error(`Lỗi trong quá trình reconnect: ${errorMsg}. Sẽ thử reconnect lại với backoff...`);
          isReconnecting = false;
          reconnectStartedAt = 0;
          ctx.isReconnecting = false;
          reconnectPromise = null;

          const retryDelay = Math.min(
            reconnectBackoff * Math.pow(1.3, mqttReconnectCount),
            8000
          );

          setTimeout(() => {
            log.system("Đang thử kết nối lại sau lỗi (non-network)...");
            reconnectMqttHandler(ctx, defaultFuncs, getSeqID, onReconnect, true)
              .catch((retryErr: any) => {
                log.warn(`Lỗi khi retry: ${retryErr?.message || retryErr}`);
              });
          }, retryDelay);

          resolve(false);
        }
      }
    }, delay);
  });

  return reconnectPromise;
}

/**
 * Legacy reconnect function for backward compatibility
 */
export function reconnectMqtt(
  ctx: any,
  _msgCleanupInterval: NodeJS.Timeout | null,
  getSeqID?: () => void
): boolean {
  // Convert getSeqID to async if needed
  const asyncGetSeqID = getSeqID ? async () => {
    if (typeof getSeqID === 'function') {
      try {
        getSeqID();
      } catch (err) {
        // Ignore errors
      }
    }
  } : undefined;

  // Force reconnect khi gọi từ event handlers (close/offline/disconnect/error)
  reconnectMqttHandler(ctx, undefined, asyncGetSeqID || (async () => { }), undefined, true)
    .catch((err: any) => {
      const isNetworkErr = isNetworkError(err);
      if (isNetworkErr) {
        log.warn(`Lỗi mạng trong reconnect handler: ${err?.message || err}. Sẽ tự động thử lại...`);
      } else {
        log.error(`Lỗi trong reconnect handler: ${err?.message || err}`);
      }
    });

  return true;
}
