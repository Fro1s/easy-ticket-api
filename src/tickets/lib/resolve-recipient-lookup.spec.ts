import { resolveRecipientLookup } from './resolve-recipient-lookup';

describe('resolveRecipientLookup', () => {
  it('usa email quando presente, normalizado', () => {
    expect(resolveRecipientLookup({ email: '  Maria@GMAIL.com ' })).toEqual({
      by: 'email',
      value: 'maria@gmail.com',
    });
  });

  it('usa cpf quando não há email, normalizado', () => {
    expect(resolveRecipientLookup({ cpf: '123.456.789-00' })).toEqual({
      by: 'cpf',
      value: '12345678900',
    });
  });

  it('email tem prioridade quando ambos vêm', () => {
    expect(
      resolveRecipientLookup({ email: 'a@b.co', cpf: '12345678900' }),
    ).toEqual({ by: 'email', value: 'a@b.co' });
  });

  it('retorna null quando nada é informado', () => {
    expect(resolveRecipientLookup({})).toBeNull();
    expect(resolveRecipientLookup({ email: '  ', cpf: '' })).toBeNull();
  });
});
