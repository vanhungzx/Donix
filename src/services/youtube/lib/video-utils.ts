import * as sigDecoder from "./sig-decoder.js";
import { playError } from "./utils.js";
import type {
  UnknownRecord,
  YoutubeFormat,
  YoutubeInfo,
  YoutubePlayabilityStatus,
  YoutubeVideoDetails,
} from "./types.js";

type CipherScript = Awaited<ReturnType<typeof sigDecoder.getCipherScript>>;

interface RetryOptions {
  maxRetries?: number;
  shouldRetry?: (error: Error) => boolean;
}

interface ResolveOptions {
  retries?: number;
  timeout?: number;
  validate?: boolean;
}

interface DecipherFormatsOptions extends ResolveOptions {
  continueOnError?: boolean;
}

interface DecipherFormatsResult {
  formats: YoutubeFormat[];
  stats: {
    failed: number;
    needsDecipher: number;
    skipped: number;
    success: number;
    total: number;
  };
}

interface SignatureStatus {
  deciphered: number;
  direct: number;
  errors: number;
  health: "degraded" | "healthy" | "unhealthy";
  needsDecipher: number;
  pending: number;
  successRate: number;
  total: number;
  validUrls: number;
}

const CONFIG = {
  MAX_RETRIES: 3,
  DEFAULT_TIMEOUT: 30_000,
  PLAYER_SCRIPT_TIMEOUT: 15_000,
  MIN_SIGNATURE_LENGTH: 20,
  MAX_SIGNATURE_LENGTH: 300,
} as const;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const toNumber = (value: number | string | null | undefined): number =>
  typeof value === "number" ? value : Number.parseInt(String(value ?? 0), 10) || 0;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> =>
  await Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);

const withRetry = async <T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> => {
  const maxRetries = options.maxRetries ?? CONFIG.MAX_RETRIES;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= maxRetries || (options.shouldRetry && !options.shouldRetry(lastError))) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error("Unknown retry failure");
};

export function formatDuration(seconds: number | string): string {
  const value = toNumber(seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function parseDuration(duration: string): number {
  const parts = duration
    .trim()
    .split(":")
    .map(part => Number.parseInt(part, 10))
    .filter(value => !Number.isNaN(value));
  if (parts.length === 0) return 0;
  if (parts.length === 1) return parts[0] || 0;
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

export function formatViews(views: number | string): string {
  const value = toNumber(views);
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function parseViews(views: string): number {
  const match = views.trim().toUpperCase().replace(/,/g, "").match(/^([\d.]+)([KMB])?$/);
  if (!match) return 0;
  const value = Number.parseFloat(match[1]);
  const unit = match[2];
  if (unit === "B") return Math.round(value * 1_000_000_000);
  if (unit === "M") return Math.round(value * 1_000_000);
  if (unit === "K") return Math.round(value * 1_000);
  return Math.round(value);
}

export function getThumbnail(videoDetails: YoutubeVideoDetails | null | undefined, quality = "high"): string | null {
  const thumbnails = videoDetails?.thumbnail?.thumbnails;
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return null;
  const qualityMap: Record<string, number> = {
    default: 0,
    medium: 1,
    high: 2,
    standard: 3,
    maxres: 4,
  };
  const index = qualityMap[quality] ?? qualityMap.high;
  return thumbnails[Math.min(index, thumbnails.length - 1)]?.url || thumbnails.at(-1)?.url || null;
}

export function getThumbnailFromId(videoId: string, quality = "hqdefault"): string {
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

export function checkPlayability(info: YoutubeInfo | UnknownRecord): {
  playable: boolean;
  reason?: string;
  status?: string;
} {
  const error = playError(info);
  const status = isRecord(info.playabilityStatus) ? info.playabilityStatus.status : undefined;
  return error
    ? { playable: false, reason: error.message, status: typeof status === "string" ? status : undefined }
    : { playable: true, status: typeof status === "string" ? status : "OK" };
}

export function getDescription(info: YoutubeInfo | UnknownRecord): string {
  const details = isRecord(info.videoDetails) ? (info.videoDetails as YoutubeVideoDetails) : undefined;
  return details?.shortDescription || "";
}

export function getTags(info: YoutubeInfo | UnknownRecord): string[] {
  const details = isRecord(info.videoDetails) ? (info.videoDetails as YoutubeVideoDetails) : undefined;
  return Array.isArray(details?.keywords) ? details.keywords : [];
}

export function isLiveStream(info: YoutubeInfo | UnknownRecord): boolean {
  const status = isRecord(info.playabilityStatus) ? (info.playabilityStatus as YoutubePlayabilityStatus).status : "";
  if (status === "LIVE_STREAM_OFFLINE") return true;
  const formats = Array.isArray(info.formats) ? (info.formats as YoutubeFormat[]) : [];
  return formats.some(format => format.isLive || format.isHLS);
}

export function getChannelInfo(info: YoutubeInfo | UnknownRecord): { id?: string; name?: string } {
  const details = isRecord(info.videoDetails) ? (info.videoDetails as YoutubeVideoDetails) : undefined;
  return {
    id: details?.channelId,
    name: details?.author,
  };
}

export function formatVideoInfo(info: YoutubeInfo | UnknownRecord): Record<string, unknown> {
  const details = isRecord(info.videoDetails) ? (info.videoDetails as YoutubeVideoDetails) : undefined;
  const formats = Array.isArray(info.formats) ? (info.formats as YoutubeFormat[]) : [];
  return {
    id: details?.videoId || null,
    title: details?.title || "Unknown title",
    author: details?.author || "Unknown author",
    duration: formatDuration(details?.lengthSeconds || 0),
    durationSeconds: toNumber(details?.lengthSeconds),
    views: toNumber(details?.viewCount),
    thumbnail: getThumbnail(details),
    isLive: isLiveStream(info),
    formats: formats.length,
  };
}

export function getBestFormatForQuality(
  formats: YoutubeFormat[],
  quality: number | string,
  requireAudio = true
): YoutubeFormat | null {
  const candidates = formats.filter(format => (requireAudio ? format.hasAudio : true) && format.hasVideo);
  if (candidates.length === 0) return null;

  if (quality === "highest") {
    return [...candidates].sort((left, right) => toNumber(right.height) - toNumber(left.height))[0] || null;
  }
  if (quality === "lowest") {
    return [...candidates].sort((left, right) => toNumber(left.height) - toNumber(right.height))[0] || null;
  }

  const target = typeof quality === "number" ? quality : Number.parseInt(String(quality).replace(/\D/g, ""), 10);
  if (Number.isNaN(target)) return candidates[0] || null;

  return (
    [...candidates].sort(
      (left, right) => Math.abs(toNumber(left.height) - target) - Math.abs(toNumber(right.height) - target)
    )[0] || null
  );
}

export function estimateFileSize(format: YoutubeFormat, durationSeconds: number): number | null {
  const contentLength = toNumber(format.contentLength);
  if (contentLength > 0) return contentLength;
  const bitrate = toNumber(format.bitrate || format.averageBitrate);
  if (bitrate > 0 && durationSeconds > 0) {
    return Math.floor((bitrate / 8) * durationSeconds);
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

export function needsDecipher(format: YoutubeFormat): boolean {
  if (format.signatureCipher || format.cipher || format.s) return true;
  if (!format.url) return false;
  try {
    const url = new URL(format.url);
    const signature = url.searchParams.get("sig") || url.searchParams.get("signature");
    return Boolean(signature && signature.length >= 80);
  } catch {
    return false;
  }
}

export function hasValidUrl(format: YoutubeFormat): boolean {
  if (!format.url) return false;
  try {
    new URL(format.url);
    return true;
  } catch {
    return false;
  }
}

export async function getPlayerScriptUrl(_options: ResolveOptions = {}): Promise<string> {
  return await withRetry(
    async () =>
      await withTimeout(
        sigDecoder.getCachedPlayerScript(),
        _options.timeout ?? CONFIG.PLAYER_SCRIPT_TIMEOUT,
        "Failed to get player script URL: timeout"
      ),
    { maxRetries: _options.retries ?? CONFIG.MAX_RETRIES }
  );
}

export async function getCipherScript(
  scriptUrl: string,
  options: ResolveOptions = {}
): Promise<CipherScript> {
  return await withRetry(
    async () =>
      await withTimeout(
        sigDecoder.getCipherScript(scriptUrl),
        options.timeout ?? CONFIG.DEFAULT_TIMEOUT,
        "Failed to get cipher: timeout"
      ),
    { maxRetries: options.retries ?? CONFIG.MAX_RETRIES }
  );
}

export function decipherSignature(signature: string, cipher: CipherScript): string {
  return sigDecoder.applyCipher(signature, cipher);
}

export function transformNParameter(nParam: string, cipher: CipherScript): string {
  return sigDecoder.transformNParameter(nParam, cipher);
}

export async function resolveFormatUrl(
  format: YoutubeFormat,
  playerScriptUrl: string | null = null,
  options: ResolveOptions = {}
): Promise<string> {
  const resolvedUrl = await withRetry(
    async () =>
      await withTimeout(
        sigDecoder.resolveFormatUrl(format, playerScriptUrl),
        options.timeout ?? CONFIG.DEFAULT_TIMEOUT,
        "Failed to resolve format URL: timeout"
      ),
    {
      maxRetries: options.retries ?? CONFIG.MAX_RETRIES,
      shouldRetry: error =>
        error.message.includes("timeout") ||
        error.message.includes("Failed to resolve") ||
        error.message.includes("Failed to get cipher"),
    }
  );

  if (options.validate && !hasValidUrl({ ...format, url: resolvedUrl })) {
    throw new Error("Resolved URL is invalid");
  }

  return resolvedUrl;
}

export async function decipherFormats(
  formats: YoutubeFormat[],
  playerScriptUrl: string | null = null,
  options: DecipherFormatsOptions = {}
): Promise<DecipherFormatsResult> {
  if (!Array.isArray(formats) || formats.length === 0) {
    return {
      formats: [],
      stats: { total: 0, success: 0, failed: 0, skipped: 0, needsDecipher: 0 },
    };
  }

  const continueOnError = options.continueOnError ?? true;
  const scriptUrl = playerScriptUrl || (await getPlayerScriptUrl(options));
  const stats = {
    total: formats.length,
    success: 0,
    failed: 0,
    skipped: 0,
    needsDecipher: 0,
  };

  const output: YoutubeFormat[] = [];
  for (const format of formats) {
    if (!needsDecipher(format) && hasValidUrl(format)) {
      stats.skipped++;
      output.push(format);
      continue;
    }

    stats.needsDecipher++;
    try {
      const url = await resolveFormatUrl(format, scriptUrl, {
        timeout: options.timeout,
        retries: options.retries,
        validate: true,
      });
      stats.success++;
      output.push({ ...format, url, _deciphered: true });
    } catch (error) {
      stats.failed++;
      if (!continueOnError) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      output.push({
        ...format,
        _decipherError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { formats: output, stats };
}

export function extractSignatureFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("sig") || parsed.searchParams.get("signature");
  } catch {
    return null;
  }
}

export function isValidSignature(
  signature: string,
  options: { maxLength?: number; minLength?: number; strict?: boolean } = {}
): boolean {
  const minLength = options.minLength ?? CONFIG.MIN_SIGNATURE_LENGTH;
  const maxLength = options.maxLength ?? CONFIG.MAX_SIGNATURE_LENGTH;
  if (signature.length < minLength || signature.length > maxLength) return false;
  return options.strict === false ? true : /^[A-Za-z0-9._-]+$/.test(signature);
}

export function clearSignatureCache(): void {
  sigDecoder.clearCache();
}

export function getSignatureStatus(formats: YoutubeFormat[]): SignatureStatus {
  let needsDecipherCount = 0;
  let decipheredCount = 0;
  let directCount = 0;
  let errorsCount = 0;
  let validUrlCount = 0;

  for (const format of formats) {
    if (needsDecipher(format)) {
      needsDecipherCount++;
      if (format._deciphered) {
        decipheredCount++;
        if (hasValidUrl(format)) validUrlCount++;
      } else if (typeof format._decipherError === "string") {
        errorsCount++;
      }
    } else if (format.url) {
      directCount++;
      if (hasValidUrl(format)) validUrlCount++;
    }
  }

  const pending = needsDecipherCount - decipheredCount - errorsCount;
  const successRate =
    formats.length > 0 ? Number((((decipheredCount + directCount) / formats.length) * 100).toFixed(2)) : 0;

  return {
    total: formats.length,
    needsDecipher: needsDecipherCount,
    deciphered: decipheredCount,
    direct: directCount,
    errors: errorsCount,
    pending,
    validUrls: validUrlCount,
    successRate,
    health:
      pending === 0 && errorsCount === 0
        ? "healthy"
        : errorsCount < Math.max(needsDecipherCount * 0.5, 1)
          ? "degraded"
          : "unhealthy",
  };
}

export async function healthCheck(): Promise<Record<string, unknown>> {
  try {
    const scriptUrl = await getPlayerScriptUrl({ timeout: 5000, retries: 1 });
    const cipher = await getCipherScript(scriptUrl, { timeout: 5000, retries: 1 });
    return {
      healthy: Boolean(cipher.globalVars && cipher.sigActions && cipher.sigFunction),
      message: "Signature decoder is healthy",
      details: {
        scriptUrl,
        cipher: {
          hasGlobalVars: Boolean(cipher.globalVars),
          hasSigActions: Boolean(cipher.sigActions),
          hasSigFunction: Boolean(cipher.sigFunction),
          hasNFunction: Boolean(cipher.nFunction),
          timestamp: cipher.timestamp,
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      healthy: false,
      message: `Health check failed: ${message}`,
      details: { error: message },
    };
  }
}
