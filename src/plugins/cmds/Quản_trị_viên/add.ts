"use strict";

import type { Command, CommandOnCallContext } from "@types";

const addCommand: Command = {
  name: "add",
  alias: ["adduser"],
  version: "1.1.3",
  role: 1,
  desc: "Thêm thành viên hoặc thêm QTV (chỉ tag/reply)",
  guide:
    "   {pn} [link profile/uid]\n" +
    "    • Thêm thành viên vào nhóm bằng link profile hoặc uid\n" +
    "      VD: {pn} https://www.facebook.com/profile.php?id=100013549675826\n" +
    "          {pn} 100013549675826\n\n" +
    "   {pn} qtv [@tag/reply]\n" +
    "    • Chỉ hỗ trợ tag hoặc reply để thêm QTV",
  cd: 0,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { client, event, args, threadData, reply, config } = ctx;
    const threadID = event.threadID;
    const sub = String(args[0] || "").toLowerCase();

    if (sub === "qtv") {
      let target: string | null = null;

      if (event.type === "message_reply" && event.messageReply?.senderID) {
        target = String(event.messageReply.senderID);
      } else if (event.mentions && Object.keys(event.mentions).length) {
        target = String(Object.keys(event.mentions)[0]);
      }

      if (!target) {
        await reply("❎ Hãy tag hoặc reply người cần thêm QTV");
        return;
      }

      const t = await threadData.get(threadID);
      const info = t?.data?.threadInfo || t?.threadInfo || {};
      const rawAdmins = Array.isArray(info.adminIDs) ? info.adminIDs : [];
      const adminIDs = rawAdmins
        .map((x: any) => (typeof x === "string" ? x : x?.id || ""))
        .filter(Boolean)
        .map(String);

      const botID = client.getCurrentUserID();
      if (!adminIDs.includes(botID)) {
        await reply("❌ Bot cần là quản trị viên nhóm");
        return;
      }

      const senderID = String(event.senderID);
      const owner = String(config.OWNER || "");

      if (!adminIDs.includes(senderID) && senderID !== owner) {
        await reply("❌ Bạn không đủ quyền hạn dùng lệnh này");
        return;
      }

      const setAdminStatus = client.setAdminStatus as ((threadID: string, userID: string, admin: boolean, callback: (err: Error | null) => void) => void) | undefined;
      if (!setAdminStatus) {
        await reply("❌ Không thể thực hiện thao tác này");
        return;
      }
      setAdminStatus(String(threadID), target, true, async (err: Error | null) => {
        if (err) {
          await reply("❌ Bot không đủ quyền hạn để thay đổi QTV");
          return;
        }
        await reply("✅ Đã thêm QTV");
      });
      return;
    }

    const raw = args[0];
    if (!raw) {
      await reply("❎ Thiếu tham số");
      return;
    }

    const t = await threadData.get(threadID);
    const info = t?.data?.threadInfo || t?.threadInfo || {};
    const participantIDs = Array.isArray(info.participantIDs)
      ? info.participantIDs.map((v: any) => String(v?.id || v))
      : [];
    const approvalMode = !!info.approvalMode;
    const adminIDs = (Array.isArray(info.adminIDs) ? info.adminIDs : []).map((v: any) =>
      String(v?.id || v)
    );

    let uidUser: string | null = null;

    try {
      if (raw.includes(".com/")) {
        const getUID = client.getUID as ((url: string) => Promise<string>) | undefined;
        if (!getUID) {
          await reply("❎ Không thể lấy UID từ link");
          return;
        }
        uidUser = String(await getUID(raw));
      } else {
        uidUser = String(raw);
      }
    } catch {
      await reply("❎ Không lấy được UID từ link");
      return;
    }

    const addUserToGroup = client.addUserToGroup as ((userID: string, threadID: string, callback: (err: Error | null) => void) => void) | undefined;
    if (!addUserToGroup) {
      await reply("❎ Không thể thêm thành viên vào nhóm");
      return;
    }

    addUserToGroup(uidUser, threadID, async (err: Error | null) => {
      if (participantIDs.includes(uidUser!)) {
        await reply("❎ Thành viên đã có mặt trong nhóm");
        return;
      }

      if (err) {
        await reply("❎ Không thể thêm thành viên vào nhóm");
        return;
      }

      const botCurrentID = String(client.getCurrentUserID());
      if (approvalMode && !adminIDs.includes(botCurrentID)) {
        await reply("✅ Đã thêm người dùng vào danh sách phê duyệt");
        return;
      }

      await reply("✅ Thêm thành viên vào nhóm thành công");
    });
  },
};

export default addCommand;
