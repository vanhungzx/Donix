import type { Command, CommandOnCallContext } from '@types';
import axios from "axios";
import fs from "fs";
import { createRequire } from "node:module";

const runCommand: Command = {
  name: "run",
  alias: ["runshell", "eval"],
  version: "1.0.0",
  role: 3,
  desc: "Run JavaScript code",
  guide:
    "• {pn}: Tiền tố lệnh\n• <lệnh>: Nhập code JavaScript để thực thi\n\nVí dụ:\n{pn} console.log('Hello World')",
  cd: 0,
  prefix: true,
  onCall: async (ctx: CommandOnCallContext) => {
    const {
      client,
      event,
      args,
      userData,
      threadData,
      permission,
      main,
      commandName,
      config,
      api,
      utils,
      logger,
      reply,
      contact,
      react,
    } = ctx;

    const { threadID, messageID } = event;

    const log = console.log;

    const tpo = (a: any): string =>
      a === null || a === undefined
        ? String(a)
        : typeof a === "object" && Object.keys(a || {}).length !== 0
          ? JSON.stringify(a, null, 4)
          : ["number", "boolean"].includes(typeof a)
            ? a.toString()
            : a;

    const send = (a: any) => {
      if (reply) {
        reply({ body: tpo(a) });
      } else if (client && client.sendMessage) {
        client.sendMessage(tpo(a), threadID, messageID);
      }
    };

    const toPrintable = (value: any): string => {
      if (typeof value === "undefined") return "undefined";
      if (typeof value === "object") {
        try {
          return JSON.stringify(value, null, 2);
        } catch {
          return String(value);
        }
      }
      return value?.toString?.() ?? "null";
    };

    const mocky = async (content: any) => {
      try {
        const res = await axios.post("https://api.mocky.io/api/mock", {
          status: 200,
          content: toPrintable(content),
          content_type: "application/json",
          charset: "UTF-8",
          secret: "DongDev",
          expiration: "never",
        });
        if (reply) {
          reply({ body: res.data.link });
        } else if (client && client.sendMessage) {
          client.sendMessage(res.data.link, threadID, messageID);
        }
      } catch (err: any) {
        const errorMsg = err?.message || "Unknown error";
        if (reply) {
          reply({ body: `⚠️ Mocky API Error: ${errorMsg}` });
        } else if (client && client.sendMessage) {
          client.sendMessage(`⚠️ Mocky API Error: ${errorMsg}`, threadID, messageID);
        }
      }
    };

    try {
      const code = args.join(" ");
      if (!code) {
        if (reply) {
          reply({ body: "⚠️ Vui lòng nhập đoạn code để thực thi." });
        } else if (client && client.sendMessage) {
          client.sendMessage("⚠️ Vui lòng nhập đoạn code để thực thi.", threadID, messageID);
        }
        return;
      }

      const codeRequire = createRequire(import.meta.url);

      const context = {
        require: codeRequire,
        bot: client,
        client,
        event,
        args,
        userData,
        threadData,
        permission: permission,
        main,
        commandName,
        config,
        api,
        logger,
        axios,
        fs,
        threadID,
        messageID,
        utils,
        log,
        send,
        tpo,
        reply,
        contact,
        react,
        sid: event.senderID,
        tid: event.threadID,
        mid: event.messageID,
      };

      const run = new Function(
        ...Object.keys(context),
        `
        return (async () => {
          ${code}
        })();
      `
      );

      const result = await run(...Object.values(context));

      if (typeof result === "undefined") return;

      if (typeof result === "string" && result.length > 2000) {
        return mocky(result);
      }

      const output = toPrintable(result);
      if (reply) {
        reply({ body: output });
      } else if (client && client.sendMessage) {
        client.sendMessage(output, threadID, messageID);
      }
    } catch (e: any) {
      console.error(e);
      try {
        const translated = await axios.get(
          "https://translate.googleapis.com/translate_a/single",
          {
            params: {
              client: "gtx",
              sl: "auto",
              tl: "vi",
              dt: "t",
              q: e.message || String(e),
            },
          }
        );

        const translatedText = translated.data?.[0]?.[0]?.[0] ?? "Không rõ lỗi.";
        const errorMsg = e.message || String(e);
        const errorOutput = `⚠️ Lỗi: ${errorMsg}\n📝 Dịch: ${translatedText}`;

        if (reply) {
          reply({ body: errorOutput });
        } else if (client && client.sendMessage) {
          client.sendMessage(errorOutput, threadID, messageID);
        }
      } catch (err: any) {
        console.error(err);
        const errorMsg = e.message || String(e);
        const errorOutput = `⚠️ Lỗi: ${errorMsg}\n📝 Không thể dịch lỗi.`;

        if (reply) {
          reply({ body: errorOutput });
        } else if (client && client.sendMessage) {
          client.sendMessage(errorOutput, threadID, messageID);
        }
      }
    }
  },
};

export default runCommand;
