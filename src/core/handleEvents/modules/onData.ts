import type { ExtendedMessageEvent } from "@types";
import { updateMessageCount } from "../../../utils/message-count";
import { HandlerDependencies, HandlerEventArgs } from "./types";
export const createOnData = ({ client, userData, threadData, logger }: HandlerDependencies) =>
  async ({ event }: HandlerEventArgs) => {
    await updateMessageCount(event as ExtendedMessageEvent, threadData, userData, client, logger);
  };
