import { URLSearchParams } from "url";

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

const generateUUID = (): string =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c =>
    (c === "x" ? (Math.random() * 16) | 0 : ((Math.random() * 4) | 8)).toString(16)
  );

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

      const lsd: string = ctx.lsd || "";
      const revision: string = ctx.revision || ctx.rev || "";

      const form: Record<string, string> = {
        __aaid: "0",
        __hs: ctx.__hs || "",
        dpr: "1",
        lsd: lsd,
        hsi: ctx.hsi || "",
        __comet_req: "15",
        __spin_r: revision,
        __spin_t: String(Math.floor(Date.now() / 1000)),
        __spin_b: "trunk",
        doc_id: "6494107973937368",
        variables: JSON.stringify({
          input: {
            client_mutation_id: "4",
            actor_id: String(ctx.userID),
            config_enum: "GDP_CONFIRM",
            device_id: null,
            experience_id: generateUUID(),
            extra_params_json: JSON.stringify({
              app_id: "350685531728",
              kid_directed_site: "false",
              logger_id: `"${generateUUID()}"`,
              next: '"confirm"',
              redirect_uri: '"https://www.facebook.com/connect/login_success.html"',
              response_type: '"token"',
              return_scopes: "false",
              scope:
                '["user_subscriptions","user_videos","user_website","user_work_history","friends_about_me","friends_actions.books","friends_actions.music","friends_actions.news","friends_actions.video","friends_activities","friends_birthday","friends_education_history","friends_events","friends_games_activity","friends_groups","friends_hometown","friends_interests","friends_likes","friends_location","friends_notes","friends_photos","friends_questions","friends_relationship_details","friends_relationships","friends_religion_politics","friends_status","friends_subscriptions","friends_videos","friends_website","friends_work_history","ads_management","create_event","create_note","export_stream","friends_online_presence","manage_friendlists","manage_notifications","manage_pages","photo_upload","publish_stream","read_friendlists","read_insights","read_mailbox","read_page_mailboxes","read_requests","read_stream","rsvp_event","share_item","sms","status_update","user_online_presence","video_upload","xmpp_login"]',
              steps: "{}",
              tp: '"unspecified"',
              cui_gk: '"[PASS]:""',
              is_limited_login_shim: "false"
            }),
            flow_name: "GDP",
            flow_step_type: "STANDALONE",
            outcome: "APPROVED",
            source: "gdp_delegated",
            surface: "FACEBOOK_COMET"
          }
        }),
        server_timestamps: "true"
      };

      const gql = await defaultFuncs.post(
        "https://www.facebook.com/api/graphql/",
        ctx.jar,
        form,
        ctx,
        {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-FB-Friendly-Name": "RunPostFlowActionMutation",
          "X-FB-LSD": lsd,
          "X-FB-IRISSEQID": "1"
        }
      );

      const gqlData = typeof gql === "string" ? gql : (gql?.data || gql?.body || "");
      const parsed = toJSONMaybe(gqlData) || {};
      const uri =
        parsed &&
        parsed.data &&
        parsed.data.run_post_flow_action &&
        parsed.data.run_post_flow_action.uri;
      if (!uri) throw new Error("Không lấy được URI xác thực");

      const qs = (String(uri).split("?")[1] as string) || "";
      const closeUri = new URLSearchParams(qs).get("close_uri");
      let fullToken: string | null = null;

      if (closeUri && closeUri.includes("#access_token=")) {
        fullToken = new URLSearchParams(
          (closeUri.split("#")[1] || "") as string
        ).get("access_token");
      }

      if (!fullToken) throw new Error("Không lấy được token EAAAAU");

      if (tokenName === "EAAAAU") {
        if (callback) callback(null, fullToken);
        return fullToken;
      }

      const response2 = await defaultFuncs.get(
        "https://api.facebook.com/method/auth.getSessionforApp",
        ctx.jar,
        {
          access_token: fullToken,
          format: "json",
          new_app_id: appID,
          generate_session_cookies: "1"
        },
        ctx
      );

      const raw = typeof response2 === "string" ? response2 : (response2?.data || response2?.body || "");
      const data = typeof raw === "string" ? toJSONMaybe(raw) : raw;

      if (!data || (data as any).error_code) {
        throw new Error(
          `Facebook API Error: ${(data as any)?.error_msg ? (data as any).error_msg : "Unknown error"
          }`
        );
      }

      if (!(data as any).access_token)
        throw new Error("Failed to convert token - No access token in response");

      const accessToken: string = (data as any).access_token;
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
