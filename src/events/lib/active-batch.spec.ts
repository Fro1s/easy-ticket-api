import { resolveActiveBatch, BatchSnapshot } from './active-batch';

const mk = (over: Partial<BatchSnapshot>): BatchSnapshot => ({
  id: 'b',
  name: 'L',
  priceCents: 100,
  capacity: 10,
  sold: 0,
  reserved: 0,
  sortOrder: 0,
  startsAt: null,
  endsAt: null,
  ...over,
});

describe('resolveActiveBatch', () => {
  const now = new Date('2026-05-01T12:00:00Z');

  it('returns null when no batches', () => {
    expect(resolveActiveBatch([], now)).toEqual({ active: null, next: null });
  });

  it('picks lowest sortOrder among open batches', () => {
    const batches = [
      mk({ id: 'b2', sortOrder: 2, priceCents: 200 }),
      mk({ id: 'b1', sortOrder: 1, priceCents: 100 }),
    ];
    const r = resolveActiveBatch(batches, now);
    expect(r.active?.id).toBe('b1');
    expect(r.next?.id).toBe('b2');
  });

  it('skips batch sold out (sold + reserved >= capacity)', () => {
    const batches = [
      mk({ id: 'b1', sortOrder: 1, capacity: 10, sold: 8, reserved: 2 }),
      mk({ id: 'b2', sortOrder: 2 }),
    ];
    expect(resolveActiveBatch(batches, now).active?.id).toBe('b2');
  });

  it('skips batch whose startsAt is in the future', () => {
    const future = new Date(now.getTime() + 60_000);
    const batches = [
      mk({ id: 'b1', sortOrder: 1, startsAt: future }),
      mk({ id: 'b2', sortOrder: 2 }),
    ];
    expect(resolveActiveBatch(batches, now).active?.id).toBe('b2');
  });

  it('skips batch whose endsAt is in the past', () => {
    const past = new Date(now.getTime() - 60_000);
    const batches = [
      mk({ id: 'b1', sortOrder: 1, endsAt: past }),
      mk({ id: 'b2', sortOrder: 2 }),
    ];
    expect(resolveActiveBatch(batches, now).active?.id).toBe('b2');
  });

  it('returns null active when all batches are sold out / past', () => {
    const past = new Date(now.getTime() - 1);
    const batches = [
      mk({ id: 'b1', sortOrder: 1, endsAt: past }),
      mk({ id: 'b2', sortOrder: 2, capacity: 5, sold: 5 }),
    ];
    expect(resolveActiveBatch(batches, now).active).toBeNull();
  });

  it('next is the upcoming batch by startsAt when active is the open one', () => {
    const future = new Date(now.getTime() + 60_000);
    const batches = [
      mk({ id: 'now', sortOrder: 1 }),
      mk({ id: 'later', sortOrder: 2, startsAt: future }),
    ];
    const r = resolveActiveBatch(batches, now);
    expect(r.active?.id).toBe('now');
    expect(r.next?.id).toBe('later');
  });
});
