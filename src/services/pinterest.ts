import axios from "axios";
import m3u8 from "./lib/pinterest/m3u8";

type ErrorResponse = {
  status: false;
  message: string;
};

type SuccessResponse<T> = {
  status: true;
  data: T;
};

type PinterestResponse<T> = ErrorResponse | SuccessResponse<T>;

type PinterestSearchPin = {
  id: string;
  title: string;
  description: string;
  created_at: any;
  pin_url: string;
  image_url: string;
  images: {
    original?: string;
    large?: string;
    medium?: string;
    small?: string;
  };
  video_url: string | null;
  videos: any;
  is_video: boolean;
  dominant_color?: string;
  repin_count: number;
  uploader: {
    username?: string;
    full_name?: string;
    profile_url: string | null;
    avatar_url?: string;
  };
};

type PinterestSearchData = {
  query: string;
  count: number;
  pins: PinterestSearchPin[];
};

type PinterestPinAttachment = {
  type: "Gif" | "Photo" | "Video";
  url: string;
  buffer?: Buffer;
};

type PinterestPinBoard = {
  id: string;
  name: string;
  url: string | null;
};

type PinterestPinUploader = {
  id?: string;
  username?: string;
  full_name?: string;
  profile_url: string | null;
  avatar_url?: string;
};

type PinterestPinData = {
  id: string;
  title: string;
  description: string;
  created_at: any;
  pin_url: string;
  dominant_color: string | null;
  attachments: PinterestPinAttachment[];
  link: string | null;
  repin_count: number;
  comment_count: number;
  board: PinterestPinBoard | null;
  uploader: PinterestPinUploader | null;
  tags: string[];
};

type PinterestProfileStats = {
  pins: number;
  followers: number;
  following: number;
  boards: number;
};

type PinterestProfile = {
  id: string;
  username: string;
  full_name: string;
  bio: string;
  profile_url: string;
  avatar_url?: string;
  stats: PinterestProfileStats;
  website_url: string | null;
  location: string | null;
  country: string | null;
  is_verified: boolean;
  account_type: string | null;
  created_at: any;
};

class PinterestAPI {
  private readonly api: {
    base: string;
    endpoints: {
      search: string;
      pin: string;
      user: string;
    };
  };
  private readonly headers: Record<string, string>;
  private readonly pinPatterns: RegExp[];

  constructor() {
    this.api = {
      base: "https://www.pinterest.com",
      endpoints: {
        search: "/resource/BaseSearchResource/get/",
        pin: "/resource/PinResource/get/",
        user: "/resource/UserResource/get/"
      }
    };
    this.headers = {
      accept: "application/json, text/javascript, /, q=0.01",
      referer: "https://www.pinterest.com/",
      "user-agent": "Postify/1.0.0",
      "x-app-version": "a9522f",
      "x-pinterest-appstate": "active",
      "x-pinterest-pws-handler": "www/[username]/[slug].js",
      "x-requested-with": "XMLHttpRequest"
    };
    this.pinPatterns = [
      /^https?:\/\/(?:www\.)?pinterest\.com\/pin\/[\w.-]+/,
      /^https?:\/\/(?:www\.)?pinterest\.[\w.]+\/pin\/[\w.-]+/,
      /^https?:\/\/(?:www\.)?pinterest\.(?:ca|co\.uk|com\.au|de|fr|id|es|mx|br|pt|jp|kr|nz|ru|at|be|ch|cl|dk|fi|gr|ie|nl|no|pl|pt|se|th|tr)\/pin\/[\w.-]+/,
      /^https?:\/\/pin\.it\/[\w.-]+/,
      /^https?:\/\/(?:www\.)?pinterest\.com\/amp\/pin\/[\w.-]+/,
      /^https?:\/\/(?:[a-z]{2}|www)\.pinterest\.com\/pin\/[\w.-]+/,
      /^https?:\/\/(?:www\.)?pinterest\.com\/pin\/[\d]+(?:\/)?$/,
      /^https?:\/\/(?:www\.)?pinterest\.[\w.]+\/pin\/[\d]+(?:\/)?$/,
      /^https?:\/\/(?:www\.)?pinterestcn\.com\/pin\/[\w.-]+/,
      /^https?:\/\/(?:www\.)?pinterest\.com\.[\w.]+\/pin\/[\w.-]+/
    ];
  }

  isUrl(str: string): boolean {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  }

  isPin(url: string): boolean {
    if (!url) return false;
    const clean = url.trim().toLowerCase();
    return this.pinPatterns.some(pattern => pattern.test(clean));
  }

  private async getCookies(): Promise<string | null> {
    try {
      const response = await axios.get(this.api.base);
      const setHeaders = response.headers["set-cookie"] as string[] | undefined;
      if (setHeaders) {
        const cookies = setHeaders.map(cookieString => {
          const cp = cookieString.split(";");
          const cv = cp[0]?.trim();
          return cv || "";
        }).filter(c => c !== "");
        return cookies.join("; ");
      }
      console.warn("Could not extract cookies from Pinterest response headers.");
      return null;
    } catch (error: any) {
      console.error("Error fetching Pinterest cookies:", error.message);
      return null;
    }
  }

  private _errorResponse(message?: string): ErrorResponse {
    return {
      status: false,
      message: message || "An unknown error occurred."
    };
  }

  private _successResponse<T>(data: T): SuccessResponse<T> {
    return {
      status: true,
      data
    };
  }

  async search(query: string, limit = 10): Promise<PinterestResponse<PinterestSearchData>> {
    if (!query || typeof query !== "string" || query.trim() === "") {
      return this._errorResponse("Query cannot be empty.");
    }
    const safeLimit = Math.max(1, Math.min(limit, 50));
    try {
      const cookies = await this.getCookies();
      if (!cookies) {
        return this._errorResponse("Failed to retrieve Pinterest session cookies.");
      }
      const params = {
        source_url: `/search/pins/?q=${encodeURIComponent(query)}&rs=typed`,
        data: JSON.stringify({
          options: {
            isPrefetch: false,
            query,
            scope: "pins",
            no_fetch_context_on_resource: false,
            page_size: safeLimit
          },
          context: {}
        }),
        _: Date.now()
      };
      const dynamicHeaders = {
        ...this.headers,
        cookie: cookies
      };
      const { data } = await axios.get<any>(`${this.api.base}${this.api.endpoints.search}`, {
        headers: dynamicHeaders,
        params
      });
      if (!data?.resource_response?.data?.results) {
        console.warn("Unexpected response structure from Pinterest search:", data);
        return this._errorResponse("Could not parse search results from Pinterest.");
      }
      const results: any[] = data.resource_response.data.results;
      const pins: PinterestSearchPin[] = results
        .filter(v => v?.images?.orig?.url)
        .map(result => ({
          id: String(result.id),
          title: result.title || result.grid_title || "",
          description: result.description || "",
          created_at: result.created_at,
          pin_url: `${this.api.base}/pin/${result.id}/`,
          image_url: result.images.orig.url,
          images: {
            original: result.images.orig?.url,
            large: result.images["736x"]?.url,
            medium: result.images["474x"]?.url,
            small: result.images["236x"]?.url
          },
          video_url:
            result.videos?.video_list?.V_720P?.url ||
            result.videos?.video_list?.V_HLSV4?.url ||
            null,
          videos: result.videos
            ? {
              duration_ms: result.videos.duration,
              list: result.videos.video_list
            }
            : null,
          is_video: result.is_video || !!result.videos,
          dominant_color: result.dominant_color,
          repin_count: result.repin_count || 0,
          uploader: {
            username: result.pinner?.username,
            full_name: result.pinner?.full_name,
            profile_url: result.pinner?.username ? `${this.api.base}/${result.pinner.username}/` : null,
            avatar_url: result.pinner?.image_medium_url
          }
        }));
      if (pins.length === 0) {
        return this._errorResponse(`No results found for query: "${query}"`);
      }
      return this._successResponse({
        query,
        count: pins.length,
        pins
      });
    } catch (error: any) {
      console.error(`Pinterest search error for query "${query}":`, error.response?.data || error.message);
      const statusCode = error.response?.status;
      let message = "Pinterest search failed due to a server error.";
      if (statusCode === 404) message = "Pinterest search endpoint not found (404).";
      if (statusCode === 429) message = "Rate limited by Pinterest. Please try again later.";
      return this._errorResponse(message);
    }
  }

  private async _resolvePinItUrl(pinItUrl: string): Promise<string | null> {
    try {
      const response = await axios.get(pinItUrl, {
        maxRedirects: 0,
        validateStatus: status => status === 308
      });
      const redirectUrl = response.headers.location as string | undefined;
      if (!redirectUrl) return null;
      const resolve = await axios.get(redirectUrl, {
        maxRedirects: 0,
        validateStatus: status => status === 302
      });
      const resolvedUrl = resolve.headers.location as string | undefined;
      console.log("Resolved pin.it link to:", resolvedUrl);
      if (resolvedUrl && this.isPin(resolvedUrl)) {
        return resolvedUrl;
      }
      return null;
    } catch (error) {
      console.log("Failed to resolve pin.it link:", error);
      return null;
    }
  }

  private _extractPinId(pinUrl: string): string | null {
    try {
      const match = pinUrl.match(/\/pin\/([\w-]+)/);
      if (!match || !match[1]) {
        throw new Error("Could not extract Pin ID from URL.");
      }
      return match[1];
    } catch {
      return null;
    }
  }

  async down(pinUrl: string): Promise<PinterestPinData | ErrorResponse> {
    if (!pinUrl || typeof pinUrl !== "string") {
      return this._errorResponse("Pin URL must be provided as a string.");
    }
    if (!this.isUrl(pinUrl)) {
      return this._errorResponse("Invalid URL format provided.");
    }
    if (!this.isPin(pinUrl)) {
      return this._errorResponse("The provided URL does not appear to be a valid Pinterest Pin URL.");
    }
    if (/^https?:\/\/pin\.it\//.test(pinUrl)) {
      const resolvedUrl = await this._resolvePinItUrl(pinUrl);
      if (!resolvedUrl) {
        return this._errorResponse("Could not resolve pin.it link or it doesn't lead to a valid Pin.");
      }
      pinUrl = resolvedUrl;
    }
    const pinId = this._extractPinId(pinUrl);
    if (!pinId) {
      return this._errorResponse("Could not extract Pin ID from the provided URL.");
    }
    try {
      const cookies = await this.getCookies();
      if (!cookies) {
        return this._errorResponse("Failed to retrieve Pinterest session cookies.");
      }
      const params = {
        source_url: `/pin/${pinId}/`,
        data: JSON.stringify({
          options: {
            field_set_key: "detailed",
            id: pinId
          },
          context: {}
        }),
        _: Date.now()
      };
      const dynamicHeaders = {
        ...this.headers,
        cookie: cookies,
        "x-pinterest-source-url": params.source_url
      };
      const { data } = await axios.get<any>(`${this.api.base}${this.api.endpoints.pin}`, {
        headers: dynamicHeaders,
        params
      });
      if (!data?.resource_response?.data) {
        if (data?.resource_response?.error?.message?.includes("not found")) {
          return this._errorResponse(`Pin with ID ${pinId} not found.`);
        }
        return this._errorResponse("Could not parse pin details from Pinterest.");
      }
      const pd: any = data.resource_response.data;
      const attachments: PinterestPinAttachment[] = [];
      const images: Record<string, { width: number; height: number; url: string }> = {};
      const imageKeys = ["60x60", "136x136", "170x", "236x", "474x", "564x", "736x", "600x315", "orig"];
      imageKeys.forEach(key => {
        if (pd.images?.[key]) {
          images[key] = {
            width: pd.images[key].width,
            height: pd.images[key].height,
            url: pd.images[key].url
          };
        }
      });
      const isGif = images.orig?.url?.toLowerCase().endsWith(".gif");
      if (isGif && images.orig?.url) {
        attachments.push({
          type: "Gif",
          url: images.orig.url
        });
      } else {
        const hasVideo =
          pd.videos?.video_list ||
          pd.story_pin_data?.pages?.some(
            (page: any) =>
              page.video?.video_list ||
              page.blocks?.some((block: any) => block.video?.video_list)
          );
        if (!hasVideo) {
          const imageQualities = ["orig", "736x", "474x", "236x"];
          for (const quality of imageQualities) {
            const img = images[quality];
            if (img?.url) {
              attachments.push({
                type: "Photo",
                url: img.url
              });
              break;
            }
          }
        }
        const pickBestVideo = (videoList: any): string | null => {
          if (!videoList) return null;
          const videos = Object.values<any>(videoList)
            .filter(v => v?.url)
            .sort((a, b) => (b.width || 0) - (a.width || 0));
          return videos[0]?.url || null;
        };
        if (pd.videos?.video_list) {
          const best = pickBestVideo(pd.videos.video_list);
          if (best) {
            const m3u8buf = await m3u8(best);
            attachments.push({ type: "Video", url: best, buffer: m3u8buf });
          }
        }
        if (pd.story_pin_data?.pages) {
          for (const page of pd.story_pin_data.pages as any[]) {
            const pageVideo = pickBestVideo(page.video?.video_list);
            if (pageVideo) {
              const m3u8buf = await m3u8(pageVideo);
              attachments.push({ type: "Video", url: pageVideo, buffer: m3u8buf });
            } else if (page.blocks) {
              for (const block of page.blocks as any[]) {
                const blockVideo = pickBestVideo(block.video?.video_list);
                if (blockVideo) {
                  const m3u8buf = await m3u8(blockVideo);
                  attachments.push({ type: "Video", url: blockVideo, buffer: m3u8buf });
                }
              }
            }
          }
        }
      }
      const pinData: PinterestPinData = {
        id: String(pd.id),
        title: pd.title || pd.grid_title || "",
        description: pd.description || "",
        created_at: pd.created_at,
        pin_url: `${this.api.base}/pin/${pd.id}/`,
        dominant_color: pd.dominant_color || null,
        attachments,
        link: pd.link || null,
        repin_count: pd.repin_count || 0,
        comment_count: pd.comment_count || 0,
        board: pd.board
          ? {
            id: String(pd.board.id),
            name: pd.board.name,
            url: pd.board.url ? `${this.api.base}${pd.board.url}` : null
          }
          : null,
        uploader: (() => {
          const src = pd.closeup_unified_attribution || pd.origin_pinner || pd.closeup_attribution || pd.native_creator;
          if (!src) return null;
          return {
            id: src.id ? String(src.id) : undefined,
            username: src.username,
            full_name: src.full_name,
            profile_url: src.username ? `${this.api.base}/${src.username}/` : null,
            avatar_url: src.image_medium_url
          };
        })(),
        tags:
          pd.pin_join?.visual_descriptions?.map((desc: any) => desc.display_name) ||
          pd.hashtags ||
          []
      };
      return pinData;
    } catch (error: any) {
      console.log(error);
      const statusCode = error.response?.status;
      let message = "Pinterest download failed due to a server error.";
      if (statusCode === 404) message = "Pin not found (404). It might have been deleted or the URL is incorrect.";
      if (statusCode === 429) message = "Rate limited by Pinterest. Please try again later.";
      return this._errorResponse(message);
    }
  }

  async info(username: string): Promise<PinterestResponse<PinterestProfile>> {
    if (!username || typeof username !== "string" || username.trim() === "") {
      return this._errorResponse("Username cannot be empty.");
    }
    const cleanUsername = username.replace(/^@/, "").trim();
    try {
      const cookies = await this.getCookies();
      if (!cookies) {
        return this._errorResponse("Failed to retrieve Pinterest session cookies.");
      }
      const params = {
        source_url: `/${cleanUsername}/`,
        data: JSON.stringify({
          options: {
            username: cleanUsername,
            field_set_key: "profile",
            isPrefetch: false
          },
          context: {}
        }),
        _: Date.now()
      };
      const dynamicHeaders = {
        ...this.headers,
        cookie: cookies,
        "x-pinterest-source-url": params.source_url
      };
      const { data } = await axios.get<any>(`${this.api.base}${this.api.endpoints.user}`, {
        headers: dynamicHeaders,
        params
      });
      if (!data?.resource_response?.data) {
        if (data?.resource_response?.error?.message?.includes("not found")) {
          return this._errorResponse(`User profile "${cleanUsername}" not found.`);
        }
        console.warn("Unexpected response structure from Pinterest user profile:", data);
        return this._errorResponse("Could not parse user profile from Pinterest.");
      }
      const userx: any = data.resource_response.data;
      const profileData: PinterestProfile = {
        id: String(userx.id),
        username: userx.username,
        full_name: userx.full_name || "",
        bio: userx.about || "",
        profile_url: `${this.api.base}/${userx.username}/`,
        avatar_url: userx.image_xlarge_url || userx.image_large_url || userx.image_medium_url,
        stats: {
          pins: userx.pin_count || 0,
          followers: userx.follower_count || 0,
          following: userx.following_count || 0,
          boards: userx.board_count || 0
        },
        website_url: userx.website_url || null,
        location: userx.location || null,
        country: userx.country || null,
        is_verified: !!userx.verified_identity,
        account_type: userx.account_type || null,
        created_at: userx.created_at || null
      };
      return this._successResponse(profileData);
    } catch (error: any) {
      const statusCode = error.response?.status;
      let message = "Fetching Pinterest profile failed due to a server error.";
      if (statusCode === 404) message = `User profile "${cleanUsername}" not found (404).`;
      if (statusCode === 429) message = "Rate limited by Pinterest. Please try again later.";
      return this._errorResponse(message);
    }
  }
}

const pinterestAPI = new PinterestAPI();
export default pinterestAPI;
