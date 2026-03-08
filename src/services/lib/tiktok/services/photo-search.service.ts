import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import qs from 'qs'
import { TIKTOK_API_URL } from '../constants/index.js'
import createMobileHeadersSignature from '../tiktok-signer/signHeadersMobile.js'
import { extractXttTokenFromCookie, getTiktokCredentials } from './helpers.js'
import type { SearchPhotoEcomOptions, TikTokApiResponse } from '../types/index.js'

export const searchPhotoEcom = async (options: SearchPhotoEcomOptions): Promise<TikTokApiResponse> => {
  try {
    const { imagePath, cursor = 0, count = 6 } = options

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`)
    }

    const credentials = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials()
    const cookie = credentials.cookie
    const xTtToken = credentials.xTtToken ?? extractXttTokenFromCookie(cookie)

    const searchSessionId = Date.now().toString()
    const clientRequestId = `757030789213017037699512c4b-64f0-4584-81e4-0ad35f612104${Date.now()}`

    const formFields: Record<string, string> = {
      search_channel: 'tiktok_mall_photo_search',
      cursor: cursor.toString(),
      keyword: '',
      enter_from: 'mall',
      count: count.toString(),
      hot_search: '0',
      search_id: '',
      last_search_id: '',
      source: 'mall',
      search_source: 'choose_album',
      query_correct_type: '1',
      search_context: '',
      attach_products: '',
      traffic_source_list: '6',
      ec_search_session_id: searchSessionId,
      search_session_id: searchSessionId,
      recall_shield: '0',
      photo_search_extra: '{"photo_search_type":0}',
      end_to_end_search_session_id: '5421689403811676884',
      device_level: '3',
      is_low_device: '0',
      is_weak_network: '0',
      user_interaction_type: '1',
      section_cursor: '0',
      enter_from_second: 'mall',
      root_enter_from_type: '8',
      client_request_id: clientRequestId
    }

    const form = new FormData()
    form.append('image', fs.createReadStream(imagePath), {
      filename: 'image.jpg',
      contentType: 'image/jpeg'
    })
    Object.entries(formFields).forEach(([key, value]) => form.append(key, value))

    const params: Record<string, string> = {
      key_preload_hash: '895646907', preload: '1', device_platform: 'android',
      os: 'android', ssmix: 'a', _rticket: Date.now().toString(), channel: 'beta',
      aid: '1233', app_name: 'musical_ly', version_code: '430115', version_name: '43.1.15',
      manifest_version_code: '2024301150', update_version_code: '2024301150',
      ab_version: '43.1.15', resolution: '900*1600', dpi: '320', device_type: 'V2241A',
      device_brand: 'vivo', language: 'en', os_api: '28', os_version: '9', ac: 'wifi',
      is_pad: '0', current_region: 'VN', app_type: 'normal', sys_region: 'US',
      last_install_time: '1766578207', mcc_mnc: '45201', timezone_name: 'Asia/Ho_Chi_Minh',
      carrier_region_v2: '452', residence: 'VN', app_language: 'en', carrier_region: 'VN',
      timezone_offset: '25200', host_abi: 'arm64-v8a', locale: 'en', ac2: 'wifi', uoo: '0',
      op_region: 'VN', build_number: '43.1.15', region: 'US',
      ts: Math.floor(Date.now() / 1000).toString(),
      iid: '7587395578385532679', device_id: '7570307892130170376'
    }

    const queryString = qs.stringify(params, { encode: true })
    const bodyPayload = qs.stringify(formFields, { encode: true })
    const signatureHeaders = createMobileHeadersSignature({ queryParams: queryString, bodyPayload, cookies: cookie })

    const headers: Record<string, string> = {
      Host: 'search22-normal-c-alisg.tiktokv.com', Connection: 'Keep-Alive',
      'Accept-Encoding': 'gzip',
      'User-Agent': 'com.zhiliaoapp.musically/2024301150 (Linux; U; Android 9; en; V2241A; Build/PQ3A.190705.05211459;tt-ok/3.12.13.21)',
      'rpc-persist-pyxis-policy-v-tnc': '1', 'x-tt-pba-enable': '1',
      'x-tt-dm-status': 'login=0;ct=1;rt=101', 'x-api-version': '2;2;2',
      'sdk-version': '2', 'passport-sdk-version': '1', 'oec-cs-si-a': '1',
      'oec-cs-sdk-version': 'v10.01.17-ov-android_V27', 'oec-cs-si-b': '1',
      'x-vc-bdturing-sdk-version': '2.3.17.i18n',
      'rpc-persist-pns-region-1': 'VN|1562822', 'rpc-persist-pns-region-2': 'VN|1562822',
      'rpc-persist-pns-region-3': 'VN|1562822|1580578', 'oec-vc-sdk-version': '3.2.1.i18n',
      'x-tt-request-tag': 'n=0;nr=011;bg=0', 'x-tt-store-region': 'vn',
      'x-tt-store-region-src': 'local', Cookie: cookie
    }

    if (xTtToken) headers['x-tt-token'] = xTtToken
    Object.entries(signatureHeaders).forEach(([k, v]) => { if (v) headers[k] = v })
    if (signatureHeaders['x-ss-req-ticket']) headers['X-SS-REQ-TICKET'] = signatureHeaders['x-ss-req-ticket']!

    const formHeaders = form.getHeaders()
    Object.entries(formHeaders).forEach(([k, v]) => {
      if (typeof v === 'string') headers[k] = v
    })

    const { data: responseData } = await axios.post<TikTokApiResponse>(
      TIKTOK_API_URL.SEARCH_PHOTO_ECOM, form, { params, headers }
    )

    if (responseData.status_code !== undefined && responseData.status_code !== 0) {
      throw new Error(
        `TikTok API error: ${responseData.status_msg ?? 'Unknown error'} (code: ${responseData.status_code})`
      )
    }

    return responseData
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status) {
      throw new Error(
        `Failed to search photo ecom: HTTP ${error.response.status} - ${error.response.statusText ?? error.message}. Response: ${JSON.stringify(error.response?.data ?? {}).substring(0, 200)}`
      )
    }
    if (error instanceof Error) throw new Error(`Failed to search photo ecom: ${error.message}`)
    throw new Error('Failed to search photo ecom')
  }
}

export default searchPhotoEcom
