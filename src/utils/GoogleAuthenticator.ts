import { createHmac } from 'node:crypto';

class GoogleAuthenticator {
  private _codeLength: number;

  constructor() {
    this._codeLength = 6;
  }

  getCode(secret: string, timeSlice: number | null = null): string {
    if (timeSlice === null) {
      timeSlice = Math.floor(Date.now() / 1000 / 30);
    }

    const secretkey = this._base32Decode(secret);

    const time = Buffer.alloc(8);
    time.writeUInt32BE(timeSlice, 4);

    const hmac = createHmac('sha1', secretkey);
    hmac.update(time);

    const hash = hmac.digest();

    const lastByte = hash[hash.length - 1];
    if (lastByte === undefined) {
      throw new Error('Invalid hash length');
    }
    const offset = lastByte & 0x0F;
    const hashpart = hash.slice(offset, offset + 4);

    let code = hashpart.readUInt32BE(0) & 0x7FFFFFFF;
    code %= Math.pow(10, this._codeLength);

    return code.toString().padStart(this._codeLength, '0');
  }

  private _base32Decode(secret: string): Buffer {
    const base32chars = this._getBase32LookupTable();
    const base32charsFlipped: { [key: string]: number } = {};

    for (let i = 0; i < base32chars.length; i++) {
      const char = base32chars[i];
      if (char !== undefined) {
        base32charsFlipped[char] = i;
      }
    }

    secret = secret.replace(/=+$/, '');
    const charCount = secret.length;
    const bits: number[] = [];
    let buffer = 0, bitsLength = 0;

    for (let i = 0; i < charCount; i++) {
      const char = secret[i];
      if (char === undefined) {
        throw new Error('Invalid base32 character');
      }
      const value = base32charsFlipped[char];

      if (value === undefined) {
        throw new Error('Invalid base32 character');
      }

      buffer = (buffer << 5) | value;
      bitsLength += 5;

      if (bitsLength >= 8) {
        bits.push((buffer >> (bitsLength - 8)) & 0xFF);
        bitsLength -= 8;
      }
    }

    return Buffer.from(bits);
  }

  private _getBase32LookupTable(): string[] {
    return [
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
      'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
      'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X',
      'Y', 'Z', '2', '3', '4', '5', '6', '7',
      '='
    ];
  }
}

export default GoogleAuthenticator;
