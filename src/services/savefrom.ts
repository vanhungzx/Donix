import axios, { AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import * as crypto from "crypto";
import { CookieJar } from "tough-cookie";
import * as vm from "vm";

const jar = new CookieJar();
const http: AxiosInstance = wrapper(
  axios.create({
    jar,
    withCredentials: true,
  })
);

function atob(str: string): string {
  return Buffer.from(str, "base64").toString("utf8");
}

type TransformFunction = (S: string, x: number) => string;

const G: TransformFunction[] = [
  (S, _x) => S.split("").reverse().join(""),
  (S, x) => {
    x = S.length - (x % S.length);
    return S.substring(x) + S.substring(0, x);
  },
  (S, x) => S.substring(x % S.length),
  (S, x) => S.substring(0, S.length - (x % S.length)),
];

type TransformKey = [number, number];

function X(S: string, x: TransformKey[]): string {
  const V = [...x];
  V.reverse();
  for (const k of V) {
    const [B, C] = k;
    if (B >= 0 && B < G.length && G[B]) {
      S = G[B](S, C);
    }
  }
  return S;
}

function sm(
  S: string,
  x: string | TransformKey[],
  V: string | TransformKey[],
  k: (str: string) => string
): string {
  S = X(S, typeof V === "string" ? JSON.parse(V) : V);
  const padLen = (4 - (S.length % 4)) % 4;
  if (padLen) S = S.padEnd(S.length + padLen, "=");
  S = k(S);
  return X(S, typeof x === "string" ? JSON.parse(x) : x);
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function detectBot(): Promise<string> {
  return "2";
}

interface ServerTimeResponse {
  msec?: number;
}

async function getServerTime(): Promise<number> {
  try {
    const headers = {
      accept: "*/*",
      "accept-language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
      priority: "u=1, i",
      "sec-ch-ua":
        '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      Referer: "https://en1.savefrom.net/savefrom.php",
    };
    const { data } = await http.get<ServerTimeResponse>(
      "https://en1.savefrom.net/msec",
      {
        headers,
        timeout: 3000,
      }
    );
    if (!data || typeof data.msec !== "number") return 0;
    return Math.floor(1000 * data.msec);
  } catch {
    return 0;
  }
}

interface Payload {
  url: string;
  ts: number;
  _ts: number;
  _tsc: number;
  _s: string;
  _x: string;
}

async function createPayload(url: string): Promise<Payload> {
  const serverTime = await getServerTime();
  let timeOffset = serverTime ? Date.now() - serverTime : 0;
  if (Math.abs(timeOffset) < 60000) timeOffset = 0;
  const ts = Date.now() - timeOffset;
  const secretKey = sm(
    "NkdDOmdzNmVDZxYjN0UWZ3kzY4cTNxMDM0cDZ5QTOxczYkZGZhdTYxI2YwgzNwIDMkVWM5AjZ2cjYr+Hnmv587I6QHQDjCjMTYxQDOyUDOyUDNzEWYjlTO0IG",
    "[[0,69],[3,7],[2,6],[0,22],[1,99]]",
    "[[0,49],[2,8],[3,5],[2,5],[1,39]]",
    atob
  );
  const hashString = url + ts + secretKey;
  const _s = sha256(hashString);
  const _x = await detectBot();
  return {
    url,
    ts,
    _ts: 1764686202570,
    _tsc: timeOffset,
    _s,
    _x,
  };
}

function hasDownloadLinks(obj: any): boolean {
  if (typeof obj !== "object" || obj === null) return false;
  const str = JSON.stringify(obj).toLowerCase();
  return (
    str.includes("url") ||
    str.includes("download") ||
    str.includes("video") ||
    str.includes("mp4") ||
    str.includes("http")
  );
}

interface DecodeContext {
  results: string | null;
  parent: {
    document: {
      location: Record<string, unknown>;
    };
  };
  frameElement: Record<string, unknown>;
  atob: (base64: string) => string;
  btoa: (str: string) => string;
  String: typeof String;
  Array: typeof Array;
  Object: typeof Object;
  Math: typeof Math;
  Date: typeof Date;
  parseInt: typeof parseInt;
  parseFloat: typeof parseFloat;
  isNaN: typeof isNaN;
  isFinite: typeof isFinite;
  encodeURIComponent: typeof encodeURIComponent;
  _decodeURIComponent: (uri: string) => string;
  window: {
    parent: {
      sf: {
        videoResult: {
          show(): void;
          showRows(): void;
        };
        enableElement(): void;
      };
    };
    location: {
      href: string;
    };
  };
  document: {
    location: {
      href: string;
    };
    createElement(): {
      setAttribute(): void;
      appendChild(): void;
    };
    getElementById(): null;
    querySelector(): null;
  };
  navigator: {
    userAgent: string;
  };
  location: {
    href: string;
  };
  console: {
    log(): void;
    error(): void;
    warn(): void;
    info(): void;
  };
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
}

function decodeSaveFromResponse(obfuscatedCode: string): any {
  const data = obfuscatedCode.replace(/^\/\*js-response\*\//, "");
  try {
    const context: DecodeContext = {
      results: null,
      parent: {
        document: {
          location: {},
        },
      },
      frameElement: {},
      atob: (base64) => Buffer.from(base64, "base64").toString("utf8"),
      btoa: (str) => Buffer.from(str, "utf8").toString("base64"),
      String,
      Array,
      Object,
      Math,
      Date,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      _decodeURIComponent(uri: string): string {
        try {
          const decoded = decodeURIComponent(uri);
          if (
            /showResult/.test(decoded) ||
            /videoResult/.test(decoded) ||
            /sf\.videoResult/.test(decoded) ||
            /window\.parent\.sf/.test(decoded)
          ) {
            context.results = decoded;
            return "true";
          }
          return decoded;
        } catch {
          return uri;
        }
      },
      window: {
        parent: {
          sf: {
            videoResult: {
              show() { },
              showRows() { },
            },
            enableElement() { },
          },
        },
        location: {
          href: "https://en1.savefrom.net/",
        },
      },
      document: {
        location: {
          href: "https://en1.savefrom.net/",
        },
        createElement() {
          return {
            setAttribute() { },
            appendChild() { },
          };
        },
        getElementById() {
          return null;
        },
        querySelector() {
          return null;
        },
      },
      navigator: {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      location: {
        href: "https://en1.savefrom.net/",
      },
      console: {
        log() { },
        error() { },
        warn() { },
        info() { },
      },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
    };
    const vmContext = vm.createContext(context);
    const script = new vm.Script(
      `decodeURIComponent=_decodeURIComponent;${data}`
    );
    script.runInContext(vmContext, {
      timeout: 10000,
      displayErrors: false,
    });
    if (!vmContext.results) return null;
    const raw = vmContext.results;
    const showSplit = raw.split("window.parent.sf.videoResult.show(");
    const showRowsSplit = raw.split("window.parent.sf.videoResult.showRows(");
    const executed = showSplit[1] || showRowsSplit[1];
    if (!executed) {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
    let json: any;
    try {
      if (raw.includes("showRows")) {
        const splits = executed.split('],"');
        const lastIndex = splits.findIndex((v: string) =>
          v.includes("window.parent.sf.enableElement")
        );
        if (lastIndex > 0) {
          json = JSON.parse(splits.slice(0, lastIndex).join('],"') + "]");
        } else {
          const arrayMatch = executed.match(/\[[\s\S]*\]/);
          if (arrayMatch) {
            json = JSON.parse(arrayMatch[0].split(");")[0]);
          }
        }
      } else {
        json = [JSON.parse(executed.split(");")[0])];
      }
    } catch {
      try {
        const jsonStr = executed.split(");")[0].trim();
        json = JSON.parse(jsonStr);
        if (!Array.isArray(json)) json = [json];
      } catch {
        return null;
      }
    }
    return json;
  } catch {
    return null;
  }
}

interface ExtractResults {
  urls: string[];
  jsonData?: any;
  base64Strings: string[];
}

function extractUrlsFromCode(obfuscatedCode: string): any {
  const results: ExtractResults = {
    urls: [],
    jsonData: null,
    base64Strings: [],
  };
  const urlPattern1 = /https?:\/\/[^\s"'<>)\];]+/g;
  const urls1 = obfuscatedCode.match(urlPattern1) || [];
  const urlPattern2 = /['"`]https?:\/\/[^'"`\s]+['"`]/g;
  const urls2 = (obfuscatedCode.match(urlPattern2) || []).map((u) =>
    u.slice(1, -1)
  );
  const base64Pattern = /['"`]([A-Za-z0-9+/=]{50,})['"`]/g;
  let base64Match: RegExpExecArray | null;
  while ((base64Match = base64Pattern.exec(obfuscatedCode)) !== null) {
    try {
      if (!base64Match[1]) continue;
      const decoded = Buffer.from(base64Match[1], "base64").toString("utf8");
      if (decoded.includes("http://") || decoded.includes("https://")) {
        const decodedUrls = decoded.match(/https?:\/\/[^\s"'<>)]+/g);
        if (decodedUrls) results.urls.push(...decodedUrls);
      }
      results.base64Strings.push(decoded);
    } catch {
      continue;
    }
  }
  results.urls = [...new Set([...urls1, ...urls2])];
  const videoUrls = results.urls.filter(
    (url) =>
      url.includes(".mp4") ||
      url.includes(".m3u8") ||
      url.includes("video") ||
      url.includes("cdn") ||
      url.includes("download")
  );
  const jsonPattern1 = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  const jsonMatches1: string[] = obfuscatedCode.match(jsonPattern1) || [];
  const jsonPattern2 = /['"`](\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})['"`]/g;
  let jsonMatch2: RegExpExecArray | null;
  while ((jsonMatch2 = jsonPattern2.exec(obfuscatedCode)) !== null) {
    if (jsonMatch2[1]) {
      jsonMatches1.push(jsonMatch2[1]);
    }
  }
  for (const match of jsonMatches1) {
    try {
      const parsed = JSON.parse(match);
      if (hasDownloadLinks(parsed)) {
        results.jsonData = parsed;
        break;
      }
    } catch {
      continue;
    }
  }
  for (const decoded of results.base64Strings) {
    if (results.jsonData) break;
    try {
      const parsed = JSON.parse(decoded);
      if (hasDownloadLinks(parsed)) {
        results.jsonData = parsed;
        break;
      }
    } catch { }
    const decodedUrls = decoded.match(/https?:\/\/[^\s"'<>)]+/g);
    if (decodedUrls) results.urls.push(...decodedUrls);
  }
  results.urls = [...new Set(results.urls)];
  if (results.jsonData) return results.jsonData;
  if (videoUrls.length > 0) {
    return {
      urls: videoUrls,
      allUrls: results.urls,
      type: "extracted_video_urls",
    };
  }
  if (results.urls.length > 0) {
    return {
      urls: results.urls,
      type: "extracted_urls",
    };
  }
  return null;
}

function parseSaveFromResponse(responseText: string): any {
  const trimmed = responseText.trim();
  if (trimmed.startsWith("/*js-response*/")) {
    const decoded = decodeSaveFromResponse(trimmed);
    if (decoded) return decoded;
    const fallback = extractUrlsFromCode(trimmed);
    if (fallback) return fallback;
    const urlPattern = /https?:\/\/[^\s"'<>)\];]+/g;
    const urls = trimmed.match(urlPattern) || [];
    if (urls.length) {
      const videoUrls = urls.filter(
        (url) =>
          url.includes(".mp4") ||
          url.includes(".m3u8") ||
          url.includes("video") ||
          url.includes("cdn") ||
          url.includes("download") ||
          url.includes("tiktok") ||
          url.includes("savefrom")
      );
      if (videoUrls.length) {
        return {
          urls: [...new Set(videoUrls)],
          allUrls: [...new Set(urls)],
          type: "direct_extracted_urls",
        };
      }
      return {
        urls: [...new Set(urls)],
        type: "extracted_urls",
      };
    }
  }
  try {
    const json = JSON.parse(trimmed);
    if (hasDownloadLinks(json)) return json;
  } catch { }
  const jsonMatch = trimmed.match(/\{[\s\S]{10,}\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (hasDownloadLinks(parsed)) return parsed;
    } catch { }
  }
  return {
    raw: trimmed.substring(0, 1000) + "...",
    type: "unknown",
    length: trimmed.length,
  };
}

export async function makeSaveFromRequest(tiktokUrl: string): Promise<any> {
  try {
    const payload = await createPayload(tiktokUrl);
    const formData = new URLSearchParams({
      sf_url: tiktokUrl,
      sf_submit: "",
      new: "2",
      lang: "en",
      app: "",
      country: "vn",
      os: "Windows",
      browser: "Chrome",
      channel: "downloader",
      "sf-nomad": "1",
      url: tiktokUrl,
      ts: String(payload.ts),
      _ts: String(payload._ts),
      _tsc: String(payload._tsc),
      _s: payload._s,
      _x: payload._x,
    });
    const headers = {
      accept: "application/json, text/plain, */*",
      "accept-language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: "https://en1.savefrom.net",
      referer: "https://en1.savefrom.net/savefrom.php",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    };
    const response = await http.post("https://en1.savefrom.net/savefrom.php", formData.toString(), {
      headers,
      timeout: 30000,
    });
    return parseSaveFromResponse(response.data);
  } catch (error: any) {
    console.error("Error in makeSaveFromRequest:", error.message);
    return null;
  }
}
