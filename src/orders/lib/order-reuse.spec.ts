import { existingOrderMatchesRequest } from './order-reuse';

// Cada item do pedido existente: o batch que ele reservou (id + se é combo).
// Cada item requisitado: setor + batchId opcional (combo manda batchId; avulso não).

describe('existingOrderMatchesRequest', () => {
  it('reusa pedido avulso quando o request também é avulso (sem batchId)', () => {
    const existing = [{ batchId: 'b-avulso', ticketsPerUnit: 1 }];
    const requested = [{ sectorId: 's1', batchId: undefined }];
    expect(existingOrderMatchesRequest(existing, requested)).toBe(true);
  });

  it('NÃO reusa pedido avulso quando o request é combo (batchId diferente)', () => {
    const existing = [{ batchId: 'b-avulso', ticketsPerUnit: 1 }];
    const requested = [{ sectorId: 's1', batchId: 'b-combo' }];
    expect(existingOrderMatchesRequest(existing, requested)).toBe(false);
  });

  it('reusa pedido combo quando o request é o MESMO combo', () => {
    const existing = [{ batchId: 'b-combo', ticketsPerUnit: 3 }];
    const requested = [{ sectorId: 's1', batchId: 'b-combo' }];
    expect(existingOrderMatchesRequest(existing, requested)).toBe(true);
  });

  it('NÃO reusa pedido combo quando o request é OUTRO combo', () => {
    const existing = [{ batchId: 'b-combo-a', ticketsPerUnit: 3 }];
    const requested = [{ sectorId: 's1', batchId: 'b-combo-b' }];
    expect(existingOrderMatchesRequest(existing, requested)).toBe(false);
  });

  it('NÃO reusa pedido combo quando o request é avulso (sem batchId)', () => {
    const existing = [{ batchId: 'b-combo', ticketsPerUnit: 3 }];
    const requested = [{ sectorId: 's1', batchId: undefined }];
    expect(existingOrderMatchesRequest(existing, requested)).toBe(false);
  });

  it('NÃO reusa quando a quantidade de itens difere', () => {
    const existing = [{ batchId: 'b1', ticketsPerUnit: 1 }];
    const requested = [
      { sectorId: 's1', batchId: undefined },
      { sectorId: 's2', batchId: undefined },
    ];
    expect(existingOrderMatchesRequest(existing, requested)).toBe(false);
  });

  it('reusa multi-item avulso quando todos batem (sem batchId em ambos)', () => {
    const existing = [
      { batchId: 'b1', ticketsPerUnit: 1 },
      { batchId: 'b2', ticketsPerUnit: 1 },
    ];
    const requested = [
      { sectorId: 's1', batchId: undefined },
      { sectorId: 's2', batchId: undefined },
    ];
    expect(existingOrderMatchesRequest(existing, requested)).toBe(true);
  });
});
