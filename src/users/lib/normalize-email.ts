/**
 * Canonicaliza um e-mail para uso como chave de identidade.
 *
 * E-mails são case-insensitive na prática (RFC 5321 trata o domínio como
 * case-insensitive e, por convenção, provedores como o Gmail também ignoram
 * caixa no local-part). Guardar/buscar sem normalizar permitiu que
 * "Laisd1465@gmail.com" e "laisd1465@gmail.com" virassem DOIS usuários
 * distintos — origem do vazamento de escopo entre produtores.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
