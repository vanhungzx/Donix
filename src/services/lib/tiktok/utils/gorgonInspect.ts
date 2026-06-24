export function decodeGorgon8404(hex: string): Record<string, unknown> {
  const h = String(hex || '').replace(/^0x/i, '').toLowerCase();
  if (!h.startsWith('8404')) return { error: 'Not Gorgon 8404 (prefix 8404).' };
  const rest = h.slice(4);
  if (rest.length < 48) {
    return { error: `Too short: ${rest.length} hex, need at least 48 (4 random + 20-byte payload tail).` };
  }
  const pay = rest.slice(8, 48);
  const khronosBE = pay.slice(32, 40);
  const khronosU =
    (parseInt(khronosBE.slice(0, 2), 16) << 24) |
    (parseInt(khronosBE.slice(2, 4), 16) << 16) |
    (parseInt(khronosBE.slice(4, 6), 16) << 8) |
    parseInt(khronosBE.slice(6, 8), 16);
  return {
    version: '8404',
    md5QueryFirst4Hex: pay.slice(0, 8),
    md5BodyFirst4OrZerosHex: pay.slice(8, 16),
    md5CookieFirst4OrZerosHex: pay.slice(16, 24),
    const4BytesHex: pay.slice(24, 32),
    khronosInPayloadHex: khronosBE,
    khronosDecodedUnixBE: (khronosU >>> 0).toString(),
    restAfter48Hex: rest.length > 48 ? rest.slice(48) : null
  };
}

export function decodeGorgon0404(hex: string): Record<string, unknown> {
  const h = String(hex || '').toLowerCase();
  if (!h.startsWith('0404b0d30000')) return { error: 'Not prefix 0404b0d30000' };
  return {
    version: '0404',
    staticPrefix: '0404b0d30000',
    encrypted20Hex: h.slice(12, 52),
    hint: '20 bytes from MD5(query|body|cookie)+xor; khronos from X-Khronos header.'
  };
}
