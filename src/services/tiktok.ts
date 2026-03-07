import axios, { AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import cheerio from "cheerio";
import { CookieJar } from "tough-cookie";
import { URL, URLSearchParams } from "url";
import bogusImport from "./lib/tiktok/xbogus";
import gnarlyImport from "./lib/tiktok/xgnarly";

type BrowserConfig = {
  language: string;
  name: string;
  online: boolean;
  platform: string;
  userAgent: string;
  version: string;
};

type ClientConfig = {
  browser: BrowserConfig;
};

class TikTokWebClient {
  private config: ClientConfig;
  private cookies: string;
  private signBogus?: (...args: any[]) => string;
  private signGnarly?: (...args: any[]) => string;
  private msToken: string;
  private client: AxiosInstance;

  constructor() {
    this.config = {
      browser: {
        language: "vi-VN",
        name: "Mozilla",
        online: true,
        platform: "Win32",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        version: "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      },
    };
    this.cookies =
      "d_ticket=93925ebb326f0e37530f4a809f0d26cc012cf; uid_tt=88cfe3db0eed8421d054e3ff27fc74d6e896ce95c72725c603ee1472d1fc7624; uid_tt_ss=88cfe3db0eed8421d054e3ff27fc74d6e896ce95c72725c603ee1472d1fc7624; sid_tt=5d1c71c3c810e333f76d3bb5520c2dd8; sessionid=5d1c71c3c810e333f76d3bb5520c2dd8; sessionid_ss=5d1c71c3c810e333f76d3bb5520c2dd8; store-idc=alisg; store-country-code=vn; store-country-code-src=uid; tt-target-idc=alisg; tt-target-idc-sign=KYdSZclxvoonTuTmUAJkl4q1Xl1FVYdYsEkC2_L-b3MlUEmLtqxHaxhv-qWRM-HDbc12dYxTBA8Ear9rvui6-f8sbXletKbBTsXmbcBrHJoOd8TLr-bbbQCqpJFgQdDTNUKQYPRqbW_sGPh8FVa_Rb_rSDldhXXOhM_4IYJDtv97-w37miFLOIeGvaDCzxgEt8letMBuvrGsGqyke9FB5ekhIhcHD09LquAlXEzUNNKlhtK3I1S3YLD886qNcyTYfZL3tKVdGGaYyByWirKSY3vTSYVmVP9SC7jprwQF33Cvzwr59gY4ePvNWAw8QU6jgcgYHoBoEGjiL1tVa-TB5bRwG1gizw6nGujkjOLzf0cUq_zrQ6tSSBCkJ-St0IgCnwcSdIq2RCuKh2XWzCjTGsZfdG7T5nBKyQH71_rSRO2TEiCnTvfDDJ97LChgY7_j5oZK12cx35rRXvYxHt-CXrgSzvcEzlNW0MN7X3ocuPMcH_gW1smK9PijNxcZiycX; _ttp=2ufopCe9J4LeJHczPxlPC0MBwHL; passport_csrf_token=79234fcb874c09f3fce3b134daccc490; passport_csrf_token_default=79234fcb874c09f3fce3b134daccc490; tt_chain_token=m0CxSp4Pfo4HClM1cseiYA==; tt_ticket_guard_client_web_domain=2; tt_ticket_guard_client_data=eyJ0dC10aWNrZXQtZ3VhcmQtdmVyc2lvbiI6MiwidHQtdGlja2V0LWd1YXJkLWl0ZXJhdGlvbi12ZXJzaW9uIjoxLCJ0dC10aWNrZXQtZ3VhcmQtcHVibGljLWtleSI6IkJPN0s5OG9rdWU2ZitsbXdWdzJiTHFySzlxL0djN3lGd1hZSDVNRUZEU0syMGdkVXU3Q1ZkaXJLb3pnaG1PTEMwbHZ6ZXV5SU1wM2hhc0RIZzU3czlNaz0iLCJ0dC10aWNrZXQtZ3VhcmQtd2ViLXZlcnNpb24iOjF9; odin_tt=eb4bbb0dde5aa8a8a79faa3bff83c5365cbb085523c3da5f4c9e7ce2836d94f4265ce8ce0b4dc87ea97388d36333aea6f639adb712e52cc7d1a8067a83058799751ea2b7c1fab87063aa913c3031dae0; sid_guard=5d1c71c3c810e333f76d3bb5520c2dd8%7C1761296381%7C15552000%7CWed%2C+22-Apr-2026+08%3A59%3A41+GMT; tt_session_tlb_tag=sttt%7C5%7CXRxxw8gQ4zP3bTu1Ugwt2P_________cg8ZkQVe_F_5QUdfd-RFTlYcr1oPLd_Q9WUj5o9A8MWc%3D; sid_ucp_v1=1.0.0-KDUzZTZlYzk5MjExYTNiMWM0YWRlOGM0NzlmZGNkZGY4YWNiMzFlNzkKGgiFiMTeiuLd92YQ_f_sxwYYsws4AkDxB0gEEAMaAm15IiA1ZDFjNzFjM2M4MTBlMzMzZjc2ZDNiYjU1MjBjMmRkOA; ssid_ucp_v1=1.0.0-KDUzZTZlYzk5MjExYTNiMWM0YWRlOGM0NzlmZGNkZGY4YWNiMzFlNzkKGgiFiMTeiuLd92YQ_f_sxwYYsws4AkDxB0gEEAMaAm15IiA1ZDFjNzFjM2M4MTBlMzMzZjc2ZDNiYjU1MjBjMmRkOA; tt_csrf_token=peg1J0fo-XuZTNN4McOTYgRHOsT91ESq5-Do; s_v_web_id=verify_mhervs9l_3wnH6CnT_cW5Q_4dqw_8jPt_G9DfRJDCPkSG; ttwid=1%7CxBVAOf6c6rnHdOB2MHZp0PDRG1uj2jlgrLNv22FlFI0%7C1761935849%7C4a8495ca4278766221c103ca736a86c37254b7e1b00183e0f1bd90b10ad351ba; store-country-sign=MEIEDAXSZJBzTsjh_tH_xwQgjXL_zAFT3QTq9R8me-MqRvf-6XBb12a1ZWwqp88UWSUEEMwnHg_tzsWwHsqqIKt5U1I; msToken=7M4vh7uaN81EPDdhrno9aIhrmfb9ndi3Ar6D7MorKa0n8t36UIybfsJKmJuStejPAhaIkF33Affg3zh3wyTCXdXWhXleWx0ytbaRdZeOixBzYJ13EnI7bvrEZUhj90tdfxYZixDc8_XIFst6";
    const bogus: any = bogusImport;
    const gnarly: any = gnarlyImport;
    this.signBogus = typeof bogus === "function" ? bogus : bogus && (bogus.sign || bogus.default);
    this.signGnarly = typeof gnarly === "function" ? gnarly : gnarly && (gnarly.sign || gnarly.default);
    const msTokenMatch = this.cookies.match(/msToken=([^;]+)/);
    this.msToken = msTokenMatch && msTokenMatch[1] ? msTokenMatch[1] : "";
    this.client = axios.create({
      baseURL: "https://www.tiktok.com",
      headers: {
        authority: "www.tiktok.com",
        method: "GET",
        scheme: "https",
        Accept: "*/*",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
        Referer: "https://www.tiktok.com/",
        "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent": this.config.browser.userAgent,
        Cookie: this.cookies,
      },
    });
  }

  private signParams({
    url,
    params = {},
    body = null,
  }: {
    url: string;
    params?: Record<string, any>;
    body?: any;
  }): string {
    const base = this.client.defaults.baseURL || "https://www.tiktok.com";
    const u = new URL(url, base);
    const query = new URLSearchParams();


    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          query.append(key, String(v));
        }
      } else {
        query.append(key, String(value));
      }
    }

    const bodyStr = body == null ? "" : typeof body === "string" ? body : JSON.stringify(body);
    const ts = Math.floor(Date.now() / 1000);
    const xBogus = this.signBogus ? this.signBogus(query.toString(), bodyStr, this.config.browser.userAgent, ts) : "";
    const xGnarly = this.signGnarly ? this.signGnarly(query.toString(), bodyStr, this.config.browser.userAgent, 0, "5.1.1") : "";
    for (const [k, v] of query) u.searchParams.append(k, v);
    if (xBogus) u.searchParams.set("X-Bogus", xBogus);
    if (xGnarly) u.searchParams.set("X-Gnarly", xGnarly);
    return u.toString();
  }

  private formatNumber(num?: number | null): string | 0 {
    if (!num) return 0;
    return num.toString();
  }

  private formatTimestamp(timestamp: number): string {
    return new Date(timestamp * 1000).toISOString();
  }

  private async get({
    url,
    params = {},
    body = null,
    headers = {},
  }: {
    url: string;
    params?: Record<string, any>;
    body?: any;
    headers?: Record<string, any>;
  }): Promise<any> {
    const signedUrl = this.signParams({ url, params, body });
    const res = await this.client.get(signedUrl, { headers });
    return res.data;
  }

  private async httpPost(url: string, data: { params?: any; body?: any } = {}, headers: Record<string, any> = {}): Promise<any> {
    const signedUrl = this.signParams({ url, params: data.params || {}, body: data.body || null });
    const res = await this.client.post(signedUrl, data.body || {}, { headers });
    return res.data;
  }

  private async parseVideoUrl(url: string): Promise<string | undefined> {
    const randomUserAgent = (): string => {
      const versions = ["4.0.3", "4.1.1", "4.2.2", "4.3", "4.4", "5.0.2", "5.1", "6.0", "7.0", "8.0", "9.0", "10.0", "11.0"];
      const devices = ["M2004J19C", "S2020X3", "Xiaomi4S", "RedmiNote9", "SamsungS21", "GooglePixel5"];
      const builds = ["RP1A.200720.011", "RP1A.210505.003", "RP1A.210812.016", "QKQ1.200114.002", "RQ2A.210505.003"];
      const chromeVersion = `Chrome/${Math.floor(Math.random() * 80) + 1}.${Math.floor(Math.random() * 999) + 1}.${Math.floor(Math.random() * 9999) + 1}`;
      return `Mozilla/5.0 (Linux; Android ${versions[Math.floor(Math.random() * versions.length)]
        }; ${devices[Math.floor(Math.random() * devices.length)]
        } Build/${builds[Math.floor(Math.random() * builds.length)]
        }) AppleWebKit/537.36 (KHTML, like Gecko) ${chromeVersion} Mobile Safari/537.36 WhatsApp/1.${Math.floor(Math.random() * 9) + 1
        }.${Math.floor(Math.random() * 9) + 1
        }`;
    };
    const randomIP = (): string =>
      `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(
        Math.random() * 256,
      )}`;
    const headersss = (): Record<string, string> => ({
      "User-Agent": randomUserAgent(),
      "X-Forwarded-For": randomIP(),
    });
    let normalized = url.replace("https://vm", "https://vt");
    const headResponse: any = await axios.head(normalized, {
      headers: {
        "Accept-Language": "vi-VN",
        Accept: "*/*",
        Connection: "keep-alive",
        ...headersss(),
      },
      timeout: 10000,
    });
    const responseUrl: string = headResponse.request.res.responseUrl;
    return responseUrl.match(/\d{17,21}/g)?.[0];
  }

  private async down3(url: string): Promise<any> {
    const _tiktokapi = (ID: string): string =>
      `https://api22-normal-c-alisg.tiktokv.com/aweme/v1/feed/?aweme_id=${ID}`;

    const formatTimestamp = (timestamp: number): string => {
      const date = new Date(timestamp * 1000);
      return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(
        date.getSeconds(),
      ).padStart(2, "0")} | ${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(
        2,
        "0",
      )}/${date.getFullYear()}`;
    };

    const formatNumber = (number: number): string | null =>
      isNaN(number) ? null : number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

    const randomUserAgent = (): string => {
      const versions = ["4.0.3", "4.1.1", "4.2.2", "4.3", "4.4", "5.0.2", "5.1", "6.0", "7.0", "8.0", "9.0", "10.0", "11.0"];
      const devices = ["M2004J19C", "S2020X3", "Xiaomi4S", "RedmiNote9", "SamsungS21", "GooglePixel5"];
      const builds = ["RP1A.200720.011", "RP1A.210505.003", "RP1A.210812.016", "QKQ1.200114.002", "RQ2A.210505.003"];
      const chromeVersion = `Chrome/${Math.floor(Math.random() * 80) + 1}.${Math.floor(Math.random() * 999) + 1}.${Math.floor(
        Math.random() * 9999,
      ) + 1}`;
      return `Mozilla/5.0 (Linux; Android ${versions[Math.floor(Math.random() * versions.length)]
        }; ${devices[Math.floor(Math.random() * devices.length)]
        } Build/${builds[Math.floor(Math.random() * builds.length)]
        }) AppleWebKit/537.36 (KHTML, like Gecko) ${chromeVersion} Mobile Safari/537.36 WhatsApp/1.${Math.floor(Math.random() * 9) + 1
        }.${Math.floor(Math.random() * 9) + 1
        }`;
    };

    const randomIP = (): string =>
      `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(
        Math.random() * 256,
      )}`;

    const headersss = (): Record<string, string> => ({
      "User-Agent": randomUserAgent(),
      "X-Forwarded-For": randomIP(),
    });

    try {
      let normalized = url.replace("https://vm", "https://vt");
      const headResponse: any = await axios.head(normalized, {
        headers: {
          "Accept-Language": "vi-VN",
          Accept: "*/*",
          Connection: "keep-alive",
          ...headersss(),
        },
        timeout: 10000,
      });

      const responseUrl: string = headResponse.request.res.responseUrl;
      const ID = responseUrl.match(/\d{17,21}/g)?.[0];
      if (!ID) return;

      const optionsResponse: any = await axios.options(_tiktokapi(ID), {
        headers: {
          "Accept-Language": "vi-VN",
          Accept: "*/*",
          Connection: "keep-alive",
          Cookie: "cookie",
          ...headersss(),
        },
        timeout: 10000,
      });

      const content = optionsResponse.data.aweme_list.find((v: any) => v.aweme_id === ID);
      if (!content) {
        try {
          const tikwmResponse = await axios.post(
            "https://tikwm.com/api/",
            {
              url: normalized,
              count: 12,
              cursor: 0,
              web: 1,
              hd: 1,
            },
            {
              headers: {
                accept: "application/json, text/javascript, */*; q=0.01",
                "accept-encoding": "gzip, deflate, br, zstd",
                "accept-language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                cookie: "current_language=en",
                origin: "https://tikwm.com",
                referer: "https://tikwm.com/",
                "sec-ch-ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "user-agent": this.config.browser.userAgent,
                "x-requested-with": "XMLHttpRequest",
              },
            },
          );

          if (tikwmResponse.data.code === 0) {
            const data = tikwmResponse.data.data;
            const baseUrl = "https://tikwm.com";
            const formatNumber2 = (num: number): string =>
              num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            const formatDateTime = (timestamp: number): string => {
              const date = new Date(timestamp * 1000);
              return `${date.getHours().toString().padStart(2, "0")}:${date
                .getMinutes()
                .toString()
                .padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")} | ${date
                  .getDate()
                  .toString()
                  .padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()}`;
            };

            let attachments: any[];
            if (data.images && data.images.length > 0) {
              attachments = data.images.map((imageUrl: string) => ({
                type: "Photo",
                url: imageUrl,
              }));
            } else {
              let videoBuffer: Buffer | null = null;
              try {
                const response = await axios.get(baseUrl + data.play, {
                  responseType: "arraybuffer",
                  headers: {
                    "User-Agent": this.config.browser.userAgent,
                  },
                });
                videoBuffer = Buffer.from(response.data);
              } catch (error) {
                console.error("Error downloading video buffer:", error);
              }

              attachments = [
                {
                  type: "Video",
                  url: baseUrl + data.play,
                  buffer: videoBuffer,
                },
              ];
            }

            return {
              id: data.id,
              message: data.title,
              author: {
                id: data.author.id,
                name: data.author.nickname,
                username: data.author.unique_id,
              },
              stats: {
                views: formatNumber2(data.play_count),
                likes: formatNumber2(data.digg_count),
                comments: formatNumber2(data.comment_count),
                shares: formatNumber2(data.share_count),
                collects: formatNumber2(data.collect_count),
              },
              createTime: formatDateTime(data.create_time),
              music: {
                title: data.music_info.title,
                author: data.music_info.author,
                duration: data.music_info.duration,
                url: data.music_info.play,
              },
              attachments,
            };
          }
          return;
        } catch (error) {
          console.error("TikWM API error:", error);
          return;
        }
      }

      let attachments: any[];
      if (content.image_post_info) {
        attachments = content.image_post_info.images.map((img: any) => ({
          type: "Photo",
          url: img.display_image.url_list[0],
        }));
      } else {
        let videoBuffer: Buffer | null = null;
        try {
          const response = await axios.get(content.video.play_addr.url_list[0], {
            responseType: "arraybuffer",
            headers: headersss(),
          });
          videoBuffer = Buffer.from(response.data);
        } catch (error) {
          console.error("Error downloading video:", error);
        }

        attachments = [
          {
            type: "Video",
            url: content.video.play_addr.url_list[0],
            buffer: videoBuffer,
          },
        ];
      }

      return {
        id: content.aweme_id,
        message: content.desc || "",
        author: {
          id: content.author.uid,
          name: content.author.nickname,
          username: content.author.unique_id,
        },
        stats: {
          views: formatNumber(content.statistics.play_count) || "0",
          likes: formatNumber(content.statistics.digg_count) || "0",
          comments: formatNumber(content.statistics.comment_count) || "0",
          shares: formatNumber(content.statistics.share_count) || "0",
          collects: formatNumber(content.statistics.collect_count) || "0",
        },
        createTime: formatTimestamp(content.create_time),
        music: {
          title: content.music.title,
          author: content.music.author,
          duration: content.music.duration,
          url: content.music.play_url.url_list[0],
        },
        attachments,
      };
    } catch (error) {
      console.error("Error in down3:", error);
      throw error;
    }
  }

  private async parseVideoData(data: any, url: string): Promise<any> {
    if (!data?.itemInfo?.itemStruct) {
      try {
        const tikwmResponse = await this.down3(url);
        console.log("tikwmResponse:", tikwmResponse);
        if (tikwmResponse) {
          return tikwmResponse;
        }
      } catch (error) {
        console.error("Error in video data parsing:", error);
        throw error;
      }
    }
    const video = data.itemInfo.itemStruct;
    const date = new Date(video.createTime * 1000);
    const formatDateTime = (d: Date): string => {
      const time = d.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const dateStr = d.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      return `${time} | ${dateStr}`;
    };
    const formatNumber = (num: number): string =>
      num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const result: any = {
      id: video.id,
      message: video.desc,
      author: {
        id: video.author.id,
        name: video.author.nickname,
        username: video.author.uniqueId,
      },
      stats: {
        views: formatNumber(video.stats.playCount),
        likes: formatNumber(video.stats.diggCount),
        comments: formatNumber(video.stats.commentCount),
        shares: formatNumber(video.stats.shareCount),
        collects: formatNumber(video.stats.collectCount),
      },
      createTime: formatDateTime(date),
      music: video.music
        ? {
          title: video.music.title,
          author: video.music.authorName,
          duration: Math.floor(video.music.duration),
          url: video.music.playUrl,
        }
        : null,
      attachments: [] as any[],
    };
    if (video.imagePost?.images?.length > 0) {
      result.attachments = video.imagePost.images.map((img: any) => ({
        type: "Photo",
        url: img.imageURL.urlList[0],
      }));
    } else {
      const videoBuffer = await this.downloadVideo(video.video);
      result.attachments = [
        {
          type: "Video",
          url: video.video?.downloadAddr || "",
          buffer: videoBuffer,
        },
      ];
    }
    return result;
  }

  private async down2(id: string): Promise<any> {
    try {
      const formatTimestamp = (timestamp: number): string => {
        const date = new Date(timestamp * 1000);
        return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(
          date.getSeconds(),
        ).padStart(2, "0")} | ${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(
          2,
          "0",
        )}/${date.getFullYear()}`;
      };

      const formatNumber = (number: number): string | null =>
        isNaN(number) ? null : number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

      if (!id) return;

      const response = await axios({
        method: "OPTIONS",
        url: "https://api22-normal-c-alisg.tiktokv.com/aweme/v1/feed/",
        headers: {
          "User-Agent": this.config.browser.userAgent,
          Cookie: "cookie",
          "Accept-Language": "vi-VN",
          Accept: "*/*",
          Connection: "keep-alive",
        },
        params: {
          aweme_id: id,
          iid: "7318518857994389254",
          device_id: "7318517321748022790",
          channel: "googleplay",
          app_name: "musical_ly",
          version_code: "300904",
          device_platform: "android",
          device_type: "ASUS_Z01QD",
          version: "9",
        },
      });

      const data = (response.data as any)?.aweme_list?.[0];
      if (!data) return;

      const attachments: any[] = [];
      if (data.video?.bit_rate?.[0]?.play_addr?.url_list?.[0]) {
        attachments.push({
          type: "Video",
          url: data.video.bit_rate[0].play_addr.url_list[0],
        });
      } else if (data.image_post_info?.images?.length) {
        attachments.push(
          ...data.image_post_info.images.map((v: any) => ({
            type: "Photo",
            url: v.display_image.url_list[0],
          })),
        );
      }

      return {
        id: data.aweme_id,
        message: data.desc,
        author: {
          id: data.author.uid,
          nickname: data.author.nickname,
          username: data.author.unique_id,
        },
        views: formatNumber(data.statistics.play_count) || 0,
        likes: formatNumber(data.statistics.digg_count) || 0,
        comments: formatNumber(data.statistics.comment_count) || 0,
        shares: formatNumber(data.statistics.share_count) || 0,
        collects: formatNumber(data.statistics.collect_count) || 0,
        createTime: formatTimestamp(data.create_time),
        music: {
          title: data.music.title,
          author: data.music.author,
          duration: data.music.duration,
          url: data.music.play_url.url_list[0],
        },
        attachments,
      };
    } catch (error) {
      try {
        const tikwmResponse = await axios.post(
          "https://tikwm.com/api/",
          {
            url: id,
            count: 12,
            cursor: 0,
            web: 1,
            hd: 1,
          },
          {
            headers: {
              accept: "application/json, text/javascript, */*; q=0.01",
              "accept-encoding": "gzip, deflate, br, zstd",
              "accept-language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
              "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
              cookie: "current_language=en",
              origin: "https://tikwm.com",
              referer: "https://tikwm.com/",
              "sec-ch-ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
              "sec-ch-ua-mobile": "?0",
              "sec-ch-ua-platform": '"Windows"',
              "sec-fetch-dest": "empty",
              "sec-fetch-mode": "cors",
              "sec-fetch-site": "same-origin",
              "user-agent": this.config.browser.userAgent,
              "x-requested-with": "XMLHttpRequest",
            },
          },
        );

        if (tikwmResponse.data.code === 0) {
          const data = tikwmResponse.data.data;
          const baseUrl = "https://tikwm.com";
          const formatNumber2 = (num: number): string =>
            num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
          const formatDateTime = (timestamp: number): string => {
            const date = new Date(timestamp * 1000);
            return `${date.getHours().toString().padStart(2, "0")}:${date
              .getMinutes()
              .toString()
              .padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")} | ${date
                .getDate()
                .toString()
                .padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()}`;
          };

          let attachments: any[];
          if (data.images && data.images.length > 0) {
            attachments = data.images.map((imageUrl: string) => ({
              type: "Photo",
              url: imageUrl,
            }));
          } else {
            let videoBuffer: Buffer | null = null;
            try {
              const response = await axios.get(baseUrl + data.play, {
                responseType: "arraybuffer",
                headers: {
                  "User-Agent": this.config.browser.userAgent,
                },
              });
              videoBuffer = Buffer.from(response.data);
            } catch (error2) {
              console.error("Error downloading video buffer:", error2);
            }

            attachments = [
              {
                type: "Video",
                url: baseUrl + data.play,
                buffer: videoBuffer,
              },
            ];
          }

          return {
            id: data.id,
            message: data.title,
            author: {
              id: data.author.id,
              name: data.author.nickname,
              username: data.author.unique_id,
            },
            stats: {
              views: formatNumber2(data.play_count),
              likes: formatNumber2(data.digg_count),
              comments: formatNumber2(data.comment_count),
              shares: formatNumber2(data.share_count),
              collects: formatNumber2(data.collect_count),
            },
            createTime: formatDateTime(data.create_time),
            music: {
              title: data.music_info.title,
              author: data.music_info.author,
              duration: data.music_info.duration,
              url: data.music_info.play,
            },
            attachments,
          };
        }
      } catch (e) {
        console.log(e);
      }
    }
  }

  private async downloadVideo(video: any): Promise<Buffer | null> {
    let buffer: Buffer | null = null;
    const videoUrl: string = video?.bitrateInfo?.[0]?.PlayAddr?.UrlList?.[2] || "";
    if (videoUrl) {
      try {
        const jar = new CookieJar();
        const client = axios.create({
          jar,
          withCredentials: true,
          headers: {
            "User-Agent": this.config.browser.userAgent,
          } as any,
        }) as any;
        wrapper(client);
        const response = await client.get(videoUrl, {
          responseType: "arraybuffer",
          headers: {
            Referer: videoUrl,
            Range: "bytes=0-",
          },
        });
        if (response.status === 200 || response.status === 206) {
          buffer = Buffer.from(response.data);
        } else {
          console.warn(`Failed to download video. Status: ${response.status}`);
        }
      } catch (error: any) {
        console.error("Error downloading video:", error instanceof Error ? error.message : String(error));
        if (error?.response?.status) {
          console.error(`Video Download Status Code: ${error.response.status}`);
        }
      }
    }
    return buffer;
  }

  async info(username: string): Promise<any> {
    return this.get({
      url: "/api/user/detail/",
      params: {
        WebIdLastTime: "1757586782",
        abTestVersion: "[object Object]",
        aid: "1988",
        appType: "t",
        app_language: "vi-VN",
        app_name: "tiktok_web",
        browser_language: "vi",
        browser_name: "Mozilla",
        browser_online: "true",
        browser_platform: "Win32",
        browser_version:
          "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        channel: "tiktok_web",
        cookie_enabled: "true",
        data_collection_enabled: "true",
        device_id: "7548777726381213204",
        device_platform: "web_pc",
        focus_state: "true",
        from_page: "user",
        history_len: "3",
        is_fullscreen: "false",
        is_page_visible: "true",
        language: "vi-VN",
        locateItemID: "7577670561262734599",
        needAudienceControl: "true",
        odinId: "7417278024788280325",
        os: "windows",
        priority_region: "VN",
        referer: "https://www.tiktok.com/",
        region: "VN",
        root_referer: "https://www.tiktok.com/",
        screen_height: "1080",
        screen_width: "1920",
        secUid: "",
        tz_name: "Asia/Saigon",
        uniqueId: username,
        user: "[object Object]",
        user_is_login: "true",
        verifyFp: "verify_mim2sfj7_tC2PDCnK_jq8W_4fCg_AINc_v9r814jggD4X",
        webcast_language: "vi-VN",
        msToken: this.msToken,
      },
    }).then((data: any) => {
      if (data.status_code !== 0) throw new Error(data.message || "Failed to get user detail");
      return data.userInfo;
    });
  }

  async post(username: string, count = 16): Promise<any[]> {
    const {
      user: { secUid },
    } = await this.info(username);
    return this.get({
      url: "/api/post/item_list/",
      params: {
        WebIdLastTime: "1757586782",
        aid: "1988",
        app_language: "vi-VN",
        app_name: "tiktok_web",
        browser_language: "vi",
        browser_name: "Mozilla",
        browser_online: "true",
        browser_platform: "Win32",
        browser_version:
          "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        channel: "tiktok_web",
        clientABVersions: "70508271,72437276,73720541,74444735,74446914,74534792,74627577,74744617,74757744,74780477,74782564,74808329,74852656,74860161,74879786,74891662,74902366,74905391,74907602,74926161,74928116,74935709,74936936,74950637,74961019,74970061,74970253,74973672,74976255,74983394,74983937,74987203,74992875,74994853,74998869,75001423,75005877,75011045,75026334,75041559,75045553,70138197,70156809,70405643,71057832,71200802,71381811,71516509,71803300,71962127,72360691,72408100,72854054,72892778,73004916,73171280,73208420,73952802,73952825,73989921,74276218,74844724",
        cookie_enabled: "true",
        count,
        coverFormat: "2",
        cursor: 0,
        data_collection_enabled: "true",
        device_id: "7548777726381213204",
        device_platform: "web_pc",
        enable_cache: "false",
        focus_state: "true",
        from_page: "user",
        history_len: "3",
        is_fullscreen: "false",
        is_page_visible: "true",
        language: "vi-VN",
        locate_item_id: "7577670561262734599",
        needPinnedItemIds: "true",
        odinId: "7417278024788280325",
        os: "windows",
        post_item_list_request_type: "0",
        priority_region: "VN",
        referer: "https://www.tiktok.com/",
        region: "VN",
        root_referer: "https://www.tiktok.com/",
        screen_height: "1080",
        screen_width: "1920",
        secUid,
        tz_name: "Asia/Saigon",
        user_is_login: "true",
        verifyFp: "verify_mim2sfj7_tC2PDCnK_jq8W_4fCg_AINc_v9r814jggD4X",
        video_encoding: "mp4",
        webcast_language: "vi-VN",
        msToken: this.msToken,
      },
    }).then(async (data: any) => {
      if (data.status_code !== 0) throw new Error(data.message || "Failed to get item list");
      const result = data.itemList.map(async (item: any) => {
        const {
          id,
          desc: title,
          author: { nickname, uniqueId: unique_id },
          createTime: create_time,
          stats: { collectCount, commentCount, diggCount, playCount, shareCount },
          music: { title: musicTitle, duration: musicDuration, playUrl: musicUrl, authorName: musicAuthor },
          imagePost,
          video,
        } = item;
        const formattedStats = {
          collectCount: this.formatNumber(collectCount) || 0,
          commentCount: this.formatNumber(commentCount) || 0,
          diggCount: this.formatNumber(diggCount) || 0,
          playCount: this.formatNumber(playCount) || 0,
          shareCount: this.formatNumber(shareCount) || 0,
        };
        const music = {
          type: "Audio",
          title: musicTitle,
          duration: musicDuration,
          url: musicUrl,
          author: musicAuthor,
        };
        let vdbuffer: Buffer | undefined;
        const videoUrlToDownload: string = video?.bitrateInfo?.[0]?.PlayAddr?.UrlList?.[2] || "";
        if (videoUrlToDownload) {
          try {
            const jar = new CookieJar();
            const apiClient = axios.create({
              jar,
              withCredentials: true,
              headers: {
                "User-Agent": this.config.browser.userAgent,
              } as any,
            }) as any;
            wrapper(apiClient);
            const videoResponse = await apiClient.get(videoUrlToDownload, {
              responseType: "arraybuffer",
              headers: {
                Referer: videoUrlToDownload,
                Range: "bytes=0-",
              },
            });
            if (videoResponse.status === 200 || videoResponse.status === 206) {
              vdbuffer = Buffer.from(videoResponse.data);
            } else {
              console.warn(`Failed to download video. Status: ${videoResponse.status}`);
            }
          } catch (videoError: any) {
            console.error(`Error downloading video: ${videoError.message}`);
            if (videoError.response) {
              console.error(`Video Download Status Code: ${videoError.response.status}`);
            }
          }
        }
        return {
          type: imagePost ? "Photo" : "Video",
          id,
          title,
          nickname,
          unique_id,
          create_at: this.formatTimestamp(create_time),
          commentCount: formattedStats.commentCount,
          likeCount: formattedStats.diggCount,
          playCount: formattedStats.playCount,
          shareCount: formattedStats.shareCount,
          collectCount: formattedStats.collectCount,
          ...(imagePost
            ? {
              thumb: imagePost.images.map((v: any) => v.imageURL.urlList[0]),
              url: imagePost.images.map((v: any) => v.imageURL.urlList[0]),
            }
            : video
              ? {
                thumb: video.cover,
                play: video?.bitrateInfo?.[0]?.PlayAddr?.UrlList?.[2],
                vdbuffer,
              }
              : {}),
          music,
        };
      });
      return Promise.all(result);
    });
  }

  async search(keyword: string, limit = 10): Promise<any[]> {
    return this.get({
      url: "/api/search/general/full/",
      params: {
        WebIdLastTime: "1757586782",
        aid: "1988",
        app_language: "vi-VN",
        app_name: "tiktok_web",
        browser_language: "vi",
        browser_name: "Mozilla",
        browser_online: "true",
        browser_platform: "Win32",
        browser_version:
          "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        channel: "tiktok_web",
        client_ab_versions: "70508271,72437276,73720541,74444735,74446914,74534792,74627577,74744617,74757744,74780477,74782564,74808329,74852656,74860161,74879786,74891662,74902366,74905391,74907602,74926161,74928116,74935709,74936936,74950637,74961019,74970061,74970253,74973672,74976255,74983394,74983937,74987203,74992875,74994853,74998869,75001423,75005877,75011045,75026334,75041559,75045553,70138197,70156809,70405643,71057832,71200802,71381811,71516509,71803300,71962127,72360691,72408100,72854054,72892778,73004916,73171280,73208420,73952802,73952825,73989921,74276218,74844724",
        cookie_enabled: "true",
        count: "12",
        data_collection_enabled: "true",
        device_id: "7548777726381213204",
        device_platform: "web_pc",
        device_type: "web_h265",
        focus_state: "true",
        from_page: "search",
        history_len: "4",
        is_fullscreen: "false",
        is_page_visible: "true",
        keyword,
        odinId: "7417278024788280325",
        offset: "0",
        os: "windows",
        priority_region: "VN",
        referer: "https://www.tiktok.com/",
        region: "VN",
        root_referer: "https://www.tiktok.com/",
        screen_height: "1080",
        screen_width: "1920",
        search_source: "recom_search",
        tz_name: "Asia/Saigon",
        user_is_login: "true",
        verifyFp: "verify_mim2sfj7_tC2PDCnK_jq8W_4fCg_AINc_v9r814jggD4X",
        web_search_code:
          '{"tiktok":{"client_params_x":{"search_engine":{"ies_mt_user_live_video_card_use_libra":1,"mt_search_general_user_live_card":1}},"search_server":{}}}',
        webcast_language: "vi-VN",
        msToken: this.msToken,
      },
    }).then((data: any) => {
      if (data.status_code !== 0) throw new Error(data.message || "Failed to search");
      const result = data.data
        .filter((item: any) => item.type === 1)
        .slice(0, limit)
        .map((item: any) => ({
          id: item.item.id,
          desc: item.item.desc,
          createTime: item.item.createTime,
          stats: item.item.stats,
          video: item.item.video,
          author: item.item.author,
          music: item.item.music,
        }));
      return result;
    });
  }

  async download(url: string): Promise<any> {
    const videoId = await this.parseVideoUrl(url);
    if (!videoId) return;
    if (isNaN(Number(videoId))) return;
    return this.get({
      url: "/api/item/detail/",
      params: {
        WebIdLastTime: "1757586782",
        aid: "1988",
        app_language: "vi-VN",
        app_name: "tiktok_web",
        browser_language: "vi",
        browser_name: "Mozilla",
        browser_online: "true",
        browser_platform: "Win32",
        browser_version:
          "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        channel: "tiktok_web",
        clientABVersions: [
          "70508271", "72437276", "73720541", "74444735", "74446914", "74534792",
          "74627577", "74744617", "74757744", "74780477", "74782564", "74808329",
          "74852656", "74860161", "74879786", "74891662", "74902366", "74905391",
          "74907602", "74926161", "74928116", "74935709", "74936936", "74950637",
          "74961019", "74970061", "74970253", "74973672", "74976255", "74983394",
          "74983937", "74987203", "74992875", "74994853", "74998869", "75001423",
          "75005877", "75011045", "75026334", "75041559", "75045553", "70138197",
          "70156809", "70405643", "71057832", "71200802", "71381811", "71516509",
          "71803300", "71962127", "72360691", "72408100", "72854054", "72892778",
          "73004916", "73171280", "73208420", "73952802", "73952825", "73989921",
          "74276218", "74844724", "73675307"
        ],
        cookie_enabled: "true",
        coverFormat: "2",
        data_collection_enabled: "true",
        device_id: "7548777726381213204",
        device_platform: "web_pc",
        focus_state: "true",
        from_page: "video",
        history_len: "6",
        is_fullscreen: "false",
        is_page_visible: "true",
        itemId: videoId,
        language: "vi-VN",
        odinId: "7417278024788280325",
        os: "windows",
        priority_region: "VN",
        referer: "https://www.tiktok.com/",
        region: "VN",
        root_referer: "https://www.tiktok.com/",
        screen_height: "1080",
        screen_width: "1920",
        tz_name: "Asia/Saigon",
        user_is_login: "true",
        verifyFp: "verify_mim2sfj7_tC2PDCnK_jq8W_4fCg_AINc_v9r814jggD4X",
        video_encoding: "mp4",
        webcast_language: "vi-VN",
        msToken: this.msToken,
      },
    })
      .then((data: any) => {
        if (data.status_code !== 0) throw new Error(data.message || "Failed to get item detail");
        return this.parseVideoData(data, url);
      })
      .catch(async (err: any) => {
        try {
          const down3Result = await this.down3(url);
          if (down3Result) {
            return down3Result;
          }
          try {
            const tikwmResponse = await axios.post(
              "https://tikwm.com/api/",
              {
                url,
                count: 12,
                cursor: 0,
                web: 1,
                hd: 1,
              },
              {
                headers: {
                  accept: "application/json, text/javascript, */*; q=0.01",
                  "accept-encoding": "gzip, deflate, br, zstd",
                  "accept-language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
                  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                  cookie: "current_language=en",
                  origin: "https://tikwm.com",
                  referer: "https://tikwm.com/",
                  "sec-ch-ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
                  "sec-ch-ua-mobile": "?0",
                  "sec-ch-ua-platform": '"Windows"',
                  "sec-fetch-dest": "empty",
                  "sec-fetch-mode": "cors",
                  "sec-fetch-site": "same-origin",
                  "user-agent": this.config.browser.userAgent,
                  "x-requested-with": "XMLHttpRequest",
                },
              },
            );

            if (tikwmResponse.data.code === 0) {
              const data = tikwmResponse.data.data;
              const baseUrl = "https://tikwm.com";
              const formatNumber2 = (num: number): string =>
                num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
              const formatDateTime = (timestamp: number): string => {
                const date = new Date(timestamp * 1000);
                return `${date.getHours().toString().padStart(2, "0")}:${date
                  .getMinutes()
                  .toString()
                  .padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")} | ${date
                    .getDate()
                    .toString()
                    .padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()}`;
              };

              let attachments: any[];
              if (data.images && data.images.length > 0) {
                attachments = data.images.map((imageUrl: string) => ({
                  type: "Photo",
                  url: imageUrl,
                }));
              } else {
                let videoBuffer: Buffer | null = null;
                try {
                  const response = await axios.get(baseUrl + data.play, {
                    responseType: "arraybuffer",
                    headers: {
                      "User-Agent": this.config.browser.userAgent,
                    },
                  });
                  videoBuffer = Buffer.from(response.data);
                } catch (error2) {
                  console.error("Error downloading video buffer:", error2);
                }

                attachments = [
                  {
                    type: "Video",
                    url: baseUrl + data.play,
                    buffer: videoBuffer,
                  },
                ];
              }

              return {
                id: data.id,
                message: data.title,
                author: {
                  id: data.author.id,
                  name: data.author.nickname,
                  username: data.author.unique_id,
                },
                stats: {
                  views: formatNumber2(data.play_count),
                  likes: formatNumber2(data.digg_count),
                  comments: formatNumber2(data.comment_count),
                  shares: formatNumber2(data.share_count),
                  collects: formatNumber2(data.collect_count),
                },
                createTime: formatDateTime(data.create_time),
                music: {
                  title: data.music_info.title,
                  author: data.music_info.author,
                  duration: data.music_info.duration,
                  url: data.music_info.play,
                },
                attachments,
              };
            }
            return;
          } catch (error2) {
            console.error("TikWM API error:", error2);
            return;
          }
        } catch (down3Error) {
          console.error("Error using down3:", down3Error);
          throw err;
        }
      });
  }

  async infov2(user: string): Promise<any> {
    try {
      const { data } = await axios.get(`https://tiktok.com/@${user}`, {
        headers: {
          "User-Agent": "PostmanRuntime/7.32.2",
        },
      });
      const $ = cheerio.load(data);
      const dats = $("#__UNIVERSAL_DATA_FOR_REHYDRATION__").text();
      const result = JSON.parse(dats);
      if (result["__DEFAULT_SCOPE__"]["webapp.user-detail"].statusCode !== 0) {
        return {
          status: "error",
          message: "User not found!",
        };
      }
      return result["__DEFAULT_SCOPE__"]["webapp.user-detail"]["userInfo"];
    } catch (err) {
      return String(err);
    }
  }

  async commentPost({ aweme_id, text }: { aweme_id: string; text: string }): Promise<any> {
    await this.client.head("https://www.tiktok.com/api/comment/publish/");
    const params: Record<string, string> = {
      WebIdLastTime: "1757586782",
      aid: "1988",
      app_language: "vi-VN",
      app_name: "tiktok_web",
      aweme_id,
      browser_language: "vi",
      browser_name: "Mozilla",
      browser_online: "true",
      browser_platform: "Win32",
      browser_version: encodeURIComponent(this.config.browser.userAgent),
      channel: "tiktok_web",
      cookie_enabled: "true",
      data_collection_enabled: "true",
      device_id: "7548777726381213204",
      device_platform: "web_pc",
      focus_state: "true",
      from_page: "video",
      history_len: "5",
      is_fullscreen: "false",
      is_page_visible: "true",
      odinId: "7417278024788280325",
      os: "windows",
      priority_region: "VN",
      referer: "",
      region: "VN",
      screen_height: "1080",
      screen_width: "1920",
      text: encodeURIComponent(text),
      text_extra: "[]",
      tz_name: "Asia/Saigon",
      user_is_login: "true",
      verifyFp: "verify_mhervs9l_3wnH6CnT_cW5Q_4dqw_8jPt_G9DfRJDCPkSG",
      webcast_language: "vi-VN",
      msToken: this.msToken,
    };
    const url = "/api/comment/publish/";
    const signedUrl = this.signParams({ url, params });
    console.log(signedUrl);
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      ...this.client.defaults.headers,
    } as any;
    const res = await this.httpPost(signedUrl, {}, headers);
    return res;
  }

  async fetchShopProductData(productId: string, sellerId: string, userId: string): Promise<any> {
    const body = {
      getProductCategoryInfoSchema: { categoryIdList: ["604206", "860296", "963080"] },
      getPdpRelatedKwSchema: { product_id: productId, traffic_type: 0 },
      getProductsForComponentListSchema: [
        {
          productComponent: 1,
          count: 4,
          product_info: { product_id: productId, seller_id: sellerId },
          page_url: `http://www.tiktok.com/view/product/${productId}?_svg=1&checksum=178741ec8526a3fd1b0d9a5d20a2ff89ec05c2c4a707b90a7b46691b725bfa60&encode_params=MIIBUQQMfb6EaApLSG-Etk1KBIIBLekCEPstwjGUJM8wMtnPXxt8Txljp4r93gf1oneEVLAtotCxvQqEj3k982fNVTa3Lc-q4mR0Ar1O5IuZ3MxARoA44gQYy03FnF2PBh0RZKjV3kdbvWVyS3Gv_rqjsTzNoWWsjKTIXZxbpmFgSvahIPLiGbnLqrVM0yA1UQlAzISvsyjX2H3oLNLCIbdgoyuPVqMJ6t969D8BE3MtThOqZJyMkFA9ijxhkFj1wYc2Yys-647gYDNkOR74NV1FiWIPebFivh9tpK2lR-HogW39ZTdSWKwHsiJ0uUADyKP_Okov9tdVuuYSSjIwobPy7LjPdf9M3WwwZc4t6sgldAnU8ZA1pJLjyX5jscJ0GGyZe-EWpXY46jBbemACeJkyDrJkHc3U3VtNpOQyRRlPm4YEEDLSla0YZ_0nM88ap3eDPFY%3D&og_info=%7B%22title%22%3A%22%C4%90%E1%BB%93+Ch%C6%A1i+B%E1%BA%Afn+B%C3%B3ng+Kh%E1%BB%A7ng+Long+T%C3%ADnh+%C4%90i%E1%BB%83m++Gi%E1%BA%A3i+Tr%C3%AD+Gi%E1%BA%A3m+C%C4%83ng+Th%E1%BA%B3ng+X%E1%BA%A3+Stress%22%2C%22image%22%3A%22https%3A%5C%2F%5C%2Fp16-oec-sg.ibyteimg.com%5C%2Ftos-alisg-i-aphluv4xwc-sg%5C%2F%5C%2F%5C%2F%252e%252e%5C%2F%2536%2533%2538%2535%2537%2531%2533%2539%2537%2564%2531%2564%2534%2535%2535%2533%2538%2561%2563%2563%2563%2536%2534%2535%2561%2566%2535%2565%2533%2535%2565%2530%257etplv-aphluv4xwc-origin-jpeg.%256a%2570%2565%2567%3F%253f~tplv-aphluv4xwc-resize-webp%3A260%3A260.webp%3Fdr%3D15582%26t%3D555f072d%26ps%3D933b5bde%26shp%3D7745054a%26shcp%3D9b759fb9%26idc%3Dmy%26from%3D2001012042%22%7D&sec_user_id=MS4wLjABAAAAaOM3qEt0xZb2MaTHKac5t0pvMgFykro_ZlwVMFMw25ZAwcI0werqjIJYEUQtftlU&share_app_id=1180&share_link_id=1770D076-2910-4AFB-A6C6-56FB767494A9&social_share_type=15&timestamp=1761983762&trackParams=%7B%22traffic_source_list%22%3A%5B6%5D%2C%22enter_from_info%22%3A%22product_share_outside%22%2C%22source_page_type%22%3A%22product_share%22%2C%22traffic_source%22%3A6%2C%22device_id%22%3A%227526535460639344134%22%2C%22enable_shop_tab_popup%22%3A1%7D&tt_from=copy&u_code=E0K%3AK6%3A4EH42DI&ug_btm=b0482%2Cb6661&unique_id=toladtai&user_id=7076016055035413506&utm_campaign=client_share&utm_medium=ios&utm_source=copy`,
        },
        {
          productComponent: 2,
          count: 4,
          exclude_product_ids: [],
          product_info: { product_id: productId, seller_id: sellerId },
          page_url: `http://www.tiktok.com/view/product/${productId}?_svg=1&checksum=178741ec8526a3fd1b0d9a5d20a2ff89ec05c2c4a707b90a7b46691b725bfa60&encode_params=MIIBUQQMfb6EaApLSG-Etk1KBIIBLekCEPstwjGUJM8wMtnPXxt8Txljp4r93gf1oneEVLAtotCxvQqEj3k982fNVTa3Lc-q4mR0Ar1O5IuZ3MxARoA44gQYy03FnF2PBh0RZKjV3kdbvWVyS3Gv_rqjsTzNoWWsjKTIXZxbpmFgSvahIPLiGbnLqrVM0yA1UQlAzISvsyjX2H3oLNLCIbdgoyuPVqMJ6t969D8BE3MtThOqZJyMkFA9ijxhkFj1wYc2Yys-647gYDNkOR74NV1FiWIPebFivh9tpK2lR-HogW39ZTdSWKwHsiJ0uUADyKP_Okov9tdVuuYSSjIwobPy7LjPdf9M3WwwZc4t6sgldAnU8ZA1pJLjyX5jscJ0GGyZe-EWpXY46jBbemACeJkyDrJkHc3U3VtNpOQyRRlPm4YEEDLSla0YZ_0nM88ap3eDPFY%3D&og_info=%7B%22title%22%3A%22%C4%90%E1%BB%93+Ch%C6%A1i+B%E1%BA%Afn+B%C3%B3ng+Kh%E1%BB%A7ng+Long+T%C3%ADnh+%C4%90i%E1%BB%83m++Gi%E1%BA%A3i+Tr%C3%AD+Gi%E1%BA%A3m+C%C4%83ng+Th%E1%BA%B3ng+X%E1%BA%A3+Stress%22%2C%22image%22%3A%22https%3A%5C%2F%5C%2Fp16-oec-sg.ibyteimg.com%5C%2Ftos-alisg-i-aphluv4xwc-sg%5C%2F%5C%2F%5C%2F%252e%252e%5C%2F%2536%2533%2538%2535%2537%2531%2533%2539%2537%2564%2531%2564%2534%2535%2535%2533%2538%2561%2563%2563%2563%2536%2534%2535%2561%2566%2535%2565%2533%2535%2565%2530%257etplv-aphluv4xwc-origin-jpeg.%256a%2570%2565%2567%3F%253f~tplv-aphluv4xwc-resize-webp%3A260%3A260.webp%3Fdr%3D15582%26t%3D555f072d%26ps%3D933b5bde%26shp%3D7745054a%26shcp%3D9b759fb9%26idc%3Dmy%26from%3D2001012042%22%7D&sec_user_id=MS4wLjABAAAAaOM3qEt0xZb2MaTHKac5t0pvMgFykro_ZlwVMFMw25ZAwcI0werqjIJYEUQtftlU&share_app_id=1180&share_link_id=1770D076-2910-4AFB-A6C6-56FB767494A9&social_share_type=15&timestamp=1761983762&trackParams=%7B%22traffic_source_list%22%3A%5B6%5D%2C%22enter_from_info%22%3A%22product_share_outside%22%2C%22source_page_type%22%3A%22product_share%22%2C%22traffic_source%22%3A6%2C%22device_id%22%3A%227526535460639344134%22%2C%22enable_shop_tab_popup%22%3A1%7D&tt_from=copy&u_code=E0K%3AK6%3A4EH42DI&ug_btm=b0482%2Cb6661&unique_id=toladtai&user_id=7076016055035413506&utm_campaign=client_share&utm_medium=ios&utm_source=copy`,
        },
        {
          productComponent: 3,
          count: 10,
          product_info: { product_id: productId, seller_id: sellerId },
          page_url: `http://www.tiktok.com/view/product/${productId}?_svg=1&checksum=178741ec8526a3fd1b0d9a5d20a2ff89ec05c2c4a707b90a7b46691b725bfa60&encode_params=MIIBUQQMfb6EaApLSG-Etk1KBIIBLekCEPstwjGUJM8wMtnPXxt8Txljp4r93gf1oneEVLAtotCxvQqEj3k982fNVTa3Lc-q4mR0Ar1O5IuZ3MxARoA44gQYy03FnF2PBh0RZKjV3kdbvWVyS3Gv_rqjsTzNoWWsjKTIXZxbpmFgSvahIPLiGbnLqrVM0yA1UQlAzISvsyjX2H3oLNLCIbdgoyuPVqMJ6t969D8BE3MtThOqZJyMkFA9ijxhkFj1wYc2Yys-647gYDNkOR74NV1FiWIPebFivh9tpK2lR-HogW39ZTdSWKwHsiJ0uUADyKP_Okov9tdVuuYSSjIwobPy7LjPdf9M3WwwZc4t6sgldAnU8ZA1pJLjyX5jscJ0GGyZe-EWpXY46jBbemACeJkyDrJkHc3U3VtNpOQyRRlPm4YEEDLSla0YZ_0nM88ap3eDPFY%3D&og_info=%7B%22title%22%3A%22%C4%90%E1%BB%93+Ch%C6%A1i+B%E1%BA%Afn+B%C3%B3ng+Kh%E1%BB%A7ng+Long+T%C3%ADnh+%C4%90i%E1%BB%83m++Gi%E1%BA%A3i+Tr%C3%AD+Gi%E1%BA%A3m+C%C4%83ng+Th%E1%BA%B3ng+X%E1%BA%A3+Stress%22%2C%22image%22%3A%22https%3A%5C%2F%5C%2Fp16-oec-sg.ibyteimg.com%5C%2Ftos-alisg-i-aphluv4xwc-sg%5C%2F%5C%2F%5C%2F%252e%252e%5C%2F%2536%2533%2538%2535%2537%2531%2533%2539%2537%2564%2531%2564%2534%2535%2535%2533%2538%2561%2563%2563%2563%2536%2534%2535%2561%2566%2535%2565%2533%2535%2565%2530%257etplv-aphluv4xwc-origin-jpeg.%256a%2570%2565%2567%3F%253f~tplv-aphluv4xwc-resize-webp%3A260%3A260.webp%3Fdr%3D15582%26t%3D555f072d%26ps%3D933b5bde%26shp%3D7745054a%26shcp%3D9b759fb9%26idc%3Dmy%26from%3D2001012042%22%7D&sec_user_id=MS4wLjABAAAAaOM3qEt0xZb2MaTHKac5t0pvMgFykro_ZlwVMFMw25ZAwcI0werqjIJYEUQtftlU&share_app_id=1180&share_link_id=1770D076-2910-4AFB-A6C6-56FB767494A9&social_share_type=15&timestamp=1761983762&trackParams=%7B%22traffic_source_list%22%3A%5B6%5D%2C%22enter_from_info%22%3A%22product_share_outside%22%2C%22source_page_type%22%3A%22product_share%22%2C%22traffic_source%22%3A6%2C%22device_id%22%3A%227526535460639344134%22%2C%22enable_shop_tab_popup%22%3A1%7D&tt_from=copy&u_code=E0K%3AK6%3A4EH42DI&ug_btm=b0482%2Cb6661&unique_id=toladtai&user_id=7076016055035413506&utm_campaign=client_share&utm_medium=ios&utm_source=copy`,
        },
        {
          productComponent: 4,
          count: 10,
          product_info: { product_id: productId, seller_id: sellerId },
          page_url: `http://www.tiktok.com/view/product/${productId}?_svg=1&checksum=178741ec8526a3fd1b0d9a5d20a2ff89ec05c2c4a707b90a7b46691b725bfa60&encode_params=MIIBUQQMfb6EaApLSG-Etk1KBIIBLekCEPstwjGUJM8wMtnPXxt8Txljp4r93gf1oneEVLAtotCxvQqEj3k982fNVTa3Lc-q4mR0Ar1O5IuZ3MxARoA44gQYy03FnF2PBh0RZKjV3kdbvWVyS3Gv_rqjsTzNoWWsjKTIXZxbpmFgSvahIPLiGbnLqrVM0yA1UQlAzISvsyjX2H3oLNLCIbdgoyuPVqMJ6t969D8BE3MtThOqZJyMkFA9ijxhkFj1wYc2Yys-647gYDNkOR74NV1FiWIPebFivh9tpK2lR-HogW39ZTdSWKwHsiJ0uUADyKP_Okov9tdVuuYSSjIwobPy7LjPdf9M3WwwZc4t6sgldAnU8ZA1pJLjyX5jscJ0GGyZe-EWpXY46jBbemACeJkyDrJkHc3U3VtNpOQyRRlPm4YEEDLSla0YZ_0nM88ap3eDPFY%3D&og_info=%7B%22title%22%3A%22%C4%90%E1%BB%93+Ch%C6%A1i+B%E1%BA%Afn+B%C3%B3ng+Kh%E1%BB%A7ng+Long+T%C3%ADnh+%C4%90i%E1%BB%83m++Gi%E1%BA%A3i+Tr%C3%AD+Gi%E1%BA%A3m+C%C4%83ng+Th%E1%BA%B3ng+X%E1%BA%A3+Stress%22%2C%22image%22%3A%22https%3A%5C%2F%5C%2Fp16-oec-sg.ibyteimg.com%5C%2Ftos-alisg-i-aphluv4xwc-sg%5C%2F%5C%2F%5C%2F%252e%252e%5C%2F%2536%2533%2538%2535%2537%2531%2533%2539%2537%2564%2531%2564%2534%2535%2535%2533%2538%2561%2563%2563%2563%2536%2534%2535%2561%2566%2535%2565%2533%2535%2565%2530%257etplv-aphluv4xwc-origin-jpeg.%256a%2570%2565%2567%3F%253f~tplv-aphluv4xwc-resize-webp%3A260%3A260.webp%3Fdr%3D15582%26t%3D555f072d%26ps%3D933b5bde%26shp%3D7745054a%26shcp%3D9b759fb9%26idc%3Dmy%26from%3D2001012042%22%7D&sec_user_id=MS4wLjABAAAAaOM3qEt0xZb2MaTHKac5t0pvMgFykro_ZlwVMFMw25ZAwcI0werqjIJYEUQtftlU&share_app_id=1180&share_link_id=1770D076-2910-4AFB-A6C6-56FB767494A9&social_share_type=15&timestamp=1761983762&trackParams=%7B%22traffic_source_list%22%3A%5B6%5D%2C%22enter_from_info%22%3A%22product_share_outside%22%2C%22source_page_type%22%3A%22product_share%22%2C%22traffic_source%22%3A6%2C%22device_id%22%3A%227526535460639344134%22%2C%22enable_shop_tab_popup%22%3A1%7D&tt_from=copy&u_code=E0K%3AK6%3A4EH42DI&ug_btm=b0482%2Cb6661&unique_id=toladtai&user_id=7076016055035413506&utm_campaign=client_share&utm_medium=ios&utm_source=copy`,
        },
        {
          productComponent: 5,
          count: 4,
          product_info: { product_id: productId, seller_id: sellerId },
          page_url: `http://www.tiktok.com/view/product/${productId}?_svg=1&checksum=178741ec8526a3fd1b0d9a5d20a2ff89ec05c2c4a707b90a7b46691b725bfa60&encode_params=MIIBUQQMfb6EaApLSG-Etk1KBIIBLekCEPstwjGUJM8wMtnPXxt8Txljp4r93gf1oneEVLAtotCxvQqEj3k982fNVTa3Lc-q4mR0Ar1O5IuZ3MxARoA44gQYy03FnF2PBh0RZKjV3kdbvWVyS3Gv_rqjsTzNoWWsjKTIXZxbpmFgSvahIPLiGbnLqrVM0yA1UQlAzISvsyjX2H3oLNLCIbdgoyuPVqMJ6t969D8BE3MtThOqZJyMkFA9ijxhkFj1wYc2Yys-647gYDNkOR74NV1FiWIPebFivh9tpK2lR-HogW39ZTdSWKwHsiJ0uUADyKP_Okov9tdVuuYSSjIwobPy7LjPdf9M3WwwZc4t6sgldAnU8ZA1pJLjyX5jscJ0GGyZe-EWpXY46jBbemACeJkyDrJkHc3U3VtNpOQyRRlPm4YEEDLSla0YZ_0nM88ap3eDPFY%3D&og_info=%7B%22title%22%3A%22%C4%90%E1%BB%93+Ch%C6%A1i+B%E1%BA%Afn+B%C3%B3ng+Kh%E1%BB%A7ng+Long+T%C3%ADnh+%C4%90i%E1%BB%83m++Gi%E1%BA%A3i+Tr%C3%AD+Gi%E1%BA%A3m+C%C4%83ng+Th%E1%BA%B3ng+X%E1%BA%A3+Stress%22%2C%22image%22%3A%22https%3A%5C%2F%5C%2Fp16-oec-sg.ibyteimg.com%5C%2Ftos-alisg-i-aphluv4xwc-sg%5C%2F%5C%2F%5C%2F%252e%252e%5C%2F%2536%2533%2538%2535%2537%2531%2533%2539%2537%2564%2531%2564%2534%2535%2535%2533%2538%2561%2563%2563%2563%2536%2534%2535%2561%2566%2535%2565%2533%2535%2565%2530%257etplv-aphluv4xwc-origin-jpeg.%256a%2570%2565%2567%3F%253f~tplv-aphluv4xwc-resize-webp%3A260%3A260.webp%3Fdr%3D15582%26t%3D555f072d%26ps%3D933b5bde%26shp%3D7745054a%26shcp%3D9b759fb9%26idc%3Dmy%26from%3D2001012042%22%7D&sec_user_id=MS4wLjABAAAAaOM3qEt0xZb2MaTHKac5t0pvMgFykro_ZlwVMFMw25ZAwcI0werqjIJYEUQtftlU&share_app_id=1180&share_link_id=1770D076-2910-4AFB-A6C6-56FB767494A9&social_share_type=15&timestamp=1761983762&trackParams=%7B%22traffic_source_list%22%3A%5B6%5D%2C%22enter_from_info%22%3A%22product_share_outside%22%2C%22source_page_type%22%3A%22product_share%22%2C%22traffic_source%22%3A6%2C%22device_id%22%3A%227526535460639344134%22%2C%22enable_shop_tab_popup%22%3A1%7D&tt_from=copy&u_code=E0K%3AK6%3A4EH42DI&ug_btm=b0482%2Cb6661&unique_id=toladtai&user_id=7076016055035413506&utm_campaign=client_share&utm_medium=ios&utm_source=copy`,
        },
        {
          productComponent: 6,
          count: 10,
          product_info: { product_id: productId, seller_id: sellerId },
          page_url: `http://www.tiktok.com/view/product/${productId}?_svg=1&checksum=178741ec8526a3fd1b0d9a5d20a2ff89ec05c2c4a707b90a7b46691b725bfa60&encode_params=MIIBUQQMfb6EaApLSG-Etk1KBIIBLekCEPstwjGUJM8wMtnPXxt8Txljp4r93gf1oneEVLAtotCxvQqEj3k982fNVTa3Lc-q4mR0Ar1O5IuZ3MxARoA44gQYy03FnF2PBh0RZKjV3kdbvWVyS3Gv_rqjsTzNoWWsjKTIXZxbpmFgSvahIPLiGbnLqrVM0yA1UQlAzISvsyjX2H3oLNLCIbdgoyuPVqMJ6t969D8BE3MtThOqZJyMkFA9ijxhkFj1wYc2Yys-647gYDNkOR74NV1FiWIPebFivh9tpK2lR-HogW39ZTdSWKwHsiJ0uUADyKP_Okov9tdVuuYSSjIwobPy7LjPdf9M3WwwZc4t6sgldAnU8ZA1pJLjyX5jscJ0GGyZe-EWpXY46jBbemACeJkyDrJkHc3U3VtNpOQyRRlPm4YEEDLSla0YZ_0nM88ap3eDPFY%3D&og_info=%7B%22title%22%3A%22%C4%90%E1%BB%93+Ch%C6%A1i+B%E1%BA%Afn+B%C3%B3ng+Kh%E1%BB%A7ng+Long+T%C3%ADnh+%C4%90i%E1%BB%83m++Gi%E1%BA%A3i+Tr%C3%AD+Gi%E1%BA%A3m+C%C4%83ng+Th%E1%BA%B3ng+X%E1%BA%A3+Stress%22%2C%22image%22%3A%22https%3A%5C%2F%5C%2Fp16-oec-sg.ibyteimg.com%5C%2Ftos-alisg-i-aphluv4xwc-sg%5C%2F%5C%2F%5C%2F%252e%252e%5C%2F%2536%2533%2538%2535%2537%2531%2533%2539%2537%2564%2531%2564%2534%2535%2535%2533%2538%2561%2563%2563%2563%2536%2534%2535%2561%2566%2535%2565%2533%2535%2565%2530%257etplv-aphluv4xwc-origin-jpeg.%256a%2570%2565%2567%3F%253f~tplv-aphluv4xwc-resize-webp%3A260%3A260.webp%3Fdr%3D15582%26t%3D555f072d%26ps%3D933b5bde%26shp%3D7745054a%26shcp%3D9b759fb9%26idc%3Dmy%26from%3D2001012042%22%7D&sec_user_id=MS4wLjABAAAAaOM3qEt0xZb2MaTHKac5t0pvMgFykro_ZlwVMFMw25ZAwcI0werqjIJYEUQtftlU&share_app_id=1180&share_link_id=1770D076-2910-4AFB-A6C6-56FB767494A9&social_share_type=15&timestamp=1761983762&trackParams=%7B%22traffic_source_list%22%3A%5B6%5D%2C%22enter_from_info%22%3A%22product_share_outside%22%2C%22source_page_type%22%3A%22product_share%22%2C%22traffic_source%22%3A6%2C%22device_id%22%3A%227526535460639344134%22%2C%22enable_shop_tab_popup%22%3A1%7D&tt_from=copy&u_code=E0K%3AK6%3A4EH42DI&ug_btm=b0482%2Cb6661&unique_id=toladtai&user_id=7076016055035413506&utm_campaign=client_share&utm_medium=ios&utm_source=copy`,
        },
      ],
      getProductDetailSchema: {
        productId,
        region: "VN",
        userId,
        sellerId,
        securityParams:
          "MIIBUQQMfb6EaApLSG-Etk1KBIIBLekCEPstwjGUJM8wMtnPXxt8Txljp4r93gf1oneEVLAtotCxvQqEj3k982fNVTa3Lc-q4mR0Ar1O5IuZ3MxARoA44gQYy03FnF2PBh0RZKjV3kdbvWVyS3Gv_rqjsTzNoWWsjKTIXZxbpmFgSvahIPLiGbnLqrVM0yA1UQlAzISvsyjX2H3oLNLCIbdgoyuPVqMJ6t969D8BE3MtThOqZJyMkFA9ijxhkFj1wYc2Yys-647gYDNkOR74NV1FiWIPebFivh9tpK2lR-HogW39ZTdSWKwHsiJ0uUADyKP_Okov9tdVuuYSSjIwobPy7LjPdf9M3WwwZc4t6sgldAnU8ZA1pJLjyX5jscJ0GGyZe-EWpXY46jBbemACeJkyDrJkHc3U3VtNpOQyRRlPm4YEEDLSla0YZ_0nM88ap3eDPFY=",
        securityResults: [0],
      },
    };
    const url = "https://www.tiktok.com/api/shop/product/pdp_data";
    const signedUrl = this.signParams({ url });
    console.log(signedUrl);
    return this.httpPost(url, { body }, {
      "content-type": "application/json",
      "user-agent": this.config.browser.userAgent,
    });
  }
}

const client = new TikTokWebClient();
export default client;
