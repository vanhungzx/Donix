"use strict";

import type { Command, CommandOnCallContext } from "@types";
import got from "got";
import { getConfig } from "../../../core/configManager";

function pickAccessTokenFromConfig(): string | null {
  const cfg = getConfig();
  const tokenObj = (cfg as any)?.token as Record<string, unknown> | undefined;

  const direct =
    (tokenObj?.EAAD as string | undefined) ||
    (tokenObj?.EAAAAU as string | undefined) ||
    (tokenObj?.EAAD6V7 as string | undefined);

  if (direct && typeof direct === "string") return direct;

  if (tokenObj && typeof tokenObj === "object") {
    const anyToken = Object.values(tokenObj).find((v) => typeof v === "string" && v.length > 10);
    if (typeof anyToken === "string") return anyToken;
  }

  return null;
}

interface ThreadSummaryResponse {
  data?: {
    xfb_genai_thread_summary_generate_connection?: {
      edges?: Array<{
        node?: {
          status?: string;
          response?: {
            __typename?: string;
            summary?: string;
            response_id?: string | null;
            metagen_response_id?: string;
          };
        };
      }>;
    };
  };
  errors?: Array<{ message: string }>;
  error?: { message: string };
}

interface StreamingResponse {
  data?: {
    xfb_genai_thread_summary_generate_connection?: {
      edges?: Array<{
        node?: {
          status?: string;
          response?: {
            __typename?: string;
            summary?: string;
            response_id?: string | null;
            metagen_response_id?: string;
          };
        };
      }>;
    };
  };
  label?: string;
  path?: Array<string | number>;
  extensions?: {
    is_final?: boolean;
    server_metadata?: {
      request_start_time_ms?: number;
      time_at_flush_ms?: number;
    };
  };
}

function generateClientTraceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 15)}-${Math.random()
    .toString(36)
    .substring(2, 15)}`;
}

function generatePromptSessionId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const segments = [8, 4, 4, 4, 12];
  return segments
    .map((len) => {
      let segment = "";
      for (let i = 0; i < len; i++) {
        segment += chars[Math.floor(Math.random() * chars.length)];
      }
      return segment;
    })
    .join("-");
}

async function generateThreadSummary(
  token: string,
  threadID: string,
  threadType: "GROUP" | "ONE_TO_ONE" = "GROUP",
  startTimestamp?: number
): Promise<string> {
  if (!token) {
    throw new Error("Không tìm thấy token. Vui lòng đăng nhập lại.");
  }

  const traceId = generateClientTraceId();
  const promptSessionId = generatePromptSessionId();
  const startTimestampMs = startTimestamp || Date.now() - 24 * 60 * 60 * 1000; // default: 1 day

  const variables = {
    params: {
      where_clause: [
        {
          range_of_timestamp_ms: {
            start_timestamp_ms: startTimestampMs,
          },
          clause_type: "RANGE_OF_TIMESTAMP_MS",
        },
      ],
      surface_type: "MESSENGER",
      prompt_session_id: promptSessionId,
      limit_clause: {
        max_messages: 100,
      },
      usecase_name: "UNREAD_MESSAGES",
      from_clause: {
        thread_type: threadType,
        thread_id: threadID,
      },
    },
  };

  const form: Record<string, string> = {
    method: "post",
    pretty: "false",
    format: "json",
    server_timestamps: "true",
    locale: "vi_VN",
    fb_api_req_friendly_name: "GenAIThreadSummaryGenerateOpenConnectionMutation",
    fb_api_caller_class: "graphservice",
    client_doc_id: "25402085569210381777671680527",
    fb_api_client_context: JSON.stringify({ is_background: false }),
    variables: JSON.stringify(variables),
    fb_api_analytics_tags: JSON.stringify(["GraphServices"]),
    client_trace_id: traceId,
  };

  const userAgent =
    "Dalvik/2.1.0 (Linux; U; Android 9; SH-M24 Build/PQ3A.190605.06171036) [FBAN/Orca-Android;FBAV/524.0.0.44.109;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/788947415;FBCR/MobiFone;FBMF/AQUOS;FBBD/AQUOS;FBDV/SH-M24;FBSV/9;FBCA/x86:armeabi-v7a;FBDM/{density=3.0,width=1080,height=1920};FB_FW/1;]";

  try {
    const response = await got.post("https://genai-graph.facebook.com/graphql", {
      headers: {
        "User-Agent": userAgent,
        "Content-Type": "application/x-www-form-urlencoded",
        "x-fb-request-analytics-tags": JSON.stringify({
          network_tags: {
            product: "256002347743983",
            purpose: "none",
            request_category: "graphql",
            retry_attempt: "0",
          },
          application_tags: "graphservice",
        }),
        authorization: `OAuth ${token}`,
      },
      form,
      decompress: true,
      timeout: {
        request: 120000,
      },
    });

    const responseText = response.body as string;
    const lines = responseText.split("\n").filter((line) => line.trim());

    let finalSummary = "";

    for (const line of lines) {
      if (!line.trim() || line.startsWith(":")) continue;

      try {
        let jsonStr = line;
        if (line.startsWith("data: ")) {
          jsonStr = line.substring(6);
        }

        const parsed: StreamingResponse = JSON.parse(jsonStr);

        const edges = parsed.data?.xfb_genai_thread_summary_generate_connection?.edges;
        if (edges && edges.length > 0) {
          const lastEdge = edges[edges.length - 1];
          const summary = lastEdge?.node?.response?.summary;
          const status = lastEdge?.node?.status;

          if (summary) finalSummary = summary;
          if (status === "COMPLETE") break;
        }

        if (parsed.extensions?.is_final) {
          // Still try to extract summary from this final chunk
          const nodeAny = parsed.data as any;
          const summary = nodeAny?.node?.response?.summary || nodeAny?.response?.summary;
          if (summary) finalSummary = summary;
          break;
        }
      } catch {
        // ignore invalid JSON lines
      }
    }

    if (!finalSummary) {
      // fallback: try normal JSON parse
      try {
        const parsed: ThreadSummaryResponse = JSON.parse(responseText);

        if (parsed.errors && parsed.errors.length > 0) {
          const errorMsg = parsed.errors.map((e) => e.message || JSON.stringify(e)).join("; ");
          throw new Error(`GraphQL Error: ${errorMsg}`);
        }
        if (parsed.error) {
          throw new Error(`GraphQL Error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
        }

        const summary =
          parsed.data?.xfb_genai_thread_summary_generate_connection?.edges?.[0]?.node?.response
            ?.summary;
        if (summary) return summary;
      } catch {
        // ignore
      }

      throw new Error("Không thể tạo tóm tắt. Có thể không có tin nhắn chưa đọc hoặc đã xảy ra lỗi.");
    }

    return finalSummary;
  } catch (error: any) {
    if (error?.response) {
      const statusCode = error.response.statusCode || error.statusCode;
      const body = error.response.body || error.body || "";
      let errorMsg = "Unknown error";

      try {
        const errorBody = typeof body === "string" ? JSON.parse(body) : body;
        errorMsg = errorBody?.errors
          ? errorBody.errors.map((e: any) => e.message || JSON.stringify(e)).join("; ")
          : errorBody?.error?.message ||
          (typeof body === "string"
            ? body.slice(0, 500)
            : JSON.stringify(body).slice(0, 500));
      } catch {
        errorMsg =
          typeof body === "string" ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500);
      }

      throw new Error(`HTTP ${statusCode}: ${errorMsg}`);
    }

    throw error;
  }
}

const summaryCommand: Command = {
  name: "summary",
  desc: "Tóm tắt tin nhắn chưa đọc trong nhóm",
  alias: ["tomtat", "summarize", "unread"],
  version: "1.0.0",
  role: 3,
  cd: 10,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { client, event, args, reply, react } = ctx;
    const { threadID, isGroup, messageID } = event;

    if (!isGroup) {
      if (react) react("❌");
      if (reply) {
        await reply({ body: "❌ Lệnh này chỉ dùng trong nhóm!" });
      } else {
        await client.sendMessage("❌ Lệnh này chỉ dùng trong nhóm!", threadID, messageID);
      }
      return;
    }

    if (react) react("⏳");

    try {
      const token = pickAccessTokenFromConfig();

      if (!token || typeof token !== "string") {
        if (react) react("❌");
        const msg =
          "❌ Thiếu token trong config. Vui lòng thêm vào `src/core/config/config.json` (config.token.EAAD hoặc token khác).";
        if (reply) await reply({ body: msg });
        else await client.sendMessage(msg, threadID, messageID);
        return;
      }

      // optional arg: hours back (default 24h)
      const hours =
        args?.[0] && !isNaN(Number(args[0])) ? Math.max(1, Math.min(168, Number(args[0]))) : 24;
      const startTimestampMs = Date.now() - hours * 60 * 60 * 1000;

      const loadingMsg = "⏳ Đang tạo tóm tắt tin nhắn chưa đọc, vui lòng đợi...";
      if (reply) await reply({ body: loadingMsg });
      else await client.sendMessage(loadingMsg, threadID, messageID);

      const summary = await generateThreadSummary(token, threadID, "GROUP", startTimestampMs);

      if (!summary || summary.trim().length === 0) {
        if (react) react("ℹ️");
        const msg = "ℹ️ Không có tin nhắn chưa đọc để tóm tắt hoặc không thể tạo tóm tắt.";
        if (reply) await reply({ body: msg });
        else await client.sendMessage(msg, threadID, messageID);
        return;
      }

      if (react) react("✅");
      const formatted = `📋 TÓM TẮT TIN NHẮN CHƯA ĐỌC (trong ${hours} giờ)\n\n${summary}`;

      // avoid overly long message bodies (platform limits vary)
      const MAX_LEN = 3800;
      const safe =
        formatted.length > MAX_LEN
          ? `${formatted.slice(0, MAX_LEN)}\n...\n(Đã cắt bớt vì quá dài)`
          : formatted;

      if (reply) await reply({ body: safe });
      else await client.sendMessage(safe, threadID, messageID);
    } catch (error: any) {
      if (react) react("❌");
      const errorMessage = error?.message || "Đã xảy ra lỗi không xác định";
      const msg = `❌ Lỗi khi tạo tóm tắt:\n${errorMessage}`;
      if (reply) await reply({ body: msg });
      else await client.sendMessage(msg, threadID, messageID);
    }
  },
};

export default summaryCommand;
