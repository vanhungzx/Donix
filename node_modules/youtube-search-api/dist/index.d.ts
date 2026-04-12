export declare class YouTubeAPIError extends Error {
    readonly code: string;
    readonly statusCode?: number;
    readonly originalError?: Error;
    constructor(message: string, code: string, statusCode?: number, originalError?: Error);
}
export declare enum ErrorCodes {
    NETWORK_ERROR = "NETWORK_ERROR",
    INIT_DATA_ERROR = "INIT_DATA_ERROR",
    PLAYER_DATA_ERROR = "PLAYER_DATA_ERROR",
    INVALID_PLAYLIST = "INVALID_PLAYLIST",
    INVALID_VIDEO_ID = "INVALID_VIDEO_ID",
    INVALID_CHANNEL_ID = "INVALID_CHANNEL_ID",
    RATE_LIMIT_ERROR = "RATE_LIMIT_ERROR",
    PARSE_ERROR = "PARSE_ERROR",
    UNKNOWN_ERROR = "UNKNOWN_ERROR"
}
export declare class ErrorHandler {
    private static instance;
    private errorLogger?;
    private constructor();
    static getInstance(): ErrorHandler;
    setErrorLogger(logger: (error: YouTubeAPIError) => void): void;
    handleError(error: any, context: string, code?: ErrorCodes): never;
    private getErrorMessage;
    createError(message: string, code: ErrorCodes, statusCode?: number, originalError?: Error): YouTubeAPIError;
}
export interface SearchItem {
    id: string;
    type: string;
    thumbnail: any;
    title: string;
    channelTitle?: string;
    shortBylineText?: string;
    length?: string | any;
    isLive?: boolean;
    videos?: any[];
    videoCount?: string;
}
export interface SearchResult {
    items: SearchItem[];
    nextPage: {
        nextPageToken: string | null;
        nextPageContext: any;
    };
}
export interface PlaylistResult {
    items: SearchItem[];
    metadata: any;
}
export interface ChannelResult {
    title: string;
    content: any;
}
export interface VideoDetails {
    id: string;
    title: string;
    thumbnail: any;
    isLive: boolean;
    channel: string;
    channelId: string;
    description: string;
    keywords: string[];
    suggestion: SearchItem[];
}
export interface ShortVideo {
    id: string;
    type: string;
    thumbnail: any;
    title: string;
    inlinePlaybackEndpoint: any;
}
interface SearchOptions {
    type: string;
}
declare const GetData: (keyword: string, withPlaylist?: boolean, limit?: number, options?: SearchOptions[]) => Promise<SearchResult>;
declare const nextPage: (nextPage: {
    nextPageToken: string | null;
    nextPageContext: any;
}, withPlaylist?: boolean, limit?: number) => Promise<SearchResult>;
declare const GetPlaylistData: (playlistId: string, limit?: number) => Promise<PlaylistResult>;
declare const GetSuggestData: (limit?: number) => Promise<{
    items: SearchItem[];
}>;
declare const GetChannelById: (channelId: string) => Promise<ChannelResult[]>;
declare const GetVideoDetails: (videoId: string) => Promise<VideoDetails>;
export declare const VideoRender: (json: any) => SearchItem;
declare const GetShortVideo: () => Promise<ShortVideo[]>;
export { GetData as GetListByKeyword, nextPage as NextPage, GetPlaylistData, GetSuggestData, GetChannelById, GetVideoDetails, GetShortVideo };
