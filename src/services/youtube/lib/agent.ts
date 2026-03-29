import HttpsProxyAgent from "https-proxy-agent";
import { CookieAgent, cookie } from "http-cookie-agent/undici";
import { Cookie, CookieJar, canonicalDomain } from "tough-cookie";
import { ProxyAgent } from "undici";
import type { CookieInput, YoutubeAgent } from "./types.js";

interface ProxyOptions {
  localAddress?: string;
  uri: string;
}

interface AgentOptions {
  cookies?: {
    jar: CookieJar;
  };
  localAddress?: string;
}

const convertSameSite = (sameSite?: string): "lax" | "none" | "strict" => {
  switch (sameSite) {
    case "strict":
      return "strict";
    case "lax":
      return "lax";
    default:
      return "none";
  }
};

const convertCookie = (cookieValue: CookieInput): Cookie =>
  cookieValue instanceof Cookie
    ? cookieValue
    : new Cookie({
        key: cookieValue.name,
        value: cookieValue.value,
        expires:
          typeof cookieValue.expirationDate === "number"
            ? new Date(cookieValue.expirationDate * 1000)
            : "Infinity",
        domain: canonicalDomain(cookieValue.domain),
        path: cookieValue.path,
        secure: cookieValue.secure,
        httpOnly: cookieValue.httpOnly,
        sameSite: convertSameSite(cookieValue.sameSite),
        hostOnly: cookieValue.hostOnly,
      });

export const addCookies = (jar: CookieJar, cookies: CookieInput[]): void => {
  if (!Array.isArray(cookies)) {
    throw new Error("cookies must be an array");
  }

  if (!cookies.some(cookieValue => "name" in cookieValue && cookieValue.name === "SOCS")) {
    cookies.push({
      domain: ".youtube.com",
      hostOnly: false,
      httpOnly: false,
      name: "SOCS",
      path: "/",
      sameSite: "lax",
      secure: true,
      session: false,
      value: "CAI",
    });
  }

  for (const cookieValue of cookies) {
    jar.setCookieSync(convertCookie(cookieValue), "https://www.youtube.com");
  }
};

export const addCookiesFromString = (jar: CookieJar, cookies: string): void => {
  if (typeof cookies !== "string") {
    throw new Error("cookies must be a string");
  }

  const parsedCookies = cookies
    .split(";")
    .map(value => Cookie.parse(value))
    .filter((value): value is Cookie => value instanceof Cookie);

  addCookies(jar, parsedCookies);
};

export const createAgent = (cookies: CookieInput[] = [], opts: AgentOptions = {}): YoutubeAgent => {
  const options = { ...opts };
  if (!options.cookies) {
    const jar = new CookieJar();
    addCookies(jar, cookies);
    options.cookies = { jar };
  }

  const dispatcher = new CookieAgent(options as ConstructorParameters<typeof CookieAgent>[0]);
  return {
    dispatcher,
    localAddress: options.localAddress,
    jar: options.cookies.jar,
    _ipBound: !!options.localAddress,
    _boundIP: options.localAddress,
  };
};

export const createProxyAgent = (
  options: ProxyOptions | string,
  cookies: CookieInput[] = []
): YoutubeAgent => {
  const resolvedOptions = typeof options === "string" ? { uri: options } : options;
  const jar = new CookieJar();
  addCookies(jar, cookies);

  const agent = new HttpsProxyAgent(resolvedOptions.uri);
  const dispatcher = new ProxyAgent(resolvedOptions).compose(cookie({ jar }));

  return {
    dispatcher,
    agent,
    jar,
    localAddress: resolvedOptions.localAddress,
    _ipBound: !!resolvedOptions.uri || !!resolvedOptions.localAddress,
    _boundIP: resolvedOptions.localAddress,
    _proxyURI: resolvedOptions.uri,
  };
};

export const defaultAgent = createAgent();
