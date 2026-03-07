import axios, { AxiosInstance } from "axios";

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
  attachments: Array<{
    type: "Audio";
    url: string;
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
    this.request = axios.create({
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        referer: "https://soundcloud.com/",
        "sec-ch-ua":
          '"Chromium";v="115", "Not;A=Brand";v="24", "Google Chrome";v="115"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
        "accept-language": "en-US,en;q=0.9",
        "upgrade-insecure-requests": "1",
      },
      validateStatus: (status) => status < 500,
      timeout: 30000,
      maxRedirects: 5,
    });
  }

  private async getClientID(): Promise<string> {
    try {
      const mainPageHtml = await this.request
        .get<string>("https://soundcloud.com/")
        .then((res) => res.data);

      const scriptTags = mainPageHtml.split('<script crossorigin src="');
      const scriptUrls = scriptTags
        .filter((tag) => tag.startsWith("https"))
        .map((tag) => tag.split('"')[0]);

      if (!scriptUrls.length) {
        throw new Error("No script URLs found");
      }

      const scriptContent = await this.request
        .get<string>(scriptUrls[scriptUrls.length - 1])
        .then((res) => res.data);

      const clientIdMatch = scriptContent.match(/client_id:"([^"]+)"/);
      if (!clientIdMatch) {
        throw new Error("Client ID not found in script");
      }

      return clientIdMatch[1];
    } catch (error: any) {
      console.error("Failed to get client ID:", error.message || error);
      throw error;
    }
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

      const initialResponse = await this.request.get(link);
      const responseUrl: string =  (initialResponse.request as any)?.res?.responseUrl || link;
      const responseData = decodeURIComponent(responseUrl);
      const urlParts = responseData.replace("m.soundcloud.com", "soundcloud.com");
      const { data } = await this.request.get<SoundCloudTrack>(
        `https://api-v2.soundcloud.com/resolve?url=${urlParts}&client_id=${clientId}`
      );
      const progressiveUrl = data?.media?.transcodings?.find(
        (t) => t.format.protocol === "progressive"
      )?.url;
      if (!progressiveUrl) throw new Error("No suitable data found");

      const streamData = await this.request.get<{ url: string }>(
        `${progressiveUrl}?client_id=${clientId}&track_authorization=${data.track_authorization}`
      );

      const { url } = streamData.data;

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
        attachments: [
          {
            type: "Audio",
            url,
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
      const clientId = await this.getClientID();

      const { data } = await this.request.get<SearchResponse>(
        `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
          keywords
        )}&client_id=${clientId}&limit=${limit}`
      );

      return data.collection.map((track) => ({
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
      const clientId = await this.getClientID();

      const { data: userData } = await this.request.get<{ id: number }>(
        `https://api-v2.soundcloud.com/resolve?url=https://soundcloud.com/${username}&client_id=${clientId}`
      );

      if (!userData.id) {
        throw new Error("User ID not found");
      }

      const { data } = await this.request.get<StreamResponse>(
        `https://api-v2.soundcloud.com/stream/users/${userData.id}?client_id=${clientId}&limit=20&offset=0&linked_partitioning=1&app_version=1735826482&app_locale=en`
      );

      return data.collection.map((item) => ({
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
