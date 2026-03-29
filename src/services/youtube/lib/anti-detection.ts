import type { HeadersMap } from "./types.js";

const USER_AGENTS = {
  CHROME_WIN: [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  ],
  CHROME_MAC: [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  ],
  CHROME_LINUX: [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  ],
  FIREFOX_WIN: [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  ],
  SAFARI_MAC: [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  ],
  CHROME_ANDROID: [
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  ],
  SAFARI_IOS: [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  ],
  YOUTUBE_ANDROID: [
    "com.google.android.youtube/19.30.36 (Linux; U; Android 14) gzip",
    "com.google.android.youtube/19.29.35 (Linux; U; Android 13) gzip",
    "com.google.android.youtube/19.28.34 (Linux; U; Android 12) gzip",
  ],
  YOUTUBE_IOS: [
    "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)",
    "com.google.ios.youtube/19.44.3 (iPhone15,2; U; CPU iOS 18_0_0 like Mac OS X;)",
  ],
} as const;

const ALL_USER_AGENTS = Object.values(USER_AGENTS).flat();
const ACCEPT_LANGUAGES = [
  "en-US,en;q=0.9",
  "en-US,en;q=0.9,vi;q=0.8",
  "en-GB,en;q=0.9",
  "en-US,en;q=0.9,es;q=0.8",
  "en-US,en;q=0.9,fr;q=0.8",
  "en-US,en;q=0.9,de;q=0.8",
  "en-US,en;q=0.9,ja;q=0.8",
  "en-US,en;q=0.9,zh;q=0.8",
] as const;
const REFERERS = [
  "https://www.youtube.com/",
  "https://www.youtube.com/watch?v=",
  "https://www.youtube.com/results?search_query=",
  "https://www.youtube.com/feed/trending",
  "https://www.youtube.com/channel/",
  "https://www.google.com/",
  "https://www.google.com/search?q=",
] as const;

const DEFAULT_CONFIG = {
  rotateUserAgent: true,
  userAgentType: "random",
  randomizeHeaders: true,
  randomizeAcceptLanguage: true,
  randomizeReferer: true,
  minDelay: 100,
  maxDelay: 2000,
  randomizeDelay: true,
  maxRequestsPerMinute: 30,
  maxRequestsPerHour: 1000,
  rotateCookies: false,
  cookiePool: [],
  randomizeViewport: true,
  randomizeScreenResolution: true,
} as const;

export interface AntiDetectionConfig {
  maxDelay?: number;
  maxRequestsPerHour?: number;
  maxRequestsPerMinute?: number;
  minDelay?: number;
  randomizeAcceptLanguage?: boolean;
  randomizeDelay?: boolean;
  randomizeHeaders?: boolean;
  randomizeReferer?: boolean;
  randomizeScreenResolution?: boolean;
  randomizeViewport?: boolean;
  rotateCookies?: boolean;
  rotateUserAgent?: boolean;
  userAgentType?: string;
}

interface HeaderGenerationOptions {
  customHeaders?: HeadersMap;
  includeReferer?: boolean;
  userAgent?: string;
  videoId?: string | null;
}

interface RateLimitCheck {
  allowed: boolean;
  waitTime: number;
}

interface RateLimiterState {
  perHour: number[];
  perMinute: number[];
}

export interface AntiDetectionStats {
  currentUserAgent: string | null;
  rateLimitStatus: RateLimitCheck;
  requestsLastMinute: number;
  totalRequests: number;
}

class AntiDetectionManager {
  config: Required<AntiDetectionConfig>;
  currentHeaders: HeadersMap;
  currentUserAgent: string | null;
  rateLimiter: RateLimiterState;
  requestHistory: number[];

  constructor(config: AntiDetectionConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.requestHistory = [];
    this.rateLimiter = { perMinute: [], perHour: [] };
    this.currentUserAgent = null;
    this.currentHeaders = {};
  }

  getRandomUserAgent(type = "random"): string {
    if (type === "random") {
      return ALL_USER_AGENTS[Math.floor(Math.random() * ALL_USER_AGENTS.length)];
    }

    const typeMap: Record<string, readonly string[]> = {
      chrome: [...USER_AGENTS.CHROME_WIN, ...USER_AGENTS.CHROME_MAC, ...USER_AGENTS.CHROME_LINUX],
      firefox: USER_AGENTS.FIREFOX_WIN,
      safari: [...USER_AGENTS.SAFARI_MAC, ...USER_AGENTS.SAFARI_IOS],
      "youtube-android": USER_AGENTS.YOUTUBE_ANDROID,
      "youtube-ios": USER_AGENTS.YOUTUBE_IOS,
      "chrome-win": USER_AGENTS.CHROME_WIN,
      "chrome-mac": USER_AGENTS.CHROME_MAC,
      "chrome-linux": USER_AGENTS.CHROME_LINUX,
      "chrome-android": USER_AGENTS.CHROME_ANDROID,
      "safari-ios": USER_AGENTS.SAFARI_IOS,
    };

    const pool = typeMap[type] || ALL_USER_AGENTS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  getRandomAcceptLanguage(): string {
    return ACCEPT_LANGUAGES[Math.floor(Math.random() * ACCEPT_LANGUAGES.length)];
  }

  getRandomReferer(videoId: string | null = null): string {
    if (videoId) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
    return REFERERS[Math.floor(Math.random() * REFERERS.length)];
  }

  getRandomDelay(): number {
    if (!this.config.randomizeDelay) {
      return this.config.minDelay;
    }
    return Math.floor(Math.random() * (this.config.maxDelay - this.config.minDelay + 1)) + this.config.minDelay;
  }

  checkRateLimit(): RateLimitCheck {
    const now = Date.now();
    this.rateLimiter.perMinute = this.rateLimiter.perMinute.filter(time => now - time < 60000);
    this.rateLimiter.perHour = this.rateLimiter.perHour.filter(time => now - time < 3600000);

    if (this.rateLimiter.perMinute.length >= this.config.maxRequestsPerMinute) {
      const oldest = Math.min(...this.rateLimiter.perMinute);
      return { allowed: false, waitTime: 60000 - (now - oldest) + 1000 };
    }

    if (this.rateLimiter.perHour.length >= this.config.maxRequestsPerHour) {
      const oldest = Math.min(...this.rateLimiter.perHour);
      return { allowed: false, waitTime: 3600000 - (now - oldest) + 60000 };
    }

    return { allowed: true, waitTime: 0 };
  }

  recordRequest(): void {
    const now = Date.now();
    this.rateLimiter.perMinute.push(now);
    this.rateLimiter.perHour.push(now);
    this.requestHistory.push(now);
    if (this.requestHistory.length > 1000) {
      this.requestHistory = this.requestHistory.slice(-1000);
    }
  }

  generateHeaders(options: HeaderGenerationOptions = {}): HeadersMap {
    const { videoId = null, userAgent = null, customHeaders = {}, includeReferer = true } = options;
    const headers = { ...customHeaders };

    if (this.config.rotateUserAgent) {
      headers["User-Agent"] = userAgent || this.getRandomUserAgent(this.config.userAgentType);
      this.currentUserAgent = headers["User-Agent"];
    } else if (userAgent) {
      headers["User-Agent"] = userAgent;
    }

    if (this.config.randomizeAcceptLanguage && !headers["Accept-Language"]) {
      headers["Accept-Language"] = this.getRandomAcceptLanguage();
    }
    if (this.config.randomizeReferer && includeReferer && !headers["Referer"]) {
      headers["Referer"] = this.getRandomReferer(videoId);
    }
    if (!headers["Accept"]) headers["Accept"] = "*/*";
    if (!headers["Accept-Encoding"]) headers["Accept-Encoding"] = "identity";
    if (!headers["Connection"]) headers["Connection"] = "keep-alive";
    if (!headers["Sec-Fetch-Dest"]) headers["Sec-Fetch-Dest"] = "empty";
    if (!headers["Sec-Fetch-Mode"]) headers["Sec-Fetch-Mode"] = "cors";
    if (!headers["Sec-Fetch-Site"]) headers["Sec-Fetch-Site"] = "same-origin";
    if (Math.random() > 0.5) headers.DNT = "1";

    if (this.config.randomizeViewport) {
      const viewport = ["1920x1080", "1366x768", "1536x864", "1440x900", "1280x720"][
        Math.floor(Math.random() * 5)
      ];
      headers["Viewport-Width"] = viewport.split("x")[0] || "1280";
    }

    this.currentHeaders = headers;
    return headers;
  }

  async waitForRateLimit(): Promise<void> {
    const rateLimit = this.checkRateLimit();
    if (!rateLimit.allowed) {
      await new Promise(resolve => setTimeout(resolve, rateLimit.waitTime));
    }
  }

  async applyDelay(): Promise<void> {
    const delay = this.getRandomDelay();
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  async wrapRequest<T>(
    requestFn: (headers: HeadersMap) => Promise<T>,
    options: HeaderGenerationOptions = {}
  ): Promise<T> {
    await this.waitForRateLimit();
    await this.applyDelay();
    this.recordRequest();
    return requestFn(this.generateHeaders(options));
  }

  resetRateLimiter(): void {
    this.rateLimiter = { perMinute: [], perHour: [] };
  }

  getStats(): AntiDetectionStats {
    const now = Date.now();
    const requestsLastMinute = this.requestHistory.filter(time => now - time < 60000).length;
    return {
      totalRequests: this.requestHistory.length,
      requestsLastMinute,
      rateLimitStatus: this.checkRateLimit(),
      currentUserAgent: this.currentUserAgent,
    };
  }
}

let defaultManager: AntiDetectionManager | null = null;

export function getAntiDetectionManager(config: AntiDetectionConfig = {}): AntiDetectionManager {
  if (!defaultManager) {
    defaultManager = new AntiDetectionManager(config);
  }
  return defaultManager;
}

export function createAntiDetectionManager(config: AntiDetectionConfig = {}): AntiDetectionManager {
  return new AntiDetectionManager(config);
}

export function generateRandomHeaders(options: HeaderGenerationOptions = {}): HeadersMap {
  return getAntiDetectionManager().generateHeaders(options);
}

export function getRandomUserAgent(type = "random"): string {
  return getAntiDetectionManager().getRandomUserAgent(type);
}

export async function wrapRequestWithAntiDetection<T>(
  requestFn: (headers: HeadersMap) => Promise<T>,
  options: HeaderGenerationOptions = {}
): Promise<T> {
  return getAntiDetectionManager().wrapRequest(requestFn, options);
}

export { ACCEPT_LANGUAGES, AntiDetectionManager, DEFAULT_CONFIG, REFERERS, USER_AGENTS };
export default getAntiDetectionManager;
