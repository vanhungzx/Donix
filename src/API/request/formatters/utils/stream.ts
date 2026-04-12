import * as stream from "stream";

interface StreamWithReadableInternals {
  _read?: unknown;
  _readableState?: unknown;
}

export const isReadableStream = (obj: unknown): obj is stream.Stream =>
  obj instanceof stream.Stream &&
  typeof (obj as StreamWithReadableInternals)._read === "function" &&
  typeof (obj as StreamWithReadableInternals)._readableState === "object";

export const decodeClientPayload = (payload: Uint8Array): unknown => {
  const codes = Array.from(payload) as number[];
  return JSON.parse(String.fromCharCode.apply(null, codes));
};
