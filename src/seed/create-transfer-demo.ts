import 'dotenv/config';
import { DataSource, In } from 'typeorm';
import * as argon2 from 'argon2';
import { createId } from '@paralleldrive/cuid2';
import { dataSourceOptions } from '../common/database/data-source';
import { Producer } from '../producers/entities/producer.entity';
import { Venue } from '../venues/entities/venue.entity';
import { Event } from '../events/entities/event.entity';
import { Sector } from '../events/entities/sector.entity';
import { Batch } from '../events/entities/batch.entity';
import { User } from '../users/entities/user.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Role } from '../common/enums/role.enum';
import { Category } from '../common/enums/category.enum';
import { EventStatus } from '../common/enums/event-status.enum';
import { OrderStatus } from '../common/enums/order-status.enum';
import { PaymentMethod } from '../common/enums/payment-method.enum';
import { PaymentProvider } from '../common/enums/payment-provider.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';

// Demo fixo e idempotente para exercitar a transferência de ticket.
// Cria 2 compradores (com CPF preenchido!), 1 evento publicado e uma ordem
// PAGA com tickets VALID no nome do usuário de ORIGEM, prontos pra transferir.
const PASSWORD = process.env.TRANSFER_DEMO_PASSWORD ?? 'demo1234';

const ORIGEM = {
  email: 'origem@teste.com',
  name: 'Origem Teste',
  cpf: '11111111111',
  phone: '+5511999990001',
};
const DESTINO = {
  email: 'destino@teste.com',
  name: 'Destino Teste',
  cpf: '22222222222',
  phone: '+5511999990002',
};

const PRODUCER_NAME = 'Transfer Demo Org';
const VENUE_NAME = 'Transfer Demo Arena';
const EVENT_SLUG = 'transfer-demo-event';

const PRICE_CENTS = 5000;
const TICKET_QTY = 3;

async function main() {
  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();

  const producerRepo = dataSource.getRepository(Producer);
  const venueRepo = dataSource.getRepository(Venue);
  const eventRepo = dataSource.getRepository(Event);
  const sectorRepo = dataSource.getRepository(Sector);
  const batchRepo = dataSource.getRepository(Batch);
  const userRepo = dataSource.getRepository(User);
  const ticketRepo = dataSource.getRepository(Ticket);
  const orderRepo = dataSource.getRepository(Order);

  // ---- cleanup (idempotente): remove dados de execuções anteriores ----
  console.log('[transfer-demo] limpando dados anteriores do demo');
  const existingUsers = await userRepo.find({
    where: { email: In([ORIGEM.email, DESTINO.email]) },
  });
  const userIds = existingUsers.map((u) => u.id);
  const existingEvent = await eventRepo.findOne({
    where: { slug: EVENT_SLUG },
  });

  if (userIds.length) await ticketRepo.delete({ userId: In(userIds) });
  if (existingEvent) await ticketRepo.delete({ eventId: existingEvent.id });
  if (userIds.length) await orderRepo.delete({ userId: In(userIds) }); // cascade -> order_items
  if (existingEvent) await eventRepo.delete({ id: existingEvent.id }); // cascade -> sectors/batches
  await venueRepo.delete({ name: VENUE_NAME });
  await producerRepo.delete({ name: PRODUCER_NAME });
  if (userIds.length) await userRepo.delete({ id: In(userIds) });

  // ---- producer + venue ----
  console.log('[transfer-demo] criando producer e venue');
  const producer = await producerRepo.save(
    producerRepo.create({ name: PRODUCER_NAME, cnpj: null, absorbFee: false }),
  );
  const venue = await venueRepo.save(
    venueRepo.create({
      name: VENUE_NAME,
      city: 'São Paulo',
      state: 'SP',
      capacity: 100,
      seatMap: null,
    }),
  );

  // ---- evento publicado + setor + lote ativo ----
  console.log('[transfer-demo] criando evento, setor e lote');
  const startsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 dias
  const doorsAt = new Date(startsAt.getTime() - 60 * 60 * 1000); // -1h
  const event = await eventRepo.save(
    eventRepo.create({
      slug: EVENT_SLUG,
      title: 'Transfer Demo · Show',
      artist: 'Banda Demo',
      category: Category.SHOW,
      startsAt,
      doorsAt,
      ageRating: 0,
      posterUrl: 'https://placehold.co/600x800',
      description: 'Evento de demonstração para testar transferência de ticket.',
      venueId: venue.id,
      producerId: producer.id,
      status: EventStatus.PUBLISHED,
      paymentProvider: PaymentProvider.MANUAL_PIX,
      cardEnabled: true,
    }),
  );
  const sector = await sectorRepo.save(
    sectorRepo.create({
      eventId: event.id,
      name: 'Pista',
      colorHex: '#D1FF4D',
      capacity: 100,
      sold: TICKET_QTY,
      reserved: 0,
      sortOrder: 0,
    }),
  );
  const batch = await batchRepo.save(
    batchRepo.create({
      sectorId: sector.id,
      name: '1º Lote',
      priceCents: PRICE_CENTS,
      capacity: 100,
      sold: TICKET_QTY,
      reserved: 0,
      sortOrder: 0,
      producerOnly: false,
      isActive: true,
      ticketsPerUnit: 1,
    }),
  );

  // ---- usuários compradores (com CPF) ----
  console.log('[transfer-demo] criando usuários origem e destino');
  const passwordHash = await argon2.hash(PASSWORD);
  const origem = await userRepo.save(
    userRepo.create({
      email: ORIGEM.email,
      name: ORIGEM.name,
      cpf: ORIGEM.cpf,
      phone: ORIGEM.phone,
      role: Role.BUYER,
      passwordHash,
      referralCode: createId().slice(0, 10).toUpperCase(),
      producerId: null,
    }),
  );
  await userRepo.save(
    userRepo.create({
      email: DESTINO.email,
      name: DESTINO.name,
      cpf: DESTINO.cpf,
      phone: DESTINO.phone,
      role: Role.BUYER,
      passwordHash,
      referralCode: createId().slice(0, 10).toUpperCase(),
      producerId: null,
    }),
  );

  // ---- ordem PAGA + tickets VALID para o usuário de origem ----
  console.log(`[transfer-demo] criando ordem PAGA com ${TICKET_QTY} tickets`);
  const now = new Date();
  const subtotalCents = PRICE_CENTS * TICKET_QTY;
  const order = await orderRepo.save(
    orderRepo.create({
      userId: origem.id,
      status: OrderStatus.PAID,
      subtotalCents,
      feeCents: 0,
      processingFeeCents: 0,
      processingFeeMethod: null,
      discountCents: 0,
      totalCents: subtotalCents,
      paymentMethod: PaymentMethod.PIX,
      paymentId: null,
      reservedUntil: now,
      paidAt: now,
      items: [
        {
          id: createId(),
          sectorId: sector.id,
          batchId: batch.id,
          qty: TICKET_QTY,
          priceCents: PRICE_CENTS,
          attendees: null,
        } as OrderItem,
      ],
    }),
  );

  const tickets: Ticket[] = [];
  for (let i = 0; i < TICKET_QTY; i++) {
    const t = new Ticket();
    t.id = createId();
    t.shortCode = `ET-${createId().slice(0, 9).toUpperCase()}`;
    t.qrToken = `et:${order.id}:${createId()}`;
    t.orderId = order.id;
    t.userId = origem.id;
    t.eventId = event.id;
    t.sectorId = sector.id;
    t.batchId = batch.id;
    t.status = TicketStatus.VALID;
    t.holderName = null;
    t.holderEmail = null;
    tickets.push(t);
  }
  await ticketRepo.save(tickets);

  await dataSource.destroy();

  console.log('\n[transfer-demo] pronto! ✅');
  console.log('────────────────────────────────────────────');
  console.log(`Senha de ambos: ${PASSWORD}`);
  console.log(
    `ORIGEM  (dono dos tickets): ${ORIGEM.email} | CPF ${ORIGEM.cpf}`,
  );
  console.log(`DESTINO (recebe):           ${DESTINO.email} | CPF ${DESTINO.cpf}`);
  console.log(`Evento: "${event.title}" (slug ${EVENT_SLUG})`);
  console.log(`Tickets VALID do origem (${tickets.length}):`);
  for (const t of tickets) console.log(`  - id=${t.id}  shortCode=${t.shortCode}`);
  console.log('────────────────────────────────────────────');
  console.log('Teste: logue como ORIGEM e chame');
  console.log('  POST /api/v1/tickets/<ticketId>/transfer');
  console.log(`  body: { "email": "${DESTINO.email}" }  ou  { "cpf": "${DESTINO.cpf}" }`);
}

main().catch((err) => {
  console.error('[transfer-demo] failed:', err);
  process.exit(1);
});
