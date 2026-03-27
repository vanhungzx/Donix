"use strict";

import axios from "axios";
import crypto from "crypto";
import type { Context, DefaultFuncs } from "../../request/formatters/helpers";

export const DEFAULT_ORCA_UA =
  "Dalvik/2.1.0 (Linux; U; Android 9; 23113RKC6C Build/PQ3A.190605.06171036) [FBAN/Orca-Android;FBAV/536.0.0.46.216;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/840054738;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBDV/23113RKC6C;FBSV/9;FBCA/x86_64:arm64-v8a;FBDM/{density=3.0,width=1080,height=1920};FB_FW/1;]";

// NOTE:
// - `x-zero-eh` thường thay đổi theo device/session. Ở repo đã có nhiều chỗ dùng constant.
// - Nếu bạn có `x-zero-eh` tốt hơn, có thể inject qua options.
export const DEFAULT_X_ZERO_EH = "2,,";

export interface FetchMessengerMusicPickerOptimalQueryOptions {
  accessToken: string;
  searchText: string | null;
  pageSize?: number;
  endCursor?: string | null;
  browseSessionId?: string;
  locale?: string;
  userAgent?: string;
  xZeroEh?: string;
  /** Mặc định `MSGR_NOTES` (ghi chú). Dùng `MSGR_DIRECT_MUSIC_STICKER` cho sticker nhạc trong chat. */
  product?: string;
  /** Mặc định `https://b-graph.facebook.com/graphql`. */
  graphqlUrl?: string;
}

export interface MessengerMusicPickerPageInfo {
  end_cursor?: string | null;
  has_next_page?: boolean;
}

export interface MessengerMusicPickerSong {
  audio_cluster_id?: string | number;
  duration_ms?: number;
  highlights?: number[];
  is_explicit?: boolean;
  has_lyrics?: boolean;
  title?: { text?: string };
  subtitle?: { text?: string };
  cover_artwork?: { uri?: string };
  cover_artwork_large?: { uri?: string };
  progressive_download?: { id?: string; url?: string };
}

export interface FetchMessengerMusicPickerOptimalQueryResult {
  songs: MessengerMusicPickerSong[];
  page_info?: MessengerMusicPickerPageInfo;
  raw: any;
}

export async function fetchMessengerMusicPickerOptimalQuery(
  options: FetchMessengerMusicPickerOptimalQueryOptions
): Promise<FetchMessengerMusicPickerOptimalQueryResult> {
  const {
    accessToken,
    searchText,
    pageSize = 20,
    endCursor = null,
    browseSessionId = crypto.randomUUID(),
    locale = "vi_VN",
    userAgent = DEFAULT_ORCA_UA,
    xZeroEh = DEFAULT_X_ZERO_EH,
    product = "MSGR_NOTES",
    graphqlUrl = "https://b-graph.facebook.com/graphql",
  } = options;

  if (!accessToken) {
    throw new Error("Access token is required (EAAD/...).");
  }

  const deviceId = crypto.randomUUID();
  const appScopeId = crypto.randomUUID();
  const clientTraceId = crypto.randomUUID();
  const connUuidClient = crypto.randomUUID().replace(/-/g, "");

  const form = new URLSearchParams();
  form.append("method", "post");
  form.append("pretty", "false");
  form.append("format", "json");
  form.append("server_timestamps", "true");
  form.append("locale", locale);
  form.append("fb_api_req_friendly_name", "FetchMessengerMusicPickerOptimalQuery");
  form.append("fb_api_caller_class", "graphservice");
  form.append("client_doc_id", "132851658514471529076136953628");
  form.append("fb_api_client_context", JSON.stringify({ is_background: false }));
  form.append(
    "variables",
    JSON.stringify({
      params: {
        search_text: searchText,
        product,
        page_size: pageSize,
        end_cursor: endCursor,
      },
      browse_session_id: browseSessionId,
    })
  );
  form.append("fb_api_analytics_tags", JSON.stringify(["GraphServices"]));
  form.append("client_trace_id", clientTraceId);

  const headers: Record<string, string> = {
    "User-Agent": userAgent,
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/x-www-form-urlencoded",
    "x-tigon-is-retry": "False",
    "x-fb-network-properties": "Wifi;Validated;",
    priority: "u=3, i",
    "x-fb-connection-type": "WIFI",
    "app-scope-id-header": appScopeId,
    "x-fb-sim-hni": "45201",
    "x-fb-net-hni": "45201",
    "x-zero-eh": xZeroEh,
    "x-graphql-client-library": "graphservice",
    "x-zero-f-device-id": deviceId,
    "x-fb-friendly-name": "FetchMessengerMusicPickerOptimalQuery",
    "x-fb-rmd": "state=URL_ELIGIBLE",
    "x-fb-request-analytics-tags": JSON.stringify({
      network_tags: {
        product: "256002347743983",
        request_category: "graphql",
        purpose: "none",
        retry_attempt: "0",
      },
      application_tags: "graphservice",
    }),
    "x-fb-http-engine": "Tigon/Liger",
    "x-fb-client-ip": "True",
    "x-fb-server-cluster": "True",
    "x-fb-conn-uuid-client": connUuidClient,
    authorization: `OAuth ${accessToken}`,
  };

  const response = await axios({
    method: "POST",
    url: graphqlUrl,
    data: form.toString(),
    headers,
    responseType: "json",
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    validateStatus: () => true,
  });

  if (response.status !== 200) {
    throw new Error(`FetchMessengerMusicPickerOptimalQuery failed - Status ${response.status}`);
  }

  const container = (response.data as any)?.data?.msgr_music_picker_container_v2;
  const songs: MessengerMusicPickerSong[] = Array.isArray(container?.songs) ? container.songs : [];
  const page_info = container?.page_info;

  return { songs, page_info, raw: response.data };
}

export default function fetchMessengerMusicPickerOptimalQueryFactory(
  _defaultFuncs: DefaultFuncs,
  _api: unknown,
  _ctx: Context
): (
  options: FetchMessengerMusicPickerOptimalQueryOptions
) => Promise<FetchMessengerMusicPickerOptimalQueryResult> {
  return function fetchMessengerMusicPickerOptimalQueryBound(
    options: FetchMessengerMusicPickerOptimalQueryOptions
  ): Promise<FetchMessengerMusicPickerOptimalQueryResult> {
    return fetchMessengerMusicPickerOptimalQuery(options);
  };
}
