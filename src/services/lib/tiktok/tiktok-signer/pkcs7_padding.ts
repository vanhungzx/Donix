export function pkcs7PaddingDataLength(
  buffer: Uint8Array,
  bufferSize: number,
  modulus: number
): number {
  if (bufferSize % modulus !== 0 || bufferSize < modulus) return 0

  const paddingValue = buffer[bufferSize - 1]
  if (paddingValue < 1 || paddingValue > modulus) return 0
  if (bufferSize < paddingValue + 1) return 0

  const count = 1
  bufferSize -= 1

  for (let i = count; i < paddingValue; i++) {
    bufferSize -= 1
    if (buffer[bufferSize] !== paddingValue) return 0
  }

  return bufferSize
}

export function pkcs7PaddingPadBuffer(
  buffer: Uint8Array,
  dataLength: number,
  bufferSize: number,
  modulus: number
): number {
  const padByte = modulus - (dataLength % modulus)
  if (dataLength + padByte > bufferSize) return -padByte
  for (let i = 0; i < padByte; i++) {
    buffer[dataLength + i] = padByte
  }
  return padByte
}

export function paddingSize(size: number): number {
  const mod = size % 16
  if (mod > 0) return size + (16 - mod)
  return size
}

export default { pkcs7PaddingDataLength, pkcs7PaddingPadBuffer, paddingSize }
