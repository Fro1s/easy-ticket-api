/**
 * Máscara de estoque para as respostas públicas de um evento com
 * `hideRemainingTickets` ligado.
 *
 * A regra é esconder o VOLUME sem esconder o SINAL: o comprador (e qualquer um
 * lendo o JSON no devtools) continua sabendo se ainda dá para comprar, mas não
 * quanto resta. Por isso não basta omitir o número na UI — o payload também sai
 * mascarado.
 *
 * Trocamos o estoque real por `MASKED_STOCK`, que é o limite de ingressos por
 * pedido já aplicado no checkout. É o menor valor que não atrapalha a compra:
 * o front nunca oferece mais que isso, então nada quebra, e ao mesmo tempo o
 * número não diz nada sobre o estoque verdadeiro. A validação de estoque na
 * criação do pedido é feita no servidor com os números reais.
 */
export const MASKED_STOCK = 2;

export type SectorCounts = {
  capacity: number;
  sold: number;
  reserved: number;
};

/** Contagens agregadas do setor: viram `MASKED_STOCK / 0 / 0`, ou zeros se esgotado. */
export function maskSectorCounts(
  counts: SectorCounts,
  hide: boolean,
): SectorCounts {
  if (!hide) return counts;
  const soldOut = counts.capacity - counts.sold - counts.reserved <= 0;
  return {
    capacity: soldOut ? 0 : MASKED_STOCK,
    sold: 0,
    reserved: 0,
  };
}

type BatchInfoLike = { available: number };

/** Estoque de um lote/combo: só `available` muda; preço, nome e janela seguem reais. */
export function maskBatchInfo<T extends BatchInfoLike>(
  batch: T,
  hide: boolean,
): T;
export function maskBatchInfo<T extends BatchInfoLike>(
  batch: T | null,
  hide: boolean,
): T | null;
export function maskBatchInfo<T extends BatchInfoLike>(
  batch: T | null,
  hide: boolean,
): T | null {
  if (!hide || batch == null) return batch;
  return {
    ...batch,
    available: batch.available > 0 ? MASKED_STOCK : 0,
  };
}

type SectorResponseLike = SectorCounts & {
  activeBatch: BatchInfoLike | null;
  nextBatch: BatchInfoLike | null;
  comboBatches: BatchInfoLike[];
};

/** Setor do `EventDetail`: mascara as somas e o estoque de cada oferta de uma vez. */
export function maskSectorResponse<T extends SectorResponseLike>(
  sector: T,
  hide: boolean,
): T {
  if (!hide) return sector;
  return {
    ...sector,
    ...maskSectorCounts(sector, hide),
    activeBatch: maskBatchInfo(sector.activeBatch, hide),
    nextBatch: maskBatchInfo(sector.nextBatch, hide),
    comboBatches: sector.comboBatches.map((c) => maskBatchInfo(c, hide)),
  };
}

type SectorAvailabilityLike = SectorCounts & { available: number };

/**
 * Setor do `AvailabilityResponse`. Aqui o sinal de comprável é `available` (o
 * estoque da oferta ativa), não as somas do setor — elas incluem lotes futuros.
 */
export function maskSectorAvailability<T extends SectorAvailabilityLike>(
  sector: T,
  hide: boolean,
): T {
  if (!hide) return sector;
  const stock = sector.available > 0 ? MASKED_STOCK : 0;
  return {
    ...sector,
    capacity: stock,
    sold: 0,
    reserved: 0,
    available: stock,
  };
}
