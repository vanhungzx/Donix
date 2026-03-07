import type { Command, CommandOnCallContext, CommandOnReplyContext } from "@types";
import fs from "fs";
interface FriendRequestNode {
  id: string;
  name: string;
  profile_picture?: {
    uri: string;
  };
  social_context?: {
    text: string;
  };
  [key: string]: any;
}

interface FriendRequestEdge {
  node: FriendRequestNode;
  cursor: string;
  [key: string]: any;
}

interface FriendRequestData {
  data: {
    viewer: {
      friend_requests: {
        edges: FriendRequestEdge[];
      };
    };
  };
}

interface AcpReplyData {
  commandName: string;
  messageID: string;
  author: string;
  threadID: string;
  list: FriendRequestEdge[];
  [key: string]: unknown;
}

const acpCommand: Command = {
  name: "acp",
  alias: ["acp"],
  version: "1.0.0",
  role: 3,
  desc: "Accept friend",
  category: "Admin",
  guide:
    "   {pn} [add | del | all] - Chấp nhận hoặc từ chối lời mời kết bạn\n  + add: chấp nhận lời mời kết bạn\n  + del: từ chối lời mời kết bạn\n  + all: thực hiện với tất cả lời mời",
  cd: 0,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { reply, event, main, commandName, client } = ctx;
    try {

      const response = await client.httpPost("https://www.facebook.com/api/graphql/", {
        av: client.getCurrentUserID(),
        fb_api_caller_class: "RelayModern",
        fb_api_req_friendly_name: "FriendingCometRootContentQuery",
        variables: JSON.stringify({ scale: 1 }),
        server_timestamps: true,
        doc_id: "9103543533085580",
      });
      if (!response || typeof response !== "string") {
        throw new Error("Invalid response from server.");
      }

      let parsedResponse: any;
      try {
        parsedResponse = JSON.parse(response);
      } catch (parseError) {
        throw new Error(`Failed to parse response: ${parseError instanceof Error ? parseError.message : "Unknown parsing error"}`);
      }

      
      if (parsedResponse?.error) {
        throw new Error(parsedResponse.error?.message || "Unknown error occurred.");
      }

      const data = parsedResponse as FriendRequestData;

      
      fs.writeFileSync("acp.json", JSON.stringify(parsedResponse, null, 2));

      if (!data?.data?.viewer?.friend_requests?.edges?.length) {
        await reply("❎ Hiện không có lời mời kết bạn nào.");
        return;
      }

      const list = data.data.viewer.friend_requests.edges;

      const sendlist = list
        .map(
          (edge, i) => {
            const user = edge.node;
            const url = `https://www.facebook.com/profile.php?id=${user.id}`;
            const socialContext = user.social_context?.text || "";
            return `${i + 1}. ${user.name} | ${url.replace("www.facebook", "fb")}${socialContext ? `\n⩺ ${socialContext}` : ""}`;
          }
        )
        .join("\n");

      reply(sendlist + "\n📌 Reply STT kèm <add | del> để thực thi hành động.", (err: any, info: any) => {
        if (!err) {
          main.onReply.set(info.messageID, {
            commandName,
            messageID: info.messageID,
            author: event.senderID,
            threadID: event.threadID,
            list,
          } as AcpReplyData);
        }
      });
    } catch (error) {
      console.error(error);
      await reply("❌ Đã xảy ra lỗi khi lấy danh sách lời mời kết bạn.");
    }
  },

  async onReply(ctx: CommandOnReplyContext): Promise<void> {
    const { Reply, event, client } = ctx;
    const replyData = (Reply || {}) as AcpReplyData;

    const { author, list } = replyData;

    if (author !== event.senderID) return;

    client.unsendMessage(replyData.messageID, event.threadID);

    const args = String(event?.body || "").trim().toLowerCase().split(/\s+/);
    const action = args[0] || "";

    if (!["add", "del"].includes(action)) {
      await client.sendMessage(
        "⚠️ Sử dụng không đúng cú pháp. Nhập: add|del|all để chấp nhận hoặc xóa tất cả lời mời kết bạn.",
        event.threadID as string,
        event.messageID as string
      );
      return;
    }

    let targetIDs =
      args[1] === "all" ? list.map((_, i) => i + 1) : args.slice(1).map(Number);
    targetIDs = targetIDs.filter((id: number) => id > 0 && id <= list.length);

    if (targetIDs.length === 0) {
      await client.sendMessage(
        "⚠️ Không tìm thấy STT hợp lệ trong danh sách.",
        event.threadID as string,
        event.messageID as string
      );
      return;
    }

    const success: FriendRequestNode[] = [];
    const failed: string[] = [];

    for (const id of targetIDs) {
      const edge = list[id - 1];
      if (!edge) continue;
      const user = edge.node;

      try {
        if (action === "add") {
          await client.acceptFriend(user.id);
        } else {
          await client.deleteFriendRequest(user.id);
        }
        success.push(user);
      } catch (error) {
        console.error(`Error processing user ${user.name}:`, error);
        failed.push(user.name);
      }
    }

    const successMsg =
      success.length > 0
        ? `☑️ Đã ${action === "add" ? "chấp nhận" : "xóa"} ${success.length} lời mời kết bạn thành công:`
        : "";
    const successList = success
      .map((user, i) => {
        const url = `https://www.facebook.com/profile.php?id=${user.id}`;
        return `${i + 1}. ${user.name} | ${url.replace("www.facebook", "fb")}`;
      })
      .join("\n");
    const failureMsg = failed.length > 0 ? `❎ Không thành công: ${failed.join(", ")}` : "";

    await client.sendMessage(
      `${successMsg}\n${successList}\n${failureMsg}`,
      event.threadID as string,
      event.messageID as string
    );
  },
};

export default acpCommand;
