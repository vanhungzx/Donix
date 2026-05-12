import {
  writeBigUInt64LE,
  readBigUInt64LE,
  fillBytes,
  allocBytes,
  asciiToBytes,
  concatBytes,
  stringToBytes,
  bytesToBase64
} from './buffer-utils.js';
import { md5Hex } from './crypto-utils.js';
import { randomBytes } from 'crypto';

const U64_MASK = BigInt('0xFFFFFFFFFFFFFFFF');
const validate = (num: bigint): bigint => num & U64_MASK;
const rotateRight = (value: bigint, count: number): bigint => (((value >> BigInt(count % 64)) | (value << BigInt(64 - (count % 64)))) & U64_MASK);
const setUint64 = (ptr: Uint8Array, index: number, data: bigint): void => writeBigUInt64LE(ptr, data, index * 8);
const getUint64 = (ptr: Uint8Array, index: number): bigint => readBigUInt64LE(ptr, index * 8);
const paddingSize = (size: number, block = 16): number => (size % block > 0 ? size + (block - (size % block)) : size);
const pkcs7Pad = (buf: Uint8Array, size: number, newSize: number): void => fillBytes(buf, newSize - size, size, newSize);

class Ladon {
  static ROUNDS = 0x22;
  static buildHashTable(md5hex: string): Uint8Array {
    const hashTable = allocBytes(288);
    hashTable.set(asciiToBytes(md5hex), 0);
    const temp: bigint[] = [];
    for (let i = 0; i < 4; i += 1) temp.push(getUint64(hashTable, i));
    let bufferB0 = temp[0];
    let bufferB8 = temp[1];
    temp.splice(0, 2);
    for (let i = 0; i < Ladon.ROUNDS; i += 1) {
      const x9 = bufferB0;
      let x8 = bufferB8;
      x8 = validate(rotateRight(x8, 8));
      x8 = validate(x8 + x9);
      x8 = validate(x8 ^ BigInt(i));
      temp.push(x8);
      x8 = validate(x8 ^ rotateRight(x9, 61));
      setUint64(hashTable, i + 1, x8);
      bufferB0 = x8;
      bufferB8 = temp.shift() ?? 0n;
    }
    return hashTable;
  }
  static encryptLadonInput(hashTable: Uint8Array, input: Uint8Array): Uint8Array {
    let data0 = readBigUInt64LE(input, 0);
    let data1 = readBigUInt64LE(input, 8);
    for (let i = 0; i < Ladon.ROUNDS; i += 1) {
      const hashVal = getUint64(hashTable, i);
      const rot = validate((data1 >> 8n) | (data1 << 56n));
      data1 = validate(hashVal ^ (data0 + rot));
      data0 = validate(data1 ^ rotateRight(data0, 61));
    }
    const out = allocBytes(16);
    writeBigUInt64LE(out, data0, 0);
    writeBigUInt64LE(out, data1, 8);
    return out;
  }
  static encryptLadon(md5hexStr: string, data: Uint8Array): Uint8Array {
    const hashTable = Ladon.buildHashTable(md5hexStr);
    const size = data.length;
    const newSize = paddingSize(size);
    const input = allocBytes(newSize);
    input.set(data, 0);
    pkcs7Pad(input, size, newSize);
    const output = allocBytes(newSize);
    for (let i = 0; i < newSize / 16; i += 1) {
      output.set(Ladon.encryptLadonInput(hashTable, input.subarray(i * 16, (i + 1) * 16)), i * 16);
    }
    return output;
  }
  static encrypt({
    khronos,
    licenseId = 1611921764,
    aid = 1233,
    randBytes
  }: {
    khronos: number;
    licenseId?: number;
    aid?: number;
    randBytes?: Uint8Array;
  }): string {
    const rb = randBytes ?? new Uint8Array(randomBytes(4));
    const data = `${khronos}-${licenseId}-${aid}`;
    const md5hex = md5Hex(concatBytes(rb, stringToBytes(String(aid))));
    const encrypted = Ladon.encryptLadon(md5hex, stringToBytes(data));
    return bytesToBase64(concatBytes(rb, encrypted));
  }
}

export { Ladon };
export default Ladon;
