import { Cookie } from "tough-cookie";
import log from "@log";
import type { Context } from "../request/formatters/helpers.js";

export function setCookieSafe(jar: Context["jar"], cookie: Cookie | string, url: string): void {
  const j: any = jar;
  if (typeof j.setCookie === "function") {
    j.setCookie(cookie, url, (err: any) => {
      if (err) {
        log.warn(`Failed to set cookie at ${url}: ${err.message || err}`);
      }
    });
  } else {
    log.warn("CookieJar.setCookie is not available");
  }
}

export function setCookieForDomain(
  jar: Context["jar"],
  key: string,
  value: string,
  domain: string
): void {
  const parsed = Cookie.parse(`${key}=${value}; Domain=${domain}; Path=/; Secure; HttpOnly`);
  if (parsed) {
    setCookieSafe(jar, parsed, `https://${domain.replace(/^\./, "")}`);
  }
}

export function parseAndSetCookies(jar: Context["jar"], cookieString: string): void {
  const cookiePairs = cookieString
    .split(";")
    .map((c: string) => c.trim())
    .filter((c: string) => c && c.includes("="));

  for (const pair of cookiePairs) {
    const equalIndex = pair.indexOf("=");
    if (equalIndex <= 0) continue;
    const key = pair.substring(0, equalIndex).trim();
    const value = pair.substring(equalIndex + 1).trim();
    if (!key || !value) continue;
    try {
      setCookieForDomain(jar, key, value, ".facebook.com");
      if (/(c_user|xs|fr|presence|sb|datr)/.test(key)) {
        setCookieForDomain(jar, key, value, ".messenger.com");
      }
    } catch (e: any) {
      log.warn(`Failed to set cookie ${key}: ${e.message || e}`);
    }
  }
}

export function extractCookieString(cookieStr: any): string | null {
  if (typeof cookieStr === "object" && cookieStr !== null && (cookieStr as any).cookieStr) {
    const extracted = (cookieStr as any).cookieStr;
    return typeof extracted === "string" && extracted.trim().length > 0 ? extracted.trim() : null;
  } else if (typeof cookieStr === "string") {
    const trimmed = cookieStr.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}
