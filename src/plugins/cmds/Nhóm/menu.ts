"use strict";

import type { BotConfig, Command, CommandOnCallContext, CommandOnReplyContext, MainData, ThreadDataModel } from '@types';

const autoUnsend = { status: true, timeOut: 60 };

// Hàm tính độ tương đồng đơn giản (Levenshtein distance)
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}

async function getPrefix(threadID: string, threadData: ThreadDataModel, config: BotConfig): Promise<string> {
  try {
    const thread = await threadData.get(threadID);
    const threadPrefix = thread?.data?.PREFIX;
    const configPrefix = config?.PREFIX;
    return (typeof threadPrefix === 'string' ? threadPrefix : undefined) ||
      (typeof configPrefix === 'string' ? configPrefix : undefined) ||
      "!";
  } catch {
    const configPrefix = config?.PREFIX;
    return (typeof configPrefix === 'string' ? configPrefix : undefined) || "!";
  }
}

function permissionTxt(role: number): string {
  const permissions = ["Thành viên", "Quản trị viên", "Admin Bot", "Chủ Bot"];
  return permissions[role] || "Không xác định";
}

async function infoCmds(
  cmd: Command,
  threadID: string,
  threadData: ThreadDataModel,
  config: BotConfig
): Promise<string> {
  try {
    if (!cmd || !cmd.name) throw new Error("Invalid command object");

    const prefix = await getPrefix(threadID, threadData, config);
    const help = `${prefix}${cmd.name}`;
    const guideText = cmd.guide || "";
    const formattedGuide = guideText ? guideText.replace(/{pn}/g, help) : "Không có hướng dẫn";

    return `[ THÔNG TIN LỆNH ]

📝 Tên lệnh: ${cmd.name}
💭 Tên gọi khác: ${Array.isArray(cmd.alias) && cmd.alias.length ? cmd.alias.join(", ") : "Không có"}
📊 Phiên bản: ${cmd.version || "Không xác định"}
👑 Quyền hạn: ${permissionTxt(cmd.role || 0)}
📋 Mô tả: ${cmd.desc || "Không có mô tả"}
⏱️ Hồi chiêu: ${cmd.cd || 0} giây
📁 Danh mục: ${(cmd.category || "Khác").replace(/_/g, " ")}

📌 Hướng dẫn sử dụng:

${formattedGuide}`;
  } catch {
    return "❌ Đã xảy ra lỗi khi lấy thông tin lệnh.";
  }
}

function canView(cmd: Command, userRole: number): boolean {
  const cmdRole = cmd?.role ?? 0;
  // user (0): chỉ 0
  // qtv (1): chỉ 0, 1
  // admin (2): 0, 1, 2
  // owner (3): 0, 1, 2, 3
  return cmdRole <= userRole;
}

function findCmdByNameOrAlias(cmdList: Command[], input: string): Command | null {
  const key = String(input).toLowerCase().trim();
  for (const cmd of cmdList) {
    if (cmd.name && String(cmd.name).toLowerCase() === key) return cmd;
    if (Array.isArray(cmd.alias) && cmd.alias.some((a: string) => String(a).toLowerCase() === key))
      return cmd;
  }
  return null;
}

function commandsGroup(main: MainData, userRole: number): Array<{ category: string; commandsName: string[] }> {
  const groups = new Map<string, string[]>();
  for (const cmd of main.cmds.values()) {
    if (canView(cmd, userRole)) {
      const categoryName = (cmd.category || "Khác").replace(/_/g, " ");
      if (!groups.has(categoryName)) {
        groups.set(categoryName, []);
      }
      groups.get(categoryName)!.push(cmd.name);
    }
  }
  return Array.from(groups.entries())
    .map(([category, commandsName]) => ({ category, commandsName }))
    .sort((a, b) => b.commandsName.length - a.commandsName.length);
}

function findBestMatch(input: string, commands: string[]): { target: string; rating: number } {
  let bestMatch = { target: "", rating: 0 };
  for (const cmd of commands) {
    const rating = calculateSimilarity(input, cmd);
    if (rating > bestMatch.rating) {
      bestMatch = { target: cmd, rating };
    }
  }
  return bestMatch;
}

const menuCommand: Command = {
  name: "menu",
  alias: ["men"],
  version: "1.1.5",
  role: 0,
  desc: "Xem danh sách lệnh",
  guide: `{pn} [tên lệnh/all]

1. Xem thông tin lệnh:

• {pn} <tên lệnh>

• Ví dụ: {pn} help

2. Xem tất cả lệnh:

• {pn} all

3. Xem menu danh mục:

• {pn}`,
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext) {
    const { event, args, main, config, threadData, commandName, permission, permssion, reply, unsend, react } = ctx;
    const { threadID: tid, senderID: sid } = event;

    // Determine user role: owner (3) > admin (2) > qtv (1) > user (0)
    // Owner và Admin luôn có quyền cao nhất, không phụ thuộc vào QTV
    let userRole: number = 0;

    if (Number.isInteger(permission)) {
      userRole = permission as number;
    } else if (Number.isInteger(permssion)) {
      userRole = permssion as number;
    } else {
      const info = (await threadData.get(tid))?.threadInfo;
      const senderIDStr = String(sid);

      // Check owner first (highest priority) - Owner có thể xem tất cả (0,1,2,3)
      // Xử lý cả trường hợp OWNER là array hoặc single value
      const isOwner = Array.isArray(config.OWNER)
        ? config.OWNER.includes(senderIDStr)
        : String(config.OWNER) === senderIDStr;

      // Check admin bot - Admin có thể xem (0,1,2)
      const isAdmin = Array.isArray(config.ADMIN) && config.ADMIN.includes(senderIDStr);

      // Check thread admin (qtv) - QTV chỉ có thể xem (0,1)
      const isQtv = info?.adminIDs?.some((x: string | { id: string }) => {
        if (typeof x === 'string') return x === senderIDStr;
        return String(x.id) === senderIDStr;
      });

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

    const allCmds = Array.from(main.cmds.values());
    // Filter commands based on viewing permissions:
    // user (0): chỉ 0
    // qtv (1): chỉ 0, 1
    // admin (2): 0, 1, 2
    // owner (3): 0, 1, 2, 3
    const availableCmds = allCmds.filter((c) => canView(c, userRole));

    if (react) react("📋");

    if (args.length >= 1) {
      const first = String(args[0]).toLowerCase();

      if (first === "all") {
        const bodyList = availableCmds
          .sort((a, b) => String(a.name).localeCompare(String(b.name)))
          .map((c, i) => `${i + 1}. ${c.name}: ${c.desc || "Không có mô tả"}`)
          .join("\n");

        const txt = `[ DANH SÁCH LỆNH ]\n\n${bodyList || "Không có lệnh nào khả dụng cho quyền hiện tại."}`;

        const sent = await reply({
          body: txt + `\n\n⏱️ Tự động gỡ sau: ${autoUnsend.timeOut}s`,
        });

        if (autoUnsend.status && unsend && sent?.messageID) {
          setTimeout(() => unsend(String(sent.messageID)), 1000 * autoUnsend.timeOut);
        }

        return;
      }

      const joined = args.join(" ");
      const cmd = findCmdByNameOrAlias(availableCmds, joined);

      if (cmd) {
        const info = await infoCmds(cmd, tid, threadData, config);
        await reply({ body: info });
        return;
      }

      // Check if command exists but user doesn't have permission
      const allTarget = findCmdByNameOrAlias(allCmds, joined);
      if (allTarget) {
        await reply({
          body: `❎ Bạn không có quyền xem lệnh '${joined}'. Lệnh này yêu cầu quyền: ${permissionTxt(allTarget.role ?? 0)}`,
        });
        return;
      }

      // Try to find similar command
      if (availableCmds.length) {
        const cmdNames = availableCmds.map((c) => c.name).filter((n): n is string => !!n);
        const match = findBestMatch(joined, cmdNames);
        if (match.rating >= 0.3) {
          await reply({
            body: `💭 Có phải bạn muốn tìm: "${match.target}"?`,
          });
          return;
        }
      }

      await reply({
        body: `❌ Không tìm thấy lệnh phù hợp với quyền hiện tại`,
      });
      return;
    }

    const categories = commandsGroup(main, userRole);
    const totalCommands = categories.reduce((s, c) => s + c.commandsName.length, 0);

    let menu = `[ MENU LỆNH ]\n\n`;

    categories.forEach(({ category, commandsName }, i) => {
      menu += `${i + 1}. ${category} (${commandsName.length} lệnh)\n`;
    });

    menu += `\n📊 Tổng số lệnh: ${totalCommands}`;
    menu += `\n💭 Reply (1-${categories.length}) để xem chi tiết`;
    menu += `\n⏱️ Tự động gỡ sau: ${autoUnsend.timeOut}s`;

    const sent = await reply({ body: menu });

    if (sent?.messageID) {
      main.onReply.set(sent.messageID, {
        commandName,
        messageID: sent.messageID,
        author: String(sid),
        case: "infoGr",
        data: categories as unknown as Record<string, string | number | boolean | null | undefined>,
        role: userRole,
      });

      if (autoUnsend.status && unsend && sent?.messageID) {
        setTimeout(() => unsend(String(sent.messageID)), 1000 * autoUnsend.timeOut);
      }
    }
  },
  async onReply(ctx: CommandOnReplyContext) {
    const { Reply: $, event, config, commandName, main, threadData, reply, unsend } = ctx;
    const { threadID: tid, senderID: sid, body } = event;

    if (!$) return;

    const role = Number.isInteger($.role) ? $.role : 0;

    if (sid !== $.author) {
      await reply({ body: `⚠️ Bạn không phải người dùng lệnh này` });
      return;
    }

    const args = (body || "").trim().split(/\s+/);

    switch ($.case) {
      case "infoGr": {
        const index = parseInt(args[0]);
        const data = $.data as Array<{ category: string; commandsName: string[] }> | undefined;
        const category = data?.[index - 1];

        if (!category) {
          await reply({ body: `❌ Số không hợp lệ "${args[0]}"` });
          return;
        }

        if (unsend && $.messageID) {
          unsend($.messageID);
        }

        const names = category.commandsName.filter((name: string) => {
          const cmd = main.cmds.get(name);
          return cmd && canView(cmd, role || 0);
        });

        const list = names.map((name: string, i: number) => {
          const c = main.cmds.get(name);
          return `${i + 1}. ${name}: ${c?.desc || "Không có mô tả"}`;
        });

        const help = await getPrefix(tid, threadData, config);

        const txt = `[ ${category.category} ]\n\n${list.join("\n") || "Không có lệnh khả dụng."}\n\n💭 Reply (1-${list.length}) để xem chi tiết\n⏱️ Tự động gỡ sau: ${autoUnsend.timeOut}s\n📝 Dùng ${help}help + lệnh để xem cách dùng`;

        const sent = await reply({ body: txt });

        if (sent?.messageID) {
          main.onReply.set(sent.messageID, {
            commandName,
            messageID: sent.messageID,
            author: String(sid),
            case: "infoCmds",
            data: names as unknown as Record<string, string | number | boolean | null | undefined>,
            role: role || 0,
          });

          if (autoUnsend.status && unsend && sent?.messageID) {
            setTimeout(() => unsend(String(sent.messageID)), 1000 * autoUnsend.timeOut);
          }
        }

        return;
      }

      case "infoCmds": {
        const index = parseInt(args[0]);
        const data = $.data as string[] | undefined;
        const name = data?.[index - 1];
        if (!name) {
          await reply({ body: `❌ Số không hợp lệ "${args[0]}"` });
          return;
        }
        const cmd = main.cmds.get(name);

        if (!cmd || !canView(cmd, role || 0)) {
          await reply({ body: `❌ Số không hợp lệ "${args[0]}"` });
          return;
        }

        if (unsend && $.messageID) {
          unsend($.messageID);
        }

        const info = await infoCmds(cmd, tid, threadData, config);
        await reply({ body: info });
        return;
      }
    }
  },
};

export default menuCommand;
