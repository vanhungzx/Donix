import type {
  TikTokAwemeRaw,
  TikTokBitRate,
  TikTokMusicRaw,
  FormattedAwemeItem,
  ParsedAwemeItem,
  ParsedAwemeAttachment,
  ParsedAwemeVideo,
  MusicDetail,
  TikTokStats,
  TikTokAwemeType
} from '../types/index.js'

const getHighestQualityVideoUri = (bitRateArr: TikTokBitRate[]): string => {
  if (!Array.isArray(bitRateArr) || bitRateArr.length === 0) return ''
  const best = bitRateArr.reduce((prev, current) => {
    const prevRes = (prev?.play_addr?.width ?? 0) * (prev?.play_addr?.height ?? 0)
    const curRes = (current?.play_addr?.width ?? 0) * (current?.play_addr?.height ?? 0)
    return curRes > prevRes ? current : prev
  })
  return best?.play_addr?.url_list?.at(-1) ?? ''
}

const formatAwemeItemResponse = (item: TikTokAwemeRaw): FormattedAwemeItem => {

  const type: TikTokAwemeType = item.image_post_info ? 'PHOTO' : 'VIDEO'
  const stats: TikTokStats = {
    likes: item.statistics.digg_count,
    comments: item.statistics.comment_count,
    shares: item.statistics.share_count,
    views: item.statistics.play_count,
    collects: item.statistics.collect_count
  }
  const imagesUri =
    type === 'PHOTO'
      ? (item.image_post_info?.images ?? []).map(
          (img) => img.display_image?.url_list?.[0] ?? ''
        )
      : []

  const musicUri = item.music?.play_url
    ? typeof item.music.play_url === 'string'
      ? item.music.play_url
      : (item.music.play_url.url_list?.[0] ?? '')
    : ''

  const video =
    type === 'VIDEO'
      ? {
          coverUri: item.video.origin_cover?.url_list?.[0] ?? '',
          mp4Uri: getHighestQualityVideoUri(item.video.bit_rate ?? [])
        }
      : undefined

  return {
    id: item.aweme_id,
    url: item.share_url ?? '',
    description: item.desc ?? '',
    createdAt: item.create_time ?? 0,
    type,
    stats,
    video,
    imagesUri,
    musicUri
  }
}

const parseTikTokData = (awemeList: TikTokAwemeRaw[]): ParsedAwemeItem[] => {
  if (!Array.isArray(awemeList)) return []
  return awemeList.map((item): ParsedAwemeItem => {
    const isPhoto = !!item.image_post_info?.images
    const type: TikTokAwemeType = isPhoto ? 'PHOTO' : 'VIDEO'
    const uniqueId =
      item.author?.unique_id ?? item.author?.uniqueId ?? item.author?.uid ?? 'user'
    const id = item.aweme_id
    const url = `https://www.tiktok.com/@${uniqueId}/${isPhoto ? 'photo' : 'video'}/${id}`

    const thumbnail =
      item.video?.cover?.url_list?.[0] ??
      item.video?.origin_cover?.url_list?.[0] ??
      item.video?.dynamic_cover?.url_list?.[0] ??
      ''

    const attachments: ParsedAwemeAttachment[] = []

    if (isPhoto) {
      const images = item.image_post_info?.images ?? []
      for (const img of images) {
        const imgUrl =
          img.display_image?.url_list?.[0] ?? img.owner_watermark_image?.url_list?.[0]
        if (imgUrl) attachments.push({ type: 'Photo', url: imgUrl })
      }
    } else {
      const vidUrl = item.video?.play_addr?.url_list?.[0] ?? ''
      if (vidUrl) attachments.push({ type: 'Video', url: vidUrl })
    }

    const music: TikTokMusicRaw | undefined = item.music
    let musicDetail: MusicDetail | undefined

    if (music) {
      const playUrlRaw = music.play_url
      const playUrl =
        typeof playUrlRaw === 'string'
          ? playUrlRaw
          : playUrlRaw?.url_list?.[0] ?? ''

      musicDetail = {
        id: String(music.id ?? ''),
        idStr: String(music.id_str ?? ''),
        title: music.title ?? music.music_name ?? '',
        author: music.author ?? music.owner_nickname ?? '',
        album: music.album ?? '',
        duration: Number(music.duration) || 0,
        auditionDuration: Number(music.audition_duration) || 0,
        coverLarge: music.cover_large?.url_list?.[0] ?? '',
        coverMedium: music.cover_medium?.url_list?.[0] ?? '',
        coverThumb: music.cover_thumb?.url_list?.[0] ?? '',
        ownerHandle: music.owner_handle ?? '',
        ownerNickname: music.owner_nickname ?? '',
        playUrl
      }
    }

    const stats: TikTokStats = {
      likes: item.statistics?.digg_count ?? 0,
      comments: item.statistics?.comment_count ?? 0,
      shares: item.statistics?.share_count ?? 0,
      views: item.statistics?.play_count ?? 0,
      collects: item.statistics?.collect_count ?? 0
    }

    const videoObj: ParsedAwemeVideo | undefined =
      type === 'VIDEO' && item.video
        ? {
            duration: item.video.duration ?? item.video.duration_seconds ?? 0,
            coverUri: thumbnail,
            
            mp4Uri:
              item.video?.play_addr?.url_list?.[0] ??
              item.video?.bit_rate?.[0]?.play_addr?.url_list?.[0] ?? ''
          }
        : undefined

    const authorRaw = item.author
    const author = authorRaw
      ? {
          uniqueId:
            authorRaw.unique_id ?? authorRaw.uniqueId ?? authorRaw.uid ?? uniqueId,
          nickname: authorRaw.nickname ?? authorRaw.nick_name ?? '',
          avatarLarger: authorRaw.avatar_larger?.url_list?.[0] ?? ''
        }
      : undefined

    return {
      id,
      url,
      description: item.desc ?? '',
      desc: item.desc ?? '',
      createdAt: item.create_time ?? 0,
      type,
      thumbnail,
      thumb: thumbnail,
      video: videoObj,
      stats,
      attachments,
      music: musicDetail,
      author
    }
  })
}

const findValueByKey = (obj: Record<string, unknown>, targetKey: string): unknown => {
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue
    if (key === targetKey) return obj[key]
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      const result = findValueByKey(obj[key] as Record<string, unknown>, targetKey)
      if (result !== undefined) return result
    }
  }
  return undefined
}

const parseTiktokResponse = (response: unknown): Record<string, unknown> => {
  if (typeof response === 'object' && response !== null && !Array.isArray(response)) {
    return response as Record<string, unknown>
  }

  if (typeof response === 'string') {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as Record<string, unknown>
      } catch {
        const lines = response.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (/^[0-9a-fA-F]+$/.test(trimmed)) continue
          const lineJsonMatch = trimmed.match(/\{[\s\S]*\}/)
          if (lineJsonMatch) {
            try {
              return JSON.parse(lineJsonMatch[0]) as Record<string, unknown>
            } catch {
              continue
            }
          }
        }
      }
    }
  }

  if (Array.isArray(response)) {
    for (const item of response) {
      if (typeof item === 'string') {
        const parsed = parseTiktokResponse(item)
        if (parsed && typeof parsed === 'object') return parsed
      }
    }
  }

  return response as Record<string, unknown>
}

const tiktokUtils = {
  formatAwemeItemResponse,
  findValueByKey,
  parseTiktokResponse,
  parseTikTokData
}

export { formatAwemeItemResponse, findValueByKey, parseTiktokResponse, parseTikTokData }
export default tiktokUtils
