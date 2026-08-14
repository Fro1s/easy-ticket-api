import {
  MASKED_STOCK,
  maskBatchInfo,
  maskSectorAvailability,
  maskSectorCounts,
  maskSectorResponse,
} from './mask-stock';

describe('maskSectorCounts', () => {
  const real = { capacity: 500, sold: 428, reserved: 12 };

  it('devolve os números reais quando a máscara está desligada', () => {
    expect(maskSectorCounts(real, false)).toEqual(real);
  });

  it('esconde os números mas mantém o setor comprável', () => {
    const masked = maskSectorCounts(real, true);
    expect(masked).toEqual({
      capacity: MASKED_STOCK,
      sold: 0,
      reserved: 0,
    });
  });

  it('preserva o sinal de esgotado', () => {
    const soldOut = { capacity: 500, sold: 500, reserved: 0 };
    const masked = maskSectorCounts(soldOut, true);
    expect(masked.capacity - masked.sold - masked.reserved).toBe(0);
  });

  it('trata reservas como estoque indisponível ao decidir esgotado', () => {
    const allReserved = { capacity: 100, sold: 90, reserved: 10 };
    const masked = maskSectorCounts(allReserved, true);
    expect(masked.capacity - masked.sold - masked.reserved).toBe(0);
  });

  it('nunca revela estoque negativo (oversell) como comprável', () => {
    const oversold = { capacity: 100, sold: 105, reserved: 0 };
    expect(maskSectorCounts(oversold, true).capacity).toBe(0);
  });
});

describe('maskBatchInfo', () => {
  const batch = {
    id: 'b1',
    name: '2º Lote',
    priceCents: 3800,
    ticketsPerUnit: 1,
    available: 72,
    startsAt: null,
    endsAt: null,
  };

  it('devolve o lote intacto quando a máscara está desligada', () => {
    expect(maskBatchInfo(batch, false)).toEqual(batch);
  });

  it('substitui available pelo teto por pedido, preservando o resto', () => {
    expect(maskBatchInfo(batch, true)).toEqual({
      ...batch,
      available: MASKED_STOCK,
    });
  });

  it('mantém available zero quando o lote está esgotado', () => {
    expect(maskBatchInfo({ ...batch, available: 0 }, true).available).toBe(0);
  });

  it('aceita null (setor sem lote ativo)', () => {
    expect(maskBatchInfo(null, true)).toBeNull();
  });

  it('não esconde estoque de combo abaixo do necessário para uma unidade', () => {
    const combo = { ...batch, ticketsPerUnit: 3, available: 40 };
    expect(maskBatchInfo(combo, true).available).toBeGreaterThanOrEqual(1);
  });
});

const batchInfo = (o: { id: string; available: number }) => ({
  id: o.id,
  name: `Lote ${o.id}`,
  priceCents: 3800,
  ticketsPerUnit: 1,
  available: o.available,
  startsAt: null,
  endsAt: null,
});

describe('maskSectorResponse', () => {
  const sector = {
    id: 's1',
    name: 'Pista',
    colorHex: '#c8ff00',
    capacity: 500,
    sold: 428,
    reserved: 12,
    sortOrder: 0,
    activeBatch: batchInfo({ id: 'a', available: 60 }),
    nextBatch: batchInfo({ id: 'n', available: 200 }),
    comboBatches: [
      { ...batchInfo({ id: 'c1', available: 40 }), ticketsPerUnit: 3 },
    ],
  };

  it('devolve o setor intacto quando a máscara está desligada', () => {
    expect(maskSectorResponse(sector, false)).toEqual(sector);
  });

  it('não deixa nenhum número real de estoque no payload', () => {
    const masked = maskSectorResponse(sector, true);
    const stockNumbers = [
      masked.capacity,
      masked.sold,
      masked.reserved,
      masked.activeBatch!.available,
      masked.nextBatch!.available,
      ...masked.comboBatches.map((c) => c.available),
    ];
    for (const n of stockNumbers) {
      expect([0, MASKED_STOCK]).toContain(n);
    }
  });

  it('preserva identidade, preço e ordenação do setor', () => {
    const masked = maskSectorResponse(sector, true);
    expect(masked.id).toBe('s1');
    expect(masked.name).toBe('Pista');
    expect(masked.colorHex).toBe('#c8ff00');
    expect(masked.sortOrder).toBe(0);
    expect(masked.activeBatch!.priceCents).toBe(3800);
    expect(masked.comboBatches[0].ticketsPerUnit).toBe(3);
  });

  it('mantém o setor esgotado esgotado', () => {
    const soldOut = {
      ...sector,
      capacity: 500,
      sold: 500,
      reserved: 0,
      activeBatch: batchInfo({ id: 'a', available: 0 }),
      nextBatch: null,
      comboBatches: [],
    };
    const masked = maskSectorResponse(soldOut, true);
    expect(masked.capacity - masked.sold - masked.reserved).toBe(0);
    expect(masked.activeBatch!.available).toBe(0);
  });

  it('aceita setor sem lote ativo nem próximo', () => {
    const masked = maskSectorResponse(
      { ...sector, activeBatch: null, nextBatch: null, comboBatches: [] },
      true,
    );
    expect(masked.activeBatch).toBeNull();
    expect(masked.nextBatch).toBeNull();
    expect(masked.comboBatches).toEqual([]);
  });
});

describe('maskSectorAvailability', () => {
  const sector = {
    id: 's1',
    name: 'Pista',
    capacity: 500,
    sold: 428,
    reserved: 12,
    available: 60,
  };

  it('devolve os números reais quando a máscara está desligada', () => {
    expect(maskSectorAvailability(sector, false)).toEqual(sector);
  });

  it('esconde os números mantendo o setor comprável', () => {
    expect(maskSectorAvailability(sector, true)).toEqual({
      id: 's1',
      name: 'Pista',
      capacity: MASKED_STOCK,
      sold: 0,
      reserved: 0,
      available: MASKED_STOCK,
    });
  });

  // `available` é o estoque da oferta ativa e é ele que decide comprável ou
  // não — as somas do setor podem incluir lotes futuros e não servem de sinal.
  it('usa available como sinal de esgotado, ignorando as somas do setor', () => {
    const masked = maskSectorAvailability({ ...sector, available: 0 }, true);
    expect(masked.available).toBe(0);
    expect(masked.capacity).toBe(0);
  });
});
