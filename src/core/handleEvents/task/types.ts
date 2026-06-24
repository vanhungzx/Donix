import { FacebookClient } from "../../../types/client";

export interface Logger {
  info?: (...args: any[]) => void;
  warn?: (...args: any[]) => void;
  error?: (...args: any[]) => void;
  success?: (...args: any[]) => void;
}

declare global {
  var send_toptt: boolean;
}

export interface BotThreadListItem {
  threadID: string;
  isGroup?: boolean;
  isSubscribed?: boolean;
}

export interface BotUserInfo {
  id: string;
  name?: string;
  gender?: string | null;
}

export interface BotThreadInfo {
  threadName?: string;
  userInfo?: BotUserInfo[];
  adminIDs?: { id: string }[] | string[];
}

export interface Bot {
  id?: string | number;
  getCurrentUserID?: () => string | Promise<string | number>;
  getThreadList?: (limit: number, cursor: any, folders: string[]) => Promise<BotThreadListItem[]>;
  getThreadInfo?: (threadID: string) => Promise<BotThreadInfo>;
  sendMessage: (message: any, threadID: string) => Promise<any>;
  changeNickname: (nickname: string, threadID: string, userID: string) => Promise<any>;
}

export interface UserDataStore {
  getName?: (userID: string) => Promise<string | null | undefined>;
  get?: (userID: string) => Promise<any>;
  create?: (userID: string, payload: any) => Promise<any>;
  update?: (userID: string, payload: any) => Promise<any>;
}

export interface ThreadDataStore {
  get: (threadID: string) => Promise<any>;
  getAll: (key: string) => Promise<Array<{ threadID: string;[k: string]: any }>>;
  update: (threadID: string, payload: any) => Promise<any>;
  getAllMessageCount: () => Promise<Array<{ threadID: string; messageCount: any }>>;
  checkInactiveThreads?: () => Promise<string[]>;
}

export interface Config {
  PREFIX?: string;
  BOTNAME?: string;
  timeZone?: string;
  token?: Record<string, string>;
  tokens?: Record<string, string>;
}

export type FactoryArgs = {
  client: FacebookClient;
  logger?: Logger;
  main?: unknown;
  userData: UserDataStore;
  threadData: ThreadDataStore;
  config: Config;
};

export type Maybe<T> = T | null | undefined;
