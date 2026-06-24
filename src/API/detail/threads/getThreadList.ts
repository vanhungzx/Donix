"use strict";

import { type Context, type DefaultFuncs, formatID, getType, parseAndCheckLogin } from "../../request/formatters/helpers";

interface MessagingActor {
  __typename?: string;
  id?: string | number;
  name?: string;
  url?: string;
  username?: string;
  big_image_src?: { uri?: string };
  short_name?: string;
  gender?: string | null;
  is_viewer_friend?: boolean;
  is_messenger_user?: boolean;
  is_verified?: boolean;
  is_viewer_coworker?: boolean;
  is_employee?: boolean;
  work_info?: unknown;
  work_foreign_entity_info?: unknown;
  scim_company_user?: unknown;
  is_aloha_proxy_confirmed?: boolean;
  accepts_messenger_user_feedback?: boolean;
  is_messenger_platform_bot?: boolean;
  is_business_page_active?: boolean;
  is_message_blocked_by_viewer?: boolean;
  admin_type?: string | null;
  [key: string]: unknown;
}

interface ParticipantEdge {
  node?: { messaging_actor?: MessagingActor };
  messaging_actor?: MessagingActor;
  admin_type?: string | null;
}

interface ParticipantWrapper {
  edges: ParticipantEdge[];
}

interface CustomizationInfo {
  emoji?: string | null;
  outgoing_bubble_color?: string | null;
  participant_customizations?: Array<{
    participant_id: string | number;
    nickname?: string | null;
  }>;
}

interface ReadReceiptNode {
  watermark?: number | string;
  action?: string;
  actor?: { id?: string | number };
}

interface DeliveryReceiptNode {
  timestamp_precise?: string | number;
}

interface ThreadAdmin {
  id: string | number;
}

interface LastMessageActor {
  id?: string | number;
}

interface LastMessageSender {
  messaging_actor?: LastMessageActor;
}

interface LastMessageNode {
  snippet?: string | null;
  extensible_attachment?: unknown;
  message_sender?: LastMessageSender;
  timestamp_precise?: string | number;
}

interface ThreadNode {
  thread_key?: {
    thread_fbid?: string | number;
    other_user_id?: string | number;
  };
  name?: string | null;
  all_participants?: ParticipantWrapper;
  last_message?: { nodes?: LastMessageNode[] };
  read_receipts?: { nodes?: ReadReceiptNode[] };
  delivery_receipts?: { nodes?: DeliveryReceiptNode[] };
  unread_count?: number;
  messages_count?: number;
  image?: { uri?: string | null };
  square_image?: { uri?: string | null };
  customization_info?: CustomizationInfo | null;
  mute_until?: number;
  thread_admins?: ThreadAdmin[];
  folder?: string | null;
  thread_type?: string;
  montage_thread?: { id: string };
  reactions_mute_mode?: string;
  mentions_mute_mode?: string;
  has_viewer_archived?: boolean;
  is_viewer_subscribed?: boolean;
  updated_time_precise?: string | number;
  last_read_receipt?: { nodes?: Array<{ timestamp_precise?: string | number }> };
  cannot_reply_reason?: string | null;
  approval_mode?: boolean;
  joinable_mode?: { mode?: string; link?: string | null };
  is_pinned?: boolean;
  is_pin_protected?: boolean;
  thread_queue_enabled?: boolean;
  group_thread_subtype?: string | null;
  admin_model_status_string?: string | null;
  description?: string | null;
  is_business_page_active?: boolean;
  rtc_call_data?: unknown;
  privacy_mode?: string | null;
  thread_unsendability_status?: string | null;
  thread_pin_timestamp?: number;
  conversion_detection_data?: unknown;
  thread_theme?: unknown;
  customization_enabled?: boolean;
  participant_add_mode_as_string?: string | null;
}

interface ThreadListViewer {
  message_threads?: { nodes: ThreadNode[] };
}

type ThreadListResponse =
  | Array<{
    o0?: {
      data?: { viewer?: ThreadListViewer };
      error_results?: number;
      successful_results?: number;
      errors?: unknown;
    };
    error_results?: number;
    successful_results?: number;
  }>
  | {
    o0?: {
      data?: { viewer?: ThreadListViewer };
      error_results?: number;
      successful_results?: number;
      errors?: unknown;
    };
    error_results?: number;
    successful_results?: number;
  };

export interface FormattedParticipant {
  accountType?: string;
  userID: string;
  name?: string;
  url?: string;
  profilePicture?: string;
  username?: string | null;
  isMessageBlockedByViewer?: boolean;
  adminType?: string | null;
  [key: string]: unknown;
}

export interface FormattedThread {
  threadID: string | null;
  name?: string | null;
  unreadCount: number;
  messageCount: number;
  imageSrc: string | null;
  squareImage: string | null;
  emoji: string | null;
  color: string | null | undefined;
  threadTheme: unknown;
  nicknames: Array<{ userID: string; nickname?: string | null }>;
  muteUntil: number;
  participants: FormattedParticipant[];
  adminIDs: string[];
  folder: string | null;
  isGroup: boolean;
  customizationEnabled: boolean;
  participantAddMode: string | null;
  montageThread: string | null;
  reactionsMuteMode: string;
  mentionsMuteMode: string;
  isArchived: boolean;
  isSubscribed: boolean;
  timestamp?: string | number;
  snippet: string | null | undefined;
  snippetAttachments: unknown;
  snippetSender: string | null;
  lastMessageTimestamp?: string | number | null;
  lastReadTimestamp?: string | number | null;
  cannotReplyReason: string | null;
  approvalMode: boolean;
  participantIDs: string[];
  threadType: number;
  inviteLink: {
    enable: boolean;
    link: string | null;
  };
  readReceipts: Array<{
    watermark?: number | string;
    action?: string;
    actorID: string;
  }>;
  deliveryReceipts: Array<{
    timestamp?: string | number;
  }>;
  isPinned: boolean;
  isPinProtected: boolean;
  threadQueueEnabled: boolean;
  groupThreadSubtype: string | null;
  adminModelStatus: string | null;
  description: string | null;
  isBusinessPageActive: boolean;
  rtcCallData: unknown;
  privacyMode: string | null;
  threadUnsendabilityStatus: string | null;
  threadPinTimestamp: number;
  conversionDetectionData: unknown;
}

const createProfileUrl = (
  url?: string,
  username?: string | null,
  id?: string | number
): string =>
  url || `https://www.facebook.com/${username || formatID(String(id ?? ""))}`;

const formatParticipants = (participants: ParticipantWrapper): FormattedParticipant[] =>
  participants.edges.map((edge) => {
    const p: MessagingActor | undefined =
      edge.node?.messaging_actor || edge.messaging_actor;

    const baseFields: FormattedParticipant = {
      accountType: p?.__typename,
      userID: formatID(String(p?.id ?? "")) ?? "",
      name: p?.name,
      url:
        p?.__typename === "ReducedMessagingActor" ||
          p?.__typename === "UnavailableMessagingActor"
          ? createProfileUrl(p?.url, p?.username, p?.id)
          : p?.url,
      profilePicture: p?.big_image_src?.uri,
      username: p?.username || null,
      isMessageBlockedByViewer: p?.is_message_blocked_by_viewer,
      adminType: edge.admin_type || p?.admin_type || null,
    };

    switch (p?.__typename) {
      case "User":
        return {
          ...baseFields,
          shortName: p.short_name,
          gender: p.gender,
          isViewerFriend: p.is_viewer_friend,
          isMessengerUser: p.is_messenger_user,
          isVerified: p.is_verified,
          isViewerCoworker: p.is_viewer_coworker,
          isEmployee: p.is_employee,
          workInfo: p.work_info || null,
          workForeignEntityInfo: p.work_foreign_entity_info || null,
          scimCompanyUser: p.scim_company_user || null,
          isAlohaProxyConfirmed: p.is_aloha_proxy_confirmed || false,
        };
      case "Page":
        return {
          ...baseFields,
          acceptsMessengerUserFeedback: p.accepts_messenger_user_feedback,
          isMessengerUser: p.is_messenger_user,
          isVerified: p.is_verified,
          isMessengerPlatformBot: p.is_messenger_platform_bot,
          isBusinessPageActive: p.is_business_page_active || false,
        };
      case "ReducedMessagingActor":
      case "UnavailableMessagingActor":
        return baseFields;
      case "XFBMSGRMetaManagedGenerativeAIBot":
        return {
          ...baseFields,
          isMessengerUser: true,
          isVerified: true,
          isMessengerPlatformBot: true,
        };
      default:

        console.warn(
          "getThreadList",
          "Found participant with unsupported typename.",
          JSON.stringify(p, null, 2)
        );
        return {
          ...baseFields,
          name:
            p?.name ||
            `[unknown ${p?.__typename || "MessagingActor"}]`,
        };
    }
  });

const formatColor = (color?: string | null): string | null | undefined =>
  color?.match(/^(?:[0-9a-fA-F]{8})$/g) ? color.slice(2) : color;

const getThreadName = (t: ThreadNode): string | null | undefined => {
  if (t.name || t.thread_key?.thread_fbid) return t.name;

  const participant = t.all_participants?.edges?.find(
    (p) =>
      (p.node?.messaging_actor?.id || p.messaging_actor?.id) ===
      t.thread_key?.other_user_id
  );

  return (
    participant?.node?.messaging_actor?.name ||
    participant?.messaging_actor?.name
  );
};

const mapNicknames = (customizationInfo?: CustomizationInfo | null) =>
  (customizationInfo?.participant_customizations || []).map(
    ({ participant_id, nickname }) => ({
      userID: formatID(String(participant_id)) ?? "",
      nickname,
    })
  );

const formatThreadList = (data: ThreadNode[]): FormattedThread[] =>
  data.map((t) => {
    const lastMessageNode = t.last_message?.nodes?.[0];
    const participants = formatParticipants(
      t.all_participants || { edges: [] }
    );
    const readReceipts = t.read_receipts?.nodes || [];
    const deliveryReceipts = t.delivery_receipts?.nodes || [];

    const threadID = t.thread_key
      ? (formatID(
          String(t.thread_key.thread_fbid || t.thread_key.other_user_id || "")
        ) ?? null)
      : null;

    return {
      threadID,
      name: getThreadName(t) ?? null,
      unreadCount: t.unread_count || 0,
      messageCount: t.messages_count || 0,
      imageSrc: t.image?.uri || null,
      squareImage: t.square_image?.uri || null,
      emoji: t.customization_info?.emoji || null,
      color: formatColor(t.customization_info?.outgoing_bubble_color),
      threadTheme: t.thread_theme || null,
      nicknames: mapNicknames(t.customization_info),
      muteUntil: t.mute_until || -1,
      participants,
      adminIDs: (t.thread_admins || []).map((a) => formatID(String(a.id)) ?? ""),
      folder: t.folder || "INBOX",
      isGroup: t.thread_type === "GROUP",
      customizationEnabled: t.customization_enabled !== false,
      participantAddMode: t.participant_add_mode_as_string || null,
      montageThread: t.montage_thread
        ? Buffer.from(t.montage_thread.id, "base64").toString()
        : null,
      reactionsMuteMode: t.reactions_mute_mode || "REACTIONS_NOT_MUTED",
      mentionsMuteMode: t.mentions_mute_mode || "MENTIONS_NOT_MUTED",
      isArchived: t.has_viewer_archived || false,
      isSubscribed: t.is_viewer_subscribed !== false,
      timestamp: t.updated_time_precise,
      snippet: lastMessageNode?.snippet || null,
      snippetAttachments: lastMessageNode?.extensible_attachment || null,
      snippetSender: lastMessageNode
        ? (formatID(
            String(
              lastMessageNode.message_sender?.messaging_actor?.id || ""
            )
          ) ?? null)
        : null,
      lastMessageTimestamp: lastMessageNode?.timestamp_precise || null,
      lastReadTimestamp:
        t.last_read_receipt?.nodes?.[0]?.timestamp_precise || null,
      cannotReplyReason: t.cannot_reply_reason || null,
      approvalMode: Boolean(t.approval_mode),
      participantIDs: participants.map((p) => p.userID),
      threadType: t.thread_type === "GROUP" ? 2 : 1,
      inviteLink: {
        enable: t.joinable_mode?.mode === "1" || false,
        link: t.joinable_mode?.link || null,
      },
      readReceipts: readReceipts.map((receipt) => ({
        watermark: receipt.watermark,
        action: receipt.action,
        actorID: formatID(String(receipt.actor?.id || "")) ?? "",
      })),
      deliveryReceipts: deliveryReceipts.map((receipt) => ({
        timestamp: receipt.timestamp_precise,
      })),
      isPinned: t.is_pinned || false,
      isPinProtected: t.is_pin_protected || false,
      threadQueueEnabled: t.thread_queue_enabled || false,
      groupThreadSubtype: t.group_thread_subtype || null,
      adminModelStatus: t.admin_model_status_string || null,
      description: t.description || null,
      isBusinessPageActive: t.is_business_page_active || false,
      rtcCallData: t.rtc_call_data || null,
      privacyMode: t.privacy_mode || null,
      threadUnsendabilityStatus: t.thread_unsendability_status || null,
      threadPinTimestamp: t.thread_pin_timestamp || 0,
      conversionDetectionData: t.conversion_detection_data || null,
    };
  });

export default function (
  defaultFuncs: DefaultFuncs,
  _api: unknown,
  ctx: Context
): (
  limit: number,
  timestamp?:
    | number
    | null
    | string[]
    | string
    | ((err: unknown, result?: FormattedThread[]) => void),
  tags?:
    | string[]
    | string
    | ((err: unknown, result?: FormattedThread[]) => void),
  callback?: (err: unknown, result?: FormattedThread[]) => void
) => Promise<FormattedThread[]> {
  return async function getThreadList(
    limit: number,
    timestamp?:
      | number
      | null
      | string[]
      | string
      | ((err: unknown, result?: FormattedThread[]) => void),
    tags?:
      | string[]
      | string
      | ((err: unknown, result?: FormattedThread[]) => void),
    callback?: (err: unknown, result?: FormattedThread[]) => void
  ): Promise<FormattedThread[]> {
    let cb = callback;
    let ts = timestamp;
    let tagList = tags;


    if (
      !cb &&
      (getType(ts) === "Function" || getType(ts) === "AsyncFunction")
    ) {
      cb = ts as unknown as (err: unknown, result?: FormattedThread[]) => void;
      ts = null;
    }

    if (
      !cb &&
      (getType(tagList) === "Function" || getType(tagList) === "AsyncFunction")
    ) {
      cb = tagList as unknown as (
        err: unknown,
        result?: FormattedThread[]
      ) => void;
      tagList = [""];
    }


    if (getType(ts) === "Array" || getType(ts) === "String") {
      tagList = ts as string[] | string;
      ts = null;
    }

    if (tagList === undefined) {
      tagList = [""];
    }

    if (ts === undefined) ts = null;

    if (
      getType(limit) !== "Number" ||
      !Number.isInteger(limit) ||
      limit <= 0
    ) {
      throw { error: "getThreadList: limit must be a positive integer" };
    }

    if (
      getType(ts) !== "Null" &&
      (getType(ts) !== "Number" || !Number.isInteger(ts))
    ) {
      throw { error: "getThreadList: timestamp must be an integer or null" };
    }

    if (getType(tagList) === "String") tagList = [tagList as string];

    if (getType(tagList) !== "Array") {
      throw { error: "getThreadList: tags must be an array" };
    }

    const form = {
      av: ctx.userID,
      batch_name: "MessengerGraphQLThreadlistFetcher",
      __user: ctx.userID,
      fb_dtsg: ctx.fb_dtsg,
      queries: JSON.stringify({
        o0: {
          doc_id: "3336396659757871",
          query_params: {
            limit,
            before: null,
            tags: [...(tagList as string[])],
            includeDeliveryReceipts: true,
            includeSeqID: false,
          },
        },
      }),
    };

    try {
      const resData = (await defaultFuncs
        .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
        .then(parseAndCheckLogin(ctx, defaultFuncs))) as ThreadListResponse;

      const resArray = Array.isArray(resData) ? resData : [resData];
      const first = resArray[0];
      const last = resArray[resArray.length - 1];

      const viewer = first?.o0?.data?.viewer;

      if (!viewer) {
        throw {
          error: "getThreadList: No viewer data found in response",
          res: resData,
        };
      }

      const top = first?.o0;

      const hasErrors =
        (last && typeof last.error_results === "number"
          ? last.error_results
          : 0) > 0 ||
        (top && typeof top.error_results === "number"
          ? top.error_results
          : 0) > 0;

      if (hasErrors) {
        throw top?.errors || resData;
      }

      const noSuccessfulResults =
        (last && typeof last.successful_results === "number"
          ? last.successful_results
          : 1) === 0 ||
        (top && typeof top.successful_results === "number"
          ? top.successful_results
          : 1) === 0;

      if (noSuccessfulResults) {
        throw {
          error: "getThreadList: there was no successful_results",
          res: resData,
        };
      }

      if (!viewer.message_threads?.nodes) {
        throw {
          error: "getThreadList: No message_threads found in response",
          res: resData,
        };
      }

      const nodes = [...viewer.message_threads.nodes];

      if (ts && nodes.length > 0) {
        nodes.shift();
      }

      const result = formatThreadList(nodes);

      if (cb) cb(null, result);

      return result;
    } catch (err) {

      console.error("getThreadList", err);
      if (cb) cb(err);
      throw err;
    }
  };
}
