import { clampValidatedAt } from './clamp-validated-at';

describe('clampValidatedAt', () => {
  const now = new Date('2026-07-21T20:00:00Z');

  it('keeps a valid past timestamp', () => {
    expect(
      clampValidatedAt('2026-07-21T19:30:00Z', now).toISOString(),
    ).toBe('2026-07-21T19:30:00.000Z');
  });

  it('clamps future timestamps to now', () => {
    expect(clampValidatedAt('2026-07-21T23:00:00Z', now)).toEqual(now);
  });

  it('falls back to now on garbage', () => {
    expect(clampValidatedAt('not-a-date', now)).toEqual(now);
  });
});
