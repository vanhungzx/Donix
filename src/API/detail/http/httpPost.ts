"use strict";

import type { Context, DefaultFuncs } from "@types";
import { post as networkPost } from "../../request";
import { getType } from "../../request/formatters/helpers";
import refreshFbDtsg from "../auth/refreshFb_dtsg";

type HttpPostCallback = (err: Error | null, data?: string) => void;

export default function httpPostFactory(
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (
  url: string,
  form?: Record<string, unknown> | HttpPostCallback,
  callback?: HttpPostCallback,
  notAPI?: boolean
) => Promise<string> {
  return function httpPost(
    url: string,
    form?: Record<string, unknown> | HttpPostCallback,
    callback?: HttpPostCallback,
    notAPI: boolean = true
  ): Promise<string> {
    let resolveFunc: (value: string) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<string>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });
    if (
      !callback &&
      (getType(form) === "Function" || getType(form) === "AsyncFunction")
    ) {
      callback = form as HttpPostCallback;
      form = {};
    }

    const normalizedForm: Record<string, unknown> =
      form && typeof form === "object" ? (form as Record<string, unknown>) : {};
    const formForDefault = normalizedForm as Record<
      string,
      string | number | boolean | null | undefined
    >;

    const cb: HttpPostCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data ?? "");
      });
    const isGraphQLAPI = url.includes("/api/graphql/");
    const shouldUseDefaultPost = isGraphQLAPI ? false : notAPI;
    const executor = shouldUseDefaultPost
      ? () => networkPost(url, ctx.jar, normalizedForm, ctx.options as Record<string, unknown> | undefined, ctx)
      : () => defaultFuncs.post(url, ctx.jar, formForDefault, ctx);

    const ensureFreshTokens = async (): Promise<void> => {
      if (!isGraphQLAPI) return;
      try {
        const refresh = refreshFbDtsg(defaultFuncs as any, _api as any, ctx);
        await refresh({});
      } catch (err) {
        console.warn("refreshFb_dtsg failed, continue with existing tokens", err);
      }
    };
    const runWithRetry = async (maxRetries = 2): Promise<unknown> => {
      await ensureFreshTokens();
      let lastError: unknown;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await executor();
        } catch (err) {
          lastError = err;
          if (attempt === maxRetries) break;
          const backoff = 500 * (attempt + 1);
          await new Promise((res) => setTimeout(res, backoff));
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    };

    runWithRetry()
      .then((resData: unknown) => {
        try {
          let data: unknown;

          if (
            resData &&
            typeof resData === "object" &&
            "data" in (resData as { data?: unknown })
          ) {
            data = (resData as { data?: unknown }).data;
          } else {
            data = resData;
          }

          if (typeof data === "object") {
            data = JSON.stringify(data, null, 2);
          } else {
            data = String(data ?? "");
          }

          cb(null, data as string);
        } catch (e) {
          cb(
            e instanceof Error
              ? e
              : new Error("Unexpected response format from httpPost")
          );
        }
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("httpPost", error);
        cb(error);
      });

    return returnPromise;
  };
}
