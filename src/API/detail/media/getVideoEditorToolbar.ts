"use strict";

import logger from "@log";
import type { Context } from "@types";
import { parseAndCheckLogin, type DefaultFuncs } from "../../request/formatters/helpers";

interface GetVideoEditorToolbarOptions {
  videoId: string;
  pageId?: string;
  groupId?: string;
  isInGroup?: boolean;
  variables?: Record<string, unknown>;
  docId?: string;
  friendlyName?: string;
}

type GetVideoEditorToolbarCallback = (err: Error | null, data?: unknown) => void;

const DEFAULT_DOC_ID = "24221556964187410";
const DEFAULT_FRIENDLY_NAME = "CometVideoEditorToolbarQuery";

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (
  options: GetVideoEditorToolbarOptions | GetVideoEditorToolbarCallback,
  callback?: GetVideoEditorToolbarCallback
) => Promise<unknown> {
  return function getVideoEditorToolbar(
    options?: GetVideoEditorToolbarOptions | GetVideoEditorToolbarCallback,
    callback?: GetVideoEditorToolbarCallback
  ): Promise<unknown> {
    let resolveFunc: (value: unknown) => void = () => {};
    let rejectFunc: (reason?: unknown) => void = () => {};

    const returnPromise = new Promise<unknown>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (typeof options === "function") {
      callback = options as GetVideoEditorToolbarCallback;
      options = {} as GetVideoEditorToolbarOptions;
    }

    const opts = (options || {}) as GetVideoEditorToolbarOptions;

    if (!opts.videoId) {
      const error = new Error("videoId is required");
      logger.error(`[getVideoEditorToolbar] ${error.message}`);
      callback?.(error);
      rejectFunc(error);
      return returnPromise;
    }

    const cb: GetVideoEditorToolbarCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      });

    const pageId = opts.pageId || ctx.userID;
    const pageIdAsString = String(pageId);
    const groupId = opts.groupId || "";
    const isInGroup = opts.isInGroup ?? false;

    const variables = {
      page_id: pageId,
      page_id_as_string: pageIdAsString,
      video_id: opts.videoId,
      group_id: groupId,
      is_in_group: isInGroup,
      ...(opts.variables || {}),
    };

    const form = {
      av: ctx.userID,
      fb_api_req_friendly_name: opts.friendlyName || DEFAULT_FRIENDLY_NAME,
      fb_api_caller_class: "RelayModern",
      doc_id: opts.docId || DEFAULT_DOC_ID,
      server_timestamps: true,
      variables: JSON.stringify(variables),
    };

    (async () => {
      try {
        logger.info(
          `[getVideoEditorToolbar] Querying video editor toolbar - videoId: ${opts.videoId}, pageId: ${pageId}, groupId: ${groupId || "N/A"}`
        );

        const resData = await defaultFuncs
          .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
          .then(parseAndCheckLogin(ctx, defaultFuncs));

        logger.info(`[getVideoEditorToolbar] Query successful - hasData: ${!!resData}`);

        cb(null, resData);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[getVideoEditorToolbar] Query failed - ${error.message}${error.stack ? `\nStack: ${error.stack}` : ""}`);
        cb(error);
      }
    })();

    return returnPromise;
  };
}
