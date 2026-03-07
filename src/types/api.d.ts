
export interface FacebookAttachment {
  id?: string;
  like?: string | number;
  type?: string;
  url?: string | { sd?: string; hd?: string };
}

export interface FacebookStoriesResult {
  bucketID?: string | null;
  message: string;
  author?: string | null;
  queryStorieID?: string | null;
  attachments: FacebookAttachment[];
}

export interface FacebookPostResult {
  id?: string | number;
  message?: string;
  author?: string;
  like?: string | number;
  comment?: string | number;
  attachments?: FacebookAttachment[];
  error?: string;
  at?: string;
  detail?: string;
}

export interface TikTokVideoResult {
  id?: string;
  message?: string | null;
  author?: string | null;
  like?: string | number | null;
  play?: string | number | null;
  attachments?: Array<{ type: "Video" | "Photo"; url: string }>;
  error?: string;
  at?: string;
  detail?: string;
}

export interface InstagramAttachment {
  type: "Photo" | "Video";
  url: string;
}

export interface InstagramDownloadResult {
  id: string | number;
  message: string | null;
  author: string | null;
  like: string | null;
  comment?: string | null;
  play?: string | null;
  attachments: InstagramAttachment[];
}

export interface InstagramStoryResult extends InstagramDownloadResult {
  pk?: string;
}

export interface YouTubeVideoResult {
  type: "video" | "live";
  videoId: string;
  url: string;
  title: string;
  author: string;
  timestamp: string;
  seconds: number;
  views: number;
  ago: string;
  thumbnail: string;
}

export interface YouTubeChannelResult {
  type: "channel";
  id: string;
  title: string;
  name: string;
  url: string;
  subCount: number;
  videoCount: number;
  thumbnail?: string;
}

export interface YouTubePlaylistResult {
  type: "playlist";
  listId: string;
  title: string;
  author: string;
  url: string;
  videoCount: number;
  thumbnail?: string;
}

export interface YouTubeSearchResult {
  videos: YouTubeVideoResult[];
  channels: YouTubeChannelResult[];
  playlists: YouTubePlaylistResult[];
  live: YouTubeVideoResult[];
  all: Array<YouTubeVideoResult | YouTubeChannelResult | YouTubePlaylistResult>;
}

export interface YouTubeVideoInfo {
  info: {
    title?: string | null;
    duration?: string | null;
    expiresInSeconds?: string | number | null;
    thumbnail?: string | null;
    viewCount?: string | null;
    keywords?: string[] | null;
    channel?: string | null;
    likes?: string | null;
  };
  bestAudio?: {
    url: string;
    mimeType: string;
    bitrateDiff?: number;
    averageBitrate?: number;
    bitrate?: number;
    contentLength?: string;
  };
  bestProgressive?: {
    url: string;
    mimeType: string;
    qualityLabel?: string;
    audioQuality?: string;
    height?: string | number;
    contentLength?: string;
  };
}

export interface CapcutAttachment {
  type: "Video";
  url: string;
}

export interface CapcutDownloadResult {
  id: string | number;
  message: string;
  short_title?: string;
  duration?: number;
  fragment_count?: number;
  usage_amount?: number;
  play_amount?: number;
  favorite_count?: number;
  like_count?: number;
  comment_count?: number;
  create_time?: number;
  author?: {
    unique_id?: string;
    name?: string;
  } | string;
  play?: number;
  like?: number;
  comment?: number;
  segment?: number;
  createTime?: number;
  attachments: CapcutAttachment[];
  thumb?: string;
  uploadDate?: string;
}

export interface TextProResult {
  image?: string;
  url?: string;
  error?: string;
  message?: string;
}

export interface BaseService {
  [key: string]: string | number | boolean | null | undefined | BaseService | Array<BaseService> | ((...args: unknown[]) => unknown);
}

export interface FacebookService extends BaseService {
  getStories?: (storyID?: string) => Promise<FacebookStoriesResult | { error: string; at: string; detail: string }>;
  getPost?: (postID: string) => Promise<FacebookPostResult>;
}

export interface TikTokService extends BaseService {
  getVideo?: (url: string) => Promise<TikTokVideoResult>;
}

export interface InstagramService extends BaseService {
  getPost?: (url: string) => Promise<InstagramDownloadResult>;
}

export interface YouTubeService extends BaseService {
  getVideo?: (url: string) => Promise<YouTubeVideoInfo>;
  search?: (query: string) => Promise<YouTubeSearchResult>;
}

export interface CapcutService extends BaseService {
  download?: (url: string) => Promise<CapcutDownloadResult>;
}

export interface TextProService extends BaseService {
  create?: (text: string, style: string) => Promise<TextProResult>;
}


export type ApiService =
  | FacebookService
  | TikTokService
  | InstagramService
  | YouTubeService
  | CapcutService
  | TextProService
  | BaseService;


export interface ServicesMap {
  facebook?: FacebookService;
  tiktok?: TikTokService;
  instagram?: InstagramService;
  youtube?: YouTubeService;
  capcut?: CapcutService;
  textpro?: TextProService;
  [key: string]: ApiService | undefined;
}
