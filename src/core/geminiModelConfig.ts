/**
 * Cấu hình mô hình Gemini theo tài liệu hiện tại (temperature mặc định 1.0 cho Gemini 3).
 * @see https://ai.google.dev/gemini-api/docs
 */

/** Text generation — Gemini 3 Flash (preview), theo docs generateContent. */
export const GEMINI_MODEL_FLASH = "gemini-2.5-flash";

/** Fallback nhẹ khi hết quota flash (2.5 Flash Lite). */
export const GEMINI_MODEL_LITE = "gemini-2.5-flash-lite";

export type GeminiThinkingConfig = {
  thinkingBudget?: number;
};

/** thinkingBudget 0 = tắt thinking (SDK docs). Áp dụng mọi model hỗ trợ thinkingConfig. */
export function geminiThinkingConfig(_modelId: string): GeminiThinkingConfig {
  return { thinkingBudget: 0 };
}

/**
 * Gemini 3: nên giữ temperature = 1.0 (mặc định); giảm có thể gây lặp/giảm hiệu suất (theo docs).
 * Các model khác: dùng fallback (vd. 0.7, 0.9).
 */
export function geminiTemperature(modelId: string, fallback: number): number {
  return modelId.includes("gemini-3") ? 1.0 : fallback;
}
