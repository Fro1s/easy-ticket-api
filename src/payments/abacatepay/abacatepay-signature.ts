import * as crypto from 'crypto';

/** Comparação de strings em tempo constante (evita side-channel de timing). */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyAbacateSignature(
  rawBody: string,
  receivedHex: string,
  secret: string,
): boolean {
  if (!receivedHex || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  if (expected.length !== receivedHex.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(receivedHex, 'hex'),
    );
  } catch {
    return false;
  }
}
