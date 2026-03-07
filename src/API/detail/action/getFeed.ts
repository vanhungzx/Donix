"use strict";

import type { Context } from "@types";
import { parseAndCheckLogin, type DefaultFuncs } from "../../request/formatters/helpers";

interface GetFeedOptions {
  variables?: Record<string, unknown>;
  docId?: string;
  friendlyName?: string;
}

type GetFeedCallback = (err: Error | null, data?: unknown) => void;

const DEFAULT_DOC_ID = "25193541597015170";
const DEFAULT_FRIENDLY_NAME = "CometModernHomeFeedQuery";

const HOME_FEED_INITIAL_VARS = {
  RELAY_INCREMENTAL_DELIVERY: true,
  connectionClass: "EXCELLENT",
  feedbackSource: 1,
  feedInitialFetchSize: 2,
  feedLocation: "NEWSFEED",
  feedStyle: "MOST_RECENT_FEED_DEFAULT",
  orderby: ["MOST_RECENT"],
  privacySelectorRenderLocation: "COMET_STREAM",
  recentVPVs: [] as any[],
  refreshMode: "COLD_START",
  renderLocation: "homepage_stream",
  scale: 1,
  shouldChangeBRSLabelFieldName: true,
  shouldObfuscateCategoryField: true,
  shouldUseBRSLabelFieldNameV1: true,
  shouldUseBRSLabelFieldNameV2: false,
  shouldUseBRSLabelFieldNameV3: false,
  useDefaultActor: false,
  __relay_internal__pv__GHLShouldChangeSponsoredAuctionDistanceFieldNamerelayprovider:
    false,
  __relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV1relayprovider:
    false,
  __relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV2relayprovider:
    false,
  __relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider: true,
  __relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider: true,
  __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider:
    false,
  __relay_internal__pv__IsWorkUserrelayprovider: false,
  __relay_internal__pv__TestPilotShouldIncludeDemoAdUseCaserelayprovider: false,
  __relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider:
    true,
  __relay_internal__pv__FeedDeepDiveTopicPillThreadViewEnabledrelayprovider: false,
  __relay_internal__pv__FBReels_enable_view_dubbed_audio_type_gkrelayprovider: true,
  __relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider:
    false,
  __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false,
  __relay_internal__pv__IsMergQAPollsrelayprovider: false,
  __relay_internal__pv__FBReels_enable_meta_ai_label_gkrelayprovider: true,
  __relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider:
    true,
  __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
  __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: true,
  __relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider:
    false,
  __relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider: true,
  __relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider: true,
  __relay_internal__pv__GroupsCometGYSJFeedItemHeightrelayprovider: 206,
  __relay_internal__pv__StoriesShouldIncludeFbNotesrelayprovider: false,
};

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (options?: GetFeedOptions | GetFeedCallback, callback?: GetFeedCallback) => Promise<unknown> {
  return function getFeed(
    options?: GetFeedOptions | GetFeedCallback,
    callback?: GetFeedCallback
  ): Promise<unknown> {
    let resolveFunc: (value: unknown) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<unknown>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (typeof options === "function") {
      callback = options as GetFeedCallback;
      options = {};
    }

    const opts = (options || {}) as GetFeedOptions;
    const cb: GetFeedCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      });

    const variables = {
      ...HOME_FEED_INITIAL_VARS,
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
        const resData = await defaultFuncs
          .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
          .then(parseAndCheckLogin(ctx, defaultFuncs));
        cb(null, resData);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        cb(error);
      }
    })();

    return returnPromise;
  };
}
