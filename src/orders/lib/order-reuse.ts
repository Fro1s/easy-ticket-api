export interface ExistingOrderItem {
  batchId: string;
  ticketsPerUnit: number;
}

export interface RequestedItem {
  sectorId: string;
  batchId?: string;
}

/**
 * Decide se um pedido PENDENTE existente representa a MESMA seleção que o
 * request atual — usado pelo anti-flood de `create`. Só reusa o pedido antigo
 * quando ele casa com o que o usuário está pedindo agora; caso contrário (ex.:
 * trocou avulso → combo), o pedido antigo é descartado e um novo é criado.
 *
 * Regras:
 * - Request sem `batchId` (avulso) casa com um item existente avulso
 *   (`ticketsPerUnit <= 1`).
 * - Request com `batchId` (combo) casa só com um item existente que tem
 *   exatamente aquele `batchId`.
 * - Quantidade de itens precisa ser igual.
 */
export function existingOrderMatchesRequest(
  existing: ExistingOrderItem[],
  requested: RequestedItem[],
): boolean {
  if (existing.length !== requested.length) return false;

  const remaining = [...existing];
  for (const req of requested) {
    const idx = remaining.findIndex((e) =>
      req.batchId != null
        ? e.batchId === req.batchId
        : (e.ticketsPerUnit ?? 1) <= 1,
    );
    if (idx === -1) return false;
    remaining.splice(idx, 1);
  }
  return remaining.length === 0;
}
