"use strict";

import type { Command, CommandOnCallContext } from "@types";
import got from "got";
import type { DonixGlobalState } from "../../../types/global";

const getDonixState = (): DonixGlobalState => {
  if (!global.Donix) {
    global.Donix = {} as DonixGlobalState;
  }
  return global.Donix;
};

const getAccountState = () => getDonixState().account;

function pickLink(s: string | undefined | null): string | null {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/https?:\/\/[^\s<>"]+/i);
  return m ? m[0] : null;
}

function cleanString(input: unknown): string {
  const cleaned = String(input || "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[^\p{L}\p{N}\s.,:!?'"()@\-–—]/gu, "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();

  const lines = cleaned.split(/[.!?]+/).map((x) => x.trim());
  const vi = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
  const result = lines.filter((line) => vi.test(line));
  return result.join(". ") + (result.length > 0 ? "." : "");
}

function isFacebookLinkAccessError(text: string): boolean {
  return /Liên\s+kết\s+bạn\s+đang\s+dùng\s+hiện\s+không\s+truy\s+cập\s+được\.?/i.test(text || "");
}

function isInvalidParameterError(text: string): boolean {
  return /Thông\s+số\s+không\s+hợp\s+lệ/i.test(text || "");
}

interface InviteLinkResponse {
  status?: number;
  data?: string;
  message?: string;
}

const joinLinkCommand: Command = {
  name: "joinlink",
  alias: ["jl", "join"],
  version: "1.0.3",
  role: 3,
  desc: "Tham gia nhóm bằng link mời",
  guide: "{pn} <link mời> (có thể reply tin nhắn chứa link)",
  cd: 5,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, logger, client } = ctx;
    const { threadID: tid, messageID: mid, messageReply, body } = event;

    try {
      const link =
        args[0] || pickLink(messageReply?.body as string) || pickLink(body as string);

      if (!link) {
        await client.sendMessage(
          "Vui lòng nhập hoặc reply kèm link mời nhóm",
          tid,
          mid
        );
        return;
      }

      const account = getAccountState();
      const token =
        account?.token?.["EAAD"];

      if (!token) {
        await client.sendMessage(
          "Thiếu OAuth token: config.token.EAAD hoặc FB_OAUTH.",
          tid,
          mid
        );
        return;
      }

      const ua =
        "Dalvik/2.1.0 (Linux; U; Android 9; SM-N971N Build/PQ3A.190605.09261140) [FBAN/Orca-Android;FBAV/524.0.0.44.109;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/788947256;FBCR/MobiFone;FBMF/samsung;FBBD/samsung;FBDV/SM-N971N;FBSV/9;FBCA/x86_64:arm64-v8a;FBDM/{density=1.75,width=1920,height=1080};FB_FW/1;]";

      try {
        const res = await got.post("https://messager-api.zerotwo.biz/api/v1/facebook/invite-link", {
          json: {
            token,
            link_hash: link,
          },
          headers: {
            "Content-Type": "application/json",
            "User-Agent": ua,
          },
          timeout: {
            request: 15000,
          },
          responseType: "json",
        });

        const data = res.body as InviteLinkResponse;

        if (data?.status === 200) {
          const cleanedData = cleanString(data.data);

          if (isFacebookLinkAccessError(cleanedData)) {
            await client.sendMessage("Link mời nhóm không hợp lệ!", tid, mid);
            return;
          }

          if (isInvalidParameterError(cleanedData)) {
            await client.sendMessage(
              "Bot đã ở nhóm hoặc link không hợp lệ!",
              tid,
              mid
            );
            return;
          }

          await client.sendMessage("Tham gia nhóm thành công!", tid, mid);
          return;
        }

        await client.sendMessage(
          `Yêu cầu thất bại${data?.message ? `: ${data.message}` : ""}`,
          tid,
          mid
        );
        return;
      } catch (error: unknown) {
        const err = error as { response?: { body?: { message?: string } }; message?: string };
        logger?.error?.("joinlink api error", error instanceof Error ? error : new Error(String(error)));
        const errorMessage =
          err?.response?.body?.message ||
          err?.message ||
          (error instanceof Error ? error.message : String(error)) ||
          "Đã xảy ra lỗi khi xử lý yêu cầu";
        await client.sendMessage(
          `Đã xảy ra lỗi khi xử lý yêu cầu: ${errorMessage}`,
          tid,
          mid
        );
        return;
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger?.error?.("joinlink command error", err);
      const errorMessage = err.message || "Đã xảy ra lỗi không xác định";
      await client.sendMessage(
        `Đã xảy ra lỗi khi xử lý yêu cầu: ${errorMessage}`,
        tid,
        mid
      );
      return;
    }
  },
};

export default joinLinkCommand;
