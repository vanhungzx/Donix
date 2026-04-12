"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnReactContext,
} from "@types";
import fs from "fs-extra";
import { storagePath } from "../../../core/storagePath";

const setn = storagePath("other", "setname.json");


if (!fs.existsSync(setn)) {
  fs.writeFileSync(setn, JSON.stringify([]));
}

interface SetNameEntry {
  threadID: string;
  nameUser?: string;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const addDays = (d: Date, n: number): Date => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
};

const fmtDateDDMM = (d: Date): string => {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
};

const buildNick = (prefix: string | undefined, name: string, suffix: string | undefined): string => {
  const p = prefix ? String(prefix).trim() : "";
  const n = String(name || "").trim();
  const s = suffix ? String(suffix).trim() : "";
  return [p, n].filter(Boolean).join(" ") + (s ? " " + s : "");
};

const setnameCommand: Command = {
  name: "setname",
  alias: ["setn"],
  version: "2.2.0",
  role: 0,
  desc: "Đổi biệt danh trong nhóm của bạn hoặc của người bạn tag",
  guide: `1. Đổi biệt danh của bản thân:
   {pn} + [tên muốn đổi]
   VD: {pn} Alice

2. Đổi biệt danh người khác:
   {pn} @[tag] + [tên muốn đổi]
   VD: {pn} @John Smith Alice

3. Kiểm tra người chưa đặt biệt danh:
   {pn} check

4. Đổi biệt danh tất cả thành viên:
   {pn} all + [tên muốn đổi]
   VD: {pn} all Member

5. Xóa thành viên chưa đặt biệt danh:
   {pn} del

6. Nhắc nhở đặt biệt danh:
   {pn} call

7. Thêm kí hiệu đầu tên:
   {pn} add + [kí hiệu]
   VD: {pn} add ⭐

8. Xóa kí hiệu đầu tên:
   {pn} rm

9. Đặt biệt danh cho tv gl (có hạn 3 ngày):
   {pn} gl + [tên]
   VD: {pn} gl Player

10. Đặt biệt danh có hạn cho người khác:
    {pn} gl @[tag] + [tên]
    VD: {pn} gl @John Smith Player`,
  cd: 5,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { client, event, args, userData, threadData, main, commandName, reply } = ctx;
    const { threadID, messageReply, senderID, mentions, type, participantIDs } = event;
    console.log(event)
    const read = await fs.readFile(setn, "utf-8");
    let Data: SetNameEntry[] = read ? JSON.parse(read) : [];
    let threadEntry = Data.find((entry) => entry.threadID === threadID);

    const info = (await threadData.get(threadID))?.threadInfo;
    const botID = client.getCurrentUserID();
    const isBotAdmin = info?.adminIDs?.some((a: any) => a.id === botID);

    const getName = async (uid: string): Promise<string> => {
      try {
        const getNameFunc = userData.getName as ((uid: string) => Promise<string | null | undefined>) | undefined;
        return getNameFunc ? (await getNameFunc(uid)) || "Người dùng" : "Người dùng";
      } catch {
        return "Người dùng";
      }
    };

    const subCommand = (args[0] || "").toLowerCase();

    switch (subCommand) {
      case "call": {
        if (!info?.adminIDs?.some((item: any) => item.id === senderID)) {
          await reply("⚠️ Bạn không đủ quyền hạn");
          return;
        }

        const dataNickName = info?.nicknames || {};
        const objKeys = Object.keys(dataNickName);
        const notFoundIds = (participantIDs || []).filter((id) => !objKeys.includes(id));

        const m: Array<{ tag: string; id: string }> = [];
        let tag = "";

        for (let i = 0; i < notFoundIds.length; i++) {
          const id = notFoundIds[i];
          if (!id) continue;
          const name = await getName(id);
          m.push({ tag: name, id });
          tag += `${i + 1}. @${name}\n`;
        }

        const bd = "📣 Vui lòng setname để mọi người nhận biết bạn dễ dàng hơn";
        const message = { body: `${bd}\n\n${tag}`, mentions: m };
        await reply(message);
        return;
      }

      case "del": {
        if (!info?.adminIDs?.some((admin: any) => admin.id === senderID)) {
          await reply("⚠️ Chỉ quản trị viên mới có thể sử dụng");
          return;
        }

        if (!isBotAdmin) {
          await reply("⚠️ Vui lòng cấp quyền Quản trị viên cho bot để xóa thành viên.");
          return;
        }

        const dataNickName = info?.nicknames || {};
        const objKeys = Object.keys(dataNickName);
        const notFoundIds = (participantIDs || []).filter((id) => !objKeys.includes(id));

        for (const id of notFoundIds) {
          try {
            await client.removeUserFromGroup(id, threadID);
          } catch {

          }
        }

        await reply("✅ Đã xóa thành công những thành viên không setname");
        return;
      }

      case "check": {
        const dataNickName = info?.nicknames || {};
        const objKeys = Object.keys(dataNickName);
        const notFoundIds = (participantIDs || []).filter((id) => !objKeys.includes(id));

        let msg = "📝 Danh sách các người dùng chưa setname:\n";
        let num = 1;

        for (const id of notFoundIds) {
          const name = await getName(id);
          msg += `\n${num++}. ${name}`;
        }

        msg += `\n\n📌 Thả cảm xúc vào tin nhắn này để kick những người không setname ra khỏi nhóm`;

        await reply(msg, (error: any, infoMsg: any) => {
          if (error) return;
          main.onReact.set(infoMsg.messageID, {
            commandName,
            messageID: infoMsg.messageID,
            author: event.senderID,
            abc: notFoundIds,
          } as any);
        });

        return;
      }

      case "help": {
        await reply(
          `1. "setname + name"\n2. "setname @tag + name"\n3. "setname all + name"\n4. "setname check"\n5. "setname del"\n6. "setname add + kí hiệu"\n7. "setname rm"\n8. "setname call"\n9. "setname gl + name"\n10. "setname gl @tag + name"`
        );
        return;
      }

      case "all": {
        if (!isBotAdmin) {
          await reply("⚠️ Vui lòng cấp quyền Quản trị viên cho bot để đổi biệt danh.");
          return;
        }

        try {
          const name = String(event.body).split("all")[1]?.trim() || "";

          for (const i of participantIDs || []) {
            try {
              await (client as any).changeNickname(name, threadID, i);
            } catch {

            }
            await delay(250);
          }

          await reply("✅ Đã đổi biệt danh thành công cho tất cả thành viên");
          return;
        } catch (e) {
          return;
        }
      }

      case "add": {
        const content = args.slice(1).join(" ").trim();

        if (threadEntry) {
          threadEntry.nameUser = content;
        } else {
          Data.push({ threadID, nameUser: content });
        }

        await fs.writeFile(setn, JSON.stringify(Data, null, 4), "utf-8");
        await reply("🌟 Đã thêm kí hiệu thành công!\nKí hiệu: " + content);
        return;
      }

      case "rm": {
        if (threadEntry) {
          Data = Data.filter((entry) => entry.threadID !== threadID);
          await fs.writeFile(setn, JSON.stringify(Data, null, 4), "utf-8");
          await reply("✅ Đã xóa kí hiệu nhóm!");
          return;
        } else {
          await reply("🚫 Nhóm chưa có kí hiệu!");
          return;
        }
      }

      case "gl": {
        if (!isBotAdmin) {
          await reply("⚠️ Vui lòng cấp quyền Quản trị viên cho bot để đổi biệt danh.");
          return;
        }

        const suffix = fmtDateDDMM(addDays(new Date(), 3));
        const prefix = threadEntry ? threadEntry.nameUser : "";

        const sendDone = async (whoName: string, finalName: string) => {
          await reply(`✅ GL: Đã đổi tên của ${whoName} thành ${finalName}`, (err: any, infoMsg: any) => {
            if (!err && infoMsg?.messageID) setTimeout(() => client.unsendMessage(infoMsg.messageID, threadID), 60000);
          });
        };

        if (type === "message_reply" && messageReply?.senderID) {
          const base =
            args.slice(1).join(" ").trim() || (await getName(String(messageReply.senderID)));
          const finalName = buildNick(prefix, base, suffix);

          if (finalName.length > 50) {
            await reply("Tên quá dài");
            return;
          }

          const who = await getName(String(messageReply.senderID));

          (client as any).changeNickname(finalName, threadID, String(messageReply.senderID), async (err: any) => {
            if (err) {
              await reply("❎ Không thể đổi tên");
              return;
            }
            await sendDone(who, finalName);
          });
          return;
        }

        if (mentions && Object.keys(mentions).length > 0) {
          const mention = Object.keys(mentions)[0];
          if (!mention) return;
          const who = await getName(mention);
          const base = args.slice(1).join(" ").replace(mentions[mention] || "", "").trim() || who;
          const finalName = buildNick(prefix, base, suffix);

          if (finalName.length > 50) {
            await reply("Tên quá dài");
            return;
          }

          (client as any).changeNickname(finalName, threadID, mention, async (err: any) => {
            if (err) {
              await reply("❎ Không thể đổi tên");
              return;
            }
            await sendDone(who, finalName);
          });
          return;
        }

        const selfBase = args.slice(1).join(" ").trim() || (await getName(String(senderID)));
        const selfFinal = buildNick(prefix, selfBase, suffix);

        if (selfFinal.length > 50) {
          await reply("Tên quá dài");
          return;
        }

        (client as any).changeNickname(selfFinal, threadID, String(senderID), async (err: any) => {
          if (err) {
            await reply("❎ Không thể đổi tên");
            return;
          }
          await reply(`✅ GL: Đã đổi tên của bạn thành ${selfFinal}`, (e: any, infoMsg: any) => {
            if (!e && infoMsg?.messageID) setTimeout(() => (client as any).unsendMessage(infoMsg.messageID, threadID), 60000);
          });
        });
        return;
      }
    }

    if (!isBotAdmin) {
      await reply("⚠️ Vui lòng cấp quyền Quản trị viên cho bot để đổi biệt danh.");
      return;
    }

    const delayUnsend = 60;

    if (threadEntry) {
      if (type === "message_reply") {
        const name = args.join(" ").trim();

        if (name.length > 50) {
          await reply("Tên quá dài");
          return;
        }

        const name2 = await getName(String(messageReply?.senderID || ""));
        const finalName = buildNick(threadEntry.nameUser, name, "");

        (client as any).changeNickname(finalName, threadID, String(messageReply?.senderID || ""), (err: any) => {
          if (!err) {
            reply(
              `✅ Đã đổi tên của ${name2} thành ${name || "tên gốc"}`,
              (error: any, info: any) => {
                if (!error && info?.messageID) setTimeout(() => (client as any).unsendMessage(info.messageID, threadID), delayUnsend * 1000);
              }
            );
          } else {
            reply("❎ Không thể đổi tên");
          }
        });
      } else {
        if (mentions && Object.keys(mentions).length > 0) {
          const mention = Object.keys(mentions)[0];
          if (!mention) return;
          const name2 = await getName(mention);
          const name = args.join(" ").replace(mentions[mention] || "", "").trim();
          const finalName = buildNick(threadEntry.nameUser, name, "");

          (client as any).changeNickname(finalName, threadID, mention, (err: any) => {
            if (!err) {
              reply(
                `✅ Đã đổi tên của ${name2} thành ${name || "tên gốc"}`,
                (error: any, info: any) => {
                  if (!error && info?.messageID)
                    setTimeout(() => (client as any).unsendMessage(info.messageID, threadID), delayUnsend * 1000);
                }
              );
            } else {
              reply("❎ Không thể đổi tên");
            }
          });
        } else {
          const name = args.join(" ").trim();

          if (name.length > 50) {
            await reply("Tên quá dài");
            return;
          }

          const finalName = buildNick(threadEntry.nameUser, name, "");

          (client as any).changeNickname(finalName, threadID, String(senderID), (err: any) => {
            if (!err) {
              reply(
                `✅ Đã đổi tên của bạn thành ${name || "tên gốc"}`,
                (error: any, info: any) => {
                  if (!error && info?.messageID)
                    setTimeout(() => (client as any).unsendMessage(info.messageID, threadID), delayUnsend * 1000);
                }
              );
            } else {
              reply("❎ Không thể đổi tên");
            }
          });
        }
      }
    } else {
      if (type === "message_reply") {
        const name = args.join(" ").trim();

        if (name.length > 50) {
          await reply("Tên quá dài");
          return;
        }

        const name2 = await getName(String(messageReply?.senderID || ""));

        (client as any).changeNickname(name, threadID, String(messageReply?.senderID || ""), (err: any) => {
          if (!err) {
            reply(
              `✅ Đã đổi tên của ${name2} thành ${name || "tên gốc"}`,
              (error: any, info: any) => {
                if (!error && info?.messageID) setTimeout(() => (client as any).unsendMessage(info.messageID, threadID), delayUnsend * 1000);
              }
            );
          } else {
            reply("❎ Không thể đổi tên");
          }
        });
      } else {
        if (mentions && Object.keys(mentions).length > 0) {
          const mention = Object.keys(mentions)[0];
          if (!mention) return;
          const name2 = await getName(mention);
          const name = args.join(" ").replace(mentions[mention] || "", "").trim();

          (client as any).changeNickname(name, threadID, mention, (err: any) => {
            if (!err) {
              reply(
                `✅ Đã đổi tên của ${name2} thành ${name || "tên gốc"}`,
                (error: any, info: any) => {
                  if (!error && info?.messageID) setTimeout(() => (client as any).unsendMessage(info.messageID, threadID), delayUnsend * 1000);
                }
              );
            } else {
              reply("❎ Không thể đổi tên");
            }
          });
        } else {
          const name = args.join(" ").trim();

          if (name.length > 50) {
            await reply("Tên quá dài");
            return;
          }

          (client as any).changeNickname(name, threadID, String(senderID), (err: any) => {
            if (!err) {
              reply(
                `✅ Đã đổi tên của bạn thành ${name || "tên gốc"}`,
                (error: any, info: any) => {
                  if (!error && info?.messageID) setTimeout(() => (client as any).unsendMessage(info.messageID, threadID), delayUnsend * 1000);
                }
              );
            } else {
              reply("❎ Không thể đổi tên");
            }
          });
        }
      }
    }
  },

  onReact: async (ctx: CommandOnReactContext) => {
    const { client, event, Reaction, reply } = ctx;

    const reactData = Reaction as { author?: string; abc?: string[] };
    if (event.userID !== reactData.author) return;

    if (Array.isArray(reactData.abc) && reactData.abc.length > 0) {
      let errorMessage = "";
      let successMessage = `✅ Đã xóa thành công ${reactData.abc.length} thành viên không set name`;
      let errorOccurred = false;

      for (let i = 0; i < reactData.abc.length; i++) {
        const userID = reactData.abc[i];
        if (!userID) continue;
        try {
          await client.removeUserFromGroup(userID, event.threadID);
        } catch (error) {
          errorOccurred = true;
          errorMessage += `⚠️ Lỗi khi xóa ${userID} từ nhóm`;
        }
      }

      await reply(errorOccurred ? errorMessage : successMessage);
    } else {
      await reply("Không có ai!");
    }
  },
};

export default setnameCommand;
