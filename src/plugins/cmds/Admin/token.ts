"use strict";

import type { Command, CommandOnCallContext } from "@types";
import type { DonixGlobalState } from "../../../types/global";

const getDonixState = (): DonixGlobalState => {
  if (!global.Donix) {
    global.Donix = {} as DonixGlobalState;
  }
  return global.Donix;
};

interface TokenInfo {
  [key: string]: string | string[];
}

interface BasicScope {
  name: string;
  appliesTo: string;
}

interface ParsedAccessTokenData {
  tokenInfo: TokenInfo;
  basicScopes: BasicScope[];
}

interface APIWithTokenMethods {
  checkToken?: (accessToken: string) => Promise<ParsedAccessTokenData | undefined>;
  getToken?: (type: string) => Promise<string | undefined>;
}

function formatTokenInfo(tokenInfo: TokenInfo, tokenType: string): string {
  const lines: string[] = [];
  lines.push(`✅ Token ${tokenType} hợp lệ (Live)\n`);
  lines.push("📋 Thông tin token:");

  if (tokenInfo.id_ung_dung) {
    lines.push(`• Ứng dụng: ${tokenInfo.id_ung_dung}`);
  }
  if (tokenInfo.loai) {
    lines.push(`• Loại: ${tokenInfo.loai}`);
  }
  if (tokenInfo.id_nguoi_dung) {
    lines.push(`• ID người dùng: ${tokenInfo.id_nguoi_dung}`);
  }
  if (tokenInfo.da_phat_hanh) {
    lines.push(`• Đã phát hành: ${tokenInfo.da_phat_hanh}`);
  }
  if (tokenInfo.het_han) {
    lines.push(`• Hết hạn: ${tokenInfo.het_han}`);
  }
  if (tokenInfo.het_han_truy_cap_du_lieu) {
    lines.push(`• Hết hạn truy cập dữ liệu: ${tokenInfo.het_han_truy_cap_du_lieu}`);
  }
  if (tokenInfo.hop_le) {
    lines.push(`• Hợp lệ: ${tokenInfo.hop_le}`);
  }
  if (tokenInfo.goc) {
    lines.push(`• Gốc: ${tokenInfo.goc}`);
  }

  if (tokenInfo.scopes_array && Array.isArray(tokenInfo.scopes_array)) {
    lines.push(`\n📦 Quyền (${tokenInfo.scopes_array.length}):`);
    const scopes = tokenInfo.scopes_array.slice(0, 10);
    lines.push(`   ${scopes.join(", ")}`);
    if (tokenInfo.scopes_array.length > 10) {
      lines.push(`   ... và ${tokenInfo.scopes_array.length - 10} quyền khác`);
    }
  }

  return lines.join("\n");
}

const tokenCommand: Command = {
  name: "token",
  alias: ["tok", "checktoken"],
  version: "1.0.0",
  role: 3,
  desc: "Kiểm tra và lấy token Facebook",
  guide: `
• {pn} check [type]: Kiểm tra token từ config (nếu không có type thì check tất cả)
• {pn} get <type>: Lấy token mới (EAAAAU, EAAD, EAAD6V7, ...)
  `,
  cd: 2,
  prefix: true,

  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { args, reply, logger, config } = ctx;

    try {
      const donix = getDonixState();
      const api = donix.api as APIWithTokenMethods | undefined;

      if (!api) {
        await reply({ body: "⚠️ API chưa sẵn sàng. Vui lòng thử lại sau." });
        return;
      }

      const action = args[0]?.toLowerCase();
      const secondArg = args[1];


      if (!action || action === "check") {
        const tokenType = secondArg?.toUpperCase();
        const tokens: Record<string, unknown> = (config.token || config.tokens || {}) as Record<string, unknown>;


        if (tokenType) {
          const tokenToCheck: unknown = tokens[tokenType];
          if (!tokenToCheck) {
            await reply({
              body: `⚠️ Không tìm thấy token ${tokenType} trong config.`
            });
            return;
          }

          await reply({ body: `⏳ Đang kiểm tra token ${tokenType}...` });

          if (typeof api.checkToken !== "function") {
            await reply({ body: "⚠️ checkToken không khả dụng. Vui lòng thử lại sau." });
            return;
          }

          try {
            const data = await api.checkToken(String(tokenToCheck));

            if (!data || !data.tokenInfo) {
              await reply({ body: `❌ Không thể kiểm tra token ${tokenType}. Token có thể không hợp lệ hoặc đã hết hạn.` });
              return;
            }

            const hopLe = data.tokenInfo.hop_le;
            const isLive = typeof hopLe === "string" && (hopLe === "Đúng" || hopLe === "Valid" || hopLe === "True");

            if (isLive) {

              const formattedInfo = formatTokenInfo(data.tokenInfo, tokenType);
              await reply({
                body: formattedInfo
              });
            } else {

              const statusMsg = typeof hopLe === "string" ? hopLe : "Không xác định";
              await reply({
                body: `❌ Token ${tokenType} không hợp lệ hoặc đã hết hạn.\n\n📊 Trạng thái: ${statusMsg}\n\n📋 Thông tin:\n${JSON.stringify(data.tokenInfo, null, 2)}`
              });
            }
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger?.error?.(`Lỗi kiểm tra token ${tokenType}: ${errorMessage}`);
            await reply({
              body: `❌ Lỗi khi kiểm tra token ${tokenType}: ${errorMessage || "Unknown error"}`
            });
          }
        } else {

          const tokenKeys = Object.keys(tokens);
          if (tokenKeys.length === 0) {
            await reply({ body: "⚠️ Không có token nào trong config để kiểm tra." });
            return;
          }

          await reply({ body: `⏳ Đang kiểm tra ${tokenKeys.length} token từ config...` });

          if (typeof api.checkToken !== "function") {
            await reply({ body: "⚠️ checkToken không khả dụng. Vui lòng thử lại sau." });
            return;
          }

          const results: Array<{ type: string; data?: ParsedAccessTokenData; error?: string }> = [];

          // Tối ưu: Giới hạn số lượng token check đồng thời để tránh memory spike
          const MAX_CONCURRENT_CHECKS = 5;
          const checkTokenFn = api.checkToken;
          if (typeof checkTokenFn === "function") {
            for (let i = 0; i < tokenKeys.length; i += MAX_CONCURRENT_CHECKS) {
              const batch = tokenKeys.slice(i, i + MAX_CONCURRENT_CHECKS);
              await Promise.allSettled(
                batch.map(async (type) => {
                  const token = tokens[type];
                  if (!token) return;

                  try {
                    const data = await checkTokenFn(String(token));
                    if (data && data.tokenInfo) {
                      results.push({ type, data });
                    } else {
                      results.push({ type, error: "Không thể kiểm tra" });
                    }
                  } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    results.push({ type, error: errorMessage || "Unknown error" });
                  }
                })
              );
            }
          }


          // Tối ưu: Pre-allocate array size để giảm reallocation
          const lines: string[] = [];
          lines.push("📊 Danh sách token:\n");

          // Giới hạn số lượng kết quả hiển thị để tránh message quá dài
          const MAX_RESULTS = 50;
          const displayResults = results.slice(0, MAX_RESULTS);

          for (const result of displayResults) {
            if (result.data) {
              const tokenInfo = result.data.tokenInfo;
              const hopLe = tokenInfo.hop_le;
              const isLive = typeof hopLe === "string" && (hopLe === "Đúng" || hopLe === "Valid" || hopLe === "True");
              const statusIcon = isLive ? "✅" : "❌";
              const statusText = isLive ? "Live" : "Die";

              lines.push(`${statusIcon} ${result.type}: ${statusText}`);

              if (tokenInfo.id_ung_dung) {
                lines.push(`   • Ứng dụng: ${tokenInfo.id_ung_dung}`);
              }
              if (tokenInfo.loai) {
                lines.push(`   • Loại: ${tokenInfo.loai}`);
              }
              if (tokenInfo.id_nguoi_dung) {
                lines.push(`   • ID người dùng: ${tokenInfo.id_nguoi_dung}`);
              }
              if (tokenInfo.da_phat_hanh) {
                lines.push(`   • Đã phát hành: ${tokenInfo.da_phat_hanh}`);
              }
              if (tokenInfo.het_han) {
                lines.push(`   • Hết hạn: ${tokenInfo.het_han}`);
              }
              if (tokenInfo.het_han_truy_cap_du_lieu) {
                lines.push(`   • Hết hạn truy cập dữ liệu: ${tokenInfo.het_han_truy_cap_du_lieu}`);
              }
              if (tokenInfo.hop_le) {
                lines.push(`   • Hợp lệ: ${tokenInfo.hop_le}`);
              }
              if (tokenInfo.goc) {
                lines.push(`   • Gốc: ${tokenInfo.goc}`);
              }

              if (isLive && tokenInfo.scopes_array && Array.isArray(tokenInfo.scopes_array)) {
                lines.push(`   • Quyền: ${tokenInfo.scopes_array.length} quyền`);
              }
              lines.push("");
            } else {
              lines.push(`❌ ${result.type}: Die\n`);
            }
          }

          // Thêm thông báo nếu có nhiều token hơn hiển thị
          if (results.length > MAX_RESULTS) {
            lines.push(`\n... và ${results.length - MAX_RESULTS} token khác`);
          }

          await reply({
            body: lines.join("\n")
          });

          // Cleanup: Clear results array để giải phóng memory
          results.length = 0;
        }
        return;
      }


      if (action === "get") {
        const tokenType = secondArg?.toUpperCase() || "EAAD";

        if (typeof api.getToken !== "function") {
          await reply({ body: "⚠️ getToken không khả dụng. Vui lòng thử lại sau." });
          return;
        }

        await reply({ body: `⏳ Đang lấy token ${tokenType}...` });

        try {
          const newToken = await api.getToken(tokenType);

          if (!newToken) {
            await reply({ body: `❌ Không thể lấy token ${tokenType}. Vui lòng thử lại sau.` });
            return;
          }

          await reply({
            body: `✅ Đã lấy token ${tokenType} thành công!\n\n🔑 Token: ${newToken}\n\n💡 Bạn có thể dùng lệnh "{pn} check ${newToken}" để kiểm tra token này.`.replace("{pn}", ctx.commandName || "token")
          });
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger?.error?.(`Lỗi lấy token: ${errorMessage}`);
          await reply({
            body: `❌ Lỗi khi lấy token ${tokenType}: ${errorMessage || "Unknown error"}`
          });
        }
        return;
      }


      await reply({
        body: `⚠️ Lệnh không hợp lệ.\n\n📝 Cú pháp:\n• {pn} check [type] - Kiểm tra token từ config\n• {pn} get <type> - Lấy token mới`.replace(/{pn}/g, ctx.commandName || "token")
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error?.(`Lỗi lệnh token: ${errorMessage}`);
      await reply({
        body: `❌ Lỗi: ${errorMessage || "Unknown error"}`
      });
    }
  },
};

export default tokenCommand;
