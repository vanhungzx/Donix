import axios from 'axios'
import fs from 'fs'
import path from 'path'
import qs from 'qs'
import { TIKTOK_API_URL } from '../constants/index.js'
import createMobileHeadersSignature, { getBaseMobileParams } from '../tiktok-signer/signHeadersMobile.js'
import tiktokUtils from '../utils/tiktok.util.js'
import type { TikTokCredentials, BaseOptions } from '../types/index.js'
import { STORAGE_COOKIES } from '../../../../core/storagePath'

export const getTiktokCredentials = (): TikTokCredentials => {
  try {
    const cookieFilePath = path.join(STORAGE_COOKIES(), 'tiktok.txt')
    const legacyCookieFilePath = path.join(process.cwd(), 'main', 'cookies', 'tiktok.txt')
    const legacyCookieFilePath2 = path.join(process.cwd(), 'cookies', 'tiktok.txt')
    const legacyCookieFilePath3 = path.join(process.cwd(), 'src', 'cookies', 'tiktok.txt')
    const finalCookiePath =
      (fs.existsSync(cookieFilePath) && cookieFilePath) ||
      (fs.existsSync(legacyCookieFilePath) && legacyCookieFilePath) ||
      (fs.existsSync(legacyCookieFilePath2) && legacyCookieFilePath2) ||
      (fs.existsSync(legacyCookieFilePath3) && legacyCookieFilePath3) ||
      cookieFilePath

    if (!fs.existsSync(finalCookiePath)) {
      throw new Error(
        `TikTok cookie file not found at: ${cookieFilePath} (or legacy path: ${legacyCookieFilePath})`
      )
    }

    const fileContent = fs.readFileSync(finalCookiePath, 'utf-8').trim()
    if (!fileContent) throw new Error('TikTok cookie file is empty')

    const lines = fileContent.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    if (lines.length === 0) throw new Error('TikTok cookie file contains no valid cookie data')

    const cookieContent = lines.reduce((longest, current) =>
      current.length > longest.length ? current : longest
    )

    const xTtToken = extractXttTokenFromCookie(cookieContent)
    return { cookie: cookieContent, xTtToken: xTtToken ?? undefined }
  } catch (error) {
    if (error instanceof Error) throw new Error(`Failed to read TikTok cookie: ${error.message}`)
    throw new Error('Failed to read TikTok cookie from file')
  }
}

export const extractXttTokenFromCookie = (cookie: string): string | undefined => {
  const tokenMatch = cookie.match(/x-tt-token=([^;]+)/i)
  if (tokenMatch?.[1]) return tokenMatch[1]
  return undefined
}

export const searchUserIdByUsername = async (
  username: string,
  options: BaseOptions = {}
): Promise<string> => {
  try {
    const { cookie, xTtToken } = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials()

    const baseParams = getBaseMobileParams()
    const params: Record<string, string> = {
      ...Object.fromEntries(Object.entries(baseParams).map(([k, v]) => [k, String(v)])),
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
    }

    const queryString = qs.stringify(params)
    const signatureHeaders = createMobileHeadersSignature({ queryParams: queryString, cookies: cookie ?? '' })
    const headers: Record<string, string> = { Cookie: cookie ?? '' }

    if (xTtToken) headers['x-tt-token'] = xTtToken
    Object.entries(signatureHeaders).forEach(([k, v]) => { if (v) headers[k] = v })

    const { data: responseData } = await axios.get(TIKTOK_API_URL.SEARCH_USER, {
      params,
      headers,
      paramsSerializer: (p) => qs.stringify(p, { encode: true })
    })

    const userId = tiktokUtils.findValueByKey(responseData as Record<string, unknown>, 'uid')
    if (!userId) throw new Error()
    return String(userId)
  } catch {
    throw new Error('Failed to search user ID by username')
  }
}

export default { getTiktokCredentials, extractXttTokenFromCookie, searchUserIdByUsername }
