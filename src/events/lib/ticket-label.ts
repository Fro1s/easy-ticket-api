/** Rótulo de exibição de um ingresso: nome do lote, com fallback pro setor. */
export function ticketLabel(
  batchName: string | null | undefined,
  sectorName: string,
): string {
  return batchName ? batchName : sectorName;
}
