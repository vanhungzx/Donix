"use strict";

import type { Context, DefaultFuncs } from "@types";
import { getType, parseAndCheckLogin } from "../../request/formatters/helpers";

type DeleteFriendCallback = (err: Error | null, data?: unknown) => void;

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (userId: string, callback?: DeleteFriendCallback) => Promise<unknown> {
  return function deleteFriendRequest(
    userId: string,
    callback?: DeleteFriendCallback
  ): Promise<unknown> {
    let resolveFunc: (value: unknown) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<unknown>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    const cb: DeleteFriendCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      });

    if (getType(userId) !== "String") {
      cb(new Error("Invalid user ID"));
      return returnPromise;
    }

    const form = {
      av: ctx.userID,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "FriendingCometFriendRequestDeleteMutation",
      doc_id: "27617877977828067",
      variables: JSON.stringify({
        input: {
          friend_requester_id: userId,
          friending_channel: "FRIENDS_HOME_MAIN",
          actor_id: ctx.userID,
          client_mutation_id: Math.round(Math.random() * 1024).toString(),
        },
        scale: 1,
        refresh_num: 0,
      }),
      server_timestamps: true,
    };

    (async () => {
      try {
        const resData = await defaultFuncs
          .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
          .then(parseAndCheckLogin(ctx, defaultFuncs));

        if ((resData as any).errors) throw resData;
        cb(null, (resData as any).data?.friend_request_delete);
      } catch (err) {
        console.error("cancelFriendRequest", err);
        cb(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return returnPromise;
  };
}
