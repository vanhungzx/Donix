import axios from 'axios';
import qs from 'qs';
import { TIKTOK_API_URL } from '../constants/index.js';
import createMobileHeadersSignature, { getBaseMobileParams } from '../tiktok-signer/signHeadersMobile.js';
import { extractXttTokenFromCookie, getTiktokCredentials } from './helpers.js';
import type { JsonObject, TikTokRequestOptions } from '../types.js';

type CommentListOptions = TikTokRequestOptions & {
  awemeId: string;
  cursor?: number;
  count?: number;
  enterFrom?: string;
  liteFlowSchedule?: string;
  cdnCacheIsLogin?: number;
  cdnCacheStrategy?: string;
  isNonPersonalized?: number;
};

const getCommentList = async (options: CommentListOptions): Promise<JsonObject> => {
  try {
    const {
      awemeId,
      cursor = 0,
      count = 10,
      enterFrom = 'tiktok_lite',
      liteFlowSchedule = 'new',
      cdnCacheIsLogin = 1,
      cdnCacheStrategy = 'v0',
      isNonPersonalized = 0
    } = options;

    const credentials = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials();
    const cookie = credentials.cookie;
    const xTtToken = credentials.xTtToken || extractXttTokenFromCookie(cookie);

    const baseParams = getBaseMobileParams() as Record<string, string | number | boolean>;
    const params: Record<string, string> = {
      ...Object.fromEntries(Object.entries(baseParams).map(([k, v]) => [k, String(v)])),
      aweme_id: awemeId,
      cursor: String(cursor),
      count: String(count),
      enter_from: enterFrom,
      lite_flow_schedule: liteFlowSchedule,
      cdn_cache_is_login: String(cdnCacheIsLogin),
      cdn_cache_strategy: cdnCacheStrategy,
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

    const { data: responseData } = await axios.get(TIKTOK_API_URL.GET_COMMENT_LIST, {
      params,
      headers,
      paramsSerializer: (inputParams) => qs.stringify(inputParams)
    });

    const response = responseData as JsonObject;
    if (typeof response.status_code === 'number' && response.status_code !== 0) {
      throw new Error(`TikTok API error: ${String(response.status_msg || 'Unknown error')} (code: ${response.status_code})`);
    }

    const comments = Array.isArray(response.comments) ? response.comments : [];
    const formattedComments = comments.map((comment) => {
      const item = comment as JsonObject;
      const user = (item.user || {}) as JsonObject;
      const avatarThumb = (user.avatar_thumb || {}) as { url_list?: unknown[] };
      const avatarMedium = (user.avatar_medium || {}) as { url_list?: unknown[] };
      const avatarLarger = (user.avatar_larger || {}) as { url_list?: unknown[] };
      const replies = Array.isArray(item.reply_comment) ? item.reply_comment : [];
      return {
        cid: String(item.cid || item.comment_id || ''),
        text: String(item.text || item.comment_text || ''),
        createTime: Number(item.create_time || 0),
        diggCount: Number(item.digg_count || item.like_count || 0),
        replyCount: Number(item.reply_count || 0),
        user: {
          uid: String(user.uid || item.user_id || ''),
          uniqueId: String(user.unique_id || user.uniqueId || ''),
          nickname: String(user.nickname || user.nick_name || ''),
          avatarUri: String(avatarThumb.url_list?.[0] || avatarMedium.url_list?.[0] || avatarLarger.url_list?.[0] || '')
        },
        replyComment: replies.map((replyItem) => {
          const reply = replyItem as JsonObject;
          const replyUser = (reply.user || {}) as JsonObject;
          const rThumb = (replyUser.avatar_thumb || {}) as { url_list?: unknown[] };
          const rMedium = (replyUser.avatar_medium || {}) as { url_list?: unknown[] };
          const rLarger = (replyUser.avatar_larger || {}) as { url_list?: unknown[] };
          return {
            cid: String(reply.cid || reply.comment_id || ''),
            text: String(reply.text || reply.comment_text || ''),
            createTime: Number(reply.create_time || 0),
            diggCount: Number(reply.digg_count || reply.like_count || 0),
            replyCount: Number(reply.reply_count || 0),
            user: {
              uid: String(replyUser.uid || reply.user_id || ''),
              uniqueId: String(replyUser.unique_id || replyUser.uniqueId || ''),
              nickname: String(replyUser.nickname || replyUser.nick_name || ''),
              avatarUri: String(rThumb.url_list?.[0] || rMedium.url_list?.[0] || rLarger.url_list?.[0] || '')
            }
          };
        })
      };
    });

    return {
      comments: formattedComments,
      cursor: Number(response.cursor || cursor),
      hasMore: Number(response.has_more || 0) === 1,
      total: Number(response.total || 0)
    };
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(
        `Failed to fetch comment list: HTTP ${error.response.status} - ${error.response.statusText || error.message}. Response: ${JSON.stringify(error.response?.data || {}).substring(0, 200)}`
      );
    }
    if (error instanceof Error) throw new Error(`Failed to fetch comment list: ${error.message}`);
    throw new Error('Failed to fetch comment list');
  }
};

export { getCommentList };
export default getCommentList;
