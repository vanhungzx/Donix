"use strict";

import type { Command, CommandOnCallContext } from '@types';
import axios from "axios";


const languageCodes: Record<string, string> = {
  "vi": "Tiếng Việt",
  "en": "Tiếng Anh",
  "ja": "Tiếng Nhật",
  "ko": "Tiếng Hàn",
  "zh": "Tiếng Trung",
  "th": "Tiếng Thái",
  "es": "Tiếng Tây Ban Nha",
  "fr": "Tiếng Pháp",
  "de": "Tiếng Đức",
  "ru": "Tiếng Nga",
  "it": "Tiếng Ý",
  "pt": "Tiếng Bồ Đào Nha",
  "ar": "Tiếng Ả Rập",
  "hi": "Tiếng Hindi",
  "id": "Tiếng Indonesia",
  "ms": "Tiếng Malaysia",
  "tl": "Tiếng Tagalog",
  "auto": "Tự động"
};


const languageNames: Record<string, string> = {
  "vietnamese": "vi",
  "vietnam": "vi",
  "việt": "vi",
  "việt nam": "vi",
  "english": "en",
  "anh": "en",
  "japanese": "ja",
  "nhật": "ja",
  "korean": "ko",
  "hàn": "ko",
  "chinese": "zh",
  "trung": "zh",
  "thai": "th",
  "thái": "th",
  "spanish": "es",
  "tây ban nha": "es",
  "french": "fr",
  "pháp": "fr",
  "german": "de",
  "đức": "de",
  "russian": "ru",
  "nga": "ru",
  "italian": "it",
  "ý": "it",
  "portuguese": "pt",
  "bồ đào nha": "pt",
  "arabic": "ar",
  "ả rập": "ar",
  "hindi": "hi",
  "indonesian": "id",
  "indonesia": "id",
  "malaysian": "ms",
  "malaysia": "ms",
  "tagalog": "tl",
  "philippines": "tl"
};

function normalizeLanguage(lang: string): string {
  const normalized = lang.toLowerCase().trim();

  
  if (languageCodes[normalized]) {
    return normalized;
  }

  
  if (languageNames[normalized]) {
    return languageNames[normalized];
  }

  return normalized;
}

async function translateText(text: string, targetLang: string = "vi", sourceLang: string = "auto"): Promise<{ translated: string; source: string; target: string }> {
  try {
    
    const url = "https://translate.googleapis.com/translate_a/single";
    const params = {
      client: "gtx",
      sl: sourceLang,
      tl: targetLang,
      dt: "t",
      q: text
    };

    const response = await axios.get(url, {
      params,
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    const data = response.data;

    if (!data || !Array.isArray(data) || !data[0]) {
      throw new Error("Không thể dịch văn bản");
    }

    
    const translatedParts: string[] = [];
    for (const item of data[0]) {
      if (item && item[0]) {
        translatedParts.push(item[0]);
      }
    }

    const translated = translatedParts.join("");
    const detectedSource = data[2] || sourceLang;

    return {
      translated: translated || text,
      source: detectedSource,
      target: targetLang
    };
  } catch (error: any) {
    throw new Error(`Lỗi dịch thuật: ${error.message || "Không xác định"}`);
  }
}

const translateCommand: Command = {
  name: "translate",
  alias: ["dịch", "trans"],
  version: "1.0.0",
  role: 0,
  desc: "Dịch văn bản sang các ngôn ngữ khác",
  guide:
    "   {pn} <ngôn ngữ đích> <văn bản>\n" +
    "   {pn} <văn bản>\n\n" +
    "   • {pn} <ngôn ngữ đích> <văn bản>: Dịch sang ngôn ngữ chỉ định\n" +
    "   • {pn} <văn bản>: Tự động dịch sang tiếng Việt\n\n" +
    "   Ngôn ngữ hỗ trợ: vi, en, ja, ko, zh, th, es, fr, de, ru, it, pt, ar, hi, id, ms, tl\n\n" +
    "   Ví dụ:\n" +
    "   • {pn} en Xin chào\n" +
    "   • {pn} Hello World\n" +
    "   • {pn} ja こんにちは",
  cd: 3,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, reply } = ctx;

    try {
      if (!args[0]) {
        const langList = Object.entries(languageCodes)
          .filter(([code]) => code !== "auto")
          .map(([code, name]) => `${code}: ${name}`)
          .join("\n");

        await reply({
          body: "❌ Vui lòng nhập văn bản cần dịch!\n\n" +
            "📖 Cách sử dụng:\n" +
            "• {pn} <ngôn ngữ đích> <văn bản>\n" +
            "• {pn} <văn bản> (tự động dịch sang tiếng Việt)\n\n" +
            "🌍 Ngôn ngữ hỗ trợ:\n" +
            langList
        });
        return;
      }

      let targetLang = "vi"; 
      let text = args.join(" ");

      
      const firstArg = args[0].toLowerCase().trim();
      const normalizedLang = normalizeLanguage(firstArg);

      if (languageCodes[normalizedLang] && args.length > 1) {
        
        targetLang = normalizedLang;
        text = args.slice(1).join(" ");
      }

      if (!text || text.trim().length === 0) {
        await reply({
          body: "❌ Vui lòng nhập văn bản cần dịch!"
        });
        return;
      }

      if (text.length > 5000) {
        await reply({
          body: "❌ Văn bản quá dài! Vui lòng nhập tối đa 5000 ký tự."
        });
        return;
      }

      await reply({
        body: "⏳ Đang dịch..."
      });

      const result = await translateText(text, targetLang, "auto");

      const sourceLangName = languageCodes[result.source] || result.source.toUpperCase();
      const targetLangName = languageCodes[result.target] || result.target.toUpperCase();

      await reply({
        body: `✅ DỊCH THÀNH CÔNG\n\n` +
          `📝 Văn bản gốc (${sourceLangName}):\n${text}\n\n` +
          `🌐 Văn bản dịch (${targetLangName}):\n${result.translated}`
      });

    } catch (e: any) {
      console.error("Translate command error:", e);
      await reply({
        body: `❌ Đã xảy ra lỗi: ${e.message || "Lỗi không xác định"}`
      });
    }
  },
};

export default translateCommand;
