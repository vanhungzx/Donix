"use strict";

import type { Command, CommandOnCallContext, CommandOnReplyContext } from "@types";

const PAGE_SIZE = 30;

function isOwner(config: CommandOnCallContext["config"], senderID: string): boolean {
  const o = config.OWNER;
  if (Array.isArray(o)) return o.map(String).includes(String(senderID));
  return o != null && String(o) === String(senderID);
}

type BoxRow = { id: string; name: string };

const DELETE_ALIASES = new Set(["del", "delete", "rm", "xoa"]);

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
  desc: "OWNER: xem danh sách nhóm DB và xóa nhóm khỏi DB",
  guide:
    "{pn} [trang]\n" +
    "{pn} del <threadID>\n" +
    "• Liệt kê threadID + tên từ bảng Thread trong DB.\n" +
    "• Reply STT vào tin nhắn danh sách để xóa nhanh theo số thứ tự.\n" +
    "• Xóa 1 nhóm khỏi DB bằng threadID.\n" +
    "• Ghi chú: sau khi bot out, bản ghi có thể vẫn còn (giữ thống kê tương tác).",
  cd: 3,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, reply, threadData, commandName, config, main } = ctx;

    if (!isOwner(config, String(event.senderID))) {
      await reply("❎ Chỉ chủ bot (OWNER) dùng được lệnh này.");
      return;
    }

    const sub = String(args[0] || "").toLowerCase();
    if (DELETE_ALIASES.has(sub)) {
      const rawThreadID = String(args[1] || "").trim();
      if (!rawThreadID || !/^\d+$/.test(rawThreadID)) {
        await reply(
          `❎ Sai cú pháp.\n` +
          `Dùng: ${commandName} del <threadID>\n` +
          `Ví dụ: ${commandName} del 1234567890123456`
        );
        return;
      }

      try {
        const found = await threadData.get(rawThreadID);
        if (!found) {
          await reply(`ℹ️ Không tìm thấy nhóm \`${rawThreadID}\` trong database.`);
          return;
        }

        await threadData.del(rawThreadID);
        await reply(
          `✅ Đã xóa nhóm khỏi database.\n` +
          `🆔 ${rawThreadID}\n` +
          `📝 ${found.threadName || rawThreadID}`
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        await reply(`❎ Xóa nhóm thất bại: ${msg}`);
      }
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

    const sent = await reply(lines.join("\n"));
    if (sent?.messageID) {
      const items = slice.map((b, i) => ({
        stt: start + i + 1,
        id: b.id,
        name: b.name,
      }));
      (main as any).onReply.set(sent.messageID, {
        commandName,
        messageID: sent.messageID,
        author: event.senderID,
        items,
      });
    }
  },

  async onReply(ctx: CommandOnReplyContext): Promise<void> {
    const { event, Reply, threadData, reply } = ctx;
    const data = Reply as any;
    if (!data || String(event.senderID) !== String(data.author)) return;

    const raw = String(event.body || "").trim();
    if (!raw) return;

    const tokens = raw.split(/[,\s]+/).filter(Boolean);
    if (!tokens.length || !tokens.every((t) => /^\d+$/.test(t))) {
      await reply("❎ Vui lòng reply STT cần xóa (ví dụ: 3 hoặc 1 2 5).");
      return;
    }

    const requested = Array.from(new Set(tokens.map((t) => Number(t))));
    const items: Array<{ stt: number; id: string; name: string }> = Array.isArray(data.items)
      ? data.items
      : [];

    const byStt = new Map<number, { stt: number; id: string; name: string }>();
    for (const item of items) byStt.set(Number(item.stt), item);

    const invalid = requested.filter((n) => !byStt.has(n));
    if (invalid.length > 0) {
      await reply(`❎ STT không hợp lệ trong trang này: ${invalid.join(", ")}`);
      return;
    }

    const ok: string[] = [];
    const fail: string[] = [];
    for (const stt of requested) {
      const target = byStt.get(stt);
      if (!target) continue;
      try {
        await threadData.del(target.id);
        ok.push(`${stt}. ${target.name} (${target.id})`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        fail.push(`${stt}. ${target.name} (${target.id}) — ${msg}`);
      }
    }

    const lines: string[] = [];
    if (ok.length) {
      lines.push("✅ Đã xóa khỏi database:");
      lines.push(...ok.map((x) => `• ${x}`));
    }
    if (fail.length) {
      if (lines.length) lines.push("");
      lines.push("❎ Xóa thất bại:");
      lines.push(...fail.map((x) => `• ${x}`));
    }
    if (!lines.length) lines.push("ℹ️ Không có mục nào được xử lý.");

    await reply(lines.join("\n"));
  },
};

export default listboxCommand;