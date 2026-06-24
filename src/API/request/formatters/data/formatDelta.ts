import formatID from "../value/formatID.js";
import { _formatAttachment } from "./formatAttachment.js";

type JsonObject = Record<string, unknown>;

interface ThreadKeyShape {
  threadFbId?: string | number;
  otherUserFbId?: string | number;
}

interface MessageMetadataShape {
  actorFbId: string | number;
  threadKey: ThreadKeyShape;
  messageId: string | number;
  offlineThreadingId?: unknown;
  timestamp?: number;
  adminText?: string;
}

interface MessageReplyShape {
  messageID?: unknown;
  senderID?: unknown;
  body?: string;
  attachments?: unknown;
  timestamp?: number;
}

interface DeltaMessageShape {
  body?: string;
  data?: { prng?: string };
  messageMetadata: MessageMetadataShape;
  messageReply?: MessageReplyShape;
  attachments?: unknown[];
  participants?: unknown;
}

interface DeltaMessageEnvelope {
  delta: DeltaMessageShape;
}

interface PrngMention {
  i?: string | number;
  o?: number;
  l?: number;
}

const getAdminTextMessageType = (type: string): string => {
  switch (type) {
    case "unpin_messages_v2":
      return "log:unpin-message";
    case "pin_messages_v2":
      return "log:pin-message";
    case "change_thread_theme":
      return "log:thread-color";
    case "change_thread_icon":
    case "change_thread_quick_reaction":
      return "log:thread-icon";
    case "change_thread_nickname":
      return "log:user-nickname";
    case "change_thread_admins":
      return "log:thread-admins";
    case "group_poll":
      return "log:thread-poll";
    case "change_thread_approval_mode":
      return "log:thread-approval-mode";
    case "messenger_call_log":
    case "participant_joined_group_call":
      return "log:thread-call";
    default:
      return type;
  }
};

export interface FormattedDeltaMessage {
  type: "message";
  senderID: ReturnType<typeof formatID>;
  body: string;
  threadID: ReturnType<typeof formatID>;
  messageID: string | number;
  offlineThreadingId: unknown;
  attachments: ReturnType<typeof _formatAttachment>[];
  mentions: Record<string, string>;
  timestamp: number | undefined;
  isGroup: boolean;
  participantIDs: unknown;
  messageReply: {
    messageID: unknown;
    senderID: ReturnType<typeof formatID>;
    body: string | undefined;
    attachments: unknown;
    timestamp: number | undefined;
    isReply: true;
  } | null;
}

const formatDeltaMessage = (m: unknown): FormattedDeltaMessage => {
  const env = m as DeltaMessageEnvelope;
  const md = env.delta.messageMetadata;
  const parsedPrng = env.delta.data?.prng ? (JSON.parse(env.delta.data.prng) as unknown) : [];
  const mdata: PrngMention[] = Array.isArray(parsedPrng) ? parsedPrng : [];
  const mentions: Record<string, string> = {};
  const bodyStr = env.delta.body ?? "";
  for (const mention of mdata) {
    if (mention?.i == null || mention.o == null || mention.l == null) continue;
    const key = String(mention.i);
    mentions[key] = bodyStr.substring(mention.o, mention.o + mention.l);
  }

  const messageReply = env.delta.messageReply
    ? {
        messageID: env.delta.messageReply.messageID,
        senderID: formatID(String(env.delta.messageReply.senderID)),
        body: env.delta.messageReply.body,
        attachments: env.delta.messageReply.attachments,
        timestamp: env.delta.messageReply.timestamp,
        isReply: true as const,
      }
    : null;

  const tid = md.threadKey.threadFbId ?? md.threadKey.otherUserFbId;

  return {
    type: "message",
    senderID: formatID(String(md.actorFbId)),
    body: bodyStr,
    threadID: formatID(String(tid)),
    messageID: md.messageId,
    offlineThreadingId: md.offlineThreadingId,
    attachments: (env.delta.attachments ?? []).map((v) => _formatAttachment(v as JsonObject)),
    mentions,
    timestamp: md.timestamp,
    isGroup: !!md.threadKey.threadFbId,
    participantIDs: env.delta.participants,
    messageReply,
  };
};

export interface FormattedDeltaEvent {
  type: "event";
  threadID: ReturnType<typeof formatID>;
  messageID: string;
  logMessageType: string;
  logMessageData: unknown;
  logMessageBody: string | undefined;
  timestamp: number | undefined;
  author: string | number | undefined;
  participantIDs: unknown;
}

interface DeltaEventEnvelope {
  class: string;
  type?: string;
  untypedData?: unknown;
  name?: string;
  addedParticipants?: unknown;
  leftParticipantFbId?: string | number;
  messageMetadata: MessageMetadataShape;
  participants?: unknown;
}

const formatDeltaEvent = (m: unknown): FormattedDeltaEvent => {
  const ev = m as DeltaEventEnvelope;
  let logMessageType: string;
  let logMessageData: unknown;

  switch (ev.class) {
    case "AdminTextMessage":
      logMessageData = ev.untypedData;
      logMessageType = getAdminTextMessageType(ev.type ?? "");
      break;
    case "ThreadName":
      logMessageType = "log:thread-name";
      logMessageData = { name: ev.name };
      break;
    case "ParticipantsAddedToGroupThread":
      logMessageType = "log:subscribe";
      logMessageData = { addedParticipants: ev.addedParticipants };
      break;
    case "ParticipantLeftGroupThread":
      logMessageType = "log:unsubscribe";
      logMessageData = { leftParticipantFbId: ev.leftParticipantFbId };
      break;
    default:
      logMessageType = ev.class;
      logMessageData = ev;
  }

  const mk = ev.messageMetadata.threadKey;
  const evTid = mk.threadFbId ?? mk.otherUserFbId;

  return {
    type: "event",
    threadID: formatID(String(evTid)),
    messageID: String(ev.messageMetadata.messageId),
    logMessageType,
    logMessageData,
    logMessageBody: ev.messageMetadata.adminText,
    timestamp: ev.messageMetadata.timestamp,
    author: ev.messageMetadata.actorFbId,
    participantIDs: ev.participants,
  };
};

interface ReadReceiptDelta {
  threadKey: ThreadKeyShape;
  actorFbId?: string | number;
  actionTimestampMs?: number;
}

export interface FormattedDeltaReadReceipt {
  reader: string;
  time: number | undefined;
  threadID: ReturnType<typeof formatID>;
  type: "read_receipt";
}

const formatDeltaReadReceipt = (delta: unknown): FormattedDeltaReadReceipt => {
  const d = delta as ReadReceiptDelta;
  return {
    reader: String(d.threadKey.otherUserFbId ?? d.actorFbId ?? ""),
    time: d.actionTimestampMs,
    threadID: formatID(String(d.threadKey.otherUserFbId ?? d.threadKey.threadFbId ?? "")),
    type: "read_receipt",
  };
};

export { formatDeltaEvent, formatDeltaMessage, formatDeltaReadReceipt, getAdminTextMessageType };
