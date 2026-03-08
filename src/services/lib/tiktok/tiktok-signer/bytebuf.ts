import { pkcs7PaddingDataLength } from './pkcs7_padding.js'

export class ByteBuf {
  private mem: Uint8Array
  private dataSize: number
  pos: number

  constructor(data?: Uint8Array, size?: number) {
    if (data) {
      this.mem = data
    } else {
      this.mem = new Uint8Array(0)
    }

    if (size !== undefined) {
      this.dataSize = size
    } else if (data) {
      this.dataSize = data.length
    } else {
      throw new Error('either size or data must be provided')
    }
    this.pos = 0
  }

  data(): Uint8Array {
    return this.mem
  }

  size(): number {
    return this.dataSize
  }

  removePadding(): Uint8Array {
    const paddingSize = pkcs7PaddingDataLength(this.mem, this.dataSize, 16)
    if (paddingSize === 0) return this.mem
    this.dataSize = paddingSize
    this.mem = this.mem.slice(0, this.dataSize)
    return this.mem
  }
}

export default ByteBuf
