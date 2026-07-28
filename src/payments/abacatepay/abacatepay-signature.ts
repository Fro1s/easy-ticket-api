import * as crypto from 'crypto';

/** Comparação de strings em tempo constante (evita side-channel de timing). */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Extrai o `webhookSecret` direto da URL crua.
 *
 * O parser de query do Express converte `+` em espaço (regra de
 * application/x-www-form-urlencoded), então um secret que contenha `+` nunca
 * bate com o valor configurado. A URL crua ainda tem o valor original.
 */
export function querySecretFromRawUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const start = url.indexOf('?');
  if (start === -1) return undefined;
  for (const pair of url.slice(start + 1).split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1 || pair.slice(0, eq) !== 'webhookSecret') continue;
    const value = pair.slice(eq + 1);
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

/**
 * Confere o header `x-webhook-signature` da AbacatePay: HMAC-SHA256 do corpo
 * cru, enviado em base64 (aceitamos hex também, para não falhar fechado se o
 * formato mudar do lado deles).
 *
 * ATENÇÃO: a chave usada nessa assinatura é publicada na documentação pública
 * da AbacatePay, ou seja, qualquer pessoa consegue produzir uma assinatura
 * válida. Serve como sinal de integridade/origem, **nunca** como autorização —
 * quem autoriza o webhook é o `webhookSecret` (esse sim é só nosso).
 */
export function verifyAbacateSignature(
  rawBody: string,
  received: string,
  key: string,
): boolean {
  if (!received || !key) return false;
  const digest = crypto
    .createHmac('sha256', key)
    .update(rawBody, 'utf8')
    .digest();
  const candidate = received.trim().replace(/^sha256=/i, '');
  for (const encoding of ['base64', 'hex'] as const) {
    const buf = Buffer.from(candidate, encoding);
    if (buf.length !== digest.length) continue;
    if (crypto.timingSafeEqual(buf, digest)) return true;
  }
  return false;
}
