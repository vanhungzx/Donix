import axios from 'axios';
import qs from 'qs';
import { TIKTOK_API_URL } from '../constants/index.js';
import createMobileHeadersSignature, { getBaseMobileParams } from '../tiktok-signer/signHeadersMobile.js';
import tiktokUtils, { parseTikTokData } from '../utils/tiktok.util.js';
import { extractXttTokenFromCookie, getTiktokCredentials } from './helpers.js';
import type { JsonObject, TikTokRequestOptions } from '../types.js';

type SearchOptions = TikTokRequestOptions & {
  keyword: string;
  cursor?: number;
  count?: number;
  enterFrom?: string;
  queryCorrectType?: number;
  searchSource?: string;
  searchId?: string;
  requestTagFrom?: string;
};

const buildHeaders = (cookie: string, xTtToken: string | undefined, signatureHeaders: Record<string, string | undefined>): Record<string, string> => {
  const headers: Record<string, string> = {
    'User-Agent': 'com.zhiliaoapp.musically.go/420004 (Linux; U; Android 9; vi_VN; 23113RKC6C; Build/PQ3A.190605.06171036;tt-ok/3.12.13.44.lite-ul)',
    'Accept-Encoding': 'gzip',
    'rpc-persist-pyxis-policy-v-tnc': '1',
    'x-ss-dp': '1340',
    'x-tt-dataflow-id': '671088658',
    'sdk-version': '2',
    'passport-sdk-version': '-1',
    'x-tt-ultra-lite': '1',
    'x-vc-bdturing-sdk-version': '2.3.15.i18n',
    'x-tt-store-region': 'vn',
    'x-tt-store-region-src': 'uid',
    'ttzip-tlb': '1',
    Cookie: cookie
  };
  if (xTtToken) headers['x-tt-token'] = xTtToken;
  Object.entries(signatureHeaders).forEach(([k, v]) => {
    if (v) headers[k] = v;
  });
  return headers;
};

const searchMusic = async (options: SearchOptions): Promise<JsonObject> => {
  try {
    const {
      keyword,
      cursor = 0,
      count = 10,
      enterFrom = 'homepage_hot',
      queryCorrectType = 0,
      searchSource = 'switch_tab',
      searchId = '',
      requestTagFrom = 'h5'
    } = options;

    const credentials = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials();
    const cookie = credentials.cookie;
    const xTtToken = credentials.xTtToken || extractXttTokenFromCookie(cookie);
    const baseParams = getBaseMobileParams() as Record<string, string | number | boolean>;
    const params: Record<string, string> = {
      ...Object.fromEntries(Object.entries(baseParams).map(([k, v]) => [k, String(v)])),
      cursor: String(cursor),
      enter_from: enterFrom,
      count: String(count),
      keyword,
      query_correct_type: String(queryCorrectType),
      search_source: searchSource,
      search_id: searchId,
      request_tag_from: requestTagFrom
    };

    const signatureHeaders = createMobileHeadersSignature({
      queryParams: qs.stringify(params),
      cookies: cookie
    }) as Record<string, string | undefined>;

    const { data: responseData } = await axios.get(TIKTOK_API_URL.SEARCH_MUSIC, {
      params,
      headers: buildHeaders(cookie, xTtToken, signatureHeaders),
      paramsSerializer: (inputParams) => qs.stringify(inputParams)
    });

    const response = responseData as JsonObject;
    if (typeof response.status_code === 'number' && response.status_code !== 0) {
      throw new Error(`TikTok API error: ${String(response.status_msg || 'Unknown error')} (code: ${response.status_code})`);
    }
    const musicList = Array.isArray(response.music_list) ? response.music_list : Array.isArray(response.music) ? response.music : [];
    return {
      musicList: musicList.map((music) => {
        const item = music as JsonObject;
        const coverMedium = (item.cover_medium || {}) as { url_list?: unknown[] };
        const coverThumb = (item.cover_thumb || {}) as { url_list?: unknown[] };
        const coverLarge = (item.cover_large || {}) as { url_list?: unknown[] };
        const playUrl = (item.play_url || {}) as { url_list?: unknown[] };
        return {
          id: String(item.music_id || item.id || ''),
          title: String(item.title || item.music_name || ''),
          author: String(item.author || item.owner_nickname || ''),
          coverUri: String(coverMedium.url_list?.[0] || coverThumb.url_list?.[0] || coverLarge.url_list?.[0] || ''),
          duration: Number(item.duration || 0),
          playUrl: String(playUrl.url_list?.[0] || item.play_url || '')
        };
      }),
      cursor: Number(response.cursor || cursor),
      hasMore: Number(response.has_more || 0) === 1,
      total: Number(response.total || 0)
    };
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(
        `Failed to search music: HTTP ${error.response.status} - ${error.response.statusText || error.message}. Response: ${JSON.stringify(error.response?.data || {}).substring(0, 200)}`
      );
    }
    if (error instanceof Error) throw new Error(`Failed to search music: ${error.message}`);
    throw new Error('Failed to search music');
  }
};

const searchStream = async (options: SearchOptions): Promise<JsonObject> => {
  const credentials = options.cookie
    ? { cookie: options.cookie, xTtToken: options.xTtToken }
    : getTiktokCredentials();
  const cookie = credentials.cookie;
  const xTtToken = credentials.xTtToken || extractXttTokenFromCookie(cookie);
  const baseParams = getBaseMobileParams() as Record<string, string | number | boolean>;
  const params: Record<string, string> = {
    ...Object.fromEntries(Object.entries(baseParams).map(([k, v]) => [k, String(v)])),
    cursor: String(options.cursor ?? 0),
    count: String(options.count ?? 10),
    keyword: options.keyword
  };

  const signatureHeaders = createMobileHeadersSignature({
    queryParams: qs.stringify(params),
    cookies: cookie
  }) as Record<string, string | undefined>;

  const { data: rawResponse } = await axios.get(TIKTOK_API_URL.SEARCH_STREAM, {
    params,
    headers: buildHeaders(cookie, xTtToken, signatureHeaders),
    paramsSerializer: (inputParams) => qs.stringify(inputParams)
  });
  const responseData = tiktokUtils.parseTiktokResponse(rawResponse) as JsonObject;
  if (typeof responseData.status_code === 'number' && responseData.status_code !== 0) {
    throw new Error(`TikTok API error: ${String(responseData.status_msg || 'Unknown error')} (code: ${responseData.status_code})`);
  }
  let awemeList: JsonObject[] = [];
  if (Array.isArray(responseData.data)) {
    awemeList = responseData.data
      .map((item) => item as JsonObject)
      .filter((item) => Number(item.type || 0) === 1 && Boolean(item.aweme_info))
      .map((item) => item.aweme_info as JsonObject);
  } else if (Array.isArray(responseData.aweme_list)) {
    awemeList = responseData.aweme_list as JsonObject[];
  }
  return {
    awemeList: awemeList.map((item) => tiktokUtils.formatAwemeItemResponse(item)),
    cursor: Number(responseData.cursor || options.cursor || 0),
    hasMore: Number(responseData.has_more || 0) === 1 || responseData.has_more === true,
    total: Number(responseData.total || awemeList.length)
  };
};

const searchSingle = async (options: SearchOptions): Promise<JsonObject> => {
  const credentials = options.cookie
    ? { cookie: options.cookie, xTtToken: options.xTtToken }
    : getTiktokCredentials();
  const cookie = credentials.cookie;
  const xTtToken = credentials.xTtToken || extractXttTokenFromCookie(cookie);
  const baseParams = getBaseMobileParams() as Record<string, string | number | boolean>;
  const params: Record<string, string> = {
    ...Object.fromEntries(Object.entries(baseParams).map(([k, v]) => [k, String(v)])),
    cursor: String(options.cursor ?? 0),
    count: String(options.count ?? 10),
    keyword: options.keyword
  };
  const signatureHeaders = createMobileHeadersSignature({
    queryParams: qs.stringify(params),
    cookies: cookie
  }) as Record<string, string | undefined>;
  const { data: rawResponse } = await axios.get(TIKTOK_API_URL.SEARCH_SINGLE, {
    params,
    headers: buildHeaders(cookie, xTtToken, signatureHeaders),
    paramsSerializer: (inputParams) => qs.stringify(inputParams)
  });
  const responseData = tiktokUtils.parseTiktokResponse(rawResponse) as JsonObject;
  let awemeList: JsonObject[] = [];
  if (Array.isArray(responseData.data)) {
    awemeList = responseData.data
      .map((item) => item as JsonObject)
      .filter((item) => Number(item.type || 0) === 1 && Boolean(item.aweme_info))
      .map((item) => item.aweme_info as JsonObject);
  } else if (Array.isArray(responseData.aweme_list)) {
    awemeList = responseData.aweme_list as JsonObject[];
  }
  return {
    awemeList,
    cursor: Number(responseData.cursor || options.cursor || 0),
    hasMore: Number(responseData.has_more || 0) === 1 || responseData.has_more === true,
    total: Number(responseData.total || awemeList.length)
  };
};

const searchItem = async (options: SearchOptions): Promise<JsonObject> => {
  const credentials = options.cookie
    ? { cookie: options.cookie, xTtToken: options.xTtToken }
    : getTiktokCredentials();
  const cookie = credentials.cookie;
  const xTtToken = credentials.xTtToken || extractXttTokenFromCookie(cookie);
  const baseParams = getBaseMobileParams() as Record<string, string | number | boolean>;
  const params: Record<string, string> = {
    ...Object.fromEntries(Object.entries(baseParams).map(([k, v]) => [k, String(v)])),
    cursor: String(options.cursor ?? 0),
    count: String(options.count ?? 10),
    keyword: options.keyword
  };
  const signatureHeaders = createMobileHeadersSignature({
    queryParams: qs.stringify(params),
    cookies: cookie
  }) as Record<string, string | undefined>;
  const { data: responseData } = await axios.get(TIKTOK_API_URL.SEARCH_ITEM, {
    params,
    headers: buildHeaders(cookie, xTtToken, signatureHeaders),
    paramsSerializer: (inputParams) => qs.stringify(inputParams)
  });
  const response = responseData as JsonObject;
  const rawAwemeList = Array.isArray(response.aweme_list) ? response.aweme_list : [];
  const awemeList = parseTikTokData(rawAwemeList as JsonObject[]);
  return {
    awemeList,
    cursor: Number(response.cursor || options.cursor || 0),
    hasMore: Number(response.has_more || 0) === 1 || response.has_more === true,
    total: Number(response.total || awemeList.length)
  };
};

export {
  searchMusic,
  searchStream,
  searchSingle,
  searchItem
};

export default {
  searchMusic,
  searchStream,
  searchSingle,
  searchItem
};
