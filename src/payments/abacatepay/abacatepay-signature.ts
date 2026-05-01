import * as crypto from 'crypto';

export function verifyAbacateSignature(
  rawBody: string,
  receivedHex: string,
  secret: string,
): boolean {
  if (!receivedHex || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (expected.length !== receivedHex.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(receivedHex, 'hex'));
  } catch {
    return false;
  }
}
