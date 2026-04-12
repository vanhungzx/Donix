"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetShortVideo = exports.GetVideoDetails = exports.GetChannelById = exports.GetSuggestData = exports.GetPlaylistData = exports.NextPage = exports.GetListByKeyword = exports.VideoRender = exports.ErrorHandler = exports.ErrorCodes = exports.YouTubeAPIError = void 0;
const axios_1 = __importDefault(require("axios"));
// 自定義錯誤類別
class YouTubeAPIError extends Error {
    constructor(message, code, statusCode, originalError) {
        super(message);
        this.name = 'YouTubeAPIError';
        this.code = code;
        this.statusCode = statusCode;
        this.originalError = originalError;
    }
}
exports.YouTubeAPIError = YouTubeAPIError;
// 錯誤代碼枚舉
var ErrorCodes;
(function (ErrorCodes) {
    ErrorCodes["NETWORK_ERROR"] = "NETWORK_ERROR";
    ErrorCodes["INIT_DATA_ERROR"] = "INIT_DATA_ERROR";
    ErrorCodes["PLAYER_DATA_ERROR"] = "PLAYER_DATA_ERROR";
    ErrorCodes["INVALID_PLAYLIST"] = "INVALID_PLAYLIST";
    ErrorCodes["INVALID_VIDEO_ID"] = "INVALID_VIDEO_ID";
    ErrorCodes["INVALID_CHANNEL_ID"] = "INVALID_CHANNEL_ID";
    ErrorCodes["RATE_LIMIT_ERROR"] = "RATE_LIMIT_ERROR";
    ErrorCodes["PARSE_ERROR"] = "PARSE_ERROR";
    ErrorCodes["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(ErrorCodes || (exports.ErrorCodes = ErrorCodes = {}));
// 錯誤處理器
class ErrorHandler {
    constructor() { }
    static getInstance() {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }
    setErrorLogger(logger) {
        this.errorLogger = logger;
    }
    handleError(error, context, code = ErrorCodes.UNKNOWN_ERROR) {
        var _a;
        let youtubeError;
        if (error instanceof YouTubeAPIError) {
            youtubeError = error;
        }
        else if (axios_1.default.isAxiosError(error)) {
            const statusCode = (_a = error.response) === null || _a === void 0 ? void 0 : _a.status;
            const message = this.getErrorMessage(code, context, error.message);
            youtubeError = new YouTubeAPIError(message, code, statusCode, error);
        }
        else {
            const message = this.getErrorMessage(code, context, (error === null || error === void 0 ? void 0 : error.message) || (error === null || error === void 0 ? void 0 : error.toString()) || '未知錯誤');
            youtubeError = new YouTubeAPIError(message, code, undefined, error);
        }
        // 記錄錯誤
        if (this.errorLogger) {
            this.errorLogger(youtubeError);
        }
        else {
            console.error(`[YouTubeAPI Error] ${youtubeError.code}: ${youtubeError.message}`);
        }
        throw youtubeError;
    }
    getErrorMessage(code, context, originalMessage) {
        const errorMessages = {
            [ErrorCodes.NETWORK_ERROR]: `Network connection error: ${context}`,
            [ErrorCodes.INIT_DATA_ERROR]: `Cannot get initialization data: ${context}`,
            [ErrorCodes.PLAYER_DATA_ERROR]: `Cannot get player data: ${context}`,
            [ErrorCodes.INVALID_PLAYLIST]: `Invalid playlist ID: ${context}`,
            [ErrorCodes.INVALID_VIDEO_ID]: `Invalid video ID: ${context}`,
            [ErrorCodes.INVALID_CHANNEL_ID]: `Invalid channel ID: ${context}`,
            [ErrorCodes.RATE_LIMIT_ERROR]: `Rate limit exceeded, please try again later: ${context}`,
            [ErrorCodes.PARSE_ERROR]: `Data parsing error: ${context}`,
            [ErrorCodes.UNKNOWN_ERROR]: `Unknown error: ${context}`
        };
        const baseMessage = errorMessages[code];
        return originalMessage ? `${baseMessage} (${originalMessage})` : baseMessage;
    }
    createError(message, code, statusCode, originalError) {
        return new YouTubeAPIError(message, code, statusCode, originalError);
    }
}
exports.ErrorHandler = ErrorHandler;
// 全域錯誤處理器實例
const errorHandler = ErrorHandler.getInstance();
const youtubeEndpoint = `https://www.youtube.com`;
const GetYoutubeInitData = (url) => __awaiter(void 0, void 0, void 0, function* () {
    let initdata = {};
    let apiToken = null;
    let context = null;
    try {
        const page = yield axios_1.default.get(encodeURI(url));
        const ytInitData = page.data.split("var ytInitialData =");
        if (ytInitData && ytInitData.length > 1) {
            const data = ytInitData[1].split("</script>")[0].slice(0, -1);
            if (page.data.split("innertubeApiKey").length > 1) {
                const apiKeyPart = page.data.split("innertubeApiKey")[1];
                if (apiKeyPart) {
                    apiToken = apiKeyPart
                        .trim()
                        .split(",")[0]
                        .split('"')[2];
                }
            }
            if (page.data.split("INNERTUBE_CONTEXT").length > 1) {
                const contextPart = page.data.split("INNERTUBE_CONTEXT")[1];
                if (contextPart) {
                    context = JSON.parse(contextPart.trim().slice(2, -2));
                }
            }
            initdata = JSON.parse(data);
            return { initdata, apiToken, context };
        }
        else {
            errorHandler.handleError(new Error("Cannot parse YouTube initialization data"), `URL: ${url}`, ErrorCodes.INIT_DATA_ERROR);
            // 這行永遠不會執行，因為 handleError 會拋出錯誤
            throw new Error("Unreachable code");
        }
    }
    catch (ex) {
        if (ex instanceof YouTubeAPIError) {
            throw ex;
        }
        errorHandler.handleError(ex, `Failed to get initialization data - URL: ${url}`, ErrorCodes.INIT_DATA_ERROR);
        // 這行永遠不會執行，因為 handleError 會拋出錯誤
        throw new Error("Unreachable code");
    }
});
const GetYoutubePlayerDetail = (url) => __awaiter(void 0, void 0, void 0, function* () {
    let initdata = {};
    try {
        const page = yield axios_1.default.get(encodeURI(url));
        const ytInitData = page.data.split("var ytInitialPlayerResponse =");
        if (ytInitData && ytInitData.length > 1) {
            const data = ytInitData[1].split("</script>")[0].slice(0, -1);
            initdata = JSON.parse(data);
            return Object.assign({}, initdata.videoDetails);
        }
        else {
            errorHandler.handleError(new Error("Cannot parse YouTube player data"), `URL: ${url}`, ErrorCodes.PLAYER_DATA_ERROR);
            // 這行永遠不會執行，因為 handleError 會拋出錯誤
            throw new Error("Unreachable code");
        }
    }
    catch (ex) {
        if (ex instanceof YouTubeAPIError) {
            throw ex;
        }
        errorHandler.handleError(ex, `Failed to get player data - URL: ${url}`, ErrorCodes.PLAYER_DATA_ERROR);
        // 這行永遠不會執行，因為 handleError 會拋出錯誤
        throw new Error("Unreachable code");
    }
});
const GetData = (keyword_1, ...args_1) => __awaiter(void 0, [keyword_1, ...args_1], void 0, function* (keyword, withPlaylist = false, limit = 0, options = []) {
    let endpoint = `${youtubeEndpoint}/results?search_query=${keyword}`;
    try {
        if (Array.isArray(options) && options.length > 0) {
            const type = options.find((z) => z.type);
            if (type && typeof type.type === "string") {
                switch (type.type.toLowerCase()) {
                    case "video":
                        endpoint = `${endpoint}&sp=EgIQAQ%3D%3D`;
                        break;
                    case "channel":
                        endpoint = `${endpoint}&sp=EgIQAg%3D%3D`;
                        break;
                    case "playlist":
                        endpoint = `${endpoint}&sp=EgIQAw%3D%3D`;
                        break;
                    case "movie":
                        endpoint = `${endpoint}&sp=EgIQBA%3D%3D`;
                        break;
                }
            }
        }
        const page = yield GetYoutubeInitData(endpoint);
        const sectionListRenderer = page.initdata.contents.twoColumnSearchResultsRenderer.primaryContents
            .sectionListRenderer;
        let contToken = {};
        let items = [];
        sectionListRenderer.contents.forEach((content) => {
            if (content.continuationItemRenderer) {
                contToken =
                    content.continuationItemRenderer.continuationEndpoint
                        .continuationCommand.token;
            }
            else if (content.itemSectionRenderer) {
                content.itemSectionRenderer.contents.forEach((item) => {
                    if (item.channelRenderer) {
                        let channelRenderer = item.channelRenderer;
                        items.push({
                            id: channelRenderer.channelId,
                            type: "channel",
                            thumbnail: channelRenderer.thumbnail,
                            title: channelRenderer.title.simpleText
                        });
                    }
                    else {
                        let videoRender = item.videoRenderer;
                        let playListRender = item.playlistRenderer;
                        if (videoRender && videoRender.videoId) {
                            items.push((0, exports.VideoRender)(item));
                        }
                        if (withPlaylist) {
                            if (playListRender && playListRender.playlistId) {
                                items.push({
                                    id: playListRender.playlistId,
                                    type: "playlist",
                                    thumbnail: playListRender.thumbnails,
                                    title: playListRender.title.simpleText,
                                    length: playListRender.videoCount,
                                    videos: playListRender.videos,
                                    videoCount: playListRender.videoCount,
                                    isLive: false
                                });
                            }
                        }
                    }
                });
            }
        });
        const apiToken = page.apiToken;
        const context = page.context;
        const nextPageContext = { context, continuation: contToken };
        const itemsResult = limit !== 0 ? items.slice(0, limit) : items;
        return {
            items: itemsResult,
            nextPage: { nextPageToken: apiToken, nextPageContext }
        };
    }
    catch (ex) {
        if (ex instanceof YouTubeAPIError) {
            throw ex;
        }
        errorHandler.handleError(ex, `Search failed - keyword: ${keyword}`, ErrorCodes.UNKNOWN_ERROR);
        // 這行永遠不會執行，因為 handleError 會拋出錯誤
        throw new Error("Unreachable code");
    }
});
exports.GetListByKeyword = GetData;
const nextPage = (nextPage_1, ...args_1) => __awaiter(void 0, [nextPage_1, ...args_1], void 0, function* (nextPage, withPlaylist = false, limit = 0) {
    const endpoint = `${youtubeEndpoint}/youtubei/v1/search?key=${nextPage.nextPageToken}`;
    try {
        const page = yield axios_1.default.post(encodeURI(endpoint), nextPage.nextPageContext);
        const item1 = page.data.onResponseReceivedCommands[0].appendContinuationItemsAction;
        let items = [];
        item1.continuationItems.forEach((conitem) => {
            if (conitem.itemSectionRenderer) {
                conitem.itemSectionRenderer.contents.forEach((item) => __awaiter(void 0, void 0, void 0, function* () {
                    let videoRender = item.videoRenderer;
                    let playListRender = item.playlistRenderer;
                    if (videoRender && videoRender.videoId) {
                        items.push((0, exports.VideoRender)(item));
                    }
                    if (withPlaylist) {
                        if (playListRender && playListRender.playlistId) {
                            items.push({
                                id: playListRender.playlistId,
                                type: "playlist",
                                thumbnail: playListRender.thumbnails,
                                title: playListRender.title.simpleText,
                                length: playListRender.videoCount,
                                videos: (yield GetPlaylistData(playListRender.playlistId))
                                    .items,
                                videoCount: playListRender.videoCount,
                                isLive: false
                            });
                        }
                    }
                }));
            }
            else if (conitem.continuationItemRenderer) {
                nextPage.nextPageContext.continuation =
                    conitem.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
            }
        });
        const itemsResult = limit !== 0 ? items.slice(0, limit) : items;
        return { items: itemsResult, nextPage };
    }
    catch (ex) {
        if (ex instanceof YouTubeAPIError) {
            throw ex;
        }
        errorHandler.handleError(ex, `Failed to get next page`, ErrorCodes.UNKNOWN_ERROR);
        // 這行永遠不會執行，因為 handleError 會拋出錯誤
        throw new Error("Unreachable code");
    }
});
exports.NextPage = nextPage;
const GetPlaylistData = (playlistId_1, ...args_1) => __awaiter(void 0, [playlistId_1, ...args_1], void 0, function* (playlistId, limit = 0) {
    const endpoint = `${youtubeEndpoint}/playlist?list=${playlistId}`;
    try {
        const initData = yield GetYoutubeInitData(endpoint);
        const sectionListRenderer = initData.initdata;
        const metadata = sectionListRenderer.metadata;
        if (sectionListRenderer && sectionListRenderer.contents) {
            const videoItems = sectionListRenderer.contents.twoColumnBrowseResultsRenderer.tabs[0]
                .tabRenderer.content.sectionListRenderer.contents[0]
                .itemSectionRenderer.contents[0].playlistVideoListRenderer.contents;
            let items = [];
            videoItems.forEach((item) => {
                let videoRender = item.playlistVideoRenderer;
                if (videoRender && videoRender.videoId) {
                    items.push((0, exports.VideoRender)(item));
                }
            });
            const itemsResult = limit !== 0 ? items.slice(0, limit) : items;
            return { items: itemsResult, metadata };
        }
        else {
            errorHandler.handleError(new Error("Invalid playlist"), `播放清單 ID: ${playlistId}`, ErrorCodes.INVALID_PLAYLIST);
            // 這行永遠不會執行，因為 handleError 會拋出錯誤
            throw new Error("Unreachable code");
        }
    }
    catch (ex) {
        if (ex instanceof YouTubeAPIError) {
            throw ex;
        }
        errorHandler.handleError(ex, `Failed to get playlist - ID: ${playlistId}`, ErrorCodes.UNKNOWN_ERROR);
        // 這行永遠不會執行，因為 handleError 會拋出錯誤
        throw new Error("Unreachable code");
    }
});
exports.GetPlaylistData = GetPlaylistData;
const GetSuggestData = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (limit = 0) {
    const endpoint = youtubeEndpoint;
    try {
        const page = yield GetYoutubeInitData(endpoint);
        const sectionListRenderer = page.initdata.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer
            .content.richGridRenderer.contents;
        let items = [];
        let otherItems = [];
        sectionListRenderer.forEach((item) => {
            if (item.richItemRenderer && item.richItemRenderer.content) {
                let videoRender = item.richItemRenderer.content.videoRenderer;
                if (videoRender && videoRender.videoId) {
                    items.push((0, exports.VideoRender)(item.richItemRenderer.content));
                }
                else {
                    otherItems.push(videoRender);
                }
            }
        });
        const itemsResult = limit !== 0 ? items.slice(0, limit) : items;
        return { items: itemsResult };
    }
    catch (ex) {
        console.error(ex);
        throw ex;
    }
});
exports.GetSuggestData = GetSuggestData;
const GetChannelById = (channelId) => __awaiter(void 0, void 0, void 0, function* () {
    const endpoint = `${youtubeEndpoint}/channel/${channelId}`;
    try {
        const page = yield GetYoutubeInitData(endpoint);
        const tabs = page.initdata.contents.twoColumnBrowseResultsRenderer.tabs;
        const items = tabs
            .map((json) => {
            if (json && json.tabRenderer) {
                const tabRenderer = json.tabRenderer;
                const title = tabRenderer.title;
                const content = tabRenderer.content;
                return { title, content };
            }
        })
            .filter((y) => typeof y !== "undefined");
        return items;
    }
    catch (ex) {
        console.error(ex);
        throw ex;
    }
});
exports.GetChannelById = GetChannelById;
const GetVideoDetails = (videoId) => __awaiter(void 0, void 0, void 0, function* () {
    const endpoint = `${youtubeEndpoint}/watch?v=${videoId}`;
    try {
        const page = yield GetYoutubeInitData(endpoint);
        const playerData = yield GetYoutubePlayerDetail(endpoint);
        const result = page.initdata.contents.twoColumnWatchNextResults;
        const firstContent = result.results.results.contents[0].videoPrimaryInfoRenderer;
        const secondContent = result.results.results.contents[1].videoSecondaryInfoRenderer;
        const res = {
            id: playerData.videoId,
            title: firstContent.title.runs[0].text,
            thumbnail: playerData.thumbnail,
            isLive: firstContent.viewCount.videoViewCountRenderer.hasOwnProperty("isLive")
                ? firstContent.viewCount.videoViewCountRenderer.isLive
                : false,
            channel: playerData.author ||
                secondContent.owner.videoOwnerRenderer.title.runs[0].text,
            channelId: playerData.channelId,
            description: playerData.shortDescription,
            keywords: playerData.keywords,
            suggestion: result.secondaryResults.secondaryResults.results
                .filter((y) => y.hasOwnProperty("compactVideoRenderer"))
                .map((x) => compactVideoRenderer(x))
        };
        return res;
    }
    catch (ex) {
        console.error(ex);
        throw ex;
    }
});
exports.GetVideoDetails = GetVideoDetails;
const VideoRender = (json) => {
    try {
        if (json && (json.videoRenderer || json.playlistVideoRenderer)) {
            let videoRenderer = json.videoRenderer || json.playlistVideoRenderer;
            let isLive = false;
            if (videoRenderer.badges &&
                videoRenderer.badges.length > 0 &&
                videoRenderer.badges[0].metadataBadgeRenderer &&
                videoRenderer.badges[0].metadataBadgeRenderer.style ===
                    "BADGE_STYLE_TYPE_LIVE_NOW") {
                isLive = true;
            }
            if (videoRenderer.thumbnailOverlays) {
                videoRenderer.thumbnailOverlays.forEach((item) => {
                    if (item.thumbnailOverlayTimeStatusRenderer &&
                        item.thumbnailOverlayTimeStatusRenderer.style &&
                        item.thumbnailOverlayTimeStatusRenderer.style === "LIVE") {
                        isLive = true;
                    }
                });
            }
            const id = videoRenderer.videoId;
            const thumbnail = videoRenderer.thumbnail;
            const title = videoRenderer.title.runs[0].text;
            const shortBylineText = videoRenderer.shortBylineText
                ? videoRenderer.shortBylineText
                : "";
            const lengthText = videoRenderer.lengthText
                ? videoRenderer.lengthText
                : "";
            const channelTitle = videoRenderer.ownerText && videoRenderer.ownerText.runs
                ? videoRenderer.ownerText.runs[0].text
                : "";
            return {
                id,
                type: "video",
                thumbnail,
                title,
                channelTitle,
                shortBylineText,
                length: lengthText,
                isLive
            };
        }
        return {
            id: "",
            type: "",
            thumbnail: undefined,
            title: ""
        };
    }
    catch (ex) {
        throw ex;
    }
};
exports.VideoRender = VideoRender;
const compactVideoRenderer = (json) => {
    const compactVideoRendererJson = json.compactVideoRenderer;
    let isLive = false;
    if (compactVideoRendererJson.badges &&
        compactVideoRendererJson.badges.length > 0 &&
        compactVideoRendererJson.badges[0].metadataBadgeRenderer &&
        compactVideoRendererJson.badges[0].metadataBadgeRenderer.style ===
            "BADGE_STYLE_TYPE_LIVE_NOW") {
        isLive = true;
    }
    return {
        id: compactVideoRendererJson.videoId,
        type: "video",
        thumbnail: compactVideoRendererJson.thumbnail.thumbnails,
        title: compactVideoRendererJson.title.simpleText,
        channelTitle: compactVideoRendererJson.shortBylineText.runs[0].text,
        shortBylineText: compactVideoRendererJson.shortBylineText.runs[0].text,
        length: compactVideoRendererJson.lengthText,
        isLive
    };
};
const GetShortVideo = () => __awaiter(void 0, void 0, void 0, function* () {
    const page = yield GetYoutubeInitData(youtubeEndpoint);
    const shortResult = page.initdata.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.contents
        .filter((x) => x.richSectionRenderer)
        .map((z) => z.richSectionRenderer.content)
        .filter((y) => y.richShelfRenderer)
        .map((u) => u.richShelfRenderer)
        .find((i) => i.title.runs[0].text === "Shorts");
    const res = shortResult.contents
        .map((z) => z.richItemRenderer)
        .map((y) => y.content.reelItemRenderer);
    return res.map((json) => ({
        id: json.videoId,
        type: "reel",
        thumbnail: json.thumbnail.thumbnails[0],
        title: json.headline.simpleText,
        inlinePlaybackEndpoint: json.inlinePlaybackEndpoint || {}
    }));
});
exports.GetShortVideo = GetShortVideo;
