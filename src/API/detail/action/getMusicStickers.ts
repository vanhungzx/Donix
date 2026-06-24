"use strict";

import log from "@log";
import type { MusicStickerItem } from "@types";
import { randomUUID } from "node:crypto";
import { getConfig } from "../../../core/configManager";
import type { Context, DefaultFuncs } from "../../request/formatters/helpers";
import {
  fetchMessengerMusicPickerOptimalQuery,
  type MessengerMusicPickerSong,
} from "./fetchMessengerMusicPickerOptimalQuery";

const GRAPHQL_URL = "https://graph.facebook.com/graphql";
const PRODUCT_STICKER = "MSGR_DIRECT_MUSIC_STICKER";

const DEFAULT_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

type GetMusicStickersCallback = (err: Error | null, data?: MusicStickerItem[]) => void;

function resolveAccessToken(ctx: Context): string | null {
  const cfg = getConfig() as { token?: Record<string, string> };
  const t = cfg.token;
  const fromConfig =
    t?.EAAD ||
    t?.EAAD6V7 ||
    t?.EAAAAU ||
    (t && typeof t === "object" ? (Object.values(t)[0] as string | undefined) : undefined);
  const ctxAny = ctx as { access_token?: string };
  const s = fromConfig || ctxAny.access_token;
  return s ? String(s) : null;
}

function resolveUserAgent(): string {
  const cfg = getConfig() as { apiOptions?: { userAgent?: string } };
  return cfg.apiOptions?.userAgent || DEFAULT_CHROME_UA;
}

function parseArgs(
  _search: string | null | undefined,
  pageSize?: number | GetMusicStickersCallback,
  endCursor?: string | null | GetMusicStickersCallback,
  callback?: GetMusicStickersCallback
): { pageSize: number; endCursor: string | null; cb: GetMusicStickersCallback | undefined } {
  if (typeof pageSize === "function") {
    return { pageSize: 20, endCursor: null, cb: pageSize };
  }
  const ps = typeof pageSize === "number" && Number.isFinite(pageSize) ? pageSize : 20;

  if (typeof endCursor === "function") {
    return { pageSize: ps, endCursor: null, cb: endCursor };
  }
  const ec =
    endCursor === undefined || endCursor === null ? null : String(endCursor);

  return { pageSize: ps, endCursor: ec, cb: typeof callback === "function" ? callback : undefined };
}

function mapSongsToStickerItems(songs: MessengerMusicPickerSong[]): MusicStickerItem[] {
  return songs
    .map((song) => {
      if (!song?.audio_cluster_id) return null;
      const startTime =
        song.highlights && song.highlights.length > 0
          ? String(song.highlights[0])
          : "1500";
      return {
        ...song,
        audio_cluster_id: song.audio_cluster_id,
        song_id: String(song.audio_cluster_id),
        song_title: song.title?.text || "",
        song_subtitle: song.subtitle?.text,
        start_time: startTime,
        is_explicit: song.is_explicit || false,
      } as MusicStickerItem;
    })
    .filter((x): x is MusicStickerItem => x !== null);
}

export default function getMusicStickersFactory(
  _defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (
  searchText: string | null | undefined,
  pageSize?: number | GetMusicStickersCallback,
  endCursor?: string | null | GetMusicStickersCallback,
  callback?: GetMusicStickersCallback
) => Promise<MusicStickerItem[]> {
  return function getMusicStickers(
    searchText: string | null | undefined,
    pageSize?: number | GetMusicStickersCallback,
    endCursor?: string | null | GetMusicStickersCallback,
    callback?: GetMusicStickersCallback
  ): Promise<MusicStickerItem[]> {
    let resolveFunc: (v: MusicStickerItem[]) => void = () => {};
    let rejectFunc: (e: unknown) => void = () => {};

    const returnPromise = new Promise<MusicStickerItem[]>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    const { pageSize: ps, endCursor: ec, cb } = parseArgs(
      searchText,
      pageSize,
      endCursor,
      callback
    );

    const callbackFinal: GetMusicStickersCallback =
      cb ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data || []);
      });

    const run = async (): Promise<void> => {
      const token = resolveAccessToken(ctx);
      if (!token) {
        const err = new Error("Thiếu access token (EAAD/EAAD6V7/EAAAAU trong config hoặc ctx.access_token)");
        log.error(`getMusicStickers: ${err.message}`);
        callbackFinal(err);
        rejectFunc(err);
        return;
      }

      try {
        const result = await fetchMessengerMusicPickerOptimalQuery({
          accessToken: token,
          searchText: searchText ?? null,
          pageSize: ps,
          endCursor: ec,
          browseSessionId: randomUUID(),
          locale: "en_US",
          userAgent: resolveUserAgent(),
          product: PRODUCT_STICKER,
          graphqlUrl: GRAPHQL_URL,
        });

        const raw = result.raw as { errors?: Array<{ message?: string }> };
        if (raw?.errors && raw.errors.length > 0) {
          const err = new Error(raw.errors[0]?.message || "GraphQL error");
          callbackFinal(err);
          rejectFunc(err);
          return;
        }

        const stickers = mapSongsToStickerItems(result.songs);
        callbackFinal(null, stickers);
        resolveFunc(stickers);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        log.error(`getMusicStickers: ${err.message}`);
        callbackFinal(err);
        rejectFunc(err);
      }
    };

    void run();

    return returnPromise;
  };
}
