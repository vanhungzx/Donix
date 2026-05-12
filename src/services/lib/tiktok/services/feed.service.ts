import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import qs from 'qs';
import { TIKTOK_API_URL } from '../constants/index.js';
import createMobileHeadersSignature, {
  getBaseMobileParams,
  getTrillFeedBaseParams,
  TRILL_DEFAULT_LICENSE_ID
} from '../tiktok-signer/signHeadersMobile.js';
import tiktokUtils from '../utils/tiktok.util.js';
import { parseAwemeV2FeedResponse } from '../utils/awemeV2ProtoParser.js';
import { buildAwemeV2FeedRequestBody } from '../utils/awemeV2FeedRequestBody.js';
import { extractXttTokenFromCookie, getTiktokCredentials } from './helpers.js';
import type { JsonObject, TikTokRequestOptions } from '../types.js';

type FypOptions = TikTokRequestOptions & {
  feedMode?: 'auto' | 'aweme-v2' | 'lite-fyp';
  includeRawResponse?: boolean;
  awemeV2FallbackToLite?: boolean;
  protobufBody?: Uint8Array | Buffer | string;
  protobufBodyPath?: string;
  minCursorB64?: string;
  maxCursorB64?: string;
  minCursorBytes?: Uint8Array;
  maxCursorBytes?: Uint8Array;
  pullType?: number;
  isNonPersonalized?: number;
  cmplEnc?: string;
  trillDevice?: Record<string, string | number | boolean>;
  timeout?: number;
  sp?: number;
  type?: number;
  maxCursor?: number;
  minCursor?: number;
  count?: number;
};

function normalizeAwemeFromProto(item: JsonObject): JsonObject {
  const type = item.image_post ? 'PHOTO' : 'VIDEO';
  const stats = (item.statistics || {}) as JsonObject;
  const video = (item.video || {}) as JsonObject;
  const playAddr = (video.play_addr || {}) as { url_list?: unknown[] };
  const downloadAddr = (video.download_addr || {}) as { url_list?: unknown[] };
  const originCover = (video.origin_cover || {}) as { url_list?: unknown[] };
  const cover = (video.cover || {}) as { url_list?: unknown[] };
  const dynamicCover = (video.dynamic_cover || {}) as { url_list?: unknown[] };
  const music = (item.music || {}) as JsonObject;
  const playUrl = (music.play_url || {}) as { url_list?: unknown[] };
  const author = (item.author || null) as JsonObject | null;
  const avatarThumb = ((author?.avatar_thumb || {}) as { url_list?: unknown[] }).url_list?.[0] || '';

  return {
    id: item.aweme_id,
    url: item.share_url,
    description: item.desc,
    createdAt: item.create_time,
    type,
    stats: {
      likes: Number(stats.digg_count || 0),
      comments: Number(stats.comment_count || 0),
      shares: Number(stats.share_count || 0),
      views: Number(stats.play_count || 0),
      collects: Number(stats.collect_count || 0)
    },
    video: {
      coverUri: String(originCover.url_list?.[0] || cover.url_list?.[0] || dynamicCover.url_list?.[0] || ''),
      mp4Uri: String(playAddr.url_list?.[0] || downloadAddr.url_list?.[0] || '')
    },
    imagesUri: [],
    musicUri: String(playUrl.url_list?.[0] || ''),
    author: author
      ? {
          uid: author.uid,
          nickname: author.nickname,
          unique_id: author.unique_id,
          avatar: String(avatarThumb)
        }
      : undefined
  };
}

function parseCookieInstallId(cookie: string): string | undefined {
  const match = cookie.match(/install_id=([^;]+)/i);
  return match ? match[1].trim() : undefined;
}

function parseCookieDeviceId(cookie: string): string | undefined {
  const match = cookie.match(/\bdevice_id=([^;]+)/i);
  return match ? match[1].trim() : undefined;
}

async function resolveAwemeV2ProtobufBody(options: FypOptions): Promise<Uint8Array | null> {
  if (options.protobufBody != null) {
    const source = options.protobufBody;
    if (source instanceof Uint8Array) return source;
    if (Buffer.isBuffer(source)) return new Uint8Array(source);
    return new Uint8Array(Buffer.from(source));
  }

  const candidates = [
    options.protobufBodyPath,
    typeof process !== 'undefined' ? process.env?.TIKTOK_AWEME_V2_FEED_BODY : undefined,
    path.join(process.cwd(), 'storage', 'cookies', 'tiktok_aweme_v2_feed_body.bin')
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      if (await fs.pathExists(candidate)) {
        const buffer = await fs.readFile(candidate);
        return new Uint8Array(buffer);
      }
    } catch {
      // continue next candidate
    }
  }
  return null;
}

async function getFYPFeedAwemeV2(options: FypOptions, credentials: { cookie: string; xTtToken?: string }): Promise<JsonObject> {
  const cookie = credentials.cookie;
  const xTtToken = credentials.xTtToken || extractXttTokenFromCookie(cookie);

  let protobufBody = await resolveAwemeV2ProtobufBody(options);
  if (!protobufBody?.length) {
    protobufBody = buildAwemeV2FeedRequestBody({
      minCursorB64: options.minCursorB64,
      maxCursorB64: options.maxCursorB64,
      minCursorBytes: options.minCursorBytes,
      maxCursorBytes: options.maxCursorBytes
    }) as Uint8Array;
  }
  const bodyBuf = protobufBody?.length ? Buffer.from(protobufBody) : Buffer.alloc(0);

  const {
    pullType = 4,
    isNonPersonalized = 0,
    cmplEnc = 'unknown',
    trillDevice = {},
    timeout = 30000
  } = options;

  const params = getTrillFeedBaseParams({
    iid: parseCookieInstallId(cookie),
    install_id: parseCookieInstallId(cookie),
    device_id: parseCookieDeviceId(cookie),
    pull_type: pullType,
    is_non_personalized: isNonPersonalized,
    cmpl_enc: cmplEnc,
    ...trillDevice
  }) as Record<string, string | number | boolean>;

  const queryString = qs.stringify(params);
  const signatureHeaders = createMobileHeadersSignature({
    queryParams: queryString,
    bodyPayload: bodyBuf.length > 0 ? bodyBuf : undefined,
    cookies: cookie,
    aid: 1180,
    licenseId: TRILL_DEFAULT_LICENSE_ID,
    gorgonVersion: '8404',
    sdkVersion: 'v05.01.02-alpha.7-ov-android',
    sdkVersionInt: 83952160
  }) as Record<string, string | undefined>;

  const headers: Record<string, string> = {
    'User-Agent': 'com.ss.android.ugc.trill/440604 (Linux; U; Android 9; vi_VN; PGT-AN00; Build/PQ3A.190705.01301014;tt-ok/3.12.13.21)',
    'Accept-Encoding': 'gzip',
    'rpc-persist-pyxis-policy-v-tnc': '1',
    'sdk-version': '2',
    'x-tt-dm-status': 'login=0;ct=0;rt=7',
    'passport-sdk-version': '1',
    'content-type': 'application/x-protobuf',
    'x-vc-bdturing-sdk-version': '2.4.1.i18n',
    'x-tt-store-region': 'vn',
    'x-tt-store-region-src': 'did',
    Cookie: cookie
  };
  if (xTtToken) headers['x-tt-token'] = xTtToken;
  Object.entries(signatureHeaders).forEach(([key, value]) => {
    if (value) headers[key] = value;
  });

  const response = await axios.post(TIKTOK_API_URL.GET_AWEME_V2_FEED, bodyBuf, {
    params,
    headers,
    paramsSerializer: (inputParams) => qs.stringify(inputParams),
    timeout,
    responseType: 'arraybuffer',
    validateStatus: () => true
  });

  const contentType = String(response.headers['content-type'] || '');
  if (response.status >= 400) {
    const text = Buffer.from(response.data as ArrayBuffer).toString('utf8').slice(0, 300);
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const rawBuf = Buffer.from(response.data as ArrayBuffer);
  if (contentType.includes('protobuf') || (rawBuf.length > 0 && rawBuf[0] !== 0x7b && rawBuf[0] !== 0x5b)) {
    const parsed = parseAwemeV2FeedResponse(new Uint8Array(rawBuf)) as {
      aweme_list: JsonObject[];
      min_cursor_b64: string;
      max_cursor_b64: string;
      has_more: boolean;
      status_code: number;
    };
    const result: JsonObject = {
      awemeList: parsed.aweme_list.map(normalizeAwemeFromProto),
      pagination: {
        cursor: parsed.min_cursor_b64 || '',
        maxCursor: parsed.max_cursor_b64 || '',
        hasMore: parsed.has_more
      },
      feedSource: 'aweme-v2',
      responseKind: 'protobuf',
      protobufByteLength: rawBuf.length,
      statusCode: parsed.status_code
    };
    if (options.includeRawResponse) result.rawResponseBuffer = rawBuf;
    return result;
  }

  const responseData = JSON.parse(rawBuf.toString('utf8')) as JsonObject;
  if (typeof responseData.status_code === 'number' && responseData.status_code !== 0) {
    throw new Error(`TikTok API error: ${String(responseData.status_msg || 'Unknown error')} (code: ${responseData.status_code})`);
  }
  const awemeList = Array.isArray(responseData.aweme_list) ? responseData.aweme_list : [];
  const result: JsonObject = {
    awemeList: awemeList.map((item) => tiktokUtils.formatAwemeItemResponse(item as JsonObject)),
    pagination: {
      cursor: String(responseData.min_cursor || ''),
      maxCursor: String(responseData.max_cursor || ''),
      hasMore: Number(responseData.has_more || 0) === 1
    },
    feedSource: 'aweme-v2',
    responseKind: 'json'
  };
  if (options.includeRawResponse) result.rawResponseBuffer = rawBuf;
  return result;
}

async function getFYPFeedLiteFyp(options: FypOptions, credentials: { cookie: string; xTtToken?: string }): Promise<JsonObject> {
  const {
    sp = -1,
    type = 0,
    maxCursor = 0,
    minCursor = 0,
    count = 6,
    pullType = 0,
    isNonPersonalized = 0
  } = options;

  const cookie = credentials.cookie;
  const xTtToken = credentials.xTtToken || extractXttTokenFromCookie(cookie);
  const baseParams = getBaseMobileParams() as Record<string, string | number | boolean>;
  const params: Record<string, string> = {
    ...Object.fromEntries(Object.entries(baseParams).map(([k, v]) => [k, String(v)])),
    sp: String(sp),
    type: String(type),
    max_cursor: String(maxCursor),
    min_cursor: String(minCursor),
    count: String(count),
    pull_type: String(pullType),
    is_non_personalized: String(isNonPersonalized)
  };

  const queryString = qs.stringify(params);
  const signatureHeaders = createMobileHeadersSignature({
    queryParams: queryString,
    cookies: cookie
  }) as Record<string, string | undefined>;

  const headers: Record<string, string> = {
    'User-Agent': 'com.zhiliaoapp.musically.go/420004 (Linux; U; Android 9; vi_VN; 23113RKC6C; Build/PQ3A.190605.06171036;tt-ok/3.12.13.44.lite-ul)',
    'Accept-Encoding': 'gzip',
    'rpc-persist-pyxis-policy-v-tnc': '1',
    'x-ss-dp': '1340',
    'same-feed-id': '0',
    'sdk-version': '2',
    'passport-sdk-version': '-1',
    'x-tt-lite-gdp': '0',
    'x-tt-ultra-lite': '1',
    'x-vc-bdturing-sdk-version': '2.3.15.i18n',
    'x-tt-store-region': 'vn',
    'x-tt-store-region-src': 'uid',
    Cookie: cookie
  };
  if (xTtToken) headers['x-tt-token'] = xTtToken;
  Object.entries(signatureHeaders).forEach(([key, value]) => {
    if (value) headers[key] = value;
  });

  const { data: responseData } = await axios.get(TIKTOK_API_URL.GET_FYP_FEED, {
    params,
    headers,
    paramsSerializer: (inputParams) => qs.stringify(inputParams)
  });

  const response = responseData as JsonObject;
  if (typeof response.status_code === 'number' && response.status_code !== 0) {
    throw new Error(`TikTok API error: ${String(response.status_msg || 'Unknown error')} (code: ${response.status_code})`);
  }
  const awemeList = Array.isArray(response.aweme_list) ? response.aweme_list : [];
  return {
    awemeList: awemeList.map((item) => tiktokUtils.formatAwemeItemResponse(item as JsonObject)),
    pagination: {
      cursor: String(response.min_cursor || ''),
      maxCursor: String(response.max_cursor || ''),
      hasMore: Number(response.has_more || 0) === 1
    },
    feedSource: 'lite-fyp'
  };
}

const getFYPFeed = async (options: FypOptions = {}): Promise<JsonObject> => {
  try {
    const credentials = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials();
    const mode = options.feedMode ?? 'auto';

    if (mode === 'aweme-v2') return await getFYPFeedAwemeV2(options, credentials);
    if (mode === 'lite-fyp') return await getFYPFeedLiteFyp(options, credentials);

    try {
      return await getFYPFeedAwemeV2(options, credentials);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      if (options.awemeV2FallbackToLite !== false) {
        const lite = await getFYPFeedLiteFyp(options, credentials);
        return { ...lite, feedFallbackReason: reason };
      }
      throw error;
    }
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(
        `Failed to fetch FYP feed: HTTP ${error.response.status} - ${error.response.statusText || error.message}. Response: ${JSON.stringify(error.response?.data || {}).substring(0, 200)}`
      );
    }
    if (error instanceof Error) throw new Error(`Failed to fetch FYP feed: ${error.message}`);
    throw new Error('Failed to fetch FYP feed');
  }
};

export {
  getFYPFeed,
  getFYPFeedAwemeV2,
  getFYPFeedLiteFyp,
  resolveAwemeV2ProtobufBody,
  buildAwemeV2FeedRequestBody
};
export { parseAwemeV2FeedResponse } from '../utils/awemeV2ProtoParser.js';
export { parseTiktokV2FeedResponse, decodeProtobufWire } from '../utils/decodeProtobufResponse.js';
export { inferAwemeV2Response } from '../utils/protoFieldInfer.js';
export default getFYPFeed;
