import type { DefaultFuncs, MQTTContext } from "@core/types";

type Callback = (err: Error | null, data?: unknown) => void;

type SetThemeMethod = ((
  themeID: string,
  threadID: string,
  callback?: Callback
) => Promise<unknown>) & {
  setThemeFromImage?: (
    imagePath: string | Buffer,
    threadID: string,
    callback?: Callback
  ) => Promise<unknown>;
};

export default function setThemeFromImage(
  _defaultFuncs: DefaultFuncs,
  api: Record<string, unknown>,
  _ctx: MQTTContext
): (
  imagePath: string | Buffer,
  threadID: string,
  callback?: Callback
) => Promise<unknown> {
  return async function setThemeFromImageMethod(
    imagePath: string | Buffer,
    threadID: string,
    callback?: Callback
  ): Promise<unknown> {
    const setTheme = api?.setTheme as SetThemeMethod | undefined;

    if (typeof setTheme?.setThemeFromImage !== "function") {
      throw new Error("setThemeFromImage is unavailable. Ensure setTheme API loaded.");
    }

    return setTheme.setThemeFromImage(imagePath, threadID, callback);
  };
}
