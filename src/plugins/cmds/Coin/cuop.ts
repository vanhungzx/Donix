import type { Command, CommandOnCallContext } from "@types";

const command: Command = {
  name: "cuop",
  version: "1.2.0",
  alias: ["robbery"],
  role: 0,
  desc: "Cướp tiền từ người dùng khác",
  guide: "{pn} @tag/[reply]: Cướp tiền từ người dùng\n- Cần 1,000 VNĐ để thực hiện",
  cd: 10,
  prefix: true,
  onCall: async ({ config, event, userData, reply, threadData }: CommandOnCallContext) => {
    const { senderID, mentions, messageReply } = event;

    const formatCurrency = (amount: bigint | number | string | null | undefined): string => {
      if (!amount && amount !== 0) return "";
      const bigIntAmount = typeof amount === "bigint" ? amount : BigInt(amount);
      return bigIntAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " VNĐ";
    };

    const user = await userData.get(senderID);
    const userDataObj = user?.data && typeof user.data === 'object' ? user.data as { cuop?: { jail?: { time?: number } } } : undefined;
    const jailStatus = userDataObj?.cuop?.jail;
    if (jailStatus && typeof jailStatus.time === 'number' && jailStatus.time > Date.now()) {
      const timeLeft = Math.ceil((jailStatus.time - Date.now()) / 60000);
      await reply(`🔒 Bạn đang ở tù! Còn ${timeLeft} phút nữa mới được ra!\nHãy ngoan ngoãn ngồi suy nghĩ về hành động của mình 😏`);
      return;
    }

    let targetID: string;
    let targetName: string;
    if (messageReply) {
      targetID = messageReply.senderID || "";
      const getName = userData.getName as ((sid: string) => Promise<string | undefined>) | undefined;
      targetName = getName ? await getName(targetID) || "" : "";
    } else if (Object.keys(mentions || {}).length === 1) {
      const mentionKeys = Object.keys(mentions || {});
      const firstKey = mentionKeys[0];
      if (!firstKey) {
        await reply("❌ Không tìm thấy người dùng được đề cập!");
        return;
      }
      targetID = firstKey;
      const mentionValue = mentions && typeof mentions === 'object' && targetID in mentions
        ? mentions[targetID]
        : undefined;
      targetName = typeof mentionValue === 'string' ? mentionValue.replace(/@/g, "") : "";
    } else {
      const thread = await threadData.get(event.threadID);
      const threadInfo = thread?.threadInfo;
      const participants = threadInfo && typeof threadInfo === 'object' && 'participantIDs' in threadInfo && Array.isArray(threadInfo.participantIDs)
        ? threadInfo.participantIDs.filter((id): id is string => typeof id === 'string' && id !== senderID)
        : [];
      if (participants.length === 0) {
        await reply("❌ Không có ai khác trong nhóm để cướp!");
        return;
      }
      const randomTarget = participants[Math.floor(Math.random() * participants.length)];
      if (!randomTarget) {
        await reply("❌ Không thể chọn mục tiêu ngẫu nhiên!");
        return;
      }
      targetID = randomTarget;
      const getName = userData.getName as ((sid: string) => Promise<string | null | undefined>) | undefined;
      targetName = getName ? await getName(targetID) || "" : "";
      await reply(`🎯 Mục tiêu ngẫu nhiên: ${targetName}\n"Hehe, người này trông có vẻ dễ ăn đây!"`);
    }

    const ownerList = Array.isArray(config.OWNER) ? config.OWNER : (typeof config.OWNER === 'string' ? [config.OWNER] : []);
    if (ownerList.includes(targetID)) {
      await reply("❌ Không thể cướp Owner!\nMuốn ăn đòn hả? 😠");
      return;
    }

    if (targetID === senderID) {
      await reply("❌ Không thể cướp chính mình!\nBạn định tự cướp túi mình à? 🤪");
      return;
    }

    const robberMoney: number = await userData.checkMoney(senderID);
    const targetMoney: number = await userData.checkMoney(targetID);

    if (robberMoney < 1000) {
      await reply("💸 Bạn cần ít nhất 1,000 VNĐ để thực hiện!\nĐi làm thêm đi rồi tính chuyện cướp bóc 😪");
      return;
    }
    if (targetMoney < 1000) {
      await reply(`💸 ${targetName} quá nghèo để cướp!\nHãy tìm mục tiêu khác giàu hơn 🎯`);
      return;
    }

    let successRate = 0.4;
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 4) {
      successRate += 0.1;
      await reply("🌙 Trời tối quá, cơ hội thành công cao hơn!");
    }

    interface EventEffect {
      chance: number;
      bonus?: number;
      penalty?: number;
      message: string;
    }

    const events: EventEffect[] = [
      { chance: 0.1, bonus: 0.1, message: "🌧️ Trời mưa to, ít người qua lại!" },
      { chance: 0.1, penalty: 0.1, message: "👮 Cảnh sát đang tuần tra nhiều!" },
      { chance: 0.05, bonus: 0.15, message: "🎭 Bạn tìm được mặt nạ, khó bị nhận dạng hơn!" }
    ];

    for (const e of events) {
      if (Math.random() < e.chance) {
        if (typeof e.bonus === "number") successRate += e.bonus;
        else if (typeof e.penalty === "number") successRate -= e.penalty;
        await reply(e.message);
      }
    }

    if (Math.random() < 0.2) {
      const currentBalance = await userData.checkMoney(senderID);
      const fine = BigInt(Math.floor(currentBalance * 0.3));
      const jailTime = 10 * 60 * 1000;

      try {
        await userData.delMoney(senderID, fine);
        await userData.update(senderID, { data: { cuop: { jail: { time: Date.now() + jailTime } } } });

        const jailMessages = [
          "👮 CÔNG AN! ĐỨNG IM!\n",
          "🚔 Chạy đâu cho thoát!\n",
          "⚖️ Tội cướp bóc, bắt tạm giam!\n"
        ];

        await reply(
          jailMessages[Math.floor(Math.random() * jailMessages.length)] +
          `Phạt ${formatCurrency(fine)} và ngồi tù 10 phút!`
        );
      } catch (error: any) {
        // Nếu không đủ tiền để phạt, vẫn bắt vào tù nhưng không phạt tiền
        await userData.update(senderID, { data: { cuop: { jail: { time: Date.now() + jailTime } } } });
        await reply(
          "👮 CÔNG AN! ĐỨNG IM!\n" +
          "Bạn không có đủ tiền để nộp phạt, nhưng vẫn phải ngồi tù 10 phút!"
        );
      }
      return;
    }

    const success = Math.random() < successRate;

    // Lấy exp hiện tại của người cướp, mặc định 0 nếu chưa có
    const currentExp =
      user && typeof (user as any).exp !== "undefined"
        ? Number((user as any).exp || 0)
        : 0;

    if (success) {
      const stolenAmount = BigInt(Math.floor(targetMoney * 0.3));
      try {
        await userData.addMoney(senderID, stolenAmount);
        await userData.delMoney(targetID, stolenAmount);
        // Cộng thêm 30 exp, không ghi đè exp hiện tại
        await userData.update(senderID, { exp: currentExp + 30 });

        const successMessages = [
          "🎭 Phi vụ hoàn hảo!",
          "💰 Dễ như ăn kẹo!",
          "🦹 Không ai nhìn thấy gì cả!"
        ];

        await reply(
          `${successMessages[Math.floor(Math.random() * successMessages.length)]}\n` +
          `Chiếm được ${formatCurrency(stolenAmount)} từ ${targetName}!\n` +
          "Kinh nghiệm: +30XP"
        );
      } catch (error: any) {
        // Nếu không thể lấy tiền từ mục tiêu (ví dụ: mục tiêu đã hết tiền), vẫn cộng exp
        await userData.update(senderID, { exp: currentExp + 30 });
        await reply(
          "🎭 Phi vụ thành công nhưng mục tiêu không còn tiền!\n" +
          "Kinh nghiệm: +30XP"
        );
      }
      return;
    } else {
      // Kiểm tra số dư hiện tại trước khi phạt
      const currentBalance = await userData.checkMoney(senderID);
      const penalty = BigInt(Math.floor(currentBalance * 0.2));

      try {
        await userData.delMoney(senderID, penalty);
        // Cộng thêm 10 exp, không ghi đè exp hiện tại
        await userData.update(senderID, { exp: currentExp + 10 });

        const failMessages = [
          "💀 Xui quá, bị phát hiện!",
          "😱 Chạy mau, có người gọi công an!",
          "😅 Trượt chân té, bị bắt tại trận!"
        ];

        await reply(
          `${failMessages[Math.floor(Math.random() * failMessages.length)]}\n` +
          `Mất ${formatCurrency(penalty)} tiền phạt!\n` +
          "Kinh nghiệm: +10XP"
        );
      } catch (error: any) {
        // Nếu không đủ tiền để phạt, vẫn cộng exp nhưng không phạt tiền
        await userData.update(senderID, { exp: currentExp + 10 });
        await reply(
          "💀 Xui quá, bị phát hiện!\n" +
          "Bạn không có đủ tiền để nộp phạt, nhưng vẫn nhận được kinh nghiệm!\n" +
          "Kinh nghiệm: +10XP"
        );
      }
      return;
    }
  }
};

export default command;
