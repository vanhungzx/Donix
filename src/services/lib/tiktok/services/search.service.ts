import axios from 'axios'
import qs from 'qs'
import { TIKTOK_API_URL } from '../constants/index.js'
import createMobileHeadersSignature, { getBaseMobileParams } from '../tiktok-signer/signHeadersMobile.js'
import tiktokUtils, { parseTikTokData } from '../utils/tiktok.util.js'
import { extractXttTokenFromCookie, getTiktokCredentials } from './helpers.js'
import type {
  SearchOptions,
  SearchStreamOptions,
  SearchSingleOptions,
  SearchItemOptions,
  TikTokMusicFormatted,
  FormattedAwemeItem,
  ParsedAwemeItem,
  TikTokApiResponse,
  TikTokAwemeRaw
} from '../types/index.js'

const buildSearchHeaders = (cookie: string, xTtToken?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'User-Agent': 'com.zhiliaoapp.musically.go/420004 (Linux; U; Android 9; vi_VN; 23113RKC6C; Build/PQ3A.190605.06171036;tt-ok/3.12.13.44.lite-ul)',
    'Accept-Encoding': 'gzip', 'rpc-persist-pyxis-policy-v-tnc': '1',
    'x-ss-dp': '1340', 'x-tt-dataflow-id': '671088658', 'sdk-version': '2',
    'passport-sdk-version': '-1', 'x-tt-ultra-lite': '1',
    'x-vc-bdturing-sdk-version': '2.3.15.i18n', 'x-tt-store-region': 'vn',
    'x-tt-store-region-src': 'uid', 'ttzip-tlb': '1', Cookie: cookie
  }
  if (xTtToken) headers['x-tt-token'] = xTtToken
  return headers
}

interface SearchMusicResult {
  musicList: TikTokMusicFormatted[]
  cursor: number | string
  hasMore: boolean
  total: number
}

export const searchMusic = async (options: SearchOptions): Promise<SearchMusicResult> => {
  try {
    const {
      keyword, cursor = 0, count = 10, enterFrom = 'homepage_hot',
      queryCorrectType = 0, searchSource = 'switch_tab', searchId = '', requestTagFrom = 'h5'
    } = options

    const credentials = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials()
    const cookie = credentials.cookie
    const xTtToken = credentials.xTtToken ?? extractXttTokenFromCookie(cookie)

    const baseParams = getBaseMobileParams()
    const params: Record<string, string> = {
      ...Object.fromEntries(Object.entries(baseParams).map(([k, v]) => [k, String(v)])),
      cursor: cursor.toString(), enter_from: enterFrom, count: count.toString(),
      keyword, query_correct_type: queryCorrectType.toString(),
      search_source: searchSource, search_id: searchId, request_tag_from: requestTagFrom
    }

    const queryString = qs.stringify(params)
    const signatureHeaders = createMobileHeadersSignature({ queryParams: queryString, cookies: cookie })
    const headers = buildSearchHeaders(cookie, xTtToken)
    Object.entries(signatureHeaders).forEach(([k, v]) => { if (v) headers[k] = v })

    const { data: responseData } = await axios.get<TikTokApiResponse>(TIKTOK_API_URL.SEARCH_MUSIC, {
      params, headers, paramsSerializer: (p) => qs.stringify(p, { encode: true })
    })

    if (responseData.status_code !== undefined && responseData.status_code !== 0) {
      throw new Error(
        `TikTok API error: ${responseData.status_msg ?? 'Unknown error'} (code: ${responseData.status_code})`
      )
    }

    const musicList = responseData.music_list ?? responseData.music ?? []
    const hasMore = responseData.has_more === 1
    const total = responseData.total ?? 0
    const nextCursor = responseData.cursor ?? cursor

    const formattedMusicList: TikTokMusicFormatted[] = musicList.map((music) => ({
      id: String(music.music_id ?? music.id ?? ''),
      title: music.title ?? music.music_name ?? '',
      author: music.author ?? music.owner_nickname ?? '',
      coverUri:
        music.cover_medium?.url_list?.[0] ??
        music.cover_thumb?.url_list?.[0] ??
        music.cover_large?.url_list?.[0] ??
        '',
      duration: music.duration ?? 0,
      playUrl:
        (typeof music.play_url === 'string'
          ? music.play_url
          : music.play_url?.url_list?.[0]) ?? undefined
    }))

    return { musicList: formattedMusicList, cursor: nextCursor, hasMore, total }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status) {
      throw new Error(
        `Failed to search music: HTTP ${error.response.status} - ${error.response.statusText ?? error.message}. Response: ${JSON.stringify(error.response?.data ?? {}).substring(0, 200)}`
      )
    }
    if (error instanceof Error) throw new Error(`Failed to search music: ${error.message}`)
    throw new Error('Failed to search music')
  }
}

interface SearchAwemeResult {
  awemeList: FormattedAwemeItem[]
  cursor: number | string
  hasMore: boolean
  total: number
}

export const searchStream = async (options: SearchStreamOptions): Promise<SearchAwemeResult> => {
  try {
    const {
      keyword, cursor = 0, count = 10, enterFrom = 'homepage_hot',
      enableLiteWorkflow = 1, enableLiteCut = 1, backtrace = '', lastSearchId = '',
      endToEndSearchSessionId = '', queryCorrectType = 0, searchSource = 'normal_search',
      searchId = '', requestTagFrom = 'h5'
    } = options

    const credentials = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials()
    const cookie = credentials.cookie
    const xTtToken = credentials.xTtToken ?? extractXttTokenFromCookie(cookie)

    const baseParams = getBaseMobileParams()
    const params: Record<string, string> = {
      ...Object.fromEntries(Object.entries(baseParams).map(([k, v]) => [k, String(v)])),
      cursor: cursor.toString(), enable_lite_workflow: enableLiteWorkflow.toString(),
      enter_from: enterFrom, enable_lite_cut: enableLiteCut.toString(),
      count: count.toString(), keyword: encodeURIComponent(keyword),
      query_correct_type: queryCorrectType.toString(),
      search_source: searchSource, request_tag_from: requestTagFrom
    }

    if (backtrace !== undefined) params.backtrace = backtrace || ''
    if (lastSearchId) params.last_search_id = lastSearchId
    if (endToEndSearchSessionId) params.end_to_end_search_session_id = endToEndSearchSessionId
    if (searchId) params.search_id = searchId

    const queryString = qs.stringify(params)
    const signatureHeaders = createMobileHeadersSignature({ queryParams: queryString, cookies: cookie })
    const headers = buildSearchHeaders(cookie, xTtToken)
    Object.entries(signatureHeaders).forEach(([k, v]) => { if (v) headers[k] = v })

    const { data: rawResponse } = await axios.get(TIKTOK_API_URL.SEARCH_STREAM, {
      params, headers, paramsSerializer: (p) => qs.stringify(p, { encode: true })
    })
    const responseData = tiktokUtils.parseTiktokResponse(rawResponse) as TikTokApiResponse

    if (responseData.status_code !== undefined && responseData.status_code !== 0) {
      throw new Error(
        `TikTok API error: ${responseData.status_msg ?? 'Unknown error'} (code: ${responseData.status_code})`
      )
    }

    let awemeList: TikTokAwemeRaw[] = []
    if (responseData.data && Array.isArray(responseData.data)) {
      awemeList = responseData.data
        .filter((item) => item.type === 1 && item.aweme_info)
        .map((item) => item.aweme_info!)
    } else if (responseData.aweme_list) {
      awemeList = responseData.aweme_list
    }

    const hasMore = responseData.has_more === 1 || responseData.has_more === true
    const total = responseData.total ?? awemeList.length
    const nextCursor = responseData.cursor ?? cursor
    const formattedAwemeList = awemeList.map((item) => tiktokUtils.formatAwemeItemResponse(item))

    return { awemeList: formattedAwemeList, cursor: nextCursor, hasMore, total }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status) {
      throw new Error(
        `Failed to search stream: HTTP ${error.response.status} - ${error.response.statusText ?? error.message}. Response: ${JSON.stringify(error.response?.data ?? {}).substring(0, 200)}`
      )
    }
    if (error instanceof Error) throw new Error(`Failed to search stream: ${error.message}`)
    throw new Error('Failed to search stream')
  }
}

interface SearchSingleResult {
  awemeList: TikTokAwemeRaw[]
  cursor: number | string
  hasMore: boolean
  total: number
}

export const searchSingle = async (options: SearchSingleOptions): Promise<SearchSingleResult> => {
  try {
    const {
      keyword, cursor = 0, count = 10, enterFrom = 'homepage_hot',
      enableLiteWorkflow = 1, enableLiteCut = 1, backtrace = '', lastSearchId = '',
      endToEndSearchSessionId = '', queryCorrectType = 0, searchSource = 'normal_search',
      searchId = '', requestTagFrom = 'h5', beforeSetStateTime, isNonPersonalizedSearch = 0
    } = options

    const credentials = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials()
    const cookie = credentials.cookie
    const xTtToken = credentials.xTtToken ?? extractXttTokenFromCookie(cookie)

    const baseParams = getBaseMobileParams()
    const params: Record<string, string> = {
      ...Object.fromEntries(Object.entries(baseParams).map(([k, v]) => [k, String(v)])),
      cursor: cursor.toString(), enter_from: enterFrom,
      enable_lite_workflow: enableLiteWorkflow.toString(),
      enable_lite_cut: enableLiteCut.toString(), count: count.toString(), keyword,
      query_correct_type: queryCorrectType.toString(), search_source: searchSource,
      request_tag_from: requestTagFrom,
      is_non_personalized_search: isNonPersonalizedSearch.toString()
    }

    params.backtrace = backtrace !== undefined ? backtrace : ''
    if (lastSearchId) params.last_search_id = lastSearchId
    if (searchId) params.search_id = searchId
    if (endToEndSearchSessionId) params.end_to_end_search_session_id = endToEndSearchSessionId
    if (beforeSetStateTime !== undefined) params.beforeSetStateTime = beforeSetStateTime.toString()

    const queryString = qs.stringify(params)
    const signatureHeaders = createMobileHeadersSignature({ queryParams: queryString, cookies: cookie })
    const headers = buildSearchHeaders(cookie, xTtToken)
    Object.entries(signatureHeaders).forEach(([k, v]) => { if (v) headers[k] = v })

    const { data: rawResponse } = await axios.get(TIKTOK_API_URL.SEARCH_SINGLE, {
      params, headers, paramsSerializer: (p) => qs.stringify(p, { encode: true })
    })
    const responseData = tiktokUtils.parseTiktokResponse(rawResponse) as TikTokApiResponse

    if (responseData.status_code !== undefined && responseData.status_code !== 0) {
      throw new Error(
        `TikTok API error: ${responseData.status_msg ?? 'Unknown error'} (code: ${responseData.status_code})`
      )
    }

    let awemeList: TikTokAwemeRaw[] = []
    if (responseData.data && Array.isArray(responseData.data)) {
      awemeList = responseData.data
        .filter((item) => item.type === 1 && item.aweme_info)
        .map((item) => item.aweme_info!)
    } else if (responseData.aweme_list) {
      awemeList = responseData.aweme_list
    }

    const hasMore = responseData.has_more === 1 || responseData.has_more === true
    const total = responseData.total ?? awemeList.length
    const nextCursor = responseData.cursor ?? cursor

    return { awemeList, cursor: nextCursor, hasMore, total }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status) {
      throw new Error(
        `Failed to search single: HTTP ${error.response.status} - ${error.response.statusText ?? error.message}. Response: ${JSON.stringify(error.response?.data ?? {}).substring(0, 200)}`
      )
    }
    if (error instanceof Error) throw new Error(`Failed to search single: ${error.message}`)
    throw new Error('Failed to search single')
  }
}

interface SearchItemResult {
  awemeList: ParsedAwemeItem[]
  cursor: number | string
  hasMore: boolean
  total: number
}

export const searchItem = async (options: SearchItemOptions): Promise<SearchItemResult> => {
  try {
    const {
      keyword, cursor = 0, count = 10, enterFrom = 'homepage_hot',
      source = 'video_search', queryCorrectType = 0, searchSource = 'switch_tab',
      searchId = '', requestTagFrom = 'h5'
    } = options

    const credentials = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials()
    const cookie = credentials.cookie
    const xTtToken = credentials.xTtToken ?? extractXttTokenFromCookie(cookie)

    const baseParams = getBaseMobileParams()
    const params: Record<string, string> = {
      ...Object.fromEntries(Object.entries(baseParams).map(([k, v]) => [k, String(v)])),
      cursor: cursor.toString(), enter_from: enterFrom, count: count.toString(),
      source, keyword, query_correct_type: queryCorrectType.toString(),
      search_source: searchSource, request_tag_from: requestTagFrom
    }
    if (searchId) params.search_id = searchId

    const queryString = qs.stringify(params)
    const signatureHeaders = createMobileHeadersSignature({ queryParams: queryString, cookies: cookie })
    const headers = buildSearchHeaders(cookie, xTtToken)
    Object.entries(signatureHeaders).forEach(([k, v]) => { if (v) headers[k] = v })

    const { data: responseData } = await axios.get<TikTokApiResponse>(TIKTOK_API_URL.SEARCH_ITEM, {
      params, headers, paramsSerializer: (p) => qs.stringify(p, { encode: true })
    })

    if (responseData.status_code !== undefined && responseData.status_code !== 0) {
      throw new Error(
        `TikTok API error: ${responseData.status_msg ?? 'Unknown error'} (code: ${responseData.status_code})`
      )
    }

    const awemeListRaw = Array.isArray(responseData.aweme_list) ? responseData.aweme_list : []
    const awemeList = parseTikTokData(awemeListRaw)
    const hasMore = responseData.has_more === 1 || responseData.has_more === true
    const total = responseData.total ?? awemeList.length
    const nextCursor = responseData.cursor ?? cursor

    return { awemeList, cursor: nextCursor, hasMore, total }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status) {
      throw new Error(
        `Failed to search item: HTTP ${error.response.status} - ${error.response.statusText ?? error.message}. Response: ${JSON.stringify(error.response?.data ?? {}).substring(0, 200)}`
      )
    }
    if (error instanceof Error) throw new Error(`Failed to search item: ${error.message}`)
    throw new Error('Failed to search item')
  }
}

export default { searchMusic, searchStream, searchSingle, searchItem }
