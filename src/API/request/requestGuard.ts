import log from "@log";
import type { Context, GlobalOptions } from "../../types/request.js";

let lastGuardLogAt = 0;

function guardLogOncePer(ms: number, msg: string): void {
  const now = Date.now();
  if (now - lastGuardLogAt < ms) return;
  lastGuardLogAt = now;
  log.warn(msg);
}

function isBypassUrl(url: string): boolean {
  const s = String(url || "");
  return (
    /b-graph\.facebook\.com\/auth\/login/i.test(s) ||
    /\/auth\/login/i.test(s) ||
    /\/login\.php/i.test(s) ||
    /two_factor|checkpoint/i.test(s)
  );
}

function effectiveCooldownUntil(
  ctx: Context | null | undefined,
  options: GlobalOptions | null | undefined
): number {
  return Math.max(
    Number(ctx?._autoLoginCooldownUntil ?? 0),
    Number(ctx?._checkpointCooldownUntil ?? 0),
    Number(options?._autoLoginCooldownUntil ?? 0),
    Number(options?._checkpointCooldownUntil ?? 0)
  );
}

export class ApiCooldownError extends Error {
  readonly code = "API_COOLDOWN" as const;
  constructor(message: string) {
    super(message);
    this.name = "ApiCooldownError";
  }
}

/**
 * Tránh bão request khi đang auto-login hoặc vừa gặp checkpoint (cooldown).
 * Khớp hành vi apii: giảm pattern "máy" — dồn hàng trăm request trong vài giây.
 */
export async function gateRequest<T>(
  ctx: Context | null | undefined,
  url: string,
  label: string,
  fn: () => Promise<T>,
  options?: GlobalOptions | null
): Promise<T> {
  const now = Date.now();
  const until = effectiveCooldownUntil(ctx ?? undefined, options ?? undefined);

  if (
    until > now &&
    !isBypassUrl(url) &&
    !ctx?._autoLoginRequestInFlight
  ) {
    const waitMs = until - now;
    const e = new ApiCooldownError(`Đang cooldown API (${Math.ceil(waitMs / 1000)}s) — ${label}`);
    guardLogOncePer(
      30_000,
      `[RequestGuard] cooldown ${Math.ceil(waitMs / 1000)}s -> block ${label} ${String(url).slice(0, 120)}`
    );
    throw e;
  }

  if (ctx?.auto_login && ctx?._autoLoginPromise && !isBypassUrl(url)) {
    if (ctx._autoLoginRequestInFlight) {
      return fn();
    }

    guardLogOncePer(
      30_000,
      `[RequestGuard] auto-login đang chạy -> chờ trước khi ${label} ${String(url).slice(0, 120)}`
    );
    const loginPromise = ctx._autoLoginPromise;
    if (loginPromise) {
      await Promise.race([
        loginPromise,
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("Auto login timeout")), 90_000)
        ),
      ]);
    }
  }

  return fn();
}
