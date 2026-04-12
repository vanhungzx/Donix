import axios, { AxiosInstance } from "axios";
import * as cheerio from "cheerio";

export interface Attachment {
  type: "Video";
  url: string;
}

export interface DownResult {
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
  attachments: Attachment[];
  thumb?: string;
  uploadDate?: string;
}

export class CapcutAPI {
  private cookie: string;
  private client: AxiosInstance;

  constructor(cookie: string) {
    this.cookie = cookie;
    this.client = axios.create({
      timeout: 10000,
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "vi,en;q=0.9",
        "App-Sdk-Version": "48.0.0",
        Appvr: "5.8.0",
        "Content-Type": "application/json",
        Cookie: cookie,
        "Device-Time": `${Math.floor(Date.now() / 1000)}`,
        Lan: "vi-VN",
        Loc: "va",
        Origin: "https://www.capcut.com",
        Pf: "7",
        Priority: "u=1, i",
        Referer: "https://www.capcut.com/",
        "Sec-Ch-Ua":
          '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
        Sign: "2cd3272c536081caeafe7c07949d023d",
        "Sign-Ver": "1",
        Tdid: "",
        ...this.headersss(),
      },
    });
  }

  private randomUserAgent(): string {
    const versions = [
      "4.0.3",
      "4.1.1",
      "4.2.2",
      "4.3",
      "4.4",
      "5.0.2",
      "5.1",
      "6.0",
      "7.0",
      "8.0",
      "9.0",
      "10.0",
      "11.0",
    ];
    const devices = [
      "M2004J19C",
      "S2020X3",
      "Xiaomi4S",
      "RedmiNote9",
      "SamsungS21",
      "GooglePixel5",
    ];
    const builds = [
      "RP1A.200720.011",
      "RP1A.210505.003",
      "RP1A.210812.016",
      "QKQ1.200114.002",
      "RQ2A.210505.003",
    ];
    const chromeVersion = `Chrome/${Math.floor(Math.random() * 80) + 1}.${Math.floor(Math.random() * 999) + 1
      }.${Math.floor(Math.random() * 9999) + 1}`;
    return `Mozilla/5.0 (Linux; Android ${versions[Math.floor(Math.random() * versions.length)]
      }; ${devices[Math.floor(Math.random() * devices.length)]
      } Build/${builds[Math.floor(Math.random() * builds.length)]
      }) AppleWebKit/537.36 (KHTML, like Gecko) ${chromeVersion} Mobile Safari/537.36 WhatsApp/1.${Math.floor(Math.random() * 9) + 1
      }.${Math.floor(Math.random() * 9) + 1}`;
  }

  private randomIP(): string {
    const r = () => Math.floor(Math.random() * 256);
    return `${r()}.${r()}.${r()}.${r()}`;
  }

  private headersss(): Record<string, string> {
    return {
      "User-Agent": this.randomUserAgent(),
      "X-Forwarded-For": this.randomIP(),
    };
  }

  async getlink(url: string): Promise<string | null> {
    const regex = /https:\/\/www\.capcut\.com\/(?:templates|template-detail)\/(\d+)/;
    if (regex.test(url)) return url;
    try {
      const response = await axios.get(url.trim(), {
        maxRedirects: 0,
        validateStatus: (status) => status >= 300 && status < 400,
      });
      return response.headers.location ?? null;
    } catch (error: any) {
      console.error("Error resolving link:", error.message);
      return null;
    }
  }

  async getID(url: string): Promise<string | null> {
    const regex = /https:\/\/www\.capcut\.com\/(?:templates|template-detail)\/(\d+)/;
    if (regex.test(url)) {
      const match = url.match(regex);
      return match ? match[1] : null;
    }
    try {
      const response = await axios.get(url.trim(), {
        maxRedirects: 0,
        validateStatus: (status) => status >= 300 && status < 400,
      });
      const redirected = response.headers.location;
      if (!redirected) return null;
      const match = redirected.match(regex);
      return match ? match[1] : null;
    } catch (error: any) {
      console.error("Error resolving ID:", error.message);
      return null;
    }
  }

  async down(url: string): Promise<DownResult> {
    const videoId = await this.getID(url);
    if (!videoId) throw new Error("Cannot extract video ID");

    const data = {
      sdk_version: "86.0.0",
      biz_id: null as null | string,
      id: [videoId],
      enter_from: "",
      cc_web_version: 0,
    };

    try {
      const response = await this.client.post(
        "https://edit-api-sg.capcut.com/lv/v1/cc_web/replicate/multi_get_templates",
        data
      );
      const tpl = response.data.data.templates[0];

      const result: DownResult = {
        id: tpl.web_id,
        message: tpl.title,
        short_title: tpl.short_title,
        duration: tpl.duration,
        fragment_count: tpl.fragment_count,
        usage_amount: tpl.usage_amount,
        play_amount: tpl.play_amount,
        favorite_count: tpl.favorite_count,
        like_count: tpl.like_count,
        comment_count: tpl.interaction?.comment_count || 0,
        create_time: tpl.create_time,
        author: {
          unique_id: tpl.author?.unique_id,
          name: tpl.author?.name,
        },
        attachments: [
          {
            type: "Video",
            url: tpl.video_url,
          },
        ],
      };
      return result;
    } catch (error) {
      const realUrl = await this.getlink(url);
      try {
        return (await this.down5(url)) as DownResult;
      } catch (e1) {
        try {
          if (!realUrl) throw e1;
          return (await this.down3(realUrl)) as DownResult;
        } catch (e2) {
          if (!realUrl) throw e2;
          return await this.down4(realUrl);
        }
      }
    }
  }

  async down4(url: string): Promise<DownResult> {
    const response = await fetch(url, {
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-encoding": "gzip, deflate, br, zstd",
        "accept-language":
          "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
        cookie:
          'receive-cookie-deprecation=1; capcut_locale=vi-VN; _tea_web_id=7460089864022754832; COOKIE_CONSENT_PROMPT_CONFIG={%22status%22:1%2C%22settings%22:{%22firstPartyAnalytics%22:true%2C%22GoogleAnalytics%22:true}%2C%22updatedTime%22:1736937542264}; gf_part_2182576=78; _ga=GA1.1.1310314743.1736937543; _clck=1k18r1u%7C2%7Cfsl%7C0%7C1841; g_state={"i_l":0}; s_v_web_id=verify_m5xrrqjw_EvaHEb7u_1tUG_41mX_9hFP_Q7CIwbEi2aX4; passport_csrf_token=daa5ba1fc70f258bef8e02b77bb1d460; passport_csrf_token_default=daa5ba1fc70f258bef8e02b77bb1d460; sid_guard=717510308d1b711edb48b2aa08ba34eb%7C1736937551%7C34559999%7CThu%2C+19-Feb-2026+10%3A39%3A10+GMT; uid_tt=869b70f042886334bb253efe84a74033eee54d2c1c2fbba9dc152994ae6c9f66; uid_tt_ss=869b70f042886334bb253efe84a74033eee54d2c1c2fbba9dc152994ae6c9f66; sid_tt=717510308d1b711edb48b2aa08ba34eb; sessionid=717510308d1b711edb48b2aa08ba34eb; sessionid_ss=717510308d1b711edb48b2aa08ba34eb; sid_ucp_v1=1.0.0-KGEwZGU4ODM2Njk1NjM0Y2ZmZTczOGRkZTJiOGM5N2ZiZTc2MDY3OTYKIAiFiKzO_cnd92YQz6CevAYYnKAVIAww9-y9twY4CEASEAMaA3NnMSIgNzE3NTEwMzA4ZDFiNzExZWRiNDhiMmFhMDhiYTM0ZWI; ssid_ucp_v1=1.0.0-KGEwZGU4ODM2Njk1NjM0Y2ZmZTczOGRkZTJiOGM5N2ZiZTc2MDY3OTYKIAiFiKzO_cnd92YQz6CevAYYnKAVIAww9-y9twY4CEASEAMaA3NnMSIgNzE3NTEwMzA4ZDFiNzExZWRiNDhiMmFhMDhiYTM0ZWI; store-idc=alisg; store-country-code=vn; store-country-code-src=uid; store-country-code-src=uid; _v2_spipe_web_id=7460089967780462645; CAPCUT_THEME=light; _gcl_au=1.1.1608057491.1736939510; msToken=GLcEns-10C5HRddQUg52Pj7F4Del9seEowct8dDvPyGqKFEoDG0vGT_QZqNeafSolq930jQIKR2KpcfgskIhhQOb4qnxaMoQ3h45nktbA4RokID1erCgRjfFN1WqXbnFOiU2Bwo=; _ut=context%253DReferer%2526source%253Denter_url%2526medium%253DDirect%2526channel_from%253Dut%2526session_start_url%253Dhttps%253A%252F%252Fwww.capcut.com%252Fmy-edit%253Fstart_tab%253Dvideo; _clsk=dncwu5%7C1736941789419%7C17%7C0%7Cl.clarity.ms%2Fcollect; ttwid=1|2Y9zZkLJy_qppG1sNE2B_uQo9G2cLx9parHtg0t8JDo|1736941793|178154e62ad2ce45722759d5d0a97d40cef9f6a67d3a6c13985ac59b098c9002; user_spaces_idc={"7417276815909602305":"sg1_gcp","7445587387474166785":"sg1_gcp"}; _uetsid=f0e0e250d32c11efb47f8df3d43d7c90; _uetvid=f0e10c00d32c11efa0c04523718f2d01; msToken=3FF8mkNjZFD0yWAizQBALQvVjlCqLIUaqx6uRJUk3VJJI5WZtFGZMTzVjWnVBGtEOcFYjzJYhYL__cKp3kUjHNmRbiMk0ZS3XvK24q13KGgeCwXhz2p9deKx1C2vHwbJDmoEdw==; odin_tt=756bc7692868acb50fb14c3b8a1ed8f7173a839eb68e8b0c2aaa26f54c6e7754efdc9304f6772dd278d8419866ea503906f30bbddc466341acb2b5a4e872888e; x_logid=202501151149540B2E512D65CC981FEFB1; _ga_F9J0QP63RB=GS1.1.1736937542.1.1.1736941795.0.0.0',
        "sec-ch-ua":
          '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });

    const data = await response.text();
    const $ = cheerio.load(data);
    const scriptContent = $('script[nonce="argus-csp-token"]').html() || "";

    const jsonRegex = /window\._ROUTER_DATA\s*=\s*(\{[\s\S]*\})/;
    const match = jsonRegex.exec(scriptContent);
    if (!match) {
      throw new Error("Cannot find ROUTER_DATA JSON");
    }
    const jsonString = match[1];
    const jsonData = JSON.parse(jsonString);

    const a = jsonData.loaderData["template-detail_$"].templateDetail;
    const attachments: Attachment[] = [
      {
        type: "Video",
        url: a.videoUrl,
      },
    ];

    const results: DownResult = {
      id: a.templateId,
      message: `${a.title} - ${a.desc}`,
      author: a.author.name,
      play: a.playAmount,
      like: a.likeAmount,
      comment: a.commentAmount,
      segment: a.segmentAmount,
      duration: a.templateDuration,
      createTime: a.createTime,
      attachments,
    };

    return results;
  }

  async down5(url: string): Promise<DownResult | undefined> {
    try {
      const response = await axios.post(
        "https://3bic.com/api/download",
        { url },
        {
          headers: {
            authority: "3bic.com",
            accept: "application/json, text/plain, /",
            "accept-encoding": "gzip, deflate, br",
            "accept-language":
              "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
            "content-type": "application/json",
            origin: "https://3bic.com",
            priority: "u=1, i",
            referer: "https://3bic.com/",
            "sec-ch-ua":
              '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          },
        }
      );
      const data = response.data;
      const decodedUrl = Buffer.from(
        data.originalVideoUrl.replace("/api/cdn/", ""),
        "base64"
      ).toString("utf-8");

      return {
        message: data.title,
        author: data.authorName,
        attachments: [
          {
            type: "Video",
            url: decodedUrl,
          },
        ],
        id: "",
      };
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }

  async down3(url: string): Promise<DownResult> {
    try {
      const response = await axios.get(url, {
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "Accept-Encoding": "gzip, deflate, br, zstd",
          "Accept-Language":
            "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
          "Cache-Control": "max-age=0",
          Cookie:
            'receive-cookie-deprecation=1; capcut_locale=vi-VN; _tea_web_id=7460089864022754832; COOKIE_CONSENT_PROMPT_CONFIG={%22status%22:1%2C%22settings%22:{%22firstPartyAnalytics%22:true%2C%22GoogleAnalytics%22:true}%2C%22updatedTime%22:1736937542264}; gf_part_2182576=78; _ut=context%253DReferer%2526source%253Denter_url%2526medium%253DDirect%2526channel_from%253Dut%2526session_start_url%253Dhttps%253A%252F%252Fwww.capcut.com%252Fvi-vn%252F; _ga=GA1.1.1310314743.1736937543; _clck=1k18r1u%7C2%7Cfsl%7C0%7C1841; g_state={"i_l":0}; s_v_web_id=verify_m5xrrqjw_EvaHEb7u_1tUG_41mX_9hFP_Q7CIwbEi2aX4; passport_csrf_token=daa5ba1fc70f258bef8e02b77bb1d460; passport_csrf_token_default=daa5ba1fc70f258bef8e02b77bb1d460; sid_guard=717510308d1b711edb48b2aa08ba34eb%7C1736937551%7C34559999%7CThu%2C+19-Feb-2026+10%3A39%3A10+GMT; uid_tt=869b70f042886334bb253efe84a74033eee54d2c1c2fbba9dc152994ae6c9f66; uid_tt_ss=869b70f042886334bb253efe84a74033eee54d2c1c2fbba9dc152994ae6c9f66; sid_tt=717510308d1b711edb48b2aa08ba34eb; sessionid=717510308d1b711edb48b2aa08ba34eb; sessionid_ss=717510308d1b711edb48b2aa08ba34eb; sid_ucp_v1=1.0.0-KGEwZGU4ODM2Njk1NjM0Y2ZmZTczOGRkZTJiOGM5N2ZiZTc2MDY3OTYKIAiFiKzO_cnd92YQz6CevAYYnKAVIAww9-y9twY4CEASEAMaA3NnMSIgNzE3NTEwMzA4ZDFiNzExZWRiNDhiMmFhMDhiYTM0ZWI; ssid_ucp_v1=1.0.0-KGEwZGU4ODM2Njk1NjM0Y2ZmZTczOGRkZTJiOGM5N2ZiZTc2MDY3OTYKIAiFiKzO_cnd92YQz6CevAYYnKAVIAww9-y9twY4CEASEAMaA3NnMSIgNzE3NTEwMzA4ZDFiNzExZWRiNDhiMmFhMDhiYTM0ZWI; store-idc=alisg; store-country-code=vn; store-country-code-src=uid; _v2_spipe_web_id=7460089967780462645; user_spaces_idc={"7445587387474166785":"sg1_gcp","7417276815909602305":"sg1_gcp"}; _uetsid=f0e0e250d32c11efb47f8df3d43d7c90; _uetvid=f0e10c00d32c11efa0c04523718f2d01; CAPCUT_THEME=light; odin_tt=1e5120b24d432e36aa320a6f6eb5a37a27bac0c69eef8baa2c79472e5da28a3d565c7ac6523fbf0388121c5541b869773cabac1b233a445206f466264294f7d8; msToken=ImTvG656EdwyjPHt2z1QR9rrtR5DDB0fGDWJ-jQ_BMVsYVplpLQkyAOBB-VKf0YZVE75gY1MKZRU5Bqu7zRW5On61L-IqI4E_r9WWFyHoJlOIBB5FXaBQWDmBWq5; _clsk=dncwu5%7C1736937590618%7C5%7C0%7Cl.clarity.ms%2Fcollect; _ga_F9J0QP63RB=GS1.1.1736937542.1.1.1736937590.0.0.0; x_logid=20250115104002C55F8DC6FBFA92124F69; ttwid=1|2Y9zZkLJy_qppG1sNE2B_uQo9G2cLx9parHtg0t8JDo|1736937604|343b8a38c31fe72efa20418818bcadb58d966808893c3bc5ce2846a867f7a653; msToken=UF6l3MvzsxDGuzmzjV8q_DFmaEzpe73RTRnqAr6J_8o8WwWm2zUjhvZjWnTKSAX_gPA1lsN57H2AU1tzQjs0MadkC3Swdw_9p83aDEJeh7gO',
          Referer: "https://www.capcut.com/vi-vn/",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        },
      });

      const $ = cheerio.load(response.data);
      const jsonLdScriptRaw = $('script[type="application/ld+json"]').html();
      const jsonLdScript = jsonLdScriptRaw
        ? JSON.parse(jsonLdScriptRaw)
        : undefined;
      const videoUrl = $("video.video").attr("src");
      const title = $("h1.title").text().trim();
      const name = $(".toC_info .name").text().trim();

      if (!title) {
        throw new Error("Title cannot be null");
      }

      return {
        id: "",
        message: title || jsonLdScript?.name,
        author: name,
        uploadDate: jsonLdScript?.uploadDate,
        attachments: [
          {
            type: "Video",
            url: videoUrl || jsonLdScript?.contentUrl,
          },
        ],
      };
    } catch (error) {
      throw new Error("Failed to fetch trending data");
    }
  }

  async search(keyword: string): Promise<any> {
    if (!keyword) throw new Error("Thiếu dữ liệu để khởi chạy chương trình");

    const options = {
      method: "POST" as const,
      url: "https://edit-api-sg.capcut.com/lv/v1/cc_web/replicate/search_templates",
      headers: {
        Host: "edit-api-sg.capcut.com",
        "Content-Type": "application/json",
        "accept-language":
          "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
        "app-sdk-version": "48.0.0",
        appvr: "5.8.0",
        cookie: this.cookie,
        "device-time": "1704116611",
        lan: "vi-VN",
        loc: "va",
        origin: "https://www.capcut.com",
        pf: "7",
        referer: "https://www.capcut.com/",
        "sec-ch-ua":
          '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        sign: "6edde988911c68544a053e83f0e3b814",
        "sign-ver": "1",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      data: JSON.stringify({
        sdk_version: "86.0.0",
        count: 20,
        cursor: "0",
        enter_from: "workspace",
        query: keyword,
        scene: 1,
        search_version: 2,
        cc_web_version: 1,
      }),
    };

    try {
      const response = await axios.request(options);
      return response.data.data;
    } catch (error) {
      throw new Error("Gãy rồi huhu...");
    }
  }

  async info(url: string): Promise<any> {
    try {
      const getUrl = await axios.get(url);
      const resReq: any = getUrl.request;
      const get = resReq.res.responseUrl as string;
      const urls = get.split("=")[1]?.split("&")[0];
      if (!urls) {
        throw new Error("Không thể trích xuất URL từ phản hồi");
      }

      const data = {
        public_id: urls,
      };

      const options = {
        method: "POST" as const,
        url: "http://feed-api.capcutapi.com/lv/v1/homepage/profile",
        data,
        headers: {
          Connection: "keep-alive",
          "Content-Length": Buffer.byteLength(
            JSON.stringify(data)
          ).toString(),
          "Accept-Language": "vi-VN,vi;q=0.9",
          Referer: "https://mobile.capcutshare.com/",
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
          Origin: "https://mobile.capcutshare.com",
          Host: "feed-api.capcutapi.com",
          pf: "1",
          "app-sdk-version": "100.0.0",
          sign: "279ff6779bd2bb1684e91d411499ee79",
          loc: "BR",
          "sign-ver": "1",
          "device-time": "1699453732",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "cross-site",
          "Sec-Fetch-Dest": "empty",
          "Content-Type": "application/json",
        },
      };

      const response = await axios.request(options);
      const userData = response.data.data;
      return userData;
    } catch (error: any) {
      throw new Error("Error occurred: " + (error?.message ?? String(error)));
    }
  }

  async post(link: string): Promise<DownResult[] | undefined> {
    const postLinkPC = async (url: string): Promise<DownResult[] | undefined> => {
      try {
        const extractId = (u: string): string | null => {
          const regex = /profile\/([^/?]+)/;
          const match = u.match(regex);
          return match ? match[1] : null;
        };

        const id = extractId(url);
        if (!id) throw new Error("Cannot extract profile id");

        const response = await axios.post(
          "https://edit-api-sg.capcut.com/lv/v1/cc_web/homepage/profile/templates",
          {
            cursor: "0",
            count: 50,
            uid: "",
            public_id: id,
            status_list: [],
            template_type_list: [1],
          },
          {
            headers: {
              accept: "application/json, text/plain, */*",
              "accept-encoding": "gzip, deflate, br, zstd",
              "accept-language":
                "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
              "app-sdk-version": "48.0.0",
              appvr: "5.8.0",
              "content-type": "application/json",
              cookie:
                "_clck=i92wh7%7C2%7Cfrg%7C0%7C1800; _ga=GA1.1.2053772573.1733401030; _gcl_au=1.1.1096328218.1733401044; passport_csrf_token=b1d7037f9936caaf7c1ed0eb6f98c50c; passport_csrf_token_default=b1d7037f9936caaf7c1ed0eb6f98c50c; sid_guard=05c5548c257fb26ec8c724dbf26d494a%7C1733401059%7C34560000%7CFri%2C+09-Jan-2026+12%3A17%3A39+GMT; uid_tt=fd50bf37e0eb1420052c563aa9a3f3c39827be70e3ce9d75eddc792257714280; uid_tt_ss=fd50bf37e0eb1420052c563aa9a3f3c39827be70e3ce9d75eddc792257714280; sid_tt=05c5548c257fb26ec8c724dbf26d494a; sessionid=05c5548c257fb26ec8c724dbf26d494a; sessionid_ss=05c5548c257fb26ec8c724dbf26d494a; sid_ucp_v1=1.0.0-KDA0ZTcyZTc5ZmY0ZTRhMWY3ZWQxNjIxYjAwZDc3NTVmYTc2N2NmN2IKIAiFiKzO_cnd92YQ47PGugYYnKAVIAww9-y9twY4CEASEAMaA3NnMSIgMDVjNTU0OGMyNTdmYjI2ZWM4YzcyNGRiZjI2ZDQ5NGE; ssid_ucp_v1=1.0.0-KDA0ZTcyZTc5ZmY0ZTRhMWY3ZWQxNjIxYjAwZDc3NTVmYTc2N2NmN2IKIAiFiKzO_cnd92YQ47PGugYYnKAVIAww9-y9twY4CEASEAMaA3NnMSIgMDVjNTU0OGMyNTdmYjI2ZWM4YzcyNGRiZjI2ZDQ5NGE; store-idc=alisg; store-country-code=vn; store-country-code-src=uid; odin_tt=1a43b7a20446921414ea030ac616e3a55a63b2467fb64021070fcc183e6c7542a060c86fdf94ebfb0aec84787e6f166c87f85077ec4e92e7c9abde09447e2b59; _uetsid=dde9f6d0b30211efb58079ccfa8aecc6; _uetvid=ddea18f0b30211efbb55e7aa7663b1f0; _clsk=1vvh7sn%7C1733401418865%7C10%7C0%7Ce.clarity.ms%2Fcollect; msToken=KrRCZPNoQDh0raywx_dbh-twoddKledjRdU7Q1Km7oAorpChe11SzyRYFYTFH0hYjbZ90_fngU6yihkKRbU-EtqnRsR3RStDmlVFT_R67ut3W_oY3eB3e3VZPEmO; ttwid=1|1GA3DrXU6lpq1WAEIG5JHYpSwLLcR7QATX6IgR4TEyU|1733401425|1c19b344a0a3b3d3a3873d08d858e9d9dd863ddddb90cbabed76859f1172bde9; _ga_F9J0QP63RB=GS1.1.1733401029.1.1.1733401428.60.0.0.0",
              "device-time": "1733401430",
              lan: "vi-VN",
              loc: "va",
              origin: "https://www.capcut.com",
              pf: "7",
              priority: "u=1, i",
              referer: "https://www.capcut.com/",
              "sec-ch-ua":
                '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
              "sec-ch-ua-mobile": "?0",
              "sec-ch-ua-platform": '"Windows"',
              "sec-fetch-dest": "empty",
              "sec-fetch-mode": "cors",
              "sec-fetch-site": "same-site",
              sign: "7685b4f09b7abb2507c7131546af89c4",
              "sign-ver": "1",
              tdid: "",
              "user-agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            },
          }
        );

        const templates = response.data.data.templates || [];
        const results: DownResult[] = templates.map((template: any) => ({
          id: template.web_id,
          message: template.title,
          short_title: template.short_title,
          duration: template.duration,
          fragment_count: template.fragment_count,
          usage_amount: template.usage_amount,
          play_amount: template.play_amount,
          favorite_count: template.favorite_count,
          like_count: template.like_count,
          comment_count: template.interaction?.comment_count || 0,
          create_time: template.create_time,
          author: {
            unique_id: template.author?.unique_id,
            name: template.author?.name,
          },
          thumb: template.cover_url,
          attachments: [
            {
              type: "Video",
              url: template.video_url,
            },
          ],
        }));

        return results;
      } catch (error: any) {
        console.error(
          "Error:",
          error.response ? error.response.data : error.message
        );
        return undefined;
      }
    };

    const postLinkMobile = async (
      url: string
    ): Promise<DownResult[] | undefined> => {
      try {
        const getUrl = await axios.get(url);
        const resReq: any = getUrl.request;
        const get = resReq.res.responseUrl as string;
        const urls = get.split("=")[1]?.split("&")[0];
        if (!urls) {
          throw new Error("Không thể trích xuất URL từ phản hồi");
        }

        const response = await axios.post(
          "https://feed-api.capcutapi.com/lv/v1/homepage/templates",
          {
            cursor: "0",
            count: 50,
            uid: 1,
            public_id: urls,
            sdk_version: "100.0.0",
          },
          {
            headers: {
              Accept: "application/json, text/plain, */*",
              "Accept-Encoding": "gzip, deflate, br, zstd",
              "Accept-Language":
                "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
              "App-Sdk-Version": "100.0.0",
              "Content-Type": "application/json",
              "Device-Time": "1733482053",
              Loc: "BR",
              Origin: "https://mobile.capcutshare.com",
              Pf: "0",
              Referer: "https://mobile.capcutshare.com/",
              "Sec-Ch-Ua":
                '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
              "Sec-Ch-Ua-Mobile": "?0",
              "Sec-Ch-Ua-Platform": '"Windows"',
              "Sec-Fetch-Dest": "empty",
              "Sec-Fetch-Mode": "cors",
              "Sec-Fetch-Site": "cross-site",
              Sign: "0690982dc1cdb39b6bd95a52a6d9faca",
              "Sign-Ver": "1",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            },
          }
        );

        const templates = response.data.data.templates || [];
        const results: DownResult[] = templates.map((template: any) => ({
          id: template.web_id,
          message: template.title,
          short_title: template.short_title,
          duration: template.duration,
          fragment_count: template.fragment_count,
          usage_amount: template.usage_amount,
          play_amount: template.play_amount,
          favorite_count: template.favorite_count,
          like_count: template.like_count,
          comment_count: template.interaction?.comment_count || 0,
          create_time: template.create_time,
          author: {
            unique_id: template.author?.unique_id,
            name: template.author?.name,
          },
          thumb: template.cover_url,
          attachments: [
            {
              type: "Video",
              url: template.video_url,
            },
          ],
        }));

        return results;
      } catch (error: any) {
        console.error(
          "Error:",
          error.response ? error.response.data : error.message
        );
        return undefined;
      }
    };

    if (/^https?:\/\/www\.capcut\.com\/profile/.test(link)) {
      return await postLinkPC(link);
    } else if (/^https?:\/\/mobile\.capcutshare\.com/.test(link)) {
      return await postLinkMobile(link);
    } else {
      return undefined;
    }
  }

  async trending(): Promise<any> {
    const headers = {
      accept: "application/json, text/plain, */*",
      "accept-encoding": "gzip, deflate, br, zstd",
      "accept-language":
        "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "app-sdk-version": "48.0.0",
      appvr: "5.8.0",
      "content-length": "118",
      "content-type": "application/json",
      cookie: this.cookie,
      "device-time": "1724249219",
      lan: "vi-VN",
      loc: "va",
      origin: "https://www.capcut.com",
      pf: "7",
      priority: "u=1, i",
      referer: "https://www.capcut.com/",
      "sec-ch-ua":
        '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      sign: "a2d5d9c6c4e1b67c582086fbea7f1789",
      "sign-ver": "1",
      tdid: "",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    };

    const data = {
      sdk_version: "86.0.0",
      collection_type: 103,
      show_ugc_template: true,
      detail_count: 20,
      uuid: "7405593781725283857",
    };

    const response = await axios.post(
      "https://edit-api-sg.capcut.com/lv/v1/cc_web/replicate/get_collections",
      data,
      { headers }
    );
    return response.data?.data?.collections?.[0]?.detail_info?.item_list;
  }
}
const defaultCapcut = new CapcutAPI("passport_csrf_token=5ac52046d7e872eb53aac2e59b6b945b; passport_csrf_token_default=5ac52046d7e872eb53aac2e59b6b945b; sid_guard=3fe9c9e8eca929e2a0f73deec2884c50%7C1742481256%7C34560000%7CFri%2C+24-Apr-2026+14%3A34%3A16+GMT; uid_tt=f2f64fb43a200490e906c69b9ec16372131b7b6c0bf0ce64e3adfc7283501da9; uid_tt_ss=f2f64fb43a200490e906c69b9ec16372131b7b6c0bf0ce64e3adfc7283501da9; sid_tt=3fe9c9e8eca929e2a0f73deec2884c50; sessionid=3fe9c9e8eca929e2a0f73deec2884c50; sessionid_ss=3fe9c9e8eca929e2a0f73deec2884c50; sid_ucp_v1=1.0.0-KGJjNTAyYjNiM2Y4YzUzNGZhNmZmZjA4OTQwZGI3M2IxYmNmYzhiMjAKIAiRiM6S3P6U52cQ6M7wvgYYnKAVIAwwmKi5vgY4CEASEAMaA3NnMSIgM2ZlOWM5ZThlY2E5MjllMmEwZjczZGVlYzI4ODRjNTA; ssid_ucp_v1=1.0.0-KGJjNTAyYjNiM2Y4YzUzNGZhNmZmZjA4OTQwZGI3M2IxYmNmYzhiMjAKIAiRiM6S3P6U52cQ6M7wvgYYnKAVIAwwmKi5vgY4CEASEAMaA3NnMSIgM2ZlOWM5ZThlY2E5MjllMmEwZjczZGVlYzI4ODRjNTA; store-idc=alisg; store-country-code=vn; store-country-code-src=uid; target-store-country-code=vn; ttwid=1|hKCA8rH4qS01WN3hm_diCszcHo2Krlb2k3NPrHUx-bQ|1747386577|74f6b4674e4bc8a4d8d5f035c31d5850af6287c6fadabdd5e6a822a37d36c682; odin_tt=f657e6d110b51664e3c33c2081875c0bf64122c8a05d5c28f1b0891d9d83afa764c5395e317526de145a38308cc32b7d8a3fe3c23dd5d3d75b437156c9ea6c6d; msToken=c7GBrE_VkIH5Cfahlpb_X1qhz7GWBumWlE19iGBnZvb7OGu_0MOiqKYYElUPOb0GizEMKyx5RxOnPlgs7zKKsOaVd3cLqgaYwLXVIez3Va5Ej8DsxM2JzWL2hSIF-g==");
export default defaultCapcut;
