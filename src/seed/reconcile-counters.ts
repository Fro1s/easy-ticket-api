import 'dotenv/config';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../common/database/data-source';

async function main() {
  const ds = new DataSource(dataSourceOptions);
  await ds.initialize();
  await ds.transaction(async (m) => {
    const b = await m.query(
      `UPDATE batches b SET sold = COALESCE((SELECT SUM(oi.qty) FROM order_items oi JOIN orders o ON o.id=oi."orderId" WHERE oi."batchId"=b.id AND o.status='PAID'),0) RETURNING id`,
    );
    const s = await m.query(
      `UPDATE sectors s SET sold = COALESCE((SELECT SUM(b.sold) FROM batches b WHERE b."sectorId"=s.id),0) RETURNING id`,
    );
    console.log(`[reconcile] batches updated: ${b.length}, sectors updated: ${s.length}`);
  });
  await ds.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
