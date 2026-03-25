

import type { Readable } from "node:stream";
import type { ListenerEmitter, MQTTContext } from "./index";

export interface MentionEntry {
  tag: string;
  id: string;
}

/** Attachment as stream + metadata (used by uploadFb/ruploadAttachment) */
export interface AttachmentStreamOptions {
  stream: Readable;
  filename?: string;
  contentType?: string;
}

export type MessageForm =
  | string
  | {
    body?: string;
    attachment?: string | string[] | Readable | Readable[] | [string, string][] | AttachmentStreamOptions;
    // "tag_thread" = tag toàn box, hoặc mảng MentionEntry (id + tag có trong body)
    mentions?: "tag_thread" | MentionEntry[];
    sticker?: string | number;
    location?: {
      latitude: number;
      longitude: number;
    };

    // Meta AI mention (special mention_data: type "ai", id "0")
    // When true, sendMessage will ensure the message starts with `metaAIPrefix` (default "@Meta AI")
    // and attaches mention_data with mention_types="ai".
    metaAI?: boolean;
    metaAIPrefix?: string;

    // Optional AI assistant extras / word effects (used by sendMessage.ts)
    magicWords?: { offsets: number[]; lengths: number[]; emojis: string[] };
    productExtras?: Record<string, unknown>;

    [key: string]:
    | string
    | number
    | boolean
    | string[]
    | Readable
    | Readable[]
    | [string, string][]
    | { latitude: number; longitude: number }
    | MentionEntry[]
    | { offsets: number[]; lengths: number[]; emojis: string[] }
    | Record<string, unknown>
    | undefined;
  };

export interface SendMessageInfo {
  messageID?: string;
  threadID?: string;
  timestamp?: number;
  [key: string]: string | number | undefined;
}

/** Item từ getMusicStickers (GraphQL music picker — sticker nhạc). */
export interface MusicStickerItem {
  song_id: string;
  audio_cluster_id: string | number;
  song_title: string;
  song_subtitle?: string;
  start_time: string;
  is_explicit: boolean;
  [key: string]: unknown;
}

export interface UploadResult {
  video_id?: string | number;
  audio_id?: string | number;
  image_id?: string | number;
  [key: string]: string | number | undefined;
}


export interface ThreadInfo {
  threadID: string;
  threadName?: string;
  participantIDs?: string[];
  adminIDs?: string[];
  imageSrc?: string;
  unreadCount?: number;
  messageCount?: number;
  [key: string]: string | string[] | number | boolean | null | undefined;
}

export interface UserInfo {
  userID: string;
  name?: string;
  firstName?: string;
  vanity?: string;
  thumbSrc?: string;
  profileUrl?: string;
  gender?: string | null;
  type?: string | null;
  isFriend?: boolean;
  isMessengerUser?: boolean;
  [key: string]: string | number | boolean | null | undefined;
}


export interface ChangeNicknameResponse {
  success: boolean;
  response: Record<string, string | number | boolean | null>;
}

export interface FacebookClient {
  sendMessage: {
    (form: MessageForm, threadID: string, callback?: (err?: Error, info?: SendMessageInfo) => void, messageID?: string): Promise<SendMessageInfo>;
    (form: MessageForm, threadID: string, messageID?: string): Promise<SendMessageInfo>;
  };
  reply: {
    (form: MessageForm, threadID: string, callback?: (err?: Error, info?: SendMessageInfo) => void, messageID?: string): Promise<SendMessageInfo>;
    (form: MessageForm, threadID: string, messageID?: string): Promise<SendMessageInfo>;
  };
  unsendMessage: (messageID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  editMessage: (text: string, messageID: string, callback?: (err?: Error) => void) => Promise<void>;
  setMessageReaction: (emoji: string, messageID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;

  /** GraphQL FetchMessengerMusicPickerOptimalQuery — product MSGR_DIRECT_MUSIC_STICKER (sticker nhạc). */
  getMusicStickers?: (
    searchText: string | null | undefined,
    pageSize?: number | ((err: Error | null, data?: MusicStickerItem[]) => void),
    endCursor?: string | null | ((err: Error | null, data?: MusicStickerItem[]) => void),
    callback?: (err: Error | null, data?: MusicStickerItem[]) => void
  ) => Promise<MusicStickerItem[]>;

  /** MQTT: gửi sticker nhạc (metadata từ music picker / song id). */
  sendMusicSticker?: (
    musicSticker: {
      song_id: string;
      start_time?: string;
      song_title?: string;
      song_subtitle?: string;
      is_explicit?: boolean;
    },
    threadID: string | number,
    callback?: (err?: Error | null, data?: SendMessageInfo) => void
  ) => Promise<SendMessageInfo>;

  uploadAttachment: (input: string | string[]) => Promise<UploadResult[]>;

  getThreadInfo: (threadID: string, callback?: (err?: Error, info?: ThreadInfo) => void) => Promise<ThreadInfo>;
  getThreadList(
    limit?: number,
    callback?: (err?: Error, list?: ThreadInfo[]) => void
  ): Promise<ThreadInfo[]>;
  getThreadList(
    limit: number,
    timestamp: number | null,
    tags?: string[] | string,
    callback?: (err?: Error, list?: ThreadInfo[]) => void
  ): Promise<ThreadInfo[]>;
  getThreadList(
    limit: number,
    tags: string[] | string,
    callback?: (err?: Error, list?: ThreadInfo[]) => void
  ): Promise<ThreadInfo[]>;
  changeNickname: (
    nickname: string | null | undefined,
    threadID: string | number,
    participantID: string | number,
    callback?: (err: Error | null, result?: ChangeNicknameResponse) => void
  ) => Promise<ChangeNicknameResponse>;
  changeGroupImage: (imageID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  setTheme: (themeID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  addUserToGroup: (userID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  removeUserFromGroup: (userID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;

  getUserInfo: (userID: string | string[], callback?: (err?: Error, info?: Record<string, UserInfo>) => void) => Promise<Record<string, UserInfo>>;
  shareContact: (contactID: string, targetID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;

  markAsRead: (threadID: string, read?: boolean | ((err?: Error) => void), callback?: (err?: Error) => void) => Promise<{ success?: boolean;[key: string]: string | number | boolean | undefined }>;
  markAsDelivered: (threadID: string, messageID: string, callback?: (err?: Error) => void) => Promise<void>;

  sendTypingIndicator: (threadID: string, callback?: (err?: Error) => void) => Promise<void>;

  listenMqtt: (callback: (err?: Error, event?: import("./event").BotEvent) => void) => ListenerEmitter;

  getCurrentUserID: () => string;
  getUID?: (url: string, callback?: (err?: Error, uid?: string) => void) => Promise<string>;

  httpPost: (
    url: string,
    form?:
    | Record<string, string | number | boolean | null | undefined>
    | ((err: Error | null, data?: string) => void),
    callback?: (err: Error | null, data?: string) => void,
    notAPI?: boolean
  ) => Promise<string>;
  acceptFriend: (userID: string) => Promise<void>;
  deleteFriendRequest: (userID: string) => Promise<void>;
  setThreadName: (name: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  changeNickname: (nickname: string, threadID: string, userID: string, callback?: (err?: Error) => void) => Promise<void>;
  addUserToGroup: (userID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  removeUserFromGroup: (userID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  markAsRead: (threadID: string, read?: boolean | ((err?: Error) => void), callback?: (err?: Error) => void) => Promise<{ success?: boolean;[key: string]: string | number | boolean | undefined }>;
  markAsDelivered: (threadID: string, messageID: string, callback?: (err?: Error) => void) => Promise<void>;
  sendTypingIndicator: (threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  listenMqtt: (callback: (err?: Error, event?: import("./event").BotEvent) => void) => ListenerEmitter;
  getCurrentUserID: () => string;
  getUID: (url: string, callback?: (err?: Error, uid?: string) => void) => Promise<string>;
  httpPost: (
    url: string,
    form?:
    | Record<string, string | number | boolean | null | undefined>
    | ((err: Error | null, data?: string) => void),
    callback?: (err: Error | null, data?: string) => void,
    notAPI?: boolean
  ) => Promise<string>;
  acceptFriend: (userID: string) => Promise<void>;
  deleteFriendRequest: (userID: string) => Promise<void>;
  setThreadName: (name: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  changeNickname: (nickname: string, threadID: string, userID: string, callback?: (err?: Error) => void) => Promise<void>;
  addUserToGroup: (userID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  removeUserFromGroup: (userID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  markAsRead: (threadID: string, read?: boolean | ((err?: Error) => void), callback?: (err?: Error) => void) => Promise<{ success?: boolean;[key: string]: string | number | boolean | undefined }>;
  markAsDelivered: (threadID: string, messageID: string, callback?: (err?: Error) => void) => Promise<void>;
  sendTypingIndicator: (threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  listenMqtt: (callback: (err?: Error, event?: import("./event").BotEvent) => void) => ListenerEmitter;
  getCurrentUserID: () => string;
  getUID: (url: string, callback?: (err?: Error, uid?: string) => void) => Promise<string>;
  httpPost: (
    url: string,
    form?:
    | Record<string, string | number | boolean | null | undefined>
    | ((err: Error | null, data?: string) => void),
    callback?: (err: Error | null, data?: string) => void,
    notAPI?: boolean
  ) => Promise<string>;
  acceptFriend: (userID: string) => Promise<void>;
  deleteFriendRequest: (userID: string) => Promise<void>;
  setThreadName: (name: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  changeNickname: (nickname: string, threadID: string, userID: string, callback?: (err?: Error) => void) => Promise<void>;
  addUserToGroup: (userID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  removeUserFromGroup: (userID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  markAsRead: (threadID: string, read?: boolean | ((err?: Error) => void), callback?: (err?: Error) => void) => Promise<{ success?: boolean;[key: string]: string | number | boolean | undefined }>;
  markAsDelivered: (threadID: string, messageID: string, callback?: (err?: Error) => void) => Promise<void>;
  sendTypingIndicator: (threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  listenMqtt: (callback: (err?: Error, event?: import("./event").BotEvent) => void) => ListenerEmitter;
  getCurrentUserID: () => string;
  getUID: (url: string, callback?: (err?: Error, uid?: string) => void) => Promise<string>;
  httpPost: (
    url: string,
    form?:
    | Record<string, string | number | boolean | null | undefined>
    | ((err: Error | null, data?: string) => void),
    callback?: (err: Error | null, data?: string) => void,
    notAPI?: boolean
  ) => Promise<string>;
  acceptFriend: (userID: string) => Promise<void>;
  deleteFriendRequest: (userID: string) => Promise<void>;
  setThreadName: (name: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  changeNickname: (nickname: string, threadID: string, userID: string, callback?: (err?: Error) => void) => Promise<void>;
  addUserToGroup: (userID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  removeUserFromGroup: (userID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  markAsRead: (threadID: string, read?: boolean | ((err?: Error) => void), callback?: (err?: Error) => void) => Promise<{ success?: boolean;[key: string]: string | number | boolean | undefined }>;
  markAsDelivered: (threadID: string, messageID: string, callback?: (err?: Error) => void) => Promise<void>;
  sendTypingIndicator: (threadID: string, callback?: (err?: Error) => void) => Promise<void>;
  uploadVideoWeb: (options: UploadVideoWebOptions) => Promise<UploadVideoWebResult>;
  uploadVideoWebV2: (options: UploadVideoWebV2Options) => Promise<UploadVideoWebV2Result>;
  publishVideoPost: (options: PublishVideoPostOptions) => Promise<PublishVideoPostResult>;
  ctx?: MQTTContext;

  [key: string]: string | number | boolean | null | undefined | FacebookClient | Array<FacebookClient> | ((...args: unknown[]) => unknown);
}
