import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import qs from 'qs';
import { TIKTOK_API_URL } from '../constants/index.js';
import createMobileHeadersSignature from '../tiktok-signer/signHeadersMobile.js';
import { extractXttTokenFromCookie, getTiktokCredentials } from './helpers.js';
import type { JsonObject, TikTokRequestOptions } from '../types.js';

type PhotoSearchOptions = TikTokRequestOptions & {
  imagePath: string;
  cursor?: number;
  count?: number;
};

const searchPhotoEcom = async (options: PhotoSearchOptions): Promise<JsonObject> => {
  try {
    const { imagePath, cursor = 0, count = 6 } = options;
    if (!fs.existsSync(imagePath)) throw new Error(`Image file not found: ${imagePath}`);

    const credentials = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials();
    const cookie = credentials.cookie;
    const xTtToken = credentials.xTtToken || extractXttTokenFromCookie(cookie);

    const searchSessionId = Date.now().toString();
    const clientRequestId = `client_${Date.now()}`;
    const formFields: Record<string, string> = {
      search_channel: 'tiktok_mall_photo_search',
      cursor: String(cursor),
      keyword: '',
      enter_from: 'mall',
      count: String(count),
      search_source: 'choose_album',
      ec_search_session_id: searchSessionId,
      search_session_id: searchSessionId,
      client_request_id: clientRequestId
    };

    const form = new FormData();
    form.append('image', fs.createReadStream(imagePath), {
      filename: 'image.jpg',
      contentType: 'image/jpeg'
    });
    Object.entries(formFields).forEach(([key, value]) => form.append(key, value));

    const params: Record<string, string> = {
      device_platform: 'android',
      os: 'android',
      aid: '1233',
      app_name: 'musical_ly',
      version_code: '430115',
      _rticket: Date.now().toString(),
      ts: Math.floor(Date.now() / 1000).toString()
    };

    const queryString = qs.stringify(params);
    const bodyPayload = qs.stringify(formFields);
    const signatureHeaders = createMobileHeadersSignature({
      queryParams: queryString,
      bodyPayload,
      cookies: cookie
    }) as Record<string, string | undefined>;

    const headers: Record<string, string> = {
      Host: 'search22-normal-c-alisg.tiktokv.com',
      Connection: 'Keep-Alive',
      'Accept-Encoding': 'gzip',
      'User-Agent': 'com.zhiliaoapp.musically/2024301150 (Linux; U; Android 9; en; V2241A; Build/PQ3A.190705.05211459;tt-ok/3.12.13.21)',
      Cookie: cookie
    };
    if (xTtToken) headers['x-tt-token'] = xTtToken;
    Object.entries(signatureHeaders).forEach(([k, v]) => {
      if (v) headers[k] = v;
    });
    const formHeaders = form.getHeaders();
    Object.entries(formHeaders).forEach(([k, v]) => {
      if (typeof v === 'string') headers[k] = v;
    });

    const { data: responseData } = await axios.post(TIKTOK_API_URL.SEARCH_PHOTO_ECOM, form, {
      params,
      headers
    });

    const response = responseData as JsonObject;
    if (typeof response.status_code === 'number' && response.status_code !== 0) {
      throw new Error(`TikTok API error: ${String(response.status_msg || 'Unknown error')} (code: ${response.status_code})`);
    }
    return response;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(
        `Failed to search photo ecom: HTTP ${error.response.status} - ${error.response.statusText || error.message}. Response: ${JSON.stringify(error.response?.data || {}).substring(0, 200)}`
      );
    }
    if (error instanceof Error) throw new Error(`Failed to search photo ecom: ${error.message}`);
    throw new Error('Failed to search photo ecom');
  }
};

export { searchPhotoEcom };
export default searchPhotoEcom;
