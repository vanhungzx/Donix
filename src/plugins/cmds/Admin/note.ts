"use strict";

import axios from "axios";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import type {
  Command,
  CommandOnCallContext,
  CommandOnReactContext,
  ReactData,
} from "@types";

const CMD_ROOT = path.join(process.cwd(), "src", "plugins", "cmds");

function listCommandFiles(): Array<{ folder: string; file: string; name: string; absPath: string }> {
  if (!existsSync(CMD_ROOT)) return [];
  const results: Array<{ folder: string; file: string; name: string; absPath: string }> = [];

  const walk = (dir: string, folder: string) => {
    for (const item of readdirSync(dir)) {
      const abs = path.join(dir, item);
      const stats = statSync(abs);
      if (stats.isDirectory()) {
        walk(abs, folder ? path.join(folder, item) : item);
        continue;
      }
      if (!item.endsWith(".ts") && !item.endsWith(".js")) continue;
      if (item.toLowerCase().includes("example")) continue;
      results.push({
        folder: folder || "",
        file: item,
        name: item.replace(/\.(ts|js)$/i, ""),
        absPath: abs,
      });
    }
  };

  for (const entry of readdirSync(CMD_ROOT)) {
    const abs = path.join(CMD_ROOT, entry);
    const stats = statSync(abs);
    if (stats.isDirectory()) {
      walk(abs, entry);
    } else if (stats.isFile() && (entry.endsWith(".ts") || entry.endsWith(".js"))) {
      results.push({
        folder: "",
        file: entry,
        name: entry.replace(/\.(ts|js)$/i, ""),
        absPath: abs,
      });
    }
  }

  return results;
}

function findCommandPath(commandName: string): string | null {
  const allFiles = listCommandFiles();
  const fileEntry = allFiles.find((f) => f.name === commandName);
  return fileEntry ? fileEntry.absPath : null;
}

interface NoteReactData extends ReactData {
  path?: string;
  url?: string;
  action?: string;
}

const noteCommand: Command = {
  name: "note",
  alias: ["note"],
  version: "0.0.1",
  role: 3,
  desc: "Export/Import file qua note API",
  guide:
    "{pn} <file_path|command_name> [url]\n\nExport: {pn} <file_path|command_name>\nImport: {pn} <file_path|command_name> <url>\n\nVí dụ:\n• {pn} money (export file money.ts)\n• {pn} plugins/cmds/Coin/money.ts\n• {pn} money <url> (import từ URL)",
  cd: 3,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { client, event, args, reply, config, main, commandName } = ctx;
    const { threadID, senderID, messageReply } = event;

    if (!threadID) return;

    const owners = Array.isArray(config.OWNER)
      ? config.OWNER
      : config.OWNER
        ? [config.OWNER]
        : [];
    const isOwner = owners.some((id) => String(id) === String(senderID));

    if (!isOwner) {
      await reply({ body: "❎ Bạn không đủ quyền hạn để sử dụng lệnh này!" });
      return;
    }

    const url =
      (messageReply && (messageReply as { body?: string }).body
        ? (messageReply as { body: string }).body.trim().split(/\s+/)[0]
        : undefined) || args?.[1];
    const filePathOrCommandName = args?.[0];

    if (!filePathOrCommandName) {
      await reply({ body: "❌ Vui lòng nhập đường dẫn file hoặc tên lệnh" });
      return;
    }

    const baseUrl = "https://minhdong.site";

    try {
      let fullPath: string;

      const commandPath = findCommandPath(String(filePathOrCommandName));

      if (commandPath) {
        fullPath = commandPath;
      } else {
        fullPath = path.resolve(process.cwd(), filePathOrCommandName);
      }

      if (url && /^https:\/\//.test(String(url))) {
        const message = `🔗 File: ${fullPath}\n\nThả cảm xúc để xác nhận thay thế nội dung file`;

        client.sendMessage(
          message,
          threadID,
          (error: Error | null, info: { messageID?: string }) => {
            if (!error && info?.messageID) {
              main.onReact.set(info.messageID, {
                commandName: commandName || "note",
                messageID: info.messageID,
                author: String(senderID),
                path: fullPath,
                url: String(url),
                action: "confirm_replace_content",
              } as NoteReactData);
            }
          },
          event.messageID
        );
      } else {
        if (!existsSync(fullPath)) {
          await reply({ body: "❎ Đường dẫn file không tồn tại để export" });
          return;
        }

        const fileContent = readFileSync(fullPath, "utf8");
        const uuid = uuidv4();

        const putUrl = `${baseUrl}/note/${uuid}`;
        const createResponse = await axios.put(
          putUrl,
          { content: fileContent },
          { headers: { "Content-Type": "application/json" } }
        );

        if (createResponse.data?.status === 200) {
          const editUrl = `${baseUrl}/note/${uuid}`;
          const rawUrl = `${baseUrl}/note/raw/${uuid}`;

          const message = `📝 Raw: ${rawUrl}\n\n✏️ Edit: ${editUrl}\n────────────────\n• File: ${fullPath}\n\n📌 Thả cảm xúc để upload code`;

          client.sendMessage(
            message,
            threadID,
            (error: Error | null, info: { messageID?: string }) => {
              if (!error && info?.messageID) {
                main.onReact.set(info.messageID, {
                  commandName: commandName || "note",
                  messageID: info.messageID,
                  author: String(senderID),
                  path: fullPath,
                  url: rawUrl,
                  action: "confirm_replace_content",
                } as NoteReactData);
              }
            },
            event.messageID
          );
        } else {
          await reply({
            body: `❎ Lỗi khi tạo note: ${createResponse.data?.message || "Unknown error"}`,
          });
        }
      }
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      console.error(error);
      await reply({ body: `❎ Lỗi: ${error.message}` });
    }
  },

  onReact: async (ctx: CommandOnReactContext): Promise<void> => {
    const { client, event, reply, config, Reaction } = ctx;
    const { threadID, userID, senderID } = event;

    if (!threadID) return;

    const reactorID = userID || senderID;
    const reactData = Reaction as NoteReactData;

    if (String(reactorID) !== String(reactData.author)) {
      return;
    }

    const owners = Array.isArray(config.OWNER)
      ? config.OWNER
      : config.OWNER
        ? [config.OWNER]
        : [];
    const isOwner = owners.some((id) => String(id) === String(reactorID));

    if (!isOwner) {
      await reply({ body: "❎ Bạn không đủ quyền hạn để sử dụng lệnh này!" });
      return;
    }

    const baseUrl = "https://minhdong.site";

    try {
      if (reactData.action === "confirm_replace_content") {
        if (!reactData.url || !reactData.path) {
          await reply({ body: "❌ Thiếu thông tin URL hoặc đường dẫn file" });
          return;
        }

        let content: string;
        if (reactData.url.includes("/note/raw/")) {
          const response = await axios.get(reactData.url, {
            responseType: "text",
          });
          content = response.data;
        } else if (reactData.url.includes("/note/")) {
          const uuidMatch = reactData.url.match(/\/note\/([^/?#]+)/);
          if (!uuidMatch) {
            await reply({ body: "❎ Không thể lấy UUID từ URL" });
            return;
          }
          const uuid = uuidMatch[1];
          const rawUrl = `${baseUrl}/note/raw/${uuid}`;
          const response = await axios.get(rawUrl, {
            responseType: "text",
          });
          content = response.data;
        } else {
          const response = await axios.get(reactData.url, {
            responseType: "text",
          });
          content = response.data;
        }

        writeFileSync(reactData.path, content);
        await reply({
          body: `✅ Đã upload code thành công\n\n🔗 File: ${reactData.path}`,
        });
      }
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      console.error(error);
      await reply({ body: `❎ Lỗi: ${error.message}` });
    }
  },
};

export default noteCommand;
