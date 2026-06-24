"use strict"

import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import type { Command, CommandOnCallContext } from '@types';
import axios from "axios";
import * as crypto from "crypto";
import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import { STORAGE_MEDIA } from "../../../core/storagePath";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

interface StorageStats {
  total: number;
  count: number;
  folders: Record<string, { size: number; files: number }>;
}

interface ProcessFileResult {
  name: string;
  originalSize: number;
  compressedSize: number;
  saved: number;
}

interface FileCounts {
  video: number;
  audio: number;
  image: number;
  other: number;
}

const upCommand: Command = {
  name: "up",
  alias: ["up"],
  version: "3.0.0",
  role: 3,
  desc: "Tải lên và quản lý tệp phương tiện trong bộ nhớ",
  guide:
    "{pn} [thư mục] - Tải tệp lên\n{pn} check - Thống kê bộ nhớ\n{pn} list [thư mục] - Liệt kê tệp\n{pn} delete [thư mục] [tên tệp] - Xóa tệp\n{pn} rename [thư mục] [tên cũ] [tên mới] - Đổi tên tệp\n{pn} move [thư mục gốc] [tên tệp] [thư mục đích] - Di chuyển tệp\n{pn} mkdir [tên thư mục] - Tạo thư mục mới\n{pn} rmdir [tên thư mục] - Xóa thư mục\n{pn} copy [thư mục gốc] [tên tệp] [thư mục đích] - Sao chép tệp",
  cd: 5,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { client, event, args } = ctx;

    const mediaFolder = STORAGE_MEDIA();

    const getStorageStats = async (): Promise<StorageStats> => {
      const stats: StorageStats = { total: 0, count: 0, folders: {} };

      const processDirectory = (dir: string): void => {
        fs.readdirSync(dir).forEach((item) => {
          const itemPath = path.join(dir, item);
          const itemStats = fs.statSync(itemPath);

          if (itemStats.isDirectory()) {
            const folderName = path.relative(mediaFolder, itemPath);
            stats.folders[folderName] = { size: 0, files: 0 };
            processDirectory(itemPath);
          } else {
            const folderName = path.relative(mediaFolder, dir);
            stats.folders[folderName] = stats.folders[folderName] || {
              size: 0,
              files: 0,
            };
            stats.folders[folderName].size += itemStats.size;
            stats.folders[folderName].files++;
            stats.total += itemStats.size;
            stats.count++;
          }
        });
      };

      processDirectory(mediaFolder);
      return stats;
    };

    const processFile = async (
      url: string,
      folderPath: string
    ): Promise<ProcessFileResult> => {
      const response = await axios.head(url);
      const contentType = response.headers["content-type"] || "";
      const fileExt = contentType.split("/")[1] || "bin";
      const fileName = `${crypto.randomBytes(8).toString("hex")}.${fileExt}`;
      const filePath = path.join(folderPath, fileName);
      const tempPath = path.join(folderPath, `temp_${fileName}`);

      await new Promise<void>((resolve, reject) => {
        axios({
          method: "get",
          url: url,
          responseType: "stream",
        })
          .then((response) => {
            response.data
              .pipe(fs.createWriteStream(tempPath))
              .on("finish", resolve)
              .on("error", reject);
          })
          .catch(reject);
      });

      const originalSize = fs.statSync(tempPath).size;

      if (contentType.startsWith("video/")) {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(tempPath)
            .size("480x?")
            .videoBitrate("500k")
            .audioBitrate("64k")
            .save(filePath)
            .on("end", () => resolve())
            .on("error", reject);
        });
      } else if (contentType.startsWith("audio/")) {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(tempPath)
            .audioBitrate("96k")
            .save(filePath)
            .on("end", () => resolve())
            .on("error", reject);
        });
      } else if (contentType.startsWith("image/")) {
        await sharp(tempPath)
          .resize(800, null, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 60 })
          .toFile(filePath);
      } else {
        fs.copyFileSync(tempPath, filePath);
      }

      const compressedSize = fs.statSync(filePath).size;
      fs.unlinkSync(tempPath);

      return {
        name: fileName,
        originalSize,
        compressedSize,
        saved: originalSize - compressedSize,
      };
    };

    try {
      switch (args[0]) {
        case "check": {
          const stats = await getStorageStats();

          const message =
            `╭─「 THỐNG KÊ BỘ NHỚ 」─╮\n` +
            `│ ➜ Tổng cộng: ${(stats.total / 1024 / 1024).toFixed(2)}MB\n` +
            `│ ➜ Số tệp: ${stats.count}\n` +
            `├─「 THƯ MỤC 」─┤\n` +
            Object.entries(stats.folders)
              .map(([folder, data]) => {
                if (!folder) return "";
                return (
                  `│ ╭─ ${folder}\n` +
                  `│ ├─ 💾 ${(data.size / 1024 / 1024).toFixed(2)}MB\n` +
                  `│ ╰─ 📁 ${data.files} tệp\n│\n`
                );
              })
              .join("") +
            `╰──────────────╯`;

          await client.sendMessage(message, event.threadID, event.messageID);
          return;
        }

        case "list": {
          if (!args[1]) {
            await client.sendMessage(
              "⚠️ Vui lòng chỉ định tên thư mục!",
              event.threadID
            );
            return;
          }

          const folderPath = path.join(mediaFolder, args[1]);

          if (!fs.existsSync(folderPath)) {
            await client.sendMessage(
              `❌ Không tìm thấy thư mục "${args[1]}"!`,
              event.threadID
            );
            return;
          }

          const files = fs.readdirSync(folderPath);

          const fileDetails = files
            .map((file, i) => {
              const stats = fs.statSync(path.join(folderPath, file));
              const type = stats.isDirectory() ? "📁" : "📄";
              return (
                `│ ╭─ ${i + 1}. ${type} ${file}\n` +
                `│ ╰─ 💾 ${(stats.size / 1024 / 1024).toFixed(2)}MB\n│\n`
              );
            })
            .join("");

          const message =
            `╭─「 DANH SÁCH TỆP 」─╮\n` +
            `│ 📂 Thư mục: ${args[1]}\n` +
            `│ 📄 Số mục: ${files.length}\n` +
            `├─「 CHI TIẾT 」─┤\n` +
            `${fileDetails}` +
            `╰──────────────╯`;

          await client.sendMessage(message, event.threadID, event.messageID);
          return;
        }

        case "mkdir": {
          if (!args[1]) {
            await client.sendMessage(
              "⚠️ Vui lòng chỉ định tên thư mục!",
              event.threadID
            );
            return;
          }

          const newFolder = path.join(mediaFolder, args[1]);

          if (fs.existsSync(newFolder)) {
            await client.sendMessage(
              `❌ Thư mục "${args[1]}" đã tồn tại!`,
              event.threadID
            );
            return;
          }

          fs.mkdirSync(newFolder, { recursive: true });
          await client.sendMessage(
            `✅ Đã tạo thư mục "${args[1]}"!`,
            event.threadID
          );
          return;
        }

        case "rmdir": {
          if (!args[1]) {
            await client.sendMessage(
              "⚠️ Vui lòng chỉ định tên thư mục!",
              event.threadID
            );
            return;
          }

          const folderToDelete = path.join(mediaFolder, args[1]);

          if (!fs.existsSync(folderToDelete)) {
            await client.sendMessage(
              `❌ Không tìm thấy thư mục "${args[1]}"!`,
              event.threadID
            );
            return;
          }

          fs.rmSync(folderToDelete, { recursive: true });
          await client.sendMessage(
            `✅ Đã xóa thư mục "${args[1]}"!`,
            event.threadID
          );
          return;
        }

        case "copy": {
          if (!args[1] || !args[2] || !args[3]) {
            await client.sendMessage(
              "⚠️ Thiếu thông tin! Sử dụng: copy [thư mục gốc] [tên tệp] [thư mục đích]",
              event.threadID
            );
            return;
          }

          const sourcePath = path.join(mediaFolder, args[1], args[2]);
          const targetFolder = path.join(mediaFolder, args[3]);
          const targetPath = path.join(targetFolder, args[2]);

          if (!fs.existsSync(sourcePath)) {
            await client.sendMessage(
              `❌ Không tìm thấy tệp "${args[2]}" trong thư mục "${args[1]}"!`,
              event.threadID
            );
            return;
          }

          fs.mkdirSync(targetFolder, { recursive: true });
          fs.copyFileSync(sourcePath, targetPath);

          await client.sendMessage(
            `✅ Đã sao chép tệp "${args[2]}" từ "${args[1]}" sang "${args[3]}"!`,
            event.threadID
          );
          return;
        }

        case "delete": {
          if (!args[1] || !args[2]) {
            await client.sendMessage(
              "⚠️ Thiếu thông tin! Sử dụng: delete [thư mục] [tên tệp]",
              event.threadID
            );
            return;
          }

          const folderPath = path.join(mediaFolder, args[1]);
          const filePath = path.join(folderPath, args[2]);

          if (!fs.existsSync(filePath)) {
            await client.sendMessage(
              `❌ Không tìm thấy tệp "${args[2]}" trong thư mục "${args[1]}"!`,
              event.threadID
            );
            return;
          }

          fs.unlinkSync(filePath);
          await client.sendMessage(
            `✅ Đã xóa tệp "${args[2]}" khỏi thư mục "${args[1]}"!`,
            event.threadID
          );
          return;
        }

        case "rename": {
          if (!args[1] || !args[2] || !args[3]) {
            await client.sendMessage(
              "⚠️ Thiếu thông tin! Sử dụng: rename [thư mục] [tên cũ] [tên mới]",
              event.threadID
            );
            return;
          }

          const folderPath = path.join(mediaFolder, args[1]);
          const oldPath = path.join(folderPath, args[2]);
          const newPath = path.join(folderPath, args[3]);

          if (!fs.existsSync(oldPath)) {
            await client.sendMessage(
              `❌ Không tìm thấy tệp "${args[2]}" trong thư mục "${args[1]}"!`,
              event.threadID
            );
            return;
          }

          fs.renameSync(oldPath, newPath);
          await client.sendMessage(
            `✅ Đã đổi tên tệp từ "${args[2]}" thành "${args[3]}"!`,
            event.threadID
          );
          return;
        }

        case "move": {
          if (!args[1] || !args[2] || !args[3]) {
            await client.sendMessage(
              "⚠️ Thiếu thông tin! Sử dụng: move [thư mục gốc] [tên tệp] [thư mục đích]",
              event.threadID
            );
            return;
          }

          const sourcePath = path.join(mediaFolder, args[1], args[2]);
          const targetFolder = path.join(mediaFolder, args[3]);
          const targetPath = path.join(targetFolder, args[2]);

          if (!fs.existsSync(sourcePath)) {
            await client.sendMessage(
              `❌ Không tìm thấy tệp "${args[2]}" trong thư mục "${args[1]}"!`,
              event.threadID
            );
            return;
          }

          fs.mkdirSync(targetFolder, { recursive: true });
          fs.renameSync(sourcePath, targetPath);

          await client.sendMessage(
            `✅ Đã di chuyển tệp "${args[2]}" từ "${args[1]}" sang "${args[3]}"!`,
            event.threadID
          );
          return;
        }

        case "old": {
          const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
          const counts: FileCounts = {
            video: 0,
            audio: 0,
            image: 0,
            other: 0,
          };
          const toDelete: string[] = [];

          const scanDir = (dir: string): void => {
            fs.readdirSync(dir).forEach((item) => {
              const full = path.join(dir, item);
              const stat = fs.statSync(full);

              if (stat.isDirectory()) return scanDir(full);

              if (stat.mtimeMs < oneMonthAgo) {
                const ext = path.extname(item).toLowerCase();

                if ([".mp4", ".avi", ".mov", ".mkv"].includes(ext)) {
                  counts.video++;
                  toDelete.push(full);
                } else if ([".mp3", ".wav", ".flac"].includes(ext)) {
                  counts.audio++;
                } else if ([".jpg", ".jpeg", ".png", ".gif"].includes(ext)) {
                  counts.image++;
                } else {
                  counts.other++;
                }
              }
            });
          };

          scanDir(mediaFolder);

          const total = counts.video + counts.audio + counts.image + counts.other;

          if (!total) {
            await client.sendMessage(
              "✅ Không có tệp nào cũ hơn 1 tháng.",
              event.threadID
            );
            return;
          }

          toDelete.forEach((f) => fs.unlinkSync(f));

          const msg = `╭─「 VIDEO CŨ 」─╮\n│ ➜ Đã xóa: ${counts.video} video\n╰─ Tổng: ${total} tệp ─╯`;

          await client.sendMessage(msg, event.threadID, event.messageID);
          return;
        }

        default: {
          if (!args[0]) {
            await client.sendMessage(
              "⚠️ Vui lòng chỉ định tên thư mục",
              event.threadID
            );
            return;
          }

          const messageReply = event.messageReply as { attachments?: Array<Record<string, unknown>> } | undefined;
          const attachments = messageReply?.attachments;

          if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
            await client.sendMessage(
              "❌ Không tìm thấy tệp đính kèm!",
              event.threadID
            );
            return;
          }

          const folderPath = path.join(mediaFolder, args[0]);
          fs.mkdirSync(folderPath, { recursive: true });

          const urls = attachments
            .map((a: Record<string, unknown>) => a.url as string | undefined)
            .filter((url): url is string => Boolean(url));

          const results = await Promise.all(
            urls.map((url: string) => processFile(url, folderPath))
          );

          const totalSaved = results.reduce((acc, curr) => acc + curr.saved, 0);

          const message = `Đã xử lý ${results.length} tệp, tiết kiệm ${(totalSaved / 1024 / 1024).toFixed(2)}MB`;

          await client.sendMessage(message, event.threadID, event.messageID);
        }
      }
    } catch (error: any) {
      console.error(error);
      await client.sendMessage("❌ Đã xảy ra lỗi!", event.threadID);
    }
  },
};

export default upCommand;
