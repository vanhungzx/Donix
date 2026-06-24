import qs from 'qs';
import {
  allocBytes,
  hexToBytes,
  stringToBytes,
  readBigUInt64LE,
  writeBigUInt64LE,
  concatBytes,
  asciiToBytes,
  bytesToBase64
} from './buffer-utils.js';
import { md5Bytes, pkcs7Pad, aesCbcEncrypt } from './crypto-utils.js';
import { ProtoBuf } from './protobuf.js';
import type { ProtoDict } from './protobuf.js';
import { simonEnc } from './simon.js';
import { SM3 } from './sm3.js';

class Argus {
  static SIGN_KEY = hexToBytes('ac1adaae95a7af94a5114ab3b3a97dd80050aa0a39314c40528caec95256c28c');
  static SM3_OUTPUT = hexToBytes('fc78e0a9657a0c748ce51559903ccf03510e51d3cff232d71343e88a321c5304');

  static encryptEncPb(data: Uint8Array, length: number): Uint8Array {
    const arr = new Uint8Array(data.subarray(0, length));
    const xorArray = new Uint8Array(arr.subarray(0, 8));
    for (let i = 8; i < length; i += 1) arr[i] ^= xorArray[i % 8];
    const reversed = allocBytes(arr.length);
    for (let i = 0; i < arr.length; i += 1) reversed[i] = arr[arr.length - 1 - i];
    return reversed;
  }
  static getBodyhash(stub?: string): Uint8Array {
    return new SM3().sm3Hash(stub && stub.length ? hexToBytes(stub) : new Uint8Array(16)).subarray(0, 6);
  }
  static getQueryhash(query?: string): Uint8Array {
    return new SM3().sm3Hash(query && query.length ? stringToBytes(query) : allocBytes(16)).subarray(0, 6);
  }
  static prepareKeyList(key: Uint8Array): [bigint, bigint, bigint, bigint] {
    const keyList: bigint[] = [];
    for (let i = 0; i < 2; i += 1) {
      const slice = key.slice(i * 16, (i + 1) * 16);
      keyList.push(readBigUInt64LE(slice, 0), readBigUInt64LE(slice, 8));
    }
    return keyList as [bigint, bigint, bigint, bigint];
  }
  static encryptBlocks(protobuf: Uint8Array, keyList: [bigint, bigint, bigint, bigint], newLen: number): Uint8Array {
    const encPb = allocBytes(newLen);
    for (let blockIdx = 0; blockIdx < Math.floor(newLen / 16); blockIdx += 1) {
      const offset = blockIdx * 16;
      const ct = simonEnc([readBigUInt64LE(protobuf, offset), readBigUInt64LE(protobuf, offset + 8)], keyList);
      writeBigUInt64LE(encPb, ct[0], offset);
      writeBigUInt64LE(encPb, ct[1], offset + 8);
    }
    return encPb;
  }
  static encrypt(xargusBean: ProtoDict): string {
    const pb = new ProtoBuf(xargusBean).toBuf();
    const protobuf = ((buf: Uint8Array, blockSize = 16): Uint8Array => {
      const pad = blockSize - (buf.length % blockSize);
      const out = allocBytes(buf.length + pad);
      out.set(buf, 0);
      out.fill(pad, buf.length);
      return out;
    })(pb);
    const keyList = Argus.prepareKeyList(Argus.SM3_OUTPUT.slice(0, 32));
    let bBuffer = concatBytes(new Uint8Array([0xf2, 0xf7, 0xfc, 0xff, 0xf2, 0xf7, 0xfc, 0xff]), Argus.encryptBlocks(protobuf, keyList, protobuf.length));
    bBuffer = Argus.encryptEncPb(bBuffer, protobuf.length + 8);
    bBuffer = concatBytes(new Uint8Array([0xa6, 0x6e, 0xad, 0x9f, 0x77, 0x01, 0xd0, 0x0c, 0x18]), bBuffer, asciiToBytes('ao'));
    const encrypted = aesCbcEncrypt(pkcs7Pad(bBuffer, 16), md5Bytes(Argus.SIGN_KEY.slice(0, 16)), md5Bytes(Argus.SIGN_KEY.slice(16)));
    return bytesToBase64(concatBytes(new Uint8Array([0xf2, 0x81]), encrypted));
  }
  static parseAppVersion(versionName: string): number {
    const [p0, p1, p2] = versionName.split('.').map((x) => Number(x || 0));
    return ((parseInt(((p2 * 4).toString(16) + (p1 * 16).toString(16) + (p0 * 4).toString(16) + '00').padStart(8, '0'), 16) << 1) >>> 0);
  }
  static getSign({
    queryParams,
    x_ss_stub,
    timestamp,
    aid = 1233,
    licenseId = 1611921764,
    sdkVersion = 'v05.00.03-ov-android',
    sdkVersionInt = 167773760
  }: {
    queryParams: string;
    x_ss_stub?: string;
    timestamp?: number;
    aid?: number;
    licenseId?: number;
    sdkVersion?: string;
    sdkVersionInt?: number;
  }): string {
    const ts = timestamp ?? Math.floor(Date.now() / 1000);
    const params = qs.parse(queryParams ?? '') as Record<string, string | string[]>;
    const getFirst = (k: string): string => (Array.isArray(params[k]) ? String(params[k][0]) : String(params[k] || ''));
    return Argus.encrypt({
      1: 0x20200929 * 2,
      2: 2,
      3: Math.floor(Math.random() * 0x80000000) >>> 0,
      4: String(aid),
      5: getFirst('device_id'),
      6: String(licenseId),
      7: getFirst('version_name'),
      8: sdkVersion,
      9: sdkVersionInt,
      10: new Uint8Array(8),
      11: 'android',
      12: ts * 2,
      13: Argus.getBodyhash(x_ss_stub),
      14: Argus.getQueryhash(queryParams ?? ''),
      15: { 1: 85, 2: 85, 3: 85, 5: 85, 6: 170, 7: ts * 2 - 310 },
      16: '',
      20: 'none',
      21: 738,
      23: { 1: getFirst('device_type'), 2: 0, 3: 'googleplay', 4: Argus.parseAppVersion(getFirst('version_name')) },
      25: 2
    });
  }
}

export { Argus };
export default Argus;
