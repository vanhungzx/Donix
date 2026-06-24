import type { Command, CommandOnCallContext } from "@types";
import os from "node:os";
import moment from "moment-timezone";

declare const global: any;

const uptCommand: Command = {
  name: "upt",
  alias: ["uptime", "status"],
  role: 0,
  desc: "Thông tin hệ thống",
  guide: "{pn}",
  cd: 5,
  prefix: false,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { reply, event, userData } = ctx;
    const { senderID } = event;

    // ===== FIX USER NAME (GIỐNG GHEP) =====
    const getName = userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
    const userName =
      (getName ? await getName(String(senderID)).catch(() => null) : null) ||
      "User";

    // ===== TIME =====
    const timeNow = moment().tz("Asia/Ho_Chi_Minh").format("DD/MM/YYYY | HH:mm:ss");

    // ===== UPTIME =====
    const uptime = convertTime(process.uptime());

    // ===== CPU =====
    const cpuModel = os.cpus()[0]?.model || "Unknown";
    const cpuUsage = await getCpuUsage(); // real %

    // ===== RAM =====
    const totalRAM = os.totalmem();
    const freeRAM = os.freemem();
    const usedRAM = totalRAM - freeRAM;
    const percentUsed = (usedRAM / totalRAM) * 100;

    const ramUsedGB = (usedRAM / 1024 / 1024 / 1024).toFixed(2);
    const ramTotalGB = (totalRAM / 1024 / 1024 / 1024).toFixed(2);

    // ===== PROCESS =====
    const heap = process.memoryUsage();
    const heapUsed = (heap.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotal = (heap.heapTotal / 1024 / 1024).toFixed(2);
    const rss = (heap.rss / 1024 / 1024).toFixed(2);

    // ===== PING FAKE (GIỮ NGUYÊN) =====
    const ping = Math.floor(Math.random() * 30) + 20;
    const dns = Math.floor(Math.random() * 10) + 1;

    // ===== BODY =====
    const msg = `『 SYSTEM INFO 』
⏰ Time: ${timeNow}
⚡ Uptime: ${uptime}
📶 Ping: ${ping}ms | DNS: ${dns}ms
💻 CPU: ${cpuModel}
└ Load: ${cpuUsage.toFixed(1)}% ${renderBar(cpuUsage)}
💾 RAM: ${ramUsedGB}GB/${ramTotalGB}GB
└ Used: ${percentUsed.toFixed(1)}% ${renderBar(percentUsed)}
📊 Process:
└ Heap: ${heapUsed}/${heapTotal}MB
└ RSS: ${rss}MB
👤 User: ${userName}`;

    await reply({
      body: msg,
      attachment: global.Donix.vdchill?.splice?.(0, 1) || [],
      effect: "love",
    });
  },
};

export default uptCommand;

/* ===== FUNCTIONS ===== */

function convertTime(s: number) {
  const d = Math.floor(s / (3600 * 24));
  const h = Math.floor((s % (3600 * 24)) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const timeFormat = [h, m, sec]
    .map(v => String(v).padStart(2, "0"))
    .join(":");
  return d > 0 ? `${d} ngày ${timeFormat}` : timeFormat;
}

function renderBar(percent: number) {
  const total = 10;
  const filled = Math.round((percent / 100) * total);
  return "█".repeat(filled) + "░".repeat(total - filled);
}

async function getCpuUsage(): Promise<number> {
  return new Promise(resolve => {
    const start = os.cpus();
    setTimeout(() => {
      const end = os.cpus();

      let idle = 0;
      let total = 0;

      for (let i = 0; i < start.length; i++) {
        const s = start[i].times;
        const e = end[i].times;

        const idleDiff = e.idle - s.idle;
        const totalDiff = Object.keys(e).reduce(
          (acc, key) => acc + ((e as any)[key] - (s as any)[key]),
          0
        );

        idle += idleDiff;
        total += totalDiff;
      }

      resolve(100 - (idle / total) * 100);
    }, 100);
  });
}