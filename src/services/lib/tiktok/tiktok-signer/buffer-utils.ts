import { randomBytes as nodeRandomBytes } from 'crypto';

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function asciiToBytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i += 1) bytes[i] = str.charCodeAt(i);
  return bytes;
}

function allocBytes(size: number): Uint8Array {
  return new Uint8Array(size);
}

function readBigUInt64LE(bytes: Uint8Array, offset = 0): bigint {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset, true);
}

function writeBigUInt64LE(bytes: Uint8Array, value: bigint, offset = 0): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setBigUint64(offset, value, true);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function copyBytes(src: Uint8Array, dst: Uint8Array, dstOffset = 0, srcStart = 0, srcEnd?: number): void {
  dst.set(src.subarray(srcStart, srcEnd), dstOffset);
}

function fillBytes(bytes: Uint8Array, value: number, start = 0, end?: number): void {
  bytes.fill(value, start, end);
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function randomBytes(size: number): Uint8Array {
  return new Uint8Array(nodeRandomBytes(size));
}

export {
  hexToBytes,
  bytesToHex,
  stringToBytes,
  bytesToString,
  asciiToBytes,
  allocBytes,
  readBigUInt64LE,
  writeBigUInt64LE,
  concatBytes,
  copyBytes,
  fillBytes,
  bytesToBase64,
  base64ToBytes,
  randomBytes
};

export default {
  hexToBytes,
  bytesToHex,
  stringToBytes,
  bytesToString,
  asciiToBytes,
  allocBytes,
  readBigUInt64LE,
  writeBigUInt64LE,
  concatBytes,
  copyBytes,
  fillBytes,
  bytesToBase64,
  base64ToBytes,
  randomBytes
};
