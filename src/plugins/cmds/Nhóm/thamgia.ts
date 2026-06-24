"use strict";

import type { Command, CommandOnCallContext, CommandOnReplyContext } from "@types";

const PAGE_SIZE = 25;

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

function addUserToGroupPromise(
  client: CommandOnCallContext["client"],
  userID: string,
  threadID: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const fn = client.addUserToGroup as
      | ((uid: string, tid: string, cb: (err: Error | null) => void) => void)
      | undefined;
    if (!fn) {
      reject(new Error("addUserToGroup không khả dụng"));
      return;
    }
    fn(userID, threadID, (err) => (err ? reject(err) : resolve()));
  });
}

const thamgiaCommand: Command = {
  name: "thamgia",
  alias: ["joinbox", "vaonhom"],
  version: "1.0.0",
  role: 3,
  desc: "OWNER: xem nhóm trong DB, reply STT để bot thêm mình vào nhóm đó",
  guide:
    "{pn} [trang]\n" +
    "• Lấy danh sách nhóm có trong database.\n" +
    "• Reply đúng tin nhắn danh sách với số thứ tự (vd: 3) — bot gọi add vào nhóm tương ứng.\n" +
    "• Reply hủy / cancel để thoát.\n" +
    "• Nên dùng trong inbox để không lộ ID nhóm.",
  cd: 5,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, reply, threadData, main, commandName, config } = ctx;

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
      "📥 THAM GIA NHÓM (theo dữ liệu DB)",
      `📊 Tổng: ${boxes.length} nhóm — Trang ${page}/${totalPages}`,
      `👉 Reply tin nhắn này với STT (1–${boxes.length}) để bot thêm mình vào nhóm đó.`,
      `📌 Trang khác: ${commandName} <số trang>`,
      "",
    ];

    for (let i = 0; i < slice.length; i++) {
      const globalIdx = start + i + 1;
      const b = slice[i]!;
      lines.push(`${globalIdx}. ${b.name}`);
      lines.push(`   🆔 ${b.id}`);
      if (i < slice.length - 1) lines.push("");
    }

    const sent = await reply(lines.join("\n"));
    const mid = sent && typeof sent === "object" && "messageID" in sent ? String((sent as { messageID: string }).messageID) : "";
    if (mid) {
      main.onReply.set(mid, {
        commandName: commandName || "thamgia",
        messageID: mid,
        author: String(event.senderID),
        boxes,
      });
    }
  },

  async onReply(ctx: CommandOnReplyContext): Promise<void> {
    const { client, event, Reply, reply, main } = ctx;
    const data = Reply as { author?: string; boxes?: BoxRow[]; messageID?: string };

    if (String(event.senderID) !== String(data.author)) return;

    const raw = String(event.body || "").trim().toLowerCase();
    if (raw === "hủy" || raw === "huỷ" || raw === "cancel") {
      if (data.messageID) main.onReply.delete(data.messageID);
      await reply("✅ Đã hủy.");
      return;
    }

    if (!/^\d+$/.test(raw)) {
      await reply(`❎ Gửi số thứ tự (1–${data.boxes?.length ?? 0}), hoặc reply hủy.`);
      return;
    }

    const boxes = Array.isArray(data.boxes) ? data.boxes : [];
    const n = parseInt(raw, 10);
    if (n < 1 || n > boxes.length) {
      await reply("❎ Số không hợp lệ.");
      return;
    }

    const target = boxes[n - 1];
    if (!target?.id) {
      await reply("❎ Không tìm thấy nhóm.");
      return;
    }

    const botUid = String(client.getCurrentUserID?.() ?? client.id ?? "");
    if (!botUid) {
      await reply("❎ Không xác định được UID bot.");
      return;
    }

    await reply(`⏳ Đang thêm bot vào nhóm: ${target.name} (${target.id})…`);

    try {
      await addUserToGroupPromise(client, botUid, target.id);
      if (data.messageID) main.onReply.delete(data.messageID);
      await reply(`✅ Đã gửi yêu cầu thêm bot vào nhóm:\n${target.name}\n🆔 ${target.id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (data.messageID) main.onReply.delete(data.messageID);
      await reply(`❎ Không thêm được bot vào nhóm (cần QTV mời / bot chưa out / lỗi FB):\n${msg}`);
    }
  },
};

export default thamgiaCommand;
