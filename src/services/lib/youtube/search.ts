import axios from "axios";
import cheerio from "cheerio";

const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const ORIGIN = "https://www.youtube.com";

interface SearchOptions {
  hl?: string;
  gl?: string;
}

interface VideoResult {
  type: "video" | "live";
  videoId: string;
  url: string;
  title: string;
  author: string;
  timestamp: string;
  seconds: number;
  views: number;
  ago: string;
  thumbnail: string;
}

interface ChannelResult {
  type: "channel";
  id: string;
  title: string;
  name: string;
  url: string;
  subCount: number;
  videoCount: number;
  thumbnail?: string;
}

interface PlaylistResult {
  type: "playlist";
  listId: string;
  title: string;
  author: string;
  url: string;
  videoCount: number;
  thumbnail?: string;
}

interface SearchResult {
  videos: VideoResult[];
  channels: ChannelResult[];
  playlists: PlaylistResult[];
  live: VideoResult[];
  all: Array<VideoResult | ChannelResult | PlaylistResult>;
}

interface WalkHandlers {
  video?: (vr: any) => void;
  channel?: (cr: any) => void;
  playlist?: (pr: any) => void;
}

interface Thumbnail {
  url?: string;
  width?: number;
  height?: number;
}

function pick<T>(arr: T[] | undefined): T | undefined {
  if (!Array.isArray(arr) || !arr.length) return undefined;
  return arr[arr.length - 1] || arr[0];
}

function text(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.simpleText) return String(node.simpleText);
  if (Array.isArray(node.runs)) return node.runs.map((x: any) => x.text).join("");
  if (node.text) return String(node.text);
  return "";
}

function get(o: any, path: string): any {
  return String(path || "")
    .split(".")
    .reduce((a, k) => (a == null ? a : /^\d+$/.test(k) ? a[Number(k)] : a[k]), o);
}

function toSeconds(ts: string | undefined): number {
  if (!ts || /live/i.test(ts)) return 0;
  const parts = ts.split(":").map((n) => parseInt(n, 10));
  if (parts.some((x) => Number.isNaN(x))) return 0;
  return parts.reduce((s, v) => s * 60 + v, 0);
}

function parseNumberCompact(label: string | undefined): number {
  if (!label) return 0;
  const m = String(label)
    .toLowerCase()
    .replace(/,/g, "")
    .match(/(\d+(\.\d+)?)([kmb])?/);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  if (m[3] === "k") n *= 1e3;
  if (m[3] === "m") n *= 1e6;
  if (m[3] === "b") n *= 1e9;
  return Math.round(n);
}

function walkJSON(n: any, handlers: WalkHandlers): void {
  if (!n) return;
  if (Array.isArray(n)) {
    for (const x of n) walkJSON(x, handlers);
    return;
  }
  if (typeof n === "object") {
    if (n.videoRenderer && handlers.video) handlers.video(n.videoRenderer);
    if (n.channelRenderer && handlers.channel) handlers.channel(n.channelRenderer);
    if (n.playlistRenderer && handlers.playlist) handlers.playlist(n.playlistRenderer);
    for (const v of Object.values(n)) walkJSON(v, handlers);
  }
}

function extractInitialData(html: string): any | null {
  const $ = cheerio.load(html);
  let scripts = "";
  $("script").each((_, el) => {
    const t = $(el).contents().text();
    if (t && t.includes("ytInitialData")) scripts += t + "\n";
  });
  const idx = scripts.indexOf("ytInitialData");
  if (idx < 0) return null;
  let i = scripts.indexOf("{", idx);
  if (i < 0) return null;
  let depth = 0;
  for (let k = i; k < scripts.length; k++) {
    const c = scripts[k];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    if (depth === 0) {
      try {
        return JSON.parse(scripts.slice(i, k + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function fetchHTML(url: string, hl = "vi", gl = "VN"): Promise<string> {
  const res = await axios.get(url, {
    headers: {
      "user-agent": UA,
      "accept-language": `${hl}-${gl},${hl};q=0.9`,
      accept: "text/html"
    },
    decompress: true,
    maxRedirects: 5,
    timeout: 15000
  });
  return res.data;
}

function uniqueBy<T>(arr: T[], keyFn: (x: T) => any): T[] {
  const seen = new Set();
  const out: T[] = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

async function search(q: string, opts: SearchOptions = {}): Promise<SearchResult> {
  const hl = opts.hl || "vi";
  const gl = opts.gl || "VN";
  const qs = new URLSearchParams({ search_query: q, hl, gl }).toString();
  const url = `${ORIGIN}/results?${qs}`;
  const html = await fetchHTML(url, hl, gl);
  const data = extractInitialData(html);
  if (!data) return { videos: [], channels: [], playlists: [], live: [], all: [] };

  const videos: VideoResult[] = [];
  const channels: ChannelResult[] = [];
  const playlists: PlaylistResult[] = [];
  const live: VideoResult[] = [];

  walkJSON(data, {
    video(vr) {
      const id = vr.videoId;
      if (!id) return;
      const title = text(vr.title);
      const author = text(vr.ownerText) || text(vr.longBylineText) || "";
      const len =
        get(vr, "lengthText.simpleText") ||
        text(get(vr, "thumbnailOverlays.0.thumbnailOverlayTimeStatusRenderer.text")) ||
        "";
      const seconds = toSeconds(len);
      const thumbs = (get(vr, "thumbnail.thumbnails") || []) as Thumbnail[];
      const thumbnail = (pick(thumbs) as Thumbnail | undefined)?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      const views = parseNumberCompact(text(vr.viewCountText));
      const ago = text(vr.publishedTimeText) || "";
      const watching = /watching/i.test(text(vr.viewCountText));
      const badgeLive =
        String(text(get(vr, "badges.0.metadataBadgeRenderer.label"))).toUpperCase() ===
        "LIVE NOW";
      const overlayLive = /LIVE/i.test(
        text(get(vr, "thumbnailOverlays.0.thumbnailOverlayTimeStatusRenderer.text"))
      );
      const isLive = watching || badgeLive || overlayLive;

      const obj: VideoResult = {
        type: isLive ? "live" : "video",
        videoId: id,
        url: `${ORIGIN}/watch?v=${id}`,
        title,
        author,
        timestamp: len,
        seconds,
        views,
        ago,
        thumbnail
      };

      if (isLive) live.push(obj);
      else videos.push(obj);
    },
    channel(cr) {
      const id = get(cr, "channelId");
      const title = text(cr.title) || text(cr.displayName);
      const base =
        get(cr, "navigationEndpoint.browseEndpoint.canonicalBaseUrl") ||
        get(cr, "navigationEndpoint.browseEndpoint.url") ||
        `/channel/${id}`;
      const subs = parseNumberCompact(text(cr.subscriberCountText));
      const vidsLabel = text(cr.videoCountText) || "";
      const videoCount = parseNumberCompact(vidsLabel);
      const thumbs = (get(cr, "thumbnail.thumbnails") || []) as Thumbnail[];
      const thumbnail = (pick(thumbs) as Thumbnail | undefined)?.url;

      channels.push({
        type: "channel",
        id,
        title,
        name: title,
        url: `${ORIGIN}${base}`,
        subCount: subs,
        videoCount,
        thumbnail
      });
    },
    playlist(pr) {
      const listId = get(pr, "playlistId");
      if (!listId) return;
      const title = text(pr.title);
      const author = text(pr.shortBylineText) || "";
      const countLabel = text(pr.thumbnailText) || text(pr.videoCountText) || "";
      const videoCount = parseNumberCompact(countLabel);
      const thumbs = (get(pr, "thumbnails.0.thumbnails") || get(pr, "thumbnail.thumbnails") || []) as Thumbnail[];
      const thumbnail = (pick(thumbs) as Thumbnail | undefined)?.url;

      playlists.push({
        type: "playlist",
        listId,
        title,
        author,
        url: `${ORIGIN}/playlist?list=${listId}`,
        videoCount,
        thumbnail
      });
    }
  });

  const all = [...videos, ...live, ...playlists, ...channels];
  return {
    videos: uniqueBy(videos, (x) => x.videoId),
    live: uniqueBy(live, (x) => x.videoId),
    playlists: uniqueBy(playlists, (x) => x.listId),
    channels: uniqueBy(channels, (x) => x.url),
    all
  };
}

export default search;
