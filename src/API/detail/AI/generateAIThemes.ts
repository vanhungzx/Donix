import axios from "axios";
import { URLSearchParams } from "url";
import { v4 as uuidv4 } from "uuid";
import { getConfig } from "../../../core/configManager";

interface AIThemeBackgroundAsset {
  id: string;
  image: {
    uri: string;
  } | null;
  video: string | null;
}

interface AIThemeIconAsset {
  id: string;
  small: {
    uri: string;
  };
  large: {
    uri: string;
  };
}

export interface AITheme {
  id: string;
  is_deprecated: boolean;
  gradient_colors: string[];
  fallback_color: string;
  reverse_gradients_for_radial: boolean;
  accessibility_label: string;
  description: string | null;
  background_asset: AIThemeBackgroundAsset;
  ai_generated_background_uri: string;
  preview_image_url: string;
  icon_asset: AIThemeIconAsset;
  reaction_pack: unknown | null;
  view_mode: string;
  theme_type: string;
  app_color_mode: string;
  background_gradient_colors: string[];
  title_bar_background_color: string;
  composer_background_color: string;
  inbound_message_gradient_colors: string[];
  inbound_message_border_color: string | null;
  inbound_message_border_width: number | null;
  inbound_message_large_corner_radius: number;
  inbound_message_small_corner_radius: number;
  inbound_message_text_color: string;
  message_border_color: string | null;
  message_border_width: number | null;
  message_large_corner_radius: number;
  message_small_corner_radius: number;
  message_text_color: string;
  title_bar_text_color: string;
  title_bar_attribution_color: string;
  title_bar_button_tint_color: string;
  composer_input_background_color: string;
  composer_input_placeholder_color: string;
  composer_input_border_color: string | null;
  composer_input_border_width: number | null;
  composer_tint_color: string;
  composer_unselected_tint_color: string;
  delivery_receipt_color: string;
  tertiary_text_color: string;
  hot_like_color: string | null;
  primary_button_background_color: string;
  voice_record_soundwave_color: string;
  reaction_pill_background_color: string;
  variant_hash: string | null;
  hash_provider_list: unknown[];
  background_gradients: string;
  alternative_themes?: AITheme[];
}

type GenerateAIThemesCallback = (err: Error | null, result?: AITheme[]) => void;

interface GenerateAIThemesResponse {
  data?: {
    xfb_generate_ai_themes_from_prompt?: {
      themes?: AITheme[];
      success?: boolean;
      error?: unknown | null;
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

export async function generateAIThemesFromPrompt(params: {
  prompt: string;
  num_themes?: number;
  variant_index?: number;
  thread_session_id?: string;
  prompt_session_id?: string;
  skip_prompt_engineering?: boolean;
  max_retries?: number;
  overlap?: number;
}): Promise<AITheme[]> {
  const {
    prompt,
    num_themes = 1,
    variant_index = 0,
    thread_session_id = uuidv4(),
    prompt_session_id = uuidv4(),
    skip_prompt_engineering = false,
    max_retries = 0,
    overlap = 0.25
  } = params;

  const locale = "vi_VN";
  const token = getAccessTokenFromConfig("EAAD");
  const clientTraceId = uuidv4();

  const variables = {
    input: {
      variant_index,
      thread_session_id,
      skip_prompt_engineering,
      max_retries,
      prompt,
      caller: "MESSENGER",
      overlap,
      prompt_session_id,
      num_themes
    }
  };

  const body = new URLSearchParams();
  body.set("method", "post");
  body.set("pretty", "false");
  body.set("format", "json");
  body.set("server_timestamps", "true");
  body.set("locale", locale);
  body.set("fb_api_req_friendly_name", "GenerateAIThemesFromPromptMutation");
  body.set("fb_api_caller_class", "graphservice");
  body.set("client_doc_id", "364570059211062015577215089732");
  body.set("fb_api_client_context", JSON.stringify({ is_background: false }));
  body.set("variables", JSON.stringify(variables));
  body.set("fb_api_analytics_tags", JSON.stringify(["GraphServices"]));
  body.set("client_trace_id", clientTraceId);
  const bodyString = body.toString();

  const { data: json } = await axios.post<GenerateAIThemesResponse>(
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
        "x-fb-friendly-name": "GenerateAIThemesFromPromptMutation",
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
        "x-fb-conn-uuid-client": "45e079e07cdef8d2b94b5670368a4aa4"
      },
      decompress: true,
      responseType: "json"
    }
  );

  const themeData = json.data?.xfb_generate_ai_themes_from_prompt;

  if (!themeData?.success || !Array.isArray(themeData.themes)) {
    throw new Error(
      "Generate AI themes failed: " + JSON.stringify(json, null, 2)
    );
  }

  return themeData.themes;
}

export default function (): (
  prompt: string,
  callback?: GenerateAIThemesCallback
) => Promise<AITheme[] | undefined> {
  return async function generateAIThemes(
    prompt: string,
    callback?: GenerateAIThemesCallback
  ): Promise<AITheme[] | undefined> {
    try {
      const result = await generateAIThemesFromPrompt({ prompt });
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
