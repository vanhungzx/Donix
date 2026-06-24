import type { DonixGlobalState } from "../../../../types/global";
import type { Config, Logger } from "../types";
import { slp } from "../utils";
import { CONFIG_PATH, detectPrefix, rmCycle, TOK, writeTokenKey } from "./utils";

interface TokenInfo {
  [key: string]: string | string[];
}

interface BasicScope {
  name: string;
  appliesTo: string;
}

interface ParsedAccessTokenData {
  tokenInfo: TokenInfo;
  basicScopes: BasicScope[];
}

interface APIWithTokenMethods {
  checkToken?: (accessToken: string) => Promise<ParsedAccessTokenData | undefined>;
  getToken?: (type: string) => Promise<string | null>;
}

const getDonixState = (): DonixGlobalState => {
  if (!global.Donix) {
    global.Donix = {} as DonixGlobalState;
  }
  return global.Donix;
};

export class TokenMgr {
  constructor(private logger?: Logger) { }

  async check(tok?: string | null): Promise<"missing" | "live" | "dead" | "unknown"> {
    if (!tok) {
      return "missing";
    }
    try {
      const donix = getDonixState();


      let api = donix.api as APIWithTokenMethods | undefined;
      if (!api || typeof api.checkToken !== "function") {
        const maxRetries = 5;
        const retryDelay = 1000;
        let retries = 0;

        while (retries < maxRetries && (!api || typeof api.checkToken !== "function")) {
          if (retries === 0) {
            this.logger?.info?.("Đang đợi checkToken sẵn sàng...");
          }
          await slp(retryDelay);
          api = getDonixState().api as APIWithTokenMethods | undefined;
          retries++;
        }
      }

      if (!api || typeof api.checkToken !== "function") {
        this.logger?.error?.("checkToken không phải là function sau khi đợi");
        return "unknown";
      }

      this.logger?.info?.("Đang gọi checkToken...");
      const data = await api.checkToken(tok);

      if (!data || !data.tokenInfo) {
        this.logger?.warn?.("checkToken trả về dữ liệu không hợp lệ");
        return "dead";
      }

      const tokenInfoKeys = Object.keys(data.tokenInfo);
      this.logger?.info?.(`checkToken response: ${JSON.stringify(tokenInfoKeys)}`);




      if (tokenInfoKeys.length <= 5) {
        this.logger?.warn?.(`Token response quá ít thông tin (${tokenInfoKeys.length} keys), coi như token đã die`);
        return "dead";
      }


      const hopLe = data.tokenInfo.hop_le;
      if (typeof hopLe === "string" && (hopLe === "Đúng" || hopLe === "Valid" || hopLe === "True")) {
        this.logger?.info?.("Token hợp lệ (live)");
        return "live";
      }


      if (typeof hopLe === "string" && (hopLe === "Sai" || hopLe === "Invalid" || hopLe === "False")) {
        this.logger?.warn?.("Token không hợp lệ");
        return "dead";
      }


      if (hopLe === undefined || hopLe === null) {
        this.logger?.warn?.(`Token không có hop_le, coi như token đã die`);
        return "dead";
      }


      this.logger?.warn?.(`Token status không rõ ràng: ${String(hopLe)}, coi như token đã die để làm mới`);
      return "dead";
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.logger?.error?.(`Lỗi kiểm tra token: ${error.message || String(e)}`);
      if (error.stack) {
        this.logger?.error?.(error.stack);
      }
      return "unknown";
    }
  }

  async refresh(type: string): Promise<string | null> {
    try {
      const donix = getDonixState();
      const api = donix.api as APIWithTokenMethods | undefined;
      if (!api || typeof api.getToken !== "function") {
        this.logger?.error?.(`Làm mới token ${type}: getToken không phải là function`);
        return null;
      }
      const t = await api.getToken(type);
      if (!t) {
        this.logger?.error?.(`Làm mới token ${type}: không lấy được token`);
        return null;
      }
      return t;
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.logger?.error?.(`Lỗi làm mới token ${type}: ${error.message || String(e)}`);
      return null;
    }
  }

  async handle(
    tokens: { token?: Record<string, string> },
    { type }: { type: string },
    opts: { tolerant?: boolean; ensureAll?: boolean }
  ): Promise<{ token?: Record<string, string> }> {
    try {
      const cur = tokens?.token?.[type];
      const st = await this.check(cur);

      if (st === "live") {
        return tokens;
      }
      if (st === "unknown" && opts.tolerant !== false) {
        return tokens;
      }
      if (st === "missing" && !opts.ensureAll) {
        return tokens;
      }
      const nt = await this.refresh(type);
      if (!nt) {
        this.logger?.error?.(`Không thể làm mới token ${type}`);
        return tokens;
      }
      tokens.token = tokens.token || {};
      tokens.token[type] = nt;
      const fp = CONFIG_PATH;
      let wrote = false;
      let n = 3;
      while (n-- && !wrote) {
        try {
          wrote = (await writeTokenKey(fp, "token", type, nt, this.logger)) || (await writeTokenKey(fp, "tokens", type, nt, this.logger));
          if (!wrote) {
            await slp(800);
          }
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.logger?.error?.(`Lỗi ghi file token: ${error.message || String(err)}`);
        }
      }
      if (wrote) this.logger?.success?.(`Đã làm mới và lưu token ${type}`);
      else this.logger?.error?.(`Không thể cập nhật token ${type} sau 3 lần thử`);
      return tokens;
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.logger?.error?.(`Lỗi xử lý token ${type}: ${error.message}`);
      if (error.stack) this.logger?.error?.(error.stack);
      return tokens;
    }
  }

  async run(cfg: Config, opts: { ensureAll?: boolean; tolerant?: boolean } = {}): Promise<void> {
    try {
      const o = { ensureAll: false, tolerant: true, ...opts };

      const snapshot = JSON.parse(JSON.stringify(cfg || {}, rmCycle()));
      const baseRaw: Record<string, string> = snapshot.token || snapshot.tokens || {};

      const norm: Record<string, string> = {};
      for (const k of Object.keys(baseRaw)) {
        const keyUpper = String(k).toUpperCase();
        const value = String(baseRaw[k] || "").trim();

        let pref: string | null = null;
        if (TOK.TYPES.some(t => t.type === keyUpper)) {
          pref = keyUpper;
        } else {
          pref = detectPrefix(value);
        }

        if (pref && value && !norm[pref]) {
          norm[pref] = value;
        }
      }

      let tokens: { token: Record<string, string> } = { token: { ...norm } };
      const list = o.ensureAll ? TOK.TYPES : TOK.TYPES.filter(t => tokens.token[t.type]);

      for (const t of list) {
        const result = await this.handle(tokens, t, o);
        tokens = { token: result.token || tokens.token };
      }

      if (cfg) {
        cfg.token = { ...(cfg.token || {}), ...tokens.token };
      }
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.logger?.error?.(`Lỗi kiểm tra token: ${error.message || String(e)}`);
      if (error.stack) this.logger?.error?.(error.stack);
      throw error;
    }
  }
}
