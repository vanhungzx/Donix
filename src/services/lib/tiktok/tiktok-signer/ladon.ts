import {
  writeBigUInt64LE,
  readBigUInt64LE,
  fillBytes,
  allocBytes,
  asciiToBytes,
  concatBytes,
  stringToBytes,
  bytesToBase64
} from './buffer-utils.js'
import { md5Hex } from './crypto-utils.js'
import { randomBytes } from 'crypto'
import type { LadonEncryptParams } from '../types/index.js'

function validate(num: bigint): bigint {
  return num & BigInt('0xFFFFFFFFFFFFFFFF')
}

function rotateRight(value: bigint, count: number): bigint {
  const nbits = 64
  count = count % nbits
  return (
    ((value >> BigInt(count)) | (value << BigInt(nbits - count))) &
    BigInt('0xFFFFFFFFFFFFFFFF')
  )
}

function setUint64(ptr: Uint8Array, index: number, data: bigint): void {
  writeBigUInt64LE(ptr, data, index * 8)
}

function getUint64(ptr: Uint8Array, index: number): bigint {
  return readBigUInt64LE(ptr, index * 8)
}

function paddingSize(size: number, block = 16): number {
  const mod = size % block
  if (mod > 0) return size + (block - mod)
  return size
}

function pkcs7Pad(buf: Uint8Array, size: number, newSize: number): void {
  const padVal = newSize - size
  fillBytes(buf, padVal, size, newSize)
}

export class Ladon {
  static readonly ROUNDS = 0x22
  static readonly UINT64_MASK = BigInt('0xFFFFFFFFFFFFFFFF')

  static buildHashTable(md5hex: string): Uint8Array {
    const hashTable = allocBytes(272 + 16)
    const md5buf = asciiToBytes(md5hex)
    hashTable.set(md5buf, 0)

    const temp: bigint[] = []
    for (let i = 0; i < 4; i++) temp.push(getUint64(hashTable, i))

    let bufferB0 = temp[0]
    let bufferB8 = temp[1]
    temp.splice(0, 2)

    for (let i = 0; i < Ladon.ROUNDS; i++) {
      const x9 = bufferB0
      let x8 = bufferB8

      x8 = validate(rotateRight(x8, 8))
      x8 = validate(x8 + x9)
      x8 = validate(x8 ^ BigInt(i))

      temp.push(x8)
      x8 = validate(x8 ^ rotateRight(x9, 61))
      setUint64(hashTable, i + 1, x8)

      bufferB0 = x8
      bufferB8 = temp.shift()!
    }

    return hashTable
  }

  static encryptLadonInput(hashTable: Uint8Array, input: Uint8Array): Uint8Array {
    let data0 = readBigUInt64LE(input, 0)
    let data1 = readBigUInt64LE(input, 8)

    for (let i = 0; i < Ladon.ROUNDS; i++) {
      const hashVal = getUint64(hashTable, i)
      const rot = validate((data1 >> 8n) | (data1 << 56n))
      data1 = validate(hashVal ^ (data0 + rot))
      data0 = validate(data1 ^ rotateRight(data0, 61))
    }

    const out = allocBytes(16)
    writeBigUInt64LE(out, data0, 0)
    writeBigUInt64LE(out, data1, 8)
    return out
  }

  static decryptLadonInput(hashTable: Uint8Array, input: Uint8Array): Uint8Array {
    let data0 = readBigUInt64LE(input, 0)
    let data1 = readBigUInt64LE(input, 8)

    for (let i = Ladon.ROUNDS - 1; i >= 0; i--) {
      const hashVal = getUint64(hashTable, i)
      const rot = validate(rotateRight(data1, 61))
      data0 = validate(rot ^ data0)
      const diff = validate(data0 - hashVal)
      const rot2 = validate((diff << 8n) | (diff >> 56n))
      data1 = validate(rot2 ^ data1)
    }

    const out = allocBytes(16)
    writeBigUInt64LE(out, data0, 0)
    writeBigUInt64LE(out, data1, 8)
    return out
  }

  static encryptLadon(md5hexStr: string, data: Uint8Array): Uint8Array {
    const hashTable = Ladon.buildHashTable(md5hexStr)
    const size = data.length
    const newSize = paddingSize(size)

    const input = allocBytes(newSize)
    input.set(data, 0)
    pkcs7Pad(input, size, newSize)

    const output = allocBytes(newSize)
    for (let i = 0; i < newSize / 16; i++) {
      const block = input.subarray(i * 16, (i + 1) * 16)
      const enc = Ladon.encryptLadonInput(hashTable, block)
      output.set(enc, i * 16)
    }
    return output
  }

  static encrypt({ khronos, licenseId = 1611921764, aid = 1233, randBytes }: LadonEncryptParams): string {
    const rb = randBytes ?? new Uint8Array(randomBytes(4))
    const data = `${khronos}-${licenseId}-${aid}`
    const keygen = concatBytes(rb, stringToBytes(String(aid)))
    const md5hex = md5Hex(keygen)
    const raw = stringToBytes(data)
    const encrypted = Ladon.encryptLadon(md5hex, raw)
    return bytesToBase64(concatBytes(rb, encrypted))
  }
}

export default Ladon
