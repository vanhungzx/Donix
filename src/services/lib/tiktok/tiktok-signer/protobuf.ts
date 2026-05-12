class ProtoError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ProtoError';
  }
}

const ProtoFieldType = {
  VARINT: 0,
  INT64: 1,
  STRING: 2,
  GROUPSTART: 3,
  GROUPEND: 4,
  INT32: 5,
  ERROR1: 6,
  ERROR2: 7
} as const;

type ProtoFieldTypeValue = (typeof ProtoFieldType)[keyof typeof ProtoFieldType];
type ProtoFieldValue = number | Uint8Array;

class ProtoField {
  idx: number;
  type: ProtoFieldTypeValue;
  val: ProtoFieldValue;

  constructor(idx: number, type: ProtoFieldTypeValue, val: ProtoFieldValue) {
    this.idx = idx;
    this.type = type;
    this.val = val;
  }

  isAsciiStr(): boolean {
    if (!(this.val instanceof Uint8Array)) return false;
    for (const b of this.val) if (b < 0x20 || b > 0x7e) return false;
    return true;
  }

  toString(): string {
    if (this.type === ProtoFieldType.INT32 || this.type === ProtoFieldType.INT64 || this.type === ProtoFieldType.VARINT) {
      return `${this.idx}(${this.type}): ${this.val}`;
    }
    if (this.type === ProtoFieldType.STRING && this.val instanceof Uint8Array) {
      if (this.isAsciiStr()) return `${this.idx}(${this.type}): "${new TextDecoder().decode(this.val)}"`;
      const hexStr = Array.from(this.val).map((b) => b.toString(16).padStart(2, '0')).join('');
      return `${this.idx}(${this.type}): h"${hexStr}"`;
    }
    return `${this.idx}(${this.type}): ${this.val}`;
  }
}

class ProtoReader {
  data: Uint8Array;
  pos: number;
  constructor(data: Uint8Array) {
    this.data = data;
    this.pos = 0;
  }
  seek(pos: number): void {
    this.pos = pos;
  }
  isRemain(length: number): boolean {
    return this.pos + length <= this.data.length;
  }
  read0(): number {
    if (!this.isRemain(1)) throw new ProtoError('read0(): OOB');
    return this.data[this.pos++] & 0xff;
  }
  read(length: number): Uint8Array {
    if (!this.isRemain(length)) throw new ProtoError('read(): OOB');
    const ret = this.data.slice(this.pos, this.pos + length);
    this.pos += length;
    return ret;
  }
  readInt32(): number {
    const b = this.read(4);
    return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
  }
  readInt64(): number {
    const b = this.read(8);
    return Number(
      BigInt(b[0]) |
        (BigInt(b[1]) << 8n) |
        (BigInt(b[2]) << 16n) |
        (BigInt(b[3]) << 24n) |
        (BigInt(b[4]) << 32n) |
        (BigInt(b[5]) << 40n) |
        (BigInt(b[6]) << 48n) |
        (BigInt(b[7]) << 56n)
    );
  }
  readVarint(): number {
    let vint = 0;
    let shift = 0;
    while (true) {
      const byte = this.read0();
      vint |= (byte & 0x7f) << shift;
      if (byte < 0x80) break;
      shift += 7;
    }
    return vint >>> 0;
  }
  readString(): Uint8Array {
    return this.read(this.readVarint());
  }
  eof(): boolean {
    return this.pos >= this.data.length;
  }
}

class ProtoWriter {
  data: number[] = [];
  write0(byte: number): void {
    this.data.push(byte & 0xff);
  }
  write(bytes: Uint8Array): void {
    for (const b of bytes) this.data.push(b);
  }
  writeInt32(v: number): void {
    this.write(new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]));
  }
  writeInt64(v: number): void {
    this.write(
      new Uint8Array([
        v & 0xff,
        (v >> 8) & 0xff,
        (v >> 16) & 0xff,
        (v >> 24) & 0xff,
        (v >> 32) & 0xff,
        (v >> 40) & 0xff,
        (v >> 48) & 0xff,
        (v >> 56) & 0xff
      ])
    );
  }
  writeVarint(v: number): void {
    let value = v >>> 0;
    while (value > 0x80) {
      this.write0((value & 0x7f) | 0x80);
      value >>>= 7;
    }
    this.write0(value & 0x7f);
  }
  writeString(bytes: Uint8Array): void {
    this.writeVarint(bytes.length);
    this.write(bytes);
  }
  toBytes(): Uint8Array {
    return Uint8Array.from(this.data);
  }
}

type ProtoDictValue = number | string | Uint8Array | ProtoDict;
export interface ProtoDict {
  [key: number | string]: ProtoDictValue;
}

class ProtoBuf {
  fields: ProtoField[] = [];
  constructor(data?: Uint8Array | ProtoDict) {
    if (data instanceof Uint8Array && data.length > 0) this.parseBuf(data);
    else if (data && !(data instanceof Uint8Array) && typeof data === 'object') this.parseDict(data);
  }
  get(idx: number): ProtoField | undefined {
    return this.fields.find((f) => f.idx === idx);
  }
  getList(idx: number): ProtoField[] {
    return this.fields.filter((f) => f.idx === idx);
  }
  put(f: ProtoField): void {
    this.fields.push(f);
  }
  putInt32(idx: number, v: number): void {
    this.put(new ProtoField(idx, ProtoFieldType.INT32, v));
  }
  putInt64(idx: number, v: number): void {
    this.put(new ProtoField(idx, ProtoFieldType.INT64, v));
  }
  putVarint(idx: number, v: number): void {
    this.put(new ProtoField(idx, ProtoFieldType.VARINT, v));
  }
  putBytes(idx: number, b: Uint8Array): void {
    this.put(new ProtoField(idx, ProtoFieldType.STRING, b));
  }
  putUtf8(idx: number, s: string): void {
    this.put(new ProtoField(idx, ProtoFieldType.STRING, new TextEncoder().encode(s)));
  }
  putProtoBuf(idx: number, pb: ProtoBuf): void {
    this.put(new ProtoField(idx, ProtoFieldType.STRING, pb.toBuf()));
  }
  parseBuf(bytes: Uint8Array): void {
    const r = new ProtoReader(bytes);
    while (r.isRemain(1)) {
      const key = r.readVarint();
      const type = key & 7;
      const idx = key >> 3;
      if (idx === 0) break;
      switch (type) {
        case ProtoFieldType.INT32:
          this.put(new ProtoField(idx, type, r.readInt32()));
          break;
        case ProtoFieldType.INT64:
          this.put(new ProtoField(idx, type, r.readInt64()));
          break;
        case ProtoFieldType.VARINT:
          this.put(new ProtoField(idx, type, r.readVarint()));
          break;
        case ProtoFieldType.STRING:
          this.put(new ProtoField(idx, type, r.readString()));
          break;
        default:
          throw new ProtoError(`unexpected field type ${type}`);
      }
    }
  }
  parseDict(dict: ProtoDict): void {
    for (const [kStr, v] of Object.entries(dict)) {
      const k = Number(kStr);
      if (typeof v === 'number') this.putVarint(k, v);
      else if (typeof v === 'string') this.putUtf8(k, v);
      else if (v instanceof Uint8Array) this.putBytes(k, v);
      else if (typeof v === 'object' && v !== null) this.putProtoBuf(k, new ProtoBuf(v));
      else throw new ProtoError('Unsupported type in dict');
    }
  }
  toBuf(): Uint8Array {
    const w = new ProtoWriter();
    for (const f of this.fields) {
      const key = (f.idx << 3) | (f.type & 7);
      w.writeVarint(key);
      switch (f.type) {
        case ProtoFieldType.INT32:
          w.writeInt32(f.val as number);
          break;
        case ProtoFieldType.INT64:
          w.writeInt64(f.val as number);
          break;
        case ProtoFieldType.VARINT:
          w.writeVarint(f.val as number);
          break;
        case ProtoFieldType.STRING:
          w.writeString(f.val as Uint8Array);
          break;
        default:
          throw new ProtoError('Unexpected field type');
      }
    }
    return w.toBytes();
  }
  static fromBuf(buf: Uint8Array): Record<number, number | Uint8Array | Array<number | Uint8Array>> {
    const r = new ProtoReader(buf);
    const out: Record<number, number | Uint8Array | Array<number | Uint8Array>> = {};
    while (!r.eof()) {
      const key = r.readVarint();
      const fieldNum = key >> 3;
      const wire = key & 7;
      let value: number | Uint8Array;
      switch (wire) {
        case 0:
          value = r.readVarint();
          break;
        case 1:
          value = r.readInt64();
          break;
        case 2:
          value = r.readString();
          break;
        case 5:
          value = r.readInt32();
          break;
        default:
          throw new ProtoError(`Unexpected wire type ${wire}`);
      }
      if (fieldNum in out) {
        const cur = out[fieldNum];
        if (Array.isArray(cur)) cur.push(value);
        else out[fieldNum] = [cur, value];
      } else out[fieldNum] = value;
    }
    return out;
  }
}

export {
  ProtoBuf,
  ProtoError,
  ProtoField,
  ProtoFieldType,
  ProtoReader,
  ProtoWriter
};

export default ProtoBuf;
