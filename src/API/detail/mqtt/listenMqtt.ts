export { default } from "../../handle/mqtt/index";

import log from "@log";

export interface AutoReconnectOptions {
  getConfig: () => Readonly<Record<string, any>>;
  client: any;
  messageHandler: (eventErr: any, event?: any) => Promise<void>;
  formatError?: (err: any) => string;
  getEmitter?: () => any;
  setEmitter?: (emitter: any) => void;
}

export interface AutoReconnectController {
  start: () => void;
  stop: () => void;
  cleanup: () => void;
}

/**
 * Khởi tạo auto reconnect timer để tránh MQTT bị đứng
 */
export function createAutoReconnectTimer(options: AutoReconnectOptions): AutoReconnectController {
  const {
    getConfig,
    client,
    messageHandler,
    formatError = (err: any) => String(err?.message || err || "Unknown error"),
    getEmitter,
    setEmitter
  } = options;

  let reconnectTimer: NodeJS.Timeout | null = null;
  let configWatcher: NodeJS.Timeout | null = null;
  let mqttEmitter: any = null;

  const getCurrentEmitter = () => {
    if (getEmitter) {
      return getEmitter();
    }
    return mqttEmitter;
  };

  const updateEmitter = (emitter: any) => {
    if (setEmitter) {
      setEmitter(emitter);
    }
    mqttEmitter = emitter;
  };

  // Khoảng thời gian tối thiểu (ms) giữa các lần reconnect
  const MIN_RECONNECT_INTERVAL = 10 * 60 * 1000; // 10 phút

  const startReconnectTimer = () => {
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }

    const currentConfig = getConfig();
    const mqttConfig = currentConfig.mqttAutoReconnect;
    const enable = mqttConfig?.enable !== false;
    // Thời gian giữa các lần reconnect định kỳ
    const configuredInterval = mqttConfig?.interval || 60 * 60 * 1000; // mặc định 60 phút
    const interval = Math.max(configuredInterval, MIN_RECONNECT_INTERVAL);

    if (!enable) {
      log.info("Auto reconnect MQTT đã được tắt trong config");
      return;
    }

    reconnectTimer = setInterval(async () => {
      try {
        log.warn(`Đang tiến hành reconnect listenMqtt định kỳ...`);

        let oldEmitter = getCurrentEmitter();
        if (oldEmitter && typeof oldEmitter.stopListening === "function") {
          try {
            await Promise.race([
              new Promise<void>((resolve) => {
                oldEmitter.stopListening(() => {
                  resolve();
                });
              }),
              new Promise<void>((resolve) => setTimeout(resolve, 3000))
            ]);
          } catch (e) {
            // Bỏ qua lỗi khi stop emitter cũ
          }
        }

        // Force cleanup MQTT client cũ để tránh kết nối zombie
        const ctx = (client as any).ctx || (client as any)._ctx;
        if (ctx) {
          if (ctx.mqttClient) {
            try {
              ctx.mqttClient.removeAllListeners();
              ctx.mqttClient.end(true);
            } catch {
              // ignore
            }
            ctx.mqttClient = undefined;
          }
          // Reset sync state - BẮT BUỘC lấy seqID mới khi reconnect
          ctx.syncToken = undefined;
          ctx.lastSeqId = undefined;
          ctx.t_mqttCalled = false;
          delete ctx.tmsWait;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

        const newEmitter = client.listenMqtt(messageHandler);
        updateEmitter(newEmitter);

        log.success("Đã reconnect listenMqtt định kỳ thành công (seqID sẽ được lấy mới)");
      } catch (reconnectError: any) {
        log.error(`Lỗi khi reconnect listenMqtt: ${formatError(reconnectError)}`);
      }
    }, interval);

    if (typeof reconnectTimer.unref === "function") {
      reconnectTimer.unref();
    }

    log.info(`Auto reconnect MQTT đã được bật (interval: ${interval / 1000 / 60} phút).`);
  };

  const startConfigWatcher = () => {
    if (configWatcher) {
      clearInterval(configWatcher);
      configWatcher = null;
    }

    let lastConfigCheck = Date.now();
    configWatcher = setInterval(() => {
      const now = Date.now();

      if (now - lastConfigCheck < 120000) return;
      lastConfigCheck = now;

      const currentConfig = getConfig();
      const mqttConfig = currentConfig.mqttAutoReconnect;
      const enable = mqttConfig?.enable !== false;

      const shouldRestart = reconnectTimer === null && enable;
      const shouldStop = reconnectTimer !== null && !enable;

      if (shouldRestart || shouldStop) {
        startReconnectTimer();
      }
    }, 120000);

    if (typeof configWatcher.unref === "function") {
      configWatcher.unref();
    }
  };

  const controller: AutoReconnectController & { getEmitter: () => any; setEmitter: (emitter: any) => void } = {
    start: () => {
      startReconnectTimer();
      startConfigWatcher();
    },
    stop: () => {
      // Tối ưu RAM: Cleanup timers và references
      if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
      }
      if (configWatcher) {
        clearInterval(configWatcher);
        configWatcher = null;
      }
    },
    cleanup: () => {
      // Tối ưu RAM: Cleanup triệt để
      if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
      }
      if (configWatcher) {
        clearInterval(configWatcher);
        configWatcher = null;
      }
      const emitter = getCurrentEmitter();
      if (emitter && typeof emitter.stopListening === "function") {
        try {
        emitter.stopListening();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      // Giải phóng emitter reference
      mqttEmitter = null;
      if (setEmitter) {
        setEmitter(null);
      }
    },
    // Expose mqttEmitter để có thể cập nhật từ bên ngoài
    getEmitter: () => getCurrentEmitter(),
    setEmitter: (emitter: any) => {
      updateEmitter(emitter);
    }
  };

  return controller;
}
