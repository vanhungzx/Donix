"use strict";

import logger from "@log";
import type { Context } from "@types";
import { parseAndCheckLogin, type DefaultFuncs } from "../../request/formatters/helpers";

interface GetStoryMusicListOptions {
  limit?: number;
  cursor?: string | null;
  searchText?: string;
  getAll?: boolean;
}

interface MusicTrack {
  id: string;
  display_id: string;
  title: string;
  artist: string;
  album_title?: string;
  cover_artwork?: string;
  duration_in_ms?: number;
  audio_url?: string;
  is_saved_by_viewer?: boolean;
}

interface GetStoryMusicListResult {
  tracks: MusicTrack[];
  has_next_page: boolean;
  cursor: string | null;
}
type GetStoryMusicListCallback = (err: Error | null, data?: GetStoryMusicListResult) => void;

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (options?: GetStoryMusicListOptions | GetStoryMusicListCallback, callback?: GetStoryMusicListCallback) => Promise<GetStoryMusicListResult> {
  return function getStoryMusicList(
    options?: GetStoryMusicListOptions | GetStoryMusicListCallback,
    callback?: GetStoryMusicListCallback
  ): Promise<GetStoryMusicListResult> {
    let resolveFunc: (value: GetStoryMusicListResult) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };
    const returnPromise = new Promise<GetStoryMusicListResult>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });
    let opts: GetStoryMusicListOptions;
    if (typeof options === "function") {
      callback = options as GetStoryMusicListCallback;
      opts = {};
    } else {
      opts = (options || {}) as GetStoryMusicListOptions;
    }
    const cb: GetStoryMusicListCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        if (data) resolveFunc(data);
      });
    (async () => {
      try {
        const limit = opts.limit || 20;
        const cursor = opts.cursor || null;
        const searchText = opts.searchText;
        const getAll = opts.getAll || false;
        const fetchPage = async (currentCursor: string | null = null): Promise<GetStoryMusicListResult> => {
          let variables: Record<string, unknown>;
          let friendlyName: string;
          let docId: string;
          if (searchText) {
            variables = {
              params: {
                first: limit,
                search_text: searchText
              },
              product: "FB_CAMERA"
            };
            friendlyName = "StoriesCreateMusicSelectorMainPageQuery";
            docId = "23943555345255534";
          } else {
            variables = {
              count: limit,
              params: {
                constraint: {
                  id: "2282005535164995",
                  type: "TAG"
                },
                first: limit
              },
              product: "FB_CAMERA"
            };
            if (currentCursor) {
              variables.cursor = currentCursor;
            }
            friendlyName = "StoriesCreateMusicSelectorBody_contentQuery";
            docId = "10028186487266423";
          }
          const form: Record<string, string> = {
            av: ctx.userID,
            fb_api_caller_class: "RelayModern",
            fb_api_req_friendly_name: friendlyName,
            server_timestamps: "true",
            variables: JSON.stringify(variables),
            doc_id: docId,
          };
          logger.info(`[getStoryMusicList] Fetching music ${searchText ? `search: "${searchText}"` : "list"} - limit: ${limit}, cursor: ${currentCursor || "null"}`);

          const response = await defaultFuncs
            .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
            .then(parseAndCheckLogin(ctx, defaultFuncs));

          const outArr = Array.isArray(response) ? response : [response];
          const out = (outArr[0] ?? response) as {
            data?: {
              xfb_music_picker_connection_container?: {
                items?: {
                  edges?: Array<{
                    node?: {
                      item?: {
                        __typename?: string;
                        id?: string;
                        display_id?: string;
                        display_title?: {
                          text?: string;
                        };
                        title?: {
                          text?: string;
                        };
                        display_artist?: {
                          text?: string;
                        };
                        album_title?: string;
                        cover_artwork?: {
                          uri?: string;
                        };
                        display_image?: {
                          uri?: string;
                        };
                        duration_in_ms?: number;
                        progressive_download?: Array<{
                          url?: string;
                          id?: string;
                        }>;
                        is_saved_by_viewer?: boolean;
                      };
                      sub_items?: unknown[];
                      __typename?: string;
                    };
                    cursor?: string | null;
                  }>;
                  page_info?: {
                    end_cursor?: string | null;
                    has_next_page?: boolean;
                  };
                };
              };
            };
            errors?: Array<unknown>;
            error?: unknown;
          };

          if (out.errors || out.error) {
            const errorMsg = `Failed to get music list: ${JSON.stringify(out.errors || out.error)}`;
            logger.error(`[getStoryMusicList] ${errorMsg}`);
            throw new Error(errorMsg);
          }

          const edges = out.data?.xfb_music_picker_connection_container?.items?.edges || [];
          const pageInfo = out.data?.xfb_music_picker_connection_container?.items?.page_info;

          const tracks: MusicTrack[] = edges
            .map((edge) => {
              const item = edge?.node?.item;
              if (!item) return null;

              const track: MusicTrack = {
                id: item.id || item.display_id || "",
                display_id: item.display_id || item.id || "",
                title: item.display_title?.text || item.title?.text || "",
                artist: item.display_artist?.text || "",
                album_title: item.album_title,
                cover_artwork: item.cover_artwork?.uri || item.display_image?.uri,
                duration_in_ms: item.duration_in_ms,
                audio_url: item.progressive_download?.[0]?.url,
                is_saved_by_viewer: item.is_saved_by_viewer || false,
              };
              return track;
            })
            .filter((track): track is MusicTrack => track !== null);

          return {
            tracks,
            has_next_page: pageInfo?.has_next_page || false,
            cursor: pageInfo?.end_cursor || edges[edges.length - 1]?.cursor || null,
          };
        };
        if (getAll) {
          const allTracks: MusicTrack[] = [];
          let currentCursor: string | null = cursor;
          let hasMore = true;
          let pageCount = 0;
          const maxPages = 100;
          while (hasMore && pageCount < maxPages) {
            const pageResult = await fetchPage(currentCursor);
            allTracks.push(...pageResult.tracks);
            hasMore = pageResult.has_next_page;
            currentCursor = pageResult.cursor;
            pageCount++;

            logger.info(`[getStoryMusicList] Fetched page ${pageCount}, total tracks: ${allTracks.length}, has more: ${hasMore}`);
          }

          const result: GetStoryMusicListResult = {
            tracks: allTracks,
            has_next_page: false,
            cursor: null,
          };

          logger.success(`[getStoryMusicList] Successfully fetched all ${allTracks.length} tracks across ${pageCount} pages`);
          cb(null, result);
        } else {
          const result = await fetchPage(cursor);
          logger.success(`[getStoryMusicList] Successfully fetched ${result.tracks.length} tracks`);
          cb(null, result);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[getStoryMusicList] Exception occurred - ${error.message}${error.stack ? `\nStack: ${error.stack}` : ""}`);
        cb(error);
      }
    })();

    return returnPromise;
  };
}
