"use strict";
import axios, { AxiosInstance, Method } from "axios";
import cheerio from "cheerio";


const FALLBACK_COOKIE =
  'csrftoken=E_xtHbWKacXuCxtC-49_HC; datr=sEmxaZ73UX5ffSRlu8aTWNwj; ig_did=9914C10B-88C4-4ECD-9E3B-7D8B3049673B; mid=abFJsAALAAEi55_B5Fd3HoTaBgDG; ig_nrcb=1; ps_l=1; ps_n=1; ds_user_id=73749735606; sessionid=73749735606%3Ajuo3Mh1ZJE3bA0%3A23%3AAYjCx2T71HDQaGewSkZZRNG-6ZAM7w7VPdi6VU2ylw; rur="VCN,73749735606,1804762838:01fecfa4ad900652f74bf28ace5aa53e4ca4f039cbf552ec556b2f4d099ea6f0d0977d12"; wd=181x1298';

function getInstagramCookie(): string {
  const globalAny = global as typeof globalThis & {
    cookie?: Record<string, string>;
    Donix?: { cookie?: Record<string, string> };
  };

  // Ưu tiên cookie từ storage/cookies (được load bởi utils/cookieLoader.ts)
  return (
    globalAny.Donix?.cookie?.instagram ||
    globalAny.cookie?.instagram ||
    FALLBACK_COOKIE
  );
}

class getID {
  static BASE64URL_CHARMAP =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  static BASE10_MOD2 = ["0", "1", "0", "1", "0", "1", "0", "1", "0", "1"];
  static bitValueTable: bigint[] | null = null;

  static getCode(code: string): string {
    if (typeof code !== "string" || /[^A-Za-z0-9\-_]/.test(code)) {
      throw new Error("Input must be a valid Instagram shortcode.");
    }
    let base2 = "";
    for (const char of code) {
      const base64 = this.BASE64URL_CHARMAP.indexOf(char);
      base2 += base64.toString(2).padStart(6, "0");
    }
    return this.base2to10(base2);
  }

  static base10to2(
    base10: string | number | bigint,
    padLeft: boolean = true
  ): string {
    base10 = base10.toString();
    if (base10 === "" || /[^0-9]/.test(base10)) {
      throw new Error("Input must be a positive integer.");
    }
    let base2 = "";
    while (base10 !== "0") {
      const lastDigit = base10[base10.length - 1];
      base2 += this.BASE10_MOD2[Number(lastDigit)];
      base10 = (BigInt(base10) / BigInt(2)).toString();
    }
    base2 = base2.split("").reverse().join("");
    if (padLeft) {
      const padAmount = (8 - (base2.length % 8)) % 8;
      base2 = "0".repeat(padAmount) + base2;
    } else {
      base2 = base2.replace(/^0+/, "");
    }
    return base2;
  }

  static buildBinaryLookupTable(maxBitCount: number): bigint[] {
    const table: bigint[] = [];
    for (let bitPosition = 0; bitPosition < maxBitCount; bitPosition++) {
      table.push(BigInt(2) ** BigInt(bitPosition));
    }
    return table;
  }

  static base2to10(base2: string): string {
    if (typeof base2 !== "string" || /[^01]/.test(base2)) {
      throw new Error("Input must be a binary string.");
    }
    if (!this.bitValueTable) {
      this.bitValueTable = this.buildBinaryLookupTable(512);
    }
    const base2rev = base2.split("").reverse().join("");
    let base10 = BigInt(0);
    for (let bitPosition = 0; bitPosition < base2rev.length; bitPosition++) {
      if (base2rev[bitPosition] === "1") {
        if (bitPosition < this.bitValueTable.length) {
          base10 += this.bitValueTable[bitPosition];
        } else {
          const bitValue = BigInt(2) ** BigInt(bitPosition);
          this.bitValueTable[bitPosition] = bitValue;
          base10 += bitValue;
        }
      }
    }
    return base10.toString();
  }
}

function genInstagramUserAgent(): string {
  const versions = [
    "264.0.0.22.106",
    "265.0.0.19.301",
    "253.0.0.23.114",
    "145.0.0.32.119",
  ];
  const androidVersions = [
    { api: 30, ver: "11" },
    { api: 31, ver: "12" },
    { api: 32, ver: "12L" },
    { api: 33, ver: "13" },
  ];
  const devices = [
    {
      dpi: "540dpi",
      res: "1080x2137",
      brand: "HMD Global",
      model: "Nokia X100",
      code: "DM5",
      chip: "qcom",
      lang: "es_US",
    },
    {
      dpi: "360dpi",
      res: "720x1366",
      brand: "FCNT",
      model: "F-51B",
      code: "F51B",
      chip: "qcom",
      lang: "ja_JP",
    },
    {
      dpi: "213dpi",
      res: "800x1216",
      brand: "Amazon",
      model: "KFONWI",
      code: "onyx",
      chip: "mt8168",
      lang: "en_GB",
    },
    {
      dpi: "480dpi",
      res: "1080x2264",
      brand: "Realme",
      model: "RMX1851",
      code: "RMX1851",
      chip: "qcom",
      lang: "en_US",
    },
  ];
  const version = versions[Math.floor(Math.random() * versions.length)];
  const android =
    androidVersions[Math.floor(Math.random() * androidVersions.length)];
  const device = devices[Math.floor(Math.random() * devices.length)];
  const userId = Math.floor(100000000 + Math.random() * 999999999);
  return `Instagram ${version} Android (${android.api}/${android.ver}; ${device.dpi}; ${device.res}; ${device.brand}; ${device.model}; ${device.code}; ${device.chip}; ${device.lang}; ${userId})`;
}

interface Attachment {
  type: "Photo" | "Video";
  url: string;
}

interface DownloadResult {
  id: string;
  message: string | null;
  author: string | null;
  like: string | null;
  comment: string | null;
  play: string | null;
  attachments: Attachment[];
}

interface StoryResult extends DownloadResult {
  pk?: string;
}

interface UserSearchResult {
  id: string | number;
  username: string;
  full_name: string;
  profile_pic_url: string;
  is_private: boolean;
  is_verified: boolean;
}

class InstagramAPI {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: "https://www.instagram.com",
      headers: {
        accept: "*/*",
        "accept-language": "vi,en-US;q=0.9,en;q=0.8",
        "sec-ch-ua":
          '"Chromium";v="106", "Microsoft Edge";v="106", "Not;A=Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "x-asbd-id": "198387",
        "x-csrftoken": "tJk2tDhaeYfUeJRImgbH75Vp6CV6PjtW",
        "x-ig-app-id": "936619743392459",
        "x-ig-www-claim":
          "hmac.AR1NFmgjJtkM68KRAAwpbEV2G73bqDP45PvNfY8stbZcFiRA",
        "x-instagram-ajax": "1006400422",
        Referer: "https://www.instagram.com/",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "User-Agent": genInstagramUserAgent(),
      },
    });
  }

  private formatNumber(number: any): string | null {
    if (isNaN(number)) {
      return null;
    }
    return Number(number).toLocaleString("de-DE");
  }

  private async request<T = any>(
    method: Method,
    endpoint: string,
    data: any = null
  ): Promise<T> {
    try {
      const cookie = getInstagramCookie();
      (this.client.defaults.headers as any).cookie = cookie;
      const response = await this.client.request<T>({
        method,
        url: endpoint,
        data,
      });
      delete (this.client.defaults.headers as any).cookie;
      return response.data;
    } catch (error) {
      delete (this.client.defaults.headers as any).cookie;
      throw error;
    }
  }

  async getUserId(username: string): Promise<string> {
    const userRes = await this.request<any>(
      "GET",
      `/api/v1/users/web_profile_info/?username=${username}`
    );
    return userRes.data.user.id;
  }

  async post(username: string): Promise<DownloadResult[]> {
    const id = await this.getUserId(username);
    const res = await this.request<any>("GET", `/api/v1/feed/user/${id}/`);
    const data = res.items || [];

    const results: DownloadResult[] = data.map((item: any) => {
      const info = item || {};
      const dataReturn: { images: string[]; videos: string[] } = {
        images: [],
        videos: [],
      };

      if (info.video_versions) {
        dataReturn.videos = [info.video_versions[0].url];
      } else {
        const allImage =
          info.carousel_media ||
          [
            {
              image_versions2: info.image_versions2,
            },
          ];
        dataReturn.images = allImage.map(
          (mediaItem: any) => mediaItem.image_versions2.candidates[0].url
        );
      }

      const postData = {
        ...dataReturn,
        caption: info.caption?.text || "",
        owner: {
          id: info.user.pk,
          username: info.user.username,
          full_name: info.user.full_name,
          profile_pic_url: info.user.profile_pic_url,
        },
        like_count: info.like_count,
        comment_count: info.comment_count,
        created_at: info.taken_at,
        media_type: info.media_type,
        originalData: info,
      };

      const attachments: Attachment[] = [];
      if (postData.images && postData.images.length > 0) {
        attachments.push(
          ...postData.images.map((imageUrl) => ({
            type: "Photo" as const,
            url: imageUrl,
          }))
        );
      } else if (postData.videos && postData.videos.length > 0) {
        attachments.push(
          ...postData.videos.map((videoUrl) => ({
            type: "Video" as const,
            url: videoUrl,
          }))
        );
      }

      return {
        id: String(postData.originalData.id),
        message: postData.caption || null,
        author:
          `${postData.owner.full_name} (${postData.owner.username})` || null,
        like: this.formatNumber(postData.like_count) || null,
        comment: this.formatNumber(postData.comment_count) || null,
        play: this.formatNumber(postData.originalData.play_count) || null,
        attachments,
      };
    });

    return results;
  }

  async search(
    query: string,
    count: number = 20
  ): Promise<UserSearchResult[]> {
    const response = await this.request<any>(
      "GET",
      `/api/v1/users/search/?q=${encodeURIComponent(
        query
      )}&rank_token=0.39535952451202463&count=${count}`
    );

    const users: UserSearchResult[] = response.users.map((user: any) => ({
      id: user.pk,
      username: user.username,
      full_name: user.full_name,
      profile_pic_url: user.profile_pic_url,
      is_private: user.is_private,
      is_verified: user.is_verified,
    }));

    return users;
  }

  async info(username: string): Promise<any> {
    const response = await this.request<any>(
      "GET",
      `/api/v1/users/web_profile_info/?username=${username}`
    );
    return response.data.user;
  }

  private extractReelPayload(html: string): any {
    const $ = cheerio.load(html);
    const scripts = $("script");
    let scriptContent: string | undefined;

    scripts.each((_i, script) => {
      const child = (script as any).children?.[0];
      const content =
        typeof child?.data === "string" ? child.data.trim() : undefined;

      if (
        content &&
        content.startsWith("{") &&
        content.includes("__bbox") &&
        (content.includes("reels_media") ||
          content.includes("reels_media__connection"))
      ) {
        scriptContent = content;
        return false;
      }

      return undefined;
    });

    if (!scriptContent) {
      throw new Error("Cannot find Instagram reel script JSON");
    }

    const parsedData = JSON.parse(scriptContent);
    return (
      parsedData?.require?.[0]?.[3]?.[0]?.__bbox?.require?.[0]?.[3]?.[1]
        ?.__bbox?.result?.data || null
    );
  }

  private matchesMediaId(value: unknown, targetId: string): boolean {
    if (value === null || value === undefined) return false;

    const candidate = String(value);
    const normalizedTarget = String(targetId);

    return (
      candidate === normalizedTarget ||
      candidate.split("_")[0] === normalizedTarget ||
      normalizedTarget.split("_")[0] === candidate
    );
  }

  private findMediaItem(items: any[], targetId: string): any | undefined {
    return items.find((item: any) => {
      const candidates = [
        item?.pk,
        item?.id,
        item?.media_key,
        item?.story_media_id,
        item?.originalData?.pk,
        item?.originalData?.id,
      ];

      return candidates.some((candidate) =>
        this.matchesMediaId(candidate, targetId)
      );
    });
  }

  private toDownloadResult(resp: any, fallback?: {
    title?: string | null;
    username?: string | null;
  }): DownloadResult {
    const attachments: Attachment[] = [];

    if (resp?.video_versions?.length) {
      attachments.push({
        type: "Video",
        url: resp.video_versions[0].url,
      });
    } else if (resp?.image_versions2?.candidates?.length) {
      attachments.push({
        type: "Photo",
        url: resp.image_versions2.candidates[0].url,
      });
    } else if (Array.isArray(resp?.carousel_media)) {
      for (const item of resp.carousel_media) {
        if (item?.video_versions?.length) {
          attachments.push({
            type: "Video",
            url: item.video_versions[0].url,
          });
        } else if (item?.image_versions2?.candidates?.length) {
          attachments.push({
            type: "Photo",
            url: item.image_versions2.candidates[0].url,
          });
        }
      }
    }

    return {
      id: String(resp?.id ?? resp?.pk ?? ""),
      message: resp?.caption?.text || resp?.caption || fallback?.title || null,
      author:
        resp?.user?.full_name && resp?.user?.username
          ? `${resp.user.full_name} (${resp.user.username})`
          : resp?.user?.username || fallback?.username || "Unknown",
      like: this.formatNumber(resp?.like_count) || null,
      comment: this.formatNumber(resp?.comment_count) || null,
      play: this.formatNumber(resp?.play_count) || null,
      attachments,
    };
  }

  private async fetchMediaInfoById(
    mediaId: string,
    fallback?: { title?: string | null; username?: string | null }
  ): Promise<DownloadResult | null> {
    try {
      const res = await this.request<any>(
        "GET",
        `/api/v1/media/${mediaId}/info/`
      );
      const items = Array.isArray(res?.items) ? res.items : [];
      const resp = this.findMediaItem(items, mediaId) || items[0];

      if (!resp) {
        return null;
      }

      return this.toDownloadResult(resp, fallback);
    } catch {
      return null;
    }
  }

  async highlights(url: string): Promise<DownloadResult[]> {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language":
          "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
        "Cache-Control": "max-age=0",
        Cookie: getInstagramCookie(),
        Dpr: "1",
        "Sec-Ch-Prefers-Color-Scheme": "dark",
        "Sec-Ch-Ua":
          '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
        "Sec-Ch-Ua-Full-Version-List":
          '"Google Chrome";v="123.0.6312.130", "Not:A-Brand";v="8.0.0.0", "Chromium";v="123.0.6312.130"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Model": '""',
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Ch-Ua-Platform-Version": '"10.0.0"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Viewport-Width": "528",
      },
    });

    const data = await res.text();
    const reelData = this.extractReelPayload(data);
    const dataResponse =
      reelData?.["xdt_api__v1__feed__reels_media__connection"]?.edges?.[0]
        ?.node;
    const items = dataResponse?.items;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Cannot find highlight items in Instagram response");
    }

    const results: DownloadResult[] = items.map(
      (resp: any) => {
        const attachments: Attachment[] = [];
        if (resp.video_versions && resp.video_versions.length > 0) {
          attachments.push({
            type: "Video",
            url: resp.video_versions[0].url,
          });
        } else if (
          resp.image_versions2 &&
          resp.image_versions2.candidates &&
          resp.image_versions2.candidates.length > 0
        ) {
          attachments.push({
            type: "Photo",
            url: resp.image_versions2.candidates[0].url,
          });
        }
        return {
          id: String(resp.id),
          message: dataResponse.title || null,
          author: dataResponse.user?.username || resp.user?.username || "Unknown",
          like: null,
          comment: null,
          play: null,
          attachments,
        };
      }
    );

    return results;
  }

  async story(url: string): Promise<StoryResult | DownloadResult[]> {
    function extract(u: string) {
      const regex =
        /https:\/\/www\.instagram\.com\/stories\/([^\/]+)\/(\d+)(?:\/|\?)/;
      const match = u.match(regex);
      if (match) {
        const username = match[1];
        const id = match[2];
        return { username, id };
      } else {
        return null;
      }
    }

    try {
      const extracted = extract(url);
      if (!extracted) throw new Error("Invalid story URL");
      const { id, username } = extracted;

      const userId = await this.getUserId(username);
      const postInfo = await this.request<any>(
        "GET",
        `/api/v1/feed/user/${userId}/reel_media/`
      );
      if (postInfo.status === "fail") {
        throw new Error("Không thể tải lên bài viết");
      }
      if (!postInfo.items || postInfo.items.length === 0) {
        throw new Error("Không có bài viết nào");
      }

      const matchedItem = this.findMediaItem(postInfo.items, id);
      const posts: StoryResult | undefined = matchedItem
        ? ({
            ...this.toDownloadResult(matchedItem),
            pk: String(matchedItem.pk ?? matchedItem.id ?? id),
          } as StoryResult)
        : undefined;

      if (!posts) {
        throw new Error("Story not found");
      }

      return posts;
    } catch (_e) {
      const extracted = extract(url);
      if (!extracted) {
        throw _e;
      }

      const direct = await this.fetchMediaInfoById(extracted.id);
      if (direct) {
        return direct as StoryResult;
      }

      return await this.story2(url);
    }
  }

  async getHighlight(url: string): Promise<DownloadResult> {
    const storyId = url.match(/story_media_id=([^&]+)/)?.[1];
    if (!storyId) {
      return await this.story2(url);
    }
    const res = await this.request<any>(
      "GET",
      `/api/v1/media/${storyId}/info/`
    );
    const data = Array.isArray(res?.items) ? res.items : [];
    const resp = this.findMediaItem(data, storyId);
    if (!resp) {
      throw new Error("Không tìm thấy story");
    }

    return this.toDownloadResult(resp);
  }

  async story2(url: string): Promise<DownloadResult> {
    function extract(u: string) {
      const regex =
        /https:\/\/www\.instagram\.com\/stories\/([^\/]+)\/(\d+)(?:\/|\?)/;
      const match = u.match(regex);
      if (match) {
        const username = match[1];
        const id = match[2];
        return { username, id };
      } else {
        return null;
      }
    }

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language":
          "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
        "Cache-Control": "max-age=0",
        Cookie: getInstagramCookie(),
        Dpr: "1",
        "Sec-Ch-Prefers-Color-Scheme": "dark",
        "Sec-Ch-Ua":
          '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
        "Sec-Ch-Ua-Full-Version-List":
          '"Google Chrome";v="123.0.6312.130", "Not:A-Brand";v="8.0.0.0", "Chromium";v="123.0.6312.130"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Model": '""',
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Ch-Ua-Platform-Version": '"10.0.0"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Viewport-Width": "528",
      },
    });

    const extracted = extract(url);
    if (!extracted) throw new Error("Invalid story URL");
    const { id } = extracted;

    const data = await res.text();
    const reelData = this.extractReelPayload(data);
    const dataResponse =
      reelData?.["xdt_api__v1__feed__reels_media"]?.reels_media?.[0];
    const items = dataResponse?.items;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Cannot find story items in Instagram response");
    }

    const matchedItem = this.findMediaItem(items, id);
    const redirectedAwayFromTarget = !res.url.includes(`/${id}`);
    const fallbackItem =
      !matchedItem && redirectedAwayFromTarget && items.length > 0
        ? items[0]
        : undefined;
    const selectedItem = matchedItem || fallbackItem;
    const output: DownloadResult | undefined = selectedItem
      ? this.toDownloadResult(selectedItem, {
          title: dataResponse.title || null,
          username: dataResponse.user?.username || null,
        })
      : undefined;

    if (!output) {
      const direct = await this.fetchMediaInfoById(id, {
        title: dataResponse.title || null,
        username: dataResponse.user?.username || null,
      });
      if (direct) {
        return direct;
      }

      throw new Error("Story not found in parsed data");
    }

    return output;
  }

  async getPost(url: string): Promise<DownloadResult> {
    if (
      !url ||
      !url.match(/https:\/\/www\.instagram\.com\/(p|tv|reel)\/[a-zA-Z0-9]+/)
    ) {
      throw new Error("Invalid or missing URL");
    }

    const extractShortcode = (link: string): string | null => {
      const regex =
        /https:\/\/www\.instagram\.com\/(p|tv|reel)\/([^/?]+)/;
      const match = link.match(regex);
      return match ? match[2] : null;
    };

    const shortcode = extractShortcode(url);
    if (!shortcode) throw new Error("Shortcode not found");
    const postId = getID.getCode(shortcode);
    if (!postId) throw new Error("Post not found");

    const postInfo = await this.request<any>(
      "GET",
      `/api/v1/media/${postId}/info/`
    );
    const info = postInfo.items?.[0] || {};

    const dataReturn: { images: string[]; videos: string[] } = {
      images: [],
      videos: [],
    };

    if (info.video_versions) {
      dataReturn.videos = [info.video_versions[0].url];
    } else {
      const allImage =
        info.carousel_media ||
        [
          {
            image_versions2: info.image_versions2,
          },
        ];
      dataReturn.images = allImage.map(
        (item: any) => item.image_versions2.candidates[0].url
      );
    }

    const postData = {
      ...dataReturn,
      caption: info.caption?.text || "",
      owner: {
        id: info.user.pk,
        username: info.user.username,
        full_name: info.user.full_name,
        profile_pic_url: info.user.profile_pic_url,
      },
      like_count: info.like_count,
      comment_count: info.comment_count,
      created_at: info.taken_at,
      media_type: info.media_type,
      originalData: info,
    };

    const attachments: Attachment[] = [];
    if (postData.images && postData.images.length > 0) {
      attachments.push(
        ...postData.images.map((imageUrl) => ({
          type: "Photo" as const,
          url: imageUrl,
        }))
      );
    } else if (postData.videos && postData.videos.length > 0) {
      attachments.push(
        ...postData.videos.map((videoUrl) => ({
          type: "Video" as const,
          url: videoUrl,
        }))
      );
    }

    return {
      id: String(postData.originalData.id),
      message: postData.caption || null,
      author: postData
        ? `${postData.owner.full_name} (${postData.owner.username})`
        : null,
      like: this.formatNumber(postData.like_count) || null,
      comment: this.formatNumber(postData.comment_count) || null,
      play: this.formatNumber(postData.originalData.play_count) || null,
      attachments,
    };
  }

  async down(
    link: string
  ): Promise<DownloadResult | DownloadResult[] | StoryResult> {
    if (
      /https:\/\/www\.instagram\.com\/(?:[a-zA-Z0-9_]+\/)?(p|tv|reel|pl)\/([a-zA-Z0-9]+)/.test(
        link
      )
    ) {
      const linkW = link.replace(
        /https:\/\/www\.instagram\.com\/([a-zA-Z0-9_]+\/)?(p|tv|reel|pl)\/([a-zA-Z0-9]+)/,
        "https://www.instagram.com/$2/$3"
      );
      return await this.getPost(linkW);
    } else if (
      /https:\/\/www\.instagram\.com\/stories\/[\w.]+\/\d+(\?[^\s]*)?/.test(
        link
      )
    ) {
      return await this.story(link);
    } else {
      return await this.highlights(link);
    }
  }

  async post2(username: string, count: number = 7): Promise<DownloadResult[]> {
    const id = await this.getUserId(username);
    const res = await this.request<any>(
      "GET",
      `/api/v1/feed/user/${id}/?count=${count}`
    );
    const data = res.items || [];

    const results: DownloadResult[] = data.map((item: any) => {
      const info = item || {};
      const dataReturn: { images: string[]; videos: string[] } = {
        images: [],
        videos: [],
      };

      if (info.video_versions) {
        dataReturn.videos = [info.video_versions[0].url];
      } else {
        const allImage =
          info.carousel_media ||
          [
            {
              image_versions2: info.image_versions2,
            },
          ];
        dataReturn.images = allImage.map(
          (mediaItem: any) => mediaItem.image_versions2.candidates[0].url
        );
      }

      const postData = {
        ...dataReturn,
        caption: info.caption?.text || "",
        owner: {
          id: info.user.pk,
          username: info.user.username,
          full_name: info.user.full_name,
          profile_pic_url: info.user.profile_pic_url,
        },
        like_count: info.like_count,
        comment_count: info.comment_count,
        created_at: info.taken_at,
        media_type: info.media_type,
        originalData: info,
      };

      const attachments: Attachment[] = [];
      if (postData.images && postData.images.length > 0) {
        attachments.push(
          ...postData.images.map((imageUrl) => ({
            type: "Photo" as const,
            url: imageUrl,
          }))
        );
      } else if (postData.videos && postData.videos.length > 0) {
        attachments.push(
          ...postData.videos.map((videoUrl) => ({
            type: "Video" as const,
            url: videoUrl,
          }))
        );
      }

      return {
        id: String(postData.originalData.id),
        message: postData.caption || null,
        author:
          `${postData.owner.full_name} (${postData.owner.username})` || null,
        like: this.formatNumber(postData.like_count) || null,
        comment: this.formatNumber(postData.comment_count) || null,
        play: this.formatNumber(postData.originalData.play_count) || null,
        attachments,
      };
    });

    return results;
  }
}

const instagramMobileApi = new InstagramAPI();
export default instagramMobileApi;
export { InstagramAPI, DownloadResult, Attachment, UserSearchResult };
