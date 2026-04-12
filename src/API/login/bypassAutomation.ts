import log from "@log";

function humanPauseMs(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
import type { Cookie as ToughCookie } from "tough-cookie";
import type { DefaultFuncsHttpResponse, FBResponse, FbNetworkResponse } from "../../types/request.js";
import { setCheckpointCooldown } from "../request/checkpointCooldown.js";
import { saveCookies } from "../request/clients.js";
import type { Context, GlobalOptions } from "../request/formatters/helpers.js";
import { get, post } from "../request/index.js";
import { getFrom } from "../utils/htmlParser.js";

export async function bypassAutomation(
  resp: DefaultFuncsHttpResponse | null | undefined,
  jar: Context["jar"],
  options: GlobalOptions
): Promise<DefaultFuncsHttpResponse> {
  const s = (x: unknown): string => (typeof x === "string" ? x : String(x ?? ""));

  type Resp = FBResponse<string> | FbNetworkResponse;

  const u = (r: Resp): string => {
    const reqUrl = (r as { request?: { res?: { responseUrl?: string } } }).request?.res?.responseUrl;
    if (reqUrl) return reqUrl;
    const cfg = (r as { config?: { baseURL?: string; url?: string }; url?: string }).config;
    if (cfg?.baseURL) {
      return new URL(cfg.url || "/", cfg.baseURL).toString();
    }
    const topUrl = (r as { url?: string }).url;
    return (typeof cfg?.url === "string" ? cfg.url : "") || (typeof topUrl === "string" ? topUrl : "");
  };

  const isCp = (r: Resp): boolean =>
    typeof u(r) === "string" && u(r).includes("checkpoint/601051028565049");

  const cookieUID = async (): Promise<string | undefined> => {
    try {
      const cookies: ToughCookie[] =
        typeof jar?.getCookies === "function"
          ? (await jar.getCookies("https://www.facebook.com")) as ToughCookie[]
          : [];
      return (
        cookies.find((c) => c.key === "i_user")?.value ||
        cookies.find((c) => c.key === "c_user")?.value
      );
    } catch {
      return undefined;
    }
  };

  const htmlUID = (body: string | FBResponse<string>): string | undefined => {
    const bodyStr = s(body);
    return bodyStr.match(/"USER_ID"\s*:\s*"(\d+)"/)?.[1] ||
      bodyStr.match(/\["CurrentUserInitialData",\[\],\{.*?"USER_ID":"(\d+)".*?\},\d+\]/)?.[1];
  };

  const getUID = async (body: string | FBResponse<string>): Promise<string | undefined> =>
    (await cookieUID()) || htmlUID(body);

  const refreshJar = async (): Promise<DefaultFuncsHttpResponse> =>
    get("https://www.facebook.com/", jar, undefined, options, undefined, undefined).then(
      saveCookies(jar)
    );

  const bypass = async (body: string | FBResponse<string>): Promise<void> => {
    const b = s(body);
    const UID = await getUID(b);
    const fb_dtsg =
      getFrom(b, '"DTSGInitData",[],{"token":"', '",') ||
      b.match(/name="fb_dtsg"\s+value="([^"]+)"/)?.[1];
    const jazoest =
      getFrom(b, 'name="jazoest" value="', '"') ||
      getFrom(b, "jazoest=", '",') ||
      b.match(/name="jazoest"\s+value="([^"]+)"/)?.[1];
    const lsd =
      getFrom(b, '["LSD",[],{"token":"', '"}') ||
      b.match(/name="lsd"\s+value="([^"]+)"/)?.[1];
    const form = {
      av: UID,
      __user: UID,
      __a: 1,
      fb_dtsg,
      jazoest,
      lsd,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "FBScrapingWarningMutation",
      server_timestamps: true,
      variables: "{}",
      doc_id: "24406519995698862",
    };

    await sleep(humanPauseMs(450, 2200));
    await post(
      "https://www.facebook.com/api/graphql/",
      jar,
      form,
      options,
      undefined,
      undefined
    ).then(saveCookies(jar));

    log.warn("Đang xử lý cảnh báo automation của Facebook...");
  };

  try {
    if (resp) {
      if (isCp(resp)) {
        log.warn("Phát hiện checkpoint - Tài khoản đang bị kiểm tra");
        setCheckpointCooldown(options, {
          ms: 5 * 60_000,
          reason: "checkpoint scraping warning",
        });
        await bypass(s(resp.data));

        const refreshed = await refreshJar();

        if (isCp(refreshed)) {
          log.warn("Checkpoint vẫn còn sau khi refresh - Tài khoản vẫn đang bị kiểm tra");
        } else {
          log.success("Bypass thành công, cookies đã được làm mới - Tài khoản bình thường");
        }

        return refreshed;
      }

      log.info("Tài khoản bình thường - Không có checkpoint");
      return resp;
    }

    const res = await get(
      "https://www.facebook.com/",
      jar,
      undefined,
      options,
      undefined,
      undefined
    ).then(saveCookies(jar));

    if (isCp(res)) {
      log.warn("Phát hiện checkpoint - Tài khoản đang bị kiểm tra");
      setCheckpointCooldown(options, {
        ms: 8 * 60_000,
        reason: "checkpoint scraping warning",
      });
      await bypass(s(res.data));

      await sleep(humanPauseMs(700, 2800));
      const refreshed = await refreshJar();

      if (!isCp(refreshed)) {
        log.success("✅ Bypass thành công, cookies đã được làm mới - Tài khoản bình thường");
      } else {
        log.warn("❌ Checkpoint vẫn còn sau khi refresh - Tài khoản vẫn đang bị kiểm tra");
      }

      return refreshed;
    }

    log.info("✓ Tài khoản bình thường - Không có checkpoint");
    return res;
  } catch (e: Error | unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    log.error(`❌ Lỗi khi bypass automation: ${errorMessage}`);
    if (resp) {
      return resp;
    }
    return await get("https://www.facebook.com/", jar, undefined, options, undefined, undefined).then(saveCookies(jar));
  }
}
