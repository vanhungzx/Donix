import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

interface SoundCloudUser {
  avatar_url: string;
  full_name: string;
  id: number;
  kind: string;
  permalink_url: string;
  username: string;
  followers_count?: number;
  description?: string | null;
}

interface SoundCloudTrack {
  id: number;
  title: string;
  user: SoundCloudUser;
  playback_count: number;
  likes_count: number;
  comment_count: number;
  reposts_count: number;
  duration: number;
  created_at: string;
  media?: {
    transcodings: Array<{
      url: string;
      format: {
        protocol: string;
      };
    }>;
  };
  track_authorization?: string;
}

interface SearchTrack extends SoundCloudTrack {
  genre?: string | null;
  description?: string | null;
  display_date?: string | null;
  permalink_url: string;
  downloadable: boolean;
}

interface SearchResponse {
  collection: SearchTrack[];
}

interface StreamCollectionItem {
  track: SearchTrack;
}

interface StreamResponse {
  collection: StreamCollectionItem[];
}

// ─── Client ID cache (same strategy as your demo script) ───────────────
type ClientIdCache = {
  clientId: string;
  savedAt: number;
  scriptUrls?: string[];
};

const CACHE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".sc_cache.json"
);
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ID_REGEX = /client_id\s*:\s*["']([0-9a-zA-Z]{32})["']/;
const PRIORITY_KW = ["app", "init", "main", "config", "boot"];
const APP_VERSION = "1773236899";

const API_HEADERS: Record<string, string> = {
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "vi,en;q=0.9",
  Connection: "keep-alive",
  Origin: "https://soundcloud.com",
  Referer: "https://soundcloud.com/",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  "sec-ch-ua":
    '"Not:A-Brand";v="99","Google Chrome";v="145","Chromium";v="145"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};

function loadCache(): ClientIdCache | null {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    return JSON.parse(raw) as ClientIdCache;
  } catch {
    return null;
  }
}

function saveCache(data: Omit<ClientIdCache, "savedAt">): void {
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ ...data, savedAt: Date.now() }, null, 2));
}

function isCacheFresh(cache: ClientIdCache | null): cache is ClientIdCache {
  return Boolean(cache?.savedAt && Date.now() - cache.savedAt < CACHE_TTL_MS);
}

export interface DownloadResult {
  id: number;
  title: string;
  author: string;
  playback: string | number;
  likes: string | number;
  comment: string | number;
  share: string | number;
  duration: string;
  create_at: string;
  localFilePath?: string;
  attachments: Array<{
    type: "Audio";
    url?: string;
    localFilePath?: string;
  }>;
}

export interface SearchResultItem {
  title: string;
  author: {
    avatar_url: string;
    full_name: string;
    id: number;
    type: string;
    permalink_url: string;
    username: string;
    follow?: number;
    description?: string | null;
  };
  downloadable: boolean;
  likes_count: number;
  comment_count: number;
  url: string;
  genre?: string | null;
  description?: string | null;
  duration: string;
  id: number;
  display_date?: string | null;
}

export interface PostResultItem extends Omit<SearchResultItem, "author"> {
  author: {
    avatar_url: string;
    full_name: string;
    id: number;
    type: string;
    permalink_url: string;
    username: string;
    follow?: number;
  };
}

class SoundCloudAPI {
  private request: AxiosInstance;

  constructor() {
    const jar = new CookieJar();
    this.request = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        headers: {
          ...API_HEADERS,
          // Keep some browser-y defaults for HTML fetches
          "upgrade-insecure-requests": "1",
        },
        validateStatus: (status) => status < 500,
        timeout: 30000,
        maxRedirects: 5,
      })
    );
  }

  private isSuccessStatus(status: number): boolean {
    return status >= 200 && status < 300;
  }

  private async getResponse<T>(
    url: string,
    config: AxiosRequestConfig = {},
    retryWithFreshClientId: boolean = false
  ): Promise<AxiosResponse<T>> {
    const response = await this.request.get<T>(url, config);

    if (
      retryWithFreshClientId &&
      (response.status === 401 || response.status === 403) &&
      config.params &&
      Object.prototype.hasOwnProperty.call(config.params, "client_id")
    ) {
      const freshClientId = await this.getClientID(true);
      const retryResponse = await this.request.get<T>(url, {
        ...config,
        params: {
          ...(config.params as Record<string, unknown>),
          client_id: freshClientId,
        },
      });

      if (!this.isSuccessStatus(retryResponse.status)) {
        throw new Error(`SoundCloud request failed (${retryResponse.status}) for ${url}`);
      }

      return retryResponse;
    }

    if (!this.isSuccessStatus(response.status)) {
      throw new Error(`SoundCloud request failed (${response.status}) for ${url}`);
    }

    return response;
  }

  private async getClientID(forceRefresh: boolean = false): Promise<string> {
    const cache = loadCache();

    // Fast path: cache còn tươi + validate bằng HEAD
    if (!forceRefresh && isCacheFresh(cache)) {
      try {
        const response = await this.request.head(
          `https://api-v2.soundcloud.com/tracks?client_id=${cache.clientId}&limit=1`,
          { headers: API_HEADERS, timeout: 3000 }
        );
        if (this.isSuccessStatus(response.status)) {
          return cache.clientId;
        }
      } catch {
        // hết hạn, scrape lại
      }
    }

    // Slow path: scrape script urls để tìm client_id
    let scriptUrls = forceRefresh ? null : (cache?.scriptUrls ?? null);
    if (!scriptUrls) {
      const mainRes = await this.getResponse<string>("https://soundcloud.com/", {
        headers: { ...API_HEADERS, Range: "bytes=0-65535" },
      });
      const html = mainRes.data;
      scriptUrls = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]);

      scriptUrls.sort((a, b) => {
        const pa = PRIORITY_KW.some((k) => a.includes(k)) ? 0 : 1;
        const pb = PRIORITY_KW.some((k) => b.includes(k)) ? 0 : 1;
        return pa - pb;
      });
    }

    if (!scriptUrls?.length) {
      throw new Error("No SoundCloud script URLs found to scrape client_id");
    }

    const controllers = scriptUrls.map(() => new AbortController());
    const cancelAll = () => controllers.forEach((c) => c.abort());

    const clientId = await Promise.any(
      scriptUrls.map((url, i) => {
        return new Promise<string>((resolve, reject) => {
          let done = false;

          const controller = controllers[i];
          const token = controller.signal;

          (async () => {
            let buf = "";
            try {
              const res = await this.request.get(url, {
                headers: { ...API_HEADERS, "Accept-Encoding": "gzip, deflate, br" },
                responseType: "stream",
                signal: token,
                timeout: 8000,
              } as any);

              const stream = res.data as any;

              stream.on("data", (chunk: Buffer) => {
                if (done) return;
                buf += chunk.toString();
                const m = buf.match(ID_REGEX);
                if (m) {
                  done = true;
                  cancelAll();
                  try {
                    stream.destroy?.();
                  } catch { }
                  resolve(m[1]);
                }

                if (buf.length > 8192) buf = buf.slice(-512);
              });

              stream.on("end", () => {
                if (done) return;
                reject(new Error("not_found"));
              });

              stream.on("error", (err: unknown) => {
                if (done) return;
                reject(err instanceof Error ? err : new Error(String(err)));
              });
            } catch (err) {
              if (done) return;
              reject(err instanceof Error ? err : new Error(String(err)));
            }
          })();
        });
      })
    );

    saveCache({ clientId, scriptUrls });
    return clientId;
  }

  private async resolveWithClientId<T>(
    url: string,
    params: Record<string, unknown>
  ): Promise<T> {
    const clientId = await this.getClientID();
    const response = await this.getResponse<T>(
      url,
      {
        headers: API_HEADERS,
        params: {
          ...params,
          client_id: clientId,
        },
      },
      true
    );
    return response.data;
  }

  private getTempAudioPath(): string {
    const tempDir = path.join(process.cwd(), "temp");
    fs.mkdirSync(tempDir, { recursive: true });
    return path.join(
      tempDir,
      `soundcloud_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`
    );
  }

  private async downloadHlsToMp3(manifestUrl: string): Promise<string> {
    const outputPath = this.getTempAudioPath();

    await new Promise<void>((resolve, reject) => {
      ffmpeg(manifestUrl)
        .format("mp3")
        .audioCodec("libmp3lame")
        .audioBitrate(192)
        .save(outputPath)
        .on("end", () => resolve())
        .on("error", (error) => reject(error));
    });

    const cleanupTimer = setTimeout(() => {
      fs.promises.unlink(outputPath).catch(() => { });
    }, 10 * 60 * 1000);
    cleanupTimer.unref?.();

    return outputPath;
  }

  private formatNumber(number: number): string | null {
    if (isNaN(number)) return null;
    return number.toLocaleString("de-DE");
  }

  private formatDate(s: string): string {
    const d = new Date(s);
    const f = (n: number) => String(n).padStart(2, "0");
    return `${f(d.getUTCHours())}:${f(d.getUTCMinutes())}:${f(
      d.getUTCSeconds()
    )} || ${f(d.getUTCDate())}/${f(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  }

  private formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  }

  async down(link: string): Promise<DownloadResult> {
    try {
      const clientId = await this.getClientID();

      const initialResponse = await this.getResponse<string>(link, { headers: API_HEADERS });
      const responseUrl: string = (initialResponse.request as any)?.res?.responseUrl || link;
      const responseData = decodeURIComponent(responseUrl);
      const urlParts = responseData.replace("m.soundcloud.com", "soundcloud.com");
      const { data } = await this.getResponse<SoundCloudTrack>(
        "https://api-v2.soundcloud.com/resolve",
        {
          headers: API_HEADERS,
          params: { url: urlParts, client_id: clientId },
        },
        true
      );
      const progressiveUrl = data?.media?.transcodings?.find(
        (t) => t.format.protocol === "progressive"
      )?.url;
      const hlsUrl = data?.media?.transcodings?.find(
        (t) => t.format.protocol === "hls"
      )?.url;
      if (!progressiveUrl && !hlsUrl) throw new Error("No suitable data found");

      if (!data.track_authorization) {
        throw new Error("Missing track_authorization for stream");
      }

      const activeClientId = await this.getClientID();
      const trackAuthorization = encodeURIComponent(data.track_authorization);
      let url: string | undefined;
      let localFilePath: string | undefined;

      if (progressiveUrl) {
        const streamUrl = `${progressiveUrl}?client_id=${activeClientId}&track_authorization=${trackAuthorization}`;
        const streamData = await this.getResponse<{ url: string }>(streamUrl, { headers: API_HEADERS });
        url = streamData.data.url;
      } else if (hlsUrl) {
        const streamUrl = `${hlsUrl}?client_id=${activeClientId}&track_authorization=${trackAuthorization}`;
        const streamData = await this.getResponse<{ url: string }>(streamUrl, { headers: API_HEADERS });
        localFilePath = await this.downloadHlsToMp3(streamData.data.url);
      }

      return {
        id: data.id,
        title: data.title,
        author: `${data.user.full_name} (${data.user.username})`,
        playback: this.formatNumber(Number(data.playback_count)) || 0,
        likes: this.formatNumber(Number(data.likes_count)) || 0,
        comment: this.formatNumber(Number(data.comment_count)) || 0,
        share: this.formatNumber(Number(data.reposts_count)) || 0,
        duration: this.formatDuration(data.duration),
        create_at: this.formatDate(data.created_at),
        localFilePath,
        attachments: [
          {
            type: "Audio",
            url,
            localFilePath,
          },
        ],
      };
    } catch (error) {
      console.error("Error occurred while sending request:", error);
      throw error;
    }
  }

  async search(keywords: string, limit: number = 5): Promise<SearchResultItem[]> {
    try {
      const data = await this.resolveWithClientId<SearchResponse>(
        "https://api-v2.soundcloud.com/search/tracks",
        {
          q: keywords,
          limit,
          offset: 0,
          linked_partitioning: 1,
          app_version: APP_VERSION,
          app_locale: "en",
        }
      );

      const collection = Array.isArray(data?.collection) ? data.collection : [];
      return collection.map((track) => ({
        title: track.title,
        author: {
          avatar_url: track.user.avatar_url,
          full_name: track.user.full_name,
          id: track.user.id,
          type: track.user.kind,
          permalink_url: track.user.permalink_url,
          username: track.user.username,
          follow: track.user.followers_count,
          description: track.user.description,
        },
        downloadable: track.downloadable,
        likes_count: track.likes_count,
        comment_count: track.comment_count,
        url: track.permalink_url,
        genre: track.genre,
        description: track.description,
        duration: this.formatDuration(track.duration),
        id: track.id,
        display_date: track.display_date,
      }));
    } catch (error: any) {
      console.error("Search failed:", error.message || error);
      throw error;
    }
  }

  async post(username: string): Promise<PostResultItem[]> {
    try {
      const userData = await this.resolveWithClientId<{ id: number }>(
        "https://api-v2.soundcloud.com/resolve",
        { url: `https://soundcloud.com/${username}` }
      );

      if (!userData.id) {
        throw new Error("User ID not found");
      }

      const data = await this.resolveWithClientId<StreamResponse>(
        `https://api-v2.soundcloud.com/stream/users/${userData.id}`,
        {
          limit: 20,
          offset: 0,
          linked_partitioning: 1,
          app_version: 1735826482,
          app_locale: "en",
        }
      );

      const collection = Array.isArray(data?.collection) ? data.collection : [];
      return collection.map((item) => ({
        title: item.track.title,
        author: {
          avatar_url: item.track.user.avatar_url,
          full_name: item.track.user.full_name,
          id: item.track.user.id,
          type: item.track.user.kind,
          permalink_url: item.track.user.permalink_url,
          username: item.track.user.username,
          follow: item.track.user.followers_count,
        },
        downloadable: item.track.downloadable,
        likes_count: item.track.likes_count,
        comment_count: item.track.comment_count,
        url: item.track.permalink_url,
        genre: item.track.genre,
        description: item.track.description,
        duration: this.formatDuration(item.track.duration),
        id: item.track.id,
        display_date: item.track.display_date,
      }));
    } catch (error) {
      console.error("Error in post method:", error);
      throw error;
    }
  }
}

export default new SoundCloudAPI();
