/**
 * Điểm thống nhất cho mọi đường dẫn storage của dự án.
 * Tất cả dữ liệu lưu trữ (JSON, SQLite, media, game, …) đều nằm dưới STORAGE_ROOT (`./storage` tại root project).
 */
import path from "path";

/** Thư mục gốc storage (cùng cấp với src/). */
export const STORAGE_ROOT = path.join(process.cwd(), "storage");

/**
 * Trả về đường dẫn tuyệt đối trong storage.
 * @example storagePath("rent", "rent.json") => "<cwd>/storage/rent/rent.json"
 */
export function storagePath(...segments: string[]): string {
  return path.join(STORAGE_ROOT, ...segments);
}

/** Rent */
export const STORAGE_RENT = () => storagePath("rent");
export const RENT_JSON_PATH = () => storagePath("rent", "rent.json");
export const RENT_KEYS_PATH = () => storagePath("rent", "keys.json");

/** Other (config, quotes, countdown, setname, shortcut, canhbao, …) */
export const STORAGE_OTHER = () => storagePath("other");

/** Auto interact / feed state */
export const STORAGE_AUTO_INTERACT = () => storagePath("auto_interact");
export const FEED_STATE_PATH = () => storagePath("auto_interact", "feed_state.json");

/** Bank */
export const STORAGE_BANK = () => storagePath("bank");
export const STORAGE_BANK_DATA = () => storagePath("bank", "data");

/** SQLite */
export const STORAGE_SQLITE = () => storagePath("sqlite");
export const DB_PATH = () => path.join(STORAGE_SQLITE(), "database.sqlite");

/** Media (video upload, girl, image, font, …) */
export const STORAGE_MEDIA = () => storagePath("media");
export const STORAGE_FONT = () => storagePath("font");
export const STORAGE_IMAGE = () => storagePath("image");
export const STORAGE_BACKUPS = () => storagePath("backups");

/** Game — JSON/asset/runtime dưới `./storage/game` */
export const STORAGE_GAME = () => storagePath("game");

/** Gemini */
export const STORAGE_GEMINI = () => storagePath("gemini");
export const GEMINI_API_QUOTA_JSON = () => storagePath("gemini", "api-quota.json");

export const GEMINI_API_QUOTA_JSON_ALT = () =>
  path.join(STORAGE_ROOT, "gemini.api-quota.json");

/** Cookies */
export const STORAGE_COOKIES = () => storagePath("cookies");

/** Temp (`./temp` ở root project) */
export const TEMP_DIR = () => path.join(process.cwd(), "temp");
export function tempPath(...segments: string[]): string {
  return path.join(TEMP_DIR(), ...segments);
}

/** Anti / set_media */
export const STORAGE_ANTI = () => storagePath("anti");
export const STORAGE_SET_MEDIA = () => storagePath("set_media");
