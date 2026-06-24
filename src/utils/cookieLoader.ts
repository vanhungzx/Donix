import fs from "node:fs/promises";
import path from "node:path";
import log from "./log";
import { STORAGE_COOKIES } from "../core/storagePath";

const COOKIES_DIR = STORAGE_COOKIES();

const LEGACY_DIRS = [
  path.join(process.cwd(), "cookies"),
  path.join(process.cwd(), "src", "cookies"),
];

async function migrateLegacyCookies(): Promise<void> {
  for (const legacyDir of LEGACY_DIRS) {
    if (legacyDir === COOKIES_DIR) continue;
    try {
      await fs.access(legacyDir);
    } catch {
      continue;
    }
    try {
      await fs.mkdir(COOKIES_DIR, { recursive: true });
      const files = await fs.readdir(legacyDir);
      const txtFiles = files.filter((f) => f.endsWith(".txt"));
      for (const f of txtFiles) {
        const from = path.join(legacyDir, f);
        const to = path.join(COOKIES_DIR, f);
        try {
          // copy (không xóa) để tránh mất cookie nếu đang dùng song song
          await fs.copyFile(from, to);
        } catch { }
      }
    } catch { }
  }
}

/**
 * Loads all cookie files from the cookies directory
 * Files should be named like: capcut.txt, tiktok.txt, etc.
 * They will be accessible via global.cookie.capcut, global.cookie.tiktok, etc.
 */
export async function loadCookies(): Promise<Record<string, string>> {
  const cookies: Record<string, string> = {};

  try {
    await migrateLegacyCookies();
    // Check if cookies directory exists
    try {
      await fs.access(COOKIES_DIR);
    } catch {
      // Directory doesn't exist, create it
      await fs.mkdir(COOKIES_DIR, { recursive: true });
      log.info(`Đã tạo thư mục cookies: ${COOKIES_DIR}`);
      return cookies;
    }

    // Read all files in the cookies directory
    const files = await fs.readdir(COOKIES_DIR);

    // Filter only .txt files
    const txtFiles = files.filter((file) => file.endsWith(".txt"));

    // Load each cookie file
    for (const file of txtFiles) {
      const filePath = path.join(COOKIES_DIR, file);
      const cookieName = path.basename(file, ".txt"); // Remove .txt extension

      try {
        const content = await fs.readFile(filePath, "utf-8");
        const trimmedContent = content.trim();

        if (trimmedContent) {
          cookies[cookieName] = trimmedContent;
          log.success(`Đã load cookie: ${cookieName}`);
        } else {
          log.warn(`File cookie trống: ${file}`);
        }
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error(`Lỗi khi đọc file cookie ${file}: ${err.message || String(error)}`);
      }
    }

    if (Object.keys(cookies).length > 0) {
      log.success(`Đã load ${Object.keys(cookies).length} cookie(s): ${Object.keys(cookies).join(", ")}`);
    } else {
      log.info("Không tìm thấy file cookie nào trong thư mục cookies/");
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error(`Lỗi khi load cookies: ${err.message || String(error)}`);
  }

  return cookies;
}

/**
 * Initializes global.cookie with loaded cookies
 */
export async function initGlobalCookies(): Promise<void> {
  const cookies = await loadCookies();

  const globalAny = global as typeof globalThis & {
    cookie?: Record<string, string>;
    Donix?: { cookie?: Record<string, string> };
  };

  // Initialize global.cookie
  if (!globalAny.cookie) {
    globalAny.cookie = {};
  }

  // Merge loaded cookies into global.cookie
  Object.assign(globalAny.cookie, cookies);

  // Also set in global.Donix.cookie for compatibility
  if (!globalAny.Donix) {
    globalAny.Donix = {};
  }
  if (!globalAny.Donix.cookie) {
    globalAny.Donix.cookie = {};
  }
  Object.assign(globalAny.Donix.cookie, cookies);
}
