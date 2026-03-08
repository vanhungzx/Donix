const MASK64 = 0xffffffffffffffffn

function getBit(val: bigint, pos: number): bigint {
  return (val & (1n << BigInt(pos))) !== 0n ? 1n : 0n
}

function rotateLeft(v: bigint, n: number): bigint {
  const bn = BigInt(n)
  return ((v << bn) | (v >> (64n - bn))) & MASK64
}

function rotateRight(v: bigint, n: number): bigint {
  const bn = BigInt(n)
  return ((v >> bn) | (v << (64n - bn))) & MASK64
}

function keyExpansion(key: bigint[]): bigint[] {
  let tmp = 0n
  for (let i = 4; i < 72; i++) {
    tmp = rotateRight(key[i - 1], 3)
    tmp = tmp ^ key[i - 3]
    tmp = tmp ^ rotateRight(tmp, 1)
    const bit = getBit(0x3dc94c3a046d678bn, (i - 4) % 62)
    key[i] = (~key[i - 4] & MASK64) ^ tmp ^ bit ^ 3n
  }
  return key
}

export function simonDec(ct: [bigint, bigint], k: bigint[], c = 0): [bigint, bigint] {
  let tmp = 0n
  let f = 0n

  const key: bigint[] = new Array(72).fill(0n)
  key[0] = k[0]; key[1] = k[1]; key[2] = k[2]; key[3] = k[3]
  keyExpansion(key)

  let x_i = ct[0]
  let x_i1 = ct[1]

  for (let i = 71; i >= 0; i--) {
    tmp = x_i
    if (c === 1) {
      f = rotateLeft(x_i, 1)
    } else {
      f = rotateLeft(x_i, 1) & rotateLeft(x_i, 8)
    }
    x_i = x_i1 ^ f ^ rotateLeft(x_i, 2) ^ key[i]
    x_i &= MASK64
    x_i1 = tmp
  }

  return [x_i, x_i1]
}

export function simonEnc(pt: [bigint, bigint], k: bigint[], c = 0): [bigint, bigint] {
  let tmp = 0n
  let f = 0n

  const key: bigint[] = new Array(72).fill(0n)
  key[0] = k[0]; key[1] = k[1]; key[2] = k[2]; key[3] = k[3]
  keyExpansion(key)

  let x_i = pt[0]
  let x_i1 = pt[1]

  for (let i = 0; i < 72; i++) {
    tmp = x_i1
    if (c === 1) {
      f = rotateLeft(x_i1, 1)
    } else {
      f = rotateLeft(x_i1, 1) & rotateLeft(x_i1, 8)
    }
    x_i1 = x_i ^ f ^ rotateLeft(x_i1, 2) ^ key[i]
    x_i1 &= MASK64
    x_i = tmp
  }

  return [x_i, x_i1]
}

export default { simonDec, simonEnc }
