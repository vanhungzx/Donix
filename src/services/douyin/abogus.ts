import crypto from "crypto";
import { existsSync, readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Load get_abogus từ douyin.js
let getAbogusFunc: ((params: string, postData: string, userAgent: string) => string) | null = null;
let isLoading = false;
let loadAttempted = false;

function _loadDouyinSignScript(): void {
  if (getAbogusFunc || isLoading) return; // Đã load rồi hoặc đang load
  if (loadAttempted) return; // Đã thử load nhưng fail, không thử lại

  isLoading = true;

  try {
    const possiblePaths = [
      join(__dirname, "./douyin.js"),
      join(process.cwd(), "pkg/douyin.js"),
      join(__dirname, "../../pkg/douyin.js"),
    ];

    let scriptPath: string | null = null;
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        scriptPath = path;
        break;
      }
    }

    if (!scriptPath) {
      console.warn("[douyinSign] Không tìm thấy file pkg/douyin.js");
      return;
    }

    const scriptContent = readFileSync(scriptPath, "utf-8");
    const vm = require("vm");

    // Tạo context giống DouyinSignV2
    const createElementFunc = function (tag: string) {
      const elem: any = {
        tagName: tag || "",
        nodeName: tag || "",
        nodeType: 1,
        readyState: "complete",
        addEventListener: function () { },
        removeEventListener: function () { },
        setAttribute: function () { },
        getAttribute: function () {
          return null;
        },
        appendChild: function () {
          return this;
        },
        removeChild: function () {
          return this;
        },
      };
      Object.defineProperty(elem, "onreadystatechange", {
        value: null,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      return elem;
    };

    const documentObj = {
      createElement: createElementFunc,
      all: [],
      documentElement: {
        nodeType: 1,
        tagName: "HTML",
      },
      createEvent: function () {
        return {
          initEvent: function () { },
        };
      },
      body: null,
    };

    let performanceObj: any;
    try {
      const { performance } = require("perf_hooks");
      performanceObj = performance;
    } catch (e) {
      performanceObj = {
        now: function () {
          return Date.now();
        },
        timing: {},
        navigation: {},
      };
    }

    const sandbox: any = {
      window: {},
      global: {},
      document: documentObj,
      navigator: {
        userAgent: "Mozilla/5.0",
        platform: "Win32",
      },
      location: {},
      performance: performanceObj,
      console: console,
      require: require,
      module: { exports: {} },
      exports: {},
      globalThis: {},
      XMLHttpRequest: function () {
        return "XMLHttpRequest() { [native code] }";
      },
      // Add bundler/webpack variables that might be referenced
      __name: function () { return scriptPath || "douyin.js"; },
      __filename: scriptPath || "douyin.js",
      __dirname: scriptPath ? dirname(scriptPath) : __dirname,
    };

    sandbox.window = sandbox.global;
    sandbox.globalThis = sandbox.global;
    sandbox.window.performance = performanceObj;
    sandbox.global.performance = performanceObj;

    // Make bundler variables available on window and global
    sandbox.window.__name = sandbox.__name;
    sandbox.window.__filename = sandbox.__filename;
    sandbox.window.__dirname = sandbox.__dirname;
    sandbox.global.__name = sandbox.__name;
    sandbox.global.__filename = sandbox.__filename;
    sandbox.global.__dirname = sandbox.__dirname;

    // Also add as getter properties in case they're accessed differently
    Object.defineProperty(sandbox.window, '__name', {
      get: () => scriptPath || "douyin.js",
      configurable: true
    });
    Object.defineProperty(sandbox.global, '__name', {
      get: () => scriptPath || "douyin.js",
      configurable: true
    });

    // Setup window properties như trong douyin.js
    sandbox.window.innerWidth = 1680;
    sandbox.window.innerHeight = 904;
    sandbox.window.outerWidth = 1680;
    sandbox.window.outerHeight = 1025;
    sandbox.window.screenX = -1680;
    sandbox.window.screenY = 25;
    sandbox.window.pageYOffset = 0;
    sandbox.window.screen = {
      availWidth: 1680,
      availHeight: 904,
      width: 1680,
      height: 1025,
      colorDepth: 24,
      pixelDepth: 24,
      orientation: {
        type: "landscape-primary",
        angle: 0,
      },
    };
    sandbox.window.requestAnimationFrame = function () {
      return "requestAnimationFrame() { [native code] }";
    };
    sandbox.window._sdkGlueVersionMap = {
      sdkGlueVersion: "1.0.0.49",
      bdmsVersion: "1.0.1.1",
      captchaVersion: "4.0.2",
    };

    const context = vm.createContext(sandbox);

    // Fix document.createElement trước khi chạy script
    let fixedScriptContent = scriptContent.replace(
      /document\.createElement\s*=\s*function\s*\(\s*\)\s*\{[\s\S]*?return\s*"createElement\(\)\s*\{\s*\[native\s+code\]\s*\}"[\s\S]*?\};?/g,
      `document.createElement = ${createElementFunc.toString()};`
    );

    vm.runInContext(fixedScriptContent, context, {
      filename: scriptPath,
      displayErrors: true,
      timeout: 10000,
    });

    // Đảm bảo document.createElement đúng sau khi script chạy
    if (context.document) {
      context.document.createElement = createElementFunc;
    }

    // Đảm bảo get_abogus được expose vào global scope nếu nó được định nghĩa trong window
    if (context.window?.get_abogus && !context.get_abogus) {
      context.get_abogus = context.window.get_abogus;
    }

    // Đảm bảo window.a_bogus được expose nếu có
    if (context.window?.a_bogus && typeof context.window.a_bogus === "function") {
      // window.a_bogus đã có sẵn, không cần làm gì thêm
    }

    // Tìm function get_abogus hoặc window.a_bogus từ douyin.js
    // Ưu tiên: get_abogus > window.get_abogus > window.a_bogus
    if (context.get_abogus && typeof context.get_abogus === "function") {
      // Sử dụng get_abogus trực tiếp từ global scope
      const getAbogus = context.get_abogus;
      getAbogusFunc = (params: string, postData: string, userAgent: string) => {
        try {
          return getAbogus.call(context, params, postData, userAgent);
        } catch (e) {
          console.warn("[douyinSign] Lỗi khi gọi get_abogus:", e);
          return null;
        }
      };
      console.log("[douyinSign] Đã load get_abogus từ global scope");
    } else if (
      context.window?.get_abogus &&
      typeof context.window.get_abogus === "function"
    ) {
      // Sử dụng window.get_abogus
      const getAbogus = context.window.get_abogus;
      getAbogusFunc = (params: string, postData: string, userAgent: string) => {
        try {
          return getAbogus.call(context.window, params, postData, userAgent);
        } catch (e) {
          console.warn("[douyinSign] Lỗi khi gọi window.get_abogus:", e);
          return null;
        }
      };
      console.log("[douyinSign] Đã load get_abogus từ window");
    } else if (
      context.window?.a_bogus &&
      typeof context.window.a_bogus === "function"
    ) {
      // Sử dụng window.a_bogus trực tiếp với arguments [0,1,8, params, post_data, user_agent]
      const aBogus = context.window.a_bogus;
      getAbogusFunc = (params: string, postData: string, userAgent: string) => {
        try {
          return aBogus.apply(context.window, [0, 1, 8, params, postData, userAgent]);
        } catch (e) {
          console.warn("[douyinSign] Lỗi khi gọi window.a_bogus:", e);
          return null;
        }
      };
      console.log("[douyinSign] Đã load window.a_bogus");
    } else {
      console.warn("[douyinSign] Không tìm thấy function get_abogus hoặc window.a_bogus");
      console.warn("[douyinSign] Available in context:", Object.keys(context).filter(k => k.includes('abogus') || k.includes('get_') || k === 'window'));
      if (context.window) {
        const windowKeys = Object.keys(context.window).filter(k => k.includes('abogus') || k.includes('get_') || k.includes('bdms'));
        console.warn("[douyinSign] Available in window:", windowKeys.length > 0 ? windowKeys : 'Không có key liên quan');
      } else {
        console.warn("[douyinSign] window is null hoặc undefined");
      }
      loadAttempted = true;
    }
  } catch (error: any) {
    console.error("[douyinSign] Lỗi khi load douyin.js:", error?.message);
    loadAttempted = true;
  } finally {
    isLoading = false;
  }
}

/**
 * Class SM3 Hash Algorithm
 */
class SM3 {
  private reg: number[];
  private chunk: number[];
  private size: number;

  constructor() {
    this.reg = [];
    this.chunk = [];
    this.size = 0;
    this.reset();
  }

  reset(): void {
    this.reg[0] = 1937774191;
    this.reg[1] = 1226093241;
    this.reg[2] = 388252375;
    this.reg[3] = 3666478592;
    this.reg[4] = 2842636476;
    this.reg[5] = 372324522;
    this.reg[6] = 3817729613;
    this.reg[7] = 2969243214;
    this.chunk = [];
    this.size = 0;
  }

  write(e: string | number[]): void {
    const a = typeof e === "string" ? this.stringToBytes(e) : e;
    this.size += a.length;

    let f = 64 - this.chunk.length;
    if (a.length < f) {
      this.chunk = this.chunk.concat(a);
    } else {
      this.chunk = this.chunk.concat(a.slice(0, f));
      while (this.chunk.length >= 64) {
        this._compress(this.chunk);
        if (f < a.length) {
          this.chunk = a.slice(f, Math.min(f + 64, a.length));
        } else {
          this.chunk = [];
        }
        f += 64;
      }
    }
  }

  sum(e?: string | number[], t?: string): string | number[] {
    if (e) {
      this.reset();
      this.write(e);
    }
    this._fill();
    for (let f = 0; f < this.chunk.length; f += 64) {
      this._compress(this.chunk.slice(f, f + 64));
    }
    let i: string | number[] | null = null;
    if (t === "hex") {
      i = "";
      for (let f = 0; f < 8; f++) {
        const regVal = this.reg[f];
        if (regVal !== undefined) {
          i += this.padHex(regVal.toString(16), 8);
        }
      }
    } else {
      i = new Array(32) as number[];
      for (let f = 0; f < 8; f++) {
        let c = this.reg[f];
        if (c === undefined) continue;
        const idx3 = 4 * f + 3;
        const idx2 = 4 * f + 2;
        const idx1 = 4 * f + 1;
        const idx0 = 4 * f;
        if (idx3 < i.length) i[idx3] = (255 & c) >>> 0;
        c >>>= 8;
        if (idx2 < i.length) i[idx2] = (255 & c) >>> 0;
        c >>>= 8;
        if (idx1 < i.length) i[idx1] = (255 & c) >>> 0;
        c >>>= 8;
        if (idx0 < i.length) i[idx0] = (255 & c) >>> 0;
      }
    }
    this.reset();
    return i!;
  }

  private _compress(t: number[]): void {
    if (t.length < 64) {
      console.error("compress error: not enough data");
      return;
    }

    const f = ((e: number[]) => {
      const r = new Array<number>(132);
      for (let t2 = 0; t2 < 16; t2++) {
        const idx0 = 4 * t2;
        const idx1 = idx0 + 1;
        const idx2 = idx0 + 2;
        const idx3 = idx0 + 3;
        const val0 = e[idx0] ?? 0;
        const val1 = e[idx1] ?? 0;
        const val2 = e[idx2] ?? 0;
        const val3 = e[idx3] ?? 0;
        let rVal = val0 << 24;
        rVal |= val1 << 16;
        rVal |= val2 << 8;
        rVal |= val3;
        r[t2] = rVal >>> 0;
      }
      for (let n = 16; n < 68; n++) {
        const r16 = r[n - 16] ?? 0;
        const r9 = r[n - 9] ?? 0;
        const r3 = r[n - 3] ?? 0;
        const r13 = r[n - 13] ?? 0;
        const r6 = r[n - 6] ?? 0;
        let a = r16 ^ r9 ^ this.le(r3, 15);
        a = a ^ this.le(a, 15) ^ this.le(a, 23);
        r[n] = (a ^ this.le(r13, 7) ^ r6) >>> 0;
      }
      for (let n = 0; n < 64; n++) {
        const rn = r[n] ?? 0;
        const rn4 = r[n + 4] ?? 0;
        r[n + 68] = (rn ^ rn4) >>> 0;
      }
      return r;
    }).call(this, t);

    const i = this.reg.slice(0);
    for (let c = 0; c < 64; c++) {
      const i0 = i[0] ?? 0;
      const i1 = i[1] ?? 0;
      const i2 = i[2] ?? 0;
      const i3 = i[3] ?? 0;
      const i4 = i[4] ?? 0;
      const i5 = i[5] ?? 0;
      const i6 = i[6] ?? 0;
      const i7 = i[7] ?? 0;
      const fc68 = f[c + 68] ?? 0;
      const fc = f[c] ?? 0;

      let o = this.le(i0, 12) + i4 + this.le(this.de(c), c);
      o = (o & 0xffffffff) >>> 0;
      o = this.le(o, 7);
      const s = (o ^ this.le(i0, 12)) >>> 0;

      let u = this.pe(c, i0, i1, i2);
      u = (u + i3 + s + fc68) & 0xffffffff;

      let b = this.he(c, i4, i5, i6);
      b = (b + i7 + o + fc) & 0xffffffff;

      i[3] = i2;
      i[2] = this.le(i1, 9);
      i[1] = i0;
      i[0] = u >>> 0;

      i[7] = i6;
      i[6] = this.le(i5, 19);
      i[5] = i4;
      i[4] = (b ^ this.le(b, 9) ^ this.le(b, 17)) >>> 0;
    }

    for (let l = 0; l < 8; l++) {
      const regVal = this.reg[l] ?? 0;
      const iVal = i[l] ?? 0;
      this.reg[l] = (regVal ^ iVal) >>> 0;
    }
  }

  private _fill(): void {
    let a = 8 * this.size;
    let f = this.chunk.push(128) % 64;
    while (64 - f < 8) {
      f -= 64;
    }
    while (f < 56) {
      this.chunk.push(0);
      f++;
    }
    for (let i = 0; i < 4; i++) {
      const c = Math.floor(a / 4294967296);
      this.chunk.push((c >>> (8 * (3 - i))) & 255);
    }
    for (let i = 0; i < 4; i++) {
      this.chunk.push((a >>> (8 * (3 - i))) & 255);
    }
  }

  private de(e: number): number {
    if (e >= 0 && e < 16) return 2043430169;
    if (e >= 16 && e < 64) return 2055708042;
    console.error("invalid j for constant Tj");
    return 0;
  }

  private pe(e: number, r: number, t: number, n: number): number {
    if (e >= 0 && e < 16) return (r ^ t ^ n) >>> 0;
    if (e >= 16 && e < 64) return (r & t) | (r & n) | (t & n);
    console.error("invalid j for bool function FF");
    return 0;
  }

  private he(e: number, r: number, t: number, n: number): number {
    if (e >= 0 && e < 16) return (r ^ t ^ n) >>> 0;
    if (e >= 16 && e < 64) return (r & t) | (~r & n);
    console.error("invalid j for bool function GG");
    return 0;
  }

  private le(e: number, r: number): number {
    r %= 32;
    return ((e << r) | (e >>> (32 - r))) >>> 0;
  }

  private stringToBytes(str: string): number[] {
    const n = encodeURIComponent(str).replace(
      /%([0-9A-F]{2})/g,
      (_, r) => String.fromCharCode(parseInt(r, 16))
    );
    const a = new Array<number>(n.length);
    for (let i = 0; i < n.length; i++) {
      a[i] = n.charCodeAt(i);
    }
    return a;
  }

  private padHex(num: string, size: number): string {
    return num.padStart(size, "0");
  }
}

/**
 * RC4 Encryption
 */
function rc4_encrypt(plaintext: string, key: string): string {
  const s: number[] = [];
  for (let i = 0; i < 256; i++) s[i] = i;

  let j = 0;
  for (let i = 0; i < 256; i++) {
    const si = s[i] ?? 0;
    j = (j + si + key.charCodeAt(i % key.length)) % 256;
    const temp = si;
    const sj = s[j] ?? 0;
    s[i] = sj;
    s[j] = temp;
  }

  let i = 0;
  j = 0;
  const cipher: string[] = [];
  for (let k = 0; k < plaintext.length; k++) {
    i = (i + 1) % 256;
    const si = s[i] ?? 0;
    j = (j + si) % 256;
    const temp = si;
    const sj = s[j] ?? 0;
    s[i] = sj;
    s[j] = temp;
    const t = (si + sj) % 256;
    const st = s[t] ?? 0;
    cipher.push(String.fromCharCode(st ^ plaintext.charCodeAt(k)));
  }
  return cipher.join("");
}

/**
 * Get long integer from string
 */
function get_long_int(round: number, long_str: string): number {
  round = round * 3;
  return (
    (long_str.charCodeAt(round) << 16) |
    (long_str.charCodeAt(round + 1) << 8) |
    long_str.charCodeAt(round + 2)
  );
}

/**
 * Result encrypt with custom base64
 */
function result_encrypt(
  long_str: string,
  num: "s0" | "s1" | "s2" | "s3" | "s4"
): string {
  const s_obj: Record<string, string> = {
    s0: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
    s1: "Dkdpgh4ZKsQB80/Mfvw36XI1R25+WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=",
    s2: "Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=",
    s3: "ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzmFjJnryx9HVGDaStCe",
    s4: "Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe",
  };

  const constant: any = {
    0: 16515072,
    1: 258048,
    2: 4032,
    str: s_obj[num],
  };

  let result = "";
  let lound = 0;
  let long_int = get_long_int(lound, long_str);

  for (let i = 0; i < (long_str.length / 3) * 4; i++) {
    if (Math.floor(i / 4) !== lound) {
      lound += 1;
      long_int = get_long_int(lound, long_str);
    }
    const key = i % 4;
    let temp_int: number;
    switch (key) {
      case 0:
        temp_int = (long_int & constant["0"]) >> 18;
        result += constant["str"].charAt(temp_int);
        break;
      case 1:
        temp_int = (long_int & constant["1"]) >> 12;
        result += constant["str"].charAt(temp_int);
        break;
      case 2:
        temp_int = (long_int & constant["2"]) >> 6;
        result += constant["str"].charAt(temp_int);
        break;
      case 3:
        temp_int = long_int & 63;
        result += constant["str"].charAt(temp_int);
        break;
    }
  }

  return result;
}

/**
 * Generate random bytes
 */
function gener_random(random: number, option: [number, number]): number[] {
  return [
    ((random & 255) & 170) | (option[0] & 85),
    ((random & 255) & 85) | (option[0] & 170),
    ((random >> 8) & 255 & 170) | (option[1] & 85),
    ((random >> 8) & 255 & 85) | (option[1] & 170),
  ];
}

/**
 * Generate RC4 BB string - FIXED VERSION
 * Fix: Arguments parameter should be [0, 1, 14] based on reference implementation
 */
function generate_rc4_bb_str(
  url_search_params: string,
  user_agent: string,
  window_env_str: string,
  suffix = "cus",
  Arguments: [number, number, number] = [0, 1, 14]
): string {
  const sm3 = new SM3();
  const start_time = Date.now();

  const url_search_params_list = sm3.sum(sm3.sum(url_search_params + suffix)) as number[];
  const cus = sm3.sum(sm3.sum(suffix)) as number[];

  // Fix: RC4 key for user_agent encryption - use Arguments values
  // Note: The original had [390625e-8, 1, 14] which evaluates to [0, 1, 14]
  // But we need to check if it should be the actual char codes
  const uaRc4Key = String.fromCharCode(Arguments[0], Arguments[1], Arguments[2]);
  const ua = sm3.sum(
    result_encrypt(
      rc4_encrypt(user_agent, uaRc4Key),
      "s3"
    )
  ) as number[];

  const end_time = Date.now();

  const b: any = {
    8: 3,
    10: end_time,
    15: {
      aid: 6383,
      pageId: 6241,
    },
    16: start_time,
    18: 44,
  };

  b[20] = (b[16] >> 24) & 255;
  b[21] = (b[16] >> 16) & 255;
  b[22] = (b[16] >> 8) & 255;
  b[23] = b[16] & 255;
  b[24] = (b[16] / 256 / 256 / 256 / 256) >> 0;
  b[25] = (b[16] / 256 / 256 / 256 / 256 / 256) >> 0;

  b[26] = (Arguments[0] >> 24) & 255;
  b[27] = (Arguments[0] >> 16) & 255;
  b[28] = (Arguments[0] >> 8) & 255;
  b[29] = Arguments[0] & 255;

  b[30] = (Arguments[1] / 256) & 255;
  b[31] = Arguments[1] % 256 & 255;
  b[32] = (Arguments[1] >> 24) & 255;
  b[33] = (Arguments[1] >> 16) & 255;

  b[34] = (Arguments[2] >> 24) & 255;
  b[35] = (Arguments[2] >> 16) & 255;
  b[36] = (Arguments[2] >> 8) & 255;
  b[37] = Arguments[2] & 255;

  b[38] = url_search_params_list[21];
  b[39] = url_search_params_list[22];
  b[40] = cus[21];
  b[41] = cus[22];
  b[42] = ua[23];
  b[43] = ua[24];

  b[44] = (b[10] >> 24) & 255;
  b[45] = (b[10] >> 16) & 255;
  b[46] = (b[10] >> 8) & 255;
  b[47] = b[10] & 255;
  b[48] = b[8];
  b[49] = (b[10] / 256 / 256 / 256 / 256) >> 0;
  b[50] = (b[10] / 256 / 256 / 256 / 256 / 256) >> 0;

  b[51] = b[15].pageId;
  b[52] = (b[15].pageId >> 24) & 255;
  b[53] = (b[15].pageId >> 16) & 255;
  b[54] = (b[15].pageId >> 8) & 255;
  b[55] = b[15].pageId & 255;

  b[56] = b[15].aid;
  b[57] = b[15].aid & 255;
  b[58] = (b[15].aid >> 8) & 255;
  b[59] = (b[15].aid >> 16) & 255;
  b[60] = (b[15].aid >> 24) & 255;

  const window_env_list: number[] = [];
  for (let index = 0; index < window_env_str.length; index++) {
    window_env_list.push(window_env_str.charCodeAt(index));
  }

  b[64] = window_env_list.length;
  b[65] = b[64] & 255;
  b[66] = (b[64] >> 8) & 255;

  b[69] = [].length;
  b[70] = b[69] & 255;
  b[71] = (b[69] >> 8) & 255;

  b[72] =
    b[18] ^
    b[20] ^
    b[26] ^
    b[30] ^
    b[38] ^
    b[40] ^
    b[42] ^
    b[21] ^
    b[27] ^
    b[31] ^
    b[35] ^
    b[39] ^
    b[41] ^
    b[43] ^
    b[22] ^
    b[28] ^
    b[32] ^
    b[36] ^
    b[23] ^
    b[29] ^
    b[33] ^
    b[37] ^
    b[44] ^
    b[45] ^
    b[46] ^
    b[47] ^
    b[48] ^
    b[49] ^
    b[50] ^
    b[24] ^
    b[25] ^
    b[52] ^
    b[53] ^
    b[54] ^
    b[55] ^
    b[57] ^
    b[58] ^
    b[59] ^
    b[60] ^
    b[65] ^
    b[66] ^
    b[70] ^
    b[71];

  let bb: number[] = [
    b[18],
    b[20],
    b[52],
    b[26],
    b[30],
    b[34],
    b[58],
    b[38],
    b[40],
    b[53],
    b[42],
    b[21],
    b[27],
    b[54],
    b[55],
    b[31],
    b[35],
    b[57],
    b[39],
    b[41],
    b[43],
    b[22],
    b[28],
    b[32],
    b[60],
    b[36],
    b[23],
    b[29],
    b[33],
    b[37],
    b[44],
    b[45],
    b[59],
    b[46],
    b[47],
    b[48],
    b[49],
    b[50],
    b[24],
    b[25],
    b[65],
    b[66],
    b[70],
    b[71],
  ];

  bb = bb.concat(window_env_list).concat(b[72]);

  // Fix: RC4 key - based on reference implementation, it should be char code 121 (y)
  // This is a constant value used in the original implementation
  const rc4Key = String.fromCharCode(121);
  return rc4_encrypt(
    String.fromCharCode.apply(null, bb as unknown as number[]),
    rc4Key
  );
}

/**
 * Generate random string
 */
function generate_random_str(): string {
  let random_str_list: number[] = [];
  random_str_list = random_str_list.concat(
    gener_random(Math.random() * 1e4, [3, 45])
  );
  random_str_list = random_str_list.concat(
    gener_random(Math.random() * 1e4, [1, 0])
  );
  random_str_list = random_str_list.concat(
    gener_random(Math.random() * 1e4, [1, 5])
  );
  return String.fromCharCode.apply(null, random_str_list as unknown as number[]);
}

/**
 * Generate window environment string
 * Format: "width|height|width|height|0|30|0|0|width|height|width|height|width-11|height|24|24|platform"
 */
function generate_window_env_str(): string {
  // Default values based on common browser settings
  const innerWidth = 1536;
  const innerHeight = 747;
  const outerWidth = 1536;
  const outerHeight = 834;
  const screenX = 0;
  const screenY = 30;
  const pageXOffset = 0;
  const pageYOffset = 0;
  const screenWidth = 1536;
  const screenHeight = 834;
  const availWidth = 1536;
  const availHeight = 864;
  const colorDepth = 1525; // innerWidth - 11
  const pixelDepth = 747; // innerHeight
  const orientation = 24;
  const angle = 24;
  const platform = "Win32";

  return `${innerWidth}|${innerHeight}|${outerWidth}|${outerHeight}|${screenX}|${screenY}|${pageXOffset}|${pageYOffset}|${screenWidth}|${screenHeight}|${availWidth}|${availHeight}|${colorDepth}|${pixelDepth}|${orientation}|${angle}|${platform}`;
}

/**
 * Generate a_bogus signature
 */
const a_bogus_default = (url: string, user_agent: string): string => {
  const urlObj = new URL(url);
  const queryParams = urlObj.search.substring(1); // Remove '?'

  const windowEnvStr = generate_window_env_str();
  const Arguments: [number, number, number] = [0, 1, 14];

  const result_str =
    generate_random_str() +
    generate_rc4_bb_str(
      queryParams,
      user_agent,
      windowEnvStr,
      "cus",
      Arguments
    );
  return result_encrypt(result_str, "s4") + "=";
};

/**
 * Douyin Sign Class
 */
export class douyinSign {
  static Mstoken(length: number): string {
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const randomBytes = crypto.randomBytes(length);
    return Array.from(
      randomBytes,
      (byte) => characters[byte % characters.length]
    ).join("");
  }

  static AB(url: string, user_agent: string): string {
    // Load get_abogus từ douyin.js nếu chưa load
    if (!getAbogusFunc && !loadAttempted) {
      _loadDouyinSignScript();
    }

    // Ưu tiên dùng get_abogus từ douyin.js
    if (getAbogusFunc) {
      try {
        const urlObj = new URL(url);
        const queryParams = urlObj.search.substring(1); // Remove '?'
        const aBogus = getAbogusFunc(queryParams, "", user_agent);
        if (aBogus && aBogus.length > 0) {
          return aBogus;
        }
      } catch (e) {
        console.warn("[douyinSign] Lỗi khi dùng get_abogus, fallback về custom:", e);
      }
    }

    // Fallback về custom implementation nếu không có get_abogus
    return a_bogus_default(url, user_agent);
  }

  static VerifyFpManager(): string {
    const e = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split(
      ""
    );
    const t = e.length;
    const n = new Date().getTime().toString(36);
    const r: string[] = [];
    r[8] = "_";
    r[13] = "_";
    r[18] = "_";
    r[23] = "_";
    r[14] = "4";
    for (let o, i = 0; i < 36; i++) {
      if (!r[i]) {
        o = (Math.random() * t) | 0;
        const eIdx = i === 19 ? (3 & o) | 8 : o;
        const eVal = e[eIdx];
        if (eVal !== undefined) {
          r[i] = eVal;
        }
      }
    }
    return "verify_" + n + "_" + r.join("");
  }
}
