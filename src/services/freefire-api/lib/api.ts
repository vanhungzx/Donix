export type SessionInfo = {
  token: string | null;
  serverUrl: string | null;
  openId: string | null;
  accountId: number | string | null;
};

export type FreeFireApiClient = {
  login(uid?: string | null, password?: string | null, options?: Record<string, unknown>): Promise<SessionInfo>;
  searchAccount(keyword: string): Promise<unknown[]>;
  getPlayerStats(uid: string, gamemode: "br" | "cs", matchmode: "CAREER" | "NORMAL" | "RANKED"): Promise<Record<string, unknown>>;
  getPlayerProfile(uid: number): Promise<Record<string, unknown>>;
  getPlayerItems(uid: number): Promise<Record<string, unknown> | null>;
};

const FreeFireAPI = require("./api.js") as (new () => FreeFireApiClient);

export default FreeFireAPI;
