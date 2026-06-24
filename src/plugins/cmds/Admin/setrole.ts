"use strict";

import type { Command, CommandOnCallContext } from "@types";

interface RoleOverrides {
  [commandName: string]: number;
}

async function loadRoleOverrides(threadData: any, threadID: string): Promise<RoleOverrides> {
  try {
    const thread = await threadData.get(threadID);
    if (thread?.settings?.commandRoles) {
      return thread.settings.commandRoles;
    }
  } catch (error: any) {
    console.error("Error loading role overrides:", error.message);
  }
  return {};
}

async function saveRoleOverrides(threadData: any, threadID: string, overrides: RoleOverrides): Promise<void> {
  try {
    const thread = await threadData.get(threadID);
    const currentSettings = thread?.settings || {};

    
    if (Object.keys(overrides).length === 0) {
      const { commandRoles, ...restSettings } = currentSettings;
      await threadData.update(threadID, { settings: restSettings });
    } else {
      await threadData.update(threadID, {
        settings: { ...currentSettings, commandRoles: overrides }
      });
    }
  } catch (error: any) {
    throw new Error(`Failed to save role overrides: ${error.message}`);
  }
}

function getRoleName(role: number): string {
  const roleNames = ["Thành viên", "Quản Trị Viên", "ADMIN BOT", "Chủ Bot"];
  return roleNames[role] || "Không xác định";
}

const setroleCommand: Command = {
  name: "setrole",
  alias: ["setrole"],
  version: "1.0.0",
  role: 1,
  desc: "Đặt role cho lệnh theo nhóm (Quản Trị Viên có thể set tối đa role 1, Admin Bot set tối đa role 2, Owner set tối đa role 3)",
  guide:
    "• {pn} <tên lệnh> <role>: Đặt role cho lệnh (0-3)\n" +
    "• {pn} <tên lệnh> reset: Xóa role override, trở về mặc định\n" +
    "• {pn} list: Xem danh sách role override trong nhóm\n" +
    "• {pn} <tên lệnh>: Xem role hiện tại của lệnh\n\n" +
    "Ví dụ:\n" +
    "• {pn} help 1 - Đặt lệnh help cần role 1 (Quản Trị Viên)\n" +
    "• {pn} ban reset - Xóa role override của lệnh ban",
  cd: 2,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, main, config, reply, threadData } = ctx;
    const { threadID, senderID } = event;
    const tid = String(threadID);
    const sid = String(senderID);

    
    const isOwner = Array.isArray(config.OWNER)
      ? config.OWNER.includes(sid)
      : String(config.OWNER) === String(sid);
    const isAdmin = Array.isArray(config.ADMIN)
      ? config.ADMIN.includes(sid)
      : false;

    
    const threadInfo = (await threadData.get(tid))?.threadInfo;
    const isTAdmin = threadInfo?.adminIDs?.some((a: any) => String(a.id) === String(sid));

    
    const userRole = isOwner ? 3 : isAdmin ? 2 : isTAdmin ? 1 : 0;
    const maxRoleCanSet = userRole; 

    if (userRole === 0) {
      await reply({
        body: "❌ Bạn không có quyền sử dụng lệnh này. Chỉ Quản Trị Viên, Admin Bot và Owner mới có thể sử dụng.",
      });
      return;
    }

    const action = args[0]?.toLowerCase().trim();
    const { cmds } = main;

    
    if (action === "list" || action === "ls") {
      const threadOverrides = await loadRoleOverrides(threadData, tid);
      const userRoleName = getRoleName(userRole);

      if (Object.keys(threadOverrides).length === 0) {
        let emptyMsg = "📋 Nhóm này chưa có role override nào cho lệnh.\n\n";
        emptyMsg += `📌 Quyền của bạn: ${userRoleName} (${userRole})\n`;
        emptyMsg += `📌 Bạn có thể set role từ 0 đến ${maxRoleCanSet}:\n`;

        for (let i = 0; i <= maxRoleCanSet; i++) {
          emptyMsg += `  • ${i}: ${getRoleName(i)}\n`;
        }

        emptyMsg += `\n💡 Sử dụng: {pn} <tên lệnh> <role> để đặt role cho lệnh.`;

        await reply({ body: emptyMsg });
        return;
      }

      const list = Object.entries(threadOverrides)
        .map(([cmdName, role]) => {
          const cmd = cmds.get(cmdName);
          const defaultRole = cmd?.role ?? 0;
          const roleName = getRoleName(role as number);
          const defaultRoleName = getRoleName(defaultRole);
          return `• ${cmdName}: ${roleName} (mặc định: ${defaultRoleName})`;
        })
        .join("\n");

      let listMsg = `📋 Danh sách role override trong nhóm:\n\n${list}\n\n`;
      listMsg += `📌 Quyền của bạn: ${userRoleName} (${userRole})\n`;
      listMsg += `📌 Bạn có thể set role từ 0 đến ${maxRoleCanSet}:\n`;

      for (let i = 0; i <= maxRoleCanSet; i++) {
        listMsg += `  • ${i}: ${getRoleName(i)}\n`;
      }

      listMsg += `\n💡 Sử dụng: {pn} <tên lệnh> reset để xóa role override.`;

      await reply({ body: listMsg });
      return;
    }

    
    if (!action) {
      const userRoleName = getRoleName(userRole);
      const roleRange = `(0-${maxRoleCanSet})`;
      const exampleRole = maxRoleCanSet;

      let usageGuide = "📌 Cách sử dụng:\n\n";
      usageGuide += `• {pn} <tên lệnh> <role>: Đặt role cho lệnh ${roleRange}\n`;
      usageGuide += `• {pn} <tên lệnh> reset: Xóa role override\n`;
      usageGuide += `• {pn} list: Xem danh sách role override\n`;
      usageGuide += `• {pn} <tên lệnh>: Xem role hiện tại\n\n`;
      usageGuide += `📌 Quyền của bạn: ${userRoleName} (${userRole})\n`;
      usageGuide += `📌 Bạn có thể set role tối đa: ${maxRoleCanSet} (${getRoleName(maxRoleCanSet)})\n\n`;
      usageGuide += `Ví dụ:\n`;
      usageGuide += `• {pn} help ${exampleRole}\n`;
      usageGuide += `• {pn} ban reset`;

      await reply({ body: usageGuide });
      return;
    }

    
    let targetCmd: any = null;
    for (const cmd of cmds.values()) {
      if (cmd.name.toLowerCase() === action || cmd.alias?.some((a) => a.toLowerCase() === action)) {
        targetCmd = cmd;
        break;
      }
    }

    if (!targetCmd) {
      await reply({
        body: `❌ Không tìm thấy lệnh "${action}".\n\n💡 Sử dụng: {pn} list để xem các lệnh đã được set role.`,
      });
      return;
    }

    const cmdName = targetCmd.name;
    const roleArg = args[1]?.toLowerCase().trim();

    
    if (!roleArg) {
      const threadOverrides = await loadRoleOverrides(threadData, tid);
      const overrideRole = threadOverrides[cmdName];
      const defaultRole = targetCmd.role ?? 0;
      const userRoleName = getRoleName(userRole);

      let infoMsg = `📌 Lệnh "${cmdName}":\n\n`;

      if (overrideRole !== undefined) {
        infoMsg += `• Role hiện tại (override): ${getRoleName(overrideRole)} (${overrideRole})\n`;
        infoMsg += `• Role mặc định: ${getRoleName(defaultRole)} (${defaultRole})\n`;
      } else {
        infoMsg += `• Role hiện tại: ${getRoleName(defaultRole)} (${defaultRole})\n`;
        infoMsg += `• Chưa có role override\n`;
      }

      infoMsg += `\n📌 Quyền của bạn: ${userRoleName} (${userRole})\n`;
      infoMsg += `📌 Bạn có thể set role từ 0 đến ${maxRoleCanSet}:\n`;

      
      for (let i = 0; i <= maxRoleCanSet; i++) {
        infoMsg += `  • ${i}: ${getRoleName(i)}\n`;
      }

      if (overrideRole !== undefined) {
        infoMsg += `\n💡 Sử dụng: {pn} ${cmdName} reset để xóa override.`;
      } else {
        infoMsg += `\n💡 Sử dụng: {pn} ${cmdName} <role> để đặt role override.`;
      }

      await reply({ body: infoMsg });
      return;
    }

    
    if (roleArg === "reset" || roleArg === "remove" || roleArg === "delete" || roleArg === "del") {
      const threadOverrides = await loadRoleOverrides(threadData, tid);
      const userRoleName = getRoleName(userRole);

      if (threadOverrides[cmdName] !== undefined) {
        delete threadOverrides[cmdName];
        await saveRoleOverrides(threadData, tid, threadOverrides);

        let resetMsg = `✅ Đã xóa role override cho lệnh "${cmdName}".\n`;
        resetMsg += `📌 Lệnh sẽ sử dụng role mặc định: ${getRoleName(targetCmd.role ?? 0)}\n\n`;
        resetMsg += `📌 Quyền của bạn: ${userRoleName} (${userRole})\n`;
        resetMsg += `📌 Bạn có thể set role từ 0 đến ${maxRoleCanSet}:\n`;

        for (let i = 0; i <= maxRoleCanSet; i++) {
          resetMsg += `  • ${i}: ${getRoleName(i)}\n`;
        }

        await reply({ body: resetMsg });
      } else {
        let noOverrideMsg = `ℹ️ Lệnh "${cmdName}" chưa có role override để xóa.\n\n`;
        noOverrideMsg += `📌 Quyền của bạn: ${userRoleName} (${userRole})\n`;
        noOverrideMsg += `📌 Bạn có thể set role từ 0 đến ${maxRoleCanSet}:\n`;

        for (let i = 0; i <= maxRoleCanSet; i++) {
          noOverrideMsg += `  • ${i}: ${getRoleName(i)}\n`;
        }

        await reply({ body: noOverrideMsg });
      }
      return;
    }

    
    const newRole = parseInt(roleArg, 10);
    if (isNaN(newRole) || newRole < 0 || newRole > 3) {
      const userRoleName = getRoleName(userRole);
      let roleList = `❌ Role không hợp lệ. Role phải là số từ 0 đến ${maxRoleCanSet}:\n\n`;

      
      for (let i = 0; i <= maxRoleCanSet; i++) {
        roleList += `• ${i}: ${getRoleName(i)}\n`;
      }

      roleList += `\n📌 Quyền của bạn: ${userRoleName} (${userRole})\n`;
      roleList += `📌 Bạn chỉ có thể set role từ 0 đến ${maxRoleCanSet}`;

      await reply({ body: roleList });
      return;
    }

    
    if (newRole > maxRoleCanSet) {
      const userRoleName = getRoleName(userRole);
      const targetRoleName = getRoleName(newRole);
      const maxRoleName = getRoleName(maxRoleCanSet);

      let errorMsg = `❌ Bạn không có quyền đặt role ${newRole} (${targetRoleName}) cho lệnh "${cmdName}".\n\n`;
      errorMsg += `📌 Role hiện tại của bạn: ${userRoleName} (${userRole})\n`;
      errorMsg += `📌 Bạn chỉ có thể đặt role tối đa: ${maxRoleCanSet} (${maxRoleName})\n\n`;
      errorMsg += `💡 Bạn có thể set role từ 0 đến ${maxRoleCanSet}:\n`;

      
      for (let i = 0; i <= maxRoleCanSet; i++) {
        errorMsg += `• ${i}: ${getRoleName(i)}\n`;
      }

      await reply({ body: errorMsg });
      return;
    }

    
    const threadOverrides = await loadRoleOverrides(threadData, tid);
    const oldRole = threadOverrides[cmdName];
    threadOverrides[cmdName] = newRole;
    await saveRoleOverrides(threadData, tid, threadOverrides);

    const defaultRole = targetCmd.role ?? 0;
    const oldRoleText = oldRole !== undefined ? `${getRoleName(oldRole)} (${oldRole})` : `${getRoleName(defaultRole)} (${defaultRole}) - mặc định`;

    
    const userRoleName = getRoleName(userRole);
    let successMsg = `✅ Đã đặt role cho lệnh "${cmdName}":\n\n`;
    successMsg += `• Role mới: ${getRoleName(newRole)} (${newRole})\n`;
    successMsg += `• Role cũ: ${oldRoleText}\n`;
    successMsg += `\n📌 Quyền của bạn: ${userRoleName} (${userRole})`;

    if (isOwner) {
      successMsg += `\n👑 Bạn là Owner - có quyền set bất kỳ role nào (0-3)`;
    } else {
      successMsg += `\n📌 Bạn có thể set role tối đa: ${maxRoleCanSet} (${getRoleName(maxRoleCanSet)})`;
    }

    successMsg += `\n\n💡 Sử dụng: {pn} ${cmdName} reset để xóa override.`;

    await reply({ body: successMsg });
  },
};

export default setroleCommand;
