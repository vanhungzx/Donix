import type { Command, CommandOnCallContext, CommandOnReplyContext } from '@types';

interface InstagramPost {
  id: string;
  message: string | null;
  author: string | null;
  like: string | null;
  comment: string | null;
  play: string | null;
  attachments?: Array<{
    type: "Photo" | "Video";
    url: string;
  }>;
}

interface InstagramUserInfo {
  id: string;
  username: string;
  full_name: string;
  biography: string;
  external_url?: string;
  edge_followed_by: {
    count: number;
  };
  edge_follow: {
    count: number;
  };
  category_name?: string;
  is_verified: boolean;
  is_private: boolean;
  is_professional_account: boolean;
  profile_pic_url_hd: string;
}

interface InstagramReel {
  user: {
    full_name: string;
    username: string;
  };
  caption: string;
  like_count: number;
  comment_count: number;
  video: string;
}

const instagramCommand: Command = {
  name: "instagram",
  alias: ["ig"],
  version: "1.1.1",
  role: 0,
  desc: "Thông tin từ nền tảng instagram",
  guide: `   {pn} [Lệnh] [Nội dung]

    Các lệnh có sẵn:

    • post: Xem và tải các bài đăng Instagram

        Cách dùng: {pn} post [username]

        VD: {pn} post cristiano

    • info: Xem thông tin tài khoản Instagram

        Cách dùng: {pn} info [username]

        VD: {pn} info cristiano`,
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, api, utils, args, reply, main, commandName } = ctx;
    const { senderID: sid } = event;

    if (!args || args.length === 0) {
      await reply({
        body: "Hướng dẫn sử dụng"
      });
      return;
    }

    const argument = args.slice(1).join(" ");

    switch (args[0]) {
      case "info": {
        if (!argument) {
          await reply({
            body: "⚠️ Vui lòng nhập username!"
          });
          return;
        }

        try {
          if (!api?.instagram?.info) {
            await reply({
              body: "❌ Service Instagram chưa được load. Vui lòng kiểm tra lại!"
            });
            return;
          }

          const userInfo: InstagramUserInfo = await (api.instagram as any)?.info?.(argument);

          await reply({
            body: `👤 Tên người dùng: ${userInfo.full_name} (${userInfo.username})

📜 Tiểu sử: ${userInfo.biography}

🔗 Liên kết ngoài: ${userInfo.external_url || ""}

👥 Người theo dõi: ${userInfo.edge_followed_by.count.toLocaleString()}

👥 Người đang theo dõi: ${userInfo.edge_follow.count.toLocaleString()}

🏷️ Danh mục: ${userInfo.category_name || ""}

🆔 ID: ${userInfo.id}

✅ Đã xác minh: ${userInfo.is_verified ? "Có" : "Không"}

🔒 Tài khoản riêng tư: ${userInfo.is_private ? "Có" : "Không"}

💼 Tài khoản chuyên nghiệp: ${userInfo.is_professional_account ? "Có" : "Không"}`,
            attachment: await (utils.stream as any)(userInfo.profile_pic_url_hd, "jpg")
          });
        } catch (error: any) {
          console.error("Error:", error.message);
          await reply({
            body: "❎ Đã xảy ra lỗi, vui lòng thử lại sau!"
          });
        }
        break;
      }

      case "-p":
      case "post": {
        try {
          const username = args.slice(1).join(" ");

          if (!username) {
            await reply({
              body: "⚠️ Vui lòng nhập username!"
            });
            return;
          }

          if (!api?.instagram?.post) {
            await reply({
              body: "❌ Service Instagram chưa được load. Vui lòng kiểm tra lại!"
            });
            return;
          }

          const data: InstagramPost[] = await (api.instagram as any)?.post?.(username);

          if (!data || data.length === 0) {
            await reply({
              body: "❎ Không tìm thấy kết quả!"
            });
            return;
          }

          const shuffledData = data.sort(() => Math.random() - 0.5).slice(0, 8);
          const listMessage = shuffledData
            .map(
              (result, index) =>
                `${index + 1}. Author: ${result.author}\nTitle: ${result.message}\n👍 Likes: ${result.like}`
            )
            .join("\n\n");

          const replyInfo = await reply({
            body: `${listMessage}\n\n📌 Reply (phản hồi) STT để tải video`
          }) as any;

          if (replyInfo?.messageID) {
            main.onReply.set(replyInfo.messageID, {
              type: "post",
              commandName,
              author: sid,
              messageID: replyInfo.messageID,
              result: data
            } as any);
          }
        } catch (error: any) {
          console.error("Error:", error.message);
          await reply({
            body: "❎ Đã xảy ra lỗi, vui lòng thử lại sau!"
          });
        }
        break;
      }

      case "reel": {
        try {
          if (!api?.ig?.reels) {
            await reply({
              body: "❌ Service Instagram chưa được load. Vui lòng kiểm tra lại!"
            });
            return;
          }

          const data: InstagramReel[] = await (api.ig as any)?.reels?.();

          if (!data || data.length === 0) {
            await reply({
              body: "❎ Không tìm thấy reels!"
            });
            return;
          }

          const randomReel = data[Math.floor(Math.random() * data.length)]!;

          await reply({
            body: `👤 ${randomReel.user.full_name} (@${randomReel.user.username})

💬 ${randomReel.caption}

❤️ ${randomReel.like_count.toLocaleString()} | 💬 ${randomReel.comment_count.toLocaleString()}`,
            attachment: await (utils.stream as any)(randomReel.video, "mp4")
          });
        } catch (error: any) {
          console.error("Error:", error.message);
          await reply({
            body: "❎ Đã xảy ra lỗi, vui lòng thử lại sau!"
          });
        }
        break;
      }

      default:
        await reply({
          body: "Hướng dẫn sử dụng"
        });
        break;
    }
  },

  async onReply(ctx: CommandOnReplyContext) {
    const { event, utils, Reply, reply, unsend } = ctx;
    const { body } = event;

    if (!Reply) return;

    const replyData = Reply as any;
    const choose = parseInt(body || "");

    switch (replyData.type) {
      case "post": {
        if (unsend && replyData.messageID) {
          await unsend(replyData.messageID);
        }

        if (isNaN(choose)) {
          await reply("⚠️ Vui lòng nhập 1 con số");
          return;
        }

        if (choose > 9 || choose < 1) {
          await reply({
            body: "❎ Lựa chọn không nằm trong danh sách"
          });
          return;
        }

        try {
          const res: InstagramPost = replyData.result[choose - 1];

          if (res.attachments && res.attachments.length > 0) {
            const attachments: any[] = [];

            for (const attachmentItem of res.attachments) {
              if (attachmentItem.type === "Video") {
                attachments.push(await (utils.stream as any)(attachmentItem.url, "mp4"));
              }

              if (attachmentItem.type === "Photo") {
                attachments.push(await (utils.stream as any)(attachmentItem.url, "jpg"));
              }
            }

            await reply({
              body: `⩺ Tiêu đề: ${res.message}\n⩺ Tác giả: ${res.author}\n⩺ Lượt thích: ${res.like}\n⩺ Bình luận: ${res.comment}`,
              attachment: attachments
            });
          }
        } catch (error: any) {
          console.error("Error:", error.message);
          await reply({
            body: "❎ Đã xảy ra lỗi khi tải video!"
          });
        }
        break;
      }

      default:
        break;
    }
  }
};

export default instagramCommand;
