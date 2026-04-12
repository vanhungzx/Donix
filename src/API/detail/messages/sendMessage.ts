import log from "@log";
import { generateOfflineThreadingID } from "../../request/formatters/index";
import { type Context, type DefaultFuncs } from "../../request/formatters/helpers";
import { getCleanupManager } from "../../../core/managers/cleanupManager";
import uploadFbFactory from "./uploadFb";
import uploadFb2Factory from "./uploadFb2";

interface ExtendedError extends Error {
  code?: string;
  permanent?: boolean;
  retryable?: boolean;
}

interface MessagePayload {
  thread_id: string | number;
  otid: any;
  source: any;
  send_type: number;
  sync_group: number;
  mark_thread_read: any;
  text: any;
  initiating_source: number;
  skip_url_preview_gen: number;
  text_has_links: number;
  multitab_env: number;
  metadata_dataclass: string;
  dataclass_params: string;
  navigation_chain: string;
  is_forwarded: number;
  hot_emoji_size?: number;
  power_up_style?: number;
  reply_metadata?: {
    reply_source_id: string;
    reply_source_type: number;
    reply_type: number;
    reply_source_attachment_id: null;
  };
  mention_data?: {
    mention_ids: string;
    mention_offsets: string;
    mention_lengths: string;
    mention_types: string;
  };
  location_data?: {
    coordinates: {
      latitude: number;
      longitude: number;
    };
    is_current_location: number;
    is_live_location: number;
  };
  sticker_id?: string | number;
  attachment_fbids?: (string | number)[];

  magic_words_data?: {
    magic_word_lengths: string;
    magic_word_offsets: string;
  };

  offline_attachment_ids?: string[];
}

const SEND = {
  APP_ID_POOL: ["772021112871879", "2220391788200892"],

  VERSION_POOL: [
    "25150404991310813",
    "32181477484799631",
    "9723306621127838",
    "24728819436812368",
    "24804310205905615",
    "31104338375848389"
  ]
};

const AVATAR_DEFAULT_FBIDS = {
  AVATAR_LOVE: "1351131679990183",
  AVATAR_ANGRY: "2063209204515336",
  AVATAR_LAUGH: "810689794923889",
  AVATAR_CRY: "2436600320070009"
};


const SHARE = { APP_ID: "2220391788200892", VERSION: "7191105584331330" };

const EFFECTS = {
  LOVE: 1,
  GIFTWRAP: 2,
  CELEBRATION: 3,
  FIRE: 4,
  AVATAR_LOVE: 1000,
  AVATAR_ANGRY: 1001,
  AVATAR_LAUGH: 1002,
  AVATAR_CRY: 1003
};

const CONSTANTS = {
  MQTT_TOPIC: "/ls_req",
  MQTT_QOS: 1,
  SOURCE: [2097153, 65537, 65554],
  SYNC_GROUP: 1,
  SEND_TYPES: {
    TEXT: 1,
    STICKER: 2,
    ATTACHMENT: 3,
    AVATAR_POWERUP: 9
  }
};

/** Gửi tin: ưu tiên nhiều nhóm song song (RR), vẫn giới hạn burst mỗi nhóm + toàn cục. */
const CONFIG = {
  MAX_CONCURRENT_REQUESTS: 18,
  PER_THREAD_MIN_GAP_MS: 95,
  GLOBAL_MIN_GAP_MS: 38,
  RETRIES: 1,
  RETRY_BACKOFF: 1.2,
  TIMEOUT_BASE: 8000,
  TIMEOUT_MAX: 30000,
  TIMEOUT_MIN: 6000,
  DEFAULT_TYPING_MS: 200,
  SMART_TYPING_DEFAULT: false,
  SHOW_TYPING_DEFAULT: false,
  BREAKER_THRESHOLD: 3,
  BREAKER_COOLDOWN_MS: 60000,
  CLEAR_QUEUE_ON_BREAK: true
};

const ALLOWED_PROPERTIES = new Set([
  "attachment",
  "url",
  "sticker",
  "emoji",
  "emojiSize",
  "hotEmojiSize",
  "body",
  "mentions",
  "location",
  "effect",
  "shareLink",
  "forwarded",
  "markThreadRead",
  "navigationChain",
  "remind",
  "replyType",
  "source",

  "sendHD",
  "magicWords",
  "offlineAttachmentIds",
  "productExtras",

  "metaAI",
  "metaAIPrefix"
]);

interface QueueItem {
  fn: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

const perThreadQueues = new Map<string, QueueItem[]>();
const perThreadLastSent = new Map<string, number>();
const suppressed = new Map<string, number>();
const consecutiveErrors = new Map<string, number>();
const activeCount = { n: 0 };
let lastGlobalSent = 0;
const schedulerState = { rrIndex: 0 };
const MAX_QUEUE_PER_THREAD = 50;

const t = (x: unknown): string => Object.prototype.toString.call(x).slice(8, -1);
const r = <T>(a: T[]): T => a[(Math.random() * a.length) | 0]!;
const rs = () => r(CONSTANTS.SOURCE);
const now = () => Date.now();
const esc = (s: string): string =>
  String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const trace = () => {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "#";
  for (let i = 0; i < 22; i++) out += c[(Math.random() * c.length) | 0];
  return out;
};
const toNum = (x: string | number): string | number => {
  const s = String(x);
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n)) return n;
  }
  return s;
};

const navigationTimestamp = (): number => Date.now() / 1000;
const formatNavigationTs = (ts: number): string => ts.toFixed(3);
const buildNavigationChain = (variant: "minimal" | "settings" | "default" | string) => {
  const nowTs = navigationTimestamp();
  const sessionId = 20000000 + Math.floor(Math.random() * 10000000);
  const safe = (ts: number): string => formatNavigationTs(Math.max(ts, 0));
  if (variant === "minimal") {
    const threadTs = nowTs - 0.01;
    return [
      `,thread_open:group,tap_conversation_thread,${safe(threadTs)},,,,,${safe(nowTs)}`,
      `MainActivity,tab_INBOX,foreground,${safe(threadTs - 0.12)},${sessionId},,,,,${safe(threadTs - 0.12)}`
    ].join(";");
  }
  if (variant === "settings") {
    const mainTs = nowTs;
    const settingsTs = mainTs - 0.65;
    const settingsSession = 80000000 + Math.floor(Math.random() * 20000000);
    return [
      `MainActivity,thread_open:group,,${safe(mainTs)},${sessionId},,,,,${safe(mainTs + 3)}`,
      `ThreadSettingsActivity,messenger_thread_settings,from_other_app,${safe(settingsTs)},${settingsSession},,,,,${safe(settingsTs + 0.5)}`
    ].join(";");
  }
  const keyboardTs = nowTs;
  const composerTs = keyboardTs - 0.02;
  const threadTs = keyboardTs - 0.05;
  const mainActivityTs = keyboardTs - 0.08;
  return [
    `,e2ee_keyboard_popup,,${safe(keyboardTs)},,,,,${safe(keyboardTs)}`,
    `,e2ee_swipeable_media_tray_popup,tap_composer_list_item,${safe(composerTs)},,,,,${safe(keyboardTs)}`,
    `,thread_open:group,tap_conversation_thread,${safe(threadTs)},,,,,${safe(threadTs)}`,
    `MainActivity,tab_INBOX,foreground,${safe(mainActivityTs)},${sessionId},,,,,${safe(mainActivityTs)}`
  ].join(";");
};

const mqttOk = (ctx: any): boolean => {
  try {
    const c = ctx && ctx.mqttClient;
    return !!(
      c &&
      c.connected &&
      ctx?.mqttReady === true &&
      !c.reconnecting &&
      !c.disconnecting &&
      !c.disconnected
    );
  } catch {
    return false;
  }
};

// Safe publish helper to prevent "write after end" errors
const safePublish = (mqttClient: any, topic: string, message: string | Buffer, options: any, callback?: (err?: Error) => void): boolean => {
  if (!mqttClient) {
    const err = new Error("MQTT client is not available");
    if (callback) callback(err);
    return false;
  }

  try {
    // Check if client is connected and not closing
    const isConnected = mqttClient.connected === true;
    const isDisconnecting = mqttClient.disconnecting === true;
    const isDisconnected = mqttClient.disconnected === true;
    const readyState = mqttClient.readyState;

    // WebSocket ready states: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
    const isClosing = readyState === 2;
    const isClosed = readyState === 3;

    if (!isConnected || isDisconnecting || isDisconnected || isClosing || isClosed) {
      const err = new Error("MQTT client is not connected or is closing");
      if (callback) callback(err);
      return false;
    }

    // Try to publish
    try {
      mqttClient.publish(topic, message, options, callback);
      return true;
    } catch (err: any) {
      // Handle "write after end" and other stream errors
      if (err.message && (err.message.includes("write after end") || err.message.includes("write after end"))) {
        const writeErr = new Error("MQTT stream is closed");
        if (callback) callback(writeErr);
        return false;
      }
      if (callback) callback(err);
      return false;
    }
  } catch (err: any) {
    if (callback) callback(err);
    return false;
  }
};

const isRetryable = (e: any): boolean =>
  !!e &&
  (e.retryable === true ||
    [
      "mqtt client is not healthy",
      "connection lost",
      "disconnected",
      "socket hang up",
      "econnreset",
      "econnrefused",
      "enotfound",
      "eai_again",
      "timeout"
    ].some(k => String(e.message || "").toLowerCase().includes(k)));

const isPermanent = (e: any): boolean => {
  if (e && e.permanent === false) return false;
  if (e && e.permanent === true) return true;
  return /(không gửi được|không thể gửi|thiếu quyền|permission|forbidden|not a participant|not member|blocked)/i.test(
    String((e && e.message) || "")
  );
};

const isBreaker = (e: any): boolean =>
  /(không gửi được|không thể gửi|thiếu quyền|permission)/i.test(
    String((e && e.message) || "")
  );

const markSuccess = (id: string | number): void => {
  consecutiveErrors.delete(String(id));
};

const suppressThread = (id: string | number, ms: number = CONFIG.BREAKER_COOLDOWN_MS): void => {
  suppressed.set(String(id), now() + Math.max(0, ms));
};

const clearQueue = (id: any, why?: string): void => {
  const k = String(id);
  const q = perThreadQueues.get(k);
  if (!q) return;
  while (q.length) {
    const item = q.shift();
    if (!item) break;
    try {
      item.reject(new Error(why || `cleared ${k}`));
    } catch { }
  }
  perThreadQueues.delete(k);
};

const markError = (id: string | number, e: any): void => {
  const k = String(id);
  const c = (consecutiveErrors.get(k) || 0) + 1;
  consecutiveErrors.set(k, c);
  if (isBreaker(e) && c >= CONFIG.BREAKER_THRESHOLD) {
    suppressThread(k);
    if (CONFIG.CLEAR_QUEUE_ON_BREAK) clearQueue(k, `suppressed ${k}`);
  }
};

const isSuppressed = (id: string | number): boolean => {
  const u = suppressed.get(String(id));
  if (!u) return false;
  if (now() >= u) {
    suppressed.delete(String(id));
    consecutiveErrors.delete(String(id));
    return false;
  }
  return true;
};

const calcTimeout = (hasAtt: boolean): number =>
  Math.min(
    CONFIG.TIMEOUT_MAX,
    Math.max(
      CONFIG.TIMEOUT_MIN,
      (CONFIG.TIMEOUT_BASE + (hasAtt ? 4000 : 0)) *
      (activeCount.n >= CONFIG.MAX_CONCURRENT_REQUESTS
        ? 1.15
        : activeCount.n >= CONFIG.MAX_CONCURRENT_REQUESTS / 2
          ? 1.05
          : 1)
    )
  );

const withRetry = async <T>(
  fn: (attempt: number) => Promise<T>,
  tries: number = CONFIG.RETRIES
): Promise<T> => {
  let last: unknown;
  for (let i = 0; i <= tries; i++) {
    try {
      return await fn(i);
    } catch (e) {
      if (isPermanent(e) || !isRetryable(e) || i === tries) throw e;
      last = e;
      const delay = Math.min(500 * Math.pow(CONFIG.RETRY_BACKOFF, i), 2000);
      await new Promise(r2 => setTimeout(r2, delay));
    }
  }
  throw last;
};

const normalizeEffect = (eff: any): { id: number; name: string } | null => {
  if (eff == null) return null;
  let name: string | null = null;
  let id: number | null = null;
  if (typeof eff === "string") {
    name = eff.toUpperCase();
    id = (EFFECTS as Record<string, number>)[name] || (Number.isFinite(+eff) ? +eff : null);
  } else if (typeof eff === "number") {
    id = eff | 0;
  } else {
    const n = eff.name || eff.style || eff.type;
    if (n) name = String(n).toUpperCase();
    if (eff.id != null) id = Number(eff.id);
    if (!id && name && (EFFECTS as Record<string, number>)[name]) {
      id = ((EFFECTS as Record<string, number>)[name] ?? null);
    }
  }
  if (!name && id === 1) name = "LOVE";
  if (!name && id === 2) name = "GIFTWRAP";
  if (!name && id === 3) name = "CELEBRATION";
  if (!name && id === 4) name = "FIRE";
  if (!name && id === 1000) name = "AVATAR_LOVE";
  if (!name && id === 1001) name = "AVATAR_ANGRY";
  if (!name && id === 1002) name = "AVATAR_LAUGH";
  if (!name && id === 1003) name = "AVATAR_CRY";
  if (!id && name && (EFFECTS as Record<string, number>)[name]) {
    id = ((EFFECTS as Record<string, number>)[name] ?? null);
  }
  return id && name ? { id, name } : null;
};

const mentionData = (
  text: string,
  arr: Array<{ id: string; tag: string }>
): { ids: string[]; offs: number[]; lens: number[] } | null => {
  const used = new Set<number>();
  const ids: string[] = [];
  const offs: number[] = [];
  const lens: number[] = [];
  for (const m of arr) {
    const tag = String(m.tag || "").trim();
    if (!tag) continue;
    const rx = new RegExp(esc(tag), "gi");
    let mt: RegExpExecArray | null;
    while ((mt = rx.exec(text)) !== null) {
      const pos = mt.index;
      if (used.has(pos)) continue;
      used.add(pos);
      ids.push(m.id);
      offs.push(pos);
      lens.push(mt[0].length);
      break;
    }
  }
  return ids.length ? { ids, offs, lens } : null;
};

const validate = (msg: any): any => {
  if (!msg || (typeof msg !== "string" && typeof msg !== "object"))
    throw new Error(`Message should be string or object, got ${t(msg)}`);
  if (typeof msg === "string") return { body: msg };
  const bad = Object.keys(msg).filter(k => !ALLOWED_PROPERTIES.has(k));
  if (bad.length) throw new Error(`Disallowed properties: ${bad.join(", ")}`);
  if (msg.location) {
    const { latitude, longitude } = msg.location;
    if (latitude == null || longitude == null)
      throw new Error("Location requires latitude and longitude");
    if (typeof latitude !== "number" || typeof longitude !== "number")
      throw new Error("Latitude/longitude must be numbers");
  }
  if (msg.mentions && typeof msg.mentions !== "string" && !Array.isArray(msg.mentions))
    throw new Error("Mentions must be 'tag_thread' or an array");
  if (Array.isArray(msg.mentions)) {
    msg.mentions.forEach((m: any, i: number) => {
      if (!m.id || !m.tag) throw new Error(`Mention ${i} missing id or tag`);
    });
  }
  return msg;
};

const buildPayload = (msg: any, threadID: any, replyTo: any): { payload: MessagePayload; otid: any } => {
  const otid = generateOfflineThreadingID();
  let baseSendType = CONSTANTS.SEND_TYPES.TEXT;
  if (msg.attachment) baseSendType = CONSTANTS.SEND_TYPES.ATTACHMENT;
  else if (msg.sticker) baseSendType = CONSTANTS.SEND_TYPES.STICKER;
  let text = typeof msg.body === "string" ? msg.body : null;
  const bodyIsLink = typeof msg.body === "string" && /^https?:\/\/\S+$/i.test(msg.body);
  const previewLink =
    typeof msg.url === "string" && msg.url ? msg.url : bodyIsLink ? msg.body : null;
  const wantPreview = !!previewLink;
  if (wantPreview) {
    text = text && text !== previewLink ? text + "\n" + previewLink : previewLink;
  }
  const eff = normalizeEffect(msg.effect);
  const isAvatarEffect = !!eff && /^AVATAR_/.test(eff.name);

  let meta: any;
  if (msg.sticker && !isAvatarEffect) {

    meta = {
      sticker: {

        sticker_pack_id: msg.stickerPackId ?? null,
        sticker_id: toNum(msg.sticker),
        is_unlockable: false,
        media_template_key_id: null
      }
    };
  } else if (msg.attachment && !msg.body && !isAvatarEffect && !wantPreview) {

    meta = {};
  } else if (isAvatarEffect) {
    meta = { power_up: { power_up_style: eff.name } };
  } else if (eff) {
    meta = {
      media_accessibility_metadata: { alt_text: null },
      power_up: { power_up_style: eff.name }
    };
  } else {
    meta = { media_accessibility_metadata: { alt_text: null } };
  }
  const baseDataclassParams = {
    logging_metadata: {
      content_model: null,
      feature_tags: ["IS_NOT_DIALTONE"]
    },
    send_instance_metadata: null,
    product_params: null
  };

  let dataclassParams: any = isAvatarEffect
    ? {
      ...baseDataclassParams,
      logging_metadata: {
        content_model: null,
        feature_tags: ["AVATAR", "POWER_UP", "AVATAR_STYLE_2", "IS_NOT_DIALTONE"]
      }
    }
    : { ...baseDataclassParams };
  const isReminder = msg.remind === true;
  const hotEmojiSize =
    msg.hotEmojiSize != null
      ? Number(msg.hotEmojiSize)
      : msg.emojiSize != null
        ? Number(msg.emojiSize)
        : undefined;
  const customNavigationChain =
    typeof msg.navigationChain === "string" && msg.navigationChain.trim()
      ? msg.navigationChain.trim()
      : null;
  const navigationChain =
    customNavigationChain ||
    buildNavigationChain(isReminder ? "settings" : hotEmojiSize != null ? "minimal" : "default");
  const replyType =
    msg.replyType != null && Number.isFinite(Number(msg.replyType))
      ? Number(msg.replyType)
      : isReminder
        ? 1
        : 0;
  const payloadSource =
    msg.source != null && Number.isFinite(Number(msg.source))
      ? Number(msg.source)
      : isReminder
        ? 0
        : rs();

  const computedMarkThreadRead =
    msg.markThreadRead != null ? msg.markThreadRead : 0;
  const payload: MessagePayload = {
    thread_id: toNum(threadID),
    otid,
    source: payloadSource,
    send_type: isAvatarEffect
      ? CONSTANTS.SEND_TYPES.AVATAR_POWERUP
      : wantPreview
        ? CONSTANTS.SEND_TYPES.TEXT

        : msg.attachment && !msg.body
          ? 9
          : baseSendType,
    sync_group: CONSTANTS.SYNC_GROUP,
    mark_thread_read: computedMarkThreadRead,
    text,
    initiating_source: 1,
    skip_url_preview_gen: wantPreview ? 0 : 1,
    text_has_links:
      wantPreview || (typeof text === "string" && /https?:\/\/\S+/i.test(text || "")) ? 1 : 0,
    multitab_env: 0,
    metadata_dataclass: JSON.stringify(meta),
    dataclass_params: "",
    navigation_chain: navigationChain,
    is_forwarded: msg.forwarded ? 1 : 0
  };

  // Meta AI mention tagging (matches observed payload: mention_types="ai", mention_ids="0")
  // This is independent of normal mentions ("tag_thread" / people mentions).
  if (msg.metaAI === true) {
    const prefix = typeof msg.metaAIPrefix === "string" && msg.metaAIPrefix.trim()
      ? msg.metaAIPrefix.trim()
      : "@Meta AI";
    if (typeof payload.text === "string") {
      if (!payload.text.startsWith(prefix)) {
        payload.text = `${prefix} ${payload.text}`.trim();
      }
      payload.mention_data = {
        mention_ids: "0",
        mention_offsets: "0",
        mention_lengths: String(prefix.length),
        mention_types: "ai"
      };
    }

    // Ensure product_extras has the correct typename for Meta AI assistant
    if (!dataclassParams.product_params) {
      dataclassParams.product_params = {
        product_extras: {
          __typename: "XMSGGenAIAssistantAPIExtras",
          ...(msg.productExtras || {})
        },
        product_type: null
      };
    } else if (dataclassParams.product_params && dataclassParams.product_params.product_extras) {
      dataclassParams.product_params.product_extras = {
        __typename: "XMSGGenAIAssistantAPIExtras",
        ...(dataclassParams.product_params.product_extras || {}),
        ...(msg.productExtras || {})
      };
    }
  }

  if (msg.magicWords && text && typeof text === "string") {
    try {
      const mw = msg.magicWords;

      const offsets: number[] = Array.isArray(mw.offsets) ? mw.offsets : [];
      const lengths: number[] = Array.isArray(mw.lengths) ? mw.lengths : [];
      const emojis: string[] = Array.isArray(mw.emojis) ? mw.emojis : [];
      if (offsets.length && offsets.length === lengths.length && offsets.length === emojis.length) {
        payload.magic_words_data = {
          magic_word_offsets: offsets.join(","),
          magic_word_lengths: lengths.join(",")
        };

        const metaObj: any = typeof meta === "object" ? { ...meta } : {};
        metaObj.word_effects = {
          magic_word_offsets: offsets,
          magic_word_lengths: lengths,
          magic_word_emojis: emojis
        };
        payload.metadata_dataclass = JSON.stringify(metaObj);

        dataclassParams.product_params = {
          product_extras: {
            __typename: "XMSGGenAIAssistantAPIExtras",
            ...(msg.productExtras || {})
          },
          product_type: null
        };
      }
    } catch {

    }
  }
  if (hotEmojiSize != null && Number.isFinite(hotEmojiSize)) {
    payload.hot_emoji_size = hotEmojiSize;
  }
  if (eff && eff.id) payload.power_up_style = eff.id;
  if (replyTo) {
    payload.reply_metadata = {
      reply_source_id: replyTo,
      reply_source_type: 1,
      reply_type: replyType,
      reply_source_attachment_id: null
    };
  }
  if (typeof msg.mentions === "string" && msg.mentions.toLowerCase() === "tag_thread") {

    const tagText = (text && typeof text === "string" && text.length) ? text : "@everyone";
    payload.text = tagText;

    payload.mention_data = {
      mention_ids: String(threadID),
      mention_offsets: "0",
      mention_lengths: String(tagText.length),
      mention_types: "t"
    };
  } else if (Array.isArray(msg.mentions) && typeof text === "string" && msg.mentions.length) {
    const md = mentionData(text, msg.mentions);
    if (md) {
      let shift = 0;
      if (md.offs[0] !== 0) {
        payload.text = "\u200E" + text;
        shift = 1;
      } else payload.text = text;
      payload.mention_data = {
        mention_ids: md.ids.join(","),
        mention_offsets: md.offs.map(o => o + shift).join(","),
        mention_lengths: md.lens.join(","),
        mention_types: Array(md.ids.length)
          .fill("p")
          .join(",")
      };
    }
  }
  if (msg.location) {
    payload.location_data = {
      coordinates: {
        latitude: msg.location.latitude,
        longitude: msg.location.longitude
      },
      is_current_location: msg.location.current ? 1 : 0,
      is_live_location: msg.location.live ? 1 : 0
    };
  }
  if (msg.sticker) payload.sticker_id = toNum(msg.sticker);
  let attachmentIds: (string | number)[] = [];
  if (msg.attachment) {
    const raw = msg.attachment;
    const arr = Array.isArray(raw) ? raw : [raw];
    if (arr.length > 0) {
      if (Array.isArray(arr[0]) && arr[0].length >= 2) {
        attachmentIds = arr.map((a: any) => a[1]).filter(Boolean);
      } else {
        attachmentIds = arr
          .map((a: any) =>
            a && typeof a === "object"
              ? a.fbid ||
              a.image_id ||
              a.video_id ||
              a.audio_id ||
              a.file_id ||
              a.gif_id
              : typeof a === "string" || typeof a === "number"
                ? a
                : null
          )
          .filter(Boolean) as (string | number)[];
      }
    }
  }
  if (isAvatarEffect && eff) {
    const defFbid = (AVATAR_DEFAULT_FBIDS as Record<string, string>)[eff.name];
    if (defFbid && attachmentIds.length === 0) attachmentIds.push(defFbid);
  }
  if (attachmentIds.length > 0) {
    payload.attachment_fbids = attachmentIds.map(toNum);
  }

  if (Array.isArray(msg.offlineAttachmentIds) && msg.offlineAttachmentIds.length) {
    payload.offline_attachment_ids = msg.offlineAttachmentIds.map(String);
  } else if (attachmentIds.length > 0) {

    payload.offline_attachment_ids = attachmentIds.map(() => String(generateOfflineThreadingID()));
  }

  payload.dataclass_params = JSON.stringify(dataclassParams);
  return { payload, otid };
};

const buildShareLinkPayload = (msg: any, threadID: any) => {
  const otid = generateOfflineThreadingID();
  return {
    otid,
    payload: {
      otid,
      source: 524289,
      sync_group: 1,
      send_type: 6,
      mark_thread_read: 0,
      url: typeof msg.url === "string" ? msg.url : "https://www.facebook.com/",
      text: typeof msg.body === "string" ? msg.body : "",
      thread_id: toNum(threadID),
      initiating_source: 0,
      multitab_env: 0,
      metadata_dataclass: "{}",
      dataclass_params: "{}",
      navigation_chain: "",
      is_forwarded: msg.forwarded ? 1 : 0,
      text_has_links: 0,
      skip_url_preview_gen: 1
    }
  };
};

const parseResponseStep = (step: any, sentOtid: any, threadID: any) => {
  let messageID: string | null = null;
  let responseThreadID: string | null = null;
  const walk = (x: any, d: number) => {
    if (d > 15 || x == null) return;
    if (Array.isArray(x)) {
      if (
        x.length >= 4 &&
        x[0] === 5 &&
        (x[1] === "replaceOptimisticMessage" || x[1] === "replaceOptimsiticMessage") &&
        typeof x[2] === "string" &&
        typeof x[3] === "string"
      ) {

        messageID = x[2];
      }
      if (
        x.length >= 4 &&
        x[0] === 5 &&
        x[1] === "writeCTAIdToThreadsTable" &&
        Array.isArray(x[2]) &&
        x[2].length === 2 &&
        x[2][0] === 19 &&
        typeof x[2][1] === "string"
      ) {
        if (!responseThreadID) responseThreadID = x[2][1];
      }
      for (const it of x) walk(it, d + 1);
    } else if (typeof x === "object") {
      for (const k in x) walk(x[k], d + 1);
    }
  };
  walk(step, 0);
  return {
    messageID: messageID || sentOtid,
    threadID: responseThreadID || String(threadID)
  };
};

const extractStepError = (step: any): ExtendedError | null => {
  let msg: string | null = null;
  let code: string | null = null;
  const walk = (x: any, d: number) => {
    if (d > 20 || x == null) return;
    if (Array.isArray(x)) {
      for (let i = 0; i < x.length; i++) {
        const v = x[i];
        if (v === "markOptimisticMessageFailed" && typeof x[i + 2] === "string") msg = x[i + 2];
        if (v === "updateSubscriptErrorMessage" && typeof x[i + 3] === "string")
          msg = x[i + 3];
        if (v === "Write error response from server") code = "SERVER_WRITE_ERROR";
        walk(v, d + 1);
      }
    } else if (typeof x === "object") {
      for (const k in x) walk(x[k], d + 1);
    }
  };
  walk(step, 0);
  if (msg || code) {
    const e: ExtendedError = new Error(msg || code || "STEP_ERROR");
    e.code = code || "STEP_ERROR";
    if (
      /Không gửi được|Không thể gửi|Thiếu quyền|permission|forbidden/i.test(
        String(msg || "")
      )
    )
      e.permanent = true;
    return e;
  }
  return null;
};

const publishOnce = (
  ctx: any,
  messagePayload: any,
  sentOtid: any,
  threadID: any,
  appId: string,
  versionId: string,
  callback: ((err: any, data?: any) => void) | null
) =>
  new Promise((resolve, reject) => {
    if (!mqttOk(ctx)) {
      const e: ExtendedError = new Error("MQTT client is not healthy");
      e.retryable = true;
      if (typeof ctx._triggerReconnect === "function") ctx._triggerReconnect();
      return reject(e);
    }
    const requestId = ctx.wsReqNumber = (ctx.wsReqNumber || 0) + 1;
    const taskId = ctx.wsTaskNumber = (ctx.wsTaskNumber || 0) + 1;
    const tasks = [
      {
        context: {
          trace_id: (Math.floor(Math.random() * 0xffffffff) | 0) - 0x7fffffff,
          trace_type: 0
        },
        data_trace_id: trace(),
        failure_count: null,
        label: "46",
        payload: JSON.stringify(messagePayload),
        queue_name: String(threadID),
        task_id: String(taskId)
      }
    ];
    const content = {
      app_id: appId,
      payload: JSON.stringify({
        epoch_id: generateOfflineThreadingID(),
        tasks,
        version_id: versionId,
        data_trace_id: trace()
      }),
      request_id: requestId,
      type: 3
    };
    const hasAtt =
      Array.isArray(messagePayload.attachment_fbids) &&
      messagePayload.attachment_fbids.length > 0;
    const timeoutMs = calcTimeout(hasAtt);
    let to: NodeJS.Timeout | null = null;
    let messageHandler: ((topic: string, message: Buffer) => void) | null = null;
    let fallbackMid: string | null = null;

    const onMessage = (topic: string, message: Buffer) => {
      if (topic !== "/ls_resp") return;
      try {
        let json;
        try {
          json = JSON.parse(message.toString("utf8"));
        } catch {
          return;
        }
        const reqId = json.request_id;
        if (reqId == null || String(reqId) !== String(requestId)) return;
        const payload = json.payload;
        if (typeof payload === "string" && payload.length > 0) {

          const midMatch = payload.match(/mid\.\$[A-Za-z0-9._-]+/);
          if (midMatch && midMatch[0]) {
            fallbackMid = midMatch[0];
          }
          const firstChar = payload.trim()[0];
          if (firstChar === "{" || firstChar === "[") {
            try {
              json.payload = JSON.parse(payload);
            } catch { }
          }
        }
        if (to) {
          clearTimeout(to);
          to = null;
        }
        if (messageHandler) {
          ctx.mqttClient && ctx.mqttClient.removeListener("message", messageHandler);
          messageHandler = null;
        }
        const step = json.payload && json.payload.step;
        if (step) {
          const err = extractStepError(step);
          if (err) {
            const error = err as ExtendedError;
            if (hasAtt && error.code === "SERVER_WRITE_ERROR") {
              error.permanent = false;
              error.retryable = true;
            }
            if (error.code === "SERVER_WRITE_ERROR" && error.permanent) {
              error.permanent = false;
              error.retryable = true;
            }
            markError(threadID, error);
            return reject(error);
          }
          const parsed = parseResponseStep(step, sentOtid, threadID);
          const body = {
            body: messagePayload.text || null,
            messageID: parsed.messageID,
            threadID: String(threadID)
          };
          markSuccess(threadID);
          if (callback) callback(null, body);
          return resolve(body);
        }
        const body = {
          body: messagePayload.text || null,
          messageID: fallbackMid || sentOtid,
          threadID: String(threadID)
        };
        markSuccess(threadID);
        if (callback) callback(null, body);
        return resolve(body);
      } catch (e) {
        if (to) {
          clearTimeout(to);
          to = null;
        }
        if (messageHandler) {
          ctx.mqttClient && ctx.mqttClient.removeListener("message", messageHandler);
          messageHandler = null;
        }
        markError(threadID, e);
        try {
          reject(e);
        } catch { }
      }
    };
    messageHandler = (topic: string, message: Buffer) => {
      try {
        onMessage(topic, message);
      } catch (error) {
        if (to) {
          clearTimeout(to);
          to = null;
        }
        if (messageHandler) {
          ctx.mqttClient && ctx.mqttClient.removeListener("message", messageHandler);
        }
        markError(threadID, error);
        try {
          reject(error);
        } catch { }
      }
    };
    to = setTimeout(() => {
      to = null;
      if (messageHandler) {
        ctx.mqttClient && ctx.mqttClient.removeListener("message", messageHandler);
      }
      const e: ExtendedError = new Error(
        `Message send timeout after ${Math.round(timeoutMs / 1000)}s (thread ${threadID})`
      );
      e.retryable = true;
      markError(threadID, e);
      reject(e);
    }, timeoutMs);
    to && to.unref && to.unref();
    ctx.mqttClient && ctx.mqttClient.on("message", messageHandler);

    // Use safe publish to prevent "write after end" errors
    if (!safePublish(
      ctx.mqttClient,
      CONSTANTS.MQTT_TOPIC,
      JSON.stringify(content),
      { qos: CONSTANTS.MQTT_QOS, retain: false },
      (err: any) => {
        if (err) {
          if (to) {
            clearTimeout(to);
            to = null;
          }
          if (messageHandler) {
            ctx.mqttClient && ctx.mqttClient.removeListener("message", messageHandler);
          }
          err.retryable = true;
          markError(threadID, err);
          try {
            reject(err);
          } catch { }
        }
      }
    )) {
      // If publish failed, clean up and reject
      if (to) {
        clearTimeout(to);
        to = null;
      }
      if (messageHandler) {
        ctx.mqttClient && ctx.mqttClient.removeListener("message", messageHandler);
      }
      const e: ExtendedError = new Error("Failed to publish message: MQTT client not ready");
      e.retryable = true;
      markError(threadID, e);
      reject(e);
    }
  });

const publish = async (ctx: any, messagePayload: any, threadID: any, sentOtid: any, callback: ((err: any, data?: any) => void) | null) => {
  let appId: string = r(SEND.APP_ID_POOL);
  let versionId: string = SEND.VERSION_POOL[0]!;
  try {
    return await publishOnce(ctx, messagePayload, sentOtid, threadID, appId, versionId, callback);
  } catch (e1) {
    const error = e1 as ExtendedError;
    if (error && error.code === "SERVER_WRITE_ERROR" && error.permanent) {
      error.permanent = false;
      error.retryable = true;
    }
    if (
      (isPermanent(error) && (!error || error.code !== "SERVER_WRITE_ERROR")) ||
      !/(SERVER_WRITE_ERROR|STEP_ERROR|Không gửi được|Không thể gửi tin nhắn|Thiếu quyền)/i.test(
        String((error && error.message) || "")
      )
    )
      throw error;
    try {
      appId =
        SEND.APP_ID_POOL[(SEND.APP_ID_POOL.indexOf(appId) + 1) % SEND.APP_ID_POOL.length]!;
      versionId =
        SEND.VERSION_POOL[(SEND.VERSION_POOL.indexOf(versionId) + 1) % SEND.VERSION_POOL.length]!;
      return await publishOnce(
        ctx,
        messagePayload,
        sentOtid,
        threadID,
        appId,
        versionId,
        callback
      );
    } catch {
      throw e1;
    }
  }
};

const isIdObj = (a: any): boolean =>
  !!a &&
  typeof a === "object" &&
  (a.fbid || a.image_id || a.video_id || a.audio_id || a.file_id || a.gif_id);

const isIdPair = (a: any): boolean =>
  Array.isArray(a) && a.length >= 2 && (typeof a[1] === "string" || Number.isFinite(a[1]));

const isIdString = (a: any): boolean => typeof a === "string" && /^\d{5,}$/.test(a);
const isIdNumber = (a: any): boolean => typeof a === "number" && Number.isFinite(a);

const toPairs = (list: any[]): any[] =>
  (list || []).map(att => {
    if (isIdPair(att)) return [att[0], att[1]];
    if (isIdObj(att))
      return [
        "id",
        att.fbid ||
        att.image_id ||
        att.video_id ||
        att.audio_id ||
        att.file_id ||
        att.gif_id
      ];
    if (isIdString(att) || isIdNumber(att)) return ["id", att];
    return att;
  });

const extractUploadId = (r2: any) =>
  r2 &&
  (r2.mediaId ||
    r2.media_id ||
    r2.audio_id ||
    r2.image_id ||
    r2.video_id ||
    r2.gif_id ||
    r2.file_id ||
    r2.uploadId ||
    r2.upload_id);

const uploadAttachment = async (
  defaultFuncs: DefaultFuncs,
  ctx: Context,
  inputs: unknown,
  ruploader: ((inputs: unknown) => Promise<unknown[]>) | undefined
): Promise<(string | number)[]> => {
  const arr = Array.isArray(inputs) ? inputs : [inputs];
  if (!arr.length) return [];
  let uploadFb2Error: unknown = null;
  let uploadFbError: unknown = null;

  // Try uploadFb2 (Business upload) first
  try {
    const uploadFb2 = uploadFb2Factory(defaultFuncs, undefined, ctx);
    const result = await uploadFb2(arr, { mode: "parallel", concurrency: 3 });

    if (result && result.ids && Array.isArray(result.ids) && result.ids.length > 0) {
      const ids = result.ids
        .map((r) => {
          if (!r) return null;
          return (
            r.fbid ||
            r.image_id ||
            r.video_id ||
            r.audio_id ||
            r.file_id ||
            r.gif_id ||
            r.id ||
            r.upload_id
          );
        })
        .filter(Boolean) as (string | number)[];

      if (ids.length > 0) {
        return ids;
      }
    }
  } catch (err) {
    uploadFb2Error = err;
    log.warn(`uploadAttachment (uploadFb2 failed): ${(err as Error)?.message || err}`);
    // uploadFb2 failed, will try uploadFb next
  }

  // Try uploadFb second (www upload)
  try {
    const uploadFb = uploadFbFactory(
      defaultFuncs,
      ruploader ? { ruploadAttachment: ruploader } : undefined,
      ctx
    );
    const result = await uploadFb(arr, { mode: "parallel", concurrency: 3 });

    if (result && result.ids && Array.isArray(result.ids) && result.ids.length > 0) {
      // Extract IDs from uploadFb result
      const ids = result.ids
        .map((r) => {
          if (!r) return null;
          return (
            r.fbid ||
            r.image_id ||
            r.video_id ||
            r.audio_id ||
            r.file_id ||
            r.gif_id ||
            r.id ||
            r.upload_id
          );
        })
        .filter(Boolean) as (string | number)[];

      if (ids.length > 0) {
        return ids;
      }
    }
  } catch (err) {
    uploadFbError = err;
    // uploadFb failed, will try ruploadAttachment as fallback
    log.warn(`uploadAttachment (uploadFb failed): ${(err as Error)?.message || err}`);
  }

  // Fallback to ruploadAttachment if uploadFb failed or returned no IDs
  if (ruploader && typeof ruploader === "function") {
    try {
      const reason =
        uploadFbError
          ? ` (reason: ${String((uploadFbError as any)?.code || "")} ${(uploadFbError as any)?.message || uploadFbError})`
          : uploadFb2Error
            ? ` (reason: ${String((uploadFb2Error as any)?.code || "")} ${(uploadFb2Error as any)?.message || uploadFb2Error})`
            : " (reason: uploadFb returned no IDs)";
      log.warn(`[sendMessage/uploadAttachment] fallback -> ruploadAttachment${reason}`);

      // Wrap files into task format that ruploadAttachment expects
      const tasks = arr.map((src: any) => ({
        source: src,
      }));

      const rres = await ruploader(tasks);
      if (Array.isArray(rres) && rres.length > 0) {
        const ids = rres.map(extractUploadId).filter(Boolean) as (string | number)[];
        if (ids.length > 0) {
          log.info(`[sendMessage/uploadAttachment] ruploadAttachment success ${ids.length}/${arr.length} item(s)`);
          return ids;
        } else {
          log.warn(`[sendMessage/uploadAttachment] ruploadAttachment returned ${rres.length} results but no valid IDs extracted. Results: ${JSON.stringify(rres.map((r: any) => ({ type: r?.type, uploadId: r?.uploadId, mediaId: r?.mediaId })))}`);
        }
      } else {
        log.warn(`[sendMessage/uploadAttachment] ruploadAttachment returned empty or invalid result: ${JSON.stringify(rres)}`);
      }
    } catch (e2) {
      // Both uploadFb and ruploadAttachment failed
      const error = e2 as Error;
      log.error(`uploadAttachment (both methods failed): ${error?.message || e2}`);
      if (error.stack) {
        log.error(`[sendMessage/uploadAttachment] Error stack: ${error.stack}`);
      }
      throw new Error(
        `Upload failed: uploadFb2/uploadFb and ruploadAttachment both failed. Last error: ${error?.message || e2}`
      );
    }
  }

  throw new Error("Upload failed: uploadFb2/uploadFb returned no IDs and ruploadAttachment is not available");
};

const ensureQ = (id: any): QueueItem[] => {
  const k = String(id);
  if (!perThreadQueues.has(k)) perThreadQueues.set(k, []);
  return perThreadQueues.get(k)!;
};

const enqueue = (ctx: any, threadID: any, fn: () => Promise<any>): Promise<any> => {
  const q = ensureQ(threadID);
  if (q.length >= MAX_QUEUE_PER_THREAD) q.shift();
  return new Promise((resolve, reject) => {
    q.push({ fn, resolve, reject });
    process.nextTick(() => runNext(ctx));
  });

};

const runNext = (ctx: any) => {
  if (activeCount.n >= CONFIG.MAX_CONCURRENT_REQUESTS) return;
  const activeQueues: [string, QueueItem[]][] = [];
  for (const [tid, q] of perThreadQueues.entries()) {
    if (q.length > 0 && !isSuppressed(tid)) activeQueues.push([tid, q]);
  }
  if (!activeQueues.length) return;
  schedulerState.rrIndex %= activeQueues.length;
  const nowTs = now();
  const available = CONFIG.MAX_CONCURRENT_REQUESTS - activeCount.n;
  const maxToProcess = Math.min(available, activeQueues.length);
  let started = 0;
  for (let offset = 0; offset < activeQueues.length && started < maxToProcess; offset++) {
    const index = (schedulerState.rrIndex + offset) % activeQueues.length;
    const pair = activeQueues[index];
    if (!pair) continue;
    const [tid, q] = pair;
    const lastT = perThreadLastSent.get(tid) || 0;
    if (nowTs - lastGlobalSent < CONFIG.GLOBAL_MIN_GAP_MS && started === 0) continue;
    if (nowTs - lastT < CONFIG.PER_THREAD_MIN_GAP_MS) continue;
    const item = q.shift();
    if (!item) continue;
    activeCount.n++;
    started++;
    const ts = now();
    perThreadLastSent.set(tid, ts);
    lastGlobalSent = ts;
    (async () => {
      try {
        const res = await item.fn();
        item.resolve(res);
      } catch (e) {
        item.reject(e);
      } finally {
        activeCount.n--;
        process.nextTick(() => runNext(ctx));
      }
    })();
  }
  if (started > 0) {
    schedulerState.rrIndex = (schedulerState.rrIndex + started) % activeQueues.length;
    if (activeCount.n < CONFIG.MAX_CONCURRENT_REQUESTS) {
      let hasMore = false;
      for (const [, q] of activeQueues) {
        if (q.length > 0) {
          hasMore = true;
          break;
        }
      }
      if (hasMore) process.nextTick(() => runNext(ctx));
    }
  }
};

const startCleanupTimer = (ctx: any): void => {
  if (ctx.__queueCleanupTimer) return;
  const MAX_QUEUES = 150;
  const MAX_LAST_SENT = 150;
  const MAX_SUPPRESSED = 80;
  const MAX_ERRORS = 80;
  ctx.__queueCleanupTimer = setInterval(() => {
    const nowTs = now();
    const maxAge = 15 * 60 * 1000;
    for (const [tid, q] of perThreadQueues.entries()) {
      if (!q.length) perThreadQueues.delete(tid);
    }
    if (perThreadQueues.size > MAX_QUEUES) {
      const extra = perThreadQueues.size - MAX_QUEUES;
      const keys = Array.from(perThreadQueues.keys());
      for (let i = 0; i < extra; i++) {
        const key = keys[i];
        if (key != null) perThreadQueues.delete(key);
      }
    }
    for (const [tid, ts] of perThreadLastSent.entries()) {
      if (nowTs - ts > maxAge) perThreadLastSent.delete(tid);
    }
    if (perThreadLastSent.size > MAX_LAST_SENT) {
      const extra = perThreadLastSent.size - MAX_LAST_SENT;
      const entries = Array.from(perThreadLastSent.entries()).sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < extra; i++) {
        const entry = entries[i];
        if (entry) perThreadLastSent.delete(entry[0]);
      }
    }
    for (const [tid, until] of suppressed.entries()) {
      if (nowTs >= until) {
        suppressed.delete(tid);
        consecutiveErrors.delete(tid);
      }
    }
    if (suppressed.size > MAX_SUPPRESSED) {
      const extra = suppressed.size - MAX_SUPPRESSED;
      const entries = Array.from(suppressed.entries()).sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < extra; i++) {
        const entry = entries[i];
        if (!entry) continue;
        const tid = entry[0];
        suppressed.delete(tid);
        consecutiveErrors.delete(tid);
      }
    }
    for (const [tid] of consecutiveErrors.entries()) {
      if (!suppressed.has(tid) && !perThreadQueues.has(tid) && !perThreadLastSent.has(tid)) {
        consecutiveErrors.delete(tid);
      }
    }
    if (consecutiveErrors.size > MAX_ERRORS) {
      const extra = consecutiveErrors.size - MAX_ERRORS;
      const keys = Array.from(consecutiveErrors.keys());
      for (let i = 0; i < extra; i++) {
        const tid = keys[i];
        if (tid != null && !suppressed.has(tid) && !perThreadQueues.has(tid)) {
          consecutiveErrors.delete(tid);
        }
      }
    }
  }, 60000);
  ctx.__queueCleanupTimer.unref && ctx.__queueCleanupTimer.unref();

  // Đăng ký cleanup timer
  const cleanupManager = getCleanupManager();
  cleanupManager.registerTimer("send-message-cleanup-timer", ctx.__queueCleanupTimer, 3);
};

export default function (_def: any, client: any, ctx: any) {
  startCleanupTimer(ctx);
  const sendMessage = async function (
    msg: any,
    threadID: any,
    callbackOrOptions?: any,
    replyToMessage?: any,
    options: any = {}
  ): Promise<any> {
    let callback: ((err: any, data?: any) => void) | null = null;
    try {
      if (typeof callbackOrOptions === "object" && callbackOrOptions !== null) {
        options = callbackOrOptions;
      } else if (typeof callbackOrOptions === "function") {
        callback = callbackOrOptions as (err: any, data?: any) => void;
      } else if (typeof callbackOrOptions === "string") {
        replyToMessage = callbackOrOptions;
      }
      if (typeof replyToMessage === "object" && replyToMessage !== null) {
        options = replyToMessage;
        replyToMessage = undefined;
      }
    } catch (e) {
      const error = e as Error;
      throw new Error(`Invalid arguments provided: ${error.message}`);
    }
    if (Array.isArray(threadID)) {
      return Promise.all(
        threadID.map((id: any): Promise<any> =>
          sendMessage(msg, String(id), callbackOrOptions, replyToMessage, options)
        )
      );
    }
    let resolveFn!: (value: any) => void;
    let rejectFn!: (error: any) => void;
    const ret = new Promise((res, rej) => {
      resolveFn = res;
      rejectFn = rej;
    });
    const job = async () => {
      try {
        if (
          !callback &&
          (t(threadID) === "Function" || t(threadID) === "AsyncFunction")
        ) {
          const e = new Error("Pass a threadID as a second argument.");
          (threadID as any)(e);
          throw e;
        }
        if (!callback) {
          callback = (err: any, data?: any) => {
            if (err) return rejectFn(err);
            resolveFn(data);
          };
        }
        const tidType = t(threadID);
        if (!["Array", "Number", "String"].includes(tidType))
          throw new Error(
            `ThreadID should be number, string, or array, got ${tidType}`
          );
        if (replyToMessage && t(replyToMessage) !== "String")
          throw new Error(`MessageID should be string, got ${t(replyToMessage)}`);
        if (isSuppressed(threadID)) throw new Error(`Thread ${threadID} suppressed`);
        msg = validate(msg);
        const sMsg = msg;
        const isReminder = sMsg.remind === true;
        if (isReminder && !replyToMessage) {
          throw new Error("Reminder messages require a replyTo message ID");
        }
        if (sMsg.shareLink === true) {
          const { payload, otid } = buildShareLinkPayload(sMsg, threadID);
          const result = await withRetry(() =>
            publishOnce(ctx, payload, otid, threadID, SHARE.APP_ID, SHARE.VERSION, callback)
          );
          markSuccess(threadID);
          return result;
        }
        if (sMsg.attachment) {
          const attachments = sMsg.attachment;
          const arr = Array.isArray(attachments) ? attachments : [attachments];
          const keep: any[] = [];
          const up: any[] = [];
          for (const a of arr) {
            if (isIdPair(a) || isIdObj(a) || isIdString(a) || isIdNumber(a)) keep.push(a);
            else up.push(a);
          }


          let uploadedIds: (string | number)[] | any[] = [];
          if (up.length > 0 && sMsg.sendHD && typeof client.ruploadAttachment === "function") {
            const ruploader: any = client.ruploadAttachment;
            try {
              const tasks = up.map((src: any) => ({
                source: src,
                isHd: true,
                to: threadID
              }));
              const results: any[] = await ruploader(tasks);
              const hdObjs: any[] = [];
              for (const r of results || []) {
                const id = r && (r.mediaId ?? r.uploadId);
                if (!id) continue;
                switch (r.type) {
                  case "image":
                  case "gif":
                    hdObjs.push({ image_id: id });
                    break;
                  case "video":
                    hdObjs.push({ video_id: id });
                    break;
                  case "audio":
                    hdObjs.push({ audio_id: id });
                    break;
                  default:
                    hdObjs.push(id);
                }
              }
              uploadedIds = hdObjs;
            } catch (e) {

              const ruploader = client.ruploadAttachment;
              const uploaded = await uploadAttachment(_def, ctx, up, ruploader);
              uploadedIds = Array.isArray(uploaded) ? uploaded : [];
            }
          } else if (up.length > 0) {
            const ruploader = client.ruploadAttachment;
            const uploaded = await uploadAttachment(_def, ctx, up, ruploader);
            uploadedIds = Array.isArray(uploaded) ? uploaded : [];
          }

          sMsg.attachment = toPairs(keep).concat(toPairs(uploadedIds as any[]));
        }
        const { payload, otid } = buildPayload(
          sMsg,
          threadID,
          replyToMessage || null
        );
        const result = await withRetry(() =>
          publish(ctx, payload, threadID, otid, callback)
        );
        markSuccess(threadID);
        return result;
      } catch (e) {
        markError(threadID, e);
        if (callback) callback(e);
        throw e;
      }
    };
    try {
      const p = enqueue(ctx, threadID, job);
      p.catch(err => {
        if (callback) callback(err);
        rejectFn(err);
      });
      return ret;
    } catch (qe) {
      if (callback) callback(qe);
      return Promise.reject(qe);
    }
  };
  return sendMessage;
};
