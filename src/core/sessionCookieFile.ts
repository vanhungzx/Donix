import fs from "fs";
import path from "path";

/** Cookie phiên Facebook: file `cookie.txt` tại thư mục gốc project (không commit). */
export function sessionCookiePath(): string {
  return path.join(process.cwd(), "cookie.txt");
}

export function readSessionCookieSync(): string {
  try {
    const p = sessionCookiePath();
    if (!fs.existsSync(p)) return "";
    const raw = fs.readFileSync(p, "utf-8");
    return raw
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ");
  } catch {
    return "";
  }
}

export function writeSessionCookieSync(cookie: string): void {
  fs.writeFileSync(sessionCookiePath(), cookie.trim(), "utf-8");
}
