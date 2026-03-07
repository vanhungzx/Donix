import log from "@log";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { CookieJar as ToughCookieJar } from "tough-cookie";

import type {
  RequestClient as Client,
  Context,
  CookieJar,
  DefaultFuncs,
  FBResponse,
  ParseContext,
} from "@types";
import { makeParsable } from "../../constants.js";
import { randomUserAgent } from "../../user-agents.js";
import { tryPromise } from "./type.js";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const formatCookie = ([k, v, , p]: any[], d: string): string =>
  `${k}=${v}; Path=${p}; Domain=${d}.com`;

const saveCookies =
  (jar: ToughCookieJar & CookieJar) =>
    (res: FBResponse<string>): FBResponse<string> => {
      const headersAny = res.headers as any;
      const setCookieHeader = headersAny?.["set-cookie"] || headersAny?.["Set-Cookie"];
      if (setCookieHeader) {
        const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        cookies.forEach((c: string) => {
          if (c.includes(".facebook.com")) {
            jar.setCookie(c, "https://www.facebook.com");
            jar.setCookie(
              c.replace(/domain=\.facebook\.com/, "domain=.messenger.com"),
              "https://www.messenger.com"
            );
          }
        });
      }
      return res;
    };

const getAppState = (jar: ToughCookieJar & CookieJar): any[] => {
  const cookies1 = jar.getCookiesSync
    ? jar.getCookiesSync("https://www.facebook.com")
    : jar.getCookies("https://www.facebook.com");
  const cookies2 = jar.getCookiesSync
    ? jar.getCookiesSync("https://www.messenger.com")
    : jar.getCookies("https://www.messenger.com");
  return (Array.isArray(cookies1) ? cookies1 : []).concat(
    Array.isArray(cookies2) ? cookies2 : []
  );
};

class CustomError extends Error {
  // Allow attaching arbitrary extra properties for richer error information
  [key: string]: any;

  constructor(obj: any) {
    if (typeof obj === "string") obj = { message: obj };
    if (typeof obj !== "object" || obj === null) {
      throw new TypeError("Object required");
    }
    obj.message ? super(obj.message) : super();
    Object.assign(this, obj);
  }
}

/**
 * Parse Facebook responses and handle:
 * - Retries for 5xx
 * - Redirects & checkpoint detection
 * - DTSG token extraction
 * - Consistent error wrapping
 */
function parseAndCheckLogin(
  ctx: Context | ParseContext,
  def: DefaultFuncs,
  retry: number = 0,
  // Capture stack of original caller once, to improve error traces
  src: Error = (() => {
    try {
      throw new Error();
    } catch (e) {
      return e as Error;
    }
  })()
): (data: FBResponse<string> | AxiosResponse | any) => Promise<any> {
  return (data: FBResponse<string> | AxiosResponse | any) =>
    tryPromise(async () => {
      let rawBody: string;
      let statusCode: number;
      let config: AxiosRequestConfig & { fbOriginalForm?: any; method?: string; url?: string };

      if (data && typeof data === "object") {
        if ("data" in data && typeof (data as any).data === "string") {
          rawBody = (data as AxiosResponse<string>).data;
        } else if ("body" in data && typeof (data as any).body === "string") {
          rawBody = (data as any).body;
        } else if ("data" in data && (data as any).data && typeof (data as any).data === "object") {
          rawBody = JSON.stringify((data as any).data);
        } else {
          rawBody = typeof data === "string" ? data : JSON.stringify(data ?? "");
        }

        const anyData: any = data;
        statusCode =
          anyData.status && anyData.status >= 200 && anyData.status < 600
            ? anyData.status
            : anyData.statusCode || 200;
        config = (anyData.config || {}) as any;
      } else {
        rawBody = typeof data === "string" ? data : JSON.stringify(data ?? "");
        statusCode = 200;
        config = {} as any;
      }

      // Handle empty response body - skip check for rate limit errors to provide better error message
      if ((!rawBody || rawBody.trim() === "") && statusCode !== 429) {
        throw new CustomError({
          message: "Empty response body",
          statusCode,
          res: rawBody,
          sourceCall: src,
        });
      }

      // Handle rate limit (429) with retry logic
      if (statusCode === 429 && retry < 3) {
        const t = (Math.random() * 10000 + 5000) | 0; // 5-15 seconds delay for rate limits
        const urlStr = (config?.url as string) || "";
        const headers = config?.headers as Record<string, any> | undefined;
        const contentType = headers?.["Content-Type"] || headers?.["content-type"] || "";
        const isMultipart = contentType?.toString().startsWith("multipart");
        const postFunc = isMultipart ? def.postFormData : def.post;
        const method = isMultipart ? "POST (FormData)" : "POST";

        // Generate random User-Agent for retry
        const { userAgent, secChUa, secChUaFullVersionList, secChUaPlatform, secChUaPlatformVersion } = randomUserAgent();
        const randomUAHeaders = {
          "User-Agent": userAgent,
          "Sec-Ch-Ua": secChUa,
          "Sec-Ch-Ua-Full-Version-List": secChUaFullVersionList,
          "Sec-Ch-Ua-Platform": secChUaPlatform,
          "Sec-Ch-Ua-Platform-Version": secChUaPlatformVersion,
        };

        log.warn(
          `parseAndCheckLogin: Rate limit (429), đang retry lần ${retry + 1
          } sau ${(t / 1000).toFixed(2)}s với random UA - ${method} ${urlStr}`
        );

        // Update fbOriginalForm with new random UA headers
        const originalForm = (config as any)?.fbOriginalForm || {};
        const updatedForm = {
          ...originalForm,
          customHeader: {
            ...(originalForm.customHeader || {}),
            ...randomUAHeaders,
          },
        };

        return delay(t)
          .then(() => {
            if (isMultipart) {
              // For FormData, pass customHeader in form options
              return postFunc(urlStr, (ctx as Context).jar, {
                ...updatedForm,
                customHeader: randomUAHeaders,
              });
            } else {
              // For regular POST, pass customHeader as 5th parameter
              return (postFunc as any)(urlStr, (ctx as Context).jar, updatedForm, ctx, randomUAHeaders);
            }
          })
          .then(parseAndCheckLogin(ctx, def, retry + 1, src))
          .then((result) => {
            log.info(
              `parseAndCheckLogin: Đã retry rate limit lần ${retry + 1} thành công - ${method} ${urlStr}`
            );
            return result;
          })
          .catch((error) => {
            log.error(
              `parseAndCheckLogin: Đã retry rate limit lần ${retry + 1} thất bại - ${method} ${urlStr} - ${(error as any)?.message || error
              }`
            );
            throw error;
          });
      }

      // Retry on 5xx up to 5 times
      if (statusCode >= 500 && retry < 5) {
        const t = (Math.random() * 5000) | 0;
        const urlStr = (config?.url as string) || "";
        const headers = config?.headers as Record<string, any> | undefined;
        const contentType = headers?.["Content-Type"] || headers?.["content-type"] || "";
        const isMultipart = contentType?.toString().startsWith("multipart");
        const postFunc = isMultipart ? def.postFormData : def.post;
        const method = isMultipart ? "POST (FormData)" : "POST";

        log.warn(
          `parseAndCheckLogin: Status ${statusCode}, đang retry lần ${retry + 1
          } sau ${(t / 1000).toFixed(2)}s - ${method} ${urlStr}`
        );

        return delay(t)
          .then(() => postFunc(urlStr, (ctx as Context).jar, (config as any)?.fbOriginalForm))
          .then(parseAndCheckLogin(ctx, def, retry + 1, src))
          .then((result) => {
            log.info(
              `parseAndCheckLogin: Đã retry lần ${retry + 1} thành công - ${method} ${urlStr}`
            );
            return result;
          })
          .catch((error) => {
            log.error(
              `parseAndCheckLogin: Đã retry lần ${retry + 1} thất bại - ${method} ${urlStr} - ${(error as any)?.message || error
              }`
            );
            throw error;
          });
      }

      if (statusCode !== 200) {
        if (retry >= 5 || (statusCode === 429 && retry >= 3)) {
          log.error(
            `parseAndCheckLogin: Đã retry ${retry} lần nhưng vẫn thất bại với Status ${statusCode}`
          );
        }
        const errorMessage = statusCode === 429
          ? `Rate limit exceeded (429). Please wait before retrying.${!rawBody || rawBody.trim() === "" ? " (Empty response body)" : ""}`
          : `Status ${statusCode}${!rawBody || rawBody.trim() === "" ? " (Empty response body)" : ""}`;
        throw new CustomError({
          message: errorMessage,
          statusCode,
          res: rawBody,
          sourceCall: src,
        });
      }

      let res: any;
      try {
        const parsableBody = makeParsable(rawBody);
        if (!parsableBody || parsableBody.trim() === "") {
          throw new Error("Empty parsable body");
        }
        res = JSON.parse(parsableBody);
      } catch (e: any) {
        throw new CustomError({
          message: `JSON.parse error: ${e?.message || e}`,
          detail: e,
          res: rawBody?.substring(0, 500) || "",
          sourceCall: src,
        });
      }

      // Detect checkpoint redirect
      if (res.jsmods?.require) {
        for (const i of res.jsmods.require) {
          if (i[0] === "ServerRedirect" && i[1] === "redirectPageTo") {
            const m = i[3]?.[0]?.match(/\/checkpoint\/(\d+)/);
            if (m) {
              res.die = true;
              res.type = m[1];
              break;
            }
          }
        }
      }

      if (res.error === 1357001) res.logout = true;

      // Follow redirect for GET
      if (res.redirect && (config?.method || "").toUpperCase() === "GET") {
        return def
          .get(res.redirect, (ctx as Context).jar)
          .then(parseAndCheckLogin(ctx, def, undefined, src));
      }

      // Handle cookie updates
      if (res.jsmods?.require?.[0]?.[0] === "Cookie") {
        (ctx as Context).jar.setCookie(
          formatCookie(res.jsmods.require[0][3], "facebook"),
          "https://www.facebook.com"
        );
        (ctx as Context).jar.setCookie(
          formatCookie(res.jsmods.require[0][3], "messenger"),
          "https://www.messenger.com"
        );
      }

      // Extract fb_dtsg token
      for (const i of res.jsmods?.require || []) {
        if (i[0] === "DTSG" && i[1] === "setToken") {
          (ctx as Context).fb_dtsg = i[3][0];
          (ctx as Context).ttstamp =
            "2" + [...((ctx as Context).fb_dtsg || "")].map((c) => c.charCodeAt(0)).join("");
        }
      }

      // If response is already an array, attach body for debugging
      if (Array.isArray(res)) {
        (res as any).body = rawBody;
        return res;
      }

      return {
        ...res,
        body: rawBody,
      };
    });
}

function markDelivery(ctx: Context, client: Client, threadID: string, messageID: string): void {
  if (threadID && messageID) {
    client.markAsDelivered(threadID, messageID, (err?: any) => {
      if (err) {
        log.error(`markAsDelivered: ${err.message || err}`);
      } else if (ctx.options.autoMarkRead) {
        client.markAsRead(threadID, (err2?: any) => {
          if (err2) log.error(`markAsRead: ${err2.message || err2}`);
        });
      }
    });
  }
}

const getJar = (): ToughCookieJar & CookieJar => {
  const jar = new ToughCookieJar();
  const boundGetCookieStringSync = jar.getCookieStringSync.bind(jar);
  (jar as any).cookieString = () => boundGetCookieStringSync("https://www.facebook.com");
  return jar as ToughCookieJar & CookieJar;
};

export { CustomError, getAppState, getJar, markDelivery, parseAndCheckLogin, saveCookies };
