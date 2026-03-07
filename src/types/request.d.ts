

import { AxiosRequestConfig, AxiosResponse } from "axios";
import { CookieJar as ToughCookieJar } from "tough-cookie";


export type FBResponse<T = string> = AxiosResponse<T> & {
  config: AxiosRequestConfig & { fbOriginalForm?: Record<string, string | number | boolean | null | undefined> };
};


export interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  [key: string]: string | Date | boolean | undefined;
}

export interface CookieJar {
  setCookie(cookie: string, url: string): void;
  getCookies(url: string): Cookie[];
  cookieString(): string;
  setCookieSync(cookie: string, url: string): void;
  getCookiesSync(url: string): Cookie[];
  getCookieStringSync(url: string): string;
}


export interface GlobalOptions {
  userAgent?: string;
  pageID?: string;
  autoMarkRead?: boolean;
  autoMarkDelivery?: boolean;
  selfListen?: boolean;
  listenEvents?: boolean;
  autoReconnect?: boolean;
  online?: boolean;
  proxy?: string;
}


export interface Context {
  userID: string;
  jar: ToughCookieJar & CookieJar;
  clientID: string;
  options: GlobalOptions;
  fb_dtsg: string;
  access_token: string;
  clientMutationId: number;
  loggedIn: boolean;
  lastSeqId?: string;
  mqttEndpoint?: string;
  region?: string;
  clientId?: string;
  callback_Task: Map<string, (result: string | number | boolean | null | undefined | Record<string, string | number | boolean | null | undefined>) => void>;
  reqCallbacks: Map<string, (result: string | number | boolean | null | undefined | Record<string, string | number | boolean | null | undefined>) => void>;
  firstListen: boolean;
  req_ID: number;
  wsReqNumber: number;
  wsTaskNumber: number;
  mqttClient?: import("mqtt").MqttClient;
  syncToken?: string;
  ttstamp?: string;
  i_userID?: string;
  _mqttReconnectTimer?: NodeJS.Timeout;
  t_mqttCalled?: boolean;
  tmsWait?: () => void;
}


export interface ParseContext {
  jar: ToughCookieJar & CookieJar;
  fb_dtsg?: string;
  ttstamp?: string;
}


export interface DefaultFuncs {
  get: (url: string, jar: ToughCookieJar & CookieJar, qs?: Record<string, string | number | boolean | null | undefined> | null, cx?: Context | null, customHeader?: Record<string, string>) => Promise<FBResponse<string>>;
  post: (url: string, jar: ToughCookieJar & CookieJar, form?: Record<string, string | number | boolean | null | undefined>, cx?: Context | null, customHeader?: Record<string, string>) => Promise<FBResponse<string>>;
  postFormData: (url: string, jar: ToughCookieJar & CookieJar, form?: Record<string, string | number | boolean | null | undefined>, qs?: Record<string, string | number | boolean | null | undefined>, cx?: Context | null) => Promise<FBResponse<string>>;
  json?: (url: string, jar: ToughCookieJar & CookieJar, qs?: Record<string, string | number | boolean | null | undefined> | null, options?: Record<string, string | number | boolean | null | undefined>, ctx?: Context | null, customHeader?: Record<string, string>) => Promise<Array<Record<string, string | number | boolean | null | undefined>>>;
}


export interface RequestClient {
  markAsDelivered: (threadID: string, messageID: string, callback?: (err?: Error) => void) => Promise<void>;
  markAsRead: (threadID: string, read?: boolean | ((err?: Error) => void), callback?: (err?: Error) => void) => Promise<{ success?: boolean; [key: string]: string | number | boolean | undefined }>;
  getCurrentUserID?: () => string;
}
