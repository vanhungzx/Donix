"use strict";
import axios, { AxiosInstance } from "axios";

export function genInstagramUserAgent(): string {
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

  if (!android || !device) {
    throw new Error("Failed to generate user agent");
  }

  return `Instagram ${version} Android (${android.api}/${android.ver}; ${device.dpi}; ${device.res}; ${device.brand}; ${device.model}; ${device.code}; ${device.chip}; ${device.lang}; ${userId})`;
}

export class getID {
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

  static base10to2(base10: string | number | bigint, padLeft = true): string {
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
        if (this.bitValueTable && bitPosition < this.bitValueTable.length) {
          const bitValue = this.bitValueTable[bitPosition];
          if (bitValue !== undefined) {
            base10 += bitValue;
          } else {
            const bitValueNew = BigInt(2) ** BigInt(bitPosition);
            this.bitValueTable[bitPosition] = bitValueNew;
            base10 += bitValueNew;
          }
        } else {
          const bitValue = BigInt(2) ** BigInt(bitPosition);
          this.bitValueTable[bitPosition] = bitValue;
          base10 += bitValue;
        }
      }
    }
    return base10.toString();
  }

  static getShortcodeFromID(id: string): string {
    if (typeof id !== "string" || /[^0-9]/.test(id)) {
      throw new Error("Input must be a valid numeric ID.");
    }
    let binary = BigInt(id).toString(2);
    const pad = (6 - (binary.length % 6)) % 6;
    binary = "0".repeat(pad) + binary;
    let shortcode = "";
    for (let i = 0; i < binary.length; i += 6) {
      const chunk = binary.slice(i, i + 6);
      const index = parseInt(chunk, 2);
      shortcode += this.BASE64URL_CHARMAP[index];
    }
    return shortcode;
  }
}

interface InitTokens {
  csrfToken?: string;
  appId?: string;
  lsd?: string;
  bloks_id?: string;
  asbdId: string;
  __rev?: string;
  __hsi?: string;
  __hs?: string;
  actorID?: string;
  full_name?: string;
  dtsg?: string;
  jazoest?: string;
}

interface Attachment {
  type: "Photo" | "Video";
  url: string;
}

interface DownloadResult {
  id: string | number;
  message: string | null;
  author: string | null;
  like: string | null;
  comment: string | null;
  play: string | null;
  attachments: Attachment[];
}

class InstagramAPI {
  cookie: string;
  client: AxiosInstance;

  constructor() {
    this.cookie =
      'atr=fcDbZ3-hg5AvtjmQuCE89Oe2; ig_did=7F80C0A8-D59E-436F-9B5B-782294AF56B7; ig_nrcb=1; fbm_124024574287414=base_domain=.instagram.com; ps_l=1; ps_n=1; ds_user_id=69502195242; mid=aImvkwALAAF5PgnwVluNsm7pe-JG; csrftoken=9SEk0DtcYolZuvQle3baAOK8oW7PfxBT; sessionid=69502195242%3AZ3niheKnHBtxRc%3A5%3AAYiVEa3snM2W_1nDS8utb8xVtY_ELENTkJoZm6nZioQ; ig_direct_region_hint="FTW\x2c69502195242\x2c1790918424:01fe90123340c651af2d00dc3556aec80cee5fb752948e8c1172aeb9b6b5caeb457325b7"; wd=816x919; rur="EAG\x2c69502195242\x2c1790918629:01fe72251239c7e7a4ea4b5f3873e5b57a6f6c771168539cec3d7510868d9c0d04aecf35"';

    this.client = axios.create({
      baseURL: "https://www.instagram.com",
      headers: {
        accept: "*/*",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
        "content-type": "application/x-www-form-urlencoded",
        cookie: this.cookie,
        origin: "https://www.instagram.com/",
        referer: "https://www.instagram.com/",
        "sec-ch-prefers-color-scheme": "dark",
        "sec-ch-ua":
          '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        "sec-ch-ua-full-version-list":
          '"Google Chrome";v="135.0.7049.116", "Not-A.Brand";v="8.0.0.0", "Chromium";v="135.0.7049.116"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-ch-ua-platform-version": '"19.0.0"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      },
    });
  }

  private formatNumber(number: any): string | null {
    if (isNaN(number)) return null;
    return Number(number).toLocaleString("de-DE");
  }

  async initializeTokens(): Promise<InitTokens> {
    try {
      const response = await this.client.get<string>("/");
      const html = response.data;
      const tokens: InitTokens = {
        csrfToken: html.match(/"csrf_token":"([^"]+)"/)?.[1],
        appId: html.match(/"app_id":"(\d+)"/)?.[1],
        lsd: html.match(/"LSD",\[\],{"token":"([^"]+)"}/)?.[1],
        bloks_id:
          html.match(
            /\["WebBloksVersioningID",\[\],{"versioningID":"([^"]+)"}/
          )?.[1],
        asbdId: "359341",
        __rev: html.match(/"server_revision":(.*?),/)?.[1],
        __hsi: html.match(/"hsi":"(.*?)"/)?.[1],
        __hs: html.match(/"haste_session":"(.*?)"/)?.[1],
        actorID:
          html.match(/"actorID":"(\d+)"/)?.[1] ||
          html.match(/"fbid":"(\d+)"/)?.[1],
        full_name: html.match(/"full_name":"([^"]+)"/)?.[1],
        dtsg: html.match(/DTSGInitialData.*?token":"(.*?)"/)?.[1],
        jazoest: html.match(/&jazoest=(\d+)/)?.[1],
      };
      return tokens;
    } catch (error: any) {
      throw new Error(`Failed to get Instagram homepage: ${error.message}`);
    }
  }

  async getIDProfile(username: string): Promise<string> {
    const { data: html } = await this.client.get<string>(`/${username}/`);
    const match =
      html.match(/"profile_id":"(\d+)"/) ||
      html.match(/"entity_id":"(\d+)"/) ||
      html.match(/"pageID":"(\d+)"/) ||
      html.match(/profilePage_(\d+)/);

    if (match && match[1]) return match[1];
    throw new Error(`Không tìm thấy profile ID cho ${username}`);
  }

  async stories(url: string): Promise<DownloadResult | any> {
    try {
      function extract(u: string) {
        const regex =
          /https:\/\/www\.instagram\.com\/stories\/([^\/]+)\/(\d+)(?:\/|\?)/;
        const match = u.match(regex);
        if (match && match[1] && match[2]) {
          const username = match[1];
          const id = match[2];
          return { username, id };
        }
        return null;
      }

      const extracted = extract(url);
      if (!extracted) throw new Error("Invalid story URL");
      const { username, id } = extracted;

      const profileId = await this.getIDProfile(username);
      const token = await this.initializeTokens();

      const response = await this.client.post<any>(
        "/graphql/query",
        {
          av: token.actorID,
          __d: "www",
          __user: "0",
          __a: "1",
          __hs: token.__hs,
          dpr: "1",
          __ccg: "EXCELLENT",
          __rev: token.__rev,
          __hsi: token.__hsi,
          fb_dtsg: token.dtsg,
          jazoest: token.jazoest,
          lsd: token.lsd,
          __crn: "comet.igweb.PolarisProfilePostsTabRoute",
          fb_api_caller_class: "RelayModern",
          fb_api_req_friendly_name: "PolarisStoriesV3ReelPageStandaloneQuery",
          variables: JSON.stringify({
            reel_ids_arr: [profileId],
          }),
          server_timestamps: true,
          doc_id: "9754293608000623",
        },
        {
          headers: {
            "x-asbd-id": token.asbdId,
            "x-bloks-version-id": token.bloks_id,
            "x-csrftoken": token.csrfToken || "",
            "x-fb-friendly-name": "PolarisStoriesV3ReelPageStandaloneQuery",
            "x-fb-lsd": token.lsd || "",
            "x-ig-app-id": token.appId || "",
            "x-root-field-name": "xdt_api__v1__feed__reels_media",
          },
        }
      );

      const postInfo =
        response.data.data["xdt_api__v1__feed__reels_media"].reels_media[0];

      const posts: DownloadResult | undefined = postInfo.items
        .filter((info: any) => info.pk.toString() === id)
        .map((info: any) => {
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
            id: postData.originalData.id,
            message: postData.caption || null,
            author: postData
              ? `${postData.owner.full_name} (${postData.owner.username})`
              : null,
            like: this.formatNumber(postData.like_count) || null,
            comment: this.formatNumber(postData.comment_count) || null,
            play:
              this.formatNumber(postData.originalData.play_count) || null,
            attachments,
          };
        })[0];

      return posts;
    } catch (error) {
      return this.highlights(url);
    }
  }

  async getHighlights(username: string): Promise<any> {
    try {
      const profileId = await this.getIDProfile(username);
      const token = await this.initializeTokens();

      const response = await this.client.post<any>(
        "/graphql/query",
        {
          av: token.actorID,
          __d: "www",
          __user: "0",
          __a: "1",
          __hs: token.__hs,
          dpr: "1",
          __ccg: "EXCELLENT",
          __rev: token.__rev,
          __hsi: token.__hsi,
          fb_dtsg: token.dtsg,
          jazoest: token.jazoest,
          lsd: token.lsd,
          fb_api_caller_class: "RelayModern",
          fb_api_req_friendly_name:
            "PolarisProfileStoryHighlightsTrayContentQuery",
          variables: JSON.stringify({
            user_id: profileId,
          }),
          server_timestamps: true,
          doc_id: "9719220061527365",
        },
        {
          headers: {
            "x-asbd-id": token.asbdId,
            "x-bloks-version-id": token.bloks_id,
            "x-csrftoken": token.csrfToken || "",
            "x-fb-friendly-name":
              "PolarisProfileStoryHighlightsTrayContentQuery",
            "x-fb-lsd": token.lsd || "",
            "x-ig-app-id": token.appId || "",
          },
        }
      );

      const parsedData = {
        highlights:
          response.data?.data?.highlights?.edges?.map((edge: any) => ({
            id: edge.node.id,
            title: edge.node.title,
            coverUrl: edge.node.cover_media?.cropped_image_version?.url,
            username: edge.node.user?.username,
            userId: edge.node.user?.id,
          })) || [],
      };
      return parsedData;
    } catch (error: any) {
      throw new Error(`Failed to fetch highlights: ${error.message}`);
    }
  }

  async getPosts(username: string): Promise<any> {
    try {
      const token = await this.initializeTokens();

      const response = await this.client.post<any>(
        "/graphql/query",
        {
          av: token.actorID,
          __d: "www",
          __user: "0",
          __a: "1",
          __hs: token.__hs,
          dpr: "1",
          __ccg: "EXCELLENT",
          __rev: token.__rev,
          __hsi: token.__hsi,
          fb_dtsg: token.dtsg,
          jazoest: token.jazoest,
          lsd: token.lsd,
          fb_api_caller_class: "RelayModern",
          fb_api_req_friendly_name: "PolarisProfilePostsQuery",
          variables: JSON.stringify({
            data: {
              count: 12,
              include_reel_media_seen_timestamp: true,
              include_relationship_info: true,
              latest_besties_reel_media: true,
              latest_reel_media: true,
            },
            username,
            "__relay_internal__pv__PolarisIsLoggedInrelayprovider": true,
            "__relay_internal__pv__PolarisShareSheetV3relayprovider": false,
          }),
          server_timestamps: true,
          doc_id: "9806959572732215",
        },
        {
          headers: {
            "x-asbd-id": token.asbdId,
            "x-bloks-version-id": token.bloks_id,
            "x-csrftoken": token.csrfToken || "",
            "x-fb-friendly-name": "PolarisProfilePostsQuery",
            "x-fb-lsd": token.lsd || "",
            "x-ig-app-id": token.appId || "",
          },
        }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to fetch posts: ${error.message}`);
    }
  }

  async getHighlightStories(url: string): Promise<any> {
    try {
      function extractHighlightId(u: string): string {
        const regex =
          /https:\/\/www\.instagram\.com\/stories\/highlights\/(\d+)/;
        const match = u.match(regex);
        if (match && match[1]) return match[1];
        throw new Error("Invalid highlight URL format");
      }

      const highlightId = extractHighlightId(url);
      const token = await this.initializeTokens();

      const response = await this.client.post<any>(
        "/graphql/query",
        {
          av: token.actorID,
          __d: "www",
          __user: "0",
          __a: "1",
          __hs: token.__hs,
          dpr: "1",
          __ccg: "EXCELLENT",
          __rev: token.__rev,
          __hsi: token.__hsi,
          fb_dtsg: token.dtsg,
          jazoest: token.jazoest,
          lsd: token.lsd,
          fb_api_caller_class: "RelayModern",
          fb_api_req_friendly_name: "PolarisStoriesV3HighlightsPageQuery",
          variables: JSON.stringify({
            initial_reel_id: `highlight:${highlightId}`,
            reel_ids: [`highlight:${highlightId}`],
            first: 3,
            last: 2,
          }),
          server_timestamps: true,
          doc_id: "24608084205447662",
        },
        {
          headers: {
            "x-asbd-id": token.asbdId,
            "x-bloks-version-id": token.bloks_id,
            "x-csrftoken": token.csrfToken || "",
            "x-fb-friendly-name": "PolarisStoriesV3HighlightsPageQuery",
            "x-fb-lsd": token.lsd || "",
            "x-ig-app-id": token.appId || "",
          },
        }
      );

      const data = response.data;
      return data.data;
    } catch (error: any) {
      throw new Error(`Failed to fetch highlight stories: ${error.message}`);
    }
  }

  async getProfileInfo(username: string): Promise<any> {
    try {
      const id = await this.getIDProfile(username);
      const token = await this.initializeTokens();

      const response = await this.client.post<any>(
        "/graphql/query",
        {
          av: token.actorID,
          __d: "www",
          __user: "0",
          __a: "1",
          __hs: token.__hs,
          dpr: "1",
          __ccg: "EXCELLENT",
          __rev: token.__rev,
          __hsi: token.__hsi,
          fb_dtsg: token.dtsg,
          jazoest: token.jazoest,
          lsd: token.lsd,
          fb_api_caller_class: "RelayModern",
          fb_api_req_friendly_name: "PolarisProfilePageContentQuery",
          variables: JSON.stringify({
            id,
            render_surface: "PROFILE",
          }),
          server_timestamps: true,
          doc_id: "9661599240584790",
        },
        {
          headers: {
            "x-asbd-id": token.asbdId,
            "x-bloks-version-id": token.bloks_id,
            "x-csrftoken": token.csrfToken || "",
            "x-fb-friendly-name": "PolarisProfilePageContentQuery",
            "x-fb-lsd": token.lsd || "",
            "x-ig-app-id": token.appId || "",
          },
        }
      );

      return response.data.data.user;
    } catch (error: any) {
      throw new Error(`Failed to fetch profile info: ${error.message}`);
    }
  }

  async getPost(url: string): Promise<DownloadResult> {
    try {
      function getShortcode(u: string): string {
        try {
          const split_url = u.split("/");
          const post_tags = ["p", "reel", "tv", "reels"];
          const index_shortcode =
            split_url.findIndex((item) => post_tags.includes(item)) + 1;
          const shortcode = split_url[index_shortcode];
          if (!shortcode) {
            throw new Error("Shortcode not found in URL");
          }
          return shortcode;
        } catch (err: any) {
          throw new Error(`Failed to obtain shortcode: ${err.message}`);
        }
      }

      const shortcode = getShortcode(url);
      const token = await this.initializeTokens();

      const response = await this.client.post<any>(
        "/graphql/query",
        {
          av: token.actorID,
          __d: "www",
          __user: "0",
          __a: "1",
          __hs: token.__hs,
          dpr: "1",
          __ccg: "EXCELLENT",
          __rev: token.__rev,
          __hsi: token.__hsi,
          fb_dtsg: token.dtsg,
          jazoest: token.jazoest,
          lsd: token.lsd,
          fb_api_caller_class: "RelayModern",
          fb_api_req_friendly_name: "PolarisPostRootQuery",
          variables: JSON.stringify({
            shortcode,
            "__relay_internal__pv__PolarisShareSheetV3relayprovider": true,
          }),
          server_timestamps: true,
          doc_id: "9140397392731123",
        },
        {
          headers: {
            "x-asbd-id": token.asbdId,
            "x-bloks-version-id": token.bloks_id,
            "x-csrftoken": token.csrfToken || "",
            "x-fb-friendly-name": "PolarisPostRootQuery",
            "x-fb-lsd": token.lsd || "",
            "x-ig-app-id": token.appId || "",
          },
        }
      );

      const info =
        response.data.data.xdt_api__v1__media__shortcode__web_info.items[0];

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

      const outputData: DownloadResult = {
        id: postData.originalData.id,
        message: postData.caption || null,
        author: postData
          ? `${postData.owner.full_name} (${postData.owner.username})`
          : null,
        like: this.formatNumber(postData.like_count) || null,
        comment: this.formatNumber(postData.comment_count) || null,
        play: this.formatNumber(postData.originalData.play_count) || null,
        attachments,
      };

      return outputData;
    } catch (error: any) {
      throw new Error(`Failed to fetch post: ${error.message}`);
    }
  }

  async highlights(url: string): Promise<DownloadResult[]> {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,**",
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

    const json = await res.json();
    const data = (json as any)?.items || [];
    const resp = data.find((item: any) => String(item.id) === String(url));
    if (!resp) throw new Error("Không tìm thấy story với id tương ứng.");

    const attachments: Attachment[] = [];
    if (resp.video_versions?.length) {
      attachments.push({
        type: "Video",
        url: resp.video_versions[0].url,
      });
    } else if (resp.image_versions2?.candidates?.length) {
      attachments.push({
        type: "Photo",
        url: resp.image_versions2.candidates[0].url,
      });
    }

    return [{
      id: String(resp.id),
      message: resp.caption || null,
      author: `${resp.user.full_name} (${resp.user.username})`,
      like: null,
      comment: null,
      play: null,
      attachments,
    }];
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
      }
      return null;
    }

    const extracted = extract(url);
    if (!extracted) throw new Error("Invalid story URL");
    const { id } = extracted;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*",
        "accept-language": "vi,en-US;q=0.9,en;q=0.8",
        "sec-ch-ua":
          '"Chromium";v="106", "Microsoft Edge";v="106", "Not;A=Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        Referer: "https://www.instagram.com/",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "User-Agent": genInstagramUserAgent(),
      },
    });

    const json = await res.json();
    const data = (json as any)?.items || [];
    const resp = data.find((item: any) => String(item.id) === String(id));
    if (!resp) throw new Error("Không tìm thấy story với id tương ứng.");

    const attachments: Attachment[] = [];
    if (resp.video_versions?.length) {
      attachments.push({
        type: "Video",
        url: resp.video_versions[0].url,
      });
    } else if (resp.image_versions2?.candidates?.length) {
      attachments.push({
        type: "Photo",
        url: resp.image_versions2.candidates[0].url,
      });
    }

    return {
      id: String(resp.id),
      message: resp.caption || null,
      author: `${resp.user.full_name} (${resp.user.username})`,
      like: null,
      comment: null,
      play: null,
      attachments,
    };
  }
}

export default new InstagramAPI();
