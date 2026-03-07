import { rent } from "./rent";
import { checkBanned } from "./banned";
import logger from "./log";
import type { FacebookClient, ExtendedMessageEvent, ThreadDataModel, UserDataModel, BotConfig } from "@types";

export async function checkKey({
  client,
  event,
  threadData,
  userData,
  config,
}: {
  client: FacebookClient;
  event: ExtendedMessageEvent;
  threadData: ThreadDataModel;
  userData: UserDataModel;
  config: BotConfig;
}): Promise<void> {
  try {
    const { threadID: t, senderID: s } = event || {};
    if (!t || !s) return;

    const tid = String(t);
    const sid = String(s);

    if (await rent(tid, sid, client, config, event)) {
      return;
    }

    if (await checkBanned({ client, event, config, userData, threadData })) {
      return;
    }
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    logger.error(`checkKey error: ${error.message}`);
  }
}
