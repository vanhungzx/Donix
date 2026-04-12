"use strict";
import FormData from "form-data";
import got from "got";
import type { Options } from "got";
import { CookieJar } from "tough-cookie";

import HttpsProxyAgent from "https-proxy-agent";

import fs from "fs";
import http from "http";
import HttpProxyAgent from "http-proxy-agent";
import https from "https";
import path from "path";
import type { Readable as NodeReadable } from "stream";
import zlib from "zlib";
import type { Context, GlobalOptions } from "../../types/request.js";
import { getType } from "./constants.js";
import { getHeaders } from "./headers.js";
import { gateRequest } from "./requestGuard.js";

type JarLike = CookieJar & { cookieString?: () => string };

/** Options từ login + tùy chọn từng request (vd. customHeader) */
type NetworkOptions = GlobalOptions & { customHeader?: Record<string, string> };

export type FormRecord = Record<string, string | number | boolean | null | undefined>;

/** Body POST (có thể có mảng giống client FB) */
export type PostBodyRecord = Record<string, unknown>;

/** got.stream.* yêu cầu isStream (theo typings của got 11). */
type GotStreamOptions = Options & { isStream: true };

type ProxyAgentCtor = new (uri: string, opts?: Record<string, unknown>) => unknown;

interface FormDataFilePart {
  value?: string | Buffer | NodeJS.ReadableStream;
  data?: string | Buffer | NodeJS.ReadableStream;
  filename?: string;
  contentType?: string;
}

type FormDataAppendOptions = { filename?: string; contentType?: string };

interface StreamResponseMeta {
  url?: string;
  requestUrl?: string;
  statusCode?: number;
  statusMessage?: string;
  headers?: Record<string, string | string[] | undefined>;
  httpVersion?: string;
  socket?: { remoteAddress?: string; remotePort?: number };
}

interface RequestMeta {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  params?: unknown;
  data?: unknown;
  responseType?: string;
  timeout?: number;
}

export interface FbGotResponse {
  data: unknown;
  status: number | undefined;
  statusText: string;
  headers: Record<string, string | string[] | undefined>;
  config: Record<string, unknown>;
  request: Record<string, unknown>;
  url: string | undefined;
  body: unknown;
  statusCode: number | undefined;
}

interface AxiosCompatibleError extends Error {
  name: string;
  code?: string;
  config: Record<string, unknown>;
  isAxiosError: boolean;
  response?: FbGotResponse;
  toJSON: () => {
    message: string;
    name: string;
    code?: string | undefined;
    config: Record<string, unknown>;
    status: number | undefined;
  };
}

function errorMessageFromUnknown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function errorCodeFromUnknown(err: unknown): string | undefined {
  if (err !== null && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

function errResponse429(
  err: unknown
): { retryAfter: number; headers?: Record<string, string | string[] | undefined> } | null {
  if (err === null || typeof err !== "object" || !("response" in err)) return null;
  const r = (err as { response?: { statusCode?: number; headers?: Record<string, string | string[] | undefined> } })
    .response;
  if (r?.statusCode !== 429) return null;
  const ra = r.headers?.["retry-after"];
  const retryAfter = parseInt(Array.isArray(ra) ? ra[0] : ra || "0", 10);
  return { retryAfter, headers: r.headers };
}

const defaultJar = new CookieJar();
let proxyAgents: { http?: http.Agent; https?: https.Agent } = {};

const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 32,
  maxFreeSockets: 10,
  timeout: 60000,
  scheduling: "fifo",
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 32,
  maxFreeSockets: 10,
  timeout: 60000,
  scheduling: "fifo",

  // Browser-like TLS cipher suite order (Chrome/Edge)
  ciphers: [
    'TLS_AES_128_GCM_SHA256',
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305',
    'ECDHE-ECDSA-AES128-SHA',
    'ECDHE-RSA-AES128-SHA',
    'ECDHE-ECDSA-AES256-SHA',
    'ECDHE-RSA-AES256-SHA',
    'AES128-GCM-SHA256',
    'AES256-GCM-SHA384',
    'AES128-SHA',
    'AES256-SHA'
  ].join(':'),
  honorCipherOrder: true,
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.3',
  // Additional browser-like options
  rejectUnauthorized: true,
});

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Giãn cách + jitter: đủ để không dồn burst kiểu bot, vẫn cho nhiều nhóm qua nhanh.
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 130;
const MAX_REQUEST_INTERVAL = 480;
const MIN_GRAPHQL_INTERVAL = 300;
const MAX_GRAPHQL_INTERVAL = 1050;

async function throttleRequest(isGraphQL = false): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  const minInterval = isGraphQL ? MIN_GRAPHQL_INTERVAL : MIN_REQUEST_INTERVAL;
  const maxInterval = isGraphQL ? MAX_GRAPHQL_INTERVAL : MAX_REQUEST_INTERVAL;

  if (timeSinceLastRequest < minInterval) {
    const span = Math.max(1, maxInterval - minInterval);
    const randomDelay =
      minInterval + Math.floor(Math.random() * span) - timeSinceLastRequest;
    if (randomDelay > 0) {
      await delay(randomDelay);
    }
  }

  if (Math.random() < 0.025) {
    await delay(80 + Math.floor(Math.random() * 520));
  }

  lastRequestTime = Date.now();
}

function decompressBuffer(buffer: Buffer, encoding?: string): Buffer {
  if (!buffer || buffer.length === 0) return buffer;

  if (!encoding) return buffer;

  const enc = encoding.toLowerCase().trim();

  try {
    if (enc === 'gzip' || enc === 'x-gzip') {
      return zlib.gunzipSync(buffer) as Buffer;
    } else if (enc === 'deflate') {
      return zlib.inflateSync(buffer) as Buffer;
    } else if (enc === 'br') {
      return zlib.brotliDecompressSync(buffer) as Buffer;
    } else if (enc === 'zstd' || enc === 'zstd-compressed') {

      return buffer;
    }
  } catch (err) {

    return buffer;
  }

  return buffer;
}

function setProxy(proxyUrl?: string): void {
  if (!proxyUrl) {
    proxyAgents = {};
    return;
  }
  try {
    const u = new URL(proxyUrl);
    const HttpCtor = HttpProxyAgent as unknown as ProxyAgentCtor;
    const HttpsCtor = HttpsProxyAgent as unknown as ProxyAgentCtor;
    const agentOpts = {
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 32,
      maxFreeSockets: 10,
    };
    proxyAgents = {
      http: new HttpCtor(u.toString(), agentOpts) as http.Agent,
      https: new HttpsCtor(u.toString(), agentOpts) as https.Agent,
    };
  } catch {
    proxyAgents = {};
  }
}

function baseConfig(
  extra: Partial<GotStreamOptions> = {} as Partial<GotStreamOptions>,
  jar?: JarLike
): GotStreamOptions {
  const agent = proxyAgents.http || proxyAgents.https
    ? { http: proxyAgents.http, https: proxyAgents.https }
    : { http: httpAgent, https: httpsAgent };

  const defaultTimeout = 120000;
  const timeout = extra.timeout ?? { request: defaultTimeout };

  return {
    cookieJar: jar || defaultJar,
    throwHttpErrors: false,
    followRedirect: true,
    maxRedirects: 20,
    http2: true,
    timeout: typeof timeout === "number" ? { request: timeout } : timeout,
    decompress: true,
    agent,
    retry: {
      limit: 0,
    },

    dnsCache: true,
    lookup: undefined,
    ...extra,
    isStream: true,
  } as GotStreamOptions;
}

function buildAxiosConfig(meta?: RequestMeta): Record<string, unknown> {
  const u = safeURL(meta?.url);
  return {
    url: meta?.url,
    method: meta?.method,
    headers: meta?.headers || {},
    params: meta?.params,
    data: meta?.data,
    timeout: meta?.timeout || 120000,
    responseType: meta?.responseType || "text",
    baseURL: u ? `${u.protocol}//${u.host}` : undefined,
    transformRequest: [],
    transformResponse: [],
    transitional: {},
    adapter: "got",
  };
}

function safeURL(u?: string): URL | null {
  try {
    return new URL(u || "");
  } catch {
    return null;
  }
}

function buildAxiosRequestShape(
  finalUrl: string,
  resMeta?: StreamResponseMeta | null,
  meta?: RequestMeta
): Record<string, unknown> {
  const u = safeURL(finalUrl) || safeURL(meta?.url);
  const reqRes = {
    responseUrl: finalUrl,
    statusCode: resMeta?.statusCode,
    statusMessage: resMeta?.statusMessage || "",
    headers: resMeta?.headers || {},
    httpVersion: resMeta?.httpVersion,
    socket: resMeta?.socket
      ? {
        remoteAddress: resMeta.socket.remoteAddress,
        remotePort: resMeta.socket.remotePort,
      }
      : undefined,
  };
  return {
    res: reqRes,
    method: (meta?.method || "GET").toUpperCase(),
    protocol: u ? u.protocol : undefined,
    host: u ? u.host : undefined,
    hostname: u ? u.hostname : undefined,
    port: u ? u.port : undefined,
    path: u ? `${u.pathname}${u.search}` : undefined,
  };
}

function normalizeFromStream(
  resMeta: StreamResponseMeta | null,
  raw: Buffer[] | null,
  meta?: RequestMeta,
  asBuffer = false
): FbGotResponse {
  let buf = raw && raw.length > 0 ? Buffer.concat(raw) : Buffer.alloc(0);

  if (raw && raw.length > 0) {
    raw.length = 0;
  }

  const rawEnc = resMeta?.headers?.["content-encoding"] ?? resMeta?.headers?.["Content-Encoding"];
  const contentEncoding = Array.isArray(rawEnc) ? rawEnc[0] : rawEnc;

  if (contentEncoding && buf.length > 0) {
    try {

      const isGzip = buf[0] === 0x1f && buf[1] === 0x8b;
      const isDeflate = (buf[0] === 0x78 && (buf[1] === 0x01 || buf[1] === 0x5e || buf[1] === 0x9c || buf[1] === 0xda));
      const isBrotli = buf[0] === 0xce && buf[1] === 0xb2 && buf[2] === 0xcf && buf[3] === 0x81;

      const needsDecompress =
        (contentEncoding.includes('gzip') && isGzip) ||
        (contentEncoding.includes('deflate') && isDeflate) ||
        (contentEncoding.includes('br') && isBrotli);

      if (needsDecompress) {
        const decompressed = decompressBuffer(buf, contentEncoding);
        if (decompressed && decompressed.length > 0 && decompressed !== buf) {

          buf = Buffer.from(decompressed);
        }
      }
    } catch (err) {

    }
  }

  let data = asBuffer ? buf : buf.toString("utf8");

  if (asBuffer) {

  } else if (typeof data === "string" && data.length > 0) {
    const ct =
      resMeta?.headers &&
      (resMeta.headers["content-type"] || resMeta.headers["Content-Type"]);

    if (ct && (ct.includes("application/json") || ct.includes("text/json"))) {

      const trimmed = data.trim();
      const firstChar = trimmed.length > 0 ? trimmed[0] : "";

      if (firstChar === "{" || firstChar === "[") {
        try {
          data = JSON.parse(trimmed);
        } catch (parseErr: unknown) {
          if (process.env.DEBUG_JSON_PARSE) {
            const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
            console.warn(`JSON parse failed: ${msg}, first 100 chars: ${trimmed.substring(0, 100)}`);
          }
        }
      } else {

        if (process.env.DEBUG_JSON_PARSE) {
          console.warn(`Expected JSON but got data starting with "${firstChar}", first 100 chars: ${trimmed.substring(0, 100)}`);
        }
      }
    }
  }
  const finalUrl = resMeta?.url || resMeta?.requestUrl || meta?.url || "";
  const config = buildAxiosConfig(meta);
  const request = buildAxiosRequestShape(finalUrl, resMeta, meta);
  return {
    data,
    status: resMeta?.statusCode,
    statusText: resMeta?.statusMessage || "",
    headers: resMeta?.headers || {},
    config,
    request,
    url: finalUrl,
    body: data,
    statusCode: resMeta?.statusCode,
  };
}

function wrapAxiosError(
  err: unknown,
  meta?: RequestMeta,
  resMeta?: StreamResponseMeta | null,
  raw?: Buffer[],
  asBuffer = false
): Error {
  const ax = new Error(errorMessageFromUnknown(err)) as AxiosCompatibleError;
  ax.name = "AxiosError";
  ax.code = errorCodeFromUnknown(err);
  ax.config = buildAxiosConfig(meta);
  ax.isAxiosError = true;
  if (resMeta) ax.response = normalizeFromStream(resMeta, raw || [], meta, asBuffer);
  ax.toJSON = () => ({
    message: ax.message,
    name: ax.name,
    code: ax.code,
    config: ax.config,
    status: ax.response?.status,
  });
  return ax;
}

function openGotStream(method: string, url: string, cfg: GotStreamOptions): NodeReadable {
  const m = method.toUpperCase();
  if (m === "GET") return got.stream.get(url, cfg);
  if (m === "POST") return got.stream.post(url, cfg);
  if (m === "PUT") return got.stream.put(url, cfg);
  if (m === "DELETE") return got.stream.delete(url, cfg);
  if (m === "HEAD") return got.stream.head(url, cfg);
  throw new Error(`Unsupported stream method: ${method}`);
}

function streamRequest(
  method: string,
  url: string,
  cfg: GotStreamOptions,
  meta?: RequestMeta,
  asBuffer = false
): Promise<FbGotResponse> {
  return new Promise((resolve, reject) => {
    const s = openGotStream(method, url, cfg);
    let resMeta: StreamResponseMeta | null = null;
    const chunks: Buffer[] = [];
    const MAX_BYTES = 50 * 1024 * 1024;
    let totalSize = 0;

    s.on("response", (res: StreamResponseMeta) => {
      resMeta = res;

      const contentLength = Number(res.headers?.["content-length"] || 0);
      if (contentLength > 0 && contentLength > MAX_BYTES) {
        s.destroy();
        return reject(
          wrapAxiosError(
            new Error(`Response too large: ${contentLength} bytes`),
            meta,
            resMeta,
            [],
            asBuffer
          )
        );
      }
    });

    s.on("data", (c: Buffer | string) => {

      const chunk = Buffer.isBuffer(c) ? c : Buffer.from(c, typeof c === 'string' ? 'utf8' : undefined);
      totalSize += chunk.length;
      if (totalSize > MAX_BYTES) {
        s.destroy();
        return reject(
          wrapAxiosError(
            new Error(`Response too large: ${totalSize} bytes`),
            meta,
            resMeta,
            chunks,
            asBuffer
          )
        );
      }
      chunks.push(chunk);
    });

    s.on("error", (e: unknown) => reject(wrapAxiosError(e, meta, resMeta, chunks, asBuffer)));
    s.on("end", () => resolve(normalizeFromStream(resMeta, chunks, meta, asBuffer)));
  });
}

async function requestWithRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await fn();
      const res = result as { statusCode?: number; headers?: Record<string, string | string[] | undefined> };
      // Handle 429 rate limit errors with exponential backoff
      if (res?.statusCode === 429) {
        const ra = res.headers?.["retry-after"];
        const retryAfter =
          parseInt(Array.isArray(ra) ? ra[0] : ra || "0", 10) || Math.min(16000, 1000 * Math.pow(2, i));
        if (i < retries) {
          await delay(retryAfter);
          continue;
        }
      }
      return result;
    } catch (err: unknown) {
      const r429 = errResponse429(err);
      if (r429 && i < retries) {
        const retryAfter =
          r429.retryAfter || Math.min(16000, 1000 * Math.pow(2, i));
        await delay(retryAfter);
        continue;
      }
      if (i === retries) throw err;
      await delay(Math.min(16000, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error("Request failed");
}

function cleanGet(url: string, jar?: JarLike): Promise<FbGotResponse> {
  const meta = { url, method: "GET" };
  const cfg = baseConfig({}, jar);
  const fn = async () => streamRequest("GET", url, cfg, meta, false);
  return requestWithRetry(fn);
}

function get(
  url: string,
  reqJar: JarLike,
  qs?: FormRecord | null,
  options?: NetworkOptions | null,
  ctx?: Context | null,
  customHeader?: Record<string, string>
): Promise<FbGotResponse> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  const fn = async () =>
    gateRequest(ctx ?? undefined, url, "get", async () => {
      await throttleRequest(isGraphQL);
      const headers = getHeaders(url, options ?? undefined, ctx ?? undefined, customHeader, "GET") || {};
      const extra: Partial<GotStreamOptions> = { headers };
      if (qs !== undefined && qs !== null) extra.searchParams = qs;
      const cfg = baseConfig(extra, reqJar);
      const meta: RequestMeta = { url, method: "GET", headers, params: qs };
      return streamRequest("GET", url, cfg, meta, false);
    }, options ?? undefined);
  return requestWithRetry(fn);
}

function post(
  url: string,
  reqJar: JarLike,
  form: PostBodyRecord = {},
  options?: NetworkOptions | null,
  ctx?: Context | null,
  customHeader?: Record<string, string>
): Promise<FbGotResponse> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  const fn = async () =>
    gateRequest(ctx ?? undefined, url, "post", async () => {
      await throttleRequest(isGraphQL);
      const headers = getHeaders(url, options ?? undefined, ctx ?? undefined, customHeader, "POST") || {};
      const lsdField = form.lsd;
      if (
        isGraphQL &&
        typeof lsdField === "string" &&
        lsdField &&
        !headers["x-fb-lsd"] &&
        !headers["X-Fb-Lsd"]
      ) {
        headers["x-fb-lsd"] = lsdField;
      }
    let contentType =
      headers["Content-Type"] || headers["content-type"] || "application/x-www-form-urlencoded";
    let body: string | null;

    if (/json/i.test(contentType)) {
      contentType = "application/json";
      body = form == null ? null : JSON.stringify(form);
    } else {
      const sp = new URLSearchParams();
      for (const k in form || {}) {
        if (!Object.prototype.hasOwnProperty.call(form, k)) continue;
        const v = form[k];
        if (Array.isArray(v)) {
          for (const it of v)
            sp.append(k, getType(it) === "Object" ? JSON.stringify(it) : String(it));
        } else {
          sp.append(k, getType(v) === "Object" ? JSON.stringify(v) : String(v));
        }
      }
      body = sp.toString();
      contentType = "application/x-www-form-urlencoded";
    }

    headers["Content-Type"] = contentType;
    const cfg = baseConfig(
      { method: "POST", headers, body: body === null ? undefined : body },
      reqJar
    );
    const meta: RequestMeta = { url, method: "POST", headers, data: form };
    return streamRequest("POST", url, cfg, meta, false);
    }, options ?? undefined);
  return requestWithRetry(fn);
}

function postJSON(
  url: string,
  reqJar: JarLike,
  jsonBody: unknown,
  options?: NetworkOptions | null,
  ctx?: Context | null,
  customHeader?: Record<string, string>
): Promise<FbGotResponse> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  const fn = async () =>
    gateRequest(ctx ?? undefined, url, "postJSON", async () => {
      await throttleRequest(isGraphQL);
      const headers = getHeaders(url, options ?? undefined, ctx ?? undefined, customHeader, "POST") || {};
      headers["Content-Type"] = "application/json";
      const body = jsonBody == null ? undefined : JSON.stringify(jsonBody);
      const cfg = baseConfig({ method: "POST", headers, body }, reqJar);
      const meta: RequestMeta = { url, method: "POST", headers, data: jsonBody };
      return streamRequest("POST", url, cfg, meta, false);
    }, options ?? undefined);
  return requestWithRetry(fn);
}

function isFormDataFilePart(v: unknown): v is FormDataFilePart {
  return typeof v === "object" && v !== null && ("value" in v || "data" in v);
}

function postFormData(
  url: string,
  reqJar: JarLike,
  form: Record<string, unknown> = {},
  qs?: FormRecord | null,
  options?: NetworkOptions | null,
  ctx?: Context | null
): Promise<FbGotResponse> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  const fn = async () =>
    gateRequest(ctx ?? undefined, url, "postFormData", async () => {
      await throttleRequest(isGraphQL);
    const fd = new FormData();
    for (const key in form || {}) {
      if (!Object.prototype.hasOwnProperty.call(form, key)) continue;
      const val = form[key];
      if (Array.isArray(val)) {
        for (const it of val) {

          if (isFormDataFilePart(it)) {
            const fileData = it.value !== undefined ? it.value : it.data;
            const fileOptions: FormDataAppendOptions = {};
            if (it.filename) fileOptions.filename = it.filename;
            if (it.contentType) fileOptions.contentType = it.contentType;
            fd.append(
              key,
              fileData as string | Buffer,
              Object.keys(fileOptions).length > 0 ? fileOptions : undefined
            );
          } else {
            fd.append(key, it as string | Buffer);
          }
        }
      } else {

        if (isFormDataFilePart(val)) {
          const fileData = val.value !== undefined ? val.value : val.data;
          const fileOptions: FormDataAppendOptions = {};
          if (val.filename) fileOptions.filename = val.filename;
          if (val.contentType) fileOptions.contentType = val.contentType;
          fd.append(
            key,
            fileData as string | Buffer,
            Object.keys(fileOptions).length > 0 ? fileOptions : undefined
          );
        } else {
          fd.append(key, val as string | Buffer);
        }
      }
    }

    const fdHeaders = fd.getHeaders();
    const customHeader = options?.customHeader;
    const fdAsStrings: Record<string, string> = Object.fromEntries(
      Object.entries(fdHeaders).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v ?? "")])
    );
    const mergedHeaders: Record<string, string> = {
      ...(getHeaders(url, options ?? undefined, ctx ?? undefined, fdAsStrings, "POST") || {}),
      ...fdAsStrings,
      ...(customHeader || {}),
    };

    const extra: Partial<GotStreamOptions> = { method: "POST", headers: mergedHeaders, body: fd };
    if (qs !== undefined && qs !== null) extra.searchParams = qs;
    const cfg = baseConfig(extra, reqJar);
    const meta: RequestMeta = { url, method: "POST", headers: mergedHeaders, params: qs, data: form };
    return streamRequest("POST", url, cfg, meta, false);
    }, options ?? undefined);
  return requestWithRetry(fn);
}

function head(
  url: string,
  reqJar: JarLike,
  qs?: FormRecord | null,
  options?: NetworkOptions | null,
  ctx?: Context | null,
  customHeader?: Record<string, string>
): Promise<FbGotResponse> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  const fn = async () =>
    gateRequest(ctx ?? undefined, url, "head", async () => {
      await throttleRequest(isGraphQL);
      const headers = getHeaders(url, options ?? undefined, ctx ?? undefined, customHeader, "HEAD") || {};
      const extra: Partial<GotStreamOptions> = { method: "HEAD", headers };
      if (qs !== undefined && qs !== null) extra.searchParams = qs;
      const cfg = baseConfig(extra, reqJar);
      const meta: RequestMeta = { url, method: "HEAD", headers, params: qs };
      return new Promise<FbGotResponse>((resolve, reject) => {
        const s = got.stream.head(url, cfg);
        let resMeta: StreamResponseMeta | null = null;
        s.on("response", (res: StreamResponseMeta) => (resMeta = res));
        s.on("error", (e: unknown) => reject(wrapAxiosError(e, meta, resMeta)));
        s.on("end", () => resolve(normalizeFromStream(resMeta, [], meta, false)));
      });
    }, options ?? undefined);
  return requestWithRetry(fn);
}

function put(
  url: string,
  reqJar: JarLike,
  bodyData: unknown,
  options?: NetworkOptions | null,
  ctx?: Context | null,
  customHeader?: Record<string, string>
): Promise<FbGotResponse> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  const fn = async () =>
    gateRequest(ctx ?? undefined, url, "put", async () => {
      await throttleRequest(isGraphQL);
      const headers = getHeaders(url, options ?? undefined, ctx ?? undefined, customHeader, "PUT") || {};
      let body: unknown = bodyData;
      if (getType(bodyData) === "Object") {
        headers["Content-Type"] =
          headers["Content-Type"] || headers["content-type"] || "application/json";
        if (/json/i.test(headers["Content-Type"])) {
          body = JSON.stringify(bodyData) as string;
        }
      }
      const cfg = baseConfig(
        { method: "PUT", headers, body: body as string | Buffer | NodeReadable },
        reqJar
      );
      const meta: RequestMeta = { url, method: "PUT", headers, data: bodyData };
      return streamRequest("PUT", url, cfg, meta, false);
    }, options ?? undefined);
  return requestWithRetry(fn);
}

function del(
  url: string,
  reqJar: JarLike,
  qs?: FormRecord | null,
  options?: NetworkOptions | null,
  ctx?: Context | null,
  customHeader?: Record<string, string>
): Promise<FbGotResponse> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  const fn = async () =>
    gateRequest(ctx ?? undefined, url, "delete", async () => {
      await throttleRequest(isGraphQL);
      const headers = getHeaders(url, options ?? undefined, ctx ?? undefined, customHeader, "DELETE") || {};
      const extra: Partial<GotStreamOptions> = { method: "DELETE", headers };
      if (qs !== undefined && qs !== null) extra.searchParams = qs;
      const cfg = baseConfig(extra, reqJar);
      const meta: RequestMeta = { url, method: "DELETE", headers, params: qs };
      return streamRequest("DELETE", url, cfg, meta, false);
    }, options ?? undefined);
  return requestWithRetry(fn);
}

function getBuffer(
  url: string,
  reqJar: JarLike,
  qs?: FormRecord | null,
  options?: NetworkOptions | null,
  ctx?: Context | null,
  customHeader?: Record<string, string>
): Promise<FbGotResponse> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  const fn = async () =>
    gateRequest(ctx ?? undefined, url, "getBuffer", async () => {
      await throttleRequest(isGraphQL);
      const headers = getHeaders(url, options ?? undefined, ctx ?? undefined, customHeader, "GET") || {};
      const extra: Partial<GotStreamOptions> = { headers };
      if (qs !== undefined && qs !== null) extra.searchParams = qs;
      const cfg = baseConfig(extra, reqJar);
      const meta: RequestMeta = { url, method: "GET", headers, params: qs, responseType: "arraybuffer" };
      return streamRequest("GET", url, cfg, meta, true);
    }, options ?? undefined);
  return requestWithRetry(fn);
}

function download(
  url: string,
  filePath: string,
  reqJar: JarLike,
  qs?: FormRecord | null,
  options?: NetworkOptions | null,
  ctx?: Context | null,
  customHeader?: Record<string, string>
): Promise<FbGotResponse> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  return requestWithRetry(
    async () =>
      gateRequest(ctx ?? undefined, url, "download", async () => {
        await throttleRequest(isGraphQL);
        const headers = getHeaders(url, options ?? undefined, ctx ?? undefined, customHeader, "GET") || {};
        const extra: Partial<GotStreamOptions> = { headers };
        if (qs !== undefined && qs !== null) extra.searchParams = qs;
        const cfg = baseConfig(extra, reqJar);
        const meta: RequestMeta = { url, method: "GET", headers, params: qs };

        return new Promise<FbGotResponse>((resolve, reject) => {
          const dest = path.resolve(filePath);
          const ws = fs.createWriteStream(dest);
          const stream = got.stream.get(url, cfg as GotStreamOptions);
          let resMeta: StreamResponseMeta | null = null;

          stream.on("response", (res: StreamResponseMeta) => (resMeta = res));
          stream.on("error", (e: unknown) => {
            ws.destroy();
            reject(wrapAxiosError(e, meta, resMeta));
          });
          ws.on("error", (e: unknown) => reject(wrapAxiosError(e, meta, resMeta)));
          ws.on("finish", () => resolve(normalizeFromStream(resMeta, [], meta, false)));
          stream.pipe(ws);
        });
      }, options ?? undefined)
  );
}

const createJar = (): JarLike => {
  const jar = new CookieJar() as JarLike;
  const boundGetCookieStringSync = (jar as CookieJar).getCookieStringSync?.bind(jar);
  jar.cookieString = boundGetCookieStringSync
    ? () => boundGetCookieStringSync("https://business.facebook.com")
    : () => "";
  return jar;
};

const network = {
  cleanGet,
  get,
  post,
  postJSON,
  postFormData,
  head,
  put,
  del,
  getBuffer,
  download,
  getJar: () => createJar(),
  setProxy,
};

export default network;
export { cleanGet, del, download, get, getBuffer, head, post, postFormData, postJSON, put, setProxy };
