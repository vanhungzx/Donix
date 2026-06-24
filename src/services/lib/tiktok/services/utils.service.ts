import axios from 'axios';
import qs from 'qs';
import { TIKTOK_API_URL } from '../constants/index.js';
import createMobileHeadersSignature from '../tiktok-signer/signHeadersMobile.js';
import { getTiktokCredentials } from './helpers.js';
import type { JsonObject, TikTokRequestOptions } from '../types.js';

const resolveShortLink = async (shortUrl: string, options: TikTokRequestOptions = {}): Promise<string> => {
  try {
    const { cookie, xTtToken } = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials();

    const params = { url: shortUrl };
    const queryString = qs.stringify(params);
    const signatureHeaders = createMobileHeadersSignature({
      queryParams: queryString,
      cookies: cookie
    }) as Record<string, string | undefined>;

    const headers: Record<string, string> = {
      'User-Agent': 'com.zhiliaoapp.musically.go/420004 (Linux; U; Android 9; en_US; SM-G998B; Build/SP1A.210812.016;tt-ok/3.12.13.44.lite-ul)',
      Cookie: cookie,
      'Accept-Language': 'vi-VN',
      Accept: '*/*',
      Connection: 'keep-alive'
    };
    if (xTtToken) headers['x-tt-token'] = xTtToken;
    Object.entries(signatureHeaders).forEach(([k, v]) => {
      if (v) headers[k] = v;
    });

    const { data: responseData } = await axios.get(TIKTOK_API_URL.RESOLVE_SHORT_LINK, {
      params,
      headers,
      paramsSerializer: (inputParams) => qs.stringify(inputParams)
    });

    const response = responseData as JsonObject;
    if (response.status_code !== 0 || typeof response.landing_url !== 'string') {
      throw new Error(`Failed to resolve short link: ${String(response.status_msg || 'Unknown error')}`);
    }
    return response.landing_url;
  } catch (error: unknown) {
    if (error instanceof Error) throw new Error(`Failed to resolve short link: ${error.message}`);
    throw new Error(`Failed to resolve short link: ${String(error)}`);
  }
};

const getCredentials = async (gistId: string, gistSecretKey: string): Promise<JsonObject> => {
  try {
    if (!gistId || !gistSecretKey) throw new Error('Gist ID and Secret Key are required');
    const { data: responseData } = await axios.get(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Authorization: `Bearer ${gistSecretKey}`,
        Accept: 'application/vnd.github+json'
      }
    });
    const files = (responseData as { files?: Record<string, { content?: string }> }).files || {};
    const content = files['tiktok-mobile-credentials.json']?.content;
    if (!content) throw new Error('Missing credentials file in gist');
    return JSON.parse(content) as JsonObject;
  } catch {
    throw new Error('Failed to fetch TikTok credentials');
  }
};

export { resolveShortLink, getCredentials };
export default {
  resolveShortLink,
  getCredentials
};
