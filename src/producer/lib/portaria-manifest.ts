import { createHash } from 'crypto';

/**
 * O manifest da portaria carrega o hash do qrToken, nunca o token cru:
 * o device valida hasheando o QR escaneado, mas o storage local não
 * permite reconstruir/clonar QR codes se o aparelho for comprometido.
 */
export function hashQrToken(qrToken: string): string {
  return createHash('sha256').update(qrToken).digest('hex');
}

export function holderFirstName(
  holderName: string | null,
  userName: string | null,
): string {
  const full = (holderName ?? userName ?? '').trim();
  return full === '' ? '' : (full.split(/\s+/)[0] ?? '');
}
