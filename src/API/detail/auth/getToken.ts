import { URLSearchParams } from "url";
import { v4 as uuidv4 } from "uuid";
import { extractUserID } from "../../login/contextBuilder";

const tokenAppMap: Record<string, string> = {
  EAAAAU: "350685531728",
  EAAD: "256002347743983",
  EAAAAAY: "6628568379",
  EAADYP: "237759909591655",
  EAAD6V7: "275254692598279",
  EAAC2SPKT: "202805033077166",
  EAAGOfO: "200424423651082",
  EAAVB: "438142079694454",
  EAAC4: "1479723375646806",
  EAACW5F: "165907476854626",
  EAAB: "121876164619130",
  EAAQ: "1174099472704185",
  EAAGNO4: "436761779744620",
  EAAH: "522404077880990",
  EAAC: "184182168294603",
  EAAClA: "173847642670370",
  EAATK: "1348564698517390",
  EAAI7: "628551730674460"
};

const toJSONMaybe = (s: unknown): any => {
  if (!s) return null;
  if (typeof s === "string") {
    const t = s.trim().replace(/^for\s*\(\s*;\s*;\s*\)\s*;/, "");
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }
  return s;
};

/** Lấy fb_dtsg từ endpoint oauth */
async function getFbDtsg(
  defaultFuncs: any,
  jar: any
): Promise<string> {
  const response = await defaultFuncs.get(
    "https://www.facebook.com/v2.3/dialog/oauth",
    jar,
    {
      redirect_uri: "fbconnect://success",
      response_type: "token,code",
      client_id: "356275264482347"
    },
    {}
  );

  const html = typeof response === "string" ? response : (response?.data || response?.body || "");
  const match = html.match(/DTSGInitialData.*?\{"token":"(.*?)"/);
  if (!match) throw new Error("Không lấy được fb_dtsg");
  return match[1];
}

/** Đổi access token sang app khác */
async function changeToken(
  defaultFuncs: any,
  jar: any,
  ctx: any,
  appId: string,
  accessToken: string
): Promise<string> {
  const response = await defaultFuncs.get(
    "https://api.facebook.com/method/auth.getSessionforApp",
    jar,
    {
      access_token: accessToken,
      format: "json",
      new_app_id: appId,
      generate_session_cookies: "0"
    },
    ctx
  );

  const raw = typeof response === "string" ? response : (response?.data || response?.body || "");
  const data = typeof raw === "string" ? toJSONMaybe(raw) : raw;

  if (!data || (data as any).error_code) {
    throw new Error(
      `Facebook API Error: ${(data as any)?.error_msg ? (data as any).error_msg : "Unable to change token"}`
    );
  }

  if (!(data as any).access_token) {
    throw new Error("Unable to change token: " + JSON.stringify(data));
  }

  // Revoke token cũ
  try {
    await defaultFuncs.get(
      "https://graph.facebook.com/me/permissions",
      jar,
      {
        method: "DELETE",
        access_token: accessToken
      },
      ctx
    );
  } catch (revokeErr) {
    // Ignore revoke errors
  }

  return (data as any).access_token;
}

type GetTokenCallback = (err: any, token?: string) => void;

export default function (defaultFuncs: any, _client: any, ctx: any) {
  return async function getTokenByType(
    tokenType: string = "EAAD",
    callback?: GetTokenCallback
  ): Promise<string | undefined> {
    try {
      const tokenName = String(tokenType).toUpperCase();
      const appID = tokenAppMap[tokenName];
      if (!appID) throw new Error("Loại token không hợp lệ hoặc chưa được hỗ trợ");

      // Lấy fb_dtsg từ endpoint oauth
      const fb_dtsg = await getFbDtsg(defaultFuncs, ctx.jar);

      // Lấy c_user từ cookies
      const cUser = extractUserID(ctx.jar);
      if (!cUser) throw new Error("Không tìm thấy c_user trong cookies");

      const uuid = uuidv4();
      const loggerUuid = uuidv4();

      const variables = {
        input: {
          client_mutation_id: "4",
          actor_id: cUser,
          config_enum: "GDP_CONFIRM",
          device_id: null,
          experience_id: uuid,
          extra_params_json: JSON.stringify({
            app_id: "350685531728",
            kid_directed_site: "false",
            logger_id: `"${loggerUuid}"`,
            next: "confirm",
            redirect_uri: "https://www.facebook.com/connect/login_success.html",
            response_type: "token",
            return_scopes: "false",
            scope:
              '["user_subscriptions","user_videos","user_website","user_work_history","friends_about_me","friends_actions.books","friends_actions.music","friends_actions.news","friends_actions.video","friends_activities","friends_birthday","friends_education_history","friends_events","friends_games_activity","friends_groups","friends_hometown","friends_interests","friends_likes","friends_location","friends_notes","friends_questions","friends_relationship_details","friends_relationships","friends_religion_politics","friends_status","friends_subscriptions","friends_videos","friends_website","friends_work_history","ads_management","create_event","create_note","export_stream","friends_online_presence","manage_friendlists","manage_notifications","manage_pages","photo_upload","publish_stream","read_friendlists","read_insights","read_mailbox","read_page_mailboxes","read_requests","read_stream","rsvp_event","share_item","sms","status_update","user_online_presence","video_upload","xmpp_login"]',
            steps: "{}",
            tp: "unspecified",
            cui_gk: "[PASS]:",
            is_limited_login_shim: "false"
          })
        },
        flow_name: "GDP",
        flow_step_type: "STANDALONE",
        outcome: "APPROVED",
        source: "gdp_delegated",
        surface: "FACEBOOK_COMET"
      };

      const form: Record<string, string> = {
        av: cUser,
        __user: cUser,
        fb_dtsg: fb_dtsg,
        fb_api_caller_class: "RelayModern",
        fb_api_req_friendly_name: "useCometConsentPromptEndOfFlowBatchedMutation",
        variables: JSON.stringify(variables),
        server_timestamps: "true",
        doc_id: "6494107973937368"
      };

      const gql = await defaultFuncs.post(
        "https://www.facebook.com/api/graphql/",
        ctx.jar,
        form,
        ctx,
        {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      );

      const gqlData = typeof gql === "string" ? gql : (gql?.data || gql?.body || "");
      console.log(gqlData);
      const parsed = toJSONMaybe(gqlData) || {};
      const uri =
        parsed &&
        parsed.data &&
        parsed.data.run_post_flow_action &&
        parsed.data.run_post_flow_action.uri;

      if (!uri) throw new Error("Không lấy được access_token");
      const closeUri = decodeURIComponent(
        new URL(uri).searchParams.get("close_uri") || ""
      );
      const fragment = new URL(closeUri).hash.replace("#", "");
      const params = new URLSearchParams(fragment);
      const fullToken = params.get("access_token");

      if (!fullToken) throw new Error("Không lấy được token EAAAAU");

      if (tokenName === "EAAAAU") {
        if (callback) callback(null, fullToken);
        return fullToken;
      }

      // Đổi token sang app khác
      const accessToken = await changeToken(
        defaultFuncs,
        ctx.jar,
        ctx,
        appID,
        fullToken
      );

      if (callback) callback(null, accessToken);
      return accessToken;
    } catch (e) {
      if (callback) {
        callback(e);
        return undefined;
      }
      throw e;
    }
  };
}
