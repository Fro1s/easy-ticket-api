// Imported from the lib (not ./events.service) because importing the service
// pulls the TypeORM entity chain → @paralleldrive/cuid2 (ESM) → crashes Jest.
// events.service re-exports buildSectorView, so the public contract still holds.
import { buildSectorView } from './lib/sector-view';
import { BatchSnapshot } from './lib/active-batch';

const at = new Date('2026-05-01T12:00:00Z');
const mk = (o: Partial<BatchSnapshot>): BatchSnapshot => ({
  id: 'b', name: 'L', priceCents: 100, ticketsPerUnit: 1, capacity: 10,
  sold: 0, reserved: 0, sortOrder: 0, startsAt: null, endsAt: null, isActive: true, ...o,
});

describe('buildSectorView', () => {
  const sec = { id: 's', name: 'Pista', colorHex: '#fff', sortOrder: 0 };

  it('activeBatch resolve só entre avulsos; combos vão em comboBatches', () => {
    const v = buildSectorView(sec, [
      mk({ id: 'avulso', ticketsPerUnit: 1, sortOrder: 1 }),
      mk({ id: 'combo', ticketsPerUnit: 3, sortOrder: 0, priceCents: 4000 }),
    ], at);
    expect(v.activeBatch?.id).toBe('avulso');
    expect(v.comboBatches.map((c) => c.id)).toEqual(['combo']);
  });

  it('setor só com combo: activeBatch null, combo aparece', () => {
    const v = buildSectorView(sec, [mk({ id: 'combo', ticketsPerUnit: 3 })], at);
    expect(v.activeBatch).toBeNull();
    expect(v.comboBatches.map((c) => c.id)).toEqual(['combo']);
  });

  it('combo fechado (esgotado) não entra em comboBatches', () => {
    const v = buildSectorView(sec, [mk({ id: 'combo', ticketsPerUnit: 3, sold: 5, capacity: 5 })], at);
    expect(v.comboBatches).toEqual([]);
  });

  it('combo fora da janela (endsAt passado) não entra', () => {
    const v = buildSectorView(sec, [mk({ id: 'combo', ticketsPerUnit: 3, endsAt: new Date('2026-04-01T00:00:00Z') })], at);
    expect(v.comboBatches).toEqual([]);
  });

  it('available reflete o estoque do próprio batch, independente entre lote e combo', () => {
    const v = buildSectorView(sec, [
      mk({ id: 'avulso', ticketsPerUnit: 1, sortOrder: 1, capacity: 25, sold: 24, reserved: 0 }),
      mk({ id: 'combo', ticketsPerUnit: 3, sortOrder: 0, capacity: 5, sold: 2, reserved: 0 }),
    ], at);
    expect(v.activeBatch?.available).toBe(1);
    expect(v.comboBatches[0]?.available).toBe(3);
  });
});
