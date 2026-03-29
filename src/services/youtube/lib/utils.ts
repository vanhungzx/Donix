import { writeFileSync } from "fs";
import { request as undiciRequest } from "undici";
import * as AGENT from "./agent.js";
import { getAntiDetectionManager } from "./anti-detection.js";
import type {
  HeadersMap,
  JsonObject,
  StatusCodeError,
  UnknownRecord,
  YoutubePlayerResponse,
  YoutubeRequestConfig,
  YoutubeRequestOptions,
} from "./types.js";

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const ensureRequestOptions = (options: YoutubeRequestConfig): YoutubeRequestOptions => {
  const requestOptions = options.requestOptions ?? {};
  requestOptions.headers = requestOptions.headers ?? {};
  options.requestOptions = requestOptions;
  return requestOptions;
};

export const between = (haystack: string, left: RegExp | string, right: string): string => {
  let position = 0;
  if (left instanceof RegExp) {
    const match = haystack.match(left);
    if (!match || match.index === undefined) return "";
    position = match.index + match[0].length;
  } else {
    position = haystack.indexOf(left);
    if (position === -1) return "";
    position += left.length;
  }

  const sliced = haystack.slice(position);
  const end = sliced.indexOf(right);
  return end === -1 ? "" : sliced.slice(0, end);
};

export const tryParseBetween = (
  body: string,
  left: RegExp | string,
  right: string,
  prepend = "",
  append = ""
): UnknownRecord | null => {
  const raw = between(body, left, right);
  if (!raw) return null;

  const attempts = [
    `${prepend}${raw.trim().replace(/[,;]$/, "")}${append}`,
    raw
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "")
      .replace(/\\t/g, ""),
  ];

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]"));
      return isRecord(parsed) ? parsed : null;
    } catch {
      continue;
    }
  }

  return null;
};

export const extractYouTubeJSON = (body: string, varName: string): UnknownRecord | null => {
  const patterns = [
    new RegExp(`var ${varName}\\s*=\\s*({.+?});`, "i"),
    new RegExp(`"${varName}"\\s*:\\s*({.+?})(?:,|$)`, "i"),
    new RegExp(`${varName}\\s*[":=]\\s*({.+?})(?:[,;}]|$)`, "i"),
    new RegExp(`["']${varName}["']\\s*:\\s*({.+?})(?:,|$)`, "i"),
    new RegExp(`\\b${varName}\\b.*?:\\s*({.+?})(?:[,;}\\]])`, "i"),
    new RegExp(`ytcfg\\.set\\(.*?"${varName}"\\s*:\\s*({.+?})`, "i"),
    new RegExp(`window\\["yt"\\].*?"${varName}"\\s*:\\s*({.+?})`, "i"),
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    const candidate = match?.[1];
    if (!candidate) continue;
    try {
      let jsonString = candidate;
      const openBraces = (jsonString.match(/{/g) || []).length;
      const closeBraces = (jsonString.match(/}/g) || []).length;
      if (openBraces > closeBraces) {
        jsonString += "}".repeat(openBraces - closeBraces);
      }
      jsonString = jsonString
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .replace(/([{,]\s*)(\w+):/g, '$1"$2":')
        .replace(/:\s*'([^']*)'/g, ':"$1"')
        .replace(/\\'/g, "'");
      const parsed = JSON.parse(jsonString);
      if (isRecord(parsed)) return parsed;
    } catch {
      continue;
    }
  }

  return null;
};

export const parseAbbreviatedNumber = (value: string): number | null => {
  const match = value.replace(",", ".").replace(" ", "").match(/([\d,.]+)([MK]?)/i);
  if (!match) return null;
  const number = Number.parseFloat(match[1]);
  const multiplier = match[2]?.toUpperCase();
  if (multiplier === "M") return Math.round(number * 1_000_000);
  if (multiplier === "K") return Math.round(number * 1_000);
  return Math.round(number);
};

const ESCAPING_SEQUENCES: Array<{ end: string; start: string; startPrefix?: RegExp }> = [
  { start: '"', end: '"' },
  { start: "'", end: "'" },
  { start: "`", end: "`" },
  { start: "/", end: "/", startPrefix: /(^|[[{:;,/])\s?$/ },
];

export const cutAfterJS = (mixedJson: string): string => {
  const open = mixedJson[0] === "[" ? "[" : mixedJson[0] === "{" ? "{" : "";
  const close = open === "[" ? "]" : open === "{" ? "}" : "";
  if (!open || !close) {
    throw new Error(`Can't cut unsupported JSON but got: ${mixedJson[0]}`);
  }

  let escapedSequence: (typeof ESCAPING_SEQUENCES)[number] | null = null;
  let escaped = false;
  let counter = 0;

  for (let index = 0; index < mixedJson.length; index++) {
    const char = mixedJson[index];

    if (!escaped && escapedSequence && char === escapedSequence.end) {
      escapedSequence = null;
      continue;
    }

    if (!escaped && !escapedSequence) {
      for (const sequence of ESCAPING_SEQUENCES) {
        if (char !== sequence.start) continue;
        if (!sequence.startPrefix || mixedJson.substring(index - 10, index).match(sequence.startPrefix)) {
          escapedSequence = sequence;
          break;
        }
      }
      if (escapedSequence) continue;
    }

    escaped = char === "\\" && !escaped;
    if (escapedSequence) continue;

    if (char === open) counter++;
    if (char === close) counter--;

    if (counter === 0) {
      return mixedJson.substring(0, index + 1);
    }
  }

  throw Error("Can't cut unsupported JSON (no matching closing bracket found)");
};

class UnrecoverableError extends Error {}

export const playError = (playerResponse: YoutubePlayerResponse | UnknownRecord | null | undefined): Error | null => {
  const playability = isRecord(playerResponse) ? playerResponse.playabilityStatus : undefined;
  if (!isRecord(playability) || typeof playability.status !== "string") return null;

  const reason =
    typeof playability.reason === "string"
      ? playability.reason
      : Array.isArray(playability.messages) && typeof playability.messages[0] === "string"
        ? playability.messages[0]
        : "This video is unavailable.";

  if (["ERROR", "LOGIN_REQUIRED", "LIVE_STREAM_OFFLINE", "UNPLAYABLE"].includes(playability.status)) {
    return new UnrecoverableError(reason);
  }

  return null;
};

const useFetch = async (
  fetchFn: typeof globalThis.fetch,
  url: string,
  requestOptions: YoutubeRequestOptions
): Promise<{ body: Response; headers: HeadersMap; statusCode: number }> => {
  const query = requestOptions.query;
  let finalUrl = url;
  if (query) {
    const urlObject = new URL(url);
    for (const [key, value] of Object.entries(query)) {
      urlObject.searchParams.append(key, String(value));
    }
    finalUrl = urlObject.toString();
  }

  const response = await fetchFn(finalUrl, {
    method: requestOptions.method,
    headers: requestOptions.headers,
    body: requestOptions.body,
  });

  return {
    body: response,
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  };
};

export const request = async (
  url: string,
  options: YoutubeRequestConfig = {}
): Promise<JsonObject | string | UnknownRecord> => {
  let requestOptions = ensureRequestOptions(options);
  const headers = requestOptions.headers ?? {};
  requestOptions.headers = headers;

  if (typeof options.rewriteRequest === "function") {
    const rewritten = options.rewriteRequest(url, requestOptions);
    url = rewritten.url || url;
    requestOptions = rewritten.requestOptions || requestOptions;
    requestOptions.headers = requestOptions.headers ?? headers;
  }

  if (options.useAntiDetection !== false && /youtube(?:i)?\.(?:googleapis|com)/.test(url)) {
    const antiDetection = getAntiDetectionManager();
    const videoIdMatch = url.match(/[?&]v=([^&]+)/);
    const headers = antiDetection.generateHeaders({
      videoId: videoIdMatch?.[1] || null,
      customHeaders: requestOptions.headers,
      includeReferer: true,
    });
    requestOptions.headers = headers;
    await antiDetection.waitForRateLimit();
    await antiDetection.applyDelay();
    antiDetection.recordRequest();
  } else if (!requestOptions.headers["Accept-Encoding"]) {
    requestOptions.headers["Accept-Encoding"] = "identity";
  }

  const response =
    typeof options.fetch === "function"
      ? await useFetch(options.fetch, url, requestOptions)
      : await undiciRequest(url, requestOptions as Parameters<typeof undiciRequest>[1]);

  const statusCode = Number(response.statusCode);
  if (statusCode >= 200 && statusCode < 300) {
    const contentType = response.headers["content-type"] || "";
    if (contentType.includes("application/json")) {
      const data = await response.body.json();
      return isRecord(data) ? data : {};
    }
    return response.body.text();
  }

  if (statusCode >= 300 && statusCode < 400) {
    const location = response.headers.location;
    if (!location) {
      throw new Error(`Redirect without location from ${url}`);
    }
    return request(Array.isArray(location) ? location[0] || url : location, options);
  }

  const error = new Error(`Status code: ${statusCode}`) as StatusCodeError;
  error.statusCode = statusCode;
  throw error;
};

export const deprecate = <T extends object>(
  obj: T,
  prop: string,
  value: unknown,
  _oldPath: string,
  _newPath: string
): void => {
  Object.defineProperty(obj, prop, {
    get: () => value,
  });
};

const isIPv6 = (ip: string): boolean => {
  const regex =
    /^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:))(?:\/(?:1[0-1][0-9]|12[0-8]|[1-9][0-9]|[1-9]))?$/;
  return regex.test(ip);
};

const normalizeIP = (ip: string): number[] => {
  const [start = "", end = ""] = ip.split("::");
  const startParts = start ? start.split(":") : [];
  const endParts = end ? end.split(":") : [];
  const zeros = new Array(8 - (startParts.length + endParts.length)).fill("0");
  return [...startParts, ...zeros, ...endParts].map(part => Number.parseInt(part || "0", 16));
};

export const getRandomIPv6 = (ip: string): string => {
  if (!isIPv6(ip)) {
    throw new Error("Invalid IPv6 format");
  }

  const [rawAddress, rawMask] = ip.split("/");
  const mask = Number.parseInt(rawMask || "", 10);
  if (Number.isNaN(mask) || mask < 1 || mask > 128) {
    throw new Error("Invalid IPv6 subnet mask");
  }

  const baseAddress = normalizeIP(rawAddress);
  const fullMaskGroups = Math.floor(mask / 16);
  const remainingBits = mask % 16;
  const result = new Array<number>(8).fill(0);

  for (let index = 0; index < 8; index++) {
    if (index < fullMaskGroups) {
      result[index] = baseAddress[index] || 0;
      continue;
    }
    if (index === fullMaskGroups && remainingBits > 0) {
      const groupMask = 0xffff << (16 - remainingBits);
      const randomPart = Math.floor(Math.random() * (1 << (16 - remainingBits)));
      result[index] = ((baseAddress[index] || 0) & groupMask) | randomPart;
      continue;
    }
    result[index] = Math.floor(Math.random() * 0x10000);
  }

  return result.map(value => value.toString(16).padStart(4, "0")).join(":");
};

export const saveDebugFile = (name: string, body: string): string => {
  if (process.env.YTDL_NO_DEBUG_FILE) {
    return body;
  }
  const filename = `${Date.now()}-${name}`;
  const debugPath = process.env.YTDL_DEBUG_PATH || ".";
  writeFileSync(`${debugPath}/${filename}`, body);
  return filename;
};

const findPropKeyInsensitive = (obj: UnknownRecord, prop: string): string | null =>
  Object.keys(obj).find(key => key.toLowerCase() === prop.toLowerCase()) || null;

export const getPropInsensitive = (obj: UnknownRecord, prop: string): unknown => {
  const key = findPropKeyInsensitive(obj, prop);
  return key ? obj[key] : undefined;
};

export const setPropInsensitive = (obj: UnknownRecord, prop: string, value: unknown): string | null => {
  const key = findPropKeyInsensitive(obj, prop);
  obj[key || prop] = value;
  return key;
};

export const applyDefaultAgent = (options: YoutubeRequestConfig): void => {
  const requestOptions = ensureRequestOptions(options);
  if (options.agent) return;

  const { jar } = AGENT.defaultAgent;
  const headers = requestOptions.headers ?? {};
  requestOptions.headers = headers;
  const cookieHeader = getPropInsensitive(headers, "cookie");
  if (jar && typeof cookieHeader === "string") {
    jar.removeAllCookiesSync();
    AGENT.addCookiesFromString(jar, cookieHeader);
  }

  options.agent = AGENT.defaultAgent;
};

export const applyOldLocalAddress = (options: YoutubeRequestConfig): void => {
  const requestOptions = ensureRequestOptions(options);
  if (!requestOptions.localAddress || requestOptions.localAddress === options.agent?.localAddress) {
    return;
  }
  options.agent = AGENT.createAgent([], { localAddress: requestOptions.localAddress });
};

export const applyIPv6Rotations = (options: YoutubeRequestConfig): void => {
  const requestOptions = ensureRequestOptions(options);
  if (typeof options.IPv6Block === "string") {
    requestOptions.localAddress = getRandomIPv6(options.IPv6Block);
  }
};

export const applyDefaultHeaders = (options: YoutubeRequestConfig): void => {
  const requestOptions = ensureRequestOptions(options);
  requestOptions.headers = {
    "Accept-Encoding": "identity",
    ...requestOptions.headers,
  };
};

export const generateClientPlaybackNonce = (length: number): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";
  for (let index = 0; index < length; index++) {
    output += chars[Math.floor(Math.random() * chars.length)] || "";
  }
  return output;
};

export const applyPlayerClients = (options: YoutubeRequestConfig): void => {
  if (!options.playerClients || options.playerClients.length === 0) {
    options.playerClients = ["WEB_EMBEDDED", "IOS", "ANDROID", "TV"];
  }
};
