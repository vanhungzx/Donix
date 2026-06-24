import axios from 'axios';
import qs from 'qs';
import { TIKTOK_API_URL } from '../constants/index.js';
import createMobileHeadersSignature from '../tiktok-signer/signHeadersMobile.js';
import tiktokUtils, { parseTikTokData } from '../utils/tiktok.util.js';
import { extractXttTokenFromCookie, getTiktokCredentials } from './helpers.js';
import type { JsonObject, TikTokAwemeDetailsOptions, TikTokMultiAwemeOptions } from '../types.js';

const getAwemeDetails = async (awemeId: string, options: TikTokAwemeDetailsOptions = {}): Promise<unknown> => {
  try {
    const { requestSource = '0' } = options;
    const credentials = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials();
    const cookie = credentials.cookie;
    const xTtToken = credentials.xTtToken || extractXttTokenFromCookie(cookie);

    const params: Record<string, string> = {
      device_platform: 'android',
      os: 'android',
      ssmix: 'a',
      channel: 'googleplay',
      aid: '1340',
      app_name: 'musically_go',
      version_code: '430245',
      version_name: '43.2.45',
      manifest_version_code: '430245',
      update_version_code: '430245',
      ab_version: '43.2.45',
      resolution: '1080*1920',
      dpi: '480',
      device_type: 'SM-X910N',
      device_brand: 'samsung',
      language: 'vi',
      os_api: '28',
      os_version: '9',
      ac: 'wifi',
      is_pad: '0',
      current_region: 'VN',
      app_type: 'normal',
      sys_region: 'VN',
      timezone_name: 'Asia/Ho_Chi_Minh',
      carrier_region: 'VN',
      app_language: 'vi',
      timezone_offset: '25200',
      host_abi: 'x86_64',
      locale: 'vi-VN',
      ac2: 'wifi',
      op_region: 'VN',
      build_number: '43.2.45',
      region: 'VN',
      ts: Math.floor(Date.now() / 1000).toString(),
      iid: '7630938841050695432',
      device_id: '7626781349097424405',
      openudid: '5fee648b3af89948',
      cdid: 'e27d5a54-898f-451f-a548-f26532ae8820',
      _rticket: Date.now().toString()
    };

    const queryString = qs.stringify(params);
    const bodyPayload = qs.stringify({
      aweme_ids: `[${awemeId}]`,
      request_source: requestSource
    });

    const signatureHeaders = createMobileHeadersSignature({
      queryParams: queryString,
      bodyPayload,
      cookies: cookie
    }) as Record<string, string | undefined>;

    const headers: Record<string, string> = {
      Host: 'api22-normal-c-alisg.tiktokv.com',
      Connection: 'Keep-Alive',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept-Encoding': 'gzip',
      'User-Agent': 'com.zhiliaoapp.musically.go/430245 (Linux; U; Android 9; vi_VN; SM-X910N; Build/PQ3A.190705.01301014;tt-ok/3.12.13.50.lite-alpha.3-log)',
      'rpc-persist-pyxis-policy-v-tnc': '1',
      'x-ss-dp': '1340',
      'x-tt-ultra-lite': '1',
      'sdk-version': '2',
      'passport-sdk-version': '-1',
      'x-vc-bdturing-sdk-version': '2.3.15.i18n',
      'x-tt-store-region': 'vn',
      'x-tt-store-region-src': 'uid',
      Cookie: cookie
    };
    if (xTtToken) headers['x-tt-token'] = xTtToken;
    Object.entries(signatureHeaders).forEach(([k, v]) => {
      if (v) headers[k] = v;
    });
    if (signatureHeaders['x-ss-stub']) headers['x-ss-stub'] = signatureHeaders['x-ss-stub'];
    if (signatureHeaders['x-ss-req-ticket']) headers['X-SS-REQ-TICKET'] = signatureHeaders['x-ss-req-ticket'];

    const { data: responseData } = await axios.post(TIKTOK_API_URL.GET_MULTI_AWEME_DETAIL, bodyPayload, {
      params,
      headers,
      paramsSerializer: (p) => qs.stringify(p)
    });

    const response = responseData as JsonObject;
    if (typeof response.status_code === 'number' && response.status_code !== 0) {
      throw new Error(`TikTok API error: ${String(response.status_msg || 'Unknown error')} (code: ${response.status_code})`);
    }

    const awemeList = Array.isArray(response.aweme_details) ? response.aweme_details : [];
    const awemeDetail = awemeList.find((item) => String((item as JsonObject).aweme_id || '') === awemeId);
    if (!awemeDetail) throw new Error('Aweme detail not found');

    const parsedList = parseTikTokData([awemeDetail as JsonObject]);
    const parsed = parsedList[0];
    if (!parsed) throw new Error('Failed to parse aweme detail');
    return parsed;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(`Failed to fetch aweme details: HTTP ${error.response.status} - ${error.response.statusText || error.message}`);
    }
    if (error instanceof Error) throw new Error(`Failed to fetch aweme details: ${error.message}`);
    throw new Error('Failed to fetch aweme details');
  }
};

const getMultiAwemeDetails = async (options: TikTokMultiAwemeOptions): Promise<unknown[]> => {
  try {
    const { awemeIds, requestSource = '0', shareLinkMode = 0, shareScene = 1 } = options;
    const credentials = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials();
    const cookie = credentials.cookie;
    const xTtToken = credentials.xTtToken || extractXttTokenFromCookie(cookie);

    const params: Record<string, string> = {
      share_link_mode: shareLinkMode.toString(),
      share_scene: shareScene.toString(),
      device_platform: 'android',
      os: 'android',
      ssmix: 'a',
      channel: 'googleplay',
      aid: '1340',
      app_name: 'musically_go',
      version_code: '430245',
      version_name: '43.2.45',
      manifest_version_code: '430245',
      update_version_code: '430245',
      ab_version: '43.2.45',
      resolution: '1080*1920',
      dpi: '480',
      device_type: 'SM-X910N',
      device_brand: 'samsung',
      language: 'vi',
      os_api: '28',
      os_version: '9',
      ac: 'wifi',
      is_pad: '0',
      current_region: 'VN',
      app_type: 'normal',
      sys_region: 'VN',
      timezone_name: 'Asia/Ho_Chi_Minh',
      carrier_region: 'VN',
      app_language: 'vi',
      timezone_offset: '25200',
      host_abi: 'x86_64',
      locale: 'vi-VN',
      ac2: 'wifi',
      op_region: 'VN',
      build_number: '43.2.45',
      region: 'VN',
      ts: Math.floor(Date.now() / 1000).toString(),
      iid: '7630938841050695432',
      device_id: '7626781349097424405',
      openudid: '5fee648b3af89948',
      cdid: 'e27d5a54-898f-451f-a548-f26532ae8820',
      _rticket: Date.now().toString()
    };

    const queryString = qs.stringify(params);
    const bodyPayload = qs.stringify({
      aweme_ids: `[${awemeIds.join(',')}]`,
      request_source: requestSource
    });

    const signatureHeaders = createMobileHeadersSignature({
      queryParams: queryString,
      bodyPayload,
      cookies: cookie
    }) as Record<string, string | undefined>;

    const headers: Record<string, string> = {
      Host: 'api22-normal-c-alisg.tiktokv.com',
      Connection: 'Keep-Alive',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept-Encoding': 'gzip',
      'User-Agent': 'com.zhiliaoapp.musically.go/430245 (Linux; U; Android 9; vi_VN; SM-X910N; Build/PQ3A.190705.01301014;tt-ok/3.12.13.50.lite-alpha.3-log)',
      'rpc-persist-pyxis-policy-v-tnc': '1',
      'x-ss-dp': '1340',
      'x-tt-ultra-lite': '1',
      'sdk-version': '2',
      'passport-sdk-version': '-1',
      'x-vc-bdturing-sdk-version': '2.3.15.i18n',
      'x-tt-request-tag': 'n=0',
      'x-tt-store-region': 'vn',
      'x-tt-store-region-src': 'uid',
      Cookie: cookie
    };
    if (xTtToken) headers['x-tt-token'] = xTtToken;
    Object.entries(signatureHeaders).forEach(([k, v]) => {
      if (v) headers[k] = v;
    });
    if (signatureHeaders['x-ss-req-ticket']) headers['X-SS-REQ-TICKET'] = signatureHeaders['x-ss-req-ticket'];

    const { data: responseData } = await axios.post(TIKTOK_API_URL.GET_MULTI_AWEME_DETAIL, bodyPayload, {
      params,
      headers,
      paramsSerializer: (inputParams) => qs.stringify(inputParams)
    });

    const response = responseData as JsonObject;
    if (typeof response.status_code === 'number' && response.status_code !== 0) {
      throw new Error(`TikTok API error: ${String(response.status_msg || 'Unknown error')} (code: ${response.status_code})`);
    }

    const awemeList = Array.isArray(response.aweme_details) ? response.aweme_details : [];
    return awemeList.map((item) => tiktokUtils.formatAwemeItemResponse(item as JsonObject));
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(
        `Failed to fetch multi aweme details: HTTP ${error.response.status} - ${error.response.statusText || error.message}. Response: ${JSON.stringify(error.response?.data || {}).substring(0, 200)}`
      );
    }
    if (error instanceof Error) throw new Error(`Failed to fetch multi aweme details: ${error.message}`);
    throw new Error('Failed to fetch multi aweme details');
  }
};

export { getAwemeDetails, getMultiAwemeDetails };
export default {
  getAwemeDetails,
  getMultiAwemeDetails
};
