import axios from 'axios';
import qs from 'qs';
import { TIKTOK_API_URL } from '../constants/index.js';
import createMobileHeadersSignature, { getBaseMobileParams } from '../tiktok-signer/signHeadersMobile.js';
import tiktokUtils from '../utils/tiktok.util.js';
import { extractXttTokenFromCookie, getTiktokCredentials, searchUserIdByUsername } from './helpers.js';
import type { JsonObject, TikTokAwemeListOptions, TikTokRequestOptions, TikTokUserInfo } from '../types.js';

const getUserInfoByUsername = async (username: string, options: TikTokRequestOptions = {}): Promise<TikTokUserInfo> => {
  try {
    const userId = await searchUserIdByUsername(username, options);
    const { cookie, xTtToken } = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials();

    const baseParams = getBaseMobileParams() as Record<string, string>;
    const params: Record<string, string> = {
      ...baseParams,
      sec_user_id: '',
      user_id: userId,
      unique_id: username,
      lite_flow_schedule: 'new'
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
      'sdk-version': '2',
      'passport-sdk-version': '-1',
      'x-tt-ultra-lite': '1',
      'x-vc-bdturing-sdk-version': '2.3.15.i18n',
      'x-tt-store-region': 'vn',
      'x-tt-store-region-src': 'uid',
      'ttzip-tlb': '1',
      Cookie: cookie
    };
    const finalXttToken = xTtToken || extractXttTokenFromCookie(cookie);
    if (finalXttToken) headers['x-tt-token'] = finalXttToken;
    Object.entries(signatureHeaders).forEach(([k, v]) => {
      if (v) headers[k] = v;
    });

    const { data: responseData } = await axios.get(TIKTOK_API_URL.GET_USER_INFO, {
      params,
      headers,
      paramsSerializer: (inputParams) => qs.stringify(inputParams)
    });

    const response = responseData as JsonObject;
    if (typeof response.status_code === 'number' && response.status_code !== 0) {
      throw new Error(`TikTok API error: ${String(response.status_msg || 'Unknown error')} (code: ${response.status_code})`);
    }

    const userInfo = (response.user || {}) as Record<string, unknown>;
    const uniqueId = String(userInfo.unique_id || '');
    if (!uniqueId || uniqueId.toLowerCase() !== username.toLowerCase()) {
      throw new Error(`User ${username} not found.`);
    }

    const avatarLarger = (userInfo.avatar_larger || {}) as { url_list?: unknown[] };
    const avatarMedium = (userInfo.avatar_medium || {}) as { url_list?: unknown[] };
    const avatarThumb = (userInfo.avatar_thumb || {}) as { url_list?: unknown[] };
    return {
      uid: String(userInfo.uid || ''),
      uniqueId,
      secUid: String(userInfo.sec_uid || ''),
      followerCount: Number(userInfo.follower_count || 0),
      followingCount: Number(userInfo.following_count || 0),
      avatarUri: String(avatarLarger.url_list?.[0] || avatarMedium.url_list?.[0] || avatarThumb.url_list?.[0] || '')
    };
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(`Failed to fetch user info: HTTP ${error.response.status} - ${error.response.statusText || error.message}`);
    }
    if (error instanceof Error) throw new Error(`Failed to fetch user info: ${error.message}`);
    throw new Error('Failed to fetch user info');
  }
};

const getUserAwemeList = async (secUid: string, options: TikTokAwemeListOptions = {}): Promise<{ awemeList: unknown[]; pagination: { cursor: string; maxCursor: string; hasMore: boolean } }> => {
  try {
    const { maxCursor = '0', cursor = '0', userId, count = '9' } = options;
    const credentials = options.cookie ? { cookie: options.cookie, xTtToken: options.xTtToken } : getTiktokCredentials();
    const cookies = credentials.cookie;
    const xTtToken = credentials.xTtToken || extractXttTokenFromCookie(cookies);

    if (!userId) {
      throw new Error('user_id is required for getUserAwemeList.');
    }

    const baseParams = getBaseMobileParams() as Record<string, string | number | boolean>;
    const params: Record<string, string> = {
      ...Object.fromEntries(Object.entries(baseParams).map(([k, v]) => [k, String(v)])),
      source: '0',
      max_cursor: maxCursor,
      cursor,
      sec_user_id: secUid,
      user_id: userId,
      count: String(count),
      filter_private: '1',
      lite_flow_schedule: 'new',
      cdn_cache_is_login: '1',
      cdn_cache_strategy: 'v0',
      data_saver_type: '1',
      data_saver_work: 'false',
      page_type: '2'
    };

    const queryString = qs.stringify(params);
    const signatureHeaders = createMobileHeadersSignature({ queryParams: queryString, cookies }) as Record<string, string | undefined>;
    const headers: Record<string, string> = {
      'User-Agent': 'com.zhiliaoapp.musically.go/420004 (Linux; U; Android 9; vi_VN; 23113RKC6C; Build/PQ3A.190605.06171036;tt-ok/3.12.13.44.lite-ul)',
      'Accept-Encoding': 'gzip',
      'rpc-persist-pyxis-policy-v-tnc': '1',
      'x-ss-dp': '1340',
      'cache-control': 'no-cache',
      'sdk-version': '2',
      'passport-sdk-version': '-1',
      'x-tt-ultra-lite': '1',
      'x-vc-bdturing-sdk-version': '2.3.15.i18n',
      'x-tt-store-region': 'vn',
      'x-tt-store-region-src': 'uid',
      'ttzip-tlb': '1',
      Cookie: cookies
    };
    if (xTtToken) headers['x-tt-token'] = xTtToken;
    Object.entries(signatureHeaders).forEach(([k, v]) => {
      if (v) headers[k] = v;
    });

    const { data: responseData } = await axios.get(TIKTOK_API_URL.GET_USER_AWEME_LIST, {
      params,
      headers,
      paramsSerializer: (inputParams) => qs.stringify(inputParams)
    });

    const response = responseData as JsonObject;
    const hasMore = Number(response.has_more || 0) === 1;
    const awemeList = Array.isArray(response.aweme_list) ? response.aweme_list : [];
    return {
      awemeList: awemeList.map((item) => tiktokUtils.formatAwemeItemResponse(item as JsonObject)),
      pagination: {
        cursor: String(response.min_cursor || ''),
        maxCursor: String(response.max_cursor || ''),
        hasMore
      }
    };
  } catch {
    throw new Error('Failed to fetch user aweme list');
  }
};

export { getUserInfoByUsername, getUserAwemeList };
export default {
  getUserInfoByUsername,
  getUserAwemeList
};
