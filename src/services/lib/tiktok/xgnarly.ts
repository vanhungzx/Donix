import * as crypto from 'crypto';

const aa: (number | null)[] = [
  0xFFFFFFFF, 138, 1498001188, 211147047, 253, null, 203, 288, 9,
  1196819126, 3212677781, 135, 263, 193, 58, 18, 244, 2931180889, 240, 173,
  268, 2157053261, 261, 175, 14, 5, 171, 270, 156, 258, 13, 15, 3732962506,
  185, 169, 2, 6, 132, 162, 200, 3, 160, 217618912, 62, 2517678443, 44, 164,
  4, 96, 183, 2903579748, 3863347763, 119, 181, 10, 190, 8, 2654435769, 259,
  104, 230, 128, 2633865432, 225, 1, 257, 143, 179, 16, 600974999, 185100057,
  32, 188, 53, 2718276124, 177, 196, 4294967296, 147, 117, 17, 49, 7, 28, 12,
  266, 216, 11, 0, 45, 166, 247, 1451689750,
];

const Ot: number[] = [aa[9] as number, aa[69] as number, aa[51] as number, aa[92] as number];

const MASK32 = 0xFFFFFFFF;

function initPrngState(): number[] {
  const nowMs = Date.now();
  return [
    aa[44] as number,
    aa[74] as number,
    aa[10] as number,
    aa[62] as number,
    aa[42] as number,
    aa[17] as number,
    aa[2] as number,
    aa[21] as number,
    aa[3] as number,
    aa[70] as number,
    aa[50] as number,
    aa[32] as number,
    (aa[0] as number) & nowMs,
    crypto.randomInt(aa[77] as number),
    crypto.randomInt(aa[77] as number),
    crypto.randomInt(aa[77] as number),
  ];
}

let kt: number[] = initPrngState();
let St: number = aa[88] as number;

const u32 = (x: number): number => (x >>> 0);

const rotl = (x: number, n: number): number => u32((x << n) | (x >>> (32 - n)));

function quarter(st: number[], a: number, b: number, c: number, d: number): void {
  st[a] = u32(st[a] + st[b]); st[d] = rotl(st[d] ^ st[a], 16);
  st[c] = u32(st[c] + st[d]); st[b] = rotl(st[b] ^ st[c], 12);
  st[a] = u32(st[a] + st[b]); st[d] = rotl(st[d] ^ st[a], 8);
  st[c] = u32(st[c] + st[d]); st[b] = rotl(st[b] ^ st[c], 7);
}

function chachaBlock(state: number[], rounds: number): number[] {
  const w = state.slice();
  for (let r = 0; r < rounds;) {
    quarter(w, 0, 4, 8, 12); quarter(w, 1, 5, 9, 13);
    quarter(w, 2, 6, 10, 14); quarter(w, 3, 7, 11, 15);
    if (++r >= rounds) break;
    quarter(w, 0, 5, 10, 15); quarter(w, 1, 6, 11, 12);
    quarter(w, 2, 7, 12, 13); quarter(w, 3, 4, 13, 14);
    ++r;
  }
  for (let i = 0; i < 16; i++) w[i] = u32(w[i] + state[i]);
  return w;
}

const bumpCounter = (st: number[]): void => { st[12] = u32(st[12] + 1); };

function rand(): number {
  const e = chachaBlock(kt, 8);
  const t = e[St];
  const r = (e[St + 8] & 0xFFFFFFF0) >>> 11;
  if (St === 7) { bumpCounter(kt); St = 0; } else { ++St; }
  return (t + 4294967296 * r) / 2 ** 53;
}

const numToBytes = (val: number): number[] => {
  return val < 255 * 255
    ? [(val >> 8) & 0xFF, val & 0xFF]
    : [(val >> 24) & 0xFF, (val >> 16) & 0xFF, (val >> 8) & 0xFF, val & 0xFF];
};

const beIntFromStr = (str: string): number => {
  const buf = Buffer.from(str, 'utf8').subarray(0, 4);
  let acc = 0;
  for (const b of buf) acc = (acc << 8) | b;
  return acc >>> 0;
};

function encryptChaCha(keyWords: number[], rounds: number, bytes: number[]): void {
  const nFull = Math.floor(bytes.length / 4);
  const leftover = bytes.length % 4;
  const words = new Uint32Array(Math.ceil(bytes.length / 4));
  for (let i = 0; i < nFull; i++) {
    const j = 4 * i;
    words[i] =
      bytes[j] |
      (bytes[j + 1] << 8) |
      (bytes[j + 2] << 16) |
      (bytes[j + 3] << 24);
  }
  if (leftover) {
    let v = 0, base = 4 * nFull;
    for (let c = 0; c < leftover; c++) v |= bytes[base + c] << (8 * c);
    words[nFull] = v;
  }
  let o = 0;
  const state = keyWords.slice();
  while (o + 16 < words.length) {
    const stream = chachaBlock(Array.from(state), rounds);
    bumpCounter(state);
    for (let k = 0; k < 16; k++) words[o + k] ^= stream[k];
    o += 16;
  }
  const remain = words.length - o;
  const stream = chachaBlock(Array.from(state), rounds);
  for (let k = 0; k < remain; k++) words[o + k] ^= stream[k];
  for (let i = 0; i < nFull; i++) {
    const w = words[i];
    const j = 4 * i;
    bytes[j] = w & 0xFF;
    bytes[j + 1] = (w >> 8) & 0xFF;
    bytes[j + 2] = (w >> 16) & 0xFF;
    bytes[j + 3] = (w >> 24) & 0xFF;
  }
  if (leftover) {
    const w = words[nFull];
    const base = 4 * nFull;
    for (let c = 0; c < leftover; c++) bytes[base + c] = (w >> (8 * c)) & 0xFF;
  }
}

function Ab22(key12Words: number[], rounds: number, str: string): string {
  const state = Ot.concat(key12Words);
  const data = Array.from(str, ch => ch.charCodeAt(0));
  encryptChaCha(state, rounds, data);
  return String.fromCharCode(...data);
}

function encrypt(
  queryString: string,
  body: string,
  userAgent: string,
  envcode: number = 0,
  version: string = '5.1.1',
  timestampMs: number = Date.now()
): string {
  const obj = new Map<number, number | string>();
  obj.set(1, 1);
  obj.set(2, envcode);
  obj.set(3, crypto.createHash('md5').update(queryString).digest('hex'));
  obj.set(4, crypto.createHash('md5').update(body).digest('hex'));
  obj.set(5, crypto.createHash('md5').update(userAgent).digest('hex'));
  obj.set(6, Math.floor(timestampMs / 1000));
  obj.set(7, 1508145731);
  obj.set(8, (timestampMs * 1000) % 2147483648);
  obj.set(9, version);

  if (version === '5.1.1') {
    obj.set(10, '1.0.0.314');
    obj.set(11, 1);
    let v12 = 0;
    for (let i = 1; i <= 11; i++) {
      const v = obj.get(i);
      if (v === undefined) continue;
      const toXor = typeof v === 'number' ? v : beIntFromStr(v);
      v12 ^= toXor;
    }
    obj.set(12, v12 >>> 0);
  } else if (version !== '5.1.0') {
    throw new Error(`Unsupported version: ${version}`);
  }

  let v0 = 0;
  for (let i = 1; i <= obj.size; i++) {
    const v = obj.get(i);
    if (v !== undefined && typeof v === 'number') v0 ^= v;
  }
  obj.set(0, v0 >>> 0);

  const payload: number[] = [];
  payload.push(obj.size);
  for (const [k, v] of obj) {
    payload.push(k);
    const valBytes =
      typeof v === 'number' ? numToBytes(v) : Array.from(Buffer.from(v, 'utf8'));
    payload.push(...numToBytes(valBytes.length));
    payload.push(...valBytes);
  }

  const baseStr = String.fromCharCode(...payload);

  const keyWords: number[] = [];
  const keyBytes: number[] = [];
  let roundAccum = 0;
  for (let i = 0; i < 12; i++) {
    const rnd = rand();
    const word = (rnd * 4294967296) >>> 0;
    keyWords.push(word);
    roundAccum = (roundAccum + (word & 15)) & 15;
    keyBytes.push(word & 0xFF, (word >>> 8) & 0xFF, (word >>> 16) & 0xFF, (word >>> 24) & 0xFF);
  }

  const rounds = roundAccum + 5;
  const enc = Ab22(keyWords, rounds, baseStr);

  let insertPos = 0;
  for (const b of keyBytes) insertPos = (insertPos + b) % (enc.length + 1);
  for (const ch of enc) insertPos = (insertPos + ch.charCodeAt(0)) % (enc.length + 1);

  const keyBytesStr = String.fromCharCode(...keyBytes);
  const finalStr = String.fromCharCode(((1 << 6) ^ (1 << 3) ^ 3) & 0xFF) + enc.slice(0, insertPos) + keyBytesStr + enc.slice(insertPos);

  const alphabet = 'u09tbS3UvgDEe6r-ZVMXzLpsAohTn7mdINQlW412GqBjfYiyk8JORCF5/xKHwacP=';

  const out: string[] = [];
  const fullLen = Math.floor(finalStr.length / 3) * 3;
  for (let i = 0; i < fullLen; i += 3) {
    const block = (finalStr.charCodeAt(i) << 16) | (finalStr.charCodeAt(i + 1) << 8) | finalStr.charCodeAt(i + 2);
    out.push(alphabet[(block >> 18) & 63], alphabet[(block >> 12) & 63], alphabet[(block >> 6) & 63], alphabet[block & 63]);
  }

  return out.join('');
}

export default encrypt;
