import axios, { AxiosError } from "axios";
import { TextEncoder } from "node:util";

const BASE_URL = "https://j2download.com";

export interface J2DownloadMedia {
  type: "video" | "image" | "audio" | string;
  url: string;
  extension?: string;
  [key: string]: unknown;
}

export interface J2DownloadResponse {
  author?: string;
  title?: string;
  message?: string;
  medias?: J2DownloadMedia[];
  [key: string]: unknown;
}

interface J2BootstrapResponse {
  powChallenge: string;
  powDifficulty: number;
  nonce: string;
  [key: string]: unknown;
}

interface J2IssueResponse {
  accessToken?: string;
  [key: string]: unknown;
}

type ExtraHeaders = Record<string, string>;

function j2h(t: Uint8Array, u: number): number {
  let a = (2783036115 + u) | 0;
  let h = 2134608921 ^ u;
  let i = (3572102818 + (u << 16)) | 0;

  for (let l = 0; l < u; l++) {
    a = (a ^ t[l]) | 0;
    a = Math.imul(a, 2654435769);
    a = (a << 13) | (a >>> 19);

    h = (h + a) | 0;
    h = Math.imul(h, 1367130551);
    h = (h << 17) | (h >>> 15);

    i = (i ^ (a + h)) | 0;
    i = Math.imul(i, 1818371886);
    i = (i << 11) | (i >>> 21);

    a = (a + i) | 0;
  }

  a ^= a >>> 16;
  a = Math.imul(a, 2246822507);
  a ^= a >>> 13;
  a = Math.imul(a, 3266489909);
  a ^= a >>> 16;

  h ^= h >>> 16;
  h = Math.imul(h, 3432918353);
  h ^= h >>> 13;
  h = Math.imul(h, 461845907);
  h ^= h >>> 16;

  return (a ^ h ^ i) >>> 0;
}

function solvePow(challenge: string, difficulty: number): string | null {
  const shift = 32 - difficulty * 4;
  const encoder = new TextEncoder();

  const prefix = encoder.encode(`${challenge}:`);
  const buf = new Uint8Array(prefix.length + 12);
  buf.set(prefix);

  for (let n = 0; n < 1e8; n++) {
    let v = n;
    let pos = prefix.length;

    if (v === 0) {
      buf[pos++] = 48;
    } else {
      const start = pos;
      while (v > 0) {
        buf[pos++] = 48 + (v % 10);
        v = (v / 10) | 0;
      }
      for (let l = start, r = pos - 1; l < r; l++, r--) {
        [buf[l], buf[r]] = [buf[r], buf[l]];
      }
    }

    if ((j2h(buf, pos) >>> shift) === 0) return String(n);
  }

  return null;
}

export async function j2download(url: string): Promise<J2DownloadResponse> {
  const jar: Record<string, string> = {};

  const updateCookie = (setCookies: string[] = []) => {
    setCookies.forEach((c) => {
      const [pair] = c.split(";");
      const [key, value] = pair.split("=");
      if (key && value) jar[key.trim()] = value.trim();
    });
  };

  const getCookie = () =>
    Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

  const buildHeaders = (extra: ExtraHeaders = {}): Record<string, string> => ({
    authority: "j2download.com",
    accept: "application/json, text/plain, */*",
    "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    origin: BASE_URL,
    referer: `${BASE_URL}/vi`,
    "sec-ch-ua": '"Chromium";v="137", "Not/A)Brand";v="24"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36",
    cookie: getCookie(),
    ...extra,
  });

  const http = axios.create({ timeout: 30000 });

  try {
    let res = await http.get(BASE_URL, { headers: buildHeaders() });
    updateCookie(res.headers["set-cookie"] || []);

    res = await http.post(`${BASE_URL}/api/auth/recover`, "", {
      headers: buildHeaders(),
    });
    updateCookie(res.headers["set-cookie"] || []);

    res = await http.get<J2BootstrapResponse>(`${BASE_URL}/api/auth/bootstrap`, {
      headers: buildHeaders(),
    });
    updateCookie(res.headers["set-cookie"] || []);
    const boot = res.data;

    const pow = solvePow(boot.powChallenge, boot.powDifficulty);
    if (pow === null) {
      throw new Error("Không giải được PoW (j2download).");
    }

    res = await http.post<J2IssueResponse>(`${BASE_URL}/api/auth/issue`, "", {
      headers: buildHeaders({
        "x-page-nonce": boot.nonce,
        "x-pow-solution": pow,
      }),
    });
    updateCookie(res.headers["set-cookie"] || []);

    const token = res.data.accessToken;
    if (!token) {
      throw new Error(
        `Không lấy được accessToken từ /api/auth/issue: ${JSON.stringify(res.data)}`
      );
    }

    const autoRes = await http.post<J2DownloadResponse>(
      `${BASE_URL}/api/autolink`,
      {
        data: { url, unlock: true },
      },
      {
        headers: buildHeaders({
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        }),
      }
    );

    return autoRes.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError;
      throw ax.response?.data ?? ax.message;
    }
    throw err;
  }
}

export default j2download;
