import logger from "@log";
import utils, { type Client, type Context, type DefaultFuncs } from "../../../request/formatters/helpers";
import { formatDeltaEvent, formatID } from "../../../request/formatters/index";

type IdLike = string | number | bigint;
type RecordUnknown = Record<string, unknown>;
type ContextWithGlobalOptions = Context & { options?: Context["options"] };

function asRecord(value: unknown): RecordUnknown | null {
  if (!value || typeof value !== "object") return null;
  return value as RecordUnknown;
}

function toStringId(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
}

interface ThreadKey {
  threadFbId?: IdLike;
  otherUserFbId?: IdLike;
}

interface MessageMetadata {
  threadKey: ThreadKey;
  actorFbId: IdLike;
  messageId: string;
  timestamp: string;
  cid?: { canonicalParticipantFbids?: string[]; conversationFbid?: string };
}

interface MentionRange {
  i: string;
  o: number;
  l: number;
}

interface AttachmentMercuryMeta {
  url?: string;
  [key: string]: unknown;
}

interface AttachmentMercury {
  attach_type?: string;
  metadata?: AttachmentMercuryMeta;
  extensible_attachment?: {
    story_attachment?: { style_list?: string[] };
  };
}

interface Attachment {
  fbid?: string;
  mercury?: AttachmentMercury;
  fb_object?: RecordUnknown;
  original_object?: RecordUnknown;
  [key: string]: unknown;
}

interface DeltaNewMessage {
  queue?: string;
  class?: string;
  body?: string;
  data?: { prng?: unknown };
  participants?: Array<string | number>;
  messageMetadata: MessageMetadata & { data?: unknown };
  attachments?: Attachment[];
}

type GlobalCallback = (err: Error | null, msg?: unknown) => void;

type ClientWithResolvePhotoUrl = Client & {
  resolvePhotoUrl?: (photoID: string, callback: (err?: unknown, url?: string) => void) => Promise<string | undefined>;
};

// Pre-compile regex for args splitting (realtime optimization)
const ARGS_SPLIT_REGEX = /\s+/;

// Pre-compile message type string (realtime optimization)
const MESSAGE_TYPE = "message";

// --- mention helpers (Gb + prng) ---

function asLong(v: unknown): string | number | undefined {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "object") {
    const r = v as RecordUnknown;
    if (typeof r.asLong === "string" || typeof r.asLong === "number") return r.asLong;
  }
  return undefined;
}

function extractMentionsFromGbRoot(root: unknown): MentionRange[] {
  // shape: { Gb: { asMap: { data: { "0": { asMap: { data: { id/offset/length }}}}}}}
  const out: MentionRange[] = [];
  const r = asRecord(root);
  const Gb = r?.Gb;
  const gbRec = asRecord(Gb);
  const asMap = asRecord(gbRec?.asMap);
  const data = asRecord(asMap?.data);
  if (!data) return out;

  for (const k in data) {
    if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
    const item = asRecord(data[k]);
    const itemAsMap = asRecord(item?.asMap);
    const itemData = asRecord(itemAsMap?.data);
    if (!itemData) continue;

    const id = asLong(itemData.id);
    const offset = asLong(itemData.offset);
    const length = asLong(itemData.length);
    if (id == null || offset == null || length == null) continue;

    const o = Number(offset);
    const l = Number(length);
    if (!Number.isFinite(o) || !Number.isFinite(l)) continue;

    out.push({ i: String(id), o, l });
  }

  return out;
}

function findGbContainer(obj: unknown, depth = 0): unknown | null {
  if (depth > 4) return null;
  const r = asRecord(obj);
  if (!r) return null;

  const Gb = asRecord(r.Gb);
  const asMap = asRecord(Gb?.asMap);
  const data = asRecord(asMap?.data);
  if (data) return r;

  for (const key in r) {
    if (!Object.prototype.hasOwnProperty.call(r, key)) continue;
    const found = findGbContainer(r[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function extractMentionsFromPrng(prng: unknown): MentionRange[] {
  try {
    if (!prng) return [];

    if (typeof prng === "string") {
      const s = prng.trim();
      if (!s) return [];
      const parsed = JSON.parse(s) as unknown;
      return extractMentionsFromPrng(parsed);
    }

    if (Array.isArray(prng)) {
      return prng
        .map((p) => {
          const r = asRecord(p);
          const i = r ? toStringId(r.i) : "";
          const o = r ? Number(r.o) : NaN;
          const l = r ? Number(r.l) : NaN;
          if (!i || !Number.isFinite(o) || !Number.isFinite(l)) return null;
          return { i, o, l };
        })
        .filter(Boolean) as MentionRange[];
    }

    const r = asRecord(prng);
    if (!r) return [];

    if (Array.isArray(r.data)) return extractMentionsFromPrng(r.data);
    if (Array.isArray(r.mentions)) return extractMentionsFromPrng(r.mentions);

    return [];
  } catch {
    return [];
  }
}

function extractMentionRanges(delta: DeltaNewMessage): MentionRange[] {
  // new format: mentions in messageMetadata.data.data.Gb...
  const mdAny = asRecord(delta.messageMetadata as unknown);
  const mdData = mdAny ? (mdAny.data as unknown) : undefined;

  const c0 = mdData;
  const c1 = asRecord(mdData)?.data;
  const c2 = asRecord(asRecord(mdData)?.data)?.data;

  const candidates: unknown[] = [c0, c1, c2, delta as unknown];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c) continue;

    const direct = extractMentionsFromGbRoot(c);
    if (direct.length) return direct;

    const found = findGbContainer(c);
    if (found) {
      const got = extractMentionsFromGbRoot(found);
      if (got.length) return got;
    }
  }

  // fallback legacy prng
  return extractMentionsFromPrng(delta.data?.prng);
}

function formatDeltaMessage(delta: DeltaNewMessage): RecordUnknown {
  const md = delta.messageMetadata;

  // ✅ mentions: Gb (new) -> prng (legacy)
  const mdata = extractMentionRanges(delta);

  const mentions: Record<string, string> = {};
  const body = delta.body || "";
  const bodyLen = body.length;

  if (mdata.length > 0 && bodyLen > 0) {
    for (let i = 0; i < mdata.length; i++) {
      const u = mdata[i];
      const offset = u.o;
      const length = u.l;
      if (offset >= 0 && length > 0 && offset + length <= bodyLen) {
        mentions[u.i] = body.substring(offset, offset + length);
      }
    }
  }

  const bodyTrimmed = body.trim();
  const args = bodyTrimmed.length > 0 ? bodyTrimmed.split(ARGS_SPLIT_REGEX) : [];

  const attachments = Array.isArray(delta.attachments) ? delta.attachments : [];
  const formattedAttachments =
    attachments.length > 0
      ? attachments.map((att) => utils.formatAttachment(att as never, (att.fb_object || att.original_object || {}) as never))
      : [];

  const actorFbIdStr = md.actorFbId?.toString?.() || String(md.actorFbId ?? "");
  const threadIDRaw = md.threadKey.threadFbId || md.threadKey.otherUserFbId;
  const threadIDStr = threadIDRaw != null ? String(threadIDRaw) : "";

  return {
    type: MESSAGE_TYPE,
    senderID: utils.formatID(actorFbIdStr),
    threadID: utils.formatID(threadIDStr),
    messageID: md.messageId,
    args,
    body,
    attachments: formattedAttachments,
    mentions,
    timestamp: md.timestamp,
    isGroup: !!md.threadKey.threadFbId,
    participantIDs: delta.participants || md.cid?.canonicalParticipantFbids || []
  };
}

function createTagAllEvent(delta: DeltaNewMessage, threadID: string, ranges: MentionRange[]): RecordUnknown {
  const metadata = delta.messageMetadata;
  return {
    type: "event",
    body: delta.body || "",
    logMessageType: "log:tagall",
    logMessageData: { tagall: ranges.map((p) => p.i) },
    logMessageBody: delta.body || "",
    threadID: formatID(threadID.toString()),
    senderID: metadata.actorFbId.toString(),
    author: metadata.actorFbId.toString(),
    messageID: metadata.messageId,
    attachments: delta.attachments || [],
    timestamp: metadata.timestamp,
    participants: (delta.participants || []).map((e) => toStringId(e)).filter(Boolean)
  };
}

// Pre-compile attach type string (realtime optimization)
const ATTACH_TYPE_PHOTO = "photo";

function processAttachments(
  delta: DeltaNewMessage,
  ctx: ContextWithGlobalOptions,
  api: ClientWithResolvePhotoUrl,
  globalCallback: GlobalCallback
): void {
  const attachments = Array.isArray(delta.attachments) ? delta.attachments : [];
  const attachmentsLen = attachments.length;
  if (attachmentsLen === 0) {
    return finalizeDeltaMessage(delta, ctx, api, globalCallback);
  }

  // Fast path: filter photo attachments with pre-compiled constant
  const photoAttachments: Attachment[] = [];
  for (let i = 0; i < attachmentsLen; i++) {
    const att = attachments[i];
    if (att?.mercury?.attach_type === ATTACH_TYPE_PHOTO) {
      photoAttachments.push(att);
    }
  }

  const nonPhotoCount = attachmentsLen - photoAttachments.length;
  const photoLen = photoAttachments.length;

  if (photoLen === 0) {
    return finalizeDeltaMessage(delta, ctx, api, globalCallback);
  }

  let processedCount = nonPhotoCount;
  const totalAttachments = attachmentsLen;

  for (let i = 0; i < photoLen; i++) {
    const attachment = photoAttachments[i];
    const fbid = typeof attachment.fbid === "string" ? attachment.fbid : "";
    if (!api.resolvePhotoUrl || !fbid) {
      if (++processedCount === totalAttachments) {
        finalizeDeltaMessage(delta, ctx, api, globalCallback);
      }
      continue;
    }

    api.resolvePhotoUrl(fbid, (_err?: unknown, url?: string) => {
      if (!_err && url) {
        const mercury = attachment.mercury;
        if (mercury) {
          if (mercury.metadata && typeof mercury.metadata === "object") {
            mercury.metadata.url = url;
          } else {
            mercury.metadata = { url };
          }
        }
      }
      if (++processedCount === totalAttachments) {
        finalizeDeltaMessage(delta, ctx, api, globalCallback);
      }
    });
  }
}

function finalizeDeltaMessage(delta: DeltaNewMessage, ctx: ContextWithGlobalOptions, api: Client, globalCallback: GlobalCallback): void {
  let fmtMsg: RecordUnknown;
  try {
    fmtMsg = formatDeltaMessage(delta);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return logger.error(`Lỗi Nhẹ: ${msg}`);
  }

  if (!fmtMsg) return;

  if (ctx.options?.autoMarkDelivery) {
    utils.markDelivery(ctx, api, String(fmtMsg.threadID ?? ""), String(fmtMsg.messageID ?? ""));
  }

  if (!ctx.options?.selfListen && fmtMsg.senderID === ctx.userID) return;
  globalCallback(null, fmtMsg);
}

export default function (
  _def: DefaultFuncs,
  client: ClientWithResolvePhotoUrl,
  ctx: ContextWithGlobalOptions,
  delta: unknown,
  globalCallback: GlobalCallback
): void {
  const deltaRec = asRecord(delta);
  if (!deltaRec) return;

  const metadata = asRecord(deltaRec.messageMetadata) as unknown as (MessageMetadata & { data?: unknown }) | undefined;
  if (!metadata || !metadata.threadKey) return;

  const deltaObj: DeltaNewMessage = deltaRec as unknown as DeltaNewMessage;

  if (ctx.options?.pageID && ctx.options.pageID !== deltaObj.queue) return;

  const threadID = metadata?.threadKey?.threadFbId;
  const cid = metadata?.cid?.conversationFbid;

  // ✅ tagall: also works when mentions are in Gb (not only prng)
  if (cid && threadID) {
    const ranges = extractMentionRanges(deltaObj);
    if (ranges.length && ranges.some((p) => p.i === cid)) {
      return globalCallback(null, createTagAllEvent(deltaObj, String(threadID), ranges));
    }
  }

  const firstAttachment = deltaObj.attachments?.[0];
  if (firstAttachment?.mercury?.extensible_attachment?.story_attachment?.style_list?.includes("message_live_location")) {
    deltaObj.class = "UserLocation";
    try {
      return globalCallback(null, formatDeltaEvent(deltaObj as never));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (process.env.DEBUG) logger.error(`Lỗi Nhẹ: ${msg}`);
      return;
    }
  }

  return processAttachments(deltaObj, ctx, client, globalCallback);
}
