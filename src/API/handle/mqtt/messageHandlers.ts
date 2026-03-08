import utils from "../../request/index";
import parseDelta from "../parse";
import { getTaskResponseData } from "./taskHandlers";
const { formatDeltaReadReceipt, formatID } = utils;

// Pre-compile skip classes Set at module level (realtime optimization - avoid recreating per call)
const SKIP_CLASSES = new Set(["DeliveryReceipt", "NoOp", "ThreadFolder", "MarkRead", "MarkUnread"]);

// Pre-compile common delta class strings (realtime optimization - avoid repeated property access)
const DELTA_CLASS_READ_RECEIPT = "ReadReceipt";

export function handleTmsMessage(jsonMessage: any, ctx: any, defaultFuncs: any, api: any, globalCallback: any): void {
  if (ctx.tmsWait && typeof ctx.tmsWait === "function") {
    ctx.tmsWait();
  }
  if (jsonMessage.firstDeltaSeqId && jsonMessage.syncToken) {
    ctx.lastSeqId = jsonMessage.firstDeltaSeqId;
    ctx.syncToken = jsonMessage.syncToken;
  }
  if (jsonMessage.lastIssuedSeqId) {
    ctx.lastSeqId = parseInt(jsonMessage.lastIssuedSeqId);
  }
  const deltas = jsonMessage.deltas;
  if (!deltas || !Array.isArray(deltas) || deltas.length === 0) {
    return; // Tối ưu: Early return nếu không có deltas
  }

  // Realtime optimization:
  // Large delta batches can block the event loop and cause "lag" (not realtime).
  // Process deltas in chunks and yield between chunks to keep responsiveness.
  const realtime = ctx?.options?.mqttRealtime === true;
  const chunkSize = Number.isFinite(ctx?.options?.mqttDeltaChunkSize)
    ? Math.max(5, Math.min(Number(ctx.options.mqttDeltaChunkSize), 500))
    : (realtime ? 25 : 200);

  const defer = (fn: () => void) => {
    // Prefer setImmediate (Node) for yielding without long timers.
    if (typeof setImmediate === "function") {
      setImmediate(fn);
    } else {
      setTimeout(fn, 0);
    }
  };

  let i = 0;
  const processChunk = () => {
    const end = Math.min(i + chunkSize, deltas.length);
    for (; i < end; i++) {
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
      parseDelta(defaultFuncs, api, ctx, delta, globalCallback);
    }

    if (i < deltas.length) {
      defer(processChunk);
    }
  };

  // Process the first chunk synchronously for low latency,
  // then yield for the rest if needed.
  processChunk();
}

// Pre-compile type string (realtime optimization)
const TYPING_EVENT_TYPE = "typ";

export function handleTypingNotification(jsonMessage: any, globalCallback: any): void {
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

export function handlePresenceUpdate(jsonMessage: any, globalCallback: any): void {
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

export function handleLsResponse(jsonMessage: any, ctx: any): void {
  const reqID = jsonMessage.request_id;
  if (!reqID || !ctx.tasks || !ctx.tasks.has(reqID)) return;
  let parsedPayload;
  try {
    parsedPayload = JSON.parse(jsonMessage.payload);
  } catch {
    const taskData = ctx.tasks.get(reqID);
    if (taskData && taskData.callback) {
      taskData.callback("parse_error", null);
    }
    return;
  }
  const taskData = ctx.tasks.get(reqID);
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

export function handleFriendRequest(jsonMessage: any, globalCallback: any): void {
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

export function handleWebRTCMessage(jsonMessage: any, ctx: any, globalCallback: any, topic: string): void {
  try {
    // Handle different WebRTC message types
    const event: any = {
      type: "video_call",
      topic: topic,
      timestamp: Date.now()
    };

    // Handle binary/protobuf messages
    if (jsonMessage.binary && Buffer.isBuffer(jsonMessage.raw)) {
      event.binary = true;
      event.byteLength = jsonMessage.raw.length;

      // By default, DO NOT attach raw payload/base64 to the emitted event.
      // These payloads can be large and will quickly blow up heap/RSS.
      const includeRaw = ctx?.options?.mqttWebrtcIncludeRaw === true;
      const includeBase64 = ctx?.options?.mqttWebrtcIncludeBase64 === true;
      const maxRawBytes = Number.isFinite(ctx?.options?.mqttWebrtcMaxRawBytes)
        ? Math.max(0, Math.min(Number(ctx.options.mqttWebrtcMaxRawBytes), 64 * 1024))
        : 0;

      if (includeRaw && maxRawBytes > 0) {
        event.rawBuffer = jsonMessage.raw.subarray(0, maxRawBytes);
      }

      if (includeBase64 && maxRawBytes > 0) {
        // Still keep it bounded to avoid large string allocations.
        event.rawBase64 = jsonMessage.raw.subarray(0, maxRawBytes).toString("base64");
      }

      // Try to extract readable parts from binary
      try {
        const bufferStr = jsonMessage.raw.toString("utf-8", 0, Math.min(1000, jsonMessage.raw.length));
        if (bufferStr.includes("WebRTC_SDP") || bufferStr.includes("v=0")) {
          event.hasSDP = true;
        }
      } catch {
        // Ignore extraction errors
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
    if (ctx?.options?.mqttIncludeRawWebrtcJson === true) {
      event.raw = jsonMessage;
    }

    globalCallback(null, event);
  } catch (err: any) {
    console.error("Error handling WebRTC message:", err);
  }
}
