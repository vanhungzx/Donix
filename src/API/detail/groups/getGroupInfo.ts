"use strict";

import type { Context } from "@types";
import { parseAndCheckLogin, type DefaultFuncs } from "../../request/formatters/helpers";

export interface GroupActivityInfo {
  number_of_posts_in_last_day?: number | null;
  number_of_posts_in_last_month?: number | null;
  group_total_members_info_text?: string | null;
  group_new_members_info_text?: string | null;
  created_time?: number | null;
}

export interface GroupPrivacyInfo {
  label?: string | null;
  description?: string | null;
  icon_name?: string | null;
}

export interface GroupDiscoverabilityInfo {
  label?: string | null;
  description?: string | null;
  icon_name?: string | null;
}

export interface GroupHistoryInfo {
  create_time?: number | null;
  summary_text?: string | null;
}

export interface GroupTagInfo {
  name?: string | null;
  id?: string | null;
}

export interface GroupLocationInfo {
  id?: string | null;
  name?: string | null;
}

export interface GroupRuleInfo {
  id?: string | null;
  title?: string | null;
  description?: string | null;
}

export interface GetGroupInfoResult {
  id: string;
  name: string | null;
  url: string | null;

  description: string | null;

  activity: GroupActivityInfo | null;

  privacy: GroupPrivacyInfo | null;
  discoverability: GroupDiscoverabilityInfo | null;
  history: GroupHistoryInfo | null;

  tags: GroupTagInfo[];
  locations: GroupLocationInfo[];

  member_count_text: string | null;
  friends_member_sentence: string | null;
  admin_moderator_sentence: string | null;

  rules: GroupRuleInfo[];
}

type GetGroupInfoCallback = (err: Error | null, data?: GetGroupInfoResult | null) => void;

const DEFAULT_DOC_ID = "24928089423556527";
const DEFAULT_FRIENDLY_NAME = "CometGroupAboutRootQuery";

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (
  groupID: string,
  callback?: GetGroupInfoCallback
) => Promise<GetGroupInfoResult | null> {
  function buildForm(groupID: string) {
    const variables = {
      groupID: String(groupID),
      scale: 1,
    };

    return {
      av: String(ctx.userID),
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: DEFAULT_FRIENDLY_NAME,
      server_timestamps: true,
      doc_id: DEFAULT_DOC_ID,
      variables: JSON.stringify(variables),
    };
  }

  async function exec(groupID: string, cb: GetGroupInfoCallback): Promise<void> {
    const form = buildForm(groupID);

    try {
      const resData = await defaultFuncs
        .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
        .then(parseAndCheckLogin(ctx, defaultFuncs));

      const outArr = Array.isArray(resData) ? resData : [resData];
      const out = (outArr[0] ?? resData) as any;

      if (out?.errors || out?.error) {
        const errorMsg = `Failed to get group info: ${JSON.stringify(out?.errors || out?.error)}`;
        cb(new Error(errorMsg));
        return;
      }

      const group = out?.data?.group;
      if (!group || !group.id) {
        cb(new Error("No group data returned"));
        return;
      }

      const activityNode = group.if_viewer_can_see_activity_section;
      const privacyNode = group?.about_info_items?.find(
        (item: any) => item?.__typename === "XFBPrivacyGroupsAboutInfoItem"
      );
      const discoverNode = group?.about_info_items?.find(
        (item: any) => item?.__typename === "XFBDiscoverabilityGroupsAboutInfoItem"
      );
      const historyNode = group?.about_info_items?.find(
        (item: any) => item?.__typename === "XFBHistoryGroupsAboutInfoItem"
      );
      const tagsNode = group?.about_info_items?.find(
        (item: any) => item?.__typename === "XFBTagsGroupsAboutInfoItem"
      );
      const locationNode = group?.about_info_items?.find(
        (item: any) => item?.__typename === "XFBLocationGroupsAboutInfoItem"
      );

      const activity: GroupActivityInfo | null = activityNode
        ? {
          number_of_posts_in_last_day:
            activityNode.number_of_posts_in_last_day ?? null,
          number_of_posts_in_last_month:
            activityNode.number_of_posts_in_last_month ?? null,
          group_total_members_info_text:
            activityNode.group_total_members_info_text ?? null,
          group_new_members_info_text:
            activityNode.group_new_members_info_text ?? null,
          created_time: activityNode.created_time ?? null,
        }
        : null;

      const privacy: GroupPrivacyInfo | null = privacyNode?.group?.privacy_info
        ? {
          label: privacyNode.group.privacy_info.label?.text ?? null,
          description: privacyNode.group.privacy_info.description?.text ?? null,
          icon_name: privacyNode.group.privacy_info.icon_name ?? null,
        }
        : null;

      const discoverability: GroupDiscoverabilityInfo | null =
        discoverNode?.group?.discoverability_info
          ? {
            label: discoverNode.group.discoverability_info.label?.text ?? null,
            description:
              discoverNode.group.discoverability_info.description?.text ?? null,
            icon_name: discoverNode.group.discoverability_info.icon_name ?? null,
          }
          : null;

      const history: GroupHistoryInfo | null = historyNode?.group?.group_history
        ? {
          create_time: historyNode.group.group_history.create_time ?? null,
          summary_text:
            historyNode.group.group_history.group_history_summary?.text ?? null,
        }
        : null;

      const tags: GroupTagInfo[] =
        tagsNode?.group?.admin_tags?.map((t: any) => ({
          id: t?.id ?? null,
          name: t?.name ?? null,
        })) ?? [];

      const locations: GroupLocationInfo[] =
        locationNode?.group?.group_locations?.map((loc: any) => ({
          id: loc?.id ?? null,
          name: loc?.name ?? null,
        })) ?? [];

      const descriptionText: string | null =
        group?.description_with_entities?.text ??
        group?.if_viewer_can_view_description?.description_with_entities?.text ??
        null;

      const rules: GroupRuleInfo[] =
        group?.group_rules?.nodes?.map((rule: any) => ({
          id: rule?.id ?? null,
          title: rule?.rule_title ?? null,
          description:
            rule?.description_with_entities?.text ?? rule?.description ?? null,
        })) ?? [];

      const memberCountText: string | null =
        group?.group_member_profiles?.group_member_profiles
          ?.formatted_count_text ??
        group?.group_member_profiles?.formatted_count_text ??
        null;

      const friendsSentence: string | null =
        group?.friends_social_sentence?.text ?? null;

      const adminModeratorSentence: string | null =
        group?.admin_and_moderator_social_sentence?.text ?? null;

      const result: GetGroupInfoResult = {
        id: String(group.id),
        name: group?.name ?? null,
        url: group?.url ?? null,

        description: descriptionText,

        activity,
        privacy,
        discoverability,
        history,

        tags,
        locations,

        member_count_text: memberCountText,
        friends_member_sentence: friendsSentence,
        admin_moderator_sentence: adminModeratorSentence,

        rules,
      };

      cb(null, result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      cb(error);
    }
  }

  return function getGroupInfo(
    groupID: string,
    callback?: GetGroupInfoCallback
  ): Promise<GetGroupInfoResult | null> {
    const target = String(groupID);

    if (typeof callback === "function") {
      exec(target, callback);
      return Promise.resolve(null);
    }

    return new Promise<GetGroupInfoResult | null>((resolve, reject) =>
      exec(target, (e, d) => (e ? reject(e) : resolve(d ?? null)))
    );
  };
}
