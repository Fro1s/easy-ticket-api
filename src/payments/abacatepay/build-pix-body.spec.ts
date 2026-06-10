import { buildPixBody } from './build-pix-body';

describe('buildPixBody', () => {
  const base = {
    amount: 6000,
    expiresIn: 1800,
    description: 'Pedido x',
    externalId: 'order-1',
  };

  const fullCustomer = {
    name: 'Ana',
    email: 'ana@x.com',
    taxId: '12345678900',
    cellphone: '11999999999',
  };

  it('inclui o customer quando os 4 campos obrigatórios estão presentes', () => {
    const body = buildPixBody({ ...base, customer: fullCustomer });
    expect(body.data.customer).toEqual(fullCustomer);
  });

  it('omite o customer inteiro quando falta o cellphone', () => {
    // A API v2 exige name+email+taxId+cellphone quando `customer` está presente.
    // Um customer parcial dá 422 "Value should be one of object". Por isso, sem
    // todos os campos, o objeto inteiro é omitido (todos são opcionais sem ele).
    const body = buildPixBody({
      ...base,
      customer: { name: 'Ana', email: 'ana@x.com', taxId: '12345678900' },
    });
    expect('customer' in body.data).toBe(false);
  });

  it('omite o customer inteiro quando falta o taxId', () => {
    const body = buildPixBody({
      ...base,
      customer: { name: 'Ana', email: 'ana@x.com', cellphone: '11999999999' },
    });
    expect('customer' in body.data).toBe(false);
  });

  it('omite o customer inteiro quando não há nenhum dado útil', () => {
    const body = buildPixBody({ ...base, customer: { name: '', email: '' } });
    expect('customer' in body.data).toBe(false);
  });

  it('omite o customer quando o objeto customer não é informado', () => {
    const body = buildPixBody({ ...base });
    expect('customer' in body.data).toBe(false);
  });

  it('mantém method PIX e os campos base', () => {
    const body = buildPixBody({ ...base, customer: fullCustomer });
    expect(body.method).toBe('PIX');
    expect(body.data.amount).toBe(6000);
    expect(body.data.expiresIn).toBe(1800);
  });

  it('manda o id do pedido em metadata.pedidoId, NÃO em externalId', () => {
    // /transparents/create (PIX) não aceita externalId no schema v2 — usar
    // metadata.pedidoId. Mandar externalId dá 422 "Value should be one of object".
    const body = buildPixBody({ ...base, customer: fullCustomer });
    expect(body.data.metadata).toEqual({ pedidoId: 'order-1' });
    expect('externalId' in body.data).toBe(false);
  });
});
