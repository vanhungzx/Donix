import type { Command, CommandOnCallContext, CommandOnReplyContext } from "@types";
import axios from "axios";
import fs from "fs";
import type { Readable } from "node:stream";
import path from "path";
import { TEMP_DIR } from "../../../core/storagePath";
import youtubeSearch from "../../../services/youtube/search.js";
import ytdl from "../../../services/youtube/lib/index.js";
import { getVideoID } from "../../../services/youtube/lib/url-utils.js";
import { extractYouTubeJSON, parseAbbreviatedNumber } from "../../../services/youtube/lib/utils.js";
import type {
  SearchResult,
  SearchVideoResult,
  UnknownRecord,
  YoutubeFormat,
  YoutubeInfo,
  YoutubeVideoDetails,
} from "../../../services/youtube/lib/types.js";

type DownloadMode = "audio" | "info" | "video";

interface ReplyPickState {
  author: string;
  commandName: string;
  messageID: string;
  mode: DownloadMode;
  result: SearchVideoResult[];
}

interface StreamResult {
  size: number;
  stream: Readable;
}

interface ChannelInfo {
  id?: string;
  name: string;
  subscriberCount: number;
  thumbnails: Array<{ url: string }>;
  username?: string;
}

interface CommandVideoInfo {
  author: string;
  channel: ChannelInfo;
  lengthSeconds: number;
  likes: number;
  thumbnails: Array<{ url: string }>;
  title: string;
  uploadDate: string;
  videoId: string;
  videoUrl: string;
  viewCount: number;
}

const REPLY_TYPE = "ytb-select";
const MAX_RESULTS = 6;
const MAX_SIZE_AUDIO = 26 * 1024 * 1024;
const MAX_SIZE_VIDEO = 83 * 1024 * 1024;
const TARGET_AUDIO_BITRATE = 128_000;
const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const DOWNLOAD_HEADERS = {
  "User-Agent": DESKTOP_USER_AGENT,
  Accept: "*/*",
  Referer: "https://www.youtube.com/",
  Range: "bytes=0-",
} as const;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const toNumber = (value: number | string | null | undefined): number =>
  typeof value === "number" ? value : Number.parseInt(String(value ?? 0), 10) || 0;

function tempRoot(): string {
  const dir = path.join(TEMP_DIR(), "ytb");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeFilename(value: string | undefined): string {
  const normalized = String(value || "")
    .replace(/[\\/:*?"<>|\x00-\x1F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, 120) : `ytb_${Date.now()}`;
}

function formatNumber(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("vi-VN").format(toNumber(value));
}

function formatDuration(value: number | string | null | undefined): string {
  const totalSeconds = toNumber(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseMode(value: string | undefined): DownloadMode | null {
  const normalized = String(value || "").toLowerCase();
  if (["-v", "video", "vid"].includes(normalized)) return "video";
  if (["-a", "-s", "audio", "sing"].includes(normalized)) return "audio";
  if (["-i", "info"].includes(normalized)) return "info";
  return null;
}

function getHeight(format: YoutubeFormat): number {
  if (typeof format.height === "number") return format.height;
  if (typeof format.height === "string") return Number.parseInt(format.height, 10) || 0;
  if (typeof format.qualityLabel === "string") {
    return Number.parseInt(format.qualityLabel.replace(/\D/g, ""), 10) || 0;
  }
  return 0;
}

function getMimeType(format: YoutubeFormat): string {
  return String(format.mimeType || "").toLowerCase();
}

function getCodecParts(format: YoutubeFormat): string[] {
  const match = getMimeType(format).match(/codecs="([^"]+)"/i);
  return (match?.[1] || "")
    .split(",")
    .map(part => part.trim())
    .filter(Boolean);
}

function hasAudioTrack(format: YoutubeFormat): boolean {
  if (format.hasAudio) return true;
  if (toNumber(format.audioBitrate || format.bitrate) > 0 && !getMimeType(format).startsWith("video/")) return true;
  if (typeof format.audioQuality === "string" && format.audioQuality.length > 0) return true;

  const codecs = getCodecParts(format);
  return (
    codecs.some(codec => /^(mp4a|opus|vorbis|aac|ac-3|ec-3|flac)/i.test(codec)) ||
    (getMimeType(format).startsWith("video/") && codecs.length > 1)
  );
}

function hasVideoTrack(format: YoutubeFormat): boolean {
  if (format.hasVideo) return true;
  return getMimeType(format).startsWith("video/") || getHeight(format) > 0;
}

function isMuxedFormat(format: YoutubeFormat): boolean {
  return Boolean(format.url && hasVideoTrack(format) && hasAudioTrack(format));
}

function isAudioOnlyFormat(format: YoutubeFormat): boolean {
  return Boolean(format.url && hasAudioTrack(format) && !hasVideoTrack(format));
}

function getFormatSize(format: YoutubeFormat): number {
  return toNumber(format.contentLength);
}

function isYoutubeUrl(input: string): boolean {
  try {
    return Boolean(getVideoID(input));
  } catch {
    return false;
  }
}

function safeGet(value: unknown, pathParts: Array<number | string>): unknown {
  let current: unknown = value;
  for (const part of pathParts) {
    if (typeof part === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[part];
      continue;
    }
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function findNodeWithKey(value: unknown, key: string): UnknownRecord | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNodeWithKey(item, key);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (isRecord(value[key])) return value[key] as UnknownRecord;
  for (const item of Object.values(value)) {
    const found = findNodeWithKey(item, key);
    if (found) return found;
  }
  return null;
}

function parseCountFromText(value: string | undefined): number {
  if (!value) return 0;
  const normalized = value.replace(/[\s,.]/g, "");
  const digits = normalized.match(/\d+/)?.[0];
  return digits ? Number.parseInt(digits, 10) : 0;
}

async function getStreamFromURL(url: string): Promise<Readable> {
  const response = await axios.get<Readable>(url, {
    responseType: "stream",
    headers: { "User-Agent": DESKTOP_USER_AGENT },
  });
  return response.data;
}

async function getStreamAndSize(url: string): Promise<StreamResult> {
  const response = await axios.get<Readable>(url, {
    responseType: "stream",
    headers: DOWNLOAD_HEADERS,
  });
  const contentLength = Number(response.headers["content-length"] || 0);
  const contentRange = String(response.headers["content-range"] || "");
  const total = contentRange.includes("/") ? Number(contentRange.split("/").pop() || 0) : contentLength;
  return {
    stream: response.data,
    size: total || contentLength,
  };
}

async function headTotal(url: string): Promise<number> {
  try {
    const response = await axios.get<Readable>(url, {
      responseType: "stream",
      headers: {
        ...DOWNLOAD_HEADERS,
        Range: "bytes=0-0",
      },
    });
    const contentRange = String(response.headers["content-range"] || "");
    const total = contentRange.includes("/")
      ? Number(contentRange.split("/").pop() || 0)
      : Number(response.headers["content-length"] || 0);
    response.data.destroy();
    return total || 0;
  } catch {
    return 0;
  }
}

async function pipeToFile(stream: Readable, outputPath: string): Promise<void> {
  const writer = fs.createWriteStream(outputPath);
  await new Promise<void>((resolve, reject) => {
    stream.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
    stream.on("error", reject);
  });
}

function pickAudioFormats(formats: YoutubeFormat[]): YoutubeFormat[] {
  return [...formats]
    .filter(isAudioOnlyFormat)
    .sort((left, right) => {
      const leftContainerRank = left.container === "mp4" ? 1 : 0;
      const rightContainerRank = right.container === "mp4" ? 1 : 0;
      if (rightContainerRank !== leftContainerRank) return rightContainerRank - leftContainerRank;

      const leftSize = getFormatSize(left);
      const rightSize = getFormatSize(right);
      if (rightSize !== leftSize) return rightSize - leftSize;

      const leftBitrate = Math.abs(toNumber(left.audioBitrate || left.bitrate) - TARGET_AUDIO_BITRATE);
      const rightBitrate = Math.abs(toNumber(right.audioBitrate || right.bitrate) - TARGET_AUDIO_BITRATE);
      return leftBitrate - rightBitrate;
    });
}

function pickVideoFormats(formats: YoutubeFormat[]): YoutubeFormat[] {
  return [...formats]
    .filter(isMuxedFormat)
    .sort((left, right) => {
      const leftContainerRank = left.container === "mp4" ? 1 : 0;
      const rightContainerRank = right.container === "mp4" ? 1 : 0;
      if (rightContainerRank !== leftContainerRank) return rightContainerRank - leftContainerRank;

      const leftHeightDiff = Math.abs(getHeight(left) - 360);
      const rightHeightDiff = Math.abs(getHeight(right) - 360);
      if (leftHeightDiff !== rightHeightDiff) return leftHeightDiff - rightHeightDiff;

      return getFormatSize(right) - getFormatSize(left);
    });
}

async function downloadBestFormat(
  formats: YoutubeFormat[],
  maxSize: number,
  fileBaseName: string,
  extensionResolver: (format: YoutubeFormat) => string
): Promise<string> {
  for (const format of formats) {
    const formatUrl = format.url;
    if (!formatUrl) continue;

    const estimatedSize = getFormatSize(format);
    if (estimatedSize > maxSize) continue;

    const actualSize = await headTotal(formatUrl);
    if (actualSize > maxSize) continue;

    const outputPath = path.join(tempRoot(), `${fileBaseName}.${extensionResolver(format)}`);
    const { stream, size } = await getStreamAndSize(formatUrl);
    if (size > maxSize) {
      stream.destroy();
      continue;
    }

    await pipeToFile(stream, outputPath);
    const stat = fs.statSync(outputPath);
    if (stat.size > maxSize) {
      fs.unlinkSync(outputPath);
      continue;
    }
    return outputPath;
  }

  throw new Error("Không tìm thấy định dạng phù hợp với giới hạn dung lượng");
}

async function getVideoInfo(input: string): Promise<CommandVideoInfo> {
  const videoId = getVideoID(input);
  const info = await ytdl.getInfo(videoId);
  const videoDetails = (info.videoDetails || {}) as YoutubeVideoDetails;

  let initialData: UnknownRecord | null = null;
  try {
    const { data: html } = await axios.get<string>(`https://youtu.be/${videoId}?hl=en`, {
      headers: { "User-Agent": DESKTOP_USER_AGENT },
    });
    initialData = extractYouTubeJSON(String(html), "ytInitialData");
  } catch {
    initialData = null;
  }

  const ownerRenderer = findNodeWithKey(initialData, "videoOwnerRenderer");
  const primaryInfoRenderer = findNodeWithKey(initialData, "videoPrimaryInfoRenderer");

  const likeText = String(
    safeGet(primaryInfoRenderer, [
      "videoActions",
      "menuRenderer",
      "topLevelButtons",
      0,
      "segmentedLikeDislikeButtonViewModel",
      "likeButtonViewModel",
      "likeButtonViewModel",
      "toggleButtonViewModel",
      "toggleButtonViewModel",
      "defaultButtonViewModel",
      "buttonViewModel",
      "accessibilityText",
    ]) || ""
  );

  const subscriberText =
    String(safeGet(ownerRenderer, ["subscriberCountText", "simpleText"]) || "") ||
    String(safeGet(ownerRenderer, ["subscriberCountText", "runs", 0, "text"]) || "");

  const channelThumbnails = Array.isArray(safeGet(ownerRenderer, ["thumbnail", "thumbnails"]))
    ? ((safeGet(ownerRenderer, ["thumbnail", "thumbnails"]) as Array<{ url?: string }>)
        .filter(item => typeof item.url === "string")
        .map(item => ({ url: item.url as string })))
    : [];

  const videoThumbnails = Array.isArray(videoDetails.thumbnail?.thumbnails)
    ? videoDetails.thumbnail.thumbnails
        .filter(item => typeof item.url === "string")
        .map(item => ({ url: item.url as string }))
    : [];

  return {
    videoId,
    title: videoDetails.title || "YouTube",
    videoUrl: `https://youtu.be/${videoId}`,
    lengthSeconds: toNumber(videoDetails.lengthSeconds),
    viewCount: toNumber(videoDetails.viewCount),
    uploadDate: String(safeGet(info, ["microformat", "playerMicroformatRenderer", "uploadDate"]) || ""),
    likes: parseCountFromText(likeText),
    thumbnails: videoThumbnails,
    author: videoDetails.author || "Unknown",
    channel: {
      id: String(safeGet(ownerRenderer, ["navigationEndpoint", "browseEndpoint", "browseId"]) || "") || undefined,
      username:
        String(safeGet(ownerRenderer, ["navigationEndpoint", "browseEndpoint", "canonicalBaseUrl"]) || "") ||
        undefined,
      name: String(safeGet(ownerRenderer, ["title", "runs", 0, "text"]) || videoDetails.author || "Unknown"),
      thumbnails: channelThumbnails,
      subscriberCount: parseAbbreviatedNumber(subscriberText) || 0,
    },
  };
}

async function handleMode(
  mode: DownloadMode,
  input: string,
  titleHint: string | undefined,
  ctx: Pick<CommandOnCallContext, "client" | "event" | "reply"> &
    Pick<CommandOnReplyContext, "client" | "event" | "reply">
): Promise<void> {
  const info = await getVideoInfo(input);

  if (mode === "info") {
    const attachments: Readable[] = [];
    const lastVideoThumb = info.thumbnails.at(-1)?.url;
    const lastChannelThumb = info.channel.thumbnails.at(-1)?.url;
    if (lastVideoThumb) attachments.push(await getStreamFromURL(lastVideoThumb));
    if (lastChannelThumb) attachments.push(await getStreamFromURL(lastChannelThumb));

    const body =
      `💠 Tiêu đề: ${info.title}\n` +
      `🏪 Channel: ${info.channel.name}\n` +
      `👨‍👩‍👧‍👦 Subscriber: ${formatNumber(info.channel.subscriberCount)}\n` +
      `⏱ Thời gian video: ${formatDuration(info.lengthSeconds)}\n` +
      `👀 Lượt xem: ${formatNumber(info.viewCount)}\n` +
      `👍 Lượt thích: ${formatNumber(info.likes)}\n` +
      `🆙 Ngày tải lên: ${info.uploadDate || "Không rõ"}\n` +
      `🔠 ID: ${info.videoId}\n` +
      `🔗 Link: ${info.videoUrl}`;

    await ctx.reply({
      body,
      ...(attachments.length > 0 ? { attachment: attachments } : {}),
    });
    return;
  }

  const note = await ctx.reply({
    body: `⬇️ Đang tải xuống ${mode === "audio" ? "âm thanh" : "video"} "${info.title}"`,
  });

  try {
    const downloadInfo = await ytdl.getInfo(info.videoId);
    const fileBaseName = `${sanitizeFilename(titleHint || info.title)}_${info.videoId}_${Date.now()}`;
    const outputPath =
      mode === "audio"
        ? await downloadBestFormat(pickAudioFormats(downloadInfo.formats), MAX_SIZE_AUDIO, fileBaseName, format => {
            return format.mimeType?.includes("webm") ? "webm" : format.mimeType?.includes("mp4") ? "m4a" : "mp3";
          })
        : await downloadBestFormat(pickVideoFormats(downloadInfo.formats), MAX_SIZE_VIDEO, fileBaseName, format => {
            return format.mimeType?.includes("webm") ? "webm" : "mp4";
          });

    await new Promise<void>((resolve, reject) => {
      ctx.client.sendMessage(
        {
          body: `${info.title}\n👤 ${info.channel.name}\n⏱ ${formatDuration(info.lengthSeconds)}`,
          attachment: fs.createReadStream(outputPath),
        },
        ctx.event.threadID,
        (error?: Error) => {
          if (error) reject(error);
          else resolve();
        },
        ctx.event.messageID
      );
    });

    setTimeout(() => {
      try {
        fs.unlinkSync(outputPath);
      } catch {
        // ignore cleanup errors
      }
    }, 60_000);
  } finally {
    if (note?.messageID) {
      try {
        await ctx.client.unsendMessage(note.messageID, ctx.event.threadID);
      } catch {
        // ignore unsend errors
      }
    }
  }
}

const ytbCommand: Command = {
  name: "ytb",
  alias: ["yt", "youtube", "ytdlp"],
  version: "3.0.0",
  role: 0,
  desc: "Tải video, audio hoặc xem thông tin YouTube bằng service mới",
  guide:
    "{pn} video <từ khóa|link>\n" +
    "{pn} audio <từ khóa|link>\n" +
    "{pn} info <từ khóa|link>\n" +
    "{pn} -v <từ khóa|link>\n" +
    "{pn} -a <từ khóa|link>\n" +
    "{pn} -i <từ khóa|link>",
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { args, event, reply, send, main, commandName } = ctx;

    try {
      const mode = parseMode(args?.[0]);
      if (!mode) {
        await reply({
          body:
            "Cú pháp:\n" +
            "• ytb video <từ khóa|link>\n" +
            "• ytb audio <từ khóa|link>\n" +
            "• ytb info <từ khóa|link>",
        });
        return;
      }

      const query = args.slice(1).join(" ").replace("?feature=share", "").trim();
      if (!query) {
        await reply({ body: `Thiếu nội dung sau "${args[0]}"` });
        return;
      }

      if (isYoutubeUrl(query)) {
        await handleMode(mode, query, undefined, ctx);
        return;
      }

      const searchResult: SearchResult = await youtubeSearch(query, { hl: "vi", gl: "VN" });
      const result = [...searchResult.live, ...searchResult.videos]
        .filter(item => item.seconds > 0)
        .slice(0, MAX_RESULTS);

      if (result.length === 0) {
        await reply({ body: `⭕ Không có kết quả phù hợp với từ khóa "${query}"` });
        return;
      }

      const body = result
        .map(
          (item, index) =>
            `${index + 1}. ${item.title}\n⏱ ${item.timestamp || "N/A"}\n📺 ${item.author || "Không rõ"}`
        )
        .join("\n\n");

      const sent = await send({
        body:
          `${body}\n\n` +
          `Reply số để chọn ${mode === "audio" ? "âm thanh" : mode === "video" ? "video" : "thông tin"} hoặc gửi nội dung khác để hủy`,
      });

      if (sent?.messageID && main?.onReply?.set) {
        main.onReply.set(
          sent.messageID,
          {
            commandName: commandName || "ytb",
            messageID: sent.messageID,
            author: String(event.senderID),
            type: REPLY_TYPE,
            mode,
            result,
          } as unknown as ReplyPickState
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await reply({ body: `❌ Đã xảy ra lỗi: ${message}` });
    }
  },

  async onReply(ctx: CommandOnReplyContext): Promise<void> {
    const { Reply, event, client, reply, main } = ctx;

    try {
      if (!Reply || String(event.senderID) !== String(Reply.author)) return;
      if ((Reply as { type?: string }).type !== REPLY_TYPE) return;

      const state = Reply as unknown as ReplyPickState & { type?: string };
      client.unsendMessage(state.messageID, event.threadID);

      const index = Number.parseInt(String(event.body || "").trim(), 10) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= state.result.length) {
        if (main?.onReply?.delete) {
          main.onReply.delete(state.messageID);
        }
        return;
      }

      const selected = state.result[index];
      const videoId = selected.videoId || selected.url;
      if (!videoId) {
        await reply({ body: "❌ Không lấy được video ID" });
        return;
      }

      await handleMode(state.mode, videoId, selected.title, ctx);

      if (main?.onReply?.delete) {
        main.onReply.delete(state.messageID);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await reply({ body: `❌ Đã xảy ra lỗi: ${message}` });
    }
  },
};

export default ytbCommand;
