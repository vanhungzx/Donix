import { decodeProtobufWire, type ProtobufWireNode } from './decodeProtobufResponse.js';

const fullUtf8 = (node: ProtobufWireNode | null): string => {
  if (!node) return '';
  if (node.raw) return Buffer.from(node.raw).toString('utf8');
  if (node.utf8Preview) return node.utf8Preview;
  if (node.hexPreview) return Buffer.from(node.hexPreview, 'hex').toString('utf8');
  return '';
};

const rawBase64 = (node: ProtobufWireNode | null): string => {
  if (!node?.raw) return '';
  return Buffer.from(node.raw).toString('base64');
};

const val = (node: ProtobufWireNode | null): number => node?.value ?? 0;

const findField = (tree: ProtobufWireNode[] | undefined, fieldNum: number): ProtobufWireNode | null =>
  (Array.isArray(tree) ? tree.find((n) => n.field === fieldNum) : null) || null;
const findAllFields = (tree: ProtobufWireNode[] | undefined, fieldNum: number): ProtobufWireNode[] =>
  Array.isArray(tree) ? tree.filter((n) => n.field === fieldNum) : [];

const parseUrlList = (node: ProtobufWireNode | null): string[] =>
  findAllFields(node?.nested, 2).map((n) => fullUtf8(n)).filter(Boolean);

const parseImageUrl = (node: ProtobufWireNode | null): Record<string, unknown> | null => {
  if (!node?.nested) return null;
  const n = node.nested;
  return {
    uri: fullUtf8(findField(n, 1)),
    url_list: parseUrlList(node),
    width: val(findField(n, 3)),
    height: val(findField(n, 4))
  };
};

const parseAuthor = (node: ProtobufWireNode | null): Record<string, unknown> | null => {
  if (!node?.nested) return null;
  const n = node.nested;
  return {
    uid: fullUtf8(findField(n, 1)),
    short_id: fullUtf8(findField(n, 2)),
    nickname: fullUtf8(findField(n, 3)),
    unique_id: fullUtf8(findField(n, 26)),
    sec_uid: fullUtf8(findField(n, 191)),
    avatar_thumb: parseImageUrl(findField(n, 5)),
    avatar_medium: parseImageUrl(findField(n, 7)),
    avatar_larger: parseImageUrl(findField(n, 8)),
    verified: val(findField(n, 55)) === 1,
    region: fullUtf8(findField(n, 64)),
    language: fullUtf8(findField(n, 127))
  };
};

const parseVideo = (node: ProtobufWireNode | null): Record<string, unknown> | null => {
  if (!node?.nested) return null;
  const n = node.nested;
  const playAddrNode = findField(n, 10) || findField(n, 8);
  const dlNode = findField(n, 56) || findField(n, 57);
  return {
    vid: fullUtf8(findField(n, 2)),
    origin_title: fullUtf8(findField(n, 4)),
    cover: parseImageUrl(findField(n, 7)),
    origin_cover: parseImageUrl(findField(n, 8)),
    dynamic_cover: parseImageUrl(findField(n, 9)),
    play_addr: parseImageUrl(playAddrNode),
    download_addr: parseImageUrl(dlNode),
    duration: val(findField(n, 12)),
    quality: val(findField(n, 75))
  };
};

const parseMusic = (node: ProtobufWireNode | null): Record<string, unknown> | null => {
  if (!node?.nested) return null;
  const n = node.nested;
  const durationMs = val(findField(n, 13));
  let metaJson: Record<string, unknown> | null = null;
  const f40 = findField(n, 40);
  if (f40) {
    try {
      metaJson = JSON.parse(fullUtf8(f40)) as Record<string, unknown>;
    } catch {
      metaJson = null;
    }
  }
  return {
    play_url: parseImageUrl(findField(n, 1)),
    cover_medium: parseImageUrl(findField(n, 5)),
    cover_large: parseImageUrl(findField(n, 6)),
    cover_small: parseImageUrl(findField(n, 2)),
    duration: Math.round(durationMs / 1000),
    duration_ms: durationMs,
    resolution: fullUtf8(findField(n, 7)),
    meta: metaJson
  };
};

const parseStatistics = (node: ProtobufWireNode | null): Record<string, unknown> | null => {
  if (!node?.nested) return null;
  const n = node.nested;
  return {
    aweme_id: fullUtf8(findField(n, 1)),
    comment_count: val(findField(n, 2)),
    digg_count: val(findField(n, 3)),
    share_count: val(findField(n, 4)),
    play_count: val(findField(n, 5)),
    download_count: val(findField(n, 6)),
    collect_count: val(findField(n, 11))
  };
};

const isLiveRoomItem = (nested: ProtobufWireNode[] | undefined): boolean =>
  Boolean(findField(nested, 126) && !findField(nested, 2) && !findField(nested, 4));

const parseAwemeItem = (node: ProtobufWireNode | null): Record<string, unknown> | null => {
  if (!node?.nested) return null;
  const n = node.nested;
  if (isLiveRoomItem(n)) return null;
  return {
    aweme_id: fullUtf8(findField(n, 1)),
    desc: fullUtf8(findField(n, 2)),
    create_time: val(findField(n, 3)),
    author: parseAuthor(findField(n, 4)),
    video: parseVideo(findField(n, 5)),
    music: parseMusic(findField(n, 7)),
    share_url: fullUtf8(findField(n, 8)),
    statistics: parseStatistics(findField(n, 10)),
    aweme_type: val(findField(n, 13)),
    region: fullUtf8(findField(n, 49)),
    language: fullUtf8(findField(n, 91)),
    page_source: fullUtf8(findField(n, 183)),
    image_post: Boolean(findField(n, 86)?.nested)
  };
};

export function parseAwemeV2FeedResponse(
  buffer: Uint8Array | Buffer
): { status_code: number; has_more: boolean; aweme_list: Array<Record<string, unknown>>; min_cursor_b64: string; max_cursor_b64: string } {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const tree = decodeProtobufWire(bytes, { maxDepth: 8, keepRawBytes: true });
  const awemeList = findAllFields(tree, 5).map(parseAwemeItem).filter(Boolean) as Array<Record<string, unknown>>;
  return {
    status_code: val(findField(tree, 1)),
    has_more: val(findField(tree, 4)) === 1,
    aweme_list: awemeList,
    min_cursor_b64: rawBase64(findField(tree, 9)),
    max_cursor_b64: rawBase64(findField(tree, 10))
  };
}

export default parseAwemeV2FeedResponse;
