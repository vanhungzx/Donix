import logger from '@log';
import utils from '../../../request/formatters/helpers.js';

const EVENT_TYPE_SUBSCRIBE = 'event';
const LOG_MESSAGE_TYPE_SUBSCRIBE = 'log:subscribe';

export default (def: any, client: any, ctx: any, delta: any, globalCallback: (err: any, msg?: any) => void): void => {
  try {

    const threadKey = delta.threadKey;
    const messageMetadata = delta.messageMetadata;
    const metaThreadKey = messageMetadata?.threadKey;

    const threadID = utils.formatID(
      threadKey?.threadFbId || metaThreadKey?.threadFbId
    );
    const actorFbId = messageMetadata?.actorFbId;
    const author = actorFbId != null
      ? (typeof actorFbId === "string" ? actorFbId : actorFbId.toString())
      : null;

    globalCallback(null, {
      type: EVENT_TYPE_SUBSCRIBE,
      threadID,
      messageID: messageMetadata?.messageId,
      logMessageType: LOG_MESSAGE_TYPE_SUBSCRIBE,
      logMessageData: { addedParticipants: delta.addedParticipants },
      logMessageBody: messageMetadata?.adminText || '',
      timestamp: messageMetadata?.timestamp,
      author,
      participants: delta.participants
    });
  } catch (err) {
    logger.error(err as string);
  }
};
