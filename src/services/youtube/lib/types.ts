import type { Cookie, CookieJar } from "tough-cookie";
import type { Dispatcher } from "undici";

export type Primitive = boolean | number | string | null;
export type JsonValue = JsonArray | JsonObject | Primitive;
export type JsonArray = JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export type HeadersMap = Record<string, string>;
export type MaybePromise<T> = Promise<T> | T;
export type QueryValue = boolean | number | string;
export type UnknownRecord = Record<string, unknown>;

export interface Thumbnail {
  height?: number;
  url?: string;
  width?: number;
}

export interface TextRun extends UnknownRecord {
  text?: string;
}

export interface TextNode extends UnknownRecord {
  runs?: TextRun[];
  simpleText?: string;
  text?: string;
}

export interface SearchOptions {
  clientVersion?: string;
  gl?: string;
  hl?: string;
  key?: string;
  visitor?: string;
}

export interface SearchVideoResult {
  ago: string;
  author: string;
  seconds: number;
  thumbnail: string;
  timestamp: string;
  title: string;
  type: "live" | "video";
  url: string;
  videoId: string;
  views: number;
}

export interface SearchChannelResult {
  id: string;
  name: string;
  subCount: number;
  thumbnail?: string;
  title: string;
  type: "channel";
  url: string;
  videoCount: number;
}

export interface SearchPlaylistResult {
  author: string;
  listId: string;
  thumbnail?: string;
  title: string;
  type: "playlist";
  url: string;
  videoCount: number;
}

export interface SearchV2Result {
  channel: string;
  id: string;
  length: string | null;
  title: string;
  url: string;
}

export interface SearchResult {
  all: Array<SearchChannelResult | SearchPlaylistResult | SearchVideoResult>;
  channels: SearchChannelResult[];
  live: SearchVideoResult[];
  playlists: SearchPlaylistResult[];
  videos: SearchVideoResult[];
}

export interface SearchV2Response {
  raw: UnknownRecord;
  results: SearchV2Result[];
}

export interface CacheEntry<T> {
  tid: NodeJS.Timeout;
  value: T;
}

export interface CookieDescriptor extends UnknownRecord {
  domain?: string;
  expirationDate?: number;
  hostOnly?: boolean;
  httpOnly?: boolean;
  name?: string;
  path?: string;
  sameSite?: string;
  secure?: boolean;
  session?: boolean;
  value?: string;
}

export type CookieInput = Cookie | CookieDescriptor;

export interface YoutubeAgent extends UnknownRecord {
  _boundIP?: string;
  _ipBound?: boolean;
  _proxyURI?: string;
  agent?: unknown;
  dispatcher?: Dispatcher;
  jar?: CookieJar;
  localAddress?: string;
}

export interface YoutubeFormat extends UnknownRecord {
  _calculatedSize?: boolean;
  _deciphered?: boolean;
  approxDurationMs?: number | string;
  audioBitrate?: number | string | null;
  audioCodec?: string | null;
  audioQuality?: string;
  audioSampleRate?: string;
  averageBitrate?: number | string;
  bitrate?: number | string;
  cipher?: string;
  codecs?: string | null;
  container?: string | null;
  contentLength?: number | string;
  fps?: number;
  hasAudio?: boolean;
  hasVideo?: boolean;
  height?: number;
  isDashMPD?: boolean;
  isHLS?: boolean;
  isLive?: boolean;
  itag?: number | string;
  mimeType?: string | null;
  quality?: string;
  qualityLabel?: string | null;
  s?: string;
  signatureCipher?: string;
  sp?: string;
  url?: string;
  videoCodec?: string | null;
  width?: number;
}

export interface YoutubeStreamingData extends UnknownRecord {
  adaptiveFormats?: YoutubeFormat[];
  dashManifestUrl?: string;
  formats?: YoutubeFormat[];
  hlsManifestUrl?: string;
}

export interface TrackingParam extends UnknownRecord {
  key?: string;
  value?: string;
}

export interface ServiceTrackingParam extends UnknownRecord {
  params?: TrackingParam[];
  service?: string;
}

export interface YoutubeResponseContext extends UnknownRecord {
  serviceTrackingParams?: ServiceTrackingParam[];
}

export interface YoutubePlayabilityStatus extends UnknownRecord {
  messages?: string[];
  reason?: string;
  status?: string;
}

export interface YoutubeVideoDetails extends UnknownRecord {
  author?: string;
  channelId?: string;
  keywords?: string[];
  lengthSeconds?: number | string;
  shortDescription?: string;
  thumbnail?: {
    thumbnails?: Thumbnail[];
  };
  title?: string;
  videoId?: string;
  viewCount?: number | string;
}

export interface YoutubePlayerResponseArgs extends UnknownRecord {
  player_response?: string | YoutubePlayerResponse;
}

export interface YoutubePlayerResponse extends UnknownRecord {
  args?: YoutubePlayerResponseArgs;
  embedded_player_response?: string | YoutubePlayerResponse;
  html5player?: string;
  playabilityStatus?: YoutubePlayabilityStatus;
  playerResponse?: string | YoutubePlayerResponse;
  player_response?: string | YoutubePlayerResponse;
  response?: JsonObject;
  responseContext?: YoutubeResponseContext;
  streamingData?: YoutubeStreamingData;
  videoDetails?: YoutubeVideoDetails;
}

export interface YoutubeInfo extends YoutubePlayerResponse {
  _agentUsed?: YoutubeAgent;
  _innerTube?: UnknownRecord;
  _ipBound?: boolean;
  _localAddressUsed?: string;
  formats: YoutubeFormat[];
  full?: boolean;
  live_chunk_readahead?: number | string;
  success?: boolean;
}

export interface ByteRange {
  end?: number;
  start?: number;
}

export type FormatFilter =
  | "audio"
  | "audioandvideo"
  | "audioonly"
  | "video"
  | "videoandaudio"
  | "videoonly"
  | ((format: YoutubeFormat) => boolean);

export interface YoutubeRequestOptions extends UnknownRecord {
  agent?: unknown;
  backoff?: {
    inc: number;
    max: number;
  };
  body?: string;
  dispatcher?: Dispatcher;
  headers?: HeadersMap;
  localAddress?: string;
  maxReconnects?: number;
  maxRetries?: number;
  method?: string;
  query?: Record<string, QueryValue>;
}

export interface RewriteRequestResult {
  requestOptions?: YoutubeRequestOptions;
  url?: string;
}

export interface YoutubeRequestConfig extends UnknownRecord {
  IPv6Block?: string;
  agent?: YoutubeAgent;
  fetch?: typeof globalThis.fetch;
  lang?: string;
  playerClients?: string[];
  requestOptions?: YoutubeRequestOptions;
  rewriteRequest?: (url: string, requestOptions: YoutubeRequestOptions) => RewriteRequestResult;
  useAntiDetection?: boolean;
  visitorId?: string;
}

export interface YtdlOptions extends YoutubeRequestConfig {
  autoDecipher?: boolean;
  begin?: Date | number | string;
  decipherRetries?: number;
  decipherTimeout?: number;
  dlChunkSize?: number;
  filter?: FormatFilter;
  format?: YoutubeFormat;
  highWaterMark?: number;
  liveBuffer?: number;
  maxThreads?: number;
  minSizeForMultiThread?: number;
  multiThread?: boolean;
  quality?: Array<number | string> | number | string;
  range?: ByteRange;
}

export interface StatusCodeError extends Error {
  response?: unknown;
  status?: string;
  statusCode?: number;
  videoId?: string;
}
