import 'dotenv/config';
import { DataSource } from 'typeorm';
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
import { ManualPayment } from '../orders/entities/manual-payment.entity';
import { ClaimToken } from '../claim-tokens/entities/claim-token.entity';
import { Category } from '../common/enums/category.enum';
import { EventStatus } from '../common/enums/event-status.enum';
import { Role } from '../common/enums/role.enum';
import { PaymentProvider } from '../common/enums/payment-provider.enum';
import { PixKeyType } from '../common/enums/pix-key-type.enum';

interface SeedEvent {
  slug: string;
  title: string;
  artist: string;
  category: Category;
  startsAt: string;
  doorsAt: string;
  ageRating: number;
  posterUrl: string;
  description: string;
  producerName: string;
  paymentProvider?: PaymentProvider;
  pixKey?: string;
  pixKeyType?: PixKeyType;
  pixHolderName?: string;
  platformFeeRate?: number;
  sectors: Array<{
    name: string;
    colorHex: string;
    priceCents: number;
    capacity: number;
    sortOrder: number;
  }>;
}

const SEED_EVENTS: SeedEvent[] = [
  {
    slug: 'anitta-baile-funk-tour',
    title: 'Anitta · Baile Funk Tour',
    artist: 'Anitta',
    category: Category.SHOW,
    startsAt: '2026-05-15T22:00:00-03:00',
    doorsAt: '2026-05-15T20:00:00-03:00',
    ageRating: 16,
    posterUrl: 'linear-gradient(135deg, #FF3D8A 0%, #7B61FF 60%, #0A0A0F 100%)',
    description: 'Anitta traz o Baile Funk Tour para São Paulo em uma noite única no Allianz Parque. Abertura com MC Tha, DJ Dece e Ludmilla surpresa.',
    producerName: 'Rock in Rio Produções',
    sectors: [
      { name: 'Pista Premium', colorHex: '#FF4D1C', priceCents: 45000, capacity: 500, sortOrder: 1 },
      { name: 'Pista', colorHex: '#7B61FF', priceCents: 18900, capacity: 8000, sortOrder: 2 },
      { name: 'Cadeira Inferior', colorHex: '#C08540', priceCents: 28000, capacity: 3200, sortOrder: 3 },
      { name: 'Cadeira Superior', colorHex: '#999999', priceCents: 14900, capacity: 4800, sortOrder: 4 },
      { name: 'Camarote', colorHex: '#FFD84D', priceCents: 89000, capacity: 400, sortOrder: 5 },
    ],
  },
  {
    slug: 'warung-day-festival',
    title: 'Warung Day Festival',
    artist: 'Solomun · Dixon · ANNA',
    category: Category.FESTIVAL,
    startsAt: '2026-06-07T16:00:00-03:00',
    doorsAt: '2026-06-07T14:00:00-03:00',
    ageRating: 18,
    posterUrl: 'linear-gradient(135deg, #D1FF4D 0%, #00E89C 50%, #7B61FF 100%)',
    description: 'O Warung Day Festival retorna a Itajaí com line-up internacional e o melhor da música eletrônica em um único dia.',
    producerName: 'Warung Productions',
    // Evento de teste do dono — manual PIX, fee 0%.
    paymentProvider: PaymentProvider.MANUAL_PIX,
    pixKey: '00000000000200',
    pixKeyType: PixKeyType.CNPJ,
    pixHolderName: 'WARUNG PRODUCTIONS',
    platformFeeRate: 0,
    sectors: [
      { name: 'Pista', colorHex: '#7B61FF', priceCents: 32000, capacity: 6000, sortOrder: 1 },
      { name: 'VIP', colorHex: '#FF4D1C', priceCents: 58000, capacity: 1200, sortOrder: 2 },
      { name: 'Open Bar', colorHex: '#D1FF4D', priceCents: 89000, capacity: 400, sortOrder: 3 },
    ],
  },
  {
    slug: 'coldplay-music-of-the-spheres',
    title: 'Coldplay · Music of the Spheres',
    artist: 'Coldplay',
    category: Category.SHOW,
    startsAt: '2026-07-22T20:30:00-03:00',
    doorsAt: '2026-07-22T18:00:00-03:00',
    ageRating: 0,
    posterUrl: 'linear-gradient(135deg, #FFD84D 0%, #FF4D1C 100%)',
    description: 'Coldplay traz a turnê Music of the Spheres ao Estádio do Morumbi em noite única.',
    producerName: 'Rock in Rio Produções',
    sectors: [
      { name: 'Pista', colorHex: '#7B61FF', priceCents: 45000, capacity: 15000, sortOrder: 1 },
      { name: 'Pista Premium', colorHex: '#FF4D1C', priceCents: 89000, capacity: 3000, sortOrder: 2 },
      { name: 'Cadeira Superior', colorHex: '#999999', priceCents: 35000, capacity: 12000, sortOrder: 3 },
      { name: 'Cadeira Inferior', colorHex: '#C08540', priceCents: 62000, capacity: 8000, sortOrder: 4 },
    ],
  },
  {
    slug: 'galinha-pintadinha-musical',
    title: 'Galinha Pintadinha — O Musical',
    artist: 'Companhia Turma da Fazenda',
    category: Category.INFANTIL,
    startsAt: '2026-04-26T16:00:00-03:00',
    doorsAt: '2026-04-26T15:00:00-03:00',
    ageRating: 0,
    posterUrl: 'linear-gradient(135deg, #FFD84D 0%, #FF4D1C 40%, #2F5D3F 100%)',
    description: 'O musical da Galinha Pintadinha chega ao Teatro Bradesco para a família toda.',
    producerName: 'Cia Infantil SP',
    sectors: [
      { name: 'Plateia', colorHex: '#FFD84D', priceCents: 6000, capacity: 800, sortOrder: 1 },
      { name: 'Balcão', colorHex: '#2F5D3F', priceCents: 4500, capacity: 300, sortOrder: 2 },
    ],
  },
  {
    slug: 'green-valley-nye',
    title: 'Green Valley · NYE',
    artist: 'Alok · Vintage Culture · CAT DEALERS',
    category: Category.FESTIVAL,
    startsAt: '2026-12-31T22:00:00-03:00',
    doorsAt: '2026-12-31T21:00:00-03:00',
    ageRating: 18,
    posterUrl: 'linear-gradient(135deg, #00E89C 0%, #7B61FF 70%, #FF3D8A 100%)',
    description: 'O Reveillon mais esperado do Brasil. Line-up completa no Green Valley.',
    producerName: 'Warung Productions',
    sectors: [
      { name: 'Pista', colorHex: '#7B61FF', priceCents: 68000, capacity: 4000, sortOrder: 1 },
      { name: 'VIP', colorHex: '#FF4D1C', priceCents: 120000, capacity: 800, sortOrder: 2 },
      { name: 'Camarote', colorHex: '#FFD84D', priceCents: 250000, capacity: 200, sortOrder: 3 },
    ],
  },
  {
    slug: 'turma-do-seu-lobato',
    title: 'Turma do Seu Lobato',
    artist: 'Espetáculo Infantil',
    category: Category.INFANTIL,
    startsAt: '2026-05-04T15:00:00-03:00',
    doorsAt: '2026-05-04T14:00:00-03:00',
    ageRating: 0,
    posterUrl: 'linear-gradient(135deg, #D1FF4D 0%, #FFD84D 100%)',
    description: 'As aventuras do Sítio do Pica-Pau Amarelo em versão teatral para toda a família.',
    producerName: 'Cia Infantil SP',
    sectors: [
      { name: 'Plateia', colorHex: '#FFD84D', priceCents: 4500, capacity: 600, sortOrder: 1 },
      { name: 'Balcão', colorHex: '#2F5D3F', priceCents: 3500, capacity: 300, sortOrder: 2 },
    ],
  },
];

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
  const orderItemRepo = dataSource.getRepository(OrderItem);
  const manualPaymentRepo = dataSource.getRepository(ManualPayment);
  const claimTokenRepo = dataSource.getRepository(ClaimToken);

  console.log('[seed] clearing existing rows');
  // Order matters because of FKs.
  await claimTokenRepo.createQueryBuilder().delete().execute();
  await manualPaymentRepo.createQueryBuilder().delete().execute();
  await ticketRepo.createQueryBuilder().delete().execute();
  await orderItemRepo.createQueryBuilder().delete().execute();
  await orderRepo.createQueryBuilder().delete().execute();
  await batchRepo.createQueryBuilder().delete().execute();
  await sectorRepo.createQueryBuilder().delete().execute();
  await eventRepo.createQueryBuilder().delete().execute();
  await venueRepo.createQueryBuilder().delete().execute();
  // Users reference producers (producerId FK), so users go before producers.
  await userRepo.createQueryBuilder().delete().execute();
  await producerRepo.createQueryBuilder().delete().execute();

  console.log('[seed] producers');
  const rockInRio = await producerRepo.save(producerRepo.create({
    name: 'Rock in Rio Produções',
    cnpj: '00.000.000/0001-01',
    absorbFee: false,
  }));
  const warung = await producerRepo.save(producerRepo.create({
    name: 'Warung Productions',
    cnpj: '00.000.000/0002-02',
    absorbFee: false,
  }));
  const ciaInfantil = await producerRepo.save(producerRepo.create({
    name: 'Cia Infantil SP',
    cnpj: '00.000.000/0003-03',
    absorbFee: true,
  }));

  const producersByName: Record<string, Producer> = {
    'Rock in Rio Produções': rockInRio,
    'Warung Productions': warung,
    'Cia Infantil SP': ciaInfantil,
  };

  console.log('[seed] users (admin + producer)');
  const adminPasswordHash = await argon2.hash('admin123');
  const producerPasswordHash = await argon2.hash('produtor123');

  await userRepo.save(userRepo.create({
    email: 'admin@easyticket.com.br',
    name: 'Easy Ticket Admin',
    role: Role.ADMIN,
    passwordHash: adminPasswordHash,
    referralCode: createId().slice(0, 10).toUpperCase(),
    cpf: null,
    phone: null,
    producerId: null,
  }));
  await userRepo.save(userRepo.create({
    email: 'produtor@easyticket.com.br',
    name: 'Warung Producer',
    role: Role.PRODUCER,
    passwordHash: producerPasswordHash,
    referralCode: createId().slice(0, 10).toUpperCase(),
    cpf: null,
    phone: null,
    producerId: warung.id,
  }));

  console.log('[seed] venues');
  const allianz = await venueRepo.save(venueRepo.create({
    name: 'Allianz Parque',
    city: 'São Paulo',
    state: 'SP',
    capacity: 43000,
    seatMap: null,
  }));

  console.log('[seed] events + sectors');
  for (const s of SEED_EVENTS) {
    const producer = producersByName[s.producerName];
    if (!producer) throw new Error(`unknown producer ${s.producerName}`);

    const event = await eventRepo.save(eventRepo.create({
      slug: s.slug,
      title: s.title,
      artist: s.artist,
      category: s.category,
      startsAt: new Date(s.startsAt),
      doorsAt: new Date(s.doorsAt),
      ageRating: s.ageRating,
      posterUrl: s.posterUrl,
      description: s.description,
      venueId: allianz.id,
      producerId: producer.id,
      status: EventStatus.PUBLISHED,
      paymentProvider: s.paymentProvider ?? PaymentProvider.ABACATE_PAY,
      pixKey: s.pixKey ?? null,
      pixKeyType: s.pixKeyType ?? null,
      pixHolderName: s.pixHolderName ?? null,
      platformFeeRate: s.platformFeeRate ?? 0.025,
    }));

    for (const sec of s.sectors) {
      const sector = await sectorRepo.save(sectorRepo.create({
        id: createId(),
        eventId: event.id,
        name: sec.name,
        colorHex: sec.colorHex,
        capacity: sec.capacity,
        sortOrder: sec.sortOrder,
      }));
      await batchRepo.save(batchRepo.create({
        id: createId(),
        sectorId: sector.id,
        name: 'Lote 1',
        priceCents: sec.priceCents,
        capacity: sec.capacity,
        sortOrder: 1,
        startsAt: null,
        endsAt: null,
      }));
    }
    console.log(`[seed] event ${s.slug} (${s.sectors.length} sectors, provider=${event.paymentProvider}, fee=${event.platformFeeRate})`);
  }

  await dataSource.destroy();
  console.log('[seed] done');
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
