"use strict";

import type { Context } from "@types";
import { parseAndCheckLogin, type DefaultFuncs } from "../../request/formatters/helpers";

interface ThemeRaw {
  id?: string;
  accessibility_label?: string;
  [key: string]: unknown;
}

interface GetThemeResponse {
  errors?: unknown;
  data?: {
    messenger_thread_themes?: ThemeRaw[];
  };
}

export interface SimpleTheme {
  id: string;
  name: string;
}

type GetThemeCallback = (err: Error | null, data?: SimpleTheme[]) => void;

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (callback?: GetThemeCallback) => Promise<SimpleTheme[]> {
  return function getTheme(callback?: GetThemeCallback): Promise<SimpleTheme[]> {
    let resolveFunc: (value: SimpleTheme[]) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<SimpleTheme[]>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    const cb: GetThemeCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data || []);
      });

    const form = {
      av: ctx.userID,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "MWPThreadThemeQuery_AllThemesQuery",
      doc_id: "24474714052117636",
      variables: JSON.stringify({
        version: "default",
      }),
      server_timestamps: true,
    };

    (async () => {
      try {
        const resData = (await defaultFuncs
          .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
          .then(parseAndCheckLogin(ctx, defaultFuncs))) as GetThemeResponse;

        if (resData.errors) throw resData;

        const themes = resData.data?.messenger_thread_themes || [];

        const result: SimpleTheme[] = themes
          .filter((theme): theme is ThemeRaw & { id: string; accessibility_label: string } => {
            return Boolean(theme && typeof theme.id === "string");
          })
          .map((theme) => ({
            id: theme.id as string,
            name: (theme.accessibility_label || "") as string,
          }));

        cb(null, result);
      } catch (err) {
        console.error("getTheme", err);
        const error = err instanceof Error ? err : new Error(String(err));
        cb(error);
      }
    })();

    return returnPromise;
  };
}
