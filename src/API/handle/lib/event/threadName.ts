import { type Client, type Context, type DefaultFuncs } from "../../../request/formatters/helpers";

type GlobalCallback = (err: Error | null, msg?: unknown) => void;
type ContextWithGlobalOptions = Context & { globalOptions?: Context["options"] };
type IdLike = string | number | bigint;

function toStringId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

interface ThreadKey {
  threadFbId?: IdLike;
}

interface MessageMetadata {
  threadKey?: ThreadKey;
  cid?: { conversationFbid?: string };
  actorFbId?: IdLike;
  timestamp?: string;
  messageId?: string;
  adminText?: string;
}

interface ThreadNameDelta {
  messageMetadata?: MessageMetadata;
  name?: string;
}

// Pre-compile type strings (realtime optimization)
const EVENT_TYPE = "event";
const LOG_MESSAGE_TYPE_THREAD_NAME = "log:thread-name";

export default (
  _def: DefaultFuncs,
  _client: Client,
  _ctx: ContextWithGlobalOptions,
  delta: unknown,
  globalCallback: GlobalCallback
): void => {
  try {
    // Fast path: avoid type check if delta is null/undefined
    if (!delta || typeof delta !== "object") {
      return globalCallback(null, {
        type: EVENT_TYPE,
        threadID: null,
        logMessageType: LOG_MESSAGE_TYPE_THREAD_NAME,
        logMessageBody: null,
        logMessageData: { name: null },
        author: null,
        messageID: null,
        timestamp: null,
      });
    }

    const d = delta as ThreadNameDelta;
    const meta = d?.messageMetadata;

    // Fast path: cache property access
    const threadKey = meta?.threadKey;
    const threadFbId = threadKey?.threadFbId;
    const threadID =
      threadFbId != null
        ? toStringId(threadFbId)
        : meta?.cid?.conversationFbid ?? null;

    const eventObj = {
      type: EVENT_TYPE,
      threadID,
      logMessageType: LOG_MESSAGE_TYPE_THREAD_NAME,
      logMessageBody: meta?.adminText ?? null,
      logMessageData: { name: d?.name ?? null },
      author: toStringId(meta?.actorFbId),
      messageID: meta?.messageId ?? null,
      timestamp: meta?.timestamp ?? null,
    };

    return globalCallback(null, eventObj);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    return globalCallback(error);
  }
};
