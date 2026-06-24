import type { BrowserFingerprint } from "../../types/request.js";
import { getRandom } from "./constants.js";

type BrowserKey = keyof typeof BROWSER_DATA;

const BROWSER_DATA = {
  windows: {
    platform: "Windows NT 10.0; Win64; x64",
    chromeVersions: ["131.0.6778.85", "131.0.6778.86", "130.0.6723.91", "130.0.6723.92", "129.0.6668.89", "129.0.6668.90", "128.0.6613.120", "128.0.6613.121"],
    platformVersion: '"15.0.0"',
  },
  mac: {
    platform: "Macintosh; Intel Mac OS X 10_15_7",
    chromeVersions: ["131.0.6778.85", "131.0.6778.86", "130.0.6723.91", "130.0.6723.92", "129.0.6668.89", "129.0.6668.90", "128.0.6613.120", "128.0.6613.121"],
    platformVersion: '"15.7.9"',
  },
} as const;

const defaultUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.85 Safari/537.36";

function inferPlatformFromUa(ua: string): { secChUaPlatform: string; secChUaPlatformVersion: string } {
  if (/Windows NT 10\.0/i.test(ua)) {
    return { secChUaPlatform: '"Windows"', secChUaPlatformVersion: '"15.0.0"' };
  }
  if (/Windows NT/i.test(ua)) {
    return { secChUaPlatform: '"Windows"', secChUaPlatformVersion: '"10.0.0"' };
  }
  if (/Mac OS X/i.test(ua)) {
    const m = ua.match(/Mac OS X (\d+)[._](\d+)(?:[._](\d+))?/i);
    const pv = m ? `${m[1]}.${m[2]}.${m[3] || "0"}` : "15.7.9";
    return { secChUaPlatform: '"macOS"', secChUaPlatformVersion: `"${pv}"` };
  }
  if (/Android/i.test(ua)) {
    return { secChUaPlatform: '"Android"', secChUaPlatformVersion: '"14.0.0"' };
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return { secChUaPlatform: '"iOS"', secChUaPlatformVersion: '"18.0.0"' };
  }
  return { secChUaPlatform: '"Windows"', secChUaPlatformVersion: '"15.0.0"' };
}

/** Giữ User-Agent và sec-ch-ua khớp nhau theo từng phiên — tránh đổi fingerprint mỗi request (dễ bị nghi ngờ). */
function buildSecChUaFromUserAgent(ua: string): BrowserFingerprint {
  const userAgent = ua?.trim?.() ? ua.trim() : defaultUserAgent;
  const chromeMatch = userAgent.match(/Chrome\/([\d.]+)/i);
  const fullVersion = chromeMatch ? chromeMatch[1] : "131.0.6778.85";
  const majorVersion = fullVersion.split(".")[0] || "131";
  const { secChUaPlatform, secChUaPlatformVersion } = inferPlatformFromUa(userAgent);

  const secChUa = [
    `"Not/A)Brand";v="8"`,
    `"Chromium";v="${majorVersion}"`,
    `"Google Chrome";v="${majorVersion}"`,
  ].join(", ");

  const secChUaFullVersionList = [
    `"Not/A)Brand";v="8.0.0.0"`,
    `"Chromium";v="${fullVersion}"`,
    `"Google Chrome";v="${fullVersion}"`,
  ].join(", ");

  return {
    userAgent,
    secChUa,
    secChUaFullVersionList,
    secChUaPlatform,
    secChUaPlatformVersion,
  };
}

const randomUserAgent = () => {
  const os = getRandom(Object.keys(BROWSER_DATA) as BrowserKey[]);
  const data = BROWSER_DATA[os];
  const version = getRandom([...data.chromeVersions]);
  const majorVersion = version.split(".")[0];

  const userAgent = `Mozilla/5.0 (${data.platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;

  const fullVersion = version;

  const brands = [
    `"Not/A)Brand";v="8"`,
    `"Chromium";v="${majorVersion}"`,
    `"Google Chrome";v="${majorVersion}"`,
  ];

  const secChUa = brands.join(", ");
  const secChUaFullVersionList = [
    `"Not/A)Brand";v="8.0.0.0"`,
    `"Chromium";v="${fullVersion}"`,
    `"Google Chrome";v="${fullVersion}"`,
  ].join(", ");

  return {
    userAgent,
    secChUa,
    secChUaFullVersionList,
    secChUaPlatform: os === "windows" ? '"Windows"' : '"macOS"',
    secChUaPlatformVersion: data.platformVersion,
  };
};

const userAgents = {
  defaultUserAgent,
  windowsUserAgent: defaultUserAgent,
  randomUserAgent,
};

export default userAgents;
export type { BrowserFingerprint };
export { buildSecChUaFromUserAgent, defaultUserAgent, randomUserAgent };
