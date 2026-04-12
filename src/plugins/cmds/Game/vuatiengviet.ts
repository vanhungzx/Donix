"use strict";

import type {
  Command,
  CommandOnCallContext,
  CommandOnReplyContext,
  FacebookClient,
  MainData,
  UserDataModel,
} from "@types";
import { createCanvas, loadImage } from "canvas";
import fs from "fs-extra";
import path from "path";
import { storagePath, TEMP_DIR } from "../../../core/storagePath";

const VUATV_DIR = storagePath("game", "vuatv");

interface Question {
  word: string;
  hint: string;
  description?: string;
  difficulty?: number;
  level?: number;
}

interface Round1Question {
  question: Question;
  questionId: string;
  answered: boolean;
}

interface Round2Word {
  word: string;
  description?: string;
  questionId: string;
  answered: boolean;
  points: number;
}

interface Round3Question {
  wordChain: string;
  answer: string;
  questionId: string;
  answered: boolean;
}

interface Round4Board {
  size: number;
  board: string[][];
  answer: string;
  timeLimit: number;
}

interface GameSession {
  round: number;
  userID: string;
  messageID: string;
  startTime: number;
  usedQuestions: Set<string>;


  round1Questions?: Round1Question[];
  round1CurrentIndex?: number;


  round2Words?: Round2Word[];
  round2CurrentIndex?: number;
  round2Score?: number;


  round3Questions?: Round3Question[];
  round3CurrentIndex?: number;


  round4Boards?: Round4Board[];
  round4CurrentIndex?: number;


  currentQuestion?: {
    originalText: string;
    scrambledText?: string;
    hint?: string;
    description?: string;
    questionId: string;
    timeLimit: number;
  };


  currentPrize: bigint;
  consecutiveWins: number;
}

interface VuaTiengVietReplyData {
  type: string;
  commandName: string;
  author: string;
  round: number;
  originalText: string;
  scrambledText?: string;
  hint?: string;
  description?: string;
  questionId: string;
  messageID: string;
  timeLimit: number;
}

interface MessageInfo {
  messageID?: string;
}


const ENTRY_FEE = 200000n;


const ROUND_PRIZES: bigint[] = [
  0n,
  5000000n,
  10000000n,
  20000000n,
  50000000n,
];


const MAX_PRIZE = 320000000n;

const gameSessions = new Map<string, GameSession>();


const questionsPath = path.join(VUATV_DIR, "questions.json");


let questionsCache: Question[] | null = null;
let questionsCacheTime: number = 0;
const CACHE_TTL = 60 * 1000;


async function readQuestions(): Promise<Question[]> {
  const now = Date.now();
  if (questionsCache && now - questionsCacheTime < CACHE_TTL) {
    return questionsCache;
  }

  try {
    await fs.ensureDir(path.dirname(questionsPath));
    if (!fs.existsSync(questionsPath)) {
      await fs.writeFile(questionsPath, JSON.stringify([], null, 2));
      return [];
    }
    const data = await fs.readFile(questionsPath, "utf8");
    questionsCache = JSON.parse(data) as Question[];
    questionsCacheTime = now;
    return questionsCache || [];
  } catch (error) {
    console.error("Error reading questions:", error);
    return [];
  }
}


function getQuestionId(question: Question): string {
  return `${question.word}_${question.description || ""}`.toLowerCase().replace(/\s+/g, "_");
}


async function getRandomQuestion(
  usedQuestions: Set<string>,
  difficulty?: number
): Promise<{ question: Question; questionId: string } | null> {
  const questions = await readQuestions();
  if (questions.length === 0) return null;

  const available = questions.filter((q) => {
    const qId = getQuestionId(q);
    if (usedQuestions.has(qId)) return false;
    if (difficulty !== undefined) {
      const qDifficulty = q.difficulty || 1;
      return Math.abs(qDifficulty - difficulty) <= 1;
    }
    return true;
  });

  if (available.length === 0) {

    const anyAvailable = questions.filter((q) => {
      const qId = getQuestionId(q);
      return !usedQuestions.has(qId);
    });
    if (anyAvailable.length === 0) return null;
    const selected = anyAvailable[Math.floor(Math.random() * anyAvailable.length)];
    if (!selected) return null;
    const questionId = getQuestionId(selected);
    usedQuestions.add(questionId);
    return { question: selected, questionId };
  }

  const selected = available[Math.floor(Math.random() * available.length)];
  if (!selected) return null;
  const questionId = getQuestionId(selected);
  usedQuestions.add(questionId);
  return { question: selected, questionId };
}


function formatCurrency(amount: bigint | number): string {
  const bigIntAmount = typeof amount === "bigint" ? amount : BigInt(amount);
  const strAmount = bigIntAmount.toString();
  return strAmount.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " VNĐ";
}


function xaotu(text: string): string {
  const originalChars = text.replace(/ /g, "").split("");
  const originalOrder = originalChars.join("");
  let chars = [...originalChars];
  let attempts = 0;
  const maxAttempts = 100;

  do {
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j] || "", chars[i] || ""];
    }
    attempts++;
    const shuffledOrder = chars.join("");
    if (shuffledOrder !== originalOrder) break;
    if (attempts >= maxAttempts) {
      chars = [...originalChars];
      for (let i = 0; i < chars.length; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        [chars[i], chars[randomIndex]] = [chars[randomIndex] || "", chars[i] || ""];
      }
      break;
    }
  } while (chars.join("") === originalOrder);

  return chars.join(" / ");
}


function generateBoard(size: number, targetWord: string): { board: string[][]; answer: string } {
  const board: string[][] = [];
  const targetChars = targetWord.replace(/ /g, "").toUpperCase().split("");


  const allChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  for (let i = 0; i < size; i++) {
    board[i] = [];
    const row = board[i];
    if (!row) continue;
    for (let j = 0; j < size; j++) {

      const charIndex = i * size + j;
      if (charIndex < targetChars.length && targetChars[charIndex]) {
        row[j] = targetChars[charIndex];
      } else {
        const randomChar = allChars[Math.floor(Math.random() * allChars.length)];
        row[j] = randomChar || "A";
      }
    }
  }


  for (let i = 0; i < size; i++) {
    const row = board[i];
    if (!row) continue;
    for (let j = 0; j < size; j++) {
      const randomI = Math.floor(Math.random() * size);
      const randomJ = Math.floor(Math.random() * size);
      const randomRow = board[randomI];
      if (!randomRow) continue;
      const temp = row[j];
      const randomChar = randomRow[randomJ];
      if (temp && randomChar) {
        row[j] = randomChar;
        randomRow[randomJ] = temp;
      }
    }
  }

  return { board, answer: targetWord };
}


async function createGameImage(
  scrambledText: string,
  round: number,
  timer: number,
  description?: string,
  board?: string[][]
): Promise<string> {
  const vuatvDir = VUATV_DIR;
  let bgImagePath = path.join(vuatvDir, "gheptu.jpg");

  if (!fs.existsSync(bgImagePath)) {
    bgImagePath = path.join(vuatvDir, "gheptu.png");
  }

  if (!fs.existsSync(bgImagePath)) {
    throw new Error(`Background image not found. Please place gheptu.jpg or gheptu.png in storage/game/vuatv/`);
  }

  const bgImage = await loadImage(bgImagePath);
  const canvas = createCanvas(bgImage.width, bgImage.height);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(bgImage, 0, 0);

  const baseWidth = 1920;
  const baseHeight = 1080;
  const scaleX = bgImage.width / baseWidth;
  const scaleY = bgImage.height / baseHeight;


  if (description) {
    const descriptionX = 960 * scaleX;
    const descriptionY = 90 * scaleY;
    ctx.fillStyle = "#000000";
    ctx.font = `bold ${Math.floor(60 * scaleX)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const maxWidth = baseWidth * 0.8 * scaleX;
    const words = description.split(" ");
    let line = "";
    let y = descriptionY;
    const lineHeight = 65 * scaleY;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + " ";
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && i > 0) {
        ctx.fillText(line, descriptionX, y);
        line = words[i] + " ";
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, descriptionX, y);
  }


  if (board && board.length > 0) {
    const boardSize = board.length;
    const cellSize = 80 * scaleX;
    const boardWidth = boardSize * cellSize;
    const startX = (baseWidth - boardWidth) / 2 * scaleX;
    const startY = 400 * scaleY;

    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;

    for (let i = 0; i < boardSize; i++) {
      const row = board[i];
      if (!row) continue;
      for (let j = 0; j < boardSize; j++) {
        const x = startX + j * cellSize;
        const y = startY + i * cellSize;
        const char = row[j] || "A";

        ctx.fillRect(x, y, cellSize, cellSize);
        ctx.strokeRect(x, y, cellSize, cellSize);

        ctx.fillStyle = "#000000";
        ctx.font = `bold ${Math.floor(40 * scaleX)}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(char, x + cellSize / 2, y + cellSize / 2);
        ctx.fillStyle = "#FFFFFF";
      }
    }
  } else {

    const scrambledTextX = 960 * scaleX;
    const scrambledTextY = 910 * scaleY;
    ctx.fillStyle = "#000000";
    ctx.font = `bold ${Math.floor(60 * scaleX)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(scrambledText, scrambledTextX, scrambledTextY);
  }


  const roundLabelX = 1450 * scaleX;
  const roundLabelY = 740 * scaleY;
  const roundLabelWidth = 220 * scaleX;
  const roundLabelHeight = 70 * scaleY;
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold ${Math.floor(55 * scaleX)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    `${round}`,
    roundLabelX + roundLabelWidth / 2 + 80 * scaleX,
    roundLabelY + roundLabelHeight / 2 + 78 * scaleY
  );


  const circleX = (1660 + 95) * scaleX;
  const circleY = (860 + 100) * scaleY;
  ctx.fillStyle = "#000000";
  ctx.font = `bold ${Math.floor(80 * scaleX)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${timer}`, circleX, circleY + 10 * scaleY);


  const tempDir = TEMP_DIR();
  await fs.ensureDir(tempDir);
  const outputPath = path.join(
    tempDir,
    `vuatiengviet_${Date.now()}_${Math.random().toString(36).slice(2)}.png`
  );

  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(outputPath, buffer);

  return outputPath;
}


async function initializeRound1(
  session: GameSession,
  usedQuestions: Set<string>
): Promise<boolean> {
  const questions: Round1Question[] = [];

  for (let i = 0; i < 4; i++) {
    const result = await getRandomQuestion(usedQuestions, 1);
    if (!result) return false;
    questions.push({
      question: result.question,
      questionId: result.questionId,
      answered: false,
    });
  }

  session.round1Questions = questions;
  session.round1CurrentIndex = 0;
  return true;
}


async function initializeRound2(
  session: GameSession,
  usedQuestions: Set<string>
): Promise<boolean> {
  const words: Round2Word[] = [];

  for (let i = 0; i < 2; i++) {
    const result = await getRandomQuestion(usedQuestions, 2);
    if (!result) return false;
    words.push({
      word: result.question.word,
      description: result.question.description,
      questionId: result.questionId,
      answered: false,
      points: 0,
    });
  }

  session.round2Words = words;
  session.round2CurrentIndex = 0;
  session.round2Score = 0;
  return true;
}


async function initializeRound3(
  session: GameSession,
  usedQuestions: Set<string>
): Promise<boolean> {
  const questions: Round3Question[] = [];

  for (let i = 0; i < 9; i++) {
    const result = await getRandomQuestion(usedQuestions, 3);
    if (!result) return false;

    const wordChain = xaotu(result.question.word);
    questions.push({
      wordChain: wordChain,
      answer: result.question.word,
      questionId: result.questionId,
      answered: false,
    });
  }

  session.round3Questions = questions;
  session.round3CurrentIndex = 0;
  return true;
}


async function initializeRound4(
  session: GameSession,
  usedQuestions: Set<string>
): Promise<boolean> {
  const boards: Round4Board[] = [];
  const sizes = [4, 5, 6];
  const timeLimits = [60, 75, 90];

  for (let i = 0; i < 3; i++) {
    const result = await getRandomQuestion(usedQuestions, 4);
    if (!result) return false;
    const size = sizes[i];
    const timeLimit = timeLimits[i];
    if (size === undefined || timeLimit === undefined) return false;
    const { board } = generateBoard(size, result.question.word);
    boards.push({
      size: size,
      board: board,
      answer: result.question.word,
      timeLimit: timeLimit,
    });
  }

  session.round4Boards = boards;
  session.round4CurrentIndex = 0;
  return true;
}


async function sendRound1Question(
  threadID: string,
  session: GameSession,
  client: FacebookClient,
  main: MainData,
  commandName: string
): Promise<void> {
  if (!session.round1Questions || session.round1CurrentIndex === undefined) return;

  const currentQ = session.round1Questions[session.round1CurrentIndex];
  if (!currentQ || currentQ.answered) return;

  const scrambledText = xaotu(currentQ.question.word);
  session.currentQuestion = {
    originalText: currentQ.question.word,
    scrambledText: scrambledText,
    hint: currentQ.question.hint,
    description: currentQ.question.description,
    questionId: currentQ.questionId,
    timeLimit: 90,
  };
  session.startTime = Date.now();

  const imagePath = await createGameImage(
    scrambledText,
    1,
    90,
    currentQ.question.description
  );

  await client.sendMessage(
    {
      body:
        `🎮 VÒNG 1 - GÓI CÂU HỎI ${session.round1CurrentIndex + 1}/4\n\n` +
        `⏱️ Thời gian: 90 giây\n` +
        `📝 ${scrambledText}\n\n` +
        `💡 Gõ đáp án của bạn!`,
      attachment: fs.createReadStream(imagePath),
    },
    threadID,
    async (err?: Error, info?: unknown) => {
      if (err) {
        console.error("Error sending message:", err);
        return;
      }
      const messageInfo = info as MessageInfo | undefined;
      if (messageInfo?.messageID) {
        session.messageID = messageInfo.messageID;
        gameSessions.set(threadID, session);

        if (main.onReply) {
          main.onReply.set(messageInfo.messageID, {
            type: "answer",
            commandName,
            author: session.userID,
            round: 1,
            originalText: currentQ.question.word,
            scrambledText: scrambledText,
            hint: currentQ.question.hint,
            description: currentQ.question.description,
            questionId: currentQ.questionId,
            messageID: messageInfo.messageID,
            timeLimit: 90,
          });
        }

        setTimeout(() => {
          const currentSession = gameSessions.get(threadID);
          if (currentSession && currentSession.messageID === messageInfo.messageID) {
            handleRound1Timeout(threadID, currentSession, client);
          }
        }, 90000);
      }

      setTimeout(() => {
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }, 10000);
    }
  );
}


async function handleRound1Timeout(
  threadID: string,
  session: GameSession,
  client: FacebookClient
): Promise<void> {
  if (!session.round1Questions || session.round1CurrentIndex === undefined) return;

  const currentQ = session.round1Questions[session.round1CurrentIndex];
  if (currentQ && !currentQ.answered) {
    await client.sendMessage(
      `⏰ Hết thời gian!\n💡 Đáp án: "${currentQ.question.word}"`,
      threadID
    );
    currentQ.answered = true;


    if (session.round1CurrentIndex < 3) {
      session.round1CurrentIndex++;


    } else {

      await startRound2(threadID, session, client);
    }
  }
}


async function startRound2(
  threadID: string,
  session: GameSession,
  client: FacebookClient
): Promise<void> {
  session.round = 2;
  const usedQuestions = session.usedQuestions;
  if (!(await initializeRound2(session, usedQuestions))) {
    await client.sendMessage("❌ Không đủ câu hỏi cho Round 2!", threadID);
    endGame(threadID, session.userID, session, client, null as any, false);
    return;
  }

  await sendRound2Word(threadID, session, client, null as any, "");
}


async function sendRound2Word(
  threadID: string,
  session: GameSession,
  client: FacebookClient,
  main: MainData,
  commandName: string
): Promise<void> {
  if (!session.round2Words || session.round2CurrentIndex === undefined) return;

  const currentWord = session.round2Words[session.round2CurrentIndex];
  if (!currentWord || currentWord.answered) return;

  session.currentQuestion = {
    originalText: currentWord.word,
    description: currentWord.description,
    questionId: currentWord.questionId,
    timeLimit: 60,
  };
  session.startTime = Date.now();

  await client.sendMessage(
    {
      body:
        `🎮 VÒNG 2 - TỪ ${session.round2CurrentIndex + 1}/2\n\n` +
        `📝 Giải nghĩa từ: "${currentWord.word}"\n` +
        `⏱️ Thời gian: 60 giây\n\n` +
        `🔔 Bấm chuông (gõ "chuông" hoặc trả lời trực tiếp) để giành quyền trả lời!\n` +
        `💡 Trả lời đúng trong 15 giây đầu: 4 điểm\n` +
        `💡 Mỗi 15 giây tiếp theo: -1 điểm`,
    },
    threadID,
    async (err?: Error, info?: unknown) => {
      if (err) {
        console.error("Error sending message:", err);
        return;
      }
      const messageInfo = info as MessageInfo | undefined;
      if (messageInfo?.messageID) {
        session.messageID = messageInfo.messageID;
        gameSessions.set(threadID, session);

        if (main.onReply) {
          main.onReply.set(messageInfo.messageID, {
            type: "answer",
            commandName,
            author: session.userID,
            round: 2,
            originalText: currentWord.word,
            description: currentWord.description,
            questionId: currentWord.questionId,
            messageID: messageInfo.messageID,
            timeLimit: 60,
          });
        }

        setTimeout(() => {
          const currentSession = gameSessions.get(threadID);
          if (currentSession && currentSession.messageID === messageInfo.messageID) {
            handleRound2Timeout(threadID, currentSession, client);
          }
        }, 60000);
      }
    }
  );
}


async function handleRound2Timeout(
  threadID: string,
  session: GameSession,
  client: FacebookClient
): Promise<void> {
  if (!session.round2Words || session.round2CurrentIndex === undefined) return;

  const currentWord = session.round2Words[session.round2CurrentIndex];
  if (currentWord && !currentWord.answered) {
    await client.sendMessage(
      `⏰ Hết thời gian!\n💡 Đáp án: "${currentWord.word}"`,
      threadID
    );
    currentWord.answered = true;

    if (session.round2CurrentIndex < 1) {
      session.round2CurrentIndex++;
    } else {

      await startRound3(threadID, session, client);
    }
  }
}


async function startRound3(
  threadID: string,
  session: GameSession,
  client: FacebookClient
): Promise<void> {
  session.round = 3;
  const usedQuestions = session.usedQuestions;
  if (!(await initializeRound3(session, usedQuestions))) {
    await client.sendMessage("❌ Không đủ câu hỏi cho Round 3!", threadID);
    endGame(threadID, session.userID, session, client, null as any, false);
    return;
  }

  await sendRound3Question(threadID, session, client, null as any, "");
}


async function sendRound3Question(
  threadID: string,
  session: GameSession,
  client: FacebookClient,
  main: MainData,
  commandName: string
): Promise<void> {
  if (!session.round3Questions || session.round3CurrentIndex === undefined) return;

  const currentQ = session.round3Questions[session.round3CurrentIndex];
  if (!currentQ || currentQ.answered) return;

  session.currentQuestion = {
    originalText: currentQ.answer,
    scrambledText: currentQ.wordChain,
    questionId: currentQ.questionId,
    timeLimit: 30,
  };
  session.startTime = Date.now();

  const imagePath = await createGameImage(
    currentQ.wordChain,
    3,
    30
  );

  await client.sendMessage(
    {
      body:
        `🎮 VÒNG 3 - CÂU HỎI ${session.round3CurrentIndex + 1}/9\n\n` +
        `⏱️ Thời gian: 30 giây\n` +
        `📝 ${currentQ.wordChain}\n\n` +
        `🔔 Bấm chuông (gõ "chuông" hoặc trả lời trực tiếp) để giành quyền trả lời!`,
      attachment: fs.createReadStream(imagePath),
    },
    threadID,
    async (err?: Error, info?: unknown) => {
      if (err) {
        console.error("Error sending message:", err);
        return;
      }
      const messageInfo = info as MessageInfo | undefined;
      if (messageInfo?.messageID) {
        session.messageID = messageInfo.messageID;
        gameSessions.set(threadID, session);

        if (main.onReply) {
          main.onReply.set(messageInfo.messageID, {
            type: "answer",
            commandName,
            author: session.userID,
            round: 3,
            originalText: currentQ.answer,
            scrambledText: currentQ.wordChain,
            questionId: currentQ.questionId,
            messageID: messageInfo.messageID,
            timeLimit: 30,
          });
        }

        setTimeout(() => {
          const currentSession = gameSessions.get(threadID);
          if (currentSession && currentSession.messageID === messageInfo.messageID) {
            handleRound3Timeout(threadID, currentSession, client);
          }
        }, 30000);
      }

      setTimeout(() => {
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }, 10000);
    }
  );
}


async function handleRound3Timeout(
  threadID: string,
  session: GameSession,
  client: FacebookClient
): Promise<void> {
  if (!session.round3Questions || session.round3CurrentIndex === undefined) return;

  const currentQ = session.round3Questions[session.round3CurrentIndex];
  if (currentQ && !currentQ.answered) {
    await client.sendMessage(
      `⏰ Hết thời gian!\n💡 Đáp án: "${currentQ.answer}"`,
      threadID
    );
    currentQ.answered = true;

    if (session.round3CurrentIndex < 8) {
      session.round3CurrentIndex++;
    } else {

      await startRound4(threadID, session, client);
    }
  }
}


async function startRound4(
  threadID: string,
  session: GameSession,
  client: FacebookClient
): Promise<void> {
  session.round = 4;
  const usedQuestions = session.usedQuestions;
  if (!(await initializeRound4(session, usedQuestions))) {
    await client.sendMessage("❌ Không đủ câu hỏi cho Round 4!", threadID);
    endGame(threadID, session.userID, session, client, null as any, false);
    return;
  }

  await sendRound4Board(threadID, session, client, null as any, "");
}


async function sendRound4Board(
  threadID: string,
  session: GameSession,
  client: FacebookClient,
  main: MainData,
  commandName: string
): Promise<void> {
  if (!session.round4Boards || session.round4CurrentIndex === undefined) return;

  const currentBoard = session.round4Boards[session.round4CurrentIndex];
  if (!currentBoard) return;

  session.currentQuestion = {
    originalText: currentBoard.answer,
    questionId: `round4_${session.round4CurrentIndex}`,
    timeLimit: currentBoard.timeLimit,
  };
  session.startTime = Date.now();

  const imagePath = await createGameImage(
    "",
    4,
    currentBoard.timeLimit,
    undefined,
    currentBoard.board
  );

  await client.sendMessage(
    {
      body:
        `🎮 VÒNG 4 - BẢNG ${session.round4CurrentIndex + 1}/3\n\n` +
        `📊 Bảng ${currentBoard.size}x${currentBoard.size}\n` +
        `⏱️ Thời gian: ${currentBoard.timeLimit} giây\n\n` +
        `💡 Tìm từ trong bảng chữ cái!`,
      attachment: fs.createReadStream(imagePath),
    },
    threadID,
    async (err?: Error, info?: unknown) => {
      if (err) {
        console.error("Error sending message:", err);
        return;
      }
      const messageInfo = info as MessageInfo | undefined;
      if (messageInfo?.messageID) {
        session.messageID = messageInfo.messageID;
        gameSessions.set(threadID, session);

        if (main.onReply) {
          main.onReply.set(messageInfo.messageID, {
            type: "answer",
            commandName,
            author: session.userID,
            round: 4,
            originalText: currentBoard.answer,
            questionId: `round4_${session.round4CurrentIndex}`,
            messageID: messageInfo.messageID,
            timeLimit: currentBoard.timeLimit,
          });
        }

        setTimeout(() => {
          const currentSession = gameSessions.get(threadID);
          if (currentSession && currentSession.messageID === messageInfo.messageID) {
            handleRound4Timeout(threadID, currentSession, client);
          }
        }, currentBoard.timeLimit * 1000);
      }

      setTimeout(() => {
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }, 10000);
    }
  );
}


async function handleRound4Timeout(
  threadID: string,
  session: GameSession,
  client: FacebookClient
): Promise<void> {
  if (!session.round4Boards || session.round4CurrentIndex === undefined) return;

  const currentBoard = session.round4Boards[session.round4CurrentIndex];
  if (currentBoard) {
    await client.sendMessage(
      `⏰ Hết thời gian!\n💡 Đáp án: "${currentBoard.answer}"`,
      threadID
    );

    if (session.round4CurrentIndex < 2) {
      session.round4CurrentIndex++;
    } else {

      endGame(threadID, session.userID, session, client, null as any, false, true);
    }
  }
}


async function endGame(
  threadID: string,
  userID: string,
  session: GameSession,
  client: FacebookClient,
  userData: UserDataModel | null,
  isWin: boolean,
  isTimeout?: boolean
): Promise<void> {
  gameSessions.delete(threadID);

  const getName = userData?.getName as ((id: string) => Promise<string | null | undefined>) | undefined;
  const name = getName ? (await getName(userID)) || "Bạn" : "Bạn";

  let finalPrize = 0n;
  let message = "";

  if (isWin && session.round === 4) {

    finalPrize = ROUND_PRIZES[4] || 0n;
    session.consecutiveWins = (session.consecutiveWins || 0) + 1;

    if (session.consecutiveWins >= 4) {
      finalPrize = MAX_PRIZE;
      message = `🎉🎉🎉 CHÚC MỪNG ${name}! 🎉🎉🎉\n\n` +
        `🏆 Bạn đã trở thành VUA TIẾNG VIỆT!\n` +
        `💰 Tiền thưởng: ${formatCurrency(finalPrize)}\n` +
        `🎯 Bạn đã thắng 4 lần liên tiếp!\n\n` +
        `✨ Bạn là Vua Tiếng Việt vĩ đại! ✨`;
    } else {
      message = `🎉🎉🎉 CHÚC MỪNG ${name}! 🎉🎉🎉\n\n` +
        `🏆 Bạn đã hoàn thành tất cả 4 vòng!\n` +
        `💰 Tiền thưởng: ${formatCurrency(finalPrize)}\n` +
        `🎯 Số lần thắng liên tiếp: ${session.consecutiveWins}/4\n\n` +
        `💡 Thắng thêm ${4 - session.consecutiveWins} lần nữa để nhận ${formatCurrency(MAX_PRIZE)}!`;
    }
  } else {

    const roundReached = session.round;
    finalPrize = roundReached > 0 ? ROUND_PRIZES[roundReached - 1] || 0n : 0n;

    if (isTimeout) {
      message = `⏰ Hết thời gian!\n\n` +
        `📊 Vòng đạt được: ${roundReached}/4\n` +
        `💰 Tiền thưởng: ${formatCurrency(finalPrize)}\n\n`;
      if (session.currentQuestion) {
        message += `💡 Đáp án đúng là: "${session.currentQuestion.originalText}"`;
      }
    } else {
      message = `❌ Trả lời sai!\n\n` +
        `📊 Vòng đạt được: ${roundReached}/4\n` +
        `💰 Tiền thưởng: ${formatCurrency(finalPrize)}\n\n`;
      if (session.currentQuestion) {
        message += `💡 Đáp án đúng là: "${session.currentQuestion.originalText}"`;
      }
    }
  }


  if (finalPrize > 0n && userData) {
    const addMoney = userData.addMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
    if (addMoney) {
      await addMoney(userID, finalPrize);
    }
  }

  if (userData) {
    await client.sendMessage(
      {
        body: message,
        mentions: [
          {
            tag: name || "Người chơi",
            id: String(userID),
          },
        ],
      },
      threadID
    );
  }
}

const vuatiengvietCommand: Command = {
  name: "vuatiengviet",
  alias: ["vtv", "vuatv"],
  version: "2.0.0",
  role: 0,
  desc: "Game vua tiếng việt mùa 3 - 4 vòng thi đấu",
  guide:
    "{pn} - Bắt đầu game vua tiếng việt mùa 3\n" +
    "{pn} end - Kết thúc game hiện tại\n" +
    "{pn} status - Xem trạng thái game\n" +
    "{pn} hint/gợi ý - Xem gợi ý (trong game)\n" +
    "{pn} chuông - Bấm chuông (Round 2, 3)",
  cd: 5,
  prefix: true,

  onCall: async (ctx: CommandOnCallContext): Promise<void> => {
    const { event, reply, args, client, main, commandName, userData } = ctx;
    const { threadID, senderID } = event;

    const sub = (args[0] || "").toLowerCase();

    if (sub === "end") {
      const session = gameSessions.get(threadID);
      if (session && session.userID === senderID) {
        gameSessions.delete(threadID);
        await reply("✅ Đã kết thúc game!");
      } else {
        await reply("❌ Bạn không có quyền kết thúc game này!");
      }
      return;
    }

    if (sub === "status") {
      const session = gameSessions.get(threadID);
      if (!session) {
        await reply("❌ Không có game nào đang diễn ra!");
        return;
      }
      const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
      const remaining = Math.max(0, (session.currentQuestion?.timeLimit || 0) - elapsed);
      await reply(
        `📊 Trạng thái game:\n` +
        `📊 Vòng: ${session.round}/4\n` +
        `💰 Tiền thưởng hiện tại: ${formatCurrency(session.currentPrize)}\n` +
        `⏱️ Thời gian còn lại: ${remaining}s`
      );
      return;
    }


    if (gameSessions.has(threadID)) {
      await reply(
        "❌ Đã có game đang diễn ra! Gõ 'end' để kết thúc game hiện tại."
      );
      return;
    }


    const userDat = await userData.get(senderID);
    if (!userDat) {
      await reply("❌ Không thể lấy thông tin người dùng");
      return;
    }

    const userMoney = typeof userDat.money === "bigint"
      ? userDat.money
      : BigInt(userDat.money || 0);

    if (userMoney < ENTRY_FEE) {
      await reply(
        `❌ Bạn không đủ tiền để tham gia!\n💰 Phí đăng ký: ${formatCurrency(ENTRY_FEE)}`
      );
      return;
    }


    const delMoney = userData.delMoney as ((id: string, amount: bigint) => Promise<void>) | undefined;
    if (delMoney) {
      await delMoney(senderID, ENTRY_FEE);
    }


    const usedQuestions = new Set<string>();
    const session: GameSession = {
      round: 1,
      userID: senderID,
      messageID: "",
      startTime: Date.now(),
      usedQuestions: usedQuestions,
      currentPrize: 0n,
      consecutiveWins: 0,
    };


    if (!(await initializeRound1(session, usedQuestions))) {
      await reply(
        "❌ Không có câu hỏi nào trong database!\n" +
        "📝 Vui lòng thêm câu hỏi vào file: storage/game/vuatv/questions.json"
      );
      return;
    }

    gameSessions.set(threadID, session);


    await client.sendMessage(
      `🎮 GAME VUA TIẾNG VIỆT MÙA 3 🎮\n\n` +
      `💰 Phí đăng ký: ${formatCurrency(ENTRY_FEE)} đã được trừ\n\n` +
      `📋 LUẬT CHƠI:\n` +
      `🎯 Vòng 1: 4 gói câu hỏi, mỗi gói 90 giây\n` +
      `🎯 Vòng 2: 2 từ, mỗi từ 60 giây (bấm chuông)\n` +
      `🎯 Vòng 3: 9 chuỗi từ, mỗi chuỗi 30 giây (bấm chuông)\n` +
      `🎯 Vòng 4: 3 bảng (4x4, 5x5, 6x6)\n\n` +
      `💰 Giải thưởng tối đa: ${formatCurrency(MAX_PRIZE)} (thắng 4 lần liên tiếp)\n\n` +
      `🚀 Bắt đầu Vòng 1!`,
      threadID
    );


    await sendRound1Question(threadID, session, client, main, commandName);
  },

  onReply: async (ctx: CommandOnReplyContext): Promise<void> => {
    const { client, event, unsend, Reply, userData, main, commandName } = ctx;
    const { threadID, messageID, senderID, body } = event;

    const replyData = Reply as unknown as VuaTiengVietReplyData;
    if (replyData.type !== "answer" || replyData.commandName !== "vuatiengviet") return;


    const session = gameSessions.get(threadID);
    if (!session) return;


    if (senderID !== replyData.author || senderID !== session.userID) {
      await client.sendMessage(
        "Người ta đang chơi, bạn đừng phá đám!",
        threadID,
        messageID
      );
      return;
    }

    const bodyLower = body?.trim().toLowerCase() || "";


    if ((bodyLower === "chuông" || bodyLower === "chuong") && (replyData.round === 2 || replyData.round === 3)) {
      await client.sendMessage("🔔 Bạn đã bấm chuông! Bây giờ hãy trả lời!", threadID, messageID);
      return;
    }


    if (bodyLower === "gợi ý" || bodyLower === "hint" || bodyLower === "goi y") {
      if (replyData.hint) {
        let hintMessage = `💡 Gợi ý:\n📝 ${replyData.hint}`;
        if (replyData.description) {
          hintMessage += `\n📖 Mô tả: ${replyData.description}`;
        }
        await client.sendMessage(hintMessage, threadID, messageID);
      }
      return;
    }


    const userAnswer = bodyLower.replace(/ /g, "");
    const correctAnswer = replyData.originalText
      .toLowerCase()
      .replace(/ /g, "");

    if (userAnswer === correctAnswer) {

      if (unsend) unsend(replyData.messageID);

      const elapsed = Math.floor((Date.now() - session.startTime) / 1000);

      if (replyData.round === 1) {

        await client.sendMessage(
          `✅ Đáp án đúng: "${replyData.originalText}"\n\n` +
          `📝 Đang chuyển sang câu hỏi tiếp theo...`,
          threadID
        );

        if (session.round1Questions && session.round1CurrentIndex !== undefined) {
          const currentQ = session.round1Questions[session.round1CurrentIndex];
          if (currentQ) {
            currentQ.answered = true;
          }

          if (session.round1CurrentIndex < 3) {
            session.round1CurrentIndex++;
            await sendRound1Question(threadID, session, client, main, commandName);
          } else {

            session.currentPrize = ROUND_PRIZES[1] || 0n;
            await client.sendMessage(
              `🎉 Hoàn thành Vòng 1!\n💰 Tiền thưởng: ${formatCurrency(session.currentPrize)}\n\n` +
              `🚀 Bắt đầu Vòng 2!`,
              threadID
            );
            await startRound2(threadID, session, client);
          }
        }
      } else if (replyData.round === 2) {

        if (session.round2Words && session.round2CurrentIndex !== undefined) {
          const currentWord = session.round2Words[session.round2CurrentIndex];
          if (!currentWord) return;
          let points = 4;
          if (elapsed > 15) points = Math.max(1, 4 - Math.floor((elapsed - 15) / 15));
          currentWord.points = points;
          currentWord.answered = true;
          session.round2Score = (session.round2Score || 0) + points;

          await client.sendMessage(
            `✅ Đáp án đúng: "${replyData.originalText}"\n` +
            `⭐ Điểm: ${points} điểm\n` +
            `📊 Tổng điểm: ${session.round2Score} điểm`,
            threadID
          );

          if (session.round2CurrentIndex < 1) {
            session.round2CurrentIndex++;
            await sendRound2Word(threadID, session, client, main, commandName);
          } else {

            session.currentPrize = ROUND_PRIZES[2] || 0n;
            await client.sendMessage(
              `🎉 Hoàn thành Vòng 2!\n💰 Tiền thưởng: ${formatCurrency(session.currentPrize)}\n\n` +
              `🚀 Bắt đầu Vòng 3!`,
              threadID
            );
            await startRound3(threadID, session, client);
          }
        }
      } else if (replyData.round === 3) {

        await client.sendMessage(
          `✅ Đáp án đúng: "${replyData.originalText}"`,
          threadID
        );

        if (session.round3Questions && session.round3CurrentIndex !== undefined) {
          const currentQ = session.round3Questions[session.round3CurrentIndex];
          if (currentQ) {
            currentQ.answered = true;
          }

          if (session.round3CurrentIndex < 8) {
            session.round3CurrentIndex++;
            await sendRound3Question(threadID, session, client, main, commandName);
          } else {

            session.currentPrize = ROUND_PRIZES[3] || 0n;
            await client.sendMessage(
              `🎉 Hoàn thành Vòng 3!\n💰 Tiền thưởng: ${formatCurrency(session.currentPrize)}\n\n` +
              `🚀 Bắt đầu Vòng 4 - Vòng cuối!`,
              threadID
            );
            await startRound4(threadID, session, client);
          }
        }
      } else if (replyData.round === 4) {

        await client.sendMessage(
          `✅ Đáp án đúng: "${replyData.originalText}"`,
          threadID
        );

        if (session.round4Boards && session.round4CurrentIndex !== undefined) {
          if (session.round4CurrentIndex < 2) {
            session.round4CurrentIndex++;
            await sendRound4Board(threadID, session, client, main, commandName);
          } else {

            session.currentPrize = ROUND_PRIZES[4] || 0n;
            endGame(threadID, senderID, session, client, userData, true);
          }
        }
      }
    } else if (userAnswer) {

      if (unsend) unsend(replyData.messageID);

      await client.sendMessage(
        `❌ Trả lời sai!\n💡 Đáp án đúng là: "${replyData.originalText}"`,
        threadID
      );
      endGame(threadID, senderID, session, client, userData, false, false);
    }
  },
};

export default vuatiengvietCommand;
