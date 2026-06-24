"use strict";

import logger from "@log";
import { Context, DefaultFuncs, parseAndCheckLogin } from "../../request/formatters/helpers";

const DOC_ID = "7772514672872558";

interface UserInfo {
  name: string | null;
  firstName: string | null;
  vanity: string | null;
  thumbSrc: string | null;
  profileUrl: string | null;
  gender: string | null;
  type: string | null;
  isFriend: boolean;
  isMessengerUser: boolean;
  isMessageBlockedByViewer: boolean;
  workInfo: any | null;
  messengerStatus: string | null;
}

function formatUserData(actors: any[]): Record<string, UserInfo> {
  if (!actors || !Array.isArray(actors)) return {};

  const result = Object.create(null);

  for (let i = 0; i < actors.length; i++) {
    const a = actors[i];
    if (!a || !a.id) continue;

    result[a.id] = {
      name: a.name || null,
      firstName: a.short_name || null,
      vanity: a.username || null,
      thumbSrc: a.big_image_src?.uri || null,
      profileUrl: a.url || null,
      gender: a.gender || null,
      type: a.__typename || null,
      isFriend: !!a.is_viewer_friend,
      isMessengerUser: !!a.is_messenger_user,
      isMessageBlockedByViewer: !!a.is_message_blocked_by_viewer,
      workInfo: a.work_info || null,
      messengerStatus: a.messenger_account_status_category || null,
    };
  }

  return result;
}

function buildForm(_ctx: Context, queriesJson: string): any {
  const form: any = {
    batch_name: "MessengerParticipantsFetcher",
    queries: queriesJson,
  };

  Object.keys(form).forEach((k) => form[k] === undefined && delete form[k]);
  return form;
}

export default function getUserInfoGraphQL(
  defaultFuncs: DefaultFuncs,
  _client: any,
  ctx: Context
): (idOrIds: string | string[], callback?: (err: any, data?: Record<string, UserInfo>) => void) => Promise<Record<string, UserInfo>> {
  return function getUserInfo(idOrIds: string | string[], callback?: (err: any, data?: Record<string, UserInfo>) => void): Promise<Record<string, UserInfo>> {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];

    if (!ids.length || ids.some((v) => v === undefined || v === null || v === "")) {
      const error = new Error("User ID is required");
      if (typeof callback === "function") {
        process.nextTick(() => callback(error));
        return Promise.reject(error);
      }
      return Promise.reject(error);
    }

    const idStrs = ids.map((v) => String(v));

    const exec = (cb: (err: any, data?: Record<string, UserInfo>) => void): void => {
      const queries = {
        o0: { doc_id: DOC_ID, query_params: { ids: idStrs, source: null } },
      };

      const form = buildForm(ctx, JSON.stringify(queries));

      defaultFuncs
        .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
        .then(parseAndCheckLogin(ctx, defaultFuncs))
        .then((res: any) => {
          if (!res) return cb(new Error("No response data received"));
          if (res.error) return cb(res.error);

          let data: any = null;

          if (Array.isArray(res)) {
            for (let i = 0; i < res.length; i++) {
              const item = res[i];
              if (item?.o0?.data) {
                data = item.o0.data;
                break;
              }
              if (item?.data) {
                data = item.data;
                break;
              }
            }
          } else if (res.data) {
            data = res.data;
          }

          if (!data || !data.messaging_actors) return cb(new Error("Invalid data received"));

          const formatted = formatUserData(data.messaging_actors);
          cb(null, formatted);
        })
        .catch((err: any) => {
          logger.error(`getUserInfoGraphQL error: ${err.message}`);
          cb(err);
        });
    };

    if (typeof callback === "function") {
      exec(callback);
      return Promise.resolve({} as Record<string, UserInfo>);
    }

    return new Promise<Record<string, UserInfo>>((resolve, reject) => {
      exec((e, d) => (e ? reject(e) : resolve(d || {})));
    });
  };
}
