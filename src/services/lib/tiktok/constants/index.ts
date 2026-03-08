export const TIKTOK_API_URL = {
  GET_USER_AWEME_LIST: 'https://api22-normal-c-alisg.tiktokv.com/lite/v2/public/item/list/',
  GET_AWEME_DETAIL: 'https://api22-normal-c-alisg.tiktokv.com/tiktok/v1/videos/detail/',
  GET_AWEME_DETAIL_V2: 'https://api22-normal-c-alisg.tiktokv.com/aweme/v1/feed/',
  GET_MULTI_AWEME_DETAIL: 'https://api22-normal-c-alisg.tiktokv.com/aweme/v1/multi/aweme/detail/',
  RESOLVE_SHORT_LINK: 'https://api22-normal-c-alisg.tiktokv.com/tiktok/linker/target/get/v1/',
  SEARCH_USER: 'https://search16-normal-c-alisg.tiktokv.com/aweme/v1/general/search/single/',
  GET_USER_INFO: 'https://api22-core-c-alisg.tiktokv.com/lite/v2/user/detail/other/',
  GET_FYP_FEED: 'https://api22-core-c-alisg.tiktokv.com/lite/v2/feed/fyp/',
  GET_COMMENT_LIST: 'https://api22-normal-c-alisg.tiktokv.com/lite/v2/comment/list/',
  SEARCH_MUSIC: 'https://search16-normal-c-alisg.tiktokv.com/aweme/v1/music/search/',
  SEARCH_STREAM: 'https://search16-normal-c-alisg.tiktokv.com/aweme/v1/general/search/stream/',
  SEARCH_SINGLE: 'https://search16-normal-c-alisg.tiktokv.com/aweme/v1/general/search/single/',
  SEARCH_ITEM: 'https://search19-normal-alisg.tiktokv.com/aweme/v1/search/item/',
  SEARCH_PHOTO_ECOM: 'https://search22-normal-c-alisg.tiktokv.com/aweme/v1/search/photo/bff/ecom/'
} as const

export type TikTokApiUrlKey = keyof typeof TIKTOK_API_URL

export default TIKTOK_API_URL
