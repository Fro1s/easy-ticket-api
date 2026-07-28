import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource, In, IsNull, MoreThanOrEqual, Not } from 'typeorm';
import { AppModule } from '../app.module';
import { Order } from '../orders/entities/order.entity';
import { OrdersService } from '../orders/orders.service';
import { OrderStatus } from '../common/enums/order-status.enum';

/**
 * Reconciliação em lote de pagamentos AbacatePay — substitui clicar "Reenviar"
 * em cada webhook do painel.
 *
 * Por que existe: entre 14/07 e 28/07/2026 o endpoint de webhook rejeitava
 * (401) todo webhook de pagamento em produção, porque a auth por
 * `?webhookSecret=` estava desligada quando NODE_ENV=production. O gateway
 * recebeu o PIX, nós descartamos a notificação, e o cron `orders:expire-stale`
 * depois expirou o pedido (liberando o estoque). Reenviar o webhook nesses
 * casos NÃO resolve: `markOrderPaid` rejeita pedido que não está PENDING
 * ("order is not payable").
 *
 * O que faz: pergunta o status ao gateway (fonte da verdade, não confia no
 * payload do webhook), e para cada cobrança PAID confirma o pedido pelo mesmo
 * caminho do webhook (`markPaidByPaymentId`) — emite tickets, move
 * reserved -> sold e dispara email/QR/WhatsApp. Idempotente: pedido já PAID é
 * ignorado.
 *
 * Uso (dry-run por padrão — não escreve nada):
 *   pnpm reconcile:abacate
 *   pnpm reconcile:abacate -- --apply
 *   pnpm reconcile:abacate -- --since=2026-07-14 --apply
 * Em produção (a imagem não tem ts-node, use o build):
 *   fly ssh console -C "node dist/seed/reconcile-abacate-payments.js --apply"
 *
 * ATENÇÃO (oversell): confirmar um pedido já expirado devolve para `sold` um
 * lugar que voltou à venda e pode ter sido comprado por outra pessoa. O
 * comprador pagou, então confirmar é o certo — mas o lote pode passar da
 * capacidade do setor. O resumo final lista os pedidos reabertos para você
 * conferir com o produtor.
 */

const BASE_URL = 'https://api.abacatepay.com/v2';
// Reabre a janela de reserva antes de confirmar: com `reservedUntil` no
// passado, o cron de expiração (rodando de minuto em minuto em produção) pode
// re-expirar o pedido entre o nosso UPDATE e a confirmação.
const REOPEN_WINDOW_MS = 15 * 60_000;

interface ChargeStatus {
  status: string;
  amount?: number;
  endpoint: string;
}

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const sinceArg = argv.find((a) => a.startsWith('--since='))?.slice(8);
  const since = sinceArg ? new Date(sinceArg) : startOfToday();
  if (Number.isNaN(since.getTime())) {
    throw new Error(`--since inválido: ${sinceArg}`);
  }
  return { apply, since };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Consulta o status da cobrança. PIX transparente (`pix_char_…`) e checkout
 * hospedado de cartão (`bill_…`) vivem em endpoints diferentes; tenta o
 * provável pelo prefixo do id e cai no outro se não responder.
 */
async function fetchChargeStatus(
  apiKey: string,
  chargeId: string,
): Promise<ChargeStatus | null> {
  const endpoints = chargeId.startsWith('bill_')
    ? ['/checkouts/one', '/transparents/check']
    : ['/transparents/check', '/checkouts/one'];
  for (const endpoint of endpoints) {
    const url = `${BASE_URL}${endpoint}?id=${encodeURIComponent(chargeId)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'easy-ticket-reconcile/1.0',
        },
      });
    } catch (err) {
      console.warn(
        `[reconcile]   ${endpoint} falhou na rede: ${(err as Error).message}`,
      );
      continue;
    }
    const text = await res.text();
    if (!res.ok) continue;
    let env: {
      data?: { status?: string; amount?: number } | null;
      error?: string | null;
    };
    try {
      env = JSON.parse(text) as typeof env;
    } catch {
      continue;
    }
    if (env.error || !env.data?.status) continue;
    return {
      status: env.data.status.toUpperCase(),
      amount: env.data.amount,
      endpoint,
    };
  }
  return null;
}

async function main() {
  const { apply, since } = parseArgs(process.argv.slice(2));
  const apiKey = process.env.ABACATEPAY_API_KEY?.trim();
  if (!apiKey) throw new Error('ABACATEPAY_API_KEY não está no ambiente');

  console.log(
    `[reconcile] modo=${apply ? 'APPLY (escreve)' : 'DRY-RUN (não escreve)'} desde=${since.toISOString()}`,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Este processo carrega o AppModule inteiro, incluindo os @Cron. Rodando ao
  // lado da máquina de produção isso duplicaria o `orders:expire-stale` contra
  // as mesmas linhas de estoque — para todos antes de tocar em qualquer pedido.
  const scheduler = app.get(SchedulerRegistry, { strict: false });
  for (const [name, job] of scheduler.getCronJobs()) {
    void job.stop();
    console.log(`[reconcile] cron '${name}' parado neste processo`);
  }

  const ds = app.get(DataSource);
  const orders = app.get(OrdersService);
  const orderRepo = ds.getRepository(Order);

  const candidates = await orderRepo.find({
    where: {
      status: In([OrderStatus.PENDING, OrderStatus.EXPIRED]),
      paymentId: Not(IsNull()),
      createdAt: MoreThanOrEqual(since),
    },
    select: {
      id: true,
      status: true,
      paymentId: true,
      totalCents: true,
      createdAt: true,
    },
    order: { createdAt: 'ASC' },
  });

  console.log(
    `[reconcile] ${candidates.length} pedido(s) PENDING/EXPIRED com paymentId no período`,
  );

  const confirmed: string[] = [];
  const reopened: string[] = [];
  // Contado sempre que o gateway responde PAID — inclusive em dry-run, onde
  // `confirmed`/`failed` ficam vazios por definição.
  const paidAtGateway: string[] = [];
  const notPaid: string[] = [];
  const unknown: string[] = [];
  const failed: string[] = [];

  for (const order of candidates) {
    const chargeId = order.paymentId!;
    const charge = await fetchChargeStatus(apiKey, chargeId);

    if (!charge) {
      console.warn(
        `[reconcile] ? pedido ${order.id} (${chargeId}): gateway não respondeu status — pulando`,
      );
      unknown.push(order.id);
      continue;
    }

    if (charge.status !== 'PAID') {
      console.log(
        `[reconcile] - pedido ${order.id} (${chargeId}): gateway diz ${charge.status} — nada a fazer`,
      );
      notPaid.push(order.id);
      continue;
    }

    paidAtGateway.push(order.id);
    const amountNote =
      typeof charge.amount === 'number'
        ? ` gateway=${charge.amount} pedido=${order.totalCents}`
        : ` pedido=${order.totalCents}`;
    console.log(
      `[reconcile] $ pedido ${order.id} (${chargeId}): PAGO no gateway (${charge.endpoint}), status local=${order.status}${amountNote}`,
    );

    if (!apply) continue;

    try {
      // Pedido já expirado: `markOrderPaid` só aceita PENDING. Reabre com uma
      // janela nova (senão o cron de produção re-expira no meio do caminho).
      if (order.status === OrderStatus.EXPIRED) {
        const reopen = await orderRepo
          .createQueryBuilder()
          .update(Order)
          .set({
            status: OrderStatus.PENDING,
            reservedUntil: new Date(Date.now() + REOPEN_WINDOW_MS),
          })
          .where('id = :id AND status = :expired', {
            id: order.id,
            expired: OrderStatus.EXPIRED,
          })
          .execute();
        if (!reopen.affected) {
          console.warn(
            `[reconcile]   pedido ${order.id} mudou de status durante a execução — pulando`,
          );
          failed.push(order.id);
          continue;
        }
        reopened.push(order.id);
      }

      // Mesmo caminho do webhook: idempotente, confere valor quando informado,
      // emite tickets e dispara email/QR/WhatsApp depois do commit.
      await orders.markPaidByPaymentId(chargeId, charge.amount);

      const after = await orderRepo.findOne({
        where: { id: order.id },
        select: { id: true, status: true },
      });
      if (after?.status === OrderStatus.PAID) {
        confirmed.push(order.id);
        console.log(`[reconcile]   -> pedido ${order.id} confirmado (PAID)`);
      } else {
        failed.push(order.id);
        console.warn(
          `[reconcile]   -> pedido ${order.id} NÃO ficou PAID (status=${after?.status}) — ver log acima`,
        );
      }
    } catch (err) {
      failed.push(order.id);
      console.error(
        `[reconcile]   -> pedido ${order.id} falhou: ${(err as Error).message}`,
      );
    }
  }

  console.log('\n[reconcile] ===== resumo =====');
  console.log(`[reconcile] candidatos:        ${candidates.length}`);
  console.log(`[reconcile] pagos no gateway:  ${paidAtGateway.length}`);
  console.log(`[reconcile] confirmados:       ${confirmed.length}`);
  console.log(`[reconcile] reabertos (EXPIRED -> PAID): ${reopened.length}`);
  console.log(`[reconcile] não pagos:         ${notPaid.length}`);
  console.log(`[reconcile] status indefinido: ${unknown.length}`);
  console.log(`[reconcile] falhas:            ${failed.length}`);
  if (reopened.length) {
    console.log(
      `[reconcile] pedidos reabertos (confira capacidade do setor): ${reopened.join(', ')}`,
    );
  }
  if (failed.length) {
    console.log(`[reconcile] pedidos com falha: ${failed.join(', ')}`);
  }
  if (!apply) {
    console.log(
      '[reconcile] DRY-RUN: nada foi escrito. Rode de novo com --apply para confirmar.',
    );
  }

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
