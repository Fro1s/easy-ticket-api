import { normalizeEmail } from './normalize-email';

describe('normalizeEmail', () => {
  it('lowercases the whole address', () => {
    expect(normalizeEmail('Laisd1465@Gmail.com')).toBe('laisd1465@gmail.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com');
  });

  it('collapses case + whitespace so duplicates resolve to one key', () => {
    expect(normalizeEmail(' LAISD1465@GMAIL.COM ')).toBe(
      normalizeEmail('laisd1465@gmail.com'),
    );
  });

  it('leaves an already-normal address unchanged', () => {
    expect(normalizeEmail('a@b.co')).toBe('a@b.co');
  });
});
