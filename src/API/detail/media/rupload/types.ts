"use strict";

import type { Readable } from "node:stream";
import type { Context } from "../../../request/formatters/helpers";

export type AttachmentSource =
  | Readable
  | string
  | Buffer
  | {
      path?: string;
      url?: string;
      buffer?: Buffer;
      data?: Buffer;
      stream?: Readable;
      contentType?: string;
      filename?: string;
    };

export type RuploadMediaType = "image" | "video" | "audio" | "gif";

export interface WaveformData {
  amplitudes: number[];
  sampling_freq: number;
}

export interface RuploadInvocationOptions {
  timeoutMs?: number;
  userAgent?: string;
  to?: string | number;
  senderFbid?: string | number;
  bizSenderFbid?: string | number;
  deviceId?: string;
  extraHeaders?: Record<string, string>;
}

export interface RuploadTask extends RuploadInvocationOptions {
  source: AttachmentSource;
  mediaType?: RuploadMediaType;
  filename?: string;
  contentType?: string;
  uploadId?: string;
  offlineThreadingId?: string;
  offlineAttachmentId?: string;
  requestToken?: string;
  entityName?: string;
  messageSource?: string;
  friendlyName?: string;
  priority?: string;
  sendMessageByServer?: string;
  dataclassParams?: Record<string, unknown>;
  metadataDataclass?: Record<string, unknown>;
  waveformData?: WaveformData;
  audioType?: string;
  isHd?: boolean;
}

export interface NormalizedAttachment {
  buffer?: Buffer | null;
  stream?: Readable | null;
  filename: string;
  contentType: string;
  size: number;
  filePath?: string;
}

export interface RuploadResult {
  type: RuploadMediaType | "unknown";
  uploadId?: string;
  response: unknown;
  mediaId?: string | number;
  error?: string;
}

export type RuploadCallback = (
  err: Error | null,
  data?: RuploadResult[]
) => void;

export interface ErrorWithResponse extends Error {
  response?: {
    status?: number;
    statusCode?: number;
    data?: unknown;
    body?: unknown;
  };
  statusCode?: number;
  status?: number;
  body?: unknown;
}

export interface SessionStatus {
  cookieLive: boolean;
  isLoggedOut: boolean;
  hasWarning: boolean;
  hasCheckpoint: boolean;
  hasNotAuthorizedError: boolean;
  details: string;
}

export interface RuploadContext extends Context {
  auto_login?: boolean;
  globalOptions?: Record<string, unknown>;
  _autoLoginCooldownUntil?: number;
  _autoLoginPromise?: Promise<unknown>;
  performAutoLogin?: () => Promise<boolean>;
  eaadToken?: string;
}
