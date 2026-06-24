"use strict";

import type { Command, CommandOnCallContext } from "@types";

type ThreadInfoLike = {
  threadID?: string;
  threadName?: string | null;
  name?: string | null;
  adminIDs?: unknown;
  userInfo?: Array<Record<string, unknown> & { id?: string; name?: string; gender?: string | null }>;
  participantIDs?: string[];
  isGroup?: boolean;
};

function threadAdminIdsFromInfo(info: ThreadInfoLike | null | undefined): string[] {
  const raw = info?.adminIDs;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      if (typeof a === "string" || typeof a === "number") return String(a);
      if (a && typeof a === "object" && "id" in a) return String((a as { id: unknown }).id ?? "");
      return "";
    })
    .filter(Boolean);
}

function normalizeAdminObjects(info: ThreadInfoLike): Array<{ id: string }> {
  const ids = threadAdminIdsFromInfo(info);
  const map = new Map<string, { id: string }>();
  for (const id of ids) map.set(id, { id });
  return Array.from(map.values());
}

function ownerIds(config: Record<string, unknown>): string[] {
  const o = config.OWNER;
  if (Array.isArray(o)) return o.map(String).filter(Boolean);
  if (o != null && o !== "") return [String(o)];
  return [];
}

async function upsertUsersFromThread(
  userData: CommandOnCallContext["userData"],
  users: ThreadInfoLike["userInfo"]
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  const list = Array.isArray(users) ? users : [];
  for (const u of list) {
    const id = u?.id != null ? String(u.id) : "";
    if (!id) continue;
    const payload = {
      name: (typeof u.name === "string" && u.name) || "Facebook User",
      userInfo: u,
      gender: u.gender ?? null,
    };
    try {
      const exists = await userData.get(id);
      if (exists) {
        await userData.update(id, payload);
        updated++;
      } else {
        await userData.create(id, {
          ...payload,
          setting: {},
          data: {},
        });
        created++;
      }
    } catch {
      // bỏ qua từng user lỗi
    }
  }
  return { created, updated };
}

async function syncThreadFromFb(
  ctx: Pick<CommandOnCallContext, "client" | "threadData" | "userData">,
  threadID: string
): Promise<{
  ok: boolean;
  title?: string;
  error?: string;
  users?: { created: number; updated: number };
  qtv?: number;
  mem?: number;
}> {
  const { client, threadData, userData } = ctx;
  try {
    const raw = (await client.getThreadInfo(threadID)) as ThreadInfoLike | null;
    if (!raw || (!raw.threadID && !threadID)) {
      return { ok: false, error: "Facebook không trả về threadInfo" };
    }
    const tid = String(raw.threadID || threadID);
    const adminObjs = normalizeAdminObjects(raw);
    const threadInfo: Record<string, unknown> = {
      ...raw,
      threadID: tid,
      adminIDs: adminObjs,
    };

    const userStats = await upsertUsersFromThread(userData, raw.userInfo);

    await threadData.update(tid, {
      threadName: raw.threadName || raw.name || undefined,
      threadInfo: threadInfo as Record<string, unknown>,
      lastActive: Date.now(),
    });

    const mem = Array.isArray(raw.participantIDs) ? raw.participantIDs.length : raw.userInfo?.length ?? 0;
    return {
      ok: true,
      title: String(raw.threadName || raw.name || tid),
      users: userStats,
      qtv: adminObjs.length,
      mem,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

const command: Command = {
  name: "syncdata",
  version: "1.0.0",
  desc: "Đồng bộ threadInfo + thành viên từ Facebook (fix QTV/cache lệch)",
  guide:
    "{p}syncdata — đồng bộ nhóm hiện tại\n" +
    "{p}syncdata all — đồng bộ mọi nhóm trong DB (chỉ chủ bot / admin bot)",
  role: 3,
  cd: 45,
  prefix: true,
  alias: ["syncfb", "dongbodata"],

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { client, event, args, threadData, reply, config, permssion } = ctx;
    const tid = String(event.threadID || "");
    if (!tid) {
      await reply("❎ Không xác định được threadID.");
      return;
    }

    const sid = String(event.senderID || "");
    const owners = ownerIds(config as Record<string, unknown>);
    const adminList = Array.isArray(config.ADMIN) ? config.ADMIN.map(String) : [];
    const globalPriv = owners.includes(sid) || adminList.includes(sid);

    const sub = (args[0] || "").toLowerCase();
    if (sub === "all") {
      if (permssion && permssion < 3) {
        await reply("❎ sync all chỉ dành cho admin bot hoặc chủ bot.");
        return;
      }
      const idAll = (threadData as { idAll?: () => Promise<string[]> }).idAll;
      if (typeof idAll !== "function") {
        await reply("❎ threadData.idAll không khả dụng.");
        return;
      }
      let ids: string[] = [];
      try {
        ids = await idAll();
      } catch (e: unknown) {
        await reply(`❎ Không đọc được danh sách nhóm: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      if (!ids.length) {
        await reply("📭 Chưa có nhóm nào trong database.");
        return;
      }
      await reply(`⏳ Đang đồng bộ ${ids.length} nhóm từ Facebook (có nghỉ giữa các request)...`);
      let ok = 0;
      let fail = 0;
      const errors: string[] = [];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const r = await syncThreadFromFb(ctx, id);
        if (r.ok) ok++;
        else {
          fail++;
          if (errors.length < 5 && r.error) errors.push(`${id}: ${r.error}`);
        }
        await new Promise((r) => setTimeout(r, 450));
      }
      let tail = errors.length ? `\n\nVí dụ lỗi:\n${errors.join("\n")}` : "";
      await reply(`✅ Đồng bộ xong: ${ok} thành công, ${fail} lỗi.${tail}`);
      return;
    }

    let live: ThreadInfoLike;
    try {
      live = (await client.getThreadInfo(tid)) as ThreadInfoLike;
    } catch (e: unknown) {
      await reply(`❎ Không gọi được getThreadInfo: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    const admins = threadAdminIdsFromInfo(live);
    const botId = String(
      (client as { getCurrentUserID?: () => string; id?: string }).getCurrentUserID?.() ??
        (client as { id?: string }).id ??
        ""
    );
    const isLiveQtv = admins.includes(sid);
    const participants = Array.isArray(live.participantIDs)
      ? live.participantIDs.map(String)
      : [];
    const inThread = participants.length === 0 || participants.includes(sid);

    if (!globalPriv && !isLiveQtv) {
      await reply("❎ Chỉ quản trị viên nhóm (theo Facebook) hoặc chủ/admin bot mới được đồng bộ.");
      return;
    }

    if (!inThread && !globalPriv) {
      await reply("❎ Bạn không thuộc cuộc trò chuyện này.");
      return;
    }

    await reply("⏳ Đang đồng bộ dữ liệu từ Facebook...");
    const r = await syncThreadFromFb(ctx, tid);
    if (!r.ok) {
      await reply(`❎ Đồng bộ thất bại: ${r.error || "unknown"}`);
      return;
    }

    const botIsQtv = botId && admins.includes(botId);
    await reply(
      [
        `✅ Đã đồng bộ: ${r.title}`,
        `👥 Thành viên (ước lượng): ${r.mem ?? "?"}`,
        `👮 QTV: ${r.qtv ?? "?"}`,
        `📝 User DB: +${r.users?.created ?? 0} mới, ~${r.users?.updated ?? 0} cập nhật`,
        `🤖 Bot là QTV (theo FB): ${botIsQtv ? "Có" : "Không"}`,
      ].join("\n")
    );
  },
};

export default command;
