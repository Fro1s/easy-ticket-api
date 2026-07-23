/**
 * Normaliza telefone brasileiro para dígitos E.164 sem `+` (55DDDNÚMERO),
 * formato que Z-API e Meta Cloud API esperam. Retorna null se o valor
 * não parecer um telefone BR válido — melhor não enviar do que enviar errado.
 */
export function normalizeBrPhone(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return null;
}
