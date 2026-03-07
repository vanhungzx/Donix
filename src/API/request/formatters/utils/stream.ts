import * as stream from "stream";

export const isReadableStream = (obj: unknown): obj is stream.Stream =>
  obj instanceof stream.Stream && typeof (obj as any)._read === "function" && typeof (obj as any)._readableState === "object";

export const decodeClientPayload = (payload: Uint8Array): any =>
  JSON.parse(String.fromCharCode.apply(null, Array.from(payload) as any));
