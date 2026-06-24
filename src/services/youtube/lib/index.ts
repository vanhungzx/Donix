import { PassThrough } from "stream";
import { request } from "undici";
import * as agent from "./agent.js";
import * as formatUtils from "./format-utils.js";
import * as getInfo from "./info.js";
import * as urlUtils from "./url-utils.js";
import * as utils from "./utils.js";
import * as videoUtils from "./video-utils.js";
import type { YoutubeFormat, YoutubeInfo, YoutubeRequestOptions, YtdlOptions } from "./types.js";

type YtdlFunction = ((link: string, options?: YtdlOptions) => PassThrough) & {
  cache: {
    info: typeof getInfo.cache;
    watch: typeof getInfo.watchPageCache;
  };
  chooseFormat: typeof formatUtils.chooseFormat;
  createAgent: typeof agent.createAgent;
  createProxyAgent: typeof agent.createProxyAgent;
  downloadFromInfo: (info: YoutubeInfo, options?: YtdlOptions) => PassThrough;
  filterFormats: typeof formatUtils.filterFormats;
  getBasicInfo: typeof getInfo.getBasicInfo;
  getInfo: typeof getInfo.getInfo;
  getURLVideoID: typeof urlUtils.getURLVideoID;
  getVideoID: typeof urlUtils.getVideoID;
  validateID: typeof urlUtils.validateID;
  validateURL: typeof urlUtils.validateURL;
};

const toNumber = (value: number | string | null | undefined): number =>
  typeof value === "number" ? value : Number.parseInt(String(value ?? 0), 10) || 0;

const createUndiciStream = (url: string, options: YoutubeRequestOptions = {}): PassThrough => {
  const stream = new PassThrough();

  void (async () => {
    try {
      const response = await request(url, {
        method: options.method || "GET",
        headers: options.headers,
        dispatcher: options.dispatcher,
        body: options.body,
      });

      stream.emit("response", {
        statusCode: response.statusCode,
        headers: response.headers,
      });

      if (response.statusCode < 200 || response.statusCode >= 400) {
        stream.emit("error", new Error(`Status code: ${response.statusCode}`));
        return;
      }

      for await (const chunk of response.body) {
        stream.write(chunk);
      }
      stream.end();
    } catch (error) {
      stream.emit("error", error instanceof Error ? error : new Error(String(error)));
    }
  })();

  return stream;
};

const createStream = (options: YtdlOptions = {}): PassThrough =>
  new PassThrough({ highWaterMark: options.highWaterMark || 1024 * 512 });

const parseBegin = (value: Date | number | string): string => {
  if (value instanceof Date) return String(Math.floor(value.getTime() / 1000));
  return String(value);
};

const attachAgentOptions = (options: YtdlOptions): YoutubeRequestOptions => {
  utils.applyDefaultHeaders(options);
  utils.applyDefaultAgent(options);
  utils.applyOldLocalAddress(options);

  const requestOptions = options.requestOptions ?? {};
  requestOptions.headers = {
    Accept: "*/*",
    "Accept-Encoding": "identity",
    Connection: "keep-alive",
    Referer: "https://www.youtube.com/",
    ...(requestOptions.headers || {}),
  };

  if (options.agent?.jar) {
    requestOptions.headers.cookie = options.agent.jar.getCookieStringSync("https://www.youtube.com");
  }
  if (options.agent?.dispatcher) {
    requestOptions.dispatcher = options.agent.dispatcher;
  }
  if (options.agent?.localAddress) {
    requestOptions.localAddress = options.agent.localAddress;
  }
  if (options.IPv6Block) {
    requestOptions.localAddress = utils.getRandomIPv6(options.IPv6Block);
  }

  return requestOptions;
};

const resolveSelectedFormat = async (format: YoutubeFormat, options: YtdlOptions): Promise<YoutubeFormat> => {
  if (videoUtils.hasValidUrl(format) && !videoUtils.needsDecipher(format)) {
    return format;
  }
  if (options.autoDecipher === false) {
    throw new Error("Format requires decipher but autoDecipher is disabled");
  }
  const url = await videoUtils.resolveFormatUrl(format, null, {
    timeout: options.decipherTimeout,
    retries: options.decipherRetries,
    validate: true,
  });
  return { ...format, url, _deciphered: true };
};

const streamHlsOrDash = async (
  stream: PassThrough,
  format: YoutubeFormat,
  requestOptions: YoutubeRequestOptions
): Promise<void> => {
  try {
    const m3u8Module = await import("m3u8stream");
    const m3u8stream = "default" in m3u8Module ? m3u8Module.default : m3u8Module;
    const source = m3u8stream(format.url || "", {
      chunkReadahead: 3,
      begin: false,
      requestOptions,
      parser: format.isDashMPD ? "dash-mpd" : "m3u8",
      id: format.itag,
    });
    source.on("progress", (segment, totalSegments) => {
      stream.emit("progress", segment.size, segment.num, totalSegments);
    });
    source.on("error", error => {
      stream.emit("error", error);
    });
    source.pipe(stream);
  } catch {
    stream.emit("error", new Error("HLS/DASH download requires the optional m3u8stream package"));
  }
};

const downloadFromInfoCallback = async (
  stream: PassThrough,
  info: YoutubeInfo,
  options: YtdlOptions = {}
): Promise<void> => {
  try {
    const playbackSource = typeof info.player_response === "string" ? info : info.player_response || info;
    const playbackError = utils.playError(playbackSource);
    if (playbackError) {
      stream.emit("error", playbackError);
      return;
    }

    if (!info.formats.length) {
      stream.emit("error", new Error("This video is unavailable"));
      return;
    }

    const selected = await resolveSelectedFormat(formatUtils.chooseFormat(info.formats, options), options);
    if (!selected.url) {
      stream.emit("error", new Error("Format does not include a valid URL"));
      return;
    }

    stream.emit("info", info, selected);
    const requestOptions = attachAgentOptions(options);

    if (options.range?.start !== undefined || options.range?.end !== undefined) {
      requestOptions.headers = {
        ...requestOptions.headers,
        Range: `bytes=${options.range?.start || 0}-${options.range?.end || ""}`,
      };
    }

    let downloadUrl = selected.url;
    if (options.begin && !selected.isHLS && !selected.isDashMPD) {
      const url = new URL(downloadUrl);
      url.searchParams.set("begin", parseBegin(options.begin));
      downloadUrl = url.toString();
    }

    if (selected.isHLS || selected.isDashMPD) {
      await streamHlsOrDash(stream, { ...selected, url: downloadUrl }, requestOptions);
      return;
    }

    const totalLength = toNumber(selected.contentLength);
    let downloaded = 0;
    const source = createUndiciStream(downloadUrl, requestOptions);
    source.on("data", chunk => {
      const size = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
      downloaded += size;
      stream.emit("progress", size, downloaded, totalLength);
    });
    source.on("error", error => {
      stream.emit("error", error);
    });
    source.pipe(stream);
  } catch (error) {
    stream.emit("error", error instanceof Error ? error : new Error(String(error)));
  }
};

const ytdl = ((link: string, options: YtdlOptions = {}): PassThrough => {
  const stream = createStream(options);
  void ytdl.getInfo(link, options).then(
    info => downloadFromInfoCallback(stream, info, options),
    error => stream.emit("error", error)
  );
  return stream;
}) as YtdlFunction;

ytdl.getBasicInfo = getInfo.getBasicInfo;
ytdl.getInfo = getInfo.getInfo;
ytdl.chooseFormat = formatUtils.chooseFormat;
ytdl.filterFormats = formatUtils.filterFormats;
ytdl.validateID = urlUtils.validateID;
ytdl.validateURL = urlUtils.validateURL;
ytdl.getURLVideoID = urlUtils.getURLVideoID;
ytdl.getVideoID = urlUtils.getVideoID;
ytdl.createAgent = agent.createAgent;
ytdl.createProxyAgent = agent.createProxyAgent;
ytdl.cache = {
  info: getInfo.cache,
  watch: getInfo.watchPageCache,
};

ytdl.downloadFromInfo = (info: YoutubeInfo, options: YtdlOptions = {}): PassThrough => {
  const stream = createStream(options);
  if (!info.full) {
    throw Error("Cannot use `ytdl.downloadFromInfo()` when called with info from `ytdl.getBasicInfo()`");
  }
  void downloadFromInfoCallback(stream, info, options);
  return stream;
};

export default ytdl;
