import 'dotenv/config';
import { DataSource, In, Not } from 'typeorm';
import { dataSourceOptions } from '../common/database/data-source';
import { ClaimToken } from '../claim-tokens/entities/claim-token.entity';
import { ManualPayment } from '../orders/entities/manual-payment.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { Sector } from '../events/entities/sector.entity';
import { Event } from '../events/entities/event.entity';
import { Venue } from '../venues/entities/venue.entity';
import { Referral } from '../referral/entities/referral.entity';
import { User } from '../users/entities/user.entity';
import { Producer } from '../producers/entities/producer.entity';

const KEEP_EMAILS = [
  'matheuscosta1150@gmail.com',
  'leticia.silveira@projetocriancafeliz.org',
  'matheus.frois@projetocriancafeliz.org',
];

async function main() {
  const ds = new DataSource(dataSourceOptions);
  await ds.initialize();

  // Resolve which users we keep, and their producer ids.
  const keepUsers = await ds.getRepository(User).find({ where: { email: In(KEEP_EMAILS) } });
  if (keepUsers.length !== KEEP_EMAILS.length) {
    const found = keepUsers.map((u) => u.email);
    const missing = KEEP_EMAILS.filter((e) => !found.includes(e));
    throw new Error(`expected ${KEEP_EMAILS.length} users to keep but missing: ${missing.join(', ')}. Run seed:admin and seed:producers first.`);
  }
  const keepUserIds = keepUsers.map((u) => u.id);
  const keepProducerIds = Array.from(
    new Set(keepUsers.map((u) => u.producerId).filter((id): id is string => !!id)),
  );

  console.log('[wipe] keeping users:', keepUsers.map((u) => `${u.email} (${u.role})`).join(', '));
  console.log('[wipe] keeping producers:', keepProducerIds.length ? keepProducerIds.join(', ') : '(none)');

  // Order matters because of FKs.
  const claim = await ds.getRepository(ClaimToken).createQueryBuilder().delete().execute();
  console.log(`[wipe] claim_tokens: ${claim.affected ?? 0}`);

  const mp = await ds.getRepository(ManualPayment).createQueryBuilder().delete().execute();
  console.log(`[wipe] manual_payments: ${mp.affected ?? 0}`);

  const tk = await ds.getRepository(Ticket).createQueryBuilder().delete().execute();
  console.log(`[wipe] tickets: ${tk.affected ?? 0}`);

  const oi = await ds.getRepository(OrderItem).createQueryBuilder().delete().execute();
  console.log(`[wipe] order_items: ${oi.affected ?? 0}`);

  const od = await ds.getRepository(Order).createQueryBuilder().delete().execute();
  console.log(`[wipe] orders: ${od.affected ?? 0}`);

  const ref = await ds.getRepository(Referral).createQueryBuilder().delete().execute();
  console.log(`[wipe] referrals: ${ref.affected ?? 0}`);

  const sec = await ds.getRepository(Sector).createQueryBuilder().delete().execute();
  console.log(`[wipe] sectors: ${sec.affected ?? 0}`);

  const ev = await ds.getRepository(Event).createQueryBuilder().delete().execute();
  console.log(`[wipe] events: ${ev.affected ?? 0}`);

  const vn = await ds.getRepository(Venue).createQueryBuilder().delete().execute();
  console.log(`[wipe] venues: ${vn.affected ?? 0}`);

  // Users: delete everyone NOT in keep list (users hold producerId FK so go before producers).
  const us = await ds
    .getRepository(User)
    .createQueryBuilder()
    .delete()
    .where({ id: Not(In(keepUserIds)) })
    .execute();
  console.log(`[wipe] users deleted: ${us.affected ?? 0} (kept ${keepUserIds.length})`);

  // Producers: delete everyone except those linked to kept users.
  const prodQuery = ds.getRepository(Producer).createQueryBuilder().delete();
  if (keepProducerIds.length > 0) {
    prodQuery.where({ id: Not(In(keepProducerIds)) });
  }
  const pr = await prodQuery.execute();
  console.log(`[wipe] producers deleted: ${pr.affected ?? 0} (kept ${keepProducerIds.length})`);

  await ds.destroy();
  console.log('[wipe] done. database now contains only the 3 users + 1 producer.');
}

main().catch((err) => {
  console.error('[wipe] failed:', err);
  process.exit(1);
});
