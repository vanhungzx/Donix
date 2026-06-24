export interface TikTokCredentials {
  cookie: string;
  xTtToken?: string;
}

export interface TikTokRequestOptions extends Partial<TikTokCredentials> {
  cookie?: string;
  xTtToken?: string;
}

export interface TikTokUserInfo {
  uid: string;
  uniqueId: string;
  secUid: string;
  followerCount: number;
  followingCount: number;
  avatarUri: string;
}

export interface TikTokAwemeListOptions extends TikTokRequestOptions {
  maxCursor?: string;
  cursor?: string;
  userId?: string;
  count?: string | number;
}

export interface TikTokAwemeDetailsOptions extends TikTokRequestOptions {
  originType?: string;
  requestSource?: string;
}

export interface TikTokMultiAwemeOptions extends TikTokRequestOptions {
  awemeIds: Array<string | number>;
  requestSource?: string;
  shareLinkMode?: number;
  shareScene?: number;
}

export type JsonObject = Record<string, unknown>;
