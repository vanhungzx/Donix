import axios, { AxiosInstance } from "axios";
import { CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
export interface DownrOkResponse {
  ok: true;
  [key: string]: any;
}
export interface DownrErrorResponse {
  ok: false;
  error: string;
  data?: any;
}
export type DownrResponse = DownrOkResponse | DownrErrorResponse;
export default async function downr(url: string): Promise<DownrResponse> {
  const jar = new CookieJar();
  const client: AxiosInstance = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      },
    })
  );
  const headers = {
    Accept: "*/*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
    "Cache-Control": "no-cache",
    "Content-Type": "application/json",
    Origin: "https://downr.org",
    Pragma: "no-cache",
    Referer: "https://downr.org/",
    "Sec-CH-UA":
      '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };
  const { data } = await client.post(
    "https://downr.org/.netlify/functions/download",
    { url },
    { headers }
  );
  if (!data || data.error) {
    const resp: DownrErrorResponse = {
      ok: false,
      error: data?.message || "invalid_response",
      data,
    };
    console.log(JSON.stringify(resp, null, 2));
    return resp;
  }
  const resp: DownrOkResponse = {
    ok: true,
    ...data,
  };
  return resp;
}
