import axios, { AxiosInstance } from "axios";
import cheerio from "cheerio";

const cookie = (global as any)?.cookie?.threads || "";

interface Attachment {
  type: "Photo" | "Video" | "Audio";
  url: string;
}

interface PostResult {
  id: string;
  message: string;
  like_count: string | number | null;
  reply_count: string | number | null;
  repost_count: string | number | null;
  quote_count: string | number | null;
  author: string;
  short_code: string;
  taken_at: number;
  attachments: Attachment[];
}

interface UserInfo {
  id: string;
  username: string;
  fullName: string;
  biography: string;
  followerCount: number;
  isPrivate: boolean;
  isVerified: boolean;
  profilePicUrl: string;
  hdProfilePicUrls: Array<{ width: number; height: number; url: string }>;
}

interface UserSearchResult {
  id: string;
  username: string;
  fullName: string;
  profilePicUrl: string;
}

interface Tokens {
  csrfToken: string;
  appId: string;
  lsd: string;
  asbdId: string;
  baseURL: string;
}

interface GraphQLResponse {
  data?: {
    data?: {
      edges?: Array<{
        node?: {
          thread_items?: Array<{
            post?: any;
          }>;
        };
      }>;
    };
    searchResults?: {
      edges?: Array<{
        node?: any;
      }>;
    };
    mediaData?: {
      edges?: Array<{
        node?: {
          thread_items?: Array<{
            post?: any;
          }>;
        };
      }>;
      page_info?: {
        has_next_page?: boolean;
        end_cursor?: string;
      };
    };
    user?: any;
  };
}

async function downloadv2(url: string): Promise<PostResult | null> {
  function formatNumber(number: number): string | null {
    if (isNaN(number)) {
      return null;
    }
    return number.toLocaleString("de-DE");
  }

  try {
    const res = await axios.get(url, {
      headers: {
        authority: "www.threads.com",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        pragma: "no-cache",
        cookie:
          'ig_did=9C62588B-E717-45AE-A742-431365E00F1B; mid=aA-BuQALAAH58rNxekajDf5HPpLW; ds_user_id=69078799658; ps_l=1; ps_n=1; csrftoken=kWLygnvqBRqoNlExtHjIvuUXg6Wd6csQ; sessionid=69078799658%3A17ggTb5CB0NIe0%3A8%3AAYgMI11EWVu6Y7cLp25uwrqYqyrCoLnPAsfPsFRI1g; rur="VLL\\3469078799658\\341790173148:01feb81f3963b2251d64d6485f0cc002a31de30f86363dd495a75e9d1d55d909526cd998"',
        "sec-ch-ua":
          '"Not.A/Brand";v="8", "Chromium";v="114", "Google Chrome";v="114"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
      },
    });

    if (res.status !== 200) {
      throw new Error(`Status Error: ${res.status} ${res.config.url}`);
    }

    const content = res.data;
    const $ = cheerio.load(content);
    const scripts = $("script");
    let scriptContent: string | undefined;

    scripts.each((_i, script) => {
      const child = (script as any).children?.[0];
      if (
        child &&
        child.data &&
        typeof child.data === "string" &&
        child.data.includes("username") &&
        child.data.includes("original_width")
      ) {
        scriptContent = child.data;
        return false;
      }
      return undefined;
    });

    if (!scriptContent) {
      throw new Error("Script content not found");
    }

    const parsedData = JSON.parse(scriptContent);
    const result =
      parsedData.require?.[0]?.[3]?.[0]?.__bbox?.require?.[0]?.[3]?.[1]?.__bbox
        ?.result;
    const dataResponse =
      result?.data?.data?.edges?.[0]?.node?.thread_items?.[0]?.post;

    if (!dataResponse) {
      throw new Error("Post data not found");
    }

    const attachments: Attachment[] = [];

    if (dataResponse.video_versions && dataResponse.video_versions.length > 0) {
      attachments.push({
        type: "Video",
        url: dataResponse.video_versions[0].url,
      });
    }

    if (
      dataResponse.carousel_media &&
      dataResponse.carousel_media.length > 0
    ) {
      const photos: Attachment[] = [];
      const videos: Attachment[] = [];

      dataResponse.carousel_media.forEach((item: any) => {
        if (
          item.image_versions2 &&
          item.image_versions2.candidates &&
          item.image_versions2.candidates.length > 0
        ) {
          const firstCandidate = item.image_versions2.candidates.find(
            (candidate: any) => candidate.url
          );
          if (firstCandidate) {
            photos.push({
              type: "Photo",
              url: firstCandidate.url,
            });
          }
        }

        if (item.video_versions && item.video_versions.length > 0) {
          videos.push({
            type: "Video",
            url: item.video_versions[0].url,
          });
        }
      });

      attachments.push(...photos, ...videos);
    } else if (
      dataResponse.image_versions2 &&
      dataResponse.image_versions2.candidates &&
      dataResponse.image_versions2.candidates.length > 0
    ) {
      const validCandidate = dataResponse.image_versions2.candidates.find(
        (candidate: any) => candidate.url
      );
      if (validCandidate) {
        attachments.push({
          type: "Photo",
          url: validCandidate.url,
        });
      }
    }

    if (dataResponse.audio && dataResponse.audio.audio_src) {
      attachments.push({
        type: "Audio",
        url: dataResponse.audio.audio_src,
      });
    }

    return {
      id: dataResponse.pk,
      message: dataResponse.caption?.text || "Không có tiêu đề",
      like_count: formatNumber(Number(dataResponse.like_count)) || 0,
      reply_count:
        formatNumber(
          Number(dataResponse.text_post_app_info?.direct_reply_count)
        ) || 0,
      repost_count:
        formatNumber(Number(dataResponse.text_post_app_info?.repost_count)) ||
        0,
      quote_count:
        formatNumber(Number(dataResponse.text_post_app_info?.quote_count)) || 0,
      author: dataResponse.user?.username || "Unknown",
      short_code: dataResponse.code || "",
      taken_at: dataResponse.taken_at || 0,
      attachments,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}

class ThreadsAPI {
  private baseURLs: string[];
  private client: AxiosInstance;

  constructor() {
    this.baseURLs = ["https://www.threads.com", "https://www.threads.net"];
    this.client = axios.create({
      baseURL: this.baseURLs[0],
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        Cookie: cookie,
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      maxRedirects: 5,
    });
  }

  private setBaseURL(u: string): void {
    this.client.defaults.baseURL = u;
  }


  private formatNumber(n: number): string | null {
    return isNaN(n) ? null : n.toLocaleString("de-DE");
  }

  private shortcodeToId(shortcode: string): string {
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let id = 0n;

    for (let i = 0; i < shortcode.length; i++) {
      const index = alphabet.indexOf(shortcode[i]);
      if (index === -1)
        throw new Error(`Invalid shortcode: ${shortcode[i]}`);
      id = id * 64n + BigInt(index);
    }

    return id.toString();
  }

  private extractPostId(input: string): string | null {
    try {
      if (/^\d+$/.test(input)) return input;
      const url = new URL(input);
      const tMatch = url.pathname.match(/^\/t\/([A-Za-z0-9_-]+)/);
      const postMatch = url.pathname.match(/\/@[^/]+\/post\/([A-Za-z0-9_-]+)/);
      const idMatch = input.match(/(\d{15,21})/);

      if (tMatch) return this.shortcodeToId(tMatch[1]);
      if (postMatch) return this.shortcodeToId(postMatch[1]);
      if (idMatch) return idMatch[1];

      return null;
    } catch {
      return null;
    }
  }

  private async initializeTokens(): Promise<Tokens> {
    for (const u of this.baseURLs) {
      try {
        this.setBaseURL(u);
        const res = await this.client.get("/");
        const html = res.data || "";
        const csrfToken = html.match(/"csrf_token":"([^"]+)"/)?.[1];
        const appId =
          html.match(/"app_id":"(\d+)"/)?.[1] ||
          html.match(/"APP_ID":"(\d+)"/)?.[1];
        const lsd =
          html.match(/"LSD",\[\],{"token":"([^"]+)"}/)?.[1] ||
          html.match(/LSD",\[\],\{"token":"([^"]+)"}/)?.[1];

        if (csrfToken && (appId || lsd)) {
          return {
            csrfToken,
            appId: appId || "",
            lsd: lsd || "",
            asbdId: "359341",
            baseURL: u,
          };
        }
      } catch {

      }
    }
    throw new Error("Init tokens failed");
  }

  private parsePost(data: any): PostResult {
    const attachments: Attachment[] = [];

    if (data?.video_versions?.length) {
      attachments.push({
        type: "Video",
        url: data.video_versions[0].url,
      });
    }

    if (data?.carousel_media?.length) {
      data.carousel_media.forEach((item: any) => {
        const img = item.image_versions2?.candidates?.[0]?.url;
        if (img) {
          attachments.push({ type: "Photo", url: img });
        }

        const vid = item.video_versions?.[0]?.url;
        if (vid) {
          attachments.push({ type: "Video", url: vid });
        }
      });
    } else if (
      !data?.has_audio &&
      data?.image_versions2?.candidates?.[0]?.url
    ) {
      attachments.push({
        type: "Photo",
        url: data.image_versions2.candidates[0].url,
      });
    }

    if (data?.audio?.audio_src) {
      attachments.push({ type: "Audio", url: data.audio.audio_src });
    }

    return {
      id: data?.pk || "",
      message: data?.caption?.text || "No title",
      like_count: this.formatNumber(Number(data?.like_count)) || 0,
      reply_count:
        this.formatNumber(
          Number(data?.text_post_app_info?.direct_reply_count)
        ) || 0,
      repost_count:
        this.formatNumber(Number(data?.text_post_app_info?.repost_count)) || 0,
      quote_count:
        this.formatNumber(Number(data?.text_post_app_info?.quote_count)) || 0,
      author: data?.user?.username || "Unknown",
      short_code: data?.code || "",
      taken_at: data?.taken_at || null,
      attachments,
    };
  }

  async getAppIdAndProfile(): Promise<{
    username: string;
    avatarUrl: string;
    igAppId: string;
    baseURL: string;
  }> {
    const { baseURL } = await this.initializeTokens();
    const { data: rawData } = await this.client.get("/");
    const profileRegex = /"viewer":(.*?)},/;
    const igAppIdRegex = /"APP_ID":"(\d+)"/;
    const originalProfileInfo = rawData.match(profileRegex)?.[1];
    const igAppId = rawData.match(igAppIdRegex)?.[1];

    if (!originalProfileInfo || !igAppId) {
      throw new Error("Không thể lấy thông tin người dùng");
    }

    const profileInfo = JSON.parse(originalProfileInfo);
    return {
      username: profileInfo.username,
      avatarUrl: profileInfo.profile_picture_url,
      igAppId,
      baseURL,
    };
  }

  async down2(input: string): Promise<PostResult | null> {
    return await downloadv2(input);
  }

  async down(input: string): Promise<PostResult> {
    try {
      const postId = /^\d+$/.test(input)
        ? input
        : this.extractPostId(input);

      if (!postId) {
        const fb = await this.down2(input);
        if (fb) return fb;
        throw new Error("Could not extract post ID from input");
      }

      const tokens = await this.initializeTokens();
      this.setBaseURL(tokens.baseURL);

      const headers = {
        accept: "*/*",
        "content-type": "application/x-www-form-urlencoded",
        origin: tokens.baseURL,
        referer: tokens.baseURL + "/",
        "user-agent": this.client.defaults.headers["User-Agent"] as string,
        "x-asbd-id": tokens.asbdId,
        "x-csrftoken": tokens.csrfToken || "",
        "x-fb-lsd": tokens.lsd || "",
        "x-ig-app-id": tokens.appId || "",
      };

      const variables = {
        postID: postId,
        sort_order: "TOP",
        __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: true,
        __relay_internal__pv__BarcelonaHasInlineReplyComposerrelayprovider:
          true,
        __relay_internal__pv__BarcelonaHasPermalinkInlineExpansionrelayprovider:
          false,
        __relay_internal__pv__BarcelonaHasEventBadgerelayprovider: false,
        __relay_internal__pv__BarcelonaIsSearchDiscoveryEnabledrelayprovider:
          false,
        __relay_internal__pv__BarcelonaHasSelfThreadCountrelayprovider: true,
        __relay_internal__pv__IsTagIndicatorEnabledrelayprovider: true,
        __relay_internal__pv__BarcelonaHasDeepDiverelayprovider: false,
        __relay_internal__pv__BarcelonaHasSpoilerStylingInforelayprovider: true,
        __relay_internal__pv__BarcelonaOptionalCookiesEnabledrelayprovider: true,
        __relay_internal__pv__BarcelonaQuotedPostUFIEnabledrelayprovider: false,
        __relay_internal__pv__BarcelonaHasTopicTagsrelayprovider: true,
        __relay_internal__pv__BarcelonaIsCrawlerrelayprovider: false,
        __relay_internal__pv__BarcelonaHasDisplayNamesrelayprovider: false,
        __relay_internal__pv__BarcelonaCanSeeSponsoredContentrelayprovider: true,
        __relay_internal__pv__BarcelonaShouldShowFediverseM075Featuresrelayprovider:
          true,
        __relay_internal__pv__BarcelonaImplicitTrendsGKrelayprovider: false,
        __relay_internal__pv__BarcelonaIsInternalUserrelayprovider: false,
        __relay_internal__pv__BarcelonaInlineComposerEnabledrelayprovider: false,
      };

      const payload = new URLSearchParams({
        fb_api_caller_class: "RelayModern",
        fb_api_req_friendly_name: "BarcelonaPostPageDirectQuery",
        variables: JSON.stringify(variables),
        server_timestamps: "true",
        doc_id: "9763298077106314",
      }).toString();

      const res = await this.client.post<GraphQLResponse>(
        "/graphql/query",
        payload,
        { headers }
      );

      const postData =
        res.data?.data?.data?.edges?.[0]?.node?.thread_items?.[0]?.post;

      if (!postData) {
        const fb = await this.down2(input);
        if (fb) return fb;
        throw new Error("No post data");
      }

      return this.parsePost(postData);
    } catch (err) {
      const fb = await this.down2(input);
      if (fb) return fb;
      throw err;
    }
  }

  async searchUser(query: string): Promise<UserSearchResult[]> {
    const tokens = await this.initializeTokens();
    this.setBaseURL(tokens.baseURL);

    const headers = {
      accept: "*/*",
      "content-type": "application/x-www-form-urlencoded",
      origin: tokens.baseURL,
      referer: tokens.baseURL + "/",
      "user-agent": this.client.defaults.headers["User-Agent"] as string,
      "x-asbd-id": tokens.asbdId,
      "x-csrftoken": tokens.csrfToken || "",
      "x-fb-lsd": tokens.lsd || "",
      "x-ig-app-id": tokens.appId || "",
    };

    const variables = {
      query,
      search_surface: "default",
      __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: true,
      __relay_internal__pv__BarcelonaIsCrawlerrelayprovider: false,
      __relay_internal__pv__BarcelonaHasDisplayNamesrelayprovider: false,
    };

    const payload = new URLSearchParams({
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "BarcelonaSearchUserResultsQuery",
      variables: JSON.stringify(variables),
      server_timestamps: "true",
      doc_id: "29506584335599635",
    }).toString();

    const res = await this.client.post<GraphQLResponse>(
      "/graphql/query",
      payload,
      { headers }
    );

    const users =
      res.data?.data?.searchResults?.edges?.map((e) => {
        const u = e.node;
        return {
          id: u.pk,
          username: u.username,
          fullName: u.full_name,
          profilePicUrl: u.profile_pic_url,
        };
      }) || [];

    return users;
  }

  async searchUser2(query: string): Promise<UserSearchResult[]> {
    const tokens = await this.initializeTokens();
    this.setBaseURL(tokens.baseURL);

    const headers = {
      accept: "*/*",
      "content-type": "application/x-www-form-urlencoded",
      origin: tokens.baseURL,
      referer: tokens.baseURL + "/",
      "user-agent": this.client.defaults.headers["User-Agent"] as string,
      "x-asbd-id": tokens.asbdId,
      "x-csrftoken": tokens.csrfToken || "",
      "x-fb-lsd": tokens.lsd || "",
      "x-ig-app-id": tokens.appId || "",
    };

    const variables = {
      query,
      first: 10,
      should_fetch_ig_inactive_on_text_app: null,
      should_fetch_friendship_status: false,
      should_fetch_fediverse_profiles: false,
      hide_unconnected_private: false,
      __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: true,
      __relay_internal__pv__BarcelonaIsCrawlerrelayprovider: false,
      __relay_internal__pv__BarcelonaHasDisplayNamesrelayprovider: false,
    };

    const payload = new URLSearchParams({
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "useBarcelonaAccountSearchGraphQLDataSourceQuery",
      variables: JSON.stringify(variables),
      server_timestamps: "true",
      doc_id: "29097168296564454",
    }).toString();

    const res = await this.client.post<GraphQLResponse>(
      "/graphql/query",
      payload,
      { headers }
    );

    const users =
      res.data?.data?.searchResults?.edges?.map((e) => {
        const u = e.node;
        return {
          id: u.pk,
          username: u.username,
          fullName: u.full_name,
          profilePicUrl: u.profile_pic_url,
        };
      }) || [];

    return users;
  }

  async search(query: string): Promise<PostResult[]> {
    const tokens = await this.initializeTokens();
    this.setBaseURL(tokens.baseURL);

    const headers = {
      accept: "*/*",
      "content-type": "application/x-www-form-urlencoded",
      origin: tokens.baseURL,
      referer: tokens.baseURL + "/",
      "user-agent": this.client.defaults.headers["User-Agent"] as string,
      "x-asbd-id": tokens.asbdId,
      "x-csrftoken": tokens.csrfToken || "",
      "x-fb-lsd": tokens.lsd || "",
      "x-ig-app-id": tokens.appId || "",
    };

    const variables = {
      meta_place_id: null,
      power_search_info: null,
      query,
      recent: 1,
      search_surface: "default",
      tagID: null,
      trend_fbid: null,
      __relay_internal__pv__BarcelonaHasSERPHeaderrelayprovider: false,
      __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: true,
      __relay_internal__pv__BarcelonaHasSelfReplyContextrelayprovider: false,
      __relay_internal__pv__BarcelonaIsSearchDiscoveryEnabledrelayprovider: false,
      __relay_internal__pv__BarcelonaOptionalCookiesEnabledrelayprovider: true,
      __relay_internal__pv__BarcelonaHasSpoilerStylingInforelayprovider: false,
      __relay_internal__pv__BarcelonaQuotedPostUFIEnabledrelayprovider: false,
      __relay_internal__pv__BarcelonaIsCrawlerrelayprovider: false,
      __relay_internal__pv__BarcelonaHasDisplayNamesrelayprovider: false,
      __relay_internal__pv__BarcelonaCanSeeSponsoredContentrelayprovider: true,
      __relay_internal__pv__BarcelonaShouldShowFediverseM075Featuresrelayprovider:
        true,
      __relay_internal__pv__BarcelonaIsInternalUserrelayprovider: false,
    };

    const payload = new URLSearchParams({
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "BarcelonaSearchResultsQuery",
      variables: JSON.stringify(variables),
      server_timestamps: "true",
      doc_id: "9662937547076421",
    }).toString();

    const res = await this.client.post<GraphQLResponse>(
      "/graphql/query",
      payload,
      { headers }
    );

    const resp =
      res.data?.data?.searchResults?.edges?.map((edge) => {
        const p = edge.node.thread.thread_items[0]?.post;
        const attachments: Attachment[] = [];

        if (p?.video_versions?.length) {
          attachments.push({ type: "Video", url: p.video_versions[0].url });
        }

        if (p?.carousel_media?.length) {
          const photos: Attachment[] = [];
          const videos: Attachment[] = [];

          p.carousel_media.forEach((item: any) => {
            const img = item.image_versions2?.candidates?.find((c: any) => c.url);
            if (img) {
              photos.push({ type: "Photo", url: img.url });
            }

            if (item.video_versions?.length) {
              videos.push({
                type: "Video",
                url: item.video_versions[0].url,
              });
            }
          });

          attachments.push(...photos, ...videos);
        } else if (!p?.has_audio && p?.image_versions2?.candidates?.length) {
          const img = p.image_versions2.candidates.find((c: any) => c.url);
          if (img) {
            attachments.push({ type: "Photo", url: img.url });
          }
        }

        if (p?.audio?.audio_src) {
          attachments.push({ type: "Audio", url: p.audio.audio_src });
        }

        return {
          id: p?.pk || "",
          message: p?.caption?.text || "No title",
          like_count: this.formatNumber(Number(p?.like_count)) || 0,
          reply_count:
            this.formatNumber(
              Number(p?.text_post_app_info?.direct_reply_count)
            ) || 0,
          repost_count:
            this.formatNumber(Number(p?.text_post_app_info?.repost_count)) || 0,
          quote_count:
            this.formatNumber(Number(p?.text_post_app_info?.quote_count)) || 0,
          author: p?.user?.username || "Unknown",
          short_code: p?.code || "",
          taken_at: p?.taken_at || 0,
          attachments,
        };
      }) || [];

    return resp;
  }

  async post(username: string): Promise<PostResult[]> {
    const tokens = await this.initializeTokens();
    this.setBaseURL(tokens.baseURL);
    const { id } = await this.info(username);

    const headers = {
      accept: "*/*",
      "content-type": "application/x-www-form-urlencoded",
      origin: tokens.baseURL,
      referer: tokens.baseURL + "/",
      "user-agent": this.client.defaults.headers["User-Agent"] as string,
      "x-asbd-id": tokens.asbdId,
      "x-csrftoken": tokens.csrfToken || "",
      "x-fb-lsd": tokens.lsd || "",
      "x-ig-app-id": tokens.appId || "",
    };

    let endCursor: string | null = null;
    const allPosts: PostResult[] = [];

    do {
      const variables: Record<string, any> = {
        after: endCursor,
        before: null,
        first: 50,
        last: null,
        userID: id,
        __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: true,
        __relay_internal__pv__BarcelonaHasSelfReplyContextrelayprovider: false,
        __relay_internal__pv__BarcelonaIsSearchDiscoveryEnabledrelayprovider:
          false,
        __relay_internal__pv__BarcelonaOptionalCookiesEnabledrelayprovider: true,
        __relay_internal__pv__BarcelonaHasSpoilerStylingInforelayprovider: false,
        __relay_internal__pv__BarcelonaQuotedPostUFIEnabledrelayprovider: false,
        __relay_internal__pv__BarcelonaIsCrawlerrelayprovider: false,
        __relay_internal__pv__BarcelonaHasDisplayNamesrelayprovider: false,
        __relay_internal__pv__BarcelonaCanSeeSponsoredContentrelayprovider: true,
        __relay_internal__pv__BarcelonaShouldShowFediverseM075Featuresrelayprovider:
          true,
        __relay_internal__pv__BarcelonaIsInternalUserrelayprovider: false,
      };

      const payload: string = new URLSearchParams({
        fb_api_caller_class: "RelayModern",
        fb_api_req_friendly_name: "BarcelonaProfileThreadsTabRefetchableDirectQuery",
        variables: JSON.stringify(variables),
        server_timestamps: "true",
        doc_id: "9633841470040434",
      }).toString();

      const res = await this.client.post<GraphQLResponse>(
        "/graphql/query",
        payload,
        { headers }
      );

      const edges = res.data?.data?.mediaData?.edges;
      if (!edges?.length) break;

      const formatted = edges.map((e: any) =>
        this.parsePost(e.node.thread_items[0].post)
      );
      allPosts.push(...formatted);

      const pageInfo: { has_next_page?: boolean; end_cursor?: string | null } | undefined = res.data?.data?.mediaData?.page_info;
      if (!pageInfo?.has_next_page) break;

      endCursor = pageInfo.end_cursor || null;
    } while (endCursor);

    return allPosts;
  }

  async feed(): Promise<any> {
    const tokens = await this.initializeTokens();
    this.setBaseURL(tokens.baseURL);

    const headers = {
      accept: "*/*",
      "content-type": "application/x-www-form-urlencoded",
      origin: tokens.baseURL,
      referer: tokens.baseURL + "/",
      "user-agent": this.client.defaults.headers["User-Agent"] as string,
      "x-asbd-id": tokens.asbdId,
      "x-csrftoken": tokens.csrfToken || "",
      "x-fb-lsd": tokens.lsd || "",
      "x-ig-app-id": tokens.appId || "",
    };

    const variables = {
      data: {
        pagination_source: "text_post_feed_threads",
        reason: "cold_start_fetch",
      },
      variant: "for_you",
      __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: true,
      __relay_internal__pv__BarcelonaShareableListsrelayprovider: true,
      __relay_internal__pv__BarcelonaIsSearchDiscoveryEnabledrelayprovider: false,
      __relay_internal__pv__BarcelonaOptionalCookiesEnabledrelayprovider: true,
      __relay_internal__pv__BarcelonaQuotedPostUFIEnabledrelayprovider: false,
      __relay_internal__pv__BarcelonaIsCrawlerrelayprovider: false,
      __relay_internal__pv__BarcelonaHasDisplayNamesrelayprovider: false,
      __relay_internal__pv__BarcelonaCanSeeSponsoredContentrelayprovider: false,
      __relay_internal__pv__BarcelonaShouldShowFediverseM075Featuresrelayprovider:
        true,
      __relay_internal__pv__BarcelonaIsInternalUserrelayprovider: false,
    };

    const payload = new URLSearchParams({
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "BarcelonaFeedDirectQuery",
      variables: JSON.stringify(variables),
      server_timestamps: "true",
      doc_id: "8913600435341720",
    }).toString();

    const res = await this.client.post("/graphql/query", payload, { headers });

    return res.data;
  }

  async info(username: string): Promise<UserInfo> {
    const tokens = await this.initializeTokens();
    this.setBaseURL(tokens.baseURL);

    const headers = {
      accept: "*/*",
      "content-type": "application/x-www-form-urlencoded",
      origin: tokens.baseURL,
      referer: tokens.baseURL + "/",
      "user-agent": this.client.defaults.headers["User-Agent"] as string,
      "x-asbd-id": tokens.asbdId,
      "x-csrftoken": tokens.csrfToken || "",
      "x-fb-lsd": tokens.lsd || "",
      "x-ig-app-id": tokens.appId || "",
    };

    const variables = {
      username,
      __relay_internal__pv__BarcelonaIsInternalUserrelayprovider: false,
      __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: true,
      __relay_internal__pv__BarcelonaHasSpoilerStylingInforelayprovider: false,
      __relay_internal__pv__BarcelonaShouldShowFediverseM075Featuresrelayprovider:
        true,
    };

    const payload = new URLSearchParams({
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "BarcelonaUsernameHovercardImplDirectQuery",
      variables: JSON.stringify(variables),
      server_timestamps: "true",
      doc_id: "9988118494543630",
    }).toString();

    const res = await this.client.post<GraphQLResponse>(
      "/graphql/query",
      payload,
      { headers }
    );

    const userData = res.data?.data?.user;
    if (!userData) throw new Error("No user data found in response");

    return {
      id: userData.pk,
      username: userData.username,
      fullName: userData.full_name,
      biography: userData.biography,
      followerCount: userData.follower_count,
      isPrivate: userData.text_post_app_is_private,
      isVerified: userData.is_verified,
      profilePicUrl: userData.profile_pic_url,
      hdProfilePicUrls:
        userData.hd_profile_pic_versions?.map((p: any) => ({
          width: p.width,
          height: p.height,
          url: p.url,
        })) || [],
    };
  }
}

const threadsAPI = new ThreadsAPI();

export default threadsAPI;
export { Attachment, PostResult, ThreadsAPI, UserInfo, UserSearchResult };
