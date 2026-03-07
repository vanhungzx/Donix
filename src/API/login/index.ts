"use strict";
import log from "@log";
import * as path from "path";
import { fileURLToPath } from "url";
import autoReloginWithFacebookWeb from "../../core/auth_login/auto_relogin.js";
import { getConfig } from "../../core/configManager.js";
import type { DonixGlobalState } from "../../types/global.js";
import type { FBResponse } from "../../types/request.js";
import type { Context, GlobalOptions } from "../request/formatters/helpers.js";
import utils, { get, makeDefaults } from "../request/index.js";
import type { LoginCallback, LoginOptions } from "../types/login.js";
import { bypassAutomation } from "./bypassAutomation.js";
import { attachClientMethods } from "./clientInitializer.js";
import { buildClient, buildContext, extractUserID } from "./contextBuilder.js";
import { extractCookieString, parseAndSetCookies } from "./cookieHandler.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_OPTIONS: LoginOptions = {
  selfListen: true,
  autoMarkDelivery: false,
  autoMarkRead: false,
  autoReconnect: true,
  online: false,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
};
export default function login(
  cookieStr: string,
  options: LoginOptions | LoginCallback = {},
  callback?: LoginCallback,
  isRetry: boolean = false
): void {
  if (typeof options === "function") {
    [callback, options] = [options, {}];
  }
  log.info("Đang đăng nhập...");
  const opts: LoginOptions = Object.assign({}, DEFAULT_OPTIONS, options);
  const jar = utils.getJar() as Context["jar"];
  const cookieString = extractCookieString(cookieStr);
  if (!cookieString) {
    const errorMsg = cookieStr === undefined || cookieStr === null ? "Thiếu cookieStr, vui lòng cung cấp cookie string hợp lệ trong config.json!" : typeof cookieStr === "string" && cookieStr.trim().length === 0 ? "Cookie string trong config.json đang trống, vui lòng cung cấp cookie string hợp lệ!" : "Cookie string không hợp lệ, vui lòng kiểm tra lại config.json!";
    log.error(errorMsg);
    return (callback as LoginCallback)(errorMsg);
  }
  try {
    parseAndSetCookies(jar, cookieString);
    get("https://www.facebook.com/", jar, undefined, opts)
      .then(utils.saveCookies(jar))
      .then(async (res: FBResponse<string>) => {
        const bypassedRes = await bypassAutomation(res, jar, opts as GlobalOptions);
        const html = bypassedRes.data || res.data;
        const userID = extractUserID(jar);
        if (!userID) {
          if (!isRetry) {
            log.warn("Không tìm thấy cookie người dùng, đang thử auto login...");
            try {
              const autoLoginSuccess = await autoReloginWithFacebookWeb();
              if (autoLoginSuccess) {
                const newConfig = getConfig();
                const newCookie = newConfig.cookie;
                if (newCookie && typeof newCookie === "string" && newCookie.trim().length > 0) {
                  log.success("Auto login thành công! Đang đăng nhập lại với cookie mới...");
                  return login(newCookie, opts, callback, true);
                } else {
                  return (callback as LoginCallback)("Auto login thành công nhưng không lấy được cookie mới!");
                }
              } else {
                return (callback as LoginCallback)("Không tìm thấy cookie người dùng và auto login thất bại! Vui lòng kiểm tra lại cookieStr hoặc cấu hình đăng nhập.");
              }
            } catch (autoLoginError: Error | unknown) {
              const errorMessage = autoLoginError instanceof Error ? autoLoginError.message : String(autoLoginError);
              log.error(`Lỗi khi thực hiện auto login: ${errorMessage}`);
              return (callback as LoginCallback)("Không tìm thấy cookie người dùng! Vui lòng kiểm tra lại cookieStr.");
            }
          } else {
            return (callback as LoginCallback)("Không tìm thấy cookie người dùng sau auto login! Vui lòng kiểm tra lại cookieStr.");
          }
        }
        const userDataMatch = html.match(/\["CurrentUserInitialData",\[\],({.*?}),\d+\]/);
        if (userDataMatch) {
          try {
            const info = JSON.parse(userDataMatch[1]);
            log.system(`Đăng nhập tài khoản: ${info.NAME} (${info.USER_ID})`);
          } catch {
            log.system(`ID người dùng: ${userID}`);
          }
        } else {
          log.system(`ID người dùng: ${userID}`);
        }
        const ctx = buildContext(html, userID, jar, opts as GlobalOptions);
        const def = makeDefaults(html, userID, ctx);
        const client = buildClient(userID, jar, opts, def, ctx, utils);
        await attachClientMethods(client as unknown as Parameters<typeof attachClientMethods>[0], def, ctx, path.join(__dirname, "../detail"));
        const globalDonix = global as typeof globalThis & { Donix?: DonixGlobalState };
        if (!globalDonix.Donix) {
          globalDonix.Donix = {};
        }
        globalDonix.Donix.api = client as unknown as DonixGlobalState["api"];
        (callback as LoginCallback)(null, client);
      }).catch((callback as LoginCallback));
  } catch (e: Error | unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    log.error(`CookieStr không hợp lệ: ${errorMessage}`);
    return (callback as LoginCallback)(`CookieStr không hợp lệ: ${errorMessage}`);
  }
}
