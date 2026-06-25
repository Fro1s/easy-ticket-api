import 'dotenv/config';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../common/database/data-source';

/**
 * Recalcula batch.reserved e sector.reserved a partir da VERDADE: a soma de qty
 * dos pedidos PENDENTES e ainda válidos (reservedUntil > NOW). Corrige o drift
 * deixado pelo flood de pedidos. DRY-RUN por padrão; --apply efetiva.
 *
 * Escopo: evento(s) cujo título casa com EVENT_LIKE (Cama de Gato).
 */
const EVENT_LIKE = '%cama de gato%';
const APPLY = process.argv.includes('--apply');

async function main() {
  const ds = new DataSource({ ...dataSourceOptions, logging: false });
  await ds.initialize();

  // Verdade por batch.
  const batchTruth: Array<{
    id: string;
    name: string;
    reserved_atual: number;
    real: number;
  }> = await ds.query(
    `SELECT b.id, b.name, b.reserved AS reserved_atual,
              COALESCE(p.q, 0)::int AS real
         FROM batches b
         JOIN sectors s ON s.id = b."sectorId"
         JOIN events e ON e.id = s."eventId"
         LEFT JOIN (
           SELECT oi."batchId", SUM(oi.qty) AS q
             FROM orders o JOIN order_items oi ON oi."orderId" = o.id
            WHERE o.status = 'PENDING' AND o."reservedUntil" > NOW()
            GROUP BY oi."batchId"
         ) p ON p."batchId" = b.id
        WHERE e.title ILIKE $1`,
    [EVENT_LIKE],
  );

  const sectorTruth: Array<{
    id: string;
    name: string;
    reserved_atual: number;
    real: number;
  }> = await ds.query(
    `SELECT s.id, s.name, s.reserved AS reserved_atual,
              COALESCE(p.q, 0)::int AS real
         FROM sectors s
         JOIN events e ON e.id = s."eventId"
         LEFT JOIN (
           SELECT oi."sectorId", SUM(oi.qty) AS q
             FROM orders o JOIN order_items oi ON oi."orderId" = o.id
            WHERE o.status = 'PENDING' AND o."reservedUntil" > NOW()
            GROUP BY oi."sectorId"
         ) p ON p."sectorId" = s.id
        WHERE e.title ILIKE $1`,
    [EVENT_LIKE],
  );

  console.log('\n=== BATCHES (reserved atual -> real) ===');
  console.table(
    batchTruth.map((b) => ({
      name: b.name,
      de: b.reserved_atual,
      para: b.real,
    })),
  );
  console.log('\n=== SECTORS (reserved atual -> real) ===');
  console.table(
    sectorTruth.map((s) => ({
      name: s.name,
      de: s.reserved_atual,
      para: s.real,
    })),
  );

  if (!APPLY) {
    console.log('\n[DRY-RUN] nada alterado. Rode com --apply para efetivar.');
    await ds.destroy();
    return;
  }

  await ds.transaction(async (mgr) => {
    for (const b of batchTruth) {
      if (b.reserved_atual !== b.real) {
        await mgr.query(`UPDATE batches SET reserved = $1 WHERE id = $2`, [
          b.real,
          b.id,
        ]);
      }
    }
    for (const s of sectorTruth) {
      if (s.reserved_atual !== s.real) {
        await mgr.query(`UPDATE sectors SET reserved = $1 WHERE id = $2`, [
          s.real,
          s.id,
        ]);
      }
    }
  });
  console.log('\n[APPLIED] reserved recalculado a partir dos pendentes vivos.');
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
