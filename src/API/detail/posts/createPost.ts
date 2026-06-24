"use strict";

import type { Context } from "@types";
import { getGUID } from "../../../utils/index";
import { isReadableStream } from "../../request/formatters";
import { getType, parseAndCheckLogin, type DefaultFuncs } from "../../request/formatters/helpers";

type Mention = {
  id: string;
  tag: string;
  fromIndex?: number;
};

type CreatePostMessage = {
  body?: unknown;
  attachment?: unknown | unknown[];
  url?: string;
  groupID?: string;
  allowUserID?: string | string[];
  baseState?: number;
  mentions?: Mention | Mention[];
  [key: string]: unknown;
};

interface ComposerMessageRange {
  entity: { id: string };
  length: number;
  offset: number;
}

interface ComposerMessage {
  ranges: ComposerMessageRange[];
  text: string;
}

interface ComposerInput {
  composer_entry_point: string;
  composer_source_surface: string;
  composer_type: string;
  idempotence_token: string;
  source: string;
  attachments: Array<Record<string, unknown>>;
  audience:
  | {
    to_id: string;
  }
  | {
    privacy: {
      allow: string[];
      base_state: string;
      deny: unknown[];
      tag_expansion_state: string;
    };
  };
  message: ComposerMessage;
  with_tags_ids: string[];
  inline_activities: unknown[];
  explicit_place_id: number;
  text_format_preset_id: number;
  logging: { composer_session_id: string };
  navigation_data: { attribution_id_v2: string };
  is_tracking_encrypted: boolean;
  tracking: unknown[];
  event_share_metadata: { surface: string };
  actor_id: string | number;
  client_mutation_id: string;
  [key: string]: unknown;
}

interface CreatePostForm {
  input: ComposerInput;
  [key: string]: unknown;
}

type CreatePostCallback = (err: unknown, url?: unknown) => void;

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (msg: unknown, callback?: CreatePostCallback) => Promise<unknown> {
  async function handleUpload(msg: CreatePostMessage, form: CreatePostForm): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const settle = (err?: unknown): void =>
        err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve();

      if (!msg.attachment) {
        settle();
        return;
      }

      const list = Array.isArray(msg.attachment)
        ? msg.attachment
        : [msg.attachment];

      const uploads: Array<Promise<unknown>> = [];

      for (const attachment of list) {
        if (!isReadableStream(attachment)) {
          settle(
            new Error(
              `Attachment should be a readable stream, not ${getType(attachment)}`
            )
          );
          return;
        }

        const vari: Record<string, unknown> = {
          source: 8,
          profile_id: ctx.userID,
          waterfallxapp: "comet",
          farr: attachment,
          upload_id: "jsc_c_6",
        };

        const p = defaultFuncs
          .postFormData(
            "https://upload.facebook.com/ajax/react_composer/attachments/photo/upload",
            ctx.jar,
            vari as unknown as Record<
              string,
              string | number | boolean | null | undefined
            >
          )
          .then(parseAndCheckLogin(ctx, defaultFuncs))
          .then((res: unknown) => {
            const r = res as {
              error?: unknown;
              errors?: unknown;
              payload?: { photoID?: string | number };
            };
            if (r.error || r.errors) throw res;
            return r.payload;
          });

        uploads.push(p);
      }

      Promise.all(uploads)
        .then((resArr) => {
          for (const payload of resArr) {
            if (!payload) continue;
            const p = payload as { photoID?: string | number };
            if (!p.photoID) continue;
            form.input.attachments.push({
              photo: { id: p.photoID },
            });
          }
          settle();
        })
        .catch((err) => settle(err));
    });
  }

  async function handleUrl(msg: CreatePostMessage, form: CreatePostForm): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const settle = (err?: unknown): void =>
        err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve();

      if (!msg.url) {
        settle();
        return;
      }

      const vari: Record<string, unknown> = {
        feedLocation: "FEED_COMPOSER",
        focusCommentID: null,
        goodwillCampaignId: "",
        goodwillCampaignMediaIds: [],
        goodwillContentType: null,
        params: { url: msg.url },
        privacySelectorRenderLocation: "COMET_COMPOSER",
        renderLocation: "composer_preview",
        parentStoryID: null,
        scale: 1,
        useDefaultActor: false,
        shouldIncludeStoryAttachment: false,
        __relay_internal__pv__IsWorkUserrelayprovider: false,
        __relay_internal__pv__IsMergQAPollsrelayprovider: false,
      };

      defaultFuncs
        .post("https://www.facebook.com/api/graphql/", ctx.jar, {
          fb_api_req_friendly_name: "ComposerLinkAttachmentPreviewQuery",
          variables: JSON.stringify(vari),
          server_timestamps: true,
          doc_id: "6549975235094234",
        })
        .then(parseAndCheckLogin(ctx, defaultFuncs))
        .then((res: unknown) => {
          const outArr = Array.isArray(res) ? res : [res];
          const out = (outArr[0] ?? res) as {
            data?: { link_preview?: { share_scrape_data?: string | null } };
          };
          const lp = out.data?.link_preview;
          if (!lp) throw out;
          const shareData = lp.share_scrape_data || "{}";
          const s = JSON.parse(shareData) as { share_type?: number };
          if (s.share_type === 400) throw new Error("url is not accepted");

          form.input.attachments.push({
            link: { share_scrape_data: lp.share_scrape_data },
          });
          settle();
        })
        .catch((err) => settle(err));
    });
  }

  function handleMention(msg: CreatePostMessage, form: CreatePostForm): void {
    if (!msg.mentions) return;

    const text =
      (form &&
        form.input &&
        form.input.message &&
        typeof form.input.message.text === "string" &&
        form.input.message.text) ||
      "";

    const arr: Mention[] = Array.isArray(msg.mentions)
      ? (msg.mentions as Mention[])
      : [msg.mentions as Mention];

    for (const mention of arr) {
      const { id, tag, fromIndex } = mention || ({} as Mention);
      if (typeof tag !== "string") {
        throw new Error("Mention tag must be string");
      }
      if (!id) {
        throw new Error("id must be string");
      }
      const offset = text.indexOf(tag, fromIndex || 0);
      if (offset < 0) {
        throw new Error(
          `Mention for "${tag}" not found in message string.`
        );
      }
      form.input.message.ranges.push({
        entity: { id },
        length: tag.length,
        offset,
      });
    }
  }

  async function createContent(vari: CreatePostForm): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const settle = (err?: unknown, data?: unknown): void =>
        err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve(data);

      defaultFuncs
        .post("https://www.facebook.com/api/graphql/", ctx.jar, {
          fb_api_req_friendly_name: "ComposerStoryCreateMutation",
          variables: JSON.stringify(vari),
          server_timestamps: true,
          doc_id: "6255089511280268",
        })
        .then(parseAndCheckLogin(ctx, defaultFuncs))
        .then((res: unknown) => settle(undefined, res))
        .catch((err: unknown) => settle(err));
    });
  }

  return function createPost(
    rawMsg: unknown,
    callback?: CreatePostCallback
  ): Promise<unknown> {
    let resolveFunc: (value: unknown) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const rt = new Promise<unknown>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    const settle = (err?: unknown, url?: unknown): void =>
      err ? rejectFunc(err) : resolveFunc(url);

    const cb = typeof callback === "function" ? callback : null;

    if (typeof rawMsg === "function") {
      const error = "Msg must be a string or object and not function";

      console.error("createPost", error);
      cb?.(error);
      settle(error);
      return rt;
    }

    const typeMsg = getType(rawMsg);
    if (!["Object", "String"].includes(typeMsg)) {
      const error = `Msg must be a string or object and not ${typeMsg}`;

      console.error("createPost", error);
      cb?.(error);
      settle(error);
      return rt;
    }

    let msg: CreatePostMessage =
      typeMsg === "String" ? { body: rawMsg as string } : (rawMsg as CreatePostMessage);

    if (msg.allowUserID !== undefined) {
      if (Array.isArray(msg.allowUserID)) {
        msg.allowUserID = msg.allowUserID.filter((id): id is string => typeof id === "string");
      } else if (typeof msg.allowUserID === "string") {
        msg.allowUserID = [msg.allowUserID];
      } else {
        msg.allowUserID = undefined;
      }
    }

    const sessionID = getGUID();
    const base = ["EVERYONE", "FRIENDS", "SELF"] as const;

    const form: CreatePostForm = {
      input: {
        composer_entry_point:
          !msg.groupID && msg.url ? "share_modal" : "inline_composer",
        composer_source_surface:
          !msg.groupID && msg.url
            ? "feed_story"
            : msg.groupID
              ? "group"
              : "timeline",
        composer_type:
          !msg.groupID && msg.url
            ? "share"
            : msg.groupID
              ? "group"
              : "timeline",
        idempotence_token: `${sessionID}_FEED`,
        source: "WWW",
        attachments: [],
        audience: msg.groupID
          ? { to_id: String(msg.groupID) }
          : {
            privacy: {
              allow: (msg.allowUserID as string[] | null) || [],
              base_state:
                msg.allowUserID && (msg.allowUserID as string[]).length > 0
                  ? base[2]
                  : base[Math.max(0, ((msg.baseState as number | undefined) || 1) - 1)] ||
                  base[0],
              deny: [],
              tag_expansion_state: "UNSPECIFIED",
            },
          },
        message: {
          ranges: [],
          text: msg.body
            ? typeof msg.body === "object"
              ? JSON.stringify(msg.body, null, 2)
              : String(msg.body)
            : "",
        },
        with_tags_ids: [],
        inline_activities: [],
        explicit_place_id: 0,
        text_format_preset_id: 0,
        logging: { composer_session_id: sessionID },
        navigation_data: {
          attribution_id_v2: msg.groupID
            ? `CometGroupDiscussionRoot.react,comet.group,tap_search_bar,${Date.now()},909538,2361831622,`
            : `ProfileCometTimelineListViewRoot.react,comet.profile.timeline.list,via_cold_start,${Date.now()},796829,190055527696468,`,
        },
        is_tracking_encrypted: !!msg.url,
        tracking: [],
        event_share_metadata: { surface: "newsfeed" },
        actor_id: ctx.userID,
        client_mutation_id: Math.round(Math.random() * 19).toString(),
      },
      displayCommentsFeedbackContext: null,
      displayCommentsContextEnableComment: null,
      displayCommentsContextIsAdPreview: null,
      displayCommentsContextIsAggregatedShare: null,
      displayCommentsContextIsStorySet: null,
      feedLocation: msg.groupID ? "GROUP" : "TIMELINE",
      feedbackSource: 0,
      focusCommentID: null,
      gridMediaWidth: 230,
      groupID: null,
      scale: 1,
      privacySelectorRenderLocation: "COMET_STREAM",
      renderLocation: msg.groupID ? "group" : "timeline",
      useDefaultActor: false,
      inviteShortLinkKey: null,
      isFeed: false,
      isFundraiser: false,
      isFunFactPost: false,
      isGroup: !!msg.groupID,
      isEvent: false,
      isTimeline: !msg.groupID,
      isSocialLearning: false,
      isPageNewsFeed: false,
      isProfileReviews: false,
      isWorkSharedDraft: false,
      UFI2CommentsProvider_commentsKey: msg.groupID
        ? "CometGroupDiscussionRootSuccessQuery"
        : "ProfileCometTimelineRoute",
      hashtag: null,
      canUserManageOffers: false,
      __relay_internal__pv__CometUFIIsRTAEnabledrelayprovider: false,
      __relay_internal__pv__IsWorkUserrelayprovider: false,
      __relay_internal__pv__IsMergQAPollsrelayprovider: false,
      __relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider: false,
      __relay_internal__pv__StoriesRingrelayprovider: false,
    };

    handleUpload(msg, form)
      .then(() => handleUrl(msg, form))
      .then(() => {
        handleMention(msg, form);
      })
      .then(() => createContent(form))
      .then((res) => {
        const outArr = Array.isArray(res) ? res : [res];
        const out = (outArr[0] ?? res) as {
          data?: {
            story_create?: { story?: unknown };
          };
          errors?: Array<unknown>;
          error?: unknown;
        };
        const data = out.data;
        const url = data?.story_create?.story;
        if (url) {
          cb?.(null, url);
          settle(undefined, url);
          return;
        }
        const err =
          out.errors?.[0] ||
          out.error ||
          new Error("Post failed");
        cb?.(err);
        settle(err);
      })
      .catch((err) => {

        console.error("createPost", err);
        cb?.(err);
        settle(err);
      });

    return rt;
  };
}
