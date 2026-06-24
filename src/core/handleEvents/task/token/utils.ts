import fs from "fs-extra";
import { fileURLToPath } from "node:url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export const CONFIG_PATH = path.resolve(__dirname, "../../../config/config.json");

export const TOK = {
  INT: 7200000,
  TYPES: [
    
    
    { type: "EAAAAU", id: "350685531728" },
    { type: "EAAD6V7", id: "275254692598279" },
    { type: "EAAD", id: "256002347743983" }
  ]
} as const;

export const rmCycle = () => {
  const seen = new WeakSet<object>();
  return (_k: string, v: any) => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return;
      seen.add(v);
    }
    return v;
  };
};

export const findObjRange = (src: string, i0: number) => {
  let i = src.indexOf("{", i0);
  if (i < 0) return null as null | { start: number; end: number };
  let d = 0,
    j = i,
    qs: string | null = null,
    esc = false;
  while (j < src.length) {
    const ch = src[j];
    if (qs) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === qs) qs = null;
      j++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      qs = ch;
      j++;
      continue;
    }
    if (ch === "{") d++;
    if (ch === "}") {
      d--;
      if (d === 0) return { start: i, end: j + 1 };
    }
    j++;
  }
  return null;
};

export const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function writeTokenKey(fp: string, prop: string, key: string, val: string, logger?: any): Promise<boolean> {
  try {
    const src = await fs.readFile(fp, "utf8");
    const propRe = new RegExp(`(["'\`]?)(?:${escRe(prop)})\\1\\s*:\\s*{`, "m");
    const m = propRe.exec(src);
    if (!m) {
      logger?.error?.(`Token write fail: Không tìm thấy property "${prop}" trong file config`);
      return false;
    }
    const bracePos = m.index + m[0].length - 1;
    const rg = findObjRange(src, bracePos);
    if (!rg) {
      logger?.error?.(`Token write fail: Không tìm thấy object range cho "${prop}"`);
      return false;
    }
    const pre = src.slice(0, rg.start);
    const obj = src.slice(rg.start, rg.end);
    const suf = src.slice(rg.end);
    const escv = JSON.stringify(String(val)).slice(1, -1);
    const re = new RegExp(`([\\s,{])(['"\\\`]?)(?:${escRe(key)})(['"\\\`]?)\\s*:\\s*(['"\\\`]).*?\\4`, "s");
    let rep = obj.replace(re, (_all, a, q1, q2, vq) => `${a}${q1}${key}${q2}: ${vq}${escv}${vq}`);
    if (rep === obj) {
      const at = obj.indexOf("{") + 1;
      const tail = obj.slice(at);
      const trimmed = tail.trim();
      const needComma = trimmed.length > 0 && trimmed[0] !== "}";
      const pad = (tail.match(/^\s*/) || [" "])[0];
      const ins = `${pad}"${key}": "${String(val)}"${needComma ? "," : ""} `;
      rep = obj.slice(0, at) + ins + obj.slice(at);
    }
    const out = pre + rep + suf;
    await fs.writeFile(fp, out, "utf8");
    const verf = await fs.readFile(fp, "utf8");
    if (verf !== out) {
      logger?.error?.(`Token write fail: File verification failed sau khi ghi`);
      return false;
    }
    return true;
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    logger?.error?.(`Token write fail: ${error.message || String(e)}`);
    if (error.stack) {
      logger?.error?.(error.stack);
    }
    return false;
  }
}

export function detectPrefix(tok?: string | null): string | null {
  const p = String(tok || "").toUpperCase();
  
  if (p.startsWith("EAAAAU")) return "EAAAAU";
  if (p.startsWith("EAAAU")) return "EAAAAU"; 
  if (p.startsWith("EAAD6V7")) return "EAAD6V7";
  if (p.startsWith("EAAD")) return "EAAD";
  if (p.startsWith("EAAB")) return "EAAB";
  if (p.startsWith("EAAC")) return "EAAC";
  if (p.startsWith("EAAG")) return "EAAG";
  return null;
}
