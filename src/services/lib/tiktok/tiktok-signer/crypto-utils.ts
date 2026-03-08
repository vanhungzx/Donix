import crypto from 'crypto'
import { allocBytes, hexToBytes } from './buffer-utils.js'

export function md5Hex(data: Uint8Array | string): string {
  const hash = crypto.createHash('md5')
  if (data instanceof Uint8Array) {
    hash.update(Buffer.from(data))
  } else {
    hash.update(data)
  }
  return hash.digest('hex')
}

export function md5Bytes(data: Uint8Array | string): Uint8Array {
  return hexToBytes(md5Hex(data))
}

export function aesCbcEncrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(key), Buffer.from(iv))
  cipher.setAutoPadding(false)
  const encrypted = Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()])
  return new Uint8Array(encrypted)
}

export function aesCbcDecrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(key), Buffer.from(iv))
  decipher.setAutoPadding(false)
  const decrypted = Buffer.concat([decipher.update(Buffer.from(data)), decipher.final()])
  return new Uint8Array(decrypted)
}

export function pkcs7Pad(data: Uint8Array, blockSize = 16): Uint8Array {
  const pad = blockSize - (data.length % blockSize)
  const out = allocBytes(data.length + pad)
  out.set(data, 0)
  out.fill(pad, data.length)
  return out
}

export default { md5Hex, md5Bytes, aesCbcEncrypt, aesCbcDecrypt, pkcs7Pad }
