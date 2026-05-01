import { verifyAbacateSignature } from './abacatepay-signature';
import * as crypto from 'crypto';

describe('verifyAbacateSignature', () => {
  const secret = 'shhh';
  const body = JSON.stringify({ event: 'billing.paid', data: { id: 'ch_1', status: 'PAID' } });
  const valid = crypto.createHmac('sha256', secret).update(body).digest('hex');

  it('accepts a valid signature', () => {
    expect(verifyAbacateSignature(body, valid, secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifyAbacateSignature(body + ' ', valid, secret)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    expect(verifyAbacateSignature(body, valid, 'other')).toBe(false);
  });

  it('rejects empty signature', () => {
    expect(verifyAbacateSignature(body, '', secret)).toBe(false);
  });

  it('rejects mismatched length signature', () => {
    expect(verifyAbacateSignature(body, 'abc', secret)).toBe(false);
  });
});
