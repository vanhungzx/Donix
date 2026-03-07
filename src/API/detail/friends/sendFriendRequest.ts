"use strict";

import type { Context, DefaultFuncs } from "@types";
import { getType, parseAndCheckLogin } from "../../request/formatters/helpers";

type SendFriendCallback = (err: Error | null, data?: unknown) => void;

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (userId: string, callback?: SendFriendCallback) => Promise<unknown> {
  return function sendFriendRequest(
    userId: string,
    callback?: SendFriendCallback
  ): Promise<unknown> {
    let resolveFunc: (value: unknown) => void = () => {};
    let rejectFunc: (reason?: unknown) => void = () => {};

    const returnPromise = new Promise<unknown>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    const cb: SendFriendCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      });

    if (getType(userId) !== "String") {
      cb(new Error("Invalid user ID"));
      return returnPromise;
    }

    const attributionBase =
      "ProfileCometTimelineListViewRoot.react,comet.profile.timeline.list,unexpected," +
      Date.now() +
      ",190055527696468,,";

    const form = {
      av: ctx.userID,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "FriendingCometFriendRequestSendMutation",
      doc_id: "9012643805460802",
      variables: JSON.stringify({
        input: {
          attribution_id_v2: [
            "ProfileCometTimelineListViewRoot.react,comet.profile.timeline.list,unexpected," + Date.now() + ",897400,190055527696468,,",
            "ProfileCometCollectionRoot.react,comet.profile.collection.friends,unexpected," + Date.now() + ",16099,,,",
            "ProfileCometTimelineListViewRoot.react,comet.profile.timeline.list,unexpected," + Date.now() + ",653484,190055527696468,,",
            "CometHomeRoot.react,comet.home,via_cold_start," + Date.now() + ",781381,4748854339,,",
          ].join(";"),
          friend_requestee_ids: [userId],
          friending_channel: "PROFILE_BUTTON",
          warn_ack_for_ids: [],
          actor_id: ctx.userID,
          client_mutation_id: Math.round(Math.random() * 19).toString(),
        },
        scale: 1,
      }),
      server_timestamps: true,
    };

    (async () => {
      try {
        const resData = await defaultFuncs
          .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
          .then(parseAndCheckLogin(ctx, defaultFuncs));

        if ((resData as any).errors) throw resData;
        cb(null, (resData as any).data?.friend_request_send?.friend_requestees);
      } catch (err) {
        console.error("sendFriendRequest", err);
        cb(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return returnPromise;
  };
}
