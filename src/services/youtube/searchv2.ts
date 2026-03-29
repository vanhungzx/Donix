import axios from "axios";
import type {
  SearchOptions,
  SearchV2Response,
  SearchV2Result,
  TextNode,
  UnknownRecord,
} from "./lib/types.js";

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const isTextNode = (value: unknown): value is TextNode =>
  isRecord(value) &&
  (typeof value.simpleText === "string" ||
    typeof value.text === "string" ||
    Array.isArray(value.runs));

function extractVal(source: string, key: string): string | null {
  const match = source.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
  return match ? match[1] : null;
}

function text(node: unknown): string {
  if (typeof node === "string") return node;
  if (!isTextNode(node)) return "";
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
  return path.split(".").reduce<unknown>((currentValue, key) => {
    if (currentValue == null) return undefined;
    if (/^\d+$/.test(key)) {
      return Array.isArray(currentValue) ? currentValue[Number(key)] : undefined;
    }
    return isRecord(currentValue) ? currentValue[key] : undefined;
  }, objectValue);
}

function extractResults(json: UnknownRecord): SearchV2Result[] {
  const primarySections = get(
    json,
    "contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents"
  );
  const continuationCommands = get(json, "onResponseReceivedCommands");
  const items = Array.isArray(primarySections)
    ? primarySections.flatMap(section => {
        const contents = get(section, "itemSectionRenderer.contents");
        return Array.isArray(contents) ? contents : [];
      })
    : Array.isArray(continuationCommands)
      ? continuationCommands.flatMap(command => {
          const continuationItems = get(command, "appendContinuationItemsAction.continuationItems");
          return Array.isArray(continuationItems) ? continuationItems : [];
        })
      : [];

  const output: SearchV2Result[] = [];
  for (const item of items) {
    if (!isRecord(item) || !isRecord(item.videoRenderer)) continue;
    const videoRenderer = item.videoRenderer;
    const id = typeof videoRenderer.videoId === "string" ? videoRenderer.videoId : "";
    if (!id) continue;
    const length = text(videoRenderer.lengthText) || null;
    output.push({
      id,
      title: text(videoRenderer.title),
      channel: text(videoRenderer.ownerText),
      length,
      url: `https://www.youtube.com/watch?v=${id}`,
    });
  }
  return output;
}

interface SearchConfig {
  clientVersion: string;
  gl: string;
  hl: string;
  key: string;
  visitor: string;
}

async function fetchYtCfg({ hl = "vi", gl = "VN" }: SearchOptions = {}): Promise<SearchConfig> {
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
  const response = await axios.get<string>("https://www.youtube.com/", {
    params: { hl, gl },
    headers: {
      "user-agent": userAgent,
      "accept-language": "vi,en-US;q=0.9,en;q=0.8",
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    },
    timeout: 20000,
    withCredentials: false,
    decompress: true,
  });

  const html = String(response.data || "");
  const key = extractVal(html, "INNERTUBE_API_KEY");
  if (!key) throw new Error("INNERTUBE_API_KEY not found");

  return {
    key,
    clientVersion:
      extractVal(html, "INNERTUBE_CONTEXT_CLIENT_VERSION") ||
      extractVal(html, "CLIENT_VERSION") ||
      "2.20250101.01.00",
    visitor: extractVal(html, "VISITOR_DATA") || "",
    hl,
    gl,
  };
}

async function searchv2(query: string, opts: SearchOptions = {}): Promise<SearchV2Response> {
  const cfg =
    opts.key && opts.clientVersion
      ? {
          key: opts.key,
          clientVersion: opts.clientVersion,
          visitor: opts.visitor || "",
          hl: opts.hl || "vi",
          gl: opts.gl || "VN",
        }
      : await fetchYtCfg({ hl: opts.hl, gl: opts.gl });

  const body = {
    context: {
      client: {
        hl: cfg.hl,
        gl: cfg.gl,
        clientName: "WEB",
        clientVersion: cfg.clientVersion,
        userInterfaceTheme: "USER_INTERFACE_THEME_DARK",
        timeZone: "Asia/Saigon",
      },
      user: { lockedSafetyMode: false },
      request: { useSsl: true, internalExperimentFlags: [] },
    },
    query: String(query || ""),
  };

  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
  const { data } = await axios.post<unknown>("https://www.youtube.com/youtubei/v1/search", body, {
    params: { prettyPrint: "false", key: cfg.key },
    headers: {
      "content-type": "application/json",
      accept: "*/*",
      "accept-language": "vi,en-US;q=0.9,en;q=0.8",
      origin: "https://www.youtube.com",
      referer: `https://www.youtube.com/results?search_query=${encodeURIComponent(String(query || ""))}`,
      "user-agent": userAgent,
      "x-origin": "https://www.youtube.com",
      "x-youtube-client-name": "1",
      "x-youtube-client-version": cfg.clientVersion,
      ...(cfg.visitor ? { "x-goog-visitor-id": cfg.visitor } : {}),
    },
    timeout: 20000,
    withCredentials: false,
    decompress: true,
    validateStatus: status => status >= 200 && status < 500,
  });

  if (!isRecord(data)) {
    throw new Error("Invalid response");
  }

  return { raw: data, results: extractResults(data) };
}

export default searchv2;
