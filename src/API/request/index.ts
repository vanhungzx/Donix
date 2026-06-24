import cheerio from "cheerio";
import util from "util";
import logger from "@log";
import type { Context, GlobalOptions } from "../../types/request.js";
import network, { type FormRecord as QueryParamRecord, type PostBodyRecord } from "./axios.js";
import clients from "./clients.js";
import constants from "./constants.js";
import formatters from "./formatters.js";
import headers from "./headers.js";
import userAgents from "./user-agents.js";

type FormField = string | number | boolean | null | undefined;
type MergedForm = Record<string, FormField>;

const json = async (
  url: string,
  jar: Context["jar"],
  qs?: Record<string, FormField> | null,
  options?: GlobalOptions | null,
  ctx?: Context | null,
  customHeader?: Record<string, string>
): Promise<unknown[]> => {
  try {
    const res = await network.get(url, jar, qs || undefined, options, ctx, customHeader);
    const body = res.body;
    const html = typeof body === "string" ? body : String(body ?? "");
    const $ = cheerio.load(html);
    const scripts = $('script[type="application/json"]');

    if (scripts.length === 0) {
      logger.warn(`No <script type="application/json"> tags found on ${url}`);
      return [];
    }

    const allJsonData: unknown[] = [];
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

const makeDefaults = (html: string, userID: string | number, ctx: Context) => {
  let reqCounter = 1;
  const revision =
    constants.getFrom(html, 'revision":', ",") ||
    constants.getFrom(html, '"client_revision":', ",") ||
    "";
  const requestOpts: GlobalOptions = ctx.globalOptions ?? ctx.options;

  const mergeWithDefaults = (obj?: MergedForm): Record<string, unknown> => {
    const newObj: Record<string, unknown> = {
      av: userID,
      __user: userID,
      __req: (reqCounter++).toString(36),
      __rev: revision,
      __a: 1,
      fb_dtsg: ctx.fb_dtsg,
      jazoest: ctx.jazoest,
    };
    if (ctx.__dyn) newObj.__dyn = ctx.__dyn;
    if (ctx.__csr) newObj.__csr = ctx.__csr;
    if (ctx.__hs) newObj.__hs = ctx.__hs;
    if (ctx.__hsi) newObj.__hsi = ctx.__hsi;
    const lsdBody = ctx.fb_lsd ?? ctx.lsd;
    if (lsdBody) newObj.lsd = lsdBody;

    if (!obj) return newObj;

    for (const prop in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, prop) && !(prop in newObj)) {
        newObj[prop] = obj[prop];
      }
    }

    return newObj;
  };

  return {
    get: (
      url: string,
      jar: Context["jar"],
      qs?: MergedForm | null,
      ctxx?: Context | null,
      customHeader: Record<string, string> = {}
    ) =>
      network.get(
        url,
        jar,
        mergeWithDefaults(qs || undefined) as QueryParamRecord,
        requestOpts,
        ctxx ?? ctx,
        customHeader
      ),
    post: (
      url: string,
      jar: Context["jar"],
      form?: MergedForm,
      ctxx?: Context | null,
      customHeader: Record<string, string> = {}
    ) =>
      network.post(url, jar, mergeWithDefaults(form) as PostBodyRecord, requestOpts, ctxx ?? ctx, customHeader),
    postFormData: (
      url: string,
      jar: Context["jar"],
      form?: MergedForm,
      qs?: MergedForm,
      ctxx?: Context | null
    ) =>
      network.postFormData(
        url,
        jar,
        mergeWithDefaults(form),
        mergeWithDefaults(qs) as QueryParamRecord,
        requestOpts,
        ctxx ?? ctx
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
  promisify: util.promisify,
  delay: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const getJar = network.getJar;
const { get, post, postFormData } = network;

export default utils;
export { getHeaders } from "./headers.js";
export { get, getJar, json, makeDefaults, post, postFormData };
