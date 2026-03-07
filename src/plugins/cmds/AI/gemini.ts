"use strict";

import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  createPartFromUri,
} from "@google/genai";
import type {
  Command,
  CommandOnChatContext,
  CommandOnReplyContext,
  ReplyData,
} from "@types";
import axios from "axios";
import cheerio from "cheerio";
import fs from "fs";
import path from "path";

const API_KEYS = [
  { key: "AIzaSyA4TdYmWcBDoSC722ievzkYJ3e8AnUtNFA", requestsLeft: 60 },
  { key: "AIzaSyA6qBZ2IL-iRnoSBh_OllGteCIF2PfKRC0", requestsLeft: 60 },
  { key: "AIzaSyCv8FdD-Mj_bujfyxCXedf7jas4j8DDZ3E", requestsLeft: 60 },
  { key: "AIzaSyCjHC9xWZQ_SrNjRCuCRAbhdUQfaFwqGec", requestsLeft: 60 },
  { key: "AIzaSyD-qDcHahDjIP86Uxitzqti9paKikXXDyo", requestsLeft: 60 },
  { key: "AIzaSyCwKAMyfYE2hBcOUxdrVN-WJ5hjrJMA-6U", requestsLeft: 60 },
  { key: "AIzaSyB6y9ACMpD0L491pzd1sVLBcDvdIJUAkxo", requestsLeft: 60 }
];

let currentKeyIndex = 0;
let triedKeys = new Set<number>();
let lastResetTime = Date.now();
const RESET_INTERVAL = 60 * 60 * 1000;

function resetKeys() {
  triedKeys.clear();
  API_KEYS.forEach(k => (k.requestsLeft = 60));
  lastResetTime = Date.now();
}

function hasAvailableKey() {
  return (
    API_KEYS.some(k => k.requestsLeft > 0) || !!process.env.GOOGLE_API_KEY || !!process.env.GEMINI_API_KEY
  );
}

function pickKey(): { key: string; index: number } {
  if (!hasAvailableKey() && Date.now() - lastResetTime > RESET_INTERVAL) {
    resetKeys();
  }
  if (process.env.GEMINI_API_KEY) {
    return { key: process.env.GEMINI_API_KEY, index: -1 };
  }
  if (process.env.GOOGLE_API_KEY) {
    return { key: process.env.GOOGLE_API_KEY, index: -1 };
  }
  if (!API_KEYS.length) throw new Error("NO_GOOGLE_API_KEYS");
  const currentKey = API_KEYS[currentKeyIndex];
  if (!currentKey || currentKey.requestsLeft <= 0) {
    for (let i = 0; i < API_KEYS.length; i++) {
      const key = API_KEYS[i];
      if (key && key.requestsLeft > 0) {
        currentKeyIndex = i;
        break;
      }
    }
  }
  const selectedKey = API_KEYS[currentKeyIndex];
  if (!selectedKey || selectedKey.requestsLeft <= 0) {
    resetKeys();
    currentKeyIndex = 0;
  }
  const finalKey = API_KEYS[currentKeyIndex];
  if (!finalKey) throw new Error("NO_GOOGLE_API_KEYS");
  finalKey.requestsLeft = Math.max(
    0,
    finalKey.requestsLeft - 1
  );
  triedKeys.add(currentKeyIndex);
  return { key: finalKey.key, index: currentKeyIndex };
}

function removeLeakedKey(keyInfo: { key: string; index: number } | null | undefined) {
  if (!keyInfo || keyInfo.index < 0) return;
  if (keyInfo.index >= 0 && keyInfo.index < API_KEYS.length) {
    console.log(`Removing leaked API key at index ${keyInfo.index}: ${keyInfo.key.substring(0, 20)}...`);
    API_KEYS.splice(keyInfo.index, 1);
    // Reset currentKeyIndex if it's out of bounds
    if (currentKeyIndex >= API_KEYS.length) {
      currentKeyIndex = 0;
    }
    triedKeys.clear();
  }
}

function rotateKeyOnFail() {
  triedKeys.clear();
  for (let i = 0; i < API_KEYS.length; i++) {
    const key = API_KEYS[i];
    if (key && key.requestsLeft > 0) {
      currentKeyIndex = i;
      return;
    }
  }
  resetKeys();
  currentKeyIndex = 0;
}

const DATA_BASE = path.join(process.cwd(), "src/storage/gemini");
const TEXT_BASE = path.join(DATA_BASE, "gemini_text");
const FILE_BASE = path.join(DATA_BASE, "gemini1.5", "files");
const SETTINGS_BASE = path.join(DATA_BASE, "settings");
const INLINE_IMAGE_LIMIT_BYTES = 18 * 1024 * 1024;

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

const Prefixes = ["gemini", "genimi"];

interface Settings {
  persona: string;
}

interface HistoryPart {
  text?: string;
  fileData?: {
    mimeType: string;
    fileUri: string;
  };
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface HistoryEntry {
  role: "user" | "model";
  parts: HistoryPart[];
}

interface State {
  summary: string;
  history: HistoryEntry[];
}

interface Link {
  url: string;
  mimeType: string;
  name: string;
  extension: string;
}

interface Attachment {
  url?: string;
  image?: string;
  mimeType?: string;
  filename?: string;
  original_extension?: string;
  type?: string;
  contentType?: string;
}

interface ParsedSubcmd {
  type: "system" | "clear" | "memory" | null;
  rest: string;
}

interface GeminiReplyData extends ReplyData {
  previousAttachments?: Attachment[];
}

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readJSON<T>(p: string, def: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return def;
  }
}

function writeJSON(p: string, v: any): void {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(v, null, 2));
}

async function fileToGeminiPart(
  ai: GoogleGenAI,
  filePath: string,
  mimeType?: string
): Promise<any | null> {
  const stat = fs.statSync(filePath);
  const mime = mimeType || "application/octet-stream";

  if (stat.size <= INLINE_IMAGE_LIMIT_BYTES) {
    const base64 = fs.readFileSync(filePath, { encoding: "base64" });
    return {
      inlineData: {
        mimeType: mime,
        data: base64,
      },
    };
  }

  const uploaded = await ai.files.upload({
    file: filePath,
    config: mime ? { mimeType: mime } : undefined,
  });
  const file = (uploaded as any).file || uploaded;
  if (file?.uri || file?.name) {
    const name = file.name || (file.uri as string)?.split("/").pop();
    if (name) await waitForFileActive(ai, name);
    return createPartFromUri(file.uri || file.fileUri, file.mimeType);
  }
  return null;
}

async function waitForFileActive(ai: GoogleGenAI, fileName: string, maxRetries = 8): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const info = await ai.files.get({ name: fileName });
      if (!info) return false;
      const state = String((info as any).state || "").toUpperCase();
      if (state === "ACTIVE") return true;
      if (state === "FAILED") return false;
    } catch {

    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  return false;
}

function textLen(s: string | null | undefined): number {
  return (s || "").length;
}

function approxTokens(s: string): number {
  return Math.ceil(textLen(s) / 4);
}

function settingsPath(threadID: string | number): string {
  return path.join(SETTINGS_BASE, `${threadID}.json`);
}

function getSettings(threadID: string | number): Settings {
  return readJSON(settingsPath(threadID), { persona: "" });
}

function setPersona(threadID: string | number, persona: string): void {
  writeJSON(settingsPath(threadID), { persona: String(persona || "").trim() });
}

function statePath(uid: string | number): string {
  return path.join(TEXT_BASE, `${uid}.json`);
}

function loadState(uid: string | number): State {
  const raw = readJSON(statePath(uid), []);

  if (Array.isArray(raw)) return { summary: "", history: raw };

  const s = readJSON<State>(statePath(uid), { summary: "", history: [] });

  if (!Array.isArray(s.history)) s.history = [];

  return s;
}

function saveState(uid: string | number, state: State): void {
  const filtered: State = {
    summary: String(state.summary || ""),
    history: (state.history || [])
      .map((e) => ({
        role: e.role,
        parts: (e.parts || [])
          .filter((p) => p && (p.text || p.fileData))
          .map((p) =>
            p.fileData ? {} : { text: String(p.text || "") }
          )
          .filter((p) => p.text && p.text.trim() !== ""),
      }))
      .filter((e) => e.parts && e.parts.length),
  };

  writeJSON(statePath(uid), filtered);
}

async function summarizeIfNeeded(
  uid: string | number,
  persona: string,
  state: State,
  maxTurns: number,
  maxSummaryChars: number
): Promise<void> {
  const h = state.history || [];

  if (h.length <= maxTurns) return;

  const dropUntil = Math.max(0, h.length - maxTurns);
  const toSummarize = h.slice(0, dropUntil);
  const recent = h.slice(dropUntil);

  const summarySeed = state.summary
    ? `Tóm lược trước đó:\n${state.summary}\n\n`
    : "";

  const textBundle = toSummarize
    .map(
      (m) =>
        `${m.role === "user" ? "Người dùng" : "Trợ lý"}: ${(m.parts || [])
          .map((p) => p.text || "")
          .join(" ")}`
    )
    .join("\n");

  const sumPrompt = `${summarySeed}Hãy tóm tắt ngắn gọn hội thoại sau, lưu ý sở thích, bối cảnh, nhiệm vụ, thông tin cần nhớ. Dài tối đa ${maxSummaryChars} ký tự.\n===\n${textBundle}`;

  let apiKeyInfo: { key: string; index: number } | null = null;
  try {
    apiKeyInfo = pickKey();
    const ai = new GoogleGenAI({ apiKey: apiKeyInfo.key });
    const systemInstruction = buildSystemInstruction(persona, state.summary);

    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: sumPrompt,
      config: {
        systemInstruction: systemInstruction || undefined,
        safetySettings,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 2048,
      },
    } as any);

    const text =
      (typeof (res as any)?.text === "function"
        ? (res as any).text()
        : (res as any)?.text || "")
        ?.trim() || "";

    state.summary = text.slice(0, maxSummaryChars);
    state.history = recent;

    saveState(uid, state);
  } catch (e: any) {
    const status = e?.status ?? e?.response?.status;
    const msg = String(e?.message || "").toLowerCase();
    const isLeakedKey =
      status === 403 &&
      (msg.includes("leaked") ||
       msg.includes("reported as leaked") ||
       msg.includes("please use another api key"));

    if (isLeakedKey && apiKeyInfo) {
      // key bị leak: xóa luôn key khỏi danh sách
      removeLeakedKey(apiKeyInfo);
    }
    // Nếu có lỗi khi summarize, giữ nguyên state và không throw
    console.log("Error summarizing:", e?.message || e);
  }
}

async function downloadFile(url: string): Promise<Buffer> {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
  });
  return res.data as Buffer;
}

async function headMime(url: string): Promise<string> {
  try {
    const r = await axios.head(url, {
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    return r.headers["content-type"] || "";
  } catch {
    try {
      const r = await axios.get(url, {
        responseType: "stream",
        timeout: 12000,
        maxRedirects: 5,
      });
      try {
        r.data.destroy();
      } catch { }
      return r.headers["content-type"] || "";
    } catch {
      return "";
    }
  }
}

async function scrapeText(webUrl: string): Promise<string> {
  try {
    const r = await axios.get(webUrl, {
      responseType: "text",
      timeout: 20000,
    });
    const $ = cheerio.load(r.data || "");
    const t = $("body").text().replace(/\s+/g, " ").trim();
    return t.slice(0, 200000);
  } catch {
    return "";
  }
}

async function uploadLinks(
  links: Link[],
  uid: string | number,
  ai: GoogleGenAI
): Promise<any[]> {
  const base = path.join(FILE_BASE, String(uid), String(Date.now()));
  ensureDir(base);

  const uploaded: any[] = [];

  for (const link of links) {
    try {
      const bn = `${link.name || Date.now()}.${link.extension || "bin"}`;
      const fp = path.join(base, bn);
      const buf = await downloadFile(link.url);

      if (!buf) continue;

      fs.writeFileSync(fp, buf);

      const part = await fileToGeminiPart(ai, fp, link.mimeType);
      if (part) uploaded.push(part);
    } catch { }
  }

  try {
    fs.rmSync(path.join(FILE_BASE, String(uid)), {
      recursive: true,
      force: true,
    });
  } catch { }

  return uploaded;
}

function buildSystemInstruction(persona: string, summary: string): string {
  return [
    persona && persona.trim() ? `Hệ thống: ${persona.trim()}` : "",
    summary && summary.trim() ? `Ngữ cảnh đã biết: ${summary.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function getAnswer({
  prompt,
  uid,
  links,
  persona,
  retry = 0,
}: {
  prompt: string;
  uid: string | number;
  links: Link[];
  persona: string;
  retry?: number;
}): Promise<string> {
  if (!prompt || !String(prompt).trim()) prompt = "Xin chào";

  const state = loadState(uid);
  const apiKeyInfo = pickKey();
  const ai = new GoogleGenAI({ apiKey: apiKeyInfo.key });
  const systemInstruction = buildSystemInstruction(persona, state.summary);
  let files: any[] = [];

  try {
    if (Array.isArray(links) && links.length)
      files = await uploadLinks(links, uid, ai);

    const userParts: HistoryPart[] = [
      { text: String(prompt) },
      ...files
        .map((f) => {
          if ((f as any)?.inlineData) return f;
          const fd = (f as any)?.fileData;
          if (fd?.fileUri && fd?.mimeType) return f;
          const uri = (f as any)?.uri || (f as any)?.fileUri;
          const mimeType = (f as any)?.mimeType;
          if (uri && mimeType) return createPartFromUri(uri, mimeType) as any;
          return null;
        })
        .filter(Boolean) as any[],
    ];

    let history = (state.history || []).filter(
      (e) => Array.isArray(e.parts) && e.parts.length
    );

    for (let i = 0; i < history.length - 1; i++) {
      const current = history[i];
      const next = history[i + 1];
      if (current && next && current.role === next.role) {
        history.splice(i + 1, 1);
        i--;
      }
    }

    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [...history, { role: "user", parts: userParts }] as any,
      config: {
        systemInstruction: systemInstruction || undefined,
        safetySettings,
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 8192,
      },
    } as any);

    const text =
      (typeof (res as any)?.text === "function"
        ? (res as any).text()
        : (res as any)?.text || "")
        ?.trim() || "";

    if (!text) {
      const br =
        (res as any)?.response?.promptFeedback?.blockReason ||
        (res as any)?.promptFeedback?.blockReason ||
        (res as any)?.response?.candidates?.[0]?.finishReason ||
        (res as any)?.candidates?.[0]?.finishReason ||
        "";
      return br ? `Prompt bị chặn: ${br}` : "Không thể xử lý yêu cầu.";
    }

    state.history.push({ role: "user", parts: userParts });
    state.history.push({ role: "model", parts: [{ text }] });

    const limitTurns = 10;
    const limitSummary = 2000;
    const maxCtxTokens = 28000;

    let ctxTokens = approxTokens(
      (state.summary || "") +
      state.history
        .map((m) => (m.parts || []).map((p) => p.text || "").join(" "))
        .join("\n")
    );

    if (state.history.length > limitTurns || ctxTokens > maxCtxTokens)
      await summarizeIfNeeded(uid, persona, state, limitTurns, limitSummary);
    else saveState(uid, state);

    return text;
  } catch (e: any) {
    const status = e?.status ?? e?.response?.status;
    const msg = String(e?.message || "").toLowerCase();
    const isLeakedKey =
      status === 403 &&
      (msg.includes("leaked") ||
       msg.includes("reported as leaked") ||
       msg.includes("please use another api key"));
    const isRateLimit =
      e?.status === 429 ||
      String(e?.message || "")
        .toLowerCase()
        .includes("rate") ||
      String(e?.message || "")
        .toLowerCase()
        .includes("quota") ||
      e?.code === "RESOURCE_EXHAUSTED";

    if (isLeakedKey) {
      // key bị leak: xóa luôn key khỏi danh sách
      removeLeakedKey(apiKeyInfo);
    }

    if (isRateLimit && retry < API_KEYS.length * 2) {
      rotateKeyOnFail();
      const delay = Math.min(2000 * (retry + 1), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
      return getAnswer({
        prompt,
        uid,
        links,
        persona,
        retry: retry + 1,
      });
    }

    if (retry >= API_KEYS.length * 2) {
      if (!hasAvailableKey()) {
        resetKeys();
        if (retry < API_KEYS.length * 2 + 1) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          return getAnswer({
            prompt,
            uid,
            links,
            persona,
            retry: retry + 1,
          });
        }
        throw new Error(
          "Đã thử hết tất cả key. Vui lòng thử lại sau vài phút."
        );
      }
    }

    throw e;
  }
}

function parseLinksFromPrompt(prompt: string): string[] {
  return (String(prompt).match(/\bhttps?:\/\/\S+/gi) || []).map((u) =>
    u.trim()
  );
}

async function classifyUrlToLink(url: string): Promise<Link | null> {
  const ct = await headMime(url);
  if (!ct) return null;

  if (ct.startsWith("image/")) {
    const ext = ct.split("/")[1] || "jpeg";
    return {
      url,
      mimeType: ct,
      name: `${Date.now()}`,
      extension: ext,
    };
  }

  if (ct.startsWith("video/")) {
    const ext = ct.split("/")[1] || "mp4";
    return {
      url,
      mimeType: ct,
      name: `${Date.now()}`,
      extension: ext,
    };
  }

  if (ct.startsWith("audio/")) {
    const ext = ct.split("/")[1] || "mp3";
    return {
      url,
      mimeType: ct,
      name: `${Date.now()}`,
      extension: ext,
    };
  }

  if (ct.startsWith("application/") || ct.startsWith("text/")) {
    const parts = ct.split("/");
    const extPart = parts[1] || "txt";
    return {
      url,
      mimeType: ct,
      name: `${Date.now()}`,
      extension: extPart.split(";")[0] || "txt",
    };
  }

  return null;
}

function collectAttachments(atts: Attachment[] | null | undefined): Link[] {
  const out: Link[] = [];

  for (const a of atts || []) {
    let url = a.url || a.image;
    let mime = a.mimeType;
    let name = a.filename || `${Date.now()}`;
    let ext = a.original_extension;

    const t = a.type;

    if (!url) continue;

    if (t === "photo") {
      mime = "image/jpeg";
      ext = "jpeg";
    } else if (t === "video") {
      mime = "video/mp4";
      ext = "mp4";
    } else if (t === "audio") {
      mime = "audio/mp3";
      ext = "mp3";
    } else if (t === "file") {
      const ct = a.contentType;
      if (ct === "attach:ms:word") {
        mime =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        ext = "docx";
      } else if (ct === "attach:ms:ppt") {
        mime =
          "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        ext = "pptx";
      } else if (ct === "attach:text") {
        mime = "text/plain";
        ext = "txt";
      } else {
        mime = "application/pdf";
        ext = "pdf";
      }
    }

    out.push({
      url,
      mimeType: mime || "application/octet-stream",
      name,
      extension: ext || "bin",
    });
  }

  return out;
}

async function handlePromptAndUrls(
  rawPrompt: string,
  event: any
): Promise<{ prompt: string; links: Link[] }> {
  let prompt = String(rawPrompt || "").trim();
  let links: Link[] = [];

  const urls = parseLinksFromPrompt(prompt);
  let scraped = "";

  for (const u of urls) {
    const link = await classifyUrlToLink(u);
    if (link && link.mimeType.startsWith("image/")) {
      links.push(link);
      prompt = prompt.replace(u, "").trim();
    } else if (
      link &&
      (link.mimeType.startsWith("text/") ||
        link.mimeType.startsWith("application/"))
    ) {
      const t = await scrapeText(u);
      if (t) scraped += t + "\n";
      prompt = prompt.replace(u, "").trim();
    }
  }

  if (event.type === "message_reply")
    links = links.concat(
      collectAttachments(event.messageReply?.attachments || [])
    );

  links = links.concat(collectAttachments(event.attachments || []));

  if (scraped) prompt = `${scraped}\n${prompt}`.trim();

  return { prompt, links };
}

function parseSubcmd(raw: string): ParsedSubcmd {
  const body = String(raw || "").trim();
  const m = body.match(/^\/?(system|clear|memory)\b/i);

  if (!m || !m[1]) return { type: null, rest: body };

  const type = m[1].toLowerCase() as "system" | "clear" | "memory";
  const rest = body.replace(/^\/?(system|clear|memory)\b/i, "").trim();

  return { type, rest };
}

const geminiCommand: Command = {
  name: "gemini",
  alias: ["genimi"],
  version: "2.1.0",
  role: 0,
  desc: "Gemini 2.5 Flash đa phương thức với bộ nhớ thông minh và persona",
  guide:
    "{pn} <nội dung>\n{pn} system <tính cách>\n{pn} clear\n{pn} memory",
  cd: 5,
  prefix: true,

  onCall: async function () { },

  onChat: async function (ctx: CommandOnChatContext): Promise<void> {
    const { reply, react, main, event, commandName } = ctx;

    if (!event.body) return;

    const parts = event.body.trim().split(/\s+/);
    const w0 = parts[0]?.toLowerCase() || "";
    const prefix = Prefixes.includes(w0) ? w0 : null;

    if (!prefix) return;

    const body = event.body.slice(prefix.length).trim();
    const uid = event.senderID;
    const threadID = event.threadID;
    const s = getSettings(threadID);
    const { type, rest } = parseSubcmd(body);

    if (type === "system") {
      setPersona(threadID, rest);
      react?.("✅");
      await reply?.("Đã cập nhật tính cách.");
      return;
    }

    if (type === "clear") {
      writeJSON(statePath(uid), { summary: "", history: [] });
      react?.("✅");
      await reply?.("Đã xoá bộ nhớ hội thoại.");
      return;
    }

    if (type === "memory") {
      const st = loadState(uid);
      const sum = st.summary ? st.summary.slice(0, 800) : "(trống)";
      await reply?.(
        `Tóm lược: ${sum}\nLượt lưu: ${st.history?.length || 0}`
      );
      return;
    }

    const basePrompt = body.length ? body : "gemini";
    const { prompt, links } = await handlePromptAndUrls(basePrompt, event);

    try {
      const answer = await getAnswer({
        prompt,
        uid,
        links,
        persona: s.persona,
      });

      reply?.(answer, (err: any, info: any) => {
        if (!err)
          main.onReply.set(info.messageID, {
            commandName,
            messageID: info.messageID,
            author: event.senderID,
          });
      });

      react?.("✅");
    } catch (e: any) {
      react?.("❌");
      reply?.(String(e?.message || e || "Lỗi"));
    }
  },

  onReply: async function (ctx: CommandOnReplyContext): Promise<void> {
    const { reply, react, main, event, Reply, args } = ctx;

    if (!Reply) return;
    const replyData = Reply as GeminiReplyData;
    if (event.senderID !== replyData.author) return;

    const uid = event.senderID;
    const threadID = event.threadID;
    const s = getSettings(threadID);
    let prompt = args.join(" ").trim();

    const { type, rest } = parseSubcmd(prompt);

    if (type === "system") {
      setPersona(threadID, rest);
      react?.("✅");
      await reply?.("Đã cập nhật tính cách.");
      return;
    }

    if (type === "clear") {
      writeJSON(statePath(uid), { summary: "", history: [] });
      react?.("✅");
      await reply?.("Đã xoá bộ nhớ hội thoại.");
      return;
    }

    if (type === "memory") {
      const st = loadState(uid);
      const sum = st.summary ? st.summary.slice(0, 800) : "(trống)";
      await reply?.(
        `Tóm lược: ${sum}\nLượt lưu: ${st.history?.length || 0}`
      );
      return;
    }

    if (!prompt && (!event.attachments || !event.attachments.length)) return;

    const { prompt: p2, links } = await handlePromptAndUrls(prompt, event);

    const mergedLinks = Array.isArray(replyData.previousAttachments)
      ? collectAttachments(replyData.previousAttachments).concat(links)
      : links;

    try {
      const answer = await getAnswer({
        prompt: p2,
        uid,
        links: mergedLinks,
        persona: s.persona,
      });

      reply?.(answer, (err: any, info: any) => {
        if (!err)
          main.onReply.set(info.messageID, {
            commandName: replyData.commandName,
            messageID: info.messageID,
            author: event.senderID,
          });
      });

      react?.("✅");
    } catch (e: any) {
      react?.("❌");
      reply?.(String(e?.message || e || "Lỗi"));
    }
  },
};

export default geminiCommand;
