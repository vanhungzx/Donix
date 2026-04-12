import formatID from "../value/formatID.js";

interface ThreadParticipant {
  toString(): string;
}

export interface FormattedThread {
  threadID: ReturnType<typeof formatID>;
  participants: Array<ReturnType<typeof formatID>>;
  participantIDs: Array<ReturnType<typeof formatID>>;
  name: unknown;
  nicknames: unknown;
  snippet: unknown;
  snippetSender: ReturnType<typeof formatID>;
  unreadCount: unknown;
  messageCount: unknown;
  imageSrc: unknown;
  timestamp: unknown;
  muteUntil: unknown;
  isGroup: boolean;
  isArchived: unknown;
  canReply: unknown;
  lastMessageTimestamp: unknown;
  lastReadTimestamp: unknown;
  emoji: unknown;
  color: unknown;
  adminIDs: unknown;
  threadType: unknown;
}

interface RawThreadPayload {
  thread_fbid: string | number | { toString(): string };
  participants: ThreadParticipant[];
  name?: unknown;
  custom_nickname?: unknown;
  snippet?: unknown;
  snippet_sender?: string | number;
  unread_count?: unknown;
  message_count?: unknown;
  image_src?: unknown;
  timestamp?: unknown;
  mute_until?: unknown;
  thread_type?: number;
  is_archived?: unknown;
  can_reply?: unknown;
  last_message_timestamp?: unknown;
  last_read_timestamp?: unknown;
  custom_like_icon?: unknown;
  custom_color?: unknown;
  admin_ids?: unknown;
}

export const formatThread = (data: unknown): FormattedThread => {
  const d = data as RawThreadPayload;
  const parts = Array.isArray(d.participants) ? d.participants : [];
  return {
    threadID: formatID(String(d.thread_fbid)),
    participants: parts.map((p) => formatID(p.toString())),
    participantIDs: parts.map((p) => formatID(p.toString())),
    name: d.name,
    nicknames: d.custom_nickname,
    snippet: d.snippet,
    snippetSender: formatID(String(d.snippet_sender ?? "")),
    unreadCount: d.unread_count,
    messageCount: d.message_count,
    imageSrc: d.image_src,
    timestamp: d.timestamp,
    muteUntil: d.mute_until,
    isGroup: d.thread_type === 2,
    isArchived: d.is_archived,
    canReply: d.can_reply,
    lastMessageTimestamp: d.last_message_timestamp,
    lastReadTimestamp: d.last_read_timestamp,
    emoji: d.custom_like_icon,
    color: d.custom_color,
    adminIDs: d.admin_ids,
    threadType: d.thread_type,
  };
};
