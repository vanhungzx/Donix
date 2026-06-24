import axios from "axios";
import crypto from "crypto";
import FormData from "form-data";
import fs from "fs";
import { URLSearchParams } from "url";
import { v4 as uuidv4 } from "uuid";
import { getConfig } from "../../../core/configManager";

interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  cover_artwork?: string;
  duration_in_ms?: number;
  progressive_download?: Array<{
    url: string;
  }>;
}

interface UploadStoryWithMusicParams {
  imagePath: string | Buffer;
  musicAssetId?: string;
  musicSearchQuery?: string;
  trimStart?: number; // milliseconds
  trimEnd?: number; // milliseconds
  overlayImagePath?: string | Buffer; // Optional overlay image
  textOverlay?: {
    text: string;
    position?: { x: number; y: number };
    scale?: number;
  };
  userId: string;
}

interface StoryCreateResult {
  story_id: string;
  story_url: string;
  cache_id?: string;
}

const getAccessToken = (): string => {
  const cfg = getConfig();
  const tokenObj = cfg?.token || {};
  const token = tokenObj.EAAAAU || Object.values(tokenObj)[0];
  if (!token) {
    throw new Error("Không tìm thấy accessToken trong config");
  }
  return token;
};

const getDefaultHeaders = (token: string) => ({
  "User-Agent":
    "[FBAN/FB4A;FBAV/540.0.0.49.148;FBBV/828455737;FBDM/{density=3.0,width=1080,height=1920};FBLC/vi_VN;FBRV/0;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBPN/com.facebook.katana;FBDV/23113RKC6C;FBSV/9;FBOP/1;FBCA/x86_64:arm64-v8a;]",
  "Accept-Encoding": "gzip, deflate",
  "Content-Type": "application/x-www-form-urlencoded",
  authorization: `OAuth ${token}`,
  "x-fb-request-analytics-tags":
    '{"network_tags":{"product":"350685531728","request_category":"graphql","purpose":"fetch","retry_attempt":"0"},"application_tags":"graphservice"}',
  "x-fb-rmd": "state=URL_ELIGIBLE",
  priority: "u=0",
  "x-fb-friendly-name": "FBMusicPickerQueryConnection",
  "x-zero-f-device-id": "0b0dce82-584e-47f0-85fe-d33102ca196f",
  "x-graphql-request-purpose": "fetch",
  "x-fb-device-group": "864",
  "x-tigon-is-retry": "False",
  "x-graphql-client-library": "graphservice",
  "x-zero-eh": "2,,AUqRMdYRBonWP5JJ7Sdw4ZouvT04rNDr67OlOXf7F1_5hTtBKK96eJFJfVK6Y6pcVEk",
  "x-fb-net-hni": "45201",
  "x-fb-sim-hni": "45201",
  "app-scope-id-header": "c032db2d-42ab-45e4-9dc5-3009e30241f4",
  "x-fb-connection-type": "WIFI",
  "x-meta-usdid":
    "eyJwYXlsb2FkIjoiZXlKemRXSWlPaUkzTUdOaE1tRTFPUzA0T0RWa0xUUTBPREl0WWpRMVlTMDROekl4TVRsaFpXRXlZek1pTENKcFlYUWlPakUzTmpVNE5UY3pNalVzSW1GMVpDSTZJak0x",
  "x-fb-http-engine": "Tigon/Liger",
  "x-fb-client-ip": "True",
  "x-fb-server-cluster": "True"
});

/**
 * Search for music tracks
 */
export async function searchMusic(_query: string, token: string): Promise<MusicTrack[]> {
  const browseSessionId = uuidv4();

  const variables = {
    params: {
      show_artist_banner: false,
      product: "FB_CAMERA",
      order_by: "POPULAR",
      contextual_recs_visual_context: {
        include_contextual_music_recs: false,
        contextual_rec_image_info: []
      },
      oncall: "fb_creation_audio_android",
      exclude_original_audio: false,
      // Note: Facebook API may not support direct search query in this endpoint
      // This returns popular music. For search, might need different endpoint
    },
    browse_session_id: browseSessionId,
    audio_library_product: "FB_CAMERA",
    should_show_music_demonetization_status: true,
    items_paginating_first: 15,
    defer_non_render_field: true,
    nt_context: {
      using_white_navbar: true,
      styles_id: "297656d8b086a78a9562b1bd365f7e7f",
      pixel_ratio: 3,
      is_push_on: false,
      debug_tooling_metadata_token: null,
      is_flipper_enabled: false,
      theme_params: [{ value: [], design_system_name: "FDS" }],
      bloks_version: "cb7ce606c35396541e8e28ea272d7afc76fe91bcc2ab1d55f95b19350952ba43"
    },
    scale: "3",
    should_include_banner_view: true
  };

  const body = new URLSearchParams();
  body.set("method", "post");
  body.set("pretty", "false");
  body.set("format", "json");
  body.set("server_timestamps", "true");
  body.set("locale", "vi_VN");
  body.set("purpose", "fetch");
  body.set("fb_api_req_friendly_name", "FBMusicPickerQueryConnection");
  body.set("fb_api_caller_class", "graphservice");
  body.set("client_doc_id", "5098290974270045097634882985");
  body.set("fb_api_client_context", JSON.stringify({ is_background: false }));
  body.set("variables", JSON.stringify(variables));
  body.set("fb_api_analytics_tags", JSON.stringify(["At_Connection", "surfaces.fb.GraphServiceEmitter", "GraphServices"]));
  body.set("client_trace_id", uuidv4());

  const response = await axios.post("https://graph.facebook.com/graphql", body.toString(), {
    headers: getDefaultHeaders(token),
    decompress: true
  });

  const data = response.data;
  const edges = data?.[0]?.data?.xfb_music_picker_connection_container?.items?.edges || [];

  return edges.map((edge: any) => {
    const item = edge?.node?.item;
    if (!item) return null;
    return {
      id: item.id || item.strong_id__,
      title: item.display_title?.text || item.title?.text || "",
      artist: item.display_subtitle?.text || item.display_artist?.text || "",
      cover_artwork: item.cover_artwork?.uri || item.display_image?.uri,
      duration_in_ms: item.duration_in_ms,
      progressive_download: item.progressive_download
    };
  }).filter(Boolean);
}

/**
 * Log music selection
 */
async function logMusicSelection(
  audioAssetId: string,
  browseSessionId: string,
  alacornSessionId: string,
  token: string
): Promise<void> {
  const variables = {
    data: {
      event_time: Math.floor(Date.now() / 1000),
      product: "FB_CAMERA",
      event: "SONG_SELECTION",
      audio_asset_id: audioAssetId,
      browse_session_id: browseSessionId,
      alacorn_session_id: alacornSessionId
    }
  };

  const body = new URLSearchParams();
  body.set("method", "post");
  body.set("pretty", "false");
  body.set("format", "json");
  body.set("server_timestamps", "true");
  body.set("locale", "vi_VN");
  body.set("fb_api_req_friendly_name", "AudioLibrary");
  body.set("fb_api_caller_class", "graphservice");
  body.set("client_doc_id", "46642054416260891438680598536");
  body.set("fb_api_client_context", JSON.stringify({ is_background: false }));
  body.set("variables", JSON.stringify(variables));
  body.set("fb_api_analytics_tags", JSON.stringify(["GraphServices"]));
  body.set("client_trace_id", uuidv4());

  await axios.post("https://graph.facebook.com/graphql", body.toString(), {
    headers: getDefaultHeaders(token),
    decompress: true
  });
}

/**
 * Upload file to rupload.facebook.com
 */
async function uploadToRupload(
  fileBuffer: Buffer,
  entityType: string,
  token: string
): Promise<string> {
  const timestamp = Date.now();
  const hash = crypto.createHash("md5").update(fileBuffer).digest("hex");
  const fileSize = fileBuffer.length;
  const entityName = `${hash}-0-${fileSize}-${timestamp}-${timestamp}`;
  const uploadUrl = `https://rupload.facebook.com/fb_video/${entityName}`;

  // First, check upload status
  const getHeaders = {
    ...getDefaultHeaders(token),
    "Content-Type": "application/octet-stream",
    "x-fb-upload-type": "Single"
  };

  try {
    await axios.get(uploadUrl, { headers: getHeaders });
  } catch (e: any) {
    // Expected to fail, continue with upload
  }

  // Upload the file
  const postHeaders = {
    ...getDefaultHeaders(token),
    "Content-Type": "application/octet-stream",
    "x-entity-length": String(fileSize),
    "x-entity-name": entityName,
    "x-entity-type": entityType,
    offset: "0"
  };

  const response = await axios.post(uploadUrl, fileBuffer, {
    headers: postHeaders,
    decompress: true
  });

  const handle = response.data?.h;
  if (!handle) {
    throw new Error("Upload failed: No handle returned");
  }

  return handle;
}

/**
 * Upload video/image and create story with music
 */
export async function uploadStoryWithMusic(
  params: UploadStoryWithMusicParams
): Promise<StoryCreateResult> {
  const {
    imagePath,
    musicAssetId,
    musicSearchQuery,
    trimStart = 0,
    trimEnd = 15000,
    overlayImagePath,
    textOverlay,
    userId
  } = params;

  const token = getAccessToken();
  const composerSessionId = uuidv4();
  const browseSessionId = uuidv4();
  const alacornSessionId = uuidv4();

  // Read image file
  let imageBuffer: Buffer;
  if (Buffer.isBuffer(imagePath)) {
    imageBuffer = imagePath;
  } else if (typeof imagePath === "string") {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }
    imageBuffer = fs.readFileSync(imagePath);
  } else {
    throw new Error("Invalid imagePath");
  }

  // Search for music if needed
  let finalMusicAssetId = musicAssetId;
  if (!finalMusicAssetId && musicSearchQuery) {
    const tracks = await searchMusic(musicSearchQuery, token);
    if (tracks.length === 0) {
      throw new Error("Không tìm thấy nhạc phù hợp");
    }
    finalMusicAssetId = tracks[0].id;
  }

  if (!finalMusicAssetId) {
    throw new Error("Cần cung cấp musicAssetId hoặc musicSearchQuery");
  }

  // Log music selection
  await logMusicSelection(finalMusicAssetId, browseSessionId, alacornSessionId, token);

  // Upload main image
  const imageHandle = await uploadToRupload(imageBuffer, "image/jpeg", token);

  // Upload overlay image if provided
  let overlayHandle: string | undefined;
  if (overlayImagePath) {
    let overlayBuffer: Buffer;
    if (Buffer.isBuffer(overlayImagePath)) {
      overlayBuffer = overlayImagePath;
    } else if (typeof overlayImagePath === "string") {
      if (!fs.existsSync(overlayImagePath)) {
        throw new Error(`Overlay image file not found: ${overlayImagePath}`);
      }
      overlayBuffer = fs.readFileSync(overlayImagePath);
    } else {
      throw new Error("Invalid overlayImagePath");
    }
    overlayHandle = await uploadToRupload(overlayBuffer, "image/png", token);
  }

  // Start video upload
  const videoUploadStartForm = new FormData();
  videoUploadStartForm.append("Authorization", `OAuth ${token}`);
  videoUploadStartForm.append("upload_phase", "start");
  videoUploadStartForm.append(
    "music_video_properties",
    JSON.stringify({
      asset_id: finalMusicAssetId,
      lyrics_usage_type: null,
      trim_start: trimStart,
      trim_end: trimEnd,
      volume_adjustment: 0,
      fade_in_duration: "400",
      fade_out_duration: "600",
      video_duration: String(trimEnd - trimStart),
      video_volume_adjustment: "0.0",
      video_fade_in_duration: "400",
      video_fade_out_duration: "600",
      product: "FB_CAMERA",
      has_search_text: false,
      browse_session_id: browseSessionId,
      music_picker_mode: "POST_CAPTURE",
      music_picker_product: "fb_post_capture",
      section_tag_id: "2282005535164995"
    })
  );
  videoUploadStartForm.append("composer_session_id", composerSessionId);
  videoUploadStartForm.append("preview_spec", JSON.stringify({ spec_version: 1, video_dur_ms: trimEnd - trimStart }));
  videoUploadStartForm.append("spherical", "false");
  videoUploadStartForm.append("published", "false");
  videoUploadStartForm.append(
    "upload_setting_properties",
    JSON.stringify({
      nameValuePairs: {
        upload_settings_version: "v0.1",
        video: JSON.stringify({
          video_height: 1920,
          video_duration_milliseconds: 16,
          video_codec_type: null,
          audio_bit_rate_bps: -1,
          video_bit_rate_bps: 46114,
          video_rotation_angle: 0,
          video_width: 1080,
          audio_codec_type: null
        }),
        context: JSON.stringify({ source_type: "inspirations-direct" }),
        creative_tools: {
          overlays: overlayHandle
            ? [
              {
                height_percentage: 0.08740571,
                left_percentage: 0.018920524,
                rotation_degree: 0.0,
                top_percentage: 0.60247993,
                uri: `file:///data/user/0/com.facebook.katana/app_ce/${composerSessionId}/6072083339738.png`,
                width_percentage: 0.1878874
              }
            ]
            : []
        }
      }
    })
  );
  videoUploadStartForm.append("file_size", String(imageBuffer.length));
  videoUploadStartForm.append("locale", "vi_VN");
  videoUploadStartForm.append("client_country_code", "VN");
  videoUploadStartForm.append("fb_api_req_friendly_name", "upload-video-chunk-user-auth-start");
  videoUploadStartForm.append("fb_api_caller_class", "UploadRequestPostMethod");

  const uploadStartResponse = await axios.post(
    `https://graph.facebook.com/v2.3/${userId}/videos`,
    videoUploadStartForm,
    {
      headers: {
        ...getDefaultHeaders(token),
        ...videoUploadStartForm.getHeaders()
      },
      decompress: true
    }
  );

  const videoId = uploadStartResponse.data?.video_id;
  const uploadSessionId = uploadStartResponse.data?.upload_session_id;

  if (!videoId) {
    throw new Error("Failed to start video upload");
  }

  // Transfer uploaded file
  const transferForm = new FormData();
  transferForm.append("Authorization", `OAuth ${token}`);
  transferForm.append("upload_phase", "transfer");
  transferForm.append(
    "metadata",
    JSON.stringify({
      segment_type: "3",
      segment_start_offset: "0",
      segment_end_offset: String(imageBuffer.length)
    })
  );
  transferForm.append("composer_session_id", composerSessionId);
  transferForm.append("upload_speed", "0.0");
  transferForm.append("upload_session_id", uploadSessionId);
  transferForm.append("fbuploader_video_file_chunk", imageHandle);
  transferForm.append("end_offset", String(imageBuffer.length));
  transferForm.append("partition_end_offset", String(imageBuffer.length));
  transferForm.append("start_offset", "0");
  transferForm.append("partition_start_offset", "0");
  transferForm.append("target", userId);
  transferForm.append("locale", "vi_VN");
  transferForm.append("client_country_code", "VN");
  transferForm.append("fb_api_req_friendly_name", "upload-video-chunk-user-auth-transfer");
  transferForm.append("fb_api_caller_class", "UploadRequestPostMethod");

  await axios.post(`https://graph.facebook.com/v2.3/${userId}/videos`, transferForm, {
    headers: {
      ...getDefaultHeaders(token),
      ...transferForm.getHeaders()
    },
    decompress: true
  });

  // Build creative tools
  const creativeTools: any[] = [
    {
      type: "AspectRatio",
      params: {
        top_color: "#504838",
        bottom_color: "#403838"
      }
    },
    {
      type: "MusicSticker",
      params: {
        aa_volume_adjustment: 0,
        aa_trim: {
          trim_after_end: trimEnd / 1000,
          trim_before_start: trimStart / 1000
        },
        ua_volume_adjustment: 0,
        aa_fade_in: {
          fade_duration: 0.4,
          fade_type: 0,
          fade_start_timestamp: 0
        },
        product_data: {
          audio_section_tag_id: "2282005535164995",
          audio_library_product: "FB_CAMERA",
          music_picker_mode: "POST_CAPTURE",
          is_audio_from_search: false,
          music_picker_product: "fb_post_capture",
          lyrics_usage_type: "NO_USAGE"
        },
        ua_volume_muted: true,
        aa_fade_out: {
          fade_duration: 0.6,
          fade_type: 1,
          fade_start_timestamp: (trimEnd - trimStart) / 1000 - 0.6
        }
      },
      asset: {
        is_custom_audio_asset: false,
        type: "EntAudioAsset",
        value: finalMusicAssetId
      }
    },
    {
      type: "PhotoToVideo",
      params: {
        duration: (trimEnd - trimStart) / 1000,
        framerate: 1
      }
    }
  ];

  if (overlayHandle) {
    creativeTools.push({
      type: "Overlay",
      params: {
        rotationDegree: 0,
        leftPercentage: 0.018920524,
        widthPercentage: 0.1878874,
        topPercentage: 0.60247993,
        heightPercentage: 0.08740571
      },
      asset: {
        type: "fbuploader_handle",
        value: overlayHandle
      }
    });
  }

  if (textOverlay) {
    creativeTools.push({
      type: "Text",
      params: {
        scale: textOverlay.scale || 1,
        position: textOverlay.position || { x: 0, y: 0 }
      },
      text: textOverlay.text
    });
  }

  // Final upload start
  const finalStartBody = new URLSearchParams();
  finalStartBody.set("upload_phase", "start");
  finalStartBody.set(
    "music_video_properties",
    JSON.stringify({
      asset_id: finalMusicAssetId,
      lyrics_usage_type: null,
      trim_start: trimStart,
      trim_end: trimEnd,
      volume_adjustment: 0,
      fade_in_duration: "400",
      fade_out_duration: "600",
      video_duration: String(trimEnd - trimStart),
      video_volume_adjustment: "0.0",
      video_fade_in_duration: "400",
      video_fade_out_duration: "600",
      product: "FB_CAMERA",
      has_search_text: false,
      browse_session_id: browseSessionId,
      music_picker_mode: "POST_CAPTURE",
      music_picker_product: "fb_post_capture",
      section_tag_id: "2282005535164995"
    })
  );
  finalStartBody.set("composer_session_id", composerSessionId);
  finalStartBody.set("preview_spec", JSON.stringify({ spec_version: 1, video_dur_ms: trimEnd - trimStart }));
  finalStartBody.set("spherical", "false");
  finalStartBody.set("published", "false");
  finalStartBody.set(
    "upload_setting_properties",
    JSON.stringify({
      nameValuePairs: {
        upload_settings_version: "v0.1",
        video: JSON.stringify({
          video_height: 1920,
          video_duration_milliseconds: 16,
          video_codec_type: null,
          audio_bit_rate_bps: -1,
          video_bit_rate_bps: 46114,
          video_rotation_angle: 0,
          video_width: 1080,
          audio_codec_type: null
        }),
        context: JSON.stringify({ source_type: "inspirations-direct" }),
        creative_tools: {
          overlays: overlayHandle
            ? [
              {
                height_percentage: 0.08740571,
                left_percentage: 0.018920524,
                rotation_degree: 0.0,
                top_percentage: 0.60247993,
                uri: `file:///data/user/0/com.facebook.katana/app_ce/${composerSessionId}/6072083339738.png`,
                width_percentage: 0.1878874
              }
            ]
            : []
        }
      }
    })
  );
  finalStartBody.set("file_size", String(imageBuffer.length));
  finalStartBody.set("creative_tools", JSON.stringify(creativeTools));
  finalStartBody.set("video_id_original", videoId);
  finalStartBody.set("locale", "vi_VN");
  finalStartBody.set("client_country_code", "VN");
  finalStartBody.set("fb_api_req_friendly_name", "upload-video-chunk-start");
  finalStartBody.set("fb_api_caller_class", "UploadRequestPostMethod");

  await axios.post(`https://graph.facebook.com/v2.6/${userId}/videos`, finalStartBody.toString(), {
    headers: {
      ...getDefaultHeaders(token),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    decompress: true
  });

  // Create story
  const storyVariables = {
    poll_facepile_size: 120,
    image_high_height: 2048,
    image_large_aspect_height: 565,
    should_fetch_adaptive_ufi: true,
    image_low_width: 360,
    image_medium_height: 2048,
    media_type: "image/jpeg",
    nt_context: {
      using_white_navbar: true,
      styles_id: "297656d8b086a78a9562b1bd365f7e7f",
      pixel_ratio: 3,
      is_push_on: false,
      debug_tooling_metadata_token: null,
      is_flipper_enabled: false,
      theme_params: [{ value: [], design_system_name: "FDS" }],
      bloks_version: "cb7ce606c35396541e8e28ea272d7afc76fe91bcc2ab1d55f95b19350952ba43"
    },
    image_medium_width: 540,
    image_high_width: 1080,
    input: {
      past_time: {
        time_since_original_post: 7
      },
      logging: {
        composer_session_id: composerSessionId
      },
      is_throwback_post: "NOT_THROWBACK_POST",
      inspiration_prompts: [
        {
          prompt_type: "MANUAL",
          prompt_tracking_string: "0",
          prompt_id: "1752514608329267"
        }
      ],
      navigation_data: {
        attribution_id_v2: `NewsFeedFragment,native_newsfeed,tap_top_jewel_bar,${Math.floor(Date.now() / 1000)}.802,17834304,4748854339,,,${Math.floor(Date.now() / 1000)}.591`
      },
      reshare_original_post: "SHARE_LINK_ONLY",
      idempotence_token: `STORIES_${composerSessionId}`,
      camera_post_context: {
        source: "COMPOSER",
        platform: "FACEBOOK",
        deduplication_id: composerSessionId
      },
      connection_class: "EXCELLENT",
      composer_type: "story",
      composer_source_surface: "newsfeed",
      message: {
        text: textOverlay?.text || ""
      },
      implicit_with_tags_ids: [],
      composer_entry_point: "tap_home_top_right_story_sprout",
      composer_entry_picker: "NULL",
      attachments: [
        {
          video: {
            attachment_inspiration_stickers: {
              stickers: [
                {
                  ranking_identifier: "MUSIC_PICKER"
                }
              ]
            },
            video_media_metadata: {
              text: textOverlay
                ? [
                  {
                    scale: textOverlay.scale || 1.0968562555361883,
                    rotation: 0,
                    content: textOverlay.text,
                    position: {
                      origin_y: textOverlay.position?.y || 451,
                      origin_x: textOverlay.position?.x || 447
                    },
                    size: {
                      width: 185,
                      height: 153
                    },
                    font: "ROBOTO",
                    color: "-8353648"
                  }
                ]
                : [],
              stickers: [
                {
                  style: "198",
                  sticker_id: uuidv4(),
                  name: "MUSIC_PICKER",
                  type: "MUSIC_PICKER",
                  index: 0,
                  image_asset_id: null
                }
              ],
              is_audio_muted: true,
              clips: [],
              length_in_sec: -0.001,
              audio: {
                start_time_s: trimStart / 1000,
                audio_type: "licenced_music",
                volume_level: 0,
                asset_id: finalMusicAssetId
              }
            },
            unified_stories_media_source: "COMPOSER_GALLERY",
            was_created_via_unified_video_flow: {
              was_created_via_unified_video_flow: false
            },
            attachment_attribution_link_metadata: {
              attribution_type: "MUSIC"
            },
            notify_when_processed: false,
            ml_media_tracking_data: {
              media_tracking_id: "1634669946"
            },
            id: videoId,
            story_media_audio_data: {
              raw_media_type: "PHOTO"
            },
            capture_mode: "NORMAL",
            overlays: [
              ...(textOverlay
                ? [
                  {
                    text: {
                      message: {
                        text: textOverlay.text
                      }
                    }
                  }
                ]
                : []),
              {
                music_sticker: {
                  xplat_sticker_style: 198,
                  premium_music_video_id: null,
                  style: 198,
                  song_title: "Nắng Ấm Trong Tim",
                  bounds: {
                    y: 0,
                    width: 0,
                    x: 0,
                    rotation: 0,
                    height: 0
                  },
                  cover_artwork: "https://scontent.fhan15-2.fna.fbcdn.net/v/t39.30808-6/538201083_71060134469289_5342454732620085874_n.jpg",
                  is_explicit: false,
                  source: "MUSIC_PICKER",
                  has_auto_added_music: false,
                  should_use_xplat_style: true,
                  scale_factor: 0,
                  album_title: "Duongg, DADEON"
                }
              }
            ],
            edit_bounds: overlayHandle
              ? {
                top: 0.6024799346923828,
                right: 0.2068079262971878,
                left: 0.018920525908470154,
                bottom: 0.6898856163024902
              }
              : undefined
          }
        }
      ],
      action_timestamp: Math.floor(Date.now() / 1000),
      producer_supported_features: ["LIGHTWEIGHT_REPLY"],
      audiences: [
        {
          stories: {
            self: {
              target_id: userId
            }
          }
        }
      ],
      video_editing_metadata: {
        video_editing_data: [
          {
            video_id: videoId,
            has_effect: false,
            sticker_count: 1,
            is_muted: false,
            text_count: textOverlay ? 1 : 0,
            has_doodle: false
          }
        ]
      },
      tag_expansion_metadata: {
        tag_expansion_ids: []
      },
      place_attachment_setting: "SHOW_ATTACHMENT",
      ai_generated_self_disclosure_metadata: {
        was_self_disclosed_as_ai_generated: false
      },
      composer_session_events_log: {
        number_of_keystrokes: 0,
        number_of_copy_pastes: 0,
        composition_duration: 0
      },
      audiences_is_complete: true,
      source: "MOBILE",
      actor_id: userId
    },
    image_low_height: 2048,
    image_large_aspect_width: 1080,
    size_style: "contain-fit",
    include_mentions_messenger_sharing_params: true,
    action_location: "feed",
    default_image_scale: "3",
    reading_attachment_profile_image_height: 405,
    include_image_ranges: true,
    profile_pic_media_type: "image/x-auto",
    angora_attachment_profile_image_size: 120,
    should_fetch_bling_bar_socket: true,
    should_fetch_mention_reshare_setting: true,
    poll_voters_count: 5,
    question_poll_count: 100,
    bloks_version: "cb7ce606c35396541e8e28ea272d7afc76fe91bcc2ab1d55f95b19350952ba43",
    profile_image_size: 120,
    fetch_fbc_header: true,
    reading_attachment_profile_image_width: 270,
    should_fetch_fallback_actions: true,
    angora_attachment_cover_image_size: 1440,
    should_skip_reachablility_status_type: true
  };

  const storyBody = new URLSearchParams();
  storyBody.set("method", "post");
  storyBody.set("pretty", "false");
  storyBody.set("format", "json");
  storyBody.set("server_timestamps", "true");
  storyBody.set("locale", "vi_VN");
  storyBody.set("fb_api_req_friendly_name", "ComposerStoryCreateMutation");
  storyBody.set("fb_api_caller_class", "graphservice");
  storyBody.set("client_doc_id", "91093790616553112068783225676");
  storyBody.set("fb_api_client_context", JSON.stringify({ is_background: false }));
  storyBody.set("variables", JSON.stringify(storyVariables));
  storyBody.set(
    "fb_api_analytics_tags",
    JSON.stringify([
      "visitation_id=null",
      "surface_hierarchy=NewsFeedFragment,native_newsfeed,null;FbChromeFragment,unknown,null;FbMainTabActivity,native_newsfeed,null;FbCdsBottomSheetFragment,native_cds_fragment_screen_uninitialized,null;FbExperimentalLoggedOutBloksActivity,unknown,null",
      `session_id=UFS-${uuidv4()}-fg-3`,
      "GraphServices"
    ])
  );
  storyBody.set("client_trace_id", uuidv4());

  const storyResponse = await axios.post("https://graph.facebook.com/graphql", storyBody.toString(), {
    headers: getDefaultHeaders(token),
    decompress: true
  });

  const storyData = storyResponse.data?.[0]?.data?.story_create?.items?.[0]?.story;
  if (!storyData) {
    throw new Error("Failed to create story: " + JSON.stringify(storyResponse.data, null, 2));
  }

  return {
    story_id: storyData.id || storyData.cache_id || "",
    story_url: storyData.url || "",
    cache_id: storyData.cache_id
  };
}

export default uploadStoryWithMusic;
