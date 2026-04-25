import type { MqttClient } from "mqtt";
import type { Bot } from "../core/handleEvents/task/types";
import type { FacebookClient } from "./client";
import type { BotConfig, ServicesMap } from "./index";

export type AccountTokens = Record<string, string>;

export interface DonixGlobalState {
  account?: {
    cookie: string;
    token: AccountTokens | null;
  };
  cookie?: {
    douyin?: string;
    capcut?: string;
    [key: string]: string | undefined;
  };
  douyin?: {
    cookie?: string;
    [key: string]: string | number | boolean | null | undefined;
  };
  uploads?: Record<string, string | number | boolean | null | undefined>;
  api?: ServicesMap;
  bot?: Bot;
  client?: FacebookClient;
  config?: BotConfig | null;
  mqttClient?: MqttClient;
  utils?: Record<string, string | number | boolean | null | undefined | ((...args: unknown[]) => unknown)>;
  timeStart?: number;
  send_toptt?: boolean;

  vdgai?: [string, string][];
  vdanime?: [string, string][];
  vdcos?: [string, string][];
  vdtrai?: [string, string][];
  vdchill?: [string, string][];
  [key: string]: string | number | boolean | null | undefined | DonixGlobalState | Array<DonixGlobalState> | [string, string][] | Record<string, string | number | boolean | null | undefined> | ((...args: unknown[]) => unknown);
}

declare global {
  var Donix: DonixGlobalState;
  var cookie: Record<string, string>;
  var account: {
    cookie?: string;
    token?: AccountTokens | null;
  };
  namespace NodeJS {
    interface Global {
      Donix: DonixGlobalState;
      cookie: Record<string, string>;
      account: {
        cookie?: string;
        token?: AccountTokens | null;
      };
    }
  }
}
export { };
