import type { Command, CommandOnCallContext } from "@types";
import axios from "axios";

type GoogleTranslateResponse = [
  Array<[string | null, string]>,
  any,
  string,
  any,
  any,
  any,
  any,
  any,
  Array<Array<[string]>>?
];

const transCommand: Command = {
  name: "trans",
  alias: ["dịch"],
  version: "1.0.1",
  role: 0,
  desc: "Dịch văn bản",
  guide:
    "{pn} <ngôn ngữ> <văn bản cần dịch>\n\n" +
    "Trong đó:\n" +
    "• ngôn ngữ: en (tiếng Anh), ko (tiếng Hàn), ja (tiếng Nhật), vi (tiếng Việt)\n" +
    "• văn bản cần dịch: nội dung bạn muốn dịch\n\n" +
    "Ví dụ:\n" +
    "{pn} en xin chào\n" +
    "{pn} ko how are you\n" +
    "{pn} ja good morning",
  cd: 5,
  prefix: false,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { event, args, reply } = ctx;
    const content = args.join(" ");

    if (content.length === 0 && event.type !== "message_reply") {
      await reply({
        body: "⚠️ Bạn cần nhập nội dung cần dịch!"
      });
      return;
    }

    let translateThis = "";
    let lang = "vi";

    
    const validLangs = ["en", "ko", "ja", "vi", "zh", "fr", "es", "de", "ru", "th", "id", "ms"];

    if (event.type === "message_reply") {
      translateThis = String(event.messageReply?.body || "");
      if (content.indexOf("->") !== -1) {
        lang = content.substring(content.indexOf("->") + 3).trim();
      } else if (args[0] && validLangs.includes(args[0].toLowerCase())) {
        lang = args[0].toLowerCase();
      } else {
        lang = "vi";
      }
    } else if (content.indexOf("->") !== -1) {
      
      translateThis = content.slice(0, content.indexOf("->")).trim();
      lang = content.substring(content.indexOf("->") + 4).trim();
    } else if (args[0] && validLangs.includes(args[0].toLowerCase())) {
      
      lang = args[0].toLowerCase();
      translateThis = args.slice(1).join(" ").trim();
    } else {
      
      translateThis = content.trim();
      lang = "vi";
    }

    if (!translateThis) {
      await reply({
        body: "⚠️ Không tìm thấy nội dung cần dịch!"
      });
      return;
    }

    if (!lang || !validLangs.includes(lang)) {
      lang = "vi";
    }

    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(translateThis)}`;
      const response = await axios.get(url);
      const retrieve = response.data as GoogleTranslateResponse;

      let text = "";
      if (retrieve && Array.isArray(retrieve) && retrieve[0] && Array.isArray(retrieve[0])) {
        retrieve[0].forEach((item) => {
          if (item && item[0]) text += item[0];
        });
      }

      if (!text) {
        await reply({
          body: "⚠️ Không thể dịch được văn bản này!"
        });
        return;
      }

      let fromLang = "auto";
      if (retrieve && Array.isArray(retrieve)) {
        if (retrieve[2] && typeof retrieve[2] === "string") {
          fromLang = retrieve[2];
        } else if (retrieve[8] && Array.isArray(retrieve[8]) && retrieve[8][0]) {
          const langData = retrieve[8][0];
          if (Array.isArray(langData) && langData[0]) {
            fromLang = typeof langData[0] === "string" ? langData[0] : String(langData[0]);
          } else if (typeof langData === "string") {
            fromLang = langData;
          }
        }
      }

      await reply({
        body: `🔄 Bản dịch: \n\n${text}\n\n✏️ Dịch từ ${fromLang} sang ${lang}`
      });
    } catch (err: any) {
      await reply({
        body: `⚠️ Đã có lỗi xảy ra! ${err?.message || ""}`
      });
    }
  }
};

export default transCommand;
