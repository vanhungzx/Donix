import utils, { type Client, type Context, type DefaultFuncs } from '../../../request/formatters/helpers';

type ContextWithGlobalOptions = Context & { options?: Context["options"] };
type GlobalCallback = (err: Error | null, msg?: unknown) => void;

type IdLike = string | number | bigint;
function toStringId(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return undefined;
}

interface ThreadKey {
  threadFbId?: IdLike;
  otherUserFbId?: IdLike;
}

interface MessageMetadata {
  threadKey?: ThreadKey;
  cid?: { conversationFbid?: string };
  messageId?: string;
  adminText?: string;
  timestamp?: string;
  actorFbId?: IdLike;
}

interface UnsubscribeDelta {
  messageMetadata?: MessageMetadata;
  leftParticipantFbId?: IdLike;
  participants?: unknown;
}

// Pre-compile type strings (realtime optimization)
const EVENT_TYPE_UNSUBSCRIBE = 'event';
const LOG_MESSAGE_TYPE_UNSUBSCRIBE = 'log:unsubscribe';

export default (
  _def: DefaultFuncs,
  _client: Client,
  _ctx: ContextWithGlobalOptions,
  delta: unknown,
  globalCallback: GlobalCallback
): void => {
  // Fast path: early return if delta is null/undefined
  if (!delta || typeof delta !== "object") return;

  const d = delta as UnsubscribeDelta;
  const meta = d?.messageMetadata;
  if (!meta) return;

  // Fast path: cache property access
  const threadKey = meta.threadKey;
  const threadIdRaw = threadKey?.threadFbId ?? threadKey?.otherUserFbId ?? meta.cid?.conversationFbid;
  const threadIdStr = typeof threadIdRaw === "string" ? threadIdRaw : toStringId(threadIdRaw);

  globalCallback(null, {
    type: EVENT_TYPE_UNSUBSCRIBE,
    threadID: utils.formatID(threadIdStr ?? ""),
    messageID: meta.messageId,
    logMessageType: LOG_MESSAGE_TYPE_UNSUBSCRIBE,
    logMessageData: {
      leftParticipantFbId: toStringId(d?.leftParticipantFbId)
    },
    logMessageBody: meta.adminText || '',
    timestamp: meta.timestamp,
    author: toStringId(meta.actorFbId),
    participants: d?.participants
  });
};
