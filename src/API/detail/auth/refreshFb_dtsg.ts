"use strict";

import type { Context } from "@types";
import { getFrom } from "../../request/constants";
import { get } from "../../request/index";

type RefreshObj = Partial<Pick<Context, "fb_dtsg" | "ttstamp">> & Record<string, unknown>;
type RefreshCallback = (err: Error | null, data?: { data: RefreshObj; message: string }) => void;

export default function (
  _defaultFuncs: unknown,
  _api: unknown,
  ctx: Context
): (obj?: RefreshObj | RefreshCallback, callback?: RefreshCallback) => Promise<{ data: RefreshObj; message: string }> {
  return function refreshFb_dtsg(
    obj?: RefreshObj | RefreshCallback,
    callback?: RefreshCallback
  ): Promise<{ data: RefreshObj; message: string }> {
    if (typeof obj === "function") {
      callback = obj as RefreshCallback;
      obj = {};
    }

    if (!obj) obj = {};

    if (typeof obj !== "object" || Array.isArray(obj)) {
      throw new Error("The first parameter must be an object or a callback function");
    }

    let resolveFunc: (value: { data: RefreshObj; message: string }) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<{ data: RefreshObj; message: string }>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    const cb: RefreshCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        if (data) resolveFunc(data);
      });

    if (Object.keys(obj).length === 0) {
      get("https://www.facebook.com/", ctx.jar, null, ctx.options as any, null as any, null as any)
        .then(({ data }: any) => {
          const fb_dtsg = getFrom(data, '["DTSGInitData",[],{"token":"', '","');
          const jazoest = getFrom(data, "jazoest=", '",');

          (ctx as any).fb_dtsg = fb_dtsg;
          (ctx as any).jazoest = jazoest;

          if (!fb_dtsg) throw new Error("Could not find fb_dtsg in HTML after requesting Facebook.");

          const payload: RefreshObj = { fb_dtsg, jazoest };

          Object.assign(ctx, payload);

          cb(null, {
            data: payload,
            message: "Refreshed fb_dtsg and jazoest",
          });
        })
        .catch((err: unknown) => {
          console.error("refreshFb_dtsg", err);
          cb(err instanceof Error ? err : new Error(String(err)));
        });
    } else {
      Object.assign(ctx, obj);
      const payload = obj as RefreshObj;
      cb(null, {
        data: payload,
        message: `Refreshed ${Object.keys(payload).join(", ")}`,
      });
    }

    return returnPromise;
  };
}
