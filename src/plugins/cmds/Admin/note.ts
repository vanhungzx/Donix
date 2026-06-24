import axios from 'axios';
import fs from 'fs';
import path from 'path';
import type { Command, CommandOnCallContext } from "@types";

interface FileInfo {
  path: string;
  isInModules: boolean;
  fileName: string;
}

/**
 * Hàm tìm file tối ưu - chỉ exact và name match để tránh kết quả rác
 */
function findFile(filename: string, startDir: string = process.cwd()): string[] {
  const exactMatches: FileInfo[] = [];
  const nameMatches: FileInfo[] = [];
  const skipDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.replit-cache']);

  function searchRecursive(dir: string, depth: number = 0): void {
    if (depth > 8) return; // Giảm độ sâu để tăng hiệu suất

    try {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        if (skipDirs.has(item)) continue;

        const fullPath = path.join(dir, item);
        let stat: fs.Stats;

        try {
          stat = fs.statSync(fullPath);
        } catch (e) {
          continue; // Skip file lỗi quyền truy cập
        }

        if (stat.isFile()) {
          const isInModules = fullPath.includes('modules');
          const fileInfo: FileInfo = {
            path: fullPath,
            isInModules,
            fileName: item
          };

          // 1. Exact match - ưu tiên cao nhất
          if (item === filename) {
            exactMatches.push(fileInfo);
            if (isInModules) return; // Tìm thấy trong modules thì dừng ngay
          }
          // 2. Name match - cùng tên nhưng khác extension
          else if (path.parse(item).name === path.parse(filename).name) {
            nameMatches.push(fileInfo);
          }
        } else if (stat.isDirectory()) {
          searchRecursive(fullPath, depth + 1);
        }
      }
    } catch (error) {
      // Bỏ qua lỗi đọc thư mục
    }
  }

  searchRecursive(startDir);

  // Sắp xếp ưu tiên modules trước
  const sortByPriority = (arr: FileInfo[]) => arr.sort((a, b) => (b.isInModules ? 1 : 0) - (a.isInModules ? 1 : 0));

  // Chỉ trả về exact và name match - loại bỏ partial để tránh kết quả rác
  return [
    ...sortByPriority(exactMatches).map(f => f.path),
    ...sortByPriority(nameMatches).map(f => f.path)
  ];
}

const note: Command = {
  name: "note",
  version: "1.0.0",
  role: 3,
  credits: "lechii",
  desc: "Chỉnh sửa nội dung code với tìm kiếm file thông minh",
  guide: "{pn} <filename> [url] - Tự động tìm file trong project",
  cd: 0,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext) => {
    const { event, args, reply, send } = ctx;
    const url = event?.messageReply?.args?.[0] || args[1];
    const filename = args[0];

    if (!filename) {
      return reply(`❌ Vui lòng nhập tên file!\n\n📝 Cách dùng:\n• {pn} config.json\n• {pn} check.js\n• {pn} note.js\n\n✨ Sẽ tự động tìm file trong project!`);
    }

    try {
      if (/^https:\/\//.test(url)) {
        // Tìm file trước khi replace
        const foundFiles = findFile(filename);

        if (foundFiles.length === 0) {
          return reply(`❌ Không tìm thấy file: ${filename}\n\n🔍 Đã tìm kiếm trong toàn bộ project!`);
        }

        // Nếu có nhiều file, yêu cầu chọn
        if (foundFiles.length > 1) {
          let fileList = `🔍 Tìm thấy ${foundFiles.length} file khớp:\n\n`;
          foundFiles.forEach((file, index) => {
            const relativePath = path.relative(process.cwd(), file);
            const isInModules = file.includes('/modules/') || file.includes('\\modules\\');
            fileList += `${index + 1}. ${relativePath}${isInModules ? ' 📁' : ''}\n`;
          });
          fileList += `\n💡 Reply số để chọn file (ví dụ: 1, 2, 3...)`;

          return send(fileList, (err: any, info: any) => {
            (global as any).client.handleReply.push({
              name: "note",
              messageID: info.messageID,
              foundFiles,
              url,
              author: event.senderID,
              action: 'select_file_for_replace',
            });
          });
        }

        let filePath = foundFiles[0];

        // Xử lý URL với ?raw=true hoặc &raw=true
        let processedUrl = url;
        if (url.includes('?raw=true') || url.includes('&raw=true')) {
          processedUrl = url;
        } else {
          processedUrl = url + (url.includes('?') ? '&raw=true' : '?raw=true');
        }

        return send(`🔗 File: ${path.relative(process.cwd(), filePath)}\n📁 Tìm thấy: ${filename}\n🌐 URL: ${processedUrl}\n\n💾 Thả cảm xúc để xác nhận thay thế nội dung file`, (err: any, info: any) => {
          (global as any).client.handleReaction.push({
            name: "note",
            messageID: info.messageID,
            path: filePath,
            url: processedUrl,
            author: event.senderID,
            action: 'confirm_replace_content',
          });
        });
      } else {
        // Tìm file để export
        const foundFiles = findFile(filename);

        if (foundFiles.length === 0) {
          return reply(`❌ Không tìm thấy file: ${filename}\n\n🔍 Đã tìm kiếm trong:\n• modules/ (ưu tiên)\n• utils/\n• Thư mục gốc\n• Tất cả thư mục con\n\n💡 Kiểm tra lại tên file!`);
        }

        // Nếu có nhiều file, yêu cầu chọn
        if (foundFiles.length > 1) {
          let fileList = `🔍 Tìm thấy ${foundFiles.length} file khớp:\n\n`;
          foundFiles.forEach((file, index) => {
            const relativePath = path.relative(process.cwd(), file);
            const isInModules = file.includes('/modules/') || file.includes('\\modules\\');
            fileList += `${index + 1}. ${relativePath}${isInModules ? ' 📁' : ''}\n`;
          });
          fileList += `\n💡 Reply số để chọn file (ví dụ: 1, 2, 3...)`;

          return send(fileList, (err: any, info: any) => {
            (global as any).client.handleReply.push({
              name: "note",
              messageID: info.messageID,
              foundFiles,
              author: event.senderID,
              action: 'select_file_for_export',
            });
          });
        }

        let filePath = foundFiles[0];

        if (!fs.existsSync(filePath)) {
          return reply(`❌ File không tồn tại: ${filePath}`);
        }

        const { v4: uuidv4 } = require('uuid');
        const uuid = uuidv4();
        const url_base = new URL(`https://nvhzxz.onrender.com/note/${uuid}`);

        const fileContent = fs.readFileSync(filePath, "utf-8");

        // Upload content với text/plain để đảm bảo raw hiển thị đúng
        await axios(url_base.href, {
          method: "PUT",
          headers: {
            'content-type': 'text/plain; charset=utf-8'
          },
          data: fileContent
        });

        // Tạo URL raw và edit từ cùng một base URL
        const rawUrl = new URL(url_base.href);
        rawUrl.searchParams.append('raw', 'true');

        const editUrl = url_base;
        const relativePath = path.relative(process.cwd(), filePath);

        return send(`📝 Raw: ${rawUrl.href}\n\n✏️ Edit: ${editUrl.href}\n────────────────\n📁 File: ${relativePath}\n\n💾 Thả cảm xúc để upload code`, (err: any, info: any) => {
          (global as any).client.handleReaction.push({
            name: "note",
            messageID: info.messageID,
            path: filePath,
            url: rawUrl.href,
            author: event.senderID,
            action: 'confirm_replace_content',
          });
        });
      }
    } catch (e: any) {
      console.error('Note module error:', e);
      reply(`❌ Lỗi: ${e.message}`);
    }
  },

  handleReaction: async (ctx: any) => {
    const { event, reply, handleReaction } = ctx;
    const _ = handleReaction;

    try {
      if (event.userID != _.author) return;

      switch (_.action) {
        case 'confirm_replace_content': {
          const content = (await axios.get(_.url, {
            responseType: 'text',
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; Replit-Bot/1.0)'
            }
          })).data;

          fs.writeFileSync(_.path, content);
          const relativePath = path.relative(process.cwd(), _.path);

          reply(`✅ Đã cập nhật code thành công!\n\n📁 File: ${relativePath}\n⏰ Updated: ${new Date().toLocaleString('vi-VN')}`);
        }
          break;
        default:
          break;
      }
    } catch (e: any) {
      console.error('HandleReaction error:', e);
      reply(`❌ Lỗi khi xử lý: ${e.message}`);
    }
  },

  handleReply: async (ctx: any) => {
    const { event, reply, send, handleReply } = ctx;
    const _ = handleReply;

    try {
      if (event.senderID != _.author) return;

      const selectedIndex = parseInt(event.body) - 1;

      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= _.foundFiles.length) {
        return reply(`❌ Số không hợp lệ! Vui lòng chọn từ 1 đến ${_.foundFiles.length}`);
      }

      const selectedFile = _.foundFiles[selectedIndex];
      const relativePath = path.relative(process.cwd(), selectedFile);

      switch (_.action) {
        case 'select_file_for_replace': {
          let processedUrl = _.url;
          if (_.url.includes('?raw=true') || _.url.includes('&raw=true')) {
            processedUrl = _.url;
          } else {
            processedUrl = _.url + (_.url.includes('?') ? '&raw=true' : '?raw=true');
          }

          return send(`🔗 File đã chọn: ${relativePath}\n🌐 URL: ${processedUrl}\n📁 Sẵn sàng thay thế nội dung\n\n💾 Thả cảm xúc để xác nhận thay thế`, (err: any, info: any) => {
            (global as any).client.handleReaction.push({
              name: "note",
              messageID: info.messageID,
              path: selectedFile,
              url: processedUrl,
              author: _.author,
              action: 'confirm_replace_content',
            });
          });
        }
        case 'select_file_for_export': {
          if (!fs.existsSync(selectedFile)) {
            return reply(`❌ File không tồn tại: ${selectedFile}`);
          }

          const { v4: uuidv4 } = require('uuid');
          const uuid = uuidv4();
          const url_base = new URL(`https://nvhzxz.onrender.com/note/${uuid}`);

          const fileContent = fs.readFileSync(selectedFile, "utf-8");

          await axios(url_base.href, {
            method: "PUT",
            headers: {
              'content-type': 'text/plain; charset=utf-8'
            },
            data: fileContent
          });

          const rawUrl = new URL(url_base.href);
          rawUrl.searchParams.append('raw', 'true');

          return send(`📝 Raw: ${rawUrl.href}\n\n✏️ Edit: ${url_base.href}\n────────────────\n📁 File: ${relativePath}\n\n💾 Thả cảm xúc để upload code`, (err: any, info: any) => {
            (global as any).client.handleReaction.push({
              name: "note",
              messageID: info.messageID,
              path: selectedFile,
              url: rawUrl.href,
              author: _.author,
              action: 'confirm_replace_content',
            });
          });
        }
        default:
          break;
      }
    } catch (e: any) {
      console.error('HandleReply error:', e);
      reply(`❌ Lỗi khi xử lý: ${e.message}`);
    }
  }
};

export default note;
