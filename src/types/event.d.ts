

import type { MessageEvent } from "./index";


export interface BaseEvent {
  type: string;
  threadID?: string;
  senderID?: string;
  messageID?: string;
  timestamp?: number | string;
  [key: string]: string | number | boolean | null | undefined | string[] | number[] | Record<string, string | number | boolean | null | undefined>;
}


export type MessageEventType =
  | "message"
  | "message_reply"
  | "message_unsend"
  | "message_reaction"
  | "event"
  | "typ"
  | "presence"
  | "read_receipt"
  | "friend_request_received"
  | "video_call";


export interface LogMessageData {
  addedParticipants?: Array<{ userFbId: string }>;
  removedParticipants?: Array<{ userFbId: string }>;
  leftThreadFbId?: string;
  tagall?: string[];
  [key: string]: string | string[] | Array<{ userFbId: string }> | undefined;
}

export interface ExtendedMessageEvent extends MessageEvent, BaseEvent {
  type: MessageEventType;
  reaction?: string;
  logMessageType?: string;
  logMessageBody?: string | null;
  logMessageData?: LogMessageData;
}

export interface typeEvent {
  type: Array<string>;
}

export interface ReactionEvent extends BaseEvent {
  type: "message_reaction";
  threadID: string;
  senderID: string;
  messageID: string;
  reaction: string;
  userID: string;
  author: string;
}


export interface TypingEvent extends BaseEvent {
  type: "typ";
  threadID: string;
  senderID: string;
  isTyping: boolean;
}


export type PresenceStatus = "active" | "idle" | "offline" | "mobile" | "web" | "other";

export interface PresenceEvent extends BaseEvent {
  type: "presence";
  userID: string;
  statuses?: Record<string, PresenceStatus | number | boolean | string>;
}


export interface ReadReceiptEvent extends BaseEvent {
  type: "read_receipt";
  threadID: string;
  reader: string;
  time: number;
}


export interface FriendRequestEvent extends BaseEvent {
  type: "friend_request_received";
  userID: string;
  name?: string;
}

export interface VideoCallEvent extends BaseEvent {
  type: "video_call";
  topic: string;
  from?: string;
  to?: string;
  threadID?: string;
  callID?: string;
  sdp?: string;
  callType?: string;
  status?: string;
  payload?: any;
  raw?: any;
}

export type BotEvent =
  | ExtendedMessageEvent
  | ReactionEvent
  | TypingEvent
  | PresenceEvent
  | ReadReceiptEvent
  | FriendRequestEvent
  | VideoCallEvent
  | BaseEvent;
