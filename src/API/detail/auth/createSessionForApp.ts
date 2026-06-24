import type { Context, DefaultFuncs } from "@types";
import { post as networkPost } from "../../request";

export interface CreateSessionForAppOptions {
  /** Access token gốc cần đổi */
  accessToken: string;

  /** app đích (new_app_id), mặc định theo ví dụ bạn đưa */
  newAppId?: string;

  /** api_key / product id, mặc định theo ví dụ bạn đưa */
  apiKey?: string;

  /** jazoest nếu muốn tự truyền, nếu không sẽ dùng từ ctx nếu có */
  jazoest?: string;

  /** UID hiện đang đăng nhập, nếu không truyền sẽ lấy từ ctx.userID (nếu có) */
  currentlyLoggedInUserId?: string;

  /** locale, mặc định vi_VN */
  locale?: string;

  /** mã quốc gia, mặc định VN */
  clientCountryCode?: string;

  /** device_id, family_device_id, machine_id, adid/advertiser_id… nếu muốn mô phỏng đúng thiết bị */
  deviceId?: string;
  familyDeviceId?: string;
  machineId?: string;
  adid?: string;
  advertiserId?: string;

  /** fb_api_req_friendly_name, fb_api_caller_class */
  fbApiReqFriendlyName?: string;
  fbApiCallerClass?: string;

  /**
   * Tham số sig trong cURL gốc.
   * LƯU Ý: Để dùng đúng chuẩn, bạn cần tự tính sig theo thuật toán của app,
   * ở đây mình chỉ nhận vào dưới dạng tham số, KHÔNG tự sinh.
   */
  sig?: string;
}

export interface CreateSessionForAppResponse {
  session_key?: string;
  uid?: string | number;
  secret?: string;
  access_token?: string;
  machine_id?: string;
  analytics_claim?: string;
  user_storage_key?: string;
  is_msplit_account?: boolean;
  is_fb_only_not_allowed_in_msgr?: boolean;
  has_encrypted_backup?: boolean;
  [key: string]: any;
}

type CreateSessionForAppCallback = (
  err: any,
  data?: CreateSessionForAppResponse
) => void;

/**
 * Gọi endpoint mobile: https://b-graph.facebook.com/auth/create_session_for_app
 * để đổi access_token sang token/app khác (session cho app).
 *
 * Hàm này cố gắng bọc lại cURL bạn gửi dưới dạng detail API,
 * nhưng vẫn để mở một số field cho bạn tự truyền (sig, deviceId, v.v.).
 */
export default function createSessionForAppFactory(
  _defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
) {
  return async function createSessionForApp(
    options: CreateSessionForAppOptions,
    callback?: CreateSessionForAppCallback
  ): Promise<CreateSessionForAppResponse | undefined> {
    const cb: CreateSessionForAppCallback =
      callback ||
      ((err, data) => {
        if (err) throw err;
        return data;
      });

    try {
      if (!options || !options.accessToken) {
        throw new Error("accessToken là bắt buộc");
      }

      const {
        accessToken,
        newAppId = "1517268191927890",
        apiKey = "256002347743983",
        jazoest,
        currentlyLoggedInUserId,
        locale = "vi_VN",
        clientCountryCode = "VN",
        deviceId,
        familyDeviceId,
        machineId,
        adid,
        advertiserId,
        fbApiReqFriendlyName = "authenticate",
        fbApiCallerClass = "AuthOperations",
        sig,
      } = options;

      const uid =
        currentlyLoggedInUserId ||
        ((ctx as any).userID as string | number | undefined) ||
        "";
      const form: Record<string, string> = {
        meta_inf_fbmeta: "NO_FILE",
        format: "json",
        access_token: accessToken,
        generate_analytics_claim: "1",
        new_app_id: newAppId,
        source: "unread_count_loader",
        locale,
        client_country_code: clientCountryCode,
        fb_api_req_friendly_name: fbApiReqFriendlyName,
        fb_api_caller_class: fbApiCallerClass,
        api_key: apiKey,
      };
      if (deviceId) form.device_id = deviceId;
      if (familyDeviceId) form.family_device_id = familyDeviceId;
      if (machineId) form.machine_id = machineId;
      if (adid) form.adid = adid;
      if (advertiserId) form.advertiser_id = advertiserId;
      if (jazoest || (ctx as any).jazoest) {
        form.jazoest = jazoest || String((ctx as any).jazoest);
      }
      if (uid) {
        form.currently_logged_in_userid = String(uid);
      }
      if (sig) {
        form.sig = sig;
      }
      const customHeader: Record<string, string> = {
        "User-Agent": 'Dalvik/2.1.0 (Linux; U; Android 9; 23113RKC6C Build/PQ3A.190605.06171036) [FBAN/Orca-Android;FBAV/536.0.0.46.216;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/840054738;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBDV/23113RKC6C;FBSV/9;FBCA/x86_64:arm64-v8a;FBDM/{density=3.0,width=1080,height=1920};FB_FW/1;]',
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/x-www-form-urlencoded",
        "x-fb-request-analytics-tags":
          '{"network_tags":{"product":"256002347743983","purpose":"none","retry_attempt":"0"},"application_tags":"unknown"}',
        "x-fb-rmd": "state=URL_ELIGIBLE",
        "x-fb-connection-quality": "EXCELLENT",
        "x-fb-friendly-name": fbApiReqFriendlyName,
        "x-fb-connection-type": "WIFI",
        "x-fb-network-properties": "Wifi;Validated;",
        "x-tigon-is-retry": "False",
        "x-fb-http-engine": "Tigon/Liger",
        "x-fb-client-ip": "True",
        "x-fb-server-cluster": "True",
      };
      if (deviceId) {
        customHeader["x-zero-f-device-id"] = deviceId;
      }
      if (familyDeviceId) {
        customHeader["app-scope-id-header"] = familyDeviceId;
      }
      const res = await networkPost(
        "https://b-graph.facebook.com/auth/create_session_for_app",
        ctx.jar,
        form,
        ctx.options as Record<string, unknown> | undefined,
        ctx,
        customHeader
      );

      const data =
        typeof res?.data === "object" && res?.data !== null ? res.data : res?.body || res;

      if (typeof data === "string") {
        try {
          const parsed = JSON.parse(data);
          cb(null, parsed as CreateSessionForAppResponse);
          return parsed;
        } catch {
          throw new Error("Phản hồi không phải JSON hợp lệ: " + data.slice(0, 200));
        }
      }

      cb(null, data as CreateSessionForAppResponse);
      return data as CreateSessionForAppResponse;
    } catch (err) {
      if (callback) {
        callback(err);
        return undefined;
      }
      throw err;
    }
  };
}
