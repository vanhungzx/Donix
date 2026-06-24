import type { Context, DefaultFuncs } from "@types";
import { post as networkPost } from "../../request";

export interface DeviceBasedLoginOptions {
  /** UID account, ví dụ: "100009801367183" */
  uid: string | number;

  /**
   * ID đăng nhập (email/uid/phone…) được app gửi trong field `email`
   * Ví dụ theo trace của bạn: "61578134816444"
   */
  loginId: string;

  /** Mật khẩu, theo trace của bạn: "rW1LFZyq" */
  password: string;

  /**
   * Access token OAuth dùng cho các call /{uid}/dblsetnonce, /previouslyauthenticatedsetnonce, /cblsetnonce
   * Ví dụ: EAADo1TDZCuu8BQM...
   */
  accessToken: string;

  /** new_app_id / api_key cho app, mặc định theo ví dụ bạn đưa */
  newAppId?: string;
  apiKey?: string;

  /** Thông tin thiết bị */
  deviceId: string; // x-zero-f-device-id, device_id, family_device_id
  familyDeviceId?: string;
  machineId: string;
  adid?: string;
  advertiserId?: string;

  /** Ngôn ngữ & quốc gia */
  locale?: string;
  clientCountryCode?: string;

  /** jazoest nếu muốn tự truyền, nếu không sẽ cố gắng lấy từ ctx */
  jazoest?: string;

  /** Mã PIN nếu tài khoản có bật login bằng PIN (thường để trống) */
  pin?: string;

  /**
   * Tham số sig trong cURL gốc.
   * LƯU Ý: Hàm này KHÔNG tự sinh sig, bạn phải tự tính & truyền vào nếu server yêu cầu.
   */
  sig?: string;
}

export interface DeviceBasedLoginResponse {
  access_token?: string;
  session_key?: string;
  uid?: string | number;
  machine_id?: string;
  error_code?: number;
  error_msg?: string;
  session_cookies?: any[];
  [key: string]: any;
}

type DeviceBasedLoginCallback = (
  err: any,
  data?: DeviceBasedLoginResponse
) => void;

/**
 * Flow login DBL (device_based_login) để duy trì phiên:
 *
 * 1. POST https://graph.facebook.com/{uid}/dblsetnonce
 * 2. POST https://graph.facebook.com/{uid}/previouslyauthenticatedsetnonce
 * 3. POST https://graph.facebook.com/{uid}/cblsetnonce
 * 4. POST https://b-api.facebook.com/method/auth.login (credentials_type=device_based_login)
 *
 * Hàm này gom 4 bước trên thành 1 API detail, dựa sát theo cURL bạn cung cấp.
 * Bạn có thể gọi lại định kỳ với cùng machine_id + device_id để duy trì session.
 */
export default function deviceBasedLoginFactory(
  _defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
) {
  return async function deviceBasedLogin(
    options: DeviceBasedLoginOptions,
    callback?: DeviceBasedLoginCallback
  ): Promise<DeviceBasedLoginResponse | undefined> {
    const cb: DeviceBasedLoginCallback =
      callback ||
      ((err, data) => {
        if (err) throw err;
        return data;
      });

    try {
      if (!options) throw new Error("Thiếu options cho deviceBasedLogin");

      const {
        uid,
        loginId,
        password,
        accessToken,
        newAppId = "256002347743983",
        apiKey = "256002347743983",
        deviceId,
        familyDeviceId,
        machineId,
        adid,
        advertiserId,
        locale = "en_US",
        clientCountryCode = "VN",
        jazoest,
        pin = "",
        sig,
      } = options;

      if (!uid) throw new Error("uid là bắt buộc");
      if (!loginId) throw new Error("loginId là bắt buộc");
      if (!password) throw new Error("password là bắt buộc");
      if (!accessToken) throw new Error("accessToken là bắt buộc");
      if (!deviceId) throw new Error("deviceId là bắt buộc");
      if (!machineId) throw new Error("machineId là bắt buộc");

      const uidStr = String(uid);

      // =====================
      // 1) /{uid}/dblsetnonce
      // =====================
      const dblForm: Record<string, string> = {
        format: "json",
        new_app_id: newAppId,
        machine_id: machineId,
        pin,
        nonce_to_keep: "",
        locale,
        client_country_code: clientCountryCode,
        fb_api_req_friendly_name: "new_dbl_set_nonce",
        fb_api_caller_class: "DblLiteServiceHandler",
      };

      const baseAndroidUA =
        "Dalvik/2.1.0 (Linux; U; Android 9; V2241A Build/PQ3A.190705.05211459) [FBAN/Orca-Android;FBAV/524.0.0.44.109;FBPN/com.facebook.orca;FBLC/en_US;FBBV/788948125;FBCR/MobiFone;FBMF/vivo;FBBD/vivo;FBDV/V2241A;FBSV/9;FBCA/x86_64:arm64-v8a;FBDM/{density=2.0,width=900,height=1600};FB_FW/1;]";

      const dblHeaders: Record<string, string> = {
        Authorization: `OAuth ${accessToken}`,
        "User-Agent": baseAndroidUA,
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/x-www-form-urlencoded",
        "x-fb-request-analytics-tags":
          '{"network_tags":{"product":"256002347743983","retry_attempt":"0"},"application_tags":"unknown"}',
        "x-fb-rmd": "state=URL_ELIGIBLE",
        "x-fb-connection-quality": "EXCELLENT",
        "x-fb-friendly-name": "new_dbl_set_nonce",
        "x-fb-net-hni": "45201",
        "x-fb-sim-hni": "45201",
        "x-fb-connection-type": "WIFI",
        priority: "u=3, i",
        "x-fb-network-properties": "Wifi;Validated;",
        "x-tigon-is-retry": "False",
        "x-fb-http-engine": "Tigon/Liger",
        "x-fb-client-ip": "True",
        "x-fb-server-cluster": "True",
      };

      // Các header gắn với deviceId / familyDeviceId
      dblHeaders["x-zero-f-device-id"] = deviceId;
      dblHeaders["app-scope-id-header"] = familyDeviceId || deviceId;

      const dblRes = await networkPost(
        `https://graph.facebook.com/${encodeURIComponent(uidStr)}/dblsetnonce`,
        ctx.jar,
        dblForm,
        ctx.options as Record<string, unknown> | undefined,
        ctx,
        dblHeaders
      );

      const dblDataRaw =
        typeof dblRes?.data === "object" && dblRes?.data !== null
          ? dblRes.data
          : dblRes?.body || dblRes;

      let dblData: any = dblDataRaw;
      if (typeof dblDataRaw === "string") {
        try {
          dblData = JSON.parse(dblDataRaw);
        } catch {
          throw new Error(
            "Phản hồi dblsetnonce không phải JSON hợp lệ: " +
              dblDataRaw.slice(0, 200)
          );
        }
      }

      const nonce: string | undefined = dblData?.nonce;

      // =====================================================
      // 2) /{uid}/previouslyauthenticatedsetnonce (lưu thiết bị)
      // =====================================================
      const nowSec = Math.floor(Date.now() / 1000);

      const prevForm: Record<string, string> = {
        format: "json",
        machine_id: machineId,
        device_id: deviceId,
        client_action_time: String(nowSec),
        locale,
        client_country_code: clientCountryCode,
        fb_api_req_friendly_name: "set_previously_authenticated_nonce",
        fb_api_caller_class: "PreviouslyAuthenticatedNonceServiceHandler",
      };

      const prevHeaders: Record<string, string> = {
        ...dblHeaders,
        "x-fb-friendly-name": "set_previously_authenticated_nonce",
      };

      await networkPost(
        `https://graph.facebook.com/${encodeURIComponent(
          uidStr
        )}/previouslyauthenticatedsetnonce`,
        ctx.jar,
        prevForm,
        ctx.options as Record<string, unknown> | undefined,
        ctx,
        prevHeaders
      );

      // ====================================
      // 3) /{uid}/cblsetnonce (cloud login)
      // ====================================
      const cblForm: Record<string, string> = {
        format: "json",
        new_app_id: newAppId,
        generate_machine_id: "1",
        pin,
        nonce_to_keep: nonce || "",
        device_id: deviceId,
        client_action_time: String(nowSec),
        flow: "caa_login",
        locale,
        client_country_code: clientCountryCode,
        fb_api_req_friendly_name: "set_fb_cloud_based_login_nonce",
        fb_api_caller_class: "CloudBasedLoginServiceHandler",
      };

      const cblHeaders: Record<string, string> = {
        ...dblHeaders,
        "x-fb-friendly-name": "set_fb_cloud_based_login_nonce",
      };

      await networkPost(
        `https://graph.facebook.com/${encodeURIComponent(uidStr)}/cblsetnonce`,
        ctx.jar,
        cblForm,
        ctx.options as Record<string, unknown> | undefined,
        ctx,
        cblHeaders
      );

      // ==========================
      // 4) auth.login (DBL login)
      // ==========================
      const authForm: Record<string, string> = {
        meta_inf_fbmeta: "NO_FILE",
        adid: adid || deviceId,
        format: "json",
        device_id: deviceId,
        email: loginId,
        password,
        generate_analytics_claim: "1",
        family_device_id: familyDeviceId || deviceId,
        pin,
        credentials_type: "device_based_login",
        generate_session_cookies: "1",
        source: "logged_in_account_switcher",
        machine_id: machineId,
        jazoest:
          jazoest || (ctx as any).jazoest
            ? String((ctx as any).jazoest)
            : "22511",
        advertiser_id: advertiserId || adid || deviceId,
        currently_logged_in_userid: uidStr,
        locale,
        client_country_code: clientCountryCode,
        method: "auth.login",
        fb_api_req_friendly_name: "authenticate",
        fb_api_caller_class: "AuthOperations$DblAuthOperation",
        api_key: apiKey,
      };

      if (sig) {
        authForm.sig = sig;
      }

      const authHeaders: Record<string, string> = {
        "User-Agent": baseAndroidUA,
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/x-www-form-urlencoded",
        "x-fb-request-analytics-tags":
          '{"network_tags":{"product":"256002347743983","retry_attempt":"0"},"application_tags":"unknown"}',
        "x-fb-rmd": "state=NO_MATCH",
        "x-fb-connection-quality": "EXCELLENT",
        "x-fb-friendly-name": "authenticate",
        "x-zero-f-device-id": deviceId,
        "x-fb-net-hni": "45201",
        "x-fb-sim-hni": "45201",
        "app-scope-id-header": familyDeviceId || deviceId,
        "x-fb-connection-type": "WIFI",
        "x-zero-eh":
          "2,,AUqzEIhW_8vnrFoWGPXlcocthgSnDFec8scKIh51prrx9-2tDZHj-8rwqmpaqHGL--Q",
        priority: "u=3, i",
        "x-fb-network-properties": "Wifi;Validated;",
        "x-tigon-is-retry": "False",
        "x-fb-http-engine": "Tigon/Liger",
        "x-fb-client-ip": "True",
        "x-fb-server-cluster": "True",
      };

      const authRes = await networkPost(
        "https://b-api.facebook.com/method/auth.login",
        ctx.jar,
        authForm,
        ctx.options as Record<string, unknown> | undefined,
        ctx,
        authHeaders
      );

      const authDataRaw =
        typeof authRes?.data === "object" && authRes?.data !== null
          ? authRes.data
          : authRes?.body || authRes;

      let authData: any = authDataRaw;
      if (typeof authDataRaw === "string") {
        try {
          authData = JSON.parse(authDataRaw);
        } catch {
          throw new Error(
            "Phản hồi auth.login không phải JSON hợp lệ: " +
              authDataRaw.slice(0, 200)
          );
        }
      }

      cb(null, authData as DeviceBasedLoginResponse);
      return authData as DeviceBasedLoginResponse;
    } catch (err) {
      if (callback) {
        callback(err);
        return undefined;
      }
      throw err;
    }
  };
}
