import { normalizeCpf } from './normalize-cpf';

describe('normalizeCpf', () => {
  it('remove pontos e traço de um CPF formatado', () => {
    expect(normalizeCpf('123.456.789-00')).toBe('12345678900');
  });

  it('deixa um CPF só com dígitos inalterado', () => {
    expect(normalizeCpf('12345678900')).toBe('12345678900');
  });

  it('remove espaços ao redor', () => {
    expect(normalizeCpf('  123.456.789-00  ')).toBe('12345678900');
  });

  it('remove qualquer caractere não numérico', () => {
    expect(normalizeCpf('cpf: 111a222b333c44')).toBe('11122233344');
  });
});
