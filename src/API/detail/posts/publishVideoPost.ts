"use strict";

import logger from "@log";
import type { Context } from "@types";
import crypto from "crypto";
import { parseAndCheckLogin, type DefaultFuncs } from "../../request/formatters/helpers";

interface PublishVideoPostOptions {
  videoId: string;
  message?: string;
  baseState?: 1 | 2 | 3; // 1 EVERYONE | 2 FRIENDS | 3 SELF
  isFbShort?: boolean;
  enableRemix?: boolean;
  isReel?: boolean; // true for reel/short, false for regular video post
}

interface PublishVideoPostResult {
  post_id?: string | null;
  url?: string | null;
  story_id?: string | null;
  story?: unknown;
  publishing_flow?: string;
}

type Callback = (err: Error | null, data?: PublishVideoPostResult) => void;

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
) {
  return function publishVideoPost(
    options: PublishVideoPostOptions,
    callback?: Callback
  ): Promise<PublishVideoPostResult> {
    return new Promise(async (resolve, reject) => {
      const cb =
        callback ||
        ((err, data) => (err ? reject(err) : resolve(data!)));

      try {
        if (!options?.videoId) {
          throw new Error("videoId is required");
        }

        const sessionID = crypto.randomUUID();
        const isReel = options.isReel ?? false; // Default to regular video post
        const isFbShort = options.isFbShort ?? true;
        const enableRemix = options.enableRemix ?? false;

        const base = ["EVERYONE", "FRIENDS", "SELF"] as const;
        const baseState = base[Math.max(0, (options.baseState ?? 1) - 1)];

        /* ================= GRAPHQL VARIABLES ================= */
        // Build input object based on post type
        const input: any = {
          source: "WWW",
          idempotence_token: `${sessionID}_FEED`,
          message: {
            text: options.message || "",
            ranges: []
          },
          audience: {
            privacy: {
              base_state: baseState,
              allow: [],
              deny: [],
              tag_expansion_state: "UNSPECIFIED"
            }
          },
          logging: {
            composer_session_id: sessionID
          },
          navigation_data: {
            attribution_id_v2: `CometHomeRoot.react,comet.home,logo,${Date.now()},486380,4748854339,,`
          },
          tracking: [null],
          event_share_metadata: {
            surface: "newsfeed"
          },
          actor_id: ctx.userID,
          client_mutation_id: Date.now().toString()
        };

        // Video attachment structure
        const videoAttachment: any = {
          id: options.videoId,
          notify_when_processed: true,
          was_created_via_unified_video_flow: {
            was_created_via_unified_video_flow: true
          }
        };

        if (isReel) {
          // Reel/Short video post
          input.composer_entry_point = "comet_ap_plus_reel_composer_feed_sprout";
          input.composer_source_surface = "short_form_video";
          input.fb_shorts = {
            has_overridden_video_format: true,
            is_fb_short: isFbShort,
            remix_status: enableRemix ? "ENABLED" : "DISABLED"
          };
          input.with_tags_ids = null;
          input.reels_remix = {
            remix_status: enableRemix ? "ENABLED" : "DISABLED"
          };
          input.attachments = [{ video: videoAttachment }];
        } else {
          // Regular video post
          input.composer_entry_point = "inline_composer";
          input.composer_source_surface = "newsfeed";
          input.composer_type = "feed";
          input.inline_activities = [];
          input.text_format_preset_id = "0";
          input.publishing_flow = {
            supported_flows: ["ASYNC_SILENT", "ASYNC_NOTIF", "FALLBACK"]
          };
          videoAttachment.additional_video_metadata = {
            translatedAudioMetadata: []
          };
          videoAttachment.audio_descriptions = null;
          videoAttachment.transcriptions = null;
          input.attachments = [{ video: videoAttachment }];
        }

        const variables = {
          input,
          feedLocation: "NEWSFEED",
          feedbackSource: 1,
          focusCommentID: null,
          gridMediaWidth: null,
          groupID: null,
          scale: 1,
          privacySelectorRenderLocation: "COMET_STREAM",
          checkPhotosToReelsUpsellEligibility: isReel ? false : true,
          renderLocation: "homepage_stream",
          useDefaultActor: false,
          inviteShortLinkKey: null,
          isFeed: true,
          isFundraiser: false,
          isFunFactPost: false,
          isGroup: false,
          isEvent: false,
          isTimeline: false,
          isSocialLearning: false,
          isPageNewsFeed: false,
          isProfileReviews: false,
          isWorkSharedDraft: false,
          hashtag: null,
          canUserManageOffers: false,
          __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: true,
          __relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider: false,
          __relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider: false,
          __relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider: false,
          __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: true,
          __relay_internal__pv__IsWorkUserrelayprovider: false,
          __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
          __relay_internal__pv__TestPilotShouldIncludeDemoAdUseCaserelayprovider: false,
          __relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider: true,
          __relay_internal__pv__FeedDeepDiveTopicPillThreadViewEnabledrelayprovider: false,
          __relay_internal__pv__FBReels_enable_view_dubbed_audio_type_gkrelayprovider: true,
          __relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider: false,
          __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false,
          __relay_internal__pv__IsMergQAPollsrelayprovider: false,
          __relay_internal__pv__FBReels_enable_meta_ai_label_gkrelayprovider: true,
          __relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider: true,
          __relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider: false,
          __relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider: true,
          __relay_internal__pv__GroupsCometGYSJFeedItemHeightrelayprovider: 206,
          __relay_internal__pv__StoriesShouldIncludeFbNotesrelayprovider: false,
          __relay_internal__pv__GHLShouldChangeSponsoredAuctionDistanceFieldNamerelayprovider: false,
          __relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV1relayprovider: false,
          __relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV2relayprovider: false
        };

        const form = {
          fb_api_caller_class: "RelayModern",
          fb_api_req_friendly_name: "ComposerStoryCreateMutation",
          server_timestamps: true,
          doc_id: "24764210143255956",
          variables: JSON.stringify(variables)
        };

        logger.info(
          `[publishVideoPost] Publish ${isReel ? "reel" : "video"} | videoId=${options.videoId}`
        );

        const res = await defaultFuncs
          .post("https://www.facebook.com/api/graphql/", ctx.jar, form, ctx, {
            "x-fb-friendly-name": "ComposerStoryCreateMutation"
          })
          .then(parseAndCheckLogin(ctx, defaultFuncs));

        const out = Array.isArray(res) ? res[0] : res;
        const storyCreate = out?.data?.story_create;
        const story = storyCreate?.story;
        const storyId = storyCreate?.story_id;
        const postId = storyCreate?.post_id;

        // Check for errors first
        if (out?.errors && Array.isArray(out.errors) && out.errors.length > 0) {
          throw new Error(
            `Publish failed: ${JSON.stringify(out.errors)}`
          );
        }

        // Success if we have story_id (even if story is null, it might be processing)
        if (!storyId && !story) {
          throw new Error(
            `Publish failed: ${JSON.stringify(out?.errors || out)}`
          );
        }

        // If story exists, use it; otherwise use story_id
        const result: PublishVideoPostResult = {
          post_id: postId || story?.id || null,
          url: story?.url || null,
          story_id: storyId || null,
          story: story || storyCreate || null,
          publishing_flow: storyCreate?.publishing_flow || null
        };

        logger.success(
          `[publishVideoPost] SUCCESS | post_id=${result.post_id || "null"}, story_id=${result.story_id || "null"}, publishing_flow=${result.publishing_flow || "N/A"}`
        );

        cb(null, result);
      } catch (e: any) {
        logger.error(
          `[publishVideoPost] FAILED | ${e?.message || e}`
        );
        cb(e instanceof Error ? e : new Error(String(e)));
      }
    });
  };
}
