/**
 * Canonicaliza um CPF para uso como chave de identidade: remove tudo que não
 * é dígito. A validação de "11 dígitos" é responsabilidade do DTO; aqui só
 * normalizamos para que "123.456.789-00" e "12345678900" resolvam na mesma chave.
 */
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}
