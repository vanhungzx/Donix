type Headers = Record<string, string>;

type ConstantsModule = {
  AE: { MAIN_KEY: Buffer; MAIN_IV: Buffer };
  HEADERS: { COMMON: Headers; GARENA_AUTH: Headers };
  GARENA_CLIENT: { CLIENT_ID: string; CLIENT_SECRET: string };
  DEFAULT_CREDENTIALS: { UID: string; PASSWORD: string };
  URLS: Record<string, string | ((serverUrl: string) => string)>;
};

const mod = require("./constants.js") as ConstantsModule;

export const AE = mod.AE;
export const HEADERS = mod.HEADERS;
export const GARENA_CLIENT = mod.GARENA_CLIENT;
export const DEFAULT_CREDENTIALS = mod.DEFAULT_CREDENTIALS;
export const URLS = mod.URLS;
export default mod;
