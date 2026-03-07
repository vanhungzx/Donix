import logger from "@log";
import type { Context } from "@types";
import { parseAndCheckLogin, type DefaultFuncs } from "../../request/formatters/helpers";

export interface GetFacebookProfileOptions {
  /**
   * User ID của profile cần lấy.
   * Mặc định sẽ dùng ctx.userID nếu không truyền.
   */
  userID?: string;

  /**
   * scale cho avatar (theo trace gốc là 1)
   */
  scale?: number;

  /**
   * selectedID trong variables, thường trùng userID
   */
  selectedID?: string;

  /**
   * selectedSpaceType, theo trace là "community"
   */
  selectedSpaceType?: string;

  /**
   * Cờ shouldUseFXIMProfilePicEditor, theo trace là false
   */
  shouldUseFXIMProfilePicEditor?: boolean;
}

export interface FacebookProfile {
  id: string;
  name: string;
  url?: string;
  profilePicSmall?: string;
  profilePicMedium?: string;
  profilePicLarge?: string;
  followersText?: string;
  followingText?: string;
  /**
   * Raw object trả về từ GraphQL (để debug / dùng thêm field khác nếu cần)
   */
  raw?: unknown;
}

export type GetFacebookProfileCallback = (err: Error | null, data?: FacebookProfile) => void;

/**
 * Gọi GraphQL web `ProfileCometHeaderQuery` để lấy thông tin profile (tên, avatar, URL, followers, following, ...).
 *
 * Dựa trên trace:
 * - fb_api_caller_class: RelayModern
 * - fb_api_req_friendly_name: ProfileCometHeaderQuery
 * - doc_id: 25231299586521751
 */
export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (options?: GetFacebookProfileOptions | GetFacebookProfileCallback, callback?: GetFacebookProfileCallback) => Promise<FacebookProfile> {
  return function getFacebookProfile(
    options?: GetFacebookProfileOptions | GetFacebookProfileCallback,
    callback?: GetFacebookProfileCallback
  ): Promise<FacebookProfile> {
    let resolveFunc: (value: FacebookProfile) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<FacebookProfile>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    let opts: GetFacebookProfileOptions;

    if (typeof options === "function") {
      callback = options as GetFacebookProfileCallback;
      opts = {};
    } else {
      opts = (options || {}) as GetFacebookProfileOptions;
    }

    const cb: GetFacebookProfileCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        if (data) resolveFunc(data);
      });

    (async () => {
      try {
        const userID = opts.userID || ctx.userID;
        if (!userID) {
          throw new Error("Không tìm thấy userID (truyền vào options.userID hoặc đảm bảo ctx.userID tồn tại)");
        }

        const variables = {
          scale: opts.scale ?? 1,
          selectedID: opts.selectedID ?? String(userID),
          selectedSpaceType: opts.selectedSpaceType ?? "community",
          shouldUseFXIMProfilePicEditor: opts.shouldUseFXIMProfilePicEditor ?? false,
          userID: String(userID),
        };

        const form: Record<string, string> = {
          av: String(userID),
          fb_api_caller_class: "RelayModern",
          fb_api_req_friendly_name: "ProfileCometHeaderQuery",
          server_timestamps: "true",
          variables: JSON.stringify(variables),
          doc_id: "25231299586521751",
        };

        logger.info(
          `[getFacebookProfile] Fetching profile for userID=${userID}, variables=${JSON.stringify(
            variables
          )}`
        );

        const response = await defaultFuncs
          .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
          .then(parseAndCheckLogin(ctx, defaultFuncs));

        const outArr = Array.isArray(response) ? response : [response];
        const out = (outArr[0] ?? response) as {
          data?: {
            user?: {
              profile_header_renderer?: {
                user?: {
                  id?: string;
                  name?: string;
                  url?: string;
                  profilePicSmall?: { uri?: string };
                  profilePicMedium?: { uri?: string };
                  profilePicLarge?: { uri?: string };
                  profile_picture_for_sticky_bar?: { uri?: string };
                  profile_social_context?: {
                    content?: Array<{
                      text?: {
                        text?: string;
                      };
                    }>;
                  };
                };
              };
            };
          };
          errors?: Array<unknown>;
          error?: unknown;
        };

        if (out.errors || out.error) {
          const errorMsg = `Failed to get Facebook profile: ${JSON.stringify(out.errors || out.error)}`;
          logger.error(`[getFacebookProfile] ${errorMsg}`);
          throw new Error(errorMsg);
        }

        const profileUser =
          out.data?.user?.profile_header_renderer?.user ||
          // fallback: một số biến thể có thể đặt user trực tiếp trên data.user
          (out.data?.user as any | undefined);

        if (!profileUser || !profileUser.id || !profileUser.name) {
          const errorMsg = `Không lấy được thông tin profile hợp lệ từ GraphQL response: ${JSON.stringify(
            out
          ).slice(0, 500)}...`;
          logger.error(`[getFacebookProfile] ${errorMsg}`);
          throw new Error(errorMsg);
        }

        const socialContent = profileUser.profile_social_context?.content || [];
        const followersText = socialContent[0]?.text?.text;
        const followingText = socialContent[1]?.text?.text;

        const result: FacebookProfile = {
          id: profileUser.id,
          name: profileUser.name,
          url: profileUser.url,
          profilePicSmall:
            profileUser.profilePicSmall?.uri || profileUser.profile_picture_for_sticky_bar?.uri,
          profilePicMedium: profileUser.profilePicMedium?.uri,
          profilePicLarge: profileUser.profilePicLarge?.uri,
          followersText,
          followingText,
          raw: profileUser,
        };

        logger.success(
          `[getFacebookProfile] Successfully fetched profile for ${result.name} (${result.id})`
        );

        cb(null, result);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(
          `[getFacebookProfile] Exception occurred - ${error.message}${
            error.stack ? `\nStack: ${error.stack}` : ""
          }`
        );
        cb(error);
      }
    })();

    return returnPromise;
  };
}
