"use strict";

import axios from "axios";
import type { RequestClient } from "../../../types/request";
import { type Context, type DefaultFuncs, parseAndCheckLogin } from "../../request/formatters/helpers";

type ChangeAvtCallback = (err: Error | null, data?: unknown) => void;

export default function (
  defaultFuncs: DefaultFuncs,
  api: RequestClient & { postFormData?: (...args: any[]) => Promise<any> },
  ctx: Context
): (link: string, caption?: string, callback?: ChangeAvtCallback) => Promise<unknown> {
  async function postImage(form: { file: any }): Promise<any> {
    const res = await (api as any).postFormData?.(
      `https://www.facebook.com/profile/picture/upload/?profile_id=${ctx.userID}&photo_source=57&av=${ctx.userID}`,
      form
    );

    if (typeof res === "string" && res.startsWith("for (;;);")) {
      return JSON.parse(res.split("for (;;);")[1] || "{}");
    }
    return typeof res === "string" ? JSON.parse(res) : res;
  }

  return function changeAvt(
    link: string,
    caption?: string,
    callback?: ChangeAvtCallback
  ): Promise<unknown> {
    let resolveFunc: (value: unknown) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<unknown>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    const cb: ChangeAvtCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      });

    (async () => {
      try {
        const fetchRes = await axios.get(link, { responseType: "stream" });
        const uploadData = await postImage({ file: fetchRes.data });

        if ((uploadData as any)?.error) {
          throw new Error(
            JSON.stringify({
              error: (uploadData as any).error,
              des: (uploadData as any).error?.errorDescription,
            })
          );
        }

        const form = {
          av: ctx.userID,
          fb_api_req_friendly_name: "ProfileCometProfilePictureSetMutation",
          fb_api_caller_class: "RelayModern",
          doc_id: "8839375402787576",
          variables: JSON.stringify({
            input: {
              attribution_id_v2:
                "ProfileCometTimelineListViewRoot.react,comet.profile.timeline.list,unexpected," +
                Date.now() +
                ",232905,190055527696468,,;CometHomeRoot.react,comet.home,via_cold_start," +
                Date.now() +
                ",586727,4748854339,,",
              caption: caption || "",
              existing_photo_id: (uploadData as any).payload?.fbid,
              expiration_time: null,
              profile_id: ctx.userID,
              profile_pic_method: "EXISTING",
              profile_pic_source: "TIMELINE",
              scaled_crop_rect: {
                height: 0.99999,
                width: 0.94999,
                x: 0.025,
                y: 0,
              },
              skip_cropping: true,
              actor_id: ctx.userID,
              client_mutation_id: Math.round(Math.random() * 19).toString(),
            },
            isPage: false,
            isProfile: true,
            sectionToken: "UNKNOWN",
            collectionToken: "UNKNOWN",
            scale: 1,
            __relay_internal__pv__ProfileGeminiIsCoinFlipEnabledrelayprovider: false,
          }),
          server_timestamps: true,
        };

        defaultFuncs
          .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
          .then(parseAndCheckLogin(ctx, defaultFuncs))
          .then((resData: any) => {
            if (resData?.error) throw resData;
            cb(null, true);
          })
          .catch((err: any) => {
            cb(err instanceof Error ? err : new Error(String(err)));
          });
      } catch (err) {
        cb(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return returnPromise;
  };
}
