import log from "@log";
import type { Cookie as ToughCookie } from "tough-cookie";
import type { FBResponse } from "../../types/request.js";
import { saveCookies } from "../request/clients.js";
import type { Context, GlobalOptions } from "../request/formatters/helpers.js";
import { get, post } from "../request/index.js";
import { getFrom } from "../utils/htmlParser.js";

export async function bypassAutomation(
  resp: FBResponse<string> | null | undefined,
  jar: Context["jar"],
  options: GlobalOptions
): Promise<FBResponse<string>> {
  const s = (x: string | number | boolean | object | null | undefined): string =>
    typeof x === "string" ? x : String(x ?? "");

  const u = (r: FBResponse<string>): string =>
    (r as FBResponse<string> & { request?: { res?: { responseUrl?: string } } })?.request?.res?.responseUrl ||
    ((r as FBResponse<string> & { config?: { baseURL?: string; url?: string } })?.config?.baseURL
      ? new URL((r.config?.url || "/"), r.config.baseURL).toString()
      : (r.config?.url || ""));

  const isCp = (r: FBResponse<string>): boolean =>
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

  const refreshJar = async (): Promise<FBResponse<string>> =>
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
      await bypass(s(res.data));

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
