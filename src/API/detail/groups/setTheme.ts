import axios, { AxiosResponse } from "axios";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getConfig } from "../../../core/configManager";
import { generateOfflineThreadingID } from "../../request/formatters";
import { parseAndCheckLogin } from "../../request/formatters/helpers";
type Callback = (err: Error | null, data?: unknown) => void;

interface Ctx {
  userID: string;
  jar: any;
  lsd?: string;
  access_token?: string;
  wsReqNumber: number;
  wsTaskNumber: number;
  options?: any;
  fb_dtsg?: string;
  mqttClient?: {
    publish: (
      topic: string,
      message: string,
      options: { qos: number; retain: boolean },
      callback?: (err?: Error) => void
    ) => void;
    on: (event: string, listener: (topic: string, message: Buffer) => void) => void;
    removeListener: (event: string, listener: (topic: string, message: Buffer) => void) => void;
  };
}

interface Theme {
  id: string;
  name: string;
}

export default function setThreadTheme(defaultFuncs: any, _api: any, ctx: Ctx) {
  const toError = (error: unknown): Error =>
    error instanceof Error ? error : new Error(String(error));

  const toThreadKey = (threadID: string): string | number => {
    const value = Number(threadID);
    return Number.isFinite(value) ? value : threadID;
  };

  const MAX_IMAGE_SIZE = 50 * 1024 * 1024;

  const isFacebookImageHost = (rawUrl: string): boolean => {
    try {
      const host = new URL(rawUrl).hostname.toLowerCase();
      return (
        host.includes("fbcdn.net") ||
        host.includes("scontent") ||
        host.endsWith("facebook.com") ||
        host.endsWith("messenger.com")
      );
    } catch {
      return false;
    }
  };

  const getCookieStringForUrl = (targetUrl: string): string => {
    if (!ctx?.jar || typeof ctx.jar.getCookieStringSync !== "function") return "";
    return (
      ctx.jar.getCookieStringSync(targetUrl) ||
      ctx.jar.getCookieStringSync("https://www.facebook.com/") ||
      ""
    );
  };

  const fetchImageBuffer = async (
    url: string,
    headers: Record<string, string> = {}
  ): Promise<Buffer> => {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: 60000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        ...headers,
      },
    });

    const contentLength = Number(response.headers?.["content-length"] || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_SIZE) {
      throw new Error(`Image too large: ${contentLength} bytes (max: ${MAX_IMAGE_SIZE} bytes)`);
    }

    const buffer = Buffer.from(response.data);
    if (!buffer.length) {
      throw new Error("Downloaded image is empty");
    }
    if (buffer.length > MAX_IMAGE_SIZE) {
      throw new Error(`Image too large: ${buffer.length} bytes (max: ${MAX_IMAGE_SIZE} bytes)`);
    }
    return buffer;
  };

  const downloadImageFromUrl = async (url: string): Promise<Buffer> => {
    try {
      return await fetchImageBuffer(url);
    } catch (error: unknown) {
      const normalized = toError(error);
      const status = (error as AxiosResponse | any)?.response?.status;
      const canRetryWithCookie =
        isFacebookImageHost(url) &&
        (status === 401 || status === 403 || status === 404 || status === 0 || status == null);

      if (!canRetryWithCookie) {
        throw new Error(`Failed to download image from URL: ${normalized.message}`);
      }

      const cookieString = getCookieStringForUrl(url);
      const fallbackHeaders: Record<string, string> = {
        Referer: "https://www.facebook.com/",
        Origin: "https://www.facebook.com",
      };
      if (cookieString) {
        fallbackHeaders.Cookie = cookieString;
      }

      try {
        return await fetchImageBuffer(url, fallbackHeaders);
      } catch (fallbackError: unknown) {
        const fallbackNormalized = toError(fallbackError);
        throw new Error(
          `Failed to download image from URL: ${normalized.message}; fallback with auth failed: ${fallbackNormalized.message}`
        );
      }
    }
  };

  const isUrl = (str: string): boolean => {
    if (typeof str !== "string") return false;

    const trimmed = str.trim();
    return trimmed.startsWith("http://") || trimmed.startsWith("https://");
  };

  const uploadImageToFacebook = async (imagePath: string | Buffer): Promise<string> => {
    let imageBuffer: Buffer;
    let filename: string;
    let fileSize: number;
    let mimeType: string = "image/jpeg";

    if (Buffer.isBuffer(imagePath)) {
      imageBuffer = imagePath;
      filename = "image.jpg";
      fileSize = imageBuffer.length;
    } else if (isUrl(imagePath)) {

      imageBuffer = await downloadImageFromUrl(imagePath);
      filename = "image.jpg";
      fileSize = imageBuffer.length;

      try {
        const urlObj = new URL(imagePath);
        const ext = path.extname(urlObj.pathname).toLowerCase();
        if (ext === ".png") mimeType = "image/png";
        else if (ext === ".gif") mimeType = "image/gif";
        else if (ext === ".webp") mimeType = "image/webp";
      } catch {

      }
    } else {

      if (!existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }
      imageBuffer = readFileSync(imagePath);
      filename = path.basename(imagePath);
      fileSize = imageBuffer.length;

      const ext = path.extname(filename).toLowerCase();
      if (ext === ".png") mimeType = "image/png";
      else if (ext === ".gif") mimeType = "image/gif";
      else if (ext === ".webp") mimeType = "image/webp";
    }

    const timestamp = Date.now();
    const hash = createHash("md5").update(imageBuffer).digest("hex");
    const entityName = `${hash}-0-${fileSize}-${timestamp}-${timestamp}`;
    const uploadUrl = `https://rupload.facebook.com/graphql_mutations/${entityName}`;

    const tokenCandidate = getConfig().token?.EAAD || ctx.access_token;
    const token = tokenCandidate && tokenCandidate !== "NONE" ? tokenCandidate : undefined;

    const deviceId = randomUUID();
    const appScopeId = randomUUID();
    const connUuid = randomUUID();

    const headers: Record<string, string> = {
      "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; 23113RKC6C Build/PQ3A.190605.06171036) [FBAN/Orca-Android;FBAV/534.0.0.53.103;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/827849709;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBDV/23113RKC6C;FBSV/9;FBCA/x86_64:arm64-v8a;FBDM/{density=3.0,width=1080,height=1920};FB_FW/1;]",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/octet-stream",
      "x-entity-length": String(fileSize),
      "x-zero-f-device-id": deviceId,
      "x-fb-friendly-name": "Resumable-Upload-Post",
      "x-entity-name": entityName,
      "offset": "0",
      "priority": "u=3, i",
      "x-entity-type": mimeType,
      "x-fb-rmd": "state=URL_ELIGIBLE",
      "x-fb-connection-quality": "EXCELLENT",
      "x-fb-net-hni": "45201",
      "x-fb-request-analytics-tags": JSON.stringify({
        network_tags: {
          product: "256002347743983",
          purpose: "none",
          retry_attempt: "0",
        },
        application_tags: "unknown",
      }),
      "x-fb-sim-hni": "45201",
      "x-zero-eh": "2,,",
      "app-scope-id-header": appScopeId,
      "x-fb-connection-type": "WIFI",
      "x-fb-network-properties": "Wifi;Validated;",
      "x-tigon-is-retry": "False",
      "x-fb-http-engine": "Tigon/Liger",
      "x-fb-client-ip": "True",
      "x-fb-server-cluster": "True",
      "x-fb-conn-uuid-client": connUuid,
    };

    if (token) {
      headers["authorization"] = `OAuth ${token}`;
    }

    try {
      const response = await axios.post(uploadUrl, imageBuffer, {
        headers,
        maxRedirects: 0,
        validateStatus: () => true,
        responseType: "text",
        timeout: 60000,
      });

      if (response.status !== 200) {
        throw new Error(`Upload failed with status ${response.status}: ${response.data}`);
      }

      let fileHandle: string;
      try {
        const jsonResponse = JSON.parse(response.data as string);
        fileHandle = jsonResponse.h || (response.data as string).trim();
      } catch {

        fileHandle = (response.data as string).trim();
      }

      if (!fileHandle || fileHandle.length === 0) {
        throw new Error("Failed to get file handle from upload response");
      }

      return fileHandle;
    } catch (error: unknown) {
      const normalized = toError(error);
      throw new Error(`Failed to upload image: ${normalized.message}`);
    }
  };

  const createCustomTheme = async (fileHandle: string, _threadID: string): Promise<string> => {

    const tokenCandidate = getConfig().token?.EAAD || ctx.access_token;
    const token = tokenCandidate && tokenCandidate !== "NONE" ? tokenCandidate : undefined;

    const deviceId = randomUUID();
    const appScopeId = randomUUID();
    const connUuid = randomUUID();

    const formData = new URLSearchParams({
      method: "post",
      pretty: "false",
      format: "json",
      server_timestamps: "true",
      locale: "vi_VN",
      fb_api_req_friendly_name: "MsgrCustomThemeUploadMutation",
      fb_api_caller_class: "graphservice",
      client_doc_id: "97643247711123026303479457667",
      fb_api_client_context: JSON.stringify({ is_background: false }),
      variables: JSON.stringify({
        input: {
          file_handle: fileHandle,
        },
      }),
      fb_api_analytics_tags: JSON.stringify(["GraphServices"]),
      client_trace_id: randomUUID(),
    });

    const headers: Record<string, string> = {
      "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; 23113RKC6C Build/PQ3A.190605.06171036) [FBAN/Orca-Android;FBAV/534.0.0.53.103;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/827849709;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBDV/23113RKC6C;FBSV/9;FBCA/x86_64:arm64-v8a;FBDM/{density=3.0,width=1080,height=1920};FB_FW/1;]",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/x-www-form-urlencoded",
      "x-fb-request-analytics-tags": JSON.stringify({
        network_tags: {
          product: "256002347743983",
          request_category: "graphql",
          purpose: "none",
          retry_attempt: "0",
        },
        application_tags: "graphservice",
      }),
      "x-fb-rmd": "state=URL_ELIGIBLE",
      "x-fb-friendly-name": "MsgrCustomThemeUploadMutation",
      "x-zero-f-device-id": deviceId,
      "x-graphql-client-library": "graphservice",
      "x-zero-eh": "2,,",
      "x-fb-net-hni": "45201",
      "x-fb-sim-hni": "45201",
      "app-scope-id-header": appScopeId,
      "x-fb-connection-type": "WIFI",
      "priority": "u=3, i",
      "x-fb-network-properties": "Wifi;Validated;",
      "x-tigon-is-retry": "False",
      "x-fb-http-engine": "Tigon/Liger",
      "x-fb-client-ip": "True",
      "x-fb-server-cluster": "True",
      "x-fb-conn-uuid-client": connUuid
    };

    if (token) {
      headers["authorization"] = `OAuth ${token}`;
    }

    try {
      const response = await axios.post("https://graph.facebook.com/graphql", formData.toString(), {
        headers,
        maxRedirects: 0,
        validateStatus: () => true,
        responseType: "json",
        timeout: 60000,
      });

      if (response.status !== 200) {
        throw new Error(`GraphQL request failed with status ${response.status}: ${JSON.stringify(response.data)}`);
      }

      const resData = response.data;

      if (resData.errors) {
        throw new Error(JSON.stringify(resData.errors));
      }

      if (!resData.data?.xfb_msgr_custom_themes?.success) {
        throw new Error(
          resData.data?.xfb_msgr_custom_themes?.error_message ||
          "Failed to create custom theme"
        );
      }

      const themeId = resData.data.xfb_msgr_custom_themes.theme?.id;
      if (!themeId) {
        throw new Error("Theme ID not found in response");
      }

      return themeId;
    } catch (err: unknown) {
      const normalized = toError(err);
      throw new Error(`Failed to create custom theme: ${normalized.message}`);
    }
  };

  const fetchThemes = async (threadID: string): Promise<Theme[]> => {
    const form = {
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "MWPThreadThemeQuery_AllThemesQuery",
      variables: JSON.stringify({ version: "default" }),
      server_timestamps: true,
      doc_id: "24474714052117636",
    };
    try {
      const resData = await defaultFuncs
        .post("https://www.facebook.com/api/graphql/", ctx.jar, form, null, {
          "x-fb-friendly-name": "MWPThreadThemeQuery_AllThemesQuery",
          "x-fb-lsd": ctx.lsd || "",
          referer: `https://www.facebook.com/messages/t/${threadID}`,
        })
        .then(parseAndCheckLogin(ctx, defaultFuncs));
      if (resData.errors) throw new Error(JSON.stringify(resData.errors));
      if (!resData.data?.messenger_thread_themes) {
        throw new Error("Could not retrieve thread themes from response.");
      }
      return resData.data.messenger_thread_themes
        .filter((theme: any) => theme && theme.id)
        .map((theme: any) => ({
          id: theme.id as string,
          name: theme.accessibility_label as string,
        }));
    } catch (err: unknown) {
      const normalized = toError(err);
      throw new Error(`Failed to fetch theme list: ${normalized.message}`);
    }
  };

  const getRandomTheme = async (threadID: string): Promise<Theme> => {
    const themes = await fetchThemes(threadID);
    if (themes.length === 0) {
      throw new Error("No themes available");
    }
    return themes[Math.floor(Math.random() * themes.length)];
  };

  const setThemeFunc = function setTheme(
    color: string,
    threadID: string,
    callback?: Callback
  ): Promise<unknown> {
    return new Promise<unknown>(async (resolve, reject) => {
      const settle = (err: Error | null, data?: unknown): void => {
        if (err) {
          callback?.(err);
          reject(err);
          return;
        }
        callback?.(null, data);
        resolve(data ?? { success: true });
      };

      if (!ctx.mqttClient) {
        settle(new Error("Not connected to MQTT"));
        return;
      }

      let themeColor = color;
      if (themeColor === "random") {
        try {
          const randomTheme = await getRandomTheme(threadID);
          themeColor = randomTheme.id;
        } catch (err: unknown) {
          settle(toError(err));
          return;
        }
      }

      const reqID = ++ctx.wsReqNumber;
      const content = {
        app_id: "2220391788200892",
        payload: JSON.stringify({
          data_trace_id: null,
          epoch_id: parseInt(generateOfflineThreadingID(), 10),
          tasks: [
            {
              failure_count: null,
              label: "43",
              payload: JSON.stringify({
                thread_key: toThreadKey(threadID),
                theme_fbid: themeColor,
                source: null,
                sync_group: 1,
                payload: null,
              }),
              queue_name: "thread_theme",
              task_id: ++ctx.wsTaskNumber,
            },
          ],
          version_id: "8798795233522156",
        }),
        request_id: reqID,
        type: 3,
      };

      let settled = false;
      const safeSettle = (err: Error | null, data?: unknown): void => {
        if (settled) return;
        settled = true;
        settle(err, data);
      };

      const cleanup = (): void => {
        clearTimeout(timeout);
        ctx.mqttClient?.removeListener("message", handleRes);
      };

      const handleRes = (topic: string, message: Buffer): void => {
        if (topic !== "/ls_resp") return;
        let jsonMsg: any;
        try {
          jsonMsg = JSON.parse(message.toString());
          jsonMsg.payload = JSON.parse(jsonMsg.payload);
        } catch {
          return;
        }

        if (jsonMsg.request_id !== reqID) return;
        cleanup();

        try {
          const msgID = jsonMsg.payload.step[1][2][2][1][2];
          const msgReplace = jsonMsg.payload.step[1][2][2][1][4];
          safeSettle(null, {
            body: msgReplace,
            messageID: msgID,
          });
        } catch {
          safeSettle(null, { success: true });
        }
      };

      const timeout = setTimeout(() => {
        cleanup();
        safeSettle(new Error("setTheme timed out waiting for /ls_resp"));
      }, 30_000);

      ctx.mqttClient.on("message", handleRes);
      ctx.mqttClient.publish(
        "/ls_req",
        JSON.stringify(content),
        { qos: 1, retain: false },
        (err?: Error) => {
          if (!err) return;
          cleanup();
          safeSettle(err);
        }
      );
    });
  };

  const setThemeFromImageFunc = async function setThemeFromImage(
    imagePath: string | Buffer,
    threadID: string,
    callback?: Callback
  ): Promise<unknown> {
    return new Promise<unknown>(async (resolve, reject) => {
      const settle = (err: Error | null, data?: unknown): void => {
        if (err) {
          callback?.(err);
          reject(err);
          return;
        }
        callback?.(null, data);
        resolve(data ?? { success: true });
      };

      try {
        const fileHandle = await uploadImageToFacebook(imagePath);
        const themeId = await createCustomTheme(fileHandle, threadID);
        const result = await setThemeFunc(themeId, threadID);
        settle(null, result);
      } catch (err: unknown) {
        settle(toError(err));
      }
    });
  };

  const result = setThemeFunc as typeof setThemeFunc & {
    setThemeFromImage: typeof setThemeFromImageFunc;
  };
  result.setThemeFromImage = setThemeFromImageFunc;
  return result;
}
