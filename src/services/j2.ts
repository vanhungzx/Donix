import axios, { AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

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

interface J2IssueResponse {
  accessToken?: string;
  token?: string;
  access_token?: string;
  jwt?: string;
  data?: {
    token?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

type ExtraHeaders = Record<string, string>;

const buildHeaders = (extra: ExtraHeaders = {}): Record<string, string> => ({
  accept: "application/json, text/plain, */*",
  "accept-language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
  "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  origin: BASE_URL,
  referer: `${BASE_URL}/vi/douyin`,
  priority: "u=1, i",
  ...extra,
});

function extractPageNonce(html: string): string | null {
  let m = html.match(/<meta[^>]+name=["']page-nonce["'][^>]+content=["']([a-f0-9]+)["']/i);
  if (m) return m[1];

  m = html.match(/window\.__nonce__\s*=\s*["']([a-f0-9]+)["']/i);
  if (m) return m[1];

  m = html.match(/pageNonce\s*[=:]\s*["']([a-f0-9]+)["']/i);
  if (m) return m[1];

  m = html.match(/["\s]nonce[":\s]+["']([a-f0-9]{32})["']/i);
  if (m) return m[1];

  return null;
}

export async function j2download(url: string): Promise<J2DownloadResponse> {
  const jar = new CookieJar();
  const http: AxiosInstance = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      timeout: 30000,
    })
  );

  const pageRes = await http.get<string>(`${BASE_URL}/vi`, {
    headers: {
      ...buildHeaders(),
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "content-type": "",
    },
    responseType: "text",
  });

  const pageNonce = extractPageNonce(pageRes.data);
  if (!pageNonce) {
    throw new Error(
      "Không tìm thấy x-page-nonce trong trang. Cấu trúc trang có thể đã thay đổi."
    );
  }

  const issueRes = await http.post<J2IssueResponse>(
    `${BASE_URL}/api/auth/issue`,
    null,
    {
      headers: {
        ...buildHeaders({
          "content-type": "application/x-www-form-urlencoded",
          "x-page-nonce": pageNonce,
        }),
        "content-length": "0",
      },
    }
  );

  const issueData = issueRes.data;
  const bearerToken =
    issueData.accessToken ||
    issueData.token ||
    issueData.access_token ||
    issueData.data?.token ||
    issueData.jwt;

  if (!bearerToken) {
    throw new Error(
      `Không lấy được Bearer token từ /api/auth/issue. Response: ${JSON.stringify(issueData)}`
    );
  }

  const autoRes = await http.post<J2DownloadResponse>(
    `${BASE_URL}/api/autolink`,
    {
      data: {
        url,
        unlock: true,
      },
    },
    {
      headers: buildHeaders({
        "content-type": "application/json",
        authorization: `Bearer ${bearerToken}`,
      }),
    }
  );

  return autoRes.data;
}

export default j2download;

