import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

function isJsonObject(v: JsonValue): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeJsonParse(text: string): JsonValue | null {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return null;
  }
}

function getAtPath(root: JsonValue | null, pathKeys: string[]): JsonValue | null {
  if (!root) return null;
  let cur: JsonValue = root;
  for (const key of pathKeys) {
    if (!isJsonObject(cur)) return null;
    cur = cur[key] ?? null;
  }
  return cur ?? null;
}

function getStringAtPath(root: JsonValue | null, pathKeys: string[]): string | null {
  const v = getAtPath(root, pathKeys);
  return typeof v === "string" ? v : null;
}

function debugWriteFile(filename: string, content: string): void {
  if (process.env.DEBUG_MESSENGER_APP !== "1") return;
  try {
    fs.writeFileSync(filename, content, "utf-8");
  } catch {}
}

export type LoginSuccess = {
  success: true;
  message: string;
  access_token: string;
  cookies: string;
  user_id: string;
  session_key: string;
  machine_id: string;
  secret: string;
};

export type LoginFailure = {
  success: false;
  message: string;
};

export type LoginResult = LoginSuccess | LoginFailure;

type SessionCookie = { name?: string; value?: string };
type SessionJson = {
  access_token?: string;
  session_cookies?: SessionCookie[];
  uid?: string | number;
  session_key?: string;
  machine_id?: string;
  secret?: string;
};

type SessionData = {
  access_token?: string;
  session_key?: string;
  uid?: string;
  machine_id?: string;
  secret?: string;
  cookies?: string;
};

const FETCH_OPTS = {
  method: "POST",
  redirect: "follow",
} as const satisfies RequestInit;

function fail(message: string): LoginFailure {
  return { success: false, message };
}

function ok(data: Omit<LoginSuccess, "success">): LoginSuccess {
  return { success: true, ...data };
}

export async function login(username: string, password: string, twoFaSecret: string): Promise<LoginResult> {
  try {
    console.log(`Đang xử lý đăng nhập cho: ${username}`);
    if (!username || !password) {
      return fail("Tên đăng nhập và mật khẩu không được để trống");
    }

    const response = await sendLoginRequest(username, password);
    if (!response) {
      return fail("Không thể kết nối đến máy chủ Facebook");
    }

    return await parseLoginResponse(response, twoFaSecret);
  } catch (err) {
    console.log(`Lỗi: ${String(err)}`);
    return fail(`Lỗi máy chủ: ${String(err)}`);
  }
}

async function sendLoginRequest(username: string, password: string): Promise<string> {
  try {
    console.log("Đang mã hóa mật khẩu...");
    const pwdKeyFetch = "https://b-graph.facebook.com//pwd_key_fetch";
    const deviceId = crypto.randomUUID();
    const pwdKeyFetchData = new URLSearchParams({
      device_id: deviceId,
      version: "2",
      flow: "CONTROLLER_INITIALIZATION",
      locale: "vi_VN",
      client_country_code: "VN",
      method: "GET",
      fb_api_req_friendly_name: "pwdKeyFetch",
      fb_api_caller_class: "AuthOperations",
      access_token: "256002347743983|374e60f8b9bb6b8cbb30f78030438895",
    });

    const keyHeaders: Record<string, string> = {
      "User-Agent":
        "Dalvik/2.1.0 (Linux; U; Android 9; 23113RKC6C Build/PQ3A.190605.06171036) [FBAN/Orca-Android;FBAV/535.0.0.89.107;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/835027694;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBDV/23113RKC6C;FBSV/9;FBCA/x86_64:arm64-v8a;FBDM/{density=3.0,width=1080,height=1920};FB_FW/1;]",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/x-www-form-urlencoded",
      "x-fb-request-analytics-tags":
        '{"network_tags":{"product":"256002347743983","purpose":"none","retry_attempt":"0"},"application_tags":"unknown"}',
      authorization: "OAuth",
      "x-zero-eh": "664c0faaac849cb891d0a261fbb72a12",
      "x-fb-rmd": "state=URL_ELIGIBLE",
      "x-fb-connection-quality": "EXCELLENT",
      "x-zero-state": "unknown",
      "x-fb-friendly-name": "pwdKeyFetch",
      "x-zero-f-device-id": deviceId,
      "x-fb-integrity-machine-id": "QkQjaaPYXqr7elYbhXm9k25K",
      "x-fb-net-hni": "45201",
      "x-fb-sim-hni": "45201",
      "app-scope-id-header": "86b2535b-8fc5-4b84-9476-112a5a8c4e72",
      "x-fb-connection-type": "WIFI",
      priority: "u=3, i",
      "x-fb-network-properties": "Wifi;Validated;",
      "x-tigon-is-retry": "False",
      "x-fb-http-engine": "Tigon/Liger",
      "x-fb-client-ip": "True",
      "x-fb-server-cluster": "True",
      "x-fb-conn-uuid-client": "cef8a06e8d4b971ba69591533f41efba",
    };

    const keyResp = await fetch(pwdKeyFetch, {
      ...FETCH_OPTS,
      headers: keyHeaders,
      body: pwdKeyFetchData,
    });

    const keyJson = (await keyResp.json()) as { public_key?: string; key_id?: string | number };
    const publicKey = keyJson.public_key;
    if (!publicKey) return "";

    const keyId = String(keyJson.key_id ?? "25");

    const randKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const encryptedRandKey = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      randKey,
    );

    const cipher = crypto.createCipheriv("aes-256-gcm", randKey, iv);
    const currentTime = Math.floor(Date.now() / 1000);
    cipher.setAAD(Buffer.from(String(currentTime), "utf8"));
    const encryptedPass = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const bufParts: Buffer[] = [
      Buffer.from([1, Number(keyId)]),
      iv,
      Buffer.from(Int16Array.of(encryptedRandKey.length).buffer),
      encryptedRandKey,
      authTag,
      encryptedPass,
    ];
    const encoded = Buffer.concat(bufParts).toString("base64");
    const encryptedPassword = `#PWD_MSGR:2:${currentTime}:${encoded}`;

    const waterfallId = crypto.randomUUID();
    const clientTraceId = crypto.randomUUID();
    const machineId = "QkQjaaPYXqr7elYbhXm9k25K";
    const familyDeviceId = deviceId;

    const variables = {
      params: {
        params: JSON.stringify({
          params: {
            server_params: {
              device_id: deviceId,
              server_login_source: "login",
              waterfall_id: waterfallId,
              attestation_result: { errorMessage: "KeyAttestationException: No key found!" },
              machine_id: machineId,
              from_native_screen: true,
              credential_type: "password",
              password: encryptedPassword,
              try_num: "1",
              family_device_id: familyDeviceId,
              event_flow: "login_manual",
              event_step: "home_page",
              is_from_logged_in_switcher: false,
              contact_point: username,
            },
          },
        }),
        bloks_versioning_id: "8529dbd160b6773bacafe4db8da1b3e4f3f7f6a46325fdcc55ea121fcedbca99",
        app_id: "com.bloks.www.bloks.caa.login.async.send_login_request",
      },
      scale: "3",
      nt_context: {
        is_flipper_enabled: false,
        theme_params: [{ value: [], design_system_name: "FDS" }],
        debug_tooling_metadata_token: null as null,
      },
    };

    const payload = new URLSearchParams({
      method: "post",
      pretty: "false",
      format: "json",
      server_timestamps: "true",
      locale: "vi_VN",
      fb_api_req_friendly_name: "FbBloksActionRootQuery-com.bloks.www.bloks.caa.login.async.send_login_request",
      fb_api_caller_class: "graphservice",
      client_doc_id: "11994080425969031306509088180",
      fb_api_client_context: JSON.stringify({ is_background: false }),
      variables: JSON.stringify(variables),
      fb_api_analytics_tags: '["GraphServices"]',
      client_trace_id: clientTraceId,
    });

    const headers: Record<string, string> = {
      "User-Agent":
        "Dalvik/2.1.0 (Linux; U; Android 9; 23113RKC6C Build/PQ3A.190605.06171036) [FBAN/Orca-Android;FBAV/535.0.0.89.107;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/835027694;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBDV/23113RKC6C;FBSV/9;FBCA/x86_64:arm64-v8a;FBDM/{density=3.0,width=1080,height=1920};FB_FW/1;]",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/x-www-form-urlencoded",
      "x-fb-request-analytics-tags":
        '{"network_tags":{"product":"256002347743983","request_category":"graphql","purpose":"none","retry_attempt":"0"},"application_tags":"graphservice"}',
      "x-fb-rmd": "state=URL_ELIGIBLE",
      "x-fb-friendly-name": "FbBloksActionRootQuery-com.bloks.www.bloks.caa.login.async.send_login_request",
      "x-zero-f-device-id": deviceId,
      "x-fb-integrity-machine-id": machineId,
      "x-graphql-client-library": "graphservice",
      "x-zero-eh": "664c0faaac849cb891d0a261fbb72a12",
      "x-fb-net-hni": "45201",
      "x-fb-sim-hni": "45201",
      authorization: "OAuth 256002347743983|374e60f8b9bb6b8cbb30f78030438895",
      "x-zero-state": "unknown",
      "app-scope-id-header": "86b2535b-8fc5-4b84-9476-112a5a8c4e72",
      "x-fb-connection-type": "WIFI",
      priority: "u=3, i",
      "x-fb-network-properties": "Wifi;Validated;",
      "x-tigon-is-retry": "False",
      "x-fb-http-engine": "Tigon/Liger",
      "x-fb-client-ip": "True",
      "x-fb-server-cluster": "True",
      "x-fb-conn-uuid-client": "cef8a06e8d4b971ba69591533f41efba",
      Host: "b-graph.facebook.com",
    };

    console.log("📡 Đang gửi yêu cầu đăng nhập đến Facebook...");
    const resp = await fetch("https://b-graph.facebook.com/graphql", {
      ...FETCH_OPTS,
      body: payload,
      headers,
    });

    if (resp.status === 200) {
      console.log("✅ Facebook đã phản hồi thành công");
      return await resp.text();
    }
    console.log(`❌ Facebook phản hồi lỗi: ${resp.status}`);
    return "";
  } catch (err) {
    console.log(`❌ Lỗi gửi yêu cầu đăng nhập: ${String(err)}`);
    return "";
  }
}

async function parseLoginResponse(jsonResponse: string, twoFaSecret: string): Promise<LoginResult> {
  try {
    const actionString = extractActionString(jsonResponse);
    console.log("🔍 Đang phân tích phản hồi đăng nhập...");

    if (actionString.includes("session_key")) {
      const sessionRegex = /\(bk\.action\.caa\.HandleLoginResponse,.*?(\{(?:[^{}]|{[^{}]*})*\})/s;
      const sessionMatch = actionString.match(sessionRegex);
      if (sessionMatch) {
        let sessionJsonRaw = sessionMatch[1];
        sessionJsonRaw = sessionJsonRaw.replace(/\\\\/g, "\\").replace(/\\"/g, '"');
        sessionJsonRaw = sessionJsonRaw.replace(
          /([^\\])\\u([0-9a-fA-F]{4})/g,
          (_m: string, pre: string, code: string) => pre + String.fromCharCode(Number.parseInt(code, 16)),
        );
        sessionJsonRaw = sessionJsonRaw.replace(
          /^\\u([0-9a-fA-F]{4})/g,
          (_m: string, code: string) => String.fromCharCode(Number.parseInt(code, 16)),
        );

        let sessionJsonObj: SessionJson;
        try {
          sessionJsonObj = JSON.parse(sessionJsonRaw) as SessionJson;
        } catch (e) {
          debugWriteFile("actionString_session.error.json", sessionJsonRaw);
          const msg = e instanceof Error ? e.message : String(e);
          console.log("❌ Không thể parse session JSON:", msg);
          return fail(`Lỗi giải mã session JSON: ${msg}`);
        }

        debugWriteFile("actionString_session.json", JSON.stringify(sessionJsonObj, null, 2));
        console.log(JSON.stringify(sessionJsonObj, null, 2));
        console.log("✅ Phát hiện đăng nhập thành công (fixm)!");

        const cookieStr =
          sessionJsonObj.session_cookies
            ?.filter((c) => Boolean(c.name && c.value) && ["c_user", "xs", "fr", "datr", "sb"].includes(c.name ?? ""))
            .map((c) => `${c.name ?? ""}=${c.value ?? ""}`)
            .filter((x) => x.length > 2)
            .join("; ") ?? "";

        return ok({
          access_token: sessionJsonObj.access_token ?? "",
          cookies: cookieStr,
          message: "Đăng nhập thành công",
          user_id: sessionJsonObj.uid != null ? String(sessionJsonObj.uid) : "",
          session_key: sessionJsonObj.session_key ?? "",
          machine_id: sessionJsonObj.machine_id ?? "",
          secret: sessionJsonObj.secret ?? "",
        });
      }

      // Fallback: đôi khi actionString có token nhưng regex không match được.
      debugWriteFile("actionString.json", actionString);
      const fallback = parseSuccessfulLogin(actionString);
      if (fallback.success) return fallback;

      console.log("❌ Không tìm thấy session data trong actionString!");
      return fail("Không tìm thấy session data trong actionString!");
    }

    if (actionString.includes("two_step_verification") || actionString.includes("two_fac")) {
      console.log("🔐 Phát hiện yêu cầu 2FA! Hoặc 681");
      return await handle2Fa(actionString, twoFaSecret);
    }

    if (["Wrong Credentials", "Invalid username", "login_failed"].some((x) => actionString.includes(x))) {
      console.log("❌ Phát hiện thông tin đăng nhập sai!");
      return fail("Sai tên đăng nhập hoặc mật khẩu");
    }

    if (actionString.includes("checkpoint") || actionString.includes("security_check")) {
      console.log("🛡️ Phát hiện checkpoint!");
      return fail("Tài khoản bị checkpoint");
    }

    console.log("❓ Phát hiện phản hồi không xác định!");
    return fail(`Phản hồi không xác định từ Facebook ${jsonResponse} `);
  } catch (err) {
    console.log(`❌ Lỗi phân tích: ${String(err)}`);
    return fail(`Lỗi phân tích phản hồi: ${String(err)}`);
  }
}

function extractActionString(jsonResponse: string): string {
  try {
    const data = safeJsonParse(jsonResponse);
    const actionBundle = getStringAtPath(data, [
      "data",
      "fb_bloks_action",
      "root_action",
      "action",
      "action_bundle",
      "bloks_bundle_action",
    ]);
    if (!actionBundle) return "";

    const bloksData = safeJsonParse(actionBundle);
    return getStringAtPath(bloksData, ["layout", "bloks_payload", "action"]) ?? "";
  } catch (err) {
    console.log(`❌ Lỗi trích xuất action string: ${String(err)}`);
    return "";
  }
}

async function handle2Fa(actionString: string, twoFaSecret: string): Promise<LoginResult> {
  const twoFaContext = extractTwoFaContext(actionString);
  if (!twoFaContext) {
    return fail("Không thể trích xuất 2FA context");
  }

  console.log(`✅ Tìm thấy 2FA context: ${twoFaContext.slice(0, 50)}...`);
  const twoFaCode = generateTwoFactorCode(twoFaSecret);
  console.log(`🔐 Đã tạo mã 2FA: ${twoFaCode}`);

  if (!twoFaCode) {
    return fail("Không thể tạo mã 2FA");
  }

  console.log("🔄 Đang gọi 2FA entrypoint...");
  void call2FaEntrypoint(twoFaContext);

  console.log("🔄 Đang xác minh mã 2FA...");
  return await verify2FaCode(twoFaCode, twoFaContext);
}

function base32Decode(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = secret.replace(/\s+/g, "").toUpperCase();
  let bits = "";
  for (const char of cleaned) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTwoFactorCode(twoFaSecret: string): string {
  try {
    const key = base32Decode(twoFaSecret);
    const step = 30;
    const counter = Math.floor(Date.now() / 1000 / step);
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    buf.writeUInt32BE(counter % 0x100000000, 4);
    const hmac = crypto.createHmac("sha1", key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const codeInt =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return String(codeInt % 1_000_000).padStart(6, "0");
  } catch (err) {
    console.log(`❌ Lỗi tạo mã 2FA: ${String(err)}`);
    return "";
  }
}

function extractTwoFaContext(actionString: string): string {
  try {
    let bundle = actionString;
    for (let i = 0; i < 3; i++) {
      bundle = bundle.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    bundle = bundle.replace(/\\/g, "");

    const patterns: RegExp[] = [
      /"two_step_verification_context",\s*"([^"]+)"/gi,
      /"(ARG[A-Za-z0-9_\-+/=]{400,})"/gi,
      /two_step_verification_context.*?"([A-Za-z0-9_\-+/=]{400,})"/gi,
    ];

    for (const pattern of patterns) {
      const matches = bundle.matchAll(pattern);
      for (const match of matches) {
        const contextValue = match[1];
        if (contextValue && contextValue.length > 400 && (contextValue.startsWith("ARG") || contextValue.length > 600)) {
          return contextValue;
        }
      }
    }
    return "";
  } catch (err) {
    console.log(`❌ Lỗi trích xuất 2FA context: ${String(err)}`);
    return "";
  }
}

async function call2FaEntrypoint(twoFaContext: string): Promise<void> {
  const deviceId = crypto.randomUUID();
  const machineId = "QkQjaaPYXqr7elYbhXm9k25K";
  const familyDeviceId = "0b0dce82-584e-47f0-85fe-d33102ca196f";
  const bloksVersion = "8529dbd160b6773bacafe4db8da1b3e4f3f7f6a46325fdcc55ea121fcedbca99";
  const stylesId = "f120dca679661913f8c3201dfabaad01";
  const clientTraceId = "16b42b46-dcfd-4496-b3e9-be71ec6c9ba0";
  const connUuidClient = "cef8a06e8d4b971ba69591533f41efba";
  const zeroEh = "664c0faaac849cb891d0a261fbb72a12";
  const deviceIdHeader = familyDeviceId;

  const payload = {
    params: {
      params: JSON.stringify({
        client_input_params: {
          device_id: deviceId,
          is_whatsapp_installed: 0,
          machine_id: machineId,
        },
        server_params: {
          family_device_id: familyDeviceId,
          device_id: deviceId,
          two_step_verification_context: twoFaContext,
          INTERNAL_INFRA_screen_id: "ohwd4r:3",
          machine_id: machineId,
          flow_source: "two_factor_login",
        },
      }),
      bloks_versioning_id: bloksVersion,
      is_on_load_actions_supported: true,
      app_id: "com.bloks.www.two_step_verification.entrypoint",
    },
    scale: "3",
    nt_context: {
      using_white_navbar: true,
      styles_id: stylesId,
      pixel_ratio: 3,
      is_push_on: true,
      debug_tooling_metadata_token: null as null,
      is_flipper_enabled: false,
      theme_params: [{ value: [], design_system_name: "FDS" }],
      bloks_version: bloksVersion,
    },
  };

  const headers: Record<string, string> = {
    "User-Agent":
      "Dalvik/2.1.0 (Linux; U; Android 9; 23113RKC6C Build/PQ3A.190605.06171036) [FBAN/Orca-Android;FBAV/535.0.0.89.107;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/835027694;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBDV/23113RKC6C;FBSV/9;FBCA/x86_64:arm64-v8a;FBDM/{density=3.0,width=1080,height=1920};FB_FW/1;]",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/x-www-form-urlencoded",
    "x-fb-request-analytics-tags":
      '{"network_tags":{"product":"256002347743983","request_category":"graphql","purpose":"fetch","retry_attempt":"0"},"application_tags":"graphservice"}',
    "x-fb-rmd": "state=URL_ELIGIBLE",
    "x-zero-eh": zeroEh,
    "x-fb-friendly-name": "FbBloksAppRootQuery-com.bloks.www.two_step_verification.entrypoint",
    "x-zero-f-device-id": deviceIdHeader,
    "x-fb-integrity-machine-id": machineId,
    "x-graphql-request-purpose": "fetch",
    "x-tigon-is-retry": "False",
    "x-graphql-client-library": "graphservice",
    "x-fb-net-hni": "45201",
    "x-fb-sim-hni": "45201",
    authorization: "OAuth 256002347743983|374e60f8b9bb6b8cbb30f78030438895",
    "x-zero-state": "unknown",
    "app-scope-id-header": "86b2535b-8fc5-4b84-9476-112a5a8c4e72",
    "x-fb-connection-type": "WIFI",
    priority: "u=2",
    "x-fb-network-properties": "Wifi;Validated;",
    "x-fb-http-engine": "Tigon/Liger",
    "x-fb-client-ip": "True",
    "x-fb-server-cluster": "True",
    "x-fb-conn-uuid-client": connUuidClient,
    Host: "b-graph.facebook.com",
  };

  const requestParams = new URLSearchParams({
    method: "post",
    pretty: "false",
    format: "json",
    server_timestamps: "true",
    locale: "vi_VN",
    purpose: "fetch",
    fb_api_req_friendly_name: "FbBloksAppRootQuery-com.bloks.www.two_step_verification.entrypoint",
    fb_api_caller_class: "graphservice",
    client_doc_id: "1053734612728726099723365008",
    fb_api_client_context: JSON.stringify({ is_background: false }),
    variables: JSON.stringify(payload),
    fb_api_analytics_tags: '["surfaces.fb.GraphServiceEmitter","GraphServices"]',
    client_trace_id: clientTraceId,
  });

  try {
    const resp = await fetch("https://b-graph.facebook.com/graphql", {
      ...FETCH_OPTS,
      headers,
      body: requestParams,
    });
    if (resp.status !== 200) {
      console.log(`❌ Lỗi 2FA entrypoint: ${resp.status}`);
    }
  } catch (err) {
    console.log(`❌ Lỗi gửi yêu cầu 2FA entrypoint: ${String(err)}`);
  }
}

async function verify2FaCode(twoFaCode: string, twoFaContext: string): Promise<LoginResult> {
  const deviceId = crypto.randomUUID();
  const machineId = "QkQjaaPYXqr7elYbhXm9k25K";
  const familyDeviceId = "0b0dce82-584e-47f0-85fe-d33102ca196f";
  const bloksVersion = "8529dbd160b6773bacafe4db8da1b3e4f3f7f6a46325fdcc55ea121fcedbca99";
  const clientTraceId = "f4b39a4f-0faf-419d-8d4f-3dfb5a4106ce";
  const connUuidClient = "734f4760341a45e3cc14e07719fb4292";
  const zeroEh = "664c0faaac849cb891d0a261fbb72a12";
  const deviceIdHeader = familyDeviceId;

  const payload = {
    params: {
      params: JSON.stringify({
        client_input_params: {
          auth_secure_device_id: "",
          block_store_machine_id: "",
          code: twoFaCode,
          should_trust_device: 1,
          family_device_id: familyDeviceId,
          device_id: deviceId,
          cloud_trust_token: null as null,
          network_bssid: null as null,
          machine_id: machineId,
        },
        server_params: {
          INTERNAL__latency_qpl_marker_id: 36707139,
          block_store_machine_id: null as null,
          device_id: null as null,
          spectra_reg_login_data: null as null,
          cloud_trust_token: null as null,
          challenge: "totp",
          machine_id: null as null,
          INTERNAL__latency_qpl_instance_id: 1.48162242000192e14,
          two_step_verification_context: twoFaContext,
          flow_source: "two_factor_login",
        },
      }),
      bloks_versioning_id: bloksVersion,
      app_id: "com.bloks.www.two_step_verification.verify_code.async",
    },
    scale: "3",
    nt_context: {
      is_flipper_enabled: false,
      theme_params: [{ value: [], design_system_name: "FDS" }],
      debug_tooling_metadata_token: null as null,
    },
  };

  const headers: Record<string, string> = {
    "User-Agent":
      "Dalvik/2.1.0 (Linux; U; Android 9; 23113RKC6C Build/PQ3A.190605.06171036) [FBAN/Orca-Android;FBAV/535.0.0.89.107;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/835027694;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBDV/23113RKC6C;FBSV/9;FBCA/x86_64:arm64-v8a;FBDM/{density=3.0,width=1080,height=1920};FB_FW/1;]",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/x-www-form-urlencoded",
    "x-fb-request-analytics-tags":
      '{"network_tags":{"product":"256002347743983","request_category":"graphql","purpose":"none","retry_attempt":"0"},"application_tags":"graphservice"}',
    "x-fb-rmd": "state=URL_ELIGIBLE",
    "x-fb-friendly-name": "FbBloksActionRootQuery-com.bloks.www.two_step_verification.verify_code.async",
    "x-zero-f-device-id": deviceIdHeader,
    "x-fb-integrity-machine-id": machineId,
    "x-graphql-client-library": "graphservice",
    "x-zero-eh": zeroEh,
    "x-fb-net-hni": "45201",
    "x-fb-sim-hni": "45201",
    authorization: "OAuth 256002347743983|374e60f8b9bb6b8cbb30f78030438895",
    "x-zero-state": "unknown",
    "app-scope-id-header": "86b2535b-8fc5-4b84-9476-112a5a8c4e72",
    "x-fb-connection-type": "WIFI",
    priority: "u=3, i",
    "x-fb-network-properties": "Wifi;Validated;",
    "x-tigon-is-retry": "False",
    "x-fb-http-engine": "Tigon/Liger",
    "x-fb-client-ip": "True",
    "x-fb-server-cluster": "True",
    "x-fb-conn-uuid-client": connUuidClient,
    Host: "b-graph.facebook.com",
  };

  const requestParams = new URLSearchParams({
    method: "post",
    pretty: "false",
    format: "json",
    server_timestamps: "true",
    locale: "vi_VN",
    fb_api_req_friendly_name: "FbBloksActionRootQuery-com.bloks.www.two_step_verification.verify_code.async",
    fb_api_caller_class: "graphservice",
    client_doc_id: "11994080425969031306509088180",
    fb_api_client_context: JSON.stringify({ is_background: false }),
    variables: JSON.stringify(payload),
    fb_api_analytics_tags: '["GraphServices"]',
    client_trace_id: clientTraceId,
  });

  try {
    const resp = await fetch("https://b-graph.facebook.com/graphql", {
      ...FETCH_OPTS,
      headers,
      body: requestParams,
    });
    if (resp.status !== 200) {
      throw new Error(`Yêu cầu thất bại với trạng thái: ${resp.status}`);
    }

    const responseText = await resp.text();
    const sessionData = extractSessionData(responseText);
    const accessToken = sessionData.access_token;
    if (accessToken) {
      console.log("✅ Xác minh 2FA thành công!");
      return ok({
        access_token: accessToken,
        user_id: sessionData.uid ?? "",
        session_key: sessionData.session_key ?? "",
        machine_id: sessionData.machine_id ?? "",
        secret: sessionData.secret ?? "",
        cookies: sessionData.cookies ?? "",
        message: "Đăng nhập thành công với 2FA",
      });
    }
    return fail("Mã 2FA không đúng hoặc đã hết hạn");
  } catch (err) {
    console.log(`❌ Lỗi xác minh 2FA: ${String(err)}`);
    return fail(`Mã 2FA không đúng hoặc đã hết hạn: ${String(err)}`);
  }
}

function extractSessionData(responseText: string): SessionData {
  try {
    let bundle = extractBundleFromResponse(responseText);
    if (!bundle) bundle = responseText;

    for (let i = 0; i < 3; i++) {
      bundle = bundle.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    bundle = bundle.replace(/\\/g, "");

    const patterns: Record<Exclude<keyof SessionData, "cookies">, RegExp> = {
      access_token: /"access_token"\s*:\s*"([^"]+)"/i,
      session_key: /"session_key"\s*:\s*"([^"]+)"/i,
      uid: /"uid"\s*:\s*["]?(\d+)["]?/i,
      machine_id: /"machine_id"\s*:\s*"([^"]+)"/i,
      secret: /"secret"\s*:\s*"([a-f0-9]{32})"/i,
    };
    const sessionCookiesPattern = /"session_cookies"\s*:\s*\[([^\]]+)\]/i;
    const validCookies = new Set(["c_user", "xs", "fr", "datr", "sb"]);

    const result: SessionData = {};

    for (const [key, pattern] of Object.entries(patterns) as Array<[keyof typeof patterns, RegExp]>) {
      const match = bundle.match(pattern);
      if (match) {
        const value = match[1].trim();
        if (value && value.length > 3) {
          result[key] = value;
          console.log(`✅ Trích xuất ${key}: ${value.slice(0, 30)}...`);
        }
      }
    }

    const cookieMatch = bundle.match(sessionCookiesPattern);
    const cookies: string[] = [];
    if (cookieMatch) {
      const cookiesText = cookieMatch[1];
      const cookiePattern = /\{[^}]*"name"\s*:\s*"([^"]+)"[^}]*"value"\s*:\s*"([^"]+)"[^}]*}/gi;
      for (const match of cookiesText.matchAll(cookiePattern)) {
        const name = match[1];
        const value = match[2];
        if (validCookies.has(name) && value) {
          cookies.push(`${name}=${value}`);
        }
      }
    }
    result.cookies = cookies.length ? cookies.join("; ") : "";
    if (result.cookies) {
      console.log(`✅ Trích xuất cookies: ${result.cookies.slice(0, 50)}...`);
    }
    return result;
  } catch (err) {
    console.log(`❌ Lỗi trích xuất session data: ${String(err)}`);
    return {};
  }
}

function extractBundleFromResponse(responseText: string): string {
  try {
    const data = safeJsonParse(responseText);
    const actionBundle = getStringAtPath(data, [
      "data",
      "fb_bloks_action",
      "root_action",
      "action",
      "action_bundle",
      "bloks_bundle_action",
    ]);
    if (!actionBundle) return "";

    if (process.env.DEBUG_MESSENGER_APP === "1") {
      debugWriteFile("data.json", JSON.stringify(data, null, 2));
    }
    return actionBundle;
  } catch (err) {
    console.log(`❌ Lỗi trích xuất bundle: ${String(err)}`);
    return "";
  }
}

function parseSuccessfulLogin(actionString: string): LoginResult {
  try {
    const sessionData = extractSessionData(actionString);
    if (sessionData.access_token) {
      console.log("✅ Phân tích đăng nhập thành công!");
      return ok({
        access_token: sessionData.access_token ?? "",
        cookies: sessionData.cookies ?? "",
        message: "Đăng nhập thành công",
        user_id: sessionData.uid ?? "",
        session_key: sessionData.session_key ?? "",
        machine_id: sessionData.machine_id ?? "",
        secret: sessionData.secret ?? "",
      });
    }
    return fail("Không thể trích xuất dữ liệu session");
  } catch (err) {
    console.log(`❌ Lỗi ParseSuccessfulLogin: ${String(err)}`);
    return fail(`Lỗi phân tích đăng nhập thành công: ${String(err)}`);
  }
}

async function main(): Promise<void> {
  console.log("🚀 Ứng dụng Đăng nhập Facebook Console (Node.js ESM)");
  console.log("======================================");

  const USERNAME = process.env.MESSENGER_USERNAME ?? "";
  const PASSWORD = process.env.MESSENGER_PASSWORD ?? "";
  const TWO_FA_SECRET = process.env.MESSENGER_2FA_SECRET ?? "";

  if (!USERNAME || !PASSWORD) {
    console.log("❌ Thiếu biến môi trường. Cần set: MESSENGER_USERNAME, MESSENGER_PASSWORD (và MESSENGER_2FA_SECRET nếu có).");
    process.exitCode = 1;
    return;
  }

  const result = await login(USERNAME, PASSWORD, TWO_FA_SECRET);

  console.log("\n📊 KẾT QUẢ ĐĂNG NHẬP:");
  console.log("====================");
  console.log(`✅ Trạng thái: ${result.success ? "THÀNH CÔNG" : "THẤT BẠI"}`);
  console.log(`📝 Thông báo: ${result.message}`);

  if (result.success) {
    console.log(`🆔 ID: ${result.user_id}`);
    console.log(`🎯 Access Token: ${result.access_token}`);
    console.log(`🍪 Cookies: ${result.cookies}`);
  }

  console.log("\n⏹️ Nhấn phím bất kỳ để thoát...");
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", () => process.exit(0));
}

const isDirectRun = (() => {
  const argvPath = process.argv[1];
  if (!argvPath) return false;
  const thisFile = fileURLToPath(import.meta.url);
  return path.resolve(argvPath) === path.resolve(thisFile);
})();

if (isDirectRun) {
  void main();
}
