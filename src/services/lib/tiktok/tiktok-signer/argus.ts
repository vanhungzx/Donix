import qs from 'qs'
import {
  allocBytes,
  hexToBytes,
  stringToBytes,
  readBigUInt64LE,
  writeBigUInt64LE,
  concatBytes,
  asciiToBytes,
  bytesToBase64
} from './buffer-utils.js'
import { md5Bytes, pkcs7Pad, aesCbcEncrypt } from './crypto-utils.js'
import { ProtoBuf } from './protobuf.js'
import { simonEnc } from './simon.js'
import { SM3 } from './sm3.js'
import type { ArgusSignParams } from '../types/index.js'

function pkcs7PadBytes(buf: Uint8Array, blockSize = 16): Uint8Array {
  const pad = blockSize - (buf.length % blockSize)
  const out = allocBytes(buf.length + pad)
  out.set(buf, 0)
  out.fill(pad, buf.length)
  return out
}

export class Argus {
  static readonly SIGN_KEY = hexToBytes(
    'ac1adaae95a7af94a5114ab3b3a97dd80050aa0a39314c40528caec95256c28c'
  )
  static readonly SM3_OUTPUT = hexToBytes(
    'fc78e0a9657a0c748ce51559903ccf03510e51d3cff232d71343e88a321c5304'
  )

  static encryptEncPb(data: Uint8Array, length: number): Uint8Array {
    const arr = new Uint8Array(data.subarray(0, length))
    const xorArray = new Uint8Array(arr.subarray(0, 8))

    for (let i = 8; i < length; i++) {
      arr[i] = arr[i] ^ xorArray[i % 8]
    }

    const reversed = allocBytes(arr.length)
    for (let i = 0; i < arr.length; i++) {
      reversed[i] = arr[arr.length - 1 - i]
    }
    return reversed
  }

  static getBodyhash(stub?: string): Uint8Array {
    if (!stub || stub.length === 0) {
      return new SM3().sm3Hash(new Uint8Array(16)).subarray(0, 6)
    }
    return new SM3().sm3Hash(hexToBytes(stub)).subarray(0, 6)
  }

  static getQueryhash(query: string): Uint8Array {
    if (!query || query.length === 0) {
      return new SM3().sm3Hash(allocBytes(16)).subarray(0, 6)
    }
    return new SM3().sm3Hash(stringToBytes(query)).subarray(0, 6)
  }

  static prepareKeyList(key: Uint8Array): bigint[] {
    const keyList: bigint[] = []
    for (let i = 0; i < 2; i++) {
      const slice = key.slice(i * 16, (i + 1) * 16)
      keyList.push(readBigUInt64LE(slice, 0), readBigUInt64LE(slice, 8))
    }
    return keyList
  }

  static encryptBlocks(protobuf: Uint8Array, keyList: bigint[], newLen: number): Uint8Array {
    const encPb = allocBytes(newLen)
    const blockCount = Math.floor(newLen / 16)
    for (let blockIdx = 0; blockIdx < blockCount; blockIdx++) {
      const offset = blockIdx * 16
      const a = readBigUInt64LE(protobuf, offset)
      const b = readBigUInt64LE(protobuf, offset + 8)
      const ct = simonEnc([a, b], keyList)
      writeBigUInt64LE(encPb, ct[0], offset)
      writeBigUInt64LE(encPb, ct[1], offset + 8)
    }
    return encPb
  }

  static encrypt(xargusBean: Record<number, unknown>): string {
    // Re-parse using ProtoBuf dict approach
    const pbInstance = new ProtoBuf(new Uint8Array(0))
    pbInstance.parseDict(xargusBean as Parameters<typeof pbInstance['parseDict']>[0])
    const pbBuf = pbInstance.toBuf()

    const protobuf = pkcs7PadBytes(pbBuf, 16)
    const newLen = protobuf.length

    const key = Argus.SM3_OUTPUT.slice(0, 32)
    const keyList = Argus.prepareKeyList(key)
    const encPb = Argus.encryptBlocks(protobuf, keyList, newLen)

    const header = new Uint8Array([0xf2, 0xf7, 0xfc, 0xff, 0xf2, 0xf7, 0xfc, 0xff])
    let bBuffer = concatBytes(header, encPb)
    bBuffer = Argus.encryptEncPb(bBuffer, newLen + 8)
    bBuffer = concatBytes(
      new Uint8Array([0xa6, 0x6e, 0xad, 0x9f, 0x77, 0x01, 0xd0, 0x0c, 0x18]),
      bBuffer,
      asciiToBytes('ao')
    )

    const keyMd5 = md5Bytes(Argus.SIGN_KEY.slice(0, 16))
    const ivMd5 = md5Bytes(Argus.SIGN_KEY.slice(16))
    const toEncrypt = pkcs7Pad(bBuffer, 16)
    const encrypted = aesCbcEncrypt(toEncrypt, keyMd5, ivMd5)

    return bytesToBase64(concatBytes(new Uint8Array([0xf2, 0x81]), encrypted))
  }

  static parseAppVersion(versionName: string): number {
    const parts = versionName.split('.')
    const p0 = Number(parts[0] ?? 0)
    const p1 = Number(parts[1] ?? 0)
    const p2 = Number(parts[2] ?? 0)

    const hexStr = (
      (p2 * 4).toString(16) +
      (p1 * 16).toString(16) +
      (p0 * 4).toString(16) +
      '00'
    ).padStart(8, '0')

    return (parseInt(hexStr, 16) << 1) >>> 0
  }

  static parseOsVersion(osVersionStr: string): number {
    const parts = osVersionStr.split('.').map((s) => Number(s))
    while (parts.length < 3) parts.push(0)
    return ((parts[0] - 4 + parts[1] * 256 + parts[2] * 4096) * 2) >>> 0
  }

  static getSign({
    queryParams,
    x_ss_stub,
    timestamp,
    aid = 1233,
    licenseId = 1611921764,
    platform: _platform = 0,
    secDeviceId = '',
    sdkVersion = 'v05.00.03-ov-android',
    sdkVersionInt = 167773760
  }: ArgusSignParams): string {
    const ts = timestamp ?? Math.floor(Date.now() / 1000)
    const params = qs.parse(queryParams ?? '')

    const getFirst = (k: string): string => {
      const v = params[k]
      if (!v) return ''
      if (Array.isArray(v)) return String(v[0])
      return String(v)
    }

    const appVersionConstant = Argus.parseAppVersion(getFirst('version_name'))

    const xargusBean = {
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
      15: {
        1: 85, 2: 85, 3: 85, 5: 85, 6: 170,
        7: ts * 2 - 310
      },
      16: secDeviceId,
      20: 'none',
      21: 738,
      23: {
        1: getFirst('device_type'),
        2: 0,
        3: 'googleplay',
        4: appVersionConstant
      },
      25: 2
    }

    return Argus.encrypt(xargusBean)
  }
}

export default Argus
