import axios from "axios";

function extractVal(s: string, k: string): string | null {
  const m = s.match(new RegExp(`"${k}"\\s*:\\s*"([^"]+)"`));
  return m ? m[1] : null;
}

export type SearchResultItem = {
  id: string;
  title: string;
  channel: string;
  length: string | null;
  url: string;
};

type YtCfg = {
  key: string;
  clientVersion: string;
  visitor: string;
  hl: string;
  gl: string;
};

export type SearchOptions = {
  key?: string;
  clientVersion?: string;
  visitor?: string;
  hl?: string;
  gl?: string;
};

export type SearchResponse = {
  raw: any;
  results: SearchResultItem[];
};

function extractResults(json: any): SearchResultItem[] {
  const items: any[] =
    (json?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.flatMap(
      (c: any) => c.itemSectionRenderer?.contents || []
    ) ||
      json?.onResponseReceivedCommands?.flatMap(
        (c: any) => c.appendContinuationItemsAction?.continuationItems || []
      )) ||
    [];
  const out: SearchResultItem[] = [];
  for (const it of items) {
    const v = it.videoRenderer;
    if (!v) continue;
    const id = v.videoId as string;
    const title =
      (v.title?.runs?.map((r: any) => r.text).join("") as string) || "";
    const channel =
      (v.ownerText?.runs?.map((r: any) => r.text).join("") as string) || "";
    const length =
      (v.lengthText?.simpleText as string) ||
      (v.lengthText?.runs?.map((r: any) => r.text).join("") as string) ||
      null;
    out.push({
      id,
      title,
      channel,
      length,
      url: `https://www.youtube.com/watch?v=${id}`,
    });
  }
  return out;
}

async function fetchYtCfg({
  hl = "vi",
  gl = "VN",
}: {
  hl?: string;
  gl?: string;
} = {}): Promise<YtCfg> {
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
  const res = await axios.get<string>("https://www.youtube.com/", {
    params: { hl, gl },
    headers: {
      "user-agent": UA,
      "accept-language": "vi,en-US;q=0.9,en;q=0.8",
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    },
    timeout: 20000,
    withCredentials: false,
  });
  const html = String(res.data || "");
  const key = extractVal(html, "INNERTUBE_API_KEY");
  const clientVersion =
    extractVal(html, "INNERTUBE_CONTEXT_CLIENT_VERSION") ||
    extractVal(html, "CLIENT_VERSION") ||
    "2.20250101.01.00";
  const visitor = extractVal(html, "VISITOR_DATA") || "";
  if (!key) throw new Error("INNERTUBE_API_KEY not found");
  return { key, clientVersion, visitor, hl, gl };
}

export default async function searchv2(
  query: string,
  opts: SearchOptions = {}
): Promise<SearchResponse> {
  const cfg: YtCfg =
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
      request: { useSsl: true, internalExperimentFlags: [] as any[] },
    },
    query: String(query || ""),
  };
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
  const { data } = await axios.post<any>(
    "https://www.youtube.com/youtubei/v1/search",
    body,
    {
      params: { prettyPrint: "false", key: cfg.key },
      headers: {
        "content-type": "application/json",
        accept: "*/*",
        "accept-language": "vi,en-US;q=0.9,en;q=0.8",
        origin: "https://www.youtube.com",
        referer: `https://www.youtube.com/results?search_query=${encodeURIComponent(
          String(query || "")
        )}`,
        "user-agent": UA,
        "x-origin": "https://www.youtube.com",
        "x-youtube-client-name": "1",
        "x-youtube-client-version": cfg.clientVersion,
        ...(cfg.visitor ? { "x-goog-visitor-id": cfg.visitor } : {}),
      },
      timeout: 20000,
      withCredentials: false,
      validateStatus: s => s >= 200 && s < 500,
    }
  );
  if (!data || typeof data !== "object") throw new Error("Invalid response");
  return { raw: data, results: extractResults(data) };
}
