"use strict";

import type { Context } from "@types";
import { getType, parseAndCheckLogin, type DefaultFuncs } from "../../request/formatters/helpers";

type CreateThemeAICallback = (
  err: Error | null,
  data?: GeneratedTheme
) => void;

interface GenerateAIThemeInput {
  client_mutation_id: string;
  actor_id: string;
  bypass_cache: boolean;
  caller: string;
  num_themes: number;
  prompt: string;
}

interface GenerateAIThemeVariables {
  input: GenerateAIThemeInput;
}

interface ThemeBackgroundImage {
  url: string;
}

interface ThemeBackgroundAsset {
  id: string;
  image: ThemeBackgroundImage;
}

export interface GeneratedTheme {
  id: string;
  accessibility_label: string;
  background_asset: ThemeBackgroundAsset;
}

interface GenerateAIThemeResponse {
  errors?: unknown;
  data?: {
    xfb_generate_ai_themes_from_prompt?: {
      themes?: Array<{
        id: string;
        accessibility_label: string;
        background_asset: {
          id: string;
          image: {
            uri: string;
          };
        };
      }>;
    };
  };
}

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (
  prompt: string,
  callback?: CreateThemeAICallback
) => Promise<GeneratedTheme> {
  return function createThemeAI(
    prompt: string,
    callback?: CreateThemeAICallback
  ): Promise<GeneratedTheme> {
    let resolveFunc: (value: GeneratedTheme) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<GeneratedTheme>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    const cb: CreateThemeAICallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        if (data) resolveFunc(data);
      });

    if (getType(prompt) !== "String") {
      cb(new Error("Invalid prompt"));
      return returnPromise;
    }

    const variables: GenerateAIThemeVariables = {
      input: {
        client_mutation_id: Math.round(Math.random() * 19).toString(),
        actor_id: ctx.userID,
        bypass_cache: true,
        caller: "MESSENGER",
        num_themes: 1,
        prompt,
      },
    };

    const form = {
      av: ctx.userID,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "useGenerateAIThemeMutation",
      doc_id: "23873748445608673",
      variables: JSON.stringify(variables),
      server_timestamps: true,
    };

    (async () => {
      try {
        const resData = (await defaultFuncs
          .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
          .then(parseAndCheckLogin(ctx, defaultFuncs))) as GenerateAIThemeResponse;

        if (resData.errors) throw resData;

        const themes =
          resData.data?.xfb_generate_ai_themes_from_prompt?.themes ?? [];
        if (!themes.length) {
          throw new Error("No themes generated from AI prompt");
        }

        const first = themes[0];
        if (!first) {
          throw new Error("No themes generated from AI prompt");
        }

        const result: GeneratedTheme = {
          id: first.id,
          accessibility_label: first.accessibility_label,
          background_asset: {
            id: first.background_asset.id,
            background_asset: undefined as never,
          } as unknown as ThemeBackgroundAsset,
        };


        result.background_asset = {
          id: first.background_asset.id,
          image: {
            url: first.background_asset.image.uri,
          },
        };

        cb(null, result);
      } catch (err) {
        console.error("createThemeAI", err);
        const error = err instanceof Error ? err : new Error(String(err));
        cb(error);
      }
    })();

    return returnPromise;
  };
}
