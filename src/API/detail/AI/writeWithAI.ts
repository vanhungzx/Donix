import axios from "axios";
import { URLSearchParams } from "url";
import { v4 as uuidv4 } from "uuid";
import { getConfig } from "../../../core/configManager";

interface WriteWithAIResponse {
  role: string;
  content: string;
}

interface WriteWithAIResult {
  role: string;
  content: string;
  response_id: string;
}

interface WriteWithAIMeta {
  response_id?: string;
  error?: unknown;
}

interface WriteWithAIGraphResponse {
  data?: {
    xfb_genai_platform_agent_sync_chat?: {
      response?: WriteWithAIResponse;
      response_metadata?: WriteWithAIMeta;
    };
  };
}

type WriteWithAICallback = (err: Error | null, result?: WriteWithAIResult) => void;

const getAccessTokenFromConfig = (preferredKey: string = "EAAD"): string => {
  const cfg = getConfig();
  const tokenObj = cfg?.token || {};
  const tokenFromPreferred = tokenObj[preferredKey];
  const fallbackToken = tokenObj.EAAAAU || Object.values(tokenObj)[0];
  const token = tokenFromPreferred || fallbackToken;
  if (!token) {
    throw new Error("Không tìm thấy accessToken trong config");
  }
  return token;
};

export async function writeWithAIOnce(prompt: string): Promise<WriteWithAIResult> {
  const locale = "vi_VN";
  const token = getAccessTokenFromConfig("EAAD");

  const threadSessionId = uuidv4();
  const referrerSessionId = uuidv4();
  const clientTraceId = uuidv4();

  const variables = {
    metagen_key: "mg-api-43266b52ca01",
    agent_id: "867051314767696",
    prompt: {
      role: "USER",
      content: prompt
    },
    runtime_params: {
      log_data: {
        thread_session_id: threadSessionId,
        referrer_session_id: referrerSessionId
      },
      entrypoint: "MSGR__THREAD__WRITE_WITH_AI"
    },
    plugin_request_options: {
      write_with_ai: {
        should_use_new_prompt: false,
        modifier_type: null as string | null,
        custom_modifier: "tieng anh"
      }
    }
  };

  const body = new URLSearchParams();
  body.set("method", "post");
  body.set("pretty", "false");
  body.set("format", "json");
  body.set("server_timestamps", "true");
  body.set("locale", locale);
  body.set("fb_api_req_friendly_name", "MSGRWriteWithAiQuery");
  body.set("fb_api_caller_class", "graphservice");
  body.set("client_doc_id", "396986502617907762168881975529");
  body.set("fb_api_client_context", JSON.stringify({ is_background: false }));
  body.set("variables", JSON.stringify(variables));
  body.set("fb_api_analytics_tags", JSON.stringify(["GraphServices"]));
  body.set("client_trace_id", clientTraceId);
  const bodyString = body.toString();

  const { data: json } = await axios.post<WriteWithAIGraphResponse>(
    "https://graph.facebook.com/graphql",
    bodyString,
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Dalvik/2.1.0 (Linux; U; Android 9; 23113RKC6C Build/PQ3A.190605.06171036) [FBAN/Orca-Android;FBAV/536.0.0.46.216;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/840054738;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBDV/23113RKC6C;FBSV/9;FBCA/x86_64:arm64-v8a;FBDM/{density=3.0,width=1080,height=1920};FB_FW/1;]",
        "Accept-Encoding": "gzip, deflate",
        "x-fb-request-analytics-tags":
          '{"network_tags":{"product":"256002347743983","request_category":"graphql","purpose":"none","retry_attempt":"0"},"application_tags":"graphservice"}',
        "x-fb-rmd": "state=URL_ELIGIBLE",
        "x-fb-friendly-name": "MSGRWriteWithAiQuery",
        "x-zero-f-device-id": "0b0dce82-584e-47f0-85fe-d33102ca196f",
        "x-graphql-client-library": "graphservice",
        "x-zero-eh": "664c0faaac849cb891d0a261fbb72a12",
        "x-fb-net-hni": "45201",
        "x-fb-sim-hni": "45201",
        "app-scope-id-header": "86b2535b-8fc5-4b84-9476-112a5a8c4e72",
        "x-fb-connection-type": "WIFI",
        authorization: `OAuth ${token}`,
        priority: "u=3, i",
        "x-fb-network-properties": "Wifi;Validated;",
        "x-tigon-is-retry": "False",
        "x-fb-http-engine": "Tigon/Liger",
        "x-fb-client-ip": "True",
        "x-fb-server-cluster": "True",
        "x-fb-conn-uuid-client": "bf3e7178d67b09d13834a9b3665d3d60"
      },
      decompress: true,
      responseType: "json"
    }
  );

  const data = json.data?.xfb_genai_platform_agent_sync_chat;

  if (!data?.response) {
    throw new Error("WriteWithAI API failed: " + JSON.stringify(json, null, 2));
  }

  const meta = data.response_metadata;

  return {
    role: data.response.role,
    content: data.response.content,
    response_id: meta?.response_id || ""
  };
}

export default function (): (
  prompt: string,
  callback?: WriteWithAICallback
) => Promise<WriteWithAIResult | undefined> {
  return async function writeWithAI(
    prompt: string,
    callback?: WriteWithAICallback
  ): Promise<WriteWithAIResult | undefined> {
    try {
      const result = await writeWithAIOnce(prompt);
      if (callback) callback(null, result);
      return result;
    } catch (err) {
      if (callback) {
        callback(err as Error);
        return undefined;
      }
      throw err;
    }
  };
}
