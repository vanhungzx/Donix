import type { Command, CommandOnCallContext, CommandOnReplyContext } from '@types';
import axios from "axios";
import fs from "fs";
import path from "path";
import { TEMP_DIR } from "../../../core/storagePath";
import { STORAGE_OTHER } from "../../../core/storagePath";

interface PromptData {
  name: string;
  prompt: string;
}

interface PromptsData {
  [key: string]: PromptData;
}

interface ReplyData {
  type: "add" | "del" | "choose";
  author: string;
  messageID: string;
  imageUrl?: string;
  prompts?: PromptsData;
}

const defaultPrompts: PromptsData = {
  1: {
    name: "Ngồi trên Lamborghini",
    prompt:
      "A 4K quality, 9:18 aspect ratio, low-key cinematic photo with rich, dramatic colors. Keep the original subject's face unchanged and natural while transforming their body, outfit, and pose. The subject is sitting on the hood of a Lamborghini, clearly lit with detailed clothing (dark stylish outfit). The car is illuminated by its headlights and partly by the warm sunset light. The sunset sky glows with a gradient of deep orange to light purple, casting cinematic tones. The road surface reflects a soft yellow light. The background scenery is softly blurred with a bokeh effect, emphasizing depth of field. The overall image has very sharp details and vivid colors, with a cinematic atmosphere.",
  },
  2: {
    name: "Cầm Ô Dưới Mưa",
    prompt:
      "A 4K cinematic lifestyle photo, 9:18 aspect ratio. Keep the subject's original face unchanged and natural. The subject is walking slowly along a quiet street in the daytime rain, holding a simple umbrella. Soft daylight filters through gray rain clouds, creating a muted and melancholic tone. Raindrops are visible in the air, and the wet pavement reflects the pale sky. The subject's outfit looks slightly damp, and their posture suggests a quiet, introspective mood. The background shows blurred buildings, trees, and motorbikes with rain streaks, adding realism. The overall atmosphere is calm, sad, and cinematic, with sharp details and natural colors softened by the rainy light.",
  },
  3: {
    name: "Chụp Ảnh ở Hội An",
    prompt:
      "A 4K cinematic portrait, 9:18 aspect ratio. Keep the subject's face unchanged. The subject is standing casually in front of an old yellow wall with weathered textures and moss stains, typical of Hội An ancient town. The wall has wooden windows and old lanterns hanging above, adding to the Vietnamese heritage vibe. The subject wears simple casual clothes that fit naturally with the scene. Warm afternoon sunlight creates soft shadows on the wall, with a slightly blurred street background. The photo looks realistic, sharp, and atmospheric, with authentic Hội An colors.",
  },
  4: {
    name: "S1000RR Tại Mã Pí Lèng",
    prompt:
      "A 4K cinematic travel photo, 9:18 aspect ratio. Keep the subject's face unchanged. The subject is standing next to a BMW S1000RR superbike parked on the roadside of Mã Pí Lèng Pass in Hà Giang. Behind them, the dramatic mountain cliffs and the Nho Quế River winding far below create a breathtaking backdrop. The subject wears stylish biker gear – a fitted jacket, gloves, and casual pants. Golden sunset light falls on the mountains, with soft clouds hanging low, adding cinematic depth. The bike's glossy details reflect the sunlight, making the scene realistic and sharp. The whole photo feels adventurous, authentic, and cinematic with strong Vietnamese mountain vibes.",
  },
  5: {
    name: "Chụp ảnh tại lớp học",
    prompt:
      "Use the model (the person in the image) in a dimly lit, vintage classroom. The camera is shot from a distance, with a small section of the chair's back visible in front, as if the photographer was taking the portrait discreetly or in a quiet moment. Soft, golden-yellow lighting reflects from a small window or gap in the right wall, forming diagonal lines of light that fall gently on the subject's face, creating a dramatic and emotional contrast. The subject sits alone in a chair, feet resting casually on the desk, with a relaxed, thoughtful, and slightly cool expression – as if lost in deep thought. Their hair is naturally tousled in a soft, Korean-inspired style. They wear an oversized army-green sweater, cream-colored cargo pants, Converse sneakers, and red headphones. A bag hangs from the chair, blending harmoniously with the warm light surrounding them. Behind them is an off-white wall with sticky notes labeled Rhey, notices, duty schedules, and a photo pinned at the top. There are also a few decorations and furnishings typical of a college classroom. The scene evokes a nostalgic, contemplative atmosphere – like a frozen moment in time. Soft golden hues of light blend with deep shadows, creating a quiet, warm, and slightly wistful mood, reminiscent of a Japanese indie film scene at dusk or early morning. All elements are rendered without bokeh, maintaining even sharpness from foreground to background. The visual texture contains fine noise and film grain, reminiscent of analog 35mm film cameras such as the Canon AE-1 or digital simulations from the Fujifilm X100V using the Classic Chrome film simulation. Possible camera settings: ISO 1600, f/5.6 aperture, 1/60s shutter speed, with a warm white balance to preserve the natural golden tone in the room. The grain effect may come from ISO 400 film or an intentionally added digital grain for cinematic nostalgia. Aspect ratio: 3:4.",
  },
  6: {
    name: "Ngồi trên cầu thang",
    prompt:
      "Transfer the subject into this new scene – keep the original face, hairstyle, and outfit of the person. Place them in a realistic urban outdoor setting, sitting casually on gray concrete stairs surrounded by modern minimalist architecture and a clear blue sky background. The atmosphere feels calm and detached – a quiet break moment, streetwear mood with introspective energy. Scene & Composition: The subject sits on mid-level stairs, one leg bent, the other relaxed. Framing uses a low-angle shot from below, making the sky dominate the upper background. Clean vertical lines of stair rails and walls create balance and symmetry. Camera positioned slightly off-center, adding a cinematic, candid vibe. Lighting & Color: Natural daylight around late morning or early afternoon. Soft directional light from above-right, casting mild shadows under the cap and chin. Slightly cool temperature (5600K–6000K), giving a neutral-gray tone to concrete and stairs. Gentle ambient bounce light from surrounding walls, softening contrasts. No harsh highlights – light is diffused and natural. Color palette: sky blue, charcoal gray, off-white, black tones; low saturation for calm realism. Camera Settings: Lens: 35mm (slight wide-angle for spatial depth), Aperture: f/2.8 (moderate depth of field – background soft but recognizable), Shutter speed: 1/500s (freezes subtle movement), ISO: 100–200 (clear daylight clarity), Focus: locked on the subject's upper body and face, Aspect ratio: 3:4 vertical, Color profile: Fujifilm Provia or Kodak Portra 400 cinematic tone, Post tone: soft contrast, slightly lifted shadows, mild vignette",
  },
};

function getDataDir(): string {
  const dataDir = STORAGE_OTHER();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

function getPromptsPath(): string {
  return path.join(getDataDir(), "editai_prompts.json");
}

function loadPrompts(): PromptsData {
  const promptsPath = getPromptsPath();
  if (!fs.existsSync(promptsPath)) {
    fs.writeFileSync(promptsPath, JSON.stringify(defaultPrompts, null, 2), "utf8");
    return defaultPrompts;
  }
  try {
    const content = fs.readFileSync(promptsPath, "utf8");
    return JSON.parse(content);
  } catch {
    return defaultPrompts;
  }
}

function savePrompts(prompts: PromptsData): void {
  const promptsPath = getPromptsPath();
  fs.writeFileSync(promptsPath, JSON.stringify(prompts, null, 2), "utf8");
}

function isAdmin(senderID: string, config: any): boolean {
  const sid = String(senderID);
  const isOwner = Array.isArray(config.OWNER) ? config.OWNER.includes(sid) : String(config.OWNER) === sid;
  const isAdmin = Array.isArray(config.ADMIN) ? config.ADMIN.includes(sid) : false;
  return isOwner || isAdmin;
}

const editaiCommand: Command = {
  name: "editai",
  alias: [],
  version: "1.0.0",
  role: 0,
  desc: "Chỉnh sửa ảnh với AI",
  guide: "Reply ảnh",
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, reply, config, main, commandName } = ctx;
    const { messageReply, senderID } = event;

    
    if (args[0] === "add" && isAdmin(senderID, config)) {
      await reply(
        {
          body:
            "📝 Reply tin nhắn này với format:\nTên prompt|Nội dung prompt\n\nVí dụ:\nNgồi trên Ferrari|A 4K photo of subject sitting on Ferrari...",
        },
        async (err: any, info: any) => {
          if (err || !info?.messageID) return;
          main.onReply.set(info.messageID, {
            commandName,
            author: senderID,
            messageID: info.messageID,
            type: "add",
          } as any);
        }
      );
      return;
    }

    
    if (args[0] === "del" && isAdmin(senderID, config)) {
      const prompts = loadPrompts();
      let listText = "🗑️ Chọn prompt cần xóa:\n\n";
      for (const key in prompts) {
        const prompt = prompts[key];
        if (prompt) {
          listText += `${key}. ${prompt.name}\n`;
        }
      }
      listText += "\n💡 Reply tin nhắn này với số để xóa prompt!";

      await reply(
        { body: listText },
        async (err: any, info: any) => {
          if (err || !info?.messageID) return;
          main.onReply.set(info.messageID, {
            commandName,
            author: senderID,
            messageID: info.messageID,
            prompts: prompts,
            type: "del",
          } as any);
        }
      );
      return;
    }

    
    if (!messageReply || !messageReply.attachments || !Array.isArray(messageReply.attachments) || messageReply.attachments.length === 0 || messageReply.attachments[0]?.type !== "photo") {
      await reply({ body: "⚠️ Vui lòng reply một ảnh để chỉnh sửa!" });
      return;
    }

    const imageUrl = messageReply.attachments[0]?.url;
    if (!imageUrl) {
      await reply({ body: "⚠️ Không thể lấy URL của ảnh!" });
      return;
    }
    const prompts = loadPrompts();
    let menuText = "🎨 Chọn kiểu chỉnh sửa:\n\n";
    for (const key in prompts) {
      const prompt = prompts[key];
      if (prompt) {
        menuText += `${key}. ${prompt.name}\n`;
      }
    }
    menuText += "\n💡 Reply tin nhắn này với số để chọn mẫu\n🎯 Hoặc reply prompt tùy chỉnh của bạn!";

    await reply(
      { body: menuText },
      async (err: any, info: any) => {
        if (err || !info?.messageID) return;
        main.onReply.set(info.messageID, {
          commandName,
          author: event.senderID,
          messageID: info.messageID,
          imageUrl: imageUrl,
          prompts: prompts,
          type: "choose",
        } as any);
      }
    );
  },

  async onReply(ctx: CommandOnReplyContext) {
    const { event, Reply, reply, config, client, main } = ctx;
    const { threadID, senderID, body } = event;

    const replyData = Reply as any as ReplyData;
    if (replyData.author !== senderID) return;

    
    if (replyData.type === "add") {
      if (!isAdmin(senderID, config)) {
        reply({ body: "⚠️ Bạn không có quyền sử dụng tính năng này!" });
        return;
      }

      if (!body) {
        reply({ body: "⚠️ Vui lòng nhập nội dung!" });
        return;
      }

      const parts = body.split("|");
      if (parts.length < 2) {
        reply({ body: "⚠️ Sai format! Vui lòng dùng: Tên prompt|Nội dung prompt" });
        return;
      }

      const promptName = parts[0]?.trim();
      const promptContent = parts.slice(1).join("|").trim();

      if (!promptName || !promptContent) {
        reply({ body: "⚠️ Tên hoặc nội dung prompt không được để trống!" });
        return;
      }

      try {
        const prompts = loadPrompts();
        const keys = Object.keys(prompts).map(Number);
        const nextIndex = keys.length > 0 ? Math.max(...keys) + 1 : 1;

        prompts[nextIndex] = {
          name: promptName,
          prompt: promptContent,
        };

        savePrompts(prompts);

        client.unsendMessage(replyData.messageID, threadID);
        reply({
          body: `✅ Đã thêm prompt mới thành công!\n\n📝 Tên: ${promptName}\n🔢 Số thứ tự: ${nextIndex}`,
        });

        if (main.onReply?.delete) {
          main.onReply.delete(replyData.messageID);
        }
      } catch (error: any) {
        console.error("Lỗi khi thêm prompt:", error);
        reply({ body: "❌ Đã xảy ra lỗi khi thêm prompt!" });
      }
      return;
    }

    
    if (replyData.type === "del") {
      if (!isAdmin(senderID, config)) {
        reply({ body: "⚠️ Bạn không có quyền sử dụng tính năng này!" });
        return;
      }

      if (!body) {
        reply({ body: "⚠️ Vui lòng nhập số thứ tự!" });
        return;
      }

      const choice = parseInt(body, 10);
      if (isNaN(choice) || !replyData.prompts?.[choice]) {
        reply({ body: "⚠️ Số thứ tự không hợp lệ!" });
        return;
      }

      try {
        const prompts = loadPrompts();
        const promptToDelete = prompts[choice];
        if (!promptToDelete) {
          reply({ body: "⚠️ Prompt không tồn tại!" });
          return;
        }
        const deletedName = promptToDelete.name;

        delete prompts[choice];
        savePrompts(prompts);

        client.unsendMessage(replyData.messageID, threadID);
        reply({
          body: `✅ Đã xóa prompt thành công!\n\n📝 Tên: ${deletedName}\n🔢 Số thứ tự: ${choice}`,
        });

        if (main.onReply?.delete) {
          main.onReply.delete(replyData.messageID);
        }
      } catch (error: any) {
        console.error("Lỗi khi xóa prompt:", error);
        reply({ body: "❌ Đã xảy ra lỗi khi xóa prompt!" });
      }
      return;
    }

    
    if (replyData.type === "choose") {
      if (!body) {
        reply({
          body: "⚠️ Vui lòng reply số để chọn mẫu HOẶC nhập prompt tùy chỉnh (tối thiểu 20 ký tự)!",
        });
        return;
      }

      const choice = parseInt(body, 10);
      let selectedPrompt: string;
      let promptName: string;

      if (!isNaN(choice) && replyData.prompts?.[choice]) {
        selectedPrompt = replyData.prompts[choice].prompt;
        promptName = replyData.prompts[choice].name;
      } else if (body.trim().length > 20) {
        selectedPrompt = body.trim();
        promptName = "Prompt tùy chỉnh";
      } else {
        reply({
          body: "⚠️ Vui lòng reply số để chọn mẫu HOẶC nhập prompt tùy chỉnh (tối thiểu 20 ký tự)!",
        });
        return;
      }

      client.unsendMessage(replyData.messageID, threadID);
      reply({ body: `⏳ Đang xử lý ảnh với kiểu: ${promptName}\nVui lòng đợi...` });

      try {
        const cacheDir = TEMP_DIR();
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }

        const response = await axios.post(
          "https://gemini.satoru.site/generate",
          {
            imageUrl: replyData.imageUrl,
            prompt: selectedPrompt,
            ratio: "9:16",
          },
          {
            headers: {
              "X-API-Key": "satoru-deptrai-2025",
            },
            responseType: "stream",
            timeout: 180000,
          }
        );

        const imagePath = path.join(cacheDir, `editai_${Date.now()}.jpg`);
        const writer = fs.createWriteStream(imagePath);

        response.data.pipe(writer);

        writer.on("finish", async () => {
          try {
            reply({
              body: `✅ Hoàn thành chỉnh sửa với kiểu: ${promptName}`,
              attachment: fs.createReadStream(imagePath),
            });

            
            setTimeout(() => {
              try {
                if (fs.existsSync(imagePath)) {
                  fs.unlinkSync(imagePath);
                }
              } catch {
                
              }
            }, 60000);

            if (main.onReply?.delete) {
              main.onReply.delete(replyData.messageID);
            }
          } catch (err: any) {
            console.error("Lỗi khi gửi ảnh:", err);
            reply({ body: "❌ Đã xảy ra lỗi khi gửi ảnh!" });
            try {
              if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
              }
            } catch {
              
            }
          }
        });

        writer.on("error", async (err) => {
          console.error("Lỗi khi lưu ảnh:", err);
          reply({ body: "❌ Đã xảy ra lỗi khi xử lý ảnh!" });
          try {
            if (fs.existsSync(imagePath)) {
              fs.unlinkSync(imagePath);
            }
          } catch {
            
          }
        });
      } catch (error: any) {
        console.error("Lỗi:", error);
        reply({ body: "❌ Đã xảy ra lỗi khi xử lý ảnh!" });
        if (main.onReply?.delete) {
          main.onReply.delete(replyData.messageID);
        }
      }
    }
  },
};

export default editaiCommand;
