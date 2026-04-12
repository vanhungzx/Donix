"use strict";

import logger from "@log";
import { Context, DefaultFuncs, getType, parseAndCheckLogin } from "../../request/formatters/helpers";

const CONSTANTS = Object.freeze({
  THREAD_TYPE_GROUP: "GROUP",
  THREAD_TYPE_INDIVIDUAL: 1,
  THREAD_TYPE_GROUP_NUM: 2,
  JOINABLE_MODE_ENABLED: 1,
  COLOR_REGEX: /^#?(.{6})$/,
  DOC_ID: "24207026455597365",
});

interface EventReminder {
  reminderID: string;
  eventCreatorID: string | null;
  time: number;
  eventType: string | null;
  locationName: string | null;
  locationCoordinates: any | null;
  locationPage: any | null;
  eventStatus: string | null;
  note: string | null;
  repeatMode: string | null;
  eventTitle: string | null;
  triggerMessage: any | null;
  secondsToNotifyBefore: number;
  allowsRsvp: boolean;
  relatedEvent: any | null;
  members: Array<{ memberID: string; state: string }>;
}

interface UserInfo {
  id: string;
  name: string | null;
  firstName: string | null;
  vanity: string | null;
  url: string | null;
  thumbSrc: string | null;
  profileUrl: string | null;
  gender: string | null;
  type: string | null;
  isFriend: boolean;
  isBirthday: boolean;
  isMessenger: boolean;
  isBlocked: boolean;
  isCoworker: boolean;
  isEmployee: boolean;
  isAlohaProxyConfirmed: boolean;
  messageCapabilities: string | null;
  accountStatus: string | null;
  workInfo: any | null;
  workForeignEntityInfo: any | null;
}

interface ThreadInfo {
  threadID: string;
  threadName: string | null;
  participantIDs: string[];
  userInfo: UserInfo[];
  unreadCount: number;
  messageCount: number;
  timestamp: number | null;
  muteUntil: number | null;
  isGroup: boolean;
  isSubscribed: boolean;
  isArchived: boolean;
  folder: string | null;
  cannotReplyReason: string | null;
  eventReminders: EventReminder[] | null;
  emoji: string | null;
  color: string | null;
  threadTheme: any | null;
  nicknames: Record<string, string>;
  adminIDs: any[];
  approvalMode: boolean;
  approvalQueue: Array<{
    inviterID: string | null;
    requesterID: string | null;
    timestamp: number | null;
    request_source: string | null;
  }>;
  reactionsMuteMode: string | null;
  mentionsMuteMode: string | null;
  isPinProtected: boolean;
  relatedPageThread: any | null;
  name: string | null;
  snippet: string | null;
  snippetSender: string | null;
  snippetAttachments: any[];
  serverTimestamp: number | null;
  imageSrc: string | null;
  isCanonicalUser: boolean;
  isCanonical: boolean;
  recipientsLoadable: boolean;
  hasEmailParticipant: boolean;
  readOnly: boolean;
  canReply: boolean;
  lastMessageTimestamp: number | null;
  lastMessageType: string;
  lastReadTimestamp: number | null;
  threadType: number;
  inviteLink: {
    enable: boolean;
    link: string | null;
  };
}

function formatEventReminders(reminder: any): EventReminder {
  const edges = reminder.event_reminder_members?.edges;
  let membersList: Array<{ memberID: string; state: string }> | null = null;

  if (edges?.length) {
    membersList = new Array(edges.length);
    for (let i = 0; i < edges.length; i++) {
      const member = edges[i];
      membersList[i] = {
        memberID: member.node.id,
        state: member.guest_list_state.toLowerCase(),
      };
    }
  }

  return {
    reminderID: reminder.id,
    eventCreatorID: reminder.lightweight_event_creator?.id || null,
    time: reminder.time,
    eventType: reminder.lightweight_event_type?.toLowerCase() || null,
    locationName: reminder.location_name || null,
    locationCoordinates: reminder.location_coordinates || null,
    locationPage: reminder.location_page || null,
    eventStatus: reminder.lightweight_event_status?.toLowerCase() || null,
    note: reminder.note || null,
    repeatMode: reminder.repeat_mode?.toLowerCase() || null,
    eventTitle: reminder.event_title || null,
    triggerMessage: reminder.trigger_message || null,
    secondsToNotifyBefore: reminder.seconds_to_notify_before || 0,
    allowsRsvp: Boolean(reminder.allows_rsvp),
    relatedEvent: reminder.related_event || null,
    members: membersList || [],
  };
}

function formatUserInfo(participant: any): UserInfo | null {
  const actor = participant.node?.messaging_actor;
  if (!actor) return null;

  const bigImageUri = actor.big_image_src?.uri;

  return {
    id: actor.id,
    name: actor.name || null,
    firstName: actor.short_name || null,
    vanity: actor.username || null,
    url: actor.url || null,
    thumbSrc: bigImageUri || null,
    profileUrl: bigImageUri || null,
    gender: actor.gender || null,
    type: actor.__typename || null,
    isFriend: Boolean(actor.is_viewer_friend),
    isBirthday: Boolean(actor.is_birthday),
    isMessenger: Boolean(actor.is_messenger_user),
    isBlocked: Boolean(actor.is_message_blocked_by_viewer),
    isCoworker: Boolean(actor.is_viewer_coworker),
    isEmployee: Boolean(actor.is_employee),
    isAlohaProxyConfirmed: Boolean(actor.is_aloha_proxy_confirmed),
    messageCapabilities: actor.message_capabilities2_str || null,
    accountStatus: actor.messenger_account_status_category || null,
    workInfo: actor.work_info || null,
    workForeignEntityInfo: actor.work_foreign_entity_info || null,
  };
}

function processNicknames(customizations: any[]): Record<string, string> {
  if (!customizations?.length) return {};

  const nicknames = Object.create(null);

  for (let i = 0; i < customizations.length; i++) {
    const custom = customizations[i];
    if (custom.nickname && custom.participant_id) {
      nicknames[custom.participant_id] = custom.nickname;
    }
  }

  return nicknames;
}

function processApprovalQueue(approvalQueue: any): Array<{
  inviterID: string | null;
  requesterID: string | null;
  timestamp: number | null;
  request_source: string | null;
}> {
  const nodes = approvalQueue?.nodes;
  if (!nodes?.length) return [];

  const result = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    result[i] = {
      inviterID: node.inviter?.id || null,
      requesterID: node.requester?.id || null,
      timestamp: node.request_timestamp || null,
      request_source: node.request_source || null,
    };
  }

  return result;
}

function formatThreadGraphQLResponse(data: any): ThreadInfo | null {
  if (!data || data.errors) return data?.errors || null;

  const messageThread = data.message_thread;
  if (!messageThread) return null;

  const threadKey = messageThread.thread_key;
  const threadID = threadKey?.thread_fbid || threadKey?.other_user_id || null;
  if (!threadID) return null;

  const participants = messageThread.all_participants?.edges;

  let participantIDs: string[] = [];
  let userInfo: UserInfo[] = [];

  if (participants?.length) {
    participantIDs = new Array(participants.length);
    userInfo = [];

    for (let i = 0; i < participants.length; i++) {
      const participant = participants[i];
      const actorId = participant.node?.messaging_actor?.id;

      if (actorId) {
        participantIDs[i] = actorId;
        const formattedUser = formatUserInfo(participant);
        if (formattedUser) userInfo.push(formattedUser);
      }
    }
  }

  const customizationInfo = messageThread.customization_info;
  const emoji = customizationInfo?.emoji || null;
  let color: string | null = null;

  const bubbleColor = customizationInfo?.outgoing_bubble_color;
  if (bubbleColor) {
    const colorMatch = bubbleColor.match(CONSTANTS.COLOR_REGEX);
    color = colorMatch?.[1] || null;
  }

  const nicknames = processNicknames(customizationInfo?.participant_customizations);
  const eventReminders = messageThread.event_reminders?.nodes;
  const formattedReminders = eventReminders?.length ? eventReminders.map(formatEventReminders) : null;

  const approvalQueue = processApprovalQueue(messageThread.group_approval_queue);

  const lastMessage = messageThread.last_message;
  const lastMessageNode = lastMessage?.nodes?.[0];
  const snippetID = lastMessageNode?.message_sender?.messaging_actor?.id || null;
  const snippetText = lastMessageNode?.snippet || null;

  const lastReadReceipt = messageThread.last_read_receipt;
  const lastReadTimestamp = lastReadReceipt?.nodes?.[0]?.timestamp_precise || null;

  const isGroup = messageThread.thread_type === CONSTANTS.THREAD_TYPE_GROUP;
  const joinableMode = messageThread.joinable_mode;

  const inviteLink = {
    enable: joinableMode?.mode === CONSTANTS.JOINABLE_MODE_ENABLED || false,
    link: joinableMode?.link || null,
  };

  return {
    threadID,
    threadName: messageThread.name || null,
    participantIDs,
    userInfo,
    unreadCount: messageThread.unread_count || 0,
    messageCount: messageThread.messages_count || 0,
    timestamp: messageThread.updated_time_precise || null,
    muteUntil: messageThread.mute_until || null,
    isGroup,
    isSubscribed: Boolean(messageThread.is_viewer_subscribed),
    isArchived: Boolean(messageThread.has_viewer_archived),
    folder: messageThread.folder || null,
    cannotReplyReason: messageThread.cannot_reply_reason || null,
    eventReminders: formattedReminders,
    emoji,
    color,
    threadTheme: messageThread.thread_theme || null,
    nicknames,
    adminIDs: messageThread.thread_admins || [],
    approvalMode: Boolean(messageThread.approval_mode),
    approvalQueue,
    reactionsMuteMode: messageThread.reactions_mute_mode?.toLowerCase() || null,
    mentionsMuteMode: messageThread.mentions_mute_mode?.toLowerCase() || null,
    isPinProtected: Boolean(messageThread.is_pin_protected),
    relatedPageThread: messageThread.related_page_thread || null,
    name: messageThread.name || null,
    snippet: snippetText,
    snippetSender: snippetID,
    snippetAttachments: [],
    serverTimestamp: messageThread.updated_time_precise || null,
    imageSrc: messageThread.image?.uri || null,
    isCanonicalUser: Boolean(messageThread.is_canonical_neo_user),
    isCanonical: !isGroup,
    recipientsLoadable: true,
    hasEmailParticipant: false,
    readOnly: false,
    canReply: messageThread.cannot_reply_reason === null,
    lastMessageTimestamp: lastMessage?.timestamp_precise || null,
    lastMessageType: "message",
    lastReadTimestamp,
    threadType: isGroup ? CONSTANTS.THREAD_TYPE_GROUP_NUM : CONSTANTS.THREAD_TYPE_INDIVIDUAL,
    inviteLink,
  };
}

const QUERY_TEMPLATE = Object.freeze({
  doc_id: CONSTANTS.DOC_ID,
  query_params: Object.freeze({
    message_limit: 0,
    load_messages: false,
    load_read_receipts: false,
    load_delivery_receipts: false,
    before: null,
    is_work_teamwork_not_putting_muted_in_unreads: false,
    source: "mercury",
    threadlistViewFieldsOnly: false,
  }),
});

function buildForm(_ctx: Context, queriesJson: string): any {
  const form: any = {
    batch_name: "MessengerGraphQLThreadFetcher",
    queries: queriesJson,
  };

  Object.keys(form).forEach((k) => form[k] === undefined && delete form[k]);
  return form;
}

export default function getThreadInfoGraphQL(
  defaultFuncs: DefaultFuncs,
  _client: any,
  ctx: Context
): (threadID: string, callback?: (err: any, data?: ThreadInfo) => void) => Promise<ThreadInfo> {
  return function getThreadInfo(threadID: string, callback?: (err: any, data?: ThreadInfo) => void): Promise<ThreadInfo> {
    let resolveFunc: (value: ThreadInfo) => void;
    let rejectFunc: (reason?: any) => void;

    const returnPromise = new Promise<ThreadInfo>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    const t = getType(callback);
    if (t !== "Function" && t !== "AsyncFunction") {
      callback = (err: any, data?: ThreadInfo) => {
        if (err) return rejectFunc(err);
        resolveFunc(data!);
      };
    }

    const ids = Array.isArray(threadID) ? threadID : [threadID];

    if (!ids.length) {
      const error = new Error("Thread ID is required");
      callback!(error);
      return returnPromise;
    }

    if (ids.length > 1) {
      const error = new Error("Only one threadID allowed per request");
      callback!(error);
      return returnPromise;
    }

    const q = {
      o0: {
        doc_id: QUERY_TEMPLATE.doc_id,
        query_params: { ...QUERY_TEMPLATE.query_params, id: ids[0] },
      },
    };

    const form = buildForm(ctx, JSON.stringify(q));

    defaultFuncs
      .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
      .then(parseAndCheckLogin(ctx, defaultFuncs))
      .then((resData: any) => {
        if (!resData) throw new Error("Empty response");

        let data: any = null;

        if (Array.isArray(resData)) {
          for (let i = 0; i < resData.length; i++) {
            const item = resData[i];
            if (!item || typeof item !== "object") continue;

            const key = Object.keys(item)[0];
            if (key && item[key]?.data) {
              data = item[key].data;
              break;
            }
            if (item.data) {
              data = item.data;
              break;
            }
          }
        } else if (resData.data) {
          data = resData.data;
        }

        if (!data) throw new Error("No data field in response");

        const info = formatThreadGraphQLResponse(data);
        callback!(null, info!);
      })
      .catch((err: any) => {
        logger.error(`getThreadInfoGraphQL error: ${err.message}`);
        callback!(err);
      });

    return returnPromise;
  };
}
