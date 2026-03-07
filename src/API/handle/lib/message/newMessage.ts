import logger from '@log';
import utils, { type Client, type Context, type DefaultFuncs } from '../../../request/formatters/helpers';
import { formatDeltaEvent, formatID } from '../../../request/formatters/index';

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
  data?: { prng?: string };
  participants?: Array<string | number>;
  messageMetadata: MessageMetadata;
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

function formatDeltaMessage(delta: DeltaNewMessage): RecordUnknown {
  const md = delta.messageMetadata;

  // Fast path: avoid JSON.parse if prng is empty/null
  const prngStr = delta.data?.prng;
  let mdata: MentionRange[] = [];
  if (typeof prngStr === "string" && prngStr.length > 0) {
    try {
      const parsed = JSON.parse(prngStr) as unknown;
      mdata = Array.isArray(parsed) ? (parsed as MentionRange[]) : [];
    } catch {
      // Silent fail - empty array already set
    }
  }

  const mentions: { [key: string]: string } = {};
  const body = delta.body || "";
  const bodyLen = body.length;

  // Fast path: only process mentions if we have data and body
  if (mdata.length > 0 && bodyLen > 0) {
    const mdataLen = mdata.length;
    for (let i = 0; i < mdataLen; i++) {
      const u = mdata[i];
      const offset = u.o;
      const length = u.l;
      // Bounds check to avoid substring errors
      if (offset >= 0 && length > 0 && offset + length <= bodyLen) {
        mentions[u.i] = body.substring(offset, offset + length);
      }
    }
  }

  // Fast path: cache trim result, avoid split if empty
  const bodyTrimmed = body.trim();
  const args = bodyTrimmed.length > 0 ? bodyTrimmed.split(ARGS_SPLIT_REGEX) : [];

  // Fast path: avoid map if no attachments
  const attachments = Array.isArray(delta.attachments) ? delta.attachments : [];
  const formattedAttachments = attachments.length > 0
    ? attachments.map((att) =>
      utils.formatAttachment(att as never, (att.fb_object || att.original_object || {}) as never)
    )
    : [];

  // Fast path: cache toString() results
  const actorFbIdStr = md.actorFbId?.toString() || "";
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

function createTagAllEvent(delta: DeltaNewMessage, threadID: string, prng: MentionRange[]): RecordUnknown {
  const metadata = delta.messageMetadata;
  return {
    type: "event",
    body: delta.body || '',
    logMessageType: "log:tagall",
    logMessageData: { tagall: prng.map((p) => p.i) },
    logMessageBody: delta.body || '',
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
const ATTACH_TYPE_PHOTO = 'photo';

function processAttachments(delta: DeltaNewMessage, ctx: ContextWithGlobalOptions, api: ClientWithResolvePhotoUrl, globalCallback: GlobalCallback): void {
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

  // Fast path: use for loop instead of forEach (slightly faster)
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
  const metadata = asRecord(deltaRec.messageMetadata) as unknown as MessageMetadata | undefined;
  if (!metadata || !metadata.threadKey) return;
  const deltaObj: DeltaNewMessage = deltaRec as unknown as DeltaNewMessage;

  if (ctx.options?.pageID && ctx.options.pageID !== deltaObj.queue) return;

  const threadID = metadata?.threadKey?.threadFbId;
  const cid = metadata?.cid?.conversationFbid;
  const prngStr = deltaObj.data?.prng;

  if (prngStr && cid && threadID) {
    try {
      const prng = JSON.parse(prngStr) as unknown;

      if (Array.isArray(prng) && prng.some((p) => asRecord(p)?.i === cid)) {
        return globalCallback(null, createTagAllEvent(deltaObj, String(threadID), prng as MentionRange[]));
      }
    } catch {

    }
  }

  const firstAttachment = deltaObj.attachments?.[0];
  if (firstAttachment?.mercury?.extensible_attachment?.story_attachment?.style_list?.includes('message_live_location')) {
    deltaObj.class = 'UserLocation';
    try {
      return globalCallback(null, formatDeltaEvent(deltaObj as never));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (process.env.DEBUG) logger.error(`Lỗi Nhẹ: ${msg}`);
      return;
    }
  }

  return processAttachments(deltaObj, ctx, client, globalCallback);
};
