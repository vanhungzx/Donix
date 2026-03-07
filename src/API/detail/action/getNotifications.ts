"use strict";

import logger from "@log";
import type { Context } from "@types";
import fs from "fs";
import { parseAndCheckLogin, type DefaultFuncs } from "../../request/formatters/helpers";
interface GetNotificationsOptions {
  count?: number;
  environment?: string;
  scale?: number;
  variables?: Record<string, unknown>;
  docId?: string;
  friendlyName?: string;
}

// Notification response interfaces
export interface NotificationActor {
  id?: string;
  name?: string;
  profile_picture?: {
    uri?: string;
  };
  __typename?: string;
}

export interface NotificationContext {
  id?: string;
  name?: string;
  url?: string;
  __typename?: string;
}

export interface NotificationStoryAttachment {
  id?: string;
  media?: {
    image?: {
      uri?: string;
    };
    __typename?: string;
  };
  __typename?: string;
}

export interface FormattedNotification {
  id: string;
  text: string;
  timestamp: number;
  is_unread: boolean;
  actors: NotificationActor[];
  context?: NotificationContext;
  story_attachment?: NotificationStoryAttachment;
  href?: string;
  __typename?: string;
}

export interface GetNotificationsResult {
  notifications: FormattedNotification[];
  unread_count?: number;
  has_more?: boolean;
}

type GetNotificationsCallback = (err: Error | null, data?: GetNotificationsResult) => void;

const DEFAULT_DOC_ID = "24990798757270842";
const DEFAULT_FRIENDLY_NAME = "CometNotificationsDropdownQuery";

const NOTIFICATIONS_INITIAL_VARS = {
  count: 15,
  environment: "MAIN_SURFACE",
  scale: 1,
};

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (options?: GetNotificationsOptions | GetNotificationsCallback, callback?: GetNotificationsCallback) => Promise<GetNotificationsResult> {
  return function getNotifications(
    options?: GetNotificationsOptions | GetNotificationsCallback,
    callback?: GetNotificationsCallback
  ): Promise<GetNotificationsResult> {
    let resolveFunc: (value: GetNotificationsResult) => void = () => { };
    let rejectFunc: (reason?: unknown) => void = () => { };

    const returnPromise = new Promise<GetNotificationsResult>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (typeof options === "function") {
      callback = options as GetNotificationsCallback;
      options = {};
    }

    const opts = (options || {}) as GetNotificationsOptions;
    const cb: GetNotificationsCallback =
      callback ||
      ((err, data) => {
        if (err) return rejectFunc(err);
        if (data) resolveFunc(data);
        else rejectFunc(new Error("No data returned"));
      });

    const variables = {
      ...NOTIFICATIONS_INITIAL_VARS,
      ...(opts.count !== undefined && { count: opts.count }),
      ...(opts.environment && { environment: opts.environment }),
      ...(opts.scale !== undefined && { scale: opts.scale }),
      ...(opts.variables || {}),
    };

    const form = {
      av: ctx.userID,
      fb_api_req_friendly_name: DEFAULT_FRIENDLY_NAME,
      fb_api_caller_class: "RelayModern",
      doc_id: DEFAULT_DOC_ID,
      server_timestamps: true,
      variables: JSON.stringify(variables),
    };

    (async () => {
      try {
        const resData = await defaultFuncs
          .post("https://www.facebook.com/api/graphql/", ctx.jar, form).then(parseAndCheckLogin(ctx, defaultFuncs));
        const outArr = Array.isArray(resData) ? resData : [resData];
        const out = (outArr[0] ?? resData) as {
          data?: {
            viewer?: {
              actor?: {
                notifications?: {
                  edges?: Array<{
                    node?: {
                      id?: string;
                      text?: string;
                      timestamp?: number;
                      is_unread?: boolean;
                      actors?: Array<NotificationActor>;
                      context?: NotificationContext;
                      story_attachment?: NotificationStoryAttachment;
                      href?: string;
                      __typename?: string;
                    };
                  }>;
                  page_info?: {
                    has_next_page?: boolean;
                  };
                };
                unread_notification_count?: number;
              };
              // Newer/alternate response shape (Comet notifications page query)
              notifications_page?: {
                edges?: Array<{
                  node?: {
                    __typename?: string;
                    row_type?: string;
                    notif?: {
                      id?: string;
                      notif_id?: string;
                      seen_state?: string;
                      creation_time?: { timestamp?: number };
                      body?: { text?: string };
                      url?: string;
                      // Some shapes also have these, keep optional:
                      href?: string;
                      actors?: Array<NotificationActor>;
                      context?: NotificationContext;
                      story_attachment?: NotificationStoryAttachment;
                      __typename?: string;
                    };
                  };
                }>;
                page_info?: {
                  has_next_page?: boolean;
                };
              };
              notifications_unseen_count?: number;
            };
          };
          errors?: Array<unknown>;
          error?: unknown;
        };

        if (out.errors || out.error) {
          const errorMsg = `Failed to get notifications: ${JSON.stringify(out.errors || out.error)}`;
          throw new Error(errorMsg);
        }
        fs.writeFileSync("notifications.json", JSON.stringify(out, null, 2));

        // Prefer notifications_page shape if present; fallback to older actor.notifications shape.
        const pageEdges = out.data?.viewer?.notifications_page?.edges || [];
        const legacyEdges = out.data?.viewer?.actor?.notifications?.edges || [];

        const formattedFromPage: FormattedNotification[] = pageEdges
          .map((edge) => {
            const notif = edge?.node?.notif;
            // Skip non-notification rows (bucket headers, etc.)
            if (!notif || !(notif.id || notif.notif_id)) return null;

            const seenState = notif.seen_state || "";
            const isUnread = seenState.includes("UNREAD");
            const timestamp = notif.creation_time?.timestamp || 0;
            const text = notif.body?.text || "";
            const href = notif.url || notif.href;

            const notification: FormattedNotification = {
              id: notif.id || String(notif.notif_id),
              text,
              timestamp,
              is_unread: isUnread,
              actors: notif.actors || [],
            };

            if (notif.context) notification.context = notif.context;
            if (notif.story_attachment) notification.story_attachment = notif.story_attachment;
            if (href) notification.href = href;
            if (notif.__typename) notification.__typename = notif.__typename;

            return notification;
          })
          .filter((n): n is FormattedNotification => n !== null);

        const formattedFromLegacy: FormattedNotification[] = legacyEdges
          .map((edge) => {
            const node = edge?.node;
            if (!node || !node.id) return null;

            const notification: FormattedNotification = {
              id: node.id,
              text: node.text || "",
              timestamp: node.timestamp || 0,
              is_unread: node.is_unread || false,
              actors: node.actors || [],
            };

            if (node.context) notification.context = node.context;
            if (node.story_attachment) notification.story_attachment = node.story_attachment;
            if (node.href) notification.href = node.href;
            if (node.__typename) notification.__typename = node.__typename;

            return notification;
          })
          .filter((n): n is FormattedNotification => n !== null);

        const formattedNotificationsRaw = formattedFromPage.length > 0 ? formattedFromPage : formattedFromLegacy;
        // Normalize ordering to newest-first (API can include non-notification rows or mixed ordering)
        const formattedNotifications = [...formattedNotificationsRaw].sort(
          (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
        );

        const unreadCount =
          out.data?.viewer?.notifications_unseen_count ??
          out.data?.viewer?.actor?.unread_notification_count ??
          formattedNotifications.filter((n) => n.is_unread).length;

        const hasMore =
          out.data?.viewer?.notifications_page?.page_info?.has_next_page ??
          out.data?.viewer?.actor?.notifications?.page_info?.has_next_page ??
          false;

        const result: GetNotificationsResult = {
          notifications: formattedNotifications,
          unread_count: unreadCount,
          has_more: hasMore,
        };
        logger.info(`[getNotifications] Successfully fetched ${formattedNotifications.length} notifications`);
        cb(null, result);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        cb(error);
      }
    })();

    return returnPromise;
  };
}
