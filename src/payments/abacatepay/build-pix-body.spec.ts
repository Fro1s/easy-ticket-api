import { buildPixBody } from './build-pix-body';

describe('buildPixBody', () => {
  const base = {
    amount: 6000,
    expiresIn: 1800,
    description: 'Pedido x',
    externalId: 'order-1',
  };

  it('inclui só campos de customer com valor (sem undefined)', () => {
    const body = buildPixBody({
      ...base,
      customer: { name: 'Ana', email: 'ana@x.com' },
    });
    expect(body.data.customer).toEqual({ name: 'Ana', email: 'ana@x.com' });
    // não pode ter chaves undefined
    expect('taxId' in (body.data.customer ?? {})).toBe(false);
    expect('cellphone' in (body.data.customer ?? {})).toBe(false);
  });

  it('inclui taxId e cellphone quando presentes', () => {
    const body = buildPixBody({
      ...base,
      customer: {
        name: 'Ana',
        email: 'ana@x.com',
        taxId: '12345678900',
        cellphone: '11999999999',
      },
    });
    expect(body.data.customer).toEqual({
      name: 'Ana',
      email: 'ana@x.com',
      taxId: '12345678900',
      cellphone: '11999999999',
    });
  });

  it('omite o objeto customer inteiro quando não há nenhum dado útil', () => {
    const body = buildPixBody({
      ...base,
      customer: { name: '', email: '' },
    });
    expect('customer' in body.data).toBe(false);
  });

  it('inclui customer com email mesmo sem nome', () => {
    const body = buildPixBody({
      ...base,
      customer: { name: '', email: 'so@email.com' },
    });
    expect(body.data.customer).toEqual({ email: 'so@email.com' });
  });

  it('mantém method PIX e os campos base', () => {
    const body = buildPixBody({ ...base, customer: { name: 'A', email: 'a@a.com' } });
    expect(body.method).toBe('PIX');
    expect(body.data.amount).toBe(6000);
    expect(body.data.expiresIn).toBe(1800);
  });

  it('manda o id do pedido em metadata.pedidoId, NÃO em externalId', () => {
    // /transparents/create (PIX) não aceita externalId no schema v2 — usar
    // metadata.pedidoId. Mandar externalId dá 422 "Value should be one of object".
    const body = buildPixBody({ ...base, customer: { name: 'A', email: 'a@a.com' } });
    expect(body.data.metadata).toEqual({ pedidoId: 'order-1' });
    expect('externalId' in body.data).toBe(false);
  });
});
