import type {
  BotConfig,
  BotEventType,
  FacebookClient,
  Logger,
  MainData,
  MessageForm,
  SendMessageResult,
  ServicesMap,
  ThreadDataModel,
  UserDataModel
} from "@types";

export type CommandMessengerCallback = (err: Error | null, data?: SendMessageResult) => void;

export type HandlerSend = {
  (form: MessageForm | string): Promise<SendMessageResult>;
  (form: MessageForm | string, callback: CommandMessengerCallback): Promise<SendMessageResult>;
};

export type HandlerReply = {
  (form: MessageForm | string): Promise<SendMessageResult>;
  (form: MessageForm | string, callback: CommandMessengerCallback): Promise<SendMessageResult>;
};

export type HandlerContact = {
  (form: MessageForm | string, targetID?: string): Promise<SendMessageResult>;
  (form: MessageForm | string, targetID: string, callback: CommandMessengerCallback): Promise<SendMessageResult>;
};

export type HandlerUnsend = {
  (messageID: string): Promise<{ success?: boolean }>;
  (messageID: string, callback: (err: Error | null, data?: { success?: boolean }) => void): Promise<{ success?: boolean }>;
};

export type HandlerEdit = {
  (form: MessageForm | string, messageID: string): Promise<{ success?: boolean }>;
  (form: MessageForm | string, messageID: string, callback: (err: Error | null, data?: { success?: boolean }) => void): Promise<{ success?: boolean }>;
};

export type HandlerReact = {
  (emoji: string, messageID?: string, threadID?: string): Promise<{ success?: boolean }>;
  (emoji: string, messageID: string, threadID: string, callback: (err: Error | null, data?: { success?: boolean }) => void): Promise<{ success?: boolean }>;
};

export interface HandlerHelpers {
  send: HandlerSend;
  reply: HandlerReply;
  unsend: HandlerUnsend;
  contact: HandlerContact;
  edit: HandlerEdit;
  react: HandlerReact;
}

export interface HandlerDependencies {
  client: FacebookClient;
  userData: UserDataModel;
  threadData: ThreadDataModel;
  main: MainData;
  antist?: unknown;
  api?: ServicesMap;
  utils?: Record<string, unknown>;
  logger?: Logger;
}

export interface HandlerEventArgs<T extends BotEventType = BotEventType> {
  event: T;
  config: BotConfig;
  helpers: HandlerHelpers;
}
