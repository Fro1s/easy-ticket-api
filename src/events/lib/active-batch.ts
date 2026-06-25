export interface BatchSnapshot {
  id: string;
  name: string;
  priceCents: number;
  ticketsPerUnit: number;
  capacity: number;
  sold: number;
  reserved: number;
  sortOrder: number;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
}

export interface ActiveBatchResult {
  active: BatchSnapshot | null;
  next: BatchSnapshot | null;
}

export function isBatchOpen(b: BatchSnapshot, at: Date): boolean {
  if (!b.isActive) return false;
  if (b.sold + b.reserved >= b.capacity) return false;
  if (b.startsAt && b.startsAt > at) return false;
  if (b.endsAt && b.endsAt <= at) return false;
  return true;
}

export function resolveActiveBatch(
  batches: BatchSnapshot[],
  at: Date,
): ActiveBatchResult {
  if (!batches.length) return { active: null, next: null };
  const sorted = batches.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const active = sorted.find((b) => isBatchOpen(b, at)) ?? null;
  const next = active
    ? (sorted.find(
        (b) =>
          b.id !== active.id &&
          b.sortOrder > active.sortOrder &&
          b.isActive &&
          b.sold + b.reserved < b.capacity &&
          (!b.endsAt || b.endsAt > at),
      ) ?? null)
    : null;
  return { active, next };
}
