import { ProtoBuf } from '../tiktok-signer/protobuf.js';

export function formatProtoValue(v: unknown, depth: number): unknown {
  if (v instanceof Uint8Array) {
    const max = 64;
    const slice = v.length > max ? v.subarray(0, max) : v;
    let nested: unknown = null;
    if (depth > 0 && v.length > 0 && v.length < 200_000) {
      try {
        nested = formatProtoFields(ProtoBuf.fromBuf(v) as Record<string, unknown>, depth - 1);
      } catch {
        nested = '(nested parse failed)';
      }
    }
    return {
      kind: 'bytes',
      length: v.length,
      hexPreview: Buffer.from(slice).toString('hex') + (v.length > max ? '…' : ''),
      nested
    };
  }
  if (typeof v === 'bigint') return v.toString();
  return v;
}

export function formatProtoFields(obj: Record<string, unknown>, depth = 2): Record<string, unknown> {
  if (depth < 0 || obj == null) return obj;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) {
    out[k] = Array.isArray(val) ? val.map((x) => formatProtoValue(x, depth)) : formatProtoValue(val, depth);
  }
  return out;
}
