"use strict";

import log from "@log";
import type { DefaultFuncs, FacebookClient } from "@types";
import { parseGraphql } from "../../../utils";

interface MsgrUserRichStatus {
  id?: string | null;
  description?: string | null;
  visibility?: string | null;
}

interface StorySeenState {
  is_seen_by_viewer?: boolean;
}

interface StoryCard {
  id?: string | null;
  story_card_seen_state?: StorySeenState | null;
}

interface StoryBucketNode {
  first_story_to_show?: StoryCard | null;
}

interface StoryBucket {
  nodes?: StoryBucketNode[];
}

interface DelegatePageInfo {
  id?: string | null;
  is_business_page_active?: boolean | null;
}

interface UserAvatarInfo {
  id?: string | null;
  has_fb_app_avatar?: boolean | null;
}

interface ImageField {
  uri?: string | null;
}

interface ProfileHeaderUser {
  id?: string | null;
  name?: string | null;
  url?: string | null;
  gender?: string | null;
  is_viewer_friend?: boolean | null;
  user_avatar?: UserAvatarInfo | null;
  profilePicSmall?: ImageField | null;
  profilePicMedium?: ImageField | null;
  profilePicLarge?: ImageField | null;
  profile_picture_for_sticky_bar?: ImageField | null;
  msgr_user_rich_status?: MsgrUserRichStatus | null;
  story_bucket?: StoryBucket | null;
  delegate_page?: DelegatePageInfo | null;
  is_live_for_comet_live_ring?: boolean | null;
}

interface ProfileHeaderData {
  user?: {
    profile_header_renderer?: {
      user?: ProfileHeaderUser | null;
    } | null;
  } | null;
}

interface ProfileHeaderResponse {
  data?: ProfileHeaderData | null;
}

interface GetUserInfoV4Result {
  id: string | null;
  name: string | null;
  url: string | null;
  gender: string | null;
  isFriend: boolean;
  avatarId: string | null;
  avatarHasApp: boolean;
  picSmall: string | null;
  picMedium: string | null;
  picLarge: string | null;
  stickyBarPic: string | null;
  status: {
    id: string | null;
    description: string | null;
    visibility: string | null;
  };
  story: {
    id: string | null;
    seen: boolean | null;
  };
  delegatePage: {
    id: string | null;
    isBusinessPageActive: boolean | null;
  };
  isLive: boolean;
}

function normalizeUser(u?: ProfileHeaderUser | null): GetUserInfoV4Result | null {
  if (!u) return null;

  return {
    id: u.id || null,
    name: u.name || null,
    url: u.url || null,
    gender: u.gender || null,
    isFriend: !!u.is_viewer_friend,
    avatarId: u.user_avatar?.id || null,
    avatarHasApp: !!u.user_avatar?.has_fb_app_avatar,
    picSmall: u.profilePicSmall?.uri || null,
    picMedium: u.profilePicMedium?.uri || null,
    picLarge: u.profilePicLarge?.uri || null,
    stickyBarPic: u.profile_picture_for_sticky_bar?.uri || null,
    status: {
      id: u.msgr_user_rich_status?.id || null,
      description: u.msgr_user_rich_status?.description || null,
      visibility: u.msgr_user_rich_status?.visibility || null,
    },
    story: {
      id: u.story_bucket?.nodes?.[0]?.first_story_to_show?.id || null,
      seen:
        u.story_bucket?.nodes?.[0]?.first_story_to_show?.story_card_seen_state
          ?.is_seen_by_viewer ?? null,
    },
    delegatePage: {
      id: u.delegate_page?.id || null,
      isBusinessPageActive: u.delegate_page?.is_business_page_active ?? null,
    },
    isLive: !!u.is_live_for_comet_live_ring,
  };
}

type GetUserInfoV4Callback = (err: Error | null, data?: GetUserInfoV4Result | null) => void;

export default function (
  _defaultFuncs: DefaultFuncs,
  api: FacebookClient,
  ctx: any
): (uid: string, callback?: GetUserInfoV4Callback) => Promise<GetUserInfoV4Result | null> | void {
  function buildForm(targetID: string) {
    const variables = {
      scale: 1,
      selectedID: String(targetID),
      selectedSpaceType: "community",
      shouldUseFXIMProfilePicEditor: false,
      userID: String(targetID),
    };

    return {
      av: String(ctx.userID),
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "ProfileCometHeaderQuery",
      server_timestamps: true,
      doc_id: "24749569021339251",
      variables: JSON.stringify(variables),
    };
  }

  function exec(
    uid: string,
    cb: GetUserInfoV4Callback
  ): void {
    const form = buildForm(uid);

    api
      .httpPost("https://www.facebook.com/api/graphql/", form)
      .then((raw: unknown) => {
        let data: ProfileHeaderResponse | null = null;

        try {
          const parsed = parseGraphql<ProfileHeaderResponse[]>(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            data = parsed[0] as ProfileHeaderResponse;
          } else if (!Array.isArray(parsed)) {
            data = parsed as ProfileHeaderResponse;
          }
        } catch {
          
        }

        if (!data && typeof raw === "string") {
          try {
            data = JSON.parse(raw) as ProfileHeaderResponse;
          } catch {
            
          }
        }

        const user =
          data?.data?.user?.profile_header_renderer?.user;

        if (!user) {
          cb(new Error("No data"));
          return;
        }

        cb(null, normalizeUser(user));
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        log.error(error.message);
        cb(error);
      });
  }

  return function getUserInfoV4(
    uid: string,
    callback?: GetUserInfoV4Callback
  ): Promise<GetUserInfoV4Result | null> | void {
    const target = String(uid);

    if (typeof callback === "function") {
      exec(target, callback);
      return;
    }

    return new Promise<GetUserInfoV4Result | null>((resolve, reject) =>
      exec(target, (e, d) => (e ? reject(e) : resolve(d ?? null)))
    );
  };
}
