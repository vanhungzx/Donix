"use strict";

import logger from "@log";
import type { DefaultFuncs, FacebookContext } from '@types';
import axios from "axios";
import FormData from "form-data";
import { URL } from "url";

interface GetUIDFastResponse {
  error?: string;
  id?: string;
}

interface GetUIDSlowResponse {
  status?: number;
  error?: string;
  data?: {
    id?: string;
  };
}

type GetUIDCallback = (error: Error | null, uid?: string) => void;

const USER_AGENT_ARRAY: readonly string[] = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
  "Mozilla/5.0 (Linux; Android 10; SM-G977N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:54.0) Gecko/20100101 Firefox/54.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.12; rv:45.0) Gecko/20100101 Firefox/45.0",
  "Mozilla/5.0 (Linux; U; Android 4.4.2; en-us; GT-I9505 Build/KOT49H) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 14_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.2 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:66.0) Gecko/20100101 Firefox/66.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/601.7.7 (KHTML, like Gecko) Version/9.1.2 Safari/601.7.7",
  "Mozilla/5.0 (Linux; Android 8.0.0; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.84 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 6.3; WOW64; Trident/7.0; rv:11.0) like Gecko",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) AppleWebKit/603.3.8 (KHTML, like Gecko) Version/10.1.2 Safari/603.3.8",
  "Mozilla/5.0 (Linux; Android 7.0; SM-G930F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.125 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 12_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.3",
] as const;

export default function (
  _defaultFuncs: DefaultFuncs,
  _api: any,
  _ctx: FacebookContext
): (link: string, callback?: GetUIDCallback) => Promise<string> {
  return function getUID(
    link: string,
    callback?: GetUIDCallback
  ): Promise<string> {
    return new Promise<string>((resolve, reject): void => {
      if (!callback) {
        callback = (err: Error | null, uid?: string): void => {
          if (err) return reject(err);
          resolve(uid || "");
        };
      }

      async function getUIDFast(url: string): Promise<string> {
        const Form = new FormData();
        const Url = new URL(url);
        Form.append("link", Url.href);

        try {
          const { data } = await axios.post<GetUIDFastResponse>(
            "https://id.traodoisub.com/api.php",
            Form,
            {
              headers: Form.getHeaders(),
            }
          );

          if (data.error) throw new Error(data.error);
          return data.id || "Not found";
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          logger.error(`Error: ${error.message}`);
          throw error;
        }
      }

      async function getUIDSlow(url: string): Promise<string> {
        const Form = new FormData();
        const Url = new URL(url);
        Form.append("username", Url.pathname.replace(/^\//, ""));

        try {
          const randomUserAgent =
            USER_AGENT_ARRAY[
            Math.floor(Math.random() * USER_AGENT_ARRAY.length)
            ];

          const { data } = await axios.post<GetUIDSlowResponse>(
            "https://api.findids.net/api/get-uid-from-username",
            Form,
            {
              headers: {
                "User-Agent": randomUserAgent,
                ...Form.getHeaders(),
              },
            }
          );

          if (data.status !== 200) throw new Error("Error occurred!");
          if (typeof data.error === "string") throw new Error(data.error);
          return data.data?.id || "Not found";
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          logger.error(`Error: ${error.message}`);
          throw error;
        }
      }

      async function getUIDFromUrl(url: string): Promise<string> {
        try {
          let uid = await getUIDFast(url);
          if (!isNaN(Number(uid))) return uid;

          uid = await getUIDSlow(url);
          if (!isNaN(Number(uid))) return uid;

          throw new Error("Unable to retrieve UID");
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          logger.error(`Error: ${error.message}`);
          throw error;
        }
      }

      try {
        const Link = String(link);

        if (
          Link.includes("facebook.com") ||
          Link.includes("Facebook.com") ||
          Link.includes("fb")
        ) {
          const LinkSplit = Link.split("/");

          if (LinkSplit[0] === "https:" || LinkSplit[0] === "http:") {
            const idMatch = Link.split("=")[1];
            if (
              !isNaN(Number(LinkSplit[3])) &&
              !idMatch &&
              !isNaN(Number(idMatch))
            ) {
              throw new Error(
                "Invalid link format. The correct format should be: facebook.com/username"
              );
            } else if (idMatch && !isNaN(Number(idMatch))) {
              const Format = `https://www.facebook.com/profile.php?id=${idMatch}`;
              getUIDFromUrl(Format)
                .then((data) => callback?.(null, data))
                .catch((err) => callback?.(err));
            } else {
              getUIDFromUrl(Link)
                .then((data) => callback?.(null, data))
                .catch((err) => callback?.(err));
            }
          } else {
            const Form = `https://www.facebook.com/${LinkSplit[1]}`;
            getUIDFromUrl(Form)
              .then((data) => callback?.(null, data))
              .catch((err) => callback?.(err));
          }
        } else {
          throw new Error(
            "Invalid link. The link should be a Facebook link."
          );
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        logger.error(`Error: ${error.message}`);
        callback(error);
        reject(error);
      }
    });
  };
}
