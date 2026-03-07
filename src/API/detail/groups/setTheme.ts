import axios, { AxiosResponse } from "axios";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getConfig } from "../../../core/configManager";
import { generateOfflineThreadingID } from "../../request/formatters";
import { parseAndCheckLogin } from "../../request/formatters/helpers";
type Callback = (err: any, data?: any) => void;

interface Ctx {
  userID: string;
  jar: any;
  lsd: string;
  wsReqNumber: number;
  wsTaskNumber: number;
  options?: any;
  fb_dtsg?: string;
  mqttClient: {
    publish: (topic: string, message: string, options: { qos: number; retain: boolean }) => void;
    on: (event: string, listener: (topic: string, message: Buffer) => void) => void;
    removeListener: (event: string, listener: (topic: string, message: Buffer) => void) => void;
  };
}

interface Theme {
  id: string;
  name: string;
}

export default function setThreadTheme(defaultFuncs: any, _api: any, ctx: Ctx) {

  const downloadImageFromUrl = async (url: string): Promise<Buffer> => {
    try {
      const response: AxiosResponse = await axios({
        method: "GET",
        url,
        responseType: "stream",
        timeout: 60000,
        maxRedirects: 5,
      });

      const chunks: Buffer[] = [];
      const MAX_SIZE = 50 * 1024 * 1024;
      let totalSize = 0;

      return new Promise((resolve, reject) => {
        response.data.on("data", (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > MAX_SIZE) {
            response.data.destroy();
            reject(new Error(`Image too large: ${totalSize} bytes (max: ${MAX_SIZE} bytes)`));
            return;
          }
          chunks.push(chunk);
        });

        response.data.on("end", () => {
          const buffer = Buffer.concat(chunks);
          resolve(buffer);
        });

        response.data.on("error", (error: Error) => {
          reject(new Error(`Failed to download image: ${error.message}`));
        });
      });
    } catch (error: any) {
      throw new Error(`Failed to download image from URL: ${error.message || error}`);
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

    const token = getConfig().token?.EAAD;

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
        fileHandle = jsonResponse.h;
      } catch {

        fileHandle = (response.data as string).trim();
      }

      if (!fileHandle || fileHandle.length === 0) {
        throw new Error("Failed to get file handle from upload response");
      }

      return fileHandle;
    } catch (error: any) {
      throw new Error(`Failed to upload image: ${error.message || error}`);
    }
  };

  const createCustomTheme = async (fileHandle: string, _threadID: string): Promise<string> => {

    const token = getConfig().token?.EAAD;

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
    } catch (err: any) {
      throw new Error(`Failed to create custom theme: ${err.message || err}`);
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
          "x-fb-lsd": ctx.lsd,
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
    } catch (err: any) {
      throw new Error(`Failed to fetch theme list: ${err.message || err}`);
    }
  };

  const getRandomTheme = async (threadID: string): Promise<Theme> => {
    const themes = await fetchThemes(threadID);
    return themes[Math.floor(Math.random() * themes.length)];
  };

  const setThemeFunc = async function setTheme(
    color: string,
    threadID: string,
    callback?: Callback
  ): Promise<any> {
    let reqID = ++ctx.wsReqNumber;
    let resolveFunc: (value: any) => void = () => { };
    let rejectFunc: (reason?: any) => void = () => { };
    const returnPromise = new Promise<any>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = (err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };
    }

    if (color === "random") {
      try {
        const randomTheme = await getRandomTheme(threadID);
        color = randomTheme.id;
      } catch (err) {
        return callback(err);
      }
    }

    const content = {
      app_id: "2220391788200892",
      payload: JSON.stringify({
        data_trace_id: null,
        epoch_id: parseInt(generateOfflineThreadingID()),
        tasks: [
          {
            failure_count: null,
            label: "43",
            payload: JSON.stringify({
              thread_key: threadID,
              theme_fbid: color,
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

    ctx.mqttClient.publish("/ls_req", JSON.stringify(content), {
      qos: 1,
      retain: false,
    });

    const handleRes = (topic: string, message: Buffer) => {
      if (topic !== "/ls_resp") return;
      let jsonMsg: any;
      try {
        jsonMsg = JSON.parse(message.toString());
        jsonMsg.payload = JSON.parse(jsonMsg.payload);
      } catch {
        return;
      }
      if (jsonMsg.request_id !== reqID) return;
      ctx.mqttClient.removeListener("message", handleRes);
      try {
        const msgID = jsonMsg.payload.step[1][2][2][1][2];
        const msgReplace = jsonMsg.payload.step[1][2][2][1][4];
        const bodies = {
          body: msgReplace,
          messageID: msgID,
        };
        return callback && callback(null, bodies);
      } catch {
        return callback && callback(null, { success: true });
      }
    };

    ctx.mqttClient.on("message", handleRes);
    return returnPromise;
  };

  const setThemeFromImageFunc = async function setThemeFromImage(
    imagePath: string | Buffer,
    threadID: string,
    callback?: Callback
  ): Promise<any> {
    let resolveFunc: (value: any) => void = () => { };
    let rejectFunc: (reason?: any) => void = () => { };
    const returnPromise = new Promise<any>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = (err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };
    }

    try {

      const fileHandle = await uploadImageToFacebook(imagePath);

      const themeId = await createCustomTheme(fileHandle, threadID);

      const result = await setThemeFunc(themeId, threadID, callback);
      return result || returnPromise;
    } catch (err: any) {
      return callback(err);
    }
  };

  const result = setThemeFunc as any;
  result.setThemeFromImage = setThemeFromImageFunc;
  return result;
}
