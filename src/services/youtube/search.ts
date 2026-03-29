import axios from "axios";
import cheerio from "cheerio";
import type {
  SearchChannelResult,
  SearchOptions,
  SearchPlaylistResult,
  SearchResult,
  SearchVideoResult,
  Thumbnail,
  UnknownRecord,
} from "./lib/types.js";

const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const ORIGIN = "https://www.youtube.com";

interface WalkHandlers {
  channel?: (renderer: UnknownRecord) => void;
  playlist?: (renderer: UnknownRecord) => void;
  video?: (renderer: UnknownRecord) => void;
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

function pick<T>(arr: readonly T[] | undefined): T | undefined {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  return arr[arr.length - 1] ?? arr[0];
}

function text(node: unknown): string {
  if (typeof node === "string") return node;
  if (!isRecord(node)) return "";
  if (typeof node.simpleText === "string") return node.simpleText;
  if (Array.isArray(node.runs)) {
    return node.runs
      .map(item => (isRecord(item) && typeof item.text === "string" ? item.text : ""))
      .join("");
  }
  if (typeof node.text === "string") return node.text;
  return "";
}

function get(objectValue: unknown, path: string): unknown {
  return String(path || "")
    .split(".")
    .reduce<unknown>((currentValue, key) => {
      if (currentValue == null) return undefined;
      if (/^\d+$/.test(key)) {
        return Array.isArray(currentValue) ? currentValue[Number(key)] : undefined;
      }
      return isRecord(currentValue) ? currentValue[key] : undefined;
    }, objectValue);
}

function toSeconds(timestamp: string | undefined): number {
  if (!timestamp || /live/i.test(timestamp)) return 0;
  const parts = timestamp.split(":").map(value => Number.parseInt(value, 10));
  if (parts.some(value => Number.isNaN(value))) return 0;
  return parts.reduce((sum, value) => sum * 60 + value, 0);
}

function parseNumberCompact(label: string | undefined): number {
  if (!label) return 0;
  const match = String(label)
    .toLowerCase()
    .replace(/,/g, "")
    .match(/(\d+(\.\d+)?)([kmb])?/);
  if (!match) return 0;
  let value = Number.parseFloat(match[1]);
  if (match[3] === "k") value *= 1e3;
  if (match[3] === "m") value *= 1e6;
  if (match[3] === "b") value *= 1e9;
  return Math.round(value);
}

function walkJSON(node: unknown, handlers: WalkHandlers): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) walkJSON(item, handlers);
    return;
  }
  if (!isRecord(node)) return;
  if (isRecord(node.videoRenderer) && handlers.video) handlers.video(node.videoRenderer);
  if (isRecord(node.channelRenderer) && handlers.channel) handlers.channel(node.channelRenderer);
  if (isRecord(node.playlistRenderer) && handlers.playlist) handlers.playlist(node.playlistRenderer);
  for (const value of Object.values(node)) walkJSON(value, handlers);
}

function extractInitialData(html: string): UnknownRecord | null {
  const $ = cheerio.load(html);
  let scripts = "";
  $("script").each((_, element) => {
    const content = $(element).contents().text();
    if (content && content.includes("ytInitialData")) scripts += `${content}\n`;
  });
  const markerIndex = scripts.indexOf("ytInitialData");
  if (markerIndex < 0) return null;
  const startIndex = scripts.indexOf("{", markerIndex);
  if (startIndex < 0) return null;

  let depth = 0;
  for (let index = startIndex; index < scripts.length; index++) {
    const char = scripts[index];
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth !== 0) continue;
    try {
      const parsed = JSON.parse(scripts.slice(startIndex, index + 1));
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchHTML(url: string, hl = "vi", gl = "VN"): Promise<string> {
  const response = await axios.get<string>(url, {
    headers: {
      "user-agent": UA,
      "accept-language": `${hl}-${gl},${hl};q=0.9`,
      accept: "text/html",
    },
    decompress: true,
    maxRedirects: 5,
    timeout: 15000,
  });
  return typeof response.data === "string" ? response.data : String(response.data);
}

function uniqueBy<T, K>(arr: readonly T[], keyFn: (value: T) => K): T[] {
  const seen = new Set<K>();
  const output: T[] = [];
  for (const item of arr) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

async function search(query: string, opts: SearchOptions = {}): Promise<SearchResult> {
  const hl = opts.hl || "vi";
  const gl = opts.gl || "VN";
  const queryString = new URLSearchParams({ search_query: query, hl, gl }).toString();
  const html = await fetchHTML(`${ORIGIN}/results?${queryString}`, hl, gl);
  const data = extractInitialData(html);

  if (!data) {
    return { videos: [], channels: [], playlists: [], live: [], all: [] };
  }

  const videos: SearchVideoResult[] = [];
  const channels: SearchChannelResult[] = [];
  const playlists: SearchPlaylistResult[] = [];
  const live: SearchVideoResult[] = [];

  walkJSON(data, {
    video(renderer) {
      const id = typeof renderer.videoId === "string" ? renderer.videoId : "";
      if (!id) return;
      const title = text(renderer.title);
      const author = text(renderer.ownerText) || text(renderer.longBylineText) || "";
      const lengthText =
        (typeof get(renderer, "lengthText.simpleText") === "string"
          ? (get(renderer, "lengthText.simpleText") as string)
          : "") ||
        text(get(renderer, "thumbnailOverlays.0.thumbnailOverlayTimeStatusRenderer.text")) ||
        "";
      const seconds = toSeconds(lengthText);
      const thumbnailList = get(renderer, "thumbnail.thumbnails");
      const thumbnails = Array.isArray(thumbnailList) ? (thumbnailList as Thumbnail[]) : [];
      const thumbnail = pick(thumbnails)?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      const views = parseNumberCompact(text(renderer.viewCountText));
      const ago = text(renderer.publishedTimeText) || "";
      const watching = /watching/i.test(text(renderer.viewCountText));
      const badgeLive =
        String(text(get(renderer, "badges.0.metadataBadgeRenderer.label"))).toUpperCase() ===
        "LIVE NOW";
      const overlayLive = /LIVE/i.test(
        text(get(renderer, "thumbnailOverlays.0.thumbnailOverlayTimeStatusRenderer.text"))
      );
      const result: SearchVideoResult = {
        type: watching || badgeLive || overlayLive ? "live" : "video",
        videoId: id,
        url: `${ORIGIN}/watch?v=${id}`,
        title,
        author,
        timestamp: lengthText,
        seconds,
        views,
        ago,
        thumbnail,
      };
      if (result.type === "live") live.push(result);
      else videos.push(result);
    },
    channel(renderer) {
      const id = get(renderer, "channelId");
      if (typeof id !== "string" || !id) return;
      const title = text(renderer.title) || text(renderer.displayName);
      const base =
        (typeof get(renderer, "navigationEndpoint.browseEndpoint.canonicalBaseUrl") === "string"
          ? (get(renderer, "navigationEndpoint.browseEndpoint.canonicalBaseUrl") as string)
          : "") ||
        (typeof get(renderer, "navigationEndpoint.browseEndpoint.url") === "string"
          ? (get(renderer, "navigationEndpoint.browseEndpoint.url") as string)
          : "") ||
        `/channel/${id}`;
      const thumbnailList = get(renderer, "thumbnail.thumbnails");
      const thumbnails = Array.isArray(thumbnailList) ? (thumbnailList as Thumbnail[]) : [];
      channels.push({
        type: "channel",
        id,
        title,
        name: title,
        url: `${ORIGIN}${base}`,
        subCount: parseNumberCompact(text(renderer.subscriberCountText)),
        videoCount: parseNumberCompact(text(renderer.videoCountText)),
        thumbnail: pick(thumbnails)?.url,
      });
    },
    playlist(renderer) {
      const listId = get(renderer, "playlistId");
      if (typeof listId !== "string" || !listId) return;
      const nestedThumbs = get(renderer, "thumbnails.0.thumbnails");
      const directThumbs = get(renderer, "thumbnail.thumbnails");
      const thumbnails = Array.isArray(nestedThumbs)
        ? (nestedThumbs as Thumbnail[])
        : Array.isArray(directThumbs)
          ? (directThumbs as Thumbnail[])
          : [];
      const title = text(renderer.title);
      playlists.push({
        type: "playlist",
        listId,
        title,
        author: text(renderer.shortBylineText) || "",
        url: `${ORIGIN}/playlist?list=${listId}`,
        videoCount: parseNumberCompact(text(renderer.thumbnailText) || text(renderer.videoCountText)),
        thumbnail: pick(thumbnails)?.url,
      });
    },
  });

  const all = [...videos, ...live, ...playlists, ...channels];
  return {
    videos: uniqueBy(videos, item => item.videoId),
    live: uniqueBy(live, item => item.videoId),
    playlists: uniqueBy(playlists, item => item.listId),
    channels: uniqueBy(channels, item => item.url),
    all,
  };
}

export default search;
