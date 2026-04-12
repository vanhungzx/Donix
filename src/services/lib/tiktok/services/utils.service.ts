import axios from 'axios'
import qs from 'qs'
import { TIKTOK_API_URL } from '../constants/index.js'
import createMobileHeadersSignature from '../tiktok-signer/signHeadersMobile.js'
import { getTiktokCredentials } from './helpers.js'
import type { BaseOptions, TikTokCredentials } from '../types/index.js'

export const resolveShortLink = async (shortUrl: string, options: BaseOptions = {}): Promise<string> => {
  try {
    const { cookie, xTtToken } = options.cookie
      ? { cookie: options.cookie, xTtToken: options.xTtToken }
      : getTiktokCredentials()

    const params = { url: shortUrl }
    const queryString = qs.stringify(params)
    const signatureHeaders = createMobileHeadersSignature({ queryParams: queryString, cookies: cookie ?? '' })

    const headers: Record<string, string> = {
      'User-Agent': 'com.zhiliaoapp.musically.go/420004 (Linux; U; Android 9; en_US; SM-G998B; Build/SP1A.210812.016;tt-ok/3.12.13.44.lite-ul)',
      Cookie: cookie ?? '', 'Accept-Language': 'vi-VN', Accept: '*/*', Connection: 'keep-alive'
    }
    if (xTtToken) headers['x-tt-token'] = xTtToken
    Object.entries(signatureHeaders).forEach(([k, v]) => { if (v) headers[k] = v })

    interface ResolveResponse { status_code: number; status_msg?: string; landing_url?: string }
    const { data: responseData } = await axios.get<ResolveResponse>(TIKTOK_API_URL.RESOLVE_SHORT_LINK, {
      params, headers, paramsSerializer: (p) => qs.stringify(p, { encode: true })
    })

    if (responseData.status_code !== 0 || !responseData.landing_url) {
      throw new Error(`Failed to resolve short link: ${responseData.status_msg ?? 'Unknown error'}`)
    }

    return responseData.landing_url
  } catch (error) {
    if (error instanceof Error) throw new Error(`Failed to resolve short link: ${error.message}`)
    throw new Error(`Failed to resolve short link: ${String(error)}`)
  }
}

export const getCredentials = async (gistId: string, gistSecretKey: string): Promise<TikTokCredentials> => {
  try {
    if (!gistId || !gistSecretKey) {
      throw new Error('Gist ID and Secret Key are required')
    }

    interface GistResponse {
      files: Record<string, { content: string }>
    }

    const { data: responseData } = await axios.get<GistResponse>(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Authorization: `Bearer ${gistSecretKey}`,
        Accept: 'application/vnd.github+json'
      }
    })

    const content = responseData.files['tiktok-mobile-credentials.json'].content
    return JSON.parse(content) as TikTokCredentials
  } catch {
    throw new Error('Failed to fetch TikTok credentials')
  }
}

export default { resolveShortLink, getCredentials }
