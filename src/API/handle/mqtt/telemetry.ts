import log from "@log";

const NOISY = new Set(["typ", "presence", "read_receipt", "video_call"]);

/** Trùng với SKIP_CLASSES trong messageHandlers — delta này không gọi globalCallback */
const DELTA_DROPPED_AT_HANDLER = new Set([
  "DeliveryReceipt",
  "NoOp",
  "ThreadFolder",
  "MarkRead",
  "MarkUnread",
]);

function mqttVerbose(ctx: any): boolean {
  return (
    ctx?.options?.mqttVerbose === true ||
    process.env.MQTT_VERBOSE === "1" ||
    process.env.MQTT_DEBUG === "1"
  );
}

function histogram(classes: string[]): string {
  const m = new Map<string, number>();
  for (const c of classes) {
    m.set(c, (m.get(c) || 0) + 1);
  }
  return [...m.entries()]
    .map(([k, v]) => (v > 1 ? `${k}×${v}` : k))
    .join(", ") || "(no class)";
}

/**
 * Log mỗi batch /t_ms (throttle) — kèm **loại delta** để biết vì sao không có event `message`.
 */
export function logTmsBatch(ctx: any, deltas: unknown[] | null | undefined): void {
  const arr = Array.isArray(deltas) ? deltas : [];
  const deltaCount = arr.length;
  const verbose = mqttVerbose(ctx);
  const now = Date.now();
  const throttleMs = verbose ? 8_000 : 45_000;
  if (!ctx._mqttTmsLogAt) ctx._mqttTmsLogAt = 0;
  if (now - ctx._mqttTmsLogAt < throttleMs) return;
  ctx._mqttTmsLogAt = now;

  if (deltaCount === 0) {
    if (verbose) {
      log.system("[MQTT] t_ms (0 delta) — sync channel vẫn hoạt động");
    }
    return;
  }

  const classes = arr.map((d) => (d as { class?: string })?.class).filter((c): c is string => !!c);
  const hist = histogram(classes);

  if (deltaCount > 0 && classes.length === 0) {
    log.warn(
      `[MQTT] t_ms: ${deltaCount} delta nhưng không có field class — không parse được`,
    );
    return;
  }

  const allDropped =
    classes.length > 0 &&
    classes.every((c) => DELTA_DROPPED_AT_HANDLER.has(c));
  const onlyReadReceipt =
    classes.length > 0 && classes.every((c) => c === "ReadReceipt");

  if (allDropped) {
    log.warn(
      `[MQTT] t_ms: ${deltaCount} delta [${hist}] — loại sync/đọc, **không** tạo event tới main (không có lệnh/tin)`,
    );
    return;
  }

  if (onlyReadReceipt) {
    log.info(
      `[MQTT] t_ms: ${deltaCount} delta [ReadReceipt] — bot chỉ nhận type=read_receipt (không phải message)`,
    );
    return;
  }

  log.info(`[MQTT] t_ms: ${deltaCount} delta [${hist}] → parse → callback bot`);
}

type MqttCb = (err: any, msg?: any) => any;

/**
 * Bọc globalCallback: luôn log sự kiện đầu tiên; verbose thì log (có throttle loại ồn).
 */
export function wrapMqttGlobalCallback(ctx: any, inner: MqttCb): MqttCb {
  let eventSeq = 0;

  return (err: any, msg?: any) => {
    const verbose = mqttVerbose(ctx);

    if (err) {
      log.warn(`[MQTT] callback lỗi: ${err?.message || String(err)}`);
      return inner(err, msg);
    }

    if (msg && typeof msg === "object") {
      const m = msg as Record<string, unknown>;
      const ty = String(m.type ?? "?");
      const tid = String(m.threadID ?? m.threadId ?? "");

      ctx._lastMqttEventAt = Date.now();
      eventSeq++;

      if (!ctx._mqttFirstEventLogged) {
        ctx._mqttFirstEventLogged = true;
        log.success(`[MQTT] sự kiện đầu tiên tới bot: type=${ty} thread=${tid || "—"}`);
      } else if (verbose) {
        const noisy = NOISY.has(ty);
        const key = `${ty}:${tid}`;
        if (!ctx._mqttNoiseLog) ctx._mqttNoiseLog = {} as Record<string, number>;
        const last = ctx._mqttNoiseLog[key] || 0;
        const minGap = noisy ? 12_000 : 0;
        const now = Date.now();
        if (!noisy || now - last >= minGap) {
          ctx._mqttNoiseLog[key] = now;
          const extra =
            ty === "message" || ty === "message_reply"
              ? ` len=${String(m.body ?? "").length}`
              : "";
          log.info(`[MQTT] #${eventSeq} type=${ty} thread=${tid || "—"}${extra}`);
        }
      }
    }

    return inner(err, msg);
  };
}
