export enum EventWhen {
  UPCOMING = 'upcoming',
  PAST = 'past',
}

export interface ListingTimeFilter {
  /** SQL comparator applied to `event.startsAt` against "now". */
  comparator: '>=' | '<';
  /** Order direction for `event.startsAt`. */
  order: 'ASC' | 'DESC';
}

/**
 * Resolves how the public event listing should filter and order by time.
 *
 * - `upcoming` (default): events whose start is now or in the future, soonest first.
 * - `past`: events that already started, most recent first.
 *
 * Returns fixed literals (never user input), so the caller can safely inline
 * the comparator into a query fragment.
 */
export function resolveListingTimeFilter(when?: EventWhen): ListingTimeFilter {
  return when === EventWhen.PAST
    ? { comparator: '<', order: 'DESC' }
    : { comparator: '>=', order: 'ASC' };
}
