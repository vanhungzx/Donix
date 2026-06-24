import axios, { AxiosInstance } from "axios";
import crypto from "crypto";

class ZingMp3Api {
  private readonly VERSION: string;
  private readonly URL: string;
  private readonly SECRET_KEY: string;
  private readonly API_KEY: string;
  private readonly CTIME: string;

  constructor(VERSION: string, URL: string, SECRET_KEY: string, API_KEY: string, CTIME: string) {
    this.VERSION = VERSION;
    this.URL = URL;
    this.SECRET_KEY = SECRET_KEY;
    this.API_KEY = API_KEY;
    this.CTIME = CTIME;
  }

  private getHash256(str: string): string {
    return crypto.createHash("sha256").update(str).digest("hex");
  }

  private getHmac512(str: string, key: string): string {
    return crypto.createHmac("sha512", key).update(Buffer.from(str, "utf8")).digest("hex");
  }

  private hashParamNoId(path: string): string {
    return this.getHmac512(path + this.getHash256(`ctime=${this.CTIME}version=${this.VERSION}`), this.SECRET_KEY);
  }

  private hashParam(path: string, id: string): string {
    return this.getHmac512(path + this.getHash256(`ctime=${this.CTIME}id=${id}version=${this.VERSION}`), this.SECRET_KEY);
  }

  private hashParamHome(path: string): string {
    return this.getHmac512(
      path + this.getHash256(`count=30ctime=${this.CTIME}page=1version=${this.VERSION}`),
      this.SECRET_KEY
    );
  }

  private hashCategoryMV(path: string, id: string, type: string): string {
    return this.getHmac512(
      path + this.getHash256(`ctime=${this.CTIME}id=${id}type=${type}version=${this.VERSION}`),
      this.SECRET_KEY
    );
  }

  private hashListMV(path: string, id: string, type: string, page: number, count: number): string {
    return this.getHmac512(
      path + this.getHash256(`count=${count}ctime=${this.CTIME}id=${id}page=${page}type=${type}version=${this.VERSION}`),
      this.SECRET_KEY
    );
  }

  private getCookie(): Promise<string> {
    return new Promise((resolve, reject) => {
      axios
        .get(this.URL)
        .then((res) => {
          if (res.headers["set-cookie"]) {
            resolve(res.headers["set-cookie"][1] || "");
          } else {
            reject(new Error("No cookie found"));
          }
        })
        .catch(reject);
    });
  }

  private requestZingMp3(path: string, qs: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      const client: AxiosInstance = axios.create({ baseURL: this.URL });
      client.interceptors.response.use((res) => res.data);
      this.getCookie()
        .then((cookie) => {
          client
            .get(path, {
              headers: { Cookie: cookie },
              params: Object.assign({}, qs, {
                ctime: this.CTIME,
                version: this.VERSION,
                apiKey: this.API_KEY
              })
            })
            .then(resolve)
            .catch(reject);
        })
        .catch((error) => {
          console.log(error);
          reject(error);
        });
    });
  }

  getStream(songId: string): Promise<any> {
    return this.requestZingMp3("/api/v2/song/get/streaming", {
      id: songId,
      sig: this.hashParam("/api/v2/song/get/streaming", songId)
    });
  }

  getDetailPlaylist(playlistId: string): Promise<any> {
    return this.requestZingMp3("/api/v2/page/get/playlist", {
      id: playlistId,
      sig: this.hashParam("/api/v2/page/get/playlist", playlistId)
    });
  }

  getHome(): Promise<any> {
    return this.requestZingMp3("/api/v2/page/get/home", {
      page: 1,
      segmentId: "-1",
      count: "30",
      sig: this.hashParamHome("/api/v2/page/get/home")
    });
  }

  getTop100(): Promise<any> {
    return this.requestZingMp3("/api/v2/page/get/top-100", {
      sig: this.hashParamNoId("/api/v2/page/get/top-100")
    });
  }

  getChartHome(): Promise<any> {
    return this.requestZingMp3("/api/v2/page/get/chart-home", {
      sig: this.hashParamNoId("/api/v2/page/get/chart-home")
    });
  }

  getNewReleaseChart(): Promise<any> {
    return this.requestZingMp3("/api/v2/page/get/newrelease-chart", {
      sig: this.hashParamNoId("/api/v2/page/get/newrelease-chart")
    });
  }

  getInfoSong(songId: string): Promise<any> {
    return this.requestZingMp3("/api/v2/song/get/info", {
      id: songId,
      sig: this.hashParam("/api/v2/song/get/info", songId)
    });
  }

  getListArtistSong(artistId: string, page: number, count: number): Promise<any> {
    return this.requestZingMp3("/api/v2/song/get/list", {
      id: artistId,
      type: "artist",
      page,
      count,
      sort: "new",
      sectionId: "aSong",
      sig: this.hashListMV("/api/v2/song/get/list", artistId, "artist", page, count)
    });
  }

  getArtist(name: string): Promise<any> {
    return this.requestZingMp3("/api/v2/page/get/artist", {
      alias: name,
      sig: this.hashParamNoId("/api/v2/page/get/artist")
    });
  }

  getLyric(songId: string): Promise<any> {
    return this.requestZingMp3("/api/v2/lyric/get/lyric", {
      id: songId,
      sig: this.hashParam("/api/v2/lyric/get/lyric", songId)
    });
  }

  search(name: string): Promise<any> {
    return this.requestZingMp3("/api/v2/search/multi", {
      q: name,
      sig: this.hashParamNoId("/api/v2/search/multi")
    });
  }

  getListMV(id: string, page: number, count: number): Promise<any> {
    return this.requestZingMp3("/api/v2/video/get/list", {
      id,
      type: "genre",
      page,
      count,
      sort: "listen",
      sig: this.hashListMV("/api/v2/video/get/list", id, "genre", page, count)
    });
  }

  getCategoryMV(id: string): Promise<any> {
    return this.requestZingMp3("/api/v2/genre/get/info", {
      id,
      type: "video",
      sig: this.hashCategoryMV("/api/v2/genre/get/info", id, "video")
    });
  }

  getVideo(videoId: string): Promise<any> {
    return this.requestZingMp3("/api/v2/page/get/video", {
      id: videoId,
      sig: this.hashParam("/api/v2/page/get/video", videoId)
    });
  }
}

const zingMp3Api = new ZingMp3Api(
  "1.12.3",
  "https://zingmp3.vn",
  "2aa2d1c561e809b267f3638c4a307aab",
  "88265e23d4284f25963e6eedac8fbfa3",
  String(Math.floor(Date.now() / 1000))
);

export default zingMp3Api;
