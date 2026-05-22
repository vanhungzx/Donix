import type { JsonObject } from '../types.js';

type AwemeStats = {
  likes: number;
  comments: number;
  shares: number;
  views: number;
  collects: number;
};

const getHighestQualityVideoUri = (bitRateArr: unknown): string => {
  if (!Array.isArray(bitRateArr) || bitRateArr.length === 0) return '';
  const highestQualityVideo = bitRateArr.reduce((prev, current) => {
    const prevObj = (prev || {}) as JsonObject;
    const currentObj = (current || {}) as JsonObject;
    const prevPlay = (prevObj.play_addr || {}) as JsonObject;
    const currentPlay = (currentObj.play_addr || {}) as JsonObject;
    const prevResolution = Number(prevPlay.width || 0) * Number(prevPlay.height || 0);
    const currentResolution = Number(currentPlay.width || 0) * Number(currentPlay.height || 0);
    return currentResolution > prevResolution ? currentObj : prevObj;
  }, {} as JsonObject);
  const playAddr = (highestQualityVideo.play_addr || {}) as { url_list?: unknown[] };
  return String(playAddr.url_list?.at(-1) || '');
};

const formatAwemeItemResponse = (input: JsonObject): JsonObject => {
  const item = input || {};
  const statistics = (item.statistics || {}) as JsonObject;
  const imagePostInfo = (item.image_post_info || {}) as JsonObject;
  const videoObj = (item.video || {}) as JsonObject;
  const originCover = (videoObj.origin_cover || {}) as { url_list?: unknown[] };
  const bitRate = (videoObj.bit_rate || []) as unknown[];
  const images = Array.isArray(imagePostInfo.images) ? imagePostInfo.images : [];
  const music = (item.music || {}) as JsonObject;
  const musicPlay = (music.play_url || {}) as { url_list?: unknown[] };
  const type = imagePostInfo ? (images.length > 0 ? 'PHOTO' : 'VIDEO') : 'VIDEO';

  const stats: AwemeStats = {
    likes: Number(statistics.digg_count || 0),
    comments: Number(statistics.comment_count || 0),
    shares: Number(statistics.share_count || 0),
    views: Number(statistics.play_count || 0),
    collects: Number(statistics.collect_count || 0)
  };

  return {
    id: item.aweme_id,
    url: item.share_url,
    description: item.desc,
    createdAt: item.create_time,
    type,
    stats,
    video:
      type === 'VIDEO'
        ? {
            coverUri: String(originCover.url_list?.[0] || ''),
            mp4Uri: getHighestQualityVideoUri(bitRate)
          }
        : undefined,
    imagesUri:
      type === 'PHOTO'
        ? images
            .map((img) => {
              const image = img as JsonObject;
              const display = (image.display_image || {}) as { url_list?: unknown[] };
              return String(display.url_list?.[0] || '');
            })
            .filter(Boolean)
        : [],
    musicUri: String(musicPlay.url_list?.[0] || '')
  };
};

const parseTikTokData = (awemeList: unknown): JsonObject[] => {
  if (!Array.isArray(awemeList)) return [];
  return awemeList.map((rawItem) => {
    const item = (rawItem || {}) as JsonObject;
    const imagePostInfo = (item.image_post_info || {}) as JsonObject;
    const images = Array.isArray(imagePostInfo.images) ? imagePostInfo.images : [];
    const isPhoto = images.length > 0;
    const type = isPhoto ? 'PHOTO' : 'VIDEO';
    const author = (item.author || {}) as JsonObject;
    const uniqueId = String(author.unique_id || 'user');
    const id = String(item.aweme_id || '');
    const url = `https://www.tiktok.com/@${uniqueId}/${isPhoto ? 'photo' : 'video'}/${id}`;
    const video = (item.video || {}) as JsonObject;
    const cover = (video.cover || {}) as { url_list?: unknown[] };
    const originCover = (video.origin_cover || {}) as { url_list?: unknown[] };
    const dynamicCover = (video.dynamic_cover || {}) as { url_list?: unknown[] };
    const thumbnail = String(cover.url_list?.[0] || originCover.url_list?.[0] || dynamicCover.url_list?.[0] || '');
    const attachments: Array<{ type: 'Photo' | 'Video'; url: string }> = [];

    if (isPhoto) {
      images.forEach((img) => {
        const image = (img || {}) as JsonObject;
        const display = (image.display_image || {}) as { url_list?: unknown[] };
        const wm = (image.owner_watermark_image || {}) as { url_list?: unknown[] };
        const imgUrl = String(display.url_list?.[0] || wm.url_list?.[0] || '');
        if (imgUrl) attachments.push({ type: 'Photo', url: imgUrl });
      });
    } else {
      const playAddr = (video.play_addr || {}) as { url_list?: unknown[] };
      const vidUrl = String(playAddr.url_list?.[0] || '');
      if (vidUrl) attachments.push({ type: 'Video', url: vidUrl });
    }

    const music = (item.music || {}) as JsonObject;
    const playUrl = (music.play_url || {}) as { url_list?: unknown[] };
    const musicDetail = {
      id: String(music.id ?? ''),
      idStr: String(music.id_str ?? ''),
      title: String(music.title || music.music_name || ''),
      author: String(music.author || music.owner_nickname || ''),
      album: String(music.album || ''),
      duration: Number(music.duration || 0),
      auditionDuration: Number(music.audition_duration || 0),
      coverLarge: String(((music.cover_large || {}) as { url_list?: unknown[] }).url_list?.[0] || ''),
      coverMedium: String(((music.cover_medium || {}) as { url_list?: unknown[] }).url_list?.[0] || ''),
      coverThumb: String(((music.cover_thumb || {}) as { url_list?: unknown[] }).url_list?.[0] || ''),
      ownerHandle: String(music.owner_handle || ''),
      ownerNickname: String(music.owner_nickname || ''),
      playUrl: String(playUrl.url_list?.[0] || music.play_url || '')
    };

    const statistics = (item.statistics || {}) as JsonObject;
    const stats: AwemeStats = {
      likes: Number(statistics.digg_count || 0),
      comments: Number(statistics.comment_count || 0),
      shares: Number(statistics.share_count || 0),
      views: Number(statistics.play_count || 0),
      collects: Number(statistics.collect_count || 0)
    };

    const videoOutput =
      type === 'VIDEO'
        ? {
            duration: Number(video.duration || (video as JsonObject).duration_seconds || 0),
            coverUri: thumbnail,
            mp4Uri: String(((video.play_addr || {}) as { url_list?: unknown[] }).url_list?.[0] || '')
          }
        : undefined;

    return {
      id,
      url,
      description: String(item.desc || ''),
      desc: String(item.desc || ''),
      createdAt: Number(item.create_time || 0),
      type,
      thumbnail,
      thumb: thumbnail,
      video: videoOutput,
      stats,
      attachments,
      author: {
        uid: String(author.uid || author.id || ''),
        nickname: String(author.nickname || author.nick_name || ''),
        uniqueId: String(author.unique_id || author.uniqueId || ''),
        secUid: String(author.sec_uid || author.secUid || '')
      },
      music: musicDetail
    };
  });
};

const findValueByKey = (obj: unknown, targetKey: string): unknown => {
  if (!obj || typeof obj !== 'object') return undefined;
  const record = obj as Record<string, unknown>;
  for (const key in record) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    if (key === targetKey) return record[key];
    if (typeof record[key] === 'object' && record[key] !== null) {
      const result = findValueByKey(record[key], targetKey);
      if (result !== undefined) return result;
    }
  }
  return undefined;
};

const parseTiktokResponse = (response: unknown): unknown => {
  if (typeof response === 'object' && response !== null && !Array.isArray(response)) return response;
  if (typeof response === 'string') {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as JsonObject;
      } catch {
        const lines = response.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (/^[0-9a-fA-F]+$/.test(trimmed)) continue;
          const lineJsonMatch = trimmed.match(/\{[\s\S]*\}/);
          if (lineJsonMatch) {
            try {
              return JSON.parse(lineJsonMatch[0]) as JsonObject;
            } catch {
              // continue
            }
          }
        }
      }
    }
  }
  if (Array.isArray(response)) {
    for (const item of response) {
      if (typeof item === 'string') {
        const parsed = parseTiktokResponse(item);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    }
  }
  return response;
};

const tiktokUtils = {
  formatAwemeItemResponse,
  findValueByKey,
  parseTiktokResponse,
  parseTikTokData
};

export {
  formatAwemeItemResponse,
  findValueByKey,
  parseTiktokResponse,
  parseTikTokData
};

export default tiktokUtils;
