import axios from 'axios'
import TiktokService from './lib/tiktok'
import { STORAGE_COOKIES } from '../core/storagePath'

function extractTikTokVideoId(inputUrl: string): string | null {
  if (!inputUrl || typeof inputUrl !== 'string') return null

  try {
    const u = new URL(inputUrl)
    const qpCandidates = [
      'aweme_id',
      'item_id',
      'share_item_id',
      'video_id',
      'vid',
      'modal_id'
    ]
    for (const k of qpCandidates) {
      const v = u.searchParams.get(k)
      if (v && /^\d{5,30}$/.test(v)) return v
    }

    const p = u.pathname || ''
    const m1 = p.match(/\/(?:video|photo|v|embed)\/(\d{5,30})(?:\b|\/|\.html)/i)
    if (m1) return m1[1]

    const m2 = p.match(/\/(\d{17,21})(?:\b|\/)/)
    if (m2) return m2[1]
  } catch {
    // fallback to regex
  }

  const m3 = inputUrl.match(/(?:video|photo|v|embed)\/(\d{5,30})/i)
  if (m3) return m3[1]
  const m4 = inputUrl.match(/\/(\d{17,21})(?:\b|\/)/)
  if (m4) return m4[1]
  return null
}

async function resolveTikTokRedirect(url: string): Promise<string> {
  const res = await axios.request({
    method: 'GET',
    url,
    maxRedirects: 10,
    timeout: 20000,
    responseType: 'stream',
    validateStatus: () => true,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: '*/*'
    }
  })

  try {
    res.data?.destroy?.()
  } catch {
    // ignore
  }

  const finalUrl =
    res?.request?.res?.responseUrl ||
    res?.request?._redirectable?._currentUrl ||
    url
  return finalUrl
}

function wrapError(err: unknown, message: string): never {
  const errorMsg = err instanceof Error ? err.message : String(err) || message
  if (errorMsg.includes('cookie') || errorMsg.includes('Cookie')) {
    throw new Error(
      `TikTok API error: Cookie không hợp lệ hoặc thiếu. Vui lòng kiểm tra ${STORAGE_COOKIES()}/tiktok.txt - ${errorMsg}`
    )
  }
  throw new Error(`TikTok API error: ${errorMsg}`)
}

async function downloadBuffer(url: string): Promise<Buffer | null> {
  try {
    const { data } = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    })
    return Buffer.from(data)
  } catch {
    return null
  }
}

class TikTokMobileClient {
  async info(username: string) {
    try {
      const userInfo = await TiktokService.getUserInfoByUsername(username)
      return {
        user: {
          id: userInfo.uid,
          nickname: userInfo.uniqueId,
          uniqueId: userInfo.uniqueId,
          secUid: userInfo.secUid,
          avatarLarger: userInfo.avatarUri,
          avatarUri: userInfo.avatarUri,
          nickNameModifyTime: 0,
          privateAccount: false
        },
        statsV2: {
          followerCount: userInfo.followerCount ?? 0,
          followingCount: userInfo.followingCount ?? 0,
          heartCount: 0,
          videoCount: 0
        },
        status_code: 0
      }
    } catch (err) {
      wrapError(err, 'Failed to get user info')
    }
  }

  async post(username: string, count = 16) {
    try {
      const userInfo = await TiktokService.getUserInfoByUsername(username)
      const { awemeList } = await TiktokService.getUserAwemeList(userInfo.secUid, {
        userId: userInfo.uid,
        cursor: '0',
        maxCursor: '0',
        count: count.toString()
      })

      return awemeList.map((item) => {
        const attachments: { type: string; url: string }[] = []
        if (item.type === 'VIDEO' && item.video) {
          attachments.push({
            type: 'Video',
            url: item.video.mp4Uri
          })
        } else if (item.imagesUri?.length) {
          item.imagesUri.forEach((url) => {
            attachments.push({ type: 'Photo', url })
          })
        }

        return {
          id: item.id,
          desc: item.description,
          title: item.description,
          createTime: item.createdAt,
          author: {
            id: userInfo.uid,
            nickname: userInfo.uniqueId,
            uniqueId: userInfo.uniqueId
          },
          stats: {
            playCount: item.stats.views,
            diggCount: item.stats.likes,
            commentCount: item.stats.comments,
            shareCount: item.stats.shares,
            collectCount: item.stats.collects
          },
          video: item.video
            ? {
                cover: item.video.coverUri,
                play_addr: { url_list: [item.video.mp4Uri] }
              }
            : undefined,
          music: item.musicUri
            ? {
                title: '',
                author: '',
                duration: 0,
                playUrl: item.musicUri
              }
            : undefined,
          attachments,
          type: item.type === 'VIDEO' ? 'Video' : 'Photo',
          thumb: item.type === 'VIDEO' ? item.video?.coverUri : item.imagesUri?.[0],
          play: item.type === 'VIDEO' ? item.video?.mp4Uri : undefined,
          url: item.url
        }
      })
    } catch (err) {
      wrapError(err, 'Failed to get user posts')
    }
  }

  async search(keyword: string, limit = 10) {
    try {
      const searchResult = await TiktokService.searchItem({
        keyword,
        cursor: 0,
        count: limit
      })
      const list = searchResult.awemeList || []
      return list.map((item) => {
        const thumb = item.thumbnail || item.thumb || item.video?.coverUri || ''
        const vid = item.video
        return {
          id: item.id,
          desc: item.desc ?? item.description,
          description: item.description ?? item.desc,
          createTime: item.createdAt,
          create_at: item.createdAt,
          stats: item.stats
            ? {
                playCount: item.stats.views,
                diggCount: item.stats.likes,
                commentCount: item.stats.comments,
                shareCount: item.stats.shares,
                collectCount: item.stats.collects
              }
            : {},
          thumbnail: thumb,
          thumb,
          video: vid
            ? {
                duration: vid.duration ?? 0,
                durationSeconds: vid.duration ?? 0,
                coverUri: vid.coverUri || thumb,
                cover: vid.coverUri || thumb,
                play_addr: vid.mp4Uri ? { url_list: [vid.mp4Uri] } : undefined,
                mp4Uri: vid.mp4Uri
              }
            : undefined,
          attachments: item.attachments,
          type: item.type,
          url: item.url
        }
      })
    } catch (err) {
      wrapError(err, 'Failed to search videos')
    }
  }

  async download(url: string) {
    try {
      let fullUrl = url
      if (
        url.includes('vm.tiktok.com') ||
        url.includes('vt.tiktok.com') ||
        url.includes('lite.tiktok.com')
      ) {
        try {
          fullUrl = await TiktokService.resolveShortLink(url)
        } catch {
          // ignore and try extraction
        }
      }

      let videoId = extractTikTokVideoId(fullUrl)

      if (!videoId) {
        try {
          fullUrl = await resolveTikTokRedirect(fullUrl)
          videoId = extractTikTokVideoId(fullUrl)
        } catch {
          // ignore
        }
      }

      if (!videoId) {
        throw new Error('Could not extract video ID from URL')
      }

      const awemeDetail = await TiktokService.getAwemeDetails(videoId)

      const attachments: { type: string; url: string; buffer?: Buffer }[] = []
      for (const at of awemeDetail.attachments) {
        if (at.type === 'Video' && at.url) {
          const buffer = await downloadBuffer(at.url)
          attachments.push({
            type: 'Video',
            url: at.url,
            ...(buffer && { buffer })
          })
        } else if (at.type === 'Photo' && at.url) {
          attachments.push({ type: 'Photo', url: at.url })
        }
      }

      return {
        id: awemeDetail.id,
        message: awemeDetail.description || awemeDetail.desc,
        author: awemeDetail.author
          ? {
              id: awemeDetail.author.uniqueId,
              name: awemeDetail.author.nickname,
              username: awemeDetail.author.uniqueId
            }
          : { id: '', name: '', username: '' },
        music: awemeDetail.music
          ? {
              title: awemeDetail.music.title,
              author: awemeDetail.music.author,
              duration: awemeDetail.music.duration,
              url: awemeDetail.music.playUrl
            }
          : undefined,
        attachments,
        stats: awemeDetail.stats
          ? {
              views: awemeDetail.stats.views,
              likes: awemeDetail.stats.likes,
              comments: awemeDetail.stats.comments,
              shares: awemeDetail.stats.shares,
              collects: awemeDetail.stats.collects
            }
          : undefined
      }
    } catch (err) {
      wrapError(err, 'Failed to download video')
    }
  }

  async getVideo(url: string) {
    return this.download(url)
  }

  async down(url: string) {
    return this.download(url)
  }

  async infov2(user: string) {
    return this.info(user)
  }

  async searchMusic(keyword: string) {
    try {
      return await TiktokService.searchMusic({ keyword })
    } catch (err) {
      wrapError(err, 'Failed to search music')
    }
  }

  async trend(count = 20) {
    try {
      const feedResult = await TiktokService.getFYPFeed({
        count,
        type: 0
      })

      return feedResult.awemeList.map((item) => {
        const attachments: { type: string; url: string }[] = []
        if (item.type === 'VIDEO' && item.video) {
          attachments.push({
            type: 'Video',
            url: item.video.mp4Uri
          })
        } else if (item.imagesUri?.length) {
          item.imagesUri.forEach((url) => {
            attachments.push({ type: 'Photo', url })
          })
        }

        return {
          id: item.id,
          title: item.description || '',
          desc: item.description || '',
          description: item.description || '',
          nickname: '',
          unique_id: '',
          playCount: item.stats?.views ?? 0,
          likeCount: item.stats?.likes ?? 0,
          commentCount: item.stats?.comments ?? 0,
          shareCount: item.stats?.shares ?? 0,
          collectCount: item.stats?.collects ?? 0,
          create_at: item.createdAt ?? 0,
          thumb: item.type === 'VIDEO' ? item.video?.coverUri : item.imagesUri?.[0],
          type: item.type === 'VIDEO' ? 'Video' : 'Photo',
          url: item.type === 'PHOTO' ? item.imagesUri : item.url,
          play: item.type === 'VIDEO' ? item.video?.mp4Uri : undefined,
          attachments,
          video: item.video
            ? {
                cover: item.video.coverUri,
                play_addr: { url_list: [item.video.mp4Uri] }
              }
            : undefined,
          music: item.musicUri
            ? {
                title: '',
                author: '',
                duration: 0,
                playUrl: item.musicUri
              }
            : undefined
        }
      })
    } catch (err) {
      wrapError(err, 'Failed to get trending videos')
    }
  }

  async down2(videoId: string) {
    try {
      const awemeDetail = await TiktokService.getAwemeDetails(videoId)

      const attachments: { type: string; url: string; buffer?: Buffer }[] = []
      let vdbuffer: Buffer | undefined

      if (awemeDetail.type === 'VIDEO' && awemeDetail.video?.mp4Uri) {
        const mp4Url = awemeDetail.video.mp4Uri
        const buffer = await downloadBuffer(mp4Url)
        if (buffer) vdbuffer = buffer
        attachments.push({
          type: 'Video',
          url: mp4Url,
          ...(buffer && { buffer })
        })
      } else if (awemeDetail.imagesUri?.length) {
        awemeDetail.imagesUri.forEach((url) => {
          attachments.push({ type: 'Photo', url })
        })
      }

      return {
        id: awemeDetail.id,
        message: awemeDetail.description || awemeDetail.desc,
        description: awemeDetail.description || awemeDetail.desc,
        type: awemeDetail.type === 'VIDEO' ? 'Video' : 'Photo',
        url: awemeDetail.url,
        attachments,
        author: awemeDetail.author
          ? {
              nickname: awemeDetail.author.nickname,
              username: awemeDetail.author.uniqueId,
              uniqueId: awemeDetail.author.uniqueId
            }
          : { nickname: '', username: '', uniqueId: '' },
        music: awemeDetail.music
          ? {
              title: awemeDetail.music.title,
              author: awemeDetail.music.author,
              duration: awemeDetail.music.duration,
              playUrl: awemeDetail.music.playUrl
            }
          : undefined,
        views: awemeDetail.stats?.views ?? 0,
        likes: awemeDetail.stats?.likes ?? 0,
        comments: awemeDetail.stats?.comments ?? 0,
        shares: awemeDetail.stats?.shares ?? 0,
        vdbuffer,
        video: awemeDetail.video
          ? {
              cover: awemeDetail.video.coverUri,
              play_addr: {
                url_list: awemeDetail.video.mp4Uri ? [awemeDetail.video.mp4Uri] : []
              }
            }
          : undefined,
        url: awemeDetail.imagesUri
      }
    } catch (err) {
      wrapError(err, 'Failed to download video')
    }
  }
}

const client = new TikTokMobileClient()
export default client
