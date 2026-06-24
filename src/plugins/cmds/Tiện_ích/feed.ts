import type { Command, CommandOnCallContext } from "@types";
import { v4 as uuidv4 } from 'uuid';
import { parseGraphql } from "../../../utils";
interface RawNewsFeedEdge {
  cursor?: string;
  node?: any;
}

interface SimpleFeedPost {
  id: string;
  postId?: string;
  actorName?: string;
  message?: string;
  link?: string;
}

interface FetchFeedResult {
  edges: RawNewsFeedEdge[];
  nextCursor?: string;
}

const HOME_FEED_INITIAL_VARS = {
  RELAY_INCREMENTAL_DELIVERY: true,
  connectionClass: "GOOD",
  feedbackSource: 1,
  feedInitialFetchSize: 2,
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

const HOME_FEED_PAGINATION_BASE_VARS = {
  RELAY_INCREMENTAL_DELIVERY: true,
  clientQueryId: uuidv4(),
  clientSession: null,
  connectionClass: "GOOD",
  count: 5,
  cursor: "",
  experimentalValues: null,
  feedLocation: "NEWSFEED",
  feedStyle: "MOST_RECENT_FEED_DEFAULT",
  feedbackSource: 1,
  focusCommentID: null,
  orderby: ["MOST_RECENT"],
  privacySelectorRenderLocation: "COMET_STREAM",
  recentVPVs: [],
  refreshMode: "COLD_START",
  renderLocation: "homepage_stream",
  scale: 1,
  useDefaultActor: false,
  shouldChangeBRSLabelFieldName: true,
  shouldChangeSponsoredAuctionDistanceFieldName: false,
  shouldChangeSponsoredDataFieldName: true,
  shouldObfuscateCategoryField: true,
  shouldUseBRSLabelFieldNameV1: true,
  shouldUseBRSLabelFieldNameV2: false,
  shouldUseSponsoredAuctionLabelFieldNameV1: false,
  shouldUseSponsoredAuctionLabelFieldNameV2: false,
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

function extractNewsFeed(parsed: any): any | null {
  const items = Array.isArray(parsed) ? parsed : [parsed];
  for (const item of items) {
    const nf = item?.data?.viewer?.news_feed;
    if (!nf) continue;
    if (Array.isArray(nf.edges) && nf.edges.length > 0) return nf;
    if (!Array.isArray(nf.edges)) return nf;
  }
  return null;
}

function logDebugFeed(raw: any, label: string): void {
  try {
    const maxLen = 3000;
    const text = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
    console.warn(`[feed] ${label}:`, text.length > maxLen ? text.slice(0, maxLen) + " ...trimmed..." : text);
  } catch {
    console.warn(`[feed] ${label} (stringify failed)`);
  }
}

async function fetchHomeFeedInitial(client: any): Promise<FetchFeedResult> {
  const form = {
    av: client.getCurrentUserID ? client.getCurrentUserID() : undefined,
    fb_api_req_friendly_name: "CometModernHomeFeedQuery",
    fb_api_caller_class: "RelayModern",
    doc_id: "25193541597015170",
    server_timestamps: true,
    variables: JSON.stringify(HOME_FEED_INITIAL_VARS)
  };
  const src = await client.httpPost("https://www.facebook.com/api/graphql/", form);
  const parsed = parseGraphql<any>(src) as any;
  const newsFeed = extractNewsFeed(parsed);

  if (!newsFeed) {
    throw new Error("Không tìm thấy dữ liệu news_feed trong phản hồi.");
  }

  const edges: RawNewsFeedEdge[] = Array.isArray(newsFeed.edges) ? newsFeed.edges : [];
  const nextCursor: string | undefined =
    newsFeed?.page_info?.end_cursor || (edges.length > 0 ? edges[edges.length - 1].cursor : undefined);

  return { edges, nextCursor };
}

async function fetchHomeFeedMore(client: any, cursor: string, count = 5): Promise<FetchFeedResult> {
  const vars = {
    ...HOME_FEED_PAGINATION_BASE_VARS,
    cursor,
    count
  };

  const form = {
    av: client.getCurrentUserID ? client.getCurrentUserID() : undefined,
    fb_api_req_friendly_name: "CometNewsFeedPaginationQuery",
    fb_api_caller_class: "RelayModern",
    doc_id: "25863287303254876",
    server_timestamps: true,
    variables: JSON.stringify(vars)
  };

  const src = await client.httpPost("https://www.facebook.com/api/graphql/", form);
  const parsed = parseGraphql<any>(src) as any;
  const newsFeed = extractNewsFeed(parsed);

  if (!newsFeed) {
    logDebugFeed(parsed, "pagination-missing-news_feed");
    throw new Error("Không tìm thấy dữ liệu news_feed khi tải thêm.");
  }

  const edges: RawNewsFeedEdge[] = Array.isArray(newsFeed.edges) ? newsFeed.edges : [];
  const nextCursor: string | undefined =
    newsFeed?.page_info?.end_cursor || (edges.length > 0 ? edges[edges.length - 1].cursor : undefined);

  return { edges, nextCursor };
}

function mapEdgesToPosts(edges: RawNewsFeedEdge[]): SimpleFeedPost[] {
  const posts: SimpleFeedPost[] = [];

  for (const edge of edges) {
    const node = edge.node;
    if (!node) continue;

    const id: string = node.id || node.__id || "";
    if (!id) continue;

    const postId: string | undefined = node.post_id || node.story_id;

    const actor =
      (Array.isArray(node.actors) && node.actors[0]) ||
      node.feedback?.owning_profile ||
      node.feedback?.associated_group;
    const actorName: string | undefined = actor?.name;

    const message: string | undefined =
      node.message?.text ||
      node.comet_sections?.content?.story?.message?.text ||
      node.comet_sections?.content?.story?.message_container?.story?.message?.text;

    const link: string | undefined =
      node.wwwURL ||
      node.permalink_url ||
      node.url ||
      node.comet_sections?.content?.story?.url;

    posts.push({
      id,
      postId,
      actorName,
      message,
      link
    });
  }

  return posts;
}

const fbFeedCommand: Command = {
  name: "feed",
  alias: [],
  version: "1.0.0",
  role: 3,
  desc: "Lấy bài đăng từ bảng News Feed Facebook (tài khoản bot)",
  guide:
    "{pn} feed - Lấy các bài đăng mới nhất từ News Feed\n" +
    "{pn} feed more <cursor> - Tải thêm bài đăng (dùng cursor trả về ở lần trước)",
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { client, args, reply } = ctx;

    try {
      if (!client || typeof client.httpPost !== "function") {
        await reply("❌ Không tìm thấy client Facebook hợp lệ (thiếu httpPost)");
        return;
      }

      const mode = (args[0] || "").toLowerCase();
      let result: FetchFeedResult;

      if (mode === "more") {
        const cursor = args[1];
        if (!cursor) {
          await reply("❌ Vui lòng cung cấp cursor: feed more <cursor>");
          return;
        }
        await reply("⏳ Đang tải thêm bài đăng từ News Feed...");
        result = await fetchHomeFeedMore(client, cursor);
      } else {
        await reply("⏳ Đang tải bài đăng News Feed lần đầu...");
        result = await fetchHomeFeedInitial(client);
      }

      const posts = mapEdgesToPosts(result.edges);

      if (!posts.length) {
        await reply("❌ Không lấy được bài đăng nào từ News Feed.");
        return;
      }

      let body = "📄 DANH SÁCH BÀI ĐĂNG TỪ NEWS FEED\n\n";

      posts.forEach((p, index) => {
        body += `${index + 1}. ${p.actorName || "Không rõ"}\n`;
        if (p.message) {
          const text = p.message.length > 250 ? p.message.slice(0, 247) + "..." : p.message;
          body += `   Nội dung: ${text}\n`;
        }
        if (p.link) {
          body += `   Link: ${p.link}\n`;
        } else if (p.postId) {
          body += `   Post ID: ${p.postId}\n`;
        }
        body += "\n";
      });

      if (result.nextCursor) {
        body += "──────────────\n";
        body += "Cursor tiếp theo (dùng để load thêm):\n";
        body += result.nextCursor + "\n\n";
        body += "Dùng lệnh: feed more <cursor> để tải thêm bài.";
      }

      await reply(body.trim());
    } catch (e: any) {
      console.error(e);
      await reply({
        body: `❌ Lỗi khi lấy News Feed: ${e?.message || "Lỗi không xác định"}`
      });
    }
  }
};

export default fbFeedCommand;
