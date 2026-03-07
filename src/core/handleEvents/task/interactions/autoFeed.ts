import fs from "fs-extra";
import got from "got";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import type { FacebookClient } from "../../../../types/client";
import { parseGraphql } from "../../../../utils";
import { getConfig } from "../../../configManager";
import type { Logger } from "../types";
import { slp } from "../utils";
import { get } from "../../../../API/request/index";
import { getFrom } from "../../../../API/utils/htmlParser";

type ReactionName = "LIKE" | "LOVE" | "CARE" | "HAHA" | "WOW" | "SAD" | "ANGRY";

interface AutoInteractFeedTaskConfig {
  enabled?: boolean;
  type?: string;
  chunk?: number;
  hours?: number;
  time?: string;

  /** Random delay before starting a run (ms) */
  preRunJitterMsMax?: number;
  /** Random "reading/viewing" delay before reacting to a selected post (ms) */
  viewDelayMsMin?: number;
  viewDelayMsMax?: number;

  /** Probability to interact with a candidate (0..1). Lower = skip more like human */
  interactProbability?: number;

  /** Require post to have meaningful text content */
  requireText?: boolean;
  /** Minimum text length if requireText is on */
  minTextLength?: number;
  /** Skip posts that are basically link-only / share-only */
  skipLinkOnly?: boolean;
  /** Skip if missing actor name */
  skipIfActorMissing?: boolean;

  /** Số post tối đa sẽ tương tác trong 1 lần chạy */
  maxPerRun?: number;
  /** Số item sẽ đọc từ feed để lọc (không nên quá lớn) */
  fetchLimit?: number;

  /** Reaction muốn dùng */
  reaction?: ReactionName;

  /** Bật auto comment sau khi react */
  enableComment?: boolean;
  /** Comment tối đa mỗi lần chạy */
  maxCommentsPerRun?: number;
  /** Tỷ lệ comment sau khi react (0..1) */
  commentProbability?: number;
  /** Template comment (random 1 cái) */
  commentTemplates?: string[];
  /** Delay "gõ comment" trước khi gửi (ms) */
  commentDelayMsMin?: number;
  commentDelayMsMax?: number;

  /** Delay giữa các lần tương tác */
  minDelayMs?: number;
  maxDelayMs?: number;

  /** Filter theo keyword trong nội dung */
  includeKeywords?: string[];
  excludeKeywords?: string[];
}

interface FeedCandidate {
  id: string;
  storyId?: string;
  feedbackId?: string;
  actorName?: string;
  message?: string;
  link?: string;
}

type PersistState = {
  version: number;
  seen: Array<{ id: string; at: number; action: string }>;
  stats?: {
    totalReacted?: number;
    totalCommented?: number;
    totalErrors?: number;
    totalProcessed?: number;
    totalSkipped?: number;
    lastRun?: {
      at: number;
      durationMs: number;
      processed: number;
      reacted: number;
      commented?: number;
      skipped: number;
      errors: number;
    };
  };
};

const STATE_PATH = path.join(process.cwd(), "src/storage/auto_interact/feed_state.json");

const HOME_FEED_INITIAL_VARS = {
  RELAY_INCREMENTAL_DELIVERY: true,
  connectionClass: "GOOD",
  feedbackSource: 1,
  feedInitialFetchSize: 4,
  feedLocation: "NEWSFEED",
  feedStyle: "MOST_RECENT_FEED_DEFAULT",
  orderby: ["MOST_RECENT"],
  privacySelectorRenderLocation: "COMET_STREAM",
  recentVPVs: [] as any[],
  refreshMode: "COLD_START",
  renderLocation: "homepage_stream",
  scale: 1,
  useDefaultActor: false,
  shouldChangeBRSLabelFieldName: true,
  shouldObfuscateCategoryField: true,
  shouldUseBRSLabelFieldNameV1: true,
  shouldUseBRSLabelFieldNameV2: false,
  __relay_internal__pv__GHLShouldChangeSponsoredAuctionDistanceFieldNamerelayprovider: false,
  __relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV1relayprovider: false,
  __relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV2relayprovider: false,
  __relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider: true,
  __relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider: true,
  __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
  __relay_internal__pv__IsWorkUserrelayprovider: false,
  __relay_internal__pv__TestPilotShouldIncludeDemoAdUseCaserelayprovider: false,
  __relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider: true,
  __relay_internal__pv__FeedDeepDiveTopicPillThreadViewEnabledrelayprovider: false,
  __relay_internal__pv__FBReels_enable_view_dubbed_audio_type_gkrelayprovider: true,
  __relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider: false,
  __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false,
  __relay_internal__pv__IsMergQAPollsrelayprovider: false,
  __relay_internal__pv__FBReels_enable_meta_ai_label_gkrelayprovider: true,
  __relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider: true,
  __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
  __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: true,
  __relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider: false,
  __relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider: true,
  __relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider: true,
  __relay_internal__pv__GroupsCometGYSJFeedItemHeightrelayprovider: 206,
  __relay_internal__pv__StoriesShouldIncludeFbNotesrelayprovider: false
};

const FEED_QUERY = {
  doc_id: "25193541597015170",
  friendly_name: "CometModernHomeFeedQuery",
};

const UFI_REACT_MUTATION = {
  doc_id: "24198888476452283",
  friendly_name: "CometUFIFeedbackReactMutation",
};

const UFI_CREATE_COMMENT_MUTATION = {
  doc_id: "24615176934823390",
  friendly_name: "useCometUFICreateCommentMutation",
};

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function randInt(min: number, max: number): number {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return Math.floor(a + Math.random() * (b - a + 1));
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function pickText(node: any): string {
  return (
    node?.message?.text ||
    node?.comet_sections?.content?.story?.message?.text ||
    node?.comet_sections?.content?.story?.message_container?.story?.message?.text ||
    ""
  );
}

function extractFeedbackId(node: any): string | undefined {
  const fb =
    node?.feedback?.id ||
    node?.comet_sections?.feedback?.story?.feedback?.id ||
    node?.comet_sections?.feedback?.story?.story_ufi_container?.story?.feedback?.id ||
    node?.comet_sections?.feedback?.story?.story?.feedback?.id;
  return typeof fb === "string" && fb.trim() ? fb : undefined;
}

function extractStoryId(node: any): string | undefined {
  const sid = node?.post_id || node?.story_id || node?.id || node?.__id;
  return typeof sid === "string" && sid.trim() ? sid : undefined;
}

function extractLink(node: any): string | undefined {
  const link =
    node?.wwwURL ||
    node?.permalink_url ||
    node?.url ||
    node?.comet_sections?.content?.story?.url;
  return typeof link === "string" && link.trim() ? link : undefined;
}

function normalizeKeywords(a: unknown): string[] {
  if (!Array.isArray(a)) return [];
  return a
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0)
    .slice(0, 100);
}

function matchKeywords(text: string, include: string[], exclude: string[]): boolean {
  const t = (text || "").toLowerCase();
  if (exclude.length && exclude.some((k) => t.includes(k.toLowerCase()))) return false;
  if (!include.length) return true;
  return include.some((k) => t.includes(k.toLowerCase()));
}

function isMostlyLinkOnly(text: string, link?: string): boolean {
  const t = (text || "").trim();
  if (!link) return false;
  if (!t) return true;
  // If text is extremely short and there's a link, treat as link-only/share
  if (t.length <= 8) return true;
  return false;
}

// NOTE: User requested to NOT use https://www.facebook.com/ufi/reaction/
// so we no longer use UFI "reaction_type" flow at all.

function reactionToGraphqlReactionId(reaction: ReactionName): string {
  // IDs from your snippet
  const map: Record<ReactionName, string> = {
    LIKE: "1635855486666999",
    LOVE: "1678524932434102",
    CARE: "613557422527858",
    HAHA: "115940658764963",
    WOW: "478547315650144",
    SAD: "908563459236466",
    ANGRY: "444813342392137",
  };
  return map[reaction] || map.LIKE;
}

function toBase64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

function normalizeFeedbackId(input: string): string {
  const s = String(input || "").trim();
  if (!s) return s;
  // If already looks like base64 (common for feedback IDs), keep it.
  if (/^[A-Za-z0-9+/=]+$/.test(s) && s.length >= 16) return s;
  // If raw id provided, encode `feedback:<id>`
  if (/^\d+$/.test(s)) return toBase64(`feedback:${s}`);
  // If "feedback:xxxx" is provided, encode it.
  if (s.startsWith("feedback:")) return toBase64(s);
  return s;
}

function pickRandomComment(templates: unknown): string | null {
  const arr = Array.isArray(templates) ? templates : [];
  const cleaned = arr
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0)
    .slice(0, 50);
  if (!cleaned.length) return null;
  const pick = cleaned[Math.floor(Math.random() * cleaned.length)] || "";
  const out = String(pick).trim();
  if (!out) return null;
  return out.length > 500 ? out.slice(0, 500) : out;
}

function setActorIdCookie(cookie: string, actorId: string): string {
  if (!cookie || !actorId) return cookie;
  if (/c_user=\d+/.test(cookie)) {
    return cookie.replace(/c_user=\d+/g, `c_user=${actorId}`);
  }
  // if missing c_user, append
  const sep = cookie.trim().endsWith(";") ? "" : "; ";
  return `${cookie}${sep}c_user=${actorId};`;
}

function toFormData(
  data: Record<string, string | number | boolean | null | undefined>
): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    sp.set(k, String(v));
  }
  return sp;
}

async function readState(): Promise<PersistState> {
  try {
    const st = (await fs.readJson(STATE_PATH).catch(() => null)) as PersistState | null;
    if (!st || !Array.isArray(st.seen)) return { version: 1, seen: [], stats: {} };
    return {
      version: 1,
      seen: st.seen.filter((x) => x && typeof x.id === "string"),
      stats: st.stats && typeof st.stats === "object" ? st.stats : {},
    };
  } catch {
    return { version: 1, seen: [], stats: {} };
  }
}

async function writeState(state: PersistState): Promise<void> {
  await fs.ensureDir(path.dirname(STATE_PATH));
  await fs.writeJson(STATE_PATH, state, { spaces: 2 });
}

function pruneState(state: PersistState): PersistState {
  const nowMs = Date.now();
  const keepMs = 30 * 24 * 60 * 60 * 1000;
  const seen = state.seen
    .filter((x) => x && typeof x.at === "number" && nowMs - x.at < keepMs)
    .slice(-2500);
  return { version: 1, seen, stats: state.stats || {} };
}

async function getTokensFromClient(
  client: FacebookClient
): Promise<{ fb_dtsg: string; jazoest: string; lsd: string }> {
  const ctxAny = (client as any)?.ctx as
    | { fb_dtsg?: string; jazoest?: string; lsd?: string; jar?: any; options?: any }
    | undefined;

  // Try to get from context first
  if (ctxAny?.fb_dtsg && ctxAny?.jazoest && ctxAny?.lsd) {
    return {
      fb_dtsg: ctxAny.fb_dtsg,
      jazoest: ctxAny.jazoest,
      lsd: ctxAny.lsd,
    };
  }

  // Fetch from Facebook homepage if not in context
  if (!ctxAny?.jar) {
    throw new Error("missing jar on client.ctx");
  }

  const html = await get("https://www.facebook.com/", ctxAny.jar, undefined, ctxAny.options, ctxAny, undefined).then(
    (res) => (typeof res.data === "string" ? res.data : String(res.data || ""))
  );

  const fb_dtsg =
    getFrom(html, '"DTSGInitData",[],{"token":"', '",') ||
    html.match(/name="fb_dtsg"\s+value="([^"]+)"/)?.[1] ||
    "";

  const jazoest =
    getFrom(html, 'name="jazoest" value="', '"') ||
    getFrom(html, "jazoest=", '",') ||
    html.match(/name="jazoest"\s+value="([^"]+)"/)?.[1] ||
    "";

  const lsd = getFrom(html, '["LSD",[],{"token":"', '"}') || html.match(/name="lsd"\s+value="([^"]+)"/)?.[1] || "";

  if (!fb_dtsg || !jazoest || !lsd) {
    throw new Error("Could not extract required tokens from Facebook");
  }

  // Update context with extracted tokens
  if (ctxAny) {
    ctxAny.fb_dtsg = fb_dtsg;
    ctxAny.jazoest = jazoest;
    ctxAny.lsd = lsd;
  }

  return { fb_dtsg, jazoest, lsd };
}

async function reactViaGraphql(
  client: FacebookClient,
  feedbackIdRaw: string,
  reaction: ReactionName
): Promise<{ ok: boolean; raw?: string; error?: string }> {
  // Implemented to match user's snippet: POST /api/graphql/ with URLSearchParams + headers.
  try {
    const actorId = client.getCurrentUserID ? client.getCurrentUserID() : "";
    if (!actorId) return { ok: false, error: "missing actorId" };

    const cfg = getConfig() as any;
    const cookieRaw = typeof cfg?.cookie === "string" ? cfg.cookie : "";
    if (!cookieRaw) return { ok: false, error: "missing config.cookie" };

    // Get tokens from context or fetch from Facebook
    let tokens: { fb_dtsg: string; jazoest: string; lsd: string };
    try {
      tokens = await getTokensFromClient(client);
    } catch (e: any) {
      return { ok: false, error: `failed to get tokens: ${e?.message || String(e)}` };
    }

    const { fb_dtsg: fbDtsg, jazoest, lsd } = tokens;

    const idReac = reactionToGraphqlReactionId(reaction);
    const feedbackId = normalizeFeedbackId(feedbackIdRaw);
    if (!feedbackId) return { ok: false, error: "missing feedbackId" };

    const timestamp = Date.now();
    const attributionId = `CometHomeRoot.react,comet.home,logo,${timestamp},993139,4748854339,,`;

    const cookie = setActorIdCookie(cookieRaw, actorId);
    const userAgent =
      (typeof cfg?.userAgent === "string" && cfg.userAgent.trim()) ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';

    const headers: Record<string, string> = {
      authority: "www.facebook.com",
      accept: "*/*",
      "accept-encoding": "gzip, deflate, br",
      "accept-language": "vi,en-US;q=0.9,en;q=0.8",
      "content-type": "application/x-www-form-urlencoded",
      cookie,
      origin: "https://www.facebook.com",
      priority: "u=1, i",
      referer: "https://www.facebook.com/",
      "sec-ch-prefers-color-scheme": "dark",
      "sec-ch-ua": '"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
      "sec-ch-ua-full-version-list":
        '"Microsoft Edge";v="143.0.3650.80", "Chromium";v="143.0.7499.110", "Not A(Brand";v="24.0.0.0"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-model": '""',
      "sec-ch-ua-platform": '"Windows"',
      "sec-ch-ua-platform-version": '"19.0.0"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": userAgent,
      "x-asbd-id": "359341",
      "x-fb-friendly-name": UFI_REACT_MUTATION.friendly_name,
      "x-fb-lsd": lsd,
    };

    const data: Record<string, string | number | boolean | null | undefined> = {
      av: actorId,
      fb_dtsg: fbDtsg,
      jazoest,
      lsd,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: UFI_REACT_MUTATION.friendly_name,
      variables: JSON.stringify({
        input: {
          attribution_id_v2: attributionId,
          feedback_id: feedbackId,
          feedback_reaction_id: idReac,
          feedback_source: "NEWS_FEED",
          feedback_referrer: "/",
          is_tracking_encrypted: true,
          tracking: [],
          session_id: uuidv4(),
          actor_id: actorId,
          client_mutation_id: "2",
        },
        useDefaultActor: false,
        __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
      }),
      server_timestamps: "true",
      doc_id: UFI_REACT_MUTATION.doc_id,
    };

    const res = await got.post("https://www.facebook.com/api/graphql/", {
      body: toFormData(data).toString(),
      headers,
      throwHttpErrors: false,
      timeout: { request: 30_000 },
    });

    const parsed = parseGraphql<any>(res.body);
    const payload = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!payload || payload?.errors || payload?.error) return { ok: false, raw: res.body, error: "payload.errors" };

    const reactedId =
      payload?.data?.feedback_react?.feedback?.viewer_feedback_reaction_info?.id;
    if (reactedId) return { ok: true, raw: res.body };
    return { ok: false, raw: res.body, error: "no viewer_feedback_reaction_info.id" };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function createCommentViaGraphql(
  client: FacebookClient,
  feedbackIdRaw: string,
  commentText: string
): Promise<{ ok: boolean; raw?: string; error?: string; commentId?: string }> {
  try {
    const actorId = client.getCurrentUserID ? client.getCurrentUserID() : "";
    if (!actorId) return { ok: false, error: "missing actorId" };

    const cfg = getConfig() as any;
    const cookieRaw = typeof cfg?.cookie === "string" ? cfg.cookie : "";
    if (!cookieRaw) return { ok: false, error: "missing config.cookie" };

    // Get tokens from context or fetch from Facebook
    let tokens: { fb_dtsg: string; jazoest: string; lsd: string };
    try {
      tokens = await getTokensFromClient(client);
    } catch (e: any) {
      return { ok: false, error: `failed to get tokens: ${e?.message || String(e)}` };
    }

    const { fb_dtsg: fbDtsg, jazoest, lsd } = tokens;

    const feedbackId = normalizeFeedbackId(feedbackIdRaw);
    if (!feedbackId) return { ok: false, error: "missing feedbackId" };

    const text = String(commentText || "").trim();
    if (!text) return { ok: false, error: "empty comment" };

    const timestamp = Date.now();
    const attributionId = `CometHomeRoot.react,comet.home,via_cold_start,${timestamp},510626,4748854339,,`;

    const cookie = setActorIdCookie(cookieRaw, actorId);
    const userAgent =
      (typeof cfg?.userAgent === "string" && cfg.userAgent.trim()) ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';

    const headers: Record<string, string> = {
      authority: "www.facebook.com",
      accept: "*/*",
      "accept-encoding": "gzip, deflate, br",
      "accept-language": "vi,en-US;q=0.9,en;q=0.8",
      "content-type": "application/x-www-form-urlencoded",
      cookie,
      origin: "https://www.facebook.com",
      priority: "u=1, i",
      referer: "https://www.facebook.com/",
      "sec-ch-prefers-color-scheme": "dark",
      "sec-ch-ua": '"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
      "sec-ch-ua-full-version-list":
        '"Microsoft Edge";v="143.0.3650.80", "Chromium";v="143.0.7499.110", "Not A(Brand";v="24.0.0.0"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-model": '""',
      "sec-ch-ua-platform": '"Windows"',
      "sec-ch-ua-platform-version": '"19.0.0"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": userAgent,
      "x-asbd-id": "359341",
      "x-fb-friendly-name": UFI_CREATE_COMMENT_MUTATION.friendly_name,
      "x-fb-lsd": lsd,
    };

    const variables = {
      feedLocation: "DEDICATED_COMMENTING_SURFACE",
      feedbackSource: 110,
      groupID: null,
      input: {
        client_mutation_id: "1",
        actor_id: actorId,
        attachments: null,
        feedback_id: feedbackId,
        formatting_style: null,
        message: { ranges: [], text },
      },
      attribution_id_v2: attributionId,
      vod_video_timestamp: null,
      is_tracking_encrypted: true,
      tracking: [],
      feedback_source: "DEDICATED_COMMENTING_SURFACE",
      idempotence_token: `client:${uuidv4()}`,
      session_id: uuidv4(),
      inviteShortLinkKey: null,
      renderLocation: null,
      scale: 1,
      useDefaultActor: false,
      focusCommentID: null,
      __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
      __relay_internal__pv__IsWorkUserrelayprovider: false,
    };

    const data: Record<string, string | number | boolean | null | undefined> = {
      av: actorId,
      fb_dtsg: fbDtsg,
      jazoest,
      lsd,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: UFI_CREATE_COMMENT_MUTATION.friendly_name,
      variables: JSON.stringify(variables),
      server_timestamps: "true",
      doc_id: UFI_CREATE_COMMENT_MUTATION.doc_id,
    };

    const res = await got.post("https://www.facebook.com/api/graphql/", {
      body: toFormData(data).toString(),
      headers,
      throwHttpErrors: false,
      timeout: { request: 30_000 },
    });

    const parsed = parseGraphql<any>(res.body);
    const payload = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!payload || payload?.errors || payload?.error) return { ok: false, raw: res.body, error: "payload.errors" };

    const cid =
      payload?.data?.comment_create?.feedback_comment_edge?.node?.id ||
      payload?.data?.comment_create?.feedback_comment_edge?.node?.legacy_fbid;
    if (cid) return { ok: true, raw: res.body, commentId: String(cid) };
    return { ok: false, raw: res.body, error: "no comment id" };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function fetchFeedCandidates(client: FacebookClient, fetchLimit: number): Promise<FeedCandidate[]> {
  const form = {
    av: client.getCurrentUserID ? client.getCurrentUserID() : undefined,
    fb_api_req_friendly_name: FEED_QUERY.friendly_name,
    fb_api_caller_class: "RelayModern",
    doc_id: FEED_QUERY.doc_id,
    server_timestamps: true,
    variables: JSON.stringify({
      ...HOME_FEED_INITIAL_VARS,
      feedInitialFetchSize: clamp(fetchLimit, 1, 25),
    }),
  };

  const src = await client.httpPost("https://www.facebook.com/api/graphql/", form);
  const parsed = parseGraphql<any>(src);
  const items = Array.isArray(parsed) ? parsed : [parsed];

  let edges: any[] = [];
  for (const it of items) {
    const nf = it?.data?.viewer?.news_feed;
    if (nf?.edges && Array.isArray(nf.edges)) {
      edges = nf.edges;
      break;
    }
  }

  const out: FeedCandidate[] = [];
  for (const e of edges) {
    const node = e?.node;
    if (!node) continue;
    const id = String(node.id || node.__id || "").trim();
    if (!id) continue;

    const actor =
      (Array.isArray(node.actors) && node.actors[0]) ||
      node.feedback?.owning_profile ||
      node.feedback?.associated_group;

    const candidate: FeedCandidate = {
      id,
      storyId: extractStoryId(node),
      feedbackId: extractFeedbackId(node),
      actorName: typeof actor?.name === "string" ? actor.name : undefined,
      message: pickText(node) || undefined,
      link: extractLink(node),
    };
    out.push(candidate);
  }

  return out;
}

export async function autoInteractFeed(
  client: FacebookClient,
  logger?: Logger
): Promise<{ processed: number; reacted: number; skipped: number; errors: number }> {
  const startAt = Date.now();
  const cfg = getConfig() as any;
  const tcfg: AutoInteractFeedTaskConfig = (cfg?.scheduler?.tasks?.autoInteractFeed || {}) as any;

  const preRunJitterMsMax = clamp(Number(tcfg.preRunJitterMsMax ?? 90_000), 0, 15 * 60_000);
  const viewDelayMsMin = clamp(Number(tcfg.viewDelayMsMin ?? 900), 0, 60_000);
  const viewDelayMsMax = clamp(Number(tcfg.viewDelayMsMax ?? 4200), viewDelayMsMin, 120_000);

  const interactProbability = clamp01(Number(tcfg.interactProbability ?? 0.35));
  const requireText = tcfg.requireText !== undefined ? !!tcfg.requireText : true;
  const minTextLength = clamp(Number(tcfg.minTextLength ?? 12), 0, 500);
  const skipLinkOnly = tcfg.skipLinkOnly !== undefined ? !!tcfg.skipLinkOnly : true;
  const skipIfActorMissing = tcfg.skipIfActorMissing !== undefined ? !!tcfg.skipIfActorMissing : true;

  const maxPerRun = clamp(Number(tcfg.maxPerRun ?? 3), 0, 20);
  const enableComment = !!tcfg.enableComment;
  const maxCommentsPerRun = clamp(Number(tcfg.maxCommentsPerRun ?? 1), 0, 10);
  const commentProbability = clamp01(Number(tcfg.commentProbability ?? 0.15));
  const commentDelayMsMin = clamp(Number(tcfg.commentDelayMsMin ?? 1500), 0, 60_000);
  const commentDelayMsMax = clamp(Number(tcfg.commentDelayMsMax ?? 5500), commentDelayMsMin, 120_000);
  const commentTemplates = tcfg.commentTemplates;

  const fetchLimit = clamp(Number(tcfg.fetchLimit ?? 8), 1, 25);
  const reaction: ReactionName = (String(tcfg.reaction || "LIKE").toUpperCase() as ReactionName) || "LIKE";
  const minDelayMs = clamp(Number(tcfg.minDelayMs ?? 2500), 0, 60_000);
  const maxDelayMs = clamp(Number(tcfg.maxDelayMs ?? 6000), minDelayMs, 120_000);
  const include = normalizeKeywords(tcfg.includeKeywords);
  const exclude = normalizeKeywords(tcfg.excludeKeywords);

  if (maxPerRun <= 0) {
    logger?.info?.("[autoInteractFeed] maxPerRun=0 -> skip");
    return { processed: 0, reacted: 0, skipped: 0, errors: 0 };
  }

  logger?.info?.(
    `[autoInteractFeed] start | reaction=${reaction} | maxPerRun=${maxPerRun} | fetchLimit=${fetchLimit} | p=${interactProbability}`
  );

  if (preRunJitterMsMax > 0) {
    const jitter = randInt(0, preRunJitterMsMax);
    if (jitter > 0) {
      logger?.info?.(`[autoInteractFeed] pre-run jitter: ${jitter}ms`);
      await slp(jitter);
    }
  }

  const state = pruneState(await readState());
  const seen = new Set(state.seen.map((x) => x.id));

  let processed = 0;
  let reacted = 0;
  let commented = 0;
  let skipped = 0;
  let errors = 0;

  let candidates: FeedCandidate[] = [];
  try {
    candidates = await fetchFeedCandidates(client, fetchLimit);
  } catch (e: any) {
    logger?.error?.(`[autoInteractFeed] fetch feed failed: ${e?.message || e}`);
    return { processed: 0, reacted: 0, skipped: 0, errors: 1 };
  }
  logger?.info?.(`[autoInteractFeed] fetched candidates: ${candidates.length}`);

  for (const c of candidates) {
    if (reacted >= maxPerRun) break;
    processed++;

    // ONLY use GraphQL mutation => MUST have feedbackId; otherwise skip.
    const stableId = c.feedbackId || c.id;
    if (!c.feedbackId) {
      skipped++;
      continue;
    }

    if (seen.has(stableId)) {
      skipped++;
      continue;
    }

    if (skipIfActorMissing && !c.actorName) {
      skipped++;
      continue;
    }

    const text = c.message || "";
    const cleaned = text.trim();

    if (requireText) {
      if (!cleaned) {
        skipped++;
        continue;
      }
      if (minTextLength > 0 && cleaned.length < minTextLength) {
        skipped++;
        continue;
      }
    }

    if (skipLinkOnly && isMostlyLinkOnly(cleaned, c.link)) {
      skipped++;
      continue;
    }

    if (!matchKeywords(text, include, exclude)) {
      skipped++;
      continue;
    }

    // Human-like: skip most candidates
    if (interactProbability < 1 && Math.random() > interactProbability) {
      skipped++;
      continue;
    }

    // Human-like: "view/read" delay before interacting
    const viewDelay = randInt(viewDelayMsMin, viewDelayMsMax);
    if (viewDelay > 0) await slp(viewDelay);

    // ONLY use GraphQL mutation (CometUFIFeedbackReactMutation).
    const r = await reactViaGraphql(client, c.feedbackId, reaction);

    if (!r.ok) {
      errors++;
      logger?.warn?.(`[autoInteractFeed] react failed (${stableId}): ${r.error || "unknown"}`);
      if (errors >= 3) break;
      continue;
    }

    reacted++;
    seen.add(stableId);
    state.seen.push({ id: stableId, at: Date.now(), action: `REACT:${reaction}` });
    logger?.info?.(`[autoInteractFeed] reacted ${reaction} -> ${c.actorName || "unknown"} | ${c.link || stableId}`);

    // Optional: auto comment after successful react
    if (
      enableComment &&
      commented < maxCommentsPerRun &&
      commentProbability > 0 &&
      Math.random() <= commentProbability
    ) {
      const commentText = pickRandomComment(commentTemplates);
      if (commentText) {
        const cdelay = randInt(commentDelayMsMin, commentDelayMsMax);
        if (cdelay > 0) await slp(cdelay);

        const cr = await createCommentViaGraphql(client, c.feedbackId, commentText);
        if (cr.ok) {
          commented++;
          state.seen.push({ id: stableId, at: Date.now(), action: `COMMENT:${commentText}` });
          logger?.info?.(`[autoInteractFeed] commented -> ${commentText}`);
        } else {
          errors++;
          logger?.warn?.(`[autoInteractFeed] comment failed (${stableId}): ${cr.error || "unknown"}`);
        }
      }
    }

    const delay = Math.floor(minDelayMs + Math.random() * Math.max(0, maxDelayMs - minDelayMs));
    if (delay > 0) await slp(delay);
  }

  const durationMs = Date.now() - startAt;
  state.stats = state.stats || {};
  state.stats.totalProcessed = Number(state.stats.totalProcessed || 0) + processed;
  state.stats.totalSkipped = Number(state.stats.totalSkipped || 0) + skipped;
  state.stats.totalReacted = Number(state.stats.totalReacted || 0) + reacted;
  state.stats.totalCommented = Number(state.stats.totalCommented || 0) + commented;
  state.stats.totalErrors = Number(state.stats.totalErrors || 0) + errors;
  state.stats.lastRun = {
    at: Date.now(),
    durationMs,
    processed,
    reacted,
    commented,
    skipped,
    errors,
  };

  await writeState(pruneState(state)).catch(() => { });
  logger?.info?.(
    `[autoInteractFeed] done | reacted=${reacted}/${processed} | commented=${commented} | skipped=${skipped} | errors=${errors} | duration=${durationMs}ms`
  );

  return { processed, reacted, skipped, errors };
}
