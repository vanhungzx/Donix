import { Client, Context, DefaultFuncs } from "../request/formatters/helpers.js";
import activities from './lib/event/activities';
import approvalQueue from './lib/event/approvalQueue';
import subscribe from './lib/event/subscribe';
import threadImage from './lib/event/threadImage';
import threadName from './lib/event/threadName';
import unsubscribe from './lib/event/unsubscribe';
import ClientPayload from "./lib/message/ClientPayload";
import newMessage from './lib/message/newMessage';

const deltaHandlers = new Map<string, (def: DefaultFuncs, client: Client, ctx: Context, delta: any, callback: (err: any, msg?: any) => void) => void>([
  ["ThreadName", threadName],
  ["ForcedFetch", threadImage],
  ["ParticipantsAddedToGroupThread", subscribe],
  ["ParticipantLeftGroupThread", unsubscribe],
  ["ApprovalQueue", approvalQueue],
  ["NewMessage", newMessage],
  ["ClientPayload", ClientPayload],
]);

const activitiesClasses = new Set(["AdminTextMessage", "JoinableMode"]);

// Tối ưu: Bỏ qua các delta types không cần thiết ngay từ đầu
const SKIP_DELTA_CLASSES = new Set([
  "DeliveryReceipt",
  "NoOp",
  "ThreadFolder",
  "MarkRead",
  "MarkUnread",
  "ThreadIcon",
  "ThreadColor",
  "ThreadNickname",
  "ThreadEphemeralTtlMode",
  "ThreadEphemeralTtlModeChange",
  "ThreadReaction",
  "ThreadReactionSync",
  "ThreadReactionSyncUnread",
  "ThreadReactionSyncRead",
  "ThreadReactionSyncUnreadCount",
  "ThreadReactionSyncReadCount"
]);

export default (def: DefaultFuncs, client: Client, ctx: Context, delta: any, callback: (err: any, msg?: any) => void): void => {
  const deltaClass = delta?.class;

  // Tối ưu: Bỏ qua các delta không cần thiết ngay từ đầu
  if (!deltaClass || SKIP_DELTA_CLASSES.has(deltaClass)) {
    return;
  }

  const handler = deltaHandlers.get(deltaClass);
  if (handler) {
    return handler(def, client, ctx, delta, callback);
  }

  if (activitiesClasses.has(deltaClass)) {
    return activities(def, client, ctx, delta, callback);
  }

  // Tối ưu: Không log hoặc xử lý các delta không biết - chỉ bỏ qua
};
