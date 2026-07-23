import { hashQrToken, holderFirstName } from './portaria-manifest';

describe('hashQrToken', () => {
  it('is sha256 hex, deterministic', () => {
    const h = hashQrToken('et:order1:tok1');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashQrToken('et:order1:tok1')).toBe(h);
    expect(hashQrToken('et:order1:tok2')).not.toBe(h);
  });
});

describe('holderFirstName', () => {
  it('prefers holderName over buyer name', () => {
    expect(holderFirstName('Maria Souza', 'Ana Lima')).toBe('Maria');
  });
  it('falls back to buyer name then empty', () => {
    expect(holderFirstName(null, 'Ana Lima')).toBe('Ana');
    expect(holderFirstName(null, null)).toBe('');
  });
});
