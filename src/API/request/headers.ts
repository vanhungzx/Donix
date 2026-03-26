import { randomUserAgent } from "./user-agents";

type HeaderRecord = Record<string, string>;

type CustomHeaders = HeaderRecord & {
  noRef?: boolean;
};

const getHeaders = (
  urlStr: string,
  _options?: Record<string, unknown>,
  ctx?: any,
  customHeader?: CustomHeaders,
  method: string = "GET"
): HeaderRecord => {
  const host = new URL(urlStr).hostname;
  const referer = `https://${host}/`;
  const isGraphQLAPI = urlStr.includes("/api/graphql/");
  if (isGraphQLAPI && method.toUpperCase() === "POST" && ctx) {
    const cookieString = ctx.jar?.getCookieStringSync
      ? ctx.jar.getCookieStringSync(`https://${host}/`)
      : ctx.jar?.cookieString?.() || "";
    const { userAgent, secChUa, secChUaFullVersionList, secChUaPlatform, secChUaPlatformVersion } = randomUserAgent();
    const graphQLHeaders: HeaderRecord = {
      'accept': '*/*',
      'accept-encoding': 'gzip, deflate, br',
      'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      'content-type': 'application/x-www-form-urlencoded',
      'cookie': cookieString,
      'origin': `https://${host}`,
      'priority': 'u=1, i',
      'referer': `https://${host}/`,
      'sec-ch-ua': secChUa,
      'sec-ch-ua-full-version-list': secChUaFullVersionList,
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-model': '""',
      'sec-ch-ua-platform': secChUaPlatform,
      'sec-ch-ua-platform-version': secChUaPlatformVersion,
      'sec-ch-ua-arch': '"x86"',
      'sec-ch-ua-bitness': '"64"',
      'sec-ch-ua-wow64': '?0',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': userAgent,
      'x-asbd-id': '359341',
      'x-fb-http-engine': 'Liger',
      'x-fb-connection-type': 'WIFI',
      'x-fb-client-ip': 'True',
      'x-fb-server-cluster': 'True',
    };
    if (ctx.lsd) {
      graphQLHeaders['x-fb-lsd'] = ctx.lsd;
    }
    if (customHeader?.['x-fb-friendly-name']) {
      graphQLHeaders['x-fb-friendly-name'] = customHeader['x-fb-friendly-name'];
    }
    if (!customHeader?.['x-fb-request-analytics-tags']) {
      graphQLHeaders['x-fb-request-analytics-tags'] = '{"network_tags":{"product":"6628568379","request_category":"graphql","purpose":"fetch","retry_attempt":"0"},"application_tags":"graphservice"}';
    }
    if (customHeader) {
      Object.assign(graphQLHeaders, customHeader);
      if (customHeader.noRef) {
        delete graphQLHeaders.referer;
      }
    }

    return graphQLHeaders;
  }

  // Get user agent for non-GraphQL requests
  const { userAgent, secChUa, secChUaFullVersionList, secChUaPlatform, secChUaPlatformVersion } = randomUserAgent();

  const baseHeaders: HeaderRecord = {
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    // Note: "Connection" header is not allowed in HTTP/2, so we don't include it
    "Dpr": "1",
    "Origin": `https://${host}`,
    "Referer": referer,
    "Sec-Ch-Prefers-Color-Scheme": "light",
    "Sec-Ch-Ua": secChUa,
    "Sec-Ch-Ua-Full-Version-List": secChUaFullVersionList,
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Model": '""',
    "Sec-Ch-Ua-Platform": secChUaPlatform,
    "Sec-Ch-Ua-Platform-Version": secChUaPlatformVersion,
    "Sec-Ch-Ua-Arch": '"x86"',
    "Sec-Ch-Ua-Bitness": '"64"',
    "Sec-Ch-Ua-Wow64": "?0",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": userAgent,
    "Viewport-Width": "1920",
    "Width": "1920",
  };

  if (method.toUpperCase() === "GET") {
    baseHeaders["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";
    baseHeaders["Cache-Control"] = "max-age=0";
    baseHeaders["Sec-Fetch-Dest"] = "document";
    baseHeaders["Sec-Fetch-Mode"] = "navigate";
    baseHeaders["Sec-Fetch-Site"] = "same-origin";
    baseHeaders["Sec-Fetch-User"] = "?1";
    baseHeaders["Priority"] = "u=0, i";
  } else if (method.toUpperCase() === "POST") {
    baseHeaders["Accept"] = "*/*";
    baseHeaders["Cache-Control"] = "no-cache";
    baseHeaders["Sec-Fetch-Dest"] = "empty";
    baseHeaders["Sec-Fetch-Mode"] = "cors";
    baseHeaders["Sec-Fetch-Site"] = "same-origin";

    baseHeaders["Priority"] = "u=1, i";
  } else {

    baseHeaders["Accept"] = "*/*";
    baseHeaders["Cache-Control"] = "no-cache";
    baseHeaders["Sec-Fetch-Dest"] = "empty";
    baseHeaders["Sec-Fetch-Mode"] = "cors";
    baseHeaders["Sec-Fetch-Site"] = "same-origin";
  }

  const headers: HeaderRecord = { ...baseHeaders };

  if (ctx?.fb_dtsg) {
    headers["X-Fb-Lsd"] = ctx.lsd;
  }
  if (ctx?.region) {
    headers["X-MSGR-Region"] = ctx.region;
  }
  if (ctx?.master) {
    const { __spin_r, __spin_b, __spin_t } = ctx.master;
    if (__spin_r) headers["X-Fb-Spin-R"] = String(__spin_r);
    if (__spin_b) headers["X-Fb-Spin-B"] = String(__spin_b);
    if (__spin_t) headers["X-Fb-Spin-T"] = String(__spin_t);
  }

  if (customHeader) {
    Object.assign(headers, customHeader);
    if (customHeader.noRef) {
      delete headers.Referer;
    }
  }

  return headers;
};

const meta = (prop: string): RegExp => new RegExp(`<meta property="${prop}" content="([^"]*)"`);

const headerUtils = {
  getHeaders,
  meta,
};

export default headerUtils;
export { getHeaders, meta };
