import { randomBytes as nodeRandomBytes } from 'crypto'

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

export function asciiToBytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i)
  }
  return bytes
}

export function allocBytes(size: number): Uint8Array {
  return new Uint8Array(size)
}

export function readBigUInt64LE(bytes: Uint8Array, offset = 0): bigint {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return view.getBigUint64(offset, true)
}

export function writeBigUInt64LE(bytes: Uint8Array, value: bigint, offset = 0): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  view.setBigUint64(offset, value, true)
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

export function copyBytes(
  src: Uint8Array,
  dst: Uint8Array,
  dstOffset = 0,
  srcStart = 0,
  srcEnd?: number
): void {
  const slice = src.subarray(srcStart, srcEnd)
  dst.set(slice, dstOffset)
}

export function fillBytes(bytes: Uint8Array, value: number, start = 0, end?: number): void {
  bytes.fill(value, start, end)
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return Buffer.from(binary, 'binary').toString('base64')
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = Buffer.from(base64, 'base64').toString('binary')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function randomBytes(size: number): Uint8Array {
  return new Uint8Array(nodeRandomBytes(size))
}

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
}
