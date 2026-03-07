import * as fs from "fs";
import * as path from "path";

const convertTime = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${day}/${month}/${year}`;
};

export default {
  name: "tiktok",
  alias: ["tik"],
  version: "1.1.1",
  role: 0,
  desc: "Thông tin từ nền tảng tiktok",
  guide:
    "   {pn} [Lệnh] [Từ khóa]\n\n" +
    "   Các lệnh có sẵn:\n" +
    "   1. search [từ khóa]: Tìm kiếm video theo từ khóa\n" +
    "   2. info [username]: Xem thông tin người dùng\n" +
    "   3. trending: Xem các video thịnh hành\n" +
    "   4. post [username]: Xem danh sách video của người dùng\n\n" +
    "   Ví dụ:\n" +
    "   {pn} search nhạc hot\n" +
    "   {pn} info @tiktok.user",
  cd: 5,
  prefix: true,
  onCall: async ({
    client,
    utils,
    event,
    api,
    args,
    reply,
    commandName,
    main,
  }: any) => {
    const { threadID: tid, messageID: mid, senderID: sid } = event;
    const argument = args.slice(1).join(" ");
    switch (args[0]) {
      case "info": {
        const userData = await api.tiktok.info(argument);
        const { user, statsV2 } = userData;
        return reply({
          body:
            `╭─────────────⭓\n` +
            `│ Tên: ${user.nickname}\n` +
            `│ Username: ${user.uniqueId}\n` +
            `│ Tiểu sử: ${user.signature || "Không có"}\n` +
            `│ Tích xanh: ${user.verified ? "Có" : "Không"}\n` +
            `│ Người theo dõi: ${parseInt(statsV2.followerCount).toLocaleString()}\n` +
            `│ Đang theo dõi: ${parseInt(statsV2.followingCount).toLocaleString()}\n` +
            `│ Tổng lượt thích: ${parseInt(statsV2.heartCount).toLocaleString()}\n` +
            `│ ID: ${userData.user.id}\n` +
            `│ Thời gian sửa biệt danh: ${convertTime(userData.user.nickNameModifyTime)}\n` +
            `│ Tài khoản riêng tư: ${userData.user.privateAccount ? "Có" : "Không"}\n` +
            `│ Video đã đăng: ${parseInt(statsV2.videoCount).toLocaleString()}\n╰─────────────⭓`,
          attachment: await utils.stream(user.avatarLarger, "jpg"),
        });
      }
      case "info2": {
        const data = await api.tiktok.infov2(argument);
        const u = data?.user || {};
        const s0 = data?.statsV2 || data?.stats || {};
        const num = (v: any) =>
          Number.parseInt(String(v ?? 0).replace(/[^\d]/g, "")) || 0;
        const fmt = (v: any) => num(v).toLocaleString("vi-VN");
        const dt = (ts: any) =>
          ts
            ? new Date(Number(ts) * 1000).toLocaleString("vi-VN", {
              timeZone: "Asia/Ho_Chi_Minh",
            })
            : "Không rõ";
        const avatar = u.avatarLarger || u.avatarMedium || u.avatarThumb || "";
        const bioLink = u?.bioLink?.link ? `\n│ Link bio: ${u.bioLink.link}` : "";
        const commerce = u?.commerceUserInfo?.category
          ? `\n│ Danh mục: ${u.commerceUserInfo.category}`
          : "";
        const org =
          typeof u.isOrganization === "number"
            ? u.isOrganization
              ? "Có"
              : "Không"
            : u.isOrganization
              ? "Có"
              : "Không";
        const heart = s0.heartCount ?? s0.heart ?? 0;
        const body =
          `╭─────────────⭓\n` +
          `│ Tên: ${u.nickname || "Không rõ"}\n` +
          `│ Username: ${u.uniqueId || "Không rõ"}\n` +
          `│ Tiểu sử: ${u.signature || "Không có"}${bioLink}\n` +
          `│ Tích xanh: ${u.verified ? "Có" : "Không"}\n` +
          `│ Người theo dõi: ${fmt(s0.followerCount)}\n` +
          `│ Đang theo dõi: ${fmt(s0.followingCount)}\n` +
          `│ Tổng lượt thích: ${fmt(heart)}\n` +
          `│ Video đã đăng: ${fmt(s0.videoCount)}\n` +
          `│ ID: ${u.id || "Không rõ"}\n` +
          `│ SecUID: ${u.secUid || "Không rõ"}\n` +
          `│ Tài khoản riêng tư: ${u.privateAccount ? "Có" : "Không"}\n` +
          `│ Tổ chức/Doanh nghiệp: ${org}${commerce}\n` +
          `│ Ngôn ngữ: ${u.language || "Không rõ"}\n` +
          `│ Thời gian tạo: ${dt(u.createTime)}\n` +
          `│ Sửa biệt danh: ${dt(u.nickNameModifyTime)}\n` +
          `╰─────────────⭓`;
        const msg: any = { body };
        if (avatar) msg.attachment = await utils.stream(avatar, "jpg");
        return reply(msg);
      }
      case "-s":
      case "search": {
        try {
          const keyword = args.slice(1).join(" ");
          const data = await api.tiktok.search(keyword, 9);
          if (!data || data.length === 0) {
            client.sendMessage("❎ Không tìm thấy kết quả!", tid, mid);
            return;
          }
          const img = data.map((result: any) => result.video.cover);
          const listMessage = data
            .map(
              (result: any, index: number) =>
                `${index + 1}. Title: ${result.desc
                }\n⏳ Thời lượng: ${result.video.duration} giây`,
            )
            .join("\n\n");
          reply(
            {
              body: `${listMessage}\n\n📌 Reply (phản hồi) STT để tải video`,
              attachment: await Promise.all(
                img.map((url: string) => utils.stream(url, "jpg")),
              ),
            },
            (error: any, info: any) => {
              if (error) return console.error("Error sending message:", error);
              main.onReply.set(info.messageID, {
                type: "search",
                commandName,
                author: sid,
                messageID: info.messageID,
                result: data,
              });
            },
          );
        } catch (error: any) {
          console.error("Error:", error.message);
          client.sendMessage("❎ Đã xảy ra lỗi, vui lòng thử lại sau!", tid, mid);
        }
        break;
      }
      case "trend":
      case "trending": {
        const dataTrend = await api.tiktok.trend();
        if (!dataTrend || dataTrend.length === 0) {
          client.sendMessage("❎ Không tìm thấy kết quả!", tid, mid);
          return;
        }
        const randomData = dataTrend.sort(() => 0.5 - Math.random()).slice(0, 6);
        const img = randomData.map((result: any) => result.thumb);
        const messageText = randomData
          .map((item: any, index: number) => {
            const title = item.title;
            const nickname = item.nickname;
            const playCount = item.playCount;
            const likeCount = item.likeCount;
            const commentCount = item.commentCount;
            const shareCount = item.shareCount;
            return `${index + 1}. Title: ${title}\n👤 Author: ${nickname}\n📊 Stats: ${playCount}👀 ${likeCount}❤️ ${commentCount}💬 ${shareCount}🔄`;
          })
          .join("\n\n");
        reply(
          {
            body: `${messageText}\n\n📌 Reply (phản hồi) STT để tải video`,
            attachment: await Promise.all(
              img.map((url: string) => utils.stream(url, "jpg")),
            ),
          },
          (error: any, info: any) => {
            if (error) return console.error("Error sending message:", error);
            main.onReply.set(info.messageID, {
              type: "trending",
              commandName,
              author: sid,
              messageID: info.messageID,
              result: dataTrend,
            });
          },
        );
        break;
      }
      case "post": {
        try {
          const dataPost = await api.tiktok.post(argument);
          if (!dataPost || dataPost.length === 0) {
            client.sendMessage("❎ Không tìm thấy kết quả!", tid, mid);
            return;
          }
          const randomData = dataPost.sort(() => 0.5 - Math.random()).slice(0, 6);
          const img = randomData.map((result: any) => result.thumb);
          const listMessage = randomData
            .map(
              (result: any, index: number) =>
                `${index + 1}. Title: ${result.title
                }\n⏳ Thời lượng: ${result.music.duration} giây`,
            )
            .join("\n\n");
          reply(
            {
              body: `${listMessage}\n\n📌 Reply (phản hồi) STT để tải video`,
              attachment: await Promise.all(
                img.map((url: string) => utils.stream(url, "jpg")),
              ),
            },
            (error: any, info: any) => {
              if (error) {
                console.error("Error sending message:", error);
              } else {
                main.onReply.set(info.messageID, {
                  type: "post",
                  commandName,
                  author: sid,
                  messageID: info.messageID,
                  result: randomData,
                });
              }
            },
          );
        } catch (e) {
          console.log(e);
        }
        break;
      }
      default: {
        client.sendMessage(
          "=== TikTok Command Guide ===\n" +
          "1. Search videos:\n" +
          "   {pn} search <keyword>\n" +
          "2. Get user info:\n" +
          "   {pn} info <username>\n" +
          "3. Get trending videos:\n" +
          "   {pn} trending\n" +
          "4. Get user posts:\n" +
          "   {pn} post <username>\n" +
          "\nReply with numbers to download videos",
          tid,
          mid,
        );
        break;
      }
    }
  },
  onReply: async ({
    utils,
    event,
    client,
    Reply,
    reply,
    api,
  }: any) => {
    const { threadID: tid, messageID: mid, body } = event;
    const choose = parseInt(body);
    switch (Reply.type) {
      case "search": {
        client.unsendMessage(Reply.messageID, tid);
        if (isNaN(choose)) {
          return client.sendMessage("⚠️ Vui lòng nhập 1 con số", tid, mid);
        }
        if (choose > 9 || choose < 1) {
          return client.sendMessage(
            "❎ Lựa chọn không nằm trong danh sách",
            tid,
            mid,
          );
        }
        try {
          const chosenVideo = Reply.result[choose - 1];
          const attachments: any[] = [];
          const res = await api.tiktok.down2(chosenVideo.id);
          if (res.attachments && res.attachments.length > 0) {
            for (const at of res.attachments) {
              if (at.type === "Video") {
                attachments.push(await utils.stream(at.url, "mp4"));
              } else if (at.type === "Photo") {
                attachments.push(await utils.stream(at.url, "jpg"));
              }
            }
          }
          reply({
            body:
              `📝 Description: ${chosenVideo.desc}\n` +
              `⏰ Created: ${convertTime(chosenVideo.createTime)}\n` +
              `❤️ Likes: ${chosenVideo.stats.diggCount.toLocaleString()}\n` +
              `💬 Comments: ${chosenVideo.stats.commentCount.toLocaleString()}\n` +
              `🔄 Shares: ${chosenVideo.stats.shareCount.toLocaleString()}\n` +
              `👀 Views: ${chosenVideo.stats.playCount.toLocaleString()}\n` +
              `📑 Saved: ${chosenVideo.stats.collectCount.toLocaleString()}`,
            attachment: attachments,
          });
        } catch (error) {
          console.error("Error:", error);
          reply("❎ Đã xảy ra lỗi khi tải video!");
        }
        break;
      }
      case "trending": {
        client.unsendMessage(Reply.messageID, tid);
        if (isNaN(choose)) {
          return client.sendMessage("⚠️ Vui lòng nhập 1 con số", tid, mid);
        }
        if (choose > 9 || choose < 1) {
          return client.sendMessage(
            "❎ Lựa chọn không nằm trong danh sách",
            tid,
            mid,
          );
        }
        try {
          const chosenVideo = Reply.result[choose - 1];
          const attachments: any[] = [];
          if (chosenVideo.type === "Video" && chosenVideo.vdbuffer) {
            const uuid = utils.getGUID();
            const filePath = path.join(
              process.cwd(), `src/temp/tiktok_video_${uuid}.mp4`
            );
            fs.writeFileSync(filePath, chosenVideo.vdbuffer);
            attachments.push(fs.createReadStream(filePath));
          } else if (
            chosenVideo.type === "Photo" &&
            Array.isArray(chosenVideo.url)
          ) {
            for (const imgUrl of chosenVideo.url) {
              attachments.push(await utils.stream(imgUrl, "jpg"));
            }
          }
          reply({
            body:
              `📝 Title: ${chosenVideo.title}\n` +
              `👤 ${chosenVideo.nickname} (${chosenVideo.unique_id})\n` +
              `⏰ Created: ${new Date(
                chosenVideo.create_at,
              ).toLocaleString()}\n` +
              `👀 Views: ${chosenVideo.playCount.toLocaleString()}\n` +
              `❤️ Likes: ${chosenVideo.likeCount.toLocaleString()}\n` +
              `💬 Comments: ${chosenVideo.commentCount.toLocaleString()}\n` +
              `🔄 Shares: ${chosenVideo.shareCount.toLocaleString()}\n` +
              `📑 Collects: ${chosenVideo.collectCount.toLocaleString()}`,
            attachment: attachments,
          });
        } catch (error: any) {
          console.error("Error:", error.message);
          reply("❎ Đã xảy ra lỗi khi tải video!");
        }
        break;
      }
      case "post": {
        client.unsendMessage(Reply.messageID, tid);
        if (isNaN(choose)) {
          return client.sendMessage("⚠️ Vui lòng nhập 1 con số", tid, mid);
        }
        if (choose > 9 || choose < 1) {
          return client.sendMessage(
            "❎ Lựa chọn không nằm trong danh sách",
            tid,
            mid,
          );
        }
        try {
          const chosenVideo = Reply.result[choose - 1];
          const res = await api.tiktok.down2(chosenVideo.id);
          const attachments: any[] = [];
          if (res.type === "Video" && res.vdbuffer) {
            const uuid = utils.getGUID();
            const filePath = path.join(
              process.cwd(), `src/temp/tiktok_video_${uuid}.mp4`
            );
            fs.writeFileSync(filePath, res.vdbuffer);
            attachments.push(fs.createReadStream(filePath));
          } else if (res.type === "Photo" && Array.isArray(res.url)) {
            for (const imgUrl of res.url) {
              attachments.push(await utils.stream(imgUrl, "jpg"));
            }
          }
          reply({
            body:
              `📝 Message: ${res.message || ""}\n` +
              `👤 ${res.author.nickname} (${res.author.username})\n` +
              `🎵 Music: ${res.music.title}\n\n` +
              `Stats:\n` +
              `👀 Views: ${res.views}\n` +
              `❤️ Likes: ${res.likes}\n` +
              `💬 Comments: ${res.comments}\n` +
              `🔄 Shares: ${res.shares}`,
            attachment: attachments,
          });
        } catch (error: any) {
          console.error("Error:", error.message);
          reply("❎ Đã xảy ra lỗi khi tải video!");
        }
        break;
      }
      default:
        break;
    }
  },
};
