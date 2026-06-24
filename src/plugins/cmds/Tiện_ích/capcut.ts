import type { Command, CommandOnCallContext, CommandOnReplyContext } from '@types';
import moment from "moment-timezone";

interface VideoTemplate {
  title: string;
  cover_url: string;
  video_url: string;
  web_id: string;
  duration: number;
  fragment_count: number;
  usage_amount: number;
  play_amount: number;
  like_count: number;
  favorite_count: number;
  create_time: number;
  author: {
    name: string;
    unique_id: string;
  };
  interaction?: {
    comment_count: number;
  };
}

interface PostData {
  id: string;
  message: string;
  thumb: string;
  duration: number;
  fragment_count: number;
  usage_amount: number;
  play_amount: number;
  like_count: number;
  comment_count: number;
  favorite_count: number;
  create_time: number;
  author: {
    name: string;
    unique_id: string;
  };
  attachments?: Array<{
    type: string;
    url: string;
  }>;
}

function formatTime(time: number): string {
  const totalSeconds = Math.floor(time / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getRandomItems<T>(items: T[], count: number = 6): T[] {
  const randomIndexes: number[] = [];
  while (randomIndexes.length < count && randomIndexes.length < items.length) {
    const randomIndex = Math.floor(Math.random() * items.length);
    if (!randomIndexes.includes(randomIndex)) {
      randomIndexes.push(randomIndex);
    }
  }
  return randomIndexes.map((index) => items[index]).filter((item): item is T => item !== undefined);
}

function convertTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${day}/${month}/${year}`;
}

const capcutCommand: Command = {
  name: "capcut",
  alias: ["capcut"],
  version: "1.1.1",
  role: 0,
  desc: "Thông tin từ nền tảng capcut",
  guide:
    "{pn} info + [link]: Xem thông tin người tạo mẫu\n{pn} search + [từ khóa]: Tìm kiếm mẫu capcut\n{pn} post + [link profile]: Xem bài đăng của người tạo\n{pn} trending: Xem các mẫu capcut đang thịnh hành",
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, reply, utils, api, main, commandName } = ctx;
    const { senderID: sid } = event;

    const subcommand = args[0];
    const argument = args.slice(1).join(" ");

    switch (subcommand) {
      case "info": {
        const url = argument;
        if (!url) {
          await reply({
            body: "Vui lòng cung cấp link profile của người tạo!"
          });
          return;
        }

        if (!url.startsWith("https://mobile.capcutshare.com/")) {
          await reply({
            body: "❎ URL không hợp lệ. Vui lòng nhập URL có dạng https://mobile.capcutshare.com"
          });
          return;
        }

        try {
          if (!api?.capcut?.info) {
            await reply({
              body: "❌ Service CapCut chưa được load. Vui lòng kiểm tra lại!"
            });
            return;
          }

          const userData = await (api.capcut as any)?.info?.(url);
          const user = userData.user;
          const userStatistics = userData.user_statistics;
          const vipInfo = userData.vip_info;

          const tiktokInfo = user.is_display_tiktok_profile
            ? `Bật\n│ Link: ${user.tiktok_user_info.deeplink}`
            : "Tắt";

          const certificationDesc = user.creator_info.certification_desc
            ? `${user.creator_info.certification_desc}`
            : "Chưa có";

          const avatarStream = await (utils.stream as any)(user.avatar_url, "jpg");

          await reply({
            body: `╭─────────────⭓
│ Tên: ${user.name}
│ CapcutID: ${user.unique_id}
│ Uid: ${user.uid}
│ Giới tính: ${user.gender === 1 ? "Nam" : user.gender === 2 ? "Nữ" : "Không xác định"}
│ Đang theo dõi: ${user.relation_info.statistics.following_count}
│ Người theo dõi: ${user.relation_info.statistics.follower_count}
│ Tổng lượt thích: ${userStatistics.like_count}
│ Mô tả: ${user.description}
│ Bị ban: ${user.ban ? "Có" : "Không"}
│ Tổng số mẫu: ${userStatistics.template_count}
│ Vai trò: ${user.role}
${vipInfo ? `│ Gói vip: ${convertTime(vipInfo.start_time)} - ${convertTime(vipInfo.end_time)}` : "│ Không đăng ký"}
├─────────────⭔
│ Thông tin người sáng tạo
│ Level: ${user.creator_info.level}
│ Điểm: ${user.creator_info.score_v2}
│ Level (v2): ${user.creator_info.level_v2}
│ Mô tả chứng nhận: ${certificationDesc}
│ Liên kết: ${user.creator_info.affiliation_biz_id}
├─────────────⭔
│ Đang hiển thị hồ sơ tiktok: ${tiktokInfo}
╰─────────────⭓`,
            attachment: [avatarStream]
          });
        } catch (error: any) {
          console.error(error);
          await reply({
            body: "❎ Không tìm thấy dữ liệu người dùng"
          });
        }
        break;
      }

      case "-s":
      case "search": {
        try {
          const keyword = args.slice(1).join(" ");
          if (!keyword) {
            await reply({
              body: "❎ Vui lòng nhập từ khóa tìm kiếm!"
            });
            return;
          }

          if (!api?.capcut?.search) {
            await reply({
              body: "❌ Service CapCut chưa được load. Vui lòng kiểm tra lại!"
            });
            return;
          }

          const data = await (api.capcut as any)?.search?.(keyword);

          if (!data || !data.video_templates || data.video_templates.length === 0) {
            await reply({
              body: "❎ Không tìm thấy kết quả!"
            });
            return;
          }

          const searchData = getRandomItems(data.video_templates) as VideoTemplate[];
          const img = searchData.map((result) => result.cover_url);
          const listMessage = searchData
            .map((result, index) => `${index + 1}. Title: ${result.title}`)
            .join("\n\n");

          const attachments = await Promise.all(img.map((url) => (utils.stream as any)(url, "jpg")));

          const replyInfo = await reply({
            body: `${listMessage}\n\n📌 Reply (phản hồi) STT để tải video`,
            attachment: attachments
          }) as any;

          if (replyInfo?.messageID) {
            main.onReply.set(replyInfo.messageID, {
              type: "search",
              commandName,
              author: sid,
              messageID: replyInfo.messageID,
              result: searchData
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

      case "post":
      case "-p": {
        const urlp = args.slice(1).join(" ");
        if (!urlp) {
          await reply({
            body: "❎ Vui lòng nhập link profile!"
          });
          return;
        }

        try {
          if (!api?.capcut?.post) {
            await reply({
              body: "❌ Service CapCut chưa được load. Vui lòng kiểm tra lại!"
            });
            return;
          }

          const datap = await (api.capcut as any)?.post?.(urlp);

          if (!datap || datap.length === 0) {
            await reply({
              body: "❎ Không tìm thấy kết quả!"
            });
            return;
          }

          const postdata = getRandomItems(datap) as PostData[];
          const img = postdata.map((result) => result.thumb);
          const listMes = postdata
            .map((result, index) => `${index + 1}. Title: ${result.message}\n👤 Author: ${result.author.name}`)
            .join("\n\n");

          const attachments = await Promise.all(img.map((url) => (utils.stream as any)(url, "jpg")));

          const replyInfo = await reply({
            body: `${listMes}\n\n📌 Reply (phản hồi) STT để tải video`,
            attachment: attachments
          }) as any;

          if (replyInfo?.messageID) {
            main.onReply.set(replyInfo.messageID, {
              type: "post",
              commandName,
              author: sid,
              messageID: replyInfo.messageID,
              result: postdata
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

      case "trend":
      case "trending": {
        try {
          if (!api?.capcut?.trending) {
            await reply({
              body: "❌ Service CapCut chưa được load. Vui lòng kiểm tra lại!"
            });
            return;
          }

          const datat = await (api.capcut as any)?.trending?.();

          if (!datat || datat.length === 0) {
            await reply({
              body: "❎ Không tìm thấy kết quả!"
            });
            return;
          }

          const trendData = getRandomItems(datat) as VideoTemplate[];
          const imgt = trendData.map((result) => result.cover_url);
          const listMessage = trendData
            .map((result, index) => `${index + 1}. Title: ${result.title}\n👁‍🗨 View: ${result.play_amount}`)
            .join("\n\n");

          const attachments = await Promise.all(imgt.map((url) => (utils.stream as any)(url, "jpg")));

          const replyInfo = await reply({
            body: `${listMessage}\n\n📌 Reply (phản hồi) STT để tải video`,
            attachment: attachments
          }) as any;

          if (replyInfo?.messageID) {
            main.onReply.set(replyInfo.messageID, {
              type: "trending",
              commandName,
              author: sid,
              messageID: replyInfo.messageID,
              result: trendData
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

      default:
        await reply({
          body: "[ Hướng dẫn sử dụng ]\n\n❯ capcut info + [link]: Xem info creator\n❯ capcut search + [keyword]: Tim kiem mau capcut\n❯ capcut post + [link profile]: Xem bai post cua creator\n❯ capcut trending: Trending mau capcut"
        });
        break;
    }
  },

  async onReply(ctx: CommandOnReplyContext) {
    const { event, Reply, reply, utils, unsend } = ctx;
    const { body } = event;

    if (!Reply || event.senderID !== (Reply as any)?.author) {
      return;
    }

    const replyData = Reply as any;

    switch (replyData.type) {
      case "search": {
        const choose = parseInt(body || "");
        if (unsend) {
          await unsend((Reply as any).messageID);
        }

        if (isNaN(choose)) {
          await reply({
            body: "⚠️ Vui lòng nhập 1 con số"
          });
          return;
        }

        if (choose > 6 || choose < 1) {
          await reply({
            body: "❎ Lựa chọn không nằm trong danh sách"
          });
          return;
        }

        try {
          const chosenVideo = (replyData.result as VideoTemplate[])[choose - 1];
          if (!chosenVideo) {
            await reply({
              body: "❎ Không tìm thấy video được chọn"
            });
            return;
          }

          const videoStream = await (utils.stream as any)(chosenVideo.video_url, "mp4");

          await reply({
            body: `⩺ Tiêu đề: ${chosenVideo.title}
⩺ Tác giả: ${chosenVideo.author.name} (${chosenVideo.author.unique_id})
⩺ Thời lượng: ${formatTime(chosenVideo.duration)} giây
⩺ Số ảnh cần dùng: ${chosenVideo.fragment_count}
⩺ Lượt dùng mẫu: ${chosenVideo.usage_amount}
⩺ Lượt xem: ${chosenVideo.play_amount}
⩺ Lượt thích: ${chosenVideo.like_count}
⩺ Lượt comment: ${chosenVideo.interaction?.comment_count || 0}
⩺ Lượt lưu: ${chosenVideo.favorite_count}
⩺ Ngày tải lên: ${moment.unix(chosenVideo.create_time).tz("Asia/Ho_Chi_Minh").format("HH:mm:ss - DD/MM/YYYY")}
⩺ Link mẫu: https://www.capcut.com/template-detail/${chosenVideo.web_id}`,
            attachment: [videoStream]
          });
        } catch (error: any) {
          console.error("Error:", error.message);
          await reply({
            body: "❎ Đã xảy ra lỗi khi tải video!"
          });
        }
        break;
      }

      case "post": {
        const choosep = parseInt(body || "");
        if (unsend) {
          await unsend((Reply as any).messageID);
        }

        if (isNaN(choosep)) {
          await reply({
            body: "⚠️ Vui lòng nhập 1 con số"
          });
          return;
        }

        if (choosep > 6 || choosep < 1) {
          await reply({
            body: "❎ Lựa chọn không nằm trong danh sách"
          });
          return;
        }

        try {
          const chosenVideo = (replyData.result as PostData[])[choosep - 1];
          if (!chosenVideo) {
            await reply({
              body: "❎ Không tìm thấy video được chọn"
            });
            return;
          }

          const attachment: any[] = [];

          if (chosenVideo.attachments && chosenVideo.attachments.length > 0) {
            for (const at of chosenVideo.attachments) {
              if (at.type === "Video") {
                attachment.push(await (utils.stream as any)(at.url, "mp4"));
              }
            }
          }

          await reply({
            body: `⩺ Tiêu đề: ${chosenVideo.message}
⩺ Tác giả: ${chosenVideo.author.name} (${chosenVideo.author.unique_id})
⩺ Thời lượng: ${formatTime(chosenVideo.duration)} giây
⩺ Số ảnh cần dùng: ${chosenVideo.fragment_count}
⩺ Lượt dùng mẫu: ${chosenVideo.usage_amount}
⩺ Lượt xem: ${chosenVideo.play_amount}
⩺ Lượt thích: ${chosenVideo.like_count}
⩺ Lượt comment: ${chosenVideo.comment_count}
⩺ Lượt lưu: ${chosenVideo.favorite_count}
⩺ Ngày tải lên: ${moment.unix(chosenVideo.create_time).tz("Asia/Ho_Chi_Minh").format("HH:mm:ss - DD/MM/YYYY")}
⩺ Link mẫu: https://www.capcut.com/template-detail/${chosenVideo.id}`,
            attachment
          });
        } catch (error: any) {
          console.error("Error:", error.message);
          await reply({
            body: "❎ Đã xảy ra lỗi khi tải video!"
          });
        }
        break;
      }

      case "trending": {
        const chooset = parseInt(body || "");
        if (unsend) {
          await unsend((Reply as any).messageID);
        }

        if (isNaN(chooset)) {
          await reply({
            body: "⚠️ Vui lòng nhập 1 con số"
          });
          return;
        }

        if (chooset > 6 || chooset < 1) {
          await reply({
            body: "❎ Lựa chọn không nằm trong danh sách"
          });
          return;
        }

        try {
          const chosenVideo = (replyData.result as VideoTemplate[])[chooset - 1];
          if (!chosenVideo) {
            await reply({
              body: "❎ Không tìm thấy video được chọn"
            });
            return;
          }

          const videoStream = await (utils.stream as any)(chosenVideo.video_url, "mp4");

          await reply({
            body: `⩺ Tiêu đề: ${chosenVideo.title}
⩺ Tác giả: ${chosenVideo.author.name} (${chosenVideo.author.unique_id})
⩺ Thời lượng: ${formatTime(chosenVideo.duration)} giây
⩺ Số ảnh cần dùng: ${chosenVideo.fragment_count}
⩺ Lượt dùng mẫu: ${chosenVideo.usage_amount}
⩺ Lượt xem: ${chosenVideo.play_amount}
⩺ Lượt thích: ${chosenVideo.like_count}
⩺ Lượt comment: ${chosenVideo.interaction?.comment_count || 0}
⩺ Lượt lưu: ${chosenVideo.favorite_count}
⩺ Ngày tải lên: ${moment.unix(chosenVideo.create_time).tz("Asia/Ho_Chi_Minh").format("HH:mm:ss - DD/MM/YYYY")}
⩺ Link mẫu: https://www.capcut.com/template-detail/${chosenVideo.web_id}`,
            attachment: [videoStream]
          });
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

export default capcutCommand;
