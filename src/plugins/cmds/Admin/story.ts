import type { Command, CommandOnCallContext } from "@types";
import axios from "axios";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import qs from "querystring";
import { v4 as uuidv4 } from "uuid";
import { generateOfflineThreadingID } from "../../../API/request/formatters";

function fmtTS(ts: number | string | undefined): string | null {
  if (!ts) return null;
  try {
    const timestamp = typeof ts === "string" ? parseInt(ts, 10) : ts;
    return new Date(timestamp * 1000).toLocaleString("vi-VN", {
      hour12: false,
      timeZone: "Asia/Ho_Chi_Minh"
    });
  } catch {
    return String(ts);
  }
}

interface UploadResponse {
  media_id?: string;
  [key: string]: any;
}

interface StoryItem {
  id?: string;
  url?: string;
  creation_time?: number | string;
  expiration_time?: number | string;
  [key: string]: any;
}

interface StoryCreateResponse {
  data?: {
    story_create?: {
      items?: Array<{
        story?: StoryItem;
      }>;
    };
  };
  [key: string]: any;
}

const storyCommand: Command = {
  name: "story",
  alias: ["storycreate", "mstory"],
  version: "1.0.5",
  role: 3,
  desc: "Tải video lên rupload và đăng Story Messenger qua GraphQL",
  guide: "{pn} <video_id | url> | reply video",
  cd: 5,
  prefix: true,

  async onCall(rawCtx: CommandOnCallContext): Promise<void> {
    const { event, client, args, reply, config } = rawCtx;
    const token = config?.token?.EAAD || process.env.FB_OAUTH;

    if (!token) {
      await reply("Thiếu OAuth token.");
      return;
    }

    if (!client?.getCurrentUserID) {
      await reply("❌ Lỗi: Không lấy được thông tin bot (client).");
      return;
    }

    const tempDir = path.join(process.cwd(), "temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const ua =
      "Dalvik/2.1.0 (Linux; U; Android 9; SM-N971N Build/PQ3A.190605.09261140) [FBAN/Orca-Android;FBAV/524.0.0.44.109;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/788947256;FBCR/MobiFone;FBMF/samsung;FBBD/samsung;FBDV/SM-N971N;FBSV/9;FBCA/x86_64:arm64-v8a;FBDM/{density=1.75,width=1920,height=1080};FB_FW/1;]";

    try {
      let videoId: string | null = null;
      const a0 = (args[0] || "").trim();
      const rep = event.messageReply as { attachments?: Array<{ url?: string }> } | undefined;

      const isId = /^\d{6,}$/.test(a0);
      const isUrl = /^https?:\/\/.+/.test(a0);

      if (isId) videoId = a0;

      if (!videoId) {
        let sourceUrl: string | null = null;

        if (isUrl) sourceUrl = a0;
        else if (rep?.attachments?.[0]?.url) sourceUrl = rep.attachments[0].url;

        if (!sourceUrl) {
          await reply("Hãy nhập video_id, URL hoặc reply vào một video.");
          return;
        }

        const tmpId = crypto.randomBytes(8).toString("hex");
        const filePath = path.join(tempDir, `ru_${tmpId}.mp4`);

        const dw = await axios.get(sourceUrl, {
          responseType: "stream",
          maxRedirects: 5,
          timeout: 180000
        });

        await new Promise<void>((res, rej) => {
          const ws = fs.createWriteStream(filePath);
          dw.data.pipe(ws);
          ws.on("finish", res);
          ws.on("error", rej);
        });

        const size = fs.statSync(filePath).size;
        if (!size) throw new Error("Tệp tải về rỗng.");

        const now = Date.now();
        const name = `${crypto.randomBytes(8).toString("hex")}-0-${size}-${now}-${now}`;
        const upUrl = `https://rupload.facebook.com/messenger_entvideo/${encodeURIComponent(name)}`;

        const headersUp: Record<string, string> = {
          "User-Agent": ua,
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/octet-stream",
          authorization: `OAuth ${token}`,
          "x-entity-length": String(size),
          "x-entity-name": name,
          "x-entity-type": "video/mp4",
          offset: "0",
          "segment-start-offset": "0",
          "segment-type": "3",
          use_ent_video: "1",
          "x-fb-friendly-name": "Resumable-Upload-Post",
          "Content-Length": String(size)
        };

        const resUp = await axios.post<UploadResponse>(
          upUrl,
          fs.createReadStream(filePath),
          {
            headers: headersUp,
            timeout: 180000,
            maxRedirects: 0,
            validateStatus: () => true
          }
        );

        const bodyUp =
          typeof resUp.data === "object" ? resUp.data : ({} as UploadResponse);

        if (!bodyUp.media_id) {
          throw new Error("upload không trả về media_id.");
        }

        videoId = String(bodyUp.media_id);

        try {
          fs.unlinkSync(filePath);
        } catch {

        }
      }

      const actorId = String(client.getCurrentUserID());
      const offlineId = String(generateOfflineThreadingID());
      const idemp = uuidv4();
      const clientMutationId = uuidv4();

      const variables = {
        input: {
          source: "MESSENGER",
          idempotence_token: idemp,
          composer_entry_point: "inbox_active_now_tray",
          client_mutation_id: clientMutationId,
          actor_id: actorId,
          audiences_is_complete: true,
          audiences: [
            {
              stories: {
                self: {
                  target_id: actorId
                }
              }
            }
          ],
          logging: {
            composer_session_id: idemp
          },
          attachments: [
            {
              video: {
                overlays: [],
                offline_threading_id: offlineId,
                id: videoId
              }
            }
          ]
        },
        scale: "2"
      };

      const form: Record<string, string> = {
        method: "post",
        pretty: "false",
        format: "json",
        server_timestamps: "true",
        locale: "vi_VN",
        fb_api_req_friendly_name: "MessengerStoryCreateMutation",
        fb_api_caller_class: "graphservice",
        client_doc_id: "24689702352127450044630723304",
        fb_api_client_context: JSON.stringify({ is_background: false }),
        variables: JSON.stringify(variables),
        fb_api_analytics_tags: JSON.stringify(["GraphServices"]),
        client_trace_id: uuidv4()
      };

      const headersGql: Record<string, string> = {
        "User-Agent": ua,
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/x-www-form-urlencoded",
        authorization: `OAuth ${token}`,
        "x-graphql-client-library": "graphservice",
        "x-fb-friendly-name": "MessengerStoryCreateMutation"
      };

      const resGql = await axios.post<StoryCreateResponse>(
        "https://graph.facebook.com/graphql",
        qs.stringify(form),
        {
          headers: headersGql,
          maxRedirects: 0,
          validateStatus: () => true,
          timeout: 180000
        }
      );

      console.log(resGql.data);

      const s =
        resGql?.data?.data?.story_create?.items?.[0]?.story || null;

      if (s?.id) {
        const parts: string[] = [];
        parts.push("✅ Đăng Story thành công");
        parts.push(`ID: ${s.id}`);
        if (s.url) parts.push(`Link: ${s.url}`);

        const ct = fmtTS(s.creation_time);
        const et = fmtTS(s.expiration_time);

        if (ct || et) {
          parts.push(
            `${ct ? `Tạo lúc: ${ct}` : ""}${ct && et ? " • " : ""}${et ? `Hết hạn: ${et}` : ""}`
          );
        }

        await reply(parts.join("\n"));
        return;
      }

      await reply(`❌ Không tạo được Story (${resGql.status}).`);
      return;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await reply(`❌ Lỗi: ${msg}`);
      return;
    }
  }
};

export default storyCommand;
