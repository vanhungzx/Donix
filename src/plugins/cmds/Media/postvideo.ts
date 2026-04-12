"use strict";

import type { Command, CommandOnCallContext, CommandOnReplyContext, FacebookClient } from "@types";
import { stream } from "../../../utils/index";
const postVideoCommand: Command = {
  name: "postvideo",
  alias: ["dangvideo", "uploadvideo"],
  version: "1.0.0",
  role: 3,
  desc: "Đăng video lên Facebook (bài đăng hoặc reel)",
  guide:
    "{pn} [reel|post] [caption]\n\n" +
    "• {pn} reel [caption] - Đăng video dạng reel/short (dùng upload v1)\n" +
    "• {pn} post [caption] - Đăng video dạng bài đăng thường (dùng upload v2)\n" +
    "• {pn} [caption] - Mặc định đăng dạng bài đăng\n\n" +
    "Ví dụ:\n" +
    "• {pn} post Video của tôi\n" +
    "• {pn} reel Reel của tôi\n" +
    "• {pn} Video test\n\n" +
    "⚠️ Lưu ý: Cần reply video hoặc gửi kèm video",
  cd: 10,
  prefix: true,

  onCall: async function (ctx: CommandOnCallContext): Promise<void> {
    const { client, event, args, reply, main, commandName } = ctx;
    const { attachments, messageReply } = event;

    // Helper function to get URL from attachment
    const pickAttachmentUrl = (att: any): string | null => {
      return att?.url || att?.previewUrl || att?.hiresUrl || att?.largePreviewUrl || att?.thumbnail_url || att?.playableUrl || null;
    };

    try {
      // Lấy video từ attachment hoặc reply
      let videoUrl: string | null = null;

      // Kiểm tra attachment
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        const videoAtt = attachments.find((att: any) => att.type === "video");
        if (videoAtt) {
          videoUrl = pickAttachmentUrl(videoAtt);
        }
      }

      // Kiểm tra reply
      if (!videoUrl && messageReply?.attachments && Array.isArray(messageReply.attachments) && messageReply.attachments.length > 0) {
        const videoAtt = messageReply.attachments.find((att: any) => att.type === "video");
        if (videoAtt) {
          videoUrl = pickAttachmentUrl(videoAtt);
        }
      }

      // Parse arguments trước khi kiểm tra video
      const firstArg = args[0]?.toLowerCase();
      const isReel = firstArg === "reel" || firstArg === "short";
      const isPost = firstArg === "post" || firstArg === "bài" || firstArg === "baidang";

      // Xác định loại đăng
      let postType: "reel" | "post" = "post";
      if (isReel) {
        postType = "reel";
      } else if (isPost) {
        postType = "post";
      }

      // Lấy caption (bỏ qua từ khóa đầu tiên nếu là reel/post)
      let caption = "";
      if (isReel || isPost) {
        caption = args.slice(1).join(" ") || "";
      } else {
        caption = args.join(" ") || "";
      }

      if (!videoUrl) {
        // Nếu không có video, lưu thông tin vào Reply để chờ onReply
        const sent = await reply(
          "📹 Chưa tìm thấy video!\n\n" +
          "👉 Vui lòng reply video vào tin nhắn này để đăng.\n\n" +
          `💡 Cách dùng:\n` +
          `• Reply video vào tin nhắn này\n` +
          `• Hoặc gửi video kèm lệnh: ${commandName} [reel|post] [caption]`
        );
        const messageID = (sent as any)?.messageID;

        if (messageID && main?.onReply) {
          main.onReply.set(messageID, {
            commandName,
            messageID: messageID,
            author: event.senderID,
            createdAt: Date.now(),
            type: "postvideo-wait",
            data: {
              postType: postType,
              caption: caption
            } as any
          });
        }
        return;
      }

      await processVideoUpload(
        client,
        videoUrl,
        postType,
        caption,
        reply
      );
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      await reply(
        `❌ Lỗi khi đăng video:\n${errorMsg}\n\n` +
        `💡 Lưu ý: Video có thể đang được xử lý, vui lòng kiểm tra lại sau.`
      );
      console.error("[postvideo] Error:", error);
    }
  },

  onReply: async function (ctx: CommandOnReplyContext): Promise<void> {
    const { client, event, Reply, reply, main} = ctx;
    const { attachments } = event;

    if (!Reply || (Reply as any).type !== "postvideo-wait") {
      return;
    }

    // Kiểm tra author
    if (event.senderID !== (Reply as any)?.author) {
      return;
    }

    const replyData = Reply as any;
    const postType: "reel" | "post" = replyData.data?.postType || "post";
    const caption: string = replyData.data?.caption || "";

    // Helper function to get URL from attachment
    const pickAttachmentUrl = (att: any): string | null => {
      return att?.url || att?.previewUrl || att?.hiresUrl || att?.largePreviewUrl || att?.thumbnail_url || att?.playableUrl || null;
    };

    // Lấy video từ attachment
    let videoUrl: string | null = null;
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      const videoAtt = attachments.find((att: any) => att.type === "video");
      if (videoAtt) {
        videoUrl = pickAttachmentUrl(videoAtt);
      }
    }

    if (!videoUrl) {
      await reply("❌ Không tìm thấy video trong tin nhắn reply!\n👉 Vui lòng reply video vào tin nhắn của bot.");
      return;
    }

    // Xóa Reply khỏi onReply
    if (main?.onReply && Reply.messageID) {
      main.onReply.delete(Reply.messageID);
    }

    // Unsend tin nhắn của bot nếu có thể
    if (Reply.messageID) {
      try {
        await (client as any).unsendMessage?.(Reply.messageID);
      } catch {
        // Ignore
      }
    }

    // Xử lý upload và publish
    try {
      await processVideoUpload(
        client,
        videoUrl,
        postType,
        caption,
        reply
      );
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      await reply(
        `❌ Lỗi khi đăng video:\n${errorMsg}\n\n` +
        `💡 Lưu ý: Video có thể đang được xử lý, vui lòng kiểm tra lại sau.`
      );
      console.error("[postvideo] onReply Error:", error);
    }
  },
};

// Helper function để xử lý upload và publish video
async function processVideoUpload(
  client: FacebookClient,
  videoUrl: string,
  postType: "reel" | "post",
  caption: string,
  reply: (msg: string | { body: string }) => Promise<any>
): Promise<void> {
  await reply(
    `⏳ Đang tải video${postType === "reel" ? " (Reel)" : " (Bài đăng)"}...\n` +
    `${caption ? `📝 Caption: ${caption}\n` : ""}` +
    `📤 Đang upload video...`
  );

  const videoFilePath = await stream(videoUrl, "mp4");

  try {
    let uploadResult: any;
    let publishResult: any;

    if (postType === "reel") {
      // Dùng uploadVideoWeb (v1) cho reel
      await reply("📤 Đang upload video (v1)...");
      uploadResult = await client.uploadVideoWeb({
        videoPath: videoFilePath
      });

      await reply("📝 Đang đăng reel...");
      publishResult = await client.publishVideoPost({
        videoId: uploadResult.video_id,
        message: caption,
        baseState: 1, // EVERYONE
        isReel: true,
        isFbShort: true,
        enableRemix: false,
      });
    } else {
      // Dùng uploadVideoWebV2 (v2) cho bài đăng
      await reply("📤 Đang upload video (v2)...");
      uploadResult = await client.uploadVideoWebV2({
        videoPath: videoFilePath
      });

      await reply("📝 Đang đăng bài...");
      publishResult = await client.publishVideoPost({
        videoId: uploadResult.video_id,
        message: caption,
        baseState: 1, // EVERYONE
        isReel: false,
      });
    }


    const resultMsg =
      `✅ Đã đăng ${postType === "reel" ? "reel" : "video"} thành công!\n\n` +
      `🆔 Video ID: ${uploadResult.video_id}\n` +
      (publishResult.post_id
        ? `📌 Post ID: ${publishResult.post_id}\n`
        : publishResult.story_id
          ? `📌 Story ID: ${publishResult.story_id}\n`
          : "") +
      (publishResult.url ? `🔗 URL: ${publishResult.url}\n` : "") +
      (publishResult.publishing_flow
        ? `📊 Publishing Flow: ${publishResult.publishing_flow}\n`
        : "");

    await reply(resultMsg);
  } catch (error: any) {

    throw error;
  }
}

export default postVideoCommand;
