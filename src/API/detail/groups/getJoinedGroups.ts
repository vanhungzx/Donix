"use strict";

import type { Context } from "@types";
import { parseAndCheckLogin, type DefaultFuncs } from "../../request/formatters/helpers";

export interface JoinedGroupNode {
  id: string;
  name?: string;
  url?: string;
  profile_picture?: { uri?: string };
  viewer_last_visited_time?: number;
  subspace_type?: string;
  viewer_join_state?: string;
  if_viewer_can_see_membership_questions?: unknown;
  __typename?: string;
}

export interface JoinedGroupEdge {
  cursor?: string;
  node?: JoinedGroupNode;
}

export interface JoinedGroupsPageInfo {
  end_cursor?: string | null;
  has_next_page?: boolean;
}

export interface GetJoinedGroupsResult {
  groups: Array<{
    id: string;
    name: string | null;
    url: string | null;
    profilePicture: string | null;
    lastVisitedTime: number | null;
    cursor: string | null;
    raw: JoinedGroupNode;
  }>;
  total_joined_groups: number | null;
  page_info: JoinedGroupsPageInfo | null;
}

type GetJoinedGroupsCallback = (err: Error | null, data?: GetJoinedGroupsResult) => void;

const DEFAULT_DOC_ID = "24648931168042404";
const DEFAULT_FRIENDLY_NAME = "GroupsCometJoinsRootQuery";

const DEFAULT_VARS = {
  ordering: ["integrity_signals"],
  scale: 1,
};

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (
  callback?: GetJoinedGroupsCallback
) => Promise<GetJoinedGroupsResult> {
  return function getJoinedGroups(
    callback?: GetJoinedGroupsCallback
  ): Promise<GetJoinedGroupsResult> {
    let resolveFunc: (value: GetJoinedGroupsResult) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<GetJoinedGroupsResult>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    const cb: GetJoinedGroupsCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        if (data) resolveFunc(data);
        else rejectFunc(new Error("No data returned"));
      });

    const form = {
      av: ctx.userID,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: DEFAULT_FRIENDLY_NAME,
      server_timestamps: true,
      doc_id: DEFAULT_DOC_ID,
      variables: JSON.stringify(DEFAULT_VARS),
    };

    (async () => {
      try {
        const resData = await defaultFuncs
          .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
          .then(parseAndCheckLogin(ctx, defaultFuncs));

        const outArr = Array.isArray(resData) ? resData : [resData];
        const out = (outArr[0] ?? resData) as any;

        if (out?.errors || out?.error) {
          throw new Error(
            `Failed to get joined groups: ${JSON.stringify(out?.errors || out?.error)}`
          );
        }

        const edges: JoinedGroupEdge[] =
          out?.data?.viewer?.all_joined_groups?.tab_groups_list?.edges || [];
        const pageInfo: JoinedGroupsPageInfo | null =
          out?.data?.viewer?.all_joined_groups?.tab_groups_list?.page_info || null;
        const totalJoined: number | null =
          typeof out?.data?.viewer?.all_joined_groups?.total_joined_groups === "number"
            ? out.data.viewer.all_joined_groups.total_joined_groups
            : null;

        const groups = edges
          .map((e) => {
            const n: JoinedGroupNode | undefined = e?.node;
            const id = n?.id;
            if (!id) return null;
            return {
              id,
              name: n?.name ?? null,
              url: n?.url ?? null,
              profilePicture: n?.profile_picture?.uri ?? null,
              lastVisitedTime:
                typeof n?.viewer_last_visited_time === "number"
                  ? n.viewer_last_visited_time
                  : null,
              cursor: e?.cursor ?? null,
              raw: n,
            };
          })
          .filter((g): g is NonNullable<typeof g> => g !== null);

        cb(null, {
          groups,
          total_joined_groups: totalJoined,
          page_info: pageInfo,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        cb(error);
      }
    })();

    return returnPromise;
  };
}
