import cheerio from "cheerio";
import type { Context, DefaultFuncs } from "../../../types/request";
import { get } from "../../request/index";
interface TokenInfo {
  [key: string]: string | string[];
}

interface BasicScope {
  name: string;
  appliesTo: string;
}

interface ParsedAccessTokenData {
  tokenInfo: TokenInfo;
  basicScopes: BasicScope[];
}

type CheckTokenCallback = (err: any, data?: ParsedAccessTokenData) => void;

function parseAccessTokenDebug(html: string): ParsedAccessTokenData {
  const $ = cheerio.load(html);
  const result: ParsedAccessTokenData = {
    tokenInfo: {},
    basicScopes: [],
  };

  $("table._4-ss._5k-r")
    .first()
    .find("tr")
    .each((_i, row) => {
      const cells = $(row).find("td");
      if (cells.length === 2) {
        const key = $(cells[0]).find("span._c24._2iem").text().trim();
        const value = $(cells[1]).find("span._c24._2iem").text().trim();
        const cleanKey = key
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a")
          .replace(/[èéẹẻẽêềếệểễ]/g, "e")
          .replace(/[ìíịỉĩ]/g, "i")
          .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o")
          .replace(/[ùúụủũưừứựửữ]/g, "u")
          .replace(/[ỳýỵỷỹ]/g, "y")
          .replace(/đ/g, "d");

        result.tokenInfo[cleanKey] = value;

        const link = $(cells[1]).find("a").attr("href");
        if (link) {
          result.tokenInfo[`${cleanKey}_link`] = link;
        }
      }
    });

  $("table._4-ss._5k-r")
    .last()
    .find("tr")
    .each((_i, row) => {
      const cells = $(row).find("td");
      if (cells.length === 2) {
        const scope = $(cells[0]).find("span._c24._2iem").text().trim();
        const appliesTo = $(cells[1]).find("span._c24._2iem").text().trim();
        if (scope) {
          result.basicScopes.push({
            name: scope,
            appliesTo: appliesTo,
          });
        }
      }
    });

  const fullScopes = result.tokenInfo.pham_vi;
  if (fullScopes && typeof fullScopes === "string") {
    result.tokenInfo.scopes_array = fullScopes.split(", ").map((s: string) => s.trim());
  }

  return result;
}

export default function (_defaultFuncs: DefaultFuncs, _api: unknown, ctx: Context) {
  return async function checkToken(
    accessToken: string,
    callback?: CheckTokenCallback
  ): Promise<ParsedAccessTokenData | undefined> {
    try {
      const baseURL = "https://developers.facebook.com";
      const jar = ctx.jar;

      const customHeader: Record<string, string> = {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "vi,en-US;q=0.9,en;q=0.8",
        "cache-control": "max-age=0",
        "accept-encoding": "gzip, deflate, br",
        referer:
          "https://developers.facebook.com/tools/debug/accesstoken/?access_token=" +
          encodeURIComponent(accessToken) +
          "&version=v24.0",
        "sec-ch-prefers-color-scheme": "dark",
        "sec-ch-ua":
          '"Chromium";v="142", "Microsoft Edge";v="142", "Not_A Brand";v="99"',
        "sec-ch-ua-full-version-list":
          '"Chromium";v="142.0.7444.176", "Microsoft Edge";v="142.0.3595.94", "Not_A Brand";v="99.0.0.0"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-model": '""',
        "sec-ch-ua-platform": '"Windows"',
        "sec-ch-ua-platform-version": '"19.0.0"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0",
      };

      const queryParams: Record<string, string> = {
        access_token: String(accessToken),
        version: "v24.0",
      };

      const res = await get(
        `${baseURL}/tools/debug/accesstoken/`,
        jar,
        queryParams,
        undefined,
        ctx,
        customHeader
      );

      const html = typeof res === "string" ? res : res?.body || "";
      const data = parseAccessTokenDebug(String(html));

      if (callback) callback(null, data);
      return data;
    } catch (err: any) {
      if (callback) {
        callback(err);
        return undefined;
      }
      throw err;
    }
  };
}
