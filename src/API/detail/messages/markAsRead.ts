import type { DefaultFuncs, MQTTContext } from "@core/types";

interface MarkAsReadCallback {
  (err?: Error | null): void;
}

export default function (
  _defaultFuncs: DefaultFuncs,
  _client: any,
  ctx: MQTTContext
): (
  threadID: string | number,
  read?: boolean,
  callback?: MarkAsReadCallback
) => Promise<Error | void> {
  return async function markAsRead(
    threadID: string | number,
    read: boolean = true,
    callback: MarkAsReadCallback = () => { }
  ): Promise<Error | void> {
    try {
      if (!ctx.mqttClient) throw new Error("You can only use this function after you start listening.");

      const payload = {
        threadKey: { thread_fbid: threadID },
        readWatermarkTimestamp: read ? Date.now() : 0,
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
