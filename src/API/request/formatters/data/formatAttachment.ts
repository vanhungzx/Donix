import type { MessageAttachment } from "@types";
import * as querystring from "querystring";
import * as url from "url";

type AttachmentInput = Record<string, unknown>;
type AttachmentMap = Record<string, AttachmentInput>;

const asRecord = (val: unknown): Record<string, unknown> =>
  typeof val === "object" && val !== null ? (val as Record<string, unknown>) : {};

const toNumber = (val: unknown): number | undefined => {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = Number(val);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

const getExtension = (originalExtension?: string, fullFileName = ""): string => {
  if (originalExtension) return originalExtension;
  const extension = fullFileName.split(".").pop() || "";
  return extension === fullFileName ? "" : extension;
};

const _formatAttachment = (
  attachment1: AttachmentInput
): MessageAttachment => {
  const blobAttachment = (attachment1.mercury ??
    attachment1.blob_attachment ??
    attachment1.sticker_attachment) as AttachmentInput | undefined;
  let typeAttachment = blobAttachment?.__typename as string | undefined;
  if (!typeAttachment) {
    typeAttachment = attachment1.attach_type as string | undefined;
  }

  if (typeAttachment == null && attachment1.id != null && attachment1.extensible_attachment == null) {
    return {
      type: "share",
      ID: (attachment1.id as string | number | undefined)?.toString(),
      url: attachment1.href as string | undefined,
      title: "Shared Content",
      description: "Unsupported shared content.",
      source: null,
      isUnrecognized: true,
    };
  }

  if (!attachment1.attach_type && attachment1.imageMetadata) {
    const img = asRecord(attachment1.imageMetadata);
    return {
      type: "photo",
      ID: (attachment1.fbid as string | number | undefined)?.toString(),
      filename: attachment1.filename as string | undefined,
      fileSize: Number(attachment1.fileSize ?? 0),
      mimeType: attachment1.mimeType as string | undefined,
      width: img.width as number | undefined,
      height: img.height as number | undefined,
      url: undefined,
      thumbnailUrl: undefined,
      previewUrl: undefined,
      largePreviewUrl: undefined,
      name: attachment1.filename as string | undefined,
    };
  }

  const normalizedAttachment = (attachment1.mercury ?? attachment1) as AttachmentInput;
  let blob = (normalizedAttachment.blob_attachment ??
    normalizedAttachment.sticker_attachment) as AttachmentInput | undefined;
  let type =
    (blob?.__typename as string | undefined) ?? (normalizedAttachment.attach_type as string | undefined);

  if (!type && normalizedAttachment.sticker_attachment) {
    type = "StickerAttachment";
    blob = normalizedAttachment.sticker_attachment as AttachmentInput;
  } else if (!type && normalizedAttachment.extensible_attachment) {
    const ext = normalizedAttachment.extensible_attachment as AttachmentInput;
    const story = asRecord(ext.story_attachment);
    if (asRecord(story.target).__typename === "MessageLocation") {
      type = "MessageLocation";
    } else {
      type = "ExtensibleAttachment";
    }
    blob = ext;
  }

  const blobRec = asRecord(blob);

  switch (type) {
    case "MessageImage":
      return {
        type: "photo",
        ID: (blobRec.legacy_attachment_id as string | number | undefined)?.toString(),
        filename: blobRec.filename as string | undefined,
        thumbnailUrl: asRecord(blobRec.thumbnail).uri as string | undefined,
        previewUrl: asRecord(blobRec.preview).uri as string | undefined,
        previewWidth: asRecord(blobRec.preview).width as number | undefined,
        previewHeight: asRecord(blobRec.preview).height as number | undefined,
        largePreviewUrl: asRecord(blobRec.large_preview).uri as string | undefined,
        largePreviewWidth: asRecord(blobRec.large_preview).width as number | undefined,
        largePreviewHeight: asRecord(blobRec.large_preview).height as number | undefined,
        url: asRecord(blobRec.large_preview).uri as string | undefined,
        width: asRecord(blobRec.original_dimensions).x as number | undefined,
        height: asRecord(blobRec.original_dimensions).y as number | undefined,
        name: blobRec.filename as string | undefined,
      };
    case "MessageAnimatedImage":
      return {
        type: "animated_image",
        ID: (blobRec.legacy_attachment_id as string | number | undefined)?.toString(),
        name: blobRec.filename as string | undefined,
        previewUrl: asRecord(blobRec.preview_image).uri as string | undefined,
        previewWidth: asRecord(blobRec.preview_image).width as number | undefined,
        previewHeight: asRecord(blobRec.preview_image).height as number | undefined,
        url: asRecord(blobRec.animated_image).uri as string | undefined,
        width: asRecord(blobRec.animated_image).width as number | undefined,
        height: asRecord(blobRec.animated_image).height as number | undefined,
        facebookUrl: asRecord(blobRec.animated_image).uri as string | undefined,
      };
    case "MessageVideo":
      return {
        type: "video",
        ID: (blobRec.legacy_attachment_id as string | number | undefined)?.toString(),
        filename: blobRec.filename as string | undefined,
        duration: blobRec.playable_duration_in_ms as number | undefined,
        thumbnailUrl: asRecord(blobRec.large_image).uri as string | undefined,
        previewUrl: asRecord(blobRec.large_image).uri as string | undefined,
        previewWidth: asRecord(blobRec.large_image).width as number | undefined,
        previewHeight: asRecord(blobRec.large_image).height as number | undefined,
        url: blobRec.playable_url as string | undefined,
        width: asRecord(blobRec.original_dimensions).x as number | undefined,
        height: asRecord(blobRec.original_dimensions).y as number | undefined,
        videoType: (blobRec.video_type as string | undefined)?.toLowerCase(),
      };
    case "MessageFile":
      return {
        type: "file",
        ID: blobRec.message_file_fbid as string | undefined,
        filename: blobRec.filename as string | undefined,
        url: blobRec.url as string | undefined,
        isMalicious: blobRec.is_malicious as boolean | undefined,
        contentType: blobRec.content_type as string | undefined,
        name: blobRec.filename as string | undefined,
      };
    case "MessageAudio":
      return {
        type: "audio",
        ID: blobRec.url_shimhash as string | undefined,
        filename: blobRec.filename as string | undefined,
        duration: blobRec.playable_duration_in_ms as number | undefined,
        audioType: blobRec.audio_type as string | undefined,
        url: blobRec.playable_url as string | undefined,
        isVoiceMail: blobRec.is_voicemail as boolean | undefined,
      };
    case "Sticker":
    case "StickerAttachment":
      return {
        type: "sticker",
        ID: blobRec.id as string | undefined,
        url: blobRec.url as string | undefined,
        packID: asRecord(blobRec.pack).id as string | undefined,
        spriteUrl: blobRec.sprite_image as string | undefined,
        spriteUrl2x: blobRec.sprite_image_2x as string | undefined,
        width: toNumber(blobRec.width),
        height: toNumber(blobRec.height),
        caption: blobRec.label as string | undefined,
        description: blobRec.label as string | undefined,
        frameCount: toNumber(blobRec.frame_count),
        frameRate: toNumber(blobRec.frame_rate),
        framesPerRow: toNumber(blobRec.frames_per_row),
        framesPerCol: toNumber(blobRec.frames_per_column),
        stickerID: blobRec.id as string | undefined,
      };
    case "ExtensibleAttachment": {
      const story = asRecord(blobRec.story_attachment);
      const media = asRecord(story.media);
      const image = asRecord(media.image);
      const propertiesArr = Array.isArray(story.properties)
        ? (story.properties as Array<Record<string, unknown>>)
        : [];
      return {
        type: "share",
        ID: story.legacy_attachment_id as string | undefined,
        url: story.url as string | undefined,
        title: asRecord(story.title_with_entities).text as string | undefined,
        description: asRecord(story.description).text as string | undefined,
        source: asRecord(story.source).text as string | null | undefined,
        image: image.uri as string | undefined,
        width: image.width as number | undefined,
        height: image.height as number | undefined,
        playable: media.is_playable as boolean | undefined,
        duration: media.playable_duration_in_ms as number | undefined,
        playableUrl: media.playable_url as string | null | undefined,
        subattachments:
          (story.subattachments as Array<Record<string, string | number | boolean | null | undefined>>) ||
          [],
        properties: propertiesArr.reduce<Record<string, string>>((obj, cur) => {
          const key = cur.key as string | undefined;
          const value = asRecord(cur.value).text as string | undefined;
          if (key && value !== undefined) obj[key] = value;
          return obj;
        }, {}),
        facebookUrl: story.url as string | undefined,
        target: story.target as Record<string, string | number | boolean | null | undefined> | undefined,
        styleList:
          story.style_list as Array<Record<string, string | number | boolean | null | undefined>> | undefined,
      };
    }
    case "MessageLocation": {
      const storyAttachment = asRecord(blobRec.story_attachment);
      const urlAttach = storyAttachment.url as string | undefined;
      const mediaAttach = asRecord(storyAttachment.media);
      const parsedUrl = url.parse(urlAttach || "");
      const shareUrl = querystring.parse(parsedUrl.query || "").u as string | undefined;
      const locationQuery = querystring.parse(url.parse(shareUrl || "").query || "").where1 as string | undefined;
      const address = (locationQuery || "").split(", ");
      const latitude = toNumber(address[0]);
      const longitude = toNumber(address[1]);

      const image = asRecord(mediaAttach.image);
      const imageUrl = image.uri as string | undefined;
      const width = image.width as number | undefined;
      const height = image.height as number | undefined;

      return {
        type: "location",
        ID: storyAttachment.legacy_attachment_id as string | undefined,
        latitude,
        longitude,
        image: imageUrl,
        width,
        height,
        url: shareUrl || urlAttach,
        address: locationQuery,
        facebookUrl: storyAttachment.url as string | undefined,
        target:
          storyAttachment.target as Record<string, string | number | boolean | null | undefined> | undefined,
        styleList:
          storyAttachment.style_list as Array<Record<string, string | number | boolean | null | undefined>> | undefined,
      };
    }
    default:
      return { type: "unknown", error: `Unrecognized attachment type: ${type}` };
  }
};

const formatAttachment = (
  attachments: AttachmentInput | AttachmentInput[],
  attachmentIds?: Array<string | number>,
  attachmentMap?: AttachmentMap,
  shareMap?: AttachmentMap
): MessageAttachment[] => {
  const map = shareMap || attachmentMap;
  if (!attachments) return [];
  const normalized = Array.isArray(attachments) ? attachments : [attachments];

  return normalized.map((val, i) => {
    const key = attachmentIds?.[i];
    if (!map || !key || !map[key]) {
      return _formatAttachment(val);
    }
    return _formatAttachment(val);
  });
};

export { _formatAttachment, formatAttachment, getExtension };
