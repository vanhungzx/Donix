import axios from 'axios'
import qs from 'qs'
import { TIKTOK_API_URL } from '../constants/index.js'
import createMobileHeadersSignature, { getBaseMobileParams } from '../tiktok-signer/signHeadersMobile.js'
import tiktokUtils, { parseTikTokData } from '../utils/tiktok.util.js'
import { extractXttTokenFromCookie, getTiktokCredentials } from './helpers.js'
import type {
  GetAwemeDetailsOptions,
  GetMultiAwemeDetailsOptions,
  ParsedAwemeItem,
  FormattedAwemeItem,
  TikTokApiResponse
} from '../types/index.js'

export const getAwemeDetails = async (
  awemeId: string,
  options: GetAwemeDetailsOptions = {}
): Promise<ParsedAwemeItem> => {
  try {
    const { originType = 'chat', requestSource = '0' } = options
    const credentials = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials()
    const cookie = credentials.cookie
    const xTtToken = credentials.xTtToken ?? extractXttTokenFromCookie(cookie)

    const baseParams = getBaseMobileParams()
    const queryParams: Record<string, string | number> = { ...baseParams }
    const queryString = qs.stringify(queryParams, { encode: true })
    const bodyParams = {
      aweme_ids: `[${awemeId}]`,
      origin_type: originType,
      request_source: requestSource
    }
    const bodyPayload = qs.stringify(bodyParams, { encode: true })
    const signatureHeaders = createMobileHeadersSignature({ queryParams: queryString, bodyPayload, cookies: cookie })

    const headers: Record<string, string> = {
      'User-Agent': 'com.zhiliaoapp.musically.go/420004 (Linux; U; Android 9; vi_VN; 23113RKC6C; Build/PQ3A.190605.06171036;tt-ok/3.12.13.44.lite-ul)',
      'Accept-Encoding': 'gzip',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'rpc-persist-pyxis-policy-v-tnc': '1', 'x-ss-dp': '1340', 'sdk-version': '2',
      'passport-sdk-version': '-1', 'x-tt-ultra-lite': '1',
      'x-vc-bdturing-sdk-version': '2.3.15.i18n', 'x-tt-store-region': 'vn',
      'x-tt-store-region-src': 'uid', 'ttzip-tlb': '1', Cookie: cookie
    }

    const finalXttToken = xTtToken ?? extractXttTokenFromCookie(cookie)
    if (finalXttToken) headers['x-tt-token'] = finalXttToken
    Object.entries(signatureHeaders).forEach(([k, v]) => { if (v) headers[k] = v })
    if (signatureHeaders['x-ss-stub']) headers['x-ss-stub'] = signatureHeaders['x-ss-stub']!

    const { data: responseData } = await axios.post<TikTokApiResponse>(
      TIKTOK_API_URL.GET_AWEME_DETAIL, bodyPayload, {
        params: queryParams, headers,
        paramsSerializer: (p) => qs.stringify(p, { encode: true })
      }
    )

    if (responseData.status_code !== undefined && responseData.status_code !== 0) {
      throw new Error(
        `TikTok API error: ${responseData.status_msg ?? 'Unknown error'} (code: ${responseData.status_code})`
      )
    }

    const awemeList = responseData.aweme_details ?? []
    const awemeDetail = awemeList.find((item) => item.aweme_id === awemeId)
    if (!awemeDetail) {
      throw new Error(`Aweme detail not found. Response: ${JSON.stringify(responseData).substring(0, 200)}`)
    }

    const parsedList = parseTikTokData([awemeDetail])

    const parsed = parsedList[0]
    if (!parsed) throw new Error('Failed to parse aweme detail')

    return parsed
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(
        `Failed to fetch aweme details: HTTP ${error.response.status} - ${error.response.statusText ?? error.message}`
      )
    }
    if (error instanceof Error) throw new Error(`Failed to fetch aweme details: ${error.message}`)
    throw new Error('Failed to fetch aweme details')
  }
}

export const getMultiAwemeDetails = async (
  options: GetMultiAwemeDetailsOptions
): Promise<FormattedAwemeItem[]> => {
  try {
    const { awemeIds, requestSource = '0', shareLinkMode = 0, shareScene = 1 } = options
    const credentials = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials()
    const cookie = credentials.cookie
    const xTtToken = credentials.xTtToken ?? extractXttTokenFromCookie(cookie)

    const params: Record<string, string> = {
      share_link_mode: shareLinkMode.toString(), share_scene: shareScene.toString(),
      device_platform: 'android', os: 'android', ssmix: 'a', channel: 'beta',
      aid: '1233', app_name: 'musical_ly', version_code: '430115', version_name: '43.1.15',
      manifest_version_code: '2024301150', update_version_code: '2024301150',
      ab_version: '43.1.15', resolution: '900*1600', dpi: '320', device_type: 'V2241A',
      device_brand: 'vivo', language: 'en', os_api: '28', os_version: '9', ac: 'wifi',
      is_pad: '0', current_region: 'VN', app_type: 'normal', sys_region: 'US',
      last_install_time: '1766578207', mcc_mnc: '45201', timezone_name: 'Asia/Ho_Chi_Minh',
      carrier_region_v2: '452', residence: 'VN', app_language: 'en', carrier_region: 'VN',
      timezone_offset: '25200', host_abi: 'arm64-v8a', locale: 'en', ac2: 'wifi', uoo: '1',
      op_region: 'VN', build_number: '43.1.15', region: 'US',
      ts: Math.floor(Date.now() / 1000).toString(),
      iid: '7587395578385532679', device_id: '7570307892130170376',
      _rticket: Date.now().toString()
    }

    const queryString = qs.stringify(params, { encode: true })
    const bodyParams = {
      aweme_ids: `[${awemeIds.join(',')}]`,
      request_source: requestSource
    }
    const bodyPayload = qs.stringify(bodyParams, { encode: true })
    const signatureHeaders = createMobileHeadersSignature({ queryParams: queryString, bodyPayload, cookies: cookie })

    const headers: Record<string, string> = {
      Host: 'api22-normal-c-alisg.tiktokv.com', Connection: 'Keep-Alive',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept-Encoding': 'gzip',
      'User-Agent': 'com.zhiliaoapp.musically/2024301150 (Linux; U; Android 9; en; V2241A; Build/PQ3A.190705.05211459;tt-ok/3.12.13.21)',
      'rpc-persist-pyxis-policy-v-tnc': '1', 'x-tt-pba-enable': '1',
      'x-tt-dm-status': 'login=0;ct=1;rt=101', 'sdk-version': '2', 'passport-sdk-version': '1',
      'oec-cs-si-a': '1', 'oec-cs-sdk-version': 'v10.01.17-ov-android_V27',
      'x-vc-bdturing-sdk-version': '2.3.17.i18n',
      'rpc-persist-pns-region-1': 'VN|1562822', 'rpc-persist-pns-region-2': 'VN|1562822',
      'rpc-persist-pns-region-3': 'VN|1562822|1580578', 'oec-vc-sdk-version': '3.2.1.i18n',
      'x-tt-request-tag': 'n=0;nr=011;bg=0', 'x-tt-store-region': 'vn',
      'x-tt-store-region-src': 'local', Cookie: cookie
    }

    if (xTtToken) headers['x-tt-token'] = xTtToken
    Object.entries(signatureHeaders).forEach(([k, v]) => { if (v) headers[k] = v })
    if (signatureHeaders['x-ss-req-ticket']) headers['X-SS-REQ-TICKET'] = signatureHeaders['x-ss-req-ticket']!

    const { data: responseData } = await axios.post<TikTokApiResponse>(
      TIKTOK_API_URL.GET_MULTI_AWEME_DETAIL, bodyPayload, {
        params, headers,
        paramsSerializer: (p) => qs.stringify(p, { encode: true })
      }
    )

    if (responseData.status_code !== undefined && responseData.status_code !== 0) {
      throw new Error(
        `TikTok API error: ${responseData.status_msg ?? 'Unknown error'} (code: ${responseData.status_code})`
      )
    }

    const awemeList = responseData.aweme_list ?? []
    return awemeList.map((item) => tiktokUtils.formatAwemeItemResponse(item))
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(
        `Failed to fetch multi aweme details: HTTP ${error.response.status} - ${error.response.statusText ?? error.message}. Response: ${JSON.stringify(error.response?.data ?? {}).substring(0, 200)}`
      )
    }
    if (error instanceof Error) throw new Error(`Failed to fetch multi aweme details: ${error.message}`)
    throw new Error('Failed to fetch multi aweme details')
  }
}

export default { getAwemeDetails, getMultiAwemeDetails }
