import logger from '@log';
import utils, { type Client, type Context, type DefaultFuncs } from '../../../request/formatters/helpers';

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
}

interface ThreadImageDelta {
  threadKey?: ThreadKey;
  messageId?: string;
}

export default (
  def: DefaultFuncs,
  _client: Client,
  ctx: ContextWithGlobalOptions,
  delta: unknown,
  globalCallback: GlobalCallback
): void => {
  console.log('threadImage', delta);
  const d = (delta && typeof delta === "object" ? (delta as ThreadImageDelta) : null);
  const tid = d?.threadKey?.threadFbId;
  const mid = d?.messageId;
  if (!tid || !mid) return;
  const tidStr = toStringId(tid);
  if (!tidStr) return;
  const form = {
    av: ctx.userID,
    __user: ctx.userID,
    __a: "1",
    __req: "3",
    fb_dtsg: ctx.fb_dtsg,
    queries: JSON.stringify({
      o0: {
        doc_id: "2848441488556444",
        query_params: { thread_and_message_id: { thread_id: tidStr, message_id: mid } }
      }
    })
  };
  def.post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
    .then(utils.parseAndCheckLogin(ctx, def))
    .then((resUnknown: unknown) => {
      const res = Array.isArray(resUnknown) ? resUnknown : [];
      const last = res.length ? (res[res.length - 1] as any) : null;
      if (last?.error_results > 0) throw (res[0] as any)?.o0?.errors ?? new Error("forcedFetch: graphqlbatch errors");
      if (last?.successful_results === 0) throw new Error("forcedFetch: no successful_results");

      const data = (res[0] as any)?.o0?.data?.message as any;
      if (utils.getType(data) !== "Object") return logger.error(data);
      if (data.__typename !== "ThreadImageMessage") return logger.warn(data.__typename);
      globalCallback(null, {
        type: "event",
        threadID: utils.formatID(tidStr),
        messageID: data.message_id,
        logMessageType: "log:thread-image",
        logMessageData: {
          attachmentID: data.image_with_metadata?.legacy_attachment_id,
          width: data.image_with_metadata?.original_dimensions?.x,
          height: data.image_with_metadata?.original_dimensions?.y,
          url: data.image_with_metadata?.preview?.uri
        },
        logMessageBody: data.snippet,
        timestamp: data.timestamp_precise,
        author: data.message_sender?.id
      });
    })
    .catch((err: unknown) => logger.error(err instanceof Error ? err.message : String(err)));
};
