import axios from 'axios'
import qs from 'qs'
import { TIKTOK_API_URL } from '../constants/index.js'
import createMobileHeadersSignature, { getBaseMobileParams } from '../tiktok-signer/signHeadersMobile.js'
import { extractXttTokenFromCookie, getTiktokCredentials } from './helpers.js'
import type {
  GetCommentListOptions,
  TikTokComment,
  TikTokCommentUser,
  TikTokReply,
  TikTokApiResponse,
  TikTokCommentRaw
} from '../types/index.js'

interface GetCommentListResult {
  comments: TikTokComment[]
  cursor: number | string
  hasMore: boolean
  total: number
}

const buildCommentUser = (raw: TikTokCommentRaw): TikTokCommentUser => ({
  uid: raw.user?.uid ?? raw.user_id ?? '',
  uniqueId: raw.user?.unique_id ?? raw.user?.uniqueId ?? '',
  nickname: raw.user?.nickname ?? raw.user?.nick_name ?? '',
  avatarUri:
    raw.user?.avatar_thumb?.url_list?.[0] ??
    raw.user?.avatar_medium?.url_list?.[0] ??
    raw.user?.avatar_larger?.url_list?.[0] ??
    ''
})

const buildReply = (reply: TikTokCommentRaw): TikTokReply => ({
  cid: reply.cid ?? reply.comment_id ?? '',
  text: reply.text ?? reply.comment_text ?? '',
  createTime: reply.create_time ?? 0,
  diggCount: reply.digg_count ?? reply.like_count ?? 0,
  replyCount: reply.reply_count ?? 0,
  user: buildCommentUser(reply)
})

export const getCommentList = async (options: GetCommentListOptions): Promise<GetCommentListResult> => {
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
    } = options

    const credentials = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials()
    const cookie = credentials.cookie
    const xTtToken = credentials.xTtToken ?? extractXttTokenFromCookie(cookie)

    const baseParams = getBaseMobileParams()
    const params: Record<string, string> = {
      ...Object.fromEntries(Object.entries(baseParams).map(([k, v]) => [k, String(v)])),
      aweme_id: awemeId,
      cursor: cursor.toString(),
      count: count.toString(),
      enter_from: enterFrom,
      lite_flow_schedule: liteFlowSchedule,
      cdn_cache_is_login: cdnCacheIsLogin.toString(),
      cdn_cache_strategy: cdnCacheStrategy,
      is_non_personalized: isNonPersonalized.toString()
    }

    const queryString = qs.stringify(params)
    const signatureHeaders = createMobileHeadersSignature({ queryParams: queryString, cookies: cookie })
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
    }

    if (xTtToken) headers['x-tt-token'] = xTtToken
    Object.entries(signatureHeaders).forEach(([k, v]) => { if (v) headers[k] = v })

    const { data: responseData } = await axios.get<TikTokApiResponse>(TIKTOK_API_URL.GET_COMMENT_LIST, {
      params,
      headers,
      paramsSerializer: (p) => qs.stringify(p, { encode: true })
    })

    if (responseData.status_code !== undefined && responseData.status_code !== 0) {
      throw new Error(
        `TikTok API error: ${responseData.status_msg ?? 'Unknown error'} (code: ${responseData.status_code})`
      )
    }

    const comments = responseData.comments ?? []
    const hasMore = responseData.has_more === 1
    const total = responseData.total ?? 0
    const nextCursor = responseData.cursor ?? cursor

    const formattedComments: TikTokComment[] = comments.map((comment) => ({
      cid: comment.cid ?? comment.comment_id ?? '',
      text: comment.text ?? comment.comment_text ?? '',
      createTime: comment.create_time ?? 0,
      diggCount: comment.digg_count ?? comment.like_count ?? 0,
      replyCount: comment.reply_count ?? 0,
      user: buildCommentUser(comment),
      replyComment: (comment.reply_comment ?? []).map(buildReply)
    }))

    return { comments: formattedComments, cursor: nextCursor, hasMore, total }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status) {
      throw new Error(
        `Failed to fetch comment list: HTTP ${error.response.status} - ${error.response.statusText ?? error.message}. Response: ${JSON.stringify(error.response?.data ?? {}).substring(0, 200)}`
      )
    }
    if (error instanceof Error) throw new Error(`Failed to fetch comment list: ${error.message}`)
    throw new Error('Failed to fetch comment list')
  }
}

export default getCommentList
