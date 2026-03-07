import logger from '@log';
import utils, { type Client, type Context, type DefaultFuncs } from "../../../request/formatters/helpers";

type GlobalCallback = (err: Error | null, msg?: unknown) => void;
type ContextWithGlobalOptions = Context & { options?: Context["options"] };
type IdLike = string | number | bigint;

function toStringId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

interface ThreadKey {
  threadFbId?: IdLike;
  otherUserFbId?: IdLike;
}

interface MessageMetadata {
  threadKey?: ThreadKey;
  adminText?: string;
  actorFbId?: IdLike;
  timestamp?: string;
}

interface ApprovalQueueDelta {
  messageMetadata?: MessageMetadata;
  action?: unknown;
  recipientFbId?: unknown;
  inviterFbId?: unknown;
  requestSource?: unknown;
  requestTimestamp?: unknown;
}

export default (
  _def: DefaultFuncs,
  _client: Client,
  _ctx: ContextWithGlobalOptions,
  delta: unknown,
  callback: GlobalCallback
): void => {
  try {
    const d = (delta && typeof delta === "object" ? (delta as ApprovalQueueDelta) : null);
    const meta = d?.messageMetadata;

    const threadID = utils.formatID(
      toStringId(meta?.threadKey?.threadFbId) ?? toStringId(meta?.threadKey?.otherUserFbId) ?? ''
    );

    const eventData = {
      type: 'event',
      threadID,
      logMessageType: 'log:approval-queue',
      logMessageData: {
        action: d?.action,
        recipientFbId: d?.recipientFbId,
        inviterFbId: d?.inviterFbId ?? null,
        requestSource: d?.requestSource ?? null,
        requestTimestamp: d?.requestTimestamp ?? null
      },
      logMessageBody: meta?.adminText || '',
      author: toStringId(meta?.actorFbId),
      timestamp: meta?.timestamp || Date.now().toString()
    };

    callback(null, eventData);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(error.message);
    callback(error);
  }
};
