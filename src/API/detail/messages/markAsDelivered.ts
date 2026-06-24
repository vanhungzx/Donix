import type { DefaultFuncs, MQTTContext } from "@core/types";

interface MarkAsDeliveredCallback {
  (err?: Error | null): void;
}

export default function (
  _defaultFuncs: DefaultFuncs,
  _client: unknown,
  ctx: MQTTContext
): (
  threadID: string | number,
  messageID: string,
  callback?: MarkAsDeliveredCallback
) => Promise<Error | void> {
  return async function markAsDelivered(
    threadID: string | number,
    _messageID: string,
    callback: MarkAsDeliveredCallback = () => { }
  ): Promise<Error | void> {
    try {
      if (!ctx.mqttClient) throw new Error("You can only use this function after you start listening.");

      const payload = {
        threadKey: { thread_fbid: threadID },
        deliveredWatermarkTimestamp: Date.now(),
      };

      await new Promise<void>((resolve, reject) =>
        ctx.mqttClient?.publish(
          "/mark_thread",
          JSON.stringify(payload),
          { qos: 1 as const },
          (err: any) => (err ? reject(err) : resolve())
        )
      );

      callback();
    } catch (err: any) {
      callback(err);
      return err;
    }
  };
}
