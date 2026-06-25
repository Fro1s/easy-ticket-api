import { normalizeEmail } from '../../users/lib/normalize-email';
import { normalizeCpf } from '../../users/lib/normalize-cpf';

export type RecipientLookup =
  | { by: 'email'; value: string }
  | { by: 'cpf'; value: string };

/**
 * Decide como buscar o destinatário da transferência. Email tem prioridade;
 * cai pra CPF quando não há email. Retorna null quando nenhum identificador
 * utilizável foi informado (o serviço transforma isso em 400).
 */
export function resolveRecipientLookup(input: {
  email?: string | null;
  cpf?: string | null;
}): RecipientLookup | null {
  const email = input.email?.trim();
  if (email) return { by: 'email', value: normalizeEmail(email) };

  const cpf = input.cpf ? normalizeCpf(input.cpf) : '';
  if (cpf) return { by: 'cpf', value: cpf };

  return null;
}
