export interface BatchSnapshot {
  id: string;
  name: string;
  priceCents: number;
  capacity: number;
  sold: number;
  reserved: number;
  sortOrder: number;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface ActiveBatchResult {
  active: BatchSnapshot | null;
  next: BatchSnapshot | null;
}

function isOpen(b: BatchSnapshot, at: Date): boolean {
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
  const active = sorted.find((b) => isOpen(b, at)) ?? null;
  const next = active
    ? sorted.find(
        (b) =>
          b.id !== active.id &&
          b.sortOrder > active.sortOrder &&
          (b.sold + b.reserved) < b.capacity &&
          (!b.endsAt || b.endsAt > at),
      ) ?? null
    : null;
  return { active, next };
}
