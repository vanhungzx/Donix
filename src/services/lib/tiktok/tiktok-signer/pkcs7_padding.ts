function pkcs7PaddingDataLength(buffer: Uint8Array, bufferSize: number, modulus: number): number {
  if (bufferSize % modulus !== 0 || bufferSize < modulus) return 0;
  const paddingValue = buffer[bufferSize - 1];
  if (paddingValue < 1 || paddingValue > modulus) return 0;
  if (bufferSize < paddingValue + 1) return 0;
  let size = bufferSize - 1;
  for (let i = 1; i < paddingValue; i += 1) {
    size -= 1;
    if (buffer[size] !== paddingValue) return 0;
  }
  return size;
}

function pkcs7PaddingPadBuffer(buffer: Uint8Array, dataLength: number, bufferSize: number, modulus: number): number {
  const padByte = modulus - (dataLength % modulus);
  if (dataLength + padByte > bufferSize) return -padByte;
  for (let i = 0; i < padByte; i += 1) buffer[dataLength + i] = padByte;
  return padByte;
}

function paddingSize(size: number): number {
  const mod = size % 16;
  return mod > 0 ? size + (16 - mod) : size;
}

export { pkcs7PaddingDataLength, pkcs7PaddingPadBuffer, paddingSize };
export default {
  pkcs7PaddingDataLength,
  pkcs7PaddingPadBuffer,
  paddingSize
};
