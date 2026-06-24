/**
 * Nhận diện checkpoint Facebook 282 / 956 trong HTML hoặc JSON response.
 * Trước đây chỉ dùng một ID HTML cố định; FB đổi markup thì auto đổi acc sẽ không chạy.
 */

export function isCheckpoint282Signal(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  if (text.includes("1501092823525282")) return true;
  if (/\/checkpoint\/[^"'\s<>]*282/i.test(text)) return true;
  if (/"error_subcode"\s*:\s*282\b/.test(text)) return true;
  if (/"subcode"\s*:\s*282\b/.test(text) && /checkpoint|OAuthException|not logged in/i.test(text)) return true;
  return false;
}

export function isCheckpoint956Signal(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return text.includes("828281030927956");
}

export function isCheckpoint282Or956Signal(text: string): boolean {
  return isCheckpoint282Signal(text) || isCheckpoint956Signal(text);
}
