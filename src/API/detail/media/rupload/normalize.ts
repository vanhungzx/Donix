"use strict";

import axios from "axios";
import fs from "fs";
import path from "path";
import type { Readable } from "node:stream";
import { isReadableStream } from "../../../request/formatters";
import { detectContentType, detectContentTypeFromBuffer } from "./contentType";
import {
  isHttpUrl,
  isLikelyFilePath,
  logRupload,
  readMagicBytes,
} from "./helpers";
import type { AttachmentSource, NormalizedAttachment } from "./types";

async function peekReadable(
  readable: Readable,
  maxBytes: number
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    const cleanup = (): void => {
      readable.removeListener("data", onData);
      readable.removeListener("error", onError);
      readable.removeListener("end", onEnd);
    };

    const finish = (): void => {
      cleanup();
      resolve(Buffer.concat(chunks).subarray(0, maxBytes));
    };

    const onData = (chunk: Buffer | string): void => {
      const asBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(asBuffer);
      totalBytes += asBuffer.length;
      if (totalBytes >= maxBytes) {
        const merged = Buffer.concat(chunks);
        const peeked = merged.subarray(0, maxBytes);
        const rest = merged.subarray(maxBytes);
        cleanup();
        if (rest.length > 0) {
          readable.unshift(rest);
        }
        resolve(peeked);
      }
    };

    const onError = (err: Error): void => {
      cleanup();
      reject(err);
    };

    const onEnd = (): void => finish();

    readable.on("data", onData);
    readable.on("error", onError);
    readable.on("end", onEnd);

    if (readable.readable && readable.isPaused()) {
      readable.resume();
    }
  });
}

export async function bufferFromSource(
  input: AttachmentSource
): Promise<NormalizedAttachment> {
  if (!input) {
    throw new Error("Invalid attachment source");
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (
      trimmed === "" ||
      trimmed === "https://" ||
      trimmed === "http://" ||
      trimmed === "s" ||
      trimmed === "rd_girl" ||
      trimmed === "anime" ||
      trimmed.length === 1
    ) {
      throw new Error(`Invalid string source: "${input}"`);
    }
  }

  if (Buffer.isBuffer(input)) {
    const sniffed = detectContentTypeFromBuffer(input);
    return {
      buffer: input,
      filename: `file-${Date.now()}`,
      contentType: sniffed || "application/octet-stream",
      size: input.length,
    };
  }

  if (typeof input === "string") {
    if (isLikelyFilePath(input)) {
      if (!fs.existsSync(input) || !fs.statSync(input).isFile()) {
        throw new Error(`File path does not exist or is not a file: ${input}`);
      }

      const filename = path.basename(input);
      const stats = fs.statSync(input);
      const magicBytes = await readMagicBytes(input);
      const sniffed = detectContentTypeFromBuffer(magicBytes);

      return {
        filePath: input,
        filename,
        contentType: sniffed || detectContentType(filename),
        size: stats.size,
      };
    }

    if (isHttpUrl(input)) {
      let filename = `file-${Date.now()}`;
      try {
        const urlObj = new URL(input);
        const extracted = urlObj.pathname ? path.basename(urlObj.pathname) : "";
        if (extracted) filename = extracted;
      } catch {
        // ignore invalid pathname parsing, axios will handle the URL failure
      }

      const response = await axios.get<ArrayBuffer>(input, {
        responseType: "arraybuffer",
        maxRedirects: 5,
      });
      const buffer = Buffer.from(response.data);
      const magicBytes =
        buffer.length > 8192 ? buffer.subarray(0, 8192) : buffer;
      const sniffed =
        magicBytes.length >= 4 ? detectContentTypeFromBuffer(magicBytes) : null;
      const headerContentType = response.headers["content-type"];
      const contentType =
        typeof headerContentType === "string" &&
        headerContentType !== "application/octet-stream"
          ? headerContentType
          : sniffed || detectContentType(filename);

      return {
        buffer,
        filename,
        contentType,
        size: buffer.length,
      };
    }

    throw new Error(`Unsupported string source: ${input}`);
  }

  if (isReadableStream(input)) {
    const readable = input as Readable & { path?: string };
    if (
      typeof readable.path === "string" &&
      fs.existsSync(readable.path) &&
      fs.statSync(readable.path).isFile()
    ) {
      const filename = path.basename(readable.path);
      const stats = fs.statSync(readable.path);
      const magicBytes = await readMagicBytes(readable.path);
      const sniffed = detectContentTypeFromBuffer(magicBytes);

      return {
        filePath: readable.path,
        filename,
        contentType: sniffed || detectContentType(filename),
        size: stats.size,
      };
    }

    const magicBytes = await peekReadable(readable, 8);
    const sniffed = detectContentTypeFromBuffer(magicBytes);
    if (sniffed) {
      logRupload(`Auto-detected contentType from stream: ${sniffed}`, "info");
    }

    return {
      stream: readable,
      filename: `file-${Date.now()}`,
      contentType: sniffed || "application/octet-stream",
      size: 0,
    };
  }

  const obj = input as Exclude<AttachmentSource, string | Buffer | Readable>;
  if (obj.buffer && Buffer.isBuffer(obj.buffer)) {
    const filename = obj.filename || `file-${Date.now()}`;
    const sniffed = detectContentTypeFromBuffer(obj.buffer);
    return {
      buffer: obj.buffer,
      filename,
      contentType:
        obj.contentType ||
        sniffed ||
        detectContentType(filename) ||
        "application/octet-stream",
      size: obj.buffer.length,
    };
  }

  if (obj.data && Buffer.isBuffer(obj.data)) {
    const filename = obj.filename || `file-${Date.now()}`;
    const sniffed = detectContentTypeFromBuffer(obj.data);
    return {
      buffer: obj.data,
      filename,
      contentType:
        obj.contentType ||
        sniffed ||
        detectContentType(filename) ||
        "application/octet-stream",
      size: obj.data.length,
    };
  }

  if (obj.path) {
    if (!fs.existsSync(obj.path) || !fs.statSync(obj.path).isFile()) {
      throw new Error(`File path does not exist or is not a file: ${obj.path}`);
    }

    const filename = obj.filename || path.basename(obj.path);
    const stats = fs.statSync(obj.path);
    const magicBytes = await readMagicBytes(obj.path);
    const sniffed = detectContentTypeFromBuffer(magicBytes);

    return {
      filePath: obj.path,
      filename,
      contentType:
        obj.contentType ||
        sniffed ||
        detectContentType(filename) ||
        "application/octet-stream",
      size: stats.size,
    };
  }

  if (typeof obj.url === "string") {
    return await bufferFromSource(obj.url);
  }

  if (obj.stream && isReadableStream(obj.stream)) {
    const readable = obj.stream as Readable;
    const filename = obj.filename || `file-${Date.now()}`;
    const magicBytes = await peekReadable(readable, 8);
    const sniffed = detectContentTypeFromBuffer(magicBytes);

    return {
      stream: readable,
      filename,
      contentType:
        obj.contentType ||
        sniffed ||
        detectContentType(filename) ||
        "application/octet-stream",
      size: 0,
    };
  }

  throw new Error("Unable to normalize attachment source");
}
