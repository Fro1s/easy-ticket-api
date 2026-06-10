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
    metadata: { pedidoId: string };
    customer?: PixBodyCustomer;
  };
}

/**
 * Monta o corpo do POST /v2/transparents/create.
 *
 * IMPORTANTE: quando o objeto `customer` está presente, a API v2 exige TODOS os
 * 4 campos (name, email, taxId, cellphone). Um customer parcial é rejeitado com
 * o erro genérico "Value should be one of 'object', 'object'". Como `customer`
 * é totalmente opcional (só `method` + `data.amount` são obrigatórios), a regra
 * aqui é all-or-nothing: só incluímos o customer se os 4 campos tiverem valor;
 * caso contrário, omitimos o objeto inteiro.
 */
export function buildPixBody(req: PixChargeRequest): PixBody {
  const { name, email, taxId, cellphone } = req.customer ?? {};
  const hasFullCustomer = Boolean(name && email && taxId && cellphone);
  const customer: PixBodyCustomer | undefined = hasFullCustomer
    ? { name, email, taxId, cellphone }
    : undefined;

  return {
    method: 'PIX',
    data: {
      amount: req.amount,
      expiresIn: req.expiresIn,
      description: req.description,
      // /transparents/create (PIX) não aceita externalId no schema v2; o id do
      // pedido vai em metadata.pedidoId. O mapeamento charge.id -> order é feito
      // via o `id` retornado (persistido no paymentCache/order.paymentId).
      metadata: { pedidoId: req.externalId },
      ...(customer ? { customer } : {}),
    },
  };
}
