import log from "@log";
import type { AxiosRequestConfig } from "axios";
import { CookieJar as ToughCookieJar } from "tough-cookie";

import type { RequestClient as Client, Context, CookieJar, DefaultFuncs, FBResponse, ParseContext } from "@types";
import type { Cookie as ToughCookie } from "tough-cookie";
import { makeParsable } from "../../constants.js";
import { randomUserAgent } from "../../user-agents.js";
import { tryPromise } from "./type.js";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Axios/got headers: string hoặc string[] */
function contentTypeFromHeaders(headers: AxiosRequestConfig["headers"] | undefined): string {
  if (headers == null || typeof headers !== "object") return "";
  const h = headers as Record<string, unknown>;
  const v = h["Content-Type"] ?? h["content-type"];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0) return String(v[0]);
  return v != null ? String(v) : "";
}

/** jsmods Cookie row: [name, value, ?, path, ...] */
const formatCookie = (parts: readonly string[], d: string): string =>
  `${parts[0]}=${parts[1]}; Path=${parts[3]}; Domain=${d}.com`;

const saveCookies =
  (jar: ToughCookieJar & CookieJar) =>
    (res: FBResponse<string>): FBResponse<string> => {
      const hdr = res.headers as Record<string, string | string[] | undefined>;
      const setCookieHeader = hdr["set-cookie"] ?? hdr["Set-Cookie"];
      if (setCookieHeader) {
        const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        cookies.forEach((c: string) => {
          if (c.includes(".facebook.com")) {
            jar.setCookie(c, "https://www.facebook.com");
            // Also bind cookies to business subdomain for business.* endpoints
            jar.setCookie(c, "https://business.facebook.com");
            jar.setCookie(
              c.replace(/domain=\.facebook\.com/, "domain=.messenger.com"),
              "https://www.messenger.com"
            );
          }
        });
      }
      return res;
    };

const getAppState = (jar: ToughCookieJar & CookieJar): ToughCookie[] => {
  const cookies1 = jar.getCookiesSync
    ? jar.getCookiesSync("https://business.facebook.com")
    : jar.getCookies("https://business.facebook.com");
  const cookies1b = jar.getCookiesSync ? jar.getCookiesSync("https://www.facebook.com") : jar.getCookies("https://www.facebook.com");
  const cookies2 = jar.getCookiesSync
    ? jar.getCookiesSync("https://www.messenger.com")
    : jar.getCookies("https://www.messenger.com");
  return (Array.isArray(cookies1) ? cookies1 : [])
    .concat(Array.isArray(cookies1b) ? cookies1b : [])
    .concat(Array.isArray(cookies2) ? cookies2 : []);
};

class CustomError extends Error {
  declare detail?: unknown;
  declare res?: unknown;
  declare statusCode?: number;
  declare sourceCall?: Error;

  constructor(obj: string | Record<string, unknown>) {
    const o = typeof obj === "string" ? { message: obj } : { ...obj };
    if (typeof o !== "object" || o === null) {
      throw new TypeError("Object required");
    }
    const m = o.message;
    if (typeof m === "string" && m.length > 0) super(m);
    else super();
    Object.assign(this, o);
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
): (data: unknown) => Promise<unknown> {
  return (data: unknown) =>
    tryPromise(async () => {
      let rawBody: string;
      let statusCode: number;
      type ConfigShape = AxiosRequestConfig & {
        fbOriginalForm?: Record<string, string | number | boolean | null | undefined>;
        method?: string;
        url?: string;
      };
      let config: ConfigShape;

      if (data && typeof data === "object") {
        const d = data as Record<string, unknown> & { config?: ConfigShape };
        if ("data" in d && typeof d.data === "string") {
          rawBody = d.data;
        } else if ("body" in d && typeof d.body === "string") {
          rawBody = d.body;
        } else if (d.data && typeof d.data === "object") {
          rawBody = JSON.stringify(d.data);
        } else {
          rawBody = JSON.stringify(data ?? "");
        }

        const st = typeof d.status === "number" ? d.status : undefined;
        const sc = typeof d.statusCode === "number" ? d.statusCode : undefined;
        statusCode = st !== undefined && st >= 200 && st < 600 ? st : sc ?? 200;
        config = (d.config && typeof d.config === "object" ? d.config : {}) as ConfigShape;
      } else {
        rawBody = typeof data === "string" ? data : JSON.stringify(data ?? "");
        statusCode = 200;
        config = {} as ConfigShape;
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
        const contentType = contentTypeFromHeaders(config?.headers);
        const isMultipart = contentType.split(";")[0].trim().toLowerCase().startsWith("multipart");
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
        const originalForm = config.fbOriginalForm ?? {};
        const customHdr = originalForm.customHeader;
        const prevCustom =
          customHdr && typeof customHdr === "object" && !Array.isArray(customHdr)
            ? (customHdr as Record<string, string>)
            : {};
        const updatedForm: Record<string, string | number | boolean | null | undefined | Record<string, string>> = {
          ...originalForm,
          customHeader: {
            ...prevCustom,
            ...randomUAHeaders,
          },
        };

        return delay(t)
          .then(() => {
            if (isMultipart) {
              return postFunc(
                urlStr,
                (ctx as Context).jar,
                { ...updatedForm, customHeader: randomUAHeaders } as unknown as Record<
                  string,
                  string | number | boolean | null | undefined
                >
              );
            }
            return def.post(
              urlStr,
              (ctx as Context).jar,
              updatedForm as unknown as Record<string, string | number | boolean | null | undefined>,
              ctx as Context,
              randomUAHeaders
            );
          })
          .then(parseAndCheckLogin(ctx, def, retry + 1, src))
          .then((result) => {
            log.info(
              `parseAndCheckLogin: Đã retry rate limit lần ${retry + 1} thành công - ${method} ${urlStr}`
            );
            return result;
          })
          .catch((error: unknown) => {
            log.error(
              `parseAndCheckLogin: Đã retry rate limit lần ${retry + 1} thất bại - ${method} ${urlStr} - ${error instanceof Error ? error.message : String(error)
              }`
            );
            throw error;
          });
      }

      // Retry on 5xx up to 5 times
      if (statusCode >= 500 && retry < 5) {
        const t = (Math.random() * 5000) | 0;
        const urlStr = (config?.url as string) || "";
        const contentType = contentTypeFromHeaders(config?.headers);
        const isMultipart = contentType.split(";")[0].trim().toLowerCase().startsWith("multipart");
        const postFunc = isMultipart ? def.postFormData : def.post;
        const method = isMultipart ? "POST (FormData)" : "POST";

        log.warn(
          `parseAndCheckLogin: Status ${statusCode}, đang retry lần ${retry + 1
          } sau ${(t / 1000).toFixed(2)}s - ${method} ${urlStr}`
        );

        return delay(t)
          .then(() => postFunc(urlStr, (ctx as Context).jar, config.fbOriginalForm))
          .then(parseAndCheckLogin(ctx, def, retry + 1, src))
          .then((result) => {
            log.info(
              `parseAndCheckLogin: Đã retry lần ${retry + 1} thành công - ${method} ${urlStr}`
            );
            return result;
          })
          .catch((error) => {
            log.error(
              `parseAndCheckLogin: Đã retry lần ${retry + 1} thất bại - ${method} ${urlStr} - ${error instanceof Error ? error.message : String(error)
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

      let res: unknown;
      try {
        const parsableBody = makeParsable(rawBody);
        if (!parsableBody || parsableBody.trim() === "") {
          throw new Error("Empty parsable body");
        }
        res = JSON.parse(parsableBody);
      } catch (e: unknown) {
        const em = e instanceof Error ? e.message : String(e);
        throw new CustomError({
          message: `JSON.parse error: ${em}`,
          detail: e,
          res: rawBody?.substring(0, 500) || "",
          sourceCall: src,
        });
      }

      if (!Array.isArray(res)) {
        const r = res as Record<string, unknown> & {
          jsmods?: { require?: unknown[][] };
          error?: unknown;
          redirect?: string;
          die?: boolean;
          type?: string;
          logout?: boolean;
        };

        if (r.jsmods?.require) {
          for (const i of r.jsmods.require) {
            if (!Array.isArray(i)) continue;
            if (i[0] === "ServerRedirect" && i[1] === "redirectPageTo") {
              const arg0 = (i[3] as unknown[] | undefined)?.[0];
              const s = typeof arg0 === "string" ? arg0 : "";
              const m = s.match(/\/checkpoint\/(\d+)/);
              if (m) {
                r.die = true;
                r.type = m[1];
                break;
              }
            }
          }
        }

        if (r.error === 1357001) r.logout = true;

        if (r.redirect && (config?.method || "").toUpperCase() === "GET") {
          return def
            .get(String(r.redirect), (ctx as Context).jar)
            .then(parseAndCheckLogin(ctx, def, undefined, src));
        }

        const req0 = r.jsmods?.require?.[0];
        if (Array.isArray(req0) && req0[0] === "Cookie" && Array.isArray(req0[3])) {
          const parts = req0[3] as string[];
          (ctx as Context).jar.setCookie(formatCookie(parts, "facebook"), "https://www.facebook.com");
          (ctx as Context).jar.setCookie(formatCookie(parts, "facebook"), "https://business.facebook.com");
          (ctx as Context).jar.setCookie(formatCookie(parts, "messenger"), "https://www.messenger.com");
        }

        for (const i of r.jsmods?.require || []) {
          if (!Array.isArray(i)) continue;
          if (i[0] === "DTSG" && i[1] === "setToken") {
            const tok = (i[3] as unknown[] | undefined)?.[0];
            if (typeof tok === "string") {
              (ctx as Context).fb_dtsg = tok;
              (ctx as Context).ttstamp =
                "2" + [...((ctx as Context).fb_dtsg || "")].map((c) => c.charCodeAt(0)).join("");
            }
          }
        }

        return {
          ...r,
          body: rawBody,
        };
      }

      const arr = res as unknown[] & { body?: string };
      arr.body = rawBody;
      return arr;
    });
}

function markDelivery(ctx: Context, client: Client, threadID: string, messageID: string): void {
  if (threadID && messageID) {
    client.markAsDelivered(threadID, messageID, (err?: Error) => {
      if (err) {
        log.error(`markAsDelivered: ${err.message || err}`);
      } else if (ctx.options.autoMarkRead) {
        client.markAsRead(threadID, (err2?: Error) => {
          if (err2) log.error(`markAsRead: ${err2.message || err2}`);
        });
      }
    });
  }
}

const getJar = (): ToughCookieJar & CookieJar => {
  const jar = new ToughCookieJar();
  const boundGetCookieStringSync = jar.getCookieStringSync.bind(jar);
  (jar as ToughCookieJar & CookieJar & { cookieString?: () => string }).cookieString = () =>
    boundGetCookieStringSync("https://business.facebook.com");
  return jar as ToughCookieJar & CookieJar;
};

export { CustomError, getAppState, getJar, markDelivery, parseAndCheckLogin, saveCookies };
