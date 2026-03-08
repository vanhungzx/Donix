import logger from "@log";
import { _formatAttachment } from "../../../request/formatters/data/formatAttachment";
import utils, { type Client, type Context, type DefaultFuncs } from "../../../request/formatters/helpers";
import { decodeClientPayload } from "../../../request/formatters/index";
const markDelivery = utils.markDelivery;

type IdLike = string | number | bigint;
type RecordUnknown = Record<string, unknown>;

function asRecord(value: unknown): RecordUnknown | null {
  if (!value || typeof value !== "object") return null;
  return value as RecordUnknown;
}

function toStringId(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
}

function asLong(v: unknown): string | number | undefined {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number") return v;
  const r = asRecord(v);
  if (r && (typeof r.asLong === "string" || typeof r.asLong === "number")) return r.asLong as string | number;
  return undefined;
}

interface ThreadKey {
  threadFbId?: IdLike;
  otherUserFbId?: IdLike;
}

interface MessageMetadata {
  threadKey: ThreadKey;
  messageId: string;
  actorFbId: IdLike;
  timestamp: string;
  // ✅ new format can appear here
  data?: unknown;
}

interface MercuryAttachment {
  mercuryJSON?: string;
  [key: string]: unknown;
}

interface ReplyToMessageId {
  id: string;
}

interface ReplyMessage {
  data?: { prng?: unknown };
  body?: string;
  messageMetadata: MessageMetadata;
  attachments?: MercuryAttachment[];
  participants?: Array<string | number>;
  requestContext?: { apiArgs?: unknown };
  messageReplyRawRequestContext?: { apiArgs?: unknown };
  breadcrumbs?: string;
}

interface DeltaMessageReply {
  message?: ReplyMessage;
  repliedToMessage?: ReplyMessage;
  replyToMessageId?: ReplyToMessageId;
  requestContext?: { apiArgs?: unknown };
}

interface DeltaMessageReaction {
  threadKey: ThreadKey;
  messageId: string;
  reaction: string;
  senderId: IdLike;
  userId: IdLike;
}

interface DeltaRecallMessageData {
  threadKey: ThreadKey;
  messageID: string;
  senderID: IdLike;
  deletionTimestamp: number;
  timestamp: number;
}

interface ClientPayloadDelta {
  deltaMessageReaction?: DeltaMessageReaction;
  deltaRecallMessageData?: DeltaRecallMessageData;
  deltaMessageReply?: DeltaMessageReply;
  requestContext?: { apiArgs?: unknown };
}

interface DecodedClientPayload {
  deltas?: ClientPayloadDelta[];
}

interface ProcessedRepliedMessage {
  type: "Message";
  threadID: string;
  messageID: string;
  senderID: string;
  attachments: unknown[];
  args: string[];
  body: string;
  isGroup: boolean;
  mentions: Record<string, string>;
  timestamp: number;
  participantIDs: string[];
}

interface MessageReplyCallbackData {
  type: "message_reply";
  threadID: string;
  messageID: string;
  senderID: string;
  attachments: unknown[];
  args: string[];
  body: string;
  isGroup: boolean;
  mentions: Record<string, string>;
  timestamp: number;
  participantIDs: string[];
  sentFrom: string;
  messageReply?: ProcessedRepliedMessage;
}

type ContextWithGlobalOptions = Context & { globalOptions?: Context["options"] };

/* -------------------- Gb mentions (new format) -------------------- */

function findGbContainer(obj: unknown, depth = 0): RecordUnknown | null {
  if (depth > 4) return null;
  const r = asRecord(obj);
  if (!r) return null;

  const Gb = asRecord(r.Gb);
  const asMap = asRecord(Gb?.asMap);
  const data = asRecord(asMap?.data);
  if (data) return r;

  for (const k in r) {
    if (!Object.prototype.hasOwnProperty.call(r, k)) continue;
    const found = findGbContainer(r[k], depth + 1);
    if (found) return found;
  }
  return null;
}

function parseGbRanges(gbRoot: RecordUnknown): Array<{ i: string; o: number; l: number }> {
  const out: Array<{ i: string; o: number; l: number }> = [];
  const Gb = asRecord(gbRoot.Gb);
  const asMap = asRecord(Gb?.asMap);
  const data = asRecord(asMap?.data);
  if (!data) return out;

  for (const key in data) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    const item = asRecord(data[key]);
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

function extractMentionsFromGb(message: unknown, body: string): Record<string, string> {
  const mentions: Record<string, string> = {};
  const text = body || "";
  const textLen = text.length;
  if (!textLen) return mentions;

  const msgRec = asRecord(message);
  const md = asRecord(msgRec?.messageMetadata);
  const mdData = md?.data;

  // likely path: message.messageMetadata.data.data.Gb...
  const c0 = mdData;
  const c1 = asRecord(mdData)?.data;
  const c2 = asRecord(asRecord(mdData)?.data)?.data;

  const candidates: unknown[] = [c2, c1, c0, message];

  for (let idx = 0; idx < candidates.length; idx++) {
    const c = candidates[idx];
    if (!c) continue;

    const gbContainer = findGbContainer(c);
    if (!gbContainer) continue;

    const ranges = parseGbRanges(gbContainer);
    if (!ranges.length) continue;

    for (let i = 0; i < ranges.length; i++) {
      const { i: id, o: offset, l: length } = ranges[i];
      if (offset >= 0 && length > 0 && offset + length <= textLen) {
        mentions[id] = text.substring(offset, offset + length);
      }
    }

    if (Object.keys(mentions).length) return mentions;
  }

  return mentions;
}

/* -------------------- prng mentions (legacy) -------------------- */

function extractMentionsFromPrng(prngData: unknown, body: string): Record<string, string> {
  const mentions: Record<string, string> = {};
  const bodyStr = body || "";
  const bodyLen = bodyStr.length;
  if (!bodyLen || !prngData) return mentions;

  let parsed: unknown = prngData;

  try {
    if (typeof parsed === "string") {
      const s = parsed.trim();
      if (!s) return mentions;
      parsed = JSON.parse(s);
    }

    let arr: unknown[] = [];
    if (Array.isArray(parsed)) arr = parsed;
    else {
      const r = asRecord(parsed);
      if (r) {
        if (Array.isArray(r.data)) arr = r.data as unknown[];
        else if (Array.isArray(r.mentions)) arr = r.mentions as unknown[];
      }
    }

    for (let i = 0; i < arr.length; i++) {
      const item = asRecord(arr[i]);
      if (!item) continue;

      const id = toStringId(item.i);
      const offset = typeof item.o === "number" ? item.o : Number(item.o);
      const length = typeof item.l === "number" ? item.l : Number(item.l);
      if (!id || !Number.isFinite(offset) || !Number.isFinite(length)) continue;
      if (offset < 0 || length <= 0 || offset + length > bodyLen) continue;

      mentions[id] = bodyStr.substring(offset, offset + length);
    }
  } catch {
    return mentions;
  }

  return mentions;
}

/**
 * ✅ Unified mentions:
 * - Gb first (new format)
 * - prng fallback (legacy)
 */
function extractMentions(prngData: unknown, body: string, message?: unknown): Record<string, string> {
  const fromGb = message ? extractMentionsFromGb(message, body) : {};
  if (Object.keys(fromGb).length) return fromGb;
  return extractMentionsFromPrng(prngData, body);
}

/* -------------------- misc helpers -------------------- */

function getThreadId(threadKey: ThreadKey): string {
  return toStringId(threadKey.threadFbId ?? threadKey.otherUserFbId);
}

// Pre-compile type string (realtime optimization)
const ATTACHMENT_TYPE_UNKNOWN = "unknown";

function processReplyAttachments(attachments: unknown): unknown[] {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];

  const attachmentsLen = attachments.length;
  const result: unknown[] = new Array(attachmentsLen);

  for (let i = 0; i < attachmentsLen; i++) {
    const att = asRecord(attachments[i]) ?? {};
    const mercuryJSON =
      typeof att.mercuryJSON === "string" && att.mercuryJSON.length > 0 ? att.mercuryJSON : null;

    try {
      const mercury = mercuryJSON ? (JSON.parse(mercuryJSON) as unknown) : null;
      const merged: RecordUnknown = { ...att, ...(asRecord(mercury) ?? {}) };
      result[i] = _formatAttachment(merged as never);
    } catch (ex: unknown) {
      const fallback: RecordUnknown = { ...att, error: ex, type: ATTACHMENT_TYPE_UNKNOWN };
      result[i] = fallback;
    }
  }
  return result;
}

function processRepliedMessage(
  repliedMessage: ReplyMessage,
  fallbackParticipants?: Array<string | number>
): ProcessedRepliedMessage {
  const mentions = extractMentions(repliedMessage.data?.prng, repliedMessage.body || "", repliedMessage);

  const participantsRaw =
    Array.isArray(repliedMessage.participants) && repliedMessage.participants.length
      ? repliedMessage.participants
      : fallbackParticipants || [];

  return {
    type: "Message",
    threadID: getThreadId(repliedMessage.messageMetadata.threadKey),
    messageID: repliedMessage.messageMetadata.messageId,
    senderID: toStringId(repliedMessage.messageMetadata.actorFbId),
    attachments: processReplyAttachments(repliedMessage.attachments),
    args: (repliedMessage.body || "").trim().split(/\s+/),
    body: repliedMessage.body || "",
    isGroup: Boolean(repliedMessage.messageMetadata.threadKey.threadFbId),
    mentions,
    timestamp: parseInt(repliedMessage.messageMetadata.timestamp, 10),
    participantIDs: participantsRaw.map((e) => toStringId(e)).filter(Boolean)
  };
}

async function fetchRepliedMessage(
  defaultFuncs: DefaultFuncs,
  ctx: Context,
  callbackData: MessageReplyCallbackData,
  messageId: string
): Promise<void> {
  try {
    const response = await defaultFuncs.post(
      "https://www.facebook.com/api/graphqlbatch/",
      ctx.jar,
      {
        av: ctx.userID,
        queries: JSON.stringify({
          o0: {
            doc_id: "2848441488556444",
            query_params: {
              thread_and_message_id: {
                thread_id: callbackData.threadID,
                message_id: messageId
              }
            }
          }
        })
      }
    );

    const resDataUnknown = (await utils.parseAndCheckLogin(ctx, defaultFuncs)(response)) as unknown;
    const resData = Array.isArray(resDataUnknown) ? resDataUnknown : [];
    const last = resData.length ? asRecord(resData[resData.length - 1]) : null;

    const errorResults = typeof last?.error_results === "number" ? last.error_results : 0;
    const successResults = typeof last?.successful_results === "number" ? last.successful_results : 0;

    const first = resData.length ? asRecord(resData[0]) : null;
    const o0 = first ? asRecord(first.o0) : null;

    if (errorResults > 0) throw o0?.errors ?? new Error("forcedFetch: graphqlbatch errors");
    if (successResults === 0) throw new Error("forcedFetch: no successful_results");

    const data = o0 ? asRecord(o0.data) : null;
    const message = data ? asRecord(data.message) : null;
    if (!message) throw new Error("forcedFetch: missing message data");

    const fetchData = message;

    const fetchDataMessage = asRecord(fetchData.message);
    const text = fetchDataMessage && typeof fetchDataMessage.text === "string" ? fetchDataMessage.text : "";
    const mentions: Record<string, string> = {};

    const addRange = (id: string | number, offset: number, length: number) => {
      const o = Number(offset);
      const l = Number(length);
      if (!text || !Number.isFinite(o) || !Number.isFinite(l)) return;
      if (o >= 0 && l > 0 && o + l <= text.length) mentions[String(id)] = text.substring(o, o + l);
    };

    // 1) canonical ranges
    const ranges = fetchDataMessage?.ranges;
    if (Array.isArray(ranges)) {
      for (const r of ranges) {
        const range = asRecord(r);
        if (!range) continue;
        const entity = asRecord(range.entity);
        const entityId = entity ? toStringId(entity.id) : "";
        const offset = typeof range.offset === "number" ? range.offset : Number(range.offset);
        const length = typeof range.length === "number" ? range.length : Number(range.length);
        if (!entityId || !Number.isFinite(offset) || !Number.isFinite(length)) continue;
        addRange(entityId, offset, length);
      }
    }

    // 2) fallback variants (schema-dependent)
    if (Object.keys(mentions).length === 0 && fetchDataMessage) {
      const msgAny = fetchDataMessage as any;
      const altRanges =
        msgAny?.messageEntityRanges ||
        msgAny?.text_ranges ||
        msgAny?.entity_ranges ||
        msgAny?.ranges_v2 ||
        msgAny?.entityRanges;

      if (Array.isArray(altRanges)) {
        for (const r of altRanges) {
          const id = r?.entity?.id ?? r?.id ?? r?.entity_id;
          const offset = r?.offset ?? r?.o;
          const length = r?.length ?? r?.l;
          if (id == null || offset == null || length == null) continue;
          addRange(id, offset, length);
        }
      }
    }

    callbackData.messageReply = {
      type: "Message",
      threadID: callbackData.threadID,
      messageID: toStringId(fetchData.message_id),
      senderID: toStringId(asRecord(fetchData.message_sender)?.id),
      attachments: Array.isArray(fetchDataMessage?.blob_attachment)
        ? fetchDataMessage!.blob_attachment.map((att) => _formatAttachment({ blob_attachment: att } as never))
        : [],
      args: text.trim().split(/\s+/),
      body: text,
      isGroup: callbackData.isGroup,
      mentions,
      timestamp: parseInt(toStringId(fetchData.timestamp_precise), 10),
      participantIDs: []
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`forcedFetch: ${msg}`);
  }
}

function finalizeCallback(
  ctx: ContextWithGlobalOptions,
  client: Client,
  globalCallback: (err: Error | null, msg?: unknown) => void,
  callbackData: MessageReplyCallbackData
): void {
  if (ctx.options?.autoMarkDelivery || ctx.globalOptions?.autoMarkDelivery) {
    markDelivery(ctx, client, callbackData.threadID, callbackData.messageID);
  }
  if (!ctx.options?.selfListen && !ctx.globalOptions?.selfListen && callbackData.senderID === ctx.userID) return;
  globalCallback(null, callbackData);
}

const getThreadIdFromKey = (threadKey: ThreadKey): string => {
  return getThreadId(threadKey);
};

export default function (
  def: DefaultFuncs,
  client: Client,
  ctx: ContextWithGlobalOptions,
  delta: unknown,
  globalCallback: (err: Error | null, msg?: unknown) => void
): void {
  const deltaRec = asRecord(delta);
  const payload = deltaRec?.payload;
  const clientPayload = decodeClientPayload(payload as never) as unknown as DecodedClientPayload;
  if (!clientPayload?.deltas || !Array.isArray(clientPayload.deltas)) return;

  // Pre-compile type strings (realtime optimization)
  const MESSAGE_REACTION_TYPE = "message_reaction";
  const MESSAGE_UNSEND_TYPE = "message_unsend";

  const deltas = clientPayload.deltas;
  const deltasLen = deltas.length;

  for (let i = 0; i < deltasLen; i++) {
    const currentDelta = deltas[i];

    if (currentDelta.deltaMessageReaction) {
      const reaction = currentDelta.deltaMessageReaction;
      globalCallback(null, {
        type: MESSAGE_REACTION_TYPE,
        threadID: getThreadIdFromKey(reaction.threadKey),
        messageID: reaction.messageId,
        reaction: reaction.reaction,
        senderID: toStringId(reaction.senderId),
        userID: toStringId(reaction.userId)
      });
      continue;
    }

    if (currentDelta.deltaRecallMessageData) {
      const recall = currentDelta.deltaRecallMessageData;
      globalCallback(null, {
        type: MESSAGE_UNSEND_TYPE,
        threadID: getThreadIdFromKey(recall.threadKey),
        messageID: recall.messageID,
        senderID: toStringId(recall.senderID),
        deletionTimestamp: recall.deletionTimestamp,
        timestamp: recall.timestamp
      });
      continue;
    }

    if (currentDelta.deltaMessageReply) {
      handleMessageReply(currentDelta, ctx, def, client, globalCallback);
    }
  }
}

function handleMessageReply(
  delta: ClientPayloadDelta,
  ctx: ContextWithGlobalOptions,
  defaultFuncs: DefaultFuncs,
  api: Client,
  globalCallback: (err: Error | null, msg?: unknown) => void
): void {
  const reply = delta.deltaMessageReply;
  if (!reply) return;

  const message = reply.message;
  if (!message) return;

  const reqCtx = delta.requestContext || reply.requestContext || message.requestContext || {};
  let via: string | undefined = undefined;

  const reqCtxApiArgs = asRecord(reqCtx)?.apiArgs;
  let apiArgsString = typeof reqCtxApiArgs === "string" ? reqCtxApiArgs : null;

  if (!apiArgsString) {
    const rawReq = message?.messageReplyRawRequestContext?.apiArgs;
    if (typeof rawReq === "string") apiArgsString = rawReq;
  }

  if (apiArgsString) {
    try {
      const srcMatch = apiArgsString.match(/Send(\w+)Message/);
      via = srcMatch ? srcMatch[1].toLowerCase() : undefined;
    } catch {}
  }

  let breadcrumbsInfo: string | undefined;
  if (message.breadcrumbs) {
    try {
      if (/Send(\w+)Message/.test(message.breadcrumbs)) {
        breadcrumbsInfo = RegExp.$1.toLowerCase();
      }
    } catch {}
  }

  const participants = Array.isArray(message.participants)
    ? message.participants.map((e) => toStringId(e)).filter(Boolean)
    : [];

  // ✅ mentions: Gb (new) -> prng (legacy)
  const mentions = extractMentions(message.data?.prng, message.body ?? "", message);

  const callbackData: MessageReplyCallbackData = {
    type: "message_reply",
    threadID: getThreadId(message.messageMetadata.threadKey),
    messageID: message.messageMetadata.messageId,
    senderID: toStringId(message.messageMetadata.actorFbId),
    attachments: processReplyAttachments(message.attachments),
    args: (message.body || "").trim().split(/\s+/),
    body: message.body || "",
    isGroup: !!message.messageMetadata.threadKey.threadFbId,
    mentions,
    timestamp: parseInt(message.messageMetadata.timestamp ?? "0", 10),
    participantIDs: participants,
    sentFrom: via || breadcrumbsInfo || ""
  };

  if (reply.repliedToMessage) {
    callbackData.messageReply = processRepliedMessage(reply.repliedToMessage, message.participants);
    finalizeCallback(ctx, api, globalCallback, callbackData);
  } else if (reply.replyToMessageId) {
    fetchRepliedMessage(defaultFuncs, ctx, callbackData, reply.replyToMessageId.id).finally(() =>
      finalizeCallback(ctx, api, globalCallback, callbackData)
    );
  } else {
    finalizeCallback(ctx, api, globalCallback, callbackData);
  }
}