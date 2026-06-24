import logger from "@log";
import utils, { Client, Context, DefaultFuncs } from "../../request/formatters/helpers.js";

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
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
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
