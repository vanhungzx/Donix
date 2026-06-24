import axios from "axios";
import { URLSearchParams } from "url";
import { v4 as uuidv4 } from "uuid";
import { getConfig } from "../../../core/configManager";

interface ImagineResult {
  uri: string;
  response_id: string;
  image_id: string;
  request_id: string;
  media_type: string;
  imagine_type: string;
  prompt: string;
  source_prompt: string;
}

type ImagineCallback = (err: Error | null, result?: ImagineResult) => void;

interface ImagineSuggestion {
  prompt_id: string | null;
  prompt: string;
  short_prompt: string | null;
  media_type: string | null;
  image_uri: string | null;
}

interface ImagineGenerateResponse {
  data?: {
    xfb_genai_imagine_for_intents?: {
      success?: boolean;
      response?: Array<{
        imagine_result_success?: ImagineResult;
      }>;
    };
  };
}

interface ImagineSuggestionItem {
  prompt_id?: string | null;
  prompt?: string;
  short_prompt?: string | null;
  media_type?: string | null;
  image_uri?: string | null;
}

interface ImagineSuggestionsResponse {
  data?: {
    xfb_genai_imagine_intents_landing_page_data?: {
      units?: Array<{
        __typename?: string;
        icebreakers?: ImagineSuggestionItem[];
      }>;
    };
  };
}

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

export async function imagineGenerate({
  prompt,
}: {
  prompt: string;
}): Promise<ImagineResult> {
  const locale = "vi_VN";
  const surfaceSessionId = uuidv4();
  const clientMutationId = uuidv4();
  const genAiEventId = uuidv4();
  const clientTraceId = uuidv4();

  const variables = {
    entrypoint_params: {
      surface_session_id: surfaceSessionId,
      surface: "INTENTS",
      sub_entrypoint: null
    },
    surface: "MESSENGER",
    params: {
      orientation: "SQUARE",
      prompt,
      blocked_intents: ["memu"],
      is_initial_request: true,
      intent: "imagine",
      client_mutation_id: clientMutationId
    },
    gen_ai_prompt_submission_event_id: genAiEventId
  };

  const body = new URLSearchParams();
  body.set("method", "post");
  body.set("pretty", "false");
  body.set("format", "json");
  body.set("server_timestamps", "true");
  body.set("locale", locale);
  body.set("fb_api_req_friendly_name", "GenAIImagineGenerateMutation");
  body.set("fb_api_caller_class", "graphservice");
  body.set("client_doc_id", "2741340084450506259555874190");
  body.set("fb_api_client_context", JSON.stringify({ is_background: false }));
  body.set("variables", JSON.stringify(variables));
  body.set("fb_api_analytics_tags", JSON.stringify(["GraphServices"]));
  body.set("client_trace_id", clientTraceId);
  const bodyString = body.toString();

  // Thử lần lượt nhiều access token trong config để tăng khả năng thành công
  const cfg = getConfig();
  const tokenObj = (cfg?.token || {}) as Record<string, string | undefined>;
  const allKeys = Object.keys(tokenObj).filter(k => !!tokenObj[k]);
  if (allKeys.length === 0) {
    throw new Error("Không tìm thấy accessToken trong config (token.EAAD / token.EAAAAU / token.EAAD6V7 ...)");
  }

  const preferredOrder = ["EAAD", "EAAD6V7", "EAAAAU"];
  const orderedKeys: string[] = [];
  const pushed = new Set<string>();
  for (const k of preferredOrder) {
    if (tokenObj[k] && !pushed.has(k)) {
      orderedKeys.push(k);
      pushed.add(k);
    }
  }
  for (const k of allKeys) {
    if (!pushed.has(k)) {
      orderedKeys.push(k);
      pushed.add(k);
    }
  }

  let lastError: unknown = null;
  let lastResponse: ImagineGenerateResponse | null = null;

  for (const key of orderedKeys) {
    const token = tokenObj[key];
    if (!token) continue;
    try {
      const { data: json } = await axios.post<ImagineGenerateResponse>(
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
            priority: "u=3, i",
            "x-fb-friendly-name": "GenAIImagineGenerateMutation",
            "x-zero-f-device-id": "0b0dce82-584e-47f0-85fe-d33102ca196f",
            "x-graphql-client-library": "graphservice",
            "x-zero-eh":
              "2,,AUqef4VGdZqt4ULqfRDDP1QpP71ByUAfpLRV04zexspdGzfzNsBdi_aNneElAW0yP9U",
            "x-fb-net-hni": "45201",
            "x-fb-sim-hni": "45201",
            "app-scope-id-header": "86b2535b-8fc5-4b84-9476-112a5a8c4e72",
            "x-fb-connection-type": "WIFI",
            authorization: `OAuth ${token}`,
            "x-tigon-is-retry": "False",
            "x-fb-http-engine": "Tigon/Liger",
            "x-fb-client-ip": "True",
            "x-fb-server-cluster": "True"
          },
          decompress: true,
          responseType: "json"
        }
      );

      lastResponse = json;

      if (!json?.data?.xfb_genai_imagine_for_intents?.success) {
        // Thử token khác nếu có
        lastError = new Error(
          `Imagine API failed with token ${key}: ` + JSON.stringify(json, null, 2)
        );
        continue;
      }

      const success =
        json.data.xfb_genai_imagine_for_intents.response?.[0]
          ?.imagine_result_success;

      if (!success) {
        lastError = new Error(
          `No imagine_result_success returned with token ${key}: ` +
          JSON.stringify(json, null, 2)
        );
        continue;
      }

      return {
        uri: success.uri,
        response_id: success.response_id,
        image_id: success.image_id,
        request_id: success.request_id,
        media_type: success.media_type,
        imagine_type: success.imagine_type,
        prompt: success.prompt,
        source_prompt: success.source_prompt
      };
    } catch (err) {
      lastError = err;
      // thử token khác
      continue;
    }
  }

  // Nếu đến đây là mọi token đều fail
  if (lastError) {
    throw new Error(
      `Imagine API failed for all tokens. Last error: ${String(
        (lastError as any)?.message || lastError
      )}${lastResponse ? " | Last response: " + JSON.stringify(lastResponse, null, 2) : ""}`
    );
  }

  throw new Error("Imagine API failed for all tokens (unknown error).");
}

export async function imagineSuggestions({
  accessToken,
  locale = "vi_VN"
}: {
  accessToken?: string;
  locale?: string;
}): Promise<ImagineSuggestion[]> {
  const token = accessToken || getAccessTokenFromConfig("EAAD");
  const surfaceSessionId = uuidv4();
  const clientTraceId = uuidv4();

  const variables = {
    surface: {
      surface_string_override: null,
      surface: "MESSENGER"
    },
    supported_unit_types: [
      "ICEBREAKER",
      "IMAGINE_SPOTLIGHT",
      "MEMU_SPOTLIGHT_NON_EDITABLE",
      "IMAGINE_USER_UPLOADED_IMAGE"
    ],
    num_icebreakers: 8,
    icebreaker_orientation: "SQUARE",
    entrypoint_params: {
      surface_session_id: surfaceSessionId,
      surface: "INTENTS"
    },
    icebreaker_intent_filter: "IMAGINE",
    wa_user_is_memu_eligible: false
  };

  const body = new URLSearchParams();
  body.set("method", "post");
  body.set("pretty", "false");
  body.set("format", "json");
  body.set("server_timestamps", "true");
  body.set("locale", locale);
  body.set("fb_api_req_friendly_name", "GenAIImagineSuggestionsQuery");
  body.set("fb_api_caller_class", "graphservice");
  body.set("client_doc_id", "7859683619114988588307227324");
  body.set("fb_api_client_context", JSON.stringify({ is_background: false }));
  body.set("variables", JSON.stringify(variables));
  body.set("fb_api_analytics_tags", JSON.stringify(["GraphServices"]));
  body.set("client_trace_id", clientTraceId);
  const bodyString = body.toString();

  const { data: json } = await axios.post<ImagineSuggestionsResponse>(
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
        priority: "u=3, i",
        "x-fb-friendly-name": "GenAIImagineSuggestionsQuery",
        "x-zero-f-device-id": "0b0dce82-584e-47f0-85fe-d33102ca196f",
        "x-graphql-client-library": "graphservice",
        "x-zero-eh":
          "2,,AUqef4VGdZqt4ULqfRDDP1QpP71ByUAfpLRV04zexspdGzfzNsBdi_aNneElAW0yP9U",
        "x-fb-net-hni": "45201",
        "x-fb-sim-hni": "45201",
        "app-scope-id-header": "86b2535b-8fc5-4b84-9476-112a5a8c4e72",
        "x-fb-connection-type": "WIFI",
        authorization: `OAuth ${token}`,
        "x-tigon-is-retry": "False",
        "x-fb-http-engine": "Tigon/Liger",
        "x-fb-client-ip": "True",
        "x-fb-server-cluster": "True"
      },
      decompress: true,
      responseType: "json"
    }
  );
  const units = json?.data?.xfb_genai_imagine_intents_landing_page_data?.units;

  if (!Array.isArray(units)) {
    throw new Error(
      "Imagine suggestions failed: " + JSON.stringify(json, null, 2)
    );
  }

  const icebreakerUnit =
    units.find((u) => u.__typename?.includes("Icebreaker")) ||
    units.find((u) => Array.isArray(u?.icebreakers));

  const icebreakers = icebreakerUnit?.icebreakers;

  if (!Array.isArray(icebreakers)) {
    throw new Error(
      "No icebreakers returned: " + JSON.stringify(json, null, 2)
    );
  }

  return icebreakers.map(
    (item): ImagineSuggestion => ({
      prompt_id: item.prompt_id ?? null,
      prompt: item.prompt ?? "",
      short_prompt: item.short_prompt ?? null,
      media_type: item.media_type ?? null,
      image_uri: item.image_uri ?? null
    })
  );
}

export default function (): (
  prompt: string,
  callback?: ImagineCallback
) => Promise<ImagineResult | undefined> {
  return async function imagine(
    prompt: string,
    callback?: ImagineCallback
  ): Promise<ImagineResult | undefined> {
    try {
      const result = await imagineGenerate({ prompt });
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
