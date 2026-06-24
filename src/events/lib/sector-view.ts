import { resolveActiveBatch, BatchSnapshot, isBatchOpen } from './active-batch';

export function openComboBatches(snapshots: BatchSnapshot[], at: Date): BatchSnapshot[] {
  return snapshots.filter((b) => b.ticketsPerUnit > 1 && isBatchOpen(b, at));
}

export function toBatchInfo(b: BatchSnapshot) {
  return {
    id: b.id,
    name: b.name,
    priceCents: b.priceCents,
    ticketsPerUnit: b.ticketsPerUnit ?? 1,
    available: Math.max(0, b.capacity - b.sold - b.reserved),
    startsAt: b.startsAt?.toISOString() ?? null,
    endsAt: b.endsAt?.toISOString() ?? null,
  };
}

// Resolve o lote AVULSO (ticketsPerUnit <= 1) ativo. Combos (tpu > 1) nunca
// entram aqui — eles são ofertas paralelas com estoque próprio e não devem ser
// confundidos com o lote individual ativo do setor.
export function resolveActiveAvulso(snapshots: BatchSnapshot[], at: Date) {
  const avulso = snapshots.filter((b) => b.ticketsPerUnit <= 1);
  return resolveActiveBatch(avulso, at);
}

export function buildSectorView(
  sector: { id: string; name: string; colorHex: string; sortOrder: number },
  snapshots: BatchSnapshot[],
  at: Date,
) {
  const { active, next } = resolveActiveAvulso(snapshots, at);
  return {
    activeBatch: active ? toBatchInfo(active) : null,
    nextBatch: next ? toBatchInfo(next) : null,
    comboBatches: openComboBatches(snapshots, at).map(toBatchInfo),
  };
}
