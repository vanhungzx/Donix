import axios from 'axios'
import qs from 'qs'
import { TIKTOK_API_URL } from '../constants/index.js'
import createMobileHeadersSignature, { getBaseMobileParams } from '../tiktok-signer/signHeadersMobile.js'
import tiktokUtils from '../utils/tiktok.util.js'
import { extractXttTokenFromCookie, getTiktokCredentials, searchUserIdByUsername } from './helpers.js'
import type {
  BaseOptions,
  GetUserAwemeListOptions,
  TikTokUserInfo,
  FormattedAwemeItem,
  TikTokPagination,
  TikTokApiResponse
} from '../types/index.js'

interface GetUserAwemeListResult {
  awemeList: FormattedAwemeItem[]
  pagination: TikTokPagination
}

export const getUserInfoByUsername = async (
  username: string,
  options: BaseOptions = {}
): Promise<TikTokUserInfo> => {
  try {
    const userId = await searchUserIdByUsername(username, options)
    const { cookie, xTtToken } = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials()

    const baseParams = getBaseMobileParams()
    const params: Record<string, string | number> = {
      ...baseParams, sec_user_id: '', user_id: userId,
      unique_id: username, lite_flow_schedule: 'new'
    }

    const queryString = qs.stringify(params)
    const signatureHeaders = createMobileHeadersSignature({ queryParams: queryString, cookies: cookie ?? '' })
    const headers: Record<string, string> = {
      'User-Agent': 'com.zhiliaoapp.musically.go/420004 (Linux; U; Android 9; vi_VN; 23113RKC6C; Build/PQ3A.190605.06171036;tt-ok/3.12.13.44.lite-ul)',
      'Accept-Encoding': 'gzip', 'rpc-persist-pyxis-policy-v-tnc': '1', 'x-ss-dp': '1340',
      'sdk-version': '2', 'passport-sdk-version': '-1', 'x-tt-ultra-lite': '1',
      'x-vc-bdturing-sdk-version': '2.3.15.i18n', 'x-tt-store-region': 'vn',
      'x-tt-store-region-src': 'uid', 'ttzip-tlb': '1', Cookie: cookie ?? ''
    }

    const finalXttToken = xTtToken ?? extractXttTokenFromCookie(cookie ?? '')
    if (finalXttToken) headers['x-tt-token'] = finalXttToken
    Object.entries(signatureHeaders).forEach(([k, v]) => { if (v) headers[k] = v })

    const { data: responseData } = await axios.get<TikTokApiResponse>(TIKTOK_API_URL.GET_USER_INFO, {
      params, headers, paramsSerializer: (p) => qs.stringify(p, { encode: true })
    })

    if (responseData.status_code !== undefined && responseData.status_code !== 0) {
      throw new Error(
        `TikTok API error: ${responseData.status_msg ?? 'Unknown error'} (code: ${responseData.status_code})`
      )
    }

    const userInfo = responseData.user
    if (!userInfo || (userInfo.unique_id ?? '').toLowerCase() !== username.toLowerCase()) {
      throw new Error(
        `User ${username} not found. Response: ${JSON.stringify(responseData).substring(0, 200)}`
      )
    }

    return {
      uid: userInfo.uid ?? '',
      uniqueId: userInfo.unique_id ?? '',
      secUid: userInfo.sec_uid ?? '',
      followerCount: userInfo.follower_count,
      followingCount: userInfo.following_count,
      avatarUri:
        userInfo.avatar_larger?.url_list?.[0] ??
        userInfo.avatar_medium?.url_list?.[0] ??
        userInfo.avatar_thumb?.url_list?.[0] ??
        ''
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status) {
      throw new Error(
        `Failed to fetch user info: HTTP ${error.response.status} - ${error.response.statusText ?? error.message}`
      )
    }
    if (error instanceof Error) throw new Error(`Failed to fetch user info: ${error.message}`)
    throw new Error('Failed to fetch user info')
  }
}

export const getUserAwemeList = async (
  secUid: string,
  options: GetUserAwemeListOptions = {}
): Promise<GetUserAwemeListResult> => {
  try {
    const { maxCursor = '0', cursor = '0', userId, count = '9' } = options
    const credentials = options.cookie ? { cookie: options.cookie } : getTiktokCredentials()
    const cookies = credentials.cookie
    const xTtToken = credentials.xTtToken ?? extractXttTokenFromCookie(cookies)

    if (!userId) {
      throw new Error(
        'user_id is required for getUserAwemeList. Both user_id and sec_user_id are needed. Please provide userId in options or get it from getUserInfoByUsername first.'
      )
    }

    const baseParams = getBaseMobileParams()
    const params: Record<string, string> = {
      ...Object.fromEntries(Object.entries(baseParams).map(([k, v]) => [k, String(v)])),
      source: '0', max_cursor: maxCursor, cursor, sec_user_id: secUid,
      user_id: userId, count: count.toString(), filter_private: '1',
      lite_flow_schedule: 'new', cdn_cache_is_login: '1', cdn_cache_strategy: 'v0',
      data_saver_type: '1', data_saver_work: 'false', page_type: '2'
    }

    const queryString = qs.stringify(params)
    const signatureHeaders = createMobileHeadersSignature({ queryParams: queryString, cookies })
    const headers: Record<string, string> = {
      'User-Agent': 'com.zhiliaoapp.musically.go/420004 (Linux; U; Android 9; vi_VN; 23113RKC6C; Build/PQ3A.190605.06171036;tt-ok/3.12.13.44.lite-ul)',
      'Accept-Encoding': 'gzip', 'rpc-persist-pyxis-policy-v-tnc': '1', 'x-ss-dp': '1340',
      'cache-control': 'no-cache', 'sdk-version': '2', 'passport-sdk-version': '-1',
      'x-tt-ultra-lite': '1', 'x-vc-bdturing-sdk-version': '2.3.15.i18n',
      'x-tt-store-region': 'vn', 'x-tt-store-region-src': 'uid', 'ttzip-tlb': '1',
      Cookie: cookies
    }

    if (xTtToken) headers['x-tt-token'] = xTtToken
    Object.entries(signatureHeaders).forEach(([k, v]) => { if (v) headers[k] = v })

    const { data: responseData } = await axios.get<TikTokApiResponse>(TIKTOK_API_URL.GET_USER_AWEME_LIST, {
      params, headers, paramsSerializer: (p) => qs.stringify(p, { encode: true })
    })

    const hasMore = responseData.has_more === 1
    const awemeList = responseData.aweme_list ?? []
    const pagination: TikTokPagination = {
      cursor: responseData.min_cursor?.toString() ?? '',
      maxCursor: responseData.max_cursor?.toString() ?? '',
      hasMore
    }
    const formattedAwemeList = awemeList.map((item) => tiktokUtils.formatAwemeItemResponse(item))
    return { awemeList: formattedAwemeList, pagination }
  } catch {
    throw new Error('Failed to fetch user aweme list')
  }
}

export default { getUserInfoByUsername, getUserAwemeList }
