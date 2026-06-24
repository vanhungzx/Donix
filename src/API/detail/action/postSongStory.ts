"use strict";

import crypto from "crypto";
import type { DefaultFuncs, MQTTContext } from "@types";
import { getConfig } from "../../../core/configManager";
import { fetchMessengerMusicPickerOptimalQuery } from "./fetchMessengerMusicPickerOptimalQuery";

const DEFAULT_UA = 'Dalvik/2.1.0 (Linux; U; Android 9; V2241A Build/PQ3A.190705.05211459) [FBAN/Orca-Android;FBAV/534.0.0.53.103;FBPN/com.facebook.orca;FBLC/en_US;FBBV/827849643;FBCR/MobiFone;FBMF/vivo;FBBD/vivo;FBDV/V2241A;FBSV/9;FBCA/x86_64:arm64-v8a;FBDM/{density=1.5,width=900,height=1600};FB_FW/1;]';

const ZERO_EH = "2,,AUio0S0aw83VOfoW3o-icKrepoaVBXtgmPnA2ZmTb-DY6KBw9FtNZ8uo9B1EOH5iNZI";

interface GetSongListOptions {
  pageSize?: number;
}

interface SearchSongOptions {
  pageSize?: number;
}

interface PostSongStoryOptions {
  browseSessionId?: string;
  isAudioFromSearch?: boolean;
}

interface SongListResult {
  success: boolean;
  songs: any[];
  browseSessionId: string;
}

interface SearchSongResult {
  success: boolean;
  songs: any[];
  searchText: string;
  browseSessionId: string;
}

interface PostSongStoryResult {
  success: boolean;
  audioClusterId: string;
  text: string;
  optimisticStatusId: number;
}

type BoundPostSongStoryMethod = ((
  audioClusterId: string,
  text?: string,
  options?: PostSongStoryOptions
) => Promise<PostSongStoryResult>) & {
  getSongList: (options?: GetSongListOptions) => Promise<SongListResult>;
  searchSong: (
    searchText: string,
    options?: SearchSongOptions
  ) => Promise<SearchSongResult>;
};

/**
 * Get list of popular songs
 */
async function getSongList(
  ctx: MQTTContext,
  options: GetSongListOptions = {}
): Promise<SongListResult> {
  let accessToken = (ctx as any).eaadToken || (ctx as any).globalOptions?.accessToken || (ctx as any).access_token;

  // Fallback to config if not in context
  if (!accessToken) {
    const config = getConfig();
    accessToken = config?.token?.EAAD || config?.token?.EAAAAU || Object.values(config?.token || {})[0] as string;
  }

  if (!accessToken) {
    throw new Error("Access token not found. Please login again.");
  }

  const browseSessionId = crypto.randomUUID();
  const pageSize = options.pageSize || 20;

  const { songs } = await fetchMessengerMusicPickerOptimalQuery({
    accessToken,
    searchText: null,
    pageSize,
    endCursor: null,
    browseSessionId,
    // match curl: vi_VN + b-graph endpoint inside helper
    locale: "vi_VN",
    userAgent: DEFAULT_UA,
    xZeroEh: ZERO_EH,
  });

  return {
    success: true,
    songs: songs,
    browseSessionId: browseSessionId
  };
}

/**
 * Search songs by keyword
 */
async function searchSong(
  ctx: MQTTContext,
  searchText: string,
  options: SearchSongOptions = {}
): Promise<SearchSongResult> {
  if (!searchText) {
    throw new Error("Search text is required");
  }

  let accessToken = (ctx as any).eaadToken || (ctx as any).globalOptions?.accessToken || (ctx as any).access_token;

  // Fallback to config if not in context
  if (!accessToken) {
    const config = getConfig();
    accessToken = config?.token?.EAAD || config?.token?.EAAAAU || Object.values(config?.token || {})[0] as string;
  }

  if (!accessToken) {
    throw new Error("Access token not found. Please login again.");
  }

  const browseSessionId = crypto.randomUUID();
  const pageSize = options.pageSize || 20;

  const { songs } = await fetchMessengerMusicPickerOptimalQuery({
    accessToken,
    searchText,
    pageSize,
    endCursor: null,
    browseSessionId,
    locale: "vi_VN",
    userAgent: DEFAULT_UA,
    xZeroEh: ZERO_EH,
  });

  return {
    success: true,
    songs: songs,
    searchText: searchText,
    browseSessionId: browseSessionId
  };
}

/**
 * Post a song to story/notes
 */
async function postSongStory(
  ctx: MQTTContext,
  audioClusterId: string,
  text: string = "....",
  options: PostSongStoryOptions = {}
): Promise<PostSongStoryResult> {
  if (!audioClusterId) {
    throw new Error("Audio cluster ID is required");
  }

  if (!ctx.mqttClient || !ctx.mqttClient.connected) {
    throw new Error("MQTT client not connected");
  }

  const timestamp = Date.now();
  const alacornSessionId = crypto.randomUUID().replace(/-/g, '').substring(0, 21);
  const browseSessionId = options.browseSessionId || crypto.randomUUID();
  const optimisticStatusId = -Math.floor(Math.random() * 9000000000000000000) - 1000000000000000000;

  const payload = {
    alacorn_session_id: alacornSessionId,
    audience_list_type: null,
    audio_cluster_id: parseInt(audioClusterId),
    browse_session_id: browseSessionId,
    duration_sec: 86400,
    easter_egg_id: null,
    edited_suggested_lyrics: 0,
    emoji: null,
    entrypoint: 0,
    game_metadata: null,
    gif_metadata: null,
    is_audio_from_search: options.isAudioFromSearch ? 1 : 0,
    is_created_from_suggestion: 0,
    is_shareable: 0,
    manual_capabilities: null,
    mentions: [],
    note_type: 2,
    optimistic_status_id: optimisticStatusId,
    original_author_id: null,
    presentation_json: null,
    presentation_metadata: null,
    privacy: 1,
    scheduled_timestamp_ms: null,
    session_id: null,
    song_start_time_ms: 0,
    text: text,
    uses_suggested_lyrics: 0
  };

  const content = {
    epoch_id: (BigInt(timestamp) << 22n).toString(),
    tasks: [{
      failure_count: "5",
      label: "417",
      payload: JSON.stringify(payload),
      queue_name: "ls_rich_status_create_handler",
      task_id: "346",
      task_stats: {
        queue_latency: Math.floor(Math.random() * 100000)
      }
    }],
    version_id: "32479896748325238"
  };

  await ctx.mqttClient.publish("/ls_req", JSON.stringify({
    app_id: "2220391788200892",
    payload: JSON.stringify(content),
    request_id: Math.floor(100 + Math.random() * 900),
    type: 3
  }), { qos: 1, retain: false });

  return {
    success: true,
    audioClusterId: audioClusterId,
    text: text,
    optimisticStatusId: optimisticStatusId
  };
}

export {
  getSongList,
  searchSong,
  postSongStory
};

export default function postSongStoryFactory(
  _defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: MQTTContext
): BoundPostSongStoryMethod {
  const boundPostSongStory = ((
    audioClusterId: string,
    text: string = "....",
    options: PostSongStoryOptions = {}
  ) => postSongStory(ctx, audioClusterId, text, options)) as BoundPostSongStoryMethod;

  boundPostSongStory.getSongList = (options: GetSongListOptions = {}) =>
    getSongList(ctx, options);
  boundPostSongStory.searchSong = (
    searchText: string,
    options: SearchSongOptions = {}
  ) => searchSong(ctx, searchText, options);

  return boundPostSongStory;
}
