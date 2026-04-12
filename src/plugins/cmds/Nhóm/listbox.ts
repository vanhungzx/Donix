"use strict";

import type { Command, CommandOnCallContext } from "@types";

const PAGE_SIZE = 30;

function isOwner(config: CommandOnCallContext["config"], senderID: string): boolean {
  const o = config.OWNER;
  if (Array.isArray(o)) return o.map(String).includes(String(senderID));
  return o != null && String(o) === String(senderID);
}

type BoxRow = { id: string; name: string };

async function loadBoxRowsFromDb(threadData: CommandOnCallContext["threadData"]): Promise<BoxRow[]> {
  const rows = await threadData.getAll(null);
  const list = (Array.isArray(rows) ? rows : [])
    .filter((r: { threadID?: string }) => r?.threadID && /^\d+$/.test(String(r.threadID)))
    .map((r: { threadID?: string; threadName?: string; threadInfo?: Record<string, unknown> }) => {
      const id = String(r.threadID);
      const ti = r.threadInfo && typeof r.threadInfo === "object" ? r.threadInfo : {};
      const name =
        (typeof r.threadName === "string" && r.threadName.trim()) ||
        (typeof ti.threadName === "string" && ti.threadName.trim()) ||
        (typeof ti.name === "string" && ti.name.trim()) ||
        id;
      return { id, name: String(name) };
    })
    .sort((a: BoxRow, b: BoxRow) => a.name.localeCompare(b.name, "vi", { sensitivity: "base" }));
  return list;
}

const listboxCommand: Command = {
  name: "listbox",
  alias: ["dsbox", "listnhomdb", "boxdb"],
  version: "1.0.0",
  role: 3,
  desc: "OWNER: danh sách nhóm đang có trong database (có thể gồm nhóm bot đã out)",
  guide:
    "{pn} [trang]\n" +
    "• Liệt kê threadID + tên từ bảng Thread trong DB.\n" +
    "• Ghi chú: sau khi bot out, bản ghi có thể vẫn còn (giữ thống kê tương tác).",
  cd: 3,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, reply, threadData, commandName, config } = ctx;

    if (!isOwner(config, String(event.senderID))) {
      await reply("❎ Chỉ chủ bot (OWNER) dùng được lệnh này.");
      return;
    }

    const boxes = await loadBoxRowsFromDb(threadData);
    if (boxes.length === 0) {
      await reply("ℹ️ Database chưa có bản ghi nhóm nào.");
      return;
    }

    const totalPages = Math.max(1, Math.ceil(boxes.length / PAGE_SIZE));
    let page = parseInt(String(args[0] || "1"), 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    const start = (page - 1) * PAGE_SIZE;
    const slice = boxes.slice(start, start + PAGE_SIZE);

    const lines: string[] = [
      "📋 NHÓM TRONG DATABASE",
      `📊 Tổng: ${boxes.length} — Trang ${page}/${totalPages}`,
      "ℹ️ Danh sách theo DB (không đồng bộ realtime với FB).",
      "",
    ];

    for (let i = 0; i < slice.length; i++) {
      const globalIdx = start + i + 1;
      const b = slice[i]!;
      lines.push(`${globalIdx}. ${b.name}`);
      lines.push(`   🆔 ${b.id}`);
      if (i < slice.length - 1) lines.push("");
    }

    if (totalPages > 1) {
      lines.push("");
      lines.push(`📌 Trang khác: ${commandName} <số trang>`);
    }

    await reply(lines.join("\n"));
  },
};

export default listboxCommand;
