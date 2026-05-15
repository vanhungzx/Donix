/**
 * Bypass cho checkpoint "FB Scraping Warning" (601051028565049)
 *
 * Reverse từ JS Facebook:
 *   - doc_id 24406519995698862, mutation FBScrapingWarningMutation
 *   - POST /api/graphql/ với fb_dtsg / jazoest / lsd
 *
 * Dùng native fetch — KHÔNG đi qua requestGuard / bot's post()
 * để tránh bị block bởi cooldown.
 */
import log from "@log";
import type { Context } from "../request/formatters/helpers.js";

const GRAPHQL_URL = "https://www.facebook.com/api/graphql/";
const DOC_ID = "24406519995698862";
const FRIENDLY_NAME = "FBScrapingWarningMutation";
const CALLER_CLASS = "RelayModern";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

function pickFirst(text: string, patterns: RegExp[]): string {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1];
  }
  return "";
}

function decodeHtml(v: string): string {
  return v
    .replace(/&quot;/giu, '"')
    .replace(/&#x27;/giu, "'")
    .replace(/&#039;/giu, "'")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">");
}

function computeJazoest(dtsg: string): string {
  if (!dtsg) return "";
  let sum = 0;
  for (const ch of dtsg) sum += ch.charCodeAt(0);
  return `2${sum}`;
}

function trimAntiJSPrefix(text: string): string {
  const prefix = "for (;;);";
  return text.startsWith(prefix) ? text.slice(prefix.length) : text;
}

export interface ScrapingWarningTokens {
  fbDtsg: string;
  lsd: string;
  jazoest: string;
  userID: string;
  spinR: string;
  spinB: string;
  spinT: string;
  rev: string;
  hsi: string;
  hs: string;
}

export function extractTokensFromHtml(html: string): ScrapingWarningTokens {
  const fbDtsg = decodeHtml(
    pickFirst(html, [
      /"DTSGInitData",\[\],\{"token":"([^"\\]+)"/iu,
      /"DTSGInitialData",\[\],\{"token":"([^"\\]+)"/iu,
      /name="fb_dtsg"\s+value="([^"]+)"/iu,
      /value="([^"]+)"\s+name="fb_dtsg"/iu,
      /"async_get_token":"([^"\\]+)"/iu,
    ])
  );
  const lsd = decodeHtml(
    pickFirst(html, [
      /"LSD",\[\],\{"token":"([^"\\]+)"/iu,
      /name="lsd"\s+value="([^"]+)"/iu,
      /value="([^"]+)"\s+name="lsd"/iu,
    ])
  );
  const jazoestRaw = decodeHtml(
    pickFirst(html, [
      /name="jazoest"\s+value="([^"]+)"/iu,
      /value="([^"]+)"\s+name="jazoest"/iu,
      /"jazoest"\s*:\s*"([^"]+)"/iu,
    ])
  );
  const userID = decodeHtml(
    pickFirst(html, [
      /name="__user"\s+value="(\d+)"/iu,
      /"USER_ID":"(\d+)"/iu,
      /"ACCOUNT_ID":"(\d+)"/iu,
      /"actorID":"(\d+)"/iu,
    ])
  );
  const spinR = pickFirst(html, [/"__spin_r":(\d+)/iu, /"spin_r":(\d+)/iu]);
  const spinB = pickFirst(html, [/"__spin_b":"([^"]+)"/iu, /"spin_b":"([^"]+)"/iu]);
  const spinT = pickFirst(html, [/"__spin_t":(\d+)/iu, /"spin_t":(\d+)/iu]);
  const rev = pickFirst(html, [/"server_revision":(\d+)/iu, /"__rev":(\d+)/iu]);
  const hsi = pickFirst(html, [/"hsi":"(\d+)"/iu]);
  const hs = pickFirst(html, [
    /"haste_session":"([^"]+)"/iu,
    /"hasteSession":"([^"]+)"/iu,
    /"__hs":"([^"]+)"/iu,
  ]);

  return {
    fbDtsg,
    lsd,
    jazoest: jazoestRaw || computeJazoest(fbDtsg),
    userID,
    spinR,
    spinB,
    spinT,
    rev,
    hsi,
    hs,
  };
}

function jarToCookieString(jar: Context["jar"]): string {
  try {
    const cookies = jar.getCookiesSync
      ? jar.getCookiesSync("https://www.facebook.com")
      : [];
    if (!Array.isArray(cookies) || cookies.length === 0) return "";
    return cookies
      .map((c: any) => {
        const key = c.key ?? c.name ?? "";
        const value = c.value ?? "";
        return key ? `${key}=${value}` : "";
      })
      .filter(Boolean)
      .join("; ");
  } catch {
    return "";
  }
}

function extractCookieValue(cookieString: string, name: string): string {
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, "i");
  const m = cookieString.match(re);
  return m ? decodeURIComponent(m[1]) : "";
}

/**
 * Thử bypass FB Scraping Warning bằng GraphQL mutation.
 * Dùng native fetch — không đi qua requestGuard.
 *
 * @param jar - cookie jar hiện tại
 * @param checkpointHtml - HTML của trang checkpoint (đã GET trước đó), hoặc rỗng để tự GET
 * @returns true nếu bypass thành công
 */
export async function bypassScrapingWarning(
  jar: Context["jar"],
  checkpointHtml?: string
): Promise<boolean> {
  const cookieString = jarToCookieString(jar);
  if (!cookieString) {
    log.warn("[BypassScraping] Không lấy được cookie từ jar");
    return false;
  }

  const checkpointURL =
    "https://www.facebook.com/checkpoint/601051028565049/?next=https%3A%2F%2Fwww.facebook.com%2F";

  let html = checkpointHtml || "";

  // Nếu chưa có HTML, GET trang checkpoint bằng native fetch
  if (!html) {
    try {
      log.info("[BypassScraping] GET checkpoint page...");
      const res = await fetch(checkpointURL, {
        method: "GET",
        redirect: "manual",
        headers: {
          "user-agent": USER_AGENT,
          "accept-language": "vi,en;q=0.9",
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "none",
          "sec-fetch-user": "?1",
          "upgrade-insecure-requests": "1",
          cookie: cookieString,
        },
      });
      if (res.status >= 300 && res.status < 400) {
        log.warn(`[BypassScraping] Checkpoint redirect ${res.status}`);
        return false;
      }
      if (!res.ok) {
        log.warn(`[BypassScraping] Checkpoint GET failed: HTTP ${res.status}`);
        return false;
      }
      html = await res.text();
    } catch (e: any) {
      log.warn(`[BypassScraping] Lỗi GET checkpoint: ${e?.message || e}`);
      return false;
    }
  }

  // Trích token
  const tokens = extractTokensFromHtml(html);
  if (!tokens.fbDtsg) {
    log.warn("[BypassScraping] Không tìm được fb_dtsg trong HTML checkpoint");
    return false;
  }

  const userID =
    tokens.userID || extractCookieValue(cookieString, "c_user") || "0";

  log.info(
    `[BypassScraping] POST ${FRIENDLY_NAME} (user=${userID}, dtsg=${tokens.fbDtsg.slice(0, 12)}...)`
  );

  // Build body
  const body = new URLSearchParams();
  const setIf = (k: string, v: string) => {
    if (v) body.set(k, v);
  };
  setIf("av", userID);
  setIf("__user", userID);
  body.set("__a", "1");
  body.set("__req", "a");
  setIf("__hs", tokens.hs);
  body.set("dpr", "1");
  body.set("__ccg", "EXCELLENT");
  setIf("__rev", tokens.rev);
  setIf("__hsi", tokens.hsi);
  body.set("__comet_req", "15");
  body.set("fb_dtsg", tokens.fbDtsg);
  setIf("jazoest", tokens.jazoest);
  setIf("lsd", tokens.lsd);
  setIf("__spin_r", tokens.spinR);
  setIf("__spin_b", tokens.spinB || "trunk");
  setIf("__spin_t", tokens.spinT);
  body.set("fb_api_caller_class", CALLER_CLASS);
  body.set("fb_api_req_friendly_name", FRIENDLY_NAME);
  body.set("server_timestamps", "true");
  body.set("doc_id", DOC_ID);
  body.set("variables", "{}");

  try {
    const headers: Record<string, string> = {
      "user-agent": USER_AGENT,
      accept: "*/*",
      "accept-language": "vi,en;q=0.9",
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://www.facebook.com",
      referer: checkpointURL,
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-asbd-id": "359341",
      "x-fb-friendly-name": FRIENDLY_NAME,
      cookie: cookieString,
    };
    if (tokens.lsd) headers["x-fb-lsd"] = tokens.lsd;

    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers,
      body: body.toString(),
      redirect: "manual",
    });

    const raw = await res.text();
    const cleaned = trimAntiJSPrefix(raw).trim();
    let parsed: any = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // not JSON
    }

    if (parsed?.data?.fb_scraping_warning_clear?.success === true) {
      log.success(
        "[BypassScraping] Bypass OK -> fb_scraping_warning_clear.success = true"
      );
      return true;
    }

    const errMsg =
      parsed?.errors?.[0]?.summary ||
      parsed?.errors?.[0]?.message ||
      parsed?.error ||
      "không có message";
    log.warn(
      `[BypassScraping] Mutation trả về nhưng KHÔNG success (HTTP ${res.status}): ${errMsg}`
    );
    return false;
  } catch (e: any) {
    log.warn(`[BypassScraping] Lỗi POST mutation: ${e?.message || e}`);
    return false;
  }
}
