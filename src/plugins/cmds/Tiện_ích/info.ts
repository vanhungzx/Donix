"use strict";

import type { Command, CommandOnCallContext } from "@types";
import axios from "axios";
import cheerio from "cheerio";
import { getConfig } from "../../../core/configManager";

function pad(n: number): string {
  return n < 10 ? "0" + n : "" + n;
}

function convert(t: string): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} | ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function isValidURL(u: string): boolean {
  try {
    new URL(u);
    return true;
  } catch {
    return false;
  }
}

function num(n: number | undefined | null): string {
  return typeof n === "number" ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "Không có";
}

interface BioResponse {
  data?: {
    user?: {
      profile_intro_card?: {
        bio?: {
          text?: string;
        };
      };
    };
  };
}

async function getBio(uid: string, client: { httpPost?: (url: string, form: Record<string, unknown>) => Promise<string>; getCurrentUserID?: () => string }): Promise<string> {
  if (!uid) return "Vui lòng nhập UID cần lấy tiểu sử";
  if (!client.httpPost || !client.getCurrentUserID) return "Không có";

  try {
    const form = {
      av: client.getCurrentUserID(),
      fb_api_req_friendly_name: "ProfileCometBioTextEditorPrivacyIconQuery",
      fb_api_caller_class: "RelayModern",
      doc_id: "5009284572488938",
      variables: JSON.stringify({ id: uid }),
    };

    const src = await client.httpPost("https://www.facebook.com/api/graphql/", form);
    const bio: BioResponse = JSON.parse(src);
    return bio?.data?.user?.profile_intro_card?.bio?.text || "Không có";
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Error getting bio:", msg);
    return "Không có";
  }
}

async function getProfileCoverPhoto(uid: string): Promise<string> {
  try {
    const cfg = getConfig() as { cookie?: string };
    const cookie = typeof cfg.cookie === "string" ? cfg.cookie : "";
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "max-age=0",
      "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Microsoft Edge";v="122"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      Cookie: cookie,
    };

    const { data } = await axios.get<string>(`https://www.facebook.com/profile.php?id=${uid}`, {
      headers,
      timeout: 10000,
      maxRedirects: 5,
    });

    const $ = cheerio.load(data);
    const coverPhotoImg = $('img[data-imgperflogname="profileCoverPhoto"]').first();

    if (coverPhotoImg.length) {
      let src = coverPhotoImg.attr("src");
      if (src) {
        src = src.replace(/&amp;/g, "&");
        return src;
      }
    }
    return "không có";
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("Lỗi khi lấy cover photo:", msg);
    return "Không có";
  }
}

interface WorkData {
  employer?: {
    name?: string;
  };
  id?: string;
}

interface EducationData {
  school?: {
    name?: string;
  };
}

interface FamilyMember {
  name?: string;
  id?: string;
}

interface GraphAPIResponse {
  id: string;
  name?: string;
  first_name?: string;
  username?: string;
  link?: string;
  created_time?: string;
  updated_time?: string;
  gender?: string;
  relationship_status?: string;
  significant_other?: {
    name?: string;
    id?: string;
  };
  birthday?: string;
  subscribers?: {
    summary?: {
      total_count?: number;
    };
  };
  is_verified?: boolean;
  locale?: string;
  hometown?: {
    name?: string;
  };
  work?: WorkData[];
  education?: EducationData[];
  family?: {
    data?: FamilyMember[];
  };
}

const fbuserinfoCommand: Command = {
  name: "info",
  alias: ["in4"],
  version: "3.3.0",
  role: 0,
  desc: "Lấy thông tin người dùng Facebook",
  guide: "{pn} info [reply/uid/link/@tag]\n{pn} → Tên lệnh của bot",
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { client, event, config, args, reply } = ctx;

    try {
      const token = config.token?.EAAD6V7 as string | undefined;
      if (!token) {
        await reply({
          body: "LỖI: Không tìm thấy token EAAD6V7. Vui lòng kiểm tra lại cấu hình!",
        });
        return;
      }

      let id: string | null = null;

      if (event.messageReply) {
        id = (event.messageReply.senderID as string) || null;
      } else if (event.mentions && Object.keys(event.mentions).length > 0) {
        const firstMention = Object.keys(event.mentions)[0];
        if (firstMention) {
          id = firstMention.replace(/&mibextid=ZbWKwL/g, "");
        }
      } else if (args[0]) {
        if (isValidURL(args[0])) {
          try {
            const getUID = client.getUID as ((url: string) => Promise<string>) | undefined;
            id = getUID ? (await getUID(args[0])) || null : null;
          } catch {
            id = null;
          }
        } else if (!isNaN(Number(args[0]))) {
          id = args[0];
        }
      } else {
        id = event.senderID;
      }

      if (!id) {
        await reply({
          body: "Đầu vào không hợp lệ, vui lòng thử lại!",
        });
        return;
      }

      await reply({
        body: "Đang lấy thông tin...",
      });

      const fields = [
        "id",
        "name",
        "first_name",
        "username",
        "link",
        "created_time",
        "updated_time",
        "gender",
        "relationship_status",
        "significant_other",
        "birthday",
        "subscribers.limit(0)",
        "is_verified",
        "locale",
        "hometown",
        "work",
        "education",
        "family",
      ].join(",");

      const { data } = await axios.get<GraphAPIResponse>(`https://graph.facebook.com/${id}`, {
        params: { fields, access_token: token },
      });

      const bio = await getBio(id, client);
      const coverUrl = await getProfileCoverPhoto(id);
      const avatar = `https://graph.facebook.com/${id}/picture?width=1500&height=1500&access_token=${token}`;

      let wk = "không có";
      if (Array.isArray(data.work) && data.work.length) {
        wk = data.work
          .map((w, i) => {
            const name = w?.employer?.name || "Không rõ";
            const wid = w?.id || id;
            return `${i + 1}. ${name}\n   Link: https://www.facebook.com/${wid}`;
          })
          .join("\n");
      }

      let edc = "không có";
      if (Array.isArray(data.education) && data.education.length) {
        edc = data.education.map((e) => `• ${e?.school?.name || "Không rõ"}`).join("\n");
      }

      let fml = "không có";
      if (data.family?.data?.length) {
        fml = data.family.data
          .map((f, i) => `${i + 1}. ${f.name || "Không rõ"}\n   Link: https://www.facebook.com/profile.php?id=${f.id || ""}`)
          .join("\n");
      }

      const gender = data.gender === "male" ? "Nam" : data.gender === "female" ? "Nữ" : "Không có";
      const rela = data.relationship_status || "Không có";
      const partner = data.significant_other?.name
        ? `\n   Với: ${data.significant_other.name}\n   Link: https://www.facebook.com/profile.php?id=${data.significant_other.id}`
        : "";
      const hometown = data.hometown?.name || "Không có";
      const username = data.username || "không có";
      const follower = num(data.subscribers?.summary?.total_count);
      const locale = data.locale || "Không có";
      const isv = data.is_verified ? "[Xác thực]" : "";
      const created = data.created_time ? "Ngày tạo: " + convert(data.created_time) : "Không có";
      const updated = data.updated_time ? "Ngày cập nhật: " + convert(data.updated_time) : "Không có";

      const attachments: NodeJS.ReadableStream[] = [];
      try {
        if (avatar && !/không có|No Cover/i.test(avatar)) {
          const avatarRes = await axios.get(avatar, { responseType: "stream" });
          attachments.push(avatarRes.data);
        }
      } catch {
        /* noop */
      }

      try {
        if (coverUrl && !/không có|No Cover/i.test(coverUrl)) {
          const coverRes = await axios.get(coverUrl, { responseType: "stream" });
          attachments.push(coverRes.data);
        }
      } catch {
        /* noop */
      }

      const body = `THÔNG TIN NGƯỜI DÙNG
━━━━━━━━━━━━━━━━
Tên: ${data.name || "Không có"} ${isv}
Họ: ${data.first_name || "Không có"}
Username: ${username}
UID: ${data.id}
Liên kết: ${data.link || "Không có"}
Giới tính: ${gender}
Mối quan hệ: ${rela}${partner}
Tiểu sử: ${bio}
Nơi sinh: ${hometown}
Trường:
${edc}
Làm việc:
${wk}
Thành viên gia đình:
${fml}
Theo dõi: ${follower}
Ngôn ngữ/Khu vực: ${locale}
${created}
${updated}`;

      await reply({
        body,
        attachment: attachments.length > 0 ? attachments : undefined,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Lỗi không xác định";
      await reply({
        body: `LỖI: Đã xảy ra lỗi: ${msg}`,
      });
    }
  },
};

export default fbuserinfoCommand;
