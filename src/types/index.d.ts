import { MqttClient } from "mqtt";
import { EventEmitter } from "node:events";

export interface MQTTOptions {
  online?: boolean;
  userAgent?: string;
  proxy?: string;
  emitReady?: boolean;
  updatePresence?: boolean;
  listenEvents?: boolean;
  selfListen?: boolean;
  autoMarkDelivery?: boolean;
  autoMarkRead?: boolean;
  pageID?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export interface MQTTContext extends Omit<FacebookContext, "loggedIn" | "tasks" | "options"> {
  mqttClient: MqttClient | null;
  isReconnecting?: boolean;
  wasReconnecting?: boolean;
  lastSeqId?: number | null;
  syncToken?: string;
  t_mqttCalled?: boolean;
  tmsWait?: () => void;
  options?: MQTTOptions;
  tasks: Map<string, string | number | boolean | null | undefined | Record<string, string | number | boolean | null | undefined>>;
  loggedIn: boolean;
  auto_login: boolean;
}

// DefaultFuncs is now exported from ./request

export type ListenerCallback = (err: Error | null, msg?: BotEvent) => void;

export interface ListenerEmitter extends EventEmitter {
  stopListening: (cb?: () => void) => void;
  stopListeningAsync: () => Promise<void>;
}

export interface MessageCleanupIntervalRef {
  current: NodeJS.Timeout | null;
}


export interface PhotoAttachment {
  type: "photo";
  ID?: string;
  filename?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  previewWidth?: number;
  previewHeight?: number;
  largePreviewUrl?: string;
  largePreviewWidth?: number;
  largePreviewHeight?: number;
  url?: string;
  width?: number;
  height?: number;
  name?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface AnimatedImageAttachment {
  type: "animated_image";
  ID?: string;
  name?: string;
  previewUrl?: string;
  previewWidth?: number;
  previewHeight?: number;
  url?: string;
  width?: number;
  height?: number;
  facebookUrl?: string;
}

export interface VideoAttachment {
  type: "video";
  ID?: string;
  filename?: string;
  duration?: number;
  thumbnailUrl?: string;
  previewUrl?: string;
  previewWidth?: number;
  previewHeight?: number;
  url?: string;
  width?: number;
  height?: number;
  videoType?: string;
}

export interface FileAttachment {
  type: "file";
  ID?: string;
  filename?: string;
  url?: string;
  isMalicious?: boolean;
  contentType?: string;
  name?: string;
  mimeType?: string;
  fileSize?: number;
}

export interface AudioAttachment {
  type: "audio";
  ID?: string;
  filename?: string;
  duration?: number;
  audioType?: string;
  url?: string;
  isVoiceMail?: boolean;
}

export interface StickerAttachment {
  type: "sticker";
  ID?: string;
  url?: string;
  packID?: string;
  spriteUrl?: string;
  spriteUrl2x?: string;
  width?: number;
  height?: number;
  caption?: string;
  description?: string;
  frameCount?: number;
  frameRate?: number;
  framesPerRow?: number;
  framesPerCol?: number;
  stickerID?: string;
}

export interface ShareAttachment {
  type: "share";
  ID?: string;
  url?: string;
  title?: string;
  description?: string | null;
  source?: string | null;
  image?: string;
  width?: number;
  height?: number;
  playable?: boolean;
  duration?: number;
  playableUrl?: string | null;
  subattachments?: Array<Record<string, string | number | boolean | null | undefined>>;
  properties?: Record<string, string>;
  facebookUrl?: string;
  target?: Record<string, string | number | boolean | null | undefined>;
  styleList?: Array<Record<string, string | number | boolean | null | undefined>>;
  isUnrecognized?: boolean;
}

export interface LocationAttachment {
  type: "location";
  ID?: string;
  latitude?: number;
  longitude?: number;
  image?: string;
  width?: number;
  height?: number;
  url?: string;
  address?: string;
  facebookUrl?: string;
  target?: Record<string, string | number | boolean | null | undefined>;
  styleList?: Array<Record<string, string | number | boolean | null | undefined>>;
}

export interface UnknownAttachment {
  type: "unknown";
  error?: string;
}

export type MessageAttachment = PhotoAttachment | AnimatedImageAttachment | VideoAttachment | FileAttachment | AudioAttachment | StickerAttachment | ShareAttachment | LocationAttachment | UnknownAttachment;

export interface MessageEvent {
  threadID: string;
  senderID: string;
  userID: string;
  author: string;
  body?: string;
  messageID?: string;
  timestamp?: number | string;
  type?: string;
  reaction?: string;
  logMessageType?: string;
  logMessageData?: {
    addedParticipants?: Array<{ userFbId: string }>;
  };
  isTyping?: boolean;
  from?: string;
  isGroup?: boolean;
  attachments?: MessageAttachment[];
  mentions?: Record<string, string>;
  participantIDs?: string[];
  args?: string[];
  messageReply?: {
    messageID?: string;
    body?: string;
    senderID?: string;
    [key: string]: string | number | boolean | null | undefined;
  };
}

export type CommandHandlerResult =
  | void
  | boolean
  | number
  | { handled?: boolean; matched?: boolean }
  | (() => Promise<void>);

export interface SendMessageResult {
  messageID?: string;
  threadID?: string;
  timestamp?: number;
  [key: string]: string | number | undefined;
}

export type CommandMessengerCallback = (err: Error | null, data?: SendMessageResult) => void;

export type CommandMessenger = {
  (form: MessageForm | string): Promise<SendMessageResult>;
  (form: MessageForm | string, callback: CommandMessengerCallback): Promise<SendMessageResult>;
};

export type ContactMessenger = {
  (form: MessageForm | string, targetID?: string): Promise<SendMessageResult>;
  (form: MessageForm | string, targetID: string, callback: CommandMessengerCallback): Promise<SendMessageResult>;
};

export type UnsendMessenger = {
  (messageID: string): Promise<{ success?: boolean }>;
  (messageID: string, callback: (err: Error | null, data?: { success?: boolean }) => void): Promise<{ success?: boolean }>;
};

export type EditMessenger = {
  (form: MessageForm | string, messageID: string): Promise<{ success?: boolean }>;
  (form: MessageForm | string, messageID: string, callback: (err: Error | null, data?: { success?: boolean }) => void): Promise<{ success?: boolean }>;
};

export type ReactMessenger = {
  (emoji: string, messageID?: string, threadID?: string): Promise<{ success?: boolean }>;
  (emoji: string, messageID: string, threadID: string, callback: (err: Error | null, data?: { success?: boolean }) => void): Promise<{ success?: boolean }>;
};

export interface CommandOptionalHelpers {
  react?: ReactMessenger | ((emoji: string) => Promise<{ success?: boolean }> | void);
  contact?: ContactMessenger;
  unsend?: UnsendMessenger;
  edit?: EditMessenger;
}

export interface CommandRuntimeHelpers extends CommandOptionalHelpers {
  send: CommandMessenger;
  reply: CommandMessenger;
  contact: ContactMessenger;
  unsend: UnsendMessenger;
  edit: EditMessenger;
}

export interface CommandContextBase extends EventParams, CommandRuntimeHelpers {
  client: FacebookClient;
  event: MessageEvent;
  main: MainData;
  args: string[];
  commandName: string;
  permission?: number;
  permssion?: number;
  body?: string;
  Reaction?: {
    messageID: string;
    author: string;
    reaction: string;
    [key: string]: string | number | boolean | null | undefined;
  };
  Reply?: ReplyData;
}

export type CommandOnCallContext = CommandContextBase;
export interface CommandOnEventContext extends Omit<CommandContextBase, 'event'> {
  event: ExtendedMessageEvent;
}
export type CommandOnChatContext = CommandContextBase;
export interface CommandOnReactContext extends CommandContextBase {
  commandName: string;
  Reaction: ReactData & {
    reaction: string;
  };
  messageID: string;
  author: string;
  [key: string]: string | number | boolean | null | undefined | CommandContextBase | ReactData;
}
export interface CommandOnReplyContext extends CommandContextBase {
  commandName: string;
  Reply: ReplyData;
  messageID: string;
  author: string;
  [key: string]: string | number | boolean | null | undefined | CommandContextBase | ReplyData;
}
export interface CommandOnLoadContext extends EventParams, CommandOptionalHelpers {
  main: MainData;
  client: FacebookClient;
  api: ServicesMap;
  utils: Record<string, unknown>;
  logger: Logger;
  threadData: ThreadDataModel;
  userData: UserDataModel;
}

export interface Command {
  name: string;
  alias?: string[];
  version?: string;
  role?: number;
  category?: string;
  desc?: string;
  guide?: string;
  prefix?: boolean;
  cd?: number;
  config?: {
    name: string;
    [key: string]: string | number | boolean | null | undefined;
  };
  onLoad?: (ctx: CommandOnLoadContext) => Promise<void> | void;
  onCall?: (ctx: CommandOnCallContext) => Promise<void> | void;
  onChat?: (ctx: CommandOnChatContext) => CommandHandlerResult | Promise<CommandHandlerResult>;
  onEvent?: (ctx: CommandOnEventContext) => CommandHandlerResult | Promise<CommandHandlerResult>;
  onReact?: (ctx: CommandOnReactContext) => Promise<void> | void;
  onReply?: (ctx: CommandOnReplyContext) => Promise<void> | void;
  event?: (ctx: CommandOnEventContext) => Promise<void> | void;
}

export interface CommandContext {
  send: (text: string) => Promise<void>;
  reply: (text: string) => Promise<void>;
  unsend: (messageID: string) => Promise<void>;
  edit: (messageID: string, text: string) => Promise<void>;
  react: (emoji: string) => Promise<void>;
  contact: (userID: string) => Promise<void>;
  message: (messageID: string) => Promise<void>;
  userID: string;
  threadID: string;
  messageID?: string;
}

export interface BotConfig {
  cookie: string;
  prefix: string;
  admin: string[];
  userAgent: string;
  /** false: chỉ OWNER/ADMIN dùng lệnh; onChat/onReply tắt với người khác */
  botInteractionEnabled?: boolean;
  /** false: không nhận lệnh `bot` khi không có prefix; vẫn dùng PREFIX+bot */
  botNoPrefixEnabled?: boolean;
  /** false: tắt autodown toàn bot (ghi đè bật theo nhóm) */
  botAutodownEnabled?: boolean;
  /** false: tắt preload/upload cache video nền (handleUpload manager) */
  handleUploadEnabled?: boolean;
  token?: {
    EAAAAU?: string;
    EAAD6V7?: string;
    EAAD?: string;
    [key: string]: string | undefined;
  };
  DevMode?: boolean;
  settings: {
    language: string;
    autoReconnect: boolean;
  };
  onConfigReload?: (config: BotConfig) => void | Promise<void>;
  loadSrcips?: {
    enable?: boolean;
    cmdDis?: string[];
    eventDis?: string[];
  };
  [key: string]: string | number | boolean | string[] | { language: string; autoReconnect: boolean } | { enable?: boolean; cmdDis?: string[]; eventDis?: string[] } | { EAAAAU?: string; EAAD6V7?: string; EAAD?: string;[key: string]: string | undefined } | ((config: BotConfig) => void | Promise<void>) | null | undefined;
}

export interface SocketPacket {
  type: string;
  data: string | number | boolean | null | undefined | Record<string, string | number | boolean | null | undefined> | Array<string | number | boolean | null | undefined>;
}

export interface FacebookContext {
  userID: string;
  loggedIn: boolean;
  cookie: string;
  fb_dtsg?: string;
  jazoest?: string;
  mqttEndpoint?: string;
  region?: string;
  lsd?: string;
  options?: MQTTOptions;
  clientId?: string;
  sessionId: string;
  timestamp: number;
  auto_login: boolean;
  jar: CookieJar;
  mqttClient?: MqttClient;
  ctx?: MQTTContext;
  clientID: string;
  firstListen: boolean;
  req_ID: number;
  wsReqNumber: number;
  wsTaskNumber: number;
  tasks: Map<string, string | number | boolean | null | undefined | Record<string, string | number | boolean | null | undefined>>;
}

export interface ApiMethods {
  send: (form: MessageForm) => Promise<SendMessageResult>;
  reply: (form: MessageForm, messageID?: string) => Promise<SendMessageResult>;
  unsend: (messageID: string) => Promise<{ success?: boolean }>;
  contact: (form: MessageForm, targetID?: string) => Promise<SendMessageResult>;
  edit: (form: MessageForm, messageID: string) => Promise<{ success?: boolean }>;
  react: (emoji: string, messageID?: string, threadID?: string) => Promise<{ success?: boolean }>;
  message: (messageID?: string) => Promise<MessageEvent | null>;
}

export interface EventParams {
  utils: Record<string, unknown>;
  config: BotConfig;
  api: ServicesMap;
  main: MainData;
  userData: UserDataModel;
  threadData: ThreadDataModel;
  logger: Logger;
  [key: string]: string | number | boolean | null | undefined | Record<string, unknown> | BotConfig | ServicesMap | MainData | UserDataModel | ThreadDataModel | Logger;
}

export interface EventContext extends EventParams, CommandRuntimeHelpers {
  event: MessageEvent;
  main: MainData;
}

export interface BotEvent {
  name: string;
  type: string | string[];
  version?: string;
  desc?: string;
  config?: {
    name: string;
    [key: string]: string | number | boolean | null | undefined;
  };
  onLoad?: (ctx: EventParams) => Promise<void> | void;
  onCall: (ctx: EventContext) => Promise<void> | void;
}

export type BotEventDefinition = BotEvent;

export interface ReplyData {
  commandName: string;
  messageID: string;
  author: string;
  case?: string;
  /** Arbitrary payload (game state, DB rows, etc.). */
  data?: unknown;
  role?: number;
  delete?: () => void;
  /** Plugin payloads (lists, game state, timers, etc.) — kept loose so handlers can narrow. */
  [key: string]: unknown;
}

export interface ReactData {
  commandName: string;
  messageID?: string;
  author?: string;
  delete?: () => void;
  [key: string]: string | number | boolean | null | undefined | (() => void);
}

export type ReplyHandler = (data: ReplyData) => void | Promise<void> | boolean | number | { handled?: boolean; matched?: boolean } | (() => Promise<void>);

export interface MainData {
  /** Ephemeral command/game state; values are narrowed at use sites. */
  processData: Map<string, unknown>;
  cmds: Map<string, Command>;
  events: Map<string, BotEvent>;
  cd: Map<string, Map<string, number>>;
  onReact: Map<string, ReactData>;
  onReply: Map<string, ReplyData>;
  onEvent: Array<string | ((data: ExtendedMessageEvent) => void | Promise<void> | boolean | number | { handled?: boolean; matched?: boolean } | (() => Promise<void>))>;
  onChat: Array<string | ((data: ExtendedMessageEvent) => void | Promise<void> | boolean | number | { handled?: boolean; matched?: boolean } | (() => Promise<void>))>;
}

export interface UserInfo {
  name?: string;
  gender?: string | null;
  data?: Record<string, string | number | boolean | null | undefined>;
  userInfo?: Record<string, string | number | boolean | null | undefined>;
}

export interface UserRecord {
  name: string;
  userInfo?: UserInfo;
  setting: Record<string, string | number | boolean | null | undefined>;
  gender: string | null;
  data: Record<string, string | number | boolean | null | undefined>;
}

export type { ServicesMap } from "./api";
export type { FacebookClient, MessageForm, MusicStickerItem } from "./client";
export type { ThreadDataModel, UserDataModel } from "./database";
export type { BotEvent as BotEventType, ExtendedMessageEvent } from "./event";
export type { Logger } from "./logger";
export type {
  Context,
  Cookie,
  CookieJar,
  DefaultFuncs,
  DefaultFuncsHttpResponse,
  FBResponse,
  FbNetworkResponse,
  GlobalOptions,
  ParseContext,
  RequestClient,
} from "./request";
