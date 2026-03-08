export class SM3 {
  private readonly IV: number[]
  private readonly TJ: number[]

  constructor() {
    this.IV = [
      1937774191, 1226093241, 388252375, 3666478592, 2842636476, 372324522,
      3817729613, 2969243214
    ]
    this.TJ = [
      2043430169, 2043430169, 2043430169, 2043430169, 2043430169, 2043430169,
      2043430169, 2043430169, 2043430169, 2043430169, 2043430169, 2043430169,
      2043430169, 2043430169, 2043430169, 2043430169, 2055708042, 2055708042,
      2055708042, 2055708042, 2055708042, 2055708042, 2055708042, 2055708042,
      2055708042, 2055708042, 2055708042, 2055708042, 2055708042, 2055708042,
      2055708042, 2055708042, 2055708042, 2055708042, 2055708042, 2055708042,
      2055708042, 2055708042, 2055708042, 2055708042, 2055708042, 2055708042,
      2055708042, 2055708042, 2055708042, 2055708042, 2055708042, 2055708042,
      2055708042, 2055708042, 2055708042, 2055708042, 2055708042, 2055708042,
      2055708042, 2055708042, 2055708042, 2055708042, 2055708042, 2055708042,
      2055708042, 2055708042, 2055708042, 2055708042
    ]
  }

  private rotateLeft(a: number, k: number): number {
    k = k & 31
    return ((a << k) | (a >>> (32 - k))) >>> 0
  }

  private FFJ(X: number, Y: number, Z: number, j: number): number {
    if (j >= 0 && j < 16) return (X ^ Y ^ Z) >>> 0
    return ((X & Y) | (X & Z) | (Y & Z)) >>> 0
  }

  private GGJ(X: number, Y: number, Z: number, j: number): number {
    if (j >= 0 && j < 16) return (X ^ Y ^ Z) >>> 0
    return ((X & Y) | (~X & Z)) >>> 0
  }

  private P_0(X: number): number {
    return (X ^ this.rotateLeft(X, 9) ^ this.rotateLeft(X, 17)) >>> 0
  }

  private P_1(X: number): number {
    return (X ^ this.rotateLeft(X, 15) ^ this.rotateLeft(X, 23)) >>> 0
  }

  private CF(V_i: number[], B_i: Uint8Array): number[] {
    const W = new Array<number>(68).fill(0)
    for (let i = 0; i < 16; i++) {
      const off = i * 4
      W[i] =
        ((B_i[off] << 24) | (B_i[off + 1] << 16) | (B_i[off + 2] << 8) | B_i[off + 3]) >>> 0
    }
    for (let j = 16; j < 68; j++) {
      const term = (W[j - 16] ^ W[j - 9] ^ this.rotateLeft(W[j - 3], 15)) >>> 0
      W[j] = (this.P_1(term) ^ this.rotateLeft(W[j - 13], 7) ^ W[j - 6]) >>> 0
    }
    const W1 = new Array<number>(64)
    for (let j = 0; j < 64; j++) W1[j] = (W[j] ^ W[j + 4]) >>> 0

    let [A, B, C, D, E, F, G, H] = V_i.map((x) => x >>> 0)

    for (let j = 0; j < 64; j++) {
      const rlA12 = this.rotateLeft(A, 12)
      const t = (rlA12 + E + this.rotateLeft(this.TJ[j], j)) >>> 0
      const SS1 = this.rotateLeft(t, 7)
      const SS2 = (SS1 ^ rlA12) >>> 0
      const TT1 = (this.FFJ(A, B, C, j) + D + SS2 + W1[j]) >>> 0
      const TT2 = (this.GGJ(E, F, G, j) + H + SS1 + W[j]) >>> 0

      D = C
      C = this.rotateLeft(B, 9)
      B = A
      A = TT1 >>> 0
      H = G
      G = this.rotateLeft(F, 19)
      F = E
      E = this.P_0(TT2) >>> 0
    }

    return [
      (A ^ V_i[0]) >>> 0, (B ^ V_i[1]) >>> 0, (C ^ V_i[2]) >>> 0, (D ^ V_i[3]) >>> 0,
      (E ^ V_i[4]) >>> 0, (F ^ V_i[5]) >>> 0, (G ^ V_i[6]) >>> 0, (H ^ V_i[7]) >>> 0
    ]
  }

  sm3Hash(msgInput: Uint8Array | ArrayBuffer | string): Uint8Array {
    let msg: Uint8Array
    if (typeof msgInput === 'string') {
      msg = new TextEncoder().encode(msgInput)
    } else if (msgInput instanceof ArrayBuffer) {
      msg = new Uint8Array(msgInput)
    } else {
      msg = msgInput
    }

    const mArr = Array.from(msg)
    const len1 = mArr.length
    let reserve1 = len1 % 64

    mArr.push(0x80)
    reserve1 = reserve1 + 1

    let rangeEnd = 56
    if (reserve1 > rangeEnd) rangeEnd += 64
    for (let i = reserve1; i < rangeEnd; i++) mArr.push(0x00)

    let bitLength = len1 * 8
    const lenBytes = new Array<number>(8).fill(0)
    for (let i = 7; i >= 0; i--) {
      lenBytes[i] = bitLength & 0xff
      bitLength = Math.floor(bitLength / 256)
    }
    for (const b of lenBytes) mArr.push(b)

    const totalGroups = Math.ceil(mArr.length / 64)
    const B: Uint8Array[] = []
    for (let i = 0; i < totalGroups; i++) {
      B.push(Uint8Array.from(mArr.slice(i * 64, (i + 1) * 64)))
    }

    const V: number[][] = [this.IV.slice()]
    for (let i = 0; i < totalGroups; i++) V.push(this.CF(V[i], B[i]))

    const y = V[V.length - 1]
    const res = new Uint8Array(32)
    for (let i = 0; i < 8; i++) {
      const v = y[i] >>> 0
      res[i * 4 + 0] = (v >>> 24) & 0xff
      res[i * 4 + 1] = (v >>> 16) & 0xff
      res[i * 4 + 2] = (v >>> 8) & 0xff
      res[i * 4 + 3] = v & 0xff
    }
    return res
  }
}

export default SM3
