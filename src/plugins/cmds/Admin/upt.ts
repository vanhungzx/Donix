import type { Command, CommandOnCallContext } from '@types';
import { promises as dns } from "node:dns";
import https from "node:https";
import os from "node:os";

declare const global: any;

const uptCommand: Command = {
  name: "upt",
  alias: ["uptime", "status"],
  role: 0,
  desc: "Thông tin hệ thống",
  guide: "{pn}",
  cd: 5,
  prefix: false,

  async onCall({ reply }: CommandOnCallContext): Promise<void> {
    const u = process.uptime();
    const h = String(Math.floor(u / 3600)).padStart(2, "0");
    const m = String(Math.floor((u % 3600) / 60)).padStart(2, "0");
    const s = String(Math.floor(u % 60)).padStart(2, "0");

    const { heapUsed, rss } = process.memoryUsage();

    const totalRam = os.totalmem() / 1e9;
    const usedRam = totalRam - os.freemem() / 1e9;
    const ramPercent = ((usedRam / totalRam) * 100).toFixed(1);

    const cpuLoad = (os.loadavg()[0] ?? 0).toFixed(1);

    let botStatus = "Không ổn định";

    const eff = [
      'fire',
      'love',
      'giftwrap',
      'celebration',
      'avatar_love',
      'avatar_angry',
      'avatar_laugh',
      'avatar_cry'
    ];

    try {
      if (global.mqttClient) {
        const isConnected = global.mqttClient.connected === true;
        const isDisconnected = global.mqttClient.disconnected === true;
        const isReconnecting = global.mqttClient.reconnecting === true;

        if (isConnected) {
          botStatus = "Ổn định";
        } else if (isReconnecting) {
          botStatus = "Đang kết nối lại";
        } else if (isDisconnected) {
          botStatus = "Mất kết nối";
        } else {
          botStatus = "Đang khởi tạo";
        }
      } else {
        botStatus = "Chưa khởi tạo";
      }
    } catch (error: any) {
      botStatus = "Lỗi kiểm tra";
    }

    let ping: string | number = "N/A";
    let dnsPing: string | number = "N/A";

    try {
      const d = Date.now();
      await dns.lookup("google.com");
      dnsPing = Date.now() - d;
    } catch {}

    try {
      const h1 = Date.now();

      await new Promise<void>((resolve) => {
        const req = https.get("https://www.google.com", (res) => {
          res.on("data", () => {});
          res.on("end", () => {
            ping = Date.now() - h1;
            resolve();
          });
        });

        req.on("error", () => {
          ping = "N/A";
          resolve();
        });

        req.on("timeout", () => {
          req.destroy();
          ping = "Timeout";
          resolve();
        });

        req.setTimeout(5000);
      });

    } catch {
      ping = "N/A";
    }

    const status = `Uptime: ${h}:${m}:${s}
Ping: ${ping}ms | DNS: ${dnsPing}ms
Status: ${botStatus}
CPU Load: ${cpuLoad}
RAM: ${ramPercent}%
Total RAM: ${totalRam.toFixed(1)}GB
Used RAM: ${usedRam.toFixed(1)}GB
Heap: ${(heapUsed / 1048576).toFixed(1)}MB
RSS: ${(rss / 1048576).toFixed(1)}MB`;

    await reply({
      body: status,
      attachment: global.Donix.vdanime?.splice?.(0, 1) || [],
      effect: "love",
    });
  },
};

export default uptCommand;