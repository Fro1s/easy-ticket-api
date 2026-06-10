import { PixChargeRequest } from './abacatepay.types';

interface PixBodyCustomer {
  name?: string;
  email?: string;
  taxId?: string;
  cellphone?: string;
}

export interface PixBody {
  method: 'PIX';
  data: {
    amount: number;
    expiresIn: number;
    description: string;
    externalId: string;
    customer?: PixBodyCustomer;
  };
}

/**
 * Monta o corpo do POST /v2/transparents/create.
 *
 * IMPORTANTE: o AbacatePay rejeita o objeto `customer` quando ele contém campos
 * com valor inválido/undefined (erro "Value should be one of 'object'..."). Por
 * isso só incluímos os campos do customer que têm valor de verdade, e omitimos
 * o objeto `customer` inteiro quando não há nenhum dado útil — todos os campos
 * são opcionais na API (só `method` + `data.amount` são obrigatórios).
 */
export function buildPixBody(req: PixChargeRequest): PixBody {
  const customer: PixBodyCustomer = {};
  if (req.customer?.name) customer.name = req.customer.name;
  if (req.customer?.email) customer.email = req.customer.email;
  if (req.customer?.taxId) customer.taxId = req.customer.taxId;
  if (req.customer?.cellphone) customer.cellphone = req.customer.cellphone;

  return {
    method: 'PIX',
    data: {
      amount: req.amount,
      expiresIn: req.expiresIn,
      description: req.description,
      externalId: req.externalId,
      ...(Object.keys(customer).length > 0 ? { customer } : {}),
    },
  };
}
