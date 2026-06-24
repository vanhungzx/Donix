"use strict";

import axios from "axios";
import crypto from "crypto";
import type { Context, DefaultFuncs } from "../../request/formatters/helpers";
import { DEFAULT_ORCA_UA, DEFAULT_X_ZERO_EH } from "../action/fetchMessengerMusicPickerOptimalQuery";

export interface FetchMusicSongDetailsOptions {
  accessToken: string;
  songIds: string[];
  product?: "MSGR_DIRECT_MUSIC_STICKER" | string;
  locale?: string;
  userAgent?: string;
  xZeroEh?: string;
}

export interface MusicSongDetailsArtwork {
  uri?: string;
}

export interface MusicSongDetailsTitle {
  text?: string;
}

export interface MusicSongDetailsSubtitle {
  text?: string;
}

export interface MusicSongDetailsProgressiveDownload {
  id?: string;
  url?: string;
}

export interface MusicSongDetailsSong {
  audio_cluster_id?: string;
  cover_artwork?: MusicSongDetailsArtwork;
  cover_artwork_large?: MusicSongDetailsArtwork;
  duration_ms?: number;
  has_lyrics?: boolean;
  highlights?: unknown[];
  is_explicit?: boolean;
  title?: MusicSongDetailsTitle;
  subtitle?: MusicSongDetailsSubtitle;
  progressive_download?: MusicSongDetailsProgressiveDownload;
}

export interface FetchMusicSongDetailsResult {
  songs: MusicSongDetailsSong[];
  raw: unknown;
}

/**
 * Call Facebook GraphQL `FetchMusicSongDetails` using Messenger (Orca) headers.
 *
 * This is a low‑level helper; you must provide a valid mobile access token (EAAD...).
 */
export async function fetchMusicSongDetails(
  options: FetchMusicSongDetailsOptions
): Promise<FetchMusicSongDetailsResult> {
  const {
    accessToken,
    songIds,
    product = "MSGR_DIRECT_MUSIC_STICKER",
    locale = "vi_VN",
    userAgent = DEFAULT_ORCA_UA,
    xZeroEh = DEFAULT_X_ZERO_EH,
  } = options;

  if (!accessToken) {
    throw new Error("Access token is required (EAAD/...).");
  }

  if (!Array.isArray(songIds) || songIds.length === 0) {
    throw new Error("songIds must be a non-empty array.");
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
  form.append("fb_api_req_friendly_name", "FetchMusicSongDetails");
  form.append("fb_api_caller_class", "graphservice");
  form.append("client_doc_id", "20167542851527343863044857477");
  form.append("fb_api_client_context", JSON.stringify({ is_background: false }));
  form.append(
    "variables",
    JSON.stringify({
      params: {
        song_ids: songIds,
        product,
      },
    })
  );
  form.append("fb_api_analytics_tags", JSON.stringify(["GraphServices"]));
  form.append("client_trace_id", clientTraceId);

  const headers: Record<string, string> = {
    "User-Agent": userAgent,
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/x-www-form-urlencoded",
    "x-fb-request-analytics-tags": JSON.stringify({
      network_tags: {
        product: "256002347743983",
        request_category: "graphql",
        purpose: "none",
        retry_attempt: "0",
      },
      application_tags: "graphservice",
    }),
    "x-fb-rmd": "state=URL_ELIGIBLE",
    "x-graphql-client-library": "graphservice",
    "x-zero-eh": xZeroEh,
    "x-fb-net-hni": "45201",
    "x-fb-sim-hni": "45201",
    "app-scope-id-header": appScopeId,
    "x-fb-connection-type": "WIFI",
    authorization: `OAuth ${accessToken}`,
    "x-zero-f-device-id": deviceId,
    "x-fb-friendly-name": "FetchMusicSongDetails",
    priority: "u=3, i",
    "x-fb-network-properties": "Wifi;Validated;",
    "x-tigon-is-retry": "False",
    "x-fb-http-engine": "Tigon/Liger",
    "x-fb-client-ip": "True",
    "x-fb-server-cluster": "True",
    "x-fb-conn-uuid-client": connUuidClient,
  };

  const response = await axios({
    method: "POST",
    url: "https://graph.facebook.com/graphql",
    data: form.toString(),
    headers,
    responseType: "json",
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    validateStatus: () => true,
  });

  if (response.status !== 200) {
    throw new Error(`FetchMusicSongDetails failed - Status ${response.status}`);
  }

  const container = (response.data as any)?.data?.msgr_music_song_container;
  const songs: MusicSongDetailsSong[] = Array.isArray(container?.songs) ? container.songs : [];

  return { songs, raw: response.data };
}

/** Factory cho API loader — không gọi GraphQL lúc nạp; token truyền khi gọi `fetchMusicSongDetails`. */
export default function fetchMusicSongDetailsFactory(
  _defaultFuncs: DefaultFuncs,
  _api: unknown,
  _ctx: Context
): (options: FetchMusicSongDetailsOptions) => Promise<FetchMusicSongDetailsResult> {
  return function fetchMusicSongDetailsBound(
    options: FetchMusicSongDetailsOptions
  ): Promise<FetchMusicSongDetailsResult> {
    return fetchMusicSongDetails(options);
  };
}
