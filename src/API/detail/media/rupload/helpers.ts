"use strict";

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Readable } from "node:stream";
import logger from "../../../../core/logger";
import type {
  AttachmentSource,
  RuploadMediaType,
  RuploadTask,
} from "./types";

type RuploadLogLevel = "info" | "warn" | "error" | "success" | "system";

export function logRupload(
  message: string,
  level: RuploadLogLevel = "info"
): void {
  const line = `[ruploadAttachment] ${message}`;
  const writer = logger[level] || logger.info;
  writer(line);
}

export function isLikelyFilePath(input: string): boolean {
  if (input.includes(path.sep) || input.includes("/") || input.includes("\\")) {
    return true;
  }
  if (path.isAbsolute(input)) return true;
  if (
    input.includes(`storage${path.sep}media`) ||
    input.includes("storage/media")
  ) {
    return true;
  }

  if (!input.includes("://") && input.length > 0) {
    const trimmed = input.trim();
    if (trimmed.length > 0 && !/^https?:\/\//i.test(trimmed)) {
      return true;
    }
  }

  return false;
}

export function isHttpUrl(input: string): boolean {
  if (!/^https?:\/\//i.test(input)) return false;
  try {
    const urlObj = new URL(input);
    return Boolean(urlObj.hostname && urlObj.hostname.trim() !== "");
  } catch {
    return false;
  }
}

export async function streamToBuffer(readable: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return await new Promise<Buffer>((resolve, reject) => {
    readable.on("data", (chunk: Buffer | string) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    );
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
    if (readable.readable && readable.isPaused()) {
      readable.resume();
    }
  });
}

export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function ensureString(
  value: string | number | null | undefined
): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? value : String(value);
}

export function stringifyHeaderValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function safeJsonParse(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

export function normalizeTask(
  input: AttachmentSource | RuploadTask
): RuploadTask {
  if (typeof input === "object" && input !== null && "source" in input) {
    return input as RuploadTask;
  }
  return { source: input as AttachmentSource };
}

export function sanitizeHeaderFilename(filename: string): string {
  if (!filename) return "";

  let base = path.basename(filename);
  base = base
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .trim();

  if (base.length < 3 || !/^[a-zA-Z0-9._-]+$/.test(base)) {
    return "";
  }

  if (base.length > 200) {
    const ext = path.extname(base);
    const nameWithoutExt = base.slice(0, 200 - ext.length);
    base = `${nameWithoutExt}${ext}`;
  }

  return base;
}

export function buildEntityName(
  mediaType: RuploadMediaType,
  filename: string
): string {
  if (mediaType === "image") {
    return `${generateUUID().toUpperCase()}.jpg`;
  }

  const base = path.basename(filename);
  const sanitized = sanitizeHeaderFilename(base);
  if (!sanitized) {
    const ext =
      path.extname(base) ||
      (mediaType === "video"
        ? ".mp4"
        : mediaType === "audio"
          ? ".mp3"
          : "");
    return `${generateUUID().toUpperCase()}${ext}`;
  }

  return sanitized;
}

export async function computeMediaHash(
  source: Buffer | Readable
): Promise<string> {
  const hash = crypto.createHash("sha256");

  if (Buffer.isBuffer(source)) {
    hash.update(source);
    return hash.digest("hex");
  }

  return await new Promise<string>((resolve, reject) => {
    source.on("data", (chunk: Buffer | string) => {
      hash.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    source.on("end", () => resolve(hash.digest("hex")));
    source.on("error", reject);
    if (source.readable && source.isPaused()) {
      source.resume();
    }
  });
}

export async function readMagicBytes(filePath: string): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    fs.open(filePath, "r", (openErr, fd) => {
      if (openErr) {
        reject(openErr);
        return;
      }

      const buffer = Buffer.alloc(8);
      fs.read(fd, buffer, 0, 8, 0, (readErr, bytesRead) => {
        fs.close(fd, () => undefined);
        if (readErr) {
          reject(readErr);
          return;
        }
        resolve(buffer.slice(0, bytesRead));
      });
    });
  });
}
