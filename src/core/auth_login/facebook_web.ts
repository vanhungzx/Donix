import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import logger from "@log";
import GoogleAuthenticator from "../../utils/GoogleAuthenticator";
const ENDPOINTS = {
  home: "https://m.facebook.com/",
  login: "https://m.facebook.com/async/wbloks/fetch/?appid=com.bloks.www.bloks.caa.login.async.send_login_request&type=action&__bkv=955b57fc3bce3206cb37f9d05cdd37a39e9e17b07e844a93802fa127ca17dd13",
  verify2fa: "https://m.facebook.com/async/wbloks/fetch/?appid=com.bloks.www.two_step_verification.verify_code.async&type=action&__bkv=955b57fc3bce3206cb37f9d05cdd37a39e9e17b07e844a93802fa127ca17dd13"
};

const createSession = () => wrapper(axios.create({ jar: new CookieJar() })) as any;

const getCookiesFromJar = (session: any, domain = "facebook.com") => {
  const cookies = session.defaults.jar.getCookiesSync(`https://${domain}`);
  return cookies.map((c: any) => `${c.key}=${c.value}`).join("; ");
};

const validateCookies = (cookieString: string) => {
  const c = cookieString.split("; ").find(x => x.startsWith("c_user="));
  if (!c) return { valid: false, userId: null as string | null };
  return { valid: true, userId: c.split("=")[1] };
};

const headersMobile = (type: string) => {
  const viewportWidth = Math.floor(Math.random() * 55) + 360;
  const dpr = Math.random() < 0.5 ? 2 : 3;
  const iosVersions = ["16_6", "16_7", "17_0", "17_1", "17_2"];
  const v = iosVersions[Math.floor(Math.random() * iosVersions.length)];
  const base: Record<string, string> = {
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Ch-Prefers-Color-Scheme": Math.random() < 0.5 ? "light" : "dark",
    "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Apple WebKit";v="605", "Safari";v="605"',
    "Sec-Ch-Ua-Full-Version-List": '"Not/A)Brand";v="99.0.0.0", "Apple WebKit";v="605.1.15", "Safari";v="605.1.15"',
    "Sec-Ch-Ua-Platform": '"iOS"',
    "Sec-Ch-Ua-Platform-Version": `"${v.replace("_", ".")}"`,
    "Priority": "u=1, i",
    "Referer": "https://m.facebook.com/",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": `Mozilla/5.0 (iPhone; CPU iPhone OS ${v} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v.replace("_", ".")} Mobile/15E148 Safari/604.1`,
    "Connection": "keep-alive"
  };
  if (String(type).toLowerCase() === "get") {
    return {
      ...base,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Cache-Control": "no-cache",
      Dpr: String(dpr),
      Priority: "u=0, i",
      "Sec-Ch-Ua-Mobile": "?1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      "Viewport-Width": String(viewportWidth),
      "X-Requested-With": "XMLHttpRequest",
      "X-FB-LSD": "1",
      "X-ASBD-ID": "129477"
    };
  }
  return {
    ...base,
    Accept: "*/*",
    "Content-Type": "application/x-www-form-urlencoded",
    Origin: "https://m.facebook.com",
    Priority: "u=1, i",
    Referer: "https://m.facebook.com/",
    "Sec-Ch-Ua-Mobile": "?1",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "X-Requested-With": "XMLHttpRequest",
    "X-FB-LSD": "1",
    "X-ASBD-ID": "129477",
    Connection: "keep-alive"
  };
};

const pick = (html: string, re: RegExp): string | null => {
  const m = html.match(re);
  return m ? m[1] : null;
};

const parseJSON = (s: any): any => {
  const t = String(s || "").replace(/^for\s*\(\s*;;\s*\);\s*/, "");
  return JSON.parse(t);
};

const genTotp = async (secret: string): Promise<string> => {
  const cleaned = String(secret || "")
    .replace(/\s+/g, "")
    .toUpperCase();

  // Sử dụng GoogleAuthenticator để tạo mã TOTP từ secret base32
  const authenticator = new GoogleAuthenticator();
  const code = authenticator.getCode(cleaned);

  return code;
};

const buildLoginParams = (email: string, password: string, html: string) => {
  const ts = Math.floor(Date.now() / 1000);
  return {
    "__aaid": "0",
    "__user": "0",
    "__a": "1",
    "__req": "d",
    "__hs": pick(html, /"haste_session":"(.*?)"/),
    "dpr": "1",
    "__ccg": "EXCELLENT",
    "__rev": pick(html, /"server_revision":(.*?),/),
    "__hsi": pick(html, /"hsi":"(.*?)"/),
    "__csr": "",
    "fb_dtsg": pick(html, /"dtsg":{"token":"(.*?)"/),
    "jazoest": pick(html, /"jazoest", "(.*?)"/),
    "lsd": pick(html, /"LSD",\[\],{"token":"(.*?)"}/),
    "params": JSON.stringify({
      credential_type: "password",
      username_text_input_id: "yubcjs:61",
      password_text_input_id: "yubcjs:62",
      contact_point: email,
      password: `#PWD_BROWSER:0:${ts}:${password}`
    })
  };
};

const build2FAParams = (code: string, html: string, csr = "") => ({
  "__aaid": "0",
  "__user": "0",
  "__a": "1",
  "__req": "t",
  "__hs": pick(html, /"haste_session":"(.*?)"/) || "20120.BP:wbloks_caa_pkg.2.0...0",
  "dpr": "3",
  "__ccg": "EXCELLENT",
  "__rev": pick(html, /"server_revision":(.*?),/),
  "__s": ":567cxa:z3ol4q",
  "__hsi": pick(html, /"hsi":"(.*?)"/),
  "__dyn": "0wzpawlE72fDg9ppo5S12wAxu13wqobE6u7E39x60lW4o3Bw4Ewk9E4W099w2s8hw73wGw6tw5Uw64w8W1uwf20n6aw8m0zE2ZwrU6q3a0le0iS2eU2dwde",
  "__csr": csr || "",
  "fb_dtsg": pick(html, /"dtsg":{"token":"(.*?)"/),
  "jazoest": pick(html, /"jazoest", "(.*?)"/),
  "lsd": pick(html, /"LSD",\[\],{"token":"(.*?)"}/),
  "params": JSON.stringify({
    params: {
      server_params: {
        two_step_verification_context: "",
        flow_source: "two_factor_login",
        challenge: "totp",
        machine_id: null,
        device_id: null
      },
      client_input_params: {
        machine_id: "",
        code,
        should_trust_device: 1,
        auth_secure_device_id: "",
        openid_tokens: {}
      }
    }
  })
});

type LoginStatus = "success" | "failed" | "2fa_required";

interface LoginResult {
  status: LoginStatus;
  /**
   * Mã checkpoint nếu có (ví dụ: "282" hoặc "956")
   */
  checkpointCode?: string;
  checkpointReason?: string;
  error?: string;
  [key: string]: any;
}

interface LoginEmailInput {
  email: string;
  password: string;
  secret2FA?: string | null;
}

const loginEmail = async ({ email, password, secret2FA = null }: LoginEmailInput): Promise<LoginResult> => {
  try {
    const session = createSession();
    const home = await session.get(ENDPOINTS.home, { headers: headersMobile("get") });
    const html: string = home.data || "";
    const formData = buildLoginParams(email, password, html);
    logger.info(`AUTO-LOGIN: Bắt đầu đăng nhập với: ${email}`);
    const loginRes = await session.post(
      ENDPOINTS.login,
      new URLSearchParams(formData as any).toString(),
      { headers: headersMobile("post") }
    );
    const rawBody: string = String(loginRes?.data ?? "");
    const loginData = parseJSON(rawBody);
    if (loginData?.payload?.layout?.bloks_payload?.action?.includes("redirection_to_two_fac")) {
      const action: string = loginData.payload.layout.bloks_payload.action || "";
      const contexts = action.match(/Make,\s*"([^"]{200,})"/g) || [];
      if (!contexts.length) throw new Error("Cannot find 2FA context");
      const twoStepData = contexts[contexts.length - 1].replace(/^Make,\s*"/, "").replace(/"$/, "");
      if (twoStepData) {
        logger.info("AUTO-LOGIN: Đang xử lý 2FA...");
        if (!secret2FA) {
          return { status: "2fa_required", twofactor_context: twoStepData, twofactor_type: "web_2fa" };
        }
        const code = await genTotp(secret2FA);
        await new Promise(r => setTimeout(r, 1000));
        const verifyParams: any = build2FAParams(code, html);
        try {
          const p = JSON.parse(verifyParams.params);
          p.params.server_params.two_step_verification_context = twoStepData;
          verifyParams.params = JSON.stringify(p);
        } catch { }
        const verifyRes = await session.post(
          ENDPOINTS.verify2fa,
          new URLSearchParams(verifyParams).toString(),
          { headers: { ...headersMobile("post"), Referer: ENDPOINTS.home } }
        );
        const verifyData = parseJSON(verifyRes.data);
        if (verifyData?.ajaxUpdateAfterLogin) {
          await new Promise(r => setTimeout(r, 1000));
          const cookieString = getCookiesFromJar(session, "facebook.com");
          const v = validateCookies(cookieString);
          if (!v.valid) return { status: "failed", error: "Missing c_user cookie - login may have failed" };
          logger.info(`AUTO-LOGIN: Login successful with c_user: ${v.userId}`);
          return {
            status: "success",
            userId: v.userId,
            fb_dtsg: verifyData.ajaxUpdateAfterLogin.dtsgToken,
            cookie: cookieString,
            session
          };
        }
        const cookieString = getCookiesFromJar(session, "facebook.com");
        const v = validateCookies(cookieString);
        return {
          status: v.valid ? "success" as LoginStatus : "failed",
          userId: v.userId || verifyData.ajaxUpdateAfterLogin?.currentUser,
          dtsgToken: verifyData.ajaxUpdateAfterLogin?.dtsgToken,
          dtsgAsyncGetToken: verifyData.ajaxUpdateAfterLogin?.dtsgAsyncGetToken,
          ajaxResponseToken: verifyData.ajaxUpdateAfterLogin?.ajaxResponseToken,
          cookie: cookieString,
          session
        };
      }
    }
    if (loginData?.ajaxUpdateAfterLogin?.currentUser) {
      const cookieString = getCookiesFromJar(session, "facebook.com");
      const v = validateCookies(cookieString);
      if (!v.valid) return { status: "failed", error: "Missing c_user cookie - login may have failed" };
      logger.info(`AUTO-LOGIN: Login successful with c_user: ${v.userId}`);
      return {
        status: "success",
        userId: v.userId,
        fb_dtsg: loginData.ajaxUpdateAfterLogin.dtsgToken,
        cookie: cookieString,
        session
      };
    }

    // Nếu tới đây mà vẫn chưa login thành công, kiểm tra xem có dính checkpoint 282 / 956 không
    const isCheckpoint282 = rawBody.includes("1501092823525282");
    const isCheckpoint956 = rawBody.includes("828281030927956");
    const isScrapingWarning = rawBody.includes("XCheckpointFBScrapingWarningController");

    if (isCheckpoint282 || isCheckpoint956 || isScrapingWarning) {
      const checkpointCode = isCheckpoint282 ? "282" : isCheckpoint956 ? "956" : "unknown";
      const reason = isCheckpoint282
        ? "Checkpoint 282 (verification / suspicious login)"
        : isCheckpoint956
          ? "Checkpoint 956 (scraping warning / security)"
          : "Checkpoint / scraping warning";

      logger.warn(
        `AUTO-LOGIN: Phát hiện checkpoint khi login (code=${checkpointCode}). Sẽ báo về cho auto_relogin để đổi acc nếu có.`
      );

      return {
        status: "failed",
        error: `checkpoint_${checkpointCode}`,
        checkpointCode,
        checkpointReason: reason,
      };
    }

    return { status: "failed", error: "Login failed - no valid response data" };
  } catch (e: any) {
    return { status: "failed", error: e?.message || String(e) };
  }
};

export default loginEmail;
