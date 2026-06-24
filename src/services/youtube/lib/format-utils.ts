import FORMATS from "./formats.js";
import type { FormatFilter, YoutubeFormat, YtdlOptions } from "./types.js";

const audioEncodingRanks = ["mp4a", "mp3", "vorbis", "aac", "opus", "flac"];
const videoEncodingRanks = [
  "mp4v",
  "avc1",
  "Sorenson H.283",
  "MPEG-4 Visual",
  "VP8",
  "VP9",
  "H.264",
];

const toNumber = (value: number | string | null | undefined): number =>
  typeof value === "number" ? value : Number.parseInt(String(value ?? 0), 10) || 0;

const getCodecList = (format: YoutubeFormat): string[] => {
  const mimeType = typeof format.mimeType === "string" ? format.mimeType : "";
  const match = mimeType.match(/codecs="([^"]+)"/i);
  return (match?.[1] || "")
    .split(",")
    .map(codec => codec.trim())
    .filter(Boolean);
};

const hasAudioTrack = (format: YoutubeFormat, codecs: string[]): boolean =>
  toNumber(format.audioBitrate) > 0 ||
  typeof format.audioQuality === "string" ||
  codecs.some(codec => audioEncodingRanks.some(prefix => codec.startsWith(prefix))) ||
  codecs.length > 1;

const hasVideoTrack = (format: YoutubeFormat): boolean =>
  Boolean(format.qualityLabel) || (typeof format.mimeType === "string" && format.mimeType.startsWith("video/"));

const getVideoBitrate = (format: YoutubeFormat): number => toNumber(format.bitrate);
const getVideoEncodingRank = (format: YoutubeFormat): number =>
  videoEncodingRanks.findIndex(encoding => format.codecs?.includes(encoding));
const getAudioBitrate = (format: YoutubeFormat): number => toNumber(format.audioBitrate);
const getAudioEncodingRank = (format: YoutubeFormat): number =>
  audioEncodingRanks.findIndex(encoding => format.codecs?.includes(encoding));

const sortFormatsBy = (
  left: YoutubeFormat,
  right: YoutubeFormat,
  sortBy: Array<(format: YoutubeFormat) => number>
): number => {
  let result = 0;
  for (const fn of sortBy) {
    result = fn(right) - fn(left);
    if (result !== 0) break;
  }
  return result;
};

const sortFormatsByVideo = (left: YoutubeFormat, right: YoutubeFormat): number =>
  sortFormatsBy(left, right, [
    format => Number.parseInt(String(format.qualityLabel ?? 0), 10) || 0,
    getVideoBitrate,
    getVideoEncodingRank,
  ]);

const sortFormatsByAudio = (left: YoutubeFormat, right: YoutubeFormat): number =>
  sortFormatsBy(left, right, [getAudioBitrate, getAudioEncodingRank]);

export const sortFormats = (left: YoutubeFormat, right: YoutubeFormat): number =>
  sortFormatsBy(left, right, [
    format => Number(format.isHLS ?? false),
    format => Number(format.isDashMPD ?? false),
    format => {
      const contentLength = toNumber(format.contentLength);
      return contentLength > 0 ? 1 : 0;
    },
    format => Number(Boolean(format.hasVideo && format.hasAudio)),
    format => Number(Boolean(format.hasVideo)),
    format => Number.parseInt(String(format.qualityLabel ?? 0), 10) || 0,
    getVideoBitrate,
    getAudioBitrate,
    getVideoEncodingRank,
    getAudioEncodingRank,
  ]);

export const chooseFormat = (
  formats: YoutubeFormat | YoutubeFormat[],
  options: YtdlOptions
): YoutubeFormat => {
  const normalizedFormats = Array.isArray(formats) ? [...formats] : [formats];

  if (options.format && typeof options.format === "object") {
    if (!options.format.url) {
      throw Error("Invalid format given, did you use `ytdl.getInfo()`?");
    }
    return options.format;
  }

  let workingFormats = normalizedFormats;
  if (options.filter) {
    workingFormats = filterFormats(workingFormats, options.filter);
  }

  if (workingFormats.some(format => format.isHLS)) {
    workingFormats = workingFormats.filter(format => format.isHLS || !format.isLive);
  }

  let selectedFormat: YoutubeFormat | undefined;
  const quality = options.quality || "highest";

  switch (quality) {
    case "highest":
      selectedFormat = workingFormats[0];
      break;
    case "lowest":
      selectedFormat = workingFormats[workingFormats.length - 1];
      break;
    case "highestaudio": {
      const audioFormats = filterFormats(workingFormats, "audio").sort(sortFormatsByAudio);
      const bestAudio = audioFormats[0];
      if (bestAudio) {
        const tiedBestAudio = audioFormats.filter(format => sortFormatsByAudio(bestAudio, format) === 0);
        const worstVideoQuality = tiedBestAudio
          .map(format => Number.parseInt(String(format.qualityLabel ?? 0), 10) || 0)
          .sort((left, right) => left - right)[0];
        selectedFormat = tiedBestAudio.find(
          format => (Number.parseInt(String(format.qualityLabel ?? 0), 10) || 0) === worstVideoQuality
        );
      }
      break;
    }
    case "lowestaudio":
      selectedFormat = filterFormats(workingFormats, "audio").sort(sortFormatsByAudio).at(-1);
      break;
    case "highestvideo": {
      const videoFormats = filterFormats(workingFormats, "video").sort(sortFormatsByVideo);
      const bestVideo = videoFormats[0];
      if (bestVideo) {
        const tiedBestVideo = videoFormats.filter(format => sortFormatsByVideo(bestVideo, format) === 0);
        const worstAudioQuality = tiedBestVideo
          .map(format => toNumber(format.audioBitrate))
          .sort((left, right) => left - right)[0];
        selectedFormat = tiedBestVideo.find(format => toNumber(format.audioBitrate) === worstAudioQuality);
      }
      break;
    }
    case "lowestvideo":
      selectedFormat = filterFormats(workingFormats, "video").sort(sortFormatsByVideo).at(-1);
      break;
    default:
      selectedFormat = getFormatByQuality(quality, workingFormats);
      break;
  }

  if (!selectedFormat) {
    throw Error(`No such format found: ${quality}`);
  }

  return selectedFormat;
};

const getFormatByQuality = (
  quality: Array<number | string> | number | string,
  formats: YoutubeFormat[]
): YoutubeFormat | undefined => {
  const getFormat = (itag: number | string): YoutubeFormat | undefined =>
    formats.find(format => `${format.itag}` === `${itag}`);

  if (Array.isArray(quality)) {
    const matchedQuality = quality.find(itag => Boolean(getFormat(itag)));
    return matchedQuality === undefined ? undefined : getFormat(matchedQuality);
  }

  return getFormat(quality);
};

export const filterFormats = (formats: YoutubeFormat[], filter: FormatFilter): YoutubeFormat[] => {
  let fn: (format: YoutubeFormat) => boolean;

  switch (filter) {
    case "videoandaudio":
    case "audioandvideo":
      fn = format => Boolean(format.hasVideo && format.hasAudio);
      break;
    case "video":
      fn = format => Boolean(format.hasVideo);
      break;
    case "videoonly":
      fn = format => Boolean(format.hasVideo && !format.hasAudio);
      break;
    case "audio":
      fn = format => Boolean(format.hasAudio);
      break;
    case "audioonly":
      fn = format => Boolean(!format.hasVideo && format.hasAudio);
      break;
    default:
      if (typeof filter !== "function") {
        throw TypeError(`Given filter (${String(filter)}) is not supported`);
      }
      fn = filter;
      break;
  }

  return formats.filter(format => Boolean(format.url) && fn(format));
};

export const addFormatMeta = (format: YoutubeFormat): YoutubeFormat => {
  const baseFormat =
    typeof format.itag === "number" || typeof format.itag === "string"
      ? FORMATS[Number(format.itag)] || {}
      : {};

  const mergedFormat: YoutubeFormat = { ...baseFormat, ...format };
  const codecs = getCodecList(mergedFormat);
  mergedFormat.hasVideo = hasVideoTrack(mergedFormat);
  mergedFormat.hasAudio = hasAudioTrack(mergedFormat, codecs);
  mergedFormat.container = mergedFormat.mimeType
    ? mergedFormat.mimeType.split(";")[0]?.split("/")[1] || null
    : null;
  mergedFormat.codecs = codecs.length > 0 ? codecs.join(", ") : null;
  mergedFormat.videoCodec =
    mergedFormat.hasVideo && codecs.length > 0 ? codecs[0] || null : null;
  mergedFormat.audioCodec =
    mergedFormat.hasAudio && codecs.length > 0 ? codecs.slice(-1)[0] || null : null;
  mergedFormat.isLive = /\bsource[/=]yt_live_broadcast\b/.test(mergedFormat.url || "");
  mergedFormat.isHLS = /\/manifest\/hls_(variant|playlist)\//.test(mergedFormat.url || "");
  mergedFormat.isDashMPD = /\/manifest\/dash\//.test(mergedFormat.url || "");

  if (mergedFormat.contentLength) {
    mergedFormat.contentLength = String(toNumber(mergedFormat.contentLength));
  }

  if (
    (!mergedFormat.contentLength || mergedFormat.contentLength === "0") &&
    !mergedFormat.isLive &&
    !mergedFormat.isHLS &&
    !mergedFormat.isDashMPD &&
    mergedFormat.approxDurationMs &&
    (mergedFormat.bitrate || mergedFormat.averageBitrate)
  ) {
    const durationSeconds = toNumber(mergedFormat.approxDurationMs) / 1000;
    const bitrate = toNumber(mergedFormat.bitrate || mergedFormat.averageBitrate);
    const calculatedSize = Math.floor(durationSeconds * (bitrate / 8));
    if (calculatedSize > 0) {
      mergedFormat.contentLength = String(calculatedSize);
      mergedFormat._calculatedSize = true;
    }
  }

  return mergedFormat;
};
