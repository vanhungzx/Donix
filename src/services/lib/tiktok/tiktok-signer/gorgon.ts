import { md5Hex } from './crypto-utils.js';

function buildGorgon8404(
  paramsStr: string,
  unix: number,
  bodyPayload?: string | Uint8Array | Buffer,
  cookiesStr?: string
): { 'x-ss-req-ticket': string; 'X-Khronos': string; 'X-Gorgon': string } {
  const gorgon: number[] = [];
  const urlMd5 = md5Hex(paramsStr || '');
  for (let i = 0; i < 4; i += 1) gorgon.push(parseInt(urlMd5.substring(i * 2, i * 2 + 2), 16));
  if (bodyPayload && bodyPayload.length) {
    const dataMd5 = md5Hex(bodyPayload);
    for (let i = 0; i < 4; i += 1) gorgon.push(parseInt(dataMd5.substring(i * 2, i * 2 + 2), 16));
  } else gorgon.push(0, 0, 0, 0);
  if (cookiesStr) {
    const cookieMd5 = md5Hex(cookiesStr);
    for (let i = 0; i < 4; i += 1) gorgon.push(parseInt(cookieMd5.substring(i * 2, i * 2 + 2), 16));
  } else gorgon.push(0, 0, 0, 0);
  gorgon.push(0x1, 0x1, 0x2, 0x4);
  const khronosHex = (unix >>> 0).toString(16).padStart(8, '0');
  for (let i = 0; i < 4; i += 1) gorgon.push(parseInt(khronosHex.substring(i * 2, i * 2 + 2), 16));
  const hexCe0 = [0x05, 0x00, 0x50, Math.floor(Math.random() * 0xff), 0x47, 0x1e, 0x00, Math.floor(Math.random() * 0xff) & 0xf0];
  const hex = (n: number): string => n.toString(16).padStart(2, '0');
  const result = gorgon.map((item) => hex(item)).join('');
  return {
    'x-ss-req-ticket': String(unix * 1000),
    'X-Khronos': String(unix),
    'X-Gorgon': `8404${hex(hexCe0[7])}${hex(hexCe0[3])}${hex(hexCe0[1])}${hex(hexCe0[6])}${result}`
  };
}

class Gorgon {
  unix: number;
  params: string;
  bodyPayload?: string | Uint8Array | Buffer;
  cookies?: string;
  gorgonVersion: '0404' | '8404';

  constructor({
    params,
    unix,
    bodyPayload,
    cookies,
    gorgonVersion = '0404'
  }: {
    params: string;
    unix: number;
    bodyPayload?: string | Uint8Array | Buffer;
    cookies?: string;
    gorgonVersion?: '0404' | '8404';
  }) {
    this.unix = unix;
    this.params = params;
    this.bodyPayload = bodyPayload;
    this.cookies = cookies;
    this.gorgonVersion = gorgonVersion;
  }

  private hash(data: string | Uint8Array | Buffer): string {
    return md5Hex(data);
  }

  private getBaseString(): string {
    let base = this.hash(this.params);
    base += this.bodyPayload ? this.hash(this.bodyPayload) : '0'.repeat(32);
    base += this.cookies ? this.hash(this.cookies) : '0'.repeat(32);
    return base;
  }

  getValue(): { 'x-ss-req-ticket': string; 'X-Khronos': string; 'X-Gorgon': string } {
    if (this.gorgonVersion === '8404') {
      return buildGorgon8404(this.params, this.unix, this.bodyPayload, this.cookies);
    }
    return this.encrypt(this.getBaseString());
  }

  private encrypt(data: string): { 'x-ss-req-ticket': string; 'X-Khronos': string; 'X-Gorgon': string } {
    const LEN = 0x14;
    const key = [0xdf, 0x77, 0xb9, 0x40, 0xb9, 0x9b, 0x84, 0x83, 0xd1, 0xb9, 0xcb, 0xd1, 0xf7, 0xc2, 0xb9, 0x85, 0xc3, 0xd0, 0xfb, 0xc3];
    const paramList: number[] = [];
    for (let i = 0; i < 12; i += 4) {
      const temp = data.substring(8 * i, 8 * (i + 1));
      for (let j = 0; j < 4; j += 1) paramList.push(parseInt(temp.substring(j * 2, (j + 1) * 2), 16));
    }
    paramList.push(0x00, 0x06, 0x0b, 0x1c);
    const ts = this.unix >>> 0;
    paramList.push((ts & 0xff000000) >>> 24, (ts & 0x00ff0000) >>> 16, (ts & 0x0000ff00) >>> 8, (ts & 0x000000ff) >>> 0);
    const eorList = paramList.map((v, i) => v ^ key[i]);
    for (let i = 0; i < LEN; i += 1) {
      const C = this.reverse(eorList[i]);
      const D = eorList[(i + 1) % LEN];
      const E = C ^ D;
      const F = this.rbit(E);
      eorList[i] = (F ^ 0xffffffff ^ LEN) & 0xff;
    }
    return {
      'x-ss-req-ticket': String(this.unix * 1000),
      'X-Khronos': String(this.unix),
      'X-Gorgon': `0404b0d30000${eorList.map((p) => this.toHex(p)).join('')}`
    };
  }

  private reverse(num: number): number {
    const hex = this.toHex(num);
    return parseInt(hex[1] + hex[0], 16);
  }
  private toHex(num: number): string {
    return num.toString(16).padStart(2, '0');
  }
  private rbit(num: number): number {
    return parseInt(num.toString(2).padStart(8, '0').split('').reverse().join(''), 2);
  }
}

export { Gorgon, buildGorgon8404 };
export default Gorgon;
