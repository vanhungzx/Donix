import type { BotEvent as BotEventDefinition, EventContext } from '@types';

const eventModule: BotEventDefinition = {
  name: "logEvent",
  version: "1.0.3",
  desc: "Console log tất cả log events",
  type: [
    "log:subscribe",
    "log:unsubscribe",
    "log:thread-name",
    "log:thread-image",
    "log:thread-icon",
    "log:thread-color",
    "log:user-nickname",
    "log:thread-admins",
    "log:thread-poll",
    "log:thread-approval-mode",
    "log:thread-call",
    "log:thread-pinned",
    "log:unpin-message",
    "log:user-location",
    "log:link-status",
    "log:magic-words",
    "log:approval_request",
    "log:approval_remove",
    "log:tagall"
  ],
  onCall: async ({ event }: EventContext) => {
    console.log(event);
  }
};

export default eventModule;
