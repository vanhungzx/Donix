"use strict";

import type { Command } from "@types";
import AdmZip from "adm-zip";
import axios from "axios";
import FormData from "form-data";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

interface FileEntry {
  dest: string;
  info: ReturnType<typeof statSync>;
}

interface ReplyData {
  commandName: string;
  messageID: string;
  author: string;
  data: FileEntry[];
  directory: string;
}

const fileCommand: Command = {
  name: "file",
  alias: ["file", "files"],
  version: "1.2.0",
  role: 3,
  desc: "Lệnh quản lý hệ thống tệp tin",
  category: "Admin",
  guide: `• {pn}: Xem nội dung thư mục hiện tại
   • {pn} /đường/dẫn/thư/mục: Xem nội dung thư mục chỉ định
   Lệnh phản hồi:
   • open + số: Mở thư mục
   • send + số: Gửi nội dung tệp dưới dạng liên kết
   • del + (các) số: Xóa (các) tệp/thư mục
   • view + số: Xem nội dung tệp
   • create + tên: Tạo tệp/thư mục mới
   • zip + (các) số: Nén (các) tệp/thư mục
   • copy + số: Sao chép tệp/thư mục
   • rename + số + tên_mới: Đổi tên tệp/thư mục
   • move + số + đích: Di chuyển tệp/thư mục
   • edit + số + nội_dung: Chỉnh sửa nội dung tệp`,
  cd: 0,
  prefix: true,
  onCall: async ({ client, event, args, commandName, main }) => {
    if (!event.threadID) return;
    const pathArg: string = (args?.[0] ?? "") as string;
    const cwd: string = process.cwd();
    const fullPath: string = String(cwd + pathArg);
    const eventWithThreadID: { threadID: string; senderID: string; messageID?: string } = {
      ...event,
      threadID: String(event.threadID)
    };
    openFolder(client, eventWithThreadID, fullPath, commandName, main);
  },
  onReply: async ({ Reply, client, event, commandName, main, config }): Promise<void> => {
    try {
      const isOwner = Array.isArray(config.OWNER) ? config.OWNER.includes(event.senderID) : String(config.OWNER) === String(event.senderID);
      if (!isOwner) return;

      if (!event.args || event.args.length === 0) {
        await client.sendMessage("⚠️ Thiếu tham số", event.threadID, event.messageID);
        return;
      }

      const action = event.args[0]?.toLowerCase() ?? "";
      if (!action) {
        await client.sendMessage("⚠️ Thiếu lệnh", event.threadID, event.messageID);
        return;
      }

      const replyData = Reply as unknown as ReplyData;
      const index = event.args[1] ? Number.parseInt(event.args[1], 10) : -1;
      let d: FileEntry | undefined = undefined;
      if (index > 0 && replyData.data && Array.isArray(replyData.data) && replyData.data[index - 1]) {
        d = replyData.data[index - 1];
      }

      if (!["create"].includes(action)) {
        if (!d) {
          await client.sendMessage("⚠️ Không tìm thấy chỉ mục tệp", event.threadID, event.messageID);
          return;
        }
      }

      switch (action) {
        case "open":
          if (!d) {
            await client.sendMessage("⚠️ Không tìm thấy thư mục", event.threadID, event.messageID);
            return;
          }
          if (!d.info) {
            await client.sendMessage("⚠️ Không có thông tin thư mục", event.threadID, event.messageID);
            return;
          }
          if (!d.dest) {
            await client.sendMessage("⚠️ Không có đường dẫn", event.threadID, event.messageID);
            return;
          }
          const destPath: string = String(d.dest);
          if (d.info.isDirectory()) {
            const eventWithThreadID: { threadID: string; senderID: string; messageID?: string } = {
              ...event,
              threadID: String(event.threadID)
            };
            openFolder(client, eventWithThreadID, destPath, commandName, main);
          } else {
            await client.sendMessage("⚠️ Đường dẫn không phải là thư mục", event.threadID, event.messageID);
          }
          break;

        case "del": {
          let arrFile: string[] = [],
            fo: string | undefined,
            fi: string | undefined;
          if (!event.args || event.args.length < 2) {
            await client.sendMessage("⚠️ Cần chỉ định số tệp/thư mục cần xóa", event.threadID, event.messageID);
            return;
          }
          if (!Array.isArray(replyData.data)) {
            await client.sendMessage("⚠️ Không có dữ liệu hợp lệ", event.threadID, event.messageID);
            return;
          }
          for (const iStr of event.args.slice(1)) {
            const i = Number.parseInt(iStr, 10);
            if (isNaN(i) || i < 1 || !replyData.data[i - 1]) continue;
            const entry = replyData.data[i - 1];
            if (!entry) continue;
            const { dest, info } = entry;
            if (!info) continue;
            const ext = dest.split(/[/\\]/).pop() ?? "";
            if (info.isFile()) {
              unlinkSync(dest);
              fi = "tệp";
            } else if (info.isDirectory()) {
              rmdirSync(dest, { recursive: true });
              fo = "thư mục";
            }
            arrFile.push(i + ". " + ext);
          }
          if (arrFile.length === 0) {
            await client.sendMessage("⚠️ Không có tệp/thư mục hợp lệ để xóa", event.threadID, event.messageID);
            return;
          }
          await client.sendMessage(
            `✅ Đã xóa ${!!fo && !!fi ? `${fo} và ${fi}` : !!fo ? `${fo}` : !!fi ? `${fi}` : ""}:\n\n${arrFile.join("\n")}`,
            event.threadID,
            event.messageID
          );
          break;
        }

        case "send":
          if (!d) {
            await client.sendMessage("⚠️ Không tìm thấy tệp", event.threadID, event.messageID);
            return;
          }
          try {
            const content = readFileSync(d.dest, "utf8");
            const link = await bin(content);
            await client.sendMessage(link, event.threadID, event.messageID);
          } catch (err: any) {
            await client.sendMessage("❎ Lỗi đọc tệp: " + err.message, event.threadID, event.messageID);
          }
          break;

        case "view": {
          if (!d) {
            await client.sendMessage("⚠️ Không tìm thấy tệp", event.threadID, event.messageID);
            return;
          }
          let p = d.dest;
          let t: string | undefined;
          if (/\.(js|json|txt|md|css|html)$/i.test(p)) {
            try {
              const content = readFileSync(p, "utf8");
              await client.sendMessage(
                content.slice(0, 2000) + (content.length > 2000 ? "\n...(nội dung bị cắt ngắn)" : ""),
                event.threadID,
                event.messageID
              );
            } catch (err: any) {
              await client.sendMessage("❎ Lỗi đọc tệp: " + err.message, event.threadID, event.messageID);
            }
          } else {
            if (/\.js$/.test(p)) copyFileSync(p, (t = p.replace(".js", ".txt")));
            await client.sendMessage(
              {
                attachment: createReadStream(t || p),
              },
              event.threadID,
              () => t && unlinkSync(t),
              event.messageID
            );
          }
          break;
        }

        case "create": {
          if (!event.args || !event.args[1]) {
            await client.sendMessage("⚠️ Cần tên tệp/thư mục", event.threadID, event.messageID);
            return;
          }
          const isFolder = /\/$/.test(event.args[1]);
          const targetPath = (replyData.directory as string) + event.args[1];
          try {
            if (isFolder) {
              mkdirSync(targetPath);
            } else {
              writeFileSync(targetPath, (event.args.slice(2) || []).join(" ") || "");
            }
            await client.sendMessage(`✅ Đã tạo ${isFolder ? "thư mục" : "tệp"}: ${event.args[1]}`, event.threadID, event.messageID);
          } catch (err: any) {
            await client.sendMessage("❎ Lỗi tạo: " + err.message, event.threadID, event.messageID);
          }
          break;
        }

        case "copy": {
          if (!d) {
            await client.sendMessage("⚠️ Không tìm thấy tệp/thư mục", event.threadID, event.messageID);
            return;
          }
          try {
            const newPath = d.dest.replace(/(\.|\/)[^./]+$/, (a, b) =>
              b === "." && a[0] === "." ? " (SAO CHÉP)" + a : b === "/" && a[0] === "/" ? a + " (SAO CHÉP)" : a
            );
            if (d.info && d.info.isDirectory()) {
              copyDir(d.dest, newPath);
            } else {
              copyFileSync(d.dest, newPath);
            }
            await client.sendMessage("✅ Đã sao chép thành công", event.threadID, event.messageID);
          } catch (err: any) {
            await client.sendMessage("❎ Lỗi sao chép: " + err.message, event.threadID, event.messageID);
          }
          break;
        }

        case "rename": {
          if (!d) {
            await client.sendMessage("⚠️ Không tìm thấy tệp/thư mục", event.threadID, event.messageID);
            return;
          }
          const newPath = event.args?.[2];
          if (!newPath) {
            await client.sendMessage("❎ Cần đường dẫn mới", event.threadID, event.messageID);
            return;
          }
          try {
            renameSync(d.dest, d.dest.replace(/[^/]+$/, newPath));
            await client.sendMessage("✅ Đã đổi tên thành công", event.threadID, event.messageID);
          } catch (err: any) {
            await client.sendMessage("❎ Lỗi đổi tên: " + err.message, event.threadID, event.messageID);
          }
          break;
        }

        case "move": {
          if (!d) {
            await client.sendMessage("⚠️ Không tìm thấy tệp/thư mục", event.threadID, event.messageID);
            return;
          }
          const destPath = event.args?.[2];
          if (!destPath) {
            await client.sendMessage("❎ Cần đường dẫn đích", event.threadID, event.messageID);
            return;
          }
          try {
            const newPath = path.join(destPath, path.basename(d.dest));
            renameSync(d.dest, newPath);
            await client.sendMessage("✅ Đã di chuyển thành công", event.threadID, event.messageID);
          } catch (err: any) {
            await client.sendMessage("❎ Lỗi di chuyển: " + err.message, event.threadID, event.messageID);
          }
          break;
        }

        case "edit": {
          if (!d) {
            await client.sendMessage("⚠️ Không tìm thấy tệp", event.threadID, event.messageID);
            return;
          }
          if (!d.info || !d.info.isFile()) {
            await client.sendMessage("❎ Chỉ có thể chỉnh sửa tệp", event.threadID, event.messageID);
            return;
          }
          try {
            const content = (event.args?.slice(2) || []).join(" ");
            writeFileSync(d.dest, content);
            await client.sendMessage("✅ Đã chỉnh sửa tệp thành công", event.threadID, event.messageID);
          } catch (err: any) {
            await client.sendMessage("❎ Lỗi chỉnh sửa tệp: " + err.message, event.threadID, event.messageID);
          }
          break;
        }

        case "zip": {
          if (!event.args || event.args.length < 2) {
            await client.sendMessage("⚠️ Cần chỉ định số tệp/thư mục cần nén", event.threadID, event.messageID);
            return;
          }
          try {
            if (!Array.isArray(replyData.data)) {
              await client.sendMessage("❎ Không có dữ liệu", event.threadID, event.messageID);
              return;
            }
            const files = replyData.data
              .filter((_, i) => (event.args?.slice(1) || []).includes(String(i + 1)))
              .map((e) => e.dest);
            if (files.length === 0) {
              await client.sendMessage("❎ Không có tệp nào được chọn", event.threadID, event.messageID);
              return;
            }

            const zipStream = await createZip(files);
            const link = await catbox(zipStream);
            await client.sendMessage("✅ Tệp nén: " + link, event.threadID, event.messageID);
          } catch (err: any) {
            await client.sendMessage("❎ Lỗi tạo tệp nén: " + err.message, event.threadID, event.messageID);
          }
          break;
        }

        default:
          await client.sendMessage(
            `❎ Phản hồi [open | send | del | view | create | zip | copy | rename | move | edit] + số`,
            event.threadID,
            event.messageID
          );
      }
    } catch (e: any) {
      console.error(e);
      await client.sendMessage("❎ " + e.toString(), event.threadID, event.messageID);
    }
  },
};

function convertBytes(bytes: number): string {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 Bytes";
  const i = parseInt(String(Math.floor(Math.log(bytes) / Math.log(1024))));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
}

function openFolder(client: any, b: { threadID: string; senderID: string; messageID?: string }, c: string, commandName: string, main: any): void {
  try {
    const folders_files = readdirSync(c)
      .filter((e) => !e.includes("node_modules"))
      .reduce(
        (o: string[][], e: string) => {
          const stat = statSync(path.join(c, e));
          const index = stat.isFile() ? 1 : 0;
          if (o[index]) {
            o[index].push(e);
          }
          return o;
        },
        [[], []]
      )
      .map((e) => e.sort((a, b) => a.localeCompare(b))) as [string[], string[]];

    let txt = "",
      count = 0,
      array: FileEntry[] = [],
      bytes_dir = 0;

    for (const i of [...folders_files[0], ...folders_files[1]]) {
      const dest = path.join(c, i);
      const info = statSync(dest);
      if (info.isDirectory()) {
        (info as any).size = size_folder(dest);
      }
      bytes_dir += (info as any).size || info.size;
      txt += `${++count}. ${info.isFile() ? "📄" : info.isDirectory() ? "🗂️" : "❓"} ${i} (${convertBytes((info as any).size || info.size)})\n`;
      array.push({ dest, info });
    }

    txt += `\n📊 Tổng kích thước thư mục: ${convertBytes(bytes_dir)}\nPhản hồi [open | send | del | view | create | zip | copy | rename | move | edit] + số`;

    client.sendMessage(txt, b.threadID, (err: any, data: any) => {
      if (err) throw err;
      main.onReply.set(data.messageID, {
        commandName,
        messageID: data.messageID,
        author: b.senderID,
        data: array,
        directory: c + "/",
      } as ReplyData);
    }, b.messageID);
  } catch (err: any) {
    client.sendMessage("❎ Lỗi đọc thư mục: " + err.message, b.threadID, b.messageID);
  }
}

function size_folder(folder: string = ""): number {
  let bytes = 0;
  try {
    for (const file of readdirSync(folder)) {
      if (file.includes("node_modules")) continue;
      const filePath = path.join(folder, file);
      const stat = statSync(filePath);
      bytes += stat.isDirectory() ? size_folder(filePath) : stat.size;
    }
  } catch (err) {
    console.error("Error calculating folder size:", err);
  }
  return bytes;
}

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const item of readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

async function catbox(stream: NodeJS.ReadableStream): Promise<string> {
  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  formData.append("fileToUpload", stream);

  try {
    const response = await axios({
      method: "POST",
      url: "https://catbox.moe/api.php",
      headers: formData.getHeaders(),
      data: formData,
      responseType: "text",
    });
    return response.data;
  } catch (err: any) {
    throw new Error("Upload failed: " + err.message);
  }
}

async function createZip(source_paths: string[]): Promise<NodeJS.ReadableStream> {
  const zip = new AdmZip();
  const tempPath = path.join(process.cwd(), "src/temp", `temp_${Date.now()}.zip`);

  const tempDir = path.dirname(tempPath);
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }

  source_paths = Array.isArray(source_paths) ? source_paths : [source_paths];

  for (const src_path of source_paths) {
    if (!existsSync(src_path)) continue;

    const stat = statSync(src_path);
    if (stat.isFile()) {

      zip.addLocalFile(src_path, path.basename(src_path));
    } else if (stat.isDirectory()) {

      zip.addLocalFolder(src_path, path.basename(src_path));
    }
  }

  zip.writeZip(tempPath);

  const stream = createReadStream(tempPath);

  stream.on("end", () => {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch (err) {
      console.error("Error cleaning up temp zip file:", err);
    }
  });

  stream.on("error", () => {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch (err) {
      console.error("Error cleaning up temp zip file:", err);
    }
  });

  return stream;
}

async function bin(text: string): Promise<string> {
  try {
    const response = await axios({
      method: "POST",
      url: "https://api.mocky.io/api/mock",
      data: {
        status: 200,
        content: text,
        content_type: "text/plain",
        charset: "UTF-8",
        secret: "LeMinhTien",
        expiration: "never",
      },
    });
    return response.data.link;
  } catch (err: any) {
    throw new Error("Failed to create text link: " + err.message);
  }
}

export default fileCommand;
