import axios, { AxiosInstance } from "axios";

class XAPI {
  private cookies: Record<string, string>;
  private defaultHeaders: Record<string, string>;
  private client: AxiosInstance;

  constructor(cookieStr: string) {
    this.cookies = Object.fromEntries(cookieStr.split("; ").map(cookie => cookie.split("="))) as Record<string, string>;
    this.defaultHeaders = {
      authority: "x.com",
      method: "GET",
      scheme: "https",
      accept: "*/*",
      "accept-encoding": "gzip, deflate, br, zstd",
      "accept-language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
      authorization: "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
      "content-type": "application/json",
      referer: "https://x.com/",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-client-language": "en",
      "sec-ch-ua": "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-client-transaction-id": "QEUSAO1U0WblVAycwlbCJiIdSvD35/CvVC+LO+mKvMSvOGJcjro8lZKzyxAOB+1e6pTNl0NliXjbr5x4bSYOOv5o+WcIQw",
      "x-client-uuid": "029e1c51-d800-4260-98d1-a80dc350256d"
    };
    this.client = axios.create({
      baseURL: "https://x.com"
    });
  }

  async getGuestToken(): Promise<string | null> {
    try {
      const { data } = await axios.post(
        "https://api.twitter.com/1.1/guest/activate.json",
        {},
        {
          headers: {
            authorization: this.defaultHeaders.authorization,
            "user-agent": this.defaultHeaders["user-agent"],
            "content-type": this.defaultHeaders["content-type"]
          }
        }
      );
      return data.guest_token as string;
    } catch (e: any) {
      console.error("Failed to fetch guest token:", e.message);
      return null;
    }
  }

  genUUID(): string {
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
    return `${s4() + s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
  }

  getCookieString(): string {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  async getUserID(username: string): Promise<any> {
    try {
      const guestToken = await this.getGuestToken();
      if (!guestToken) throw new Error("No guest token retrieved");
      const headers = {
        ...this.defaultHeaders,
        "x-csrf-token": this.cookies.ct0,
        "x-guest-token": guestToken,
        cookie: this.getCookieString()
      };
      const response = await this.client.get("/i/api/graphql/-0XdHI-mrHWBQd8-oLo1aA/ProfileSpotlightsQuery", {
        params: {
          variables: JSON.stringify({ screen_name: username })
        },
        headers
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to get user ID: ${error.message}`);
    }
  }

  async getTimeline(id: string): Promise<string> {
    const guestToken = await this.getGuestToken();
    if (!guestToken) throw new Error("No guest token retrieved");
    const headers = {
      ...this.defaultHeaders,
      "x-csrf-token": this.cookies.ct0,
      "x-guest-token": guestToken,
      cookie: this.getCookieString()
    };
    try {
      const response = await this.client.get("/i/api/graphql/AO0wqcj9R80t7LZapf7LaA/ExplorePage", {
        params: {
          variables: '{"cursor":""}',
          features:
            '{"profile_label_improvements_pcf_label_in_post_enabled":true,"rweb_tipjar_consumption_enabled":true,"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"creator_subscriptions_tweet_preview_api_enabled":true,"premium_content_api_read_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"responsive_web_grok_analyze_button_fetch_trends_enabled":false,"responsive_web_grok_analyze_post_followups_enabled":true,"responsive_web_jetfuel_frame":false,"responsive_web_grok_share_attachment_enabled":true,"articles_preview_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,"tweet_awards_web_tipping_enabled":false,"creator_subscriptions_quote_tweet_preview_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"rweb_video_timestamps_enabled":true,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":true,"responsive_web_grok_image_annotation_enabled":false,"responsive_web_enhance_cards_enabled":false}'
        },
        headers
      });
      const timeline = response.data.data.explore_page.body.timelines.find((item: any) => item.id === id);
      if (timeline) {
        return timeline.timeline.id;
      } else {
        return "";
      }
    } catch (error) {
      console.error("Error:", error);
      return "";
    }
  }

  async down(url: string): Promise<any> {
    const guestToken = await this.getGuestToken();
    if (!guestToken) throw new Error("No guest token retrieved");
    const headers = {
      ...this.defaultHeaders,
      "x-csrf-token": this.cookies.ct0,
      "x-guest-token": guestToken,
      cookie: this.getCookieString()
    };
    try {
      const isValidUrl = (u: string) => /https?:\/\/(www\.)?(x\.com|twitter\.com)\/\w+\/status\/\d+/i.test(u);
      const rejectError = (msg: string) => Promise.reject(new Error(msg));
      if (!isValidUrl(url)) return rejectError("Invalid URL: " + url);
      const idMatch = url.match(/\/(\d+)/);
      if (!idMatch) return rejectError("Error getting Twitter ID. Ensure your URL is correct.");
      const tweetId = idMatch[1];
      function formatNumber(number: number): string | null {
        if (isNaN(number)) {
          return null;
        }
        return number.toLocaleString("de-DE");
      }
      function removeLinks(title: string | undefined | null): string {
        if (typeof title !== "string") {
          return "";
        }
        const cleanedTitle = title.replace(/https?:\/\/t\.co\/[a-zA-Z0-9]+/g, "");
        return cleanedTitle.trim();
      }
      const response = await this.client.get("/i/api/graphql/jSqDD18MkxfdFfMd6Cmk6A/TweetDetail", {
        params: {
          variables: JSON.stringify({
            focalTweetId: tweetId,
            with_rux_injections: false,
            rankingMode: "Relevance",
            includePromotedContent: true,
            withCommunity: true,
            withQuickPromoteEligibilityTweetFields: true,
            withBirdwatchNotes: true,
            withVoice: true
          }),
          features: JSON.stringify({
            profile_label_improvements_pcf_label_in_post_enabled: true,
            rweb_tipjar_consumption_enabled: true,
            responsive_web_graphql_exclude_directive_enabled: true,
            verified_phone_label_enabled: false,
            creator_subscriptions_tweet_preview_api_enabled: true,
            responsive_web_graphql_timeline_navigation_enabled: true,
            responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
            premium_content_api_read_enabled: false,
            communities_web_enable_tweet_community_results_fetch: true,
            c9s_tweet_anatomy_moderator_badge_enabled: true,
            responsive_web_grok_analyze_button_fetch_trends_enabled: false,
            responsive_web_grok_analyze_post_followups_enabled: true,
            responsive_web_jetfuel_frame: false,
            responsive_web_grok_share_attachment_enabled: true,
            articles_preview_enabled: true,
            responsive_web_edit_tweet_api_enabled: true,
            graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
            view_counts_everywhere_api_enabled: true,
            longform_notetweets_consumption_enabled: true,
            responsive_web_twitter_article_tweet_consumption_enabled: true,
            tweet_awards_web_tipping_enabled: false,
            creator_subscriptions_quote_tweet_preview_enabled: false,
            freedom_of_speech_not_reach_fetch_enabled: true,
            standardized_nudges_misinfo: true,
            tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
            rweb_video_timestamps_enabled: true,
            longform_notetweets_rich_text_read_enabled: true,
            longform_notetweets_inline_media_enabled: true,
            responsive_web_grok_image_annotation_enabled: false,
            responsive_web_enhance_cards_enabled: false
          }),
          fieldToggles: JSON.stringify({
            withArticleRichContentState: true,
            withArticlePlainText: false,
            withGrokAnalyze: false,
            withDisallowedReplyControls: false
          })
        },
        headers
      });
      const tweetRoot =
        response?.data?.data?.threaded_conversation_with_injections_v2?.instructions?.[0]?.entries?.[0]?.content?.itemContent
          ?.tweet_results?.result;
      const tweet = tweetRoot?.tweet || tweetRoot;
      const user = tweet.core?.user_results?.result?.legacy || tweet?.legacy;
      const media = tweet.legacy?.entities?.media || [];
      const attachments = media.map((m: any) => {
        if (m.type === "photo") {
          return {
            type: "Photo",
            url: m.media_url_https
          };
        } else if (m.type === "animated_gif" || m.type === "video") {
          const bestVariant = m.video_info.variants.reduce(
            (prev: any, curr: any) => ((prev.bitrate || 0) > (curr.bitrate || 0) ? prev : curr),
            {}
          );
          return {
            type: "Video",
            url: bestVariant.url
          };
        }
        return null;
      }).filter(Boolean);
      return {
        id: tweet?.legacy?.id_str || tweet?.rest_id,
        message: removeLinks(tweet?.legacy?.full_text) || null,
        author: `${user?.name} (${user?.screen_name})`,
        created_at: tweet.legacy?.created_at || null,
        comment: formatNumber(Number(tweet.legacy?.reply_count)) || 0,
        retweets: formatNumber(Number(tweet.legacy?.retweet_count)) || 0,
        like: formatNumber(Number(tweet.legacy?.favorite_count)) || 0,
        views: formatNumber(Number(tweet.views?.count)) || 0,
        bookmark: formatNumber(Number(tweet.legacy?.bookmark_count)) || 0,
        attachments
      };
    } catch (error) {
      console.error("Error:", error);
      return null;
    }
  }

  async info(username: string): Promise<any> {
    const guestToken = await this.getGuestToken();
    if (!guestToken) throw new Error("No guest token retrieved");
    const headers = {
      ...this.defaultHeaders,
      "x-csrf-token": this.cookies.ct0,
      "x-guest-token": guestToken,
      cookie: this.getCookieString()
    };
    try {
      const params: Record<string, string> = {
        variables: `{"screen_name":"${username}"}`,
        features:
          '{"hidden_profile_subscriptions_enabled":true,"profile_label_improvements_pcf_label_in_post_enabled":true,"rweb_tipjar_consumption_enabled":true,"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"subscriptions_verification_info_is_identity_verified_enabled":true,"subscriptions_verification_info_verified_since_enabled":true,"highlights_tweets_tab_ui_enabled":true,"responsive_web_twitter_article_notes_tab_enabled":true,"subscriptions_feature_can_gift_premium":true,"creator_subscriptions_tweet_preview_api_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"responsive_web_graphql_timeline_navigation_enabled":true}',
        fieldToggles: '{"withAuxiliaryUserLabels":false}'
      };
      const query = Object.keys(params)
        .map(key => `${key}=${encodeURIComponent(params[key])}`)
        .join("&");
      const response = await this.client.get(`/i/api/graphql/QGIw94L0abhuohrr76cSbw/UserByScreenName?${query}`, {
        headers
      });
      const data = response.data?.data?.user?.result;
      return {
        id: data.rest_id,
        name: data.legacy.name,
        username: data.legacy.screen_name,
        followers_count: data.legacy.followers_count,
        listed_count: data.legacy.listed_count,
        media_count: data.legacy.media_count,
        friends_count: data.legacy.friends_count,
        favourites_count: data.legacy.favourites_count,
        statuses_count: data.legacy.statuses_count,
        bio: data.legacy.description,
        verified: data.legacy.verified,
        highlighted_tweets: data.highlights_info.highlighted_tweets,
        creator_subscriptions_count: data.creator_subscriptions_count,
        created_at: data.legacy.created_at,
        profile_image: data.legacy.profile_image_url_https
      };
    } catch (error) {
      console.error("Error fetching data:", error);
      return null;
    }
  }

  async search(keyword: string, count = 20): Promise<any[]> {
    const guestToken = await this.getGuestToken();
    if (!guestToken) throw new Error("No guest token retrieved");
    const headers = {
      ...this.defaultHeaders,
      "x-csrf-token": this.cookies.ct0,
      "x-guest-token": guestToken,
      cookie: this.getCookieString()
    };
    function formatNumber(number: number): string | null {
      if (isNaN(number)) {
        return null;
      }
      return number.toLocaleString("de-DE");
    }
    function removeLinks(title: string | undefined | null): string {
      if (typeof title !== "string") {
        return "";
      }
      const cleanedTitle = title.replace(/https?:\/\/t\.co\/[a-zA-Z0-9]+/g, "");
      return cleanedTitle.trim();
    }
    const response = await this.client.get("/i/api/graphql/KGwXtH8l4tGYoWMFJCh1ig/SearchTimeline", {
      params: {
        variables: JSON.stringify({
          rawQuery: keyword,
          count,
          querySource: "typed_query",
          product: "Top"
        }),
        features: JSON.stringify({
          rweb_video_screen_enabled: false,
          profile_label_improvements_pcf_label_in_post_enabled: true,
          rweb_tipjar_consumption_enabled: true,
          verified_phone_label_enabled: false,
          creator_subscriptions_tweet_preview_api_enabled: true,
          responsive_web_graphql_timeline_navigation_enabled: true,
          responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
          premium_content_api_read_enabled: false,
          communities_web_enable_tweet_community_results_fetch: true,
          c9s_tweet_anatomy_moderator_badge_enabled: true,
          responsive_web_grok_analyze_button_fetch_trends_enabled: false,
          responsive_web_grok_analyze_post_followups_enabled: true,
          responsive_web_jetfuel_frame: false,
          responsive_web_grok_share_attachment_enabled: true,
          articles_preview_enabled: true,
          responsive_web_edit_tweet_api_enabled: true,
          graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
          view_counts_everywhere_api_enabled: true,
          longform_notetweets_consumption_enabled: true,
          responsive_web_twitter_article_tweet_consumption_enabled: true,
          tweet_awards_web_tipping_enabled: false,
          responsive_web_grok_show_grok_translated_post: false,
          responsive_web_grok_analysis_button_from_backend: true,
          creator_subscriptions_quote_tweet_preview_enabled: false,
          freedom_of_speech_not_reach_fetch_enabled: true,
          standardized_nudges_misinfo: true,
          tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
          longform_notetweets_rich_text_read_enabled: true,
          longform_notetweets_inline_media_enabled: true,
          responsive_web_grok_image_annotation_enabled: true,
          responsive_web_enhance_cards_enabled: false
        })
      },
      headers
    });
    const data = response.data.data.search_by_raw_query.search_timeline.timeline.instructions[0]?.entries || [];
    const tweets = data.filter((entry: any) => entry.entryId.startsWith("tweet-"));
    return tweets
      .filter(
        (entry: any) =>
          entry.content &&
          entry.content.itemContent &&
          entry.content.itemContent.tweet_results &&
          entry.content.itemContent.tweet_results.result
      )
      .map((entry: any) => {
        const tweet = entry.content.itemContent.tweet_results.result;
        const user = tweet.core?.user_results?.result?.legacy || tweet?.legacy;
        const media = tweet.legacy?.entities?.media || [];
        const attachments = media
          .map((m: any) => {
            if (m.type === "photo") {
              return {
                type: "Photo",
                url: m.media_url_https
              };
            } else if (m.type === "animated_gif" || m.type === "video") {
              const bestVariant = m.video_info.variants.reduce(
                (prev: any, curr: any) => ((prev.bitrate || 0) > (curr.bitrate || 0) ? prev : curr),
                {}
              );
              return {
                type: "Video",
                url: bestVariant.url
              };
            }
            return null;
          })
          .filter(Boolean);
        return {
          id: tweet?.legacy?.id_str || tweet?.rest_id,
          message: removeLinks(tweet?.legacy?.full_text) || null,
          author: `${user?.name} (${user?.screen_name})`,
          created_at: tweet.legacy?.created_at || null,
          comment: formatNumber(Number(tweet.legacy?.reply_count)) || 0,
          retweets: formatNumber(Number(tweet.legacy?.retweet_count)) || 0,
          like: formatNumber(Number(tweet.legacy?.favorite_count)) || 0,
          views: formatNumber(Number(tweet.views?.count)) || 0,
          bookmark: formatNumber(Number(tweet.legacy?.bookmark_count)) || 0,
          attachments
        };
      })
      .filter((tweet: any) => tweet.id && tweet.message);
  }

  async trending(count = 20): Promise<any[]> {
    const timeline = await this.getTimeline("trending");
    const guestToken = await this.getGuestToken();
    if (!guestToken) throw new Error("No guest token retrieved");
    const headers = {
      ...this.defaultHeaders,
      "x-csrf-token": this.cookies.ct0,
      "x-guest-token": guestToken,
      cookie: this.getCookieString()
    };
    try {
      const response = await this.client.get("/i/api/graphql/n7h049i-3iM-EPRbGUeSFg/GenericTimelineById", {
        params: {
          variables: JSON.stringify({
            timelineId: timeline,
            count,
            withQuickPromoteEligibilityTweetFields: true
          }),
          features: JSON.stringify({
            profile_label_improvements_pcf_label_in_post_enabled: true,
            rweb_tipjar_consumption_enabled: true,
            responsive_web_graphql_exclude_directive_enabled: true,
            verified_phone_label_enabled: false,
            creator_subscriptions_tweet_preview_api_enabled: true,
            responsive_web_graphql_timeline_navigation_enabled: true,
            responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
            premium_content_api_read_enabled: false,
            communities_web_enable_tweet_community_results_fetch: true,
            c9s_tweet_anatomy_moderator_badge_enabled: true,
            responsive_web_grok_analyze_button_fetch_trends_enabled: false,
            responsive_web_grok_analyze_post_followups_enabled: true,
            responsive_web_jetfuel_frame: false,
            responsive_web_grok_share_attachment_enabled: true,
            articles_preview_enabled: true,
            responsive_web_edit_tweet_api_enabled: true,
            graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
            view_counts_everywhere_api_enabled: true,
            longform_notetweets_consumption_enabled: true,
            responsive_web_twitter_article_tweet_consumption_enabled: true,
            tweet_awards_web_tipping_enabled: false,
            creator_subscriptions_quote_tweet_preview_enabled: false,
            freedom_of_speech_not_reach_fetch_enabled: true,
            standardized_nudges_misinfo: true,
            tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
            rweb_video_timestamps_enabled: true,
            longform_notetweets_rich_text_read_enabled: true,
            longform_notetweets_inline_media_enabled: true,
            responsive_web_grok_image_annotation_enabled: false,
            responsive_web_enhance_cards_enabled: false
          })
        },
        headers
      });
      const filteredData = response.data.data.timeline.timeline.instructions.filter(
        (item: any) => item.type === "TimelineAddEntries"
      );
      const res = filteredData[0].entries
        .filter((entry: any) => entry.entryId.startsWith("trend-"))
        .map((item: any) => {
          const tweet = item.content.itemContent;
          return {
            rank: tweet.rank,
            name: tweet.name,
            type: tweet.trend_metadata.domain_context,
            post_count: tweet.trend_metadata?.meta_description || 0
          };
        });
      return res;
    } catch (error) {
      console.error("Error:", error);
      return [];
    }
  }

  async post(username: string, count = 20): Promise<any[]> {
    try {
      const userData = await this.getUserID(username);
      const id = userData?.data?.user_result_by_screen_name?.result?.rest_id ?? null;
      const guestToken = await this.getGuestToken();
      if (!guestToken) throw new Error("No guest token retrieved");
      const headers = {
        ...this.defaultHeaders,
        "x-csrf-token": this.cookies.ct0,
        "x-guest-token": guestToken,
        cookie: this.getCookieString()
      };
      function formatNumber(number: number): string | null {
        if (isNaN(number)) {
          return null;
        }
        return number.toLocaleString("de-DE");
      }
      function removeLinks(title: string | undefined | null): string {
        if (typeof title !== "string") {
          return "";
        }
        const cleanedTitle = title.replace(/https?:\/\/t\.co\/[a-zA-Z0-9]+/g, "");
        return cleanedTitle.trim();
      }
      const response = await this.client.get("/i/api/graphql/MpOINUGH_YVb2BKjYZOPaQ/UserTweets", {
        params: {
          variables: JSON.stringify({
            userId: id,
            count,
            includePromotedContent: true,
            withQuickPromoteEligibilityTweetFields: true,
            withVoice: true,
            withV2Timeline: true
          }),
          features: JSON.stringify({
            profile_label_improvements_pcf_label_in_post_enabled: true,
            rweb_tipjar_consumption_enabled: true,
            responsive_web_graphql_exclude_directive_enabled: true,
            verified_phone_label_enabled: false,
            creator_subscriptions_tweet_preview_api_enabled: true,
            responsive_web_graphql_timeline_navigation_enabled: true,
            responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
            premium_content_api_read_enabled: false,
            communities_web_enable_tweet_community_results_fetch: true,
            c9s_tweet_anatomy_moderator_badge_enabled: true,
            responsive_web_grok_analyze_button_fetch_trends_enabled: false,
            responsive_web_grok_analyze_post_followups_enabled: true,
            responsive_web_jetfuel_frame: false,
            responsive_web_grok_share_attachment_enabled: true,
            articles_preview_enabled: true,
            responsive_web_edit_tweet_api_enabled: true,
            graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
            view_counts_everywhere_api_enabled: true,
            longform_notetweets_consumption_enabled: true,
            responsive_web_twitter_article_tweet_consumption_enabled: true,
            tweet_awards_web_tipping_enabled: false,
            creator_subscriptions_quote_tweet_preview_enabled: false,
            freedom_of_speech_not_reach_fetch_enabled: true,
            standardized_nudges_misinfo: true,
            tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
            rweb_video_timestamps_enabled: true,
            longform_notetweets_rich_text_read_enabled: true,
            longform_notetweets_inline_media_enabled: true,
            responsive_web_grok_image_annotation_enabled: false,
            responsive_web_enhance_cards_enabled: false
          }),
          fieldToggles: JSON.stringify({
            withArticlePlainText: false
          })
        },
        headers
      });
      const data = response.data.data.user.result.timeline_v2.timeline.instructions.filter(
        (item: any) => item.type === "TimelineAddEntries"
      );
      const tweets = data[0].entries.filter((entry: any) => entry.entryId.startsWith("tweet-"));
      return tweets
        .filter(
          (entry: any) =>
            entry.content &&
            entry.content.itemContent &&
            entry.content.itemContent.tweet_results &&
            entry.content.itemContent.tweet_results.result
        )
        .map((entry: any) => {
          const tweet = entry.content.itemContent.tweet_results.result;
          const user = tweet.core?.user_results?.result?.legacy || tweet?.legacy;
          const media = tweet.legacy?.entities?.media || [];
          const attachments = media
            .map((m: any) => {
              if (m.type === "photo") {
                return {
                  type: "Photo",
                  url: m.media_url_https
                };
              } else if (m.type === "animated_gif" || m.type === "video") {
                const bestVariant = m.video_info.variants.reduce(
                  (prev: any, curr: any) => ((prev.bitrate || 0) > (curr.bitrate || 0) ? prev : curr),
                  {}
                );
                return {
                  type: "Video",
                  url: bestVariant.url
                };
              }
              return null;
            })
            .filter(Boolean);
          return {
            id: tweet?.legacy?.id_str || tweet?.rest_id,
            message: removeLinks(tweet?.legacy?.full_text) || null,
            author: `${user?.name} (${user?.screen_name})`,
            created_at: tweet.legacy?.created_at || null,
            comment: formatNumber(Number(tweet.legacy?.reply_count)) || 0,
            retweets: formatNumber(Number(tweet.legacy?.retweet_count)) || 0,
            like: formatNumber(Number(tweet.legacy?.favorite_count)) || 0,
            views: formatNumber(Number(tweet.views?.count)) || 0,
            bookmark: formatNumber(Number(tweet.legacy?.bookmark_count)) || 0,
            attachments
          };
        })
        .filter((tweet: any) => tweet.id && tweet.message);
    } catch (error) {
      console.error("Error:", error);
      return [];
    }
  }
}

const xapi = new XAPI(
  'guest_id_marketing=v1%3A174222506529472152; guest_id_ads=v1%3A174222506529472152; guest_id=v1%3A174222506529472152; kdt=DeWSaCjQCaZHIllFqMtTBTgfvdBqE8DgZUGL5c4Q; auth_token=b9ed68059f4b4617f6c808453ec0ad34ec98fdc8; ct0=98e3a34184d8e20408c766848e7c7404404c6fcebb71167afa0ef51dfa3288f8be0323856b15e1d7ccd0f26f000b70348e490a042a5cf7373c63f86357265485f7850867a14b02c44eae3aa1b51c7487; twid=u%3D1901656340382334977; personalization_id="v1_AhazM1ssvwBs4P6nJFR2yw=="; lang=en; __cf_bm=xihNRsI3pAbbpYXmeFcwL6QYWcq37XoomDhA37X1tAk-1753969849-1.0.1.1-X1laX5nlybfyN0_9IYTV0xwaAQf9q13GeYl7HrZYoxCP8XZ0ZfTDkvqq4ZofFo_7SRaUlCcChTp.zYpjoh98_rcVGCudFWs56mXqvfrl1sY; __cuid=dd7d5cfa6bb845e6b49c17d41c494e1d'
);

export default xapi;
