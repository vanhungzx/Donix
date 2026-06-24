"use strict";

import logger from "@log";
import type { DefaultFuncs, MQTTContext } from "@types";
import { generateOfflineThreadingID } from "../../request/formatters";

const DEFAULT_APP_ID = "2220391788200892";
const DEFAULT_VERSION_ID = "25150404991310813";
const LABEL_RICH_STATUS_CREATE = "417";
const REQUEST_TYPE = 3;
const DEFAULT_TIMEOUT = 15000;

export interface CreateMusicNoteOptions {
  text: string;
  audioClusterId: string | number;
  songStartTimeMs?: number;
  durationSec?: number;
  alacornSessionId?: string | null;
  browseSessionId?: string;
  privacy?: number;
  appId?: string;
  versionId?: string;
  timeoutMs?: number;
}

export type CreateMusicNoteCallback = (error: Error | null, success?: boolean) => void;

export default function (
  _defaultFuncs: DefaultFuncs,
  _api: any,
  ctx: MQTTContext
): (
  audioClusterId: string | number,
  text: string,
  options?: Omit<CreateMusicNoteOptions, "audioClusterId" | "text"> | CreateMusicNoteCallback,
  callback?: CreateMusicNoteCallback
) => Promise<boolean> {
  return function createMusicNote(
    audioClusterId: string | number,
    text: string,
    options: Omit<CreateMusicNoteOptions, "audioClusterId" | "text"> | CreateMusicNoteCallback = {},
    callback?: CreateMusicNoteCallback
  ): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      if (
        typeof options === "function" ||
        Object.prototype.toString.call(options).includes("Function")
      ) {
        callback = options as CreateMusicNoteCallback;
        options = {};
      }

      const cb: CreateMusicNoteCallback =
        typeof callback === "function"
          ? callback
          : () => {
              
            };

      if (!ctx.mqttClient || typeof ctx.mqttClient.publish !== "function") {
        const err = new Error("MQTT client is not connected");
        cb(err);
        return reject(err);
      }

      const opts = options as Omit<CreateMusicNoteOptions, "audioClusterId" | "text">;

      if (!text || typeof text !== "string") {
        const err = new Error("Text for music note must be a non-empty string");
        cb(err);
        return reject(err);
      }

      const songStartTimeMs =
        typeof opts.songStartTimeMs === "number" ? opts.songStartTimeMs : 2500;
      const durationSec =
        typeof opts.durationSec === "number" && opts.durationSec > 0
          ? opts.durationSec
          : 86400;
      const alacornSessionId =
        opts.alacornSessionId === undefined ? null : opts.alacornSessionId;
      const browseSessionId =
        typeof opts.browseSessionId === "string" && opts.browseSessionId.trim()
          ? opts.browseSessionId
          : generateOfflineThreadingID().toString();
      const privacy =
        typeof opts.privacy === "number" && opts.privacy > 0 ? opts.privacy : 5;

      ctx.wsReqNumber = (ctx.wsReqNumber || 0) + 1;
      ctx.wsTaskNumber = (ctx.wsTaskNumber || 0) + 1;

      const requestId = ctx.wsReqNumber;
      const taskId = ctx.wsTaskNumber;
      const epochId = generateOfflineThreadingID();
      const optimisticStatusId = generateOfflineThreadingID();

      const innerPayload = {
        alacorn_session_id: alacornSessionId,
        audience_list_type: null,
        audio_cluster_id: Number.isFinite(Number(audioClusterId))
          ? Number(audioClusterId)
          : audioClusterId,
        browse_session_id: browseSessionId,
        duration_sec: durationSec,
        easter_egg_id: null,
        edited_suggested_lyrics: 0,
        emoji: null,
        entrypoint: 0,
        game_metadata: null,
        gif_metadata: null,
        is_audio_from_search: 0,
        is_created_from_suggestion: 0,
        is_shareable: 0,
        manual_capabilities: null,
        mentions: [],
        note_type: 2,
        optimistic_status_id: Number(optimisticStatusId),
        original_author_id: null,
        presentation_json: JSON.stringify({
          bubble_style: {
            text_color: "FFFFFFFF",
            bg_colors: ["577095FF"],
          },
          assets: [],
          emojis: [],
          attribution_type: "ALBUM_ART_COLOR",
        }),
        presentation_metadata: null,
        privacy,
        scheduled_timestamp_ms: null,
        session_id: null,
        song_start_time_ms: songStartTimeMs,
        text,
        uses_suggested_lyrics: 0,
      };

      const tasks = [
        {
          failure_count: null,
          label: LABEL_RICH_STATUS_CREATE,
          payload: JSON.stringify(innerPayload),
          queue_name: "ls_rich_status_create_handler",
          task_id: String(taskId),
        },
      ];

      const envelope = {
        epoch_id: Number(epochId),
        tasks,
        version_id: opts.versionId || DEFAULT_VERSION_ID,
      };

      const form = {
        app_id: opts.appId || DEFAULT_APP_ID,
        payload: JSON.stringify(envelope),
        request_id: requestId,
        type: REQUEST_TYPE,
      };

      const timeoutMs =
        typeof opts.timeoutMs === "number" && opts.timeoutMs > 0
          ? opts.timeoutMs
          : DEFAULT_TIMEOUT;

      let timeout: NodeJS.Timeout | null = setTimeout(() => {
        timeout = null;
        ctx.mqttClient?.removeListener("message", onMessage);
        const err = new Error("createMusicNote timeout");
        cb(err);
        reject(err);
      }, timeoutMs);

      const clearTimeoutSafely = (): void => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
      };

      function onMessage(topic: string, message: Buffer): void {
        if (topic !== "/ls_resp") return;

        let json: { request_id?: number; payload?: any };
        try {
          json = JSON.parse(message.toString());
        } catch {
          return;
        }

        if (json.request_id !== requestId) return;

        clearTimeoutSafely();
        ctx.mqttClient?.removeListener("message", onMessage);

        cb(null, true);
        resolve(true);
      }

      ctx.mqttClient.on("message", onMessage);

      ctx.mqttClient.publish(
        "/ls_req",
        JSON.stringify(form),
        { qos: 1, retain: false },
        (err?: Error) => {
          if (err) {
            clearTimeoutSafely();
            ctx.mqttClient?.removeListener("message", onMessage);
            logger.error(`createMusicNote publish error: ${err.message}`);
            cb(err);
            reject(err);
          }
        }
      );
    });
  };
}
