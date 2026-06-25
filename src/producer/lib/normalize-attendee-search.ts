/**
 * Decide se um termo de busca da aba "Buscar / Validar" conta como filtro.
 * Termos com menos de 2 caracteres (após trim) são tratados como "sem termo",
 * fazendo o serviço listar todos os ingressos do evento.
 */
export function normalizeAttendeeSearch(q: string | undefined | null): {
  term: string | null;
} {
  const trimmed = (q ?? '').trim();
  return { term: trimmed.length >= 2 ? trimmed : null };
}
