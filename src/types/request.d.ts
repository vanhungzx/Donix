

import { AxiosRequestConfig, AxiosResponse } from "axios";
import { CookieJar as ToughCookieJar } from "tough-cookie";


export type FBResponse<T = string> = AxiosResponse<T> & {
  config: AxiosRequestConfig & { fbOriginalForm?: Record<string, string | number | boolean | null | undefined> };
};

/** Body từ layer got (`axios.ts` normalize) — dùng chung với FBResponse trong DefaultFuncs */
export interface FbNetworkResponse {
  data: unknown;
  status?: number;
  statusCode?: number;
  statusText?: string;
  headers: Record<string, string | string[] | undefined>;
  config?: Record<string, unknown> & {
    fbOriginalForm?: Record<string, string | number | boolean | null | undefined>;
    url?: string;
    baseURL?: string;
  };
  request?: Record<string, unknown> & {
    res?: { responseUrl?: string };
  };
  url?: string;
  body?: unknown;
}

export type DefaultFuncsHttpResponse = FBResponse<string> | FbNetworkResponse;


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


/** Trường runtime gắn trên GlobalOptions hoặc Context để throttle request */
export interface RequestCooldownState {
  _checkpointCooldownUntil?: number;
  _checkpointCooldownReason?: string;
  _checkpointCooldownLogMap?: Map<string, number>;
  _checkpointManualRequired?: boolean;
  _checkpointDetectedAt?: number;
  _autoLoginCooldownUntil?: number;
}

export interface GlobalOptions extends RequestCooldownState {
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


export interface BrowserFingerprint {
  userAgent: string;
  secChUa: string;
  secChUaFullVersionList: string;
  secChUaPlatform: string;
  secChUaPlatformVersion: string;
}

export interface MessengerSpinHeaders {
  __spin_r?: string;
  __spin_b?: string;
  __spin_t?: string;
}

export interface Context extends RequestCooldownState {
  userID: string;
  jar: ToughCookieJar & CookieJar;
  clientID: string;
  options: GlobalOptions;
  /** Alias của options — dùng cho request layer */
  globalOptions?: GlobalOptions;
  fb_dtsg: string;
  lsd?: string;
  fb_lsd?: string;
  jazoest?: string;
  __dyn?: string;
  __csr?: string;
  __hs?: string;
  __hsi?: string;
  qpl_active_flow_ids?: string;
  _browserFingerprint?: BrowserFingerprint;
  auto_login?: boolean;
  _autoLoginPromise?: Promise<unknown>;
  _autoLoginRequestInFlight?: boolean;
  master?: MessengerSpinHeaders;
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
  get: (url: string, jar: ToughCookieJar & CookieJar, qs?: Record<string, string | number | boolean | null | undefined> | null, cx?: Context | null, customHeader?: Record<string, string>) => Promise<DefaultFuncsHttpResponse>;
  post: (url: string, jar: ToughCookieJar & CookieJar, form?: Record<string, string | number | boolean | null | undefined>, cx?: Context | null, customHeader?: Record<string, string>) => Promise<DefaultFuncsHttpResponse>;
  postFormData: (url: string, jar: ToughCookieJar & CookieJar, form?: Record<string, string | number | boolean | null | undefined>, qs?: Record<string, string | number | boolean | null | undefined>, cx?: Context | null) => Promise<DefaultFuncsHttpResponse>;
  json?: (url: string, jar: ToughCookieJar & CookieJar, qs?: Record<string, string | number | boolean | null | undefined> | null, options?: Record<string, string | number | boolean | null | undefined>, ctx?: Context | null, customHeader?: Record<string, string>) => Promise<Array<Record<string, string | number | boolean | null | undefined>>>;
}


export interface RequestClient {
  markAsDelivered: (threadID: string, messageID: string, callback?: (err?: Error) => void) => Promise<void>;
  markAsRead: (threadID: string, read?: boolean | ((err?: Error) => void), callback?: (err?: Error) => void) => Promise<{ success?: boolean; [key: string]: string | number | boolean | undefined }>;
  getCurrentUserID?: () => string;
}
