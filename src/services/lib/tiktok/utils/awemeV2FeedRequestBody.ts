import { ProtoBuf } from '../tiktok-signer/protobuf.js';

type BuildAwemeV2FeedBodyOptions = {
  minCursorB64?: string;
  maxCursorB64?: string;
  minCursorBytes?: Uint8Array | Buffer;
  maxCursorBytes?: Uint8Array | Buffer;
};

export function buildAwemeV2FeedRequestBody(options: BuildAwemeV2FeedBodyOptions = {}): Uint8Array {
  const {
    minCursorB64 = '',
    maxCursorB64 = '',
    minCursorBytes,
    maxCursorBytes
  } = options;

  const dict: Record<number, Uint8Array> = {};
  let b9: Uint8Array | Buffer | null | undefined = minCursorBytes;
  if (b9 == null && minCursorB64) {
    try {
      b9 = Buffer.from(String(minCursorB64).trim(), 'base64');
    } catch {
      b9 = null;
    }
  }

  let b10: Uint8Array | Buffer | null | undefined = maxCursorBytes;
  if (b10 == null && maxCursorB64) {
    try {
      b10 = Buffer.from(String(maxCursorB64).trim(), 'base64');
    } catch {
      b10 = null;
    }
  }

  if ((b9 instanceof Buffer || b9 instanceof Uint8Array) && b9.length) {
    dict[9] = b9 instanceof Buffer ? new Uint8Array(b9) : b9;
  }
  if ((b10 instanceof Buffer || b10 instanceof Uint8Array) && b10.length) {
    dict[10] = b10 instanceof Buffer ? new Uint8Array(b10) : b10;
  }

  if (Object.keys(dict).length === 0) return new Uint8Array(0);
  return new ProtoBuf(dict).toBuf() as Uint8Array;
}
