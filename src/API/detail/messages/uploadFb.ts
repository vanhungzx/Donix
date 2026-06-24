"use strict";

import logger from "@log";
import axios, { AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import FormData from "form-data";
import fs from "fs";
import { Readable } from "node:stream";
import path from "path";
import { CookieJar } from "tough-cookie";
import { URL } from "url";
import { buildSecChUaFromUserAgent } from "../../request/user-agents.js";
import type { Context } from "../../request/formatters/helpers";

interface Tokens {
  lsd?: string;
  fb_dtsg?: string;
  jazoest?: string;
  spin_r?: string;
  spin_t?: string;
  rev?: string;
  __spin_b?: string;
  __dyn?: string;
  __csr?: string;
  __hs?: string;
  __hsi?: string;
  __s?: string;
  __hsdp?: string;
  __hblp?: string;
  __sjsp?: string;
  __crn?: string;
  qpl_active_flow_ids?: string;
}

interface ClientWithRupload {
  ruploadAttachment?: (inputs: unknown) => Promise<unknown[]>;
}

let mercuryReqSeq = Math.floor(Math.random() * 1000);

function nextMercuryReq(): string {
  mercuryReqSeq += 1;
  return mercuryReqSeq.toString(36);
}

interface NormalizedFile {
  stream: Readable;
  filename: string;
  contentType?: string;
}

interface AttachmentDetail {
  video_id?: string;
  image_id?: string;
  audio_id?: string;
  file_id?: string;
  fbid?: string;
  id?: string;
  upload_id?: string;
  gif_id?: string;
  filename?: string;
  filetype?: string;
  thumbnail_src?: string;
  [key: string]: string | undefined;
}

interface UploadOptions {
  concurrency?: number;
  mode?: "single" | "parallel";
}

interface UploadResult {
  status: number;
  ids: AttachmentDetail[];
  raw?: unknown;
  errors?: Array<{ index: number; error: Error }>;
}

type UploadCallback = (err: Error | null, data?: UploadResult) => void;

let http: AxiosInstance | null = null;
let cookieJar: CookieJar = new CookieJar();
let tokenCache: Tokens | null = null;
let tokenCacheTime = 0;
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function cleanJSON(x: unknown): unknown {
  if (typeof x !== "string") return x;
  const s = x.replace(/^for\s*\(;;\);\s*/i, "");
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function pick(re: RegExp, html: string, i = 1): string {
  const m = html && html.match(re);
  return m ? m[i] : "";
}

function getFrom(html: string, a: string, b: string): string | undefined {
  const i = html.indexOf(a);
  if (i < 0) return undefined;
  const start = i + a.length;
  const j = html.indexOf(b, start);
  return j < 0 ? undefined : html.slice(start, j);
}

function respFinalUrl(res: { url?: string; requestUrl?: string }): string {
  return (res && (res.url || res.requestUrl)) || "";
}

interface CheckpointDetection {
  hit: boolean;
  url: string;
}

function detectCheckpoint(res: { url?: string; requestUrl?: string; body?: string }): CheckpointDetection {
  const url = String(respFinalUrl(res) || "");
  const body = typeof res?.body === "string" ? res.body : "";
  const hit =
    /\/checkpoint\//i.test(url) ||
    /(?:href|action)\s*=\s*["']https?:\/\/[^"']*\/checkpoint\//i.test(body) ||
    /"checkpoint"|checkpoint_title|checkpointMain|id="checkpoint"/i.test(body) ||
    (/login\.php/i.test(url) && /checkpoint/i.test(body));

  return {
    hit,
    url: url || (body.match(/https?:\/\/[^"']*\/checkpoint\/[^"'<>]*/i)?.[0] || ""),
  };
}

interface CheckpointError extends Error {
  code: "CHECKPOINT";
  checkpoint: boolean;
  url: string;
  status?: number;
}

function checkpointError(res: { url?: string; requestUrl?: string; body?: string; statusCode?: number }): CheckpointError | null {
  const d = detectCheckpoint(res);
  if (!d.hit) return null;
  const e = new Error("Checkpoint required") as CheckpointError;
  e.code = "CHECKPOINT";
  e.checkpoint = true;
  e.url = d.url || "https://www.facebook.com/checkpoint/";
  e.status = res?.statusCode;
  return e;
}

async function httpGet(pageUrl: string, ua: string, headers: Record<string, string> = {}): Promise<string> {
  if (!http) throw new Error("HTTP client not initialized");
  const host = new URL(pageUrl).hostname;
  const referer = `https://${host}/`;

  const baseHeaders: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "max-age=0",
    Connection: "keep-alive",
    Dpr: "1",
    Host: host,
    Origin: `https://${host}`,
    Referer: referer,
    "Sec-Ch-Prefers-Color-Scheme": "light",
    "Sec-Ch-Ua": '"Not;A=Brand";v="99", "Google Chrome";v="119", "Chromium";v="119"',
    "Sec-Ch-Ua-Full-Version-List": '"Not;A=Brand";v="99.0.0.0", "Google Chrome";v="119.0.0.0", "Chromium";v="119.0.0.0"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Model": '""',
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Ch-Ua-Platform-Version": '"10.0.0"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": ua,
    "Viewport-Width": "1920",
    "x-fb-rlafr": "0",
  };

  const res = await http.get(pageUrl, {
    headers: { ...baseHeaders, ...headers },
    timeout: 30000,
  });

  const cp = checkpointError({
    url: res.request?.res?.responseUrl || res.config?.url,
    requestUrl: res.request?.res?.responseUrl || res.config?.url,
    body: typeof res.data === "string" ? res.data : String(res.data || ""),
    statusCode: res.status,
  });
  if (cp) throw cp;

  return typeof res.data === "string" ? res.data : String(res.data || "");
}

async function getTokens(ua: string, forceRefresh = false): Promise<Tokens> {
  const now = Date.now();
  if (!forceRefresh && tokenCache && now - tokenCacheTime < TOKEN_CACHE_TTL) {
    return tokenCache;
  }

  try {
    const html = await httpGet("https://www.facebook.com/", ua, { Referer: "https://www.facebook.com/" });
    const fb_dtsg =
      getFrom(html, '"DTSGInitData",[],{"token":"', '",') ||
      html.match(/name="fb_dtsg"\s+value="([^"]+)"/)?.[1] ||
      "";
    const jazoest =
      getFrom(html, 'name="jazoest" value="', '"') ||
      getFrom(html, "jazoest=", '",') ||
      html.match(/name="jazoest"\s+value="([^"]+)"/)?.[1] ||
      "";
    const lsd = getFrom(html, '["LSD",[],{"token":"', '"}') || html.match(/name="lsd"\s+value="([^"]+)"/)?.[1] || "";
    const spin_r = pick(/"__spin_r":(\d+)/, html) || "";
    const spin_t = pick(/"__spin_t":(\d+)/, html) || "";
    const __spin_b = pick(/"__spin_b":"([^"]+)"/, html) || "trunk";
    const rev = pick(/"__rev":(\d+)/, html) || pick(/client_revision":(\d+)/, html) || "";
    const __hs = pick(/"__hs":"([^"]+)"/, html) || pick(/__hs=([^&"'<>]+)/, html) || "";
    const __hsi = pick(/"__hsi":(\d+)/, html) || pick(/__hsi=(\d+)/, html) || "";
    const __s = pick(/"__s":"([^"]+)"/, html) || "";
    const __dyn =
      html.match(/"__dyn":"((?:\\.|[^"\\])*)"/)?.[1]?.replace(/\\"/g, '"') ||
      html.match(/__dyn=([^&"'<>]+)/)?.[1] ||
      "";
    const __csr =
      html.match(/"__csr":"((?:\\.|[^"\\])*)"/)?.[1]?.replace(/\\"/g, '"') ||
      html.match(/__csr=([^&"'<>]+)/)?.[1] ||
      "";
    const __hsdp = pick(/"__hsdp":"([^"]+)"/, html) || "";
    const __hblp = pick(/"__hblp":"([^"]+)"/, html) || "";
    const __sjsp = pick(/"__sjsp":"([^"]+)"/, html) || "";
    const __crn = pick(/"__crn":"([^"]+)"/, html) || "";
    const qpl_active_flow_ids = pick(/"qpl_active_flow_ids":"([^"]+)"/, html) || "";

    tokenCache = {
      lsd,
      fb_dtsg,
      jazoest,
      spin_r,
      spin_t,
      rev,
      __spin_b,
      __hs: __hs || undefined,
      __hsi: __hsi || undefined,
      __s: __s || undefined,
      __dyn: __dyn || undefined,
      __csr: __csr || undefined,
      __hsdp: __hsdp || undefined,
      __hblp: __hblp || undefined,
      __sjsp: __sjsp || undefined,
      __crn: __crn || undefined,
      qpl_active_flow_ids: qpl_active_flow_ids || undefined,
    };
    tokenCacheTime = now;
    return tokenCache;
  } catch (e) {
    if (tokenCache) {
      logger.warn(`[uploadFb] Token fetch failed, using cached tokens: ${(e as Error).message}`);
      return tokenCache;
    }
    throw e;
  }
}

function getType(obj: unknown): string {
  return Object.prototype.toString.call(obj).slice(8, -1);
}

function isReadableStream(obj: unknown): obj is Readable {
  return (
    obj instanceof Readable &&
    (getType((obj as Readable & { _read?: unknown })._read) === "Function" ||
      getType((obj as Readable & { _read?: unknown })._read) === "AsyncFunction") &&
    getType((obj as Readable & { _readableState?: unknown })._readableState) === "Object"
  );
}

function fromBuffer(buf: Buffer): Readable {
  return Readable.from(buf);
}

interface ParsedDataUrl {
  mime: string;
  data: Buffer;
}

function parseDataUrl(s: string): ParsedDataUrl | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(s);
  if (!m) return null;
  const mime = m[1] || "application/octet-stream";
  const isB64 = !!m[2];
  const data = isB64 ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
  return { mime, data };
}

function filenameFromUrl(u: string, headers?: Record<string, string>): string {
  try {
    const urlObj = new URL(u);
    let filename = path.basename(urlObj.pathname) || `file-${Date.now()}`;
    const cd = headers && (headers["content-disposition"] || headers["Content-Disposition"]);
    if (cd) {
      const m = /filename\*?=(?:UTF-8''|")?([^";\n]+)/i.exec(cd);
      if (m) filename = decodeURIComponent(m[1].replace(/"/g, ""));
    }
    return filename;
  } catch {
    return `file-${Date.now()}`;
  }
}

async function normalizeOne(input: unknown, ua: string): Promise<NormalizedFile> {
  if (!input) throw new Error("Invalid input");

  if (Buffer.isBuffer(input)) {
    return {
      stream: fromBuffer(input),
      filename: `file-${Date.now()}.bin`,
      contentType: "application/octet-stream",
    };
  }

  if (typeof input === "string") {
    if (/^https?:\/\//i.test(input)) {
      if (!http) throw new Error("HTTP client not initialized");
      const resp = await http.get(input, {
        headers: {
          "User-Agent": ua,
          Accept: "*/*",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
        },
        timeout: 30000,
        responseType: "stream",
      });

      const s = resp.data as Readable;
      const filename = filenameFromUrl(input, resp.headers as Record<string, string>);
      return { stream: s, filename };
    }

    if (input.startsWith("data:")) {
      const p = parseDataUrl(input);
      if (!p) throw new Error("Bad data URL");
      return { stream: fromBuffer(p.data), filename: `file-${Date.now()}`, contentType: p.mime };
    }

    if (fs.existsSync(input) && fs.statSync(input).isFile()) {
      return { stream: fs.createReadStream(input), filename: path.basename(input) };
    }

    throw new Error(`Unsupported string input: ${input}`);
  }

  if (isReadableStream(input)) {
    return { stream: input, filename: `file-${Date.now()}` };
  }

  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    if (obj.buffer && Buffer.isBuffer(obj.buffer)) {
      const filename = (obj.filename as string) || `file-${Date.now()}.bin`;
      const contentType = (obj.contentType as string) || "application/octet-stream";
      return { stream: fromBuffer(obj.buffer), filename, contentType };
    }

    if (obj.data && Buffer.isBuffer(obj.data)) {
      const filename = (obj.filename as string) || `file-${Date.now()}.bin`;
      const contentType = (obj.contentType as string) || "application/octet-stream";
      return { stream: fromBuffer(obj.data), filename, contentType };
    }

    if (obj.stream && isReadableStream(obj.stream)) {
      const filename = (obj.filename as string) || `file-${Date.now()}`;
      const contentType = obj.contentType as string | undefined;
      return { stream: obj.stream, filename, contentType };
    }

    if (obj.url) {
      return normalizeOne(String(obj.url), ua);
    }

    if (obj.path && typeof obj.path === "string" && fs.existsSync(obj.path) && fs.statSync(obj.path).isFile()) {
      return {
        stream: fs.createReadStream(obj.path),
        filename: (obj.filename as string) || path.basename(obj.path),
        contentType: obj.contentType as string | undefined,
      };
    }
  }

  throw new Error("Unrecognized input");
}

function mapAttachmentDetails(data: unknown): AttachmentDetail[] {
  const out: AttachmentDetail[] = [];
  if (!data || typeof data !== "object") return out;

  const stack: unknown[] = [data];

  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;

    const obj = cur as Record<string, unknown>;
    const id =
      (obj.video_id as string) ||
      (obj.image_id as string) ||
      (obj.audio_id as string) ||
      (obj.file_id as string) ||
      (obj.fbid as string) ||
      (obj.id as string) ||
      (obj.upload_id as string) ||
      (obj.gif_id as string);

    const idKey = obj.video_id
      ? "video_id"
      : obj.image_id
        ? "image_id"
        : obj.audio_id
          ? "audio_id"
          : obj.file_id
            ? "file_id"
            : obj.gif_id
              ? "gif_id"
              : obj.fbid
                ? "fbid"
                : id
                  ? "id"
                  : null;

    const filename = (obj.filename as string) || (obj.file_name as string) || (obj.name as string) || (obj.original_filename as string);
    const filetype = (obj.filetype as string) || (obj.mime_type as string) || (obj.type as string) || (obj.content_type as string);

    let thumbnail =
      (obj.thumbnail_src as string) ||
      (obj.thumbnail_url as string) ||
      (obj.preview_url as string) ||
      (obj.thumbSrc as string) ||
      (obj.thumb_url as string) ||
      (obj.image_preview_url as string) ||
      (obj.large_preview_url as string);

    if (!thumbnail) {
      const m = (obj.media || obj.thumbnail || obj.thumb || obj.image_data || obj.video_data || obj.preview) as Record<string, unknown> | undefined;
      thumbnail = (m?.thumbnail_src as string) || (m?.thumbnail_url as string) || (m?.src as string) || (m?.uri as string) || (m?.url as string);
    }

    if (idKey) {
      const o: AttachmentDetail = {};
      o[idKey] = id;
      if (filename) o.filename = filename;
      if (filetype) o.filetype = filetype;
      if (thumbnail) o.thumbnail_src = thumbnail;
      out.push(o);
    }

    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
    } else if (cur && typeof cur === "object") {
      const obj = cur as Record<string, unknown>;
      for (const k of Object.keys(obj)) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          stack.push(obj[k]);
        }
      }
    }
  }

  return out;
}

function pLimit(n: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    active--;
    const nextFn = queue.shift();
    if (nextFn) nextFn();
  };

  return (fn: () => Promise<unknown>) =>
    new Promise((resolve, reject) => {
      const run = () => {
        active++;
        fn()
          .then((v) => {
            resolve(v);
            next();
          })
          .catch((e) => {
            reject(e);
            next();
          });
      };

      if (active < n) run();
      else queue.push(run);
    });
}

/** Ưu tiên token từ ctx (login) rồi mới HTML scrape */
function mergeCtxMercuryTokens(ctx: Context, t: Tokens): Tokens {
  const m = { ...t };
  if (ctx.lsd) m.lsd = ctx.lsd;
  if (ctx.fb_lsd && !m.lsd) m.lsd = ctx.fb_lsd;
  if (ctx.fb_dtsg) m.fb_dtsg = ctx.fb_dtsg;
  if (ctx.jazoest) m.jazoest = ctx.jazoest;
  if (ctx.__dyn) m.__dyn = ctx.__dyn;
  if (ctx.__csr) m.__csr = ctx.__csr;
  if (ctx.__hs) m.__hs = ctx.__hs;
  if (ctx.__hsi) m.__hsi = ctx.__hsi;
  if (ctx.master?.__spin_r) m.spin_r = ctx.master.__spin_r;
  if (ctx.master?.__spin_t) m.spin_t = ctx.master.__spin_t;
  if (ctx.master?.__spin_b) m.__spin_b = ctx.master.__spin_b;
  if (ctx.qpl_active_flow_ids) m.qpl_active_flow_ids = ctx.qpl_active_flow_ids;
  return m;
}

function buildMercuryUploadUrl(ctx: Context, tok: Tokens): string {
  const u = new URL("https://www.facebook.com/ajax/mercury/upload.php");
  const p = u.searchParams;
  p.set("__aaid", "0");
  p.set("__user", String(ctx.userID));
  p.set("__a", "1");
  p.set("__req", nextMercuryReq());
  if (tok.__hs) p.set("__hs", tok.__hs);
  p.set("dpr", "1");
  p.set("__ccg", "EXCELLENT");
  if (tok.rev) p.set("__rev", tok.rev);
  if (tok.__s) p.set("__s", tok.__s);
  if (tok.__hsi) p.set("__hsi", tok.__hsi);
  if (tok.__dyn) p.set("__dyn", tok.__dyn);
  if (tok.__csr) p.set("__csr", tok.__csr);
  if (tok.__hsdp) p.set("__hsdp", tok.__hsdp);
  if (tok.__hblp) p.set("__hblp", tok.__hblp);
  if (tok.__sjsp) p.set("__sjsp", tok.__sjsp);
  p.set("__comet_req", "15");
  if (tok.fb_dtsg) p.set("fb_dtsg", tok.fb_dtsg);
  if (tok.jazoest) p.set("jazoest", tok.jazoest);
  if (tok.lsd) p.set("lsd", tok.lsd);
  if (tok.spin_r) p.set("__spin_r", tok.spin_r);
  p.set("__spin_b", tok.__spin_b || "trunk");
  if (tok.spin_t) p.set("__spin_t", tok.spin_t);
  p.set("__crn", tok.__crn || "comet.fbweb.CometHomeRoute");
  if (tok.qpl_active_flow_ids) p.set("qpl_active_flow_ids", tok.qpl_active_flow_ids);
  return u.toString();
}

function buildMercuryMultipartHeaders(ua: string, tok: Tokens, form: FormData): Record<string, string> {
  const fp = buildSecChUaFromUserAgent(ua);
  const fdh = form.getHeaders() as Record<string, string | string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fdh)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? v.join("; ") : String(v);
  }
  Object.assign(out, {
    Accept: "*/*",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "User-Agent": ua,
    "sec-ch-ua": fp.secChUa,
    "sec-ch-ua-full-version-list": fp.secChUaFullVersionList,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-model": '""',
    "sec-ch-ua-platform": fp.secChUaPlatform,
    "sec-ch-ua-platform-version": fp.secChUaPlatformVersion,
    "sec-ch-prefers-color-scheme": "dark",
    "x-asbd-id": "359341",
    "x-fb-lsd": tok.lsd || "",
    "x-fb-friendly-name": "MercuryUpload",
    "x-fb-request-analytics-tags": JSON.stringify({
      network_tags: {
        product: "6628568379",
        purpose: "none",
        request_category: "graphql",
        retry_attempt: "0",
      },
      application_tags: "graphservice",
    }),
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    Origin: "https://www.facebook.com",
    Referer: "https://www.facebook.com/",
  });
  return out;
}

async function singleUpload(
  ctx: Context,
  file: NormalizedFile,
  ua: string,
  tok: Tokens,
  retries = 2
): Promise<{ data: unknown; status: number }> {
  if (!http) throw new Error("HTTP client not initialized");
  const url = buildMercuryUploadUrl(ctx, tok);
  const form = new FormData();
  form.append("farr", file.stream, { filename: file.filename, contentType: file.contentType });
  const headers = buildMercuryMultipartHeaders(ua, tok, form);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await http.post(url, form, {
        headers,
        timeout: 120000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      return { data: res.data, status: res.status || 200 };
    } catch (e) {
      const error = e as { code?: string; response?: { status?: number } };
      if (attempt === retries) throw e;
      if (error.code === "ETIMEDOUT" || error.code === "ECONNRESET" || (error.response && error.response.status && error.response.status >= 500)) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Upload failed after retries");
}

async function tryMercuryRuploadFallback(
  api: ClientWithRupload | undefined,
  originals: unknown[]
): Promise<UploadResult | null> {
  if (!api?.ruploadAttachment || !originals.length) return null;
  try {
    const tasks = originals.map((source) => ({ source }));
    const rres = await api.ruploadAttachment(tasks);
    if (!Array.isArray(rres) || rres.length === 0) return null;
    const ids: AttachmentDetail[] = [];
    for (const raw of rres) {
      const row = raw as Record<string, unknown>;
      const id =
        row.mediaId ??
        row.media_id ??
        row.image_id ??
        row.video_id ??
        row.audio_id ??
        row.gif_id ??
        row.file_id ??
        row.uploadId ??
        row.upload_id ??
        row.id ??
        row.fbid;
      if (id == null) continue;
      const idStr = String(id);
      const mediaType = row.type;
      const det: AttachmentDetail = { fbid: idStr, id: idStr };
      if (mediaType === "video" || row.video_id) det.video_id = idStr;
      else if (mediaType === "audio" || row.audio_id) det.audio_id = idStr;
      else if (mediaType === "gif" || row.gif_id) {
        det.gif_id = idStr;
        det.image_id = idStr;
      } else {
        det.image_id = idStr;
      }
      if (row.uploadId != null) det.upload_id = String(row.uploadId);
      ids.push(det);
    }
    if (!ids.length) return null;
    logger.info(`[uploadFb] mercury -> ruploadAttachment fallback OK (${ids.length} item(s))`);
    return { status: 200, ids, raw: rres };
  } catch (e) {
    logger.warn(`[uploadFb] ruploadAttachment fallback: ${(e as Error).message}`);
    return null;
  }
}

export default function (_defaultFuncs: unknown, api: ClientWithRupload | undefined, ctx: Context) {
  const ua = (ctx?.options?.userAgent as string) || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";
  cookieJar = (ctx.jar instanceof CookieJar ? ctx.jar : new CookieJar()) as CookieJar;

  http = wrapper(
    axios.create({
      timeout: 60000,
      headers: {
        "User-Agent": ua,
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
      },
      maxRedirects: 5,
      validateStatus: () => true,
    })
  ) as AxiosInstance;

  (http.defaults as { withCredentials?: boolean; jar?: CookieJar }).withCredentials = true;
  (http.defaults as { withCredentials?: boolean; jar?: CookieJar }).jar = cookieJar;

  return function uploadFb(link: unknown, opts?: UploadOptions | UploadCallback, callback?: UploadCallback): Promise<UploadResult> {
    if (typeof opts === "function") {
      callback = opts;
      opts = undefined;
    }

    const options: UploadOptions = {
      concurrency: Math.max(1, Math.min(5, Number(opts?.concurrency || 3))),
      mode: opts?.mode === "single" ? "single" : "parallel",
    };

    let resolveFunc: (value: UploadResult) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<UploadResult>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = (err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data!);
      };
    }

    (async () => {
      let tokens: Tokens | null = null;
      let inputsArr: unknown[] = [];
      try {
        inputsArr = Array.isArray(link) ? link : [link];

        if (!inputsArr.length) {
          return callback(new Error("No files to upload"));
        }

        // Get tokens (with caching), gộp token Comet từ ctx (giống curl mercury/upload.php)
        tokens = await getTokens(ua);
        const mergedTok = mergeCtxMercuryTokens(ctx, tokens);

        // Normalize all inputs in parallel
        const normAll = await Promise.all(inputsArr.map((x) => normalizeOne(x, ua)));

        if (options.mode === "single") {
          const uploadUrl = buildMercuryUploadUrl(ctx, mergedTok);
          const form = new FormData();
          for (const f of normAll) {
            form.append("farr", f.stream, { filename: f.filename, contentType: f.contentType });
          }

          const headers = buildMercuryMultipartHeaders(ua, mergedTok, form);

          const res = await http!.post(uploadUrl, form, {
            headers,
            timeout: 120000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          });

          const cp = checkpointError({
            url: res.request?.res?.responseUrl || res.config?.url,
            requestUrl: res.request?.res?.responseUrl || res.config?.url,
            body: typeof res.data === "string" ? res.data : String(res.data || ""),
            statusCode: res.status,
          });
          if (cp) {
            tokenCache = null; // Clear cache on checkpoint
            throw cp;
          }

          const data = cleanJSON(res.data);
          const ids = mapAttachmentDetails(data);

          if (!ids.length) {
            const fb = await tryMercuryRuploadFallback(api, inputsArr);
            if (fb) {
              return callback(null, fb);
            }
            const e = new Error("UploadFb returned no metadata/ids") as Error & { code?: string; status?: number; body?: unknown };
            e.code = "NO_METADATA";
            e.status = res.status;
            e.body = typeof data === "string" ? data.slice(0, 500) : data;
            throw e;
          }

          logger.info(`[uploadFb] mercury success ${ids.length} item(s) status ${res.status}`);
          return callback(null, { status: res.status || 200, ids, raw: data });
        }

        const uploadConcurrency = options.concurrency || 3;
        const limit = pLimit(uploadConcurrency);
        const tasks = normAll.map((f) => () => singleUpload(ctx, f, ua, mergedTok));
        const results = await Promise.all(tasks.map((t) => limit(t)));

        const ids: AttachmentDetail[] = [];
        const errors: Array<{ index: number; error: Error }> = [];

        for (let i = 0; i < results.length; i++) {
          const res = results[i];
          try {
            const cp = checkpointError({
              url: (res as { request?: { res?: { responseUrl?: string } }; config?: { url?: string } }).request?.res?.responseUrl ||
                (res as { config?: { url?: string } }).config?.url,
              requestUrl: (res as { request?: { res?: { responseUrl?: string } }; config?: { url?: string } }).request?.res?.responseUrl ||
                (res as { config?: { url?: string } }).config?.url,
              body: typeof (res as { data?: unknown }).data === "string" ? (res as { data: string }).data : String((res as { data?: unknown }).data || ""),
              statusCode: (res as { status?: number }).status,
            });
            if (cp) {
              tokenCache = null; // Clear cache on checkpoint
              throw cp;
            }

            const data = cleanJSON((res as { data?: unknown }).data);
            const fileIds = mapAttachmentDetails(data);

            if (!fileIds.length) {
              // In parallel mode we previously only warned and continued, which can lead to
              // "success 0/N" without triggering any fallback logic in callers.
              // Treat this as a per-file error so callers can fallback to ruploadAttachment.
              const e = new Error("UploadFb returned no metadata/ids") as Error & {
                code?: string;
                status?: number;
                body?: unknown;
              };
              e.code = "NO_METADATA";
              e.status = (res as { status?: number }).status;
              e.body = typeof data === "string" ? data.slice(0, 500) : data;
              errors.push({ index: i, error: e });
              logger.warn(
                `[uploadFb] File ${i + 1} returned no metadata/ids`
              );
              continue;
            }

            ids.push(...fileIds);
          } catch (e) {
            const error = e as Error;
            errors.push({ index: i, error });
            logger.error(`[uploadFb] Upload ${i + 1} failed: ${error.message}`);
          }
        }

        if (ids.length === 0 && errors.length > 0) {
          const fb = await tryMercuryRuploadFallback(api, inputsArr);
          if (fb) {
            return callback(null, fb);
          }
          throw errors[0].error;
        }

        logger.info(
          `[uploadFb] success ${ids.length}/${normAll.length} item(s) via parallel uploads c=${uploadConcurrency}${errors.length > 0 ? ` (${errors.length} failed)` : ""}`
        );
        return callback(null, {
          status: 200,
          ids,
          raw: null,
          errors: errors.length > 0 ? errors : undefined,
        });
      } catch (e) {
        const error = e as Error & { code?: string; response?: { status?: number } };
        // Refresh tokens on checkpoint or auth errors
        if (error.code === "CHECKPOINT" || (error.response && error.response.status && [401, 403].includes(error.response.status))) {
          tokenCache = null;
          try {
            tokens = await getTokens(ua, true);
            logger.info(`[uploadFb] Tokens refreshed after error`);
          } catch (refreshErr) {
            logger.error(`[uploadFb] Token refresh failed: ${(refreshErr as Error).message}`);
          }
        }
        if (error.code === "NO_METADATA") {
          logger.warn(`[uploadFb] warn ${error.code || ""} ${error.message || error}`);
        } else {
          logger.error(`[uploadFb] error ${error.code || error.response?.status || ""} ${error.message || error}`);
        }
        const fb = await tryMercuryRuploadFallback(api, inputsArr);
        if (fb) {
          return callback(null, fb);
        }
        return callback(error);
      }
    })().catch((err) => {
      // Catch any unhandled errors in the async IIFE (shouldn't happen, but safety net)
      logger.error(`[uploadFb] Unhandled promise rejection: ${(err as Error).message || err}`);
      rejectFunc(err);
    });

    return returnPromise;
  };
}
