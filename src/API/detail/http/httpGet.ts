"use strict";

import type { Context, DefaultFuncs } from "@types";
import { getType } from "../../request/formatters/helpers";

type HttpGetCallback = (err: Error | null, data?: unknown) => void;

export default function httpGetFactory(
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (
  url: string,
  form?: Record<string, unknown> | HttpGetCallback,
  callback?: HttpGetCallback,
  notAPI?: boolean
) => Promise<unknown> {
  return function httpGet(
    url: string,
    form?: Record<string, unknown> | HttpGetCallback,
    callback?: HttpGetCallback,
    _notAPI: boolean = true
  ): Promise<unknown> {
    let resolveFunc: (value: unknown) => void = () => {};
    let rejectFunc: (reason?: unknown) => void = () => {};

    const returnPromise = new Promise<unknown>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });


    if (
      !callback &&
      (getType(form) === "Function" || getType(form) === "AsyncFunction")
    ) {
      callback = form as HttpGetCallback;
      form = {};
    }

    const normalizedForm: Record<string, unknown> =
      form && typeof form === "object" ? (form as Record<string, unknown>) : {};
    const qsForDefault = Object.keys(normalizedForm).length
      ? (normalizedForm as Record<
          string,
          string | number | boolean | null | undefined
        >)
      : null;

    const cb: HttpGetCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      });

    const exec = () =>
      defaultFuncs.get(
        url,
        ctx.jar,
        qsForDefault,
        ctx
      );

    exec()
      .then((resData: unknown) => {
        if (
          resData &&
          typeof resData === "object" &&
          "data" in (resData as { data?: unknown })
        ) {
          cb(null, (resData as { data?: unknown }).data);
        } else {
          cb(null, resData);
        }
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));

        console.error("httpGet", error);
        cb(error);
      });

    return returnPromise;
  };
}
