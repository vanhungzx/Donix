import { CookieJar } from "tough-cookie";
import log from "../../utils/log";
import { getConfig, updateConfigKey } from "../configManager";
import loginWeb from "./facebook_web";

export interface AutoReloginContext {
  jar?: CookieJar & {
    removeAllCookies?: () => void;
    setCookieSync(cookie: string, url: string): void;
  };
  userID?: string;
  i_userID?: string;
}

interface FbAccountConfig {
  email: string;
  password: string;
  secret2FA?: string | null;
  twofactor?: string | null;
  cookie?: string;
  disabled?: boolean;
  [key: string]: any;
}

function extractUserIdFromCookie(cookie: string): string | null {
  const parts = cookie.split(";").map((p) => p.trim());
  const cUser = parts.find((p) => p.startsWith("c_user="));
  if (!cUser) return null;
  return cUser.split("=")[1] || null;
}

function findCurrentAccountIndex(cfg: any, currentCookie: string | null | undefined): number | null {
  if (!currentCookie) return null;
  const currentUID = extractUserIdFromCookie(currentCookie);
  if (!currentUID) return null;

  const accounts = Array.isArray(cfg.fbAccounts) ? cfg.fbAccounts : [];
  for (let idx = 0; idx < accounts.length; idx++) {
    const acc = accounts[idx];
    if (!acc) continue;

    // Kiểm tra cookie của account này
    if (acc.cookie) {
      const accUID = extractUserIdFromCookie(acc.cookie);
      if (accUID === currentUID) {
        return idx;
      }
    }

    // Nếu không có cookie, thử extract từ email (nếu có cách nào đó)
    // Hoặc có thể so sánh với cookie hiện tại trong config
    if (cfg.cookie) {
      const configUID = extractUserIdFromCookie(cfg.cookie);
      if (configUID === currentUID) {
        // Tìm account có email trùng với cookie hiện tại (nếu có cách map)
        // Tạm thời return null để thử tất cả accounts
      }
    }
  }

  return null;
}

async function updateConfigAfterLogin(
  newCookie: string
): Promise<void> {
  try {
    await updateConfigKey("cookie", newCookie);
  } catch (e: any) {
    log.error(`AUTO-LOGIN: Lỗi khi cập nhật cookie global vào config: ${e?.message || e}`);
  }
}

function updateCtxAfterLogin(ctx: AutoReloginContext | any, newCookie: string): void {
  const targetCtx: any = ctx || {};
  const jar: CookieJar & {
    removeAllCookies?: () => void;
    setCookieSync(cookie: string, url: string): void;
  } | undefined = targetCtx?.jar;

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
    const cfg = getConfig();
    const globalAny = global as typeof globalThis & { account?: { cookie?: string; token?: any } };
    globalAny.account = {
      cookie: cfg.cookie || newCookie,
      token: cfg.token && typeof cfg.token === "object"
        ? { ...cfg.token }
        : null,
    };
  } catch {

  }
}

function extractCookieFromJar(jar: any): string | null {
  try {
    if (!jar || typeof jar.getCookiesSync !== "function") return null;
    const cookies = jar.getCookiesSync("https://www.facebook.com/");
    if (!Array.isArray(cookies)) return null;
    return cookies.map((c: any) => `${c.key}=${c.value}`).join("; ");
  } catch {
    return null;
  }
}


export async function autoReloginWithFacebookWeb(ctx?: AutoReloginContext | any, skipCurrentAccount: boolean = false): Promise<boolean> {
  try {
    const cfg = getConfig();
    const accounts = Array.isArray((cfg as any).fbAccounts)
      ? ((cfg as any).fbAccounts as FbAccountConfig[])
      : null;

    // Tìm account hiện tại để skip nếu cần
    let currentAccountIndex: number | null = null;
    if (skipCurrentAccount) {
      const currentCookie = cfg.cookie || (ctx?.jar ? extractCookieFromJar(ctx.jar) : null);
      currentAccountIndex = findCurrentAccountIndex(cfg, currentCookie);
      if (currentAccountIndex !== null) {
        log.warn(`AUTO-LOGIN: Phát hiện checkpoint 282, sẽ bỏ qua account hiện tại (index ${currentAccountIndex}) và thử account khác...`);
      }
    }

    const tryLoginWithAccount = async (
      email: string,
      password: string,
      secret2FA: string | null,
      accountIndex: number | null
    ): Promise<boolean> => {
      log.warn(
        `AUTO-LOGIN: Đang thử đăng nhập lại bằng facebook_web` +
        (accountIndex !== null ? ` (account index ${accountIndex})...` : "...")
      );

      const result = await loginWeb({ email, password, secret2FA });

      if (result.status !== "success") {
        const prefix =
          `AUTO-LOGIN: Đăng nhập lại bằng facebook_web thất bại` +
          (accountIndex !== null ? ` (index ${accountIndex})` : "");

        // Nếu bị checkpoint 282 hoặc 956 thì log rõ ràng để còn đổi acc
        if (result.checkpointCode === "282" || result.checkpointCode === "956") {
          log.error(
            `${prefix}: Tài khoản bị checkpoint ${result.checkpointCode} - ${result.checkpointReason || "Checkpoint"} (sẽ thử acc khác nếu có).`
          );
        } else {
          log.error(
            `${prefix}: ${result.error || result.status}`
          );
        }

        // Trả về false để vòng lặp bên ngoài disable acc hiện tại và thử acc tiếp theo
        return false;
      }

      const newCookie = result.cookie;
      if (!newCookie || typeof newCookie !== "string" || !newCookie.includes("c_user=")) {
        log.error("AUTO-LOGIN: Cookie trả về không hợp lệ hoặc thiếu c_user, không thể cập nhật.");
        return false;
      }

      await updateConfigAfterLogin(newCookie);
      updateCtxAfterLogin(ctx, newCookie);
      updateGlobalAccount(newCookie);

      log.success("AUTO-LOGIN: Đăng nhập lại bằng facebook_web thành công.");
      return true;
    };

    if (accounts && accounts.length > 0) {
      const total = accounts.length;
      let startIdx = 0;

      // Nếu cần skip account hiện tại, bắt đầu từ account tiếp theo
      if (skipCurrentAccount && currentAccountIndex !== null) {
        startIdx = currentAccountIndex + 1;
        // Nếu đã đến cuối danh sách, quay lại đầu (nhưng skip account hiện tại)
        if (startIdx >= total) {
          startIdx = 0;
        }
      }

      // Thử từ startIdx đến cuối
      for (let idx = startIdx; idx < total; idx++) {
        const acc = accounts[idx];
        if (!acc) continue;

        // Skip account hiện tại nếu đang ở đó
        if (skipCurrentAccount && idx === currentAccountIndex) {
          log.warn(`AUTO-LOGIN: Bỏ qua account index ${idx} (account hiện tại bị checkpoint 282)`);
          continue;
        }

        // Skip account bị disabled
        if (acc.disabled === true) {
          continue;
        }

        const email = acc.email;
        const password = acc.password;
        // Ưu tiên field chuẩn secret2FA, fallback sang twofactor trong config.json
        const secret2FA =
          ((acc.secret2FA as string | null) ?? (acc.twofactor as string | null)) || null;

        if (!email || !password) continue;

        const ok = await tryLoginWithAccount(email, password, secret2FA, idx);
        if (ok) {
          return true;
        }
      }

      // Nếu startIdx > 0, thử lại từ đầu đến startIdx - 1
      if (startIdx > 0) {
        for (let idx = 0; idx < startIdx; idx++) {
          const acc = accounts[idx];
          if (!acc) continue;

          // Skip account hiện tại
          if (skipCurrentAccount && idx === currentAccountIndex) {
            continue;
          }

          // Skip account bị disabled
          if (acc.disabled === true) {
            continue;
          }

          const email = acc.email;
          const password = acc.password;
          const secret2FA =
            ((acc.secret2FA as string | null) ?? (acc.twofactor as string | null)) || null;

          if (!email || !password) continue;

          const ok = await tryLoginWithAccount(email, password, secret2FA, idx);
          if (ok) {
            return true;
          }
        }
      }

      log.error("AUTO-LOGIN: Tất cả tài khoản trong fbAccounts đều đăng nhập thất bại.");
      return false;
    }


    const emailCfg = (cfg as any).fbEmail;
    const passwordCfg = (cfg as any).fbPassword;
    const secretCfg = ((cfg as any).fbSecret2FA as string | null) ?? null;

    if (emailCfg && passwordCfg) {
      const ok = await tryLoginWithAccount(emailCfg, passwordCfg, secretCfg, null);
      return ok;
    }


    const emailEnv = process.env.FB_LOGIN_EMAIL;
    const passwordEnv = process.env.FB_LOGIN_PASSWORD;
    const secretEnv = process.env.FB_LOGIN_2FA_SECRET || null;

    if (!emailEnv || !passwordEnv) {
      log.error(
        "AUTO-LOGIN: Không tìm thấy thông tin đăng nhập ở fbAccounts, config (fbEmail/fbPassword), hoặc biến môi trường."
      );
      return false;
    }

    const ok = await tryLoginWithAccount(emailEnv, passwordEnv, secretEnv, null);
    return ok;
  } catch (e: any) {
    log.error(`AUTO-LOGIN: Lỗi khi auto login bằng facebook_web: ${e?.message || e}`);
    return false;
  }
}

export default autoReloginWithFacebookWeb;
