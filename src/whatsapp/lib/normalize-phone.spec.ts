import { normalizeBrPhone } from './normalize-phone';

describe('normalizeBrPhone', () => {
  it('accepts formatted mobile with DDD', () => {
    expect(normalizeBrPhone('(14) 99696-2007')).toBe('5514996962007');
  });

  it('accepts bare 11-digit mobile', () => {
    expect(normalizeBrPhone('14996962007')).toBe('5514996962007');
  });

  it('accepts 10-digit landline', () => {
    expect(normalizeBrPhone('1433334444')).toBe('551433334444');
  });

  it('accepts number already with country code', () => {
    expect(normalizeBrPhone('+55 14 99696-2007')).toBe('5514996962007');
  });

  it('strips leading zero carrier prefix', () => {
    expect(normalizeBrPhone('014996962007')).toBe('5514996962007');
  });

  it('rejects garbage and short numbers', () => {
    expect(normalizeBrPhone('123')).toBeNull();
    expect(normalizeBrPhone('')).toBeNull();
    expect(normalizeBrPhone(null)).toBeNull();
    expect(normalizeBrPhone(undefined)).toBeNull();
  });
});
