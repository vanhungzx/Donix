import axios, { AxiosInstance } from "axios";

type StreamItem = {
  type?: string;
  typeUI?: string;
  stream?: string | null;
  download?: string | null;
  onlyVIP?: boolean;
  status?: number;
  order?: number;
};

type StreamsMap = {
  [key: string]: {
    stream: string | null;
    download: string | null;
    onlyVIP: boolean;
    status: number;
    order: number;
  };
};

type BestStream = {
  type: string;
  url: string | null;
} | null;

type Artist = {
  name: string;
};

type Provider = {
  name?: string;
};

type SongRaw = {
  key?: string;
  name?: string;
  artist?: Artist[];
  artistName?: string;
  duration?: number;
  image?: string;
  bgImage?: string;
  linkShare?: string;
  dateRelease?: string;
  genreId?: string;
  genreName?: string;
  provider?: Provider;
  totalLiked?: number;
  shareCnt?: number;
  commentCnt?: number;
  vipFree?: boolean;
  streamURL?: StreamItem[];
};

type NormalizedSong = {
  key: string | null;
  title: string | null;
  artists: string[];
  duration: number;
  image: string | null;
  linkShare: string | null;
  releasedAt: string | null;
  genre: {
    id: string | null;
    name: string | null;
  };
  provider: string | null;
  liked: number;
  shareCnt: number;
  commentCnt: number;
  vipFree: boolean;
  qualities: string[];
  streams: StreamsMap;
  best: BestStream;
};

type LyricsData = any;

type HomeData = any;

type ChartsData = any;

interface NctAPIConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

class NctAPI {
  private client: AxiosInstance;
  private extraHeaders: Record<string, string>;

  constructor({ baseURL = "https://graph.nhaccuatui.com", timeout = 20000, headers = {} }: NctAPIConfig = {}) {
    this.client = axios.create({
      baseURL,
      timeout,
      validateStatus: (s) => s >= 200 && s < 600
    });
    this.extraHeaders = { ...headers };
  }

  setHeader(key: string, value: string): this {
    this.extraHeaders[key] = value;
    return this;
  }

  setBearer(token: string): this {
    if (token) this.extraHeaders.authorization = token;
    return this;
  }

  private ts(): number {
    return Date.now();
  }

  private buildHeaders(ts: number): Record<string, string> {
    return { "x-nct-time": String(ts), ...this.extraHeaders };
  }

  static toStreamsMap(list: StreamItem[] = []): StreamsMap {
    const map: StreamsMap = {};
    for (const u of list) {
      const t = u.type || u.typeUI || "";
      if (!t) continue;
      map[t] = {
        stream: u.stream || null,
        download: u.download || null,
        onlyVIP: !!u.onlyVIP,
        status: u.status || 0,
        order: u.order || 0
      };
    }
    return map;
  }

  static pickBestNonVIP(list: StreamItem[] = [], pref: string[] = ["lossless", "320", "128"]): BestStream {
    for (const t of pref) {
      const x = list.find((v) => (v.type === t || v.typeUI === t) && v.status === 1 && !v.onlyVIP);
      if (x) return { type: t, url: x.stream || x.download || null };
    }
    return null;
  }

  static normalizeSong(s: SongRaw = {}): NormalizedSong {
    const streams = NctAPI.toStreamsMap(s.streamURL || []);
    const best = NctAPI.pickBestNonVIP(s.streamURL || []);
    return {
      key: s.key || null,
      title: s.name || null,
      artists:
        Array.isArray(s.artist) && s.artist.length
          ? s.artist.map((a) => a.name).filter(Boolean)
          : s.artistName
            ? String(s.artistName)
                .split(",")
                .map((v) => v.trim())
            : [],
      duration: s.duration || 0,
      image: s.image || s.bgImage || null,
      linkShare: s.linkShare || null,
      releasedAt: s.dateRelease || null,
      genre: { id: s.genreId || null, name: s.genreName || null },
      provider: s.provider?.name || null,
      liked: s.totalLiked || 0,
      shareCnt: s.shareCnt || 0,
      commentCnt: s.commentCnt || 0,
      vipFree: !!s.vipFree,
      qualities: Object.keys(streams),
      streams,
      best
    };
  }

  async search(keyword: string, correct: boolean = false): Promise<NormalizedSong[]> {
    const ts = this.ts();
    const res = await this.client.post(
      "/api/v3/search/all",
      {},
      {
        params: { keyword, correct, timestamp: ts },
        headers: this.buildHeaders(ts)
      }
    );
    if (res.status >= 400 || !res.data) throw new Error("Search failed");
    const d = (res.data as any)?.data || {};
    const songs = Array.isArray(d.songs) ? d.songs.map(NctAPI.normalizeSong) : [];
    return songs;
  }

  async lyrics(songKey: string): Promise<LyricsData> {
    const ts = this.ts();
    const res = await this.client.get("/api/v1/song/lyric/detail", {
      params: { songKey, timestamp: ts },
      headers: this.buildHeaders(ts)
    });
    if (res.status >= 400 || !res.data) throw new Error("Lyrics fetch failed");
    return (res.data as any).data || {};
  }

  async down(songKey: string): Promise<NormalizedSong> {
    const ts = this.ts();
    const res = await this.client.get(`/api/v1/song/detail/${songKey}`, {
      params: { isDailyMix: false, key: songKey, timestamp: ts },
      headers: this.buildHeaders(ts)
    });
    if (res.status >= 400 || !res.data) throw new Error("Song detail fetch failed");
    return NctAPI.normalizeSong((res.data as any).data || {});
  }

  async feed(): Promise<NormalizedSong[]> {
    const ts = this.ts();
    const res = await this.client.get("/api/v1/song/feed", {
      params: { timestamp: ts },
      headers: this.buildHeaders(ts)
    });
    if (res.status >= 400 || !res.data) throw new Error("Song feed fetch failed");
    const items = Array.isArray((res.data as any).data) ? (res.data as any).data : [];
    return items.map(NctAPI.normalizeSong);
  }

  async home(): Promise<HomeData> {
    const ts = this.ts();
    const res = await this.client.get("/api/v6/app/home/index", {
      params: { timestamp: ts },
      headers: this.buildHeaders(ts)
    });
    if (res.status >= 400 || !res.data) throw new Error("Home index fetch failed");
    return (res.data as any).data || {};
  }

  async radio(id: number = 33, pn: number = 0, rn: number = 99): Promise<NormalizedSong[]> {
    const ts = this.ts();
    const res = await this.client.get("/api/v1/radio/musiclist", {
      params: { id, pn, rn, timestamp: ts },
      headers: this.buildHeaders(ts)
    });
    if (res.status >= 400 || !res.data) throw new Error("Radio music list fetch failed");
    const items = Array.isArray((res.data as any).data) ? (res.data as any).data : [];
    return items.map(NctAPI.normalizeSong);
  }

  async charts(id: string = "1-5-d281-2025", key: string = "1-5-d281-2025"): Promise<ChartsData> {
    const ts = this.ts();
    const res = await this.client.get(`/api/v1/playlist/charts/${id}`, {
      params: { key, isShowLoading: false, timestamp: ts },
      headers: this.buildHeaders(ts)
    });
    if (res.status >= 400 || !res.data) throw new Error("Playlist charts fetch failed");
    return (res.data as any).data || {};
  }
}

const nctAPI = new NctAPI();
export default nctAPI;
