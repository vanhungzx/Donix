import type { MessageAttachment } from "@types";
import { formatAttachment } from "../data/formatAttachment.js";
import { getAdminTextMessageType } from "../data/formatDelta.js";
import formatID from "../value/formatID.js";

type JsonObject = Record<string, unknown>;

interface GroupThreadInfo {
  participant_names?: string[];
  participant_ids?: Array<string | number>;
  name?: string;
}

interface RawMessageCore {
  sender_name?: string;
  sender_fbid?: string | number;
  group_thread_info?: GroupThreadInfo;
  body?: string;
  thread_fbid?: string | number;
  other_user_fbid?: string | number;
  mid?: string | number;
  message_id?: string | number;
  attachments?: JsonObject | JsonObject[];
  attachmentIds?: Array<string | number>;
  attachment_map?: Record<string, JsonObject>;
  share_map?: Record<string, JsonObject>;
  coordinates?: unknown;
  timestamp?: number;
  tags?: unknown;
  reactions?: unknown[];
  is_unread?: boolean;
}

interface RawLogFields {
  log_message_type?: string;
  log_message_data?: JsonObject & { untypedData?: unknown; message_type?: string };
  log_message_body?: string;
}

type RawMessageFields = RawMessageCore & RawLogFields;

interface MessageOrEventWrapper {
  message?: RawMessageFields;
  type?: string;
  realtime_viewer_fbid?: string | number;
  action_type?: string;
}

function unwrapMessage(m: MessageOrEventWrapper | RawMessageFields): RawMessageFields {
  if (m && typeof m === "object" && "message" in m && m.message != null && typeof m.message === "object") {
    return m.message;
  }
  return m as RawMessageFields;
}

export interface FormattedChatMessage {
  type: "message";
  senderName: string | undefined;
  senderID: ReturnType<typeof formatID>;
  participantNames: string[] | undefined;
  participantIDs: Array<ReturnType<typeof formatID>>;
  body: string;
  threadID: ReturnType<typeof formatID>;
  threadName: string | undefined;
  location: unknown;
  messageID: string | number | undefined;
  attachments: MessageAttachment[];
  timestamp: number | undefined;
  tags: unknown;
  reactions: unknown[];
  isUnread: boolean | undefined;
  isGroup: boolean;
  pageID?: string;
}

export const formatMessage = (m: unknown): FormattedChatMessage => {
  const wrap = m as MessageOrEventWrapper | RawMessageFields;
  const originalMessage = unwrapMessage(wrap);
  const gti = originalMessage.group_thread_info;
  const participantNames =
    gti?.participant_names ?? (originalMessage.sender_name ? [originalMessage.sender_name.split(" ")[0]] : undefined);
  const participantIDs =
    gti?.participant_ids?.map((v) => formatID(String(v))) ?? [formatID(String(originalMessage.sender_fbid ?? ""))];

  const obj: FormattedChatMessage = {
    type: "message",
    senderName: originalMessage.sender_name,
    senderID: formatID(String(originalMessage.sender_fbid ?? "")),
    participantNames,
    participantIDs,
    body: originalMessage.body ?? "",
    threadID: formatID(String(originalMessage.thread_fbid ?? originalMessage.other_user_fbid ?? "")),
    threadName: gti?.name ?? originalMessage.sender_name,
    location: originalMessage.coordinates ?? null,
    messageID: originalMessage.mid != null ? String(originalMessage.mid) : originalMessage.message_id,
    attachments: formatAttachment(
      originalMessage.attachments as Parameters<typeof formatAttachment>[0],
      originalMessage.attachmentIds,
      originalMessage.attachment_map as Parameters<typeof formatAttachment>[2],
      originalMessage.share_map
    ),
    timestamp: originalMessage.timestamp,
    tags: originalMessage.tags,
    reactions: originalMessage.reactions ?? [],
    isUnread: originalMessage.is_unread,
    isGroup: participantIDs.length > 2,
  };

  const outer = m as MessageOrEventWrapper;
  if (outer.type === "pages_messaging" && outer.realtime_viewer_fbid != null) {
    obj.pageID = String(outer.realtime_viewer_fbid);
  }
  return obj;
};

export interface FormattedChatEvent extends Omit<FormattedChatMessage, "type"> {
  type: "event";
  logMessageType: string;
  logMessageData: unknown;
  logMessageBody: string | undefined;
}

export const formatEvent = (m: unknown): FormattedChatEvent => {
  const originalMessage = unwrapMessage(m as MessageOrEventWrapper | RawMessageFields);
  let logMessageType = originalMessage.log_message_type ?? "";
  let logMessageData: unknown;
  const lmd = originalMessage.log_message_data;
  if (logMessageType === "log:generic-admin-text" && lmd) {
    logMessageData = lmd.untypedData;
    logMessageType = getAdminTextMessageType(String(lmd.message_type ?? ""));
  } else {
    logMessageData = lmd;
  }
  return {
    ...formatMessage(m as unknown),
    type: "event",
    logMessageType,
    logMessageData,
    logMessageBody: originalMessage.log_message_body,
  };
};

export const formatHistoryMessage = (m: unknown): FormattedChatMessage | FormattedChatEvent => {
  const o = m as MessageOrEventWrapper | RawMessageFields;
  return o && typeof o === "object" && (o as MessageOrEventWrapper).action_type === "ma-type:log-message"
    ? formatEvent(m)
    : formatMessage(m);
};
