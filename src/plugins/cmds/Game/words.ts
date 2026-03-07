"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnChatContext
} from "@types";
import fs from "fs-extra";
import path from "path";

const entryFee = 5000; 
const minHintFee = 10000; 
const maxHintFee = 50000; 
const maxReward = 200000; 
const minReward = 50000; 
const maxPoints = 15; 
const minPoints = 5; 
const answerPenalty = 5000; 
const hintPenaltyMultiplier = 20000; 
const hintPenaltyMultiplierPoints = 5; 
const timeLimit = 300000; 

interface GameData {
  originalWord: string;
  scrambledWord: string;
  messageID: string;
  userID: string;
  hints: number;
  maxHints: number;
  revealedLetters: Set<string>;
  attempts: number;
  startTime: number;
}

interface LeaderboardEntry {
  userID: string;
  name: string;
  reward: number;
  points: number;
}

const shuffle = (word: string): string => {
  let arr = word.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as string, arr[i] as string];
  }
  return arr.join("");
};

const wordsFilePath = path.resolve(
  process.cwd(),
  "src/storage/game/words/words.json"
);
const gameDataPath = path.resolve(process.cwd(), "src/storage/game/words");
const leaderboardPath = path.join(gameDataPath, "leaderboard.json");

let wordsCache: string[] | null = null;
let leaderboardCache: LeaderboardEntry[] | null = null;
let wordsCacheTime: number = 0;
let leaderboardCacheTime: number = 0;
const CACHE_TTL = 60 * 1000; 


const writeTimers: Record<string, NodeJS.Timeout> = {};
const DEBOUNCE_DELAY = 2000; 

const readFileCached = async <T>(
  filePath: string,
  cache: T | null,
  cacheTime: number
): Promise<{ data: T; cacheTime: number }> => {
  const now = Date.now();
  
  if (cache && now - cacheTime < CACHE_TTL) {
    return { data: cache, cacheTime };
  }
  let result: T;
  try {
    const data = await fs.readFile(filePath, "utf8");
    result = JSON.parse(data) as T;
  } catch (error) {
    result = [] as unknown as T;
  }
  return { data: result, cacheTime: now };
};

const writeFileCached = async <T>(
  filePath: string,
  data: T,
  _cache: T | null
): Promise<void> => {
  
  if (writeTimers[filePath]) {
    clearTimeout(writeTimers[filePath]);
  }

  
  writeTimers[filePath] = setTimeout(async () => {
    try {
      
      await fs.writeFile(filePath, JSON.stringify(data), "utf8");
      delete writeTimers[filePath];
    } catch (error) {
      console.error(`Error writing ${filePath}:`, error);
    }
  }, DEBOUNCE_DELAY);
};

const readWords = async (): Promise<string[]> => {
  const result = await readFileCached<string[]>(wordsFilePath, wordsCache, wordsCacheTime);
  wordsCache = result.data;
  wordsCacheTime = result.cacheTime;
  return wordsCache;
};

const writeWords = async (words: string[]): Promise<void> => {
  wordsCache = words;
  wordsCacheTime = Date.now();
  await writeFileCached(wordsFilePath, words, wordsCache);
};

const readLeaderboard = async (): Promise<LeaderboardEntry[]> => {
  const result = await readFileCached<LeaderboardEntry[]>(
    leaderboardPath,
    leaderboardCache,
    leaderboardCacheTime
  );
  leaderboardCache = result.data;
  leaderboardCacheTime = result.cacheTime;
  return leaderboardCache;
};

const writeLeaderboard = async (
  leaderboard: LeaderboardEntry[]
): Promise<void> => {
  leaderboardCache = leaderboard;
  leaderboardCacheTime = Date.now();
  await writeFileCached(leaderboardPath, leaderboard, leaderboardCache);
};

const clearGameData = (threadID: string): void => {
  const donix = global.Donix as any;
  if (donix?.wordsGame) {
    delete donix.wordsGame[threadID];
  }
};

const formatCurrency = (amount: bigint | number | null | undefined): string => {
  if (amount === null || amount === undefined) return "";
  const bigIntAmount = typeof amount === "bigint" ? amount : BigInt(amount);
  const strAmount = bigIntAmount.toString();
  const addThou = (numStr: string): string =>
    numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return addThou(strAmount) + " VNĐ";
};

const getLeaderboard = async (): Promise<string> => {
  const leaderboard = await readLeaderboard();
  if (leaderboard.length === 0) {
    return "🏆 Bảng xếp hạng hiện đang trống!";
  }

  const currentTime = new Date().toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });

  let leaderboardString = `[ Bảng Xếp Hạng Words Cramble ]\n\n`;

  leaderboardString += leaderboard
    .map((user, index) => {
      let medal: string;
      switch (index) {
        case 0:
          medal = "🥇.";
          break;
        case 1:
          medal = "🥈.";
          break;
        case 2:
          medal = "🥉.";
          break;
        default:
          medal = `${index + 1}.`;
          break;
      }
      return `${medal} ${user.name}\n🔢 Tổng điểm: ${user.points}\n💰 Tổng số tiền đã nhận: ${formatCurrency(user.reward)}`;
    })
    .join("\n\n");

  leaderboardString += `\n\n⏰ Được cập nhật lúc: ${currentTime}`;
  return leaderboardString;
};

const wordsCommand: Command = {
  name: "words",
  alias: ["words"],
  version: "1.0.0",
  role: 0,
  desc: "Giải mã từ vựng tiếng Việt!",
  guide:
    "{pn} - Bắt đầu trò chơi giải mã từ\n" +
    "{pn} top/lb - Xem bảng xếp hạng\n" +
    "{pn} add [từ1, từ2,...] - Thêm từ mới vào trò chơi (Admin)\n" +
    "{pn} del [từ1, từ2,...] - Xóa từ khỏi trò chơi (Admin)\n" +
    "{pn} check - Kiểm tra số lượng từ hiện có (Admin)\n\n" +
    "Trong trò chơi:\n" +
    "- Gõ 'gợi ý' hoặc 'hint' để nhận gợi ý\n" +
    "- Gõ 'status' để xem trạng thái trò chơi\n" +
    "- Gõ 'end' hoặc 'kết thúc' để kết thúc trò chơi\n" +
    "- Gõ 'bỏ qua' hoặc 'skip' để bỏ qua từ hiện tại",
  cd: 5,
  prefix: true,

  onLoad: async () => {
    try {
      await fs.ensureDir(gameDataPath);
      await readWords();
      await readLeaderboard();
    } catch (error) {
      console.error("Error initializing game data:", error);
    }
  },

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const {
      event,
      userData,
      config,
      reply,
      args,
    } = ctx;

    const { senderID, threadID } = event;

    try {
      switch (args[0]) {
        case "top":
        case "lb":
          await reply(await getLeaderboard());
          break;

        case "add": {
          const isOwner = Array.isArray(config.OWNER) ? config.OWNER.includes(senderID.toString()) : String(config.OWNER) === String(senderID);
          if (!isOwner) {
            await reply(`❎ Bạn không có quyền thêm từ mới`);
            return;
          }

          const newWords = args
            .slice(1)
            .join(" ")
            .split(",")
            .map((word) => word.trim());

          if (newWords.length > 0) {
            const wordsadd = await readWords();
            const addedWords: string[] = [];
            const existingWords: string[] = [];

            newWords.forEach((newWord) => {
              if (wordsadd.includes(newWord)) {
                existingWords.push(newWord);
              } else {
                wordsadd.push(newWord);
                addedWords.push(newWord);
              }
            });

            await writeWords(wordsadd);

            let replyMessage = `✅ Đã thêm từ mới: ${addedWords.join(", ")}`;
            if (existingWords.length > 0) {
              replyMessage += `\n❎ Các từ đã tồn tại: ${existingWords.join(", ")}`;
            }
            await reply(replyMessage);
          } else {
            await reply(`❎ Bạn cần nhập một hoặc nhiều từ mới để thêm`);
          }
          break;
        }

        case "del": {
          const isOwner = Array.isArray(config.OWNER) ? config.OWNER.includes(senderID.toString()) : String(config.OWNER) === String(senderID);
          if (!isOwner) {
            await reply(`❎ Bạn không có quyền xóa từ`);
            return;
          }

          const deleteWords = args
            .slice(1)
            .join(" ")
            .split(",")
            .map((word) => word.trim());

          if (deleteWords.length > 0) {
            if (deleteWords.includes("all")) {
              await writeWords([]);
              await reply(`✅ Đã xóa toàn bộ từ`);
              return;
            }

            const wordsdel = await readWords();
            const remainingWords = wordsdel.filter(
              (word) => !deleteWords.includes(word)
            );

            await writeWords(remainingWords);

            let replyMessage = `✅ Đã xóa các từ: ${deleteWords.join(", ")}`;
            if (remainingWords.length === wordsdel.length) {
              replyMessage += `\n❎ Không tìm thấy các từ để xóa: ${deleteWords.join(", ")}`;
            }
            await reply(replyMessage);
          } else {
            await reply(`❎ Bạn cần nhập một hoặc nhiều từ để xóa`);
          }
          break;
        }

        case "check": {
          const isOwner = Array.isArray(config.OWNER) ? config.OWNER.includes(senderID.toString()) : String(config.OWNER) === String(senderID);
          if (!isOwner) {
            await reply(`❎ Bạn không có quyền kiểm tra`);
            return;
          }

          const wordcount = await readWords();
          await reply(`📄 Hiện có ${wordcount.length} từ trong danh sách`);
          break;
        }

        default:
          const donix = global.Donix as any;
          if (donix?.wordsGame?.[threadID]) {
            await reply(
              `❎ Hiện tại đang có một trò chơi đang diễn ra. Vui lòng hoàn thành trò chơi trước khi bắt đầu trò chơi mới!`
            );
            return;
          }

          const userDat = await userData.get(senderID);
          if (!userDat) {
            await reply(`❎ Không thể lấy thông tin người dùng`);
            return;
          }
          clearGameData(threadID);

          const userMoney = typeof userDat.money === "bigint"
            ? userDat.money
            : BigInt(userDat.money || 0);

          if (userMoney < BigInt(entryFee)) {
            await reply(
              `❎ Bạn không có đủ tiền để tham gia trò chơi. Phí tham gia là ${formatCurrency(entryFee)}`
            );
            return;
          }

          const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
          if (delMoney) {
            await delMoney(senderID, BigInt(entryFee));
          }

          const words = await readWords();
          if (words.length === 0) {
            await reply(
              `❎ Hiện tại không có từ nào để chơi. Vui lòng thử lại sau`
            );
            return;
          }

          const word = words[Math.floor(Math.random() * words.length)];
          const wordLength = word?.length || 0;
          const scrambled = shuffle(word || "").toUpperCase().split("").join(" ");

          await reply(
            `🔠 Giải mã từ vựng tiếng Việt!\n🖊️ Hãy giải mã từ (${wordLength} chữ): ${scrambled}\n💡 Để nhận gợi ý, nhập "gợi ý", phí từ ${minHintFee.toLocaleString()}$ - ${maxHintFee.toLocaleString()}$ cho mỗi gợi ý\n⏳ Bạn có thời gian là 5 phút để giải mã từ`,
            async (_err: any, info: any) => {
              if (!donix) (global as any).Donix = {};
              const donixState = global.Donix as any;
              if (!donixState.wordsGame) donixState.wordsGame = {};

              donixState.wordsGame[threadID] = {
                originalWord: word,
                scrambledWord: scrambled,
                messageID: info.messageID,
                userID: senderID,
                hints: 0,
                maxHints: 3,
                revealedLetters: new Set<string>(),
                attempts: 0,
                startTime: Date.now(),
              };

              setTimeout(async () => {
                const donixState = global.Donix as any;
                if (donixState?.wordsGame?.[threadID]) {
                  const getName = userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
                  const name = getName ? (await getName(senderID)) || "Bạn" : "Bạn";
                  await reply({
                    body: `⏳ Hết thời gian! ${name} đã không kịp giải mã từ: ${donixState.wordsGame[threadID].originalWord}`,
                    mentions: [
                      {
                        tag: name,
                        id: senderID,
                      },
                    ],
                  });
                  clearGameData(threadID);
                }
              }, timeLimit);
            }
          );
          break;
      }
    } catch (error) {
      console.error("Error during game run:", error);
      await reply(`❎ Đã có lỗi xảy ra, vui lòng thử lại sau`);
    }
  },

  onChat: async (ctx: CommandOnChatContext): Promise<void> => {
    const { event, client, userData, threadData, config, reply, unsend } = ctx;
    const { threadID, body, senderID } = event;

    const donix = global.Donix as any;
    if (!donix?.wordsGame?.[threadID]) return;

    const threadDataResult = await threadData.get(threadID);
    const threadSetting = threadDataResult?.data || {};
    const prefix =
      (threadSetting as any).PREFIX || config.PREFIX || "";

    if (body && body.startsWith(prefix)) return;

    if (!donix?.wordsGame?.[threadID]) return;

    const gameData = donix.wordsGame[threadID];
    if (senderID !== gameData.userID) return;

    try {
      const userDat = await userData.get(senderID);
      if (!userDat) {
        await reply(`❎ Không thể lấy thông tin người dùng`);
        return;
      }
      const userMoney = typeof userDat.money === "bigint"
        ? userDat.money
        : BigInt(userDat.money || 0);

      if (
        body?.toLowerCase().trim() === "gợi ý" ||
        body?.toLowerCase().trim() === "hint"
      ) {
        if (gameData.hints >= gameData.maxHints) {
          await reply(`❎ Bạn đã sử dụng hết số lần gợi ý!`);
          return;
        }

        let hintFee: number;
        let revealCount: number;

        switch (gameData.hints) {
          case 0:
            hintFee = minHintFee;
            revealCount = Math.floor(Math.random() * 3) + 2;
            break;
          case 1:
            hintFee = (minHintFee + maxHintFee) / 2;
            revealCount = Math.floor(Math.random() * 6) + 5;
            break;
          case 2:
            hintFee = maxHintFee;
            revealCount = Math.floor(Math.random() * 7) + 6;
            break;
          default:
            hintFee = maxHintFee;
            revealCount = Math.floor(Math.random() * 7) + 6;
            break;
        }

        if (userMoney < BigInt(hintFee)) {
          await reply(
            `❎ Bạn không có đủ tiền để nhận gợi ý. Phí mỗi gợi ý là ${hintFee.toLocaleString()}$`
          );
          return;
        }

        const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (delMoney) {
          await delMoney(senderID, BigInt(hintFee));
        }

        let wordArr = gameData.originalWord.split("");
        let revealed = "";
        let revealedCount = 0;

        wordArr.forEach((char: string) => {
          if (char === " ") {
            revealed += "  ";
          } else if (
            gameData.revealedLetters.has(char) ||
            (revealedCount < revealCount && Math.random() > 0.5)
          ) {
            gameData.revealedLetters.add(char);
            revealed += `${char} `;
            revealedCount++;
          } else {
            revealed += "_ ";
          }
        });

        gameData.hints++;

        await reply(
          `💡 Gợi ý của bạn: "${revealed.trim()}"\n💰 Đã trừ: ${hintFee.toLocaleString()}$`
        );
      } else if (body?.toLowerCase().trim() === "status") {
        if (gameData) {
          const elapsed = Date.now() - gameData.startTime;
          const remainingTime = Math.max(0, timeLimit - elapsed);
          const minutes = Math.floor(remainingTime / 60000);
          const seconds = Math.floor((remainingTime % 60000) / 1000);
          const formattedTime = `${minutes < 10 ? "0" : ""}${minutes} phút ${seconds < 10 ? "0" : ""}${seconds} giây`;

          await reply(
            `📊 Trạng thái trò chơi:\n\n🔠 Từ xáo trộn: ${gameData.scrambledWord}\n💡 Gợi ý đã dùng: ${gameData.hints}/${gameData.maxHints}\n⏳ Thời gian còn lại: ${formattedTime}\n❓ Số lần thử: ${gameData.attempts}`
          );
        } else {
          await reply(`❎ Hiện tại không có trò chơi nào đang diễn ra`);
        }
        return;
      } else if (
        body?.toLowerCase().trim() === "end" ||
        body?.toLowerCase().trim() === "kết thúc"
      ) {
        if (
          donix?.wordsGame?.[threadID] &&
          senderID === donix.wordsGame[threadID].userID
        ) {
          const getName = userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
          const name = getName ? (await getName(senderID)) || "Bạn" : "Bạn";
          await reply(`🚪 Trò chơi đã được kết thúc bởi ${name}`);
          clearGameData(threadID);
        } else {
          return;
        }
        return;
      } else if (
        body?.toLowerCase().trim() === "bỏ qua" ||
        body?.toLowerCase().trim() === "skip"
      ) {
        try {
          const gameData = donix.wordsGame[threadID];
          if (!gameData) {
            await reply(`❎ Hiện tại không có trò chơi nào đang diễn ra`);
            return;
          }

          const skippedWord = gameData.originalWord;
          clearGameData(threadID);

          const skipFee = Math.ceil(entryFee * 0.05);
          const remainingMoneyData = await userData.get(senderID);
          if (!remainingMoneyData) {
            await reply(`❎ Không thể lấy thông tin người dùng`);
            return;
          }
          const remainingMoney = typeof remainingMoneyData.money === "bigint"
            ? remainingMoneyData.money
            : BigInt(remainingMoneyData.money || 0);

          if (remainingMoney < BigInt(skipFee) || skipFee <= 0) {
            await reply(`❎ Bạn không có đủ tiền để bỏ qua từ này.`);
            return;
          }

          const delMoneySkip = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
          if (delMoneySkip) {
            await delMoneySkip(senderID, BigInt(skipFee));
          }

          await reply(
            `🔄 Bạn đã bỏ qua từ "${skippedWord}", đang tải từ mới, bắt đầu sau 3 giây...`,
            async (_err: any, info: any) => {
              const countdown = ["2", "1", "0"];
              countdown.forEach((_item, index) => {
                setTimeout(() => {
                  client.editMessage(
                    info.messageID,
                    `🔄 Bạn đã bỏ qua từ "${skippedWord}", đang tải từ mới, bắt đầu sau ${2 - index} giây...`
                  );
                }, (index + 1) * 1000);
              });

              setTimeout(async () => {
                try {
                  const words = await readWords();
                  if (words.length === 0) {
                    await reply(
                      `❎ Hiện tại không có từ nào để chơi. Vui lòng thử lại sau`
                    );
                    return;
                  }

                  const word = words[Math.floor(Math.random() * words.length)];
                  const wordLength = word?.length || 0;
                  const scrambled = shuffle(word || "")
                    .toUpperCase()
                    .split("")
                    .join(" ");

                  await reply(
                    `🔠 Giải mã từ vựng tiếng Việt!\n🖊️ Hãy giải mã từ (${wordLength} chữ): ${scrambled}\n💡 Để nhận gợi ý, nhập "gợi ý", phí từ ${formatCurrency(minHintFee)} - ${formatCurrency(maxHintFee)} cho mỗi gợi ý\n⏳ Bạn có thời gian là 5 phút để giải mã từ`,
                    async (err: any, newInfo: any) => {
                      if (err) return;

                      const donixState = global.Donix as any;
                      if (!donixState) (global as any).Donix = {};
                      const donixState2 = global.Donix as any;
                      if (!donixState2.wordsGame) donixState2.wordsGame = {};

                      donixState2.wordsGame[threadID] = {
                        originalWord: word,
                        scrambledWord: scrambled,
                        messageID: newInfo.messageID,
                        userID: senderID,
                        hints: 0,
                        maxHints: 3,
                        revealedLetters: new Set<string>(),
                        attempts: 0,
                        startTime: Date.now(),
                      };

                      setTimeout(async () => {
                        const donixState3 = global.Donix as any;
                        if (donixState3?.wordsGame?.[threadID]) {
                          const getName = userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
                          const name = getName ? (await getName(senderID)) || "Bạn" : "Bạn";
                          await reply({
                            body: `⏳ Hết thời gian! ${name} đã không kịp giải mã từ: ${donixState3.wordsGame[threadID].originalWord}`,
                            mentions: [
                              {
                                tag: name,
                                id: senderID,
                              },
                            ],
                          });
                          clearGameData(threadID);
                        }
                      }, timeLimit);
                    }
                  );

                  if (unsend) {
                    await unsend(info.messageID);
                  }
                } catch (error) {
                  console.error("Error starting new word:", error);
                  await reply(`❎ Đã có lỗi xảy ra, vui lòng thử lại sau`);
                }
              }, 3000);
            }
          );
        } catch (error) {
          console.error("Error when skipping word:", error);
          await reply(`❎ Đã có lỗi xảy ra, vui lòng thử lại sau`);
        }
      } else if (
        body?.toLowerCase().trim() === gameData.originalWord.toLowerCase().trim()
      ) {
        gameData.attempts++;

        const timeTaken = Date.now() - gameData.startTime;

        function calculateReward(attempts: number, _timeTaken: number): number {
          const baseReward = Math.ceil(
            maxReward - ((attempts - 1) * ((maxReward - minReward) / attempts))
          );
          const hintPenalty =
            gameData.hints > 0 ? gameData.hints * hintPenaltyMultiplier : 0;
          const finalReward = Math.max(minReward, baseReward - hintPenalty);
          return Math.max(1, finalReward);
        }

        function calculatePoints(attempts: number, _timeTaken: number): number {
          const basePoints = Math.ceil(
            maxPoints - ((attempts - 1) * ((maxPoints - minPoints) / attempts))
          );
          const hintPenaltyPoints =
            gameData.hints > 0
              ? gameData.hints * hintPenaltyMultiplierPoints
              : 0;
          const finalPoints = Math.max(minPoints, basePoints - hintPenaltyPoints);
          return Math.max(1, finalPoints);
        }

        const reward = calculateReward(gameData.attempts, timeTaken);
        const points = calculatePoints(gameData.attempts, timeTaken);

        const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (addMoney) {
          await addMoney(senderID, BigInt(reward));
        }

        
        const addExp = userData.addExp as ((id: string, amount: number) => Promise<number>) | undefined;
        if (addExp) {
          const gained = Math.max(5, Math.floor(points / 2)); 
          await addExp(senderID, gained);
        }

        const getName = userData.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
        const name = getName ? (await getName(event.senderID)) || "Bạn" : "Bạn";
        let mentions = [
          {
            tag: name,
            id: senderID,
          },
        ];

        await reply({
          body: `🎊 Chúc mừng ${name} đã giải mã từ \"${gameData.originalWord}\" thành công\n🔢 Số lần đoán: ${gameData.attempts}\n💰 Bạn được cộng: ${formatCurrency(reward)} vào tài khoản\n🔖 Số điểm đạt được: ${points}\n⏳ Thời gian trả lời: ${Math.floor(timeTaken / 1000)} giây`,
          mentions: mentions,
        });

        let leaderboard = await readLeaderboard();
        const existingUser = leaderboard.find(
          (user) => user.userID === senderID
        );

        if (existingUser) {
          existingUser.reward += reward;
          existingUser.points += points;
        } else {
          leaderboard.push({
            userID: senderID,
            name,
            reward,
            points,
          });
        }

        leaderboard.sort((a, b) => b.points - a.points);
        leaderboard = leaderboard.slice(0, 10);
        await writeLeaderboard(leaderboard);

        clearGameData(threadID);
      } else {
        const delMoneyPenalty = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
        if (delMoneyPenalty) {
          await delMoneyPenalty(senderID, BigInt(answerPenalty));
        }
        gameData.attempts++;
        await reply(
          `🗿 Đoán sai rồi! Bạn bị trừ ${answerPenalty.toLocaleString()}$. Hãy thử lại!`
        );
      }
    } catch (error) {
      console.error("Error during game event:", error);
      await reply(`❎ Đã có lỗi xảy ra, vui lòng thử lại sau`);
    }
  },
};

export default wordsCommand;
