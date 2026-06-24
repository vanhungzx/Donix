"use strict";

import type { Command, CommandOnCallContext } from '@types';

async function getPrefix(
  threadId: string,
  threadData: any,
  config: any
): Promise<string> {
  const thread = await threadData.get(threadId);
  return thread?.data?.PREFIX || config.PREFIX;
}

function permissionTxt(role: number): string {
  const permissions = ["Thành viên", "Quản trị viên", "Admin Bot", "Chủ Bot"];
  return permissions[role] || "Không xác định";
}

async function infoCmds(
  cmd: any,
  threadID: string,
  threadData: any,
  config: any
): Promise<string> {
  try {
    const prefix = await getPrefix(threadID, threadData, config);
    const help = `${prefix}${cmd.name}`;
    const guideText = typeof cmd.guide === "string" ? cmd.guide : "";
    const formattedGuide = guideText
      ? guideText.replace(/{pn}/g, help)
      : "Không có hướng dẫn";

    return `📌 THÔNG TIN LỆNH
━━━━━━━━━━━━━━━━━━━
🔰 Tên lệnh: ${cmd.name || "Không xác định"}
📝 Phiên bản: ${cmd.version || "Không xác định"}
👑 Quyền hạn: ${permissionTxt(cmd.role ?? 0)}
💭 Mô tả: ${cmd.desc || "Không có mô tả"}
⏰ Hồi chiêu: ${cmd.cd ?? 0} giây
📂 Danh mục: ${(cmd.category || "Khác").replace(/_/g, " ")}
📖 Hướng dẫn sử dụng:

${formattedGuide}`;
  } catch {
    return "❌ Đã xảy ra lỗi khi lấy thông tin lệnh.";
  }
}

function canView(cmd: any, userRole: number): boolean {
  const cmdRole = cmd?.role ?? 0;
  // user (0): chỉ 0
  // qtv (1): chỉ 0, 1
  // admin (2): 0, 1, 2
  // owner (3): 0, 1, 2, 3
  return cmdRole <= userRole;
}

function findByNameOrAlias(cmds: any[], key: string): any {
  const k = String(key).toLowerCase().trim();
  for (const c of cmds) {
    if (String(c.name).toLowerCase() === k) return c;
    if (
      Array.isArray(c.alias) &&
      c.alias.some((a: string) => String(a).toLowerCase() === k)
    )
      return c;
  }
  return null;
}

const helpCommand: Command = {
  name: "help",
  alias: ["help"],
  version: "1.1.2",
  role: 0,
  desc: "Xem danh sách lệnh và thông tin chi tiết 📚",
  guide:
    "   {pn} [tên lệnh/all]\n\n" +
    "   • {pn}: Hiển thị menu các nhóm lệnh 📑\n" +
    "   • {pn} <tên lệnh>: Xem hướng dẫn chi tiết của lệnh 📌\n" +
    "   • {pn} all: Xem tất cả các lệnh có sẵn 📋\n" +
    "   \n" +
    "   Ví dụ:\n" +
    "   • {pn} help\n" +
    "   • {pn} all",
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { client, event, args, threadData, main, config, permission } = ctx;
    const { threadID: tid, senderID } = event;
    const { cmds } = main;
    const type = (args[0] || "").toLowerCase().trim();

    // Determine user role: owner (3) > admin (2) > qtv (1) > user (0)
    // Owner và Admin luôn có quyền cao nhất, không phụ thuộc vào QTV
    let userRole: number = 0;

    if (Number.isInteger(permission)) {
      userRole = permission as number;
    } else {
      const info = (await threadData.get(tid))?.threadInfo;
      const sid = String(senderID);

      // Check owner first (highest priority) - Owner có thể xem tất cả (0,1,2,3)
      // Xử lý cả trường hợp OWNER là array hoặc single value
      const isOwner = Array.isArray(config.OWNER)
        ? config.OWNER.includes(sid)
        : String(config.OWNER) === sid;

      // Check admin bot - Admin có thể xem (0,1,2)
      const isAdmin = Array.isArray(config.ADMIN) && config.ADMIN.includes(sid);

      // Check thread admin (qtv) - QTV chỉ có thể xem (0,1)
      const isQtv = info?.adminIDs?.some((x: any) => String(x.id) === sid);

      if (isOwner) {
        userRole = 3; // Owner: xem tất cả (0, 1, 2, 3) - không cần QTV
      } else if (isAdmin) {
        userRole = 2; // Admin: xem (0, 1, 2) - không cần QTV
      } else if (isQtv) {
        userRole = 1; // QTV: xem (0, 1)
      } else {
        userRole = 0; // User: chỉ xem (0)
      }
    }

    const listAll = Array.from(cmds.values());
    // Filter commands based on viewing permissions:
    // user (0): chỉ 0
    // qtv (1): chỉ 0, 1
    // admin (2): 0, 1, 2
    // owner (3): 0, 1, 2, 3
    const listAvail = listAll.filter((c) => canView(c, userRole));

    if (type === "all") {
      const body = listAvail
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map((c) => `• ${c.name}: ${c.desc || "Không có mô tả"}`)
        .join("\n");

      await client.sendMessage(
        `📜 Danh sách lệnh:\n\n${body || "Không có lệnh nào khả dụng."}`,
        tid
      );
      return;
    }
    if (type) {
      let target = findByNameOrAlias(listAvail, type);
      if (!target) {
        const allTarget = findByNameOrAlias(listAll, type);
        if (allTarget) {
          await client.sendMessage(
            `❎ Bạn không có quyền xem lệnh '${type}'. Lệnh này yêu cầu quyền: ${permissionTxt(allTarget.role ?? 0)}`,
            tid
          );
          return;
        }
        await client.sendMessage(
          `❎ Không tìm thấy lệnh '${type}'.`,
          tid
        );
        return;
      }

      const infoTxt = await infoCmds(target, tid, threadData, config);
      await client.sendMessage(infoTxt, tid);
      return;
    }

    const categories = new Map<string, string[]>();

    for (const c of listAvail) {
      const cat = (c.category || "Khác").replace(/_/g, " ");
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat)!.push(c.name);
    }

    const prefix = await getPrefix(tid, threadData, config);
    let menu = `📚 Menu Lệnh\n\n`;

    for (const [cat, list] of categories) {
      menu += `${cat}:\n${list
        .sort((a, b) => String(a).localeCompare(String(b)))
        .join(", ")}\n\n`;
    }

    menu += `Tổng số lệnh: ${listAvail.length}\n`;
    menu += `Gõ ${prefix}help <tên lệnh> để xem chi tiết`;

    await client.sendMessage(menu, tid);
    return;
  },
};

export default helpCommand;
