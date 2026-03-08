// ─── Raw TikTok API shapes ────────────────────────────────────────────────────

export interface TikTokUrlList {
  url_list: string[]
  width?: number
  height?: number
}

export interface TikTokUserRaw {
  uid?: string
  unique_id?: string
  uniqueId?: string
  nickname?: string
  nick_name?: string
  avatar_thumb?: TikTokUrlList
  avatar_medium?: TikTokUrlList
  avatar_larger?: TikTokUrlList
  sec_uid?: string
  follower_count?: number
  following_count?: number
}

export interface TikTokCommentRaw {
  cid?: string
  comment_id?: string
  text?: string
  comment_text?: string
  create_time?: number
  digg_count?: number
  like_count?: number
  reply_count?: number
  user?: TikTokUserRaw
  user_id?: string
  reply_comment?: TikTokCommentRaw[]
}

export interface TikTokStatisticsRaw {
  digg_count: number
  comment_count: number
  share_count: number
  play_count: number
  collect_count: number
}

export interface TikTokPlayAddr {
  url_list: string[]
  width?: number
  height?: number
}

export interface TikTokBitRate {
  play_addr?: TikTokPlayAddr
}

export interface TikTokVideoRaw {
  origin_cover?: TikTokUrlList
  cover?: TikTokUrlList
  dynamic_cover?: TikTokUrlList
  bit_rate?: TikTokBitRate[]
  play_addr?: TikTokPlayAddr
  duration?: number
  duration_seconds?: number
}

export interface TikTokImageRaw {
  display_image?: TikTokUrlList
  owner_watermark_image?: TikTokUrlList
}

export interface TikTokImagePostInfo {
  images: TikTokImageRaw[]
}

export interface TikTokMusicRaw {
  id?: string | number
  id_str?: string
  music_id?: string
  title?: string
  music_name?: string
  author?: string
  owner_nickname?: string
  owner_handle?: string
  album?: string
  duration?: number
  audition_duration?: number
  cover_large?: TikTokUrlList
  cover_medium?: TikTokUrlList
  cover_thumb?: TikTokUrlList
  play_url?: TikTokUrlList | string
}

export interface TikTokAwemeRaw {
  aweme_id: string
  share_url?: string
  desc?: string
  create_time?: number
  statistics: TikTokStatisticsRaw
  video: TikTokVideoRaw
  image_post_info?: TikTokImagePostInfo
  music?: TikTokMusicRaw
  author?: TikTokUserRaw
}

export interface TikTokSearchDataItem {
  type: number
  aweme_info?: TikTokAwemeRaw
}

export interface TikTokApiResponse {
  status_code?: number
  status_msg?: string
  has_more?: number | boolean
  cursor?: number | string
  min_cursor?: number | string
  max_cursor?: number | string
  total?: number
  comments?: TikTokCommentRaw[]
  aweme_list?: TikTokAwemeRaw[]
  aweme_details?: TikTokAwemeRaw[]
  data?: TikTokSearchDataItem[]
  music_list?: TikTokMusicRaw[]
  music?: TikTokMusicRaw[]
  landing_url?: string
  user?: TikTokUserRaw
  files?: Record<string, { content: string }>
}

// ─── Formatted / response types ──────────────────────────────────────────────

export type TikTokAwemeType = 'PHOTO' | 'VIDEO'

export interface TikTokStats {
  likes: number
  comments: number
  shares: number
  views: number
  collects: number
}

export interface TikTokVideoFormatted {
  coverUri: string
  mp4Uri: string
}

export interface FormattedAwemeItem {
  id: string
  url: string
  description: string
  createdAt: number
  type: TikTokAwemeType
  stats: TikTokStats
  video?: TikTokVideoFormatted
  imagesUri: string[]
  musicUri: string
}

export interface MusicDetail {
  id: string
  idStr: string
  title: string
  author: string
  album: string
  duration: number
  auditionDuration: number
  coverLarge: string
  coverMedium: string
  coverThumb: string
  ownerHandle: string
  ownerNickname: string
  playUrl: string
}

export interface ParsedAwemeAttachment {
  type: string
  url: string
}

export interface ParsedAwemeVideo {
  duration: number
  coverUri: string
  mp4Uri: string
}

export interface ParsedAwemeAuthor {
  uniqueId: string
  nickname: string
  avatarLarger: string
}

export interface ParsedAwemeItem {
  id: string
  url: string
  description: string
  desc: string
  createdAt: number
  type: TikTokAwemeType
  thumbnail: string
  thumb: string
  video?: ParsedAwemeVideo
  stats: TikTokStats
  attachments: ParsedAwemeAttachment[]
  music?: MusicDetail
  author?: ParsedAwemeAuthor
}

export interface TikTokCommentUser {
  uid: string
  uniqueId: string
  nickname: string
  avatarUri: string
}

export interface TikTokReply {
  cid: string
  text: string
  createTime: number
  diggCount: number
  replyCount: number
  user: TikTokCommentUser
}

export interface TikTokComment {
  cid: string
  text: string
  createTime: number
  diggCount: number
  replyCount: number
  user: TikTokCommentUser
  replyComment: TikTokReply[]
}

export interface TikTokPagination {
  cursor: string
  maxCursor: string
  hasMore: boolean
}

export interface TikTokCredentials {
  cookie: string
  xTtToken?: string
}

export interface TikTokMusicFormatted {
  id: string
  title: string
  author: string
  coverUri: string
  duration: number
  playUrl?: string
}

export interface TikTokUserInfo {
  uid: string
  uniqueId: string
  secUid: string
  followerCount: number | undefined
  followingCount: number | undefined
  avatarUri: string
}

// ─── Service options ──────────────────────────────────────────────────────────

export interface BaseOptions {
  cookie?: string
  xTtToken?: string
}

export interface GetCommentListOptions extends BaseOptions {
  awemeId: string
  cursor?: number
  count?: number
  enterFrom?: string
  liteFlowSchedule?: string
  cdnCacheIsLogin?: number
  cdnCacheStrategy?: string
  isNonPersonalized?: number
}

export interface GetFYPFeedOptions extends BaseOptions {
  sp?: number
  type?: number
  maxCursor?: number
  minCursor?: number
  count?: number
  volume?: number
  pullType?: number
  reqFrom?: string
  gaid?: string
  adUserAgent?: string
  filterWarn?: number
  adPersonalityMode?: number
  addressBookAccess?: number
  localCache?: string
  localCacheType?: string
  lastAdShowInterval?: number
  vpaContentChoice?: number
  cmplEnc?: string
  mccMnc?: string
  isLiveReady?: number
  feedId?: string
  brandAdActionType?: number
  feedAecType?: number
  dataSaverType?: number
  dataSaverWork?: boolean
  replaceType?: number
  isNonPersonalized?: number
}

export interface SearchOptions extends BaseOptions {
  keyword: string
  cursor?: number
  count?: number
  enterFrom?: string
  queryCorrectType?: number
  searchSource?: string
  searchId?: string
  requestTagFrom?: string
}

export interface SearchStreamOptions extends SearchOptions {
  enableLiteWorkflow?: number
  enableLiteCut?: number
  backtrace?: string
  lastSearchId?: string
  endToEndSearchSessionId?: string
}

export interface SearchSingleOptions extends SearchStreamOptions {
  beforeSetStateTime?: number
  isNonPersonalizedSearch?: number
}

export interface SearchItemOptions extends BaseOptions {
  keyword: string
  cursor?: number
  count?: number
  enterFrom?: string
  source?: string
  queryCorrectType?: number
  searchSource?: string
  searchId?: string
  requestTagFrom?: string
}

export interface SearchPhotoEcomOptions extends BaseOptions {
  imagePath: string
  cursor?: number
  count?: number
}

export interface GetUserAwemeListOptions extends BaseOptions {
  maxCursor?: string
  cursor?: string
  userId?: string
  count?: string
}

export interface GetAwemeDetailsOptions extends BaseOptions {
  originType?: string
  requestSource?: string
}

export interface GetMultiAwemeDetailsOptions extends BaseOptions {
  awemeIds: string[]
  requestSource?: string
  shareLinkMode?: number
  shareScene?: number
}

// ─── Signer types ─────────────────────────────────────────────────────────────

export interface GorgonParams {
  params: string
  unix: number
  bodyPayload?: string
  cookies?: string
}

export interface GorgonResult {
  'x-ss-req-ticket': string
  'X-Khronos': string
  'X-Gorgon': string
}

export interface LadonEncryptParams {
  khronos: number
  licenseId?: number
  aid?: number
  randBytes?: Uint8Array
}

export interface ArgusSignParams {
  queryParams?: string
  x_ss_stub?: string
  timestamp?: number
  aid?: number
  licenseId?: number
  platform?: number
  secDeviceId?: string
  sdkVersion?: string
  sdkVersionInt?: number
}

export interface MobileHeadersSignatureParams {
  queryParams: string
  bodyPayload?: string
  cookies: string
}

export interface MobileHeadersSignatureResult {
  'X-Gorgon': string
  'X-Khronos': string
  'x-ss-req-ticket': string
  'X-Ladon': string
  'X-Argus': string
  'x-ss-stub': string | undefined
}

export interface BaseMobileParams {
  _rticket: number
  device_id: string
  ts: number
  iid: string
  openudid: string
  cdid: string
  manifest_version_code: number
  app_language: string
  app_type: string
  app_package: string
  channel: string
  device_type: string
  language: string
  host_abi: string
  locale: string
  resolution: string
  update_version_code: number
  ac2: string
  sys_region: string
  os_api: number
  timezone_name: string
  dpi: number
  carrier_region: string
  ac: string
  os: string
  os_version: string
  timezone_offset: number
  version_code: number
  app_name: string
  ab_version: string
  version_name: string
  device_brand: string
  op_region: string
  ssmix: string
  device_platform: string
  build_number: string
  region: string
  aid: number
}
