import formatID from "../value/formatID.js";

interface TypingEventShape {
  st?: unknown;
  from: string | number | { toString(): string };
  to?: string | number;
  thread_fbid?: string | number;
  from_mobile?: boolean;
  realtime_viewer_fbid?: string | number;
}

export interface FormattedTyping {
  isTyping: boolean;
  from: string;
  threadID: ReturnType<typeof formatID>;
  fromMobile: boolean;
  userID: string;
  type: "typ";
}

export const formatTyp = (event: unknown): FormattedTyping => {
  const e = event as TypingEventShape;
  const toRef = e.to ?? e.thread_fbid ?? e.from;
  return {
    isTyping: !!e.st,
    from: e.from.toString(),
    threadID: formatID(toRef.toString()),
    fromMobile: Object.prototype.hasOwnProperty.call(e, "from_mobile") ? !!e.from_mobile : true,
    userID: (e.realtime_viewer_fbid ?? e.from).toString(),
    type: "typ",
  };
};

interface ReadReceiptEventShape {
  reader: string | number | { toString(): string };
  time: unknown;
  thread_fbid?: string | number;
}

export interface FormattedReadReceipt {
  reader: string;
  time: unknown;
  threadID: ReturnType<typeof formatID>;
  type: "read_receipt";
}

export const formatReadReceipt = (event: unknown): FormattedReadReceipt => {
  const e = event as ReadReceiptEventShape;
  return {
    reader: e.reader.toString(),
    time: e.time,
    threadID: formatID((e.thread_fbid ?? e.reader).toString()),
    type: "read_receipt",
  };
};

interface ReadEventShape {
  chat_ids?: Array<string | number>;
  thread_fbids?: Array<string | number>;
  timestamp: unknown;
}

export interface FormattedRead {
  threadID: ReturnType<typeof formatID>;
  time: unknown;
  type: "read";
}

export const formatRead = (event: unknown): FormattedRead => {
  const e = event as ReadEventShape;
  const id = (e.chat_ids && e.chat_ids[0]) ?? (e.thread_fbids && e.thread_fbids[0]);
  return {
    threadID: formatID(String(id)),
    time: e.timestamp,
    type: "read",
  };
};
