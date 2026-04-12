import got from "got";
import type { ReadStream } from "node:fs";
import { createReadStream, createWriteStream, promises as fsPromises } from "node:fs";
import { join } from "node:path";

type JSONBType = {
  parse: (data: string) => unknown;
  stringify: (data: unknown) => string;
};

let JSONB: JSONBType | null = null;
let JSONBLoading: Promise<JSONBType> | null = null;

const getJSONB = async (): Promise<JSONBType> => {
  if (JSONB) return JSONB;
  if (JSONBLoading) return JSONBLoading;
  JSONBLoading = import("json-bigint").then((m): JSONBType => {
    const j = m.default as unknown as JSONBType;
    JSONB = j;
    JSONBLoading = null;
    return j;
  });
  return JSONBLoading;
};

getJSONB().catch(() => {

});

type Nullable<T> = T | null | undefined;

export interface CookieParseOptions {
  decode?: (value: string) => string;
}

export type CookieSameSite = true | "strict" | "lax" | "none";
export type CookiePriority = "low" | "medium" | "high";

export interface CookieSerializeOptions {
  encode?: (value: string) => string;
  maxAge?: number;
  domain?: string;
  path?: string;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  partitioned?: boolean;
  priority?: CookiePriority;
  sameSite?: CookieSameSite;
}

const COOKIE_NAME_REG_EXP = /^[\u0021-\u003A\u003C\u003E-\u007E]+$/;
const COOKIE_VALUE_REG_EXP = /^[\u0021-\u003A\u003C-\u007E]*$/;
const DOMAIN_VALUE_REG_EXP =
  /^([.]?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const PATH_VALUE_REG_EXP = /^[\u0020-\u003A\u003D-\u007E]*$/;
const OBJECT_TO_STRING = Object.prototype.toString;

const MAX_BYTES = 100 * 1024 * 1024;

export async function downloadMedia(url: string): Promise<string> {
  const tempDir = join(process.cwd(), "temp");
  const tempPath = join(tempDir, `${Date.now()}${Math.random().toString().slice(2)}.jpg`);
  const responseStream = got.stream(url);
  const writeStream = createWriteStream(tempPath);
  await responseStream.pipe(writeStream);
  return tempPath;
}

export async function stream(url: string, type: string): Promise<ReadStream> {
  const tempDir = join(process.cwd(), "temp");

  try {
    await fsPromises.access(tempDir);
  } catch {
    await fsPromises.mkdir(tempDir, { recursive: true });
  }

  const tempPath = join(tempDir, `${Date.now()}${Math.random().toString().slice(2)}.${type}`);

  const responseStream = got.stream(url, {
    timeout: {
      request: 30_000,
    },
    retry: {
      limit: 0,
    },
  });

  await new Promise<void>((resolve, reject) => {
    const writeStream = createWriteStream(tempPath);
    let settled = false;
    let headersChecked = false;

    const fail = async (error: unknown) => {
      if (settled) return;
      settled = true;

      try {
        writeStream.destroy();
      } catch {

      }

      try {
        responseStream.destroy();
      } catch {

      }

      try {
        await fsPromises.unlink(tempPath).catch(() => { });
      } catch {

      }

      reject(error instanceof Error ? error : new Error(String(error)));
    };

    responseStream.on("response", (response: { headers: Record<string, string | string[] | undefined> }) => {
      if (headersChecked) return;
      headersChecked = true;

      const contentLength = response.headers["content-length"];
      const len = contentLength ? Number(contentLength) : 0;
      if (len > 0 && len > MAX_BYTES) {
        void fail(new Error(`File too large: ${len} bytes`));
        return;
      }
    });

    responseStream.on("error", (error: unknown) => {
      void fail(error);
    });

    writeStream.on("error", (error: unknown) => {
      void fail(error);
    });

    writeStream.on("finish", () => {
      if (settled) return;
      settled = true;
      resolve();
    });

    responseStream.pipe(writeStream);
  });

  const readStream = createReadStream(tempPath);

  const timeout = setTimeout(async () => {
    try {
      await fsPromises.unlink(tempPath).catch(() => { });
    } catch {

    }
  }, 60_000);
  timeout.unref?.();

  return readStream;
}

export function getGUID(): string {
  let sectionLength = Date.now();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const r = Math.floor((sectionLength + Math.random() * 16) % 16);
    sectionLength = Math.floor(sectionLength / 16);
    const guidChar = (char === "x" ? r : (r & 7) | 8).toString(16);
    return guidChar;
  });
}

export function getType(obj: unknown): string {
  const constructorName = (obj as Record<string, unknown>)?.constructor?.name;
  const genericName = Object.prototype.toString.call(obj).slice(8, -1);
  if (constructorName?.toLowerCase() === genericName.toLowerCase()) {
    return constructorName;
  }
  if (!constructorName || constructorName.toLowerCase() === "object") {
    return genericName;
  }
  return constructorName;
}

export function makeParsable(data: string): string {
  const withoutForLoop = data.replace(/for\s*\(\s*;\s*;\s*\)\s*;\s*/, "");
  const maybeMultipleObjects = withoutForLoop.split(/\}\s*\{/);
  if (maybeMultipleObjects.length === 1) {
    return maybeMultipleObjects[0]!;
  }
  return `[${maybeMultipleObjects.join("},{")}]`;
}

export function parseGraphql<T = unknown>(data: unknown): T | unknown {
  if (typeof data !== "string") return data;
  try {
    const result = JSON.parse(makeParsable(data)) as T;
    const type = getType(result);
    return type === "Object" || type === "Array" ? result : data;
  } catch {
    return data;
  }
}

export function parseFromJSONB<T = unknown>(data: string): T {
  const j = JSONB;
  if (!j) {
    try {
      return JSON.parse(data) as T;
    } catch {
      throw new Error("JSONB not loaded yet, please use parseFromJSONBAsync");
    }
  }
  return j.parse(data) as T;
}

export async function parseFromJSONBAsync<T = unknown>(data: string): Promise<T> {
  const jsonb = await getJSONB();
  if (!jsonb) {
    throw new Error("JSONB failed to load");
  }
  return jsonb.parse(data) as T;
}

export function parseCookie(str: string, options?: CookieParseOptions): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  const len = str.length;
  if (len < 2) return result;

  const decoder = options?.decode ?? decode;
  let index = 0;

  while (index < len) {
    const eqIdx = str.indexOf("=", index);
    if (eqIdx === -1) break;

    const colonIdx = str.indexOf(";", index);
    const endIdx = colonIdx === -1 ? len : colonIdx;

    if (eqIdx > endIdx) {
      index = str.lastIndexOf(";", eqIdx - 1) + 1;
      continue;
    }

    const keyStartIdx = startIndex(str, index, eqIdx);
    const keyEndIdx = endIndex(str, eqIdx, keyStartIdx);
    const key = str.slice(keyStartIdx, keyEndIdx);

    if (result[key] === undefined) {
      const valueStartIdx = startIndex(str, eqIdx + 1, endIdx);
      const valueEndIdx = endIndex(str, endIdx, valueStartIdx);
      const value = decoder(str.slice(valueStartIdx, valueEndIdx));
      result[key] = value;
    }

    index = endIdx + 1;
  }

  return result;
}

export function serializeCookie(
  name: string,
  val: string,
  options?: CookieSerializeOptions
): string {
  const encoder = options?.encode ?? encodeURIComponent;

  if (!COOKIE_NAME_REG_EXP.test(name)) {
    throw new TypeError(`argument name is invalid: ${name}`);
  }

  const value = encoder(val);

  if (!COOKIE_VALUE_REG_EXP.test(value)) {
    throw new TypeError(`argument val is invalid: ${val}`);
  }

  let str = `${name}=${value}`;

  if (!options) return str;

  if (options.maxAge !== undefined) {
    if (!Number.isInteger(options.maxAge)) {
      throw new TypeError(`option maxAge is invalid: ${options.maxAge}`);
    }
    str += `; Max-Age=${options.maxAge}`;
  }

  if (options.domain) {
    if (!DOMAIN_VALUE_REG_EXP.test(options.domain)) {
      throw new TypeError(`option domain is invalid: ${options.domain}`);
    }
    str += `; Domain=${options.domain}`;
  }

  if (options.path) {
    if (!PATH_VALUE_REG_EXP.test(options.path)) {
      throw new TypeError(`option path is invalid: ${options.path}`);
    }
    str += `; Path=${options.path}`;
  }

  if (options.expires) {
    if (!isDate(options.expires) || !Number.isFinite(options.expires.valueOf())) {
      throw new TypeError(`option expires is invalid: ${options.expires}`);
    }
    str += `; Expires=${options.expires.toUTCString()}`;
  }

  if (options.httpOnly) {
    str += "; HttpOnly";
  }

  if (options.secure) {
    str += "; Secure";
  }

  if (options.partitioned) {
    str += "; Partitioned";
  }

  if (options.priority) {
    const priority = options.priority.toLowerCase() as CookiePriority;
    switch (priority) {
      case "low":
        str += "; Priority=Low";
        break;
      case "medium":
        str += "; Priority=Medium";
        break;
      case "high":
        str += "; Priority=High";
        break;
      default:
        throw new TypeError(`option priority is invalid: ${options.priority}`);
    }
  }

  if (options.sameSite) {
    const sameSite = typeof options.sameSite === "string" ? options.sameSite.toLowerCase() : options.sameSite;
    switch (sameSite) {
      case true:
      case "strict":
        str += "; SameSite=Strict";
        break;
      case "lax":
        str += "; SameSite=Lax";
        break;
      case "none":
        str += "; SameSite=None";
        break;
      default:
        throw new TypeError(`option sameSite is invalid: ${options.sameSite}`);
    }
  }

  return str;
}

function decode(str: string): string {
  if (!str.includes("%")) return str;
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

function isDate(value: Nullable<unknown>): value is Date {
  return OBJECT_TO_STRING.call(value) === "[object Date]";
}

function startIndex(str: string, index: number, max: number): number {
  while (index < max) {
    const code = str.charCodeAt(index);
    if (code !== 0x20 && code !== 0x09) {
      return index;
    }
    index += 1;
  }
  return max;
}

function endIndex(str: string, index: number, min: number): number {
  while (index > min) {
    const code = str.charCodeAt(index - 1);
    if (code !== 0x20 && code !== 0x09) {
      return index;
    }
    index -= 1;
  }
  return min;
}

export const cookie = {
  parse: parseCookie,
  serialize: serializeCookie,
};

export function isUploaderAvailable(
  uploader?: unknown,
  ruploader?: unknown
): boolean {
  const hasUploader = Boolean(uploader && typeof uploader === "function");
  const hasRuploader = Boolean(ruploader && typeof ruploader === "function");
  return hasUploader || hasRuploader;
}

export function getAvailableUploader(
  uploader?: unknown,
  ruploader?: unknown
): ((...args: unknown[]) => Promise<unknown>) | null {
  if (uploader && typeof uploader === "function") {
    return uploader as (...args: unknown[]) => Promise<unknown>;
  }
  if (ruploader && typeof ruploader === "function") {
    return ruploader as (...args: unknown[]) => Promise<unknown>;
  }
  return null;
}

export function createUploaderError(context?: string): Error {
  const baseMessage = "uploadFb/rupload not available";
  const message = context
    ? `${baseMessage} (${context})`
    : baseMessage;
  return new Error(message);
}

export function requireUploader(
  uploader?: unknown,
  ruploader?: unknown,
  context?: string
): void {
  if (!isUploaderAvailable(uploader, ruploader)) {
    throw createUploaderError(context);
  }
}

export * from "./lodash-helpers";
export { default as log } from "./log";
export * from "./permission";
export * from "./retry";

export { default as media } from "../services/media";
