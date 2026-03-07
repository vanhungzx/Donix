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

const randomUserAgent = () => {
  const os = getRandom(Object.keys(BROWSER_DATA) as BrowserKey[]);
  const data = BROWSER_DATA[os];
  const version = getRandom(data.chromeVersions as any);
  const majorVersion = (version as string).split(".")[0];

  const userAgent = `Mozilla/5.0 (${data.platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;

  // Extract full version for sec-ch-ua-full-version-list
  const fullVersion = version;
  const patchVersion = fullVersion.split('.').slice(0, 3).join('.');

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
export { defaultUserAgent, randomUserAgent };
