import { getGUID } from "../constants.js";
import { formatAttachment } from "./data/formatAttachment.js";
import { formatDeltaEvent } from "./data/formatDelta.js";
import {
  getAppState,
  getJar,
  markDelivery,
  parseAndCheckLogin,
  saveCookies,
} from "./utils/login.js";
import { getType } from "./utils/type.js";
import formatID from "./value/formatID.js";

import type {
  RequestClient as Client,
  Context,
  CookieJar,
  DefaultFuncs,
  FBResponse,
  GlobalOptions,
} from "@types";

const utils = {
  getJar,
  saveCookies,
  getAppState,
  parseAndCheckLogin,
  getType,
  getGUID,
  formatID,
  formatAttachment,
  markDelivery,
  formatDeltaEvent,
};

export default utils;
export {
  formatAttachment,
  formatDeltaEvent,
  formatID,
  getAppState,
  getGUID,
  getJar,
  getType,
  markDelivery,
  parseAndCheckLogin,
  saveCookies
};

export type { Client, Context, CookieJar, DefaultFuncs, FBResponse, GlobalOptions };
