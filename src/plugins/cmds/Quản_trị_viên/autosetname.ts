"use strict";

import type { Command, CommandMessenger, CommandOnCallContext, CommandOnEventContext, FacebookClient, ThreadDataModel } from "@types";
import moment from "moment-timezone";

interface AutosetnameConfig {
  enable?: boolean;
  nameFormat?: string | null;
}

interface ThreadDataWithAutosetname {
  data?: {
    autosetname?: AutosetnameConfig;
  };
}

interface AddedParticipant {
  userFbId: string;
  fullName?: string;
}

const autosetnameCommand: Command = {
  name: "autosetname",
  alias: ["autosetn"],
  version: "1.0.4",
  role: 1,
  desc: "Tự động đặt biệt danh cho thành viên mới",
  guide: `1️⃣ BẬT/TẮT TỰ ĐỘNG ĐẶT BIỆT DANH

    • Gõ lệnh: {pn}

    • Khi bật: Bot sẽ tự động đặt biệt danh cho thành viên mới

    • Khi tắt: Bot sẽ không tự động đặt biệt danh

    2️⃣ THIẾT LẬP MẪU BIỆT DANH

    • Cú pháp: {pn} add <mẫu biệt danh>

    Các thẻ có sẵn:

    • {name} - Tên thành viên

    • {time} - Ngày tháng hiện tại (DD/MM)

    Một số ví dụ mẫu:

    • {pn} add {name} 🌟

      → Kết quả: Minh 🌟

    • {pn} add TV Mới {name}

      → Kết quả: TV Mới Minh

    • {pn} add {name} | Ngày vào {time}

      → Kết quả: Minh | Ngày vào (20/03)

    3️⃣ XÓA MẪU BIỆT DANH

    • Cú pháp: {pn} remove

    • Bot sẽ xóa mẫu biệt danh hiện tại

    4️⃣ KIỂM TRA CẤU HÌNH

    • Cú pháp: {pn} check

    • Xem trạng thái bật/tắt và mẫu hiện tại

    ⚠️ LƯU Ý QUAN TRỌNG:

    • Biệt danh sẽ được tự động đặt ngay khi có thành viên mới

    • Độ dài biệt danh không được vượt quá 50 ký tự

    • Phải có thẻ {name} trong mẫu biệt danh`,
  cd: 5,
  prefix: true,

  onEvent: async (ctx: CommandOnEventContext): Promise<void> => {
    const client = ctx.client as FacebookClient;
    const event = ctx.event;
    const send = ctx.send as CommandMessenger;
    const threadData = ctx.threadData as ThreadDataModel;

    const botID = client.getCurrentUserID();
    if (event.senderID === botID || event.senderID === botID) {
      return;
    }

    if (
      !event.logMessageData?.addedParticipants ||
      event.logMessageType !== "log:subscribe"
    ) {
      return;
    }

    const threadID = event.threadID;
    const thread = (await threadData.get(threadID)) as ThreadDataWithAutosetname | null;
    const autosetname = thread?.data?.autosetname;

    if (!autosetname?.enable || !autosetname?.nameFormat) {
      return;
    }

    try {
      const promises = (event.logMessageData.addedParticipants as AddedParticipant[]).map(
        async (info: AddedParticipant) => {
          const formattedName = autosetname.nameFormat!
            .replace("{time}", `(${moment().format("DD/MM")})`)
            .replace("{name}", info.fullName || "");

          if (formattedName === info.fullName) {
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 500));

          try {
            await (client as unknown as { changeNickname: (name: string, threadID: string, userID: string) => Promise<void> }).changeNickname(formattedName, threadID, info.userFbId);
          } catch {

          }
        }
      );

      await Promise.all(promises);
      await send("✅ Đã đặt biệt danh tự động cho thành viên mới!");
    } catch {

    }
  },

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { event, reply, args, userData, threadData } = ctx;
    const { threadID } = event;

    const getName = async (uid: string): Promise<string> => {
      try {
        const getNameFunc = userData.getName as ((uid: string) => Promise<string | null | undefined>) | undefined;
        return getNameFunc ? (await getNameFunc(uid)) || "Người dùng" : "Người dùng";
      } catch {
        return "Người dùng";
      }
    };

    if (!args[0]) {
      const data = (await threadData.get(threadID)) as ThreadDataWithAutosetname | null;
      const autosetNameStatus = data?.data?.autosetname?.enable;

      try {
        if (typeof autosetNameStatus === "undefined" || autosetNameStatus) {
          await threadData.update(threadID, {
            data: {
              autosetname: {
                enable: false,
                nameFormat: null,
              },
            },
          });
          await reply("☑️ Đã tắt tự động đặt biệt danh!");
          return;
        } else {
          await threadData.update(threadID, {
            data: {
              autosetname: {
                enable: true,
                nameFormat: data?.data?.autosetname?.nameFormat || "{name}",
              },
            },
          });
          await reply("☑️ Đã bật tự động đặt biệt danh!");
          return;
        }
      } catch (error) {
        await reply("❌ Đã xảy ra lỗi!");
        return;
      }
    }

    const data = (await threadData.get(threadID)) as ThreadDataWithAutosetname | null;
    const n = await getName(String(event.senderID));

    switch (args[0]) {
      case "add": {
        let nameConfig = args.slice(1).join(" ");

        if (!nameConfig.includes("{name}")) {
          nameConfig = `{name} ${nameConfig}`;
        }

        await threadData.update(threadID, {
          data: {
            autosetname: {
              enable: true,
              nameFormat: nameConfig,
            },
          },
        });

        await reply(
          `✅ Cấu hình đặt biệt danh đã được lưu!\n📝 Preview: ${nameConfig
            .replace("{name}", n)
            .replace("{time}", `(${moment().format("DD/MM")})`)}`
        );
        break;
      }

      case "remove":
      case "del":
      case "delete": {
        if (data?.data?.autosetname?.nameFormat) {
          await threadData.update(threadID, {
            data: {
              autosetname: {
                enable: false,
                nameFormat: null,
              },
            },
          });
          await reply("✅ Đã xóa cấu hình đặt biệt danh!");
        } else {
          await reply("❎ Chưa có cấu hình biệt danh!");
        }
        break;
      }

      case "check": {
        const currentFormat = data?.data?.autosetname?.nameFormat;
        const autosetNameStatus = data?.data?.autosetname?.enable;

        let status = "❌ Tắt";
        if (autosetNameStatus) {
          status = "✅ Bật";
        }

        let format = "Chưa cài đặt";
        if (currentFormat) {
          format = currentFormat
            .replace("{name}", n)
            .replace("{time}", `(${moment().format("DD/MM")})`);
        }

        await reply(`🔰 Trạng thái: ${status}\n` + `📝 Mẫu hiện tại: ${format}`);
        break;
      }

      default: {
        await reply(`📝 Hướng dẫn sử dụng:\n${autosetnameCommand.guide}`);
        return;
      }
    }
  },
};

export default autosetnameCommand;
