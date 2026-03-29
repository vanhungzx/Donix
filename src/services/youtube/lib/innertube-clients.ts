import https from "https";
import { getAntiDetectionManager } from "./anti-detection.js";
import * as sigDecoder from "./sig-decoder.js";
import type { HeadersMap, UnknownRecord, YoutubeAgent, YoutubeFormat, YoutubeInfo } from "./types.js";

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

export const ANDROID_VR_CLIENT = {
  clientName: "ANDROID_VR",
  clientVersion: "1.71.26",
  deviceMake: "Oculus",
  deviceModel: "Quest 3",
  androidSdkVersion: 32,
  userAgent:
    "com.google.android.apps.youtube.vr.oculus/1.71.26 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
  osName: "Android",
  osVersion: "12L",
  hl: "en",
  timeZone: "UTC",
  utcOffsetMinutes: 0,
  clientId: "28",
} as const;

const SIGNATURE_TIMESTAMP = 20514;
const DEFAULT_COOKIE =
  process.env.YT_COOKIE ||
  [
    "PREF=hl=en&tz=UTC",
    "SOCS=CAI",
    "__Secure-ROLLOUT_TOKEN=CJqs-sKE2K-OVBDupfPAuo6TAxjupfPAuo6TAw%3D%3D",
    "VISITOR_INFO1_LIVE=6TJFcWFHL2U",
    "VISITOR_PRIVACY_METADATA=CgJWThIEGgAgVQ%3D%3D",
  ].join("; ");
const DEFAULT_VISITOR_ID =
  process.env.YT_VISITOR_ID || "Cgs2VEpGY1dGSEwyVSit57HNBjIKCgJWThIEGgAgVQ%3D%3D";

interface InnerTubeRequestOptions {
  agent?: YoutubeAgent;
  headers?: HeadersMap;
  localAddress?: string;
}

const generateNonce = (length: number): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)] || "").join("");
};

const toNumber = (value: number | string | null | undefined): number =>
  typeof value === "number" ? value : Number.parseInt(String(value ?? 0), 10) || 0;

const AUDIO_CODEC_PREFIXES = ["aac", "ac-3", "ec-3", "flac", "mp4a", "opus", "vorbis"];

const getCodecList = (format: YoutubeFormat): string[] => {
  const mimeType = typeof format.mimeType === "string" ? format.mimeType : "";
  const match = mimeType.match(/codecs="([^"]+)"/i);
  return (match?.[1] || "")
    .split(",")
    .map(codec => codec.trim().toLowerCase())
    .filter(Boolean);
};

const hasAudioTrack = (format: YoutubeFormat): boolean => {
  if (toNumber(format.audioBitrate) > 0) return true;
  if (typeof format.audioQuality === "string" && format.audioQuality.length > 0) return true;

  const codecs = getCodecList(format);
  return codecs.some(codec => AUDIO_CODEC_PREFIXES.some(prefix => codec.startsWith(prefix))) || codecs.length > 1;
};

const hasVideoTrack = (format: YoutubeFormat): boolean => {
  if (typeof format.qualityLabel === "string" && format.qualityLabel.length > 0) return true;
  return typeof format.mimeType === "string" && format.mimeType.startsWith("video/");
};

const calculateContentLength = (format: YoutubeFormat): number => {
  const declared = toNumber(format.contentLength);
  if (declared > 0) return declared;

  const durationSeconds = toNumber(format.approxDurationMs) / 1000;
  const bitrate = toNumber(format.bitrate || format.averageBitrate);
  if (durationSeconds > 0 && bitrate > 0) {
    return Math.floor(durationSeconds * (bitrate / 8));
  }
  return 0;
};

const needsDecipher = (format: YoutubeFormat): boolean => {
  if (format.signatureCipher || format.cipher || format.s) return true;
  if (!format.url) return false;
  try {
    const url = new URL(format.url);
    const signature = url.searchParams.get("sig") || url.searchParams.get("signature");
    return Boolean(signature && signature.length >= 80);
  } catch {
    return false;
  }
};

const normalizeFormat = (format: YoutubeFormat): YoutubeFormat => {
  const contentLength = calculateContentLength(format);
  return {
    ...format,
    contentLength: contentLength > 0 ? String(contentLength) : String(format.contentLength ?? 0),
    _calculatedSize: contentLength > 0 && !format.contentLength,
    hasVideo: hasVideoTrack(format),
    hasAudio: hasAudioTrack(format),
    container: format.mimeType ? format.mimeType.split(";")[0]?.split("/")[1] || "unknown" : "unknown",
    bitrate: toNumber(format.bitrate),
    audioBitrate: toNumber(format.audioBitrate),
  };
};

const decipherFormats = async (
  formats: YoutubeFormat[],
  playerScriptUrl: string | null
): Promise<YoutubeFormat[]> => {
  const resolvedPlayerScript = playerScriptUrl || (await sigDecoder.getCachedPlayerScript());
  const output: YoutubeFormat[] = [];

  for (const format of formats) {
    try {
      if (format.url && !needsDecipher(format)) {
        output.push(format);
        continue;
      }

      const url = await sigDecoder.resolveFormatUrl(format, resolvedPlayerScript);
      output.push({ ...format, url, _deciphered: true });
    } catch {
      output.push(format);
    }
  }

  return output;
};

export async function requestInnerTube(
  videoId: string,
  options: InnerTubeRequestOptions = {}
): Promise<UnknownRecord> {
  const apiUrl = new URL(
    `https://www.youtube.com/youtubei/v1/player?prettyPrint=false&t=${generateNonce(12)}&id=${videoId}`
  );
  const requestBody = JSON.stringify({
    context: {
      client: {
        clientName: ANDROID_VR_CLIENT.clientName,
        clientVersion: ANDROID_VR_CLIENT.clientVersion,
        deviceMake: ANDROID_VR_CLIENT.deviceMake,
        deviceModel: ANDROID_VR_CLIENT.deviceModel,
        androidSdkVersion: ANDROID_VR_CLIENT.androidSdkVersion,
        userAgent: ANDROID_VR_CLIENT.userAgent,
        osName: ANDROID_VR_CLIENT.osName,
        osVersion: ANDROID_VR_CLIENT.osVersion,
        hl: ANDROID_VR_CLIENT.hl,
        timeZone: ANDROID_VR_CLIENT.timeZone,
        utcOffsetMinutes: ANDROID_VR_CLIENT.utcOffsetMinutes,
      },
    },
    videoId,
    playbackContext: {
      contentPlaybackContext: {
        html5Preference: "HTML5_PREF_WANTS",
        signatureTimestamp: SIGNATURE_TIMESTAMP,
      },
    },
    contentCheckOk: true,
    racyCheckOk: true,
  });

  const antiDetection = getAntiDetectionManager();
  await antiDetection.waitForRateLimit();
  await antiDetection.applyDelay();
  antiDetection.recordRequest();

  const antiDetectionHeaders = antiDetection.generateHeaders({
    videoId,
    userAgent: ANDROID_VR_CLIENT.userAgent,
    customHeaders: { "Accept-Language": "en-us,en;q=0.5" },
    includeReferer: true,
  });

  const headers: HeadersMap = {
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(requestBody)),
    "User-Agent": ANDROID_VR_CLIENT.userAgent,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-us,en;q=0.5",
    "Sec-Fetch-Mode": "navigate",
    Origin: "https://www.youtube.com",
    "X-YouTube-Client-Name": ANDROID_VR_CLIENT.clientId,
    "X-YouTube-Client-Version": ANDROID_VR_CLIENT.clientVersion,
    Cookie: options.headers?.Cookie ?? DEFAULT_COOKIE,
    "X-Goog-Visitor-Id": options.headers?.["X-Goog-Visitor-Id"] ?? DEFAULT_VISITOR_ID,
    ...antiDetectionHeaders,
    ...(options.headers || {}),
  };

  return await new Promise<UnknownRecord>((resolve, reject) => {
    const req = https.request(
      {
        hostname: apiUrl.hostname,
        path: apiUrl.pathname + apiUrl.search,
        method: "POST",
        headers,
        localAddress: options.agent?.localAddress || options.localAddress,
      },
      res => {
        let body = "";
        res.on("data", chunk => {
          body += chunk instanceof Buffer ? chunk.toString("utf8") : String(chunk);
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            resolve(isRecord(parsed) ? parsed : {});
          } catch (error) {
            reject(error instanceof Error ? error : new Error("Failed to parse InnerTube response"));
          }
        });
      }
    );

    req.on("error", reject);
    req.write(requestBody);
    req.end();
  });
}

export async function getInfo(
  videoId: string,
  options: InnerTubeRequestOptions = {}
): Promise<YoutubeInfo> {
  const data = await requestInnerTube(videoId, options);
  const streamingData = isRecord(data.streamingData) ? data.streamingData : {};
  const formatList = Array.isArray(streamingData.formats) ? (streamingData.formats as YoutubeFormat[]) : [];
  const adaptiveList = Array.isArray(streamingData.adaptiveFormats)
    ? (streamingData.adaptiveFormats as YoutubeFormat[])
    : [];
  let formats = [...formatList, ...adaptiveList].map(normalizeFormat);

  if (formats.length === 0) {
    throw new Error("No streaming data available");
  }

  const directFormats = formats.filter(format => format.url && !needsDecipher(format));
  const cipherFormats = formats.filter(format => !format.url || needsDecipher(format));

  let playerScriptUrl: string | null = null;
  if (cipherFormats.length > 0) {
    try {
      playerScriptUrl = await sigDecoder.getCachedPlayerScript();
      const deciphered = await decipherFormats(cipherFormats, playerScriptUrl);
      formats = [...directFormats, ...deciphered];
    } catch {
      formats = directFormats;
    }
  }

  return {
    ...data,
    success: true,
    full: true,
    formats,
    html5player: playerScriptUrl || undefined,
    player_response: data,
    streamingData: streamingData as YoutubeInfo["streamingData"],
    live_chunk_readahead: 3,
    _innerTube: {
      client: "ANDROID",
      directUrls: directFormats.length,
      needsCipher: cipherFormats.length,
      allDeciphered: cipherFormats.length > 0 && formats.length > directFormats.length,
      playerScriptUrl,
    },
    _agentUsed: options.agent,
    _localAddressUsed: options.agent?.localAddress || options.localAddress,
    _ipBound: true,
  };
}
