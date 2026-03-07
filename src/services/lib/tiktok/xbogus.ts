import * as crypto from 'crypto';

const STANDARD_B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const CUSTOM_B64_ALPHABET = 'Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe';

const ENC_TRANS = (() => {
  const map = new Map<string, string>();
  for (let i = 0; i < STANDARD_B64_ALPHABET.length; i++) {
    map.set(STANDARD_B64_ALPHABET[i], CUSTOM_B64_ALPHABET[i]);
  }
  return map;
})();

function customB64Encode(buf: Buffer): string {
  const b64 = buf.toString('base64');
  let out = '';
  for (const ch of b64) out += ENC_TRANS.get(ch) ?? ch;
  return out;
}

const stdMd5Enc = (data: Buffer | string): Buffer => {
  const input = typeof data === 'string' ? Buffer.from(data) : data;
  return crypto.createHash('md5').update(input).digest();
};

function rc4Enc(keyBuf: Buffer, plaintextBuf: Buffer): Buffer {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  const keyLen = keyBuf.length;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + keyBuf[i % keyLen]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.allocUnsafe(plaintextBuf.length);
  let i = 0;
  j = 0;
  for (let n = 0; n < plaintextBuf.length; n++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
    const k = s[(s[i] + s[j]) & 0xff];
    out[n] = plaintextBuf[n] ^ k;
  }
  return out;
}

const stdRc4Enc = rc4Enc;

const xorKey = (buf: Buffer): number => buf.reduce((acc, b) => acc ^ b, 0);

function encrypt(params: string, postData: string, userAgent: string, timestamp: number): string {
  const uaKey = Buffer.from([0x00, 0x01, 0x0e]);
  const listKey = Buffer.from([0xff]);
  const fixedVal = 0x4a41279f;

  const md5Params = stdMd5Enc(stdMd5Enc(Buffer.from(params, 'utf8')));
  const md5Post = stdMd5Enc(stdMd5Enc(Buffer.from(postData, 'utf8')));
  const uaRc4 = stdRc4Enc(uaKey, Buffer.from(userAgent, 'utf8'));
  const uaB64 = Buffer.from(uaRc4).toString('base64');
  const md5Ua = stdMd5Enc(Buffer.from(uaB64, 'ascii'));

  const parts = [
    Buffer.from([0x40]),
    uaKey,
    md5Params.subarray(14, 16),
    md5Post.subarray(14, 16),
    md5Ua.subarray(14, 16),
    (() => {
      const b = Buffer.allocUnsafe(4);
      b.writeUInt32BE(timestamp >>> 0);
      return b;
    })(),
    (() => {
      const b = Buffer.allocUnsafe(4);
      b.writeUInt32BE(fixedVal);
      return b;
    })(),
  ];

  let buffer = Buffer.concat(parts);
  const checksum = xorKey(buffer);
  buffer = Buffer.concat([buffer, Buffer.from([checksum])]);

  const enc = Buffer.concat([
    Buffer.from([0x02]),
    listKey,
    stdRc4Enc(listKey, buffer),
  ]);

  return customB64Encode(enc);
}

export default encrypt;
