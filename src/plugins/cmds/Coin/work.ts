import type { Command, CommandOnCallContext, CommandOnLoadContext } from "@types";
import fs from "fs";
import moment from "moment-timezone";
import path from "path";
import { storagePath } from "../../../core/storagePath";

const jobsFilePath = storagePath("other", "working.json");
const cooldown = 300000;

const formatCurrency = (amount: number | bigint | null | undefined): string => {
  if (amount === null || amount === undefined) return "";
  const bigIntAmount = typeof amount === "bigint" ? amount : BigInt(amount);
  const strAmount = bigIntAmount.toString();
  const addThou = (numStr: string) => numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return addThou(strAmount) + " VNĐ";
};

async function onLoad(_ctx: CommandOnLoadContext): Promise<void> {
  if (!fs.existsSync(jobsFilePath)) {
    const dir = path.dirname(jobsFilePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(jobsFilePath, JSON.stringify([], null, 2), "utf-8");
  }
}

async function onCall(ctx: CommandOnCallContext): Promise<void> {
  const { client, event, config, userData, args } = ctx;
  const { senderID, threadID, messageID } = event;

  let userDat = await userData.get(senderID);
  if (!userDat) {
    await client.sendMessage("❎ Không tìm thấy thông tin người dùng", threadID, messageID);
    return;
  }
  if (!userDat.data || typeof userDat.data !== "object") {
    userDat.data = {};
  }

  let lastWorkTime = (userDat.data as any).lastWorkTime || 0;

  switch (args[0]) {
    case "add": {
      const isOwner = Array.isArray(config.OWNER) ? config.OWNER.includes(senderID) : String(config.OWNER) === String(senderID);
      if (!config.OWNER || !isOwner) {
        await client.sendMessage("❎ Bạn không có quyền thêm công việc mới", threadID, messageID);
        return;
      }

      const newJob = args.slice(1).join(" ");
      if (!/{name}(.+?)\{money\}/.test(newJob)) {
        await client.sendMessage(
          "❎ Định dạng công việc không hợp lệ. Vui lòng sử dụng định dạng '{name} đã làm công việc gì đó, kiếm được {money}'",
          threadID,
          messageID
        );
        return;
      }

      let jobs: string[] = [];
      try {
        const fileContent = fs.readFileSync(jobsFilePath, "utf-8");
        jobs = JSON.parse(fileContent || "[]");
      } catch {
        jobs = [];
      }

      const jobExists = jobs.some((job) => job === newJob);
      if (jobExists) {
        await client.sendMessage("⚠️ Công việc này đã tồn tại trong danh sách.", threadID, messageID);
        return;
      }

      jobs.push(newJob);
      fs.writeFileSync(jobsFilePath, JSON.stringify(jobs, null, 2), "utf-8");
      await client.sendMessage(`✅ Đã thêm công việc mới: ${newJob}`, threadID, messageID);
      return;
    }

    case "list": {
      const isOwner = Array.isArray(config.OWNER) ? config.OWNER.includes(senderID) : String(config.OWNER) === String(senderID);
      if (!config.OWNER || !isOwner) {
        await client.sendMessage("❎ Bạn không có quyền xem danh sách công việc", threadID, messageID);
        return;
      }

      let jobs: string[] = [];
      try {
        const fileContent = fs.readFileSync(jobsFilePath, "utf-8");
        jobs = JSON.parse(fileContent || "[]");
      } catch {
        jobs = [];
      }

      if (jobs.length === 0) {
        await client.sendMessage("⚠️ Chưa có công việc nào trong danh sách.", threadID, messageID);
        return;
      }

      const jobList = jobs.map((job, index) => `${index + 1}. ${job}`).join("\n");
      await client.sendMessage(`📋 Danh sách công việc:\n${jobList}`, threadID, messageID);
      return;
    }

    case "remove": {
      const isOwner = Array.isArray(config.OWNER) ? config.OWNER.includes(senderID) : String(config.OWNER) === String(senderID);
      if (!config.OWNER || !isOwner) {
        await client.sendMessage("❎ Bạn không có quyền xóa công việc", threadID, messageID);
        return;
      }

      const index = parseInt(args[1] || "0") - 1;

      let jobs: string[] = [];
      try {
        const fileContent = fs.readFileSync(jobsFilePath, "utf-8");
        jobs = JSON.parse(fileContent || "[]");
      } catch {
        jobs = [];
      }

      if (isNaN(index) || index < 0 || index >= jobs.length) {
        await client.sendMessage("❎ Số thứ tự công việc không hợp lệ", threadID, messageID);
        return;
      }

      const removedJob = jobs.splice(index, 1)[0];
      fs.writeFileSync(jobsFilePath, JSON.stringify(jobs, null, 2), "utf-8");
      await client.sendMessage(`✅ Đã xóa công việc: ${removedJob}`, threadID, messageID);
      return;
    }

    default: {
      const now = moment().valueOf();

      if (now - lastWorkTime < cooldown) {
        const remainingTimeMs = cooldown - (now - lastWorkTime);
        const remainingMinutes = Math.floor(remainingTimeMs / 60000);
        const remainingSeconds = Math.ceil((remainingTimeMs % 60000) / 1000);

        await client.sendMessage(
          `⏳ Bạn cần chờ thêm ${remainingMinutes} phút ${remainingSeconds} giây trước khi tiếp tục làm việc`,
          threadID,
          messageID
        );
        return;
      }

      try {
        (userDat.data as any).lastWorkTime = now;
        await userData.update(senderID, userDat);

        let jobs: string[] = [];
        try {
          const fileContent = fs.readFileSync(jobsFilePath, "utf-8");
          jobs = JSON.parse(fileContent || "[]");
        } catch {
          jobs = [];
        }

        if (jobs.length === 0) {
          await client.sendMessage("⚠️ Chưa có công việc nào trong hệ thống. Vui lòng liên hệ admin để thêm công việc.", threadID, messageID);
          return;
        }

        const getName = userData.getName as ((id: string) => Promise<string | undefined>) | undefined;
        const userName = getName ? (await getName(senderID)) || "Bạn" : "Bạn";
        const randomJob = jobs[Math.floor(Math.random() * jobs.length)];

        if (!randomJob) {
          await client.sendMessage("⚠️ Chưa có công việc nào trong hệ thống. Vui lòng liên hệ admin để thêm công việc.", threadID, messageID);
          return;
        }

        const minMoney = 5000;
        const maxMoney = 100000;
        const money = Math.floor(Math.random() * (maxMoney - minMoney + 1)) + minMoney;

        const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (addMoney) {
          await addMoney(senderID, BigInt(money));
        }

        const formattedMoney = formatCurrency(money);
        const resultMessage = randomJob.replace("{name}", userName).replace("{money}", formattedMoney);

        await client.sendMessage(resultMessage, threadID, messageID);
      } catch (e: any) {
        console.error("Error in work command:", e);
        await client.sendMessage("❎ Đã xảy ra lỗi khi thực hiện công việc", threadID, messageID);
      }
    }
  }
}

const workCommand: Command = {
  name: "work",
  alias: ["work"],
  version: "1.0.0",
  role: 0,
  desc: "Lệnh làm việc để kiếm tiền",
  guide:
    "{pn} → Làm việc để kiếm tiền\n" +
    "    {pn} add → Thêm công việc mới (Chỉ admin)\n" +
    "    {pn} list → Xem danh sách công việc\n" +
    "    {pn} remove <số thứ tự> → Xóa công việc (Chỉ admin)\n" +
    "    Định dạng: {name} đã làm công việc gì đó, kiếm được {money}",
  cd: 5,
  prefix: true,
  onLoad,
  onCall,
};

export default workCommand;
