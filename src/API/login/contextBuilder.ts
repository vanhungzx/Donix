import log from "@log";
import cheerio from "cheerio";
import type { Cookie as ToughCookie } from "tough-cookie";
import type { FBResponse } from "../../types/request.js";
import { getSequenceIdFromHtml } from "../handle/mqtt/htmlSequenceId.js";
import type { Context, DefaultFuncs, GlobalOptions } from "../request/formatters/helpers.js";
import { parseAndCheckLogin } from "../request/formatters/helpers.js";
import { getFrom } from "../utils/htmlParser.js";

export function extractUserID(jar: Context["jar"]): string | null {
  const cookies: ToughCookie[] = jar.getCookiesSync
    ? (jar.getCookiesSync("https://www.facebook.com/") as ToughCookie[])
    : [];
  const user = cookies.find((c) => {
    const cs = (c as ToughCookie & { cookieString?: () => string }).cookieString
      ? (c as ToughCookie & { cookieString: () => string }).cookieString()
      : `${c.key}=${c.value}`;
    return /^(c|i)_user=/.test(cs);
  });
  if (!user) return null;
  const uStr = (user as ToughCookie & { cookieString?: () => string }).cookieString
    ? (user as ToughCookie & { cookieString: () => string }).cookieString()
    : `${user.key}=${user.value}`;
  return uStr.split("=")[1] || null;
}

export function buildContext(
  html: string,
  userID: string,
  jar: Context["jar"],
  opts: GlobalOptions
): Context {
  const clientID = (Math.random() * 2147483648 | 0).toString(16);
  const endpoint = html.match(/"endpoint":"([^"]+)"/)?.[1]?.replace(/\\/g, '');
  const fb_dtsg = getFrom(html, '["DTSGInitData",[],{"token":"', '","') || "";

  let lastSeqId: string | undefined = undefined;
  try {

    lastSeqId = getSequenceIdFromHtml(html) || undefined;

    if (!lastSeqId) {
      lastSeqId = html.match(/irisSeqID":"([^"]+)"/)?.[1];
    }
    if (lastSeqId) {
      log.system(`Đã lấy sequence ID khi login: ${lastSeqId}`);
    }
  } catch (e: Error | unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    log.warn(`Không thể lấy sequence ID khi login: ${errorMessage}`);
  }

  return {
    userID,
    jar,
    clientID,
    options: opts,
    fb_dtsg,
    access_token: "NONE",
    clientMutationId: 0,
    loggedIn: true,
    lastSeqId,
    mqttEndpoint: endpoint || `wss://edge-chat.facebook.com/chat?region=unknown`,
    region: endpoint?.match(/[?&]region=([a-zA-Z0-9_-]+)/)?.[1],
    clientId: getFrom(html, '["MqttWebDeviceID",[],{"clientID":"', '"}') || "",
    callback_Task: new Map<string, (result: string | number | boolean | null | undefined | Record<string, string | number | boolean | null | undefined>) => void>(),
    reqCallbacks: new Map<string, (result: string | number | boolean | null | undefined | Record<string, string | number | boolean | null | undefined>) => void>(),
    firstListen: true,
    req_ID: 0,
    wsReqNumber: 0,
    wsTaskNumber: 0,
    mqttClient: undefined
  };
}


interface Utils {
  getAppState: (jar: Context["jar"]) => ToughCookie[];
}

export function buildClient(
  userID: string,
  jar: Context["jar"],
  opts: GlobalOptions,
  def: DefaultFuncs,
  ctx: Context,
  utils: Utils
): {
  setOptions: (newOpts: Partial<GlobalOptions>) => void;
  getAppState: () => ToughCookie[];
  getCurrentUserID: () => string;
  id: string;
  ctx: Context;
  cookie: string;
} {
  return {
    setOptions: (newOpts: Partial<GlobalOptions>) => Object.assign(opts, newOpts),
    getAppState: () => utils.getAppState(jar),
    getCurrentUserID: () => userID,
    id: userID,
    ctx,
    cookie: ctx.jar.getCookieStringSync("https://www.facebook.com/")
  };
}
