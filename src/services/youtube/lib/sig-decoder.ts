import { writeFileSync } from "fs";
import { request } from "undici";
import vm from "vm";
import { getAntiDetectionManager } from "./anti-detection.js";
import { saveDebugFile } from "./utils.js";
import type { StatusCodeError, YoutubeFormat } from "./types.js";

interface CipherScript {
  globalVars: string;
  nFunction: string;
  rawScript: string;
  scriptUrl: string;
  sigActions: string;
  sigFunction: string;
  timestamp: string;
}

const PATTERNS = {
  TIMESTAMP: /(signatureTimestamp|sts):(\d+)/,
  GLOBAL_VARS:
    /('use\s*strict';)?(?<code>var\s*(?<varname>[a-zA-Z0-9_$]+)\s*=\s*(?<value>(?:"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')\.split\((?:"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')\)|[\[](?:(?:"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')\s*,?\s*)*[\]]|"[^"]*"\.split\("[^"]*"\)))/,
  ACTIONS:
    /var\s+([$A-Za-z0-9_]+)\s*=\s*\{\s*["']?[a-zA-Z_$][a-zA-Z_0-9$]*["']?\s*:\s*function\s*\([^)]*\)\s*\{[^{}]*(?:\{[^{}]*}[^{}]*)*}\s*,\s*["']?[a-zA-Z_$][a-zA-Z_0-9$]*["']?\s*:\s*function\s*\([^)]*\)\s*\{[^{}]*(?:\{[^{}]*}[^{}]*)*}\s*,\s*["']?[a-zA-Z_$][a-zA-Z_0-9$]*["']?\s*:\s*function\s*\([^)]*\)\s*\{[^{}]*(?:\{[^{}]*}[^{}]*)*}\s*};/,
  SIG_FUNCTION:
    /function(?:\s+[a-zA-Z_$][a-zA-Z_0-9$]*)?\(([a-zA-Z_$][a-zA-Z_0-9$]*)\)\{[a-zA-Z_$][a-zA-Z_0-9$]*=[a-zA-Z_$][a-zA-Z_0-9$]*.*?\(\1,\d+\);return\s*\1.*};/,
  N_FUNCTION:
    /function\(\s*([a-zA-Z_$][a-zA-Z_0-9$]*)\s*\)\s*\{var\s*([a-zA-Z_$][a-zA-Z_0-9$]*)=\1\[[a-zA-Z_$][a-zA-Z_0-9$]*\[\d+\]\]\([a-zA-Z_$][a-zA-Z_0-9$]*\[\d+\]\).*?catch\(\s*(\w+)\s*\)\s*\{\s*return.*?\+\s*\1\s*}\s*return\s*\2\[[a-zA-Z_$][a-zA-Z_0-9$]*\[\d+\]\]\([a-zA-Z_$][a-zA-Z_0-9$]*\[\d+\]\)};/s,
  PLAYER_SCRIPT_URL: /"jsUrl":"([^"]+)"/,
} as const;

function decipherSignature(signature: string): string {
  const chars = signature.split("");
  chars.splice(0, 2);
  chars.splice(0, 1);
  return chars.join("");
}

class SignatureDecoder {
  private cachedPlayerScript: string | null = null;
  private cipherCache = new Map<string, CipherScript>();
  private dumpedScriptUrls = new Set<string>();
  private playerScriptExpiry = 0;

  async getCachedPlayerScript(): Promise<string> {
    const now = Date.now();
    if (this.cachedPlayerScript && now < this.playerScriptExpiry) {
      return this.cachedPlayerScript;
    }

    const antiDetection = getAntiDetectionManager();
    const headers = antiDetection.generateHeaders({ includeReferer: true });
    await antiDetection.waitForRateLimit();
    await antiDetection.applyDelay();
    antiDetection.recordRequest();

    const response = await request("https://www.youtube.com/embed/", { method: "GET", headers });
    const body = await response.body.text();
    const match = body.match(PATTERNS.PLAYER_SCRIPT_URL);
    const scriptUrl = match?.[1];
    if (!scriptUrl) {
      throw new Error("Could not find player script URL in embed page");
    }

    const normalizedUrl = scriptUrl.startsWith("//")
      ? `https:${scriptUrl}`
      : scriptUrl.startsWith("/")
        ? `https://www.youtube.com${scriptUrl}`
        : scriptUrl;

    this.cachedPlayerScript = normalizedUrl.replace(/\\u0026/g, "&").replace(/\\"/g, '"');
    this.playerScriptExpiry = now + 24 * 60 * 60 * 1000;
    return this.cachedPlayerScript;
  }

  private getScriptTimestamp(script: string, scriptUrl: string): string {
    const match = script.match(PATTERNS.TIMESTAMP);
    if (!match?.[2]) {
      this.scriptExtractionFailed(script, scriptUrl, "TIMESTAMP_NOT_FOUND");
    }
    return match[2];
  }

  private extractFromScript(script: string, scriptUrl: string): CipherScript {
    const globalVarsMatch = script.match(PATTERNS.GLOBAL_VARS);
    const globalVars = globalVarsMatch?.groups?.code;
    if (!globalVars) {
      this.scriptExtractionFailed(script, scriptUrl, "VARIABLES_NOT_FOUND");
    }

    const actions = script.match(PATTERNS.ACTIONS)?.[0];
    if (!actions) {
      this.scriptExtractionFailed(script, scriptUrl, "SIG_ACTIONS_NOT_FOUND");
    }

    const sigFunction = script.match(PATTERNS.SIG_FUNCTION)?.[0];
    if (!sigFunction) {
      this.scriptExtractionFailed(script, scriptUrl, "DECIPHER_FUNCTION_NOT_FOUND");
    }

    let nFunction = script.match(PATTERNS.N_FUNCTION)?.[0];
    if (!nFunction) {
      this.scriptExtractionFailed(script, scriptUrl, "N_FUNCTION_NOT_FOUND");
    }

    const nParameterMatch = nFunction.match(/function\(\s*([^)]+)\s*\)/);
    if (nParameterMatch?.[1]) {
      nFunction = nFunction.replace(
        new RegExp(`if\\s*\\(typeof\\s*[^\\s()]+\\s*===?.*?\\)return ${nParameterMatch[1]}\\s*;?`, "g"),
        ""
      );
    }

    return {
      timestamp: this.getScriptTimestamp(script, scriptUrl),
      globalVars,
      sigActions: actions,
      sigFunction,
      nFunction,
      rawScript: script,
      scriptUrl,
    };
  }

  async getCipherScript(scriptUrl: string): Promise<CipherScript> {
    const normalizedUrl = scriptUrl.startsWith("//")
      ? `https:${scriptUrl}`
      : scriptUrl.startsWith("/")
        ? `https://www.youtube.com${scriptUrl}`
        : scriptUrl;

    const cached = this.cipherCache.get(normalizedUrl);
    if (cached) return cached;

    const antiDetection = getAntiDetectionManager();
    const headers = antiDetection.generateHeaders({ includeReferer: true });
    await antiDetection.waitForRateLimit();
    await antiDetection.applyDelay();
    antiDetection.recordRequest();

    const response = await request(normalizedUrl, { method: "GET", headers });
    if (response.statusCode !== 200) {
      const error = new Error(`Received non-success response code ${response.statusCode}`) as StatusCodeError;
      error.statusCode = response.statusCode;
      throw error;
    }

    const script = await response.body.text();
    const cipher = this.extractFromScript(script, normalizedUrl);
    this.cipherCache.set(normalizedUrl, cipher);
    return cipher;
  }

  applyCipher(signature: string, cipher: CipherScript): string {
    try {
      const context: Record<string, unknown> = {};
      const script = [
        cipher.globalVars,
        cipher.sigActions,
        `const decipher = ${cipher.sigFunction};`,
        `result = decipher(${JSON.stringify(signature)});`,
      ].join("\n");
      vm.runInNewContext(script, context, { timeout: 5000 });
      return typeof context.result === "string" ? context.result : decipherSignature(signature);
    } catch {
      return decipherSignature(signature);
    }
  }

  transformNParameter(nParam: string, cipher: CipherScript): string {
    try {
      const context: Record<string, unknown> = {};
      const script = [
        cipher.globalVars,
        cipher.nFunction,
        `const transform = ${cipher.nFunction};`,
        `result = transform(${JSON.stringify(nParam)});`,
      ].join("\n");
      vm.runInNewContext(script, context, { timeout: 5000 });
      return typeof context.result === "string" ? context.result : nParam;
    } catch {
      return nParam;
    }
  }

  async resolveFormatUrl(format: YoutubeFormat, playerScriptUrl: string | null = null): Promise<string> {
    const scriptUrl = playerScriptUrl || (await this.getCachedPlayerScript());

    if (format.url && !format.signatureCipher && !format.cipher && !format.s) {
      const directUrl = new URL(format.url);
      const nParam = directUrl.searchParams.get("n");
      if (nParam) {
        try {
          const cipher = await this.getCipherScript(scriptUrl);
          directUrl.searchParams.set("n", this.transformNParameter(nParam, cipher));
        } catch {
          return directUrl.toString();
        }
      }
      return directUrl.toString();
    }

    const cipherSource = format.signatureCipher || format.cipher;
    const params = new URLSearchParams(cipherSource || "");
    const baseUrl = params.get("url") || format.url;
    if (!baseUrl) {
      throw new Error("Format does not include a downloadable URL");
    }

    const url = new URL(baseUrl);
    const cipher = await this.getCipherScript(scriptUrl);
    const encryptedSignature = params.get("s") || format.s;
    if (encryptedSignature) {
      const signature = this.applyCipher(encryptedSignature, cipher);
      url.searchParams.set(params.get("sp") || format.sp || "sig", signature);
    }

    const nParam = url.searchParams.get("n");
    if (nParam) {
      url.searchParams.set("n", this.transformNParameter(nParam, cipher));
    }

    return url.toString();
  }

  private dumpScript(script: string, sourceUrl: string, failureType: string): void {
    const fileName = `${Date.now()}-cipher-${failureType}.js`;
    if (this.dumpedScriptUrls.has(sourceUrl)) return;
    this.dumpedScriptUrls.add(sourceUrl);
    writeFileSync(fileName, script);
  }

  private scriptExtractionFailed(script: string, sourceUrl: string, failureType: string): never {
    this.dumpScript(script, sourceUrl, failureType);
    throw new Error(
      `Failed to extract cipher (${failureType}) from ${sourceUrl}. Debug file: ${saveDebugFile(
        "sig-decoder.js",
        script
      )}`
    );
  }

  clearCache(): void {
    this.cipherCache.clear();
    this.cachedPlayerScript = null;
    this.playerScriptExpiry = 0;
    this.dumpedScriptUrls.clear();
  }
}

const decoderInstance = new SignatureDecoder();

export { SignatureDecoder };
export const getCachedPlayerScript = (): Promise<string> => decoderInstance.getCachedPlayerScript();
export const getCipherScript = (scriptUrl: string): Promise<CipherScript> => decoderInstance.getCipherScript(scriptUrl);
export const applyCipher = (sig: string, cipher: CipherScript): string => decoderInstance.applyCipher(sig, cipher);
export const transformNParameter = (value: string, cipher: CipherScript): string =>
  decoderInstance.transformNParameter(value, cipher);
export const resolveFormatUrl = (format: YoutubeFormat, playerScript: string | null = null): Promise<string> =>
  decoderInstance.resolveFormatUrl(format, playerScript);
export const clearCache = (): void => decoderInstance.clearCache();
