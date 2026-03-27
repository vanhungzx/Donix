"use strict";

import path from "path";
import { logRupload } from "./helpers";
import type { RuploadMediaType } from "./types";

function isMpegAudioFrameHeader(b0: number, b1: number, b2: number): boolean {
  if (b0 !== 0xff) return false;
  if ((b1 & 0xe0) !== 0xe0) return false;

  const versionId = (b1 >> 3) & 0x03;
  if (versionId === 0x01) return false;

  const layer = (b1 >> 1) & 0x03;
  if (layer === 0x00) return false;

  const bitrateIndex = (b2 >> 4) & 0x0f;
  if (bitrateIndex === 0x0f) return false;

  const samplingIndex = (b2 >> 2) & 0x03;
  if (samplingIndex === 0x03) return false;

  return true;
}

function sniffEbmlDocType(buffer: Buffer): "webm" | "matroska" | null {
  if (buffer.length < 4) return null;
  if (
    !(
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    )
  ) {
    return null;
  }

  const scanLen = Math.min(buffer.length, 64 * 1024);
  const haystack = buffer.subarray(0, scanLen).toString("latin1");
  if (haystack.includes("webm")) return "webm";
  if (haystack.includes("matroska")) return "matroska";
  return null;
}

export function detectContentTypeFromBuffer(
  buffer: Buffer | null | undefined
): string | null {
  if (!buffer || buffer.length < 4) return null;

  const header16 = buffer.subarray(0, 16);
  const ebml = sniffEbmlDocType(buffer);
  if (ebml === "webm") return "video/webm";
  if (ebml === "matroska") return "video/x-matroska";

  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    const videoBrands = new Set([
      "isom",
      "iso2",
      "avc1",
      "mp41",
      "mp42",
      "dash",
      "M4V ",
    ]);
    const audioBrands = new Set(["M4A ", "mp4a"]);

    if (audioBrands.has(brand)) return "audio/mp4";
    if (videoBrands.has(brand) || brand.includes("mp4")) return "video/mp4";
    if (brand.includes("qt")) return "video/quicktime";
    return "video/mp4";
  }

  if (header16.subarray(0, 4).toString("ascii") === "RIFF") {
    const riffType = header16.subarray(8, 12).toString("ascii");
    if (riffType === "WAVE") return "audio/wav";
    if (riffType === "AVI ") return "video/x-msvideo";
    if (riffType === "WEBP") return "image/webp";
  }

  if (header16.subarray(0, 3).toString("ascii") === "FLV") return "video/x-flv";
  if (header16.subarray(0, 3).toString("ascii") === "ID3") return "audio/mpeg";
  if (
    buffer.length >= 3 &&
    isMpegAudioFrameHeader(buffer[0], buffer[1], buffer[2])
  ) {
    return "audio/mpeg";
  }

  if (header16.subarray(0, 4).toString("ascii") === "OggS") return "audio/ogg";
  if (header16.subarray(0, 4).toString("ascii") === "fLaC") return "audio/flac";

  if (
    header16.subarray(0, 6).toString("ascii") === "GIF87a" ||
    header16.subarray(0, 6).toString("ascii") === "GIF89a"
  ) {
    return "image/gif";
  }
  if (
    header16[0] === 0x89 &&
    header16[1] === 0x50 &&
    header16[2] === 0x4e &&
    header16[3] === 0x47
  ) {
    return "image/png";
  }
  if (header16[0] === 0xff && header16[1] === 0xd8 && header16[2] === 0xff) {
    return "image/jpeg";
  }
  if (header16.subarray(0, 2).toString("ascii") === "BM") return "image/bmp";
  if (
    (header16[0] === 0x49 && header16[1] === 0x49 && header16[2] === 0x2a) ||
    (header16[0] === 0x4d && header16[1] === 0x4d && header16[2] === 0x2a)
  ) {
    return "image/tiff";
  }

  return null;
}

export function detectContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    case ".mkv":
      return "video/x-matroska";
    case ".avi":
      return "video/x-msvideo";
    case ".flv":
      return "video/x-flv";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    case ".flac":
      return "audio/flac";
    default:
      return "application/octet-stream";
  }
}

export function detectMediaTypeFromBuffer(
  buffer: Buffer
): RuploadMediaType | null {
  const mime = detectContentTypeFromBuffer(buffer);
  if (!mime) return null;
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "image/gif") return "gif";
  if (mime.startsWith("image/")) return "image";
  return null;
}

export function detectMediaType(
  contentType: string | undefined,
  filename: string,
  buffer?: Buffer
): RuploadMediaType {
  if (buffer && buffer.length >= 4) {
    const bufferType = detectMediaTypeFromBuffer(buffer);
    if (bufferType) {
      logRupload(
        `Detected media type from buffer magic bytes: ${bufferType}`,
        "info"
      );
      return bufferType;
    }
  }

  const mime =
    contentType && contentType.toLowerCase() !== "application/octet-stream"
      ? contentType.toLowerCase()
      : "";
  const ext = path.extname(filename).toLowerCase();

  if (
    mime.includes("video") ||
    [".mp4", ".mov", ".avi", ".webm", ".mkv", ".flv", ".m4v", ".3gp"].includes(
      ext
    )
  ) {
    return "video";
  }
  if (
    mime.includes("audio") ||
    [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".opus"].includes(ext)
  ) {
    return "audio";
  }
  if (mime.includes("gif") || ext === ".gif") {
    return "gif";
  }

  return "image";
}
