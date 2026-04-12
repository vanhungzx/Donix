import type { Command } from "@types";
import fs from "node:fs";
import path from "node:path";
import { login as loginMessengerApp } from "../../../core/auth_login/messenger_app";
import { enrichTokensFromEaad } from "../../../core/auth_login/auto_relogin";
import { applySessionCookieToRuntime } from "../../../core/configManager";
import { writeSessionCookieSync } from "../../../core/sessionCookieFile";

const configPath = path.resolve(process.cwd(), "src/core/config/config.json");

type FbAccount = {
  email?: string;
  password?: string;
  secret2FA?: string | null;
  twofactor?: string | null;
  cookie?: string;
  disabled?: boolean;
  [key: string]: unknown;
};

type DonixConfig = {
  fbAccounts?: FbAccount[];
  cookie?: string;
  token?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type AccountTokens = Record<string, string>;

type ReplyCallbackInfo = { messageID?: string };
type ReplyCallback = (err: unknown, info?: ReplyCallbackInfo) => void;
type ReplyFn = (message: string | { body: string }, callback?: ReplyCallback) => unknown;

type ReplyData = {
  type?: "acc-select-index" | "acc-select-method";
  author?: string;
  accIndex?: number;
};

function extractUserIdFromCookie(cookie: string): string | null {
  const parts = cookie.split(";").map((p) => p.trim());
  const cUser = parts.find((p) => p.startsWith("c_user="));
  if (!cUser) return null;
  return cUser.split("=")[1] || null;
}

function loadFreshConfig(): DonixConfig {
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as DonixConfig;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Không thể đọc config: ${message}`);
  }
}

function saveConfig(config: DonixConfig): void {
  try {
    const { cookie: _omit, ...rest } = config;
    fs.writeFileSync(configPath, JSON.stringify(rest, null, 2), "utf-8");
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Không thể ghi config: ${message}`);
  }
}

function applyCookieToConfigAndGlobal(newCookie: string, accountIndex: number, cfg: DonixConfig): void {
  writeSessionCookieSync(newCookie);
  applySessionCookieToRuntime(newCookie);
  const nextCfg: DonixConfig = { ...cfg };
  delete nextCfg.cookie;
  const accounts = Array.isArray(cfg.fbAccounts) ? [...cfg.fbAccounts] : [];

  if (Number.isInteger(accountIndex) && accountIndex >= 0 && accountIndex < accounts.length) {
    const existing = accounts[accountIndex] || {};
    accounts[accountIndex] = {
      ...existing,
      cookie: newCookie,
      disabled: false,
    };
    nextCfg.fbAccounts = accounts;
  }

  saveConfig(nextCfg);

  try {
    const globalState = global as typeof globalThis & { account?: { cookie?: string; token?: unknown } };
    const tokenValue =
      nextCfg.token && typeof nextCfg.token === "object"
        ? (nextCfg.token as AccountTokens)
        : null;

    globalState.account = {
      cookie: newCookie,
      token: tokenValue,
    };
  } catch {

  }
}

async function performLoginWithMethod(
  idx: number,
  method: string,
  acc: FbAccount,
  cfg: DonixConfig,
  reply: ReplyFn
): Promise<void> {
  const email: string | undefined = acc.email;
  const password: string | undefined = acc.password;
  // Chuẩn hoá secret 2FA: ưu tiên field secret2FA, nếu không có thì dùng twofactor từ config.json
  const secret2FA: string | null =
    ((acc.secret2FA as string | null) ?? (acc.twofactor as string | null)) || null;

  if (!email || !password) {
    reply("Tài khoản này chưa cấu hình đầy đủ email/password.");
    return;
  }

  const normalized = (method || "msg").toLowerCase();

  await reply(`⏳ Đang đăng nhập acc #${idx + 1} bằng messenger...`);

  let cookie: string | null = null;
  let result: Awaited<ReturnType<typeof loginMessengerApp>> | null = null;

  if (["msg", "messenger", "messenger_app"].includes(normalized)) {
    result = await loginMessengerApp(email, password, secret2FA || "");
    if (!result.success) {
      reply(`❌ Đăng nhập bằng Messenger thất bại: ${result.message}`);
      return;
    }
    cookie = result.cookies || null;
  } else {
    reply("Phương thức login không hợp lệ. Chỉ hỗ trợ: msg.");
    return;
  }

  if (!cookie || typeof cookie !== "string" || !cookie.includes("c_user=")) {
    reply("❌ Đăng nhập thất bại: cookie trả về không hợp lệ hoặc thiếu c_user.");
    return;
  }

  // Cập nhật cookie + fbAccounts như cũ
  applyCookieToConfigAndGlobal(cookie, idx, cfg);

  // Nếu login qua messenger_app có trả về access_token thì auto convert EAAD -> EAAAAU & EAAD6V7
  const eaad = result && "access_token" in result ? result.access_token : undefined;
  if (eaad && eaad.trim()) {
    try {
      const freshCfg = loadFreshConfig();
      const existingToken =
        freshCfg.token && typeof freshCfg.token === "object" && !Array.isArray(freshCfg.token)
          ? ({ ...(freshCfg.token as AccountTokens) } as AccountTokens)
          : {};
      const enriched = await enrichTokensFromEaad(eaad.trim(), existingToken);
      const nextCfg: DonixConfig = {
        ...freshCfg,
        token: enriched,
      };
      saveConfig(nextCfg);

      // Đồng bộ lại global.account.token để các API dùng ngay được
      try {
        const globalState = global as typeof globalThis & {
          account?: { cookie?: string; token?: AccountTokens | null };
        };
        globalState.account = {
          cookie,
          token: enriched,
        };
      } catch {
        // ignore
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      reply(`⚠️ Đăng nhập thành công nhưng lỗi khi auto convert token EAAD→EAAAAU/EAAD6V7: ${msg}`);
    }
  }

  const uid = extractUserIdFromCookie(cookie);
  reply(
    `✅ Đăng nhập thành công bằng phương thức ${normalized}.\n` +
    (uid ? `➡️ UID: ${uid}\n` : "") +
    "Cookie đã ghi vào cookie.txt; acc active đã cập nhật trong config."
  );
}

const command: Command = {
  name: "acc",
  version: "1.0.0",
  desc: "Quản lý tài khoản Facebook cho auto login (xem, đổi acc, bật/tắt)",
  guide:
    "{p}acc list\n" +
    "{p}acc use <index>\n" +
    "{p}acc login <index> [msg]\n" +
    "{p}acc disable <index>\n" +
    "{p}acc enable <index>",
  prefix: true,
  cd: 3,
  role: 3,
  alias: ["fbaccount", "fbset", "acc"],

  onCall: async ({ args, reply, main, event, commandName }) => {
    const sub = (args[0] || "").toLowerCase();
    const cfg = loadFreshConfig();
    const accounts = Array.isArray(cfg.fbAccounts) ? cfg.fbAccounts : [];

    if (!sub || ["help", "-h", "--help"].includes(sub)) {
      reply(
        "⚙️ Quản lý tài khoản Facebook auto-login:\n" +
        "- fbacc list: xem danh sách tài khoản + acc đang dùng\n" +
        "- fbacc use <index>: đổi acc mặc định (chỉ ảnh hưởng các lần auto login tiếp theo)\n" +
        "- fbacc login <index>: đăng nhập ngay bằng acc index (đổi cookie + UID hiện tại)\n" +
        "- fbacc disable <index>: tắt acc (bỏ qua khi auto login)\n" +
        "- fbacc enable <index>: bật lại acc\n" +
        "- Tắt hẳn auto login: trong config.json đặt \"autoLogin\": false (lệnh acc login vẫn chạy tay được)"
      );
      return;
    }

    if (sub === "list") {
      if (!accounts.length) {
        reply("Hiện chưa cấu hình fbAccounts trong config.");
        return;
      }
      const lines = accounts.map((acc: FbAccount, i: number) => {
        const displayIndex = i + 1;
        const mark = "  ";
        const email = acc.email || "(chưa đặt email)";
        const has2FA = acc.secret2FA || acc.twofactor ? "✅2FA" : "❌2FA";
        const disabled = acc.disabled ? "🚫disabled" : "✅active";
        return `${mark} [${displayIndex}] ${email} | ${has2FA} | ${disabled}`;
      });
      reply(
        {
          body:
            "Danh sách tài khoản FB:\n" +
            lines.join("\n") +
            "\n\n👉 Reply STT (bắt đầu từ 1) vào tin nhắn này để chọn acc, sau đó chọn phương thức login.",
        },
        (err: unknown, info: { messageID?: string } | undefined) => {
          if (err || !info?.messageID) return;
          main.onReply.set(info.messageID, {
            commandName,
            messageID: info.messageID,
            type: "acc-select-index",
            author: String(event.senderID),
          });
        }
      );
      return;
    }

    if (sub === "login") {
      if (!accounts.length) {
        reply("Chưa có fbAccounts trong config để đăng nhập.");
        return;
      }
      const idxRaw = args[1];
      const idxNum = Number.parseInt(idxRaw || "", 10);
      const idx = idxNum >= 1 ? idxNum - 1 : idxNum;
      if (!Number.isInteger(idx) || idx < 0 || idx >= accounts.length) {
        reply(`Index không hợp lệ. Vui lòng nhập số từ 1 đến ${accounts.length}.`);
        return;
      }

      const acc = accounts[idx];
      if (!acc || acc.disabled) {
        reply("Tài khoản này đang bị disable hoặc chưa cấu hình đúng.");
        return;
      }

      const methodRaw = (args[2] || "msg").toLowerCase();
      const method = methodRaw;

      const email: string | undefined = acc.email;
      const password: string | undefined = acc.password;

      if (!email || !password) {
        reply("Tài khoản này chưa cấu hình đầy đủ email/password.");
        return;
      }

      try {
        await performLoginWithMethod(idx, method, acc, cfg, reply);
        return;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        reply(`❌ Lỗi khi login acc (${method}): ${message}`);
        return;
      }
    }

    if (sub === "disable") {
      if (!accounts.length) {
        reply("Chưa có fbAccounts trong config.");
        return;
      }
      const idxRaw = args[1];
      const idxNum = Number.parseInt(idxRaw || "", 10);
      const idx = idxNum >= 1 ? idxNum - 1 : idxNum;
      if (!Number.isInteger(idx) || idx < 0 || idx >= accounts.length) {
        reply(`Index không hợp lệ. Vui lòng nhập số từ 1 đến ${accounts.length}.`);
        return;
      }
      const cloned = [...accounts];
      cloned[idx] = { ...cloned[idx], disabled: true };
      try {
        const newCfg = { ...cfg, fbAccounts: cloned };
        saveConfig(newCfg);
        reply(`✅ Đã disable acc index ${idx}. Auto login sẽ bỏ qua acc này.`);
        return;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        reply(`❌ Lỗi khi disable acc: ${message}`);
        return;
      }
    }

    if (sub === "enable") {
      if (!accounts.length) {
        reply("Chưa có fbAccounts trong config.");
        return;
      }
      const idxRaw = args[1];
      const idxNum = Number.parseInt(idxRaw || "", 10);
      const idx = idxNum >= 1 ? idxNum - 1 : idxNum;
      if (!Number.isInteger(idx) || idx < 0 || idx >= accounts.length) {
        reply(`Index không hợp lệ. Vui lòng nhập số từ 1 đến ${accounts.length}.`);
        return;
      }
      const cloned = [...accounts];
      cloned[idx] = { ...cloned[idx], disabled: false };
      try {
        const newCfg = { ...cfg, fbAccounts: cloned };
        saveConfig(newCfg);
        reply(`✅ Đã enable acc index ${idx}.`);
        return;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        reply(`❌ Lỗi khi enable acc: ${message}`);
        return;
      }
    }

    reply("Subcommand không hợp lệ. Dùng: fbacc help để xem hướng dẫn.");
    return;
  },
  onReply: async ({ event, reply, Reply, main, commandName, client }) => {
    try {
      const body = (event.body || "").trim();
      if (!body) return;

      const replyData = (Reply || {}) as ReplyData;
      const { type, author, accIndex } = replyData;

      if (author && String(author) !== String(event.senderID)) {
        return;
      }

      if (type === "acc-select-index") {
        const stt = Number.parseInt(body, 10);
        if (!Number.isInteger(stt) || stt < 1) {
          reply("❌ Vui lòng reply STT hợp lệ (>= 1).");
          return;
        }

        const cfg = loadFreshConfig();
        const accounts = Array.isArray(cfg.fbAccounts) ? cfg.fbAccounts : [];
        if (!accounts.length) {
          reply("Chưa có fbAccounts trong config.");
          return;
        }
        if (stt > accounts.length) {
          reply(`STT quá lớn. Vui lòng nhập số từ 1 đến ${accounts.length}.`);
          return;
        }

        const idx = stt - 1;
        const acc = accounts[idx];
        if (!acc || acc.disabled) {
          reply("Tài khoản này đang bị disable hoặc chưa cấu hình đúng.");
          return;
        }

        client.sendMessage(
          `Đã chọn acc #${stt} (${acc.email || "no-email"}).\n` +
          "Chọn phương thức login: msg\n" +
          "👉 Reply: msg",
          event.threadID,
          (_: unknown, info: { messageID?: string } | undefined) => {
            if (!info?.messageID) return;
            if (!main || !main.onReply || typeof main.onReply.set !== "function") {
              reply("⚠️ Hệ thống không hỗ trợ onReply. Vui lòng dùng lệnh login trực tiếp.");
              return;
            }
            main.onReply.set(info.messageID, {
              commandName,
              messageID: info.messageID,
              type: "acc-select-method",
              author: String(event.senderID),
              accIndex: idx,
            });
          }, event.messageID
        );
        return;
      }

      if (type === "acc-select-method") {
        const method = body.toLowerCase();
        const cfg = loadFreshConfig();
        const accounts = Array.isArray(cfg.fbAccounts) ? cfg.fbAccounts : [];
        if (!accounts.length) {
          reply("Chưa có fbAccounts trong config.");
          return;
        }
        const idx = typeof accIndex === "number" ? accIndex : -1;
        if (idx < 0 || idx >= accounts.length) {
          reply("Dữ liệu acc không hợp lệ, vui lòng list lại.");
          return;
        }
        const acc = accounts[idx];
        if (!acc || acc.disabled) {
          reply("Tài khoản này đang bị disable hoặc chưa cấu hình đúng.");
          return;
        }

        await performLoginWithMethod(idx, method, acc, cfg, reply);
        return;
      }

      return;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      reply(`❌ Lỗi khi xử lý reply fbacc: ${message}`);
      return;
    }
  },
};

export default command;
