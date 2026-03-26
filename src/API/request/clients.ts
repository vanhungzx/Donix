import { makeParsable } from "./constants.js";

const formatCookie = (arr: string[], url: string): string =>
  `${arr[0]}=${arr[1]}; Path=${arr[3]}; Domain=${url}.com`;

const parseAndCheckLogin = (ctx: any, http: any, retryCount = 0) => {
  const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  return async (data: any): Promise<any> => {
    if (data.statusCode >= 500 && data.statusCode < 600) {
      if (retryCount >= 5) {
        const err: any = new Error("Request retry failed. Check the `res` and `statusCode` property on this error.");
        err.statusCode = data.statusCode;
        err.res = data.body;
        err.error = err.message;
        throw err;
      }

      retryCount += 1;
      const retryTime = Math.floor(Math.random() * 5000);
      const { protocol, hostname, pathname } = data.request.uri;
      const retryUrl = `${protocol}//${hostname}${pathname}`;
      await delay(retryTime);

      const nextData =
        data.request.headers["content-type"].split(";")[0] === "multipart/form-data"
          ? await http.postFormData(
              retryUrl,
              ctx.jar,
              data.request.formData,
              data.request.qs,
              ctx.globalOptions,
              ctx
            )
          : await http.post(retryUrl, ctx.jar, data.request.form, ctx.globalOptions, ctx);
      return parseAndCheckLogin(ctx, http, retryCount)(nextData);
    }

    if (data.statusCode === 404) {
      return;
    }

    if (data.statusCode !== 200) {
      throw new Error(`parseAndCheckLogin got status code: ${data.statusCode}.`);
    }

    let res: any;
    if (typeof data.body === "object" && data.body !== null) {
      res = data.body;
    } else if (typeof data.body === "string") {
      try {
        res = JSON.parse(makeParsable(data.body));
      } catch (e) {
        const err: any = new Error("JSON.parse error. Check the `detail` property on this error.");
        err.error = err.message;
        err.detail = e;
        err.res = data.body;
        throw err;
      }
    } else {
      throw new Error(`Unknown response body type: ${typeof data.body}`);
    }

    if (res.redirect && data.request.method === "GET") {
      const redirectRes = await http.get(res.redirect, ctx.jar);
      return parseAndCheckLogin(ctx, http)(redirectRes);
    }

    if (
      res.jsmods &&
      res.jsmods.require &&
      Array.isArray(res.jsmods.require[0]) &&
      res.jsmods.require[0][0] === "Cookie"
    ) {
      res.jsmods.require[0][3][0] = res.jsmods.require[0][3][0].replace("_js_", "");
      const requireCookie = res.jsmods.require[0][3];
      ctx.jar.setCookie(formatCookie(requireCookie, "facebook"), "https://www.facebook.com");
      // Also bind cookie to business subdomain for business.* endpoints
      ctx.jar.setCookie(formatCookie(requireCookie, "facebook"), "https://business.facebook.com");
      ctx.jar.setCookie(formatCookie(requireCookie, "messenger"), "https://www.messenger.com");
    }

    if (res.jsmods && Array.isArray(res.jsmods.require)) {
      const arr = res.jsmods.require;
      for (const entry of arr) {
        if (entry[0] === "DTSG" && entry[1] === "setToken") {
          ctx.fb_dtsg = entry[3][0];
          ctx.ttstamp = "2";
          for (let j = 0; j < ctx.fb_dtsg.length; j++) {
            ctx.ttstamp += ctx.fb_dtsg.charCodeAt(j);
          }
        }
      }
    }

    if (res.error === 1357001) {
      const err: any = new Error("Facebook blocked the login");
      err.error = "Not logged in.";
      throw err;
    }

    return res;
  };
};

const saveCookies = (jar: any) => (res: any) => {
  const cookies = res.headers["set-cookie"] || [];
  cookies.forEach((c: string) => {
    if (c.includes(".facebook.com")) {
      jar.setCookie(c, "https://www.facebook.com");
      // Also bind to business subdomain for business.* endpoints
      jar.setCookie(c, "https://business.facebook.com");
    }
    const c2 = c.replace(/domain=\.facebook\.com/, "domain=.messenger.com");
    jar.setCookie(c2, "https://www.messenger.com");
  });
  return res;
};

const getAccessFromBusiness = (jar: any, Options: any) => {
  return async (res: any): Promise<[any, string | null]> => {
    const html = res ? res.body : null;
    try {
      const requestModule: any = await import("./index.js");
      const getFn = requestModule.default?.get || requestModule.get;
      if (!getFn) return [html, null];
      const businessRes = await getFn(
        "https://business.facebook.com/content_management",
        jar,
        null,
        Options,
        null,
        { noRef: true }
      );
      const match = /"accessToken":"([^.]+)","clientID":/.exec(businessRes.body);
      const token = match?.[1] ?? null;
      return [html, token];
    } catch (e) {
      return [html, null];
    }
  };
};

const getAppState = (jar: any) =>
  jar.getCookiesSync("https://business.facebook.com")
    .concat(jar.getCookiesSync("https://www.facebook.com"))
    .concat(jar.getCookiesSync("https://www.messenger.com"));

const clientUtils = {
  parseAndCheckLogin,
  saveCookies,
  getAccessFromBusiness,
  getAppState,
};

export default clientUtils;
export { parseAndCheckLogin, saveCookies, getAccessFromBusiness, getAppState };
