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
  let healthCheckTimer: NodeJS.Timeout | null = null;
  let mqttEmitter: any = null;
  let isPeriodicRestartRunning = false;
  let isHealthProbeRunning = false;

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

  const getClientCtx = () => client?.ctx;

  // Khoảng thời gian tối thiểu (ms) giữa các lần reconnect
  const MIN_RECONNECT_INTERVAL = 10 * 60 * 1000; // 10 phút
  const MIN_HANG_TIMEOUT = 90 * 1000; // 90 giây

  const markHealthActivity = (clientCtx: any, mqttClient: any) => {
    const now = Date.now();
    if (clientCtx) {
      clientCtx.lastMqttActivityAt = now;
    }
    if (mqttClient) {
      mqttClient._donixLastActivityAt = now;
    }
  };

  const restartListener = async (reason: string) => {
    const clientCtx = getClientCtx();
    if (clientCtx?.isReconnecting) {
      log.info("Bỏ qua restart listenMqtt vì MQTT đang reconnect nội bộ.");
      return;
    }

    if (isPeriodicRestartRunning) {
      return;
    }

    isPeriodicRestartRunning = true;
    try {
      log.warn(reason);

      const oldEmitter = getCurrentEmitter();
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
        } catch {
          // Bỏ qua lỗi khi stop emitter cũ
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const newEmitter = client.listenMqtt(messageHandler);
      updateEmitter(newEmitter);

      log.info("Đã khởi động lại listenMqtt, đang chờ /t_ms...");
    } catch (reconnectError: any) {
      log.error(`Lỗi khi reconnect listenMqtt: ${formatError(reconnectError)}`);
    } finally {
      isPeriodicRestartRunning = false;
    }
  };

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
      await restartListener("Đang tiến hành reconnect listenMqtt định kỳ...");
    }, interval);

    if (typeof reconnectTimer.unref === "function") {
      reconnectTimer.unref();
    }

    log.info(`Auto reconnect MQTT đã được bật (interval: ${interval / 1000 / 60} phút).`);
  };

  const startHealthCheckTimer = () => {
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }

    const currentConfig = getConfig();
    const mqttConfig = currentConfig.mqttAutoReconnect;
    const enable = mqttConfig?.enable !== false;

    if (!enable) {
      return;
    }

    const configuredHangTimeout = Number(mqttConfig?.hangTimeout);
    const hangTimeout = Number.isFinite(configuredHangTimeout)
      ? Math.max(MIN_HANG_TIMEOUT, configuredHangTimeout)
      : 8 * 60 * 1000;
    const configuredProbeTimeout = Number(mqttConfig?.probeTimeout);
    const probeTimeout = Number.isFinite(configuredProbeTimeout)
      ? Math.max(3000, Math.min(configuredProbeTimeout, 20000))
      : 8000;
    const checkInterval = Math.max(30000, Math.min(Math.floor(hangTimeout / 3), 120000));

    healthCheckTimer = setInterval(async () => {
      const clientCtx = getClientCtx();
      const mqttClient = clientCtx?.mqttClient;
      if (!clientCtx || !mqttClient) {
        return;
      }

      if (
        clientCtx.isReconnecting ||
        isPeriodicRestartRunning ||
        isHealthProbeRunning
      ) {
        return;
      }

      const isReady = clientCtx.mqttReady === true || mqttClient._donixReady === true;
      const isConnected = mqttClient.connected === true;
      const isClosing = mqttClient.disconnecting === true || mqttClient.disconnected === true;

      if (!isReady || !isConnected || isClosing) {
        return;
      }

      const lastActivityAt = Number(
        clientCtx.lastMqttActivityAt ||
        mqttClient._donixLastActivityAt ||
        clientCtx.mqttReadyAt ||
        clientCtx.mqttConnectedAt ||
        0
      );
      if (!lastActivityAt) {
        return;
      }

      const idleFor = Date.now() - lastActivityAt;
      if (idleFor < hangTimeout) {
        return;
      }

      isHealthProbeRunning = true;
      try {
        const currentClient = mqttClient;
        const probeOk = await Promise.race<boolean>([
          new Promise<boolean>((resolve) => {
            try {
              currentClient.publish(
                "/foreground_state",
                JSON.stringify({ foreground: clientCtx.options?.online ?? false, health_probe: true }),
                { qos: 1 },
                (err: any) => resolve(!err)
              );
            } catch {
              resolve(false);
            }
          }),
          new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => resolve(false), probeTimeout);
            if (typeof timeout.unref === "function") {
              timeout.unref();
            }
          })
        ]);

        if (getClientCtx()?.mqttClient !== currentClient) {
          return;
        }

        if (probeOk) {
          markHealthActivity(clientCtx, currentClient);
          return;
        }

        await restartListener(
          `MQTT có dấu hiệu đứng (${Math.floor(idleFor / 1000)}s không có hoạt động và probe timeout ${probeTimeout}ms), đang restart listenMqtt...`
        );
      } finally {
        isHealthProbeRunning = false;
      }
    }, checkInterval);

    if (typeof healthCheckTimer.unref === "function") {
      healthCheckTimer.unref();
    }
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

      const shouldRestart = (reconnectTimer === null || healthCheckTimer === null) && enable;
      const shouldStop = (reconnectTimer !== null || healthCheckTimer !== null) && !enable;

      if (shouldRestart || shouldStop) {
        startReconnectTimer();
        startHealthCheckTimer();
      }
    }, 120000);

    if (typeof configWatcher.unref === "function") {
      configWatcher.unref();
    }
  };

  const controller: AutoReconnectController & { getEmitter: () => any; setEmitter: (emitter: any) => void } = {
    start: () => {
      startReconnectTimer();
      startHealthCheckTimer();
      startConfigWatcher();
    },
    stop: () => {
      // Tối ưu RAM: Cleanup timers và references
      if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
      }
      if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        healthCheckTimer = null;
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
      if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        healthCheckTimer = null;
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
