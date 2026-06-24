"use strict";

import type { Command, CommandOnCallContext, CommandOnReplyContext } from "@types";
import axios from "axios";
import crypto from "crypto";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import { URLSearchParams } from "url";
import { v4 as uuidv4 } from "uuid";
import { getConfig } from "../../../core/configManager";

// Helper functions from facebook.ts
const getType = (obj: any): string => {
  const cName = obj?.constructor?.name;
  const gName = Object.prototype.toString
    .call(obj)
    .slice(8, -1);
  if (cName?.toLowerCase() === gName?.toLowerCase()) return cName;
  return !cName || cName?.toLowerCase() === "object" ? gName : cName;
};

const makeParsable = (data: any): string => {
  const withoutForLoop = data.body.replace(
    /for\s*\(\s*;\s*;\s*\)\s*;\s*/,
    ""
  );
  const maybeMultipleObjects = withoutForLoop.split(/\}\s*\{/);
  if (maybeMultipleObjects.length === 1) return maybeMultipleObjects[0];
  return `[${maybeMultipleObjects.join("},{")}]`;
};

const parseFromBody = (data: any): any => {
  if (typeof data.body !== "string") return data.body;
  try {
    const result = JSON.parse(makeParsable(data));
    const type = getType(result);
    return type === "Object" || type === "Array"
      ? result
      : data.body;
  } catch {
    return data.body;
  }
};

// const parseFromJSONB = (data: string): any => {
//   return JSONB.parse(data);
// };
// ==================== Interfaces ====================
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

// ==================== Helper Functions ====================
const getAccessToken = (config?: any): string => {
  // Try to get token from config parameter first (like postvideo command)
  if (config?.token?.EAAAAU) return config.token.EAAAAU;
  if (config?.token?.EAAD) return config.token.EAAD;

  // Fallback to getConfig
  const cfg = getConfig();
  const tokenObj = cfg?.token || {};
  const token = tokenObj.EAAAAU || tokenObj.EAAD || Object.values(tokenObj)[0];
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
async function searchMusic(_query: string, token: string): Promise<MusicTrack[]> {
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

  // Parse response using facebook.ts utilities
  // If response.data is already parsed (object/array), use it directly
  // If it's a string, wrap it and parse
  let parsedData: any;
  if (typeof response.data === "string") {
    parsedData = parseFromBody({ body: response.data });
  } else if (Array.isArray(response.data) && response.data.length > 0) {
    // GraphQL response is usually an array, parse first element's data
    parsedData = response.data[0]?.data || response.data[0] || response.data;
  } else {
    parsedData = response.data;
  }

  // Safely extract edges
  let edges: any[] = [];
  if (Array.isArray(parsedData) && parsedData.length > 0) {
    const firstItem = parsedData[0];
    edges = firstItem?.data?.xfb_music_picker_connection_container?.items?.edges ||
      firstItem?.xfb_music_picker_connection_container?.items?.edges || [];
  } else if (parsedData?.data) {
    edges = parsedData.data.xfb_music_picker_connection_container?.items?.edges || [];
  } else if (parsedData?.xfb_music_picker_connection_container) {
    edges = parsedData.xfb_music_picker_connection_container.items?.edges || [];
  }

  // Flatten all sub_items from all edges
  const tracks: MusicTrack[] = [];
  for (const edge of edges) {
    const subItems = edge?.node?.sub_items || [];
    for (const item of subItems) {
      if (item && item.__typename === "AudioAsset") {
        tracks.push({
          id: item.id || item.strong_id__ || "",
          title: item.display_title?.text || item.title?.text || "",
          artist: item.display_subtitle?.text || item.display_artist?.text || "",
          cover_artwork: item.cover_artwork?.uri || item.display_image?.uri,
          duration_in_ms: item.duration_in_ms,
          progressive_download: item.progressive_download
        });
      }
    }
  }
  console.log(tracks);
  return tracks;
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
 * For images used in story with music, upload to fb_video endpoint for photo-to-video conversion
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

  // For story with music (photo-to-video), upload to fb_video endpoint
  const uploadUrl = `https://rupload.facebook.com/fb_video/${entityName}`;

  // Upload headers - simplified headers for video upload
  const postHeaders: Record<string, string> = {
    "User-Agent": "[FBAN/FB4A;FBAV/540.0.0.49.148;FBBV/828455737;FBDM/{density=3.0,width=1080,height=1920};FBLC/vi_VN;FBRV/0;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBPN/com.facebook.katana;FBDV/23113RKC6C;FBSV/9;FBOP/1;FBCA/x86_64:arm64-v8a;]",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/octet-stream",
    "authorization": `OAuth ${token}`,
    "x-entity-length": String(fileSize),
    "x-entity-name": entityName,
    "x-entity-type": entityType, // Keep original type (image/jpeg) for photo-to-video
    "offset": "0"
  };

  try {
    const response = await axios.post(uploadUrl, fileBuffer, {
      headers: postHeaders,
      decompress: true,
      maxRedirects: 0,
      validateStatus: (status) => status < 500 // Accept 2xx, 3xx, 4xx but not 5xx
    });

    // Handle response - could be JSON or plain text
    let handle: string | undefined;
    if (typeof response.data === "string") {
      try {
        const jsonData = JSON.parse(response.data);
        handle = jsonData.h || jsonData.handle;
      } catch {
        // If not JSON, try to extract handle from string
        handle = response.data.trim();
      }
    } else if (response.data && typeof response.data === "object") {
      handle = response.data.h || response.data.handle;
    }

    if (!handle || handle.length === 0) {
      console.error("Upload response:", response.data);
      throw new Error("Upload failed: No handle returned from response");
    }

    return handle;
  } catch (error: any) {
    const errorMessage = error?.response?.data || error?.response?.statusText || error?.message || "Unknown error";
    const statusCode = error?.response?.status;
    console.error("Rupload upload error:", {
      status: statusCode,
      data: errorMessage,
      entityType,
      fileSize,
      url: uploadUrl
    });
    throw new Error(`Failed to upload to rupload (${statusCode}): ${JSON.stringify(errorMessage)}`);
  }
}

/**
 * Upload video/image and create story with music
 */
async function uploadStoryWithMusic(
  params: UploadStoryWithMusicParams,
  config?: any
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

  const token = getAccessToken(config);
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

  // Upload main image - for photo-to-video, try uploading as video/mp4 or without explicit type
  // Facebook may auto-detect and convert image to video for story with music
  let imageHandle: string;
  try {
    // First try with video/mp4 type (photo-to-video conversion)
    imageHandle = await uploadToRupload(imageBuffer, "video/mp4", token);
  } catch (error: any) {
    console.warn("Failed to upload as video/mp4, trying image/jpeg:", error.message);
    // Fallback to image/jpeg
    imageHandle = await uploadToRupload(imageBuffer, "image/jpeg", token);
  }

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

  // Start video upload - for photo-to-video with music
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
  videoUploadStartForm.append("source", "COMPOSER_GALLERY"); // Specify source
  videoUploadStartForm.append(
    "upload_setting_properties",
    JSON.stringify({
      nameValuePairs: {
        upload_settings_version: "v0.1",
        video: JSON.stringify({
          video_height: 1920,
          video_duration_milliseconds: trimEnd - trimStart, // Use actual duration, not 16
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
  // For photo-to-video, we specify the image handle in transfer phase, not start phase
  videoUploadStartForm.append("file_size", String(imageBuffer.length));
  videoUploadStartForm.append("locale", "vi_VN");
  videoUploadStartForm.append("client_country_code", "VN");
  videoUploadStartForm.append("fb_api_req_friendly_name", "upload-video-chunk-user-auth-start");
  videoUploadStartForm.append("fb_api_caller_class", "UploadRequestPostMethod");

  let uploadStartResponse: any;
  try {
    uploadStartResponse = await axios.post(
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
  } catch (error: any) {
    const errorMessage = error?.response?.data || error?.response?.statusText || error?.message || "Unknown error";
    const statusCode = error?.response?.status;
    console.error("Video upload start error:", {
      status: statusCode,
      data: errorMessage,
      url: `https://graph.facebook.com/v2.3/${userId}/videos`
    });
    throw new Error(`Failed to start video upload (${statusCode}): ${JSON.stringify(errorMessage)}`);
  }

  const videoId = uploadStartResponse.data?.video_id;
  const uploadSessionId = uploadStartResponse.data?.upload_session_id;

  if (!videoId) {
    console.error("Upload start response:", uploadStartResponse.data);
    throw new Error("Failed to start video upload: No video_id in response");
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

  try {
    await axios.post(`https://graph.facebook.com/v2.3/${userId}/videos`, transferForm, {
      headers: {
        ...getDefaultHeaders(token),
        ...transferForm.getHeaders()
      },
      decompress: true
    });
  } catch (error: any) {
    const errorMessage = error?.response?.data || error?.response?.statusText || error?.message || "Unknown error";
    const statusCode = error?.response?.status;
    console.error("Video transfer error:", {
      status: statusCode,
      data: errorMessage,
      videoId,
      uploadSessionId,
      imageHandle
    });
    throw new Error(`Failed to transfer video (${statusCode}): ${JSON.stringify(errorMessage)}`);
  }

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

  try {
    await axios.post(`https://graph.facebook.com/v2.6/${userId}/videos`, finalStartBody.toString(), {
      headers: {
        ...getDefaultHeaders(token),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      decompress: true
    });
  } catch (error: any) {
    const errorMessage = error?.response?.data || error?.response?.statusText || error?.message || "Unknown error";
    const statusCode = error?.response?.status;
    console.error("Final upload start error:", {
      status: statusCode,
      data: errorMessage,
      videoId
    });
    throw new Error(`Failed to finalize video upload (${statusCode}): ${JSON.stringify(errorMessage)}`);
  }

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

  let storyResponse: any;
  try {
    storyResponse = await axios.post("https://graph.facebook.com/graphql", storyBody.toString(), {
      headers: getDefaultHeaders(token),
      decompress: true
    });
  } catch (error: any) {
    const errorMessage = error?.response?.data || error?.response?.statusText || error?.message || "Unknown error";
    const statusCode = error?.response?.status;
    console.error("Story creation error:", {
      status: statusCode,
      data: errorMessage,
      videoId
    });
    throw new Error(`Failed to create story (${statusCode}): ${JSON.stringify(errorMessage)}`);
  }

  // Parse response using facebook.ts utilities
  let parsedStoryData: any;
  if (typeof storyResponse.data === "string") {
    parsedStoryData = parseFromBody({ body: storyResponse.data });
  } else if (Array.isArray(storyResponse.data) && storyResponse.data.length > 0) {
    parsedStoryData = storyResponse.data[0]?.data || storyResponse.data[0] || storyResponse.data;
  } else {
    parsedStoryData = storyResponse.data;
  }

  // Try multiple paths to find story data
  const storyData = parsedStoryData?.story_create?.items?.[0]?.story ||
    parsedStoryData?.data?.story_create?.items?.[0]?.story ||
    (Array.isArray(parsedStoryData) && parsedStoryData[0]?.data?.story_create?.items?.[0]?.story) ||
    null;

  if (!storyData) {
    console.error("Story creation response:", parsedStoryData);
    throw new Error("Failed to create story: No story data in response. Response: " + JSON.stringify(parsedStoryData, null, 2));
  }

  return {
    story_id: storyData.id || storyData.cache_id || "",
    story_url: storyData.url || "",
    cache_id: storyData.cache_id
  };
}

// ==================== Command ====================
const storyMusicCommand: Command = {
  name: "storymusic",
  alias: ["storynhac", "mstory", "storym"],
  version: "1.0.0",
  role: 3,
  desc: "Đăng Story ảnh với nhạc Facebook",
  guide:
    "{pn} [ảnh] [nhạc_id hoặc tên nhạc]\n" +
    "Hoặc reply ảnh kèm: {pn} [nhạc_id hoặc tên nhạc]\n\n" +
    "Ví dụ:\n" +
    "• {pn} reply ảnh + 2208386439627180\n" +
    "• {pn} reply ảnh + Nắng Ấm Trong Tim",
  cd: 10,
  prefix: true,
  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { client, event, args, reply, config } = ctx;
    const threadID = event.threadID;

    try {
      // Get user ID - try multiple methods like postvideo command
      const userId = (client as any).id || client.getCurrentUserID?.() || "";
      if (!userId) {
        await reply("❌ Không lấy được User ID");
        return;
      }

      // Get image from reply or attachment
      let imagePath: string | Buffer | null = null;
      const replied = event.messageReply as any;
      const attachments = event.attachments || [];

      if (replied?.attachments?.[0]) {
        // Download from URL
        const imageUrl = (replied.attachments[0] as any).url;
        const tempDir = path.join(process.cwd(), "temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempFile = path.join(tempDir, `story_${Date.now()}.jpg`);
        const response = await axios.get(imageUrl, {
          responseType: "arraybuffer",
          timeout: 60000
        });
        fs.writeFileSync(tempFile, Buffer.from(response.data));
        imagePath = tempFile;
      } else if (attachments.length > 0 && (attachments[0] as any).url) {
        // Download from current message attachment
        const imageUrl = (attachments[0] as any).url;
        const tempDir = path.join(process.cwd(), "temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempFile = path.join(tempDir, `story_${Date.now()}.jpg`);
        const response = await axios.get(imageUrl, {
          responseType: "arraybuffer",
          timeout: 60000
        });
        fs.writeFileSync(tempFile, Buffer.from(response.data));
        imagePath = tempFile;
      }

      if (!imagePath) {
        await reply(
          "❌ Vui lòng reply một ảnh hoặc đính kèm ảnh trong tin nhắn!\n\n" +
          "📖 Cách dùng:\n" +
          "• Reply ảnh + {pn} [nhạc_id hoặc tên nhạc]\n" +
          "• Hoặc gửi ảnh kèm lệnh: {pn} [nhạc_id hoặc tên nhạc]"
        );
        return;
      }

      // Get music ID or search query
      const musicInput = args.join(" ").trim();
      if (!musicInput) {
        await reply("❌ Vui lòng nhập ID nhạc hoặc tên nhạc để tìm kiếm!");
        return;
      }

      // Check if it's a numeric ID (likely a music asset ID)
      const isNumericId = /^\d+$/.test(musicInput);

      if (isNumericId) {
        // Direct music ID, proceed with upload
        const musicAssetId = musicInput;
        await reply("⏳ Đang tải ảnh và đăng Story với nhạc, vui lòng đợi...");

        // Upload story with music
        const result = await uploadStoryWithMusic({
          imagePath,
          musicAssetId,
          trimStart: 0,
          trimEnd: 15000, // 15 seconds default
          userId: String(userId)
        }, config);

        // Clean up temp file
        if (typeof imagePath === "string" && fs.existsSync(imagePath)) {
          try {
            fs.unlinkSync(imagePath);
          } catch {
            // Ignore cleanup errors
          }
        }

        if (result.story_id || result.story_url) {
          let message = "✅ Đăng Story với nhạc thành công!\n\n";
          if (result.story_id) {
            message += `📌 Story ID: ${result.story_id}\n`;
          }
          if (result.story_url) {
            message += `🔗 Link: ${result.story_url}`;
          }
          await reply(message);
        } else {
          await reply("❌ Không tạo được Story. Vui lòng thử lại!");
        }
      } else {
        // Search for music and show list
        const musicSearchQuery = musicInput;
        const token = config?.token?.EAAAAU || getConfig()?.token?.EAAAAU;

        if (!token) {
          await reply("❌ Không tìm thấy token để tìm kiếm nhạc!");
          return;
        }

        await reply("⏳ Đang tìm kiếm nhạc, vui lòng đợi...");

        try {
          const tracks = await searchMusic(musicSearchQuery, token);

          if (tracks.length === 0) {
            await reply("❌ Không tìm thấy nhạc phù hợp với từ khóa: " + musicSearchQuery);
            // Clean up temp file
            if (typeof imagePath === "string" && fs.existsSync(imagePath)) {
              try {
                fs.unlinkSync(imagePath);
              } catch { }
            }
            return;
          }

          // Show music list
          let message = `🎵 Tìm thấy ${tracks.length} bài nhạc:\n\n`;
          tracks.slice(0, 10).forEach((track, index) => {
            const duration = track.duration_in_ms
              ? `${Math.floor(track.duration_in_ms / 1000)}s`
              : "";
            message += `${index + 1}. ${track.title}\n`;
            message += `   👤 ${track.artist}\n`;
            if (duration) message += `   ⏱️ ${duration}\n`;
            message += `   🆔 ${track.id}\n\n`;
          });

          if (tracks.length > 10) {
            message += `... và ${tracks.length - 10} bài khác\n\n`;
          }

          message += "👉 Reply số thứ tự (1-" + Math.min(tracks.length, 10) + ") để chọn nhạc";

          // Save data for onReply
          const { main } = ctx as any;
          if (main && main.onReply) {
            await client.sendMessage(message, threadID, async (err: any, info: any) => {
              if (err || !info?.messageID) {
                await reply("❌ Không thể gửi danh sách nhạc");
                return;
              }

              // Save to onReply
              main.onReply.set(info.messageID, {
                commandName: "storymusic",
                author: event.senderID,
                messageID: info.messageID,
                type: "storymusic-select",
                data: {
                  imagePath,
                  tracks: tracks.slice(0, 10),
                  userId: String(userId)
                }
              });
            }, event.messageID);
          } else {
            await reply(message);
            await reply("⚠️ Hệ thống không hỗ trợ onReply. Vui lòng dùng ID nhạc trực tiếp.");
            // Clean up temp file
            if (typeof imagePath === "string" && fs.existsSync(imagePath)) {
              try {
                fs.unlinkSync(imagePath);
              } catch { }
            }
          }
        } catch (err: any) {
          console.error("Search music error:", err);
          await reply("❌ Lỗi khi tìm kiếm nhạc: " + (err?.message || String(err)));
          // Clean up temp file
          if (typeof imagePath === "string" && fs.existsSync(imagePath)) {
            try {
              fs.unlinkSync(imagePath);
            } catch { }
          }
        }
      }
    } catch (err: any) {
      console.error("Story music error:", err);
      await reply(
        "❌ Lỗi khi đăng Story: " + (err?.message || String(err)) + "\n\n" + "Vui lòng kiểm tra:\n" + "• Ảnh có hợp lệ không\n" + "• ID nhạc hoặc tên nhạc có đúng không\n" + "• Token có quyền đăng Story không"
      );
    }
  },
  onReply: async function (ctx: CommandOnReplyContext): Promise<void> {
    const { client, event, Reply, reply } = ctx;

    try {
      // Check if reply is for this command
      if (!Reply || Reply.commandName !== "storymusic" || Reply.type !== "storymusic-select") {
        return;
      }

      // Check if user is the author
      if (String(Reply.author) !== String(event.senderID)) {
        await reply("❌ Bạn không phải người dùng lệnh này");
        return;
      }

      const replyData = (Reply.data as any) as {
        imagePath: string | Buffer;
        tracks: Array<{ id: string; title: string; artist: string }>;
        userId: string;
      };

      if (!replyData || !replyData.tracks || !replyData.imagePath) {
        await reply("❌ Dữ liệu không hợp lệ. Vui lòng thử lại từ đầu.");
        return;
      }

      // Get selected track number
      const selectedNum = parseInt((event.body || "").trim(), 10);
      if (isNaN(selectedNum) || selectedNum < 1 || selectedNum > replyData.tracks.length) {
        await reply(`❌ Vui lòng reply số từ 1 đến ${replyData.tracks.length}`);
        return;
      }

      const selectedTrack = replyData.tracks[selectedNum - 1];
      if (!selectedTrack) {
        await reply("❌ Không tìm thấy bài nhạc được chọn");
        return;
      }

      await reply(`⏳ Đang đăng Story với nhạc: ${selectedTrack.title} - ${selectedTrack.artist}...`);

      // Get config from context (with fallback)
      const replyConfig = (ctx as any).config || getConfig();

      // Upload story with selected music
      const result = await uploadStoryWithMusic({
        imagePath: replyData.imagePath,
        musicAssetId: selectedTrack.id,
        trimStart: 0,
        trimEnd: 15000, // 15 seconds default
        userId: replyData.userId
      }, replyConfig);

      // Clean up temp file
      if (typeof replyData.imagePath === "string" && fs.existsSync(replyData.imagePath)) {
        try {
          fs.unlinkSync(replyData.imagePath);
        } catch {
          // Ignore cleanup errors
        }
      }

      // Unsend the list message
      try {
        await client.unsendMessage(Reply.messageID);
      } catch {
        // Ignore if unsend fails
      }

      if (result.story_id || result.story_url) {
        let message = "✅ Đăng Story với nhạc thành công!\n\n";
        message += `🎵 ${selectedTrack.title}\n`;
        message += `👤 ${selectedTrack.artist}\n\n`;
        if (result.story_id) {
          message += `📌 Story ID: ${result.story_id}\n`;
        }
        if (result.story_url) {
          message += `🔗 Link: ${result.story_url}`;
        }
        await reply(message);
      } else {
        await reply("❌ Không tạo được Story. Vui lòng thử lại!");
      }
    } catch (err: any) {
      console.error("Story music onReply error:", err);
      await reply("❌ Lỗi khi xử lý: " + (err?.message || String(err)));
    }
  }
};

export default storyMusicCommand;
