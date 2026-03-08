import axios from 'axios'
import qs from 'qs'
import { TIKTOK_API_URL } from '../constants/index.js'
import createMobileHeadersSignature, { getBaseMobileParams } from '../tiktok-signer/signHeadersMobile.js'
import tiktokUtils from '../utils/tiktok.util.js'
import { extractXttTokenFromCookie, getTiktokCredentials } from './helpers.js'
import type {
  GetFYPFeedOptions,
  FormattedAwemeItem,
  TikTokPagination,
  TikTokApiResponse
} from '../types/index.js'

interface GetFYPFeedResult {
  awemeList: FormattedAwemeItem[]
  pagination: TikTokPagination
}

export const getFYPFeed = async (options: GetFYPFeedOptions = {}): Promise<GetFYPFeedResult> => {
  try {
    const {
      sp = -1, type = 0, maxCursor = 0, minCursor = 0, count = 6, volume = 0.33,
      pullType = 0, reqFrom = '', gaid = '', adUserAgent = '', filterWarn = 0,
      adPersonalityMode = 1, addressBookAccess = 1, localCache = '', localCacheType = '',
      lastAdShowInterval = -1, vpaContentChoice = 0, cmplEnc = '', mccMnc = '',
      isLiveReady = 0, feedId = '', brandAdActionType = 1, feedAecType = 0,
      dataSaverType = 1, dataSaverWork = false, replaceType = 0, isNonPersonalized = 0
    } = options

    const credentials = options.cookie ? { cookie: options.cookie } : getTiktokCredentials()
    const cookie = credentials.cookie
    const xTtToken = credentials.xTtToken ?? extractXttTokenFromCookie(cookie)

    const baseParams = getBaseMobileParams()
    const params: Record<string, string> = {
      ...Object.fromEntries(Object.entries(baseParams).map(([k, v]) => [k, String(v)])),
      sp: sp.toString(), type: type.toString(), max_cursor: maxCursor.toString(),
      min_cursor: minCursor.toString(), count: count.toString(), volume: volume.toString(),
      pull_type: pullType.toString(), req_from: reqFrom, gaid,
      ad_user_agent: adUserAgent, filter_warn: filterWarn.toString(),
      ad_personality_mode: adPersonalityMode.toString(),
      address_book_access: addressBookAccess.toString(), local_cache: localCache,
      local_cache_type: localCacheType, last_ad_show_interval: lastAdShowInterval.toString(),
      vpa_content_choice: vpaContentChoice.toString(), cmpl_enc: cmplEnc, mcc_mnc: mccMnc,
      is_live_ready: isLiveReady.toString(), feed_id: feedId,
      brand_ad_action_type: brandAdActionType.toString(),
      feed_aec_type: feedAecType.toString(), data_saver_type: dataSaverType.toString(),
      data_saver_work: dataSaverWork.toString(), replace_type: replaceType.toString(),
      is_non_personalized: isNonPersonalized.toString()
    }

    const queryString = qs.stringify(params, { encode: true })
    const bodyPayload = ''
    const signatureHeaders = createMobileHeadersSignature({ queryParams: queryString, bodyPayload, cookies: cookie })

    const headers: Record<string, string> = {
      'User-Agent': 'com.zhiliaoapp.musically.go/420004 (Linux; U; Android 9; vi_VN; 23113RKC6C; Build/PQ3A.190605.06171036;tt-ok/3.12.13.44.lite-ul)',
      'Accept-Encoding': 'gzip', 'Content-Type': 'application/octet-stream',
      'rpc-persist-pyxis-policy-v-tnc': '1', 'x-ss-dp': '1340',
      'x-bd-content-encoding': 'gzip', 'same-feed-id': '0', 'sdk-version': '2',
      'passport-sdk-version': '-1', 'x-tt-lite-gdp': '0', 'x-tt-ultra-lite': '1',
      'x-vc-bdturing-sdk-version': '2.3.15.i18n', 'x-tt-store-region': 'vn',
      'x-tt-store-region-src': 'uid', 'ttzip-tlb': '1', Cookie: cookie
    }

    if (xTtToken) headers['x-tt-token'] = xTtToken
    Object.entries(signatureHeaders).forEach(([k, v]) => { if (v) headers[k] = v })
    if (signatureHeaders['x-ss-stub']) headers['x-ss-stub'] = signatureHeaders['x-ss-stub']!

    const { data: responseData } = await axios.post<TikTokApiResponse>(
      TIKTOK_API_URL.GET_FYP_FEED, bodyPayload, {
        params, headers,
        paramsSerializer: (p) => qs.stringify(p, { encode: true })
      }
    )

    if (responseData.status_code !== undefined && responseData.status_code !== 0) {
      throw new Error(
        `TikTok API error: ${responseData.status_msg ?? 'Unknown error'} (code: ${responseData.status_code})`
      )
    }

    const hasMore = responseData.has_more === 1
    const awemeList = responseData.aweme_list ?? []
    const pagination: TikTokPagination = {
      cursor: responseData.min_cursor?.toString() ?? '',
      maxCursor: responseData.max_cursor?.toString() ?? '',
      hasMore
    }
    const formattedAwemeList = awemeList.map((item) => tiktokUtils.formatAwemeItemResponse(item))
    return { awemeList: formattedAwemeList, pagination }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status) {
      throw new Error(
        `Failed to fetch FYP feed: HTTP ${error.response.status} - ${error.response.statusText ?? error.message}. Response: ${JSON.stringify(error.response?.data ?? {}).substring(0, 200)}`
      )
    }
    if (error instanceof Error) throw new Error(`Failed to fetch FYP feed: ${error.message}`)
    throw new Error('Failed to fetch FYP feed')
  }
}

export default getFYPFeed
