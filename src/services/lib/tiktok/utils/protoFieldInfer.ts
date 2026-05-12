import { decodeProtobufWire, type ProtobufWireNode } from './decodeProtobufResponse.js';

const DEFAULT_KEYWORDS = [
  'aweme_id',
  'play_addr',
  'download_addr',
  'tiktokcdn.com',
  'tiktokv.com',
  'status_code',
  'status_msg',
  'has_more',
  'min_cursor',
  'max_cursor',
  'aweme_list',
  '"desc"',
  'unique_id',
  'nickname',
  'video',
  'author',
  'statistics',
  'comment_count',
  'digg_count',
  'share_count',
  'play_count'
] as const;

function findAllOccurrences(buf: Uint8Array, needleUtf8: string): number[] {
  const needle = new TextEncoder().encode(needleUtf8);
  if (needle.length === 0 || buf.length < needle.length) return [];
  const hits: number[] = [];
  outer: for (let i = 0; i <= buf.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (buf[i + j] !== needle[j]) continue outer;
    hits.push(i);
  }
  return hits;
}

function summarizeTopLevelWire(tree: unknown): Record<string, number> {
  if (!Array.isArray(tree)) return {};
  const summary: Record<string, number> = {};
  for (const node of tree) {
    if (!node || typeof node !== 'object') continue;
    const entry = node as ProtobufWireNode;
    const key = `${entry.field}:${entry.wire}`;
    summary[key] = (summary[key] || 0) + 1;
  }
  return summary;
}

const MAX_HINT_LINES = 150;
function wireTreeToHintLines(tree: unknown, depth: number, maxDepth: number, lines: string[]): void {
  if (!Array.isArray(tree) || depth > maxDepth) return;
  const indent = '  '.repeat(depth);
  for (const node of tree) {
    if (!node || typeof node !== 'object') continue;
    const entry = node as ProtobufWireNode;
    if (lines.length >= MAX_HINT_LINES) break;
    if (entry.wire === 'varint') lines.push(`${indent}// field ${entry.field}  varint  value=${entry.value}`);
    else if (entry.wire === 'fixed32' || entry.wire === 'fixed64') lines.push(`${indent}// field ${entry.field}  ${entry.wire}  hex=${entry.hex}`);
    else if (entry.wire === 'bytes') {
      lines.push(`${indent}// field ${entry.field}  bytes  len=${entry.length}  hex_preview=${entry.hexPreview || ''}`);
      if (entry.utf8Preview) lines.push(`${indent}//   utf8_preview: ${String(entry.utf8Preview).replace(/\s+/g, ' ').slice(0, 200)}`);
      if (entry.nested?.length) {
        lines.push(`${indent}//   nested:`);
        wireTreeToHintLines(entry.nested, depth + 1, maxDepth, lines);
      }
    } else lines.push(`${indent}// field ${entry.field}  ${entry.wire || '?'}  ${JSON.stringify(entry).slice(0, 120)}`);
  }
}

export function scanBufferKeywords(buffer: Uint8Array, keywords: string[] = [...DEFAULT_KEYWORDS]): Array<{ keyword: string; offsets: number[]; count: number }> {
  return keywords
    .map((keyword) => {
      const offsets = findAllOccurrences(buffer, keyword);
      return { keyword, offsets: offsets.slice(0, 20), count: offsets.length };
    })
    .filter((entry) => entry.count > 0);
}

export function inferAwemeV2Response(raw: Uint8Array | ArrayBuffer, existingWireTree: ProtobufWireNode[] | null = null): Record<string, unknown> {
  const buf = raw instanceof Uint8Array ? raw : raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(0);
  const wireTree = existingWireTree ?? decodeProtobufWire(buf);
  const protoHintLines: string[] = [];
  wireTreeToHintLines(wireTree, 0, 6, protoHintLines);
  return {
    byteLength: buf.length,
    keywords: scanBufferKeywords(buf),
    topLevelFieldSummary: summarizeTopLevelWire(wireTree),
    protoHintLines,
    decodeRawHint: 'protoc --decode_raw < file.bin',
    note: 'Field numbers inferred from wire scan.'
  };
}

export { DEFAULT_KEYWORDS, summarizeTopLevelWire };
