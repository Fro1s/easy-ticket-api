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
import { Referral } from '../referral/entities/referral.entity';
import { Role } from '../common/enums/role.enum';

const PCF_PASSWORD = 'pcf2026!';
const PCF_PRODUCER_NAME = 'Projeto Criança Feliz';

async function main() {
  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();

  const repos = {
    producer: dataSource.getRepository(Producer),
    venue: dataSource.getRepository(Venue),
    event: dataSource.getRepository(Event),
    sector: dataSource.getRepository(Sector),
    batch: dataSource.getRepository(Batch),
    user: dataSource.getRepository(User),
    ticket: dataSource.getRepository(Ticket),
    order: dataSource.getRepository(Order),
    orderItem: dataSource.getRepository(OrderItem),
    manualPayment: dataSource.getRepository(ManualPayment),
    claimToken: dataSource.getRepository(ClaimToken),
    referral: dataSource.getRepository(Referral),
  };

  console.log('[seed] wiping all rows (FK order)');
  await repos.claimToken.createQueryBuilder().delete().execute();
  await repos.manualPayment.createQueryBuilder().delete().execute();
  await repos.ticket.createQueryBuilder().delete().execute();
  await repos.orderItem.createQueryBuilder().delete().execute();
  await repos.order.createQueryBuilder().delete().execute();
  await repos.referral.createQueryBuilder().delete().execute();
  await repos.batch.createQueryBuilder().delete().execute();
  await repos.sector.createQueryBuilder().delete().execute();
  await repos.event.createQueryBuilder().delete().execute();
  await repos.venue.createQueryBuilder().delete().execute();
  await repos.user.createQueryBuilder().delete().execute();
  await repos.producer.createQueryBuilder().delete().execute();

  console.log('[seed] producer: Projeto Criança Feliz');
  const pcf = await repos.producer.save(repos.producer.create({
    name: PCF_PRODUCER_NAME,
    cnpj: null,
    absorbFee: false,
  }));

  console.log('[seed] users');
  const adminHash = await argon2.hash(PCF_PASSWORD);
  const masterHash = await argon2.hash(PCF_PASSWORD);
  const staffHash = await argon2.hash(PCF_PASSWORD);

  await repos.user.save(repos.user.create({
    email: 'admin@easyticket.com.br',
    name: 'Easy Ticket Admin',
    role: Role.ADMIN,
    passwordHash: adminHash,
    referralCode: createId().slice(0, 10).toUpperCase(),
    cpf: null,
    phone: null,
    producerId: null,
  }));

  await repos.user.save(repos.user.create({
    email: 'matheus.frois@projetocriancafeliz.org',
    name: 'Matheus Frois',
    role: Role.PRODUCER,
    passwordHash: masterHash,
    referralCode: createId().slice(0, 10).toUpperCase(),
    cpf: null,
    phone: null,
    producerId: pcf.id,
  }));
  await repos.user.save(repos.user.create({
    email: 'leticia.silveira@projetocriancafeliz.org',
    name: 'Letícia Silveira',
    role: Role.PRODUCER,
    passwordHash: masterHash,
    referralCode: createId().slice(0, 10).toUpperCase(),
    cpf: null,
    phone: null,
    producerId: pcf.id,
  }));
  await repos.user.save(repos.user.create({
    email: 'vendedor@projetocriancafeliz.org',
    name: 'Vendedor PCF',
    role: Role.STAFF,
    passwordHash: staffHash,
    referralCode: createId().slice(0, 10).toUpperCase(),
    cpf: null,
    phone: null,
    producerId: pcf.id,
  }));

  console.log('[seed] done — baseline production: 1 producer, 4 users, 0 events');
  console.log('[seed] login com qualquer usuário do PCF: senha = pcf2026!');
  await dataSource.destroy();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
