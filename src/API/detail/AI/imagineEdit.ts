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

type ImagineEditCallback = (err: Error | null, result?: ImagineResult) => void;

interface ImagineEditResponse {
  data?: {
    xfb_genai_imagine_edit_for_intents?: {
      success?: boolean;
      response?: Array<{
        imagine_result_success?: ImagineResult;
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

export async function imagineEditOnce(params: {
  previousImageId: string;
  prompt: string;
}): Promise<ImagineResult> {
  const { previousImageId, prompt } = params;
  const locale = "vi_VN";
  const token = getAccessTokenFromConfig("EAAD");
  const surfaceSessionId = uuidv4();
  const clientMutationId = uuidv4();
  const clientTraceId = uuidv4();

  const variables = {
    params: {
      server_thread_key: null,
      prompt,
      previous_media_id_source: "USER_UPLOADED_IMG_MSG",
      previous_image_id: previousImageId,
      client_mutation_id: clientMutationId
    },
    entrypoint_params: {
      surface_session_id: surfaceSessionId,
      surface: "CANVAS"
    },
    surface: "MESSENGER"
  };

  const body = new URLSearchParams();
  body.set("method", "post");
  body.set("pretty", "false");
  body.set("format", "json");
  body.set("server_timestamps", "true");
  body.set("locale", locale);
  body.set("fb_api_req_friendly_name", "GenAIImagineEditMutation");
  body.set("fb_api_caller_class", "graphservice");
  body.set("client_doc_id", "336715552318424815603806017347");
  body.set("fb_api_client_context", JSON.stringify({ is_background: false }));
  body.set("variables", JSON.stringify(variables));
  body.set("fb_api_analytics_tags", JSON.stringify(["GraphServices"]));
  body.set("client_trace_id", clientTraceId);
  const bodyString = body.toString();

  const { data: json } = await axios.post<ImagineEditResponse>(
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
        "x-fb-friendly-name": "GenAIImagineEditMutation",
        "x-zero-f-device-id": "0b0dce82-584e-47f0-85fe-d33102ca196f",
        "x-graphql-client-library": "graphservice",
        "x-zero-eh":
          "2,,AUqef4VGdZqt4ULqfRDDP1QpP71ByUAfpLRV04zexspdGzfzNsBdi_aNneElAW0yP9U",
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
        "x-fb-conn-uuid-client": "cb55b6ab81fa02de786e5074dd67ea83"
      },
      decompress: true,
      responseType: "json"
    }
  );

  const editData = json.data?.xfb_genai_imagine_edit_for_intents;

  if (!editData?.success) {
    throw new Error("Imagine edit API failed: " + JSON.stringify(json, null, 2));
  }

  const success = editData.response?.[0]?.imagine_result_success;

  if (!success) {
    throw new Error(
      "No imagine_result_success returned for edit: " + JSON.stringify(json, null, 2)
    );
  }

  return success;
}

export default function (): (
  previousImageId: string,
  prompt: string,
  callback?: ImagineEditCallback
) => Promise<ImagineResult | undefined> {
  return async function imagineEdit(
    previousImageId: string,
    prompt: string,
    callback?: ImagineEditCallback
  ): Promise<ImagineResult | undefined> {
    try {
      const result = await imagineEditOnce({ previousImageId, prompt });
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
