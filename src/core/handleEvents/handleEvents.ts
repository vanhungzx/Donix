"use strict";

import { createHandleEvent } from "./modules/handleEvent";
import { createOnCall } from "./modules/onCall";
import { createOnChat } from "./modules/onChat";
import { createOnData } from "./modules/onData";
import { createOnEvent } from "./modules/onEvent";
import { createOnReact } from "./modules/onReact";
import { createOnReply } from "./modules/onReply";
import { HandlerDependencies } from "./modules/types";

export const createHandlers = (deps: HandlerDependencies) => {
  const handlers = {
    onCall: createOnCall(deps),
    onChat: createOnChat(deps),
    onEvent: createOnEvent(deps),
    onReply: createOnReply(deps),
    onData: createOnData(deps),
    handleEvent: createHandleEvent(deps),
    onReact: createOnReact(deps),
  };
  return handlers;
};

export const onCall = (d: HandlerDependencies) => createOnCall(d);
export const onChat = (d: HandlerDependencies) => createOnChat(d);
export const onEvent = (d: HandlerDependencies) => createOnEvent(d);
export const onReply = (d: HandlerDependencies) => createOnReply(d);
export const onData = (d: HandlerDependencies) => createOnData(d);
export const handleEvent = (d: HandlerDependencies) => createHandleEvent(d);
export const onReact = (d: HandlerDependencies) => createOnReact(d);

export default {
  createHandlers,
  onCall,
  onChat,
  onEvent,
  onReply,
  onData,
  handleEvent,
  onReact,
};
