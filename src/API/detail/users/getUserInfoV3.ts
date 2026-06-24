"use strict";

import type { Context, DefaultFuncs } from "@types";
import { json as fetchJson } from "../../request/index";

type AnyObject = Record<string, unknown>;

interface ProfileStatusText {
  text?: string | null;
}

interface ProfileTile {
  profile_status_text?: ProfileStatusText | null;
}

type AllJsonData = unknown[];

interface ProfileSocialContextItem {
  text?: { text?: string | null };
}

interface ProfileSocialContext {
  content?: ProfileSocialContextItem[];
}

interface ImageUri {
  uri?: string | null;
}

interface CoverPhoto {
  photo?: {
    image?: ImageUri;
  };
}

interface MainUserObject {
  id?: string | number;
  __typename?: string;
  profile_tabs?: unknown;
  name?: string | null;
  short_name?: string | null;
  vanity?: string | null;
  url?: string | null;
  gender?: string | null;
  is_viewer_friend?: boolean;
  is_birthday?: boolean;
  show_verified_badge_on_profile?: boolean;
  profile_social_context?: ProfileSocialContext;
  cover_photo?: CoverPhoto | null;
  [key: string]: unknown;
}

interface DelegatePage {
  best_description?: { text?: string | null };
}

interface MetaVerifiedSection {
  headline?: string | null;
}

interface GetUserInfoV3Result {
  id: string | number | undefined;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  vanity: string | null;
  profileUrl: string | null;
  profilePicUrl: string;
  gender: string | null;
  type: string | undefined;
  isFriend: boolean | undefined;
  isBirthday: boolean;
  isVerified: boolean;
  bio: string | null;
  live_city: string | null;
  headline: string | null;
  followers: string | null;
  following: string | null;
  coverPhoto: string | null;
}

function isAnyObject(value: unknown): value is AnyObject {
  return typeof value === "object" && value !== null;
}

function findMainUserObject(data: unknown[], userID: string): MainUserObject | null {
  let mainUserObject: MainUserObject | null = null;

  if (!Array.isArray(data)) return null;

  const deepFind = (obj: unknown): void => {
    if (mainUserObject || !isAnyObject(obj)) return;

    const candidate = obj as Partial<MainUserObject>;
    if (
      candidate.id === userID &&
      candidate.__typename === "User" &&
      "profile_tabs" in candidate
    ) {
      mainUserObject = candidate as MainUserObject;
      return;
    }

    for (const key of Object.keys(obj)) {
      deepFind((obj as AnyObject)[key]);
      if (mainUserObject) return;
    }
  };

  deepFind({ all: data });
  return mainUserObject;
}

function findFirstValueByKey<T = unknown>(dataArray: unknown[], key: string): T | null {
  if (!Array.isArray(dataArray)) return null;

  let found: T | null = null;

  const deepSearch = (obj: unknown): void => {
    if (found !== null || !isAnyObject(obj)) return;

    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      found = (obj as AnyObject)[key] as T;
      return;
    }

    for (const k of Object.keys(obj)) {
      deepSearch((obj as AnyObject)[k]);
      if (found !== null) return;
    }
  };

  for (const obj of dataArray) {
    deepSearch(obj);
    if (found !== null) break;
  }

  return found;
}

function findBioFromProfileTiles(allJsonData: AllJsonData): string | null {
  try {
    const bio = findFirstValueByKey<ProfileTile>(allJsonData, "profile_status_text");
    return bio?.profile_status_text?.text || null;
  } catch {
    return null;
  }
}

function findLiveCityFromProfileTiles(allJsonData: AllJsonData): string | null {
  try {
    let found: string | null = null;

    const visit = (node: unknown): void => {
      if (found !== null) return;

      if (Array.isArray(node)) {
        for (const item of node) {
          visit(item);
          if (found !== null) return;
        }
        return;
      }

      if (isAnyObject(node)) {
        const maybeText = (node as AnyObject).text;
        const ranges = (node as AnyObject).ranges;

        if (
          typeof maybeText === "string" &&
          maybeText.includes("Lives in") &&
          Array.isArray(ranges)
        ) {
          const firstRange = ranges[0] as AnyObject;
          const entity = (firstRange?.entity || {}) as AnyObject;

          if (entity?.category_type === "CITY_WITH_ID") {
            found = maybeText;
            return;
          }
        }

        for (const key of Object.keys(node)) {
          visit((node as AnyObject)[key]);
          if (found !== null) return;
        }
      }
    };

    visit(allJsonData);
    return found;
  } catch {
    return null;
  }
}

function findSocialContextText(
  socialContext: ProfileSocialContext | undefined,
  keyword: string
): string | null {
  if (socialContext && Array.isArray(socialContext.content)) {
    for (const item of socialContext.content) {
      const text = item?.text?.text;
      if (text && text.toLowerCase().includes(keyword.toLowerCase())) {
        return text;
      }
    }
  }
  return null;
}

function getNested<T = unknown>(obj: unknown, path: string): T | null {
  if (!isAnyObject(obj) || !path) return null;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (!isAnyObject(current) || !(part in current)) {
      return null;
    }
    current = (current as AnyObject)[part];
  }
  return current as T;
}

export default function (
  _defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (userID: string) => Promise<GetUserInfoV3Result> {
  return async function getUserInfoV3(userID: string): Promise<GetUserInfoV3Result> {
    const url = `https://www.facebook.com/${userID}`;
    const allJsonData = (await fetchJson(
      url,
      ctx.jar as unknown as any, 
      null,
      ctx.options as Record<string, unknown> | undefined,
      ctx
    )) as AllJsonData;

    if (!allJsonData || allJsonData.length === 0) {
      throw new Error(`Could not find JSON data for ID: ${userID}`);
    }

    const mainUserObject = findMainUserObject(allJsonData, userID);
    if (!mainUserObject) {
      throw new Error(`Could not isolate main user object for ID: ${userID}`);
    }

    const name = mainUserObject.name ?? null;
    const nameParts = name ? name.split(" ") : [];

    const profileOwner = findFirstValueByKey<MainUserObject>(
      allJsonData,
      "profile_owner"
    );
    const props = findFirstValueByKey<{ userVanity?: string | null }>(
      allJsonData,
      "props"
    );
    const delegatePage = findFirstValueByKey<DelegatePage>(
      allJsonData,
      "delegate_page"
    );
    const metaVerified = findFirstValueByKey<MetaVerifiedSection>(
      allJsonData,
      "meta_verified_section"
    );

    const firstName =
      nameParts[0] ||
      mainUserObject.short_name ||
      profileOwner?.short_name ||
      null;

    const lastName =
      nameParts.length > 1 ? nameParts[nameParts.length - 1] : null;

    const vanity =
      mainUserObject.vanity || props?.userVanity || null;

    const bio =
      findBioFromProfileTiles(allJsonData) ||
      delegatePage?.best_description?.text ||
      null;

    const headlineNested = getNested<string | null>(
      mainUserObject,
      "contextual_headline.text"
    );
    const headline = (headlineNested ?? metaVerified?.headline) ?? null;

    const profileSocialContext = mainUserObject.profile_social_context;

    const coverPhotoUri =
      mainUserObject.cover_photo?.photo?.image?.uri || null;

    const result: GetUserInfoV3Result = {
      id: mainUserObject.id,
      name,
      firstName,
      lastName: lastName ?? null,
      vanity: vanity ?? null,
      profileUrl: mainUserObject.url || null,
      profilePicUrl: `https://graph.facebook.com/${userID}/picture?width=720&height=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
      gender: mainUserObject.gender ?? null,
      type: mainUserObject.__typename,
      isFriend: mainUserObject.is_viewer_friend,
      isBirthday: Boolean(mainUserObject.is_birthday),
      isVerified: Boolean(mainUserObject.show_verified_badge_on_profile),
      bio,
      live_city: findLiveCityFromProfileTiles(allJsonData),
      headline,
      followers: findSocialContextText(profileSocialContext, "followers"),
      following: findSocialContextText(profileSocialContext, "following"),
      coverPhoto: coverPhotoUri ?? null,
    };

    return result;
  };
}
