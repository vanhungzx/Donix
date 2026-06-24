import fs from "fs";
import axios from "axios";
import path from "path";
import { TEMP_DIR } from "../../../core/storagePath";

type OnCallParams = {
  reply: (msg: any) => Promise<any> | any;
  event: any;
  args: string[];
};

const say = {
  name: "voice",
  alias: ["voice"],
  version: "1.0.1",
  role: 0,
  desc: "Tạo bot trả lời giọng nói của Google qua văn bản",
  guide: "{pn} [ru/en/ko/ja] [Text]: Chuyển đổi văn bản thành giọng nói\nVí dụ: {pn} en Hello world",
  cd: 5,
  prefix: true,
  async onCall({ reply, event, args }: OnCallParams) {
    try {
      const tempDir = TEMP_DIR();
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const content =
        event.type == "message_reply"
          ? event.messageReply?.body || ""
          : args.join(" ");

      const languageToSay =
        ["ru", "en", "ko", "ja"].some((item) => content.indexOf(item) == 0) &&
          content.includes(" ")
          ? content.slice(0, content.indexOf(" "))
          : "vi";

      const textToSpeak =
        languageToSay != "vi"
          ? content.slice(languageToSay.length + 1)
          : content;

      if (!textToSpeak.trim()) {
        await reply("Vui lòng nhập nội dung để đọc.");
        return;
      }

      const audioPath = path.join(
        tempDir,
        `${event.threadID}_${event.senderID}.mp3`
      );

      const response = await axios({
        method: "get",
        url: `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
          textToSpeak
        )}&tl=${languageToSay}&client=tw-ob`,
        responseType: "stream",
      });

      const writer = fs.createWriteStream(audioPath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on("finish", () => resolve());
        writer.on("error", (err) => reject(err));
      });

      await reply({
        attachment: fs.createReadStream(audioPath),
      });

      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    } catch (error) {
      console.error("Error:", error);
      return reply("An error occurred while processing the request");
    }
  },
};

export default say;
