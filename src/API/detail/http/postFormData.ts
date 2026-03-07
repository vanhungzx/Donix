"use strict";

import type { Context, DefaultFuncs } from "@types";
import { getType } from "../../request/formatters/helpers";

type PostFormDataCallback = (err: Error | null, data?: string) => void;

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (url: string, form?: Record<string, unknown> | PostFormDataCallback, callback?: PostFormDataCallback) => Promise<string> {
  return function postFormData(
    url: string,
    form?: Record<string, unknown> | PostFormDataCallback,
    callback?: PostFormDataCallback
  ): Promise<string> {
    let resolveFunc: (value: string) => void = () => {};
    let rejectFunc: (reason?: unknown) => void = () => {};

    const returnPromise = new Promise<string>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });


    if (
      !callback &&
      (getType(form) === "Function" || getType(form) === "AsyncFunction")
    ) {
      callback = form as PostFormDataCallback;
      form = {};
    }

    const normalizedForm: Record<string, unknown> =
      (form && typeof form === "object" ? form : {}) as Record<string, unknown>;

    const cb: PostFormDataCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data ?? "");
      });

    defaultFuncs
      .postFormData(url, ctx.jar, normalizedForm, {})
      .then((resData) => {
        try {

          if (
            resData &&
            typeof resData === "object" &&
            "data" in resData &&
            typeof (resData as { data?: unknown }).data === "string"
          ) {
            cb(null, (resData as { data: string }).data.toString());
          } else {
            cb(null, String((resData as { data?: unknown }).data ?? ""));
          }
        } catch {
          cb(new Error("Unexpected response format from postFormData"));
        }
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));

        console.error("postFormData", error);
        cb(error);
      });

    return returnPromise;
  };
}
