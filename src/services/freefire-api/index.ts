type SessionInfo = {
  token: string | null;
  serverUrl: string | null;
  openId: string | null;
  accountId: number | string | null;
};

type FreeFireApiCtor = new () => {
  login(uid?: string | null, password?: string | null, options?: Record<string, unknown>): Promise<SessionInfo>;
};

const FreeFireAPI = require("./lib/api.js") as FreeFireApiCtor;

export default FreeFireAPI;
