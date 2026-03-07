import { binaryToDecimal } from "./binary.js";

export function generateOfflineThreadingID(): string {
  const ret = Date.now();
  const value = Math.floor(Math.random() * 4294967295);
  const str = ("0000000000000000000000" + value.toString(2)).slice(-22);
  const msgs = ret.toString(2) + str;
  return binaryToDecimal(msgs);
}

export function generateThreadingID(clientID: string): string {
  const k = Date.now();
  const l = Math.floor(Math.random() * 4294967295);
  const m = clientID;
  return `<${k}:${l}-${m}@mail.projektitan.com>`;
}

export function getSignatureID(): string {
  return Math.floor(Math.random() * 2147483648).toString(16);
}
