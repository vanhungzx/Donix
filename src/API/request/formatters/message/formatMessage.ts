import { formatAttachment } from "../data/formatAttachment.js";
import { getAdminTextMessageType } from "../data/formatDelta.js";
import formatID from "../value/formatID.js";

export const formatMessage = (m: any) => {
  const originalMessage = m.message ? m.message : m;
  const obj: any = {
    type: "message",
    senderName: originalMessage.sender_name,
    senderID: formatID(originalMessage.sender_fbid?.toString()),
    participantNames:
      originalMessage.group_thread_info?.participant_names || [originalMessage.sender_name?.split(" ")[0]],
    participantIDs:
      originalMessage.group_thread_info?.participant_ids.map((v: any) => formatID(v.toString())) ||
      [formatID(originalMessage.sender_fbid)],
    body: originalMessage.body || "",
    threadID: formatID((originalMessage.thread_fbid || originalMessage.other_user_fbid).toString()),
    threadName: originalMessage.group_thread_info?.name || originalMessage.sender_name,
    location: originalMessage.coordinates || null,
    messageID: originalMessage.mid?.toString() || originalMessage.message_id,
    attachments: formatAttachment(
      originalMessage.attachments,
      originalMessage.attachmentIds,
      originalMessage.attachment_map,
      originalMessage.share_map
    ),
    timestamp: originalMessage.timestamp,
    tags: originalMessage.tags,
    reactions: originalMessage.reactions || [],
    isUnread: originalMessage.is_unread,
  };
  if (m.type === "pages_messaging") obj.pageID = m.realtime_viewer_fbid?.toString();
  obj.isGroup = obj.participantIDs.length > 2;
  return obj;
};

export const formatEvent = (m: any) => {
  const originalMessage = m.message ? m.message : m;
  let logMessageType = originalMessage.log_message_type;
  let logMessageData;
  if (logMessageType === "log:generic-admin-text") {
    logMessageData = originalMessage.log_message_data.untypedData;
    logMessageType = getAdminTextMessageType(originalMessage.log_message_data.message_type);
  } else {
    logMessageData = originalMessage.log_message_data;
  }
  return {
    ...formatMessage(originalMessage),
    type: "event",
    logMessageType,
    logMessageData,
    logMessageBody: originalMessage.log_message_body,
  };
};

export const formatHistoryMessage = (m: any) =>
  m.action_type === "ma-type:log-message" ? formatEvent(m) : formatMessage(m);
