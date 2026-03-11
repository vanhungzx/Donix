"use strict";

import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import type { Command, CommandOnCallContext } from "@types";
import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getConfig } from "../../../core/configManager";
import { TEMP_DIR } from "../../../core/storagePath";
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const TempRoot = TEMP_DIR();
if (!fs.existsSync(TempRoot)) fs.mkdirSync(TempRoot, { recursive: true });

function pickAttachmentUrl(att: any): string | null {
  return att?.url || att?.playable_url || att?.previewUrl || att?.hiresUrl || att?.largePreviewUrl || att?.thumbnail_url || null;
}

async function downloadAudio(url: string, outPath: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      responseType: "stream",
      timeout: 60000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        "Referer": "https://www.facebook.com/",
      },
    });

    const writer = fs.createWriteStream(outPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => resolve(outPath));
      writer.on("error", reject);
      response.data.on("error", reject);
    });
  } catch (error: any) {
    console.error("Download error:", error.message);
    return null;
  }
}

async function convertToM4a(inputPath: string, outputPath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .format("mp4")
      .audioCodec("aac")
      .audioBitrate("128k")
      .noVideo()
      .on("start", (cmdline) => {
        console.log("FFmpeg command:", cmdline);
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(`Conversion progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on("end", () => {
        console.log("Conversion completed successfully");
        resolve(outputPath);
      })
      .on("error", (err, _stdout, stderr) => {
        console.error("FFmpeg error:", err.message);
        console.error("FFmpeg stderr:", stderr);
        reject(err);
      })
      .save(outputPath);
  });
}

async function transcribeAudio(filePath: string, _authToken?: string): Promise<any> {
  try {
    const url = "https://shortwave.facebook.com/v2/transcribe?domain=live_videos_sth&getLanguageId=true";
    let token = getConfig().token?.EAAD;

    if (!token) {
      throw new Error("Không tìm thấy token. Vui lòng cung cấp token qua tham số hoặc cấu hình.");
    }

    const headers = {
      "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; 23113RKC6C Build/PQ3A.190605.06171036) [FBAN/Orca-Android;FBAV/534.0.0.53.103;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/827849709;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBDV/23113RKC6C;FBSV/9;FBCA/x86_64:arm64-v8a;FBDM/{density=3.0,width=1080,height=1920};FB_FW/1;]",
      "Content-Type": "audio/m4a",
      "x-fb-request-analytics-tags": JSON.stringify({
        network_tags: {
          product: "256002347743983",
          purpose: "none",
          retry_attempt: "0",
        },
        application_tags: "captions",
      }),
      "x-fb-rmd": "state=NO_MATCH",
      "graphdomain": "facebook",
      "authorization": `OAuth ${token}`,
      "x-fb-net-hni": "45201",
      "x-fb-sim-hni": "45201",
      "app-scope-id-header": uuidv4(),
      "x-fb-connection-type": "WIFI",
      "x-fb-friendly-name": "CAL",
      "x-zero-f-device-id": uuidv4(),
      "priority": "u=3, i",
      "x-fb-network-properties": "Wifi;Validated;",
      "x-tigon-is-retry": "False",
      "x-fb-http-engine": "Tigon/Liger",
      "x-fb-client-ip": "True",
      "x-fb-server-cluster": "True",
      "x-fb-conn-uuid-client": uuidv4(),
    };

    const stream = fs.createReadStream(filePath);
    const response = await axios.post(url, stream, { headers, timeout: 120000 });

    return response.data;
  } catch (error: any) {
    if (error.response) {
      throw new Error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

const transcribeCommand: Command = {
  name: "transcribe",
  alias: ["chép", "chep", "transcript"],
  version: "1.0.0",
  role: 0,
  desc: "Chép lời từ voice message (audio)",
  guide: "{pn} [token] → Chép lời từ voice message đính kèm\n   {pn} → Tên lệnh của bot\n   [token] → Token Facebook (tùy chọn, nếu không có sẽ dùng token từ config)",
  cd: 10,
  prefix: true,
  async onCall({ event, reply, config }: CommandOnCallContext): Promise<void> {
    try {

      let attachment = event.attachments?.[0];

      if (!attachment || attachment.type !== "audio") {
        const replyAttachments = event.messageReply?.attachments;
        if (Array.isArray(replyAttachments) && replyAttachments[0]?.type === "audio") {
          attachment = replyAttachments[0];
        } else {
          await reply("❌ Vui lòng đính kèm một voice message (audio) để chép lời hoặc reply một tin nhắn có audio!");
          return;
        }
      }

      const token = config?.token?.EAAD;

      await reply("⏳ Đang tải audio...");

      const audioUrl = pickAttachmentUrl(attachment);
      if (!audioUrl) {
        await reply("❌ Không thể lấy URL của audio!");
        return;
      }

      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const downloadedPath = path.join(TempRoot, `audio_${timestamp}_${randomId}.mp3`);
      const m4aPath = path.join(TempRoot, `audio_${timestamp}_${randomId}.m4a`);

      try {

        const downloaded = await downloadAudio(audioUrl, downloadedPath);
        if (!downloaded) {
          await reply("❌ Không thể tải audio xuống!");
          return;
        }

        await reply("🔄 Đang chuyển đổi sang định dạng m4a...");

        let finalPath = downloadedPath;
        const ext = path.extname(downloadedPath).toLowerCase();
        if (ext !== ".m4a" && ext !== ".aac") {
          try {
            await convertToM4a(downloadedPath, m4aPath);
            finalPath = m4aPath;
          } catch (convertError: any) {
            console.error("Convert error:", convertError);

            if (ext === ".mp3" || ext === ".wav" || ext === ".ogg") {

              finalPath = downloadedPath;
            } else {
              await reply("❌ Không thể chuyển đổi audio sang định dạng m4a!");
              return;
            }
          }
        }

        await reply("📝 Đang chép lời...");

        const result = await transcribeAudio(finalPath, token);
        console.log(result);

        try {
          if (fs.existsSync(downloadedPath)) fs.unlinkSync(downloadedPath);
          if (fs.existsSync(m4aPath)) fs.unlinkSync(m4aPath);
        } catch { }

        if (result && result.transcription) {
          const transcription = result.transcription.trim();
          const confidence = result.confidence || 0;
          const language = result.lidInfo?.language || "vi";
          const langConfidence = result.lidInfo?.confidence || 0;

          let responseText = `📝 **Kết quả chép lời:**\n\n${transcription}`;

          if (confidence > 0) {
            responseText += `\n\n📊 Độ tin cậy: ${(confidence * 100).toFixed(1)}%`;
          }
          if (language) {
            responseText += `\n🌐 Ngôn ngữ: ${language.toUpperCase()} (${(langConfidence * 100).toFixed(1)}%)`;
          }

          await reply(responseText);
        } else {
          await reply("❌ Không nhận được kết quả chép lời từ API!");
        }
      } catch (error: any) {

        try {
          if (fs.existsSync(downloadedPath)) fs.unlinkSync(downloadedPath);
          if (fs.existsSync(m4aPath)) fs.unlinkSync(m4aPath);
        } catch { }

        console.error("Transcribe error:", error);
        await reply(`❌ Lỗi: ${error.message || "Không thể chép lời!"}`);
      }
    } catch (error: any) {
      console.error("Command error:", error);
      await reply(`❌ Đã xảy ra lỗi: ${error.message || "Unknown error"}`);
    }
  },
};

export default transcribeCommand;
