import type { Client, Context, DefaultFuncs, GlobalOptions } from "../../request/formatters/helpers";
import utils from "../../request/index";
import parseDelta from "../parse";
import { getTaskResponseData } from "./taskHandlers";

const { formatDeltaReadReceipt, formatID } = utils;

// Type definitions
type GlobalCallback = (err: Error | null, msg?: unknown) => void;

interface TmsMessage {
  firstDeltaSeqId?: string | number;
  syncToken?: string;
  lastIssuedSeqId?: string | number;
  deltas?: Array<{
    class?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

interface TypingNotification {
  sender_fbid?: string | number;
  thread?: string | number;
  state?: unknown;
  [key: string]: unknown;
}

interface PresenceItem {
  u?: string | number;
  l?: number;
  p?: unknown;
  [key: string]: unknown;
}

interface PresenceUpdate {
  list?: PresenceItem[];
  [key: string]: unknown;
}

interface LsResponse {
  request_id?: string;
  payload?: string;
  [key: string]: unknown;
}

interface FriendRequestMessage {
  type?: string;
  from?: string | number;
  [key: string]: unknown;
}

interface WebRTCMessage {
  binary?: boolean;
  raw?: Buffer;
  from?: string | number;
  to?: string | number;
  thread_id?: string | number;
  call_id?: string | number;
  sdp?: unknown;
  type?: string;
  status?: unknown;
  session?: unknown;
  audio?: unknown;
  video?: unknown;
  ice?: unknown;
  dataChannel?: unknown;
  metadata?: unknown;
  payload?: string | unknown;
  [key: string]: unknown;
}

interface WebRTCEvent {
  type: string;
  topic: string;
  timestamp: number;
  binary?: boolean;
  byteLength?: number;
  rawBuffer?: Buffer;
  rawBase64?: string;
  hasSDP?: boolean;
  from?: string;
  to?: string;
  threadID?: string;
  callID?: string;
  sdp?: unknown;
  callType?: string;
  status?: unknown;
  sdpData?: {
    session?: unknown;
    audio?: unknown;
    video?: unknown;
    ice?: unknown;
    dataChannel?: unknown;
    metadata?: unknown;
  };
  payload?: unknown;
  raw?: WebRTCMessage;
}

interface TaskData {
  type: string;
  callback: (err: string | null, data?: unknown) => void;
}

interface ContextWithTasks extends Omit<Context, "options" | "lastSeqId"> {
  tmsWait?: () => void;
  lastSeqId?: string | number;
  syncToken?: string;
  tasks?: Map<string, TaskData>;
  options?: GlobalOptions & {
    mqttWebrtcIncludeRaw?: boolean;
    mqttWebrtcIncludeBase64?: boolean;
    mqttWebrtcMaxRawBytes?: number;
    mqttIncludeRawWebrtcJson?: boolean;
  };
}

// Pre-compile skip classes Set at module level (realtime optimization - avoid recreating per call)
const SKIP_CLASSES = new Set(["DeliveryReceipt", "NoOp", "ThreadFolder", "MarkRead", "MarkUnread"]);

// Pre-compile common delta class strings (realtime optimization - avoid repeated property access)
const DELTA_CLASS_READ_RECEIPT = "ReadReceipt";

export function handleTmsMessage(jsonMessage: TmsMessage, ctx: ContextWithTasks, defaultFuncs: DefaultFuncs, api: Client, globalCallback: GlobalCallback): void {
  if (ctx.tmsWait && typeof ctx.tmsWait === "function") {
    ctx.tmsWait();
  }
  if (jsonMessage.firstDeltaSeqId && jsonMessage.syncToken) {
    ctx.lastSeqId = jsonMessage.firstDeltaSeqId;
    ctx.syncToken = jsonMessage.syncToken;
  }
  if (jsonMessage.lastIssuedSeqId) {
    ctx.lastSeqId = typeof jsonMessage.lastIssuedSeqId === "string"
      ? parseInt(jsonMessage.lastIssuedSeqId)
      : jsonMessage.lastIssuedSeqId;
  }
  const deltas = jsonMessage.deltas;
  if (!deltas || !Array.isArray(deltas) || deltas.length === 0) {
    return; // Tối ưu: Early return nếu không có deltas
  }

  // Xử lý tất cả deltas cùng lúc, không chia chunk
  for (let i = 0; i < deltas.length; i++) {
    const delta = deltas[i];
    // Fast path: avoid property access if delta is null/undefined
    if (!delta) continue;

    const deltaClass = delta.class;
    // Fast path: skip early if no class or in skip set
    if (!deltaClass || SKIP_CLASSES.has(deltaClass)) {
      continue;
    }

    // Fast path: ReadReceipt is common, handle inline without function call overhead
    if (deltaClass === DELTA_CLASS_READ_RECEIPT) {
      try {
        globalCallback(null, formatDeltaReadReceipt(delta));
      } catch {
        // Silent fail để tránh spam log
      }
      continue;
    }

    // Parse các delta còn lại
    parseDelta(defaultFuncs, api, ctx as Context, delta, globalCallback);
  }
}

// Pre-compile type string (realtime optimization)
const TYPING_EVENT_TYPE = "typ";

export function handleTypingNotification(jsonMessage: TypingNotification, globalCallback: GlobalCallback): void {
  // Fast path: avoid multiple toString() calls
  const senderFbid = jsonMessage.sender_fbid;
  const thread = jsonMessage.thread || senderFbid;
  const typ = {
    type: TYPING_EVENT_TYPE,
    isTyping: !!jsonMessage.state,
    from: senderFbid?.toString() || "",
    threadID: formatID(thread?.toString() || "")
  };
  globalCallback(null, typ);
}

// Pre-compile type string (realtime optimization)
const PRESENCE_EVENT_TYPE = "presence";

export function handlePresenceUpdate(jsonMessage: PresenceUpdate, globalCallback: GlobalCallback): void {
  const list = jsonMessage.list;
  if (!list || !Array.isArray(list)) return;
  // Fast path: cache list.length to avoid repeated property access
  const len = list.length;
  for (let i = 0; i < len; i++) {
    const data = list[i];
    // Fast path: avoid toString() if already string, cache multiplication
    const u = data.u;
    const presence = {
      type: PRESENCE_EVENT_TYPE,
      userID: typeof u === "string" ? u : u?.toString() || "",
      timestamp: (data.l || 0) * 1000,
      statuses: data.p
    };
    globalCallback(null, presence);
  }
}

export function handleLsResponse(jsonMessage: LsResponse, ctx: ContextWithTasks): void {
  const reqID = jsonMessage.request_id;
  if (!reqID || !ctx.tasks || !ctx.tasks.has(reqID)) return;
  let parsedPayload;
  try {
    parsedPayload = JSON.parse(jsonMessage.payload || "{}");
  } catch {
    const taskData = ctx.tasks.get(reqID);
    if (taskData && taskData.callback) {
      taskData.callback("parse_error", null);
    }
    return;
  }
  const taskData = ctx.tasks.get(reqID);
  if (!taskData) return;
  const { type: taskType, callback: taskCallback } = taskData;
  const taskRespData = getTaskResponseData(taskType, parsedPayload);
  if (taskRespData == null) {
    taskCallback("error", null);
  } else {
    taskCallback(null, {
      type: taskType,
      reqID: reqID,
      ...taskRespData
    });
  }
}

// Pre-compile type strings (realtime optimization)
const FRIEND_REQUEST_ADD_TYPE = "jewel_requests_add";
const FRIEND_REQUEST_REMOVE_TYPE = "jewel_requests_remove_old";
const FRIEND_REQUEST_RECEIVED = "friend_request_received";
const FRIEND_REQUEST_CANCEL = "friend_request_cancel";

export function handleFriendRequest(jsonMessage: FriendRequestMessage, globalCallback: GlobalCallback): void {
  const msgType = jsonMessage.type;
  if (msgType === FRIEND_REQUEST_ADD_TYPE) {
    // Fast path: cache toString() result
    const from = jsonMessage.from;
    globalCallback(null, {
      type: FRIEND_REQUEST_RECEIVED,
      actorFbId: typeof from === "string" ? from : from?.toString() || "",
      timestamp: String(Date.now())
    });
  } else if (msgType === FRIEND_REQUEST_REMOVE_TYPE) {
    const from = jsonMessage.from;
    globalCallback(null, {
      type: FRIEND_REQUEST_CANCEL,
      actorFbId: typeof from === "string" ? from : from?.toString() || "",
      timestamp: String(Date.now())
    });
  }
}

export function handleWebRTCMessage(jsonMessage: WebRTCMessage, ctx: ContextWithTasks, globalCallback: GlobalCallback, topic: string): void {
  try {
    // Handle different WebRTC message types
    const event: WebRTCEvent = {
      type: "video_call",
      topic: topic,
      timestamp: Date.now()
    };

      // Handle binary/protobuf messages
      if (jsonMessage.binary && Buffer.isBuffer(jsonMessage.raw)) {
        event.binary = true;
        const rawBuffer = jsonMessage.raw;
        event.byteLength = rawBuffer.length;

        // By default, DO NOT attach raw payload/base64 to the emitted event.
        // These payloads can be large and will quickly blow up heap/RSS.
        const includeRaw = ctx.options?.mqttWebrtcIncludeRaw === true;
        const includeBase64 = ctx.options?.mqttWebrtcIncludeBase64 === true;
        const maxRawBytes = ctx.options?.mqttWebrtcMaxRawBytes !== undefined && Number.isFinite(ctx.options.mqttWebrtcMaxRawBytes)
          ? Math.max(0, Math.min(Number(ctx.options.mqttWebrtcMaxRawBytes), 64 * 1024))
          : 0;

        // Tối ưu: chỉ tạo subarray/base64 nếu thực sự cần, cleanup sau khi dùng
        let tempBuffer: Buffer | null = null;
        try {
          if (includeRaw && maxRawBytes > 0) {
            tempBuffer = rawBuffer.subarray(0, maxRawBytes);
            event.rawBuffer = tempBuffer;
          }

          if (includeBase64 && maxRawBytes > 0) {
            // Tối ưu: reuse tempBuffer nếu đã tạo
            const bufferToEncode = tempBuffer || rawBuffer.subarray(0, maxRawBytes);
            event.rawBase64 = bufferToEncode.toString("base64");
            // Cleanup temp buffer reference sau khi encode
            if (tempBuffer && tempBuffer !== bufferToEncode) {
              tempBuffer = null;
            }
          }

          // Try to extract readable parts from binary - chỉ đọc phần nhỏ để check
          const checkLength = Math.min(1000, rawBuffer.length);
          if (checkLength > 0) {
            const bufferStr = rawBuffer.toString("utf-8", 0, checkLength);
            // Fast path: check SDP markers
            if (bufferStr.includes("WebRTC_SDP") || bufferStr.includes("v=0")) {
              event.hasSDP = true;
            }
          }
        } finally {
          // Cleanup temp buffer reference để giúp GC
          tempBuffer = null;
        }

        globalCallback(null, event);
        return;
      }

    // Handle JSON messages
    // Extract common fields
    if (jsonMessage.from) {
      event.from = jsonMessage.from.toString();
    }
    if (jsonMessage.to) {
      event.to = jsonMessage.to.toString();
    }
    if (jsonMessage.thread_id) {
      event.threadID = jsonMessage.thread_id.toString();
    }
    if (jsonMessage.call_id) {
      event.callID = jsonMessage.call_id.toString();
    }
    if (jsonMessage.sdp) {
      event.sdp = jsonMessage.sdp;
    }
    if (jsonMessage.type) {
      event.callType = jsonMessage.type;
    }
    if (jsonMessage.status) {
      event.status = jsonMessage.status;
    }

    // Handle WebRTC_SDP type messages
    if (jsonMessage.type === "WebRTC_SDP" || jsonMessage.session) {
      event.sdpData = {
        session: jsonMessage.session,
        audio: jsonMessage.audio,
        video: jsonMessage.video,
        ice: jsonMessage.ice,
        dataChannel: jsonMessage.dataChannel,
        metadata: jsonMessage.metadata
      };
    }

    if (jsonMessage.payload) {
      // Try to parse payload if it's a string
      try {
        const parsed = typeof jsonMessage.payload === "string"
          ? JSON.parse(jsonMessage.payload)
          : jsonMessage.payload;
        event.payload = parsed;
      } catch {
        event.payload = jsonMessage.payload;
      }
    }

    // Include full message ONLY when explicitly enabled (can be large).
    if (ctx.options?.mqttIncludeRawWebrtcJson === true) {
      event.raw = jsonMessage;
    }

    globalCallback(null, event);
  } catch (err: unknown) {
    console.error("Error handling WebRTC message:", err);
  }
}
