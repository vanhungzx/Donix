"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnReplyContext,
} from '@types';
import axiosBase from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

const NAME = "noitu";
const TIME_LIMIT_MS = 20000;
const TIME_LIMIT_S = Math.floor(TIME_LIMIT_MS / 1000);

const jar = new CookieJar();
const axios = wrapper(axiosBase.create({ jar, withCredentials: true }));

interface StartResponse {
  status?: boolean;
  text?: string;
}

interface PhraseResponse {
  status?: boolean;
  next?: string;
}

interface NoituReplyData {
  commandName: string;
  author: string;
  messageID: string;
  deadline: number;
  timeout?: NodeJS.Timeout;
}

function parse(x: unknown): Record<string, unknown> {
  if (typeof x !== "string") {
    if (x && typeof x === "object") {
      return x as Record<string, unknown>;
    }
    return {};
  }
  try {
    return JSON.parse(x) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function interpret(data: Record<string, unknown>): { ok: boolean; req: string } {
  const response = data as StartResponse;
  const ok = response.status === true || response.status === undefined;
  const req = typeof response.text === "string" ? response.text : "";
  return { ok, req };
}

async function checkPhrase(text: string): Promise<{ state: "lose" | "continue" | "win"; next: string }> {
  const r = await axios.post("https://www.noituonline.com/phrase",
    new URLSearchParams({ text }),
    {
      headers: {
        accept: "application/json",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded",
        pragma: "no-cache",
        referer: "https://www.noituonline.com/",
        "sec-ch-ua":
          '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
      },
    }
  );
  const response = parse(r.data) as PhraseResponse;
  if (response.status === false || !response.next) {
    return { state: "lose", next: "" };
  }
  return { state: "continue", next: response.next || "" };
}

async function checkStart(): Promise<{ ok: boolean; req: string }> {
  const r = await axios.get("https://www.noituonline.com/start", {
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,**",
      "accept-encoding": "gzip, deflate, br",
      "accept-language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
      "cache-control": "no-cache",
      pragma: "no-cache",
      priority: "u=1, i",
      referer: "https://www.google.com/",
      "sec-ch-ua":
        '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
    },
  }
  );
  return interpret(parse(r.data));
}

function deaccent(s: string): string {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normWord(w: string): string {
  return deaccent((w || "").toLowerCase().trim());
}

function firstWord(s: string): string {
  const arr = (s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/);
  return arr[0] || "";
}

function lastWord(s: string): string {
  const arr = (s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/);
  return arr[arr.length - 1] || "";
}

const startMsg = (req: string, s: number): string =>
  `--- Bắt Đầu ---\n${req}\n\nReply tin nhắn bot để nối\n⏳ Còn ${s}s`;

const botMsg = (next: string, s: number): string =>
  `--- Bot Nối ---\n${next}\n\nReply tin nhắn bot để tiếp tục\n⏳ Còn ${s}s`;

const noituCommand: Command = {
  name: NAME,
  alias: ["nối", "noitunoi"],
  version: "1.7.0",
  role: 0,
  desc: "Nối từ VS Máy",
  guide: "{pn}\nexit để thoát",
  cd: 2,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    try {
      const { event, reply, main } = ctx;
      const { ok, req } = await checkStart();

      if (!ok || !req) {
        await reply({ body: "Không mở được đề" });
        return;
      }

      const info = (await reply({ body: startMsg(req, TIME_LIMIT_S) })) as { messageID?: string } | undefined;

      const deadline = Date.now() + TIME_LIMIT_MS;
      const timeout = setTimeout(async () => {
        try {
          await reply({ body: "Hết giờ! THUA bot rồi nha lêu lêu :))))))" });
        } catch {

        }
        if (main.onReply && info?.messageID) {
          main.onReply.delete(info.messageID);
        }
      }, TIME_LIMIT_MS);

      if (!main.onReply) {
        main.onReply = new Map();
      }

      if (info?.messageID) {
        main.onReply.set(info.messageID, {
          commandName: NAME,
          author: event.senderID,
          messageID: info.messageID,
          deadline,
          timeout,
        });
      }
    } catch {
      const { reply } = ctx;
      await reply({ body: "Lỗi kết nối" });
    }
  },

  onReply: async (ctx: CommandOnReplyContext): Promise<void> => {
    const { event, reply, client, main, Reply } = ctx;

    if (!Reply || (Reply as unknown as NoituReplyData).author !== event.senderID) {
      return;
    }

    const replyData = Reply as unknown as NoituReplyData;
    const text = (event.body || "").trim();

    if (!text) return;

    try {
      await client.unsendMessage(replyData.messageID, event.threadID);
    } catch {

    }

    if (Date.now() > (replyData.deadline || 0)) {
      if (replyData.timeout) {
        clearTimeout(replyData.timeout);
      }
      if (main.onReply && replyData.messageID) {
        main.onReply.delete(replyData.messageID);
      }
      await reply({ body: "Hết giờ! THUA bot rồi nha lêu lêu :))))))" });
      return;
    }

    if (/^(exit|thoat|thoát|huy|huỷ)$/i.test(text)) {
      if (replyData.timeout) {
        clearTimeout(replyData.timeout);
      }
      if (main.onReply && replyData.messageID) {
        main.onReply.delete(replyData.messageID);
      }
      await reply({ body: "Thoát trò chơi thành công" });
      return;
    }

    try {
      const { state, next } = await checkPhrase(text);

      if (replyData.timeout) {
        clearTimeout(replyData.timeout);
      }

      if (state === "lose") {
        if (main.onReply && replyData.messageID) {
          main.onReply.delete(replyData.messageID);
        }
        await reply({ body: "THUA bot rồi nha lêu lêu :))))))" });
        return;
      }

      if (state === "win") {
        if (main.onReply && replyData.messageID) {
          main.onReply.delete(replyData.messageID);
        }
        await reply({ body: "THẮNG bot rồi huhuhuhu :((((((" });
        return;
      }

      const userLast = normWord(lastWord(text));
      const botFirst = normWord(firstWord(next));

      if (userLast && botFirst && userLast !== botFirst) {
        if (main.onReply && replyData.messageID) {
          main.onReply.delete(replyData.messageID);
        }
        await reply({ body: "THẮNG bot rồi huhuhuhu :((((((" });
        return;
      }

      const info = (await reply({ body: botMsg(next, TIME_LIMIT_S) })) as { messageID?: string } | undefined;

      if (main.onReply && replyData.messageID) {
        main.onReply.delete(replyData.messageID);
      }

      const deadline = Date.now() + TIME_LIMIT_MS;
      const timeout = setTimeout(async () => {
        try {
          await reply({ body: "Hết giờ! THUA bot rồi nha lêu lêu :)))))" });
        } catch {

        }
        if (main.onReply && info?.messageID) {
          main.onReply.delete(info.messageID);
        }
      }, TIME_LIMIT_MS);

      if (!main.onReply) {
        main.onReply = new Map();
      }

      if (info?.messageID) {
        main.onReply.set(info.messageID, {
          commandName: NAME,
          author: event.senderID,
          messageID: info.messageID,
          deadline,
          timeout,
        });
      }
    } catch {
      if (replyData.timeout) {
        clearTimeout(replyData.timeout);
      }
      if (main.onReply && replyData.messageID) {
        main.onReply.delete(replyData.messageID);
      }
      await reply({ body: "Lỗi kết nối" });
    }
  },
};

export default noituCommand;
