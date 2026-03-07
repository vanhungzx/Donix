"use strict";
import FormData from "form-data";
import got from "got";
import { CookieJar } from "tough-cookie";

import HttpsProxyAgent from "https-proxy-agent";

import fs from "fs";
import http from "http";
import HttpProxyAgent from "http-proxy-agent";
import https from "https";
import path from "path";
import zlib from "zlib";
import { getType } from "./constants.js";
import { getHeaders } from "./headers.js";

type JarLike = CookieJar & { cookieString?: () => string };

const defaultJar = new CookieJar();
let proxyAgents: { http?: any; https?: any } = {};

const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  scheduling: 'fifo' as any,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  scheduling: 'fifo' as any,

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

// Request throttling to mimic human behavior and avoid 429 errors
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 50; // Minimum 50ms between requests
const MAX_REQUEST_INTERVAL = 200; // Maximum 200ms between requests for GraphQL

async function throttleRequest(isGraphQL = false): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  const minInterval = isGraphQL ? MAX_REQUEST_INTERVAL : MIN_REQUEST_INTERVAL;
  const maxInterval = isGraphQL ? MAX_REQUEST_INTERVAL * 2 : MAX_REQUEST_INTERVAL;

  if (timeSinceLastRequest < minInterval) {
    // Add random delay to mimic human behavior
    const randomDelay = Math.floor(Math.random() * (maxInterval - minInterval)) + minInterval - timeSinceLastRequest;
    await delay(randomDelay);
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
    const HttpAgent = HttpProxyAgent as any;
    const HttpsAgent = HttpsProxyAgent as any;

    proxyAgents = {
      http: new HttpAgent(u.toString(), {
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
      }),
      https: new HttpsAgent(u.toString(), {
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
      }),
    };
  } catch {
    proxyAgents = {};
  }
}

function baseConfig(extra: any = {}, jar?: JarLike): any {

  const agent = proxyAgents.http || proxyAgents.https
    ? { http: proxyAgents.http, https: proxyAgents.https }
    : { http: httpAgent, https: httpsAgent };

  const defaultTimeout = 120000;
  const timeout = extra.timeout || { request: defaultTimeout };

  return {
    cookieJar: jar || defaultJar,
    throwHttpErrors: false,
    followRedirect: true,
    maxRedirects: 20,
    http2: true,
    timeout: typeof timeout === 'number' ? { request: timeout } : timeout,
    decompress: true,
    agent,
    retry: {
      limit: 0,
    },

    dnsCache: true,
    lookup: undefined,
    ...extra,
  };
}

function buildAxiosConfig(meta?: any): any {
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

function buildAxiosRequestShape(finalUrl: string, resMeta?: any, meta?: any): any {
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

function normalizeFromStream(resMeta: any, raw: Buffer[] | null, meta?: any, asBuffer = false): any {
  let buf = raw && raw.length > 0 ? Buffer.concat(raw) : Buffer.alloc(0);

  if (raw && raw.length > 0) {
    raw.length = 0;

    (raw as any) = null;
  }

  const contentEncoding = resMeta?.headers?.["content-encoding"] ||
    resMeta?.headers?.["Content-Encoding"];

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
      const firstChar = trimmed[0];

      if (firstChar === "{" || firstChar === "[") {
        try {
          data = JSON.parse(trimmed);
        } catch (parseErr: any) {

          if (process.env.DEBUG_JSON_PARSE) {
            console.warn(`JSON parse failed: ${parseErr?.message}, first 100 chars: ${trimmed.substring(0, 100)}`);
          }
        }
      } else {

        if (process.env.DEBUG_JSON_PARSE) {
          console.warn(`Expected JSON but got data starting with "${firstChar}", first 100 chars: ${trimmed.substring(0, 100)}`);
        }
      }
    }
  }
  const finalUrl = resMeta?.url || resMeta?.requestUrl || meta?.url;
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

function wrapAxiosError(err: any, meta?: any, resMeta?: any, raw?: Buffer[], asBuffer = false): Error {
  const ax = new Error(err?.message || "Network Error") as any;
  ax.name = "AxiosError";
  ax.code = err?.code;
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

function streamRequest(
  method: string,
  url: string,
  cfg: any,
  meta?: any,
  asBuffer = false
): Promise<any> {
  return new Promise((resolve, reject) => {
    const s = (got.stream as any)[method.toLowerCase()](url, cfg);
    let resMeta: any = null;
    const chunks: Buffer[] = [];
    const MAX_BYTES = 50 * 1024 * 1024;
    let totalSize = 0;

    s.on("response", (res: any) => {
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

    s.on("error", (e: any) => reject(wrapAxiosError(e, meta, resMeta, chunks, asBuffer)));
    s.on("end", () => resolve(normalizeFromStream(resMeta, chunks, meta, asBuffer)));
  });
}

async function requestWithRetry<T>(fn: () => Promise<T>, retries = 0): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await fn();
      // Handle 429 rate limit errors with exponential backoff
      if (result?.statusCode === 429) {
        const retryAfter = parseInt(result.headers?.['retry-after'] || '0', 10) || Math.min(16000, 1000 * Math.pow(2, i));
        if (i < retries) {
          await delay(retryAfter);
          continue;
        }
      }
      return result;
    } catch (err: any) {
      // Check if it's a 429 error in the response
      if (err?.response?.statusCode === 429 && i < retries) {
        const retryAfter = parseInt(err.response?.headers?.['retry-after'] || '0', 10) || Math.min(16000, 1000 * Math.pow(2, i));
        await delay(retryAfter);
        continue;
      }
      if (i === retries) throw err;
      await delay(Math.min(16000, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error("Request failed");
}

function cleanGet(url: string, jar?: JarLike): Promise<any> {
  const meta = { url, method: "GET" };
  const cfg = baseConfig({}, jar);
  const fn = async () => streamRequest("GET", url, cfg, meta, false);
  return requestWithRetry(fn);
}

function get(
  url: string,
  reqJar: JarLike,
  qs?: Record<string, any> | null,
  options?: Record<string, any>,
  ctx?: any,
  customHeader?: Record<string, string>
): Promise<any> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  const fn = async () => {
    await throttleRequest(isGraphQL);
    const headers = getHeaders(url, options, ctx, customHeader, "GET") || {};
    const extra: any = { headers };
    if (qs !== undefined && qs !== null) extra.searchParams = qs;
    const cfg = baseConfig(extra, reqJar);
    const meta = { url, method: "GET", headers, params: qs };
    return streamRequest("GET", url, cfg, meta, false);
  };
  return requestWithRetry(fn);
}

function post(
  url: string,
  reqJar: JarLike,
  form: Record<string, any> = {},
  options?: Record<string, any>,
  ctx?: any,
  customHeader?: Record<string, string>
): Promise<any> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  const fn = async () => {
    await throttleRequest(isGraphQL);
    const headers = getHeaders(url, options, ctx, customHeader, "POST") || {};
    let contentType =
      headers["Content-Type"] || headers["content-type"] || "application/x-www-form-urlencoded";
    let body: any;

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
    const cfg = baseConfig({ method: "POST", headers, body }, reqJar);
    const meta = { url, method: "POST", headers, data: form };
    return streamRequest("POST", url, cfg, meta, false);
  };
  return requestWithRetry(fn);
}

function postJSON(
  url: string,
  reqJar: JarLike,
  jsonBody: any,
  options?: Record<string, any>,
  ctx?: any,
  customHeader?: Record<string, string>
): Promise<any> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  const fn = async () => {
    await throttleRequest(isGraphQL);
    const headers = getHeaders(url, options, ctx, customHeader, "POST") || {};
    headers["Content-Type"] = "application/json";
    const body = jsonBody == null ? null : JSON.stringify(jsonBody);
    const cfg = baseConfig({ method: "POST", headers, body }, reqJar);
    const meta = { url, method: "POST", headers, data: jsonBody };
    return streamRequest("POST", url, cfg, meta, false);
  };
  return requestWithRetry(fn);
}

function postFormData(
  url: string,
  reqJar: JarLike,
  form: Record<string, any> = {},
  qs?: Record<string, any>,
  options?: Record<string, any>,
  ctx?: any
): Promise<any> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  const fn = async () => {
    await throttleRequest(isGraphQL);
    const fd = new FormData();
    for (const key in form || {}) {
      if (!Object.prototype.hasOwnProperty.call(form, key)) continue;
      const val = form[key];
      if (Array.isArray(val)) {
        for (const it of val) {

          if (it && typeof it === "object" && (it.value !== undefined || it.data !== undefined)) {
            const fileData = it.value !== undefined ? it.value : it.data;
            const fileOptions: any = {};
            if (it.filename) fileOptions.filename = it.filename;
            if (it.contentType) fileOptions.contentType = it.contentType;
            fd.append(key, fileData, Object.keys(fileOptions).length > 0 ? fileOptions : undefined);
          } else {
            fd.append(key, it);
          }
        }
      } else {

        if (val && typeof val === "object" && (val.value !== undefined || val.data !== undefined)) {
          const fileData = val.value !== undefined ? val.value : val.data;
          const fileOptions: any = {};
          if (val.filename) fileOptions.filename = val.filename;
          if (val.contentType) fileOptions.contentType = val.contentType;
          fd.append(key, fileData, Object.keys(fileOptions).length > 0 ? fileOptions : undefined);
        } else {
          fd.append(key, val);
        }
      }
    }

    const fdHeaders = fd.getHeaders();
    // Extract customHeader from options if present
    const customHeader = (options as any)?.customHeader;
    const mergedHeaders = {
      ...(getHeaders(url, options, ctx, fdHeaders, "POST") || {}),
      ...fdHeaders,
      ...(customHeader || {}),
    };

    const extra: any = { method: "POST", headers: mergedHeaders, body: fd };
    if (qs !== undefined && qs !== null) extra.searchParams = qs;
    const cfg = baseConfig(extra, reqJar);
    const meta = { url, method: "POST", headers: mergedHeaders, params: qs, data: form };
    return streamRequest("POST", url, cfg, meta, false);
  };
  return requestWithRetry(fn);
}

function head(
  url: string,
  reqJar: JarLike,
  qs?: Record<string, any> | null,
  options?: Record<string, any>,
  ctx?: any,
  customHeader?: Record<string, string>
): Promise<any> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  const fn = async () => {
    await throttleRequest(isGraphQL);
    const headers = getHeaders(url, options, ctx, customHeader, "HEAD") || {};
    const extra: any = { method: "HEAD", headers };
    if (qs !== undefined && qs !== null) extra.searchParams = qs;
    const cfg = baseConfig(extra, reqJar);
    const meta = { url, method: "HEAD", headers, params: qs };
    return new Promise((resolve, reject) => {
      const s = got.stream.head(url, cfg);
      let resMeta: any = null;
      s.on("response", (res: any) => (resMeta = res));
      s.on("error", (e: any) => reject(wrapAxiosError(e, meta, resMeta)));
      s.on("end", () => resolve(normalizeFromStream(resMeta, [], meta, false)));
    });
  };
  return requestWithRetry(fn);
}

function put(
  url: string,
  reqJar: JarLike,
  bodyData: any,
  options?: Record<string, any>,
  ctx?: any,
  customHeader?: Record<string, string>
): Promise<any> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  const fn = async () => {
    await throttleRequest(isGraphQL);
    const headers = getHeaders(url, options, ctx, customHeader, "PUT") || {};
    let body = bodyData;
    if (getType(bodyData) === "Object") {
      headers["Content-Type"] =
        headers["Content-Type"] || headers["content-type"] || "application/json";
      if (/json/i.test(headers["Content-Type"])) body = JSON.stringify(bodyData);
    }
    const cfg = baseConfig({ method: "PUT", headers, body }, reqJar);
    const meta = { url, method: "PUT", headers, data: bodyData };
    return streamRequest("PUT", url, cfg, meta, false);
  };
  return requestWithRetry(fn);
}

function del(
  url: string,
  reqJar: JarLike,
  qs?: Record<string, any> | null,
  options?: Record<string, any>,
  ctx?: any,
  customHeader?: Record<string, string>
): Promise<any> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  const fn = async () => {
    await throttleRequest(isGraphQL);
    const headers = getHeaders(url, options, ctx, customHeader, "DELETE") || {};
    const extra: any = { method: "DELETE", headers };
    if (qs !== undefined && qs !== null) extra.searchParams = qs;
    const cfg = baseConfig(extra, reqJar);
    const meta = { url, method: "DELETE", headers, params: qs };
    return streamRequest("DELETE", url, cfg, meta, false);
  };
  return requestWithRetry(fn);
}

function getBuffer(
  url: string,
  reqJar: JarLike,
  qs?: Record<string, any> | null,
  options?: Record<string, any>,
  ctx?: any,
  customHeader?: Record<string, string>
): Promise<any> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  const fn = async () => {
    await throttleRequest(isGraphQL);
    const headers = getHeaders(url, options, ctx, customHeader, "GET") || {};
    const extra: any = {};
    if (qs !== undefined && qs !== null) extra.searchParams = qs;
    const cfg = baseConfig(extra, reqJar);
    const meta = { url, method: "GET", headers, params: qs, responseType: "arraybuffer" };
    return streamRequest("GET", url, cfg, meta, true);
  };
  return requestWithRetry(fn);
}

function download(
  url: string,
  filePath: string,
  reqJar: JarLike,
  qs?: Record<string, any> | null,
  options?: Record<string, any>,
  ctx?: any,
  customHeader?: Record<string, string>
): Promise<any> {
  const isGraphQL = url.includes("/api/graphql/") || url.includes("/graphql");
  return requestWithRetry(
    async () => {
      await throttleRequest(isGraphQL);
      const headers = getHeaders(url, options, ctx, customHeader, "GET") || {};
      const extra: any = { headers };
      if (qs !== undefined && qs !== null) extra.searchParams = qs;
      const cfg = baseConfig(extra, reqJar);
      const meta = { url, method: "GET", headers, params: qs };

      return new Promise((resolve, reject) => {
        const dest = path.resolve(filePath);
        const ws = fs.createWriteStream(dest);
        const stream = got.stream.get(url, cfg);
        let resMeta: any = null;

        stream.on("response", (res: any) => (resMeta = res));
        stream.on("error", (e: any) => {
          ws.destroy();
          reject(wrapAxiosError(e, meta, resMeta));
        });
        ws.on("error", (e: any) => reject(wrapAxiosError(e, meta, resMeta)));
        ws.on("finish", () => resolve(normalizeFromStream(resMeta, [], meta, false)));
        stream.pipe(ws);
      });
    }
  );
}

const createJar = (): JarLike => {
  const jar = new CookieJar() as JarLike;
  const boundGetCookieStringSync = (jar as CookieJar).getCookieStringSync?.bind(jar);
  jar.cookieString = boundGetCookieStringSync
    ? () => boundGetCookieStringSync("https://www.facebook.com")
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
