import axios from "axios";
import type { Command, CommandOnCallContext } from "@types";

const robloxCommand: Command = {
  config: {
    name: "roblox",
    alias: ["rb", "robloxinfo"],
    version: "1.2.2",
    role: 0,
    author: "DongDev + AI Support",
    info: "Check profile Roblox kèm avatar",
    category: "Game",
    guides: "{pn}roblox <username>",
    cd: 5,
    prefix: true
  },

  async onCall(ctx: CommandOnCallContext) {

    const { args, reply, react } = ctx;

    if (!args[0]) {
      return reply("⚠️ Vui lòng nhập username Roblox!");
    }

    const username = args[0];

    if (react) react("⏳");

    try {

      // ===== LẤY USER ID =====
      const resId = await axios.post(
        "https://users.roblox.com/v1/usernames/users",
        {
          usernames: [username],
          excludeBannedUsers: false
        },
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );

      const user = resId?.data?.data?.[0];

      if (!user) {
        if (react) react("❌");
        return reply("❌ Không tìm thấy username này!");
      }

      const userId = user.id;

      // ===== PROFILE =====
      const profileRes = await axios.get(
        `https://users.roblox.com/v1/users/${userId}`
      );

      const profile = profileRes.data;

      // ===== FRIENDS =====
      let friends = 0;
      try {
        const fr = await axios.get(
          `https://friends.roblox.com/v1/users/${userId}/friends/count`
        );
        friends = fr.data.count || 0;
      } catch {}

      // ===== FOLLOWERS / FOLLOWING / GROUP =====
      let followers = 0;
      let following = 0;
      let groupCount = 0;

      try {
        followers = (
          await axios.get(
            `https://friends.roblox.com/v1/users/${userId}/followers/count`
          )
        ).data.count;
      } catch {}

      try {
        following = (
          await axios.get(
            `https://friends.roblox.com/v1/users/${userId}/followings/count`
          )
        ).data.count;
      } catch {}

      try {
        groupCount = (
          await axios.get(
            `https://groups.roblox.com/v2/users/${userId}/groups/roles`
          )
        ).data.data.length;
      } catch {}

      // ===== STATUS =====
      let status = "⭕ Offline";

      try {
        const prs = await axios.post(
          "https://presence.roblox.com/v1/presence/users",
          { userIds: [userId] }
        );

        const state = prs.data.userPresences[0].userPresenceType;

        if (state === 2) status = "🎮 Đang chơi game";
        else if (state === 3) status = "💬 Online";

      } catch {}

      // ===== TUỔI ACCOUNT =====
      const created = new Date(profile.created);
      const now = new Date();

      const diff = Math.abs(now.getTime() - created.getTime());

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const years = Math.floor(days / 365);
      const months = Math.floor((days % 365) / 30);
      const remainDays = days - years * 365 - months * 30;

      const profileLink =
        `https://www.roblox.com/users/${userId}/profile`;

      const text = `
🔰 THÔNG TIN ROBLOX 🔰
────────────────────
👤 Tên hiển thị: ${profile.displayName}
🔥 Username: @${profile.name}
🆔 User ID: ${userId}

👥 Bạn bè: ${friends}
📢 Followers: ${followers}
📌 Đang follow: ${following}
🏰 Số nhóm: ${groupCount}

🔵 Trạng thái: ${status}

📅 Ngày tạo: ${created.toLocaleDateString("vi-VN")}
⏳ Tuổi acc: ${years} năm ${months} tháng ${remainDays} ngày

🔗 Link: ${profileLink}
────────────────────
`;

      // ===== AVATAR =====
      const imgAPI =
        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`;

      const imgRes = await axios.get(imgAPI);

      const imgUrl = imgRes?.data?.data?.[0]?.imageUrl;

      if (!imgUrl) {
        if (react) react("❌");
        return reply("❌ Không lấy được avatar Roblox.");
      }

      const img = await axios.get(imgUrl, {
        responseType: "stream"
      });

      await reply({
        body: text,
        attachment: img.data
      });

      if (react) react("✅");

    } catch (err: any) {

      console.error(
        "ROBLOX ERROR:",
        err?.response?.data || err
      );

      if (react) react("❌");

      return reply("❌ Lỗi lấy dữ liệu Roblox!");
    }
  }
};

export default robloxCommand;