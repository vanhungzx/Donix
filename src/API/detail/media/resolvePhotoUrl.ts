import logger from "@log";
import type { RequestClient as Client, Context, DefaultFuncs, FBResponse } from "@types";
import utils, { type DefaultFuncs as HelpersDefaultFuncs } from "../../request/formatters/helpers.js";

export default function (defaultFuncs: DefaultFuncs, _client: Client, ctx: Context): (photoID: string, callback?: (err?: any, url?: string) => void) => Promise<string | undefined> {
  return function resolvePhotoUrl(photoID: string, callback?: (err?: any, url?: string) => void): Promise<string | undefined> {
    let resolveFunc: (value?: string) => void = function () { };
    let rejectFunc: (reason?: any) => void = function () { };
    const returnPromise = new Promise<string | undefined>(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = function (err?: any, data?: string) {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };
    }

    defaultFuncs
      .get("https://www.facebook.com/mercury/attachments/photo", ctx.jar, { photo_id: photoID })
      .then((res: FBResponse<string> | unknown) => {
        // Type assertion to match the DefaultFuncs type expected by parseAndCheckLogin
        return utils.parseAndCheckLogin(ctx, defaultFuncs as unknown as HelpersDefaultFuncs)(res);
      })
      .then((resData: any) => {
        if (resData.error) throw resData;
        const photoUrl = resData.jsmods.require[0][3][0];
        return callback!(null, photoUrl);
      })
      .catch((err: any) => {
        logger.error(err);
        return callback!(err);
      });
    return returnPromise;
  };
};
