import cheerio from "cheerio";
import util from "util";
import logger from "@log";
import network from "./axios.js";
import clients from "./clients.js";
import constants from "./constants.js";
import formatters from "./formatters.js";
import headers from "./headers.js";
import userAgents from "./user-agents.js";
const json = async (
  url: string,
  jar: any,
  qs?: Record<string, any> | null,
  options?: Record<string, any>,
  ctx?: any,
  customHeader?: Record<string, string>
): Promise<any[]> => {
  try {
    const res = await network.get(url, jar, qs || undefined, options, ctx, customHeader);
    const body = res.body;
    const $ = cheerio.load(body);
    const scripts = $('script[type="application/json"]');

    if (scripts.length === 0) {
      logger.warn(`No <script type="application/json"> tags found on ${url}`);
      return [];
    }

    const allJsonData: any[] = [];
    scripts.each((index, element) => {
      try {
        const jsonContent = $(element).html();
        if (jsonContent) {
          allJsonData.push(JSON.parse(jsonContent));
        }
      } catch {
        logger.warn(`Could not parse JSON from script #${index + 1} on ${url}`);
      }
    });

    return allJsonData;
  } catch (error) {
    logger.error(`Error in utils.json fetching from ${url}: ${error}`);
    throw error;
  }
};

const makeDefaults = (html: string, userID: string | number, ctx: any) => {
  let reqCounter = 1;
  const revision = constants.getFrom(html, 'revision":', ",");

  const mergeWithDefaults = (obj?: Record<string, any>) => {
    const newObj: Record<string, any> = {
      av: userID,
      __user: userID,
      __req: (reqCounter++).toString(36),
      __rev: revision,
      __a: 1,
      ...(ctx && {
        fb_dtsg: ctx.fb_dtsg,
        jazoest: ctx.jazoest,
      }),
    };

    if (!obj) return newObj;

    for (const prop in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, prop) && !newObj[prop]) {
        newObj[prop] = obj[prop];
      }
    }

    return newObj;
  };

  return {
    get: (url: string, jar: any, qs?: Record<string, any> | null, ctxx?: any, customHeader: Record<string, string> = {}) =>
      network.get(url, jar, mergeWithDefaults(qs || undefined), ctx.globalOptions, ctxx || ctx, customHeader),
    post: (url: string, jar: any, form?: Record<string, any>, ctxx?: any, customHeader: Record<string, string> = {}) =>
      network.post(url, jar, mergeWithDefaults(form), ctx.globalOptions, ctxx || ctx, customHeader),
    postFormData: (url: string, jar: any, form?: Record<string, any>, qs?: Record<string, any>, ctxx?: any) =>
      network.postFormData(
        url,
        jar,
        mergeWithDefaults(form),
        mergeWithDefaults(qs),
        ctx.globalOptions,
        ctxx || ctx
      ),
  };
};

const utils = {
  ...network,
  ...headers,
  ...clients,
  ...constants,
  ...formatters,
  ...userAgents,
  json,
  makeDefaults,
  promisify: <T extends (...args: any[]) => any>(func: T) => util.promisify(func),
  delay: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const getJar = network.getJar;
const { get, post, postFormData } = network;

export default utils;
export { getHeaders } from "./headers.js";
export { get, getJar, json, makeDefaults, post, postFormData };
