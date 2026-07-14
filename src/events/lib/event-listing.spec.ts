import { EventWhen, resolveListingTimeFilter } from './event-listing';

describe('resolveListingTimeFilter', () => {
  it('upcoming: startsAt >= now, ordered ASC (soonest first)', () => {
    expect(resolveListingTimeFilter(EventWhen.UPCOMING)).toEqual({
      comparator: '>=',
      order: 'ASC',
    });
  });

  it('past: startsAt < now, ordered DESC (most recent first)', () => {
    expect(resolveListingTimeFilter(EventWhen.PAST)).toEqual({
      comparator: '<',
      order: 'DESC',
    });
  });

  it('defaults to upcoming when when is undefined', () => {
    expect(resolveListingTimeFilter(undefined)).toEqual({
      comparator: '>=',
      order: 'ASC',
    });
  });
});
