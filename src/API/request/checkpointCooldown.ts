import log from "@log";
import type { RequestCooldownState } from "../../types/request.js";

const DEFAULT_CHECKPOINT_COOLDOWN_MS = 8 * 60_000;
const DEFAULT_LOG_EVERY_MS = 30_000;

function normalizeReason(reason: unknown): string {
  return String(reason ?? "").trim();
}

export class CheckpointRequiredError extends Error {
  readonly code = "CHECKPOINT_REQUIRED" as const;

  constructor(message: string) {
    super(message);
    this.name = "CheckpointRequiredError";
  }
}

export function isCheckpointLikeError(error: unknown): boolean {
  const message = normalizeReason(
    error instanceof Error ? error.message : error
  ).toLowerCase();
  return (
    message.includes("checkpoint") ||
    message.includes("/checkpoint/") ||
    message.includes("601051028565049")
  );
}

export function getCheckpointCooldownRemaining(
  ctxOrOpts: RequestCooldownState | null | undefined
): number {
  const until = Number(ctxOrOpts?._checkpointCooldownUntil ?? 0);
  return until > Date.now() ? until - Date.now() : 0;
}

export function isCheckpointManualRequired(
  target: RequestCooldownState | null | undefined
): boolean {
  return target?._checkpointManualRequired === true;
}

/**
 * Sau khi phát hiện checkpoint / scraping warning: nghỉ gọi API một lúc để tránh dồn request khiến Facebook khóa sâu hơn.
 * Đồng bộ với _autoLoginCooldownUntil để requestGuard chặn một cửa.
 */
export function setCheckpointCooldown(
  target: RequestCooldownState | null | undefined,
  options: { ms?: number; reason?: string } = {}
): number {
  if (!target) {
    return 0;
  }

  const cooldownMs = Math.max(1_000, Number(options.ms ?? DEFAULT_CHECKPOINT_COOLDOWN_MS));
  const nextUntil = Date.now() + cooldownMs;
  const currentUntil = Number(target._checkpointCooldownUntil ?? 0);

  target._checkpointCooldownUntil = Math.max(currentUntil, nextUntil);
  target._checkpointCooldownReason =
    normalizeReason(options.reason) ||
    normalizeReason(target._checkpointCooldownReason) ||
    "checkpoint required";

  const currentAuto = Number(target._autoLoginCooldownUntil ?? 0);
  target._autoLoginCooldownUntil = Math.max(currentAuto, Number(target._checkpointCooldownUntil));

  return getCheckpointCooldownRemaining(target);
}

export function setCheckpointManualRequired(
  target: RequestCooldownState | null | undefined,
  options: { ms?: number; reason?: string } = {}
): number {
  const remaining = setCheckpointCooldown(target, options);
  if (!target) {
    return remaining;
  }
  target._checkpointManualRequired = true;
  target._checkpointDetectedAt = Date.now();
  return remaining;
}

export function clearCheckpointManualRequired(
  target: RequestCooldownState | null | undefined
): void {
  if (!target) {
    return;
  }
  target._checkpointManualRequired = false;
  target._checkpointDetectedAt = undefined;
}

export function logCheckpointCooldown(
  target: RequestCooldownState | null | undefined,
  label = "[Checkpoint]",
  options: { key?: string; logEveryMs?: number } = {}
): boolean {
  const remainingMs = getCheckpointCooldownRemaining(target);
  if (remainingMs <= 0) {
    return false;
  }
  if (!target) {
    return false;
  }

  if (!(target._checkpointCooldownLogMap instanceof Map)) {
    target._checkpointCooldownLogMap = new Map<string, number>();
  }

  const map = target._checkpointCooldownLogMap as Map<string, number>;
  const key = String(options.key ?? label);
  const now = Date.now();
  const logEveryMs = Math.max(1_000, Number(options.logEveryMs ?? DEFAULT_LOG_EVERY_MS));
  const lastLogAt = Number(map.get(key) ?? 0);
  if (now - lastLogAt < logEveryMs) {
    return true;
  }

  map.set(key, now);
  const suffix = normalizeReason(target._checkpointCooldownReason);
  log.warn(
    `${label} checkpoint cooldown ${Math.ceil(remainingMs / 1000)}s${suffix ? ` (${suffix})` : ""}`
  );
  return true;
}
