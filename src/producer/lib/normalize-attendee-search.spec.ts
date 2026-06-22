import { normalizeAttendeeSearch } from './normalize-attendee-search';

describe('normalizeAttendeeSearch', () => {
  it('returns null term for undefined', () => {
    expect(normalizeAttendeeSearch(undefined)).toEqual({ term: null });
  });

  it('returns null term for null', () => {
    expect(normalizeAttendeeSearch(null)).toEqual({ term: null });
  });

  it('returns null term for empty string', () => {
    expect(normalizeAttendeeSearch('')).toEqual({ term: null });
  });

  it('returns null term for whitespace only', () => {
    expect(normalizeAttendeeSearch('   ')).toEqual({ term: null });
  });

  it('returns null term for a single character', () => {
    expect(normalizeAttendeeSearch('a')).toEqual({ term: null });
  });

  it('returns null term for a single character with surrounding spaces', () => {
    expect(normalizeAttendeeSearch('  a  ')).toEqual({ term: null });
  });

  it('returns trimmed term for two or more characters', () => {
    expect(normalizeAttendeeSearch('  joao ')).toEqual({ term: 'joao' });
  });

  it('returns trimmed term for a ticket code', () => {
    expect(normalizeAttendeeSearch('ET-ABC123')).toEqual({ term: 'ET-ABC123' });
  });
});
