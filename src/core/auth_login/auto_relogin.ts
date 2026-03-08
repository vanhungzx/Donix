import { CookieJar } from "tough-cookie";
import log from "../../utils/log";
import { getConfig, updateConfigKey } from "../configManager";
import { login as loginMessengerApp } from "./messenger_app";

export interface AutoReloginContext {
  jar?: CookieJar & {
    removeAllCookies?: () => void;
    setCookieSync(cookie: string, url: string): void;
  };
  userID?: string;
  i_userID?: string;
}

/** Cấu hình token trong config (EAAD, EAAAAU, ...) */
type TokenConfig = Record<string, string>;

/** Config có các key dùng cho auto login */
interface ConfigWithFb {
  cookie?: string;
  token?: TokenConfig | Record<string, unknown>;
  fbAccounts?: FbAccountConfig[];
  fbEmail?: string;
  fbPassword?: string;
  fbSecret2FA?: string | null;
  autoLoginMethod?: string;
}

interface FbAccountConfig {
  email: string;
  password: string;
  secret2FA?: string | null;
  twofactor?: string | null;
  cookie?: string;
  disabled?: boolean;
}

function extractUserIdFromCookie(cookie: string): string | null {
  const parts = cookie.split(";").map((p) => p.trim());
  const cUser = parts.find((p) => p.startsWith("c_user="));
  if (!cUser) return null;
  return cUser.split("=")[1] || null;
}

async function updateConfigAfterLogin(
  newCookie: string,
  accessToken?: string | null
): Promise<void> {
  try {
    await updateConfigKey("cookie", newCookie);
    if (accessToken && accessToken.trim()) {
      const cfg = getConfig() as ConfigWithFb;
      const existingToken: TokenConfig = (cfg.token && typeof cfg.token === "object" && !Array.isArray(cfg.token))
        ? { ...(cfg.token as TokenConfig) }
        : {};
      existingToken.EAAD = accessToken.trim();
      await updateConfigKey("token", existingToken);
      log.success("AUTO-LOGIN: Đã ghi cookie và access_token vào config.json");
    } else {
      log.success("AUTO-LOGIN: Đã ghi cookie vào config.json");
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`AUTO-LOGIN: Lỗi khi cập nhật cookie/token vào config: ${msg}`);
  }
}

function updateCtxAfterLogin(ctx: AutoReloginContext | null | undefined, newCookie: string): void {
  const targetCtx: AutoReloginContext = ctx ? { ...ctx } : {};
  const jar = targetCtx.jar;

  if (jar) {
    try {
      if (typeof jar.removeAllCookies === "function") {
        jar.removeAllCookies();
      }
    } catch {

    }

    const parts = newCookie.split("; ");
    for (const p of parts) {
      if (!p || !p.includes("=")) continue;
      const baseCookie = p.trim();
      try {
        jar.setCookieSync(`${baseCookie}; Domain=.facebook.com; Path=/`, "https://www.facebook.com/");
        jar.setCookieSync(`${baseCookie}; Domain=.messenger.com; Path=/`, "https://www.messenger.com/");
      } catch {
      }
    }

    log.success("AUTO-LOGIN: Đã cập nhật cookie mới vào jar hiện tại.");
  }

  const uid = extractUserIdFromCookie(newCookie);
  if (uid) {
    targetCtx.userID = uid;
    targetCtx.i_userID = uid;
  }
}

function updateGlobalAccount(newCookie: string): void {
  try {
    const cfg = getConfig() as ConfigWithFb;
    const g = global as typeof globalThis & {
      account?: { cookie?: string; token?: TokenConfig | null };
    };
    g.account = {
      cookie: cfg.cookie ?? newCookie,
      token: cfg.token && typeof cfg.token === "object" && !Array.isArray(cfg.token)
        ? { ...(cfg.token as TokenConfig) }
        : null,
    };
  } catch {
  }
}


export async function autoReloginWithMessengerApp(ctx?: AutoReloginContext | null): Promise<boolean> {
  try {
    const cfg = getConfig() as ConfigWithFb;
    const accounts = Array.isArray(cfg.fbAccounts) ? cfg.fbAccounts : null;

    const tryLoginWithAccount = async (
      email: string,
      password: string,
      secret2FA: string | null,
      accountIndex: number | null
    ): Promise<boolean> => {
      log.warn(
        `AUTO-LOGIN: Đang thử đăng nhập lại bằng messenger_app` +
        (accountIndex !== null ? ` (account index ${accountIndex})...` : "...")
      );

      // messenger_app hiện tại yêu cầu tham số twoFaSecret; truyền "" nếu không có
      const result = await loginMessengerApp(email, password, secret2FA || "");

      if (!result || !result.success) {
        const prefix =
          `AUTO-LOGIN: Đăng nhập lại bằng messenger_app thất bại` +
          (accountIndex !== null ? ` (index ${accountIndex})` : "");
        log.error(`${prefix}: ${result?.message ?? "failed"}`);
        return false;
      }

      const newCookie = result.cookies;
      if (!newCookie || typeof newCookie !== "string" || !newCookie.includes("c_user=")) {
        log.error("AUTO-LOGIN: Cookie trả về từ messenger_app không hợp lệ hoặc thiếu c_user, không thể cập nhật.");
        return false;
      }

      await updateConfigAfterLogin(newCookie, result.access_token);
      updateCtxAfterLogin(ctx, newCookie);
      updateGlobalAccount(newCookie);

      log.success("AUTO-LOGIN: Đăng nhập lại bằng messenger_app thành công.");
      return true;
    };

    if (accounts && accounts.length > 0) {
      for (let idx = 0; idx < accounts.length; idx++) {
        const acc = accounts[idx];
        if (!acc) continue;

        if (acc.disabled === true) {
          log.warn(`AUTO-LOGIN: Bỏ qua tài khoản index ${idx} (đã bị disable).`);
          continue;
        }

        const email = acc.email;
        const password = acc.password;
        const secret2FA =
          ((acc.secret2FA as string | null) ?? (acc.twofactor as string | null)) || null;

        if (!email || !password) continue;

        const ok = await tryLoginWithAccount(email, password, secret2FA, idx);
        if (ok) return true;
      }

      log.error("AUTO-LOGIN: Tất cả tài khoản trong fbAccounts đều đăng nhập thất bại (messenger_app).");
      return false;
    }

    // Fallback config cũ (nếu ai dùng fbEmail/fbPassword)
    const emailCfg = cfg.fbEmail;
    const passwordCfg = cfg.fbPassword;
    const secretCfg = (cfg.fbSecret2FA as string | null) ?? null;
    if (emailCfg && passwordCfg) {
      return await tryLoginWithAccount(emailCfg, passwordCfg, secretCfg, null);
    }

    log.error("AUTO-LOGIN: Không tìm thấy thông tin đăng nhập (fbAccounts hoặc fbEmail/fbPassword).");
    return false;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`AUTO-LOGIN: Lỗi khi auto login bằng messenger_app: ${msg}`);
    return false;
  }
}

/**
 * Default auto relogin: dùng messenger_app.
 */
export default async function autoRelogin(ctx?: AutoReloginContext | null): Promise<boolean> {
  return await autoReloginWithMessengerApp(ctx);
}
