
import axios from "axios";
import crypto from "crypto";
import fs from "fs";
const getDouyinCookie = (): string => global.cookie?.douyin ?? "";

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

function get_long_int(round: number, long_str: string): number {
  round = round * 3;
  return (
    (long_str.charCodeAt(round) << 16) |
    (long_str.charCodeAt(round + 1) << 8) |
    long_str.charCodeAt(round + 2)
  );
}

function result_encrypt(long_str: string, num: "s0" | "s1" | "s2" | "s3" | "s4"): string {
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

function gener_random(random: number, option: [number, number]): number[] {
  return [
    ((random & 255) & 170) | (option[0] & 85),
    ((random & 255) & 85) | (option[0] & 170),
    ((random >> 8) & 255 & 170) | (option[1] & 85),
    ((random >> 8) & 255 & 85) | (option[1] & 170),
  ];
}

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

  const ua = sm3.sum(
    result_encrypt(
      rc4_encrypt(
        user_agent,
        String.fromCharCode.apply(null, [390625e-8, 1, 14] as unknown as number[])
      ),
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

  return rc4_encrypt(
    String.fromCharCode.apply(null, bb as unknown as number[]),
    String.fromCharCode.apply(null, [121] as unknown as number[])
  );
}

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

const a_bogus_default = (url: string, user_agent: string): string => {
  const result_str =
    generate_random_str() +
    generate_rc4_bb_str(
      new URLSearchParams(new URL(url).search).toString(),
      user_agent,
      "1536|747|1536|834|0|30|0|0|1536|834|1536|864|1525|747|24|24|Win32"
    );
  return result_encrypt(result_str, "s4") + "=";
};

class douyinSign {
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

function generateUifid(): string {
  const characters = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < 256; i++) {
    result += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }
  return result;
}

export async function down(url: string): Promise<any> {
  async function getVideoDetail(awemeId: string | null): Promise<any> {
    if (!awemeId) {
      return {
        success: false,
        data: null,
        message: "Không lấy được awemeId",
      };
    }

    try {
      const fp = douyinSign.VerifyFpManager();
      const msToken = douyinSign.Mstoken(128);
      const uifid = generateUifid();
      const userAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
      const baseUrl = "https://www.douyin.com/aweme/v1/web/aweme/detail/";

      const params: Record<string, string | number> = {
        device_platform: "webapp",
        aid: "6383",
        channel: "channel_pc_web",
        aweme_id: awemeId,
        update_version_code: "170400",
        pc_client_type: "1",
        pc_libra_divert: "Windows",
        support_h265: "1",
        support_dash: "1",
        version_code: "190500",
        version_name: "19.5.0",
        cookie_enabled: "true",
        screen_width: "1920",
        screen_height: "1080",
        browser_language: "vi",
        browser_platform: "Win32",
        browser_name: "Chrome",
        browser_version: "134.0.0.0",
        browser_online: "true",
        engine_name: "Blink",
        engine_version: "134.0.0.0",
        os_name: "Windows",
        os_version: "10",
        cpu_core_num: "8",
        device_memory: "8",
        platform: "PC",
        downlink: "10",
        effective_type: "4g",
        round_trip_time: "50",
        webid: "7484702490707084837",
        uifid: uifid,
        msToken: msToken,
        verifyFp: fp,
        fp: fp,
      };

      const queryString = new URLSearchParams(
        params as Record<string, string>
      ).toString();
      const urlWithoutABogus = `${baseUrl}?${queryString}`;
      const aBogus = douyinSign.AB(urlWithoutABogus, userAgent);
      const finalUrl = `${urlWithoutABogus}&a_bogus=${aBogus}`;

      const headers = {
        "User-Agent": userAgent,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
        Referer: "https://www.douyin.com/",
        Origin: "https://www.douyin.com",
        "Sec-Ch-Ua":
          '"Chromium";v="134", "Google Chrome";v="134", "Not:A-Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        Cookie: getDouyinCookie(),
      };

      const response = await axios.get(finalUrl, {
        headers,
        timeout: 10000,
      });

      if (response.data && response.data.status_code === 0) {
        const data = response.data.aweme_detail;
        let attachments: any[] = [];

        if (Array.isArray(data.images) && data.images.length > 0) {
          attachments = data.images
            .map((img: any) => ({
              type: "Photo",
              url:
                img.url_list?.[0] ||
                img.download_url_list?.[0] ||
                "",
            }))
            .filter((item: any) => item.url);
        } else if (data.video?.play_addr?.url_list?.length > 0) {
          attachments.push({
            type: "Video",
            url: data.video.play_addr.url_list[0],
          });
        }

        return {
          id: data.aweme_id,
          message: data.desc,
          statistics: {
            play_count: data.statistics.play_count,
            share_count: data.statistics.share_count,
            comment_count: data.statistics.comment_count,
            digg_count: data.statistics.digg_count,
            collect_count: data.statistics.collect_count,
          },
          create_time: new Date(
            data.create_time * 1000
          ).toISOString(),
          music: {
            title: data.music.title,
            author: data.music.author,
            url:
              data.music.play_url?.uri ||
              data.music.play_url.url_list[0] ||
              "",
          },
          author: {
            nickname: data.author.nickname,
            unique_id: data.author.unique_id,
          },
          attachments,
        };
      } else {
        return {
          success: false,
          data: null,
          message:
            response.data?.status_msg ||
            "Lấy thông tin video thất bại",
        };
      }
    } catch (error: any) {
      console.error(
        "Lỗi khi lấy thông tin video:",
        error?.message
      );
      return {
        success: false,
        data: null,
        message:
          error?.message ||
          "Có lỗi xảy ra khi lấy thông tin video",
      };
    }
  }

  async function extractVideoId(url: string): Promise<string | null> {
    if (/^https?:\/\/v\.douyin\.com/.test(url)) {
      try {
        const res = await axios.get(url, {
          maxRedirects: 0,
          validateStatus: (status) => status === 302,
        });
        url = res.headers.location;
      } catch (err: any) {
        console.error(err?.message);
        return null;
      }
    }

    const patterns = [
      /video\/(\d+)/,
      /vid=(\d+)/,
      /share\/video\/(\d+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }
    return null;
  }

  const result = await getVideoDetail(await extractVideoId(url));
  if (result) {
    return result;
  } else {
    console.error("Lỗi:", result?.message);
    return null;
  }
}

export async function search(
  keyword: string,
  offset = 0,
  count = 10
): Promise<any[] | null> {
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
  const baseUrl =
    "https://www.douyin.com/aweme/v1/web/general/search/single/";

  const params: Record<string, string | number> = {
    device_platform: "webapp",
    aid: "6383",
    channel: "channel_pc_web",
    search_channel: "aweme_general",
    enable_history: "1",
    keyword: encodeURIComponent(keyword),
    search_source: "search_history",
    query_correct_type: "1",
    is_filter_search: "0",
    from_group_id: "",
    offset,
    count,
    need_filter_settings: "0",
    list_type: "multi",
    search_id: Date.now().toString(),
    update_version_code: "170400",
    pc_client_type: "1",
    pc_libra_divert: "Windows",
    support_h265: "1",
    support_dash: "1",
    cpu_core_num: "8",
    version_code: "190600",
    version_name: "19.6.0",
    cookie_enabled: "true",
    screen_width: "1920",
    screen_height: "1080",
    browser_language: "vi",
    browser_platform: "Win32",
    browser_name: "Chrome",
    browser_version: "135.0.0.0",
    browser_online: "true",
    engine_name: "Blink",
    engine_version: "135.0.0.0",
    os_name: "Windows",
    os_version: "10",
    device_memory: "8",
    platform: "PC",
    downlink: "10",
    effective_type: "4g",
    round_trip_time: "50",
    webid: "7484702490707084837",
    uifid: generateUifid(),
    msToken: douyinSign.Mstoken(128),
    verifyFp: douyinSign.VerifyFpManager(),
    fp: douyinSign.VerifyFpManager(),
  };

  const queryString = new URLSearchParams(
    params as Record<string, string>
  ).toString();
  const urlWithoutABogus = `${baseUrl}?${queryString}`;
  const aBogus = douyinSign.AB(urlWithoutABogus, userAgent);
  const finalUrl = `${urlWithoutABogus}&a_bogus=${aBogus}`;

  const headers = {
    "User-Agent": userAgent,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
    Referer: "https://www.douyin.com/",
    Origin: "https://www.douyin.com",
    "Sec-Ch-Ua":
      '"Chromium";v="135", "Google Chrome";v="135", "Not:A-Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    Cookie: getDouyinCookie(),
  };

  try {
    const response = await axios.get(finalUrl, {
      headers,
      timeout: 10000,
    });

    let simplified: any[] = [];
    if (response.data && response.data.status_code === 0) {
      if (Array.isArray(response.data.data)) {
        simplified = response.data.data.map((item: any) => {
          const data = item.aweme_info;
          let attachments: any[] = [];

          if (Array.isArray(data.images) && data.images.length > 0) {
            attachments = data.images
              .map((img: any) => ({
                type: "Photo",
                url:
                  img.url_list?.[0] ||
                  img.download_url_list?.[0] ||
                  "",
              }))
              .filter((i: any) => i.url);
          } else if (data.video?.play_addr?.url_list?.length > 0) {
            attachments.push({
              type: "Video",
              url: data.video.play_addr.url_list[0],
            });
          }

          return {
            id: data.aweme_id,
            message: data.desc,
            statistics: {
              play_count: data.statistics?.play_count,
              share_count: data.statistics?.share_count,
              comment_count: data.statistics?.comment_count,
              digg_count: data.statistics?.digg_count,
              collect_count: data.statistics?.collect_count,
            },
            create_time: data.create_time
              ? new Date(data.create_time * 1000).toISOString()
              : null,
            music: {
              title: data.music?.title,
              author: data.music?.author,
              url:
                data.music?.play_url?.uri ||
                data.music?.play_url?.url_list?.[0] ||
                "",
            },
            author: data.author?.nickname,
            attachments,
          };
        });
      }
      return simplified;
    } else {
      console.error(
        "Search failed:",
        response.data?.status_msg || "Unknown error"
      );
      return null;
    }
  } catch (err: any) {
    console.error("Error searching Douyin:", err?.message);
    return null;
  }
}

export async function post(
  sec_user_id: string,
  max_cursor = 0,
  count = 24
): Promise<any[] | null> {
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
  const baseUrl =
    "https://www.douyin.com/aweme/v1/web/aweme/post/";

  const params: Record<string, string | number> = {
    device_platform: "webapp",
    aid: "6383",
    channel: "channel_pc_web",
    sec_user_id,
    max_cursor,
    locate_item_id: "",
    locate_query: "false",
    show_live_replay_strategy: "1",
    need_time_list: "0",
    time_list_query: "0",
    whale_cut_token: "",
    cut_version: "1",
    count,
    publish_video_strategy_type: "2",
    from_user_page: "0",
    update_version_code: "170400",
    pc_client_type: "1",
    pc_libra_divert: "Windows",
    support_h265: "1",
    support_dash: "1",
    cpu_core_num: "8",
    version_code: "290100",
    version_name: "29.1.0",
    cookie_enabled: "true",
    screen_width: "1920",
    screen_height: "1080",
    browser_language: "vi",
    browser_platform: "Win32",
    browser_name: "Chrome",
    browser_version: "135.0.0.0",
    browser_online: "true",
    engine_name: "Blink",
    engine_version: "135.0.0.0",
    os_name: "Windows",
    os_version: "10",
    device_memory: "8",
    platform: "PC",
    downlink: "10",
    effective_type: "4g",
    round_trip_time: "50",
    webid: "7484702490707084837",
    uifid: generateUifid(),
    msToken: douyinSign.Mstoken(128),
    verifyFp: douyinSign.VerifyFpManager(),
    fp: douyinSign.VerifyFpManager(),
  };

  const queryString = new URLSearchParams(
    params as Record<string, string>
  ).toString();
  const urlWithoutABogus = `${baseUrl}?${queryString}`;
  const aBogus = douyinSign.AB(urlWithoutABogus, userAgent);
  const finalUrl = `${urlWithoutABogus}&a_bogus=${aBogus}`;

  const headers = {
    "User-Agent": userAgent,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
    Referer: "https://www.douyin.com/",
    Origin: "https://www.douyin.com",
    "Sec-Ch-Ua":
      '"Chromium";v="135", "Google Chrome";v="135", "Not:A-Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    Cookie: getDouyinCookie(),
  };

  try {
    const response = await axios.get(finalUrl, {
      headers,
      timeout: 10000,
    });

    if (response.data && response.data.status_code === 0) {
      return response.data.aweme_list.map((item: any) => {
        const data = item.aweme_info || item;
        let attachments: any[] = [];

        if (Array.isArray(data.images) && data.images.length > 0) {
          attachments = data.images
            .map((img: any) => ({
              type: "Photo",
              url:
                img.url_list?.[0] ||
                img.download_url_list?.[0] ||
                "",
            }))
            .filter((i: any) => i.url);
        } else if (data.video?.play_addr?.url_list?.length > 0) {
          attachments.push({
            type: "Video",
            url: data.video.play_addr.url_list[0],
          });
        }

        return {
          id: data.aweme_id,
          message: data.desc,
          statistics: {
            play_count: data.statistics?.play_count,
            share_count: data.statistics?.share_count,
            comment_count: data.statistics?.comment_count,
            digg_count: data.statistics?.digg_count,
            collect_count: data.statistics?.collect_count,
          },
          create_time: data.create_time
            ? new Date(data.create_time * 1000).toISOString()
            : null,
          music: {
            title: data.music?.title,
            author: data.music?.author,
            url:
              data.music?.play_url?.uri ||
              data.music?.play_url?.url_list?.[0] ||
              "",
          },
          author: data.author?.nickname,
          attachments,
        };
      });
    } else {
      console.error(
        "Failed to fetch user posts:",
        response.data?.status_msg || "Unknown error"
      );
      return null;
    }
  } catch (err: any) {
    console.error(
      "Error fetching user posts:",
      err?.message
    );
    return null;
  }
}

export async function info(sec_user_id: string): Promise<any | null> {
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
  const baseUrl =
    "https://www.douyin.com/aweme/v1/web/user/profile/other/";

  const params: Record<string, string | number> = {
    device_platform: "webapp",
    aid: "6383",
    channel: "channel_pc_web",
    publish_video_strategy_type: "2",
    source: "channel_pc_web",
    sec_user_id,
    personal_center_strategy: "1",
    profile_other_record_enable: "1",
    land_to: "1",
    update_version_code: "170400",
    pc_client_type: "1",
    pc_libra_divert: "Windows",
    support_h265: "1",
    support_dash: "1",
    cpu_core_num: "8",
    version_code: "170400",
    version_name: "17.4.0",
    cookie_enabled: "true",
    screen_width: "1920",
    screen_height: "1080",
    browser_language: "vi",
    browser_platform: "Win32",
    browser_name: "Chrome",
    browser_version: "135.0.0.0",
    browser_online: "true",
    engine_name: "Blink",
    engine_version: "135.0.0.0",
    os_name: "Windows",
    os_version: "10",
    device_memory: "8",
    platform: "PC",
    downlink: "10",
    effective_type: "4g",
    round_trip_time: "50",
    webid: "7484702490707084837",
    uifid: generateUifid(),
    verifyFp: douyinSign.VerifyFpManager(),
    fp: douyinSign.VerifyFpManager(),
    msToken: douyinSign.Mstoken(128),
  };

  const queryString = new URLSearchParams(
    params as Record<string, string>
  ).toString();
  const urlWithoutABogus = `${baseUrl}?${queryString}`;
  const aBogus = douyinSign.AB(urlWithoutABogus, userAgent);
  const finalUrl = `${urlWithoutABogus}&a_bogus=${encodeURIComponent(
    aBogus
  )}`;

  const headers = {
    "User-Agent": userAgent,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
    Referer: "https://www.douyin.com/",
    Origin: "https://www.douyin.com",
    "Sec-Ch-Ua":
      '"Chromium";v="135", "Google Chrome";v="135", "Not:A-Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    Cookie: getDouyinCookie(),
  };

  try {
    const response = await axios.get(finalUrl, {
      headers,
      timeout: 10000,
    });

    if (response.data && response.data.status_code === 0) {
      const user = response.data.user;
      fs.writeFileSync(
        "user.json",
        JSON.stringify(user, null, 2)
      );

      return {
        id: user.sec_uid,
        uid: user.uid,
        short_id: user.short_id,
        nickname: user.nickname,
        unique_id: user.unique_id,
        avatar_larger: user.avatar_larger?.url_list?.[0] || "",
        signature: user.signature,
        followers: user.follower_count,
        following: user.following_count,
        aweme_count: user.aweme_count,
        total_favorited: user.total_favorited,
        gender: user.gender,
        city: user.city,
        province: user.province,
        country: user.country,
        school_name: user.school_name,
        favoriting_count: user.favoriting_count,
        dongtai_count: user.dongtai_count,
        mix_count: user.mix_count,
        mplatform_followers_count: user.mplatform_followers_count,
        user_age: user.user_age,
        ip_location: user.ip_location,
        enterprise_verify_reason:
          user.enterprise_verify_reason,
        custom_verify: user.custom_verify,
        verification_type: user.verification_type,
        commerce_user_level: user.commerce_user_level,
        is_star: user.is_star,
        is_gov_media_vip: user.is_gov_media_vip,
        live_status: user.live_status,
        room_id: user.room_id,
        share_title: user.share_info?.share_title,
        share_desc: user.share_info?.share_desc,
        profile_tab_type: user.profile_tab_type,
        aweme_count_correction_threshold:
          user.aweme_count_correction_threshold,
        total_favorited_correction_threshold:
          user.total_favorited_correction_threshold,
        birthday_hide_level: user.birthday_hide_level,
        enable_wish: user.enable_wish,
        is_activity_user: user.is_activity_user,
        is_ban: user.is_ban,
        is_block: user.is_block,
        is_blocked: user.is_blocked,
        is_effect_artist: user.is_effect_artist,
        is_mix_user: user.is_mix_user,
        is_not_show: user.is_not_show,
        is_series_user: user.is_series_user,
        is_sharing_profile_user:
          user.is_sharing_profile_user,
        is_user_not_see: user.user_not_see,
        is_user_not_show: user.user_not_show,
        with_commerce_entry: user.with_commerce_entry,
        with_fusion_shop_entry:
          user.with_fusion_shop_entry,
        with_new_goods: user.with_new_goods,
        with_commerce_enterprise_tab_entry:
          user.with_commerce_enterprise_tab_entry,
      };
    } else {
      console.error(
        "Failed to fetch user profile:",
        response.data?.status_msg || "Unknown error"
      );
      return null;
    }
  } catch (err: any) {
    console.error(
      "Error fetching user profile:",
      err?.message
    );
    return null;
  }
}

export async function feed(
  count = 20,
  refresh_index = 5
): Promise<any[] | null> {
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
  const baseUrl =
    "https://www.douyin.com/aweme/v1/web/tab/feed/";

  const params: Record<string, string | number> = {
    device_platform: "webapp",
    aid: "6383",
    channel: "channel_pc_web",
    tag_id: "",
    live_insert_type: "",
    count,
    refresh_index,
    video_type_select: "1",
    aweme_pc_rec_raw_data: encodeURIComponent(
      JSON.stringify({
        newVideoPrefer: {
          fsn: [],
          min: [],
          show: [],
          skip: [],
          head: [],
        },
        is_client: false,
        ff_danmaku_status: 1,
        danmaku_switch_status: 0,
        is_dash_user: 1,
        related_recommend: 1,
        is_xigua_user: 0,
      })
    ),
    globalwid: "",
    pull_type: "0",
    min_window: "0",
    free_right: "0",
    view_count: "0",
    plug_block: "0",
    need_translation: "1",
    ug_source: "",
    creative_id: "",
    pc_client_type: "1",
    pc_libra_divert: "Windows",
    support_h265: "1",
    support_dash: "1",
    version_code: "170400",
    version_name: "17.4.0",
    cookie_enabled: "true",
    screen_width: "1920",
    screen_height: "1080",
    browser_language: "vi",
    browser_platform: "Win32",
    browser_name: "Chrome",
    browser_version: "135.0.0.0",
    browser_online: "true",
    engine_name: "Blink",
    engine_version: "135.0.0.0",
    os_name: "Windows",
    os_version: "10",
    cpu_core_num: "8",
    device_memory: "8",
    platform: "PC",
    downlink: "10",
    effective_type: "4g",
    round_trip_time: "50",
    webid: "7484702490707084837",
    verifyFp: douyinSign.VerifyFpManager(),
    fp: douyinSign.VerifyFpManager(),
    msToken: douyinSign.Mstoken(128),
  };

  const queryString = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const urlWithoutABogus = `${baseUrl}?${queryString}`;
  const aBogus = douyinSign.AB(urlWithoutABogus, userAgent);
  const finalUrl = `${urlWithoutABogus}&a_bogus=${encodeURIComponent(
    aBogus
  )}`;

  const headers = {
    "User-Agent": userAgent,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
    Referer: "https://www.douyin.com/",
    Origin: "https://www.douyin.com",
    "Sec-Ch-Ua":
      '"Chromium";v="135", "Google Chrome";v="135", "Not:A-Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    Cookie: getDouyinCookie(),
  };

  try {
    const response = await axios.get(finalUrl, {
      headers,
      timeout: 10000,
    });

    if (
      response.data &&
      Array.isArray(response.data.aweme_list)
    ) {
      return response.data.aweme_list
        .filter(
          (item: any) =>
            item &&
            (Array.isArray(item.images) ||
              item.video?.play_addr?.url_list?.length > 0)
        )
        .map((item: any) => {
          let attachments: any[] = [];
          if (
            Array.isArray(item.images) &&
            item.images.length > 0
          ) {
            attachments = item.images
              .map((img: any) => ({
                type: "Photo",
                url:
                  img.url_list?.[0] ||
                  img.download_url_list?.[0] ||
                  "",
              }))
              .filter((i: any) => i.url);
          } else if (
            item.video?.play_addr?.url_list?.length > 0
          ) {
            attachments.push({
              type: "Video",
              url: item.video.play_addr.url_list[0],
            });
          }
          return {
            id: item.aweme_id,
            message: item.desc,
            statistics: {
              play_count: item.statistics?.play_count,
              share_count: item.statistics?.share_count,
              comment_count: item.statistics?.comment_count,
              digg_count: item.statistics?.digg_count,
              collect_count: item.statistics?.collect_count,
            },
            create_time: item.create_time
              ? new Date(item.create_time * 1000).toISOString()
              : null,
            music: {
              title: item.music?.title,
              author: item.music?.author,
              url:
                item.music?.play_url?.uri ||
                item.music?.play_url?.url_list?.[0] ||
                "",
            },
            author: item.author?.nickname,
            attachments,
          };
        })
        .filter((i: any) => i.attachments.length > 0);
    }

    return null;
  } catch (err: any) {
    console.error("Error fetching feed:", err?.message);
    return null;
  }
}

const DouyinAPI = {
  down,
  search,
  post,
  info,
  feed,
};

export default DouyinAPI;
