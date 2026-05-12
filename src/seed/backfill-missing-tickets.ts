import 'dotenv/config';
import { DataSource } from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { dataSourceOptions } from '../common/database/data-source';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { Sector } from '../events/entities/sector.entity';
import { OrderStatus } from '../common/enums/order-status.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';

// One-off: gera apenas os tickets faltantes de orders PAID. Não envia email,
// não mexe em contadores (sector/batch.sold), não publica eventos. Idempotente:
// só gera o delta (qty_total - tickets_existentes). Conta com sector.eventId
// no ticket (já que o sector é nullable=false em order_items).
async function main() {
  const ds = new DataSource(dataSourceOptions);
  await ds.initialize();
  const orderRepo = ds.getRepository(Order);
  const itemRepo = ds.getRepository(OrderItem);
  const ticketRepo = ds.getRepository(Ticket);
  const sectorRepo = ds.getRepository(Sector);

  const paid = await orderRepo.find({ where: { status: OrderStatus.PAID } });
  let totalCreated = 0;
  let touchedOrders = 0;

  for (const order of paid) {
    const items = await itemRepo.find({ where: { orderId: order.id } });
    const qtyExpected = items.reduce((s, i) => s + i.qty, 0);
    const existing = await ticketRepo.count({ where: { orderId: order.id } });
    const missing = qtyExpected - existing;
    if (missing <= 0) continue;

    // Distribui os tickets faltantes pelos items na ordem natural, respeitando
    // qty de cada um. Reemite só o que falta — não duplica os já criados.
    const perItemRemaining = new Map<string, number>();
    for (const it of items) {
      const already = await ticketRepo.count({
        where: { orderId: order.id, sectorId: it.sectorId },
      });
      const need = Math.max(0, it.qty - already);
      if (need > 0) perItemRemaining.set(it.id, need);
    }

    const toInsert: Ticket[] = [];
    for (const it of items) {
      const need = perItemRemaining.get(it.id) ?? 0;
      if (need === 0) continue;
      const sector = await sectorRepo.findOne({ where: { id: it.sectorId } });
      if (!sector) {
        console.warn(`[backfill] sector ${it.sectorId} not found — skipping item ${it.id}`);
        continue;
      }
      for (let i = 0; i < need; i++) {
        const t = new Ticket();
        t.id = createId();
        t.shortCode = `ET-${createId().slice(0, 9).toUpperCase()}`;
        t.qrToken = `et:${order.id}:${createId()}`;
        t.orderId = order.id;
        t.userId = order.userId;
        t.eventId = sector.eventId;
        t.sectorId = sector.id;
        t.status = TicketStatus.VALID;
        toInsert.push(t);
      }
    }

    if (toInsert.length) {
      await ticketRepo.save(toInsert);
      totalCreated += toInsert.length;
      touchedOrders += 1;
      console.log(
        `[backfill] order ${order.id} (qty=${qtyExpected}, had=${existing}): created ${toInsert.length} tickets`,
      );
    }
  }

  console.log(
    `[backfill] done — ${totalCreated} tickets criados em ${touchedOrders} pedidos`,
  );
  await ds.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
