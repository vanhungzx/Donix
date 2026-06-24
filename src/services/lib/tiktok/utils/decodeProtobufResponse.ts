import { ProtoReader } from '../tiktok-signer/protobuf.js';

export type ProtobufWireNode = {
  field: number;
  wire: string;
  value?: number;
  hex?: string;
  length?: number;
  note?: string;
  error?: string;
  hexPreview?: string;
  utf8Preview?: string;
  nested?: ProtobufWireNode[];
  raw?: Uint8Array;
};

type DecodeWireOptions = {
  maxDepth?: number;
  maxFieldsPerLevel?: number;
  maxNestedBytes?: number;
  keepRawBytes?: boolean;
  _depth?: number;
};

export function decodeProtobufWire(bytes: Uint8Array, opts: DecodeWireOptions = {}): ProtobufWireNode[] {
  const maxDepth = opts.maxDepth ?? 12;
  const maxFieldsPerLevel = opts.maxFieldsPerLevel ?? 400;
  const maxNestedBytes = opts.maxNestedBytes ?? 1_500_000;
  const keepRawBytes = opts.keepRawBytes ?? false;
  const depth = opts._depth ?? 0;
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return [];

  const reader = new ProtoReader(bytes);
  const fields: ProtobufWireNode[] = [];
  let n = 0;
  while (!reader.eof() && n < maxFieldsPerLevel) {
    n += 1;
    try {
      const key = reader.readVarint();
      const wire = key & 7;
      const fieldNum = key >>> 3;
      if (fieldNum === 0) continue;
      switch (wire) {
        case 0: {
          fields.push({ field: fieldNum, wire: 'varint', value: reader.readVarint() });
          break;
        }
        case 1: {
          fields.push({ field: fieldNum, wire: 'fixed64', hex: Buffer.from(reader.read(8)).toString('hex') });
          break;
        }
        case 2: {
          const len = reader.readVarint();
          if (!reader.isRemain(len)) {
            fields.push({ field: fieldNum, wire: 'bytes', error: 'OOB sau length', length: len });
            return fields;
          }
          if (len > maxNestedBytes) {
            reader.read(len);
            fields.push({ field: fieldNum, wire: 'bytes', length: len, note: 'bỏ qua (quá lớn)' });
            break;
          }
          const sub = reader.read(len);
          let nested: ProtobufWireNode[] | null = null;
          let utf8Preview: string | undefined;
          try {
            const decoded = new TextDecoder('utf8', { fatal: false }).decode(sub);
            if (decoded.length > 0 && decoded.length < 4096 && /^[\x09\x0a\x0d\x20-\x7e]+$/.test(decoded.slice(0, Math.min(decoded.length, 512)))) {
              utf8Preview = decoded.length > 800 ? `${decoded.slice(0, 800)}…` : decoded;
            }
          } catch {
            // ignore
          }
          if (depth < maxDepth && sub.length > 0) {
            try {
              nested = decodeProtobufWire(sub, { ...opts, _depth: depth + 1 });
            } catch {
              nested = null;
            }
            if (nested && nested.length === 0) nested = null;
          }
          const entry: ProtobufWireNode = {
            field: fieldNum,
            wire: 'bytes',
            length: sub.length,
            hexPreview: Buffer.from(sub.subarray(0, Math.min(48, sub.length))).toString('hex'),
            utf8Preview,
            nested: nested || undefined
          };
          if (keepRawBytes) entry.raw = sub;
          fields.push(entry);
          break;
        }
        case 5: {
          fields.push({ field: fieldNum, wire: 'fixed32', hex: Buffer.from(reader.read(4)).toString('hex') });
          break;
        }
        default:
          fields.push({ field: fieldNum, wire: `unsupported_${wire}`, note: 'dừng quét (wire type không xử lý)' });
          return fields;
      }
    } catch {
      break;
    }
  }
  return fields;
}

export function parseTiktokV2FeedResponse(
  raw: ArrayBuffer | Uint8Array | Buffer,
  contentType = ''
):
  | { kind: 'json'; data: Record<string, unknown> }
  | { kind: 'protobuf'; wireTree: ProtobufWireNode[]; byteLength: number }
  | { kind: 'text'; text: string; byteLength: number } {
  let u8: Uint8Array;
  if (raw instanceof Uint8Array) u8 = raw;
  else if (raw instanceof ArrayBuffer) u8 = new Uint8Array(raw);
  else if (Buffer.isBuffer(raw)) u8 = new Uint8Array(raw);
  else u8 = new Uint8Array(0);
  const ct = contentType.toLowerCase();
  if (u8.length === 0) return { kind: 'protobuf', wireTree: [], byteLength: 0 };

  const first = u8[0];
  if (first === 0x3c || ct.includes('html')) {
    return { kind: 'text', text: Buffer.from(u8).toString('utf8').slice(0, 1200), byteLength: u8.length };
  }
  let off = 0;
  while (off < u8.length && [0x20, 0x09, 0x0a, 0x0d].includes(u8[off])) off += 1;
  const f = off < u8.length ? u8[off] : 0;
  if (ct.includes('json') || f === 0x7b || f === 0x5b) {
    const text = Buffer.from(u8.subarray(off)).toString('utf8').trim();
    try {
      return { kind: 'json', data: JSON.parse(text) as Record<string, unknown> };
    } catch {
      // fallback protobuf
    }
  }
  const wireTree = decodeProtobufWire(u8);
  return { kind: 'protobuf', wireTree, byteLength: u8.length };
}
