import axios from 'axios';
import fs from 'fs';
import path from 'path';
import qs from 'qs';
import { STORAGE_COOKIES } from '../../../../core/storagePath.js';
import { TIKTOK_API_URL } from '../constants/index.js';
import createMobileHeadersSignature, { getBaseMobileParams } from '../tiktok-signer/signHeadersMobile.js';
import tiktokUtils from '../utils/tiktok.util.js';
import type { JsonObject, TikTokCredentials, TikTokRequestOptions } from '../types.js';

const parseCookieEntries = (cookie: string): Array<[string, string]> => {
  return cookie
    .split(';')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment.includes('='))
    .map((segment) => {
      const separatorIndex = segment.indexOf('=');
      const key = segment.slice(0, separatorIndex).trim();
      const value = segment.slice(separatorIndex + 1).trim();
      return [key, value] as [string, string];
    })
    .filter(([key, value]) => key.length > 0 && value.length > 0);
};

const normalizeCookieContent = (rawContent: string): string => {
  const lines = rawContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) throw new Error('TikTok cookie file contains no valid cookie data');

  const dedupedCookieMap = new Map<string, string>();
  for (const line of lines) {
    for (const [key, value] of parseCookieEntries(line)) {
      dedupedCookieMap.set(key, value);
    }
  }

  if (dedupedCookieMap.size === 0) throw new Error('TikTok cookie file contains no valid cookie pairs');
  return [...dedupedCookieMap.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
};

const getTiktokCredentials = (): TikTokCredentials => {
  try {
    const cookieFilePath = path.join(STORAGE_COOKIES(), 'tiktok.txt');
    const legacyCookieFilePath = path.join(process.cwd(), 'main', 'cookies', 'tiktok.txt');
    const finalCookiePath = fs.existsSync(cookieFilePath) ? cookieFilePath : legacyCookieFilePath;

    if (!fs.existsSync(finalCookiePath)) {
      throw new Error(`TikTok cookie file not found at: ${cookieFilePath} (or legacy path: ${legacyCookieFilePath})`);
    }

    const fileContent = fs.readFileSync(finalCookiePath, 'utf-8').trim();
    if (!fileContent) throw new Error('TikTok cookie file is empty');

    const cookieContent = normalizeCookieContent(fileContent);
    const xTtToken = extractXttTokenFromCookie(cookieContent);
    return { cookie: cookieContent, xTtToken: xTtToken || undefined };
  } catch (error: unknown) {
    if (error instanceof Error) throw new Error(`Failed to read TikTok cookie: ${error.message}`);
    throw new Error('Failed to read TikTok cookie from file');
  }
};

const extractXttTokenFromCookie = (cookie: string): string | undefined => {
  const tokenMatch = cookie.match(/x-tt-token=([^;]+)/i);
  return tokenMatch?.[1] || undefined;
};

const searchUserIdByUsername = async (username: string, options: TikTokRequestOptions = {}): Promise<string> => {
  try {
    const { cookie, xTtToken } = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials();

    const baseParams = getBaseMobileParams() as Record<string, string>;
    const params: Record<string, string> = {
      ...baseParams,
      cursor: '0',
      enable_lite_workflow: '1',
      enter_from: 'web',
      enable_lite_cut: '1',
      backtrace: '',
      keyword: username,
      count: '1',
      last_search_id: '',
      end_to_end_search_session_id: '',
      query_correct_type: '1',
      search_source: 'search_history',
      search_id: '',
      request_tag_from: 'h5'
    };

    const queryString = qs.stringify(params);
    const signatureHeaders = createMobileHeadersSignature({ queryParams: queryString, cookies: cookie });
    const headers: Record<string, string> = { Cookie: cookie };
    if (xTtToken) headers['x-tt-token'] = xTtToken;
    Object.entries(signatureHeaders as Record<string, string | undefined>).forEach(([k, v]) => {
      if (v) headers[k] = v;
    });

    const { data: responseData } = await axios.get(TIKTOK_API_URL.SEARCH_USER, {
      params,
      headers,
      paramsSerializer: (inputParams) => qs.stringify(inputParams)
    });

    const userId = tiktokUtils.findValueByKey(responseData as JsonObject, 'uid');
    if (!userId) throw new Error('uid not found');
    return String(userId);
  } catch {
    throw new Error('Failed to search user ID by username');
  }
};

export { getTiktokCredentials, extractXttTokenFromCookie, searchUserIdByUsername };
export default {
  getTiktokCredentials,
  extractXttTokenFromCookie,
  searchUserIdByUsername
};
