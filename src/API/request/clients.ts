import { makeParsable } from "./constants.js";
import type { Context, CookieJar as AppCookieJar, GlobalOptions } from "@types";
import type { Cookie as ToughCookie, CookieJar as ToughCookieJar } from "tough-cookie";

type Jar = ToughCookieJar & AppCookieJar;

/**
 * HTTP adapter cho retry 5xx: `makeDefaults` truyền `(url, jar, form, opts, ctx)` / FormData 6 tham số —
 * không khớp chữ với `DefaultFuncs` nhưng runtime vẫn dùng như vậy.
 */
export interface ClientsRetryHttp {
  get: (url: string, jar: Context["jar"], ...args: unknown[]) => Promise<unknown>;
  post: (url: string, jar: Context["jar"], form?: unknown, opts?: unknown, ctx?: unknown) => Promise<unknown>;
  postFormData: (
    url: string,
    jar: Context["jar"],
    formData?: unknown,
    qs?: unknown,
    opts?: unknown,
    ctx?: unknown
  ) => Promise<unknown>;
}

/** Got cũ có `request.uri`; `FbGotResponse` (axios.ts) có protocol/hostname/path trên `request` */
export interface ClientsRequestShape {
  uri?: { protocol: string; hostname: string; pathname: string };
  protocol?: string;
  hostname?: string;
  path?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  form?: unknown;
  formData?: unknown;
  qs?: unknown;
}

export interface ClientsParseResponse {
  statusCode: number;
  body: unknown;
  request: ClientsRequestShape;
}

interface RetryFailedError extends Error {
  statusCode?: number;
  res?: unknown;
  error?: string;
}

interface JsonParseDetailError extends Error {
  error?: string;
  detail?: unknown;
  res?: unknown;
}

interface LoginBlockedError extends Error {
  error?: string;
}

function buildRetryUrl(req: ClientsRequestShape): string {
  if (req.uri && typeof req.uri.protocol === "string") {
    const { protocol, hostname, pathname } = req.uri;
    return `${protocol}//${hostname}${pathname}`;
  }
  const protocol = typeof req.protocol === "string" ? req.protocol : "https:";
  const host = typeof req.hostname === "string" ? req.hostname : "";
  const pathPart = typeof req.path === "string" ? req.path : "/";
  const pathNorm = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  return `${protocol}//${host}${pathNorm}`;
}

function coerceClientsResponse(data: unknown): ClientsParseResponse | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const sc =
    typeof d.statusCode === "number"
      ? d.statusCode
      : typeof d.status === "number"
        ? d.status
        : NaN;
  if (!Number.isFinite(sc)) return null;
  const rawReq = d.request;
  if (!rawReq || typeof rawReq !== "object") return null;
  const r = rawReq as Record<string, unknown>;
  const headers =
    r.headers && typeof r.headers === "object"
      ? (r.headers as Record<string, string | string[] | undefined>)
      : {};
  const request: ClientsRequestShape = {
    uri:
      r.uri && typeof r.uri === "object"
        ? (r.uri as { protocol: string; hostname: string; pathname: string })
        : undefined,
    protocol: typeof r.protocol === "string" ? r.protocol : undefined,
    hostname: typeof r.hostname === "string" ? r.hostname : undefined,
    path: typeof r.path === "string" ? r.path : undefined,
    method: typeof r.method === "string" ? r.method : undefined,
    headers,
    form: r.form,
    formData: r.formData,
    qs: r.qs,
  };
  const body = d.body !== undefined ? d.body : d.data;
  return { statusCode: sc, body, request };
}

const formatCookie = (arr: string[], url: string): string =>
  `${arr[0]}=${arr[1]}; Path=${arr[3]}; Domain=${url}.com`;

const parseAndCheckLogin = (ctx: Context, http: ClientsRetryHttp, retryCount = 0) => {
  const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  return async (data: unknown): Promise<unknown> => {
    const parsed = coerceClientsResponse(data);
    if (!parsed) {
      throw new Error("parseAndCheckLogin (clients): expected response with status/statusCode, body/data, request");
    }

    if (parsed.statusCode >= 500 && parsed.statusCode < 600) {
      if (retryCount >= 5) {
        const err = new Error("Request retry failed. Check the `res` and `statusCode` property on this error.") as RetryFailedError;
        err.statusCode = parsed.statusCode;
        err.res = parsed.body;
        err.error = err.message;
        throw err;
      }

      retryCount += 1;
      const retryTime = Math.floor(Math.random() * 5000);
      const retryUrl = buildRetryUrl(parsed.request);
      await delay(retryTime);

      const opts: GlobalOptions | undefined = ctx.globalOptions ?? ctx.options;
      const ct = String(parsed.request.headers["content-type"] ?? "").split(";")[0];
      const nextData =
        ct === "multipart/form-data"
          ? await http.postFormData(retryUrl, ctx.jar, parsed.request.formData, parsed.request.qs, opts, ctx)
          : await http.post(retryUrl, ctx.jar, parsed.request.form, opts, ctx);
      return parseAndCheckLogin(ctx, http, retryCount)(nextData);
    }

    if (parsed.statusCode === 404) {
      return;
    }

    if (parsed.statusCode !== 200) {
      throw new Error(`parseAndCheckLogin got status code: ${parsed.statusCode}.`);
    }

    let res: Record<string, unknown>;
    if (typeof parsed.body === "object" && parsed.body !== null) {
      res = parsed.body as Record<string, unknown>;
    } else if (typeof parsed.body === "string") {
      try {
        res = JSON.parse(makeParsable(parsed.body)) as Record<string, unknown>;
      } catch (e) {
        const err = new Error("JSON.parse error. Check the `detail` property on this error.") as JsonParseDetailError;
        err.error = err.message;
        err.detail = e;
        err.res = parsed.body;
        throw err;
      }
    } else {
      throw new Error(`Unknown response body type: ${typeof parsed.body}`);
    }

    if (res.redirect && parsed.request.method === "GET") {
      const redirectRes = await http.get(String(res.redirect), ctx.jar);
      return parseAndCheckLogin(ctx, http)(redirectRes);
    }

    const jsmods = res.jsmods as { require?: unknown[] } | undefined;
    if (jsmods?.require && Array.isArray(jsmods.require[0])) {
      const firstReq = jsmods.require[0] as unknown[];
      if (firstReq[0] === "Cookie" && Array.isArray(firstReq[3])) {
        const requireCookie = firstReq[3] as string[];
        requireCookie[0] = requireCookie[0].replace("_js_", "");
        ctx.jar.setCookie(formatCookie(requireCookie, "facebook"), "https://www.facebook.com");
        ctx.jar.setCookie(formatCookie(requireCookie, "facebook"), "https://business.facebook.com");
        ctx.jar.setCookie(formatCookie(requireCookie, "messenger"), "https://www.messenger.com");
      }
    }

    if (jsmods && Array.isArray(jsmods.require)) {
      const arr = jsmods.require;
      for (const entry of arr) {
        if (!Array.isArray(entry)) continue;
        if (entry[0] === "DTSG" && entry[1] === "setToken") {
          const tok = (entry[3] as unknown[] | undefined)?.[0];
          if (typeof tok === "string") {
            ctx.fb_dtsg = tok;
            ctx.ttstamp = "2";
            for (let j = 0; j < ctx.fb_dtsg.length; j++) {
              ctx.ttstamp += String(ctx.fb_dtsg.charCodeAt(j));
            }
          }
        }
      }
    }

    if (res.error === 1357001) {
      const err = new Error("Facebook blocked the login") as LoginBlockedError;
      err.error = "Not logged in.";
      throw err;
    }

    return res;
  };
};

const saveCookies =
  <T extends { headers: Record<string, string | string[] | undefined> }>(jar: Jar) =>
  (res: T): T => {
    const cookies = res.headers["set-cookie"] || [];
    const list = Array.isArray(cookies) ? cookies : [cookies];
    list.forEach((c: string) => {
      if (c.includes(".facebook.com")) {
        jar.setCookie(c, "https://www.facebook.com");
        jar.setCookie(c, "https://business.facebook.com");
      }
      const c2 = c.replace(/domain=\.facebook\.com/, "domain=.messenger.com");
      jar.setCookie(c2, "https://www.messenger.com");
    });
    return res;
  };

const getAccessFromBusiness = (jar: Jar, Options: GlobalOptions | null | undefined) => {
  return async (res: ClientsParseResponse | null | undefined): Promise<[unknown, string | null]> => {
    const html = res ? res.body : null;
    try {
      const requestModule = (await import("./index.js")) as {
        default?: { get?: ClientsRetryHttp["get"] };
        get?: ClientsRetryHttp["get"];
      };
      const getFn = requestModule.default?.get ?? requestModule.get;
      if (!getFn) return [html, null];
      const businessRes = (await getFn(
        "https://business.facebook.com/content_management",
        jar,
        null,
        Options ?? null,
        null,
        { noRef: true }
      )) as { data?: unknown };
      const body = typeof businessRes.data === "string" ? businessRes.data : String(businessRes.data ?? "");
      const match = /"accessToken":"([^.]+)","clientID":/.exec(body);
      const token = match?.[1] ?? null;
      return [html, token];
    } catch {
      return [html, null];
    }
  };
};

const getAppState = (jar: Jar): ToughCookie[] =>
  jar
    .getCookiesSync("https://business.facebook.com")
    .concat(jar.getCookiesSync("https://www.facebook.com"))
    .concat(jar.getCookiesSync("https://www.messenger.com"));

const clientUtils = {
  parseAndCheckLogin,
  saveCookies,
  getAccessFromBusiness,
  getAppState,
};

export default clientUtils;
export { parseAndCheckLogin, saveCookies, getAccessFromBusiness, getAppState };
