import Cache from "./cache.js";
import * as innerTube from "./innertube-clients.js";
import * as urlUtils from "./url-utils.js";
import * as utils from "./utils.js";
import type { YoutubeInfo, YoutubeRequestConfig } from "./types.js";

export const cache = new Cache<string, Promise<YoutubeInfo>>();
export const watchPageCache = new Cache<string, Promise<string>>();

const getInfoDirect = async (id: string, options: YoutubeRequestConfig = {}): Promise<YoutubeInfo> => {
  utils.applyIPv6Rotations(options);
  utils.applyDefaultHeaders(options);
  utils.applyDefaultAgent(options);
  utils.applyOldLocalAddress(options);

  const info = await innerTube.getInfo(id, {
    agent: options.agent,
    headers: options.requestOptions?.headers,
    localAddress: options.requestOptions?.localAddress,
  });

  if (!info.success) {
    throw new Error("Failed to get video info from InnerTube");
  }

  return info;
};

const getBasicInfoDirect = async (id: string, options: YoutubeRequestConfig = {}): Promise<YoutubeInfo> =>
  getInfoDirect(id, options);

export const getBasicInfo = async (
  link: string,
  options: YoutubeRequestConfig = {}
): Promise<YoutubeInfo> => {
  const id = urlUtils.getVideoID(link);
  const key = ["getBasicInfo", id, options.lang || "en"].join("-");
  return cache.getOrSet(key, () => getBasicInfoDirect(id, options));
};

export const getInfo = async (
  link: string,
  options: YoutubeRequestConfig = {}
): Promise<YoutubeInfo> => {
  const id = urlUtils.getVideoID(link);
  const key = ["getInfo", id, options.lang || "en"].join("-");
  return cache.getOrSet(key, () => getInfoDirect(id, options));
};

export const validateID = urlUtils.validateID;
export const validateURL = urlUtils.validateURL;
export const getURLVideoID = urlUtils.getURLVideoID;
export const getVideoID = urlUtils.getVideoID;
