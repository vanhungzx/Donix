import fs from "fs";
import axios from "axios";
import { getConfig } from "../../../core/configManager";
import { tempPath } from "../../../core/storagePath";
import { downloadYoutubeVideo } from "./sing";
import j2download, { J2DownloadResponse, J2DownloadMedia } from "../../../services/j2";

function urlify(text: unknown): string[] {
  if (typeof text !== "string") {
    return [];
  }
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const matches = text.match(urlRegex);
  return matches || [];
}

let musicSent = false;

interface DouyinAttachment {
  type?: "Video" | "Photo" | "Audio" | string;
  url?: string;
}

interface DouyinStatistics {
  digg_count?: number;
  comment_count?: number;
  share_count?: number;
  play_count?: number;
}

interface DouyinAuthor {
  nickname?: string;
  unique_id?: string;
}

interface DouyinMusic {
  title?: string;
  url?: string;
}

interface DouyinDownResult {
  id?: string;
  attachments?: DouyinAttachment[];
  statistics?: DouyinStatistics;
  author?: DouyinAuthor | string;
  username?: string;
  message?: string;
  duration?: string;
  music?: DouyinMusic;
}

interface GenviralDouyinMedia {
  type?: string;
  quality?: string;
  url?: string;
}

interface GenviralDouyinResponse {
  error?: unknown;
  id?: string;
  unique_id?: string;
  author?: string | DouyinAuthor;
  title?: string;
  duration?: number;
  medias?: GenviralDouyinMedia[];
}

function formatDurationMs(durationMs = 0): string {
  const seconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

async function downloadDouyinViaGenviral(url: string): Promise<DouyinDownResult | null> {
  const { data } = await axios.request<GenviralDouyinResponse>({
    method: "POST",
    url: "https://www.genviral.io/api/tools/social-downloader",
    timeout: 30000,
    headers: {
      authority: "www.genviral.io",
      accept: "*/*",
      "accept-encoding": "gzip, deflate, br",
      "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "content-type": "application/json",
      origin: "https://www.genviral.io",
      referer: "https://www.genviral.io/tools/download/douyin",
      "sec-ch-ua": '"Not-A.Brand";v="99", "Chromium";v="124"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent":
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    },
    data: { url },
  });

  if (!data || data.error) {
    throw new Error("Genviral Douyin API returned an error");
  }

  const medias = Array.isArray(data.medias) ? data.medias : [];
  const attachments: DouyinAttachment[] = [];
  const hdNoWatermarkVideo = medias.find(
    (media) => media.type === "video" && media.quality === "HD No Watermark" && media.url
  );
  const noWatermarkVideo = medias.find(
    (media) => media.type === "video" && media.quality === "No Watermark" && media.url
  );
  const firstVideo = medias.find((media) => media.type === "video" && media.url);
  const selectedVideo = hdNoWatermarkVideo || noWatermarkVideo || firstVideo;

  if (selectedVideo?.url) {
    attachments.push({
      type: "Video",
      url: selectedVideo.url,
    });
  }

  const audio = medias.find((media) => media.type === "audio" && media.url);
  if (audio?.url) {
    attachments.push({
      type: "Audio",
      url: audio.url,
    });
  }

  medias
    .filter((media) => media.type === "image" && media.url)
    .forEach((image) => {
      attachments.push({
        type: "Photo",
        url: image.url,
      });
    });

  if (attachments.length === 0) return null;

  return {
    id: data.id,
    username: data.unique_id || "",
    author: data.author || "",
    message: data.title || "",
    duration: formatDurationMs(data.duration || 0),
    music: audio?.url ? { title: data.title || "Douyin audio", url: audio.url } : undefined,
    attachments,
  };
}


const PLATFORM_GROUPS: Record<string, string[]> = {
  social: ["tiktok", "facebook", "instagram", "threads", "pinterest", "douyin"],
  video: ["youtube", "douyin", "capcut", "tiktok"],
  music: ["soundcloud", "zingmp3", "nhaccuatui"],
  other: ["j2"],
};

const ALL_PLATFORMS = [
  "tiktok", "youtube", "facebook", "instagram", "soundcloud", "threads",
  "zingmp3", "capcut", "nhaccuatui", "pinterest", "douyin", "j2"
];


async function isPlatformEnabled(
  platform: string,
  threadData: any,
  threadID: string
): Promise<boolean> {
  try {
    const g = getConfig() as Record<string, unknown>;
    if (g.botAutodownEnabled === false) return false;

    const thread = await threadData.get(threadID);

    if (!thread) return true;

    const settings = thread.settings || {};
    const autodown = settings.autodown || {};


    if (Object.keys(autodown).length === 0) return true;


    if (autodown.enabled === false) return false;
    if (autodown.enabled === true) {

      if (autodown.disabledPlatforms && autodown.disabledPlatforms.includes(platform)) {
        return false;
      }
      return true;
    }


    for (const [groupName, platforms] of Object.entries(PLATFORM_GROUPS)) {
      if (platforms.includes(platform)) {
        if (autodown.disabledGroups && autodown.disabledGroups.includes(groupName)) {
          return false;
        }
        if (autodown.enabledGroups && autodown.enabledGroups.includes(groupName)) {
          return true;
        }
      }
    }


    if (autodown.disabledPlatforms && autodown.disabledPlatforms.includes(platform)) {
      return false;
    }
    if (autodown.enabledPlatforms && autodown.enabledPlatforms.includes(platform)) {
      return true;
    }


    return true;
  } catch (error) {
    console.error("Error checking platform status:", error);
    return true;
  }
}


async function updateAutodownSettings(
  threadData: any,
  threadID: string,
  update: {
    enabled?: boolean;
    enabledPlatforms?: string[];
    disabledPlatforms?: string[];
    enabledGroups?: string[];
    disabledGroups?: string[];
  }
): Promise<void> {
  try {
    const thread = await threadData.get(threadID);
    const settings = thread?.settings || {};
    const autodown = settings.autodown || {};

    if (update.enabled !== undefined) {
      autodown.enabled = update.enabled;
    }
    if (update.enabledPlatforms) {
      autodown.enabledPlatforms = Array.from(new Set([...(autodown.enabledPlatforms || []), ...update.enabledPlatforms]));

      if (autodown.disabledPlatforms) {
        autodown.disabledPlatforms = autodown.disabledPlatforms.filter((p: string) => !update.enabledPlatforms!.includes(p));
      }
    }
    if (update.disabledPlatforms) {
      autodown.disabledPlatforms = Array.from(new Set([...(autodown.disabledPlatforms || []), ...update.disabledPlatforms]));

      if (autodown.enabledPlatforms) {
        autodown.enabledPlatforms = autodown.enabledPlatforms.filter((p: string) => !update.disabledPlatforms!.includes(p));
      }
    }
    if (update.enabledGroups) {
      autodown.enabledGroups = Array.from(new Set([...(autodown.enabledGroups || []), ...update.enabledGroups]));
      if (autodown.disabledGroups) {
        autodown.disabledGroups = autodown.disabledGroups.filter((g: string) => !update.enabledGroups!.includes(g));
      }
    }
    if (update.disabledGroups) {
      autodown.disabledGroups = Array.from(new Set([...(autodown.disabledGroups || []), ...update.disabledGroups]));
      if (autodown.enabledGroups) {
        autodown.enabledGroups = autodown.enabledGroups.filter((g: string) => !update.disabledGroups!.includes(g));
      }
    }

    settings.autodown = autodown;
    await threadData.update(threadID, { settings });
  } catch (error) {
    console.error("Error updating autodown settings:", error);
  }
}

function getPlatformName(url: string): string | undefined {
  const platforms: Record<string, RegExp> = {
    espn: /https:\/\/(www\.)?espn\.com\//,
    kuaishou: /(^https:\/\/)(www\.)?kuaishou\.com\//,
    ifunny: /https:\/\/(www\.)?ifunny\.co\//,
    izlesene: /https:\/\/(www\.)?izlesene\.com\//,
    reddit: /https:\/\/(www\.)?reddit\.com\//,
    twitter: /https:\/\/(www\.)?twitter\.com\//,
    vimeo: /https:\/\/(www\.)?vimeo\.com\//,
    snapchat: /https:\/\/(www\.)?snapchat\.com\//,
    bilibili: /https:\/\/(www\.)?bilibili\.com\//,
    dailymotion: /https:\/\/(www\.)?dailymotion\.com\//,
    sharecin: /https:\/\/(www\.)?linkedin\.com\//,
    tumblrhat: /https:\/\/(www\.)?sharechat\.com\//,
    linked: /https:\/\/(www\.)?tumblr\.com\//,
    hipi: /https:\/\/(www\.)?hipi\.com\//,
    telegram: /https:\/\/(www\.)?telegram\.org\//,
    getstickerpack: /https:\/\/(www\.)?getstickerpack\.com\//,
    bitchute: /https:\/\/(www\.)?bitchute\.com\//,
    febspot: /https:\/\/(www\.)?febspot\.com\//,
    oke_ru: /https:\/\/(www\.)?oke\.ru\//,
    rumble: /https:\/\/(www\.)?rumble\.com\//,
    streamable: /https:\/\/(www\.)?streamable\.com\//,
    ted: /https:\/\/(www\.)?ted\.com\//,
    sohutv: /https:\/\/(www\.)?sohu\.com\//,
    xiaohongshu: /^(http:\/\/xhslink\.com\/|https:\/\/(www\.)?xiaohongshu\.com\/)/,
    weibo: /^https?:\/\/(www\.)?weibo\.com\/\d+\/[A-Za-z0-9]+$/,
    miaopai: /https:\/\/(www\.)?miaopai\.com\//,
    meipai: /https:\/\/(www\.)?meipai\.com\//,
    xiaoying: /https:\/\/(www\.)?xiaoying\.com\//,
    nationalvideo: /https:\/\/(www\.)?nationalvideo\.com\//,
    yingke: /https:\/\/(www\.)?yingke\.com\//,
    mixcloud: /https:\/\/(www\.)?mixcloud\.com\//,
    spotify: /https:\/\/(www\.)?(spotify\.com|open\.spotify\.com)\//,
    bandcamp: /https:\/\/(www\.)?bandcamp\.com\//,
  };
  for (const platform in platforms) {
    const regex = platforms[platform];
    if (regex && regex.test(url)) {
      return platform;
    }
  }
  return;
}

const atd = {
  name: "atd",
  alias: ["atd"],
  version: "1.1.1",
  role: 3,
  desc: "Tự động tải xuống khi phát hiện liên kết",
  guide: "[on/off/group/platform/status/list]",
  cd: 2,
  prefix: true,
  onCall: async function ({ event, args, reply, threadData }: any): Promise<void> {
    const threadID = event.threadID;
    const action = args[0]?.toLowerCase();
    const scope = args[1]?.toLowerCase();

    if (!action) {
      await reply({
        body: `📋 HƯỚNG DẪN QUẢN LÝ AUTODOWN

🔹 Bật/tắt nhóm hiện tại:
  {pn} on - Bật autodown cho nhóm này
  {pn} off - Tắt autodown cho nhóm này

🔹 Bật/tắt tất cả nhóm:
  {pn} on all - Bật autodown cho tất cả nhóm
  {pn} off all - Tắt autodown cho tất cả nhóm

🔹 Bật/tắt theo nhóm platform:
  {pn} group on <tên nhóm> - Bật nhóm (social/video/music/other)
  {pn} group off <tên nhóm> - Tắt nhóm

🔹 Bật/tắt từng platform:
  {pn} platform on <tên> - Bật platform
  {pn} platform off <tên> - Tắt platform

🔹 Xem trạng thái:
  {pn} status - Xem cấu hình hiện tại
  {pn} list - Xem danh sách platform và nhóm

📌 Ví dụ:
  {pn} on              # Bật cho nhóm này
  {pn} on all          # Bật cho tất cả nhóm
  {pn} group off social
  {pn} platform on tiktok`,
      });
      return;
    }

    try {
      if (action === "on") {
        if (scope === "all") {

          const allThreadIDs = await threadData.idAll();
          let successCount = 0;
          for (const tid of allThreadIDs) {
            try {
              await updateAutodownSettings(threadData, tid, { enabled: true });
              successCount++;
            } catch (error) {
              console.error(`Error updating thread ${tid}:`, error);
            }
          }
          await reply({ body: `✅ Đã bật autodown cho ${successCount}/${allThreadIDs.length} nhóm` });
        } else {

          await updateAutodownSettings(threadData, threadID, { enabled: true });
          await reply({ body: "✅ Đã bật autodown cho nhóm này" });
        }
      } else if (action === "off") {
        if (scope === "all") {

          const allThreadIDs = await threadData.idAll();
          let successCount = 0;
          for (const tid of allThreadIDs) {
            try {
              await updateAutodownSettings(threadData, tid, { enabled: false });
              successCount++;
            } catch (error) {
              console.error(`Error updating thread ${tid}:`, error);
            }
          }
          await reply({ body: `❌ Đã tắt autodown cho ${successCount}/${allThreadIDs.length} nhóm` });
        } else {

          await updateAutodownSettings(threadData, threadID, { enabled: false });
          await reply({ body: "❌ Đã tắt autodown cho nhóm này" });
        }
      } else if (action === "group") {
        const groupAction = args[1]?.toLowerCase();
        const groupName = args[2]?.toLowerCase();
        if (!groupName || !PLATFORM_GROUPS[groupName]) {
          await reply({
            body: `❌ Nhóm không hợp lệ!\n📌 Các nhóm có sẵn: ${Object.keys(PLATFORM_GROUPS).join(", ")}`,
          });
          return;
        }
        if (groupAction === "on") {
          await updateAutodownSettings(threadData, threadID, { enabledGroups: [groupName] });
          await reply({ body: `✅ Đã bật autodown cho nhóm: ${groupName}` });
        } else if (groupAction === "off") {
          await updateAutodownSettings(threadData, threadID, { disabledGroups: [groupName] });
          await reply({ body: `❌ Đã tắt autodown cho nhóm: ${groupName}` });
        }
      } else if (action === "platform") {
        const platformAction = args[1]?.toLowerCase();
        const platformName = args[2]?.toLowerCase();
        if (!platformName || !ALL_PLATFORMS.includes(platformName)) {
          await reply({
            body: `❌ Platform không hợp lệ!\n📌 Các platform có sẵn: ${ALL_PLATFORMS.join(", ")}`,
          });
          return;
        }
        if (platformAction === "on") {
          await updateAutodownSettings(threadData, threadID, { enabledPlatforms: [platformName] });
          await reply({ body: `✅ Đã bật autodown cho: ${platformName}` });
        } else if (platformAction === "off") {
          await updateAutodownSettings(threadData, threadID, { disabledPlatforms: [platformName] });
          await reply({ body: `❌ Đã tắt autodown cho: ${platformName}` });
        }
      } else if (action === "status") {
        const thread = await threadData.get(threadID);
        const settings = thread?.settings?.autodown || {};
        let statusText = "📊 TRẠNG THÁI AUTODOWN\n\n";
        statusText += `🔹 Trạng thái chung: ${settings.enabled === false ? "❌ Tắt" : settings.enabled === true ? "✅ Bật" : "⚙️ Mặc định"}\n\n`;
        if (settings.enabledGroups?.length > 0) {
          statusText += `✅ Nhóm đã bật: ${settings.enabledGroups.join(", ")}\n`;
        }
        if (settings.disabledGroups?.length > 0) {
          statusText += `❌ Nhóm đã tắt: ${settings.disabledGroups.join(", ")}\n`;
        }
        if (settings.enabledPlatforms?.length > 0) {
          statusText += `✅ Platform đã bật: ${settings.enabledPlatforms.join(", ")}\n`;
        }
        if (settings.disabledPlatforms?.length > 0) {
          statusText += `❌ Platform đã tắt: ${settings.disabledPlatforms.join(", ")}\n`;
        }
        if (!settings.enabledGroups && !settings.disabledGroups && !settings.enabledPlatforms && !settings.disabledPlatforms) {
          statusText += "⚙️ Chưa có cấu hình riêng, sử dụng mặc định";
        }
        await reply({ body: statusText });
      } else if (action === "list") {
        let listText = "📋 DANH SÁCH PLATFORM VÀ NHÓM\n\n";
        listText += "🔹 Các nhóm:\n";
        for (const [groupName, platforms] of Object.entries(PLATFORM_GROUPS)) {
          listText += `  • ${groupName}: ${platforms.join(", ")}\n`;
        }
        listText += "\n🔹 Tất cả platform:\n";
        listText += `  ${ALL_PLATFORMS.join(", ")}`;
        await reply({ body: listText });
      } else {
        await reply({ body: "❌ Lệnh không hợp lệ! Gõ {pn} để xem hướng dẫn" });
      }
    } catch (error: any) {
      await reply({ body: `❌ Lỗi: ${error?.message || error}` });
    }
  },
  onChat: async function ({ api, client, event, reply, utils, commandName, main, threadData }: any): Promise<void> {
    if (event.senderID == client.getCurrentUserID()) return;
    const urls = urlify(event.body);
    const threadID = event.threadID;

    for (let rawUrl of urls) {
      let url = rawUrl;

      if (/https:\/\/l\.facebook\.com\/l\.php/.test(url)) {
        try {
          const urlObj = new URL(url);
          const uParam = urlObj.searchParams.get("u");
          if (uParam) {
            url = decodeURIComponent(uParam);
          }
        } catch (error) {

          const match = url.match(/[?&]u=([^&]+)/);
          if (match && match[1]) {
            url = decodeURIComponent(match[1]);
          }
        }
      }
    if (/tiktok.com/.test(url)) {
  if (!(await isPlatformEnabled("tiktok", threadData, threadID))) return;

  const res = await api.tiktok.download(url);
  if (!res) return;

  const attachments: any[] = [];

  // ================= ATTACHMENTS =================
  if (res.attachments && res.attachments.length > 0) {
    for (const attachment of res.attachments) {
      try {
        if (attachment.type === "Video") {
          if (attachment.buffer) {
            const uuid = utils.getGUID();
            const filePath = tempPath(`tiktok_video_${uuid}.mp4`);
            fs.writeFileSync(filePath, attachment.buffer);
            attachments.push(fs.createReadStream(filePath));
          } else if (attachment.url) {
            attachments.push(await utils.stream(attachment.url, "mp4"));
          }
        } else if (attachment.type === "Photo" && attachment.url) {
          attachments.push(await utils.stream(attachment.url, "jpg"));
        }
      } catch (e) {
        console.log("Attachment error:", e);
      }
    }
  }

  // ================= AUTHOR FIX =================
  const rawAuthor = res.awemeDetail?.author;

  const authorName =
    rawAuthor?.nickname ||
    res.author?.name ||
    "Không rõ";

  const authorUsername =
    rawAuthor?.unique_id ||
    res.author?.username ||
    "unknown";

  // ================= SEND =================
  if (attachments.length > 0) {
    client.sendMessage(
      {
        body: `TIKTOK: ${res.message || ""}
👤 ${authorName} (@${authorUsername})
🎵 ${res.music?.title || "Không có nhạc"}`,
        attachment: attachments,
      },
      event.threadID,
      (_err: any, dataMsg: any) => {
        if (dataMsg?.messageID) {
          main.onReact.set(dataMsg.messageID, {
            commandName,
            messageID: dataMsg.messageID,
            title: res.music?.title || "",
            url: res.music?.url,
            type: "TIKTOK",
          });
        }
        musicSent = false;
      },
      event.messageID
    );
  }
}
      if (/youtube\.com/.test(url) || /youtu\.be/.test(url)) {
        if (!(await isPlatformEnabled("youtube", threadData, threadID))) return;

        try {
          const result = await downloadYoutubeVideo(url);
          const info = result.manifest.info;
          const duration = Number(info.duration || 0);

          const lines = [
            `🎬 ${info.title || result.title}`,
            info.channel && `👤 ${info.channel}`,
            duration ? `⏱️ ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}` : "",
            info.viewCount ? `👀 ${Number(info.viewCount).toLocaleString("de-DE")}` : "",
          ].filter(Boolean);

          const body = `YOUTUBE (MP4 via API):\n${lines.join("\n")}`;
          const stream = fs.createReadStream(result.path);

          await reply({ body, attachment: stream });

          stream.on("close", () => {
            setTimeout(() => {
              try {
                fs.unlinkSync(result.path);
              } catch {
                // ignore
              }
            }, 30000);
          });
        } catch (err: any) {
          await reply({
            body: `❎ Không thể tải YouTube MP4 qua API: ${err?.message || String(err)}`,
          });
        }
      } else if (
        /^https:\/\/(www\.|m\.)?(facebook|fb)\.(com|watch)\/(?!.*\/(profile\.php|[\w.-]+\/$))(share\/(p\/[\w-]+\/?|[\w-]+\/?|))|(stories\/[\w-]+\/?|page\.\w+\/?|story\.php\?[\w=&]+|[\w\/]+)/.test(
          url
        )
      ) {
        if (!(await isPlatformEnabled("facebook", threadData, threadID))) return;
        const res = await api.facebook.download(encodeURIComponent(url));
        if (res && res.attachments && res.attachments.length > 0) {
          const attachment: any[] = [];
          if (res.queryStorieID) {
            const match = res.attachments.find((item: any) => item.id == res.queryStorieID);
            if (match) {
              if (match.type === "Video") {
                const videoUrl = match?.url?.hd || match.url.sd;
                if (videoUrl) {
                  attachment.push(await utils.stream(videoUrl, "mp4"));
                }
              } else if (match.type === "Photo") {
                const photoUrl = match.url;
                if (photoUrl) {
                  attachment.push(await utils.stream(photoUrl, "jpg"));
                }
              }
            }
          } else {
            for (const attachmentItem of res.attachments) {
              if (attachmentItem.type === "Video") {
                const videoUrl = attachmentItem.url.hd || attachmentItem.url.sd;
                if (videoUrl) {
                  attachment.push(await utils.stream(videoUrl, "mp4"));
                }
              } else if (attachmentItem.type === "Photo") {
                const photoUrl = attachmentItem.url;
                if (photoUrl) {
                  attachment.push(await utils.stream(photoUrl, "jpg"));
                }
              }
            }
          }
          let stats = "";
          if (res.like || res.comment) {
            stats = `| ${res.like ? `${res.like}❤️` : ""} ${res.comment ? `${res.comment}💬` : ""} |`.trim();
          }
          reply({
            body: `FACEBOOK: ${res.message || "null"}\n👤 ${res.author || "unknown"}\n${stats}`.trim(),
            attachment,
          });
        }
      }
      if (/instagram\.com/i.test(url)) {
        if (!(await isPlatformEnabled("instagram", threadData, threadID))) return;
        const res = await api.instagram.down(url);
        if (Array.isArray(res)) {
          for (const item of res) {
            const attachments: any[] = [];
            if (item.attachments && item.attachments.length > 0) {
              for (const at of item.attachments) {
                if (at.type === "Video") {
                  attachments.push(await utils.stream(at.url, "mp4"));
                } else if (at.type === "Photo") {
                  attachments.push(await utils.stream(at.url, "jpg"));
                }
              }
            }
            reply({
              body: `INSTAGRAM: ${item.message}\nTác giả: ${item.author}\n❤️ ${item.like} | 💬 ${item.comment}`,
              attachment: attachments,
            });
          }
        } else {
          const attachments: any[] = [];
          if (res.attachments && res.attachments.length > 0) {
            for (const at of res.attachments) {
              if (at.type === "Video") {
                attachments.push(await utils.stream(at.url, "mp4"));
              } else if (at.type === "Photo") {
                attachments.push(await utils.stream(at.url, "jpg"));
              }
            }
          }
          reply({
            body: `INSTAGRAM: ${res.message}\nTác giả: ${res.author}\n❤️ ${res.like} | 💬 ${res.comment}`,
            attachment: attachments,
          });
        }
      }
      if (/https?:\/\/(www\.|m\.|on\.)?soundcloud\.com(\/.+)?/.test(url)) {
        if (!(await isPlatformEnabled("soundcloud", threadData, threadID))) return;
        const trackInfo = await api.soundcloud.down(url);
        if (trackInfo.attachments && trackInfo.attachments.length > 0) {
          const audioAttachment = trackInfo.attachments.find((att: any) => att.type === "Audio");
          const audioUrl = audioAttachment ? audioAttachment.url : null;
          const localFilePath = trackInfo.localFilePath || audioAttachment?.localFilePath || null;
          if (!audioUrl && !localFilePath) return;
          reply({
            body: `SOUNDCLOUD: ${trackInfo.title}\nTác giả: ${trackInfo.author}\n👀 ${trackInfo.playback} | ❤️ ${trackInfo.likes} | 💬 ${trackInfo.comment}`,
            attachment: localFilePath ? fs.createReadStream(localFilePath) : await utils.stream(String(audioUrl), "mp3"),
          });
        }
      }
      if (/https:\/\/www\.threads\.com\/\S+$/.test(url)) {
        if (!(await isPlatformEnabled("threads", threadData, threadID))) return;
        const res = await api.threads.down(url);
        if (res && Array.isArray(res.attachments) && res.attachments.length > 0) {
          const messageBody = `THREADS: ${res.message}\nTác giả: ${res.author}\n❤️ ${res.like_count}`;
          const photoStreams: any[] = [];
          for (const at of res.attachments) {
            if (at.type === "Photo") {
              const stream = await utils.stream(at.url, "jpg");
              if (stream) photoStreams.push(stream);
            }
          }
          if (photoStreams.length > 0) {
            await reply({ body: messageBody, attachment: photoStreams });
          }
          const videoStreams: any[] = [];
          for (const at of res.attachments) {
            if (at.type === "Video") {
              const stream = await utils.stream(at.url, "mp4");
              if (stream) videoStreams.push(stream);
            }
          }
          if (videoStreams.length > 0) {
            await reply({ body: messageBody, attachment: videoStreams });
          }
          const audioStreams: any[] = [];
          for (const at of res.attachments) {
            if (at.type === "Audio") {
              const stream = await utils.stream(at.url, "mp3");
              if (stream) audioStreams.push(stream);
            }
          }
          if (audioStreams.length > 0) {
            await reply({ body: messageBody, attachment: videoStreams });
          }
        }
      }
      if (/https?:\/\/(www\.)?zingmp3\.vn\/(bai-hat|album|video-clip|playlist)\/[\w-]+\/([A-Z0-9]+)/.test(url)) {
        if (!(await isPlatformEnabled("zingmp3", threadData, threadID))) return;
        function getMp3Id(link: string): string | null {
          const match = link.match(/\/([A-Z0-9]+)\.html$/);
          return match && match[1] ? match[1] : null;
        }
        const id = getMp3Id(url);
        if (!id) return;
        const resAT = await api.zingmp3.getStream(id);
        const resInfo = await api.zingmp3.getInfoSong(id);
        const link = resAT.data["128"];
        const { title } = resInfo.data;
        reply({
          body: `ZINGMP3: ${title}`,
          attachment: await utils.stream(link, "mp3"),
        });
      }
      if (/^https:\/\/(?:www\.)?(?:m\.)?capcut\.(com|net)\/\S+$/.test(url)) {
        if (!(await isPlatformEnabled("capcut", threadData, threadID))) return;
        const res = await api.capcut.down(url);
        const attachments: any[] = [];
        if (res.attachments && res.attachments.length > 0) {
          for (const at of res.attachments) {
            if (at.type === "Video") {
              attachments.push(await utils.stream(at.url, "mp4"));
            } else if (at.type === "Photo") {
              attachments.push(await utils.stream(at.url, "jpg"));
            }
          }
          let message = `CAPCUT: ${res.short_title || res.title || ""} ${res.message || ""}\nTác giả: ${res.author?.name || res.author || ""
            }`;
          if (res.like_count) {
            message += `\n❤️ ${res.like_count}`;
          }
          if (res.play_amount) {
            message += `\n👀 ${res.play_amount}`;
          }
          reply({ body: message, attachment: attachments });
        }
      }
      if (/https?:\/\/(www\.)?nhaccuatui\.com\/bai-hat\/[\w-]+\.([a-zA-Z0-9]+)\.html/.test(url)) {
        if (!(await isPlatformEnabled("nhaccuatui", threadData, threadID))) return;
        function getNctId(link: string): string | null {
          const match = link.match(
            /https?:\/\/(www\.)?nhaccuatui\.com\/bai-hat\/[\w-]+\.([a-zA-Z0-9]+)\.html/
          );
          return match && match[2] ? match[2] : null;
        }
        const id = getNctId(url);
        if (!id) return;
        const data = await api.nct.getSong(id);
        reply({
          body: `NHACCUATUI: ${data.song.title}`,
          attachment: await utils.stream(data.song.streamUrls[0].streamUrl, "mp3"),
        });
      }
      if (/^(?:https?:\/\/)?(?:(?:www\.)?pinterest\.com\/pin\/[\w-]+|pin\.it\/[\w-]+)\/?(?:\?.*)?$/i.test(url)) {
        if (!(await isPlatformEnabled("pinterest", threadData, threadID))) return;
        console.log("Pinterest URL:", url);
        const res = await api.pinterest.down(url);
        if (res && res.attachments && res.attachments.length > 0) {
          const attachments: any[] = [];
          for (const at of res.attachments) {
            if (at.type === "Video") {
              if (at.buffer) {
                const uuid = utils.getGUID();
                const filePath = tempPath(`pinterest_video_${uuid}.mp4`);
                fs.writeFileSync(filePath, at.buffer);
                attachments.push(fs.createReadStream(filePath));
              } else if (at.url) {
                attachments.push(await utils.stream(at.url, "mp4"));
              }
            } else if (at.type === "Photo" || at.type === "Gif") {
              attachments.push(await utils.stream(at.url, at.type === "Gif" ? "gif" : "jpg"));
            }
          }
          reply({
            body: `PINTEREST: ${res.title || res.message || "No title"}\n👤 ${res.uploader?.full_name || res.author || "Unknown"
              }\n❤️ ${res.repin_count || res.like || 0} | 💬 ${res.comment_count || res.comment || 0}`,
            attachment: attachments,
          });
        }
      }
      if (/douyin\.com/i.test(url)) {
        if (!(await isPlatformEnabled("douyin", threadData, threadID))) return;

        let douyinRes: DouyinDownResult | null = null;
        try {
          douyinRes = await downloadDouyinViaGenviral(url);
        } catch (error) {
          console.error("Genviral Douyin download failed:", error);
        }

        if (!douyinRes || !Array.isArray(douyinRes.attachments) || douyinRes.attachments.length === 0) {
          try {
            douyinRes = (await api.douyin.down(url)) as DouyinDownResult | null;
          } catch (error) {
            console.error("Primary Douyin API failed:", error);
            douyinRes = null;
          }
        }

        const attachment: unknown[] = [];
        let bodyText = "";
        let musicUrl: string | undefined;

        if (douyinRes && Array.isArray(douyinRes.attachments) && douyinRes.attachments.length > 0) {
          const hasVideo = douyinRes.attachments.some(
            (at: DouyinAttachment) => at.type === "Video" && !!at.url
          );
          let videoSent = false;

          for (const at of douyinRes.attachments) {
            if (!at.url) continue;
            try {
              if (hasVideo) {
                // Nếu có video: chỉ tải 1 video đầu tiên, bỏ qua ảnh
                if (at.type === "Video" && !videoSent) {
                  attachment.push(await utils.stream(at.url, "mp4"));
                  videoSent = true;
                }
              } else {
                // Không có video: chỉ tải ảnh (có thể nhiều ảnh), bỏ qua loại khác
                if (at.type === "Photo") {
                  attachment.push(await utils.stream(at.url, "jpg"));
                }
              }
            } catch (error) {
              console.error(`Error downloading ${at.type}:`, error);
            }
          }

          if (attachment.length > 0) {
            const stats = [
              douyinRes.statistics?.digg_count && `❤️ ${douyinRes.statistics.digg_count}`,
              douyinRes.statistics?.comment_count && `💬 ${douyinRes.statistics.comment_count}`,
              douyinRes.statistics?.share_count && `🔄 ${douyinRes.statistics.share_count}`,
              douyinRes.statistics?.play_count && `👀 ${douyinRes.statistics.play_count}`,
            ]
              .filter(Boolean)
              .join(" | ");

            const author =
              typeof douyinRes.author === "string"
                ? { nickname: douyinRes.author, unique_id: douyinRes.username || "" }
                : douyinRes.author || {};

            bodyText = `DOUYIN: ${douyinRes.message || "No title"}\n👤 ${author.nickname || "Unknown"
              } (@${author.unique_id || ""})\n${stats}`;
            musicUrl = douyinRes.music?.url;
          }
        }

        // Fallback sang j2download nếu API Douyin chính không trả về attachment
        if (attachment.length === 0) {
          try {
            const j2 = (await j2download(url)) as J2DownloadResponse;
            const medias = j2.medias || [];

            if (Array.isArray(medias) && medias.length > 0) {
              const videoMedias = medias.filter(
                (m: J2DownloadMedia) => m.type === "video" && !!m.url
              );
              const imageMedias = medias.filter(
                (m: J2DownloadMedia) => m.type === "image" && !!m.url
              );

              if (videoMedias.length > 0) {
                // Douyin video qua j2: chỉ lấy 1 video, không lấy nhạc/ảnh phụ
                const v = videoMedias[0];
                try {
                  attachment.push(await utils.stream(v.url as string, v.extension || "mp4"));
                } catch (error) {
                  console.error("Lỗi khi tải video từ j2:", error);
                }
              } else if (imageMedias.length > 0) {
                // Không có video: chỉ lấy ảnh, bỏ qua audio
                for (const img of imageMedias) {
                  try {
                    attachment.push(await utils.stream(img.url as string, img.extension || "jpg"));
                  } catch (error) {
                    console.error("Lỗi khi tải ảnh từ j2:", error);
                  }
                }
              }

              if (attachment.length > 0) {
                bodyText = `DOUYIN (J2): ${j2.title || "Không có tiêu đề"}\nTác giả: ${j2.author || "Null"}`;
                musicUrl = undefined;
              }
            }
          } catch (error) {
            console.error("Lỗi khi gọi j2download cho Douyin:", error);
          }
        }

        if (attachment.length > 0) {
          reply(
            {
              body: bodyText || "DOUYIN",
              attachment,
            },
            (_err: any, dataMsg: any) => {
              if (musicUrl) {
                main.onReact.set(dataMsg.messageID, {
                  commandName,
                  messageID: dataMsg.messageID,
                  title: douyinRes?.music?.title || "",
                  url: musicUrl,
                  type: "DOUYIN",
                });
                musicSent = false;
              }
            }
          );
        }
      } else {
        const apps = getPlatformName(url);
        if (!apps) return;
        if (!(await isPlatformEnabled("j2", threadData, threadID))) return;
        const res = await j2download(url);
        if (!res || !res.medias) {
          return;
        }
        const { author, title, medias } = res;
        const attachment: any[] = [];
        if (medias) {
          let videoDownloaded = false;
          for (const media of res.medias) {
            if (media.url) {
              if (media.type === "video" && !videoDownloaded) {
                try {
                  const fileStream = await utils.stream(media.url, media.extension || "mp4");
                  attachment.push(fileStream);
                  videoDownloaded = true;
                } catch (error) {
                  console.error("Lỗi khi tải video:", error);
                }
              } else if (media.type === "image") {
                try {
                  const fileStream = await utils.stream(media.url, media.extension || "jpg");
                  attachment.push(fileStream);
                } catch (error) {
                  console.error("Lỗi khi tải hình ảnh:", error);
                }
              } else if (media.type === "audio") {
                try {
                  const fileStream = await utils.stream(media.url, media.extension || "mp3");
                  attachment.push(fileStream);
                } catch (error) {
                  console.error("Lỗi khi tải hình ảnh:", error);
                }
              }
            }
          }
        }
        if (attachment.length > 0) {
          reply({
            body: `${apps.toUpperCase()}: ${title || "Không có tiêu đề"}\nTác giả: ${author || "Null"}`,
            attachment,
          });
        }
      }
    }
  },
  onReact: async ({ reply, event, Reaction, utils }: any): Promise<void> => {
    if (event.reaction == "😆" && !musicSent) {
      const _ = Reaction;
      if (_.type === "TIKTOK" || _.type === "DOUYIN" || _.type === "YOUTUBE") {
        reply({
          body: `[ MUSIC ${_.type} ]\n────────────────\n⩺ Tiêu đề: ${_.title}`,
          attachment: await utils.stream(_.url, "mp3"),
        });
        musicSent = true;
      }
    }
  },
};

export default atd;
